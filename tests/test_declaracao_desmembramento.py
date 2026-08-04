import unittest
import sqlite3
from database.connection import DatabaseManager
from database.models import create_tables
from services.documentacao.cartorio.laudos_imovel import (
    gerar_declaracao_anuencia_desmembramento_html,
    gerar_laudo_tecnico_html,
    gerar_declaracao_responsabilidade_html,
    gerar_termo_responsabilidade_sigef_html,
    gerar_manual_proprietario_html,
    gerar_requerimento_cartorio_html
)
from services.documentacao.cartorio_generator import CartorioReportGenerator

class TestDeclaracaoDesmembramento(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)
            cursor = conn.cursor()

            # Limpar dados residuais do teste se existirem
            cursor.execute("DELETE FROM pessoas WHERE cpf_cnpj IN ('99988877766', '11122233344')")

            # Criar profissional de teste
            cursor.execute("""
                INSERT INTO profissionais (nome, registro, codigo_credenciado, formacao, conselho)
                VALUES ('João Eng', '12345/D', 'ABCD', 'Engenheiro Agrônomo', 'CREA-PR')
            """)
            cls.prof_id = cursor.lastrowid

            # Criar pessoa proprietário
            cursor.execute("""
                INSERT INTO pessoas (nome, cpf_cnpj, rg, nacionalidade, profissao, estado_civil, endereco_completo)
                VALUES ('Maria Proprietária', '99988877766', '9876543', 'brasileira', 'agricultora', 'solteira', 'Rua das Flores, 100')
            """)
            cls.pessoa_id = cursor.lastrowid

            cursor.execute("""
                INSERT INTO clientes (pessoa_id, profissional_id, sexo) VALUES (?, ?, 'F')
            """, (cls.pessoa_id, cls.prof_id))
            cls.cliente_id = cursor.lastrowid

            # Criar propriedade
            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, municipio, uf, codigo_ccir)
                VALUES ('Fazenda Santa Maria', 'Cascavel', 'PR', '1234567890123')
            """)
            cls.prop_id = cursor.lastrowid

            # Vincular propriedade e cliente
            cursor.execute("""
                INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao)
                VALUES (?, ?, 100.0)
            """, (cls.prop_id, cls.cliente_id))

            # Criar matrícula
            cursor.execute("""
                INSERT INTO matriculas (propriedade_id, numero_matricula, denominacao, georreferenciamento, cri_comarca)
                VALUES (?, '12345', 'Gleba A', '12345678-1234-1234-1234-123456789012', 'Cascavel')
            """, (cls.prop_id,))
            cls.mat_id = cursor.lastrowid

            # Criar levantamento
            cursor.execute("""
                INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio)
                VALUES (?, ?, '2026-01-01')
            """, (cls.prop_id, cls.prof_id))
            cls.lev_id = cursor.lastrowid

            # Criar confrontante de teste
            cursor.execute("""
                INSERT INTO pessoas (nome, cpf_cnpj, rg, nacionalidade, profissao, estado_civil, endereco_completo)
                VALUES ('José Confrontante', '11122233344', '123456', 'brasileiro', 'agricultor', 'solteiro', 'Linha 1, Zona Rural')
            """)
            conf_pessoa_id = cursor.lastrowid
            cursor.execute("""
                INSERT INTO confrontantes (levantamento_id, pessoa_id, matricula_imovel)
                VALUES (?, ?, '9999')
            """, (cls.lev_id, conf_pessoa_id))
            cls.conf_id = cursor.lastrowid

            # Criar pontos de teste
            cursor.execute("""
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, lat, lon, tipo_ponto, ordem_caminhamento)
                VALUES (?, ?, 'P1', -24.1, -53.1, 'P', 1)
            """, (cls.lev_id, cls.mat_id))
            p1_id = cursor.lastrowid
            cursor.execute("""
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, lat, lon, tipo_ponto, ordem_caminhamento)
                VALUES (?, ?, 'P2', -24.2, -53.2, 'P', 2)
            """, (cls.lev_id, cls.mat_id))
            p2_id = cursor.lastrowid
            cursor.execute("""
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, lat, lon, tipo_ponto, ordem_caminhamento)
                VALUES (?, ?, 'P3', -24.3, -53.3, 'P', 3)
            """, (cls.lev_id, cls.mat_id))
            p3_id = cursor.lastrowid

            # Criar segmento
            cursor.execute("""
                INSERT INTO segmentos (levantamento_id, matricula_id, confrontante_id, ponto_inicio_id, ponto_fim_id, tipo_limite_sigef, metodo_posicionamento_sigef)
                VALUES (?, ?, ?, ?, ?, 'LA', 'PG1')
            """, (cls.lev_id, cls.mat_id, cls.conf_id, p1_id, p2_id))

            conn.commit()

    def test_gerar_declaracao_anuencia_desmembramento_html(self):
        html = CartorioReportGenerator.gerar_declaracao_anuencia_desmembramento_html(
            lev_id=self.lev_id,
            matricula_id=self.mat_id,
            codigo_cns="09.123-4",
            qtd_parcelas=3
        )
        self.assertIn("DECLARAÇÃO DE ANUÊNCIA PARA DESMEMBRAMENTO DE PARCELA CERTIFICADA", html)
        self.assertIn("Maria Proprietária", html)
        self.assertTrue("Fazenda Santa Maria" in html or "Gleba A" in html)
        self.assertIn("12345", html)
        self.assertIn("1234567890123", html)
        self.assertIn("09.123-4", html)
        self.assertIn("João Eng", html)
        self.assertIn("ABCD", html)
        self.assertIn("12345678-1234-1234-1234-123456789012", html)
        self.assertIn("3 (três)", html)

    def test_todos_laudos_cartorio_import_e_geracao(self):
        html_laudo = CartorioReportGenerator.gerar_laudo_tecnico_html(self.lev_id, self.mat_id)
        self.assertIn("LAUDO TÉCNICO", html_laudo)

        html_resp = CartorioReportGenerator.gerar_declaracao_responsabilidade_html(self.lev_id, self.mat_id)
        self.assertIn("DECLARAÇÃO DE RESPONSABILIDADE", html_resp)

        html_sigef = CartorioReportGenerator.gerar_termo_responsabilidade_sigef_html(self.lev_id, self.mat_id)
        self.assertIn("RESPONSABILIDADE TÉCNICA", html_sigef)

        html_manual = CartorioReportGenerator.gerar_manual_proprietario_html(self.lev_id, self.mat_id)
        self.assertIn("MANUAL", html_manual)

        html_req = CartorioReportGenerator.gerar_requerimento_cartorio_html(self.lev_id, self.mat_id)
        self.assertIn("Requerimento", html_req)

    def test_gerar_declaracao_anuencia_individual_e_lote_html(self):
        html_indiv = CartorioReportGenerator.gerar_declaracao_anuencia_html(self.lev_id, self.mat_id, self.conf_id)
        self.assertIn("José Confrontante", html_indiv)
        self.assertIn("ANEXO GRÁFICO", html_indiv)

        html_lote = CartorioReportGenerator.gerar_declaracao_anuencia_lote_html(self.lev_id, self.mat_id)
        self.assertIn("Lote de Anuências", html_lote)
        self.assertIn("José Confrontante", html_lote)

if __name__ == "__main__":
    unittest.main()
