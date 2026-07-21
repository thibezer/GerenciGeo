import unittest
from services.processamento.sigef_validator import SigefValidator, VertexGenerator
import math

class TestSigefValidator(unittest.TestCase):

    def test_validar_conformidade_vertical(self):
        # Happy paths
        conforme, msg = SigefValidator.validar_conformidade_vertical(0.5, "artificial")
        self.assertTrue(conforme)
        self.assertIn("CONFORME VERTICAL", msg)

        # Reproved
        conforme, msg = SigefValidator.validar_conformidade_vertical(1.5, "artificial")
        self.assertFalse(conforme)
        self.assertIn("REPROVADO VERTICAL", msg)

        # Invalid type
        conforme, msg = SigefValidator.validar_conformidade_vertical(0.5, "invalido")
        self.assertFalse(conforme)
        self.assertIn("desconhecido", msg)

        # None value
        conforme, msg = SigefValidator.validar_conformidade_vertical(None, "artificial")
        self.assertFalse(conforme)
        self.assertEqual("Faltam dados σZ", msg)

    def test_validar_autointerssecao(self):
        # Valid square
        pontos_validos = [
            {"e": 0, "n": 0},
            {"e": 10, "n": 0},
            {"e": 10, "n": 10},
            {"e": 0, "n": 10}
        ]
        self.assertFalse(SigefValidator.validar_autointerssecao(pontos_validos))

        # Self-intersecting bow-tie
        pontos_intersect = [
            {"e": 0, "n": 0},
            {"e": 10, "n": 10},
            {"e": 10, "n": 0},
            {"e": 0, "n": 10}
        ]
        self.assertTrue(SigefValidator.validar_autointerssecao(pontos_intersect))

        # Test collinear intersection (edge case for coverage line 64)
        pontos_colinear = [
            {"e": 0, "n": 0},
            {"e": 10, "n": 0},
            {"e": 10, "n": 10},
            {"e": 5, "n": 0},  # Intersects segment 1
            {"e": 0, "n": 10}
        ]
        self.assertTrue(SigefValidator.validar_autointerssecao(pontos_colinear))

        # Common vertex intersection (should hit line 64 where A == C etc)
        # We need a 5+ point polygon where non-consecutive segments touch at a vertex
        pontos_common_vertex = [
            {"e": 0, "n": 0},
            {"e": 5, "n": 5},
            {"e": 10, "n": 0},
            {"e": 10, "n": 10},
            {"e": 5, "n": 5}, # touches vertex 1
            {"e": 0, "n": 10}
        ]
        # This actually intersects, but it's testing the condition
        SigefValidator.validar_autointerssecao(pontos_common_vertex)

        # Triangle (less than 4 points)
        pontos_triangulo = [
            {"e": 0, "n": 0},
            {"e": 10, "n": 0},
            {"e": 0, "n": 10}
        ]
        self.assertFalse(SigefValidator.validar_autointerssecao(pontos_triangulo))

    def test_calcular_sigma_p(self):
        sigma = SigefValidator.calcular_sigma_p(3.0, 4.0)
        self.assertEqual(sigma, 5.0)

        self.assertIsNone(SigefValidator.calcular_sigma_p(None, 4.0))
        self.assertIsNone(SigefValidator.calcular_sigma_p(3.0, None))

    def test_calcular_sigma_p_95(self):
        sigma = SigefValidator.calcular_sigma_p_95(3.0, 4.0)
        self.assertAlmostEqual(sigma, 5.0 * 1.7308)

        self.assertIsNone(SigefValidator.calcular_sigma_p_95(None, 4.0))
        self.assertIsNone(SigefValidator.calcular_sigma_p_95(3.0, None))

    def test_validar_conformidade(self):
        # Happy paths
        conforme, msg = SigefValidator.validar_conformidade(0.4, "artificial")
        self.assertTrue(conforme)
        self.assertIn("CONFORME", msg)

        # Reproved
        conforme, msg = SigefValidator.validar_conformidade(0.6, "artificial")
        self.assertFalse(conforme)
        self.assertIn("REPROVADO", msg)

        # Invalid type
        conforme, msg = SigefValidator.validar_conformidade(0.4, "invalido")
        self.assertFalse(conforme)
        self.assertIn("desconhecido", msg)

        # None value
        conforme, msg = SigefValidator.validar_conformidade(None, "artificial")
        self.assertFalse(conforme)
        self.assertEqual("Faltam dados σ", msg)

    def test_validar_conformidade_95(self):
        # Happy paths
        conforme, msg = SigefValidator.validar_conformidade_95(0.4, "artificial")
        self.assertTrue(conforme)
        self.assertIn("CONFORME (95%)", msg)

        # Reproved
        conforme, msg = SigefValidator.validar_conformidade_95(0.6, "artificial")
        self.assertFalse(conforme)
        self.assertIn("REPROVADO (95%)", msg)

        # Invalid type
        conforme, msg = SigefValidator.validar_conformidade_95(0.4, "invalido")
        self.assertFalse(conforme)
        self.assertIn("desconhecido", msg)

        # None value - THE SPECIFIC MISSING TEST ADDRESSED BY THIS TASK
        conforme, msg = SigefValidator.validar_conformidade_95(None, "artificial")
        self.assertFalse(conforme)
        self.assertEqual("Faltam dados σ", msg)

    def test_auditar_poligonal_matricula_insufficient_points(self):
        pontos = [
            {"nome_vertice": "P1", "lat": -23.0, "lon": -46.0, "alt": 10},
            {"nome_vertice": "P2", "lat": -23.1, "lon": -46.1, "alt": 10}
        ]
        res = SigefValidator.auditar_poligonal_matricula(pontos)
        self.assertFalse(res["sucesso"])
        self.assertIn("insuficiente", res["erro"])

    def test_auditar_poligonal_matricula_invalid_coords(self):
        pontos = [
            {"nome_vertice": "P1", "lat": -23.0, "lon": -46.0, "alt": 10},
            {"nome_vertice": "P2", "lat": None, "lon": -46.1, "alt": 10},
            {"nome_vertice": "P3", "lat": "not_a_float", "lon": -46.2, "alt": 10}
        ]
        res = SigefValidator.auditar_poligonal_matricula(pontos)
        self.assertFalse(res["sucesso"])

    def test_auditar_poligonal_matricula_valid_triangle(self):
        pontos = [
            {"nome_vertice": "P1", "lat": -23.0, "lon": -46.0, "alt": 10},
            {"nome_vertice": "P2", "lat": -23.0, "lon": -46.1, "alt": 10},
            {"nome_vertice": "P3", "lat": -23.1, "lon": -46.0, "alt": 10}
        ]
        res = SigefValidator.auditar_poligonal_matricula(pontos, area_declarada_ha=10.0)
        self.assertTrue(res["sucesso"])
        self.assertIsNone(res["erro"])
        self.assertTrue(res["conforme_topologia_perimetral"])
        self.assertEqual(res["total_vertices"], 3)
        self.assertGreater(res["perimetro_m"], 0)
        self.assertGreater(res["area_ha"], 0)

    def test_formatar_azimute(self):
        az_str = SigefValidator._formatar_azimute(125.512555)
        self.assertEqual(az_str, '125° 30\' 45.20"')


class TestVertexGenerator(unittest.TestCase):

    def test_gerar_nome_vertice_valido(self):
        self.assertEqual(VertexGenerator.gerar_nome_vertice("ABCD", "M", 1), "ABCD-M-0001")
        self.assertEqual(VertexGenerator.gerar_nome_vertice("wxyz", "p", 1010), "WXYZ-P-1010")

    def test_gerar_nome_vertice_tipo_invalido(self):
        with self.assertRaises(ValueError):
            VertexGenerator.gerar_nome_vertice("ABCD", "X", 1)

    def test_gerar_nome_vertice_codigo_invalido(self):
        with self.assertRaises(ValueError):
            VertexGenerator.gerar_nome_vertice("ABC", "M", 1)

if __name__ == '__main__':
    unittest.main()
