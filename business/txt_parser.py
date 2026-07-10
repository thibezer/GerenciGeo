import os
import logging
import csv
import pandas as pd
from pyproj import Transformer
from database.connection import execute_query, DatabaseManager
from business.geoprocessamento import geodesic_to_ecef, ecef_to_geodesic

logger = logging.getLogger(__name__)

class TxtGeodesicParser:
    def __init__(self, levantamento_id: int, matricula_id: int = None, base_escolhida_id: int = None, inverter_ne: bool = False):
        self.levantamento_id = levantamento_id
        self.matricula_id = matricula_id
        self.base_escolhida_id = base_escolhida_id
        self.inverter_ne = inverter_ne

    def identificar_layout(self, linhas: list) -> str:
        """
        Analisa as primeiras linhas válidas para determinar se o layout é RTK ou Topcon (Estático).
        Topcon: Sempre possui 7 colunas (Nome, N, E, H, SigN, SigE, SigZ) e todas de 2 a 7 são numéricas.
        RTK: Possui 8 colunas, onde a 5ª coluna é uma descrição textual (ex: 'set_base' ou 'rover').
        """
        for linha in linhas:
            linha_limpa = linha.strip()
            if not linha_limpa or linha_limpa.startswith("#"):
                continue
            
            partes = [p.strip() for p in linha_limpa.split(",")]
            if len(partes) == 7:
                # Topcon clássico tem 7 colunas
                return "topcon"
            elif len(partes) >= 8:
                quinta_coluna = partes[4]
                if quinta_coluna.lower() in ["set_base", "rover", "base_rtk", "rtk_base", "base", "set-base"]:
                    return "rtk"
                try:
                    float(quinta_coluna)
                    return "topcon"
                except ValueError:
                    return "rtk"
        
        # Fallback seguro
        return "topcon"

    def obter_base_ppp(self, base_id: int = None) -> dict:
        """
        Varre o levantamento no banco para encontrar a coordenada corrigida da base.
        Se base_id for fornecido, busca especificamente aquela base por ID.
        Se base_id for None, não tentará adivinhar (retorna None).
        """
        if not base_id:
            return None
            
        query = """
            SELECT id, nome_vertice, lat, lon, alt, sigma_lat, sigma_lon, sigma_alt
            FROM pontos 
            WHERE id = ? AND lat IS NOT NULL AND lat != 0.0
        """
        params = (base_id,)
            
        try:
            row = execute_query(query, params=params, fetch_one=True)
            if row:
                return dict(row)
        except Exception as e:
            logger.error(f"[PARSER] Erro ao buscar base no banco (base_id={base_id}): {e}")
        return None

    def _normalizar_linhas_texto(self, linhas_brutas: list) -> list:
        linhas_normalizadas = []
        linhas_validas = []
        
        for l in linhas_brutas:
            l_clean = l.strip()
            if not l_clean or l_clean.startswith("#"):
                continue
            linhas_validas.append(l_clean)
            
        if not linhas_validas:
            return linhas_brutas

        sample = "\n".join(linhas_validas[:10])
        delimitador = ","
        
        try:
            sniffer = csv.Sniffer()
            dialect = sniffer.sniff(sample, delimiters=[',', ';', '\t', ' '])
            delimitador = dialect.delimiter
        except Exception:
            # Fallback robusto por contagem simples
            delimitadores_possiveis = [',', ';', '\t', ' ']
            contagens = {d: 0 for d in delimitadores_possiveis}
            for l in linhas_validas[:10]:
                for d in delimitadores_possiveis:
                    contagens[d] += l.count(d)
            
            max_cont = 0
            for d in delimitadores_possiveis:
                if contagens[d] > max_cont:
                    max_cont = contagens[d]
                    delimitador = d

        logger.info(f"[PARSER] Delimitador autodetectado: '{delimitador}'")

        for l in linhas_brutas:
            l_clean = l.strip()
            if not l_clean:
                linhas_normalizadas.append("")
                continue
            if l_clean.startswith("#"):
                linhas_normalizadas.append(l_clean)
                continue
                
            if delimitador == ' ':
                partes = l_clean.split()
            else:
                partes = [p.strip() for p in l_clean.split(delimitador)]
                
            nova_linha = ",".join(partes)
            linhas_normalizadas.append(nova_linha)
            
        return linhas_normalizadas

    def _converter_planilha_para_linhas_csv(self, caminho_arquivo: str, ext: str) -> list:
        logger.info(f"[PARSER] Lendo planilha {ext} via Pandas...")
        if ext == '.ods':
            df = pd.read_excel(caminho_arquivo, engine='odf')
        else:
            df = pd.read_excel(caminho_arquivo)
            
        linhas_csv = []
        for _, row in df.iterrows():
            valores = []
            for val in row.values:
                if pd.isna(val):
                    valores.append("")
                else:
                    if isinstance(val, (int, float)):
                        if isinstance(val, float) and val.is_integer():
                            valores.append(str(int(val)))
                        else:
                            valores.append(str(val))
                    else:
                        valores.append(str(val).strip())
            linhas_csv.append(",".join(valores))
            
        return linhas_csv

    def processar_arquivo(self, caminho_arquivo: str) -> list:
        """
        Lê o arquivo de texto ou planilha, detecta o layout, calcula o vetor de translação da base
        no espaço tridimensional cartesiano geocêntrico ECEF e aplica a translação em bloco
        sobre os rovers, convertendo tudo de volta para lat/lon SIRGAS 2000 Geodésico.
        Propaga quadraticamente os desvios padrão (Sigmas) da base e rovers.
        """
        if not os.path.exists(caminho_arquivo):
            raise FileNotFoundError(f"Arquivo não localizado: {caminho_arquivo}")

        nome_arquivo = os.path.basename(caminho_arquivo)
        ext = os.path.splitext(caminho_arquivo)[1].lower()

        linhas = []
        if ext in ['.txt', '.csv']:
            with open(caminho_arquivo, "r", encoding="utf-8", errors="ignore") as f:
                linhas_brutas = f.readlines()
            linhas = self._normalizar_linhas_texto(linhas_brutas)
        elif ext in ['.xls', '.xlsx', '.ods']:
            linhas = self._converter_planilha_para_linhas_csv(caminho_arquivo, ext)
        else:
            # Fallback seguro para ler como texto
            with open(caminho_arquivo, "r", encoding="utf-8", errors="ignore") as f:
                linhas_brutas = f.readlines()
            linhas = self._normalizar_linhas_texto(linhas_brutas)

        layout = self.identificar_layout(linhas)
        logger.info(f"[PARSER] Layout identificado para {nome_arquivo}: {layout.upper()}")

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
                n1 = float(partes[1])
                e1 = float(partes[2])
                alt = float(partes[3])
                
                inverter = self.inverter_ne
                if not inverter:
                    # Autodetecção determinística baseada na invariante UTM no Brasil
                    # E (Este) fica sempre entre 100.000m e 900.000m.
                    # N (Norte) no Hemisfério Sul fica sempre entre 5.000.000m e 10.000.000m.
                    # Se n1 (lido como N) for < 1.000.000m e e1 (lido como E) for > 1.000.000m,
                    # as coordenadas estão logicamente invertidas.
                    if n1 < 1000000.0 and e1 > 1000000.0:
                        inverter = True
                        logger.info(f"[PARSER] Autodetectada inversão N/E no ponto '{nome}': n_bruto={n1}, e_bruto={e1}. Corrigindo automaticamente.")

                if inverter:
                    norte = e1
                    este = n1
                else:
                    norte = n1
                    este = e1
                
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
            epsg_dinamico = f"319{60 + zona_utm}"
            logger.info(f"[PARSER] Fuso UTM calculado dinamicamente: Zona {zona_utm}S (EPSG:{epsg_dinamico}) com base na longitude {longitude_base:.6f}")
        else:
            epsg_dinamico = "31982"
            try:
                query_any_pt = "SELECT lon FROM pontos WHERE levantamento_id = ? AND lon IS NOT NULL AND lon != 0.0 LIMIT 1"
                row_any_pt = execute_query(query_any_pt, params=(self.levantamento_id,), fetch_one=True)
                if row_any_pt:
                    longitude_pt = row_any_pt["lon"]
                    zona_utm = int((longitude_pt + 180) / 6) + 1
                    epsg_dinamico = f"319{60 + zona_utm}"
                    logger.info(f"[PARSER] Fuso UTM inferido a partir de ponto existente no banco: Zona {zona_utm}S (EPSG:{epsg_dinamico}) com longitude {longitude_pt:.6f}")
            except Exception as e_fuso:
                logger.warning(f"[PARSER] Falha ao tentar inferir fuso a partir de pontos do levantamento: {e_fuso}")
            
            logger.warning(f"[PARSER] Usando Fuso de Fallback: (EPSG:{epsg_dinamico})")

        crs_geodesica = "epsg:4674"
        crs_plana = f"epsg:{epsg_dinamico}"

        transformer_to_utm = Transformer.from_crs(crs_geodesica, crs_plana, always_xy=True)
        transformer_to_latlon = Transformer.from_crs(crs_plana, crs_geodesica, always_xy=True)

        # 3. Algoritmo de Translação Computacional Rigorosa Plana UTM (Exclusivo RTK)
        aplicar_translace_plana = False
        delta_e = 0.0
        delta_n = 0.0
        delta_h = 0.0

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
                    # Converte a base PPP geodésica para UTM
                    e_base_corr, n_base_corr = transformer_to_utm.transform(base_ppp["lon"], base_ppp["lat"])
                    alt_base_corr = base_ppp["alt"]
                    
                    # Coordenadas UTM brutas da base do arquivo
                    e_base_bruta = base_bruta["e_original"]
                    n_base_bruta = base_bruta["n_original"]
                    alt_base_bruta = base_bruta["alt_original"]
                    
                    # Cálculo do Vetor de Translação Plana constante
                    delta_e = e_base_corr - e_base_bruta
                    delta_n = n_base_corr - n_base_bruta
                    delta_h = alt_base_corr - alt_base_bruta
                    
                    aplicar_translace_plana = True
                    logger.info(f"[PARSER] Vetor de Translação Plana UTM Calculado: dE={delta_e:.4f}m, dN={delta_n:.4f}m, dH={delta_h:.4f}m")
                else:
                    logger.warning("[PARSER] AVISO: Ponto de Base Bruta encontrado, mas nenhuma Base PPP processada existe no banco de dados para este levantamento.")
            else:
                if base_ppp:
                    raise ValueError(
                        f"Não foi possível localizar o ponto de amarração correspondente à base '{base_ppp['nome_vertice']}' "
                        f"dentro do arquivo RTK. Verifique se o nome do ponto no arquivo .txt coincide com o nome da base "
                        f"ou se o ponto está rotulado com 'set_base'."
                    )
                else:
                    logger.warning("[PARSER] AVISO: Arquivo no layout RTK mas sem ponto de amarração correspondente à base escolhida. A translação não será aplicada.")

        # 3.2. Validação Cruzada Topcon Tools x PPP (Item 11)
        if layout == "topcon" and base_ppp:
            nome_base_db = base_ppp.get("nome_vertice", "").upper()
            base_no_arquivo = next((p for p in pontos_brutos if p["nome"].upper() == nome_base_db), None)
            if base_no_arquivo:
                # Converte base PPP oficial para UTM
                e_base_corr, n_base_corr = transformer_to_utm.transform(base_ppp["lon"], base_ppp["lat"])
                alt_base_corr = base_ppp["alt"]
                
                # Compara com as coordenadas da base exportadas pelo Topcon Tools
                e_base_topcon = base_no_arquivo["e_original"]
                n_base_topcon = base_no_arquivo["n_original"]
                alt_base_topcon = base_no_arquivo["alt_original"]
                
                dist_3d = math.sqrt(
                    (e_base_corr - e_base_topcon)**2 + 
                    (n_base_corr - n_base_topcon)**2 + 
                    (alt_base_corr - alt_base_topcon)**2
                )
                
                logger.info(f"[VALIDACAO_CRUZADA] Comparando Base '{nome_base_db}' (Topcon vs PPP): Delta 3D = {dist_3d:.4f}m")
                if dist_3d > 0.05:
                    logger.warning(
                        f"[VALIDACAO_CRUZADA] ALERTA CRÍTICO: Divergência detectada entre o processamento do Topcon Tools "
                        f"e a base PPP oficial corrigida do IBGE. Delta 3D = {dist_3d:.4f}m (limite tolerável: 0.05m / 5cm). "
                        f"Verifique se processou a baseline no Topcon com a coordenada correta da base."
                    )

        # 4. Translação e Conversão Reversa em Lote
        # Determina a ordem inicial dinâmica incremental (evitando duplicidades de ordem perimetral)
        ordem_inicial = 1
        if self.matricula_id:
            query_max = "SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ? AND matricula_id = ?"
            params_max = (self.levantamento_id, self.matricula_id)
        else:
            query_max = "SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ?"
            params_max = (self.levantamento_id,)
            
        try:
            row_max = execute_query(query_max, params=params_max, fetch_one=True)
            if row_max and row_max["max_ord"] is not None:
                ordem_inicial = row_max["max_ord"] + 1
        except Exception as e_max:
            logger.warning(f"[PARSER] Erro ao buscar ordem máxima no banco: {e_max}")
            
        ordem = ordem_inicial
        pontos_processados = []
        vertices_vistos = set()
        import math

        # Incertezas da Base PPP para propagação
        sigma_base_lat = base_ppp.get("sigma_lat") or 0.0 if base_ppp else 0.0
        sigma_base_lon = base_ppp.get("sigma_lon") or 0.0 if base_ppp else 0.0
        sigma_base_alt = base_ppp.get("sigma_alt") or 0.0 if base_ppp else 0.0

        for p in pontos_brutos:
            if aplicar_translace_plana:
                # Aplica translação rigorosa plana UTM de corpo rígido
                e_corrigido = p["e_original"] + delta_e
                n_corrigido = p["n_original"] + delta_n
                alt_corrigido = p["alt_original"] + delta_h
                
                # Retroprojeta UTM plana de volta para Geodésica elipsoidal no SIRGAS 2000
                lon_corrigido, lat_corrigido = transformer_to_latlon.transform(e_corrigido, n_corrigido)
            else:
                # Caso não translade, apenas converte de UTM para lat/lon
                lon_corrigido, lat_corrigido = transformer_to_latlon.transform(p["e_original"], p["n_original"])
                alt_corrigido = p["alt_original"]

            # Para layout RTK, controlamos a correção com base no sucesso da translação da base PPP.
            # Para layouts não-RTK (como Topcon estático processado fora), os rovers já estão corrigidos ("antes e depois").
            if layout == "rtk":
                status_ponto_final = "CORRIGIDO" if aplicar_translace_plana else "BRUTO"
                lat_corr_val = lat_corrigido if aplicar_translace_plana else None
                lon_corr_val = lon_corrigido if aplicar_translace_plana else None
                alt_corr_val = alt_corrigido if aplicar_translace_plana else None
                
                sigma_lat_prop = p["sigma_n"]
                sigma_lon_prop = p["sigma_e"]
                sigma_alt_prop = p["sigma_z"]
            else:
                status_ponto_final = "CORRIGIDO"
                lat_corr_val = lat_corrigido
                lon_corr_val = lon_corrigido
                alt_corr_val = alt_corrigido
                
                # Para rovers externos corrigidos, mantemos as incertezas originais do arquivo
                sigma_lat_prop = p["sigma_n"]
                sigma_lon_prop = p["sigma_e"]
                sigma_alt_prop = p["sigma_z"]

            import re
            nome_upper = p["nome"].strip().upper()
            match_completo = re.search(r"\b([A-Z]{3,4})-(M|P|V)-(\d+)\b", nome_upper)
            match_simples = re.search(r"\b(M|P|V)-(\d+)\b", nome_upper)
            
            if match_completo:
                tipo = match_completo.group(2)
            elif match_simples:
                tipo = match_simples.group(1)
            elif nome_upper.startswith("M"):
                tipo = "M"
            elif nome_upper.startswith("V"):
                tipo = "V"
            else:
                tipo = "P"

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
                "lat_corrigido": lat_corr_val,
                "lon_corrigido": lon_corr_val,
                "alt_corrigido": alt_corr_val,
                "sigma_n": p["sigma_n"],
                "sigma_e": p["sigma_e"],
                "sigma_z": p["sigma_z"],
                "status_ponto": status_ponto_final,
                "ponto_base_id": self.base_escolhida_id,
                "arquivo_origem": nome_arquivo,
                "status_correcao": status_ponto_final
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
                sigma_n, sigma_e, sigma_z, status_ponto, ponto_base_id,
                arquivo_origem, status_correcao
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                            p["sigma_n"], p["sigma_e"], p["sigma_z"], p["status_ponto"], p["ponto_base_id"],
                            p["arquivo_origem"], p["status_correcao"]
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
