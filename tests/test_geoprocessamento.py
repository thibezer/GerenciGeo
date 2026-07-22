import unittest
import math
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
        # Valores aproximados para São Paulo/SP (lat: -23.550520, lon: -46.633308)
        # transformados para a zona 22S
        e, n = latlon_to_utm22s(-23.550520, -46.633308)
        self.assertIsInstance(e, float)
        self.assertIsInstance(n, float)

    def test_latlon_to_utm22s_invalidos(self):
        # Verifica se o código levanta exceção adequada ou falha
        # ao tentar converter tipos inválidos (a função original assume que as strings
        # podem ser convertidas em float, caso não possam, gerará ValueError)
        with self.assertRaises(ValueError):
            latlon_to_utm22s("invalido", -46.6)

        with self.assertRaises(ValueError):
            latlon_to_utm22s(-23.5, "invalido")

    def test_geodesic_to_ecef_and_back(self):
        lat = -23.550520
        lon = -46.633308
        alt = 800.0

        x, y, z = geodesic_to_ecef(lat, lon, alt)
        self.assertIsInstance(x, float)
        self.assertIsInstance(y, float)
        self.assertIsInstance(z, float)

        # Convert back
        lat_b, lon_b, alt_b = ecef_to_geodesic(x, y, z)

        self.assertAlmostEqual(lat, lat_b, places=5)
        self.assertAlmostEqual(lon, lon_b, places=5)
        self.assertAlmostEqual(alt, alt_b, places=3)

    def test_ecef_to_geodesic_zero(self):
        # Se x, y, z forem próximos de 0, p é 0, o código trata essa borda (polos ou centro da terra)
        # testando o centro da terra (0,0,0) - o código original atribui lat= -90.0 e alt=0 - b
        lat, lon, alt = ecef_to_geodesic(0.0, 0.0, 0.0)
        self.assertEqual(lat, -90.0)
        self.assertEqual(lon, 0.0)
        self.assertLess(alt, 0)

    def test_ecef_to_geodesic_polo_norte(self):
        # Testar um valor z positivo e x,y = 0 para verificar if p < 1e-10: lat = 90.0 if z > 0 else -90.0
        lat, lon, alt = ecef_to_geodesic(0.0, 0.0, 6356752.314)
        self.assertEqual(lat, 90.0)
        self.assertEqual(lon, 0.0)
        # A altitude será próxima de 0 se o Z for o raio polar b, 6356752.314
        self.assertAlmostEqual(alt, 0, places=0)

if __name__ == '__main__':
    unittest.main()
