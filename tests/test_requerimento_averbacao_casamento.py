import unittest
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager
from database.models import create_tables
from services.documentacao.cartorio_generator import CartorioReportGenerator

class TestRequerimentoAverbacaoCasamento(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        with DatabaseManager() as conn:
            create_tables(conn)
            cursor = conn.cursor()

            # Limpar registros residuais
            cursor.execute("DELETE FROM pessoas WHERE cpf_cnpj IN ('12345678901', '98765432109')")

            # 1. Profissional
            cursor.execute("""
                INSERT INTO profissionais (nome, registro, codigo_credenciado, formacao, conselho)
                VALUES ('Dr. Geodésico', '54321/PR', 'XYZW', 'Engenheiro Cartógrafo', 'CREA-PR')
            """)
            cls.prof_id = cursor.lastrowid

            # 2. Pessoa casada
            cursor.execute("""
                INSERT INTO pessoas (
                    nome, cpf_cnpj, rg, nacionalidade, profissao, estado_civil, regime_bens,
                    nome_conjuge, cpf_conjuge, rg_conjuge, nacionalidade_conjuge, profissao_conjuge,
                    endereco_completo
                ) VALUES (
                    'Carlos Eduardo Silva', '12345678901', '12.345.678-9', 'brasileiro', 'Empresário Rural', 'casado', 'Comunhão Parcial de Bens',
                    'Ana Paula Souza Silva', '98765432109', '98.765.432-1', 'brasileira', 'Arquiteta',
                    'Avenida Brasil, nº 1500, Centro, Cascavel/PR'
                )
            """)
            cls.pessoa_id = cursor.lastrowid

            # 3. Cliente
            cursor.execute("""
                INSERT INTO clientes (pessoa_id, profissional_id, email, telefone, cidade, estado, cep, sexo)
                VALUES (?, ?, 'carlos.silva@email.com', '(45) 99999-8888', 'Cascavel', 'PR', '85800-000', 'M')
            """, (cls.pessoa_id, cls.prof_id))
            cls.cliente_id = cursor.lastrowid

            # 4. Propriedade
            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, municipio, uf, codigo_ccir)
                VALUES ('Fazenda Boa Esperança', 'Cascavel', 'PR', '9876543210123')
            """)
            cls.prop_id = cursor.lastrowid

            # 5. Vínculo Propriedade-Cliente
            cursor.execute("""
                INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao)
                VALUES (?, ?, 100.0)
            """, (cls.prop_id, cls.cliente_id))

            # 6. Matrícula
            cursor.execute("""
                INSERT INTO matriculas (propriedade_id, numero_matricula, denominacao, cri_comarca, cri_circunscricao)
                VALUES (?, '77889', 'Gleba Primavera', 'Cascavel', '1ª Circunscrição')
            """, (cls.prop_id,))
            cls.mat_id = cursor.lastrowid

            # 7. Levantamento
            cursor.execute("""
                INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio)
                VALUES (?, ?, '2026-03-01')
            """, (cls.prop_id, cls.prof_id))
            cls.lev_id = cursor.lastrowid

            conn.commit()

    def test_gerar_requerimento_averbacao_casamento_html_direto(self):
        html = CartorioReportGenerator.gerar_requerimento_averbacao_casamento_html(
            lev_id=self.lev_id,
            matricula_id=self.mat_id,
            cliente_id=self.cliente_id,
            params={
                "data_celebracao": "15/10/2020",
                "cartorio_civil": "Oficial de Registro Civil das Pessoas Naturais do 1º Subdistrito de Cascavel/PR",
                "livro": "B-12",
                "folha": "145",
                "termo": "8920",
                "alteracao_nome": "A contraente passou a assinar Ana Paula Souza Silva",
                "pacto_antenupcial": "Não houve, adotado regime legal (Comunhão Parcial de Bens)"
            }
        )

        # Verificações estruturais
        self.assertIn("ILMO. SR. OFICIAL DO 1º OFICIAL DE REGISTRO DE IMÓVEIS DA COMARCA DE CASCAVEL/PR", html)
        self.assertIn("REQUERENTE:", html)
        self.assertIn("Carlos Eduardo Silva", html)
        self.assertIn("123.456.789-01", html)
        self.assertIn("12.345.678-9", html)
        self.assertIn("(45) 99999-8888", html)
        self.assertIn("carlos.silva@email.com", html)
        
        self.assertIn("DADOS DO CÔNJUGE:", html)
        self.assertIn("Ana Paula Souza Silva", html)
        self.assertIn("987.654.321-09", html)
        self.assertIn("98.765.432-1", html)
        
        self.assertIn("Matrícula nº 77889", html)
        self.assertIn("art. 167, inciso II, item 5, e art. 246 da Lei Federal nº 6.015/1973", html)
        self.assertIn("AVERBAÇÃO DE CASAMENTO", html)
        self.assertIn("15/10/2020", html)
        self.assertIn("Comunhão Parcial de Bens", html)
        self.assertIn("Livro nº B-12, Folha nº 145, Termo nº 8920", html)
        self.assertIn("Não houve, adotado regime legal", html)
        self.assertIn("Ana Paula Souza Silva", html)
        self.assertIn("pede e espera deferimento", html)

    def test_endpoint_api_requerimento_averbacao_casamento(self):
        res = self.client.get(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/requerimento-averbacao-casamento-html"
            "?data_celebracao=20/05/2018&livro=A-05&folha=32&termo=1204&numero_oficio=2"
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/html", res.headers.get("content-type", ""))
        html = res.text
        self.assertIn("ILMO. SR. OFICIAL DO 2º OFICIAL DE REGISTRO DE IMÓVEIS DA COMARCA DE CASCAVEL/PR", html)
        self.assertIn("Carlos Eduardo Silva", html)
        self.assertIn("Ana Paula Souza Silva", html)
        self.assertIn("20/05/2018", html)
        self.assertIn("Livro nº A-05, Folha nº 32, Termo nº 1204", html)

    def test_fallback_sem_parametros(self):
        res = self.client.get(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/requerimento-averbacao-casamento-html"
        )
        self.assertEqual(res.status_code, 200)
        html = res.text
        self.assertIn("Carlos Eduardo Silva", html)
        self.assertIn("Ana Paula Souza Silva", html)
        self.assertIn("Matrícula nº 77889", html)

if __name__ == "__main__":
    unittest.main()
