import unittest
from services.processamento.geoprocessamento import geodesic_to_ecef, ecef_to_geodesic

class TestGeoprocessamento(unittest.TestCase):
    def test_geodesic_to_ecef_and_back(self):
        """Test conversion logic from geodesic to ECEF and back."""
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

if __name__ == '__main__':
    unittest.main()
