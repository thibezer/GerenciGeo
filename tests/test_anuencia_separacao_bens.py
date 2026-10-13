import unittest
from database.connection import DatabaseManager
from services.documentacao.cartorio.anuencias import gerar_declaracao_anuencia_html

class TestAnuenciaSeparacaoBens(unittest.TestCase):
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

            cursor.execute("""
                INSERT INTO pessoas (id, nome, cpf_cnpj, rg, estado_civil, regime_bens, profissao, endereco_completo) 
                VALUES (1, 'Requerente Proprietário', '11111111111', '11111', 'Solteiro', '', 'Produtor Rural', 'Sítio Central')
            """)
            cursor.execute("INSERT INTO clientes (id, pessoa_id) VALUES (1, 1)")
            cursor.execute("INSERT INTO profissionais (id, nome, registro, codigo_credenciado, conselho) VALUES (1, 'Agrimensor', '99999', 'AGRI', 'CFTA')")
            cursor.execute("INSERT INTO propriedades (id, nome_propriedade, municipio, uf) VALUES (1, 'Fazenda Modelo', 'Umuarama', 'PR')")
            cursor.execute("INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (1, 1, 100.0)")
            cursor.execute("INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio) VALUES (1, 1, 1, '2026-01-01')")
            cursor.execute("INSERT INTO matriculas (id, propriedade_id, numero_matricula, denominacao, area_ha) VALUES (10, 1, '12345', 'Gleba A', 50.0)")

            # Pessoa confrontante casada sob separação total de bens
            cursor.execute("""
                INSERT INTO pessoas (
                    id, nome, cpf_cnpj, rg, genero, nacionalidade, profissao, 
                    estado_civil, regime_bens, nome_conjuge, cpf_conjuge, rg_conjuge, 
                    genero_conjuge, nacionalidade_conjuge, profissao_conjuge, endereco_completo
                ) VALUES (
                    2, 'Carlos Silva Confrontante', '222.222.222-22', '22.222-SSP/PR', 'M', 'brasileiro', 'Empresário',
                    'casado', 'separacao_total', 'Mariana Souza Silva', '333.333.333-33', '33.333-SSP/PR',
                    'F', 'brasileira', 'Arquiteta', 'Av. Paraná, 100, Umuarama-PR'
                )
            """)

            cursor.execute("""
                INSERT INTO confrontantes (
                    id, levantamento_id, pessoa_id, nome, lote, matricula_imovel
                ) VALUES (
                    100, 1, 2, 'Carlos Silva Confrontante', 'Lote 7-B', '55555'
                )
            """)

            # Vértices e segmento de divisa
            cursor.execute("INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono) VALUES (1, 1, 10, 'V1', 'M', -23.50, -53.40, 1, 1, 0)")
            cursor.execute("INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono) VALUES (2, 1, 10, 'V2', 'M', -23.50, -53.30, 2, 1, 0)")
            cursor.execute("INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (1, 10, 1, 2, 100, 'CERCA', 'PG1')")

    def test_anuencia_com_dados_conjuge_separacao_total(self):
        html = gerar_declaracao_anuencia_html(1, 10, 100)

        # 1. Verifica qualificação do titular e do cônjuge sob separação total de bens
        self.assertIn("Carlos Silva Confrontante", html)
        self.assertIn("Mariana Souza Silva", html)
        self.assertIn("Separação Total de Bens", html)
        self.assertIn("333.333.333-33", html)
        self.assertIn("33.333-SSP/PR", html)
        self.assertIn("Arquiteta", html)
        self.assertIn("brasileira", html)

        # 2. Verifica concordância no plural
        self.assertIn("DECLARAM", html)
        self.assertIn("Os declarantes", html)

        # 3. Verifica assinatura do cônjuge do confrontante anuente
        self.assertIn("Confrontante Anuente", html)
        self.assertIn("Cônjuge do Confrontante Anuente", html)

if __name__ == "__main__":
    unittest.main()
