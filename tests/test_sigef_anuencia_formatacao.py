import html as html_lib
import unittest

from services.documentacao.cartorio.data_fetcher import gerar_tabela_divisas_html
from services.documentacao.cartorio.utils import (
    calcular_azimute_e_distancia,
    calcular_distancia_sgl,
    formatar_coord_gms,
)


class TestSigefAnuenciaFormatacao(unittest.TestCase):
    def test_formatar_coord_gms_padrao_sigef(self):
        self.assertEqual(formatar_coord_gms(-23.980380792086), "-23°58'49,371\"")
        self.assertEqual(formatar_coord_gms(-53.861554690638), "-53°51'41,597\"")
        self.assertEqual(formatar_coord_gms(-23.989536328926), "-23°59'22,331\"")
        self.assertEqual(formatar_coord_gms(-53.845838701306), "-53°50'45,019\"")
        self.assertEqual(formatar_coord_gms(None), "-")
        # Arredondamento limite 59.9999" -> 00,000" no próximo minuto
        self.assertEqual(formatar_coord_gms(-(23 + 59 / 60 + 59.9999 / 3600)), "-24°00'00,000\"")

    def test_calcular_azimute_e_distancia_sgl_bate_com_sigef(self):
        # XRXR-M-0001 -> XRXR-P-0001 (Memorial SIGEF: 122°22' | 1893,79 m)
        az1, dist1 = calcular_azimute_e_distancia(
            -23.980380792086, -53.861554690638,
            -23.989536328926, -53.845838701306,
            329.01, 271.24,
        )
        self.assertEqual(az1, "122°22'")
        self.assertEqual(dist1, "1893,79 m")

        # XRXR-P-0001 -> XRXR-V-0001 (Memorial SIGEF: 122°22' | 66,96 m)
        az2, dist2 = calcular_azimute_e_distancia(
            -23.989536328926, -53.845838701306,
            -23.989859988144, -53.845282972940,
            271.24, 254.47,
        )
        self.assertEqual(az2, "122°22'")
        self.assertEqual(dist2, "66,96 m")

        self.assertAlmostEqual(
            calcular_distancia_sgl(
                -23.980380792086, -53.861554690638,
                -23.989536328926, -53.845838701306,
                329.01, 271.24,
            ),
            1893.79,
            places=2,
        )

    def test_gerar_tabela_divisas_html_padrao_sigef(self):
        segmentos = [
            {
                "ini_nome": "XRXR-M-0001",
                "fim_nome": "XRXR-P-0001",
                "ini_lat": -23.980380792086,
                "ini_lon": -53.861554690638,
                "ini_alt": 329.01,
                "fim_lat": -23.989536328926,
                "fim_lon": -53.845838701306,
                "fim_alt": 271.24,
            },
            {
                "ini_nome": "XRXR-P-0001",
                "fim_nome": "XRXR-V-0001",
                "ini_lat": -23.989536328926,
                "ini_lon": -53.845838701306,
                "ini_alt": 271.24,
                "fim_lat": -23.989859988144,
                "fim_lon": -53.845282972940,
                "fim_alt": 254.47,
            },
        ]
        html = html_lib.unescape(str(gerar_tabela_divisas_html(1, 1, segmentos=segmentos)))
        self.assertIn("122°22'", html)
        self.assertIn("1893,79 m", html)
        self.assertIn("66,96 m", html)
        self.assertIn("-23°58'49,371\"", html)
        self.assertIn("-53°51'41,597\"", html)
        self.assertIn("-23°59'22,331\"", html)
        self.assertIn("-53°50'45,019\"", html)
        # Vértice final do trecho (XRXR-V-0001) também deve exibir suas coordenadas
        self.assertIn("Vértice Final: XRXR-V-0001", html)
        self.assertIn("-23°59'23,496\"", html)
        self.assertIn("-53°50'43,019\"", html)


if __name__ == "__main__":
    unittest.main()
