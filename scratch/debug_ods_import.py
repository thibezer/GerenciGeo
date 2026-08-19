import os
import sys
import zipfile
import re
import xml.etree.ElementTree as ET
from pyproj import Transformer

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import execute_query

import glob

def debug_import():
    path_list = glob.glob("D:/Desenvolvimento/Geo/**/*6715*Fran.ODS", recursive=True)
    if not path_list:
        print("Arquivo ODS nao encontrado!")
        return
    path = path_list[0]

    print(f"Lendo ODS: {path}")
    with open(path, "rb") as f:
        content = f.read()

    codigo_credenciado = "XRXR"
    transformer = Transformer.from_crs("epsg:31982", "epsg:4674", always_xy=True)

    pontos_detetados = []
    try:
        with zipfile.ZipFile(path) as zip_ref:
            if 'content.xml' in zip_ref.namelist():
                xml_data = zip_ref.read('content.xml')
                ns = {
                    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
                    'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
                    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
                }
                root = ET.fromstring(xml_data)
                tables = root.findall('.//table:table', ns)
                for table in tables:
                    table_name = table.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}name') or ""
                    if "perimetro" in table_name.lower():
                        rows = table.findall('.//table:table-row', ns)
                        print(f"Aba encontrada: {table_name}, total de linhas: {len(rows)}")
                        for r_idx, row in enumerate(rows):
                            cells = row.findall('.//table:table-cell', ns)
                            cell_texts = []
                            for cell in cells:
                                repeated = cell.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated')
                                p_elements = cell.findall('.//text:p', ns)
                                cell_text = "".join([p.text for p in p_elements if p.text])
                                
                                count = int(repeated) if repeated else 1
                                if count > 30:
                                    count = 1
                                for _ in range(count):
                                    cell_texts.append(cell_text)
                                    
                            if len(cell_texts) >= 7:
                                vertice = cell_texts[0].strip()
                                match = re.match(r"^([A-Z]{3,4})-(M|P|V)-(\d+)$", vertice, re.IGNORECASE)
                                if match:
                                    tipo = match.group(2).upper()
                                    num = int(match.group(3))
                                    
                                    def parse_num(val):
                                        if not val: return None
                                        try:
                                            return float(val.replace(",", ".").strip())
                                        except:
                                            return None
                                            
                                    este = parse_num(cell_texts[1])
                                    sigma_e = parse_num(cell_texts[2])
                                    norte = parse_num(cell_texts[3])
                                    sigma_n = parse_num(cell_texts[4])
                                    altitude = parse_num(cell_texts[5])
                                    sigma_z = parse_num(cell_texts[6])
                                    
                                    metodo = cell_texts[7].strip() if len(cell_texts) > 7 else ""
                                    tipo_limite = cell_texts[8].strip() if len(cell_texts) > 8 else ""
                                    cns = cell_texts[9].strip() if len(cell_texts) > 9 else ""
                                    matricula_conf = cell_texts[10].strip() if len(cell_texts) > 10 else ""
                                    descritivo = cell_texts[11].strip() if len(cell_texts) > 11 else ""
                                    
                                    lat, lon = None, None
                                    if este and norte:
                                        try:
                                            lon, lat = transformer.transform(este, norte)
                                        except Exception as e_trans:
                                            pass
                                            
                                    pontos_detetados.append({
                                        "tipo_ponto": tipo,
                                        "numero": num,
                                        "codigo_completo": vertice,
                                        "norte": norte,
                                        "este": este,
                                        "altitude": altitude,
                                        "lat": lat,
                                        "lon": lon,
                                        "sigma_n": sigma_n,
                                        "sigma_e": sigma_e,
                                        "sigma_z": sigma_z,
                                        "metodo_posicionamento": metodo,
                                        "tipo_limite": tipo_limite,
                                        "cns_confrontante": cns,
                                        "matricula_confrontante": matricula_conf,
                                        "confrontante_descritivo": descritivo
                                    })
    except Exception as e_zip:
        print(f"Erro no zip: {e_zip}")

    print(f"Total de pontos extraidos do ODS: {len(pontos_detetados)}")
    for p in pontos_detetados:
        print(f" - {p['codigo_completo']}: Lat/Lon ({p['lat']}, {p['lon']})")

if __name__ == "__main__":
    debug_import()
