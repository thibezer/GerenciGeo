import os
from pyproj import Transformer
import subprocess

def latlon_to_utm22s(lat, lon):
    """
    Converte coordenadas Latitude/Longitude (SIRGAS2000) para UTM Zona 22S (SIRGAS 2000).
    EPSG:4674 -> EPSG:31982
    """
    # Alterado de epsg:4326 para epsg:4674 para garantir consistência matemática absoluta
    transformer = Transformer.from_crs("epsg:4674", "epsg:31982", always_xy=True)
    easting, northing = transformer.transform(lon, lat)
    return easting, northing

def exportar_txt_utm(pontos, filepath):
    """
    Gera um arquivo TXT com as coordenadas UTM 22S.
    pontos: lista de tuplas (nome, lat, lon)
    """
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("Ponto,Eixo X (E),Eixo Y (N)\n")
        for nome, lat, lon in pontos:
            if lat and lon:
                try:
                    lat_f = float(lat)
                    lon_f = float(lon)
                    x, y = latlon_to_utm22s(lat_f, lon_f)
                    f.write(f"{nome},{x:.3f},{y:.3f}\n")
                except (ValueError, TypeError):
                    continue

def gerar_kml_e_abrir(pontos, filepath):
    """
    Gera um arquivo KML e tenta abri-lo no visualizador padrão (Google Earth).
    pontos: lista de tuplas (nome, lat, lon)
    """
    kml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Pontos GerenciGeo</name>
    <Style id="pointStyle">
      <IconStyle>
        <scale>1.1</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
"""
    for nome, lat, lon in pontos:
        if lat and lon:
            try:
                lat_f = float(lat)
                lon_f = float(lon)
                kml_content += f"""    <Placemark>
      <name>{nome}</name>
      <styleUrl>#pointStyle</styleUrl>
      <Point>
        <coordinates>{lon_f},{lat_f},0</coordinates>
      </Point>
    </Placemark>
"""
            except (ValueError, TypeError):
                continue
    
    kml_content += """  </Document>
