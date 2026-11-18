"""
tests/test_arquivos_enviados_e_pdf_limpo.py — Testes para:
1. Remoção de marca d'água em PDFs de matrícula (`gerar_pdf_sem_marca`) preservando original + limpo.
2. Upload/download/limpeza/exclusão nas rotas de matrícula (`/matriculas/{mid}/...`).
3. Registro e verificação anti-repetição de arquivos enviados (`arquivos_enviados_ia`, CLI e API).
"""

import io
import json
import os
import subprocess
import tempfile
import unittest

import fitz
from PIL import Image
from fastapi.testclient import TestClient

from api import app
from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from scripts.cadastrar_cliente_ia import processar_cadastro_ia
from scripts.cadastrar_matricula_ia import processar_matricula_ia
from services.gestores.historico_arquivos_service import (
    calcular_sha256_bytes,
    excluir_arquivo_enviado,
    listar_arquivos_enviados,
    registrar_arquivo_enviado,
    verificar_arquivo_enviado,
    verificar_lote_arquivos,
)
from services.processamento.pdf_limpeza import gerar_pdf_sem_marca


def _criar_pdf_com_marca_dagua_bytes() -> bytes:
    """Gera um PDF sintético com imagem escaneada de fundo e texto vetorial de marca d'água por cima."""
    img = Image.new("RGB", (400, 500), color=(248, 248, 245))
    img_buf = io.BytesIO()
    img.save(img_buf, format="PNG")
    img_bytes = img_buf.getvalue()

    doc = fitz.open()
    page = doc.new_page(width=400, height=500)
    page.insert_image(page.rect, stream=img_bytes)
    page.insert_text((40, 250), "PARA SIMPLES CONFERENCIA - SEM VALOR LEGAL", fontsize=14, color=(0.8, 0.2, 0.2))
    data = doc.tobytes()
    doc.close()
    return data


