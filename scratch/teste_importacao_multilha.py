import os
import sys
import json
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
    print("[*] INICIANDO TESTE DE IMPORTAÇÃO MULTILHA E MULTIARQUIVO EM LOTE")
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

    # 1. Inserir dados iniciais (RT, Propriedade, Levantamento, Matrículas)
    execute_query("""
        INSERT INTO profissionais (nome, registro, codigo_credenciado) 
        VALUES ('Eng. Thiago Silva', 'CREA-PR 12345', 'TSB')
    """, commit=True)
    prof_id = execute_query("SELECT id FROM profissionais LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO propriedades (nome_propriedade, municipio, uf) 
        VALUES ('Fazenda Sol Nascente', 'Cascavel', 'PR')
    """, commit=True)
    prop_id = execute_query("SELECT id FROM propriedades LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) 
        VALUES (?, ?, '2026-06-22', 'EM_ANDAMENTO')
    """, params=(prop_id, prof_id), commit=True)
    lev_id = execute_query("SELECT id FROM levantamentos LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) 
        VALUES (?, '1001', 12.5)
    """, params=(prop_id,), commit=True)
    mat_id_1 = execute_query("SELECT id FROM matriculas WHERE numero_matricula = '1001'", fetch_one=True)['id']

    execute_query("""
        INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) 
        VALUES (?, '1002', 8.2)
    """, params=(prop_id,), commit=True)
    mat_id_2 = execute_query("SELECT id FROM matriculas WHERE numero_matricula = '1002'", fetch_one=True)['id']

    print(f"[*] Configurado levantamento {lev_id} com matrículas {mat_id_1} (1001) e {mat_id_2} (1002)")

    # 2. Criar payloads de arquivos de texto fictícios para teste
    # Arquivo 1: arq1.txt
    # O conteúdo contém pontos válidos com o padrão de código credenciado 'TSB'
    content_arq1 = b"""
    TSB-M-0001
    TSB-P-0002
    TSB-V-0003
    TSB-M-0001
    """

    # Arquivo 2: arq2.csv
    content_arq2 = b"""
    TSB-M-0004
    TSB-P-0005
    TSB-V-0006
    TSB-M-0004
    """

    # 3. Testar a rota de análise para cada arquivo
    print("[*] Testando endpoint de análise (/analisar-planilha-abas) para arq1.txt...")
    res_analise_1 = client.post(
        f"/levantamentos/{lev_id}/analisar-planilha-abas",
        files={"file": ("arq1.txt", content_arq1, "text/plain")}
    )
    assert res_analise_1.status_code == 200
    data_1 = res_analise_1.json()
    assert data_1["sucesso"] is True
    assert len(data_1["abas"]) == 1
    assert data_1["abas"][0]["nome"] == "Arquivo Único"
    # TSB-M-0001, TSB-P-0002, TSB-V-0003, TSB-M-0001 (desduplicação é no backend da importação, aqui conta todas as ocorrências na regex)
    print(f"[+] Análise 1 OK: {data_1['abas'][0]['qtd_pontos']} marcos detectados.")

    print("[*] Testando endpoint de análise (/analisar-planilha-abas) para arq2.csv...")
    res_analise_2 = client.post(
        f"/levantamentos/{lev_id}/analisar-planilha-abas",
        files={"file": ("arq2.csv", content_arq2, "text/csv")}
    )
    assert res_analise_2.status_code == 200
    data_2 = res_analise_2.json()
    assert data_2["sucesso"] is True
    assert len(data_2["abas"]) == 1
    assert data_2["abas"][0]["nome"] == "Arquivo Único"
    print(f"[+] Análise 2 OK: {data_2['abas'][0]['qtd_pontos']} marcos detectados.")

    # 4. Testar a rota de importação em lote
    print("[*] Testando endpoint de importação em lote (/importar-pontos-aprovados-lote)...")
    
    # Criar mapeamento:
    # arq1.txt#Arquivo Único -> mat_id_1 (1001)
    # arq2.csv#Arquivo Único -> mat_id_2 (1002)
    mapeamento_dict = {
        f"arq1.txt#Arquivo Único": mat_id_1,
        f"arq2.csv#Arquivo Único": mat_id_2
    }
    mapeamento_str = json.dumps(mapeamento_dict)

    # Preparar chamada multipart/form-data com múltiplos files
    res_lote = client.post(
        f"/levantamentos/{lev_id}/importar-pontos-aprovados-lote",
        params={"mapeamento": mapeamento_str},
        files=[
            ("files", ("arq1.txt", content_arq1, "text/plain")),
            ("files", ("arq2.csv", content_arq2, "text/csv"))
        ]
    )

    if res_lote.status_code != 200:
        print("[!] Erro na requisição de lote:", res_lote.status_code)
        print(res_lote.text)
        assert False

    data_lote = res_lote.json()
    assert data_lote["sucesso"] is True
    print(f"[+] Sucesso: {data_lote['mensagem']}")
    print(f"[+] Pontos Importados: {data_lote['pontos_importados']}")
    print(f"[+] Pontos Adicionados ao Banco: {data_lote['pontos_adicionados']}")

    # 5. Fazer asserções no banco de dados
    # Verificar pontos na tabela banco_pontos
    pontos_banco = execute_query("SELECT id, matricula_id, codigo_completo, planilha_origem FROM banco_pontos")
    print(f"[*] Pontos no Banco de Pontos ({len(pontos_banco)}):")
    for pt in pontos_banco:
        print(f"    - ID {pt['id']} | Matrícula {pt['matricula_id']} | Código {pt['codigo_completo']} | Planilha {pt['planilha_origem']}")
    
    # Deve haver 3 pontos únicos para arq1.txt (M-0001, P-0002, V-0003) e 3 para arq2.csv (M-0004, P-0005, V-0006)
    assert len(pontos_banco) == 6

    # Verificar pontos da tabela pontos (do levantamento/matriculas)
    pontos_projeto = execute_query("SELECT id, matricula_id, nome_vertice, ordem_caminhamento, status_ponto, arquivo_origem FROM pontos")
    print(f"[*] Pontos no Projeto ({len(pontos_projeto)}):")
    for pt in pontos_projeto:
        print(f"    - ID {pt['id']} | Matrícula {pt['matricula_id']} | Vértice {pt['nome_vertice']} | Ordem {pt['ordem_caminhamento']} | Status {pt['status_ponto']} | Origem {pt['arquivo_origem']}")
    
    assert len(pontos_projeto) == 6
    for pt in pontos_projeto:
        assert pt['status_ponto'] == 'BRUTO' # Como é arquivo texto simples, vira BRUTO
        if pt['matricula_id'] == mat_id_1:
            assert pt['arquivo_origem'] == 'arq1.txt' # Nome de salvamento para txt é o proprio filename
        else:
            assert pt['arquivo_origem'] == 'arq2.csv'

    # Verificar segmentos da matrícula 1
    seg_1 = execute_query("SELECT id, ponto_inicio_id, ponto_fim_id FROM segmentos WHERE matricula_id = ?", params=(mat_id_1,))
    print(f"[*] Segmentos Matrícula 1 ({len(seg_1)}):")
    # P1 -> P2, P2 -> P3, P3 -> P1 (3 segmentos)
    assert len(seg_1) == 3

    # Verificar segmentos da matrícula 2
    seg_2 = execute_query("SELECT id, ponto_inicio_id, ponto_fim_id FROM segmentos WHERE matricula_id = ?", params=(mat_id_2,))
    print(f"[*] Segmentos Matrícula 2 ({len(seg_2)}):")
    assert len(seg_2) == 3

    # Limpar banco de testes
    if db_test_path.exists():
        os.remove(db_test_path)
    print("[*] Banco de testes limpo.")
    print("=" * 60)
    print("[+] TODOS OS TESTES PASSARAM COM SUCESSO!")
    print("=" * 60)

if __name__ == "__main__":
    run_test()
