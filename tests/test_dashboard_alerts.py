import unittest
from fastapi.testclient import TestClient
from api import app
from database.connection import execute_query
from database.repository import PendenciaRepo

class TestDashboardAlerts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_dashboard_alerts_retorna_estrutura_completa(self):
        # 1. Cria uma pendência manual com prioridade ALTA
        repo = PendenciaRepo()
        repo.insert(
            titulo="Conferir confrontante da Gleba 4",
            descricao="Verificar certidão de casamento dos confrontantes no cartório",
            status="PENDENTE",
            prioridade="ALTA"
        )

        response = self.client.get("/dashboard/alerts")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("alerts", data)
        self.assertIsInstance(data["alerts"], list)

        # 2. Valida se a pendência manual está presente com formato estruturado
        alert_manual = next((a for a in data["alerts"] if a.get("titulo") == "Conferir confrontante da Gleba 4"), None)
        self.assertIsNotNone(alert_manual)
        self.assertEqual(alert_manual["tipo"], "MANUAL")
        self.assertEqual(alert_manual["prioridade"], "ALTA")
        self.assertIn("acao", alert_manual)
        self.assertEqual(alert_manual["acao"]["tipo"], "concluir")
        self.assertEqual(alert_manual["acao"]["rotulo"], "Concluir")

    def test_concluir_pendencia_via_api(self):
        repo = PendenciaRepo()
        item_id = repo.insert(
            titulo="Tarefa Teste Concluir",
            descricao="Desc",
            status="PENDENTE",
            prioridade="MEDIA"
        )
        if not item_id:
            row = execute_query("SELECT id FROM pendencias WHERE titulo = ? ORDER BY id DESC LIMIT 1",
                                params=("Tarefa Teste Concluir",), fetch_one=True)
            item_id = row["id"]

        resp_concluir = self.client.post(f"/pendencias/{item_id}/concluir")
        self.assertEqual(resp_concluir.status_code, 200)
        # Checa status atualizado
        row_updated = execute_query("SELECT status FROM pendencias WHERE id = ?", params=(item_id,), fetch_one=True)
        self.assertEqual(row_updated["status"], "CONCLUIDO")

    def test_alertas_nao_incluem_projetos_excluidos_ou_arquivados(self):
        # 1. Cria profissional e propriedade base
        prof_res = execute_query(
            "INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Prof Teste Alertas', 'CREA 888', 'ALRT1')",
            commit=True
        )
        prof_row = execute_query("SELECT id FROM profissionais WHERE codigo_credenciado = 'ALRT1'", fetch_one=True)
        prof_id = prof_row['id']

        prop_res = execute_query(
            "INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Teste Alertas', 'Cascavel', 'PR')",
            commit=True
        )
        prop_row = execute_query("SELECT id FROM propriedades WHERE nome_propriedade = 'Fazenda Teste Alertas' ORDER BY id DESC LIMIT 1", fetch_one=True)
        prop_id = prop_row['id']

        # 2. Cria levantamento com status ARQUIVADO e pontos sem PPP
        execute_query(
            "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, pasta_projeto, status) VALUES (?, ?, '2026-01-01', ?, 'ARQUIVADO')",
            params=(prop_id, prof_id, "C:\\pasta_inexistente_arquivada"),
            commit=True
        )
        lev_arq = execute_query("SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'ARQUIVADO'", params=(prop_id,), fetch_one=True)
        execute_query(
            "INSERT INTO pontos (levantamento_id, nome_vertice, tipo_ponto, arquivo_rinex) VALUES (?, 'VT_ARQ_1', 'P', 'obs.24o')",
            params=(lev_arq['id'],),
            commit=True
        )

        # 3. Cria levantamento que será EXCLUÍDO
        execute_query(
            "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, pasta_projeto, status) VALUES (?, ?, '2026-01-01', ?, 'EM_ANDAMENTO')",
            params=(prop_id, prof_id, "C:\\pasta_inexistente_excluido"),
            commit=True
        )
        lev_exc = execute_query("SELECT id FROM levantamentos WHERE pasta_projeto = ?", params=("C:\\pasta_inexistente_excluido",), fetch_one=True)
        execute_query(
            "INSERT INTO pontos (levantamento_id, nome_vertice, tipo_ponto, arquivo_rinex) VALUES (?, 'VT_EXC_1', 'P', 'obs.24o')",
            params=(lev_exc['id'],),
            commit=True
        )
        execute_query(
            "INSERT INTO historico_rinex (arquivo_nome, arquivo_tamanho, arquivo_path, sucesso) VALUES ('teste_falha.gns', 100, 'C:\\pasta_inexistente_excluido\\teste_falha.gns', 0)",
            commit=True
        )
        # Exclui o levantamento
        resp_del = self.client.delete(f"/levantamentos/{lev_exc['id']}")
        self.assertEqual(resp_del.status_code, 200)

        # Garante que historico_rinex da pasta do levantamento também foi limpo
        hr_row = execute_query(
            "SELECT id FROM historico_rinex WHERE arquivo_path LIKE 'C:\\pasta_inexistente_excluido%'",
            fetch_one=True
        )
        self.assertIsNone(hr_row)

        # 4. Chama /dashboard/alerts
        response = self.client.get("/dashboard/alerts")
        self.assertEqual(response.status_code, 200)
        alerts = response.json().get("alerts", [])

        # 5. Garante que nenhum alerta faz referência aos levantamentos arquivados ou excluídos
        for a in alerts:
            msg = a.get("mensagem", "")
            titulo = a.get("titulo", "")
            acao = a.get("acao", {})
            self.assertNotIn(f"#{lev_arq['id']}", msg)
            self.assertNotIn(f"#{lev_exc['id']}", msg)
            self.assertNotEqual(acao.get("levantamento_id"), lev_arq['id'])
            self.assertNotEqual(acao.get("levantamento_id"), lev_exc['id'])
            self.assertNotIn("VT_ARQ_1", titulo)
            self.assertNotIn("VT_EXC_1", titulo)

if __name__ == "__main__":
    unittest.main()
