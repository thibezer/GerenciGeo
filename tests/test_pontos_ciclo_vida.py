import unittest
import math
import uuid
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager, execute_query

client = TestClient(app)

class TestPontosCicloVida(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Engenheiro Geodesista', 'CREA 9988', 'XYZ')")
            self.prof_id = cursor.lastrowid

            cpf_teste = f"88{uuid.uuid4().int % 1000000000:09d}"
            cursor.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES ('Proprietário Glebas', ?)", (cpf_teste,))
            self.pessoa_id = cursor.lastrowid

            cursor.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Santa Cruz', 'Jataí', 'GO')")
            self.prop_id = cursor.lastrowid

            cursor.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '5501', 120.0)", (self.prop_id,))
            self.m1_id = cursor.lastrowid

            cursor.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '5502', 85.0)", (self.prop_id,))
            self.m2_id = cursor.lastrowid

            cursor.execute("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-02-01', 'EM_ANDAMENTO')", (self.prop_id, self.prof_id))
            self.lev_id = cursor.lastrowid
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

    def test_schema_colunas_ciclo_vida_presentes(self):
        """Verifica se todas as colunas canônicas da V3.0 existem na tabela pontos"""
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(pontos)")
            colunas = {row[1] for row in cursor.fetchall()}

            obrigatorias = [
                "camada_ciclo_vida", "n_corrigido", "e_corrigido",
                "fuso_utm", "hemisferio", "delta_n", "delta_e",
                "delta_h", "delta_3d", "codigo_sigef", "ponto_origem_id"
            ]
            for col in obrigatorias:
                self.assertIn(col, colunas, f"Coluna '{col}' ausente no schema da tabela pontos")

    def test_patch_ponto_atomico_e_calculo_deltas(self):
        """Testa o endpoint PATCH /pontos/{pid} calculando deltas milimétricos instantaneamente"""
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO pontos (
                    levantamento_id, matricula_id, nome_vertice, tipo_ponto,
                    lat, lon, alt, n_original, e_original, alt_original,
                    fuso_utm, hemisferio
                ) VALUES (?, ?, 'M-01', 'M', -17.88, -51.72, 750.0, 7400000.0, 500000.0, 750.0, 22, 'S')
                """,
                (self.lev_id, self.m1_id)
            )
            pid = cursor.lastrowid
            conn.commit()

        # Altera N em +25mm (0.025m) e E em -12mm (-0.012m)
        payload = {
            "n_corrigido": 7400000.025,
            "e_corrigido": 499999.988,
            "alt_corrigido": 750.005,
            "codigo_sigef": "XYZ-M-0001"
        }
        resp = client.patch(f"/pontos/{pid}", json=payload)
        self.assertEqual(resp.status_code, 200, resp.text)
        dados = resp.json()
        self.assertTrue(dados.get("success"))
        ponto = dados.get("ponto")
        self.assertIsNotNone(ponto)

        # Valida deltas no retorno e no banco
        self.assertAlmostEqual(ponto["delta_n"], 25.0, places=1)
        self.assertAlmostEqual(ponto["delta_e"], -12.0, places=1)
        self.assertAlmostEqual(ponto["delta_h"], 5.0, places=1)
        expected_3d = round(math.sqrt(25.0**2 + (-12.0)**2 + 5.0**2), 2)
        self.assertAlmostEqual(ponto["delta_3d"], expected_3d, places=1)
        self.assertEqual(ponto["codigo_sigef"], "XYZ-M-0001")

    def test_transicoes_camada_ciclo_vida(self):
        """Testa as transições automáticas de camada: CAMPO -> PERIMETRO -> CAMPO"""
        # 1. Ponto avulso sem matrícula deve ser CAMPO
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt)
                VALUES (?, NULL, 'P-01', 'P', -17.88, -51.72, 750.0)
                """,
                (self.lev_id,)
            )
            pid = cursor.lastrowid
            conn.commit()

        p_inicial = execute_query("SELECT camada_ciclo_vida FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        self.assertEqual(p_inicial["camada_ciclo_vida"], "CAMPO")

        # 2. Ao vincular à matrícula 1, transiciona para PERIMETRO
        resp_vinc = client.patch(f"/pontos/{pid}", json={"matricula_id": self.m1_id})
        self.assertEqual(resp_vinc.status_code, 200)
        p_vinc = execute_query("SELECT camada_ciclo_vida FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        self.assertEqual(p_vinc["camada_ciclo_vida"], "PERIMETRO")

        # 3. Ao marcar ignorar_poligono = 1, volta para CAMPO
        resp_ign = client.patch(f"/pontos/{pid}", json={"ignorar_poligono": 1})
        self.assertEqual(resp_ign.status_code, 200)
        p_ign = execute_query("SELECT camada_ciclo_vida FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        self.assertEqual(p_ign["camada_ciclo_vida"], "CAMPO")

    def test_analise_duplicatas_e_sobreposicoes(self):
        """Testa o endpoint de detecção de pontos sobrepostos e duplicatas de nome"""
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            # Ponto 1
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, n_corrigido, e_corrigido)
                VALUES (?, ?, 'V-01', 'P', -17.88, -51.72, 750.0, 7400000.0, 500000.0)
                """,
                (self.lev_id, self.m1_id)
            )
            # Ponto 2 a apenas 2 cm (0.02m) de distância
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, n_corrigido, e_corrigido)
                VALUES (?, ?, 'V-01_RTK', 'P', -17.88, -51.72, 750.0, 7400000.015, 500000.010)
                """,
                (self.lev_id, self.m1_id)
            )
            # Ponto 3 a 50 metros de distância
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, n_corrigido, e_corrigido)
                VALUES (?, ?, 'V-02', 'P', -17.88, -51.72, 750.0, 7400050.0, 500000.0)
                """,
                (self.lev_id, self.m1_id)
            )
            conn.commit()

        resp = client.get(f"/levantamentos/{self.lev_id}/pontos/analise-duplicatas?tolerancia_metros=0.05")
        self.assertEqual(resp.status_code, 200, resp.text)
        dados = resp.json()
        self.assertTrue(dados.get("sucesso"))
        self.assertEqual(dados.get("total_sobreposicoes"), 1)
        self.assertGreaterEqual(len(dados.get("sobreposicoes", [])), 1)

        grupo = dados["sobreposicoes"][0]
        self.assertIn("distancia_maxima_m", grupo)
        self.assertLessEqual(grupo["distancia_maxima_m"], 0.05)

    def test_vincular_ponto_matricula_mover_e_compartilhar(self):
        """Testa o endpoint de movimentação e compartilhamento de vértices entre matrículas"""
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, n_corrigido, e_corrigido)
                VALUES (?, ?, 'M-10', 'M', -17.88, -51.72, 750.0, 7400100.0, 500100.0)
                """,
                (self.lev_id, self.m1_id)
            )
            pid = cursor.lastrowid
            conn.commit()

        # 1. Compartilhar vértice com a Matrícula 2
        payload_comp = {
            "ponto_id": pid,
            "matricula_id": self.m2_id,
            "modo": "compartilhar"
        }
        resp_comp = client.post(f"/levantamentos/{self.lev_id}/pontos/vincular-matricula", json=payload_comp)
        self.assertEqual(resp_comp.status_code, 200, resp_comp.text)
        dados_comp = resp_comp.json()
        self.assertTrue(dados_comp.get("sucesso"))
        novo_id = dados_comp.get("ponto_id")
        self.assertNotEqual(novo_id, pid)

        # Confirma que o ponto compartilhado aponta para o original via ponto_origem_id
        novo_pt = execute_query("SELECT matricula_id, ponto_origem_id, nome_vertice FROM pontos WHERE id = ?", params=(novo_id,), fetch_one=True)
        self.assertEqual(novo_pt["matricula_id"], self.m2_id)
        self.assertEqual(novo_pt["ponto_origem_id"], pid)
        self.assertEqual(novo_pt["nome_vertice"], "M-10")

        # 2. Mover o ponto original para sem matrícula
        payload_mov = {
            "ponto_id": pid,
            "matricula_id": None,
            "modo": "mover"
        }
        resp_mov = client.post(f"/levantamentos/{self.lev_id}/pontos/vincular-matricula", json=payload_mov)
        self.assertEqual(resp_mov.status_code, 200, resp_mov.text)
        pt_mov = execute_query("SELECT matricula_id, camada_ciclo_vida FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        self.assertIsNone(pt_mov["matricula_id"])
        self.assertEqual(pt_mov["camada_ciclo_vida"], "CAMPO")

    def test_filtro_pontos_por_camada(self):
        """Testa o query param 'camada' em GET /levantamentos/{id}/pontos"""
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            # Ponto de Campo
            cursor.execute(
                "INSERT INTO pontos (levantamento_id, nome_vertice, tipo_ponto, lat, lon, alt, camada_ciclo_vida) VALUES (?, 'P_CAMPO', 'P', -17.88, -51.72, 750.0, 'CAMPO')",
                (self.lev_id,)
            )
            # Ponto de Perímetro
            cursor.execute(
                "INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, camada_ciclo_vida) VALUES (?, ?, 'P_PERIM', 'M', -17.88, -51.72, 750.0, 'PERIMETRO')",
                (self.lev_id, self.m1_id)
            )
            # Ponto Homologado
            cursor.execute(
                "INSERT INTO pontos (levantamento_id, nome_vertice, tipo_ponto, lat, lon, alt, camada_ciclo_vida, origem_homologada) VALUES (?, 'P_HOMOLOG', 'M', -17.88, -51.72, 750.0, 'HOMOLOGADO', 1)",
                (self.lev_id,)
            )
            # Ponto Vizinho
            cursor.execute(
                "INSERT INTO pontos (levantamento_id, nome_vertice, tipo_ponto, lat, lon, alt, camada_ciclo_vida, ponto_vizinho) VALUES (?, 'P_VIZ', 'V', -17.88, -51.72, 750.0, 'VIZINHO', 1)",
                (self.lev_id,)
            )
            conn.commit()

        # Filtrar CAMPO
        r_campo = client.get(f"/levantamentos/{self.lev_id}/pontos?camada=CAMPO")
        self.assertEqual(r_campo.status_code, 200)
        nomes_campo = [p["nome_vertice"] for p in r_campo.json()]
        self.assertEqual(nomes_campo, ["P_CAMPO"])

        # Filtrar PERIMETRO
        r_perim = client.get(f"/levantamentos/{self.lev_id}/pontos?camada=PERIMETRO")
        self.assertEqual(r_perim.status_code, 200)
        nomes_perim = [p["nome_vertice"] for p in r_perim.json()]
        self.assertEqual(nomes_perim, ["P_PERIM"])

        # Filtrar TODOS
        r_todos = client.get(f"/levantamentos/{self.lev_id}/pontos?camada=TODOS")
        self.assertEqual(r_todos.status_code, 200)
        nomes_todos = [p["nome_vertice"] for p in r_todos.json()]
        self.assertEqual(len(nomes_todos), 4)

if __name__ == '__main__':
    unittest.main()
