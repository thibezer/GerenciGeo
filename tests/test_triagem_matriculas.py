import os
import shutil
import tempfile
import unittest

from fastapi.testclient import TestClient

from api import app
import config
from services.gestores.triagem_matriculas_service import (
    atualizar_observacao_triagem,
    listar_triagem_entrada,
    remover_arquivo_triagem,
    resolver_caminho_seguro_inbox,
    salvar_arquivo_triagem,
)


class TestTriagemMatriculas(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="triagem_mat_")
        self._orig_inbox = config.MATRICULAS_INBOX_FOLDER
        import services.gestores.triagem_matriculas_service as svc
        import routes.matriculas_triagem as rt

        self._svc = svc
        self._rt = rt
        self._orig_svc_inbox = svc.MATRICULAS_INBOX_FOLDER
        self._orig_rt_inbox = rt.MATRICULAS_INBOX_FOLDER

        config.MATRICULAS_INBOX_FOLDER = self.temp_dir
        svc.MATRICULAS_INBOX_FOLDER = self.temp_dir
        rt.MATRICULAS_INBOX_FOLDER = self.temp_dir

        self.client = TestClient(app)

    def tearDown(self):
        config.MATRICULAS_INBOX_FOLDER = self._orig_inbox
        self._svc.MATRICULAS_INBOX_FOLDER = self._orig_svc_inbox
        self._rt.MATRICULAS_INBOX_FOLDER = self._orig_rt_inbox
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_fluxo_servico_salvar_listar_atualizar_remover(self):
        salvo = salvar_arquivo_triagem(
            nome_original="certidao_10189.pdf",
            conteudo_bytes=b"%PDF-1.4 teste",
            tipo_vinculo="confrontante",
            observacao="Confrontante Lado Norte - João",
            pasta=self.temp_dir,
        )
        self.assertTrue(salvo["sucesso"])
        self.assertEqual(salvo["nome"], "certidao_10189.pdf")
        self.assertEqual(salvo["tipo_vinculo"], "confrontante")
        self.assertEqual(salvo["observacao"], "Confrontante Lado Norte - João")

        listagem = listar_triagem_entrada(pasta=self.temp_dir, verificar_historico=False)
        self.assertEqual(listagem["total"], 1)
        self.assertEqual(listagem["arquivos"][0]["observacao"], "Confrontante Lado Norte - João")

        atualizado = atualizar_observacao_triagem(
            "certidao_10189.pdf",
            tipo_vinculo="apenas_cadastrar",
            observacao="Não sei o confrontante, só cadastrar",
            pasta=self.temp_dir,
        )
        self.assertEqual(atualizado["tipo_vinculo"], "apenas_cadastrar")
        self.assertEqual(atualizado["observacao"], "Não sei o confrontante, só cadastrar")

        removido = remover_arquivo_triagem("certidao_10189.pdf", pasta=self.temp_dir)
        self.assertTrue(removido["sucesso"])
        self.assertEqual(listar_triagem_entrada(pasta=self.temp_dir, verificar_historico=False)["total"], 0)

    def test_protecao_path_traversal_e_extensao_invalida(self):
        with self.assertRaises(ValueError):
            salvar_arquivo_triagem("script.exe", b"123", pasta=self.temp_dir)

        with self.assertRaises(ValueError):
            resolver_caminho_seguro_inbox(".triagem_metadata.json", pasta=self.temp_dir)

        caminho = resolver_caminho_seguro_inbox("../../segredo.pdf", pasta=self.temp_dir)
        self.assertEqual(os.path.dirname(caminho), os.path.abspath(self.temp_dir))

    def test_endpoints_api_triagem(self):
        res_up = self.client.post(
            "/matriculas-triagem/upload",
            files=[("arquivos", ("mat_lote5.pdf", b"%PDF-1.4 conteudo", "application/pdf"))],
            data={"tipo_vinculo": "proprietario", "observacao": "Matrícula do proprietário"},
        )
        self.assertEqual(res_up.status_code, 200, res_up.text)
        body_up = res_up.json()
        self.assertEqual(body_up["enviados"], 1)
        self.assertEqual(body_up["arquivos"][0]["tipo_vinculo"], "proprietario")

        res_list = self.client.get("/matriculas-triagem/entrada")
        self.assertEqual(res_list.status_code, 200)
        self.assertEqual(res_list.json()["total"], 1)
        self.assertEqual(res_list.json()["arquivos"][0]["observacao"], "Matrícula do proprietário")

        res_put = self.client.put(
            "/matriculas-triagem/entrada/mat_lote5.pdf/observacao",
            json={"tipo_vinculo": "confrontante", "observacao": "Atualizado para confrontante"},
        )
        self.assertEqual(res_put.status_code, 200)
        self.assertEqual(res_put.json()["tipo_vinculo"], "confrontante")

        res_view = self.client.get("/matriculas-triagem/entrada/mat_lote5.pdf/visualizar")
        self.assertEqual(res_view.status_code, 200)
        self.assertEqual(res_view.content, b"%PDF-1.4 conteudo")

        res_del = self.client.delete("/matriculas-triagem/entrada/mat_lote5.pdf")
        self.assertEqual(res_del.status_code, 200)
        self.assertEqual(self.client.get("/matriculas-triagem/entrada").json()["total"], 0)


if __name__ == "__main__":
    unittest.main()
