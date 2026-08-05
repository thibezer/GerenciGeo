import unittest
from utils.geodesia_parser import (
    extract_codigo_parts,
    parse_num_robust,
    parse_dms_robust,
    parse_wkt_point,
    resolver_coordenadas_robust,
    detect_csv_delimiter,
)

class TestGeodesiaParser(unittest.TestCase):
    def test_extract_codigo_parts(self):
        tipo, num, full = extract_codigo_parts("ABC-M-0001")
        self.assertEqual(tipo, "M")
        self.assertEqual(num, 1)
        self.assertEqual(full, "ABC-M-0001")

        tipo_s, num_s, full_s = extract_codigo_parts("P-0042")
        self.assertEqual(tipo_s, "P")
        self.assertEqual(num_s, 42)
        self.assertEqual(full_s, "P-0042")

        invalid_t, invalid_n, invalid_f = extract_codigo_parts("INVALIDO")
        self.assertIsNone(invalid_t)
        self.assertIsNone(extract_codigo_parts(None)[0])
        self.assertIsNone(extract_codigo_parts("")[0])

    def test_parse_num_robust(self):
        self.assertEqual(parse_num_robust("123.45"), 123.45)
        self.assertEqual(parse_num_robust("1.234,56"), 1234.56)
        self.assertEqual(parse_num_robust(" 100,50 \xa0"), 100.50)
        self.assertIsNone(parse_num_robust(None))
        self.assertIsNone(parse_num_robust(""))
        self.assertIsNone(parse_num_robust("abc_invalid"))

    def test_parse_dms_robust(self):
        val = parse_dms_robust("22° 30' 00\" S")
        self.assertAlmostEqual(val, -22.5, places=4)

        val_w = parse_dms_robust("51° 15' 30.5\" W")
        self.assertAlmostEqual(val_w, -51.25847, places=4)

        self.assertIsNone(parse_dms_robust(None))
        self.assertIsNone(parse_dms_robust(""))
        self.assertIsNone(parse_dms_robust("texto_sem_dms"))

    def test_parse_wkt_point(self):
        lon, lat = parse_wkt_point("POINT (-51.1234 -23.5678)")
        self.assertAlmostEqual(lon, -51.1234)
        self.assertAlmostEqual(lat, -23.5678)

        # WKT notação científica ou espaços extras
        lon_sci, lat_sci = parse_wkt_point("POINT   ( -5.11234e+01   -2.35678e+01 )")
        self.assertIsNotNone(lon_sci)

        # WKT não-ponto deve retornar None gracioso
        self.assertEqual(parse_wkt_point("POLYGON((-51 -23, -51 -24, -50 -24, -51 -23))"), (None, None))
        self.assertEqual(parse_wkt_point(None), (None, None))
        self.assertEqual(parse_wkt_point(""), (None, None))

    def test_resolver_coordenadas_robust(self):
        # Lat/Lon SIRGAS 2000 Fuso 22S
        lat, lon, este, norte = resolver_coordenadas_robust("-51.1234", "-23.5678", fuso_utm_default=22)
        self.assertAlmostEqual(lat, -23.5678, places=4)
        self.assertAlmostEqual(lon, -51.1234, places=4)
        self.assertIsNotNone(este)
        self.assertIsNotNone(norte)

        # Inversão de Coordenadas UTM Easting/Northing
        lat_u, lon_u, este_u, norte_u = resolver_coordenadas_robust("246223.93", "7389982.83", fuso_utm_default=22)
        self.assertAlmostEqual(lat_u, -23.58077, places=4)
        self.assertAlmostEqual(lon_u, -53.48654, places=4)

    def test_fusos_utm_transicao(self):
        # Fuso 21S (Ex: Lon -57.0)
        lat21, lon21, este21, norte21 = resolver_coordenadas_robust("-57.0000", "-20.0000")
        self.assertAlmostEqual(lon21, -57.0, places=4)
        self.assertIsNotNone(este21)

        # Fuso 23S (Ex: Lon -45.0)
        lat23, lon23, este23, norte23 = resolver_coordenadas_robust("-45.0000", "-22.0000")
        self.assertAlmostEqual(lon23, -45.0, places=4)
        self.assertIsNotNone(este23)

        # Fuso 24S (Ex: Lon -39.0)
        lat24, lon24, este24, norte24 = resolver_coordenadas_robust("-39.0000", "-13.0000")
        self.assertAlmostEqual(lon24, -39.0, places=4)
        self.assertIsNotNone(este24)

    def test_detect_csv_delimiter(self):
        self.assertEqual(detect_csv_delimiter("CODIGO;X;Y;Z"), ";")
        self.assertEqual(detect_csv_delimiter("CODIGO\tX\tY\tZ"), "\t")
        self.assertEqual(detect_csv_delimiter("CODIGO,X,Y,Z"), ",")
        
        # Teste com UTF-8 BOM (\ufeff)
        self.assertEqual(detect_csv_delimiter("\ufeffQRCODE;CODIGO;GEOMETRIA_WKT"), ";")

        # Teste com acentuação Windows-1252 / ISO-8859-1 e vírgula ambígua
        first_line_w1252 = "CÓDIGO;TIPO_VÉRTICE;LATITUDE;LONGITUDE".encode("windows-1252").decode("windows-1252")
        self.assertEqual(detect_csv_delimiter(first_line_w1252), ";")

if __name__ == "__main__":
    unittest.main()
