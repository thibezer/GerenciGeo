"""
Regressão: documentos e anexos de clientes, exclusão de cliente que também é
confrontante, reaproveitamento de pessoa existente e exclusão de planilha CCIR.
"""
import os
import unittest
import fitz
from fastapi.testclient import TestClient
from api import app
from config import EXPORT_BASE_FOLDER
from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from services.gestores.cliente_manager import excluir_clientes_lote
from services.parsers.ccir_parser import sincronizar_pasta_ccir

CPF_A = "52998224725"
CPF_B = "11144477735"


def _uma(sql, params=()):
    row = execute_query(sql, params=params, fetch_one=True)
    return dict(row) if row else None


def _pdf_identidade() -> bytes:
    doc = fitz.open()
    pagina = doc.new_page()
    pagina.insert_text((72, 72), "REPUBLICA FEDERATIVA DO BRASIL\nCARTEIRA DE IDENTIDADE\nRG 12.345.678-9 SSP/PR")
    dados = doc.tobytes()
    doc.close()
    return dados


class TestClientesDocumentosEExclusao(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)

    def setUp(self):
        self.client = TestClient(app)
        self.levantamentos = []
        self.props = []
        self._limpar()
        self.prof_id = execute_query(
            "INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Agrimensor Docs', 'CREA 2', 'DOCS')",
            commit=True
        )

    def tearDown(self):
        for lev in self.levantamentos:
            execute_query("DELETE FROM confrontantes WHERE levantamento_id = ?", params=(lev,), commit=True)
            execute_query("DELETE FROM levantamentos WHERE id = ?", params=(lev,), commit=True)
        for pid in self.props:
            execute_query("DELETE FROM propriedades WHERE id = ?", params=(pid,), commit=True)
        self._limpar()
        execute_query("DELETE FROM profissionais WHERE id = ?", params=(self.prof_id,), commit=True)

    def _limpar(self):
        for cpf in (CPF_A, CPF_B):
            for row in execute_query(
                "SELECT c.id FROM clientes c JOIN pessoas p ON p.id = c.pessoa_id WHERE p.cpf_cnpj = ?",
                params=(cpf,), fetch_all=True
            ):
                self.client.delete(f"/clientes/{row['id']}")
            execute_query("DELETE FROM confrontantes WHERE pessoa_id IN (SELECT id FROM pessoas WHERE cpf_cnpj = ?)", params=(cpf,), commit=True)
            execute_query("DELETE FROM pessoas WHERE cpf_cnpj = ?", params=(cpf,), commit=True)

    def _cliente(self, cpf=CPF_A, **extra):
        res = self.client.post("/clientes", json={"nome_completo": "Cliente Docs", "cpf_cnpj": cpf, **extra})
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["id"]

    def _importar_pdf(self, cid, nome="identidade.pdf", conteudo=None):
        return self.client.post(
            f"/clientes/{cid}/importar-identidade-pdf",
            files={"file": (nome, conteudo if conteudo is not None else _pdf_identidade(), "application/pdf")}
        )

    def _tornar_confrontante(self, cid):
        pessoa_id = _uma("SELECT pessoa_id FROM clientes WHERE id = ?", (cid,))["pessoa_id"]
        prop_id = execute_query("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Vizinha', 'Umuarama', 'PR')", commit=True)
        self.props.append(prop_id)
        lev_id = execute_query(
            "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio) VALUES (?, ?, '2026-01-01')",
            params=(prop_id, self.prof_id), commit=True
        )
        self.levantamentos.append(lev_id)
        execute_query("INSERT INTO confrontantes (levantamento_id, pessoa_id) VALUES (?, ?)", params=(lev_id, pessoa_id), commit=True)
        return pessoa_id

    # ── PDF de identidade ────────────────────────────────────────────────────

    def test_pdfs_com_mesmo_nome_nao_compartilham_arquivo(self):
        cid = self._cliente()
        r1 = self._importar_pdf(cid)
        r2 = self._importar_pdf(cid)
        self.assertEqual(r1.status_code, 200, r1.text)
        self.assertEqual(r2.status_code, 200, r2.text)
        d1 = _uma("SELECT * FROM cliente_documentos WHERE id = ?", (r1.json()["documento_id"],))
        d2 = _uma("SELECT * FROM cliente_documentos WHERE id = ?", (r2.json()["documento_id"],))
        self.assertNotEqual(d1["arquivo_path"], d2["arquivo_path"])
        self.assertEqual(d1["arquivo_nome"], "identidade.pdf")

        # Excluir um documento não pode apagar o arquivo do outro
        self.client.delete(f"/clientes/documentos/{d1['id']}")
        self.assertFalse(os.path.exists(d1["arquivo_path"]))
        self.assertTrue(os.path.exists(d2["arquivo_path"]))

    def test_arquivo_que_nao_e_pdf_e_rejeitado(self):
        cid = self._cliente()
        res = self._importar_pdf(cid, conteudo=b"isto nao e um pdf")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.get(f"/clientes/{cid}/documentos").json(), [])

    def test_falha_ao_gravar_documento_nao_deixa_arquivo_orfao(self):
        from unittest import mock
        from config import BASE_DIR
        cid = self._cliente()
        pasta = os.path.join(BASE_DIR, "uploads", "documentos_clientes", str(cid))
        antes = set(os.listdir(pasta)) if os.path.isdir(pasta) else set()
        with mock.patch("services.gestores.cliente_manager.DatabaseManager", side_effect=RuntimeError("banco indisponível")):
            res = self._importar_pdf(cid)
        self.assertEqual(res.status_code, 400)
        depois = set(os.listdir(pasta)) if os.path.isdir(pasta) else set()
        self.assertEqual(antes, depois)

    def test_pdf_acima_do_limite_e_rejeitado(self):
        cid = self._cliente()
        res = self._importar_pdf(cid, conteudo=b"%PDF" + b"0" * (20 * 1024 * 1024 + 1))
        self.assertEqual(res.status_code, 413)

    def test_lista_de_documentos_no_put_preserva_anexos(self):
        cid = self._cliente(rg_ie="1234567")
        doc_pdf = self._importar_pdf(cid).json()["documento_id"]
        res = self.client.put(f"/clientes/{cid}", json={"documentos": [{"tipo_documento": "CNH", "numero": "999"}]})
        self.assertEqual(res.status_code, 200, res.text)
        docs = self.client.get(f"/clientes/{cid}/documentos").json()
        self.assertIn(doc_pdf, [d["id"] for d in docs])
        self.assertIn(("CNH", "999"), [(d["tipo_documento"], d["numero"]) for d in docs])
        # RG manual (sem anexo) foi substituído pela lista enviada
        self.assertNotIn("1234567", [d["numero"] for d in docs if not d["arquivo_path"]])

    # ── Exclusão de cliente ──────────────────────────────────────────────────

    def test_excluir_cliente_que_e_confrontante_preserva_pessoa_e_documentos(self):
        cid = self._cliente(rg_ie="1234567")
        doc_pdf = self._importar_pdf(cid).json()["documento_id"]
        caminho = _uma("SELECT arquivo_path FROM cliente_documentos WHERE id = ?", (doc_pdf,))["arquivo_path"]
        pessoa_id = self._tornar_confrontante(cid)

        self.assertEqual(self.client.delete(f"/clientes/{cid}").status_code, 200)
        self.assertIsNotNone(_uma("SELECT id FROM pessoas WHERE id = ?", (pessoa_id,)))
        self.assertEqual(_uma("SELECT count(*) n FROM cliente_documentos WHERE pessoa_id = ?", (pessoa_id,))["n"], 2)
        self.assertTrue(os.path.exists(caminho))

    def test_excluir_cliente_sem_outro_papel_remove_pessoa_documentos_e_arquivos(self):
        cid = self._cliente(rg_ie="1234567")
        doc_pdf = self._importar_pdf(cid).json()["documento_id"]
        caminho = _uma("SELECT arquivo_path FROM cliente_documentos WHERE id = ?", (doc_pdf,))["arquivo_path"]
        pessoa_id = _uma("SELECT pessoa_id FROM clientes WHERE id = ?", (cid,))["pessoa_id"]

        self.assertEqual(self.client.delete(f"/clientes/{cid}").status_code, 200)
        self.assertIsNone(_uma("SELECT id FROM pessoas WHERE id = ?", (pessoa_id,)))
        self.assertEqual(_uma("SELECT count(*) n FROM cliente_documentos WHERE pessoa_id = ?", (pessoa_id,))["n"], 0)
        self.assertFalse(os.path.exists(caminho))

    def test_excluir_cliente_inexistente_e_com_levantamento(self):
        self.assertEqual(self.client.delete("/clientes/99999999").status_code, 404)
        cid = self._cliente()
        prop_id = execute_query("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Prop Cli', 'Umuarama', 'PR')", commit=True)
        self.props.append(prop_id)
        execute_query("INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (?, ?, 100)", params=(prop_id, cid), commit=True)
        lev = execute_query("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio) VALUES (?, ?, '2026-01-01')", params=(prop_id, self.prof_id), commit=True)
        self.levantamentos.append(lev)
        self.assertEqual(self.client.delete(f"/clientes/{cid}").status_code, 409)
        execute_query("DELETE FROM propriedade_clientes WHERE cliente_id = ?", params=(cid,), commit=True)

    def test_exclusao_em_lote(self):
        c1 = self._cliente(CPF_A)
        c2 = self._cliente(CPF_B)
        res = excluir_clientes_lote([c1, c2, 99999999])
        self.assertEqual(res["sucessos"], 2)
        self.assertEqual(len(res["erros"]), 1)
        self.assertIsNone(_uma("SELECT id FROM clientes WHERE id IN (?, ?)", (c1, c2)))

    # ── Pessoa já existente ──────────────────────────────────────────────────

    def test_cadastrar_cliente_de_pessoa_existente_nao_apaga_dados(self):
        pessoa_id = execute_query(
            "INSERT INTO pessoas (nome, cpf_cnpj, rg, profissao, nome_conjuge) VALUES ('Nome Antigo', ?, 'RG-1', 'Agricultor', 'Conjuge X')",
            params=(CPF_A,), commit=True
        )
        cid = self._cliente(CPF_A, nome_completo="Nome Novo", profissao="", estado_civil="Casado")
        pessoa = _uma("SELECT * FROM pessoas WHERE id = ?", (pessoa_id,))
        self.assertEqual(_uma("SELECT pessoa_id FROM clientes WHERE id = ?", (cid,))["pessoa_id"], pessoa_id)
        self.assertEqual(pessoa["nome"], "Nome Novo")
        self.assertEqual(pessoa["estado_civil"], "Casado")
        self.assertEqual((pessoa["rg"], pessoa["profissao"], pessoa["nome_conjuge"]), ("RG-1", "Agricultor", "Conjuge X"))


