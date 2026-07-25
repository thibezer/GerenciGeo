import unittest
import os
import re

class TestClipboardPayloadGuard(unittest.TestCase):
    def setUp(self):
        # Resolve path to project root
        self.root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        self.ts_file_path = os.path.join(self.root_dir, 'frontend', 'src', 'views', 'mesa_trabalho', 'exportacao_cad.ts')
        self.lisp_file_path = os.path.join(self.root_dir, 'recursos', 'autocad', 'gerencigeo_sync.lsp')

    def test_exportacao_cad_exists(self):
        self.assertTrue(os.path.exists(self.ts_file_path), f"File {self.ts_file_path} not found.")
        self.assertTrue(os.path.exists(self.lisp_file_path), f"File {self.lisp_file_path} not found.")

    def test_sanitizar_para_cad_integrity(self):
        """
        Garante que a função sanitizarParaCAD mantenha as substituições críticas
        para evitar quebra do parser AutoLISP.
        """
        with open(self.ts_file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Verifica a presença dos replaces essenciais
        self.assertIn(r".replace(/;/g, ' ')", content, "Sanitização de ';' ausente")
        self.assertIn(r".replace(/,/g, ' ')", content, "Sanitização de ',' ausente")
        self.assertIn(r".replace(/\(/g, '[')", content, "Sanitização de '(' ausente")
        self.assertIn(r".replace(/\)/g, ']')", content, "Sanitização de ')' ausente")
        self.assertIn(r".replace(/[\r\n]+/g, ' ')", content, "Sanitização de quebra de linha ausente")

    def test_payload_format_integrity(self):
        """
        Garante que o template string do payload gerado para o CAD
        siga rigorosamente o formato esperado pelo LISP.
        """
        with open(self.ts_file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        expected_template = "ACAO=NOVO;BLOCO=${bloco};X=${Number(x).toFixed(4)};Y=${Number(y).toFixed(4)};Z=${Number(z).toFixed(4)};ATRIB(ID:${nome},TIPO:${tipo},SIGMA:${Number(sigma).toFixed(3)},METPOS:${metodo},TIPLIM:${limite},CNS:${cns},MATR:${matricula},CONFRO:${confrontante_nome})"

        self.assertIn(expected_template, content,
            "O formato do payload estruturado do Clipboard foi alterado e quebrará a integração com o AutoCAD/TopoCAD2000.")

    def test_autolisp_parser_keys(self):
        """
        Garante que as chaves esperadas no AutoLISP (ID, TIPO, SIGMA, etc.)
        não foram alteradas acidentalmente.
        """
        with open(self.lisp_file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        expected_keys = ['"ID"', '"TIPO"', '"SIGMA"', '"METPOS"', '"TIPLIM"', '"CNS"', '"MATR"', '"CONFRO"']
        for key in expected_keys:
            self.assertIn(f'(= k {key})', content, f"Chave {key} não encontrada no parser AutoLISP")

if __name__ == '__main__':
    unittest.main()
