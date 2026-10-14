import unittest
import json
from database.connection import DatabaseManager
from routes.levantamento.segmentos import ConfrontanteCreate, CoproprietarioCreate, salvar_coproprietarios_transacao
from services.documentacao.cartorio.anuencias import gerar_declaracao_anuencia_html

class TestConfrontantesCoproprietarios(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM confrontante_coproprietarios")
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

            # 1. Requerente
            cursor.execute("""
                INSERT INTO pessoas (id, nome, cpf_cnpj, rg, estado_civil, regime_bens, profissao, endereco_completo) 
                VALUES (1, 'Requerente Principal', '11111111111', '11111', 'Solteiro', '', 'Produtor Rural', 'Sítio Central')
            """)
            cursor.execute("INSERT INTO clientes (id, pessoa_id) VALUES (1, 1)")
            cursor.execute("INSERT INTO profissionais (id, nome, registro, codigo_credenciado, conselho) VALUES (1, 'Agrimensor Responsável', '99999', 'AGRI', 'CFTA')")
            cursor.execute("INSERT INTO propriedades (id, nome_propriedade, municipio, uf) VALUES (1, 'Fazenda Primavera', 'Umuarama', 'PR')")
            cursor.execute("INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (1, 1, 100.0)")
            cursor.execute("INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio) VALUES (1, 1, 1, '2026-01-01')")
            cursor.execute("INSERT INTO matriculas (id, propriedade_id, numero_matricula, denominacao, area_ha) VALUES (10, 1, '98765', 'Gleba 1', 100.0)")

            # 2. Confrontante Titular (Casado)
            cursor.execute("""
                INSERT INTO pessoas (
                    id, nome, cpf_cnpj, rg, genero, nacionalidade, profissao, 
                    estado_civil, regime_bens, nome_conjuge, cpf_conjuge, rg_conjuge, 
                    genero_conjuge, nacionalidade_conjuge, profissao_conjuge, endereco_completo
                ) VALUES (
                    2, 'Marcos Oliveira Confrontante', '222.222.222-22', '22.222-PR', 'M', 'brasileiro', 'Engenheiro',
                    'casado', 'comunhao_parcial', 'Camila Oliveira', '333.333.333-33', '33.333-PR',
                    'F', 'brasileira', 'Professora', 'Rua das Flores, 100, Umuarama-PR'
                )
            """)

            cursor.execute("""
                INSERT INTO confrontantes (
                    id, levantamento_id, pessoa_id, nome, lote, matricula_imovel
                ) VALUES (
                    100, 1, 2, 'Marcos Oliveira Confrontante', 'Lote 15-A', '44444'
                )
            """)

            # Vértices e segmento de divisa
            cursor.execute("INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono) VALUES (1, 1, 10, 'V1', 'M', -23.50, -53.40, 1, 1, 0)")
            cursor.execute("INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento, origem_homologada, ignorar_poligono) VALUES (2, 1, 10, 'V2', 'M', -23.50, -53.30, 2, 1, 0)")
            cursor.execute("INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (1, 10, 1, 2, 100, 'CERCA', 'PG1')")

    def test_salvar_coproprietarios_e_gerar_anuencia_composta(self):
        # 1. Cadastra 2 coproprietários para o confrontante 100:
        # Coproprietário 1: Solteiro
        # Coproprietário 2: Casada sob comunhão de bens
        coprops = [
            CoproprietarioCreate(
                nome="Lucas Ferreira",
                cpf_cnpj="444.444.444-44",
                rg="44.444-PR",
                genero="M",
                nacionalidade="brasileiro",
                profissao="Comerciante",
                estado_civil="solteiro",
                regime_bens=None,
                endereco_completo="Av. Brasil, 500, Umuarama-PR"
            ),
            CoproprietarioCreate(
                nome="Beatriz Mendes Santos",
                cpf_cnpj="555.555.555-55",
                rg="55.555-PR",
                genero="F",
                nacionalidade="brasileira",
                profissao="Advogada",
                estado_civil="casado",
                regime_bens="comunhao_universal",
                nome_conjuge="Rodrigo Santos",
                cpf_conjuge="666.666.666-66",
                rg_conjuge="66.666-PR",
                genero_conjuge="M",
                nacionalidade_conjuge="brasileiro",
                profissao_conjuge="Médico",
                endereco_completo="Rua Santos Dumont, 250, Umuarama-PR"
            )
        ]

        with DatabaseManager() as conn:
            cursor = conn.cursor()
            salvar_coproprietarios_transacao(cursor, 100, coprops)
            conn.commit()

            # Verifica se os registros foram inseridos na tabela confrontante_coproprietarios
            cursor.execute("SELECT nome, cpf_cnpj, estado_civil, nome_conjuge FROM confrontante_coproprietarios WHERE confrontante_id = 100 ORDER BY id ASC")
            rows = cursor.fetchall()
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0][0], "Lucas Ferreira")
            self.assertEqual(rows[0][2], "solteiro")
            self.assertEqual(rows[1][0], "Beatriz Mendes Santos")
            self.assertEqual(rows[1][3], "Rodrigo Santos")

            # Verifica se o JSON no confrontante foi atualizado
            cursor.execute("SELECT coproprietarios_json FROM confrontantes WHERE id = 100")
            json_str = cursor.fetchone()[0]
            self.assertIsNotNone(json_str)
            parsed_json = json.loads(json_str)
            self.assertEqual(len(parsed_json), 2)

        # 2. Gera a Declaração de Anuência HTML
        html = gerar_declaracao_anuencia_html(1, 10, 100)

        # 3. Validações de Qualificação e Condomínio
        self.assertIn("Marcos Oliveira Confrontante", html)
        self.assertIn("Camila Oliveira", html)
        self.assertIn("Lucas Ferreira", html)
        self.assertIn("Beatriz Mendes Santos", html)
        self.assertIn("Rodrigo Santos", html)

        # Qualificações detalhadas
        self.assertIn("444.444.444-44", html)
        self.assertIn("555.555.555-55", html)
        self.assertIn("666.666.666-66", html)
        self.assertIn("Advogada", html)
        self.assertIn("Médico", html)
        self.assertIn("Comunhão Universal de Bens", html)

        # Expressão legal de condomínio e pluralidade
        self.assertIn("proprietários e coproprietários em condomínio", html)
        self.assertIn("DECLARAM", html)
        self.assertIn("Os declarantes", html)

        # 4. Validações dos Blocos de Assinatura
        self.assertIn("Confrontante Anuente (Condômino)", html)
        self.assertIn("Cônjuge do Confrontante Anuente", html)
        self.assertIn("Coproprietário(a) Anuente", html)
        self.assertIn("Cônjuge do(a) Coproprietário(a) Anuente", html)

if __name__ == "__main__":
    unittest.main()
