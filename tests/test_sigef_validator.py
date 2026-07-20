import unittest
import math
from services.processamento.sigef_validator import SigefValidator

class TestSigefValidator(unittest.TestCase):
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

if __name__ == '__main__':
    unittest.main()
