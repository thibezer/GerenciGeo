import unittest
import numpy as np
from shapely.geometry import Polygon
import api  # noqa: F401  (garante a criação do schema do banco de testes)
from database.connection import DatabaseManager, execute_query
from services.processamento.divisao_lotes import (
    calcular_geometria_divisao,
    simular_divisao_offset,
    executar_divisao_offset,
    obter_ultima_divisao,
    desfazer_divisao,
)


class TestDivisaoLotes(unittest.TestCase):
    def setUp(self):
        # Polígono de teste com divisa base entre P1 e P2 (500m) e lateral com vários vértices (como no exemplo do usuário)
        self.pontos = [
            {"id": 1, "nome_vertice": "M-01", "tipo_ponto": "M", "e_original": 1000.0, "n_original": 1000.0, "alt_original": 500.0, "ordem_caminhamento": 1},
            {"id": 2, "nome_vertice": "M-02", "tipo_ponto": "M", "e_original": 1500.0, "n_original": 1050.0, "alt_original": 502.0, "ordem_caminhamento": 2},
            {"id": 3, "nome_vertice": "P-03", "tipo_ponto": "P", "e_original": 1480.0, "n_original": 1200.0, "alt_original": 505.0, "ordem_caminhamento": 3},
            {"id": 4, "nome_vertice": "P-04", "tipo_ponto": "P", "e_original": 1520.0, "n_original": 1300.0, "alt_original": 508.0, "ordem_caminhamento": 4},
            {"id": 5, "nome_vertice": "P-05", "tipo_ponto": "P", "e_original": 1490.0, "n_original": 1450.0, "alt_original": 510.0, "ordem_caminhamento": 5},
            {"id": 6, "nome_vertice": "P-06", "tipo_ponto": "P", "e_original": 1400.0, "n_original": 1460.0, "alt_original": 512.0, "ordem_caminhamento": 6},
            {"id": 7, "nome_vertice": "P-07", "tipo_ponto": "P", "e_original": 1050.0, "n_original": 1400.0, "alt_original": 507.0, "ordem_caminhamento": 7},
            {"id": 8, "nome_vertice": "P-08", "tipo_ponto": "P", "e_original": 1020.0, "n_original": 1200.0, "alt_original": 503.0, "ordem_caminhamento": 8},
        ]

    def test_divisao_areas_iguais(self):
        res = calcular_geometria_divisao(
            pontos=self.pontos,
            ponto_base_1_id=1,
            ponto_base_2_id=2,
            modo="AREAS_IGUAIS",
            alvo="BASE"
        )
        self.assertTrue(res["sucesso"])
        self.assertAlmostEqual(res["lote_base"]["percentual"], 50.0, delta=0.05)
        self.assertAlmostEqual(res["lote_remanescente"]["percentual"], 50.0, delta=0.05)
        area_soma = res["lote_base"]["area_m2"] + res["lote_remanescente"]["area_m2"]
        self.assertAlmostEqual(area_soma, res["area_total_m2"], delta=0.1)
        self.assertEqual(len(res["pontos_corte"]), 2)

    def test_divisao_area_definida_base(self):
        # 5 hectares = 50.000 m²
        area_alvo = 50000.0
        res = calcular_geometria_divisao(
            pontos=self.pontos,
            ponto_base_1_id=1,
            ponto_base_2_id=2,
            modo="AREA_DEFINIDA",
            alvo="BASE",
            area_alvo_m2=area_alvo
        )
        self.assertTrue(res["sucesso"])
        self.assertAlmostEqual(res["lote_base"]["area_m2"], area_alvo, delta=0.1)
        self.assertEqual(res["lote_base"]["area_ha"], 5.0)
        area_soma = res["lote_base"]["area_m2"] + res["lote_remanescente"]["area_m2"]
        self.assertAlmostEqual(area_soma, res["area_total_m2"], delta=0.1)

    def test_divisao_area_definida_remanescente(self):
        # 8 hectares = 80.000 m² para o remanescente
        area_alvo = 80000.0
        res = calcular_geometria_divisao(
            pontos=self.pontos,
            ponto_base_1_id=1,
            ponto_base_2_id=2,
            modo="AREA_DEFINIDA",
            alvo="REMANESCENTE",
            area_alvo_m2=area_alvo
        )
        self.assertTrue(res["sucesso"])
        self.assertAlmostEqual(res["lote_remanescente"]["area_m2"], area_alvo, delta=0.1)
        self.assertEqual(res["lote_remanescente"]["area_ha"], 8.0)

    def test_area_alvo_invalida(self):
        # Área maior que o total deve levantar ValueError
        with self.assertRaises(ValueError):
            calcular_geometria_divisao(
                pontos=self.pontos,
                ponto_base_1_id=1,
                ponto_base_2_id=2,
                modo="AREA_DEFINIDA",
                alvo="BASE",
                area_alvo_m2=9999999.0
            )


COORDS = [(1000, 1000, 500), (1500, 1050, 502), (1480, 1200, 505), (1520, 1300, 508),
          (1490, 1450, 510), (1400, 1460, 512), (1050, 1400, 507), (1020, 1200, 503)]


