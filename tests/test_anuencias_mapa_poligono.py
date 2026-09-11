import unittest
from database.connection import DatabaseManager
from services.documentacao.cartorio.anuencias import gerar_anexo_grafico_html

class TestAnuenciasMapaPoligono(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM segmentos")
            cursor.execute("DELETE FROM confrontantes")
            cursor.execute("DELETE FROM pontos")
            cursor.execute("DELETE FROM matriculas")
            cursor.execute("DELETE FROM levantamentos")
            cursor.execute("DELETE FROM propriedades")
            cursor.execute("DELETE FROM clientes")
            cursor.execute("DELETE FROM pessoas")
            cursor.execute("DELETE FROM profissionais")

            cursor.execute("INSERT INTO pessoas (id, nome, cpf_cnpj) VALUES (1, 'João da Silva', '12345678901')")
            cursor.execute("INSERT INTO pessoas (id, nome, cpf_cnpj) VALUES (2, 'Vizinho Confrontante', '98765432100')")
            cursor.execute("INSERT INTO clientes (id, pessoa_id) VALUES (1, 1)")
            cursor.execute("INSERT INTO profissionais (id, nome, registro, codigo_credenciado) VALUES (1, 'Engenheiro Teste', '12345', 'TEST')")
            cursor.execute("INSERT INTO propriedades (id, nome_propriedade, municipio, uf) VALUES (1, 'Fazenda Modelo', 'Umuarama', 'PR')")
            cursor.execute("INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio) VALUES (1, 1, 1, '2026-01-01')")
            cursor.execute("INSERT INTO matriculas (id, propriedade_id, numero_matricula) VALUES (10, 1, '42859')")
            
            cursor.execute("INSERT INTO confrontantes (id, levantamento_id, pessoa_id, nome, matricula_imovel) VALUES (100, 1, 2, 'Lote Vizinho', '1234')")
            
            # Inserir 4 vértices do perímetro homologado (origem_homologada = 1)
            # P1 (ordem 2), P2 (ordem 4), P3 (ordem 6), P4 (ordem 8)
            cursor.execute("""
                INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono)
                VALUES (101, 1, 10, 'V1', 'M', -23.50, -53.40, 2, 1, 0)
            """)
            cursor.execute("""
                INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono)
                VALUES (102, 1, 10, 'V2', 'V', -23.50, -53.30, 4, 1, 0)
            """)
            cursor.execute("""
                INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono)
                VALUES (103, 1, 10, 'V3', 'P', -23.60, -53.30, 6, 1, 0)
            """)
            cursor.execute("""
                INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono)
                VALUES (104, 1, 10, 'V4', 'P', -23.60, -53.40, 8, 1, 0)
            """)

            # Inserir 3 pontos de campo brutos de rio/apoio intercalados (origem_homologada = 0)
            # RIO1 (ordem 1), RIO2 (ordem 3), RIO3 (ordem 5)
            cursor.execute("""
                INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono)
                VALUES (201, 1, 10, 'RIO1', 'P', -23.70, -53.50, 1, 0, 0)
            """)
            cursor.execute("""
                INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono)
                VALUES (202, 1, 10, 'RIO2', 'P', -23.71, -53.51, 3, 0, 0)
            """)
            cursor.execute("""
                INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono)
                VALUES (203, 1, 10, 'RIO3', 'P', -23.72, -53.52, 5, 0, 0)
            """)

            # Criar cadeia perimétrica de 4 segmentos homologados
            # V1 -> V2 -> V3 -> V4 -> V1
            cursor.execute("INSERT INTO segmentos (id, levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (1, 1, 10, 101, 102, 100, 'LA1', 'PG1')")
            cursor.execute("INSERT INTO segmentos (id, levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (2, 1, 10, 102, 103, 100, 'LA1', 'PG1')")
            cursor.execute("INSERT INTO segmentos (id, levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (3, 1, 10, 103, 104, NULL, 'LA1', 'PG1')")
            cursor.execute("INSERT INTO segmentos (id, levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (4, 1, 10, 104, 101, NULL, 'LA1', 'PG1')")
            conn.commit()

    def test_poligono_ignora_pontos_brutos_intercalados(self):
        """Valida que o polígono geral contém exatamente os 4 vértices do perímetro e não os pontos brutos de rio"""
        html, map_data = gerar_anexo_grafico_html(1, 10, 100, "Lote Vizinho", "1234")
        self.assertIn("ANEXO GRÁFICO", html)
        self.assertIn("map_confrontante_100", map_data["id"])
        
        # O polígono deve conter exatamente os 4 vértices do perímetro
        poligono = map_data["poligono"]
        self.assertEqual(len(poligono), 4, f"Esperado 4 vértices no polígono, obtido {len(poligono)}")
        
        # Assegurar que nenhum ponto do rio (-23.70, etc.) foi incluído
        for lat, lon in poligono:
            self.assertGreater(lat, -23.65, "Ponto bruto de rio foi indevidamente incluído no polígono do imóvel!")

    def test_divisa_lindeira_encadeada_e_extremidades(self):
        """Valida que os segmentos do confrontante 100 (V1->V2 e V2->V3) são encadeados com extremidades V1 e V3"""
        html, map_data = gerar_anexo_grafico_html(1, 10, 100, "Lote Vizinho", "1234")
        lindeira = map_data["lindeira"]
        self.assertEqual(len(lindeira), 2)
        
        pts = map_data["lindeira_pontos"]
        # Vértices vistos na divisa: V1, V2, V3
        self.assertEqual(len(pts), 3)
        
        # V1 e V3 devem ter exibir_nome = True, e V2 exibir_nome = False
        nomes_com_rotulo = [p["nome"] for p in pts if p["exibir_nome"]]
        nomes_sem_rotulo = [p["nome"] for p in pts if not p["exibir_nome"]]
        
        self.assertEqual(set(nomes_com_rotulo), {"V1", "V3"})
        self.assertEqual(nomes_sem_rotulo, ["V2"])

    def test_fallback_sem_segmentos_com_pontos_homologados(self):
        """Se a matrícula não tem registros na tabela segmentos, o fallback deve usar apenas pontos homologados"""
        with DatabaseManager() as conn:
            conn.cursor().execute("DELETE FROM segmentos")
            # Inserir pelo menos um segmento para o confrontante para ter lindeira
            conn.cursor().execute("INSERT INTO segmentos (id, levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (10, 1, 10, 101, 102, 100, 'LA1', 'PG1')")
            conn.commit()
            
        html, map_data = gerar_anexo_grafico_html(1, 10, 100, "Lote Vizinho", "1234")
        poligono = map_data["poligono"]
        self.assertEqual(len(poligono), 4, f"Fallback deve filtrar os 4 pontos homologados, obtido {len(poligono)}")

    def test_divisa_lindeira_atravessa_virada_perimetro(self):
        """Valida ordenação topológica quando o confrontante cruza a virada do perímetro (V4 -> V1 -> V2)"""
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM segmentos")
            # V4 -> V1 (ordem 8 no início) e V1 -> V2 (ordem 2 no início)
            cursor.execute("INSERT INTO segmentos (id, levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (1, 1, 10, 104, 101, 100, 'LA1', 'PG1')")
            cursor.execute("INSERT INTO segmentos (id, levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (2, 1, 10, 101, 102, 100, 'LA1', 'PG1')")
            cursor.execute("INSERT INTO segmentos (id, levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (3, 1, 10, 102, 103, NULL, 'LA1', 'PG1')")
            cursor.execute("INSERT INTO segmentos (id, levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (4, 1, 10, 103, 104, NULL, 'LA1', 'PG1')")
            conn.commit()

        html, map_data = gerar_anexo_grafico_html(1, 10, 100, "Lote Vizinho", "1234")
        pts = map_data["lindeira_pontos"]
        self.assertEqual(len(pts), 3)
        nomes_com_rotulo = [p["nome"] for p in pts if p["exibir_nome"]]
        # Extremidades devem ser V4 e V2
        self.assertEqual(set(nomes_com_rotulo), {"V4", "V2"})
        self.assertEqual(map_data["lindeira_pontos"][1]["nome"], "V1")

if __name__ == "__main__":
    unittest.main()
