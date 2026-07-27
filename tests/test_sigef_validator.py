import unittest
import math
from services.processamento.sigef_validator import SigefValidator, VertexGenerator

class TestSigefValidator(unittest.TestCase):
>>>>>>> origin/test-improve-sigef-validator-edge-cases-16526130896100960309
    def test_validar_conformidade_boundary(self):
        # 1-Sigma: limits are 0.50, 3.00, 7.50

        # Test exact boundary (<= should pass)
        conforme, msg = SigefValidator.validar_conformidade(0.50, "artificial")
        self.assertTrue(conforme)
        self.assertIn("CONFORME", msg)

        conforme, msg = SigefValidator.validar_conformidade(3.00, "natural")
        self.assertTrue(conforme)
        self.assertIn("CONFORME", msg)

        conforme, msg = SigefValidator.validar_conformidade(7.50, "inacessivel")
        self.assertTrue(conforme)
        self.assertIn("CONFORME", msg)

    def test_validar_conformidade_below_boundary(self):
        conforme, msg = SigefValidator.validar_conformidade(0.49, "artificial")
        self.assertTrue(conforme)
        self.assertIn("CONFORME", msg)

    def test_validar_conformidade_above_boundary(self):
        conforme, msg = SigefValidator.validar_conformidade(0.51, "artificial")
        self.assertFalse(conforme)
        self.assertIn("REPROVADO", msg)

    def test_validar_conformidade_missing_data(self):
        conforme, msg = SigefValidator.validar_conformidade(None, "artificial")
        self.assertFalse(conforme)
        self.assertEqual(msg, "Faltam dados σ")

    def test_validar_conformidade_nan(self):
        conforme, msg = SigefValidator.validar_conformidade(float('nan'), "artificial")
        # NaN <= 0.50 is False in Python
        self.assertFalse(conforme)
        self.assertIn("REPROVADO", msg)

    def test_validar_conformidade_invalid_type(self):
        conforme, msg = SigefValidator.validar_conformidade(0.50, "desconhecido")
        self.assertFalse(conforme)
        self.assertIn("desconhecido", msg)

    # 95% Confidence Tests
    def test_validar_conformidade_95_boundary(self):
        conforme, msg = SigefValidator.validar_conformidade_95(0.50, "artificial")
        self.assertTrue(conforme)
        self.assertIn("CONFORME (95%)", msg)

        conforme, msg = SigefValidator.validar_conformidade_95(3.00, "natural")
        self.assertTrue(conforme)
        self.assertIn("CONFORME (95%)", msg)

        conforme, msg = SigefValidator.validar_conformidade_95(7.50, "inacessivel")
        self.assertTrue(conforme)
        self.assertIn("CONFORME (95%)", msg)

    def test_validar_conformidade_95_below_boundary(self):
        conforme, msg = SigefValidator.validar_conformidade_95(0.49, "artificial")
        self.assertTrue(conforme)
        self.assertIn("CONFORME (95%)", msg)

    def test_validar_conformidade_95_above_boundary(self):
        conforme, msg = SigefValidator.validar_conformidade_95(0.51, "artificial")
        self.assertFalse(conforme)
        self.assertIn("REPROVADO (95%)", msg)

    def test_validar_conformidade_95_missing_data(self):
        conforme, msg = SigefValidator.validar_conformidade_95(None, "artificial")
        self.assertFalse(conforme)
        self.assertEqual(msg, "Faltam dados σ")

    def test_validar_conformidade_95_nan(self):
        conforme, msg = SigefValidator.validar_conformidade_95(float('nan'), "artificial")
        self.assertFalse(conforme)
        self.assertIn("REPROVADO (95%)", msg)

    def test_validar_conformidade_95_invalid_type(self):
        conforme, msg = SigefValidator.validar_conformidade_95(0.50, "desconhecido")
        self.assertFalse(conforme)
        self.assertIn("desconhecido", msg)

    # Vertical Compliance Tests
    def test_validar_conformidade_vertical_boundary(self):
        conforme, msg = SigefValidator.validar_conformidade_vertical(1.00, "artificial")
        self.assertTrue(conforme)
        self.assertIn("CONFORME VERTICAL", msg)

        conforme, msg = SigefValidator.validar_conformidade_vertical(6.00, "natural")
        self.assertTrue(conforme)
        self.assertIn("CONFORME VERTICAL", msg)

        conforme, msg = SigefValidator.validar_conformidade_vertical(15.00, "inacessivel")
        self.assertTrue(conforme)
        self.assertIn("CONFORME VERTICAL", msg)

    def test_validar_conformidade_vertical_below_boundary(self):
        conforme, msg = SigefValidator.validar_conformidade_vertical(0.99, "artificial")
        self.assertTrue(conforme)
        self.assertIn("CONFORME VERTICAL", msg)

    def test_validar_conformidade_vertical_above_boundary(self):
        conforme, msg = SigefValidator.validar_conformidade_vertical(1.01, "artificial")
        self.assertFalse(conforme)
        self.assertIn("REPROVADO VERTICAL", msg)

    def test_validar_conformidade_vertical_missing_data(self):
        conforme, msg = SigefValidator.validar_conformidade_vertical(None, "artificial")
        self.assertFalse(conforme)
        self.assertEqual(msg, "Faltam dados σZ")

    def test_validar_conformidade_vertical_nan(self):
        conforme, msg = SigefValidator.validar_conformidade_vertical(float('nan'), "artificial")
        self.assertFalse(conforme)
        self.assertIn("REPROVADO VERTICAL", msg)

    def test_validar_conformidade_vertical_invalid_type(self):
        conforme, msg = SigefValidator.validar_conformidade_vertical(1.00, "desconhecido")
        self.assertFalse(conforme)
        self.assertIn("desconhecido", msg)

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> origin/fix/test-sigef-validator-calcular-sigma-p-15516967109512420649
    # calcular_sigma_p Tests
    def test_calcular_sigma_p_normal(self):
        """Test normal values (Pythagorean triple 3, 4 -> 5)"""
        resultado = SigefValidator.calcular_sigma_p(3.0, 4.0)
        self.assertAlmostEqual(resultado, 5.0, places=4)

        resultado = SigefValidator.calcular_sigma_p(0.3, 0.4)
        self.assertAlmostEqual(resultado, 0.5, places=4)

    def test_calcular_sigma_p_none(self):
        """Test that sending None returns None"""
        self.assertIsNone(SigefValidator.calcular_sigma_p(None, 4.0))
        self.assertIsNone(SigefValidator.calcular_sigma_p(3.0, None))
        self.assertIsNone(SigefValidator.calcular_sigma_p(None, None))

    def test_calcular_sigma_p_zeros(self):
        """Test with zeros"""
        resultado = SigefValidator.calcular_sigma_p(0.0, 0.0)
        self.assertAlmostEqual(resultado, 0.0, places=4)

    def test_calcular_sigma_p_negatives(self):
        """Test with negative values (squares should handle it)"""
        resultado = SigefValidator.calcular_sigma_p(-3.0, 4.0)
        self.assertAlmostEqual(resultado, 5.0, places=4)

        resultado = SigefValidator.calcular_sigma_p(3.0, -4.0)
        self.assertAlmostEqual(resultado, 5.0, places=4)

        resultado = SigefValidator.calcular_sigma_p(-3.0, -4.0)
        self.assertAlmostEqual(resultado, 5.0, places=4)

    def test_calcular_sigma_p_nan_inf(self):
        """Test with special floats NaN and Inf"""
        # math.sqrt with inf or nan doesn't raise, it returns inf or nan.
        # But let's assert their nature.
        res_nan = SigefValidator.calcular_sigma_p(float('nan'), 4.0)
        self.assertTrue(math.isnan(res_nan))

        res_inf = SigefValidator.calcular_sigma_p(float('inf'), 4.0)
        self.assertTrue(math.isinf(res_inf))

