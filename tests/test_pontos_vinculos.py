import unittest
import uuid
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager, execute_query

client = TestClient(app)


class TestPontosVinculos(unittest.TestCase):
    """Atualização de ponto (individual e em lote) não pode tocar segmento, confrontante ou matrícula de outro levantamento."""

    def setUp(self):
        sufixo = uuid.uuid4().hex[:6]
        with DatabaseManager() as conn:
            c = conn.cursor()
            c.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Eng Pontos', ?, 'P')", (f"CREA {sufixo}",))
            self.prof_id = c.lastrowid
            self.props, self.levs, self.mats, self.pessoas = [], [], [], []
            self.pontos, self.confs, self.segs = {}, {}, {}
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
                cpf = f"55{uuid.uuid4().int % 1000000000:09d}"
                c.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES (?, ?)", (f"Vizinho {chave}", cpf))
                self.pessoas.append(c.lastrowid)
                c.execute("INSERT INTO confrontantes (levantamento_id, pessoa_id, nome, matricula_imovel) VALUES (?, ?, ?, '1')", (lev, self.pessoas[-1], f"Vizinho {chave}"))
                self.confs[chave] = c.lastrowid
                c.execute(
                    "INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, tipo_limite_sigef, metodo_posicionamento_sigef, anuencia_assinada) "
                    "VALUES (?, ?, ?, ?, 'LN1', 'PG1', 0)",
                    (lev, mat, ids[0], ids[1]),
                )
                self.segs[chave] = c.lastrowid
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

    def _seg(self, chave):
        return execute_query("SELECT tipo_limite_sigef, confrontante_id FROM segmentos WHERE id = ?", params=(self.segs[chave],), fetch_one=True)

    def _conf_nome(self, chave):
        return execute_query("SELECT nome FROM confrontantes WHERE id = ?", params=(self.confs[chave],), fetch_one=True)["nome"]

    # ── PUT individual ──────────────────────────────────────────────────────
    def test_individual_aceita_segmento_e_confrontante_do_proprio_levantamento(self):
        payload = {"segmento": {"id": self.segs["A"], "tipo_limite_sigef": "LA1"}, "confrontante": {"id": self.confs["A"], "nome": "Vizinho A Editado"}}
        res = client.put(f"/pontos/{self.pontos['A'][0]}", json=payload)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(self._seg("A")["tipo_limite_sigef"], "LA1")
        self.assertEqual(self._conf_nome("A"), "Vizinho A Editado")

    def test_individual_rejeita_segmento_de_outro_levantamento(self):
        res = client.put(f"/pontos/{self.pontos['A'][0]}/transacional", json={"segmento": {"id": self.segs["B"], "tipo_limite_sigef": "LA1"}})
        self.assertEqual(res.status_code, 422, res.text)
        self.assertEqual(self._seg("B")["tipo_limite_sigef"], "LN1")

    def test_individual_rejeita_confrontante_de_outro_levantamento(self):
        res = client.put(f"/pontos/{self.pontos['A'][0]}", json={"confrontante": {"id": self.confs["B"], "nome": "Invasor"}})
        self.assertEqual(res.status_code, 422, res.text)
        self.assertEqual(self._conf_nome("B"), "Vizinho B")

    def test_individual_rejeita_confrontante_alheio_no_segmento(self):
        res = client.put(f"/pontos/{self.pontos['A'][0]}", json={"segmento": {"id": self.segs["A"], "confrontante_id": self.confs["B"]}})
        self.assertEqual(res.status_code, 422, res.text)
        self.assertIsNone(self._seg("A")["confrontante_id"])

    def test_individual_rejeita_matricula_de_outra_propriedade(self):
        res = client.put(f"/pontos/{self.pontos['A'][0]}", json={"matricula_id": self.mats[1]})
        self.assertEqual(res.status_code, 422, res.text)
        row = execute_query("SELECT matricula_id FROM pontos WHERE id = ?", params=(self.pontos["A"][0],), fetch_one=True)
        self.assertEqual(row["matricula_id"], self.mats[0])

    def test_individual_sem_referencias_continua_funcionando(self):
        res = client.put(f"/pontos/{self.pontos['A'][0]}", json={"nome_vertice": "A-1-NOVO"})
        self.assertEqual(res.status_code, 200, res.text)

    # ── PUT em lote ─────────────────────────────────────────────────────────
    def test_lote_aceita_referencias_do_proprio_levantamento(self):
        payload = {"pontos": [{"id": self.pontos["A"][0], "segmento": {"id": self.segs["A"], "tipo_limite_sigef": "LI2"}, "confrontante": {"id": self.confs["A"], "nome": "Vizinho A Lote"}}]}
        res = client.put(f"/levantamentos/{self.levs[0]}/pontos/batch", json=payload)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(self._seg("A")["tipo_limite_sigef"], "LI2")
        self.assertEqual(self._conf_nome("A"), "Vizinho A Lote")

    def test_lote_rejeita_segmento_de_outro_levantamento(self):
        payload = {"pontos": [{"id": self.pontos["A"][0], "segmento": {"id": self.segs["B"], "tipo_limite_sigef": "LI2"}}]}
        res = client.put(f"/levantamentos/{self.levs[0]}/pontos/batch", json=payload)
        self.assertEqual(res.status_code, 422, res.text)
        self.assertEqual(self._seg("B")["tipo_limite_sigef"], "LN1")

    def test_lote_rejeita_confrontante_de_outro_levantamento_sem_gravar_nada(self):
        payload = {"pontos": [
            {"id": self.pontos["A"][0], "nome_vertice": "A-1-LOTE"},
            {"id": self.pontos["A"][1], "confrontante": {"id": self.confs["B"], "nome": "Invasor"}},
        ]}
        res = client.put(f"/levantamentos/{self.levs[0]}/pontos/batch", json=payload)
        self.assertEqual(res.status_code, 422, res.text)
        self.assertEqual(self._conf_nome("B"), "Vizinho B")
        nome = execute_query("SELECT nome_vertice FROM pontos WHERE id = ?", params=(self.pontos["A"][0],), fetch_one=True)["nome_vertice"]
        self.assertEqual(nome, "A-1")

    def test_lote_rejeita_matricula_de_outra_propriedade(self):
        payload = {"pontos": [{"id": self.pontos["A"][0], "matricula_id": self.mats[1]}]}
        res = client.put(f"/levantamentos/{self.levs[0]}/pontos/batch", json=payload)
        self.assertEqual(res.status_code, 422, res.text)


if __name__ == "__main__":
    unittest.main()
