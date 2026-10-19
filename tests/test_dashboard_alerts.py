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

if __name__ == "__main__":
    unittest.main()
