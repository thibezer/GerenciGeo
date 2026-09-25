import unittest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from api import app
from services.gestores.nuvem_sync import (
    _upsert_tabela_local,
    _extrair_dados_locais,
    salvar_sessao,
    limpar_sessao
)
from database.connection import DatabaseManager

class TestNuvemSync(unittest.TestCase):
    def setUp(self):
        limpar_sessao()
        self.client = TestClient(app)

    def tearDown(self):
        limpar_sessao()

    def test_status_endpoint(self):
        """Valida que o endpoint GET /nuvem/status retorna o contrato correto"""
        with patch("routes.nuvem.obter_status_nuvem", new_callable=AsyncMock) as mock_status:
            mock_status.return_value = {
                "online": True,
                "database": "MySQL Conectado",
                "autenticado": True,
                "user": {"email": "admin@gerencigeo.com.br"},
                "last_sync": "25/09/2026 11:00:00"
            }

            res = self.client.get("/nuvem/status")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertIn("online", data)
            self.assertIn("autenticado", data)
            self.assertTrue(data["online"])

    def test_upsert_tabela_local(self):
        """Valida inserção e atualização atômica de registros no SQLite local"""
        with DatabaseManager() as conn:
            # Insere pessoa de teste
            rows = [
                {"id": 9999, "nome": "Cliente Nuvem", "cpf_cnpj": "11122233344"}
            ]
            qtd = _upsert_tabela_local(conn, "pessoas", rows)
            self.assertEqual(qtd, 1)

            # Atualiza a mesma pessoa
            rows_update = [
                {"id": 9999, "nome": "Cliente Nuvem Atualizado", "cpf_cnpj": "11122233344"}
            ]
            qtd_up = _upsert_tabela_local(conn, "pessoas", rows_update)
            self.assertEqual(qtd_up, 1)

            # Verifica se o nome foi atualizado
            cursor = conn.cursor()
            cursor.execute("SELECT nome FROM pessoas WHERE id = 9999")
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "Cliente Nuvem Atualizado")

            # Limpeza
            cursor.execute("DELETE FROM pessoas WHERE id = 9999")
            conn.commit()

    def test_extrair_dados_locais(self):
        """Valida que a extração local lê as tabelas com sucesso em modo leitura"""
        dados = _extrair_dados_locais()
        self.assertIsInstance(dados, dict)
        self.assertIn("pessoas", dados)
        self.assertIn("clientes", dados)
        self.assertIn("propriedades", dados)
        self.assertIn("matriculas", dados)

if __name__ == "__main__":
    unittest.main()
