import os
from pyproj import Transformer
import subprocess

def latlon_to_utm22s(lat, lon):
    """
    Converte coordenadas Latitude/Longitude (WGS84/SIRGAS2000) para UTM Zona 22S (SIRGAS 2000).
    EPSG:4326 -> EPSG:31982
    """
    # Transformer.from_crs(source, target, always_xy=True)
    # always_xy=True garante que a ordem seja (longitude, latitude) -> (easting, northing)
    transformer = Transformer.from_crs("epsg:4326", "epsg:31982", always_xy=True)
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
        # 1. Recupera todos os pontos cadastrados para a matrícula
        query_pontos = """
            SELECT id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, sigma_lat
            FROM pontos
            WHERE levantamento_id = ? AND matricula_id = ?
            ORDER BY id ASC
        """
        rows = execute_query(query_pontos, params=(levantamento_id, matricula_id), fetch_all=True)
        if not rows or len(rows) < 3:
            return {
                "sucesso": False,
                "erro": "A matrícula precisa de pelo menos 3 pontos com coordenadas para ordenar a poligonal."
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
        epsg_utm = f"3198{zona_utm}"  # EPSG para Hemisfério Sul
        
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
    Busca no banco de dados a Base informada (base_id) e, caso ela possua coordenadas corrigidas
    válidas (lat != 0 e status_ponto = 'CORRIGIDO'), calcula o vetor Delta ECEF 3D entre a
    sua UTM original (e_original, n_original, alt_original) e a sua posição corrigida geodésica (lat, lon, alt).
    Em seguida, aplica rigorosamente essa mesma translação cartesiana ECEF tridimensional
    em todos os pontos Rover vinculados àquela base (ponto_base_id = base_id) que estejam no estado 'BRUTO',
    propagando suas incertezas geodésicas e atualizando o status dos rovers para 'CORRIGIDO'.
    Retorna a quantidade de rovers corrigidos em bloco.
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
        
    # Se a base não possuir as originais em UTM (por ex. foi digitada manual), simulamos a partir das coordenadas
    if not base["e_original"] or not base["n_original"]:
        logger.warning(f"[GEOPROCESSAMENTO] A base {base['nome_vertice']} não possui coordenadas originais UTM de campo para referenciar a translação.")
        return 0
        
    # 2. Computa o Vetor de Translação Cartesianas 3D ECEF da Base
    try:
        # A. ECEF da Base Corrigida (SIRGAS 2000)
        x_base_corr, y_base_corr, z_base_corr = geodesic_to_ecef(base["lat"], base["lon"], base["alt"])
        
        # B. ECEF da Base Bruta original de campo
        # Resolve o Fuso UTM com base na longitude da base corrigida
        longitude_base = base["lon"]
        zona_utm = int((longitude_base + 180) / 6) + 1
        epsg_utm = f"3198{zona_utm}"
        
        transformer_to_latlon = Transformer.from_crs(f"epsg:{epsg_utm}", "epsg:4674", always_xy=True)
        lon_bruta_base, lat_bruta_base = transformer_to_latlon.transform(base["e_original"], base["n_original"])
        x_base_bruta, y_base_bruta, z_base_bruta = geodesic_to_ecef(lat_bruta_base, lon_bruta_base, base["alt_original"])
        
        # Vetor Delta ECEF
        delta_x = x_base_corr - x_base_bruta
        delta_y = y_base_corr - y_base_bruta
        delta_z = z_base_corr - z_base_bruta
        
        logger.info(f"[GEOPROCESSAMENTO] Vetor Delta ECEF para Base {base['nome_vertice']}: dX={delta_x:.4f}m, dY={delta_y:.4f}m, dZ={delta_z:.4f}m")
    except Exception as e_ecef:
        logger.error(f"[GEOPROCESSAMENTO] Falha crítica ao calcular vetor Delta ECEF para Base {base['nome_vertice']}: {e_ecef}")
        return 0
        
    # 3. Recupera todos os rovers ativos vinculados a essa Base
    query_rovers = """
        SELECT id, nome_vertice, e_original, n_original, alt_original, sigma_n, sigma_e, sigma_z 
        FROM pontos 
        WHERE levantamento_id = ? AND ponto_base_id = ? AND status_ponto = 'BRUTO'
    """
    rows_rovers = execute_query(query_rovers, params=(levantamento_id, base_id), fetch_all=True)
    if not rows_rovers:
        logger.info(f"[GEOPROCESSAMENTO] Nenhum rover bruto pendente de translação para a Base {base['nome_vertice']}.")
        return 0
        
    rovers = [dict(r) for r in rows_rovers]
    
    # 4. Transla e atualiza em transação atômica
    total_corrigidos = 0
    detalhamento_logs = []
    
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # Incertezas da Base corrigida para propagação
            sig_base_lat = base["sigma_lat"] or 0.0
            sig_base_lon = base["sigma_lon"] or 0.0
            sig_base_alt = base["sigma_alt"] or 0.0
            
            for r in rovers:
                if not r["e_original"] or not r["n_original"]:
                    continue
                    
                # A. Plana Bruta -> Geodésica Bruta
                lon_bruto, lat_bruto = transformer_to_latlon.transform(r["e_original"], r["n_original"])
                # B. Geodésica Bruta -> ECEF Bruta
                x_bruto, y_bruto, z_bruto = geodesic_to_ecef(lat_bruto, lon_bruto, r["alt_original"])
                # C. Translação 3D
                x_corr = x_bruto + delta_x
                y_corr = y_bruto + delta_y
                z_corr = z_bruto + delta_z
                # D. ECEF Corrigida -> Geodésica Corrigida
                lat_corr, lon_corr, alt_corr = ecef_to_geodesic(x_corr, y_corr, z_corr)
                
                # E. Propagação de Incertezas
                sig_lat_prop = math.sqrt((r["sigma_n"] or 0.0)**2 + sig_base_lat**2)
                sig_lon_prop = math.sqrt((r["sigma_e"] or 0.0)**2 + sig_base_lon**2)
                sig_alt_prop = math.sqrt((r["sigma_z"] or 0.0)**2 + sig_base_alt**2)
                
                # F. Atualiza no banco
                cursor.execute(
                    """
                    UPDATE pontos 
                    SET lat = ?, lon = ?, alt = ?, 
                        lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                        sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                        status_ponto = 'CORRIGIDO' 
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
            
        # 5. Registra o evento no Histórico de Campo para transparência absoluta
        if total_corrigidos > 0:
            desc_auditoria = f"Translação ECEF 3D em lote aplicada com sucesso para {total_corrigidos} rovers vinculados à Base {base['nome_vertice']}."
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=levantamento_id,
                tipo_evento="CORRECAO_TRANSLACAO",
                descricao=desc_auditoria,
                dados_detalhados={
                    "base_id": base_id,
                    "base_nome": base["nome_vertice"],
                    "vetor_delta_ecef": {"dX": delta_x, "dY": delta_y, "dZ": delta_z},
                    "rovers_corrigidos": detalhamento_logs
                }
            )
            
        logger.info(f"[GEOPROCESSAMENTO] Translação em bloco concluída. {total_corrigidos} rovers corrigidos com base no PPP de {base['nome_vertice']}.")
    except Exception as e_db:
        logger.error(f"[GEOPROCESSAMENTO] Falha crítica ao persistir rovers corrigidos no banco: {e_db}")
        return 0
        
    return total_corrigidos
