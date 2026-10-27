"""
tests/test_vertices_virtuais_api.py
Testes de integração para os endpoints de vértices virtuais (PA1/PA2 - INCRA/SIGEF).
"""

import unittest
import uuid
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager

client = TestClient(app)


class TestVerticesVirtuaisAPI(unittest.TestCase):

    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Geodésico Teste', 'CREA 1234', 'ABC')"
            )
            self.prof_id = cursor.lastrowid

            cpf_teste = f"77{uuid.uuid4().int % 1000000000:09d}"
            cursor.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES ('Cliente Virtual', ?)", (cpf_teste,))
            self.pessoa_id = cursor.lastrowid

            cursor.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Faixa de Domínio', 'Campo Grande', 'MS')")
            self.prop_id = cursor.lastrowid

            cursor.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '9901', 50.0)", (self.prop_id,))
            self.mat_id = cursor.lastrowid

            cursor.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-03-01', 'EM_ANDAMENTO')",
                (self.prop_id, self.prof_id)
            )
            self.lev_id = cursor.lastrowid

            # Inserir pontos de apoio para o teste:
            # Eixo: E1 (500000, 7000000) -> E2 (500000, 7001000)
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, e_corrigido, n_corrigido, alt_corrigido, sigma_e, sigma_n, sigma_z, fuso_utm)
                VALUES (?, ?, 'E01', 'P', 500000.0, 7000000.0, 500.0, 0.02, 0.02, 0.03, 22)
                """,
                (self.lev_id, self.mat_id)
            )
            self.e1_id = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, e_corrigido, n_corrigido, alt_corrigido, sigma_e, sigma_n, sigma_z, fuso_utm)
                VALUES (?, ?, 'E02', 'P', 500000.0, 7001000.0, 510.0, 0.02, 0.02, 0.03, 22)
                """,
                (self.lev_id, self.mat_id)
            )
            self.e2_id = cursor.lastrowid

            # Divisa: D1 (500200, 7000500) -> D2 (500100, 7000500)
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, e_corrigido, n_corrigido, alt_corrigido, sigma_e, sigma_n, sigma_z, fuso_utm)
                VALUES (?, ?, 'M01', 'M', 500200.0, 7000500.0, 520.0, 0.015, 0.015, 0.02, 22)
                """,
                (self.lev_id, self.mat_id)
            )
            self.d1_id = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, e_corrigido, n_corrigido, alt_corrigido, sigma_e, sigma_n, sigma_z, fuso_utm)
                VALUES (?, ?, 'M02', 'M', 500100.0, 7000500.0, 510.0, 0.015, 0.015, 0.02, 22)
                """,
                (self.lev_id, self.mat_id)
            )
            self.d2_id = cursor.lastrowid

            conn.commit()

    def tearDown(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM segmentos WHERE levantamento_id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM pontos WHERE levantamento_id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM matriculas WHERE propriedade_id = ?", (self.prop_id,))
            cursor.execute("DELETE FROM levantamentos WHERE id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM propriedades WHERE id = ?", (self.prop_id,))
            cursor.execute("DELETE FROM pessoas WHERE id = ?", (self.pessoa_id,))
            cursor.execute("DELETE FROM profissionais WHERE id = ?", (self.prof_id,))
            conn.commit()

    def test_endpoint_calcular_combo_pa1_pa2(self):
        """Testa o cálculo do combo PA1+PA2 via API."""
        payload = {
            "eixo_inicio_id": self.e1_id,
            "eixo_fim_id": self.e2_id,
            "divisa_inicio_id": self.d1_id,
            "divisa_fim_id": self.d2_id,
            "largura_faixa": 30.0,
            "lado": "DIREITA",
            "nome_vertice": "V01"
        }
        res = client.post(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais/calcular-combo-pa1-pa2",
            json=payload
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data["sucesso"])
        resultado = data["resultado"]

        self.assertEqual(resultado["nome"], "V01")
        self.assertEqual(resultado["tipo_ponto"], "V")
        self.assertEqual(resultado["metodo"], "PA1+PA2")
        self.assertAlmostEqual(resultado["este"], 500030.0, places=2)
        self.assertAlmostEqual(resultado["norte"], 7000500.0, places=2)
        self.assertTrue(resultado["conforme_norma_incra"])

    def test_endpoint_confirmar_vertice_virtual(self):
        """Testa a inserção atômica do vértice virtual no banco de dados."""
        payload_confirmar = {
            "nome_vertice": "V02",
            "este": 500030.0,
            "norte": 7000500.0,
            "altitude": 503.0,
            "sigma_este": 0.02,
            "sigma_norte": 0.02,
            "sigma_altitude": 0.03,
            "sigma_planimetrico": 0.028,
            "metodo": "PA1+PA2",
            "fuso_utm": 22
        }
        res = client.post(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais/confirmar",
            json=payload_confirmar
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data["sucesso"])
        novo_id = data["id"]

        # Verificar se foi inserido no banco com tipo_ponto='V' e status_ponto='CORRIGIDO'
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT nome_vertice, tipo_ponto, status_ponto, e_corrigido, n_corrigido, lat, lon FROM pontos WHERE id = ?",
                (novo_id,)
            )
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "V02")
            self.assertEqual(row[1], "V")
            self.assertEqual(row[2], "CORRIGIDO")
            self.assertAlmostEqual(row[3], 500030.0, places=2)
            self.assertAlmostEqual(row[4], 7000500.0, places=2)
            # Lat/Lon devem ter sido convertidos
            self.assertIsNotNone(row[5])
            self.assertIsNotNone(row[6])


if __name__ == "__main__":
    unittest.main()
