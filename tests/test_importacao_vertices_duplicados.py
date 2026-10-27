import unittest
import io
from fastapi.testclient import TestClient
from database.connection import DatabaseManager, execute_query
from api import app
from services.parsers.txt_parser import TxtGeodesicParser

class TestImportacaoVerticesDuplicados(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM segmentos")
            cursor.execute("DELETE FROM pontos")
            cursor.execute("DELETE FROM matriculas")
            cursor.execute("DELETE FROM levantamentos")
            cursor.execute("DELETE FROM propriedades")
            cursor.execute("DELETE FROM clientes")
            cursor.execute("DELETE FROM pessoas")
            cursor.execute("DELETE FROM profissionais")

            cursor.execute("INSERT INTO pessoas (id, nome, cpf_cnpj) VALUES (200, 'Produtor Rural Teste', '98765432100')")
            cursor.execute("INSERT INTO clientes (id, pessoa_id) VALUES (200, 200)")
            cursor.execute("INSERT INTO propriedades (id, nome_propriedade, municipio, uf) VALUES (200, 'Fazenda Duplicatas', 'Cascavel', 'PR')")
            cursor.execute("INSERT INTO profissionais (id, nome, registro, codigo_credenciado) VALUES (200, 'Agrimensor Teste', '998877', 'TEST')")
            cursor.execute("INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio) VALUES (200, 200, 200, '2026-01-01')")
            cursor.execute("INSERT INTO matriculas (id, propriedade_id, numero_matricula) VALUES (600, 200, 'MAT-600')")
            conn.commit()

    def test_importar_txt_com_vertices_mesmo_nome(self):
        """Valida que importar caderneta com 2 ou mais vértices de mesmo nome não falha e gera sufixos automáticos."""
        conteudo_txt = (
            "B01,7351557.4404,244238.2521,324.9632,0.0000,0.0000,0.0000\n"
            "pt0,7351537.0072,244156.0117,331.9784,0.0050,0.0050,0.0110\n"
            "divisa,7351735.0290,244201.6158,331.1024,0.0050,0.0060,0.0140\n"
            "divisa1,7351768.8735,244550.6679,305.3204,0.0060,0.0060,0.0160\n"
            "rio100,7351793.3122,244629.2383,298.4364,0.0080,0.0110,0.0260\n"
            "divisa,7351586.9301,244503.1164,307.6024,0.0060,0.0080,0.0230\n"
            "divisa1,7351538.3564,244159.1123,331.9874,0.0040,0.0040,0.0130\n"
        )

        response = self.client.post(
            "/levantamentos/200/importar-txt",
            data={"matricula_id": 600, "fuso_utm": 22},
            files={"file": ("campo_teste.txt", io.BytesIO(conteudo_txt.encode("utf-8")), "text/plain")}
        )

        self.assertEqual(response.status_code, 200, f"Falha na importação: {response.text}")
        data = response.json()
        self.assertEqual(data.get("pontos_importados"), 7)

        # Verificar nomes no banco
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT nome_vertice, nome_original FROM pontos WHERE levantamento_id = 200 AND matricula_id = 600 ORDER BY ordem_caminhamento ASC"
            )
            rows = cursor.fetchall()
            nomes_finais = [r["nome_vertice"] for r in rows]
            nomes_originais = [r["nome_original"] for r in rows]

            self.assertIn("divisa", nomes_finais)
            self.assertIn("divisa_1", nomes_finais)
            self.assertIn("divisa1", nomes_finais)
            self.assertIn("divisa1_1", nomes_finais)

            # Os nomes originais devem preservar a grafia do coletor
            self.assertEqual(nomes_originais.count("divisa"), 2)
            self.assertEqual(nomes_originais.count("divisa1"), 2)

            # Segmentos perimetrais devem ter sido criados
            cursor.execute("SELECT COUNT(*) as c FROM segmentos WHERE levantamento_id = 200 AND matricula_id = 600")
            count_seg = cursor.fetchone()["c"]
            self.assertEqual(count_seg, 7)

    def test_fechamento_poligonal_repetido(self):
        """Valida que o vértice final repetido com mesmas coordenadas do primeiro é descartado como fechamento."""
        conteudo_txt = (
            "P1,7351000.0000,244000.0000,300.0000,0.0050,0.0050,0.0100\n"
            "P2,7351200.0000,244000.0000,302.0000,0.0050,0.0050,0.0100\n"
            "P3,7351200.0000,244200.0000,301.0000,0.0050,0.0050,0.0100\n"
            "P1,7351000.0000,244000.0000,300.0000,0.0050,0.0050,0.0100\n"
        )

        response = self.client.post(
            "/levantamentos/200/importar-txt",
            data={"matricula_id": 600, "fuso_utm": 22},
            files={"file": ("poligonal_fechada.txt", io.BytesIO(conteudo_txt.encode("utf-8")), "text/plain")}
        )

        self.assertEqual(response.status_code, 200, f"Falha na importação: {response.text}")
        data = response.json()
        # P1 final redundante deve ter sido ignorado, importando apenas os 3 vértices reais
        self.assertEqual(data.get("pontos_importados"), 3)

        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as c FROM pontos WHERE levantamento_id = 200 AND matricula_id = 600")
            self.assertEqual(cursor.fetchone()["c"], 3)
            cursor.execute("SELECT COUNT(*) as c FROM segmentos WHERE levantamento_id = 200 AND matricula_id = 600")
            self.assertEqual(cursor.fetchone()["c"], 3)

    def test_unir_lotes_com_mesmo_nome(self):
        """Valida que unir lotes de múltiplos arquivos com vértices de mesmo nome desambigua sem erro."""
        parser = TxtGeodesicParser(200, 600, fuso_utm=22)
        lote1 = [
            {"levantamento_id": 200, "matricula_id": 600, "nome_vertice": "M01", "nome_original": "M01", "tipo_ponto": "M", "ordem_caminhamento": 1, "arquivo_origem": "a1.txt"},
            {"levantamento_id": 200, "matricula_id": 600, "nome_vertice": "P01", "nome_original": "P01", "tipo_ponto": "P", "ordem_caminhamento": 2, "arquivo_origem": "a1.txt"},
        ]
        lote2 = [
            {"levantamento_id": 200, "matricula_id": 600, "nome_vertice": "P01", "nome_original": "P01", "tipo_ponto": "P", "ordem_caminhamento": 1, "arquivo_origem": "a2.txt"},
            {"levantamento_id": 200, "matricula_id": 600, "nome_vertice": "P02", "nome_original": "P02", "tipo_ponto": "P", "ordem_caminhamento": 2, "arquivo_origem": "a2.txt"},
        ]

        unidos = TxtGeodesicParser.unir_lotes([lote1, lote2])
        nomes = [p["nome_vertice"] for p in unidos]
        self.assertEqual(nomes, ["M01", "P01", "P01_1", "P02"])

    def test_inserir_pontos_com_vertice_preexistente_no_banco(self):
        """Valida que ao importar um vértice cujo nome já existe no banco, ele é renomeado automaticamente evitando erro UNIQUE."""
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, status_ponto, ordem_caminhamento)
                VALUES (200, 600, 'marco1', 'P', -24.0, -53.0, 300.0, 'CORRIGIDO', 1)
                """
            )
            conn.commit()

        conteudo_txt = (
            "marco1,7351000.0000,244000.0000,300.0000,0.0050,0.0050,0.0100\n"
            "marco2,7351200.0000,244000.0000,302.0000,0.0050,0.0050,0.0100\n"
        )

        response = self.client.post(
            "/levantamentos/200/importar-txt",
            data={"matricula_id": 600, "fuso_utm": 22},
            files={"file": ("novo_trecho.txt", io.BytesIO(conteudo_txt.encode("utf-8")), "text/plain")}
        )

        self.assertEqual(response.status_code, 200, f"Falha na importação: {response.text}")

        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT nome_vertice FROM pontos WHERE levantamento_id = 200 AND matricula_id = 600")
            nomes = [r["nome_vertice"] for r in cursor.fetchall()]
            self.assertIn("marco1", nomes)
            self.assertIn("marco1_1", nomes)
            self.assertIn("marco2", nomes)

    def test_linha_com_delimitador_duplo_topcon(self):
        """Valida que linhas com vírgulas duplas no layout Topcon (campo vazio) não geram erro de float."""
        conteudo_txt = (
            "pt1,7351646.0259,244665.5361,296.8164,,0.0080,0.0110,0.0300\n"
            "pt2,7351626.9583,244670.4911,296.6834,0.0080,0.0110,0.0300\n"
        )
        response = self.client.post(
            "/levantamentos/200/importar-txt",
            data={"matricula_id": 600, "fuso_utm": 22},
            files={"file": ("campo_delimitador_duplo.txt", io.BytesIO(conteudo_txt.encode("utf-8")), "text/plain")}
        )
        self.assertEqual(response.status_code, 200, f"Falha na importação: {response.text}")
        data = response.json()
        self.assertEqual(data.get("pontos_importados"), 2)
