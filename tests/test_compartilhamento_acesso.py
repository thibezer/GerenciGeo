import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from api import app
from database.connection import DatabaseManager, execute_query

client = TestClient(app)


class TestCompartilhamentoAcesso(unittest.TestCase):
    """Link do cliente: validade, PIN e revogação (espelho em frontend/public/api_publico.php)."""

    def setUp(self):
        with DatabaseManager() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Eng Teste', 'CREA 1', 'ABC')")
            self.prof_id = cur.lastrowid
            cur.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Link', 'Jataí', 'GO')")
            self.prop_id = cur.lastrowid
            cur.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-02-01', 'EM_ANDAMENTO')",
                (self.prop_id, self.prof_id))
            self.lev_id = cur.lastrowid
            conn.commit()

    def tearDown(self):
        with DatabaseManager() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM levantamentos WHERE id = ?", (self.lev_id,))
            cur.execute("DELETE FROM propriedades WHERE id = ?", (self.prop_id,))
            cur.execute("DELETE FROM profissionais WHERE id = ?", (self.prof_id,))
            conn.commit()

    def _gerar(self, corpo=None):
        # Sem rede: a publicação direta na Hostinger é tentada e tolerada em caso de falha
        with patch("httpx.Client", side_effect=RuntimeError("sem rede")):
            return client.post(f"/api/levantamentos/{self.lev_id}/compartilhar", json=corpo)

    def test_link_sem_pin_abre_e_nao_vaza_campos_privados(self):
        codigo = self._gerar({"validade_dias": 30}).json()["codigo"]
        r = client.get(f"/api/levantamentos/publico/{codigo}")
        self.assertEqual(r.status_code, 200)
        corpo = r.json()
        self.assertEqual(corpo["nome_propriedade"], "Fazenda Link")
        self.assertNotIn("compartilhamento_pin_hash", corpo)

    def test_pin_exigido_e_validado(self):
        codigo = self._gerar({"validade_dias": 7, "pin": "1234"}).json()["codigo"]
        url = f"/api/levantamentos/publico/{codigo}"
        self.assertEqual(client.get(url).status_code, 401)
        self.assertEqual(client.get(url, headers={"X-Share-Pin": "0000"}).status_code, 401)
        self.assertEqual(client.get(url, headers={"X-Share-Pin": "1234"}).status_code, 200)

        status = client.get(f"/api/levantamentos/{self.lev_id}/compartilhar").json()
        self.assertTrue(status["protegido_por_pin"])

    def test_pin_invalido_e_recusado(self):
        self.assertEqual(self._gerar({"pin": "12"}).status_code, 400)
        self.assertEqual(self._gerar({"pin": "abcd"}).status_code, 400)

    def test_link_expirado_responde_410(self):
        codigo = self._gerar({"validade_dias": 7}).json()["codigo"]
        execute_query(
            "UPDATE levantamentos SET compartilhamento_expira_em = '2020-01-01T00:00:00+00:00' WHERE id = ?",
            params=(self.lev_id,), commit=True)
        self.assertEqual(client.get(f"/api/levantamentos/publico/{codigo}").status_code, 410)

    def test_revogar_invalida_o_link(self):
        codigo = self._gerar({"validade_dias": 0}).json()["codigo"]
        self.assertEqual(client.delete(f"/api/levantamentos/{self.lev_id}/compartilhar").status_code, 200)
        self.assertEqual(client.get(f"/api/levantamentos/publico/{codigo}").status_code, 404)
        self.assertFalse(client.get(f"/api/levantamentos/{self.lev_id}/compartilhar").json()["ativo"])

    def test_remover_pin_com_string_vazia(self):
        codigo = self._gerar({"pin": "4321"}).json()["codigo"]
        self._gerar({"pin": ""})
        self.assertEqual(client.get(f"/api/levantamentos/publico/{codigo}").status_code, 200)


if __name__ == "__main__":
    unittest.main()
