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

    def test_endpoint_calcular_offset_lote(self):
        """Testa o cálculo analítico de offset em lote via endpoint."""
        payload = {
            "ponto_ids": [self.e1_id, self.e2_id],
            "distancia": 15.0,
            "lado": "DIREITA",
            "prefixo_nome": "VT"
        }
        res = client.post(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais/calcular-offset-lote",
            json=payload
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data["sucesso"])
        self.assertEqual(data["total"], 2)
        resultados = data["resultados"]
        self.assertEqual(resultados[0]["nome"], "VT-01")
        self.assertEqual(resultados[1]["nome"], "VT-02")
        self.assertAlmostEqual(resultados[0]["este"], 500015.0, places=2)
        self.assertAlmostEqual(resultados[1]["este"], 500015.0, places=2)
        self.assertEqual(data["fuso_utm"], 22)
        self.assertIn("lat", resultados[0])
        self.assertIn("lon", resultados[0])

    def test_endpoint_offset_usa_posicao_corrigida_e_nao_cache_utm(self):
        """Ponto corrigido depois do cálculo do UTM: o offset parte de lat/lon_corrigido."""
        from services.processamento.utm_corrigido import geodesica_de_utm

        with DatabaseManager() as conn:
            cursor = conn.cursor()
            # Correção posterior moveu o eixo 5 m para leste; e_corrigido ficou com o valor antigo
            for pid, norte in ((self.e1_id, 7000000.0), (self.e2_id, 7001000.0)):
                lat, lon = geodesica_de_utm(500005.0, norte, 22)
                cursor.execute(
                    "UPDATE pontos SET lat_corrigido = ?, lon_corrigido = ? WHERE id = ?",
                    (lat, lon, pid),
                )
            conn.commit()

        res = client.post(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais/calcular-offset-lote",
            json={"ponto_ids": [self.e1_id, self.e2_id], "distancia": 15.0, "lado": "DIREITA"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        for r in res.json()["resultados"]:
            self.assertAlmostEqual(r["este"], 500020.0, places=2)

    def test_endpoint_offset_poligono_fechado(self):
        """Com fechado=True o primeiro e o último vértice também são cantos interceptados."""
        res = client.post(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais/calcular-offset-lote",
            json={
                "ponto_ids": [self.e1_id, self.e2_id, self.d1_id],
                "distancia": 5.0,
                "lado": "DIREITA",
                "fechado": True,
            },
        )
        self.assertEqual(res.status_code, 200, res.text)
        metodos = [r["metodo"] for r in res.json()["resultados"]]
        self.assertEqual(metodos, ["PA1+PA2"] * 3)

    def test_endpoint_confirmar_offset_lote(self):
        """Testa a persistência atômica de lote de vértices virtuais."""
        payload_lote = {
            "fuso_utm": 22,
            "vertices": [
                {
                    "nome_vertice": "VT-01",
                    "este": 500015.0,
                    "norte": 7000000.0,
                    "altitude": 500.0,
                    "sigma_este": 0.028,
                    "sigma_norte": 0.028,
                    "sigma_altitude": 0.03,
                    "sigma_planimetrico": 0.04,
                    "metodo": "PA1"
                },
                {
                    "nome_vertice": "VT-02",
                    "este": 500015.0,
                    "norte": 7001000.0,
                    "altitude": 510.0,
                    "sigma_este": 0.028,
                    "sigma_norte": 0.028,
                    "sigma_altitude": 0.03,
                    "sigma_planimetrico": 0.04,
                    "metodo": "PA1"
                }
            ]
        }
        res = client.post(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais/confirmar-lote",
            json=payload_lote
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data["sucesso"])
        self.assertEqual(data["total_inseridos"], 2)
        ids = data["ids"]

        with DatabaseManager() as conn:
            cursor = conn.cursor()
            for vid in ids:
                cursor.execute(
                    "SELECT tipo_ponto, status_ponto, camada_ciclo_vida, lat, lon FROM pontos WHERE id = ?",
                    (vid,)
                )
                row = cursor.fetchone()
                self.assertIsNotNone(row)
                self.assertEqual(row[0], "V")
                self.assertEqual(row[1], "CORRIGIDO")
                self.assertEqual(row[2], "PERIMETRO")
                self.assertIsNotNone(row[3])
                self.assertIsNotNone(row[4])


if __name__ == "__main__":
    unittest.main()
