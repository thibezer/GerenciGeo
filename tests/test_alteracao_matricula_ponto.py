import unittest
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager, execute_query

client = TestClient(app)

class TestAlteracaoMatriculaPonto(unittest.TestCase):
    def setUp(self):
        import uuid
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            # Cria profissional
            cursor.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Engenheiro Teste', 'CREA 1234', 'ABC')")
            self.prof_id = cursor.lastrowid

            # Cria pessoa e cliente com CPF dinâmico
            cpf_teste = f"99{uuid.uuid4().int % 1000000000:09d}"
            cursor.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES ('Cliente Matrículas', ?)", (cpf_teste,))
            self.pessoa_id = cursor.lastrowid

            # Cria propriedade
            cursor.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Teste Matrícula', 'Goiânia', 'GO')")
            self.prop_id = cursor.lastrowid

            # Cria Matrícula 1 e Matrícula 2
            cursor.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '1001', 50.0)", (self.prop_id,))
            self.m1_id = cursor.lastrowid

            cursor.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '1002', 30.0)", (self.prop_id,))
            self.m2_id = cursor.lastrowid

            # Cria levantamento
            cursor.execute("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-01-01', 'EM_ANDAMENTO')", (self.prop_id, self.prof_id))
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

    def test_alteracao_individual_matricula(self):
        # 1. Cria ponto na matrícula 1
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt)
                VALUES (?, ?, 'M-01', 'M', -16.5, -49.2, 800.0)
                """,
                (self.lev_id, self.m1_id)
            )
            pid = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt)
                VALUES (?, ?, 'P-01', 'P', -16.6, -49.3, 800.0)
                """,
                (self.lev_id, self.m1_id)
            )
            p2_id = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, tipo_limite_sigef, metodo_posicionamento_sigef)
                VALUES (?, ?, ?, ?, 'LA-1', 'PG1')
                """,
                (self.lev_id, self.m1_id, pid, p2_id)
            )
            conn.commit()

        # 2. Altera a matrícula do ponto M-01 para Matrícula 2
        res = client.put(f"/pontos/{pid}", json={"matricula_id": self.m2_id})
        self.assertEqual(res.status_code, 200, res.text)

        # Verifica se o ponto agora está na Matrícula 2
        p_row = execute_query("SELECT matricula_id FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        self.assertEqual(p_row['matricula_id'], self.m2_id)

        # Verifica se o segmento órfão na Matrícula 1 foi limpo
        seg_rows = execute_query("SELECT id FROM segmentos WHERE matricula_id = ? AND (ponto_inicio_id = ? OR ponto_fim_id = ?)", params=(self.m1_id, pid, pid), fetch_all=True)
        self.assertEqual(len(seg_rows), 0)

    def test_conflito_unicidade_ao_trocar_matricula(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt) VALUES (?, ?, 'M-DUPL', 'M', -16.5, -49.2, 800.0)",
                (self.lev_id, self.m1_id)
            )
            p1_id = cursor.lastrowid

            cursor.execute(
                "INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt) VALUES (?, ?, 'M-DUPL', 'M', -16.7, -49.4, 800.0)",
                (self.lev_id, self.m2_id)
            )
            conn.commit()

        # Tenta mover P1 para Matrícula 2 (deve falhar com 400 e mensagem amigável de conflito de unicidade)
        res = client.put(f"/pontos/{p1_id}", json={"matricula_id": self.m2_id})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Conflito de unicidade", res.json().get("detail", ""))

    def test_alteracao_em_lote_matricula(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt) VALUES (?, ?, 'P-BATCH1', 'P', -16.1, -49.1, 750.0)",
                (self.lev_id, self.m1_id)
            )
            row_p1_id = cursor.lastrowid

            cursor.execute(
                "INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt) VALUES (?, ?, 'P-BATCH2', 'P', -16.2, -49.2, 750.0)",
                (self.lev_id, self.m1_id)
            )
            row_p2_id = cursor.lastrowid
            conn.commit()

        # Atualiza ambos em lote para Matrícula 2
        payload = {
            "pontos": [
                {"id": row_p1_id, "matricula_id": self.m2_id},
                {"id": row_p2_id, "matricula_id": self.m2_id}
            ]
        }
        res = client.put(f"/levantamentos/{self.lev_id}/pontos/batch", json=payload)
        self.assertEqual(res.status_code, 200, res.text)

        # Verifica ambos na Matrícula 2
        p1 = execute_query("SELECT matricula_id FROM pontos WHERE id = ?", params=(row_p1_id,), fetch_one=True)
        p2 = execute_query("SELECT matricula_id FROM pontos WHERE id = ?", params=(row_p2_id,), fetch_one=True)
        self.assertEqual(p1['matricula_id'], self.m2_id)
        self.assertEqual(p2['matricula_id'], self.m2_id)

if __name__ == "__main__":
    unittest.main()