<<<<<<< HEAD
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

class TestVertexGenerator(unittest.TestCase):

    def test_gerar_nome_vertice_valido(self):
        self.assertEqual(VertexGenerator.gerar_nome_vertice("ABCD", "M", 1), "ABCD-M-0001")
        self.assertEqual(VertexGenerator.gerar_nome_vertice("wxyz", "p", 1010), "WXYZ-P-1010")

class TestVertexGenerator(unittest.TestCase):
    def test_gerar_nome_vertice_invalid_type(self):
        """Test that an invalid vertex type raises ValueError"""
        with self.assertRaises(ValueError) as context:
            VertexGenerator.gerar_nome_vertice("ABCD", "X", 1)
        self.assertIn("Tipo de vértice X inválido. Deve ser M, P ou V.", str(context.exception))

    def test_gerar_nome_vertice_invalid_credenciado_length(self):
        """Test that an invalid credenciado code length raises ValueError"""
        with self.assertRaises(ValueError) as context:
            VertexGenerator.gerar_nome_vertice("ABC", "M", 1)
        self.assertIn("O código do credenciado deve ter 4 dígitos.", str(context.exception))

        with self.assertRaises(ValueError) as context:
            VertexGenerator.gerar_nome_vertice("ABCDE", "M", 1)

    def test_gerar_nome_vertice_codigo_invalido(self):
        with self.assertRaises(ValueError):
            VertexGenerator.gerar_nome_vertice("ABC", "M", 1)

=======
>>>>>>> origin/test-improve-sigef-validator-edge-cases-16526130896100960309
if __name__ == '__main__':
    unittest.main()
