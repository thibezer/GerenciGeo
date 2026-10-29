"""
tests/test_vertices_virtuais.py
Testes unitários rigorosos para o motor analítico de vértices virtuais (PA1/PA2).
Norma Técnica INCRA / SIGEF (3ª Edição) - SIRGAS 2000.
"""

import math
import unittest
import numpy as np

from services.processamento.vertices_virtuais import (
    MotorVerticesVirtuais,
    PontoApoio,
    LadoOffset,
    ResultadoVerticeVirtual,
)


class TestMotorVerticesVirtuais(unittest.TestCase):

    def setUp(self):
        # Eixo Norte-Sul ao longo de E = 500000.0, de N = 7000000.0 até N = 7001000.0
        self.eixo_1 = PontoApoio(
            nome="E01",
            este=500000.0,
            norte=7000000.0,
            altitude=500.0,
            sigma_este=0.02,
            sigma_norte=0.02,
            sigma_altitude=0.03,
        )
        self.eixo_2 = PontoApoio(
            nome="E02",
            este=500000.0,
            norte=7001000.0,
            altitude=510.0,
            sigma_este=0.02,
            sigma_norte=0.02,
            sigma_altitude=0.03,
        )

        # Divisa Leste-Oeste em N = 7000500.0, de E = 500200.0 até E = 500100.0 avançando em direção ao eixo
        self.divisa_1 = PontoApoio(
            nome="M01",
            este=500200.0,
            norte=7000500.0,
            altitude=520.0,
            sigma_este=0.015,
            sigma_norte=0.015,
            sigma_altitude=0.02,
        )
        self.divisa_2 = PontoApoio(
            nome="M02",
            este=500100.0,
            norte=7000500.0,
            altitude=510.0,
            sigma_este=0.015,
            sigma_norte=0.015,
            sigma_altitude=0.02,
        )

    def test_pa1_offset_lateralidade(self):
        """Valida que o offset lateral à direita e à esquerda é aplicado corretamente."""
        p1 = np.array([500000.0, 7000000.0])
        p2 = np.array([500000.0, 7001000.0])
        distancia = 20.0  # 20 metros de faixa

        # Direita: no sentido Sul->Norte, direita é Este positivo (+20m no E)
        off1_dir, off2_dir = MotorVerticesVirtuais._calcular_offset_pa1(p1, p2, distancia, LadoOffset.DIREITA)
        self.assertAlmostEqual(off1_dir[0], 500020.0, places=3)
        self.assertAlmostEqual(off1_dir[1], 7000000.0, places=3)
        self.assertAlmostEqual(off2_dir[0], 500020.0, places=3)
        self.assertAlmostEqual(off2_dir[1], 7001000.0, places=3)

        # Esquerda: no sentido Sul->Norte, esquerda é Este negativo (-20m no E)
        off1_esq, off2_esq = MotorVerticesVirtuais._calcular_offset_pa1(p1, p2, distancia, LadoOffset.ESQUERDA)
        self.assertAlmostEqual(off1_esq[0], 499980.0, places=3)
        self.assertAlmostEqual(off1_esq[1], 7000000.0, places=3)
        self.assertAlmostEqual(off2_esq[0], 499980.0, places=3)
        self.assertAlmostEqual(off2_esq[1], 7001000.0, places=3)

    def test_combo_pa1_pa2_calculo_ortogonal(self):
        """Valida cálculo conjugado PA1 + PA2 com ângulo ortogonal (90 graus)."""
        resultado = MotorVerticesVirtuais.calcular_combo_pa1_pa2(
            eixo_1=self.eixo_1,
            eixo_2=self.eixo_2,
            divisa_1=self.divisa_1,
            divisa_2=self.divisa_2,
            largura_faixa=25.0,  # 25 m à direita
            lado=LadoOffset.DIREITA,
            nome_vertice="V01",
        )

        self.assertEqual(resultado.nome, "V01")
        self.assertEqual(resultado.tipo_ponto, "V")
        self.assertEqual(resultado.metodo, "PA1+PA2")

        # Ponto esperado: E = 500025.0, N = 7000500.0
        self.assertAlmostEqual(resultado.este, 500025.0, places=3)
        self.assertAlmostEqual(resultado.norte, 7000500.0, places=3)
        self.assertAlmostEqual(resultado.angulo_intersecao_graus, 90.0, places=1)

        # Interpolação altimétrica:
        # M01 (E=500200, alt=520) -> M02 (E=500100, alt=510)
        # Declividade: -10m em 100m = -0.1m/m
        # V01 está em E=500025, logo 75m além de M02 -> alt = 510 - 7.5 = 502.5
        self.assertAlmostEqual(resultado.altitude, 502.5, places=2)

        # Precisão deve estar dentro do limite do INCRA (<= 0.50m)
        self.assertTrue(resultado.conforme_norma_incra)
        self.assertLessEqual(resultado.sigma_planimetrico, 0.50)
        self.assertEqual(resultado.alerta, "")

    def test_pa2_puro_intersecao(self):
        """Valida PA2 puro (cruzamento direto de 2 alinhamentos)."""
        # Reta 1: (0, 0) -> (100, 100)  [diagonal 45 graus]
        # Reta 2: (0, 100) -> (100, 0)  [diagonal cruzada]
        # Interseção esperada: (50, 50)
        r1_p1 = PontoApoio("A1", 0.0, 0.0, 100.0, 0.02, 0.02, 0.03)
        r1_p2 = PontoApoio("A2", 100.0, 100.0, 110.0, 0.02, 0.02, 0.03)
        r2_p1 = PontoApoio("B1", 0.0, 100.0, 100.0, 0.02, 0.02, 0.03)
        r2_p2 = PontoApoio("B2", 100.0, 0.0, 110.0, 0.02, 0.02, 0.03)

        res = MotorVerticesVirtuais.calcular_pa2_puro(
            r1_p1, r1_p2, r2_p1, r2_p2, nome_vertice="V_CRUZ"
        )

        self.assertAlmostEqual(res.este, 50.0, places=3)
        self.assertAlmostEqual(res.norte, 50.0, places=3)
        self.assertAlmostEqual(res.angulo_intersecao_graus, 90.0, places=1)
        self.assertEqual(res.metodo, "PA2")
        self.assertTrue(res.conforme_norma_incra)

    def test_alerta_tolerancia_incra_quando_precisao_ruim(self):
        """Verifica se o alerta do INCRA é disparado quando a precisão dos apoios é muito alta."""
        ruim_e1 = PontoApoio("E01", 500000.0, 7000000.0, 500.0, 0.85, 0.85, 0.90)
        ruim_e2 = PontoApoio("E02", 500000.0, 7001000.0, 510.0, 0.85, 0.85, 0.90)

        resultado = MotorVerticesVirtuais.calcular_combo_pa1_pa2(
            eixo_1=ruim_e1,
            eixo_2=ruim_e2,
            divisa_1=self.divisa_1,
            divisa_2=self.divisa_2,
            largura_faixa=20.0,
            lado=LadoOffset.DIREITA,
            nome_vertice="V_RUIM",
        )

        self.assertFalse(resultado.conforme_norma_incra)
        self.assertGreater(resultado.sigma_planimetrico, 0.50)
        self.assertIn("excede o limite regulamentar do INCRA", resultado.alerta)

    def test_rejeicao_retas_paralelas(self):
        """Valida que retas paralelas disparam ValueError."""
        paralela_1 = PontoApoio("P1", 500000.0, 7000000.0, 500.0, 0.02, 0.02, 0.02)
        paralela_2 = PontoApoio("P2", 500000.0, 7001000.0, 500.0, 0.02, 0.02, 0.02)
        paralela_3 = PontoApoio("P3", 500050.0, 7000000.0, 500.0, 0.02, 0.02, 0.02)
        paralela_4 = PontoApoio("P4", 500050.0, 7001000.0, 500.0, 0.02, 0.02, 0.02)

        with self.assertRaises(ValueError) as ctx:
            MotorVerticesVirtuais.calcular_pa2_puro(paralela_1, paralela_2, paralela_3, paralela_4)
        self.assertIn("paralelos ou coincidentes", str(ctx.exception))

    def test_rejeicao_angulo_muito_agudo(self):
        """Valida que ângulos de interseção < 1 grau disparam exceção de instabilidade numérica."""
        # Alinhamento 1: (0, 0) -> (1000, 0) [Eixo X]
        # Alinhamento 2: (0, 0.001) -> (1000, 0.005) [Quase colinear, angulo ~ 0.0002 rad << 1 grau]
        p1 = PontoApoio("A1", 0.0, 0.0, 100.0, 0.02, 0.02, 0.02)
        p2 = PontoApoio("A2", 1000.0, 0.0, 100.0, 0.02, 0.02, 0.02)
        p3 = PontoApoio("B1", 0.0, 0.01, 100.0, 0.02, 0.02, 0.02)
        p4 = PontoApoio("B2", 1000.0, 0.05, 100.0, 0.02, 0.02, 0.02)

        with self.assertRaises(ValueError) as ctx:
            MotorVerticesVirtuais.calcular_pa2_puro(p1, p2, p3, p4)
        self.assertIn("Ângulo de interseção muito agudo", str(ctx.exception))

    def test_rejeicao_eixo_coincidente(self):
        """Valida que eixo com vértices coincidentes dispara ValueError."""
        p_coincidente = PontoApoio("E01", 500000.0, 7000000.0, 500.0, 0.02, 0.02, 0.02)
        with self.assertRaises(ValueError) as ctx:
            MotorVerticesVirtuais.calcular_combo_pa1_pa2(
                eixo_1=p_coincidente,
                eixo_2=p_coincidente,
                divisa_1=self.divisa_1,
                divisa_2=self.divisa_2,
                largura_faixa=20.0,
                lado=LadoOffset.DIREITA,
            )
        self.assertIn("coincidentes", str(ctx.exception))

    def test_calcular_offset_polilinha_lote(self):
        """Valida deslocamento de polilinha com 3 vértices (estilo OFFSET AutoCAD com canto intermediário)."""
        # Traçado em "L": (500000, 7000000) -> (500000, 7000100) -> (500100, 7000100)
        p1 = PontoApoio("P1", 500000.0, 7000000.0, 500.0, 0.02, 0.02, 0.02)
        p2 = PontoApoio("P2", 500000.0, 7000100.0, 505.0, 0.02, 0.02, 0.02)
        p3 = PontoApoio("P3", 500100.0, 7000100.0, 510.0, 0.02, 0.02, 0.02)

        # Offset de 10m à direita (no sentido de avanço)
        resultados = MotorVerticesVirtuais.calcular_offset_polilinha(
            pontos=[p1, p2, p3],
            distancia=10.0,
            lado=LadoOffset.DIREITA,
            prefixo_nome="V",
        )

        self.assertEqual(len(resultados), 3)
        self.assertEqual(resultados[0].nome, "V-01")
        self.assertEqual(resultados[1].nome, "V-02")
        self.assertEqual(resultados[2].nome, "V-03")

        # P1: deslocado 10m para a direita (Este + 10): E=500010, N=7000000
        self.assertAlmostEqual(resultados[0].este, 500010.0, places=2)
        self.assertAlmostEqual(resultados[0].norte, 7000000.0, places=2)

        # P2: canto em 90 graus. A interseção das duas paralelas deve cair em E=500010, N=7000090
        self.assertAlmostEqual(resultados[1].este, 500010.0, places=2)
        self.assertAlmostEqual(resultados[1].norte, 7000090.0, places=2)

        # P3: final do segmento Leste com offset 10m à direita (Sul, Norte - 10): E=500100, N=7000090
        self.assertAlmostEqual(resultados[2].este, 500100.0, places=2)
        self.assertAlmostEqual(resultados[2].norte, 7000090.0, places=2)

        # Todos devem ser do tipo V e conformes com a norma INCRA
        for r in resultados:
            self.assertEqual(r.tipo_ponto, "V")
            self.assertTrue(r.conforme_norma_incra)
            self.assertLessEqual(r.sigma_planimetrico, 0.50)


if __name__ == "__main__":
    unittest.main()
