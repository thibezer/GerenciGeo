import unittest
from fastapi.testclient import TestClient

from api import app
from database.connection import DatabaseManager, execute_query
from routes.levantamento.homologacao import persistir_pontos_homologados
from services.gestores.anuencia_status import parece_ente_publico, status_efetivo
from services.gestores.levantamento_manager import salvar_ordem_caminhamento
from services.processamento.topologia_segmentos import montar_info_segmentos


def _seg(ini, fim, **kw):
    base = {"ponto_inicio_id": ini, "ponto_fim_id": fim, "confrontante_id": None, "tipo_limite_sigef": "LN1",
            "metodo_posicionamento_sigef": "PG1", "origem_homologada": 0, "anuencia_assinada": 0}
    base.update(kw)
    return base


class TestMontarInfoSegmentos(unittest.TestCase):
    def test_aresta_existente_herda_tudo_inclusive_anuencia(self):
        antigos = [_seg(1, 2, confrontante_id=7, tipo_limite_sigef="LA2", anuencia_assinada=1, origem_homologada=1)]
        info = montar_info_segmentos(antigos, [1, 2, 3], "MC1")
        self.assertEqual(info[0][:2], (1, 2))
        self.assertEqual((info[0][2]["confrontante_id"], info[0][2]["anuencia_assinada"], info[0][2]["origem_homologada"]), (7, 1, 1))
        self.assertEqual(info[1][2]["tipo_limite_sigef"], "LN1")  # sem histórico: padrão
        self.assertEqual(info[1][2]["metodo_posicionamento_sigef"], "MC1")

    def test_sentido_invertido_ainda_casa(self):
        info = montar_info_segmentos([_seg(2, 1, confrontante_id=9, anuencia_assinada=1)], [1, 2, 3], "MC1")
        self.assertEqual(info[0][2]["confrontante_id"], 9)

    def test_vertice_novo_no_meio_da_divisa_herda_do_segmento_dividido(self):
        antigos = [_seg(1, 2, confrontante_id=7, tipo_limite_sigef="LA2", anuencia_assinada=1),
                   _seg(2, 3, confrontante_id=8), _seg(3, 1, confrontante_id=9)]
        info = montar_info_segmentos(antigos, [1, 99, 2, 3], "MC1")  # 99 nasceu entre 1 e 2
        por_aresta = {(a, b): i for a, b, i in info}
        self.assertEqual(por_aresta[(1, 99)]["confrontante_id"], 7)
        self.assertEqual(por_aresta[(99, 2)]["confrontante_id"], 7)
        self.assertEqual((por_aresta[(99, 2)]["tipo_limite_sigef"], por_aresta[(99, 2)]["anuencia_assinada"]), ("LA2", 1))
        self.assertEqual(por_aresta[(2, 3)]["confrontante_id"], 8)

    def test_fechamento_dividido_tambem_herda(self):
        antigos = [_seg(1, 2, confrontante_id=1), _seg(2, 3, confrontante_id=2), _seg(3, 1, confrontante_id=3)]
        info = montar_info_segmentos(antigos, [1, 2, 3, 99], "MC1")  # 99 entre 3 e 1 (aresta de fechamento)
        por_aresta = {(a, b): i for a, b, i in info}
        self.assertEqual(por_aresta[(3, 99)]["confrontante_id"], 3)
        self.assertEqual(por_aresta[(99, 1)]["confrontante_id"], 3)

    def test_reordenacao_real_nao_inventa_heranca(self):
        antigos = [_seg(1, 2, confrontante_id=1), _seg(2, 3, confrontante_id=2), _seg(3, 4, confrontante_id=3), _seg(4, 1, confrontante_id=4)]
        info = montar_info_segmentos(antigos, [1, 3, 2, 4], "MC1")
        por_aresta = {(a, b): i for a, b, i in info}
        self.assertIsNone(por_aresta[(1, 3)]["confrontante_id"])  # 3 não é vértice novo: sem herança


class TestStatusEfetivo(unittest.TestCase):
    def test_inferencia_por_nome(self):
        for nome in ("Estrada Municipal", "ESTRADA Municipal Watanabe", "Rio Pirapó", "Córrego Água Boa", "BR-376", "Rodovia PR-323"):
            self.assertTrue(parece_ente_publico(nome), nome)
        for nome in ("João da Silva", "Viana Agropecuária", "Brasil Agro Ltda", "Lote 5-A", "Fazenda Rio Bonito", ""):
            self.assertFalse(parece_ente_publico(nome), nome)

    def test_registro_explicito_prevalece_sobre_inferencia(self):
        self.assertEqual(status_efetivo(None, "Estrada Municipal", 3, 0), "DISPENSADO")
        self.assertEqual(status_efetivo("PENDENTE", "Estrada Municipal", 3, 0), "PENDENTE")
        self.assertEqual(status_efetivo("DISPENSADO", "João", 3, 0), "DISPENSADO")

    def test_assinado_exige_todas_as_divisas(self):
        self.assertEqual(status_efetivo(None, "João", 3, 3), "ASSINADO")
        self.assertEqual(status_efetivo(None, "João", 3, 2), "PENDENTE")
        self.assertEqual(status_efetivo("ASSINADO", "João", 3, 2), "PENDENTE")
        self.assertEqual(status_efetivo("ASSINADO", "João", 0, 0), "ASSINADO")


