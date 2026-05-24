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
