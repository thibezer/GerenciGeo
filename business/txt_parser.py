import os
import logging
from pyproj import Transformer
from database.connection import execute_query, DatabaseManager

logger = logging.getLogger(__name__)

class TxtGeodesicParser:
    def __init__(self, levantamento_id: int, matricula_id: int):
        self.levantamento_id = levantamento_id
        self.matricula_id = matricula_id

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

    def obter_base_ppp(self) -> dict:
        """
        Varre o levantamento no banco para encontrar se já existe uma base pós-processada pelo IBGE-PPP.
        Retorna as coordenadas corrigidas geodésicas (lat, lon, alt) do Marco de Apoio (tipo 'M').
        """
        query = """
            SELECT lat, lon, alt 
            FROM pontos 
            WHERE levantamento_id = ? AND tipo_ponto = 'M' AND lat IS NOT NULL AND lat != 0.0 
            LIMIT 1
        """
        try:
            row = execute_query(query, params=(self.levantamento_id,), fetch_one=True)
            if row:
                return dict(row)
        except Exception as e:
            logger.error(f"[PARSER] Erro ao buscar base PPP no banco: {e}")
        return None

    def processar_arquivo(self, caminho_arquivo: str) -> list:
        """
        Lê o arquivo de texto, detecta o layout, calcula o vetor de translação da base
        e aplica a translação em bloco sobre os rovers, convertendo tudo para lat/lon SIRGAS 2000 Geodésico.
        Utiliza projeção UTM dinâmica baseada na longitude da base geodésica corrigida pós-PPP.
        """
        if not os.path.exists(caminho_arquivo):
            raise FileNotFoundError(f"Arquivo não localizado: {caminho_arquivo}")

        with open(caminho_arquivo, "r", encoding="utf-8", errors="ignore") as f:
            linhas = f.readlines()

        layout = self.identificar_layout(linhas)
        logger.info(f"[PARSER] Layout identificado para {os.path.basename(caminho_arquivo)}: {layout.upper()}")

        delta_n = 0.0
        delta_e = 0.0
        delta_h = 0.0

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
                    # RTK: [Nome, Norte, Este, Alt, Descrição, SigmaN, SigmaE, SigmaZ]
                    if len(partes) >= 5:
                        desc = partes[4].lower()
                    if len(partes) >= 8:
                        sig_n = float(partes[5])
                        sig_e = float(partes[6])
                        sig_z = float(partes[7])
                else:
                    # Topcon: [Nome, Norte, Este, Alt, SigmaN, SigmaE, SigmaZ, ...]
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
        base_ppp = self.obter_base_ppp()
        if base_ppp:
            longitude_base = base_ppp["lon"]
            # Cálculo matemático e dinâmico da zona UTM e EPSG correspondente no hemisfério Sul no Brasil
            zona_utm = int((longitude_base + 180) / 6) + 1
            epsg_dinamico = f"319{zona_utm}"
            logger.info(f"[PARSER] Fuso UTM calculado dinamicamente: Zona {zona_utm}S (EPSG:{epsg_dinamico}) com base na longitude {longitude_base:.6f}")
        else:
            # Fallback seguro caso não encontre base PPP: Fuso UTM 22S (EPSG:31982)
            epsg_dinamico = "31982"
            logger.warning(f"[PARSER] Nenhuma base PPP ativa encontrada no banco para este levantamento. Usando Fuso de Fallback: 22S (EPSG:{epsg_dinamico})")

        # CRS de destino: SIRGAS 2000 Geodésico (EPSG:4674) - Referencial Oficial do INCRA
        crs_geodesica = "epsg:4674"
        crs_plana = f"epsg:{epsg_dinamico}"

        # Configuração bidirecional do pyproj instanciada dinamicamente
        # O parâmetro always_xy=True força o padrão matemático: X = Este/Longitude, Y = Norte/Latitude
        transformer_to_utm = Transformer.from_crs(crs_geodesica, crs_plana, always_xy=True)
        transformer_to_latlon = Transformer.from_crs(crs_plana, crs_geodesica, always_xy=True)

        # 3. Algoritmo de Translação Computacional (Exclusivo RTK)
        if layout == "rtk":
            # Procura a linha definida como 'set_base'
            base_bruta = next((p for p in pontos_brutos if p["descricao"] == "set_base"), None)
            
            if base_bruta:
                logger.info(f"[PARSER] Base bruta identificada no arquivo: {base_bruta['nome']}")
                
                if base_ppp:
                    # Converte a base PPP geodésica (Lon, Lat) para UTM plana (E, N) usando o transformer dinâmico
                    e_ppp, n_ppp = transformer_to_utm.transform(base_ppp["lon"], base_ppp["lat"])
                    
                    # Cálculo matemático do Vetor de Translação (Delta)
                    delta_n = n_ppp - base_bruta["n_original"]
                    delta_e = e_ppp - base_bruta["e_original"]
                    delta_h = base_ppp["alt"] - base_bruta["alt_original"]
                    
                    logger.info(f"[PARSER] Vetor de Translação Calculado com Sucesso: Delta_N={delta_n:.4f}m, Delta_E={delta_e:.4f}m, Delta_H={delta_h:.4f}m")
                else:
                    logger.warning("[PARSER] AVISO: Ponto de Base Bruta encontrado, mas nenhuma Base PPP processada existe no banco de dados para este levantamento.")
            else:
                logger.warning("[PARSER] AVISO: Arquivo no layout RTK mas sem nenhuma linha com a descrição 'set_base'. A translação não será aplicada.")

        # 4. Translação e Conversão Reversa em Lote
        pontos_processados = []
        ordem = 1

        for p in pontos_brutos:
            # Aplica a translação
            n_corrigido = p["n_original"] + delta_n
            e_corrigido = p["e_original"] + delta_e
            alt_corrigido = p["alt_original"] + delta_h

            # Conversão Reversa: Projeta UTM (E, N) de volta para Célula Geodésica SIRGAS 2000 (Lon, Lat)
            lon_corrigido, lat_corrigido = transformer_to_latlon.transform(e_corrigido, n_corrigido)

            # Determina o tipo de ponto baseado na inicial do nome do vértice
            tipo = "P"
            if p["nome"].upper().startswith("M"):
                tipo = "M"
            elif p["nome"].upper().startswith("V"):
                tipo = "V"

            ponto_final = {
                "levantamento_id": self.levantamento_id,
                "matricula_id": self.matricula_id,
                "nome_vertice": p["nome"],
                "tipo_ponto": tipo,
                # Compatibilidade retroativa total com mapas e tabelas existentes
                "lat": lat_corrigido,
                "lon": lon_corrigido,
                "alt": alt_corrigido,
                "sigma_lat": p["sigma_n"],
                "sigma_lon": p["sigma_e"],
                "sigma_alt": p["sigma_z"],
                "ordem_caminhamento": ordem,
                # Rastreabilidade geodésica "Antes e Depois" do Manifesto
                "n_original": p["n_original"],
                "e_original": p["e_original"],
                "alt_original": p["alt_original"],
                "lat_corrigido": lat_corrigido,
                "lon_corrigido": lon_corrigido,
                "alt_corrigido": alt_corrigido,
                "sigma_n": p["sigma_n"],
                "sigma_e": p["sigma_e"],
                "sigma_z": p["sigma_z"]
            }
            pontos_processados.append(ponto_final)
            ordem += 1

        return pontos_processados

    def persistir_no_banco(self, pontos: list) -> list:
        """
        Salva os pontos processados na tabela 'pontos' do SQLite de forma transacional e
        retorna uma lista com os IDs inseridos correspondentes.
        """
        ids_inseridos = []
        query = """
            INSERT INTO pontos (
                levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, 
                sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento,
                n_original, e_original, alt_original, lat_corrigido, lon_corrigido, alt_corrigido,
                sigma_n, sigma_e, sigma_z
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        try:
            with DatabaseManager() as conn:
                cursor = conn.cursor()
                for p in pontos:
                    cursor.execute(query, (
                        p["levantamento_id"], p["matricula_id"], p["nome_vertice"], p["tipo_ponto"],
                        p["lat"], p["lon"], p["alt"], p["sigma_lat"], p["sigma_lon"], p["sigma_alt"],
                        p["ordem_caminhamento"], p["n_original"], p["e_original"], p["alt_original"],
                        p["lat_corrigido"], p["lon_corrigido"], p["alt_corrigido"],
                        p["sigma_n"], p["sigma_e"], p["sigma_z"]
                    ))
                    ids_inseridos.append(cursor.lastrowid)
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
