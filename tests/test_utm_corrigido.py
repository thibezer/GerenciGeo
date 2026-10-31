"""
tests/test_utm_corrigido.py
Regra única do UTM corrigido: E/N derivado de lat/lon_corrigido, nunca do cache gravado.
"""

import sqlite3
import unittest

from utils.transformer_cache import get_transformer
from services.processamento.utm_corrigido import (
    geodesica_de_utm,
    sincronizar_utm_corrigido,
    utm_do_ponto,
)


def _geo(e, n, fuso=22):
    return geodesica_de_utm(e, n, fuso)


class TestUtmDoPonto(unittest.TestCase):

    def test_usa_lat_lon_corrigido_e_ignora_e_corrigido_defasado(self):
        lat, lon = _geo(500005.0, 7000000.0)
        p = {
            "lat_corrigido": lat, "lon_corrigido": lon,
            # Cache de uma correção anterior (5 m a oeste)
            "e_corrigido": 500000.0, "n_corrigido": 7000000.0,
            "e_original": 499998.0, "n_original": 6999998.0,
            "fuso_utm": 22,
        }
        e, n, fuso = utm_do_ponto(p)
        self.assertEqual(fuso, 22)
        self.assertAlmostEqual(e, 500005.0, places=3)
        self.assertAlmostEqual(n, 7000000.0, places=3)

    def test_sem_correcao_geodesica_usa_utm_gravado(self):
        p = {"e_corrigido": 500010.0, "n_corrigido": 7000010.0, "e_original": 500000.0, "n_original": 7000000.0, "fuso_utm": 22}
        self.assertEqual(utm_do_ponto(p), (500010.0, 7000010.0, 22))

        bruto = {"e_original": 500000.0, "n_original": 7000000.0, "fuso_utm": 22}
        self.assertEqual(utm_do_ponto(bruto), (500000.0, 7000000.0, 22))

    def test_fuso_forcado_reprojeta_o_ponto(self):
        lat, lon = _geo(500000.0, 7000000.0, 22)
        p = {"lat_corrigido": lat, "lon_corrigido": lon, "fuso_utm": 22}
        e21, n21, fuso = utm_do_ponto(p, fuso=21)
        self.assertEqual(fuso, 21)
        esperado = get_transformer("epsg:4674", "epsg:31981", always_xy=True).transform(lon, lat)
        self.assertAlmostEqual(e21, esperado[0], places=3)
        self.assertAlmostEqual(n21, esperado[1], places=3)

        # UTM gravado em 22 também é reprojetado quando o cálculo pede 21
        gravado = {"e_corrigido": 500000.0, "n_corrigido": 7000000.0, "fuso_utm": 22}
        e, n, _ = utm_do_ponto(gravado, fuso=21)
        self.assertAlmostEqual(e, esperado[0], places=3)
        self.assertAlmostEqual(n, esperado[1], places=3)

    def test_sem_coordenadas(self):
        self.assertIsNone(utm_do_ponto({"nome_vertice": "X"}))


class TestSincronizarUtmCorrigido(unittest.TestCase):

    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("""
            CREATE TABLE pontos (
                id INTEGER PRIMARY KEY, levantamento_id INTEGER,
                lat REAL, lon REAL, lat_corrigido REAL, lon_corrigido REAL,
                e_corrigido REAL, n_corrigido REAL, e_original REAL, n_original REAL, fuso_utm INTEGER
            )
        """)
        lat, lon = _geo(500005.0, 7000000.0)
        lat_b, lon_b = _geo(500000.0, 7000000.0)
        self.conn.executemany(
            "INSERT INTO pontos VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 22)",
            [
                # 1: corrigido, cache defasado
                (1, lat_b, lon_b, lat, lon, 500000.0, 7000000.0, 500000.0, 7000000.0),
                # 2: corrigido, cache vazio
                (2, lat_b, lon_b, lat, lon, None, None, 500000.0, 7000000.0),
                # 3: correção removida: cache volta ao bruto
                (3, lat_b, lon_b, None, None, 500005.0, 7000000.0, 500000.0, 7000000.0),
                # 4: já sincronizado
                (4, lat_b, lon_b, None, None, 500000.0, 7000000.0, 500000.0, 7000000.0),
            ],
        )

    def tearDown(self):
        self.conn.close()

    def test_regrava_cache_a_partir_da_posicao_verdadeira(self):
        alterados = sincronizar_utm_corrigido(self.conn.cursor(), levantamento_id=1)
        self.assertEqual(alterados, 3)
        linhas = {r["id"]: r for r in self.conn.execute("SELECT id, e_corrigido, n_corrigido FROM pontos")}
        self.assertAlmostEqual(linhas[1]["e_corrigido"], 500005.0, places=3)
        self.assertAlmostEqual(linhas[2]["e_corrigido"], 500005.0, places=3)
        self.assertAlmostEqual(linhas[2]["n_corrigido"], 7000000.0, places=3)
        self.assertEqual(linhas[3]["e_corrigido"], 500000.0)
        self.assertEqual(linhas[4]["e_corrigido"], 500000.0)

        # Idempotente
        self.assertEqual(sincronizar_utm_corrigido(self.conn.cursor(), levantamento_id=1), 0)

    def test_filtra_por_ids(self):
        self.assertEqual(sincronizar_utm_corrigido(self.conn.cursor(), ponto_ids=[2]), 1)
        self.assertEqual(sincronizar_utm_corrigido(self.conn.cursor(), ponto_ids=[]), 0)


if __name__ == "__main__":
    unittest.main()
