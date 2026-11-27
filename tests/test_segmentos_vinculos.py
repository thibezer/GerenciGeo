import unittest
import uuid
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager, execute_query

client = TestClient(app)


class TestSegmentosVinculos(unittest.TestCase):
    """Segmento só pode referenciar pontos, confrontante e matrícula do próprio levantamento (anti-IDOR)."""

    def setUp(self):
        sufixo = uuid.uuid4().hex[:6]
        with DatabaseManager() as conn:
            c = conn.cursor()
            c.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Eng Vinculos', ?, 'V')", (f"CREA {sufixo}",))
            self.prof_id = c.lastrowid
            self.props, self.levs, self.mats, self.pessoas = [], [], [], []
            self.pontos, self.confs = {}, {}
            for chave in ("A", "B"):
                c.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES (?, 'Jataí', 'GO')", (f"Fazenda {chave} {sufixo}",))
                prop = c.lastrowid
                self.props.append(prop)
                c.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, ?, 10.0)", (prop, f"{chave}{sufixo}"))
                mat = c.lastrowid
                self.mats.append(mat)
                c.execute("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-01-01', 'EM_ANDAMENTO')", (prop, self.prof_id))
                lev = c.lastrowid
                self.levs.append(lev)
                ids = []
                for i in (1, 2):
                    c.execute("INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt) VALUES (?, ?, ?, 'V', -17.1, -51.1, 750.0)", (lev, mat, f"{chave}-{i}"))
                    ids.append(c.lastrowid)
                self.pontos[chave] = ids
                cpf = f"66{uuid.uuid4().int % 1000000000:09d}"
                c.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES (?, ?)", (f"Vizinho {chave}", cpf))
                self.pessoas.append(c.lastrowid)
                c.execute("INSERT INTO confrontantes (levantamento_id, pessoa_id, matricula_imovel) VALUES (?, ?, '1')", (lev, self.pessoas[-1]))
                self.confs[chave] = c.lastrowid
            c.execute(
                "INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, tipo_limite_sigef, metodo_posicionamento_sigef, anuencia_assinada) "
                "VALUES (?, ?, ?, ?, 'LN1', 'PG1', 0)",
                (self.levs[0], self.mats[0], self.pontos["A"][0], self.pontos["A"][1]),
            )
            self.seg_id = c.lastrowid
            conn.commit()

    def tearDown(self):
        with DatabaseManager() as conn:
            c = conn.cursor()
            for lev in self.levs:
                c.execute("DELETE FROM segmentos WHERE levantamento_id = ?", (lev,))
                c.execute("DELETE FROM confrontantes WHERE levantamento_id = ?", (lev,))
                c.execute("DELETE FROM pontos WHERE levantamento_id = ?", (lev,))
            for prop in self.props:
                c.execute("DELETE FROM matriculas WHERE propriedade_id = ?", (prop,))
            for lev in self.levs:
                c.execute("DELETE FROM levantamentos WHERE id = ?", (lev,))
            for prop in self.props:
                c.execute("DELETE FROM propriedades WHERE id = ?", (prop,))
            for p in self.pessoas:
                c.execute("DELETE FROM pessoas WHERE id = ?", (p,))
            c.execute("DELETE FROM profissionais WHERE id = ?", (self.prof_id,))
            conn.commit()

    def _payload_criar(self, **extra):
        base = {
            "matricula_id": self.mats[0],
            "ponto_inicio_id": self.pontos["A"][0],
            "ponto_fim_id": self.pontos["A"][1],
            "tipo_limite_sigef": "LN1",
            "metodo_posicionamento_sigef": "PG1",
        }
        base.update(extra)
        return base

    def _total_segmentos(self):
        return execute_query("SELECT COUNT(*) AS n FROM segmentos WHERE levantamento_id = ?", params=(self.levs[0],), fetch_one=True)["n"]

    def test_criar_com_vinculos_do_proprio_levantamento(self):
        res = client.post(f"/levantamentos/{self.levs[0]}/segmentos", json=self._payload_criar(confrontante_id=self.confs["A"]))
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(self._total_segmentos(), 2)

    def test_criar_rejeita_ponto_de_outro_levantamento(self):
        res = client.post(f"/levantamentos/{self.levs[0]}/segmentos", json=self._payload_criar(ponto_fim_id=self.pontos["B"][0]))
        self.assertEqual(res.status_code, 422, res.text)
        self.assertEqual(self._total_segmentos(), 1)

    def test_criar_rejeita_confrontante_de_outro_levantamento(self):
        res = client.post(f"/levantamentos/{self.levs[0]}/segmentos", json=self._payload_criar(confrontante_id=self.confs["B"]))
        self.assertEqual(res.status_code, 422, res.text)
        self.assertEqual(self._total_segmentos(), 1)

    def test_criar_rejeita_matricula_de_outra_propriedade(self):
        res = client.post(f"/levantamentos/{self.levs[0]}/segmentos", json=self._payload_criar(matricula_id=self.mats[1]))
        self.assertEqual(res.status_code, 422, res.text)
        self.assertEqual(self._total_segmentos(), 1)

    def test_atualizar_aceita_confrontante_do_proprio_levantamento(self):
        res = client.put(f"/segmentos/{self.seg_id}", json={"confrontante_id": self.confs["A"]})
        self.assertEqual(res.status_code, 200, res.text)
        row = execute_query("SELECT confrontante_id FROM segmentos WHERE id = ?", params=(self.seg_id,), fetch_one=True)
        self.assertEqual(row["confrontante_id"], self.confs["A"])

    def test_atualizar_rejeita_confrontante_de_outro_levantamento(self):
        res = client.put(f"/segmentos/{self.seg_id}", json={"confrontante_id": self.confs["B"]})
        self.assertEqual(res.status_code, 422, res.text)
        row = execute_query("SELECT confrontante_id FROM segmentos WHERE id = ?", params=(self.seg_id,), fetch_one=True)
        self.assertIsNone(row["confrontante_id"])

    def test_atualizar_rejeita_ponto_de_outro_levantamento(self):
        res = client.patch(f"/segmentos/{self.seg_id}", json={"ponto_inicio_id": self.pontos["B"][0]})
        self.assertEqual(res.status_code, 422, res.text)
        row = execute_query("SELECT ponto_inicio_id FROM segmentos WHERE id = ?", params=(self.seg_id,), fetch_one=True)
        self.assertEqual(row["ponto_inicio_id"], self.pontos["A"][0])

    def test_atualizar_so_limite_nao_exige_vinculos(self):
        res = client.put(f"/segmentos/{self.seg_id}", json={"tipo_limite_sigef": "LA1"})
        self.assertEqual(res.status_code, 200, res.text)


if __name__ == "__main__":
    unittest.main()
