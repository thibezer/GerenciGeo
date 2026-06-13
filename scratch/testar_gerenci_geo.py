import os
import shutil
import sys
from pathlib import Path

# Ativa o modo de teste para usar o banco de dados temporário gerencigeo_test.db
os.environ["GERENCIGEO_TEST"] = "1"

# Ajusta path para importar módulos do projeto
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from business.workspace_manager import WorkspaceManager

def testar_tudo():
    print(">>> Iniciando Validação Física do Novo Escopo do GerenciGeo...")

    # Inicialização do banco de testes isolado
    from config import DB_PATH
    db_test_path = Path(DB_PATH)
    
    if db_test_path.exists():
        try:
            os.remove(db_test_path)
        except Exception as e:
            print(f"[!] Erro ao remover banco de testes antigo: {e}")

    # 2. Inicializa Tabelas
    print("[BD] Criando novas tabelas DDL...")
    with DatabaseManager() as conn:
        create_tables(conn)
    print("[BD] Tabelas DDL criadas com sucesso!")

    # 3. Massa de Teste Relacional (Propriedade -> Matrículas -> Levantamento -> Pontos & Segmentos)
    print("[BD] Inserindo massa de dados de teste...")
    
    # Profissional
    execute_query("""
        INSERT INTO profissionais (nome, registro, codigo_credenciado) 
        VALUES ('Eng. Thiago Silva', 'CREA-PR 12345', 'TSB')
    """, commit=True)
    prof_id = execute_query("SELECT id FROM profissionais LIMIT 1", fetch_one=True)['id']
    
    # Proprietário (Cliente)
    execute_query("""
        INSERT INTO clientes (nome_completo, cpf_cnpj, estado_civil) 
        VALUES ('Carlos Proprietario', '11122233344', 'Casado')
    """, commit=True)
    cli_id = execute_query("SELECT id FROM clientes LIMIT 1", fetch_one=True)['id']
    
    # Propriedade (CAR)
    execute_query("""
        INSERT INTO propriedades (nome_propriedade, codigo_car, municipio, uf) 
        VALUES ('Fazenda Primavera', 'BR1234567890', 'Guarapuava', 'PR')
    """, commit=True)
    prop_id = execute_query("SELECT id FROM propriedades LIMIT 1", fetch_one=True)['id']
    
    # Vinculo Propriedade-Cliente
    execute_query("""
        INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) 
        VALUES (?, ?, 100.0)
    """, params=(prop_id, cli_id), commit=True)
    
    # Duas Matrículas sob a Propriedade
    execute_query("""
        INSERT INTO matriculas (propriedade_id, numero_matricula, ccir, itr, area_ha) 
        VALUES (?, 'Matricula_A_101', 'CCIR-999', 'ITR-888', 120.5)
    """, params=(prop_id,), commit=True)
    
    execute_query("""
        INSERT INTO matriculas (propriedade_id, numero_matricula, ccir, itr, area_ha) 
        VALUES (?, 'Matricula_B_102', 'CCIR-998', 'ITR-887', 85.2)
    """, params=(prop_id,), commit=True)
    
    mat_a_id = execute_query("SELECT id FROM matriculas WHERE numero_matricula = 'Matricula_A_101'", fetch_one=True)['id']
    mat_b_id = execute_query("SELECT id FROM matriculas WHERE numero_matricula = 'Matricula_B_102'", fetch_one=True)['id']

    # Levantamento (Campanha)
    execute_query("""
        INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) 
        VALUES (?, ?, '2026-05-19', 'EM_ANDAMENTO')
    """, params=(prop_id, prof_id), commit=True)
    lev_id = execute_query("SELECT id FROM levantamentos LIMIT 1", fetch_one=True)['id']

    # 4. Criação Física de Workspace e Injeção do JSON
    print("[WORKSPACE] Criando estrutura de pastas...")
    wm = WorkspaceManager()
    pasta_projeto = wm.create_workspace(lev_id)
    print(f"[WORKSPACE] Pasta criada: {pasta_projeto}")
    
    # Atualiza pasta_projeto no BD
    execute_query("UPDATE levantamentos SET pasta_projeto = ? WHERE id = ?", params=(pasta_projeto, lev_id), commit=True)
    
    print("[WORKSPACE] Injetando metadados DADOS_GERAIS.json...")
    wm.gerar_documento_cliente_workspace(lev_id)
    
    caminho_json = Path(pasta_projeto) / "Documentos" / "DADOS_GERAIS.json"
    if caminho_json.exists():
        print(f"[WORKSPACE] DADOS_GERAIS.json criado com sucesso em: {caminho_json}")
    else:
        print("[WORKSPACE] FALHA: DADOS_GERAIS.json não foi gerado.")

    # 5. Inserção de Pontos vinculados às Matrículas específicas
    print("[BD] Inserindo pontos geodésicos...")
    # Ponto da Matrícula A
    execute_query("""
        INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento)
        VALUES (?, ?, 'M-0100', 'M', -24.1234, -47.5678, 800.5, 0.02, 0.02, 0.05, 1)
    """, params=(lev_id, mat_a_id), commit=True)
    
    # Ponto da Matrícula B
    execute_query("""
        INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento)
        VALUES (?, ?, 'P-0200', 'P', -24.1255, -47.5699, 798.2, 0.01, 0.01, 0.03, 2)
    """, params=(lev_id, mat_b_id), commit=True)
    
    pt_1_id = execute_query("SELECT id FROM pontos WHERE nome_vertice = 'M-0100'", fetch_one=True)['id']
    pt_2_id = execute_query("SELECT id FROM pontos WHERE nome_vertice = 'P-0200'", fetch_one=True)['id']

    # 6. Confrontantes e Segmentos
    print("[BD] Inserindo confrontantes e segmentos...")
    execute_query("""
        INSERT INTO confrontantes (levantamento_id, nome, cpf_cnpj, tipo_relacao)
        VALUES (?, 'Jose Confrontante', '22233344455', 'Vizinho de Cerca')
    """, params=(lev_id,), commit=True)
    conf_id = execute_query("SELECT id FROM confrontantes LIMIT 1", fetch_one=True)['id']
    
    execute_query("""
        INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef)
        VALUES (?, ?, ?, ?, ?, 'LA2', 'MC1')
    """, params=(lev_id, mat_a_id, pt_1_id, pt_2_id, conf_id), commit=True)
    
    # 7. Teste de INTEGRIDADE REFERENCIAL (ON DELETE CASCADE)
    print("[INTEGRIDADE] Testando deleção do levantamento (ON DELETE CASCADE)...")
    execute_query("DELETE FROM levantamentos WHERE id = ?", params=(lev_id,), commit=True)
    
    # Verifica se pontos, confrontantes e segmentos foram apagados
    pontos_restantes = execute_query("SELECT COUNT(*) as count FROM pontos", fetch_one=True)['count']
    confrontantes_restantes = execute_query("SELECT COUNT(*) as count FROM confrontantes", fetch_one=True)['count']
    segmentos_restantes = execute_query("SELECT COUNT(*) as count FROM segmentos", fetch_one=True)['count']
    
    print(f"[INTEGRIDADE] Pontos órfãos restantes: {pontos_restantes} (esperado: 0)")
    print(f"[INTEGRIDADE] Confrontantes órfãos restantes: {confrontantes_restantes} (esperado: 0)")
    print(f"[INTEGRIDADE] Segmentos órfãos restantes: {segmentos_restantes} (esperado: 0)")
    
    if pontos_restantes == 0 and confrontantes_restantes == 0 and segmentos_restantes == 0:
        print(">>> VALIDAÇÃO FÍSICA E RELACIONAL COMPLETA E BEM-SUCEDIDA! <<<")
    else:
        print(">>> AVISO: Alguma falha de integridade foi identificada! <<<")

    # Remove o banco de testes temporário no final
    if db_test_path.exists():
        print(f"\n[*] Removendo banco de testes temporário ({db_test_path.name})...")
        try:
            os.remove(db_test_path)
            print("[*] Banco de testes removido.")
        except Exception as e:
            print(f"[!] Não foi possível remover o banco de testes temporário: {e}")

if __name__ == "__main__":
    testar_tudo()
