import unittest
import sqlite3
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from services.gestores.cliente_manager import (
    cadastrar_cliente,
    vincular_cliente_propriedade,
    validar_composicao_proprietarios
)

class TestPropriedadeClientesUnicidade(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)

    def setUp(self):
        self.client = TestClient(app)
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM propriedade_clientes")
            cursor.execute("DELETE FROM clientes")
            cursor.execute("DELETE FROM pessoas")
            cursor.execute("DELETE FROM propriedades")
            cursor.execute("DELETE FROM profissionais")
            
            cursor.execute("""
                INSERT INTO profissionais (nome, registro, codigo_credenciado)
                VALUES ('Agrimensor Teste', 'CREA 12345', 'TEST')
            """)
            self.prof_id = cursor.lastrowid

            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, municipio, uf)
                VALUES ('Fazenda Santa Maria', 'Cascavel', 'PR')
            """)
            self.prop_id = cursor.lastrowid
            conn.commit()

        # Cadastra 3 clientes de teste com CPFs válidos
        res1 = cadastrar_cliente({
            "nome_completo": "João da Silva",
            "cpf_cnpj": "78612659191",
            "tipo_pessoa": "PF",
            "profissional_id": self.prof_id
        })
        self.assertNotIn("error", res1)
        self.cli1_id = res1["id"]

        res2 = cadastrar_cliente({
            "nome_completo": "Maria da Silva",
            "cpf_cnpj": "90378697501",
            "tipo_pessoa": "PF",
            "profissional_id": self.prof_id
        })
        self.assertNotIn("error", res2)
        self.cli2_id = res2["id"]

        res3 = cadastrar_cliente({
            "nome_completo": "Carlos da Silva",
            "cpf_cnpj": "39601739114",
            "tipo_pessoa": "PF",
            "profissional_id": self.prof_id
        })
        self.assertNotIn("error", res3)
        self.cli3_id = res3["id"]

    def test_01_restricao_unique_banco_dados(self):
        """Verifica se o banco de dados rejeita inserção duplicada direta com IntegrityError."""
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (?, ?, ?)",
                (self.prop_id, self.cli1_id, 50.0)
            )
            conn.commit()

            # Segunda inserção direta com mesma propriedade e mesmo cliente deve disparar IntegrityError
            with self.assertRaises(sqlite3.IntegrityError):
                cursor.execute(
                    "INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (?, ?, ?)",
                    (self.prop_id, self.cli1_id, 50.0)
                )
                conn.commit()

    def test_02_composicao_completa_100_porcento(self):
        """Testa vinculação de 3 coproprietários totalizando 100%."""
        r1 = vincular_cliente_propriedade(self.prop_id, self.cli1_id, 50.0)
        self.assertNotIn("error", r1)

        r2 = vincular_cliente_propriedade(self.prop_id, self.cli2_id, 30.0)
        self.assertNotIn("error", r2)

        r3 = vincular_cliente_propriedade(self.prop_id, self.cli3_id, 20.0)
        self.assertNotIn("error", r3)

        comp = validar_composicao_proprietarios(self.prop_id)
        self.assertTrue(comp["completo"])
        self.assertEqual(comp["soma_percentual"], 100.0)
        self.assertEqual(comp["percentual_restante"], 0.0)
        self.assertEqual(comp["status"], "COMPLETO")
        self.assertEqual(comp["total_proprietarios"], 3)

    def test_03_bloqueio_soma_excedente(self):
        """Testa rejeição quando a soma das participações ultrapassa 100%."""
        vincular_cliente_propriedade(self.prop_id, self.cli1_id, 50.0)
        vincular_cliente_propriedade(self.prop_id, self.cli2_id, 30.0)

        # Tentativa de vincular terceiro cliente com 30% (50 + 30 + 30 = 110%)
        r_excesso = vincular_cliente_propriedade(self.prop_id, self.cli3_id, 30.0)
        self.assertIn("error", r_excesso)
        self.assertIn("Restante disponível: 20.00%", r_excesso["error"])

    def test_04_atualizacao_idempotente_mesmo_cliente(self):
        """Testa que chamar vincular_cliente_propriedade para cliente já existente atualiza a participação sem duplicar."""
        vincular_cliente_propriedade(self.prop_id, self.cli1_id, 50.0)
        
        # Atualiza a participação do João de 50% para 60%
        r_up = vincular_cliente_propriedade(self.prop_id, self.cli1_id, 60.0)
        self.assertNotIn("error", r_up)
        self.assertEqual(r_up["message"], "Participação do proprietário atualizada com sucesso")

        # Verifica se há apenas 1 registro na tabela
        rows = execute_query(
            "SELECT count(*) as qtd FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ?",
            params=(self.prop_id, self.cli1_id),
            fetch_one=True
        )
        self.assertEqual(rows["qtd"], 1)

    def test_05_endpoint_validar_proprietarios(self):
        """Testa o endpoint REST GET /propriedades/{prop_id}/validar-proprietarios."""
        vincular_cliente_propriedade(self.prop_id, self.cli1_id, 50.0)
        vincular_cliente_propriedade(self.prop_id, self.cli2_id, 30.0)

        res = self.client.get(f"/propriedades/{self.prop_id}/validar-proprietarios")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data["completo"])
        self.assertEqual(data["soma_percentual"], 80.0)
        self.assertEqual(data["percentual_restante"], 20.0)
        self.assertEqual(data["status"], "INCOMPLETO")

        # Completa com os 20% restantes
        vincular_cliente_propriedade(self.prop_id, self.cli3_id, 20.0)
        res_comp = self.client.get(f"/propriedades/{self.prop_id}/validar-proprietarios")
        self.assertEqual(res_comp.status_code, 200)
        data_comp = res_comp.json()
        self.assertTrue(data_comp["completo"])
        self.assertEqual(data_comp["status"], "COMPLETO")

if __name__ == "__main__":
    unittest.main()
