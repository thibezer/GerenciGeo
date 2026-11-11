"""
Testes da relação de 399 municípios do Paraná e associação N:M com RIs (CNS XX.XXX-X + Ofício).
"""
import unittest
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from database.municipios_pr import MUNICIPIOS_PARANA, formatar_cns, validar_normalizar_cns


class TestMunicipiosPRCartoriosRI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)

    def setUp(self):
        self.client = TestClient(app)
        self.prop_ids: list[int] = []

    def tearDown(self):
        for pid in self.prop_ids:
            execute_query("DELETE FROM propriedades WHERE id = ?", params=(pid,), commit=True)
        execute_query(
            "DELETE FROM municipio_cartorios WHERE cns IN ('08.111-1', '08.222-2', '08.123-4', '09.999-8')",
            commit=True,
        )
        execute_query(
            "DELETE FROM cartorios_ri WHERE cns IN ('08.111-1', '08.222-2', '08.123-4', '09.999-8')",
            commit=True,
        )

    def test_seed_399_municipios_parana_limpos(self):
        self.assertEqual(len(MUNICIPIOS_PARANA), 399)
        self.assertIn("Alto Paraíso", MUNICIPIOS_PARANA)
        self.assertNotIn("Alto Paraíso (3)", MUNICIPIOS_PARANA)
        self.assertEqual(MUNICIPIOS_PARANA[0], "Abatiá")
        self.assertEqual(MUNICIPIOS_PARANA[-1], "Xambrê")

        row = execute_query("SELECT COUNT(*) AS qtd FROM municipios WHERE uf = 'PR'", fetch_one=True)
        self.assertEqual(row["qtd"], 399)

        res = self.client.get("/municipios-cartorios")
        self.assertEqual(res.status_code, 200)
        itens = res.json()
        pr_itens = [m for m in itens if m["uf"] == "PR"]
        self.assertGreaterEqual(len(pr_itens), 399)
        self.assertTrue(any(m["municipio"] == "Alto Paraíso" for m in pr_itens))

    def test_validacao_formato_cns_xx_xxx_x(self):
        self.assertEqual(formatar_cns("081234"), "08.123-4")
        self.assertEqual(validar_normalizar_cns("081234"), "08.123-4")
        self.assertEqual(validar_normalizar_cns("08.123-4"), "08.123-4")
        self.assertIsNone(validar_normalizar_cns("   "))

        with self.assertRaises(ValueError):
            validar_normalizar_cns("0812")

        res_bad = self.client.put("/municipios-cartorios", json={
            "municipio": "Umuarama", "uf": "PR", "cns": "0812", "oficio": "1º Ofício"
        })
        self.assertEqual(res_bad.status_code, 400)

    def test_multiplos_cartorios_por_municipio_e_cns_compartilhado(self):
        # 1) Cascavel recebe 2 ofícios diferentes (1º e 2º)
        r1 = self.client.put("/municipios-cartorios", json={
            "municipio": "Cascavel", "uf": "PR", "cns": "081111", "oficio": "1º Ofício"
        })
        self.assertEqual(r1.status_code, 200, r1.text)
        self.assertEqual(r1.json()["cns"], "08.111-1")

        r2 = self.client.put("/municipios-cartorios", json={
            "municipio": "Cascavel", "uf": "PR", "cns": "08.222-2", "oficio": "2º Ofício"
        })
        self.assertEqual(r2.status_code, 200, r2.text)

        # 2) Mesmo CNS (08.123-4) atende Iporã E Cafezal do Sul
        r3 = self.client.put("/municipios-cartorios", json={
            "municipio": "Iporã", "uf": "PR", "cns": "081234", "oficio": "1º Ofício"
        })
        self.assertEqual(r3.status_code, 200)
        r4 = self.client.put("/municipios-cartorios", json={
            "municipio": "Cafezal do Sul", "uf": "PR", "cns": "08.123-4", "oficio": ""
        })
        self.assertEqual(r4.status_code, 200)
        # Deve herdar automaticamente o Ofício já salvo no cartorios_ri
        self.assertEqual(r4.json()["oficio"], "1º Ofício")

        lista = self.client.get("/municipios-cartorios").json()
        cascavel = next(m for m in lista if m["municipio"] == "Cascavel" and m["uf"] == "PR")
        self.assertEqual([(x["oficio"], x["cns"]) for x in cascavel["ris"]], [
            ("1º Ofício", "08.111-1"),
            ("2º Ofício", "08.222-2"),
        ])

        ipora = next(m for m in lista if m["municipio"] == "Iporã" and m["uf"] == "PR")
        cafezal = next(m for m in lista if m["municipio"] == "Cafezal do Sul" and m["uf"] == "PR")
        self.assertEqual(ipora["ris"], [{"cns": "08.123-4", "oficio": "1º Ofício"}])
        self.assertEqual(cafezal["ris"], [{"cns": "08.123-4", "oficio": "1º Ofício"}])

        # 3) Desvincular Cafezal do Sul NÃO remove Iporã
        r_del = self.client.delete("/municipios-cartorios", params={
            "municipio": "Cafezal do Sul", "uf": "PR", "cns": "08.123-4"
        })
        self.assertEqual(r_del.status_code, 200)
        lista_pos = self.client.get("/municipios-cartorios").json()
        ipora_pos = next(m for m in lista_pos if m["municipio"] == "Iporã" and m["uf"] == "PR")
        cafezal_pos = next(m for m in lista_pos if m["municipio"] == "Cafezal do Sul" and m["uf"] == "PR")
        self.assertEqual(ipora_pos["ris"], [{"cns": "08.123-4", "oficio": "1º Ofício"}])
        self.assertEqual(cafezal_pos["ris"], [])

    def test_propriedade_persiste_cns_oficio_e_mescla_acento(self):
        # Xambre sem acento + CNS 099998 deve aparecer mesclado em Xambrê no catálogo
        res_post = self.client.post("/propriedades", json={
            "nome_propriedade": "Fazenda Teste Xambrê",
            "municipio": "Xambre",
            "uf": "PR",
            "cns_ri": "099998",
            "oficio_ri": "Ofício Único",
        })
        self.assertEqual(res_post.status_code, 200, res_post.text)
        pid = res_post.json()["id"]
        self.prop_ids.append(pid)

        props = self.client.get("/propriedades").json()
        alvo = next(p for p in props if p["id"] == pid)
        self.assertEqual(alvo["cns_ri"], "09.999-8")
        self.assertEqual(alvo["oficio_ri"], "Ofício Único")

        # Edição parcial sem enviar cns_ri não pode apagar cns_ri
        res_put = self.client.put(f"/propriedades/{pid}", json={"codigo_ccir": "1234567890123"})
        self.assertEqual(res_put.status_code, 200)
        props2 = self.client.get("/propriedades").json()
        alvo2 = next(p for p in props2 if p["id"] == pid)
        self.assertEqual(alvo2["cns_ri"], "09.999-8")

        cat = self.client.get("/municipios-cartorios").json()
        xambre = [m for m in cat if m["municipio"] in ("Xambrê", "Xambre") and m["uf"] == "PR"]
        self.assertEqual(len(xambre), 1)
        self.assertEqual(xambre[0]["municipio"], "Xambrê")
        self.assertEqual(xambre[0]["ris"], [{"cns": "09.999-8", "oficio": "Ofício Único"}])
