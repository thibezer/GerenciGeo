import unittest
import os
import io
import zipfile
import xml.etree.ElementTree as ET
from fastapi.testclient import TestClient
from database.connection import DatabaseManager, execute_query
from api import app
from routes.levantamento.homologacao import persistir_pontos_homologados
from utils.geodesia_parser import extract_codigo_parts, resolver_coordenadas_robust, parse_num_robust

class TestHomologacaoODS(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        # Limpar registros de teste
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM segmentos")
            cursor.execute("DELETE FROM banco_pontos")
            cursor.execute("DELETE FROM pontos")
            cursor.execute("DELETE FROM matriculas")
            cursor.execute("DELETE FROM levantamentos")
            cursor.execute("DELETE FROM propriedades")
            cursor.execute("DELETE FROM clientes")
            cursor.execute("DELETE FROM pessoas")
            cursor.execute("DELETE FROM profissionais")
            
            cursor.execute("INSERT INTO pessoas (id, nome, cpf_cnpj) VALUES (100, 'Proprietário Teste', '12345678901')")
            cursor.execute("INSERT INTO clientes (id, pessoa_id) VALUES (100, 100)")
            cursor.execute("INSERT INTO propriedades (id, nome_propriedade, municipio, uf) VALUES (100, 'Fazenda Modelo', 'Umuarama', 'PR')")
            cursor.execute("INSERT INTO profissionais (id, nome, registro, codigo_credenciado) VALUES (100, 'Engenheiro Teste', '123456', 'XRXR')")
            cursor.execute("INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio) VALUES (100, 100, 100, '2026-01-01')")
            cursor.execute("INSERT INTO matriculas (id, propriedade_id, numero_matricula) VALUES (500, 100, 'MAT-500')")
            conn.commit()

    def test_import_ods_com_pontos_preexistentes(self):
        """Valida que importar pontos homologados não gera erro de UNIQUE constraint quando já existem pontos de campo"""
        # Inserir pontos de campo previamente na matricula 500
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, origem_homologada, status_ponto)
                VALUES (100, 500, 'XRXR-M-0004', 'M', -23.5000, -53.4000, 300.0, 0, 'BRUTO')
                """
            )
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, origem_homologada, status_ponto)
                VALUES (100, 500, 'DB5-P-24225', 'P', -23.5100, -53.4100, 290.0, 0, 'BRUTO')
                """
            )
            conn.commit()

        ods_path = os.path.join("Arquivos de teste", "42859.ods")
        if not os.path.exists(ods_path):
            self.skipTest(f"Arquivo de teste '{ods_path}' não encontrado.")

        with open(ods_path, "rb") as f:
            file_bytes = f.read()

        import json
        mapeamento = json.dumps({"42859.ods#perimetro_1": 500})

        response = self.client.post(
            "/levantamentos/100/importar-pontos-aprovados-lote",
            params={"mapeamento": mapeamento, "fuso_utm": 22},
            files=[("files", ("42859.ods", file_bytes, "application/vnd.oasis.opendocument.spreadsheet"))]
        )

        self.assertEqual(response.status_code, 200, f"Erro na importação: {response.text}")
        data = response.json()
        self.assertTrue(data.get("sucesso"))
        self.assertEqual(data.get("pontos_importados"), 66)

        # Verificar se os pontos foram atualizados para origem_homologada = 1 e coordenadas corretas
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT lat, lon, alt, origem_homologada, status_ponto FROM pontos WHERE levantamento_id = 100 AND matricula_id = 500 AND nome_vertice = 'XRXR-M-0004'")
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["origem_homologada"], 1)
            self.assertEqual(row["status_ponto"], "CORRIGIDO")
            self.assertAlmostEqual(row["lat"], -23.57891788, places=4)

            # Verificar total de pontos na matrícula
            cursor.execute("SELECT COUNT(*) as c FROM pontos WHERE levantamento_id = 100 AND matricula_id = 500")
            count_pts = cursor.fetchone()["c"]
            self.assertEqual(count_pts, 66)

            # Verificar segmentos criados
            cursor.execute("SELECT COUNT(*) as c FROM segmentos WHERE levantamento_id = 100 AND matricula_id = 500")
            count_segs = cursor.fetchone()["c"]
            self.assertEqual(count_segs, 66)

    def test_import_multiplas_planilhas_perimetros_separados(self):
        """Valida que importar 2 planilhas gera 2 perímetros independentes (sem interconectar pontos entre as planilhas)"""
        csv1 = (
            "CODIGO;LONGITUDE;LATITUDE;Z;SIGMA_X;SIGMA_Y;SIGMA_Z;METODO_POSICIONAMENTO;LADO;CNS_CONFRONTANTE;MATRICULA_CONFRONTANTE;CONFRONTANTE_DESC\n"
            "XRXR-M-0001;-53.4000;-23.5000;300.0;0.05;0.05;0.05;PG1;LA1;;;\n"
            "XRXR-M-0002;-53.4010;-23.5000;300.0;0.05;0.05;0.05;PG1;LA1;;;\n"
            "XRXR-M-0003;-53.4010;-23.5010;300.0;0.05;0.05;0.05;PG1;LA1;;;\n"
            "XRXR-M-0004;-53.4000;-23.5010;300.0;0.05;0.05;0.05;PG1;LA1;;;\n"
        ).encode("utf-8")

        csv2 = (
            "CODIGO;LONGITUDE;LATITUDE;Z;SIGMA_X;SIGMA_Y;SIGMA_Z;METODO_POSICIONAMENTO;LADO;CNS_CONFRONTANTE;MATRICULA_CONFRONTANTE;CONFRONTANTE_DESC\n"
            "XRXR-P-0010;-53.4100;-23.5100;310.0;0.05;0.05;0.05;PG1;LA1;;;\n"
            "XRXR-P-0011;-53.4110;-23.5100;310.0;0.05;0.05;0.05;PG1;LA1;;;\n"
            "XRXR-P-0012;-53.4110;-23.5110;310.0;0.05;0.05;0.05;PG1;LA1;;;\n"
        ).encode("utf-8")

        import json
        mapeamento = json.dumps({
            "gleba_norte.csv#Arquivo Único": 500,
            "gleba_sul.csv#Arquivo Único": 500
        })

        response = self.client.post(
            "/levantamentos/100/importar-pontos-aprovados-lote",
            params={"mapeamento": mapeamento, "fuso_utm": 22},
            files=[
                ("files", ("gleba_norte.csv", csv1, "text/csv")),
                ("files", ("gleba_sul.csv", csv2, "text/csv"))
            ]
        )

        self.assertEqual(response.status_code, 200, f"Erro: {response.text}")
        data = response.json()
        self.assertTrue(data.get("sucesso"))
        self.assertEqual(data.get("pontos_importados"), 7)

        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # Verificar se os pontos possuem arquivos_origem distintos
            cursor.execute("SELECT DISTINCT arquivo_origem FROM pontos WHERE levantamento_id = 100 AND matricula_id = 500")
            arquivos = sorted([r["arquivo_origem"] for r in cursor.fetchall()])
            self.assertEqual(arquivos, ["gleba_norte.csv", "gleba_sul.csv"])

            # Verificar segmentos criados (4 da gleba norte + 3 da gleba sul = 7)
            cursor.execute("""
                SELECT s.id, p1.nome_vertice as v_ini, p2.nome_vertice as v_fim,
                       p1.arquivo_origem as arq_ini, p2.arquivo_origem as arq_fim
                FROM segmentos s
                JOIN pontos p1 ON s.ponto_inicio_id = p1.id
                JOIN pontos p2 ON s.ponto_fim_id = p2.id
                WHERE s.levantamento_id = 100 AND s.matricula_id = 500
            """)
            segs = cursor.fetchall()
            self.assertEqual(len(segs), 7)

            # NENHUM segmento pode conectar um ponto da gleba_norte com um ponto da gleba_sul
            for s in segs:
                self.assertEqual(s["arq_ini"], s["arq_fim"], f"Segmento cruzado inválido detectado entre planilhas distintas: {s['v_ini']} -> {s['v_fim']}")
