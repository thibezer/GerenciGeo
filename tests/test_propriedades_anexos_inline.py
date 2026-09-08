import unittest
import tempfile
import os
from pathlib import Path
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager

client = TestClient(app)

class TestPropriedadesAnexosInline(unittest.TestCase):
    def setUp(self):
        # Cria arquivos temporários reais para testar o envio
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.car_file = Path(self.tmp_dir.name) / "CAR_TESTE_123.pdf"
        self.car_file.write_bytes(b"%PDF-1.4 Fake CAR PDF Content")
        
        self.ccir_file = Path(self.tmp_dir.name) / "CCIR_TESTE_456.pdf"
        self.ccir_file.write_bytes(b"%PDF-1.4 Fake CCIR PDF Content")

        self.mat_file = Path(self.tmp_dir.name) / "MAT_TESTE_789.pdf"
        self.mat_file.write_bytes(b"%PDF-1.4 Fake Matricula PDF Content")

        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, municipio, uf, caminho_arquivo_car, caminho_arquivo_ccir)
                VALUES ('Fazenda Anexo Teste', 'Cascavel', 'PR', ?, ?)
            """, (str(self.car_file), str(self.ccir_file)))
            self.prop_id = cursor.lastrowid

            cursor.execute("""
                INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha, caminho_arquivo_pdf)
                VALUES (?, '99999', 10.5, ?)
            """, (self.prop_id, str(self.mat_file)))
            self.mat_id = cursor.lastrowid
            conn.commit()

    def tearDown(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM matriculas WHERE id = ?", (self.mat_id,))
            cursor.execute("DELETE FROM propriedades WHERE id = ?", (self.prop_id,))
            conn.commit()
        self.tmp_dir.cleanup()

    def test_car_abertura_inline_e_download(self):
        # 1. Sem parâmetro de download deve abrir inline no navegador
        res_inline = client.get(f"/propriedades/{self.prop_id}/arquivo-car")
        self.assertEqual(res_inline.status_code, 200)
        content_disp = res_inline.headers.get("content-disposition", "")
        self.assertTrue(content_disp.startswith("inline"), f"Esperado 'inline', recebido: {content_disp}")
        self.assertIn("CAR_TESTE_123.pdf", content_disp)

        # 2. Com download=true deve forçar attachment
        res_download = client.get(f"/propriedades/{self.prop_id}/arquivo-car?download=true")
        self.assertEqual(res_download.status_code, 200)
        content_disp_dl = res_download.headers.get("content-disposition", "")
        self.assertTrue(content_disp_dl.startswith("attachment"), f"Esperado 'attachment', recebido: {content_disp_dl}")
        self.assertIn("CAR_TESTE_123.pdf", content_disp_dl)

    def test_ccir_abertura_inline_e_download(self):
        # 1. Sem parâmetro de download deve abrir inline no navegador
        res_inline = client.get(f"/propriedades/{self.prop_id}/arquivo-ccir")
        self.assertEqual(res_inline.status_code, 200)
        content_disp = res_inline.headers.get("content-disposition", "")
        self.assertTrue(content_disp.startswith("inline"), f"Esperado 'inline', recebido: {content_disp}")
        self.assertIn("CCIR_TESTE_456.pdf", content_disp)

        # 2. Com download=true deve forçar attachment
        res_download = client.get(f"/propriedades/{self.prop_id}/arquivo-ccir?download=true")
        self.assertEqual(res_download.status_code, 200)
        content_disp_dl = res_download.headers.get("content-disposition", "")
        self.assertTrue(content_disp_dl.startswith("attachment"), f"Esperado 'attachment', recebido: {content_disp_dl}")
        self.assertIn("CCIR_TESTE_456.pdf", content_disp_dl)

    def test_matricula_pdf_inline_e_download(self):
        # 1. Sem parâmetro de download deve abrir inline no navegador
        res_inline = client.get(f"/matriculas/{self.mat_id}/download-pdf")
        self.assertEqual(res_inline.status_code, 200)
        content_disp = res_inline.headers.get("content-disposition", "")
        self.assertTrue(content_disp.startswith("inline"), f"Esperado 'inline', recebido: {content_disp}")

        # 2. Com download=true deve forçar attachment
        res_download = client.get(f"/matriculas/{self.mat_id}/download-pdf?download=true")
        self.assertEqual(res_download.status_code, 200)
        content_disp_dl = res_download.headers.get("content-disposition", "")
        self.assertTrue(content_disp_dl.startswith("attachment"), f"Esperado 'attachment', recebido: {content_disp_dl}")

if __name__ == "__main__":
    unittest.main()