class TestIntegridadeConfrontantesAnuencias(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        with DatabaseManager() as conn:
            c = conn.cursor()
            for t in ("anuencias_confrontantes", "confrontante_coproprietarios", "alteracoes_sigef", "segmentos", "banco_pontos", "pontos",
                      "confrontantes", "matriculas", "levantamentos", "propriedade_clientes", "propriedades", "clientes", "pessoas", "profissionais"):
                c.execute(f"DELETE FROM {t}")
            c.execute("INSERT INTO propriedades (id, nome_propriedade, municipio, uf) VALUES (100, 'Fazenda', 'Umuarama', 'PR')")
            c.execute("INSERT INTO profissionais (id, nome, registro, codigo_credenciado) VALUES (100, 'Eng', '1', 'XRXR')")
            c.execute("INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio) VALUES (100, 100, 100, '2026-01-01')")
            c.execute("INSERT INTO matriculas (id, propriedade_id, numero_matricula) VALUES (500, 100, 'MAT-500')")
            descritivos = {1: "Limita com JOAO DA SILVA", 2: "Limita com Estrada Municipal", 3: "Limita com Estrada Municipal"}
            pts = [
                {"tipo_ponto": "M", "numero": i, "codigo_completo": f"XRXR-M-{i:04d}", "norte": 1.0, "este": 2.0, "altitude": 3.0,
                 "lat": -23.5 - i / 1000, "lon": -53.4 + (i % 2) / 1000, "sigma_n": .1, "sigma_e": .1, "sigma_z": .1,
                 "metodo_posicionamento": "PG1", "tipo_limite": "LA1", "cns_confrontante": "", "matricula_confrontante": "",
                 "confrontante_descritivo": descritivos[i]}
                for i in range(1, 4)
            ]
            persistir_pontos_homologados(c, 100, 500, 100, pts, "plan.ods")
            conn.commit()
        resumo = self._resumo()
        self.joao = next(g for g in resumo["confrontantes"] if "JOAO" in g["nome"].upper())
        self.estrada = next(g for g in resumo["confrontantes"] if "estrada" in g["nome"].lower())

    def _resumo(self):
        r = self.client.get("/levantamentos/100/matriculas/500/resumo-confrontantes")
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def _assinar(self, cid, assinada=True):
        r = self.client.post(f"/levantamentos/100/matriculas/500/confrontantes/{cid}/anuencia-assinada", json={"assinada": assinada})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    # ── PUT de confrontante não apaga o que o formulário não envia ────────────────
    def test_put_preserva_campos_de_importacao(self):
        cid = self.joao["id"]
        execute_query(
            "UPDATE confrontantes SET cns_confrontante='12345', nome_propriedade='Fazenda Boa', codigo_incra_imovel='950.000.000', tipo_relacao='vizinho' WHERE id = ?",
            params=(cid,), commit=True)
        r = self.client.put(f"/confrontantes/{cid}", json={"nome": "João da Silva", "tipo_relacao": None, "lote": "Lote n° 5"})
        self.assertEqual(r.status_code, 200, r.text)
        row = execute_query("SELECT cns_confrontante, nome_propriedade, codigo_incra_imovel, tipo_relacao, lote FROM confrontantes WHERE id = ?",
                            params=(cid,), fetch_one=True)
        self.assertEqual((row["cns_confrontante"], row["nome_propriedade"], row["codigo_incra_imovel"], row["tipo_relacao"]),
                         ("12345", "Fazenda Boa", "950.000.000", "vizinho"))
        self.assertEqual(row["lote"], "Lote n° 5")

    def test_put_ainda_permite_trocar_valor_enviado(self):
        cid = self.joao["id"]
        execute_query("UPDATE confrontantes SET cns_confrontante='12345' WHERE id = ?", params=(cid,), commit=True)
        self.client.put(f"/confrontantes/{cid}", json={"nome": "João da Silva", "cns_confrontante": "99999"})
        row = execute_query("SELECT cns_confrontante FROM confrontantes WHERE id = ?", params=(cid,), fetch_one=True)
        self.assertEqual(row["cns_confrontante"], "99999")

    # ── Reordenar o perímetro preserva a anuência assinada ────────────────────────
    def test_reordenar_perimetro_preserva_anuencia_assinada_e_confrontante(self):
        self._assinar(self.joao["id"])
        pts = execute_query("SELECT id FROM pontos WHERE levantamento_id = 100 AND matricula_id = 500 ORDER BY ordem_caminhamento, id", fetch_all=True)
        ordem = [{"id": p["id"], "ordem": i + 1} for i, p in enumerate(pts)]
        res = salvar_ordem_caminhamento(100, 500, ordem)
        self.assertTrue(res.get("sucesso"), res)
        d = self._resumo()
        joao = next(g for g in d["confrontantes"] if g["id"] == self.joao["id"])
        self.assertEqual((joao["qtd_divisas"], joao["assinadas"]), (1, 1))
        self.assertEqual(joao["status_anuencia"], "ASSINADO")

    # ── Fonte única de "assinada" ─────────────────────────────────────────────────
    def test_checkbox_reflete_em_status_cartorio(self):
        self._assinar(self.joao["id"])
        s = self.client.get("/levantamentos/100/documentos/status-cartorio").json()
        self.assertEqual(s["confrontantes_assinados"], 1)
        self.assertNotIn(None, s["confrontantes_pendentes"])
        self._assinar(self.joao["id"], False)
        s = self.client.get("/levantamentos/100/documentos/status-cartorio").json()
        self.assertEqual(s["confrontantes_assinados"], 0)
        self.assertEqual(s["confrontantes_pendentes"], [self.joao["nome"]])

    def test_upload_marca_divisas_como_assinadas(self):
        r = self.client.post(f"/levantamentos/100/documentos/anuencias/{self.joao['id']}/upload",
                             files={"file": ("termo.pdf", b"%PDF-1.4 teste", "application/pdf")})
        self.assertEqual(r.status_code, 200, r.text)
        joao = next(g for g in self._resumo()["confrontantes"] if g["id"] == self.joao["id"])
        self.assertEqual(joao["assinadas"], joao["qtd_divisas"])
        self.assertEqual(joao["status_anuencia"], "ASSINADO")

    def test_upload_rejeita_formato_e_confrontante_de_outro_levantamento(self):
        r = self.client.post(f"/levantamentos/100/documentos/anuencias/{self.joao['id']}/upload",
                             files={"file": ("virus.exe", b"MZ", "application/octet-stream")})
        self.assertEqual(r.status_code, 400)
        r = self.client.post(f"/levantamentos/100/documentos/anuencias/999999/upload",
                             files={"file": ("termo.pdf", b"%PDF", "application/pdf")})
        self.assertEqual(r.status_code, 404)

    def test_status_cartorio_sem_confrontantes_nao_fica_pronto(self):
        execute_query("UPDATE segmentos SET confrontante_id = NULL", commit=True)
        s = self.client.get("/levantamentos/100/documentos/status-cartorio").json()
        self.assertFalse(s["pronto_para_registro"])
        self.assertEqual(s["confrontantes_totais"], 0)

    # ── Dispensa de entes públicos ────────────────────────────────────────────────
    def test_estrada_vem_dispensada_por_inferencia_e_sai_da_conta(self):
        self.assertTrue(self.estrada["dispensada"])
        self.assertTrue(self.estrada["dispensa_inferida"])
        self.assertFalse(self.joao["dispensada"])
        s = self.client.get("/levantamentos/100/documentos/status-cartorio").json()
        self.assertEqual((s["confrontantes_totais"], s["confrontantes_dispensados"]), (1, 1))

    def test_reexigir_e_dispensar_de_novo(self):
        cid = self.estrada["id"]
        r = self.client.post(f"/levantamentos/100/confrontantes/{cid}/dispensa-anuencia", json={"dispensada": False})
        self.assertEqual(r.status_code, 200, r.text)
        est = next(g for g in self._resumo()["confrontantes"] if g["id"] == cid)
        self.assertFalse(est["dispensada"])
        self.assertEqual(est["status_anuencia"], "PENDENTE")
        s = self.client.get("/levantamentos/100/documentos/status-cartorio").json()
        self.assertEqual(s["confrontantes_totais"], 2)

        self.client.post(f"/levantamentos/100/confrontantes/{cid}/dispensa-anuencia", json={"dispensada": True})
        est = next(g for g in self._resumo()["confrontantes"] if g["id"] == cid)
        self.assertTrue(est["dispensada"])
        self.assertFalse(est["dispensa_inferida"])

    def test_dispensa_de_particular_e_confrontante_inexistente(self):
        r = self.client.post(f"/levantamentos/100/confrontantes/{self.joao['id']}/dispensa-anuencia", json={"dispensada": True})
        self.assertEqual(r.status_code, 200)
        joao = next(g for g in self._resumo()["confrontantes"] if g["id"] == self.joao["id"])
        self.assertTrue(joao["dispensada"])
        self.assertEqual(self.client.post("/levantamentos/100/confrontantes/999999/dispensa-anuencia", json={"dispensada": True}).status_code, 404)

    def test_checkbox_nao_desfaz_dispensa(self):
        cid = self.joao["id"]
        self.client.post(f"/levantamentos/100/confrontantes/{cid}/dispensa-anuencia", json={"dispensada": True})
        self._assinar(cid)
        self._assinar(cid, False)
        joao = next(g for g in self._resumo()["confrontantes"] if g["id"] == cid)
        self.assertTrue(joao["dispensada"])


if __name__ == "__main__":
    unittest.main()
