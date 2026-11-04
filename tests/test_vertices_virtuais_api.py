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


    def test_offset_lote_com_nomes_duplicados_e_desambiguacao(self):
        """
        Garante que ao calcular ou confirmar vértices virtuais quando já existem
        pontos com nomes idênticos na mesma matrícula, o sistema desambigua sem lançar
        erro de constraint UNIQUE.
        """
        # 1. Insere primeiro lote com V-01 e V-02
        payload_1 = {
            "fuso_utm": 22,
            "vertices": [
                {
                    "nome_vertice": "V-01",
                    "este": 500010.0,
                    "norte": 7000000.0,
                    "altitude": 500.0,
                    "sigma_este": 0.02,
                    "sigma_norte": 0.02,
                    "sigma_altitude": 0.03,
                    "sigma_planimetrico": 0.03,
                    "metodo": "PA1"
                },
                {
                    "nome_vertice": "V-02",
                    "este": 500020.0,
                    "norte": 7000000.0,
                    "altitude": 500.0,
                    "sigma_este": 0.02,
                    "sigma_norte": 0.02,
                    "sigma_altitude": 0.03,
                    "sigma_planimetrico": 0.03,
                    "metodo": "PA1"
                }
            ]
        }
        res1 = client.post(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais/confirmar-lote",
            json=payload_1
        )
        self.assertEqual(res1.status_code, 200, res1.text)

        # 2. Testa o cálculo do próximo lote: deve sugerir V-03 e V-04 automaticamente
        res_calc = client.post(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais/calcular-offset-lote",
            json={
                "ponto_ids": [self.e1_id, self.e2_id],
                "distancia": 10.0,
                "lado": "DIREITA",
                "prefixo_nome": "V"
            }
        )
        self.assertEqual(res_calc.status_code, 200, res_calc.text)
        data_calc = res_calc.json()
        self.assertEqual(data_calc["resultados"][0]["nome"], "V-03")
        self.assertEqual(data_calc["resultados"][1]["nome"], "V-04")

        # 3. Testa confirmar com nomes que colidem propositalmente (ex: cliente reenvia 'V-01')
        payload_colidente = {
            "fuso_utm": 22,
            "vertices": [
                {
                    "nome_vertice": "V-01", # Já existe! Deve desambiguar para V-03 ou próximo livre
                    "este": 500030.0,
                    "norte": 7000000.0,
                    "altitude": 500.0,
                    "sigma_este": 0.02,
                    "sigma_norte": 0.02,
                    "sigma_altitude": 0.03,
                    "sigma_planimetrico": 0.03,
                    "metodo": "PA1"
                },
                {
                    "nome_vertice": "V-01", # Duplicado dentro do próprio lote!
                    "este": 500040.0,
                    "norte": 7000000.0,
                    "altitude": 500.0,
                    "sigma_este": 0.02,
                    "sigma_norte": 0.02,
                    "sigma_altitude": 0.03,
                    "sigma_planimetrico": 0.03,
                    "metodo": "PA1"
                }
            ]
        }
        res2 = client.post(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais/confirmar-lote",
            json=payload_colidente
        )
        # Não pode dar erro 500 com UNIQUE constraint failed!
        self.assertEqual(res2.status_code, 200, res2.text)
        data2 = res2.json()
        self.assertEqual(data2["total_inseridos"], 2)

        # 4. Verifica no banco que todos têm nomes únicos
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT nome_vertice FROM pontos WHERE levantamento_id = ? AND matricula_id = ? AND tipo_ponto = 'V'",
                (self.lev_id, self.mat_id)
            )
            nomes = [row[0] for row in cursor.fetchall()]
            self.assertEqual(len(nomes), 4)
            self.assertEqual(len(set(nomes)), 4, f"Deveria ter 4 nomes distintos: {nomes}")


    def test_offset_lote_validacoes_seguranca(self):
        """Garante que fuso inválido ou matrícula que não pertence ao levantamento são rejeitados."""
        # 1. Matrícula inexistente / de outro levantamento
        res_mat = client.post(
            f"/levantamentos/{self.lev_id}/matriculas/999999/vertices-virtuais/calcular-offset-lote",
            json={
                "ponto_ids": [self.e1_id, self.e2_id],
                "distancia": 10.0,
                "lado": "DIREITA"
            }
        )
        self.assertEqual(res_mat.status_code, 404)

        # 2. Fuso UTM fora da faixa brasileira (18 a 25)
        res_fuso = client.post(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais/confirmar-lote",
            json={
                "fuso_utm": 99,
                "vertices": [{
                    "nome_vertice": "V-01",
                    "este": 500010.0,
                    "norte": 7000000.0,
                    "altitude": 500.0,
                    "sigma_este": 0.02,
                    "sigma_norte": 0.02,
                    "sigma_altitude": 0.03,
                    "sigma_planimetrico": 0.03,
                    "metodo": "PA1"
                }]
            }
        )
        self.assertEqual(res_fuso.status_code, 400)
        self.assertIn("Fuso UTM inválido", res_fuso.json()["detail"])

    def test_calculo_exige_pontos_do_levantamento(self):
        """PA2 puro e combo recusam pontos/matrícula que não pertencem ao levantamento informado."""
        base = f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais"
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-03-02', 'EM_ANDAMENTO')",
                (self.prop_id, self.prof_id),
            )
            outro_lev = cursor.lastrowid
            cursor.execute(
                "INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, e_corrigido, n_corrigido, alt_corrigido, fuso_utm) VALUES (?, ?, 'X01', 'P', 500300.0, 7000300.0, 500.0, 22)",
                (outro_lev, self.mat_id),
            )
            ponto_alheio = cursor.lastrowid
            cursor.execute(
                "INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, e_corrigido, n_corrigido, alt_corrigido, fuso_utm) VALUES (?, ?, 'F01', 'P', 400000.0, 7000300.0, 500.0, 21)",
                (self.lev_id, self.mat_id),
            )
            ponto_outro_fuso = cursor.lastrowid
            conn.commit()
        try:
            res = client.post(f"{base}/calcular-pa2-puro", json={
                "alinhamento1_inicio_id": self.e1_id, "alinhamento1_fim_id": self.e2_id,
                "alinhamento2_inicio_id": self.d1_id, "alinhamento2_fim_id": ponto_alheio,
            })
            self.assertEqual(res.status_code, 400, res.text)
            self.assertIn("não pertencem", res.json()["detail"])

            res = client.post(f"{base}/calcular-pa2-puro", json={
                "alinhamento1_inicio_id": self.e1_id, "alinhamento1_fim_id": self.e2_id,
                "alinhamento2_inicio_id": self.d1_id, "alinhamento2_fim_id": ponto_outro_fuso,
            })
            self.assertEqual(res.status_code, 400, res.text)
            self.assertIn("fusos UTM diferentes", res.json()["detail"])

            res = client.post(f"{base}/calcular-combo-pa1-pa2", json={
                "eixo_inicio_id": self.e1_id, "eixo_fim_id": self.e2_id,
                "divisa_inicio_id": self.d1_id, "divisa_fim_id": ponto_alheio,
                "largura_faixa": 10.0, "lado": "DIREITA",
            })
            self.assertEqual(res.status_code, 400, res.text)
        finally:
            with DatabaseManager() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM pontos WHERE id IN (?, ?)", (ponto_alheio, ponto_outro_fuso))
                cursor.execute("DELETE FROM levantamentos WHERE id = ?", (outro_lev,))
                conn.commit()

    def test_nome_em_colisao_e_ajustado_na_previa_e_informado_na_gravacao(self):
        """A prévia já devolve o nome livre; a gravação informa renomeios."""
        base = f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/vertices-virtuais"
        res = client.post(f"{base}/calcular-pa2-puro", json={
            "alinhamento1_inicio_id": self.e1_id, "alinhamento1_fim_id": self.e2_id,
            "alinhamento2_inicio_id": self.d1_id, "alinhamento2_fim_id": self.d2_id,
            "nome_vertice": "E01",
        })
        self.assertEqual(res.status_code, 200, res.text)
        self.assertNotEqual(res.json()["resultado"]["nome"].upper(), "E01")

        res = client.post(f"{base}/confirmar-lote", json={
            "fuso_utm": 22,
            "vertices": [{
                "nome_vertice": "E01", "este": 500010.0, "norte": 7000000.0, "altitude": 500.0,
                "sigma_este": 0.02, "sigma_norte": 0.02, "sigma_altitude": 0.03,
                "sigma_planimetrico": 0.03, "metodo": "PA2",
            }],
        })
        self.assertEqual(res.status_code, 200, res.text)
        renomeados = res.json()["renomeados"]
        self.assertEqual(len(renomeados), 1)
        self.assertEqual(renomeados[0]["de"], "E01")

if __name__ == "__main__":
    unittest.main()
