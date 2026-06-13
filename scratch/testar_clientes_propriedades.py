import os
import sys
from pathlib import Path

# Ativa o modo de teste para usar o banco de dados temporário gerencigeo_test.db
os.environ["GERENCIGEO_TEST"] = "1"

# Ajusta path para importar módulos do projeto
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from business.cliente_manager import ClienteManager, validar_cpf_cnpj
from business.levantamento_manager import (
    cadastrar_cliente,
    atualizar_cliente,
    vincular_cliente_propriedade
)

def format_status(success: bool) -> str:
    return "✅ [SUCESSO]" if success else "❌ [FALHA]"

def run_tests():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    print("=" * 60)
    print("[*] INICIANDO TESTES DO MODULO DE CLIENTES E PROPRIEDADES")
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

    print("\n--- TESTE 1: Validação de CPF/CNPJ ---")
    cpfs_valido = ["42857708300", "37299462001", "84346200222"] # CPF válidos reais
    cpfs_invalido = ["11111111111", "12345678901", "123"]
    cnpjs_valido = ["92537859615882", "11031150044631"] # CNPJ válidos reais
    cnpjs_invalido = ["00000000000000", "12345678901234"]

    t1_ok = True
    for cpf in cpfs_valido:
        res = validar_cpf_cnpj(cpf)
        print(f"CPF Válido {cpf}: {res} (Esperado: True)")
        if not res: t1_ok = False
        
    for cpf in cpfs_invalido:
        res = validar_cpf_cnpj(cpf)
        print(f"CPF Inválido {cpf}: {res} (Esperado: False)")
        if res: t1_ok = False

    for cnpj in cnpjs_valido:
        res = validar_cpf_cnpj(cnpj)
        print(f"CNPJ Válido {cnpj}: {res} (Esperado: True)")
        if not res: t1_ok = False

    for cnpj in cnpjs_invalido:
        res = validar_cpf_cnpj(cnpj)
        print(f"CNPJ Inválido {cnpj}: {res} (Esperado: False)")
        if res: t1_ok = False
        
    print(f"Resultado Teste 1: {format_status(t1_ok)}")

    print("\n--- TESTE 2: Cadastro de Clientes e Heurística de Gênero/Cônjuge ---")
    t2_ok = True
    
    # 2.1 Cadastrar Solteiro Masculino (Sucesso)
    cli_m_solteiro = {
        "nome_completo": "Thiago Silva Teste",
        "cpf_cnpj": "42857708300",
        "rg_ie": "1234567-PR",
        "estado_civil": "Solteiro",
        "sexo": "M",
        "nacionalidade": "brasileiro"
    }
    res_m = cadastrar_cliente(cli_m_solteiro)
    print(f"Cadastrar Solteiro M: {res_m}")
    if "error" in res_m: t2_ok = False
    
    # 2.2 Cadastrar Casada Feminina (Sucesso com Cônjuge)
    cli_f_casada = {
        "nome_completo": "Maria Oliveira Teste",
        "cpf_cnpj": "37299462001",
        "rg_ie": "7654321-PR",
        "estado_civil": "Casada",
        "sexo": "F",
        "nacionalidade": "brasileira",
        "nome_conjuge": "Thiago Silva Teste",
        "cpf_conjuge": "42857708300",
        "rg_conjuge": "1234567-PR",
        "regime_bens": "Comunhão Parcial de Bens"
    }
    res_f = cadastrar_cliente(cli_f_casada)
    print(f"Cadastrar Casada F: {res_f}")
    if "error" in res_f: t2_ok = False

    # 2.3 Cadastrar Casado Masculino Sem Cônjuge (Cria pendência)
    cli_m_casado_sem = {
        "nome_completo": "Carlos Andrade Teste",
        "cpf_cnpj": "84346200222",
        "estado_civil": "Casado",
        "sexo": "M",
        "nacionalidade": "brasileiro"
    }
    res_m_sem = cadastrar_cliente(cli_m_casado_sem)
    print(f"Cadastrar Casado M Sem Cônjuge: {res_m_sem}")
    if "error" in res_m_sem: t2_ok = False
    
    # Verifica pendência atômica gerada
    pendencias = execute_query("SELECT * FROM pendencias WHERE titulo LIKE '%Carlos Andrade Teste%'", fetch_all=True)
    print(f"Pendências geradas para Carlos: {len(pendencias)} (Esperado: 1)")
    if len(pendencias) != 1: t2_ok = False
    else:
        print(f" - Pendência título: {pendencias[0]['titulo']}")
        print(f" - Pendência descrição: {pendencias[0]['descricao']}")

    print(f"Resultado Teste 2: {format_status(t2_ok)}")

    print("\n--- TESTE 3: Histórico de Alterações de Clientes ---")
    t3_ok = True
    
    # Atualiza cliente Solteiro M para Divorciado M e muda telefone
    cli_id_m = res_m["id"]
    cli_m_update = cli_m_solteiro.copy()
    cli_m_update["estado_civil"] = "Divorciado"
    cli_m_update["telefone"] = "42999998888"
    
    res_up = atualizar_cliente(cli_id_m, cli_m_update)
    print(f"Atualizar Cliente M: {res_up}")
    if "error" in res_up: t3_ok = False
    
    # Valida Logs de Histórico inseridos
    logs = execute_query("SELECT * FROM cliente_historico_logs WHERE id_cliente = ? ORDER BY data_alteracao ASC", params=(cli_id_m,), fetch_all=True)
    print(f"Logs de alteração gravados: {len(logs)} (Esperado: 2 - estado_civil e telefone)")
    if len(logs) != 2: t3_ok = False
    else:
        for log in logs:
            print(f" - Campo: {log['campo_alterado']} | Antigo: {log['valor_antigo']} | Novo: {log['valor_novo']}")
            
    print(f"Resultado Teste 3: {format_status(t3_ok)}")

    print("\n--- TESTE 4: Quotas de Copropriedade (Soma = 100%) ---")
    t4_ok = True
    
    # 4.1 Criar uma Propriedade
    execute_query("""
        INSERT INTO propriedades (nome_propriedade, municipio, uf)
        VALUES ('Fazenda Sol Nascente', 'Ponta Grossa', 'PR')
    """, commit=True)
    prop_id = execute_query("SELECT id FROM propriedades LIMIT 1", fetch_one=True)['id']
    
    # 4.2 Vincular Thiago Silva com 60%
    r1 = vincular_cliente_propriedade(prop_id, res_m["id"], 60.0)
    print(f"Vincular Thiago (60%): {r1}")
    if "error" in r1: t4_ok = False
    
    # 4.3 Vincular Maria Oliveira com 30% (Soma = 90%)
    r2 = vincular_cliente_propriedade(prop_id, res_f["id"], 30.0)
    print(f"Vincular Maria (30%): {r2}")
    if "error" in r2: t4_ok = False
    
    # 4.4 Tentar vincular Carlos Andrade com 20% (Soma = 110% - Deve Falhar)
    r3 = vincular_cliente_propriedade(prop_id, res_m_sem["id"], 20.0)
    print(f"Vincular Carlos (20% - Deve falhar): {r3}")
    if "error" not in r3:
        t4_ok = False
    else:
        print(f" - Erro retornado: {r3['error']}")
        # Verifica se o erro menciona o restante disponível (10.00%)
        if "10.00%" not in r3["error"]:
            print("❌ Erro não informou o percentual restante corretamente!")
            t4_ok = False
            
    # 4.5 Vincular Carlos Andrade com 10% (Soma = 100% - Deve dar Sucesso)
    r4 = vincular_cliente_propriedade(prop_id, res_m_sem["id"], 10.0)
    print(f"Vincular Carlos (10%): {r4}")
    if "error" in r4: t4_ok = False
    
    # 4.6 Verificar soma final das participações
    soma_row = execute_query("SELECT SUM(percentual_participacao) as total FROM propriedade_clientes WHERE propriedade_id = ?", params=(prop_id,), fetch_one=True)
    total_percent = soma_row["total"]
    print(f"Soma total da propriedade: {total_percent}% (Esperado: 100.0%)")
    if total_percent != 100.0: t4_ok = False
    
    print(f"Resultado Teste 4: {format_status(t4_ok)}")

    print("\n" + "=" * 60)
    t_global = t1_ok and t2_ok and t3_ok and t4_ok
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
