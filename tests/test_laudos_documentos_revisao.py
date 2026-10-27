import unittest
import uuid
from fastapi.testclient import TestClient
from api import app
from database.connection import execute_query, DatabaseManager

class TestLaudosDocumentosRevisao(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        # Gerar identificadores únicos para não colidir em execuções repetidas
        uid = uuid.uuid4().hex[:6]
        cls.cpf_teste = f"555.{uid[:3]}.{uid[3:6]}-88"

        # Criar dados de teste com isolamento
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            # 1. Profissional
            cursor.execute("""
                INSERT INTO profissionais (nome, registro, conselho, formacao, codigo_credenciado, cpf, rg, endereco, endereco_residencial)
                VALUES ('Dr. Engenheiro Cartógrafo', 'CREA 99999-D', 'CREA-PR', 'Engenheiro Cartógrafo', 'INCRA-99', ?, '12.345.678-9', 'Rua Comercial, 100', 'Rua Residencial, 200')
            """, (f"111.{uid[:3]}.{uid[3:6]}-44",))
            cls.prof_id = cursor.lastrowid

            # 2. Propriedade fora do PR para testar dinamismo de UF (ex.: MS)
            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, municipio, uf, codigo_car, codigo_ccir)
                VALUES ('Fazenda Pantanal Sul', 'Corumbá', 'MS', 'MS-CAR-1234', '987654321')
            """)
            cls.prop_id = cursor.lastrowid

            # 3. Pessoa / Proprietário
            cursor.execute("""
                INSERT INTO pessoas (nome, cpf_cnpj, rg, estado_civil, genero, nacionalidade, profissao, endereco_completo)
                VALUES ('João Pantaneiro', ?, '987654-SSP', 'Solteiro', 'M', 'Brasileiro', 'Pecuarista', 'Zona Rural, Corumbá/MS')
            """, (cls.cpf_teste,))
            cls.pessoa_id = cursor.lastrowid

            # 4. Cliente
            cursor.execute("""
                INSERT INTO clientes (pessoa_id)
                VALUES (?)
            """, (cls.pessoa_id,))
            cls.cliente_id = cursor.lastrowid

            # 5. Vinculo Propriedade-Cliente
            cursor.execute("""
                INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao)
                VALUES (?, ?, 100.0)
            """, (cls.prop_id, cls.cliente_id))

            # 6. Matrícula
            cursor.execute("""
                INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha, cri_comarca, denominacao)
                VALUES (?, '55443', 150.5, 'Corumbá', 'Gleba Sul')
            """, (cls.prop_id,))
            cls.mat_id = cursor.lastrowid

            # 7. Levantamento
            cursor.execute("""
                INSERT INTO levantamentos (propriedade_id, profissional_id, status, data_inicio)
                VALUES (?, ?, 'EM_ANDAMENTO', '2026-05-10')
            """, (cls.prop_id, cls.prof_id))
            cls.lev_id = cursor.lastrowid

            # 8. Ponto Base tipo M no MS (Longitude ~ -57.5, deve cair na Zona 21S)
            cursor.execute("""
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, status_ponto)
                VALUES (?, ?, 'M-01', 'M', -19.0, -57.5, 120.0, 'CORRIGIDO')
            """, (cls.lev_id, cls.mat_id))

            # 9. Banco de pontos
            cursor.execute("""
                INSERT INTO banco_pontos (levantamento_id, matricula_id, profissional_id, codigo_completo, norte, este, altitude, tipo_ponto, numero)
                VALUES (?, ?, ?, 'M-01', 7890000.0, 450000.0, 120.0, 'M', 1)
            """, (cls.lev_id, cls.mat_id, cls.prof_id))

            conn.commit()

    def test_laudo_fronteira_assinatura_rt(self):
        """Verifica se o Laudo de Faixa de Fronteira possui o bloco de assinatura do RT e data formatada"""
        res = self.client.get(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/laudo-fronteira-html?numero_trt=TRT-2026-999&data_trt=2026-05-10"
        )
        self.assertEqual(res.status_code, 200)
        html = res.text

        # Deve conter a assinatura do RT
        self.assertIn("Dr. Engenheiro Cartógrafo", html)
        self.assertIn("Engenheiro Cartógrafo", html)
        self.assertIn("CREA 99999-D", html)
        # Deve conter a TRT e data
        self.assertIn("TRT-2026-999", html)
        self.assertIn("10/05/2026", html)
        # Deve conter a distância calculada
        self.assertIn("km", html)

    def test_requerimento_ratificacao_estado_dinamico(self):
        """Verifica se o Requerimento de Ratificação exibe o estado dinâmico (MS) sem 'PARANÁ' hardcoded no cabeçalho"""
        res = self.client.get(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/requerimento-ratificacao-html"
        )
        self.assertEqual(res.status_code, 200)
        html = res.text

        # Deve conter Comarca de Corumbá e Estado de Mato Grosso do Sul
        self.assertIn("CORUMBÁ", html)
        self.assertIn("MATO GROSSO DO SUL", html)
        # NÃO deve conter "COMARCA DE CORUMBÁ - PARANÁ"
        self.assertNotIn("COMARCA DE CORUMBÁ - PARANÁ", html)
        # O rodapé deve conter Corumbá-MS
        self.assertIn("Corumbá-MS", html)

    def test_laudo_tecnico_fuso_utm_dinamico_e_assinatura(self):
        """Verifica se o Laudo Técnico detecta o fuso UTM 21S (Long -57.5) e contém assinatura do RT"""
        res = self.client.get(
            f"/levantamentos/{self.lev_id}/matriculas/{self.mat_id}/laudo-tecnico-html?numero_trt=TRT-2026-999&data_trt=2026-05-10"
        )
        self.assertEqual(res.status_code, 200)
        html = res.text

        # Deve calcular Zona 21S com MC 57° W e EPSG:31981
        self.assertIn("UTM Zona 21S (EPSG:31981)", html)
        self.assertIn("Meridiano Central 57° W", html)
        # Não deve conter asteriscos markdown soltos "**UTM"
        self.assertNotIn("**UTM", html)
        # Deve conter a assinatura do RT no rodapé
        self.assertIn("Dr. Engenheiro Cartógrafo", html)
        self.assertIn("Engenheiro Cartógrafo", html)

    def test_rotas_legadas_compatibilidade(self):
        """Verifica que as rotas legadas /documentos/gerar-requerimento funcionam delegando para o novo motor"""
        res = self.client.get(f"/levantamentos/{self.lev_id}/documentos/gerar-requerimento?matricula_id={self.mat_id}")
        self.assertEqual(res.status_code, 200)
        self.assertIn("Gleba Sul", res.text)
        self.assertIn("55443", res.text)

if __name__ == "__main__":
    unittest.main()