class TestExclusaoPlanilhaCcir(unittest.TestCase):
    ARQUIVO = "teste_regressao_exclusao_ccir.csv"

    def setUp(self):
        self.client = TestClient(app)
        self.pasta = os.path.join(EXPORT_BASE_FOLDER, "Banco_CCIR")
        os.makedirs(self.pasta, exist_ok=True)
        self.caminho = os.path.join(self.pasta, self.ARQUIVO)
        with open(self.caminho, "w", encoding="utf-8") as f:
            f.write("CÓDIGO DO IMÓVEL;TITULAR\n9511;JOAO\n")
        sincronizar_pasta_ccir()

    def tearDown(self):
        removidas = os.path.join(self.pasta, "_removidas")
        if os.path.isdir(removidas):
            for nome in os.listdir(removidas):
                if nome.startswith("teste_regressao_exclusao_ccir"):
                    os.remove(os.path.join(removidas, nome))
        if os.path.exists(self.caminho):
            os.remove(self.caminho)
        execute_query("DELETE FROM ccir_cadastros WHERE arquivo_origem = ?", params=(self.ARQUIVO,), commit=True)

    def test_planilha_excluida_nao_volta_no_proximo_sync(self):
        self.assertEqual(_uma("SELECT count(*) n FROM ccir_cadastros WHERE arquivo_origem = ?", (self.ARQUIVO,))["n"], 1)
        res = self.client.delete(f"/ccir/files/{self.ARQUIVO}")
        self.assertEqual(res.status_code, 200, res.text)
        self.assertFalse(os.path.exists(self.caminho))
        self.assertTrue(os.path.exists(os.path.join(self.pasta, "_removidas", self.ARQUIVO)))

        sincronizar_pasta_ccir()
        self.assertEqual(_uma("SELECT count(*) n FROM ccir_cadastros WHERE arquivo_origem = ?", (self.ARQUIVO,))["n"], 0)

    def test_nome_de_arquivo_invalido(self):
        self.assertEqual(self.client.delete("/ccir/files/..%5C" + self.ARQUIVO).status_code, 400)
        self.assertTrue(os.path.exists(self.caminho))


if __name__ == "__main__":
    unittest.main()
