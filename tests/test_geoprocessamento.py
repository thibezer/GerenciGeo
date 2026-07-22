import math
import unittest
from services.processamento.geoprocessamento import (
    calcular_zona_utm_segura,
    latlon_to_utm22s,
    geodesic_to_ecef,
    ecef_to_geodesic
)

class TestGeoprocessamento(unittest.TestCase):

    def test_calcular_zona_utm_segura_validos(self):
        # Longitude no fuso 22 (ex: -51.0)
        self.assertEqual(calcular_zona_utm_segura(-51.0), 22)
        # Longitude no fuso 21 (ex: -57.0)
        self.assertEqual(calcular_zona_utm_segura(-57.0), 21)
        # Longitude no fuso 23 (ex: -45.0)
        self.assertEqual(calcular_zona_utm_segura(-45.0), 23)
        # Longitude no fuso 24 (ex: -39.0)
        self.assertEqual(calcular_zona_utm_segura(-39.0), 24)

    def test_calcular_zona_utm_segura_bordas(self):
        # Limite inferior do fuso 22 (entre -54 e -48) é -54. (-54 + 180)/6 = 21, int(21)=21, +1=22
        self.assertEqual(calcular_zona_utm_segura(-53.999), 22)
        # Exatamente na borda, a matemática dá fuso 22
        self.assertEqual(calcular_zona_utm_segura(-54.0), 22)
        # Para -54.001 deve cair no fuso 21
        self.assertEqual(calcular_zona_utm_segura(-54.001), 21)

    def test_calcular_zona_utm_segura_invalidos_ou_nulos(self):
        # Fallback esperado: 22
        self.assertEqual(calcular_zona_utm_segura(None), 22)
        self.assertEqual(calcular_zona_utm_segura("string_invalida"), 22)
        self.assertEqual(calcular_zona_utm_segura(float('nan')), 22)

    def test_calcular_zona_utm_segura_fora_limites(self):
        # Se a longitude estiver fora de -180 a 180, o fallback é 22
        self.assertEqual(calcular_zona_utm_segura(180.1), 22)
        self.assertEqual(calcular_zona_utm_segura(-180.1), 22)

    def test_latlon_to_utm22s_happy_path(self):
        # Teste de conversão simples, lat/lon para coordenadas esperadas
        e, n = latlon_to_utm22s(-23.550520, -46.633308)
        self.assertIsInstance(e, float)
        self.assertIsInstance(n, float)

    def test_latlon_to_utm22s_invalidos(self):
        with self.assertRaises(ValueError):
            latlon_to_utm22s("invalido", -46.6)

        with self.assertRaises(ValueError):
            latlon_to_utm22s(-23.5, "invalido")

    def test_geodesic_to_ecef_and_back(self):
        lat = -24.0671222
        lon = -54.2868778
        alt = 250.0

        x, y, z = geodesic_to_ecef(lat, lon, alt)
        self.assertIsNotNone(x)
        self.assertIsNotNone(y)
        self.assertIsNotNone(z)

        lat_c, lon_c, alt_c = ecef_to_geodesic(x, y, z)

        self.assertAlmostEqual(lat, lat_c, places=5)
        self.assertAlmostEqual(lon, lon_c, places=5)
        self.assertAlmostEqual(alt, alt_c, places=1)

    def test_ecef_to_geodesic_zero(self):
        lat, lon, alt = ecef_to_geodesic(0.0, 0.0, 0.0)
        self.assertEqual(lat, -90.0)
        self.assertEqual(lon, 0.0)
        self.assertLess(alt, 0)

    def test_ecef_to_geodesic_polo_norte(self):
        lat, lon, alt = ecef_to_geodesic(0.0, 0.0, 6356752.314)
        self.assertEqual(lat, 90.0)
        self.assertEqual(lon, 0.0)
        self.assertAlmostEqual(alt, 0, places=0)

if __name__ == '__main__':
    unittest.main()
