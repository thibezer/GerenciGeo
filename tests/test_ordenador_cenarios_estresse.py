import unittest
from services.processamento.geometria_topologica import (
    segmentos_se_cruzam,
    detectar_autointersecoes_poligono,
    desembaracar_poligono_2opt,
    _pode_inverter_subrota_com_travamentos
)

class TestOrdenadorCenariosEstresse(unittest.TestCase):
    """
    Suíte de testes para os 6 Cenários Hipotéticos de Estresse e Casos de Borda do Ordenador.
    """

    def test_cenario_1_menos_de_3_vertices_ou_vazio(self):
        """Cenário 1: Listas vazias ou com menos de 3 vértices não quebram algoritmos de geometria."""
        self.assertEqual(detectar_autointersecoes_poligono([]), [])
        self.assertEqual(detectar_autointersecoes_poligono([{"id": 1, "lat": -24.0, "lon": -54.0}]), [])
        self.assertEqual(detectar_autointersecoes_poligono([
            {"id": 1, "lat": -24.0, "lon": -54.0},
            {"id": 2, "lat": -24.1, "lon": -54.1}
        ]), [])

        # 2-Opt com menos de 4 pontos retorna a própria lista intacta
        p2 = [{"id": 1, "lat": -24.0, "lon": -54.0}, {"id": 2, "lat": -24.1, "lon": -54.1}]
        self.assertEqual(desembaracar_poligono_2opt(p2), p2)

    def test_cenario_2_coordenadas_nulas_ou_formato_misto(self):
        """Cenário 2: Pontos com campos nulos ou coordenadas em lat_corrigido são tratados com segurança."""
        pontos_mistos = [
            {"id": 1, "lat": -24.0, "lon": -54.0, "nome_vertice": "P1"},
            {"id": 2, "lat": None, "lon": None, "lat_corrigido": -24.0, "lon_corrigido": -54.1, "nome_vertice": "P2"},
            {"id": 3, "lat": "-24.1", "lon": "-54.1", "nome_vertice": "P3"},
            {"id": 4, "lat_corrigido": -24.1, "lon_corrigido": -54.0, "nome_vertice": "P4"}
        ]
        # Não deve levantar exceção de tipo
        cruzamentos = detectar_autointersecoes_poligono(pontos_mistos)
        self.assertIsInstance(cruzamentos, list)

    def test_cenario_3_sequencias_travadas_preservacao(self):
        """Cenário 3: Validação de que blocos travados não são partidos ao meio."""
        pontos = [
            {"id": 1, "sequencia_travada_id": "rio"},
            {"id": 2, "sequencia_travada_id": "rio"},
            {"id": 3, "sequencia_travada_id": "rio"},
            {"id": 4, "sequencia_travada_id": None},
            {"id": 5, "sequencia_travada_id": None}
        ]
        # Inverter [0:2] (o bloco inteiro "rio") é permitido
        self.assertTrue(_pode_inverter_subrota_com_travamentos(pontos, 0, 2))
        # Inverter [1:3] cortaria o ponto 0 fora do intervalo (violando a trava)
        self.assertFalse(_pode_inverter_subrota_com_travamentos(pontos, 1, 3))

    def test_cenario_4_desembaraco_poligono_borboleta_2opt(self):
        """Cenário 4: Polígono entrelaçado em formato de 'X' é corrigido pelo 2-Opt."""
        # Polígono com cruzamento entre P1->P3 e P2->P4
        pontos_cruzados = [
            {"id": 1, "nome_vertice": "P1", "lat": 0.0, "lon": 0.0},
            {"id": 2, "nome_vertice": "P2", "lat": 1.0, "lon": 1.0},
            {"id": 3, "nome_vertice": "P3", "lat": 0.0, "lon": 1.0},
            {"id": 4, "nome_vertice": "P4", "lat": 1.0, "lon": 0.0}
        ]
        # Antes da correção deve haver cruzamento
        self.assertTrue(len(detectar_autointersecoes_poligono(pontos_cruzados)) > 0)

        # Após o 2-Opt, deve ficar sem cruzamentos
        corrigido = desembaracar_poligono_2opt(pontos_cruzados)
        self.assertEqual(len(detectar_autointersecoes_poligono(corrigido)), 0)

    def test_cenario_5_bloqueio_de_inversao_por_trava_rigida(self):
        """Cenário 5: Se todos os pontos estão na mesma sequência travada, respeita a integridade."""
        pontos_travados = [
            {"id": 1, "lat": 0.0, "lon": 0.0, "sequencia_travada_id": "divisa_fixa"},
            {"id": 2, "lat": 1.0, "lon": 1.0, "sequencia_travada_id": "divisa_fixa"},
            {"id": 3, "lat": 0.0, "lon": 1.0, "sequencia_travada_id": "divisa_fixa"},
            {"id": 4, "lat": 1.0, "lon": 0.0, "sequencia_travada_id": "outro_bloco"}
        ]
        # Tentativa de inverter subrota parcial da divisa_fixa é impedida
        self.assertFalse(_pode_inverter_subrota_com_travamentos(pontos_travados, 1, 3))

    def test_cenario_6_limite_maximo_iteracoes_e_seguranca(self):
        """Cenário 6: Polígonos complexos não caem em loop infinito com max_iter estrito."""
        # Cria polígono com 20 vértices
        pontos = []
        for i in range(20):
            pontos.append({
                "id": i + 1,
                "lat": float(i % 5),
                "lon": float((i * 3) % 7)
            })
        resultado = desembaracar_poligono_2opt(pontos, max_iter=50)
        self.assertEqual(len(resultado), 20)

if __name__ == '__main__':
    unittest.main()