</kml>"""

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(kml_content)
    
    # Abrir no Google Earth (se instalado e associado ao .kml no Windows)
    if os.path.exists(filepath):
        os.startfile(filepath)

def geodesic_to_ecef(lat: float, lon: float, alt: float) -> tuple[float, float, float]:
    """
    Converte coordenadas geodésicas (Latitude/Longitude em graus decimais, Altitude em metros) 
    para cartesianas ECEF (X, Y, Z em metros) usando o elipsoide GRS80 (SIRGAS 2000).
    """
    import math
    a = 6378137.0
    f = 1 / 298.257222101
    e2 = 2 * f - f ** 2
    
    lat_r = math.radians(lat)
    lon_r = math.radians(lon)
    
    sin_lat = math.sin(lat_r)
    cos_lat = math.cos(lat_r)
    
    N = a / math.sqrt(1.0 - e2 * sin_lat ** 2)
    
    x = (N + alt) * cos_lat * math.cos(lon_r)
    y = (N + alt) * cos_lat * math.sin(lon_r)
    z = (N * (1.0 - e2) + alt) * sin_lat
    
    return x, y, z

def ecef_to_geodesic(x: float, y: float, z: float) -> tuple[float, float, float]:
    """
    Converte coordenadas cartesianas ECEF (X, Y, Z em metros) para geodésicas 
    (Latitude/Longitude em graus decimais, Altitude em metros) usando o elipsoide GRS80 (Algoritmo de Bowring).
    """
    import math
    a = 6378137.0
    f = 1 / 298.257222101
    e2 = 2 * f - f ** 2
    
    b = a * (1.0 - f)
    e_prime2 = (a ** 2 - b ** 2) / (b ** 2)
    
    p = math.sqrt(x ** 2 + y ** 2)
    
    if p < 1e-10:  # Tratamento para os polos
        lat = 90.0 if z > 0 else -90.0
        lon = 0.0
        alt = abs(z) - b
        return lat, lon, alt
        
    theta = math.atan2(z * a, p * b)
    
    lat_r = math.atan2(
        z + e_prime2 * b * (math.sin(theta) ** 3),
        p - e2 * a * (math.cos(theta) ** 3)
    )
    
    lon_r = math.atan2(y, x)
    
    sin_lat = math.sin(lat_r)
    N = a / math.sqrt(1.0 - e2 * sin_lat ** 2)
    
    alt = p / math.cos(lat_r) - N
    
    lat = math.degrees(lat_r)
    lon = math.degrees(lon_r)
    
    return lat, lon, alt

def reordenar_perimetro_matricula(levantamento_id: int, matricula_id: int) -> dict:
    """
    Algoritmo rigoroso para reordenação de poligonal topológica perimetral (Norma INCRA / SIGEF).
    1. Identifica o ponto extremo norte (maior latitude, desempate maior longitude).
    2. Projetará em UTM para calcular a orientação via Shoelace (Área com sinal).
    3. Reverte para sentido horário se necessário.
    4. Rotaciona ciclicamente a lista para iniciar no ponto extremo norte.
    5. Recria os segmentos com fechamento estrito em transação isolada de banco de dados.
    """
    import math
    import logging
    from pyproj import Transformer
    from database.connection import DatabaseManager, execute_query
    
    logger = logging.getLogger(__name__)
    try:
        # 1. Recupera todos os pontos cadastrados para a matrícula (ou avulsos)
        if matricula_id is None or matricula_id == 0:
            query_pontos = """
                SELECT id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, sigma_lat
                FROM pontos
                WHERE levantamento_id = ? AND matricula_id IS NULL AND tipo_ponto != 'B' AND (ignorar_poligono IS NULL OR ignorar_poligono = 0)
                ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
            """
            params_query = (levantamento_id,)
            msg_erro = "O levantamento precisa de pelo menos 3 pontos avulsos com coordenadas para ordenar."
        else:
            query_pontos = """
                SELECT id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, sigma_lat
                FROM pontos
                WHERE levantamento_id = ? AND matricula_id = ? AND tipo_ponto != 'B' AND (ignorar_poligono IS NULL OR ignorar_poligono = 0)
                ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
            """
            params_query = (levantamento_id, matricula_id)
            msg_erro = "A matrícula precisa de pelo menos 3 pontos com coordenadas para ordenar a poligonal."

        rows = execute_query(query_pontos, params=params_query, fetch_all=True)
        if not rows or len(rows) < 3:
            return {
                "sucesso": False,
                "erro": msg_erro
            }
            
        pontos = [dict(r) for r in rows]
        n = len(pontos)
        
        # 2. Identifica o ponto mais ao norte (Maior Latitude)
        # Critério de desempate: maior longitude (mais a Leste)
        ponto_norte_idx = 0
        max_lat = -999.0
        max_lon = -999.0
        
        for idx, pt in enumerate(pontos):
            lat = float(pt["lat"])
            lon = float(pt["lon"])
            if lat > max_lat:
                max_lat = lat
                max_lon = lon
                ponto_norte_idx = idx
            elif abs(lat - max_lat) < 1e-9:  # Empate técnico de latitude
                if lon > max_lon:
                    max_lon = lon
                    ponto_norte_idx = idx

        ponto_norte = pontos[ponto_norte_idx]
        logger.info(f"[TOPOLOGIA] Ponto mais ao norte identificado: {ponto_norte['nome_vertice']} (Lat: {ponto_norte['lat']:.8f})")

        # 3. Conversão UTM Dinâmica para Cálculo do Shoelace
        lon_referencia = pontos[0]["lon"]
        zona_utm = int((lon_referencia + 180) / 6) + 1
        epsg_utm = f"319{60 + zona_utm}"  # EPSG para Hemisfério Sul
        
        transformer = Transformer.from_crs("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)
        
        pontos_planos = []
        for pt in pontos:
            e, n_coord = transformer.transform(pt["lon"], pt["lat"])
            pontos_planos.append({
                "id": pt["id"],
                "nome": pt["nome_vertice"],
                "e": e,
                "n": n_coord
            })

        # 4. Cálculo da Área Direcionada por Shoelace/Gauss
        soma_shoelace = 0.0
        for i in range(n):
            curr = pontos_planos[i]
            nxt = pontos_planos[(i + 1) % n]
            soma_shoelace += (curr["e"] * nxt["n"]) - (nxt["e"] * curr["n"])
            
        area_sinalizada = soma_shoelace / 2.0
        orientacao_original = "ANTI-HORÁRIO" if area_sinalizada > 0.0 else "HORÁRIO"
        logger.info(f"[TOPOLOGIA] Área com sinal: {area_sinalizada:.3f} m². Orientação original: {orientacao_original}")

        # 5. Inversão se for Anti-horário
        if area_sinalizada > 0.0:
            # Reverte a lista de pontos
            pontos.reverse()
            # Atualiza o índice do ponto norte após a inversão
            for idx, pt in enumerate(pontos):
                if pt["id"] == ponto_norte["id"]:
                    ponto_norte_idx = idx
                    break
            logger.info("[TOPOLOGIA] Poligonal invertida com sucesso para sentido HORÁRIO.")
        else:
            logger.info("[TOPOLOGIA] Poligonal já se encontra no sentido HORÁRIO de caminhamento.")

        # 6. Rotação Cíclica (Shift circular) para que o ponto mais ao norte seja o índice 0
        pontos_ordenados = pontos[ponto_norte_idx:] + pontos[:ponto_norte_idx]
        
        # 7. Persistência em Transação de Banco de Dados Protegida
        try:
            with DatabaseManager() as conn:
                cursor = conn.cursor()
                
                # A. Atualiza a nova ordem de caminhamento nos vértices
                query_update_pt = "UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?"
                for nova_ordem, pt in enumerate(pontos_ordenados, start=1):
                    cursor.execute(query_update_pt, (nova_ordem, pt["id"]))
                
                if matricula_id is not None and matricula_id != 0:
                    # B. Obtém metadados dos limites dos segmentos anteriores para preservá-los
                    query_preservar_limites = """
                        SELECT ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef
                        FROM segmentos
                        WHERE levantamento_id = ? AND matricula_id = ?
                    """
                    cursor.execute(query_preservar_limites, (levantamento_id, matricula_id))
                    segmentos_antigos = cursor.fetchall()
                    
                    # Mapeia as conexões antigas para manter limites e confrontantes configurados pelo topógrafo
                    mapa_segmento_info = {}
                    for seg in segmentos_antigos:
                        # Chave baseada na conexão bidirecional por segurança
                        chave = (seg[0], seg[1])
                        mapa_segmento_info[chave] = {
                            "confrontante_id": seg[2],
                            "tipo_limite_sigef": seg[3],
                            "metodo_posicionamento_sigef": seg[4]
                        }

                    # C. Remove todos os segmentos anteriores
                    cursor.execute("DELETE FROM segmentos WHERE levantamento_id = ? AND matricula_id = ?", (levantamento_id, matricula_id))
                    
                    # D. Reconstroi a cadeia de segmentos
                    primeiro_pt = pontos_ordenados[0]
                    metodo_padrao = "PG1" if (primeiro_pt.get("sigma_lat") or 0.0) > 0.0 else "MC1"
                    
                    query_insert_seg = """
                        INSERT INTO segmentos (
                            levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, 
                            confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """
                    
                    segmentos_criados = 0
                    for i in range(n):
                        pt_ini = pontos_ordenados[i]
                        pt_fim = pontos_ordenados[(i + 1) % n]
                        
                        # Tenta reaproveitar limites e confrontantes já inseridos
                        chave_original = (pt_ini["id"], pt_fim["id"])
                        chave_inversa = (pt_fim["id"], pt_ini["id"])
                        
                        if chave_original in mapa_segmento_info:
                            info = mapa_segmento_info[chave_original]
                        elif chave_inversa in mapa_segmento_info:
                            info = mapa_segmento_info[chave_inversa]
                        else:
                            info = {
                                "confrontante_id": None,
                                "tipo_limite_sigef": "LN1",  # Limite padrão: Linha
                                "metodo_posicionamento_sigef": metodo_padrao
                            }
                        
                        cursor.execute(query_insert_seg, (
                            levantamento_id,
                            matricula_id,
                            pt_ini["id"],
                            pt_fim["id"],
                            info["confrontante_id"],
                            info["tipo_limite_sigef"],
                            info["metodo_posicionamento_sigef"]
                        ))
                        segmentos_criados += 1
                    
                    conn.commit()
                    logger.info(f"[TOPOLOGIA] Perímetro ordenado com sucesso. {segmentos_criados} segmentos gravados.")
                else:
                    conn.commit()
                    logger.info("[TOPOLOGIA] Pontos avulsos do levantamento ordenados com sucesso no banco.")
                
            return {
                "sucesso": True,
                "total_vertices": n,
                "orientacao_original": orientacao_original,
                "ponto_inicial": ponto_norte["nome_vertice"],
                "mensagem": "Poligonal reordenada com sucesso para sentido horário iniciando no extremo norte."
            }
            
        except Exception as e_db:
            logger.error(f"[TOPOLOGIA] Falha no commit de reordenação: {e_db}")
            raise e_db
            
    except Exception as e:
        logger.error(f"[TOPOLOGIA] Falha crítica no algoritmo de reordenação perimetral: {e}")
        return {
            "sucesso": False,
            "erro": str(e)
        }

def corrigir_rovers_em_bloco(levantamento_id: int, base_id: int) -> int:
    """
    Propaga a correção da Base (base_id) para todos os rovers vinculados (ponto_base_id = base_id)
    utilizando translação plana rigorosa em UTM + Altitude para conservar as distâncias de campo
    e manter os deltas constantes, e depois converte os resultados de volta para geodésicas (Lat/Lon)
    no elipsoide GRS80 (SIRGAS 2000) para gravação.
    """
    import math
    import logging
    from database.connection import execute_query, DatabaseManager
    from business.historico_campo import HistoricoCampoLogger
    
    logger = logging.getLogger(__name__)
    
    # 1. Recupera as informações da Base
    row_base = execute_query(
        "SELECT id, nome_vertice, lat, lon, alt, e_original, n_original, alt_original, sigma_lat, sigma_lon, sigma_alt, status_ponto FROM pontos WHERE id = ? AND levantamento_id = ?",
        params=(base_id, levantamento_id),
        fetch_one=True
    )
    if not row_base:
        logger.warning(f"[GEOPROCESSAMENTO] Base com ID {base_id} não encontrada no levantamento {levantamento_id}.")
        return 0
        
    base = dict(row_base)
    if not base["lat"] or base["lat"] == 0.0 or base["status_ponto"] != 'CORRIGIDO':
        logger.info(f"[GEOPROCESSAMENTO] A base {base['nome_vertice']} ainda está no estado BRUTO. Translação adiada.")
        return 0
        
    if not base["e_original"] or not base["n_original"]:
        logger.warning(f"[GEOPROCESSAMENTO] A base {base['nome_vertice']} não possui coordenadas originais UTM de campo para referenciar a translação.")
        return 0
        
    try:
        # A. Converte as coordenadas geodésicas corrigidas da Base para UTM (SIRGAS 2000)
        # Determina o fuso com base na longitude da base corrigida
        longitude_base = base["lon"]
        zona_utm = int((longitude_base + 180) / 6) + 1
        epsg_utm = f"319{60 + zona_utm}"
        
        transformer_to_utm = Transformer.from_crs("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)
        e_base_corr, n_base_corr = transformer_to_utm.transform(base["lon"], base["lat"])
        
        # B. Vetor Delta UTM plano e altitude
        delta_e = e_base_corr - base["e_original"]
        delta_n = n_base_corr - base["n_original"]
        delta_h = base["alt"] - base["alt_original"]
        
        logger.info(f"[GEOPROCESSAMENTO] Vetor Delta UTM para Base {base['nome_vertice']}: dE={delta_e:.4f}m, dN={delta_n:.4f}m, dH={delta_h:.4f}m")
    except Exception as e_trans:
        logger.error(f"[GEOPROCESSAMENTO] Falha ao calcular vetor Delta UTM para Base {base['nome_vertice']}: {e_trans}")
        return 0
        
    # 3. Recupera todos os rovers ativos vinculados a essa Base
    query_rovers = """
        SELECT id, nome_vertice, e_original, n_original, alt_original, sigma_n, sigma_e, sigma_z 
        FROM pontos 
        WHERE levantamento_id = ? AND ponto_base_id = ?
    """
    rows_rovers = execute_query(query_rovers, params=(levantamento_id, base_id), fetch_all=True)
    if not rows_rovers:
        logger.info(f"[GEOPROCESSAMENTO] Nenhum rover vinculado para a Base {base['nome_vertice']}.")
        return 0
        
    rovers = [dict(r) for r in rows_rovers]
    
    # 4. Transla e atualiza em transação atômica
    total_corrigidos = 0
    detalhamento_logs = []
    
    try:
        transformer_to_latlon = Transformer.from_crs(f"epsg:{epsg_utm}", "epsg:4674", always_xy=True)
        
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            sig_base_lat = base["sigma_lat"] or 0.0
            sig_base_lon = base["sigma_lon"] or 0.0
            sig_base_alt = base["sigma_alt"] or 0.0
            
            for r in rovers:
                if not r["e_original"] or not r["n_original"]:
                    continue
                    
                # A. Translação plana UTM rigorosa
                e_corr = r["e_original"] + delta_e
                n_corr = r["n_original"] + delta_n
                alt_corr = r["alt_original"] + delta_h
                
                # B. UTM Corrigida -> Geodésica Corrigida
                lon_corr, lat_corr = transformer_to_latlon.transform(e_corr, n_corr)
                
                # E. Propagação de Incertezas
                sig_lat_prop = math.sqrt((r["sigma_n"] or 0.0)**2 + sig_base_lat**2)
                sig_lon_prop = math.sqrt((r["sigma_e"] or 0.0)**2 + sig_base_lon**2)
                sig_alt_prop = math.sqrt((r["sigma_z"] or 0.0)**2 + sig_base_alt**2)
                
                # F. Atualiza no banco
                # F. Atualiza no banco com consistência de status para o ecossistema
                cursor.execute(
                    """
                    UPDATE pontos 
                    SET lat = ?, lon = ?, alt = ?, 
                        lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                        sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                        status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO' 
                    WHERE id = ? AND levantamento_id = ?
                    """,
                    (lat_corr, lon_corr, alt_corr, 
                     lat_corr, lon_corr, alt_corr,
                     sig_lat_prop, sig_lon_prop, sig_alt_prop,
                     r["id"], levantamento_id)
                )
                total_corrigidos += 1
                detalhamento_logs.append({
                    "id": r["id"],
                    "nome": r["nome_vertice"],
                    "original": {"E": r["e_original"], "N": r["n_original"], "H": r["alt_original"]},
                    "corrigido": {"lat": lat_corr, "lon": lon_corr, "H": alt_corr}
                })
                
            conn.commit()
            
        if total_corrigidos > 0:
            desc_auditoria = f"Translação rigorosa UTM/Plana em lote aplicada com sucesso para {total_corrigidos} rovers vinculados à Base {base['nome_vertice']}."
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=levantamento_id,
                tipo_evento="CORRECAO_TRANSLACAO",
                descricao=desc_auditoria,
                dados_detalhados={
                    "base_id": base_id,
                    "base_nome": base["nome_vertice"],
                    "vetor_delta_utm": {"dE": delta_e, "dN": delta_n, "dH": delta_h},
                    "rovers_corrigidos": detalhamento_logs
                }
            )
            
        logger.info(f"[GEOPROCESSAMENTO] Translação em bloco concluída. {total_corrigidos} rovers corrigidos com base no de {base['nome_vertice']}.")
    except Exception as e_db:
        logger.error(f"[GEOPROCESSAMENTO] Falha crítica ao persistir rovers corrigidos no banco: {e_db}")
        return 0
        
    return total_corrigidos

def associar_base_ao_lote(ponto_id_selecionado: int, base_ppp_id: int) -> int:
    """
    Associa uma base PPP processada e corrigida a um lote de pontos importados (mesmo arquivo_origem),
    recalculando rigorosamente as coordenadas de todos os pontos do lote através de translação plana rigorosa.
    """
    import math
    import logging
    from database.connection import execute_query, DatabaseManager
    from business.historico_campo import HistoricoCampoLogger
    from pyproj import Transformer
    from business.workspace_manager import WorkspaceManager
    from business.txt_parser import TxtGeodesicParser
    
    logger = logging.getLogger(__name__)
    
    # 1. Identifica o ponto selecionado no banco
    row_selecionado = execute_query(
        "SELECT levantamento_id, arquivo_origem, e_original, n_original, alt_original, sigma_n, sigma_e, sigma_z FROM pontos WHERE id = ?",
        params=(ponto_id_selecionado,),
        fetch_one=True
    )
    if not row_selecionado:
        logger.error(f"[VINCULO_TARDE] Ponto com ID {ponto_id_selecionado} não encontrado no banco.")
        raise ValueError("Ponto selecionado não encontrado.")
        
    ponto_sel = dict(row_selecionado)
    arquivo_origem = ponto_sel.get("arquivo_origem")
    levantamento_id = ponto_sel.get("levantamento_id")
    
    if not arquivo_origem:
        logger.error(f"[VINCULO_TARDE] Ponto {ponto_id_selecionado} não possui 'arquivo_origem' definido no banco.")
        raise ValueError("Ponto selecionado não possui arquivo de origem associado.")

    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(levantamento_id)
        caminho_arquivo = folder / "Processados" / arquivo_origem
        if caminho_arquivo.exists():
            with open(caminho_arquivo, "r", encoding="utf-8", errors="ignore") as f:
                linhas = f.readlines()
            parser_layout = TxtGeodesicParser(levantamento_id)
            layout = parser_layout.identificar_layout(linhas)
            if layout != "rtk":
                raise ValueError("Este arquivo de pontos não é do tipo RTK (foi gerado por software próprio e seus pontos já estão corrigidos).")
    except Exception as e_layout:
        logger.warning(f"[VINCULO_TARDE] Verificação de layout do arquivo {arquivo_origem}: {e_layout}")
        if "não é do tipo RTK" in str(e_layout):
            raise e_layout
        
    # 2. Recupera as informações corrigidas oficiais da base_ppp_id
    row_base = execute_query(
        "SELECT id, nome_vertice, lat, lon, alt, sigma_lat, sigma_lon, sigma_alt, status_ponto, status_correcao FROM pontos WHERE id = ?",
        params=(base_ppp_id,),
        fetch_one=True
    )
    if not row_base:
        logger.error(f"[VINCULO_TARDE] Base com ID {base_ppp_id} não encontrada.")
        raise ValueError("Base PPP especificada não encontrada.")
        
    base_corr = dict(row_base)
    if not base_corr["lat"] or base_corr["lat"] == 0.0:
        logger.error(f"[VINCULO_TARDE] A base selecionada {base_corr['nome_vertice']} não possui coordenadas corrigidas.")
        raise ValueError("A base selecionada ainda não possui coordenadas corrigidas.")
        
    # 3. Determina o Vetor Delta UTM plano e altitude
    longitude_base = base_corr["lon"]
    zona_utm = int((longitude_base + 180) / 6) + 1
    epsg_utm = f"319{60 + zona_utm}"
    
    transformer_to_utm = Transformer.from_crs("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)
    e_base_corr, n_base_corr = transformer_to_utm.transform(base_corr["lon"], base_corr["lat"])
    
    delta_e = e_base_corr - ponto_sel["e_original"]
    delta_n = n_base_corr - ponto_sel["n_original"]
    delta_h = base_corr["alt"] - ponto_sel["alt_original"]
    
    logger.info(f"[VINCULO_TARDE] Vetor Delta UTM calculado: dE={delta_e:.4f}m, dN={delta_n:.4f}m, dH={delta_h:.4f}m")
    
    # 4. Recupera todos os rovers pertencentes ao mesmo arquivo_origem e levantamento
    query_rovers = """
        SELECT id, nome_vertice, e_original, n_original, alt_original, sigma_n, sigma_e, sigma_z 
        FROM pontos 
        WHERE levantamento_id = ? AND arquivo_origem = ? AND id != ?
    """
    rows_rovers = execute_query(query_rovers, params=(levantamento_id, arquivo_origem, ponto_id_selecionado), fetch_all=True)
    rovers = [dict(r) for r in rows_rovers]
    
    total_atualizados = 0
    detalhamento_logs = []
    
    try:
        transformer_to_latlon = Transformer.from_crs(f"epsg:{epsg_utm}", "epsg:4674", always_xy=True)
        
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            sig_base_lat = base_corr["sigma_lat"] or 0.0
            sig_base_lon = base_corr["sigma_lon"] or 0.0
            sig_base_alt = base_corr["sigma_alt"] or 0.0
            
            sig_lat_sel = math.sqrt((ponto_sel["sigma_n"] or 0.0)**2 + sig_base_lat**2)
            sig_lon_sel = math.sqrt((ponto_sel["sigma_e"] or 0.0)**2 + sig_base_lon**2)
            sig_alt_sel = math.sqrt((ponto_sel["sigma_z"] or 0.0)**2 + sig_base_alt**2)
            
            cursor.execute(
                """
                UPDATE pontos
                SET lat = ?, lon = ?, alt = ?,
                    lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                    sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                    status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO',
                    ponto_base_id = ?, tipo_ponto = 'B', ordem_caminhamento = NULL
                WHERE id = ?
                """,
                (base_corr["lat"], base_corr["lon"], base_corr["alt"],
                 base_corr["lat"], base_corr["lon"], base_corr["alt"],
                 sig_lat_sel, sig_lon_sel, sig_alt_sel,
                 base_ppp_id, ponto_id_selecionado)
            )
            total_atualizados += 1
            detalhamento_logs.append({
                "id": ponto_id_selecionado,
                "nome": "Base_Amarração_" + base_corr["nome_vertice"],
                "original": {"E": ponto_sel["e_original"], "N": ponto_sel["n_original"], "H": ponto_sel["alt_original"]},
                "corrigido": {"lat": base_corr["lat"], "lon": base_corr["lon"], "H": base_corr["alt"]}
            })
            
            for r in rovers:
                if not r["e_original"] or not r["n_original"]:
                    continue
                    
                e_corr = r["e_original"] + delta_e
                n_corr = r["n_original"] + delta_n
                alt_corr = r["alt_original"] + delta_h
                
                lon_corr, lat_corr = transformer_to_latlon.transform(e_corr, n_corr)
                
                sig_lat_prop = math.sqrt((r["sigma_n"] or 0.0)**2 + sig_base_lat**2)
                sig_lon_prop = math.sqrt((r["sigma_e"] or 0.0)**2 + sig_base_lon**2)
                sig_alt_prop = math.sqrt((r["sigma_z"] or 0.0)**2 + sig_base_alt**2)
                
                cursor.execute(
                    """
                    UPDATE pontos
                    SET lat = ?, lon = ?, alt = ?,
                        lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                        sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                        status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO',
                        ponto_base_id = ?
                    WHERE id = ?
                    """,
                    (lat_corr, lon_corr, alt_corr,
                     lat_corr, lon_corr, alt_corr,
                     sig_lat_prop, sig_lon_prop, sig_alt_prop,
                     base_ppp_id, r["id"])
                )
                total_atualizados += 1
                detalhamento_logs.append({
                    "id": r["id"],
                    "nome": r["nome_vertice"],
                    "original": {"E": r["e_original"], "N": r["n_original"], "H": r["alt_original"]},
                    "corrigido": {"lat": lat_corr, "lon": lon_corr, "H": alt_corr}
                })
                
            conn.commit()
            
        desc_auditoria = f"Vínculo Tardio V.L.A.E.G. aplicado com sucesso. {total_atualizados} pontos do arquivo '{arquivo_origem}' foram transladados e amarrados à Base '{base_corr['nome_vertice']}'."
        HistoricoCampoLogger.registrar_evento(
            levantamento_id=levantamento_id,
            tipo_evento="VINCULO_BASE_TARDE",
            descricao=desc_auditoria,
            dados_detalhados={
                "arquivo_origem": arquivo_origem,
                "base_id": base_ppp_id,
                "base_nome": base_corr["nome_vertice"],
                "vetor_delta_utm": {"dE": delta_e, "dN": delta_n, "dH": delta_h},
                "total_pontos_vinculados": total_atualizados,
                "detalhes": detalhamento_logs
            }
        )
        
        logger.info(f"[VINCULO_TARDE] Processamento de amarração tardia concluído. {total_atualizados} atualizados.")
        return total_atualizados
        
    except Exception as e_db:
        logger.error(f"[VINCULO_TARDE] Falha crítica de transação ao atualizar rovers: {e_db}")
        raise e_db

def aplicar_correcao_manual_lote(levantamento_id: int, matricula_id: int, arquivo_origem: str, dados_brutos: dict, dados_corrigidos: dict, base_id: int = None) -> int:
    """
    Aplica a correção manual por translação plana rigorosa em todo o lote de pontos
    pertencente ao arquivo_origem, usando dados brutos de campo e coordenadas oficiais homologadas.
    Insere/atualiza o ponto base de campo como Tipo 'M' com coordenadas oficiais.
    """
    import math
    import logging
    from database.connection import execute_query, DatabaseManager
    from business.historico_campo import HistoricoCampoLogger
    from pyproj import Transformer
    from business.workspace_manager import WorkspaceManager
    from business.txt_parser import TxtGeodesicParser
    
    logger = logging.getLogger(__name__)

    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(levantamento_id)
        caminho_arquivo = folder / "Processados" / arquivo_origem
        if caminho_arquivo.exists():
            with open(caminho_arquivo, "r", encoding="utf-8", errors="ignore") as f:
                linhas = f.readlines()
            parser_layout = TxtGeodesicParser(levantamento_id)
            layout = parser_layout.identificar_layout(linhas)
            if layout != "rtk":
                raise ValueError("Este arquivo de pontos não é do tipo RTK (foi gerado por software próprio e seus pontos já estão corrigidos).")
    except Exception as e_layout:
        logger.warning(f"[OVERRIDE_MANUAL] Verificação de layout do arquivo {arquivo_origem}: {e_layout}")
        if "não é do tipo RTK" in str(e_layout):
            raise e_layout
    
    # 1. Determina a Coordenada Corrigida Oficinal da Base (em Lat/Lon/Alt Geodésica)
    lat_corr_oficial = 0.0
    lon_corr_oficial = 0.0
    alt_corr_oficial = float(dados_corrigidos.get("alt_corrigida") or dados_corrigidos.get("alt") or 0.0)
    
    fuso_selecionado = dados_corrigidos.get("fuso")
    zona = int(''.join(filter(str.isdigit, fuso_selecionado or "22S")))
    epsg_utm = f"319{60 + zona}"
    
    transformer_to_latlon = Transformer.from_crs(f"epsg:{epsg_utm}", "epsg:4674", always_xy=True)
    
    if dados_corrigidos.get("tipo_entrada") == "utm":
        e_corr = float(dados_corrigidos["e_corrigido"])
        n_corr = float(dados_corrigidos["n_corrigido"])
        lon_corr_oficial, lat_corr_oficial = transformer_to_latlon.transform(e_corr, n_corr)
        logger.info(f"[OVERRIDE_MANUAL] Projeção reversa da Base Corrigida concluída: Lat={lat_corr_oficial:.8f}, Lon={lon_corr_oficial:.8f}")
    else:
        lat_corr_oficial = float(dados_corrigidos["lat_corrigida"])
        lon_corr_oficial = float(dados_corrigidos["lon_corrigida"])
        
        transformer_to_utm = Transformer.from_crs("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)
        e_corr, n_corr = transformer_to_utm.transform(lon_corr_oficial, lat_corr_oficial)
    
    # 2. Dados brutos
    e_bruto = float(dados_brutos["e_bruto"])
    n_bruto = float(dados_brutos["n_bruto"])
    alt_bruta = float(dados_brutos["alt_bruta"])
    nome_base = dados_brutos.get("nome_base", "BASE-MANUAL")
    
    # 3. Determina o Vetor Delta UTM plano e altitude
    delta_e = e_corr - e_bruto
    delta_n = n_corr - n_bruto
    delta_h = alt_corr_oficial - alt_bruta
    
    logger.info(f"[OVERRIDE_MANUAL] Delta UTM gerado: dE={delta_e:.4f}m, dN={delta_n:.4f}m, dH={delta_h:.4f}m")
    
    # A. Recupera a matrícula id e pontos do lote
    query_mat = """
        SELECT matricula_id FROM pontos 
        WHERE levantamento_id = ? AND arquivo_origem = ? AND matricula_id IS NOT NULL 
        LIMIT 1
    """
    row_mat = execute_query(query_mat, params=(levantamento_id, arquivo_origem), fetch_one=True)
    matricula_id_efetiva = row_mat["matricula_id"] if row_mat else None
    
    sig_base_lat = float(dados_corrigidos.get("sigma_lat") or 0.0050)
    sig_base_lon = float(dados_corrigidos.get("sigma_lon") or 0.0050)
    sig_base_alt = float(dados_corrigidos.get("sigma_alt") or 0.0100)
    
    if base_id is None:
        query_check_base = """
            SELECT id FROM pontos
            WHERE levantamento_id = ? AND nome_vertice = ? AND tipo_ponto = 'M'
        """
        row_base = execute_query(query_check_base, params=(levantamento_id, nome_base), fetch_one=True)
        base_id = row_base["id"] if row_base else None
    
    if base_id:
        query_upsert_base = """
            UPDATE pontos
            SET matricula_id = ?, lat = ?, lon = ?, alt = ?,
                lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                n_original = ?, e_original = ?, alt_original = ?,
                sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                sigma_n = ?, sigma_e = ?, sigma_z = ?,
                status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO',
                arquivo_origem = ?, ignorar_poligono = 1, nome_vertice = ?,
                tipo_ponto = 'M', ponto_base_id = NULL
            WHERE id = ?
        """
        execute_query(query_upsert_base, params=(
            matricula_id_efetiva, lat_corr_oficial, lon_corr_oficial, alt_corr_oficial,
            lat_corr_oficial, lon_corr_oficial, alt_corr_oficial,
            n_bruto, e_bruto, alt_bruta,
            sig_base_lat, sig_base_lon, sig_base_alt,
            sig_base_lat, sig_base_lon, sig_base_alt,
            arquivo_origem, nome_base, base_id
        ), commit=True)
    else:
        query_upsert_base = """
            INSERT INTO pontos (
                levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt,
                lat_corrigido, lon_corrigido, alt_corrigido,
                n_original, e_original, alt_original,
                sigma_lat, sigma_lon, sigma_alt,
                sigma_n, sigma_e, sigma_z,
                status_ponto, status_correcao, arquivo_origem, ignorar_poligono
            ) VALUES (?, ?, ?, 'M', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CORRIGIDO', 'CORRIGIDO', ?, 1)
        """
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(query_upsert_base, (
                levantamento_id, matricula_id_efetiva, nome_base, lat_corr_oficial, lon_corr_oficial, alt_corr_oficial,
                lat_corr_oficial, lon_corr_oficial, alt_corr_oficial,
                n_bruto, e_bruto, alt_bruta,
                sig_base_lat, sig_base_lon, sig_base_alt,
                sig_base_lat, sig_base_lon, sig_base_alt,
                arquivo_origem
            ))
            conn.commit()
            base_id = cursor.lastrowid
            
    # 4. Abre uma transação no banco e faz o loop para os rovers
    query_rovers = """
        SELECT id, nome_vertice, e_original, n_original, alt_original, sigma_n, sigma_e, sigma_z 
        FROM pontos 
        WHERE levantamento_id = ? AND arquivo_origem = ?
    """
    rows_rovers = execute_query(query_rovers, params=(levantamento_id, arquivo_origem), fetch_all=True)
    rovers = [dict(r) for r in rows_rovers]
    
    total_corrigidos = 0
    detalhamento_logs = []
    
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            for r in rovers:
                if r["id"] == base_id:
                    continue
                if not r["e_original"] or not r["n_original"]:
                    continue
                    
                e_rover_corr = r["e_original"] + delta_e
                n_rover_corr = r["n_original"] + delta_n
                alt_rover_corr = r["alt_original"] + delta_h
                
                lon_corr, lat_corr = transformer_to_latlon.transform(e_rover_corr, n_rover_corr)
                alt_corr = alt_rover_corr
                
                sig_lat_prop = math.sqrt((r["sigma_n"] or 0.0)**2 + sig_base_lat**2)
                sig_lon_prop = math.sqrt((r["sigma_e"] or 0.0)**2 + sig_base_lon**2)
                sig_alt_prop = math.sqrt((r["sigma_z"] or 0.0)**2 + sig_base_alt**2)
                
                cursor.execute(
                    """
                    UPDATE pontos 
                    SET lat = ?, lon = ?, alt = ?, 
                        lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                        sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                        status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO',
                        ponto_base_id = ?
                    WHERE id = ? AND levantamento_id = ?
                    """,
                    (lat_corr, lon_corr, alt_corr, 
                     lat_corr, lon_corr, alt_corr,
                     sig_lat_prop, sig_lon_prop, sig_alt_prop,
                     base_id, r["id"], levantamento_id)
                )
                total_corrigidos += 1
                detalhamento_logs.append({
                    "id": r["id"],
                    "nome": r["nome_vertice"],
                    "original": {"E": r["e_original"], "N": r["n_original"], "H": r["alt_original"]},
                    "corrigido": {"lat": lat_corr, "lon": lon_corr, "H": alt_corr}
                })
                
            conn.commit()
            
        desc_auditoria = f"Override Manual / Forçar Correção UTM plana aplicada em lote para {total_corrigidos} pontos do arquivo '{arquivo_origem}'."
        HistoricoCampoLogger.registrar_evento(
            levantamento_id=levantamento_id,
            tipo_evento="CORRECAO_MANUAL_OVERRIDE",
            descricao=desc_auditoria,
            dados_detalhados={
                "arquivo_origem": arquivo_origem,
                "dados_brutos_base": dados_brutos,
                "dados_corrigidos_base": dados_corrigidos,
                "vetor_delta_utm": {"dE": delta_e, "dN": delta_n, "dH": delta_h},
                "total_pontos_corrigidos": total_corrigidos,
                "detalhes": detalhamento_logs
            }
        )
        
        logger.info(f"[OVERRIDE_MANUAL] Correção plana aplicada com sucesso. {total_corrigidos} corrigidos.")
        return total_corrigidos
        
    except Exception as e_db:
        logger.error(f"[OVERRIDE_MANUAL] Falha crítica de transação ao aplicar correção manual: {e_db}")
        raise e_db


def reverter_rovers_para_bruto(levantamento_id: int, base_id: int) -> int:
    """
    Localiza todos os rovers órfãos vinculados à base (base_id) que foi excluída ou desassociada,
    e os reverte com segurança para o estado 'BRUTO', recalculando suas coordenadas lat/lon geodésicas
    cruas diretamente de suas coordenadas originais de campo (sem delta de translação).
    """
    import logging
    from database.connection import execute_query, DatabaseManager
    from pyproj import Transformer
    from business.historico_campo import HistoricoCampoLogger

    logger = logging.getLogger(__name__)
    logger.info(f"[REVERSAO_ORFÃOS] Iniciando reversão para bruto de rovers órfãos da base ID={base_id}")

    # 1. Recupera todos os rovers vinculados a essa base
    query_rovers = """
        SELECT id, nome_vertice, e_original, n_original, alt_original, sigma_n, sigma_e, sigma_z, tipo_ponto
        FROM pontos
        WHERE levantamento_id = ? AND ponto_base_id = ?
    """
    rows_rovers = execute_query(query_rovers, params=(levantamento_id, base_id), fetch_all=True)
    rovers = [dict(r) for r in rows_rovers]

    if not rovers:
        logger.info(f"[REVERSAO_ORFÃOS] Nenhum rover órfão localizado para a base ID={base_id}")
        return 0

    total_revertidos = 0
    detalhamento_logs = []

    try:
        # Usa a projeção padrão UTM Zone 22S (EPSG:31982) como fallback padrão do motor para retroprojeção direta
        transformer_to_latlon = Transformer.from_crs("epsg:31982", "epsg:4674", always_xy=True)

        with DatabaseManager() as conn:
            cursor = conn.cursor()

            for r in rovers:
                if not r["e_original"] or not r["n_original"]:
                    continue

                # Retroprojeta de volta sem aplicar nenhum delta
                lon_bruta, lat_bruta = transformer_to_latlon.transform(r["e_original"], r["n_original"])
                alt_bruta = r["alt_original"]

                # Coordenadas originais, desvios originais
                sig_lat = r["sigma_n"] or 0.0
                sig_lon = r["sigma_e"] or 0.0
                sig_alt = r["sigma_z"] or 0.0

                # Reverte rover. Se o tipo_ponto atual for 'B' (base orfã), reverte para 'P'
                novo_tipo = r["tipo_ponto"]
                if novo_tipo == 'B':
                    if r["nome_vertice"].upper().startswith("M"):
                        novo_tipo = "M"
                    elif r["nome_vertice"].upper().startswith("V"):
                        novo_tipo = "V"
                    else:
                        novo_tipo = "P"

                cursor.execute(
                    """
                    UPDATE pontos
                    SET lat = ?, lon = ?, alt = ?,
                        lat_corrigido = NULL, lon_corrigido = NULL, alt_corrigido = NULL,
                        sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                        status_ponto = 'BRUTO', status_correcao = 'BRUTO',
                        ponto_base_id = NULL, tipo_ponto = ?
                    WHERE id = ?
                    """,
                    (lat_bruta, lon_bruta, alt_bruta,
                     sig_lat, sig_lon, sig_alt,
                     novo_tipo, r["id"])
                )
                total_revertidos += 1
                detalhamento_logs.append({
                    "id": r["id"],
                    "nome": r["nome_vertice"],
                    "tipo_anterior": r["tipo_ponto"],
                    "tipo_atual": novo_tipo,
                    "lat_bruta": lat_bruta,
                    "lon_bruta": lon_bruta
                })

            conn.commit()

        # Registrar no histórico de campo
        desc_auditoria = f"Reversão para BRUTO executada com sucesso. {total_revertidos} rovers órfãos da base ID={base_id} perderam o vínculo de correção."
        HistoricoCampoLogger.registrar_evento(
            levantamento_id=levantamento_id,
            tipo_evento="REVERSAO_ROVERS_ORFÃOS",
            descricao=desc_auditoria,
            dados_detalhados={
                "base_id": base_id,
                "total_revertidos": total_revertidos,
                "detalhes": detalhamento_logs
            }
        )

        logger.info(f"[REVERSAO_ORFÃOS] Reversão de {total_revertidos} pontos órfãos para BRUTO concluída.")
        return total_revertidos

    except Exception as e:
        logger.error(f"[REVERSAO_ORFÃOS] Erro ao reverter rovers para bruto: {e}")
        raise e

