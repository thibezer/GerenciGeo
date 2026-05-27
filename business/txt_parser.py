import os
import logging
from pyproj import Transformer
from database.connection import execute_query, DatabaseManager
from business.geoprocessamento import geodesic_to_ecef, ecef_to_geodesic

logger = logging.getLogger(__name__)

class TxtGeodesicParser:
    def __init__(self, levantamento_id: int, matricula_id: int = None, base_escolhida_id: int = None):
        self.levantamento_id = levantamento_id
        self.matricula_id = matricula_id
        self.base_escolhida_id = base_escolhida_id

    def identificar_layout(self, linhas: list) -> str:
        """
        Analisa as primeiras linhas válidas para determinar se o layout é RTK ou Topcon (Estático).
        RTK: 8 colunas (a 5ª coluna é uma descrição em texto como 'set_base' ou 'rover')
        Topcon: Geralmente 7 ou mais colunas, onde as colunas 1 a 6 são numéricas puros (Nome, N, E, H, Sigmas)
        """
        for linha in linhas:
            linha_limpa = linha.strip()
            if not linha_limpa or linha_limpa.startswith("#"):
                continue
            
            partes = [p.strip() for p in linha_limpa.split(",")]
            if len(partes) >= 5:
                # Se a quinta coluna possui caracteres não numéricos e descreve o ponto, é RTK
                quinta_coluna = partes[4]
                try:
                    float(quinta_coluna)
                    # Conseguiu converter, provável estático Topcon
                    return "topcon"
                except ValueError:
                    # Falhou em converter para float, indica descrição em texto (ex: 'set_base', 'rover')
                    return "rtk"
        
        # Fallback seguro
        return "topcon"

    def obter_base_ppp(self, base_id: int = None) -> dict:
        """
        Varre o levantamento no banco para encontrar a coordenada corrigida da base.
        Se base_id for fornecido, busca especificamente aquela base por ID.
        Caso contrário, faz o fallback para buscar a primeira base ativa do tipo 'M' no levantamento.
        """
        if base_id:
            query = """
                SELECT id, nome_vertice, lat, lon, alt, sigma_lat, sigma_lon, sigma_alt
                FROM pontos 
                WHERE id = ? AND lat IS NOT NULL AND lat != 0.0
            """
            params = (base_id,)
        else:
            query = """
                SELECT id, nome_vertice, lat, lon, alt, sigma_lat, sigma_lon, sigma_alt
                FROM pontos 
                WHERE levantamento_id = ? AND tipo_ponto = 'M' AND lat IS NOT NULL AND lat != 0.0 
                LIMIT 1
            """
            params = (self.levantamento_id,)
            
        try:
            row = execute_query(query, params=params, fetch_one=True)
            if row:
                return dict(row)
        except Exception as e:
            logger.error(f"[PARSER] Erro ao buscar base no banco (base_id={base_id}): {e}")
        return None

    def processar_arquivo(self, caminho_arquivo: str) -> list:
        """
        Lê o arquivo de texto, detecta o layout, calcula o vetor de translação da base
        no espaço tridimensional cartesiano geocêntrico ECEF e aplica a translação em bloco
        sobre os rovers, convertendo tudo de volta para lat/lon SIRGAS 2000 Geodésico.
        Propaga quadraticamente os desvios padrão (Sigmas) da base e rovers.
        """
        if not os.path.exists(caminho_arquivo):
            raise FileNotFoundError(f"Arquivo não localizado: {caminho_arquivo}")

        with open(caminho_arquivo, "r", encoding="utf-8", errors="ignore") as f:
            linhas = f.readlines()

        layout = self.identificar_layout(linhas)
        logger.info(f"[PARSER] Layout identificado para {os.path.basename(caminho_arquivo)}: {layout.upper()}")

        aplicar_translace_ecef = False
        delta_x = 0.0
        delta_y = 0.0
        delta_z = 0.0

        pontos_brutos = []

        # 1. Parsing Inicial e Identificação da Base Bruta (se RTK)
        for linha in linhas:
            linha_limpa = linha.strip()
            if not linha_limpa or linha_limpa.startswith("#"):
                continue

            partes = [p.strip() for p in linha_limpa.split(",")]
            if len(partes) < 4:
                continue

            try:
                nome = partes[0]
                norte = float(partes[1])
                este = float(partes[2])
                alt = float(partes[3])
                
                desc = ""
                sig_n = 0.0
                sig_e = 0.0
                sig_z = 0.0

                if layout == "rtk":
                    if len(partes) >= 5:
                        desc = partes[4].lower()
                    if len(partes) >= 8:
                        sig_n = float(partes[5])
                        sig_e = float(partes[6])
                        sig_z = float(partes[7])
                else:
                    if len(partes) >= 7:
                        sig_n = float(partes[4])
                        sig_e = float(partes[5])
                        sig_z = float(partes[6])

                ponto_dict = {
                    "nome": nome,
                    "n_original": norte,
                    "e_original": este,
                    "alt_original": alt,
                    "descricao": desc,
                    "sigma_n": sig_n,
                    "sigma_e": sig_e,
                    "sigma_z": sig_z
                }
                pontos_brutos.append(ponto_dict)

            except Exception as e:
                logger.warning(f"[PARSER] Linha descartada por inconsistência numérica: {linha_limpa}. Erro: {e}")
                continue

        # 2. Resolução da Zona UTM e Instanciação Dinâmica dos Transformers
        base_ppp = self.obter_base_ppp(self.base_escolhida_id)
        if base_ppp:
            longitude_base = base_ppp["lon"]
            zona_utm = int((longitude_base + 180) / 6) + 1
            epsg_dinamico = f"3198{zona_utm}"
            logger.info(f"[PARSER] Fuso UTM calculado dinamicamente: Zona {zona_utm}S (EPSG:{epsg_dinamico}) com base na longitude {longitude_base:.6f}")
        else:
            epsg_dinamico = "31982"
            logger.warning(f"[PARSER] Nenhuma base PPP ativa encontrada no banco para este levantamento. Usando Fuso de Fallback: 22S (EPSG:{epsg_dinamico})")

        crs_geodesica = "epsg:4674"
        crs_plana = f"epsg:{epsg_dinamico}"

        transformer_to_utm = Transformer.from_crs(crs_geodesica, crs_plana, always_xy=True)
        transformer_to_latlon = Transformer.from_crs(crs_plana, crs_geodesica, always_xy=True)

        # 3. Algoritmo de Translação Computacional Rigorosa no Espaço ECEF (Exclusivo RTK)
        if layout == "rtk":
            base_bruta = None
            if base_ppp:
                # Tenta achar no arquivo um ponto com descrição "set_base"
                base_bruta = next((p for p in pontos_brutos if p["descricao"] == "set_base"), None)
                # Se não achar por descrição, tenta coincidir pelo nome exato do vértice geodésico
                if not base_bruta:
                    nome_base_db = base_ppp.get("nome_vertice", "").upper()
                    base_bruta = next((p for p in pontos_brutos if p["nome"].upper() == nome_base_db), None)
            
            if base_bruta:
                logger.info(f"[PARSER] Base bruta identificada no arquivo para amarração: {base_bruta['nome']}")
                
                if base_ppp:
                    # Converte a base PPP geodésica para ECEF
                    x_ppp, y_ppp, z_ppp = geodesic_to_ecef(base_ppp["lat"], base_ppp["lon"], base_ppp["alt"])
                    
                    # Converte a base bruta UTM para Geodésica e depois para ECEF
                    lon_bruta_base, lat_bruta_base = transformer_to_latlon.transform(base_bruta["e_original"], base_bruta["n_original"])
                    x_bruto_base, y_bruto_base, z_bruto_base = geodesic_to_ecef(lat_bruta_base, lon_bruta_base, base_bruta["alt_original"])
                    
                    # Cálculo do Vetor Delta 3D ECEF
                    delta_x = x_ppp - x_bruto_base
                    delta_y = y_ppp - y_bruto_base
                    delta_z = z_ppp - z_bruto_base
                    
                    aplicar_translace_ecef = True
                    logger.info(f"[PARSER] Vetor de Translação ECEF 3D Calculado: Delta_X={delta_x:.4f}m, Delta_Y={delta_y:.4f}m, Delta_Z={delta_z:.4f}m")
                else:
                    logger.warning("[PARSER] AVISO: Ponto de Base Bruta encontrado, mas nenhuma Base PPP processada existe no banco de dados para este levantamento.")
            else:
                logger.warning("[PARSER] AVISO: Arquivo no layout RTK mas sem ponto de amarração correspondente à base escolhida. A translação não será aplicada.")

        # 4. Translação e Conversão Reversa em Lote
        pontos_processados = []
        vertices_vistos = set()
        ordem = 1
        import math

        # Incertezas da Base PPP para propagação
        sigma_base_lat = base_ppp.get("sigma_lat") or 0.0 if base_ppp else 0.0
        sigma_base_lon = base_ppp.get("sigma_lon") or 0.0 if base_ppp else 0.0
        sigma_base_alt = base_ppp.get("sigma_alt") or 0.0 if base_ppp else 0.0

        for p in pontos_brutos:
            if aplicar_translace_ecef:
                # Converte coordenada plana bruta para geodésica bruta
                lon_bruto, lat_bruto = transformer_to_latlon.transform(p["e_original"], p["n_original"])
                # Converte geodésica bruta para ECEF
                x_bruto, y_bruto, z_bruto = geodesic_to_ecef(lat_bruto, lon_bruto, p["alt_original"])
                # Aplica translação 3D no espaço geocêntrico
                x_corrigido = x_bruto + delta_x
                y_corrigido = y_bruto + delta_y
                z_corrigido = z_bruto + delta_z
                # Reconverte ECEF para geodésica final
                lat_corrigido, lon_corrigido, alt_corrigido = ecef_to_geodesic(x_corrigido, y_corrigido, z_corrigido)
            else:
                # Caso não translade, apenas converte de UTM para lat/lon
                lon_corrigido, lat_corrigido = transformer_to_latlon.transform(p["e_original"], p["n_original"])
                alt_corrigido = p["alt_original"]

            # Lei de Propagação de Variâncias (Composição Quadrática das Incertezas)
            # sigma_final = sqrt(sigma_bruto^2 + sigma_base^2)
            sigma_lat_prop = math.sqrt(p["sigma_n"]**2 + sigma_base_lat**2)
            sigma_lon_prop = math.sqrt(p["sigma_e"]**2 + sigma_base_lon**2)
            sigma_alt_prop = math.sqrt(p["sigma_z"]**2 + sigma_base_alt**2)

            tipo = "P"
            if p["nome"].upper().startswith("M"):
                tipo = "M"
            elif p["nome"].upper().startswith("V"):
                tipo = "V"

            # VALIDAR INTEGRIDADE INTERNA DO ARQUIVO IMPORTADO
            identificador_unico = (p["nome"].upper(), tipo)
            if identificador_unico in vertices_vistos:
                raise ValueError(
                    f"Vértice duplicado detectado no próprio arquivo de importação: "
                    f"Código '{p['nome']}' de Tipo '{tipo}' aparece mais de uma vez."
                )
            vertices_vistos.add(identificador_unico)

            ponto_final = {
                "levantamento_id": self.levantamento_id,
                "matricula_id": self.matricula_id,
                "nome_vertice": p["nome"],
                "tipo_ponto": tipo,
                "lat": lat_corrigido,
                "lon": lon_corrigido,
                "alt": alt_corrigido,
                "sigma_lat": sigma_lat_prop,
                "sigma_lon": sigma_lon_prop,
                "sigma_alt": sigma_alt_prop,
                "ordem_caminhamento": ordem,
                "n_original": p["n_original"],
                "e_original": p["e_original"],
                "alt_original": p["alt_original"],
                "lat_corrigido": lat_corrigido if aplicar_translace_ecef else None,
                "lon_corrigido": lon_corrigido if aplicar_translace_ecef else None,
                "alt_corrigido": alt_corrigido if aplicar_translace_ecef else None,
                "sigma_n": p["sigma_n"],
                "sigma_e": p["sigma_e"],
                "sigma_z": p["sigma_z"],
                "status_ponto": "CORRIGIDO" if aplicar_translace_ecef else "BRUTO",
                "ponto_base_id": self.base_escolhida_id
            }
            pontos_processados.append(ponto_final)
            ordem += 1

        return pontos_processados

    def persistir_no_banco(self, pontos: list) -> list:
        """
        Salva os pontos processados na tabela 'pontos' do SQLite de forma transacional e
        retorna uma lista com os IDs inseridos correspondentes.
        """
        import sqlite3
        ids_inseridos = []
        query = """
            INSERT INTO pontos (
                levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, 
                sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento,
                n_original, e_original, alt_original, lat_corrigido, lon_corrigido, alt_corrigido,
                sigma_n, sigma_e, sigma_z, status_ponto, ponto_base_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        try:
            with DatabaseManager() as conn:
                cursor = conn.cursor()
                for p in pontos:
                    try:
                        cursor.execute(query, (
                            p["levantamento_id"], p["matricula_id"], p["nome_vertice"], p["tipo_ponto"],
                            p["lat"], p["lon"], p["alt"], p["sigma_lat"], p["sigma_lon"], p["sigma_alt"],
                            p["ordem_caminhamento"], p["n_original"], p["e_original"], p["alt_original"],
                            p["lat_corrigido"], p["lon_corrigido"], p["alt_corrigido"],
                            p["sigma_n"], p["sigma_e"], p["sigma_z"], p["status_ponto"], p["ponto_base_id"]
                        ))
                        ids_inseridos.append(cursor.lastrowid)
                    except sqlite3.IntegrityError as e_integ:
                        if "UNIQUE constraint failed" in str(e_integ):
                            raise ValueError(
                                f"O vértice '{p['nome_vertice']}' do tipo '{p['tipo_ponto']}' já está cadastrado "
                                f"neste levantamento/matrícula. Remova a duplicata antes de prosseguir."
                            )
                        raise e_integ
                conn.commit()
            logger.info(f"[PARSER] {len(pontos)} pontos geodésicos persistidos com sucesso.")
        except Exception as e:
            logger.error(f"[PARSER] Erro crítico ao persistir pontos no banco: {e}")
            raise e

        return ids_inseridos

    def gerar_topologia_perimetral(self, ids_pontos: list, pontos_processados: list) -> int:
        """
        Gera a topologia perimetral de forma automatizada, criando os segmentos sequenciais
        e a divisa de fechamento obrigatória (do último ponto de volta ao primeiro).
        Mantém as regras de domínio no núcleo lógico de negócio de geoprocessamento.
        """
        if not self.matricula_id:
            logger.info("[PARSER] Matrícula não fornecida. Pontos salvos de forma geral sem gerar topologia perimetral.")
            return 0

        if len(ids_pontos) < 2:
            logger.info("[PARSER] Menos de 2 pontos importados. Topologia perimetral não gerada.")
            return 0

        # Seleciona método padrão baseado no desvio do primeiro ponto
        primeiro_pt = pontos_processados[0]
        metodo_padrao = "PG1" if primeiro_pt.get("sigma_lat", 0.0) > 0.0 else "MC1"
        
        query_seg = """
            INSERT INTO segmentos (
                levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, 
                confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef
            ) VALUES (?, ?, ?, ?, NULL, 'LN1', ?)
        """
        
        try:
            with DatabaseManager() as conn:
                cursor = conn.cursor()
                
                # Divisas intermediárias (Ponto A -> Ponto B)
                for i in range(len(ids_pontos) - 1):
                    cursor.execute(query_seg, (
                        self.levantamento_id, self.matricula_id, 
                        ids_pontos[i], ids_pontos[i+1], metodo_padrao
                    ))
                    
                # REGRA ESTRITA: Segmento final de fechamento de polígono (Último -> Primeiro)
                cursor.execute(query_seg, (
                    self.levantamento_id, self.matricula_id, 
                    ids_pontos[-1], ids_pontos[0], metodo_padrao
                ))
                conn.commit()
                
            logger.info(f"[PARSER] Topologia perimetral criada com sucesso: {len(ids_pontos)} segmentos gerados.")
            return len(ids_pontos)
        except Exception as e:
            logger.error(f"[PARSER] Erro crítico ao gerar topologia perimetral no banco: {e}")
            raise e
