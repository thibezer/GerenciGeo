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
            cursor.execute("DELETE FROM pessoas WHERE cpf_cnpj = '99988877766'")

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

if __name__ == "__main__":
    unittest.main()
