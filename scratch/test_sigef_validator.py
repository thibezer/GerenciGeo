import unittest
import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.processamento.sigef_validator import SigefValidator

class TestSigefValidator(unittest.TestCase):

    def test_formatar_azimute_normal(self):
        """Testa a formatação normal de azimute."""
        self.assertEqual(SigefValidator._formatar_azimute(125.5125555), '125° 30\' 45.20"')

    def test_formatar_azimute_limites(self):
        """Testa azimutes nos limites 0 e 360."""
        self.assertEqual(SigefValidator._formatar_azimute(0.0), '0° 00\' 00.00"')
        self.assertEqual(SigefValidator._formatar_azimute(360.0), '0° 00\' 00.00"')

    def test_formatar_azimute_negativos_e_overflow(self):
        """Testa azimutes negativos e maiores que 360 graus."""
        self.assertEqual(SigefValidator._formatar_azimute(-45.0), '315° 00\' 00.00"')
        self.assertEqual(SigefValidator._formatar_azimute(370.0), '10° 00\' 00.00"')

    def test_formatar_azimute_cascata_arredondamento(self):
        """Testa o arredondamento em cascata de segundos para minutos e graus."""
        # 12° 59' 59.999" -> 13° 00' 00.00"
        # 12.999999722222222 converts to roughly 12° 59' 59.999"
        # We can test an exact value that should trigger rounding when formatted to 2 decimal places.
        # 59.996 seconds will format to 60.00" if we just use string formatting,
        # which is incorrect. It should be 00.00" and bump the minute.

        # Calculate exactly 12 degrees, 59 minutes, 59.996 seconds
        val = 12 + 59/60.0 + 59.996/3600.0
        self.assertEqual(SigefValidator._formatar_azimute(val), '13° 00\' 00.00"')

        # Calculate exactly 359 degrees, 59 minutes, 59.996 seconds
        # This should roll over to 360 degrees -> 0 degrees
        val2 = 359 + 59/60.0 + 59.996/3600.0
        self.assertEqual(SigefValidator._formatar_azimute(val2), '0° 00\' 00.00"')

    def test_formatar_azimute_invalid_inputs(self):
        """Testa o comportamento com entradas inválidas (None, NaN)."""
        with self.assertRaises(ValueError):
            SigefValidator._formatar_azimute(None)

        with self.assertRaises(ValueError):
            SigefValidator._formatar_azimute(float('nan'))

if __name__ == '__main__':
    unittest.main()
