import unittest
import math
from services.processamento.sigef_validator import SigefValidator

class TestSigefValidator(unittest.TestCase):
    def test_formatar_azimute_happy_path(self):
        """Test formatting of standard azimuth values within [0, 360)"""
        self.assertEqual(SigefValidator._formatar_azimute(125.51255555555555), "125° 30' 45.20\"")
        self.assertEqual(SigefValidator._formatar_azimute(0.0), "0° 00' 00.00\"")
        self.assertEqual(SigefValidator._formatar_azimute(45.0), "45° 00' 00.00\"")

    def test_formatar_azimute_normalization_exact_360(self):
        """Test normalization where 360 degrees should become 0 degrees"""
        self.assertEqual(SigefValidator._formatar_azimute(360.0), "0° 00' 00.00\"")

    def test_formatar_azimute_normalization_negative(self):
        """Test normalization for negative angles"""
        # -10° should be 350°
        self.assertEqual(SigefValidator._formatar_azimute(-10.0), "350° 00' 00.00\"")
        self.assertEqual(SigefValidator._formatar_azimute(-90.5), "269° 30' 00.00\"")
        self.assertEqual(SigefValidator._formatar_azimute(-400.0), "320° 00' 00.00\"")

    def test_formatar_azimute_normalization_greater_than_360(self):
        """Test normalization for angles greater than 360°"""
        # 370° should be 10°
        self.assertEqual(SigefValidator._formatar_azimute(370.0), "10° 00' 00.00\"")
        self.assertEqual(SigefValidator._formatar_azimute(720.0), "0° 00' 00.00\"")

    def test_formatar_azimute_extreme_fractions(self):
        """Test extremely small fraction of seconds formatting"""
        # 0.00001 deg is about 0.036 seconds
        self.assertEqual(SigefValidator._formatar_azimute(0.00001), "0° 00' 00.04\"")
        # Ensure it accurately preserves formatting at a high detail
        self.assertEqual(SigefValidator._formatar_azimute(10.123456789), "10° 07' 24.44\"")

    def test_formatar_azimute_nan_inf(self):
        """Test that passing NaN or Infinity raises ValueError"""
        with self.assertRaises(ValueError):
            SigefValidator._formatar_azimute(float('nan'))

        with self.assertRaises(ValueError):
            SigefValidator._formatar_azimute(float('inf'))

        with self.assertRaises(ValueError):
            SigefValidator._formatar_azimute(float('-inf'))

    def test_formatar_azimute_cascading_rounding(self):
        """Test that rounding seconds does not produce 60.00"""
        # 12° 59' 59.999" is approximately 12.999999722222222 degrees.
        # This tests the cascade effect: 59.999 -> 60s -> 00s, 59m -> 60m -> 00m, 12deg -> 13deg.
        self.assertEqual(SigefValidator._formatar_azimute(12.999999722222222), "13° 00' 00.00\"")
        
        # 359° 59' 59.999" -> Should cascade to 360° -> 0° 00' 00.00"
        self.assertEqual(SigefValidator._formatar_azimute(359.999999), "0° 00' 00.00\"")

if __name__ == '__main__':
    unittest.main()
