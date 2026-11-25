import unittest

from services.gestores.pontos_manager import ordenar_sem_intercalar


def _rows(*pares):
    return [{"id": i, "ordem_caminhamento": o} for i, o in pares]


class OrdenarSemIntercalarTest(unittest.TestCase):
    def test_trechos_com_numeracao_propria_nao_intercalam(self):
        # Três trechos importados separadamente, cada um numerado de 1..N.
        a = [(100 + i, i) for i in range(1, 9)]
        b = [(200 + i, i) for i in range(1, 7)]
        c = [(300 + i, i) for i in range(1, 6)]
        esperado = [p for p, _ in a + b + c]
        self.assertEqual(ordenar_sem_intercalar(_rows(*(c + a + b))), esperado)

    def test_lista_embaralhada_com_um_duplicado_mantem_ordem_e_id(self):
        rows = _rows((5, 1), (3, 2), (9, 3), (1, 4), (8, 4), (2, 5))
        self.assertEqual(ordenar_sem_intercalar(rows), [5, 3, 9, 1, 8, 2])

    def test_campo_e_homologado_nao_se_misturam(self):
        # Campo (1..6) e homologado (1..6) com a mesma numeração: campo primeiro, homologado depois.
        rows = [{"id": 100 + i, "ordem_caminhamento": i, "origem_homologada": 0} for i in range(1, 7)]
        rows += [{"id": 200 + i, "ordem_caminhamento": i, "origem_homologada": 1} for i in range(1, 7)]
        esperado = [100 + i for i in range(1, 7)] + [200 + i for i in range(1, 7)]
        self.assertEqual(ordenar_sem_intercalar(rows), esperado)

    def test_nulos_vao_para_o_fim(self):
        rows = _rows((1, 1), (2, 2), (3, None), (4, 0))
        self.assertEqual(ordenar_sem_intercalar(rows), [1, 2, 3, 4])


if __name__ == "__main__":
    unittest.main()
