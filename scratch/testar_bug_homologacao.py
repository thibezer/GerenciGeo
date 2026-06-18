import os
import sys
from pathlib import Path

# Ativa o modo de teste para usar o banco de dados temporário gerencigeo_test.db
os.environ["GERENCIGEO_TEST"] = "1"

# Ajusta path para importar módulos do projeto
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from api import app
from fastapi.testclient import TestClient

def run_test():
    print("=" * 60)
    print("[*] INICIANDO TESTE DE CORREÇÃO DO BUG DE IMPORTAÇÃO DE PONTOS HOMOLOGADOS")
    print("=" * 60)

    from config import DB_PATH
    db_test_path = Path(DB_PATH)
    
    if db_test_path.exists():
        try:
            os.remove(db_test_path)
        except Exception as e:
            print(f"[!] Erro ao remover banco de testes antigo: {e}")

    print("[*] Criando banco de testes e DDL...")
    with DatabaseManager() as conn:
        create_tables(conn)

    client = TestClient(app)

    # Inserir Responsável Técnico com o código credenciado compatível com o ODS
    # Vamos verificar primeiro qual código credenciado está no ODS. "TSB" ou "TEST" ou outro?
    # No Norte Corre.ODS, o código do credenciado deve coincidir com o do profissional do levantamento.
    # Vamos usar "TSB" ou "TEST", ou podemos simplesmente ler o profissional criado.
    # Vamos cadastrar um profissional com código "TSB" (que costuma ser Thiago Silva Bezerra ou similar)
    # ou podemos colocar um código de credenciado genérico e depois ver.
    # No Norte Corre.ODS, o profissional cadastrado provavelmente tem código "GJT" ou "TSB".
    # Vamos criar um profissional de teste com código "GJT" e outro com "TSB" para garantir.
    execute_query("""
        INSERT INTO profissionais (nome, registro, codigo_credenciado) 
        VALUES ('Eng. Thiago Silva', 'CREA-PR 12345', 'GJT')
    """, commit=True)
    prof_id = execute_query("SELECT id FROM profissionais LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO propriedades (nome_propriedade, municipio, uf) 
        VALUES ('Fazenda Primavera', 'Guarapuava', 'PR')
    """, commit=True)
    prop_id = execute_query("SELECT id FROM propriedades LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) 
        VALUES (?, 'Matricula_Ativa_Teste', 50.0)
    """, params=(prop_id,), commit=True)
    mat_id = execute_query("SELECT id FROM matriculas WHERE numero_matricula = 'Matricula_Ativa_Teste'", fetch_one=True)['id']

    execute_query("""
        INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) 
        VALUES (?, ?, '2026-06-18', 'EM_ANDAMENTO')
    """, params=(prop_id, prof_id), commit=True)
    lev_id = execute_query("SELECT id FROM levantamentos LIMIT 1", fetch_one=True)['id']

    # Caminho do ODS
    ods_path = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) / "Norte Corre.ODS"
    
    if not ods_path.exists():
        print(f"[!] Arquivo ODS não encontrado em: {ods_path}")
        return

    # Vamos descobrir qual é o código credenciado contido no arquivo ODS
    # Para isso, podemos ler temporariamente o ODS usando zipfile (como a API faz) para achar o código.
    import zipfile
    import xml.etree.ElementTree as ET
    import re

    codigo_credenciado_detectado = None
    try:
        with zipfile.ZipFile(ods_path) as zip_ref:
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
                        for row in rows:
                            cells = row.findall('.//table:table-cell', ns)
                            for cell in cells:
                                p_elements = cell.findall('.//text:p', ns)
                                cell_text = "".join([p.text for p in p_elements if p.text]).strip()
                                match = re.match(r"^([A-Z]{3,4})-(M|P|V)-\d+$", cell_text, re.IGNORECASE)
                                if match:
                                    codigo_credenciado_detectado = match.group(1).upper()
                                    break
                            if codigo_credenciado_detectado:
                                break
                    if codigo_credenciado_detectado:
                        break
    except Exception as e_zip:
        print(f"[!] Erro ao inspecionar zip: {e_zip}")

    if codigo_credenciado_detectado:
        print(f"[*] Código credenciado detectado no ODS: {codigo_credenciado_detectado}")
        execute_query("UPDATE profissionais SET codigo_credenciado = ? WHERE id = ?", params=(codigo_credenciado_detectado, prof_id), commit=True)
    else:
        print("[!] Não foi possível detectar o código credenciado automaticamente, mantendo 'GJT'")
        codigo_credenciado_detectado = 'GJT'

    print(f"[*] Importando pontos homologados do arquivo: {ods_path.name}...")
    with open(ods_path, 'rb') as f:
        files = {'file': (ods_path.name, f, 'application/vnd.oasis.opendocument.spreadsheet')}
        response = client.post(
            f"/levantamentos/{lev_id}/importar-pontos-aprovados?matricula_id={mat_id}",
            files=files
        )

    print(f"Status da Resposta: {response.status_code}")
    print("Corpo da Resposta:")
    try:
        print(response.json())
    except:
        print(response.text)

    # Validando os dados no banco
    if response.status_code == 200:
        db_pontos = execute_query("SELECT COUNT(*) as count FROM pontos WHERE levantamento_id = ?", params=(lev_id,), fetch_one=True)['count']
        db_confrontantes = execute_query("SELECT COUNT(*) as count FROM confrontantes WHERE levantamento_id = ?", params=(lev_id,), fetch_one=True)['count']
        db_segmentos = execute_query("SELECT COUNT(*) as count FROM segmentos WHERE levantamento_id = ?", params=(lev_id,), fetch_one=True)['count']
        
        print(f"Resultados no banco de dados:")
        print(f" - Pontos importados na tabela pontos: {db_pontos}")
        print(f" - Confrontantes inseridos: {db_confrontantes}")
        print(f" - Segmentos criados: {db_segmentos}")
        
        if db_pontos > 0 and db_confrontantes > 0 and db_segmentos > 0:
            print("\n[SUCESSO] O teste foi executado com exito! O bug da coluna 'matricula_imovel' foi corrigido e a importacao de pontos homologados funcionou perfeitamente.")
        else:
            print("\n[FALHA] A importacao nao preencheu as tabelas devidamente.")
    else:
        print("\n[FALHA] O endpoint de importacao falhou.")

    if db_test_path.exists():
        try:
            os.remove(db_test_path)
            print("[*] Banco de testes temporário removido.")
        except Exception as e:
            print(f"[!] Não foi possível remover o banco de testes temporário: {e}")

if __name__ == "__main__":
    run_test()
