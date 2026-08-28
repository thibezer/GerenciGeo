import sys, os
sys.path.insert(0, os.path.abspath('.'))
import sqlite3
import zipfile, io, xml.etree.ElementTree as ET
from database.models import create_tables
from routes.levantamento.homologacao import persistir_pontos_homologados
from utils.geodesia_parser import extract_codigo_parts, resolver_coordenadas_robust, parse_num_robust

conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

create_tables(conn)

cursor.execute("INSERT INTO pessoas (id, nome) VALUES (1, 'Dono')")
cursor.execute("INSERT INTO clientes (id, pessoa_id) VALUES (1, 1)")
cursor.execute("INSERT INTO propriedades (id, nome_propriedade, municipio, uf) VALUES (1, 'Fazenda', 'Cidade', 'PR')")
cursor.execute("INSERT INTO profissionais (id, nome, registro, codigo_credenciado) VALUES (1, 'Test', '12345', 'XRXR')")
cursor.execute("INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio) VALUES (1, 1, 1, '2026-01-01')")
cursor.execute("INSERT INTO matriculas (id, propriedade_id, numero_matricula) VALUES (10, 1, '1234')")

with open('Arquivos de teste/42859.ods', 'rb') as f:
    content = f.read()

# Pre-populate points in database (some with origem_homologada = 0, some with 1)
cursor.execute("INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, origem_homologada) VALUES (1, 10, 'XRXR-M-0004', 'M', -23.5, -53.4, 350.0, 0)")
cursor.execute("INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, origem_homologada) VALUES (1, 10, 'DB5-P-24225', 'P', -23.5, -53.4, 300.0, 0)")

map_dados = {'42859.ods#perimetro_1': '10'}
filename = '42859.ods'
fuso_utm = 22
id = 1
profissional_id = 1

pontos_processados = {}
limites_processados = {}
ordem_processada = {}
nomes_arquivos = {}

def init_mat(m_id):
    if m_id not in pontos_processados:
        pontos_processados[m_id] = {}
        limites_processados[m_id] = {}
        ordem_processada[m_id] = []
        nomes_arquivos[m_id] = []

with zipfile.ZipFile(io.BytesIO(content)) as zip_ref:
    if 'content.xml' in zip_ref.namelist():
        xml_data = zip_ref.read('content.xml')
        ns = {'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'}
        root = ET.fromstring(xml_data)
        tables = root.findall('.//table:table', ns)
        for table in tables:
            table_name = table.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}name') or ''
            map_key = f'{filename}#{table_name}'
            if map_key in map_dados and map_dados[map_key]:
                mat_id = int(map_dados[map_key])
                init_mat(mat_id)
                nomes_arquivos[mat_id].append(table_name)
                
                rows = table.findall('.//table:table-row', ns)
                for row in rows:
                    cells = row.findall('.//table:table-cell', ns)
                    cell_texts = []
                    for cell in cells:
                        repeated = cell.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated')
                        p_elements = cell.findall('.//text:p', ns)
                        cell_text = ''.join([p.text for p in p_elements if p.text])
                        if not cell_text: cell_text = cell.get('{urn:oasis:names:tc:opendocument:xmlns:office:1.0}value') or ''
                        count = int(repeated) if repeated else 1
                        if count > 30: count = 1
                        cell_texts.extend([cell_text] * count)
                        
                    if len(cell_texts) >= 7:
                        tipo, num, vertice = extract_codigo_parts(cell_texts[0])
                        if vertice:
                            lat, lon, este, norte = resolver_coordenadas_robust(cell_texts[1], cell_texts[3], fuso_utm)
                            if lat is None or lon is None or este is None or norte is None:
                                continue
                            p_data = {
                                'tipo_ponto': tipo, 'numero': num, 'codigo_completo': vertice,
                                'norte': norte, 'este': este, 'altitude': parse_num_robust(cell_texts[5]),
                                'lat': lat, 'lon': lon,
                                'sigma_e': parse_num_robust(cell_texts[2]), 'sigma_n': parse_num_robust(cell_texts[4]), 'sigma_z': parse_num_robust(cell_texts[6]),
                                'metodo_posicionamento': str(cell_texts[7]).strip() if len(cell_texts) > 7 else '', 
                                'tipo_limite': str(cell_texts[8]).strip() if len(cell_texts) > 8 else '',
                                'cns_confrontante': str(cell_texts[9]).strip() if len(cell_texts) > 9 else '', 
                                'matricula_confrontante': str(cell_texts[10]).strip() if len(cell_texts) > 10 else '', 
                                'confrontante_descritivo': str(cell_texts[11]).strip() if len(cell_texts) > 11 else ''
                            }
                            if vertice not in pontos_processados[mat_id]:
                                ordem_processada[mat_id].append(vertice)
                                pontos_processados[mat_id][vertice] = p_data
                            elif p_data['lat'] is not None and pontos_processados[mat_id][vertice]['lat'] is None:
                                pontos_processados[mat_id][vertice].update(p_data)

print(f'Total pontos processados em memoria: {len(pontos_processados[10])}')
print('Primeiro ponto:', ordem_processada[10][0])
print('Ultimo ponto:', ordem_processada[10][-1])

pontos_ordenados = [pontos_processados[10][v] for v in ordem_processada[10]]
nome_planilha = 'perimetro_1'

try:
    qtd = persistir_pontos_homologados(cursor, id, 10, profissional_id, pontos_ordenados, nome_planilha)
    print('persistir_pontos_homologados executou com sucesso! Qtd:', qtd)
except Exception as e:
    print('Erro ao persistir:', type(e), e)