class TestArquivosEnviadosEPdfLimpo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)

    def setUp(self):
        self.client = TestClient(app)
        self.hist_ids = []
        self.mat_ids = []
        self.prop_ids = []
        self.cli_ids = []
        self.arquivos_temp = []

    def tearDown(self):
        for hid in self.hist_ids:
            execute_query("DELETE FROM arquivos_enviados_ia WHERE id = ?", params=(hid,), commit=True)
        for mid in self.mat_ids:
            row = execute_query(
                "SELECT caminho_arquivo_pdf, caminho_arquivo_pdf_limpo FROM matriculas WHERE id = ?",
                params=(mid,),
                fetch_one=True,
            )
            if row:
                for p in (row["caminho_arquivo_pdf"], row["caminho_arquivo_pdf_limpo"]):
                    if p and os.path.exists(p):
                        try:
                            os.remove(p)
                        except OSError:
                            pass
            execute_query("DELETE FROM matriculas WHERE id = ?", params=(mid,), commit=True)
        for pid in self.prop_ids:
            execute_query("DELETE FROM propriedades WHERE id = ?", params=(pid,), commit=True)
        for cid in self.cli_ids:
            execute_query("DELETE FROM clientes WHERE id = ?", params=(cid,), commit=True)
        for p in self.arquivos_temp:
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass

    def test_gerar_pdf_sem_marca_remove_texto_sobreposto(self):
        pdf_bytes = _criar_pdf_com_marca_dagua_bytes()
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f_orig:
            f_orig.write(pdf_bytes)
            orig_path = f_orig.name
        limpo_path = orig_path.replace(".pdf", "_sem_marca.pdf")
        self.arquivos_temp.extend([orig_path, limpo_path])

        res = gerar_pdf_sem_marca(orig_path, limpo_path)
        self.assertTrue(res["sucesso"], res)
        self.assertTrue(os.path.exists(limpo_path))

        # O original continua intacto com o texto de marca d'água
        doc_orig = fitz.open(orig_path)
        self.assertIn("PARA SIMPLES CONFERENCIA", doc_orig[0].get_text())
        doc_orig.close()

        # O limpo foi reconstruído apenas com a imagem da página (sem o texto vetorial sobreposto)
        doc_limpo = fitz.open(limpo_path)
        self.assertEqual(len(doc_limpo), 1)
        self.assertEqual(doc_limpo[0].get_text().strip(), "")
        self.assertGreaterEqual(len(doc_limpo[0].get_images(full=True)), 1)
        doc_limpo.close()

    def test_historico_arquivos_servico_e_rotas_api(self):
        conteudo = b"conteudo-unico-teste-historico-12345"
        sha = calcular_sha256_bytes(conteudo)

        reg = registrar_arquivo_enviado(
            nome_arquivo="rg_joao_frente.png",
            sha256=sha,
            tamanho_bytes=len(conteudo),
            categoria="CLIENTE",
            tipo_documento="RG",
            entidade_tipo="cliente",
            entidade_id=9991,
            entidade_nome="João Teste (11122233344)",
            origem_envio="IA_CHAT",
            resumo_extracao="RG extraído",
        )
        self.hist_ids.append(reg["id"])
        self.assertFalse(reg["duplicado_mesma_entidade"])

        # Mesmo conteúdo com outro nome deve acusar ja_enviado=True pelo SHA-256
        chk_hash = verificar_arquivo_enviado(sha256=sha, nome_arquivo="outro_nome.png")
        self.assertTrue(chk_hash["ja_enviado"])
        self.assertEqual(chk_hash["correspondencias_hash"][0]["nome_arquivo"], "rg_joao_frente.png")

        # Mesmo nome com conteúdo diferente deve acusar mesmo_nome=True
        chk_nome = verificar_arquivo_enviado(
            sha256=calcular_sha256_bytes(b"outro-conteudo"),
            nome_arquivo="RG_JOAO_FRENTE.PNG",
        )
        self.assertFalse(chk_nome["ja_enviado"])
        self.assertTrue(chk_nome["mesmo_nome"])

        # Re-registrar o mesmo hash para a mesma entidade atualiza sem duplicar linha
        reg2 = registrar_arquivo_enviado(
            nome_arquivo="rg_joao_frente.png",
            sha256=sha,
            tamanho_bytes=len(conteudo),
            categoria="CLIENTE",
            tipo_documento="RG",
            entidade_tipo="cliente",
            entidade_id=9991,
            entidade_nome="João Teste (11122233344)",
        )
        self.assertEqual(reg2["id"], reg["id"])
        self.assertTrue(reg2["duplicado_mesma_entidade"])

        # Listagem e filtro via API
        r_list = self.client.get("/arquivos-enviados", params={"busca": "rg_joao", "categoria": "CLIENTE"})
        self.assertEqual(r_list.status_code, 200, r_list.text)
        itens = r_list.json()
        self.assertTrue(any(i["id"] == reg["id"] for i in itens))

        # Verificação em lote via API
        r_chk = self.client.post(
            "/arquivos-enviados/verificar",
            json={
                "arquivos": [
                    {"sha256": sha, "nome_arquivo": "copia.png", "tamanho_bytes": len(conteudo)},
                    {"sha256": "0" * 64, "nome_arquivo": "inedito.pdf", "tamanho_bytes": 10},
                ]
            },
        )
        self.assertEqual(r_chk.status_code, 200, r_chk.text)
        resultados = r_chk.json()["resultados"]
        self.assertTrue(resultados[0]["ja_enviado"])
        self.assertFalse(resultados[1]["ja_enviado"])

        # Exclusão via API
        r_del = self.client.delete(f"/arquivos-enviados/{reg['id']}")
        self.assertEqual(r_del.status_code, 200, r_del.text)
        self.assertFalse(verificar_arquivo_enviado(sha256=sha)["ja_enviado"])

    def test_upload_download_limpar_pdf_matricula_rotas(self):
        prop_id = execute_query(
            "INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Marca Dagua', 'Iporã', 'PR')",
            commit=True,
        )
        self.prop_ids.append(prop_id)
        mat_id = execute_query(
            "INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '887766', 24.2)",
            params=(prop_id,),
            commit=True,
        )
        self.mat_ids.append(mat_id)

        pdf_bytes = _criar_pdf_com_marca_dagua_bytes()
        r_up = self.client.post(
            f"/matriculas/{mat_id}/upload-pdf",
            files={"file": ("matricula_887766.pdf", pdf_bytes, "application/pdf")},
        )
        self.assertEqual(r_up.status_code, 200, r_up.text)
        up_data = r_up.json()
        self.assertTrue(up_data["caminho"])
        self.assertTrue(up_data["caminho_limpo"])
        self.assertTrue(os.path.exists(up_data["caminho"]))
        self.assertTrue(os.path.exists(up_data["caminho_limpo"]))

        # Download de ambas as versões funciona
        r_orig = self.client.get(f"/matriculas/{mat_id}/download-pdf", params={"versao": "original"})
        self.assertEqual(r_orig.status_code, 200)
        self.assertEqual(r_orig.content, pdf_bytes)

        r_limpo = self.client.get(f"/matriculas/{mat_id}/download-pdf", params={"versao": "limpo"})
        self.assertEqual(r_limpo.status_code, 200)
        doc_limpo = fitz.open(stream=r_limpo.content, filetype="pdf")
        self.assertEqual(doc_limpo[0].get_text().strip(), "")
        doc_limpo.close()

        # Também registrou no histórico de arquivos enviados
        sha_up = calcular_sha256_bytes(pdf_bytes)
        chk = verificar_arquivo_enviado(sha256=sha_up)
        self.assertTrue(chk["ja_enviado"])
        for c in chk["correspondencias_hash"]:
            self.hist_ids.append(c["id"])

        # Re-geração via /limpar-pdf funciona
        r_re = self.client.post(f"/matriculas/{mat_id}/limpar-pdf")
        self.assertEqual(r_re.status_code, 200, r_re.text)
        self.assertTrue(r_re.json()["sucesso"])

        # DELETE /matriculas/{mid}/pdf remove ambos os arquivos e limpa colunas
        r_del = self.client.delete(f"/matriculas/{mat_id}/pdf")
        self.assertEqual(r_del.status_code, 200)
        self.assertFalse(os.path.exists(up_data["caminho"]))
        self.assertFalse(os.path.exists(up_data["caminho_limpo"]))

    def test_scripts_ia_registram_historico_e_limpam_pdf_matricula(self):
        pdf_bytes = _criar_pdf_com_marca_dagua_bytes()
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            pdf_path = tmp.name
        self.arquivos_temp.append(pdf_path)

        res1 = processar_matricula_ia(
            {
                "numero_matricula": "776655",
                "nome_propriedade": "Sítio Sem Marca IA",
                "municipio": "Umuarama",
                "uf": "PR",
                "area_ha": 12.5,
            },
            caminho_pdf=pdf_path,
        )
        self.assertTrue(res1["sucesso"], res1)
        self.mat_ids.append(res1["matricula_id"])
        self.prop_ids.append(res1["propriedade_id"])
        if res1.get("historico_arquivo_id"):
            self.hist_ids.append(res1["historico_arquivo_id"])

        self.assertTrue(res1["arquivo_pdf_salvo"])
        self.assertTrue(res1["arquivo_pdf_limpo_salvo"])
        self.assertTrue(os.path.exists(res1["arquivo_pdf_salvo"]))
        self.assertTrue(os.path.exists(res1["arquivo_pdf_limpo_salvo"]))
        self.assertFalse(res1["arquivo_ja_enviado"])

        # Segundo envio do mesmo PDF deve detectar arquivo_ja_enviado=True
        res2 = processar_matricula_ia(
            {
                "numero_matricula": "776655",
                "propriedade_id": res1["propriedade_id"],
            },
            caminho_pdf=pdf_path,
        )
        self.assertTrue(res2["sucesso"])
        self.assertTrue(res2["arquivo_ja_enviado"])

        # CLI verificar_arquivo_ia.py também encontra o arquivo
        p = subprocess.run(
            ["python", "scripts/verificar_arquivo_ia.py", "--arquivo", pdf_path],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(__file__)),
        )
        self.assertEqual(p.returncode, 0, p.stderr)
        data_cli = json.loads(p.stdout)
        self.assertTrue(data_cli["resultados"][0]["ja_enviado"])


if __name__ == "__main__":
    unittest.main()
