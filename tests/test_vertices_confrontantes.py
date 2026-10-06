import unittest
from fastapi.testclient import TestClient
from database.connection import DatabaseManager, execute_query
from api import app
from routes.levantamento.homologacao import persistir_pontos_homologados


class TestVerticesConfrontantes(unittest.TestCase):
    """Listagem e correção da planilha homologada (aba Peças de Cartório)."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        with DatabaseManager() as conn:
            c = conn.cursor()
            for t in ("alteracoes_sigef", "segmentos", "banco_pontos", "pontos", "confrontantes", "matriculas", "levantamentos",
                      "propriedades", "clientes", "pessoas", "profissionais"):
                c.execute(f"DELETE FROM {t}")
            c.execute("INSERT INTO propriedades (id, nome_propriedade, municipio, uf) VALUES (100, 'Fazenda', 'Umuarama', 'PR')")
            c.execute("INSERT INTO profissionais (id, nome, registro, codigo_credenciado) VALUES (100, 'Eng', '1', 'XRXR')")
            c.execute("INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio) VALUES (100, 100, 100, '2026-01-01')")
            c.execute("INSERT INTO matriculas (id, propriedade_id, numero_matricula) VALUES (500, 100, 'MAT-500')")
            pts = [
                {"tipo_ponto": "M", "numero": i, "codigo_completo": f"XRXR-M-{i:04d}", "norte": 1.0, "este": 2.0, "altitude": 3.0,
                 "lat": -23.5 - i / 1000, "lon": -53.4, "sigma_n": .1, "sigma_e": .1, "sigma_z": .1,
                 "metodo_posicionamento": "PG1", "tipo_limite": "LA1",
                 "cns_confrontante": "", "matricula_confrontante": "",
                 "confrontante_descritivo": "Limita com JOAO DA SILVA" if i == 1 else ""}
                for i in range(1, 4)
            ]
            persistir_pontos_homologados(c, 100, 500, 100, pts, "plan.ods")
            conn.commit()

    def _vertices(self):
        r = self.client.get("/levantamentos/100/matriculas/500/vertices-confrontantes")
        self.assertEqual(r.status_code, 200)
        return r.json()

    def test_lista_com_confrontante_resolvido(self):
        v = self._vertices()
        self.assertEqual([x["codigo_completo"] for x in v], ["XRXR-M-0001", "XRXR-M-0002", "XRXR-M-0003"])
        self.assertTrue(v[0]["confrontante_nome"])
        self.assertIsNone(v[1]["confrontante_id"])

    def test_corrige_confrontante_e_propaga_ao_segmento(self):
        v = self._vertices()
        r = self.client.patch("/levantamentos/100/banco-pontos", json={
            "ids": [v[1]["id"], v[2]["id"]],
            "confrontante_descritivo": "Limita com MARIA SOUZA",
            "matricula_confrontante": "999",
            "tipo_limite": "LA2",
        })
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["atualizados"], 2)

        novo = self._vertices()
        self.assertEqual(novo[1]["matricula_confrontante"], "999")
        self.assertEqual(novo[1]["tipo_limite"], "LA2")
        self.assertTrue(novo[1]["confrontante_id"])
        self.assertEqual(novo[1]["confrontante_id"], novo[2]["confrontante_id"])
        self.assertNotEqual(novo[0]["confrontante_id"], novo[1]["confrontante_id"])

        seg = execute_query(
            "SELECT s.tipo_limite_sigef FROM segmentos s JOIN pontos p ON p.id = s.ponto_inicio_id WHERE p.nome_vertice = 'XRXR-M-0002'",
            fetch_one=True)
        self.assertEqual(seg["tipo_limite_sigef"], "LA2")

    def _alteracoes(self, status=None):
        url = "/levantamentos/100/alteracoes-sigef" + (f"?status={status}" if status else "")
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        return r.json()

    def test_trilha_guarda_original_do_sigef_e_colapsa_edicoes(self):
        v = self._vertices()
        vid = v[0]["id"]
        patch = lambda **kw: self.client.patch("/levantamentos/100/banco-pontos", json={"ids": [vid], **kw})

        patch(tipo_limite="LA2")
        patch(tipo_limite="LA3")  # segunda edição do mesmo campo: mantém o original do SIGEF
        alts = self._alteracoes("pendente")
        self.assertEqual(len(alts), 1)
        self.assertEqual((alts[0]["valor_original"], alts[0]["valor_novo"]), ("LA1", "LA3"))
        self.assertEqual(self._vertices()[0]["pendentes"], {"tipo_limite": "LA1"})

        patch(tipo_limite="LA1")  # voltou ao valor do SIGEF: nada a lançar
        self.assertEqual(self._alteracoes("pendente"), [])
        self.assertEqual(self._vertices()[0]["pendentes"], {})

    def test_marcar_lancado_fecha_a_diferenca_e_nova_edicao_parte_do_valor_atual(self):
        v = self._vertices()
        vid = v[1]["id"]
        self.client.patch("/levantamentos/100/banco-pontos", json={"ids": [vid], "metodo_posicionamento": "PA1"})
        alt = self._alteracoes("pendente")[0]
        r = self.client.post("/levantamentos/100/alteracoes-sigef/marcar-lancado", json={"ids": [alt["id"]]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._alteracoes("pendente"), [])
        self.assertEqual(len(self._alteracoes("lancado")), 1)

        self.client.patch("/levantamentos/100/banco-pontos", json={"ids": [vid], "metodo_posicionamento": "PT1"})
        nova = self._alteracoes("pendente")
        self.assertEqual((nova[0]["valor_original"], nova[0]["valor_novo"]), ("PA1", "PT1"))

    def test_reimportar_planilha_limpa_a_trilha(self):
        v = self._vertices()
        self.client.patch("/levantamentos/100/banco-pontos", json={"ids": [v[0]["id"]], "tipo_limite": "LA2"})
        self.assertEqual(len(self._alteracoes()), 1)
        r = self.client.delete("/levantamentos/100/planilhas-homologadas?planilha_origem=plan.ods")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self._alteracoes(), [])

    def test_resumo_por_confrontante_agrupa_trechos_e_aponta_divisas_sem_confrontante(self):
        r = self.client.get("/levantamentos/100/matriculas/500/resumo-confrontantes")
        self.assertEqual(r.status_code, 200, r.text)
        d = r.json()
        self.assertEqual(d["total_divisas"], 3)
        self.assertEqual(len(d["confrontantes"]), 1)
        conf = d["confrontantes"][0]
        self.assertEqual((conf["qtd_divisas"], conf["assinadas"]), (1, 0))
        self.assertGreater(conf["comprimento_m"], 0)
        self.assertEqual(d["sem_confrontante"]["qtd_divisas"], 2)
        self.assertEqual(len(d["sem_confrontante"]["trechos"]), 1)  # duas divisas seguidas = um trecho

        # sequência do perímetro: trecho do confrontante + trecho sem confrontante, com coordenadas para o mapa
        seq = d["sequencia"]
        self.assertEqual([t["confrontante_id"] is None for t in seq], [False, True])
        self.assertEqual(len(seq[0]["coords"]), 2)   # 1 divisa = 2 vértices
        self.assertEqual(len(seq[1]["coords"]), 3)   # 2 divisas seguidas = 3 vértices

        # atribuir o mesmo confrontante às duas divisas restantes une tudo num único grupo
        v = self._vertices()
        self.client.patch("/levantamentos/100/banco-pontos", json={
            "ids": [v[1]["id"], v[2]["id"]], "confrontante_descritivo": "Limita com JOAO DA SILVA"})
        d = self.client.get("/levantamentos/100/matriculas/500/resumo-confrontantes").json()
        self.assertEqual(d["sem_confrontante"]["qtd_divisas"], 0)
        self.assertEqual(d["confrontantes"][0]["qtd_divisas"], 3)
        self.assertEqual(len(d["confrontantes"][0]["trechos"]), 1)

    def test_marcar_anuencia_assinada_em_todas_as_divisas_do_confrontante(self):
        cid = self.client.get("/levantamentos/100/matriculas/500/resumo-confrontantes").json()["confrontantes"][0]["id"]
        r = self.client.post(f"/levantamentos/100/matriculas/500/confrontantes/{cid}/anuencia-assinada", json={"assinada": True})
        self.assertEqual(r.status_code, 200, r.text)
        conf = self.client.get("/levantamentos/100/matriculas/500/resumo-confrontantes").json()["confrontantes"][0]
        self.assertEqual(conf["assinadas"], conf["qtd_divisas"])

    def test_rejeita_payload_vazio(self):
        v = self._vertices()
        self.assertEqual(self.client.patch("/levantamentos/100/banco-pontos", json={"ids": [v[0]["id"]]}).status_code, 400)
        self.assertEqual(self.client.patch("/levantamentos/100/banco-pontos", json={"ids": [], "tipo_limite": "LA1"}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
