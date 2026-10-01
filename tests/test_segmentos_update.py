import unittest
import uuid
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager, execute_query

client = TestClient(app)

class TestSegmentosUpdate(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            # Profissional
            cursor.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Eng Segmento', 'CREA 9999', 'XYZ')")
            self.prof_id = cursor.lastrowid

            # Pessoa e Propriedade
            cpf = f"88{uuid.uuid4().int % 1000000000:09d}"
            cursor.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES ('Dono Fazenda', ?)", (cpf,))
            self.pessoa_id = cursor.lastrowid

            cursor.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Segmentos', 'Jataí', 'GO')")
            self.prop_id = cursor.lastrowid

            cursor.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '9991', 100.0)", (self.prop_id,))
            self.mat_id = cursor.lastrowid

            cursor.execute("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-01-01', 'EM_ANDAMENTO')", (self.prop_id, self.prof_id))
            self.lev_id = cursor.lastrowid

            # Pontos de início e fim
            cursor.execute("INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt) VALUES (?, ?, 'V-01', 'V', -17.1, -51.1, 750.0)", (self.lev_id, self.mat_id))
            self.p1_id = cursor.lastrowid

            cursor.execute("INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt) VALUES (?, ?, 'V-02', 'V', -17.2, -51.2, 755.0)", (self.lev_id, self.mat_id))
            self.p2_id = cursor.lastrowid

            # Confrontante
            cpf_conf = f"77{uuid.uuid4().int % 1000000000:09d}"
            cursor.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES ('Vizinho Teste', ?)", (cpf_conf,))
            self.pessoa_conf_id = cursor.lastrowid

            cursor.execute("INSERT INTO confrontantes (levantamento_id, pessoa_id, matricula_imovel) VALUES (?, ?, '5555')", (self.lev_id, self.pessoa_conf_id))
            self.conf_id = cursor.lastrowid

            # Segmento inicial
            cursor.execute(
                """
                INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, tipo_limite_sigef, metodo_posicionamento_sigef, anuencia_assinada)
                VALUES (?, ?, ?, ?, 'LN1', 'PG1', 0)
                """,
                (self.lev_id, self.mat_id, self.p1_id, self.p2_id)
            )
            self.seg_id = cursor.lastrowid
            conn.commit()

    def tearDown(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM segmentos WHERE levantamento_id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM confrontantes WHERE levantamento_id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM pontos WHERE levantamento_id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM matriculas WHERE propriedade_id = ?", (self.prop_id,))
            cursor.execute("DELETE FROM levantamentos WHERE id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM propriedades WHERE id = ?", (self.prop_id,))
            cursor.execute("DELETE FROM pessoas WHERE id IN (?, ?)", (self.pessoa_id, self.pessoa_conf_id))
            cursor.execute("DELETE FROM profissionais WHERE id = ?", (self.prof_id,))
            conn.commit()

    def test_update_segmento_apenas_confrontante(self):
        # Atualiza apenas confrontante_id
        res = client.put(f"/segmentos/{self.seg_id}", json={"confrontante_id": self.conf_id})
        self.assertEqual(res.status_code, 200, res.text)

        row = execute_query("SELECT confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef, anuencia_assinada FROM segmentos WHERE id = ?", params=(self.seg_id,), fetch_one=True)
        self.assertEqual(row["confrontante_id"], self.conf_id)
        self.assertEqual(row["tipo_limite_sigef"], "LN1")
        self.assertEqual(row["metodo_posicionamento_sigef"], "PG1")

    def test_update_segmento_apenas_limite(self):
        # Atualiza com tipo_limite_sigef
        res = client.put(f"/segmentos/{self.seg_id}", json={"tipo_limite_sigef": "LA1"})
        self.assertEqual(res.status_code, 200, res.text)

        row = execute_query("SELECT tipo_limite_sigef FROM segmentos WHERE id = ?", params=(self.seg_id,), fetch_one=True)
        self.assertEqual(row["tipo_limite_sigef"], "LA1")

        # Atualiza com alias tipo_limite
        res2 = client.put(f"/segmentos/{self.seg_id}", json={"tipo_limite": "LI2"})
        self.assertEqual(res2.status_code, 200, res2.text)

        row2 = execute_query("SELECT tipo_limite_sigef FROM segmentos WHERE id = ?", params=(self.seg_id,), fetch_one=True)
        self.assertEqual(row2["tipo_limite_sigef"], "LI2")

    def test_update_segmento_apenas_posicionamento(self):
        # Atualiza com metodo_posicionamento_sigef
        res = client.put(f"/segmentos/{self.seg_id}", json={"metodo_posicionamento_sigef": "PG2"})
        self.assertEqual(res.status_code, 200, res.text)

        row = execute_query("SELECT metodo_posicionamento_sigef FROM segmentos WHERE id = ?", params=(self.seg_id,), fetch_one=True)
        self.assertEqual(row["metodo_posicionamento_sigef"], "PG2")

        # Atualiza com alias metodo_posicionamento
        res2 = client.put(f"/segmentos/{self.seg_id}", json={"metodo_posicionamento": "PT1"})
        self.assertEqual(res2.status_code, 200, res2.text)

        row2 = execute_query("SELECT metodo_posicionamento_sigef FROM segmentos WHERE id = ?", params=(self.seg_id,), fetch_one=True)
        self.assertEqual(row2["metodo_posicionamento_sigef"], "PT1")

    def test_update_segmento_apenas_anuencia(self):
        # Marca anuência como 1
        res = client.put(f"/segmentos/{self.seg_id}", json={"anuencia_assinada": 1})
        self.assertEqual(res.status_code, 200, res.text)

        row = execute_query("SELECT anuencia_assinada FROM segmentos WHERE id = ?", params=(self.seg_id,), fetch_one=True)
        self.assertEqual(row["anuencia_assinada"], 1)

        # Desmarca anuência para 0
        res2 = client.put(f"/segmentos/{self.seg_id}", json={"anuencia_assinada": 0})
        self.assertEqual(res2.status_code, 200, res2.text)

        row2 = execute_query("SELECT anuencia_assinada FROM segmentos WHERE id = ?", params=(self.seg_id,), fetch_one=True)
        self.assertEqual(row2["anuencia_assinada"], 0)

    def test_update_segmento_via_patch(self):
        # Suporte a PATCH
        res = client.patch(f"/segmentos/{self.seg_id}", json={"tipo_limite_sigef": "LA1", "anuencia_assinada": 1})
        self.assertEqual(res.status_code, 200, res.text)

        row = execute_query("SELECT tipo_limite_sigef, anuencia_assinada FROM segmentos WHERE id = ?", params=(self.seg_id,), fetch_one=True)
        self.assertEqual(row["tipo_limite_sigef"], "LA1")
        self.assertEqual(row["anuencia_assinada"], 1)

    def test_get_segmentos_retorna_anuencia_assinada(self):
        # Marca anuencia
        client.put(f"/segmentos/{self.seg_id}", json={"anuencia_assinada": 1})

        res = client.get(f"/levantamentos/{self.lev_id}/segmentos")
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(len(data) > 0)
        seg = next((s for s in data if s["id"] == self.seg_id), None)
        self.assertIsNotNone(seg)
        self.assertEqual(seg.get("anuencia_assinada"), 1)

if __name__ == '__main__':
    unittest.main()
