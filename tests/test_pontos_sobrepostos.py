import unittest
import math

class TestPontosSobrepostos(unittest.TestCase):
    def calcular_distancia(self, p1, p2):
        dx = p1["e"] - p2["e"]
        dy = p1["n"] - p2["n"]
        return math.sqrt(dx * dx + dy * dy)

    def test_deteccao_pontos_coincidentes(self):
        p1 = {"id": 1, "nome": "V01", "e": 500000.000, "n": 7400000.000, "status": "CORRIGIDO"}
        p2 = {"id": 2, "nome": "V01_BRUTO", "e": 500000.015, "n": 7400000.010, "status": "BRUTO"}
        dist = self.calcular_distancia(p1, p2)
        # Distância de ~1.8 cm deve ser detectada como sobreposta (limite de 5 cm)
        self.assertLessEqual(dist, 0.05)

    def test_pontos_distintos(self):
        p1 = {"id": 1, "nome": "V01", "e": 500000.000, "n": 7400000.000}
        p2 = {"id": 2, "nome": "V02", "e": 500050.000, "n": 7400000.000}
        dist = self.calcular_distancia(p1, p2)
        self.assertGreater(dist, 0.05)

if __name__ == '__main__':
    unittest.main()
