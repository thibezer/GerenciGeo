import os
import sys
import shutil
from pathlib import Path
from fastapi import HTTPException

# Ativa o modo de teste para usar o banco de dados temporário gerencigeo_test.db
os.environ["GERENCIGEO_TEST"] = "1"

# Ajusta path para importar módulos do projeto
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from api import app  # Importa a instância da API FastAPI para usar com TestClient
from fastapi.testclient import TestClient

def format_status(success: bool) -> str:
    return "✅ [SUCESSO]" if success else "❌ [FALHA]"

def run_tests():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

    print("=" * 60)
    print("[*] INICIANDO TESTES DE MATRÍCULAS E TRAVA DE COLD STORAGE")
    print("=" * 60)

    # Inicialização do banco de testes isolado
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

    # Carga de dados inicial comum (Profissional, Cliente, Propriedade)
    execute_query("""
        INSERT INTO profissionais (nome, registro, codigo_credenciado) 
        VALUES ('Eng. Thiago Silva', 'CREA-PR 12345', 'TSB')
    """, commit=True)
    prof_id = execute_query("SELECT id FROM profissionais LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO clientes (nome_completo, cpf_cnpj, estado_civil) 
        VALUES ('Carlos Proprietario', '42857708300', 'Solteiro')
    """, commit=True)
    cli_id = execute_query("SELECT id FROM clientes LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO propriedades (nome_propriedade, municipio, uf) 
        VALUES ('Fazenda Primavera', 'Guarapuava', 'PR')
    """, commit=True)
    prop_id = execute_query("SELECT id FROM propriedades LIMIT 1", fetch_one=True)['id']

    print("\n--- TESTE 1: Deleção de Matrícula e Integridade Relacional ---")
    t1_ok = True

    # 1.1 Criar uma matrícula
    execute_query("""
        INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) 
        VALUES (?, 'Matricula_A_101', 120.5)
    """, params=(prop_id,), commit=True)
    mat_id = execute_query("SELECT id FROM matriculas WHERE numero_matricula = 'Matricula_A_101'", fetch_one=True)['id']

    # 1.2 Criar um levantamento
    execute_query("""
        INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) 
        VALUES (?, ?, '2026-05-19', 'EM_ANDAMENTO')
    """, params=(prop_id, prof_id), commit=True)
    lev_id = execute_query("SELECT id FROM levantamentos LIMIT 1", fetch_one=True)['id']

    # 1.3 Adicionar pontos vinculados à matrícula
    execute_query("""
        INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt)
        VALUES (?, ?, 'M-01', 'M', -24.12, -47.56, 800.0)
    """, params=(lev_id, mat_id), commit=True)
    pt_1_id = execute_query("SELECT id FROM pontos WHERE nome_vertice = 'M-01'", fetch_one=True)['id']

    execute_query("""
        INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt)
        VALUES (?, ?, 'P-02', 'P', -24.13, -47.57, 798.0)
    """, params=(lev_id, mat_id), commit=True)
    pt_2_id = execute_query("SELECT id FROM pontos WHERE nome_vertice = 'P-02'", fetch_one=True)['id']

    # 1.4 Adicionar confrontante e segmento
    execute_query("""
        INSERT INTO confrontantes (levantamento_id, nome)
        VALUES (?, 'Vizinho A')
    """, params=(lev_id,), commit=True)
    conf_id = execute_query("SELECT id FROM confrontantes LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef)
        VALUES (?, ?, ?, ?, ?, 'LA2', 'MC1')
    """, params=(lev_id, mat_id, pt_1_id, pt_2_id, conf_id), commit=True)

    # 1.5 Deletar a matrícula
    print("[*] Deletando matrícula ID:", mat_id)
    execute_query("DELETE FROM matriculas WHERE id = ?", params=(mat_id,), commit=True)

    # 1.6 Verificar impacto nos pontos (Devem ter matricula_id = NULL devido ao ON DELETE SET NULL)
    pontos = execute_query("SELECT id, matricula_id, nome_vertice FROM pontos", fetch_all=True)
    print(f"Pontos após exclusão da matrícula: {len(pontos)} (Esperado: 2, com matricula_id = None)")
    if len(pontos) != 2:
        t1_ok = False
    else:
        for pt in pontos:
            print(f" - Ponto {pt['nome_vertice']} | matricula_id: {pt['matricula_id']}")
            if pt['matricula_id'] is not None:
                t1_ok = False

    # 1.7 Verificar impacto nos segmentos (Devem ter sido deletados em cascata due to ON DELETE CASCADE)
    segmentos_count = execute_query("SELECT COUNT(*) as count FROM segmentos", fetch_one=True)['count']
    print(f"Segmentos após exclusão da matrícula: {segmentos_count} (Esperado: 0)")
    if segmentos_count != 0:
        t1_ok = False

    print(f"Resultado Teste 1: {format_status(t1_ok)}")

    print("\n--- TESTE 2: Trava de Cold Storage (Arquivado -> HTTP 403) ---")
    t2_ok = True

    # 2.1 Criar novo levantamento ativo
    execute_query("""
        INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) 
        VALUES (?, ?, '2026-06-12', 'EM_ANDAMENTO')
    """, params=(prop_id, prof_id), commit=True)
    lev_ativo_id = execute_query("SELECT id FROM levantamentos ORDER BY id DESC LIMIT 1", fetch_one=True)['id']

    # Criar uma matrícula válida para este levantamento ativo
    execute_query("""
        INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) 
        VALUES (?, 'Matricula_Ativa_Teste', 50.0)
    """, params=(prop_id,), commit=True)
    mat_ativa_id = execute_query("SELECT id FROM matriculas WHERE numero_matricula = 'Matricula_Ativa_Teste'", fetch_one=True)['id']

    # 2.2 Criar um ponto no levantamento ativo via API
    payload_ponto = {
        "matricula_id": mat_ativa_id,
        "nome_vertice": "M-02",
        "tipo_ponto": "M",
        "lat": -24.15,
        "lon": -47.60,
        "alt": 801.0
    }
    
    # 2.3 Simular escrita no levantamento ativo (sucesso esperado)
    url_ponto = f"/levantamentos/{lev_ativo_id}/pontos"
    print(f"[*] Inserindo ponto no Levantamento Ativo {lev_ativo_id}...")
    res_p1 = client.post(url_ponto, json=payload_ponto)
    print(f"Status post: {res_p1.status_code} | Resposta: {res_p1.json() if res_p1.status_code == 200 else res_p1.text}")
    if res_p1.status_code != 200 or "error" in res_p1.json():
        t2_ok = False
        
    ponto_criado_id = execute_query("SELECT id FROM pontos WHERE nome_vertice = 'M-02'", fetch_one=True)['id']

    # 2.4 Alterar o status do levantamento para ARQUIVADO
    print(f"[*] Arquivando Levantamento {lev_ativo_id}...")
    execute_query("UPDATE levantamentos SET status = 'ARQUIVADO' WHERE id = ?", params=(lev_ativo_id,), commit=True)

    # 2.5 Tentar atualizar o ponto via API (Deve retornar HTTP 403 Forbidden devido à trava de cold storage)
    print(f"[*] Tentando ATUALIZAR ponto no Levantamento Arquivado (Deve falhar com 403)...")
    payload_ponto_up = payload_ponto.copy()
    payload_ponto_up["nome_vertice"] = "M-02-ALT"
    
    res_up = client.put(f"/pontos/{ponto_criado_id}", json=payload_ponto_up)
    print(f"Status put (esperado 403): {res_up.status_code}")
    print(f"Resposta: {res_up.text}")
    if res_up.status_code != 403:
        t2_ok = False

    # 2.6 Tentar DELETAR o ponto via API (Deve retornar HTTP 403 Forbidden)
    print(f"[*] Tentando DELETAR ponto no Levantamento Arquivado (Deve falhar com 403)...")
    res_del = client.delete(f"/pontos/{ponto_criado_id}")
    print(f"Status delete (esperado 403): {res_del.status_code}")
    if res_del.status_code != 403:
        t2_ok = False

    # 2.7 Verificar se uma violação foi gravada no log de auditoria de segurança
    violation_logs = execute_query("SELECT * FROM logs_auditoria_seguranca WHERE levantamento_id = ?", params=(lev_ativo_id,), fetch_all=True)
    print(f"Logs de tentativa de violação gravados: {len(violation_logs)} (Esperado: >= 1)")
    if len(violation_logs) < 1:
        t2_ok = False
    else:
        for log in violation_logs:
            print(f" - Violação: Rota {log['rota']} | Método {log['metodo']} | Horário: {log['timestamp']}")

    print(f"Resultado Teste 2: {format_status(t2_ok)}")

    print("\n" + "=" * 60)
    t_global = t1_ok and t2_ok
    print(f"STATUS FINAL DOS TESTES: {format_status(t_global)}")
    print("=" * 60)

    # Remove o banco de testes temporário no final
    if db_test_path.exists():
        print(f"\n[*] Removendo banco de testes temporário ({db_test_path.name})...")
        try:
            os.remove(db_test_path)
            print("[*] Banco de testes removido.")
        except Exception as e:
            print(f"[!] Não foi possível remover o banco de testes temporário: {e}")

if __name__ == "__main__":
    run_tests()