class TestDivisaoLotesPersistencia(unittest.TestCase):
    """Integração com o banco de testes: desmembramento simples e separação de perímetro unificado."""

    def setUp(self):
        self.area_total_m2 = Polygon([(e, n) for e, n, _ in COORDS]).area
        with DatabaseManager() as conn:
            c = conn.cursor()
            c.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Prof Divisao', 'D1', 'DIV')")
            prof = c.lastrowid
            c.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Divisao', 'X', 'PR')")
            self.prop = c.lastrowid
            c.execute("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio) VALUES (?, ?, '2026-01-01')", (self.prop, prof))
            self.lev = c.lastrowid
            c.execute(
                "INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha, cri_comarca, livro_registro) VALUES (?, '900', ?, 'Umuarama', '2-RG')",
                (self.prop, self.area_total_m2 / 10000.0),
            )
            self.mat_p = c.lastrowid
            self.pids = []
            for i, (e, n, alt) in enumerate(COORDS, start=1):
                c.execute(
                    "INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, "
                    "e_original, n_original, alt_original, fuso_utm, ordem_caminhamento) "
                    "VALUES (?, ?, ?, 'M', -23.5, -53.4, ?, ?, ?, ?, 22, ?)",
                    (self.lev, self.mat_p, f"M-{i:02d}", alt, e, n, alt, i),
                )
                self.pids.append(c.lastrowid)
            for i in range(len(self.pids)):
                c.execute(
                    "INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, tipo_limite_sigef, metodo_posicionamento_sigef) "
                    "VALUES (?, ?, ?, ?, 'CERCA', 'PG1')",
                    (self.lev, self.mat_p, self.pids[i], self.pids[(i + 1) % len(self.pids)]),
                )

    def tearDown(self):
        with DatabaseManager() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM divisao_lotes_snapshots WHERE levantamento_id = ?", (self.lev,))
            c.execute("DELETE FROM segmentos WHERE levantamento_id = ?", (self.lev,))
            c.execute("DELETE FROM pontos WHERE levantamento_id = ?", (self.lev,))
            c.execute("DELETE FROM historico_alteracoes_campo WHERE levantamento_id = ?", (self.lev,))
            c.execute("DELETE FROM levantamentos WHERE id = ?", (self.lev,))
            c.execute("UPDATE matriculas SET matricula_origem_desenho_id = NULL WHERE propriedade_id = ?", (self.prop,))
            c.execute("DELETE FROM matriculas WHERE propriedade_id = ?", (self.prop,))
            c.execute("DELETE FROM propriedades WHERE id = ?", (self.prop,))

    def _segmentos(self, mat_id):
        return execute_query("SELECT * FROM segmentos WHERE levantamento_id = ? AND matricula_id = ?",
                             params=(self.lev, mat_id), fetch_all=True)

    def _pontos(self, mat_id):
        return execute_query("SELECT * FROM pontos WHERE levantamento_id = ? AND matricula_id = ? ORDER BY ordem_caminhamento",
                             params=(self.lev, mat_id), fetch_all=True)

    def test_desmembramento_simples_preserva_dados_e_segmentos(self):
        res = executar_divisao_offset(self.lev, self.mat_p, self.pids[0], self.pids[1], "AREAS_IGUAIS")
        self.assertTrue(res["sucesso"])
        mat_a = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(self.mat_p,), fetch_one=True)
        mat_b = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(res["gleba_b"]["matricula_id"],), fetch_one=True)
        self.assertEqual(mat_a["numero_matricula"], "900")  # número oficial preservado
        self.assertIsNone(mat_b["matricula_origem_desenho_id"])  # B tem desenho próprio
        self.assertEqual(mat_b["cri_comarca"], "Umuarama")
        self.assertEqual(mat_b["livro_registro"], "2-RG")
        self.assertAlmostEqual(mat_a["area_ha"] + mat_b["area_ha"], self.area_total_m2 / 10000.0, delta=0.001)

        for mat_id in (self.mat_p, mat_b["id"]):
            pts, segs = self._pontos(mat_id), self._segmentos(mat_id)
            self.assertGreaterEqual(len(pts), 3)
            self.assertEqual(len(segs), len(pts))  # anel fechado, uma aresta por vértice
        # Divisas originais (CERCA) foram herdadas também pela Gleba B
        self.assertTrue(any(s["tipo_limite_sigef"] == "CERCA" for s in self._segmentos(mat_b["id"])))

    def test_separacao_de_perimetro_unificado(self):
        with DatabaseManager() as conn:
            c = conn.cursor()
            c.execute("UPDATE matriculas SET area_ha = ? WHERE id = ?", (self.area_total_m2 * 0.6 / 10000.0, self.mat_p))
            c.execute(
                "INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha, matricula_origem_desenho_id) VALUES (?, '901', ?, ?)",
                (self.prop, self.area_total_m2 * 0.4 / 10000.0, self.mat_p),
            )
            mat_d = c.lastrowid

        # Enquanto unificada, a matrícula não pode ser dividida em modo simples
        with self.assertRaises(ValueError):
            simular_divisao_offset(self.lev, mat_d, self.pids[0], self.pids[1], "AREAS_IGUAIS")

        sim = simular_divisao_offset(self.lev, mat_d, self.pids[0], self.pids[1], "SEPARAR_MATRICULAS", matricula_base_id=mat_d)
        self.assertAlmostEqual(sim["lote_base"]["area_m2"], self.area_total_m2 * 0.4, delta=0.1)

        res = executar_divisao_offset(self.lev, mat_d, self.pids[0], self.pids[1], "SEPARAR_MATRICULAS", matricula_base_id=mat_d)
        self.assertEqual(res["tipo_operacao"], "SEPARACAO")
        d = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(mat_d,), fetch_one=True)
        p = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(self.mat_p,), fetch_one=True)
        self.assertIsNone(d["matricula_origem_desenho_id"])
        self.assertEqual((d["numero_matricula"], p["numero_matricula"]), ("901", "900"))  # números intactos
        self.assertAlmostEqual(d["area_ha"], self.area_total_m2 * 0.4 / 10000.0, places=4)  # área registrada intacta
        for mat_id in (mat_d, self.mat_p):
            pts, segs = self._pontos(mat_id), self._segmentos(mat_id)
            self.assertGreaterEqual(len(pts), 3)
            self.assertEqual(len(segs), len(pts))

    def _estado(self):
        pts = execute_query("SELECT id, matricula_id, ordem_caminhamento FROM pontos WHERE levantamento_id = ? ORDER BY id",
                            params=(self.lev,), fetch_all=True)
        segs = execute_query("SELECT id, matricula_id, ponto_inicio_id, ponto_fim_id, tipo_limite_sigef FROM segmentos "
                             "WHERE levantamento_id = ? ORDER BY id", params=(self.lev,), fetch_all=True)
        mats = execute_query("SELECT id, numero_matricula, area_ha, matricula_origem_desenho_id FROM matriculas "
                             "WHERE propriedade_id = ? ORDER BY id", params=(self.prop,), fetch_all=True)
        return [tuple(r) for r in pts], [tuple(r) for r in segs], [tuple(r) for r in mats]

    def test_desfazer_desmembramento_restaura_estado_exato(self):
        antes = self._estado()
        res = executar_divisao_offset(self.lev, self.mat_p, self.pids[0], self.pids[1], "AREAS_IGUAIS")
        self.assertNotEqual(self._estado(), antes)
        ultima = obter_ultima_divisao(self.lev)
        self.assertTrue(ultima["pode_desfazer"])
        self.assertEqual(ultima["snapshot_id"], res["snapshot_id"])

        desfazer_divisao(self.lev, res["snapshot_id"])
        self.assertEqual(self._estado(), antes)
        self.assertFalse(obter_ultima_divisao(self.lev)["disponivel"])
        with self.assertRaises(ValueError):  # não desfaz duas vezes
            desfazer_divisao(self.lev, res["snapshot_id"])

    def test_desfazer_separacao_restaura_vinculo_de_desenho(self):
        with DatabaseManager() as conn:
            c = conn.cursor()
            c.execute("UPDATE matriculas SET area_ha = ? WHERE id = ?", (self.area_total_m2 * 0.6 / 10000.0, self.mat_p))
            c.execute(
                "INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha, matricula_origem_desenho_id) VALUES (?, '901', ?, ?)",
                (self.prop, self.area_total_m2 * 0.4 / 10000.0, self.mat_p),
            )
            mat_d = c.lastrowid
        antes = self._estado()
        res = executar_divisao_offset(self.lev, mat_d, self.pids[0], self.pids[1], "SEPARAR_MATRICULAS", matricula_base_id=mat_d)
        desfazer_divisao(self.lev, res["snapshot_id"])
        self.assertEqual(self._estado(), antes)

    def test_desfazer_bloqueado_se_algo_mudou_depois(self):
        res = executar_divisao_offset(self.lev, self.mat_p, self.pids[0], self.pids[1], "AREAS_IGUAIS")
        execute_query("UPDATE segmentos SET tipo_limite_sigef = 'RIO' WHERE id = (SELECT MIN(id) FROM segmentos WHERE levantamento_id = ?)",
                      params=(self.lev,), commit=True)
        self.assertFalse(obter_ultima_divisao(self.lev)["pode_desfazer"])
        with self.assertRaises(ValueError):
            desfazer_divisao(self.lev, res["snapshot_id"])

    def test_falha_nao_deixa_banco_pela_metade(self):
        with self.assertRaises(ValueError):
            executar_divisao_offset(self.lev, self.mat_p, self.pids[0], self.pids[2], "AREAS_IGUAIS")  # não adjacentes
        n_mat = execute_query("SELECT COUNT(*) AS n FROM matriculas WHERE propriedade_id = ?", params=(self.prop,), fetch_one=True)["n"]
        self.assertEqual(n_mat, 1)


if __name__ == "__main__":
    unittest.main()
