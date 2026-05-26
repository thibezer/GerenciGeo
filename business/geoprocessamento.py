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
        epsg_utm = f"319{zona_utm}"  # EPSG para Hemisfério Sul
        
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
