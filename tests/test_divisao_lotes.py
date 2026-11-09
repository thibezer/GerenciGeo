import unittest
import numpy as np
from services.processamento.divisao_lotes import calcular_geometria_divisao


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


if __name__ == "__main__":
    unittest.main()
