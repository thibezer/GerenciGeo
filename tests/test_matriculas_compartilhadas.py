import unittest
from database.connection import DatabaseManager, execute_query
from services.documentacao.cartorio.data_fetcher import obter_dados_comuns, obter_segmentos_detalhados_confrontante
from services.documentacao.cartorio.anuencias import gerar_declaracao_anuencia_html, gerar_declaracao_anuencia_lote_html
from services.documentacao.cartorio.laudos_imovel import (
    gerar_requerimento_cartorio_html,
    gerar_declaracao_responsabilidade_html,
    gerar_laudo_tecnico_html,
    gerar_termo_responsabilidade_sigef_html
)

class TestMatriculasCompartilhadas(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM segmentos")
            cursor.execute("DELETE FROM confrontantes")
            cursor.execute("DELETE FROM banco_pontos")
            cursor.execute("DELETE FROM pontos")
            cursor.execute("DELETE FROM matriculas")
            cursor.execute("DELETE FROM levantamentos")
            cursor.execute("DELETE FROM propriedade_clientes")
            cursor.execute("DELETE FROM propriedades")
            cursor.execute("DELETE FROM clientes")
            cursor.execute("DELETE FROM pessoas")
            cursor.execute("DELETE FROM profissionais")

            # Inserir entidades base
            cursor.execute("INSERT INTO pessoas (id, nome, cpf_cnpj, rg, estado_civil, regime_bens, profissao, endereco_completo) VALUES (1, 'João Carlos Pozzobon', '12345678901', '123456', 'Casado', 'Comunhão Parcial', 'Produtor Rural', 'Linha Dourados')")
            cursor.execute("INSERT INTO pessoas (id, nome, cpf_cnpj) VALUES (2, 'Vizinho Lindeiro Teste', '98765432100')")
            
            cursor.execute("INSERT INTO clientes (id, pessoa_id) VALUES (1, 1)")
            cursor.execute("INSERT INTO profissionais (id, nome, registro, codigo_credenciado, conselho) VALUES (1, 'Agrimensor Teste', '99999', 'TEST', 'CFTA')")
            cursor.execute("INSERT INTO propriedades (id, nome_propriedade, municipio, uf) VALUES (1, 'Fazenda Serra dos Dourados', 'Umuarama', 'PR')")
            cursor.execute("INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (1, 1, 100.0)")
            cursor.execute("INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio) VALUES (1, 1, 1, '2026-01-01')")
            
            # Matrícula 20: 679 (118.7490 ha, sem pontos próprios, aponta para 21)
            # Matrícula 21: 682 (53.4000 ha, com pontos do perímetro único de 172.1490 ha)
            cursor.execute("""
                INSERT INTO matriculas (id, propriedade_id, numero_matricula, denominacao, area_ha, matricula_origem_desenho_id)
                VALUES (20, 1, '679', 'Lote 6-A', 118.7490, 21)
            """)
            cursor.execute("""
                INSERT INTO matriculas (id, propriedade_id, numero_matricula, denominacao, area_ha, matricula_origem_desenho_id)
                VALUES (21, 1, '682', 'Lote 5', 53.4000, NULL)
            """)

            cursor.execute("INSERT INTO confrontantes (id, levantamento_id, pessoa_id, nome, matricula_imovel) VALUES (50, 1, 2, 'Lote Confrontante', '999')")

            # Inserir vértices na Matrícula 21 (origem do desenho)
            cursor.execute("INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono) VALUES (1, 1, 21, 'V1', 'M', -23.50, -53.40, 1, 1, 0)")
            cursor.execute("INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono) VALUES (2, 1, 21, 'V2', 'V', -23.50, -53.30, 2, 1, 0)")
            cursor.execute("INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono) VALUES (3, 1, 21, 'V3', 'P', -23.60, -53.30, 3, 1, 0)")
            cursor.execute("INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono) VALUES (4, 1, 21, 'V4', 'P', -23.60, -53.40, 4, 1, 0)")

            # Inserir segmentos na Matrícula 21
            cursor.execute("INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (1, 21, 1, 2, 50, 'CERCA', 'PG1')")
            cursor.execute("INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (1, 21, 2, 3, 50, 'CERCA', 'PG1')")
            cursor.execute("INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (1, 21, 3, 4, NULL, 'ESTRADA', 'PG1')")
            cursor.execute("INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (1, 21, 4, 1, NULL, 'ESTRADA', 'PG1')")

            # Banco de pontos para laudo técnico
            cursor.execute("INSERT INTO banco_pontos (levantamento_id, matricula_id, profissional_id, codigo_completo, tipo_ponto, numero, norte, este, altitude) VALUES (1, 21, 1, 'TEST-M-0001', 'M', 1, 7400000.0, 300000.0, 450.0)")

            conn.commit()

    def test_dados_comuns_unificacao(self):
        """Verifica se obter_dados_comuns calcula corretamente os rótulos, áreas e cláusula unificada"""
        dados20 = obter_dados_comuns(1, 20)
        self.assertTrue(dados20["is_unificada"])
        self.assertEqual(dados20["numeros_matricula_str"], "679 e 682")
        self.assertEqual(dados20["rotulo_matricula"], "Matrículas nºs")
        self.assertEqual(dados20["matricula_desenho_id"], 21)
        self.assertAlmostEqual(dados20["area_total_ha"], 172.1490, places=3)
        self.assertIn("Parágrafo Único – Da Unificação e Continuidade Territorial", dados20["clausula_unificacao_html"])

        dados21 = obter_dados_comuns(1, 21)
        self.assertTrue(dados21["is_unificada"])
        self.assertEqual(dados21["numeros_matricula_str"], "679 e 682")
        self.assertEqual(dados21["matricula_desenho_id"], 21)

    def test_gerar_anuencia_matricula_compartilhada(self):
        """Gera a carta de anuência para a matrícula que não tem desenho próprio e valida se herda os dados da matrícula base"""
        html = gerar_declaracao_anuencia_html(1, 20, 50)
        self.assertIn("679 e 682", html)
        self.assertIn("Matrículas nºs", html)
        self.assertIn("Parágrafo Único – Da Unificação e Continuidade Territorial", html)
        self.assertIn("V1", html)
        self.assertIn("V2", html)
        self.assertIn("map_confrontante_50", html)

    def test_gerar_anuencia_lote_matricula_compartilhada(self):
        """Gera o lote de cartas de anuência para a matrícula compartilhada"""
        lote_html = gerar_declaracao_anuencia_lote_html(1, 20)
        self.assertIn("Lote de Anuências - Matrículas nºs 679 e 682", lote_html)
        self.assertIn("Parágrafo Único – Da Unificação e Continuidade Territorial", lote_html)

    def test_documentos_cartorio_unificados(self):
        """Valida se Requerimento, Declaração de Responsabilidade, Laudo Técnico e Termo SIGEF refletem a unificação"""
        req = gerar_requerimento_cartorio_html(1, 20)
        self.assertIn("679 e 682", req)
        self.assertIn("gleba territorial contínua e unificada", req)
        self.assertIn("172,1490 ha", req)

        resp = gerar_declaracao_responsabilidade_html(1, 20)
        self.assertIn("679 e 682", resp)
        self.assertIn("gleba contínua e unificada", resp)

        laudo = gerar_laudo_tecnico_html(1, 20)
        self.assertIn("679 e 682", laudo)
        self.assertIn("TEST-M-0001", laudo)

        termo = gerar_termo_responsabilidade_sigef_html(1, 20)
        self.assertIn("679 e 682", termo)
        self.assertIn("172,15 ha", termo)

if __name__ == "__main__":
    unittest.main()
