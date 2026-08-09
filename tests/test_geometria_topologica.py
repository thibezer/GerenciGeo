import unittest
from services.processamento.geometria_topologica import (
    segmentos_se_cruzam,
    detectar_autointersecoes_poligono,
    desembaracar_poligono_2opt
)


class TestGeometriaTopologica(unittest.TestCase):

    def test_segmentos_se_cruzam_verdadeiro(self):
        # Cruzamento em X: (0,0)-(2,2) com (0,2)-(2,0)
        p1 = (0.0, 0.0)
        p2 = (2.0, 2.0)
        p3 = (0.0, 2.0)
        p4 = (2.0, 0.0)
        self.assertTrue(segmentos_se_cruzam(p1, p2, p3, p4))

    def test_segmentos_paralelos_nao_se_cruzam(self):
        p1 = (0.0, 0.0)
        p2 = (2.0, 0.0)
        p3 = (0.0, 1.0)
        p4 = (2.0, 1.0)
        self.assertFalse(segmentos_se_cruzam(p1, p2, p3, p4))

    def test_segmentos_adjacentes_nao_se_cruzam(self):
        # Segmentos consecutivos compartilhando um vértice
        p1 = (0.0, 0.0)
        p2 = (1.0, 1.0)
        p3 = (1.0, 1.0)
        p4 = (2.0, 0.0)
        self.assertFalse(segmentos_se_cruzam(p1, p2, p3, p4))

    def test_poligono_simples_sem_autointersecao(self):
        # Quadrado convexo: (0,0) -> (2,0) -> (2,2) -> (0,2)
        quadrado = [
            {"id": 1, "nome_vertice": "P1", "lat": 0.0, "lon": 0.0},
            {"id": 2, "nome_vertice": "P2", "lat": 2.0, "lon": 0.0},
            {"id": 3, "nome_vertice": "P3", "lat": 2.0, "lon": 2.0},
            {"id": 4, "nome_vertice": "P4", "lat": 0.0, "lon": 2.0},
        ]
        cruzamentos = detectar_autointersecoes_poligono(quadrado)
        self.assertEqual(len(cruzamentos), 0)

    def test_poligono_borboleta_com_autointersecao(self):
        # Ordem errada formando ampulheta/borboleta: (0,0) -> (2,2) -> (2,0) -> (0,2)
        borboleta = [
            {"id": 1, "nome_vertice": "P1", "lat": 0.0, "lon": 0.0},
            {"id": 2, "nome_vertice": "P2", "lat": 2.0, "lon": 2.0},
            {"id": 3, "nome_vertice": "P3", "lat": 2.0, "lon": 0.0},
            {"id": 4, "nome_vertice": "P4", "lat": 0.0, "lon": 2.0},
        ]
        cruzamentos = detectar_autointersecoes_poligono(borboleta)
        self.assertGreater(len(cruzamentos), 0)

    def test_desembaracar_poligono_2opt(self):
        # Desembaraça o polígono borboleta transformando em polígono simples sem cruzamentos
        borboleta = [
            {"id": 1, "nome_vertice": "P1", "lat": 0.0, "lon": 0.0},
            {"id": 2, "nome_vertice": "P2", "lat": 2.0, "lon": 2.0},
            {"id": 3, "nome_vertice": "P3", "lat": 2.0, "lon": 0.0},
            {"id": 4, "nome_vertice": "P4", "lat": 0.0, "lon": 2.0},
        ]
        resolvido = desembaracar_poligono_2opt(borboleta)
        cruzamentos_restantes = detectar_autointersecoes_poligono(resolvido)
        self.assertEqual(len(cruzamentos_restantes), 0)

    def test_desembaracar_poligono_preserva_bloco_travado(self):
        # P2 e P3 formam uma sequência travada
        pontos = [
            {"id": 1, "nome_vertice": "P1", "lat": 0.0, "lon": 0.0},
            {"id": 2, "nome_vertice": "P2", "lat": 2.0, "lon": 2.0, "sequencia_travada_id": "cerca"},
            {"id": 3, "nome_vertice": "P3", "lat": 2.0, "lon": 0.0, "sequencia_travada_id": "cerca"},
            {"id": 4, "nome_vertice": "P4", "lat": 0.0, "lon": 2.0},
        ]
        resolvido = desembaracar_poligono_2opt(pontos)
        cruzamentos = detectar_autointersecoes_poligono(resolvido)
        self.assertEqual(len(cruzamentos), 0)


if __name__ == "__main__":
    unittest.main()
