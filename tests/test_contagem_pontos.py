import unittest
from fastapi.testclient import TestClient

from api import app
from database.connection import DatabaseManager
from services.gestores.contagem_pontos import (
    calcular_contagem,
    calcular_lacunas,
    comprimir_faixas,
    interpretar_nome,
    separar_isolados,
)

client = TestClient(app)


class TestFuncoesPuras(unittest.TestCase):
    def test_interpretar_nome_padrao_sigef(self):
        self.assertEqual(interpretar_nome("xrxr-p-0042"), ("XRXR", "P", 42))
        self.assertEqual(interpretar_nome("AYC-M-2230"), ("AYC", "M", 2230))
        self.assertIsNone(interpretar_nome("estrada12"))
        self.assertIsNone(interpretar_nome("B061613"))
        self.assertIsNone(interpretar_nome(None))

    def test_comprimir_faixas(self):
        self.assertEqual(comprimir_faixas([1, 2, 3, 5, 8, 9, 3]), [[1, 3], [5, 5], [8, 9]])
        self.assertEqual(comprimir_faixas([]), [])

    def test_lacunas_entre_um_e_o_maior(self):
        self.assertEqual(calcular_lacunas([2, 3, 6]), [[1, 1], [4, 5]])
        self.assertEqual(calcular_lacunas([1, 2, 3]), [])

    def test_numero_isolado_nao_empurra_o_proximo(self):
        principal, isolados = separar_isolados([1, 2, 3, 133, 134, 9999])
        self.assertEqual(principal[-1], 134)
        self.assertEqual(isolados, [9999])


class TestCalcularContagem(unittest.TestCase):
    def setUp(self):
        self.profissionais = [{"nome": "Fulano", "codigo_credenciado": "ABCD",
                               "contador_m": 0, "contador_p": 5, "contador_v": 0}]
        self.levantamentos = {
            1: {"propriedade": "Fazenda A", "municipio": "X", "uf": "GO", "status": "EM_ANDAMENTO"},
            2: {"propriedade": "Fazenda B", "municipio": "Y", "uf": "GO", "status": "CONCLUIDO"},
            3: {"propriedade": "Vazia", "municipio": "Z", "uf": "GO", "status": "EM_ANDAMENTO"},
        }
        self.pontos = [
            {"nome_vertice": "ABCD-P-0001", "levantamento_id": 1},
            {"nome_vertice": "ABCD-P-0002", "levantamento_id": 1},
            {"nome_vertice": "ABCD-P-0004", "levantamento_id": 2},
            {"nome_vertice": "ABCD-P-0002", "levantamento_id": 2},
            {"nome_vertice": "divisa1", "levantamento_id": 2},
            {"nome_vertice": "ZZZ-V-0100", "levantamento_id": 2},
        ]

    def test_proximo_disponivel_lacunas_e_projetos(self):
        r = calcular_contagem(self.pontos, self.levantamentos, self.profissionais)
        meu = next(c for c in r["codigos"] if c["codigo"] == "ABCD")
        p = meu["tipos"]["P"]
        self.assertTrue(meu["meu"])
        self.assertEqual(p["proximo_nome"], "ABCD-P-0005")
        self.assertEqual(p["lacunas"], [[3, 3]])
        self.assertEqual(p["total"], 3)
        self.assertEqual(p["projetos"], 2)
        # contador do cadastro (5) difere do maior número usado (4)
        self.assertTrue(p["divergencia_contador"])

    def test_codigo_sem_pontos_comeca_no_um(self):
        r = calcular_contagem([], self.levantamentos, self.profissionais)
        meu = r["codigos"][0]
        self.assertEqual(meu["tipos"]["M"]["proximo_nome"], "ABCD-M-0001")

    def test_numero_em_dois_projetos_vira_conflito_so_para_meus_codigos(self):
        r = calcular_contagem(self.pontos, self.levantamentos, self.profissionais)
        self.assertEqual(r["conflitos"], [{"nome": "ABCD-P-0002", "levantamentos": [1, 2]}])

    def test_terceiros_nao_tem_lacunas_e_projetos_registram_fora_do_padrao(self):
        r = calcular_contagem(self.pontos, self.levantamentos, self.profissionais)
        terceiro = next(c for c in r["codigos"] if c["codigo"] == "ZZZ")
        self.assertFalse(terceiro["meu"])
        self.assertEqual(terceiro["tipos"]["V"]["lacunas"], [])
        proj2 = next(p for p in r["projetos"] if p["levantamento_id"] == 2)
        self.assertEqual(proj2["fora_do_padrao"], 1)
        self.assertEqual(proj2["total_pontos"], 6 - 2)
        # projeto sem pontos não aparece
        self.assertNotIn(3, [p["levantamento_id"] for p in r["projetos"]])


class TestEndpointContagem(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            c = conn.cursor()
            c.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Prof Contagem', 'CREA 1', 'QWER')")
            self.prof_id = c.lastrowid
            c.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Contagem', 'Jataí', 'GO')")
            self.prop_id = c.lastrowid
            c.execute("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-02-01', 'EM_ANDAMENTO')",
                      (self.prop_id, self.prof_id))
            self.lev_id = c.lastrowid
            for nome, tipo in (("QWER-P-0001", "P"), ("QWER-P-0002", "P"), ("QWER-M-0001", "M")):
                c.execute("INSERT INTO pontos (levantamento_id, nome_vertice, tipo_ponto, lat, lon, alt) VALUES (?, ?, ?, -17.0, -51.0, 700)",
                          (self.lev_id, nome, tipo))
            conn.commit()

    def tearDown(self):
        with DatabaseManager() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM pontos WHERE levantamento_id = ?", (self.lev_id,))
            c.execute("DELETE FROM levantamentos WHERE id = ?", (self.lev_id,))
            c.execute("DELETE FROM propriedades WHERE id = ?", (self.prop_id,))
            c.execute("DELETE FROM profissionais WHERE id = ?", (self.prof_id,))
            conn.commit()

    def test_endpoint_devolve_proximo_e_projeto(self):
        res = client.get("/contagem-pontos")
        self.assertEqual(res.status_code, 200)
        dados = res.json()
        cod = next(c for c in dados["codigos"] if c["codigo"] == "QWER")
        self.assertEqual(cod["tipos"]["P"]["proximo_nome"], "QWER-P-0003")
        self.assertEqual(cod["tipos"]["M"]["proximo_nome"], "QWER-M-0002")
        self.assertEqual(cod["tipos"]["V"]["proximo_nome"], "QWER-V-0001")
        proj = next(p for p in dados["projetos"] if p["levantamento_id"] == self.lev_id)
        self.assertEqual(proj["propriedade"], "Fazenda Contagem")
        self.assertEqual(proj["total_pontos"], 3)


if __name__ == "__main__":
    unittest.main()
