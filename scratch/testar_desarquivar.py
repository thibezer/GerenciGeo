import sys
from pathlib import Path
from fastapi.testclient import TestClient

# Adiciona o diretório raiz ao path do python
sys.path.append(str(Path(__file__).resolve().parents[1]))

from api import app
from database.connection import execute_query

def main():
    client = TestClient(app)

    print("--- INICIANDO TESTE DE DESARQUIVAMENTO E TRANCA READ-ONLY ---")

    # 1. Criar um levantamento de teste arquivado no banco
    # Vamos primeiro inserir uma propriedade de teste
    try:
        prop_id = execute_query(
            "INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES (?, ?, ?)",
            params=("Propriedade de Teste ReadOnly", "Cascavel", "PR"),
            commit=True
        )
        # Se for SQLite, execute_query pode retornar o lastrowid se implementado, ou pegamos o max(id)
        if not prop_id:
            row = execute_query("SELECT max(id) as max_id FROM propriedades", fetch_one=True)
            prop_id = row["max_id"]
        
        print(f"Propriedade de teste criada com ID: {prop_id}")

        # Criar profissional de teste se não houver
        row_prof = execute_query("SELECT id FROM profissionais LIMIT 1", fetch_one=True)
        if row_prof:
            prof_id = row_prof["id"]
        else:
            prof_id = execute_query(
                "INSERT INTO profissionais (nome, registro) VALUES (?, ?)",
                params=("Profissional de Teste", "CREA 12345/D"),
                commit=True
            )
            if not prof_id:
                row = execute_query("SELECT max(id) as max_id FROM profissionais", fetch_one=True)
                prof_id = row["max_id"]
        print(f"Profissional utilizado ID: {prof_id}")

        # Inserir o levantamento com status ARQUIVADO
        lev_id = execute_query(
            "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, ?, ?)",
            params=(prop_id, prof_id, "2026-06-09", "ARQUIVADO"),
            commit=True
        )
        if not lev_id:
            row = execute_query("SELECT max(id) as max_id FROM levantamentos", fetch_one=True)
            lev_id = row["max_id"]
        print(f"Levantamento de teste criado com ID: {lev_id} e status ARQUIVADO")

        # 2. Testar que uma alteração normal (PUT) é BLOQUEADA pelo middleware (HTTP 403)
        print("\nTestando bloqueio de escrita (PUT) em levantamento arquivado...")
        payload_put = {
            "propriedade_id": prop_id,
            "profissional_id": prof_id,
            "data_inicio": "2026-06-09",
            "status": "CONCLUIDO"
        }
        res_put = client.put(f"/levantamentos/{lev_id}", json=payload_put)
        print(f"Resultado do PUT: Status Code {res_put.status_code}")
        print(f"Resposta do PUT: {res_put.text}")
        assert res_put.status_code == 403, f"Esperado status 403, obtido {res_put.status_code}"
        assert "Tranca de Segurança Read-Only ativa" in res_put.text, "Mensagem da tranca não encontrada na resposta"
        print("-> Sucesso: A tentativa de alteração direta foi bloqueada com 403!")

        # 3. Testar a rota de desarquivamento (POST /levantamentos/{id}/desarquivar)
        print("\nTestando desarquivamento (POST /desarquivar)...")
        payload_desarquivar = {
            "justificativa": "Justificativa de teste homologada pelo motor geodésico"
        }
        res_desarquivar = client.post(f"/levantamentos/{lev_id}/desarquivar", json=payload_desarquivar)
        print(f"Resultado do desarquivamento: Status Code {res_desarquivar.status_code}")
        print(f"Resposta do desarquivamento: {res_desarquivar.text}")
        assert res_desarquivar.status_code == 200, f"Esperado status 200, obtido {res_desarquivar.status_code}"
        print("-> Sucesso: Rota /desarquivar executou com sucesso (200)!")

        # 4. Verificar se o status mudou para EM_ANDAMENTO e o log foi gravado no banco de dados
        print("\nVerificando persistência no banco de dados pós-desarquivamento...")
        row_lev_pos = execute_query("SELECT status FROM levantamentos WHERE id = ?", params=(lev_id,), fetch_one=True)
        print(f"Status atual do levantamento no banco: {row_lev_pos['status']}")
        assert row_lev_pos['status'] == "EM_ANDAMENTO", f"Esperado status EM_ANDAMENTO, obtido {row_lev_pos['status']}"

        row_log = execute_query(
            "SELECT * FROM logs_auditoria_seguranca WHERE levantamento_id = ? AND rota LIKE '%/desarquivar%'",
            params=(lev_id,),
            fetch_one=True
        )
        assert row_log is not None, "Log de auditoria do desarquivamento não foi encontrado!"
        print(f"Log de Auditoria correspondente encontrado no banco:")
        print(f"  Rota registrada: {row_log['rota']}")
        print(f"  Método: {row_log['metodo']}")
        print(f"  Usuário: {row_log['usuario']}")
        print("-> Sucesso: Banco atualizado e log de segurança registrado!")

        print("\n--- TODOS OS TESTES PASSARAM COM SUCESSO! ---")

    finally:
        # Limpar o banco de dados
        print("\nLimpando registros de teste do banco de dados...")
        if 'lev_id' in locals():
            execute_query("DELETE FROM logs_auditoria_seguranca WHERE levantamento_id = ?", params=(lev_id,), commit=True)
            execute_query("DELETE FROM levantamentos WHERE id = ?", params=(lev_id,), commit=True)
        if 'prop_id' in locals():
            execute_query("DELETE FROM propriedades WHERE id = ?", params=(prop_id,), commit=True)
        print("Limpeza concluída.")

if __name__ == "__main__":
    main()
