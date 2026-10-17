"""
tests/test_clientes_revisao_p0_p1.py — Correções da revisão da tela de Clientes (itens P0 e P1 do back-end).

Cobre: proteção da API local (CORS/Origin/Host), CNPJ alfanumérico, ausência de valores inventados
(SSP/DETRAN/PR), auditoria de campos limpos e de remoção de senha, trilha de exclusões, limpeza do
representante legal e usuário real na trilha de acessos.
"""
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from api import app
from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from routes.auth import active_sessions
from services.gestores.cliente_manager import (
    ClienteManager,
    atualizar_cliente,
    cadastrar_cliente,
    excluir_cliente,
    limpar_documento,
    validar_cpf_cnpj,
)
from services.seguranca.origem_local import host_permitido, origem_permitida

client = TestClient(app)


def _cpf(base9: str) -> str:
    """CPF válido a partir de 9 dígitos."""
    digitos = [int(c) for c in base9]
    for n in (9, 10):
        soma = sum(d * (n + 1 - i) for i, d in enumerate(digitos))
        digitos.append((soma * 10 % 11) % 10)
    return "".join(str(d) for d in digitos)


CPF_A = _cpf("731204558")
CPF_B = _cpf("284615937")
CPF_C = _cpf("519026384")
CNPJ_ALFA = "12ABC34501DE35"          # exemplo oficial da Receita (12.ABC.345/01DE-35)
CNPJ_NUM = "11222333000181"
EMAIL_TESTE = "revisao.p0p1@teste.local"
TOKEN_TESTE = "token-teste-p0p1"
DOCS = (CPF_A, CPF_B, CPF_C, CNPJ_ALFA, CNPJ_NUM)


class RevisaoClientesBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)

    def _limpar(self):
        with DatabaseManager() as conn:
            cur = conn.cursor()
            marcas = ",".join("?" * len(DOCS))
            cur.execute(f"SELECT id FROM pessoas WHERE cpf_cnpj IN ({marcas})", DOCS)
            p_ids = [r[0] for r in cur.fetchall()]
            if p_ids:
                pm = ",".join("?" * len(p_ids))
                cur.execute(f"UPDATE pessoas SET representante_legal_id = NULL WHERE representante_legal_id IN ({pm})", p_ids)
                cur.execute(f"SELECT id FROM clientes WHERE pessoa_id IN ({pm})", p_ids)
                c_ids = [r[0] for r in cur.fetchall()]
                if c_ids:
                    cm = ",".join("?" * len(c_ids))
                    cur.execute(f"DELETE FROM cliente_exclusoes_log WHERE cliente_id IN ({cm})", c_ids)
                    cur.execute(f"DELETE FROM clientes WHERE id IN ({cm})", c_ids)
                cur.execute(f"DELETE FROM cliente_documentos WHERE pessoa_id IN ({pm})", p_ids)
                cur.execute(f"DELETE FROM pessoas WHERE id IN ({pm})", p_ids)
            cur.execute("DELETE FROM users WHERE email = ?", (EMAIL_TESTE,))
            conn.commit()

    def setUp(self):
        self._limpar()

    def tearDown(self):
        self._limpar()
        active_sessions.pop(TOKEN_TESTE, None)

    def _cadastrar(self, **extra):
        dados = {"nome_completo": "Cliente Revisao", "cpf_cnpj": CPF_A, "tipo_pessoa": "PF"}
        dados.update(extra)
        res = cadastrar_cliente(dados)
        self.assertNotIn("error", res, res)
        return res["id"]

    def _logar(self, nome):
        execute_query(
            "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            params=(nome, EMAIL_TESTE, "x"), commit=True)
        uid = execute_query("SELECT id FROM users WHERE email = ?", params=(EMAIL_TESTE,), fetch_one=True)["id"]
        active_sessions[TOKEN_TESTE] = uid
        return {"Authorization": f"Bearer {TOKEN_TESTE}"}

    def _pessoa(self, cliente_id):
        return dict(execute_query(
            "SELECT p.* FROM pessoas p JOIN clientes c ON c.pessoa_id = p.id WHERE c.id = ?",
            params=(cliente_id,), fetch_one=True))

    def _cliente(self, cliente_id):
        return dict(execute_query("SELECT * FROM clientes WHERE id = ?", params=(cliente_id,), fetch_one=True))

    def _documentos(self, cliente_id):
        return [dict(r) for r in execute_query(
            "SELECT cd.* FROM cliente_documentos cd JOIN clientes c ON c.pessoa_id = cd.pessoa_id WHERE c.id = ?",
            params=(cliente_id,), fetch_all=True)]

    def _historico(self, cliente_id, campo):
        return [dict(r) for r in execute_query(
            "SELECT * FROM cliente_historico_logs WHERE id_cliente = ? AND campo_alterado = ?",
            params=(cliente_id, campo), fetch_all=True)]


class TestProtecaoApiLocal(RevisaoClientesBase):
    def test_origens_e_hosts(self):
        self.assertTrue(origem_permitida(None))
        self.assertTrue(origem_permitida("http://127.0.0.1:8000"))
        self.assertTrue(origem_permitida("http://localhost:5173"))
        self.assertFalse(origem_permitida("https://site-malicioso.example"))
        self.assertFalse(origem_permitida("http://127.0.0.1:9999"))
        self.assertTrue(host_permitido("127.0.0.1:8000"))
        self.assertTrue(host_permitido("localhost"))
        self.assertFalse(host_permitido("rebind.atacante.example:8000"))

    def test_origem_externa_nao_le_clientes_nem_revela_senha(self):
        cid = self._cadastrar(senha_gov="SenhaSecreta#1")
        hostil = {"Origin": "https://site-malicioso.example"}

        r = client.get("/clientes", headers=hostil)
        self.assertEqual(r.status_code, 403)
        self.assertNotIn("access-control-allow-origin", r.headers)

        r = client.post(f"/clientes/{cid}/revelar-senha", headers=hostil)
        self.assertEqual(r.status_code, 403)
        self.assertNotIn("SenhaSecreta", r.text)
        acessos = execute_query("SELECT COUNT(*) AS n FROM cliente_acesso_logs WHERE id_cliente = ?", params=(cid,), fetch_one=True)
        self.assertEqual(acessos["n"], 0)

    def test_preflight_de_origem_externa_e_negado(self):
        r = client.options("/clientes", headers={
            "Origin": "https://site-malicioso.example",
            "Access-Control-Request-Method": "POST",
        })
        self.assertEqual(r.status_code, 403)
        self.assertNotIn("access-control-allow-origin", r.headers)

    def test_dns_rebinding_barrado_pelo_host(self):
        r = client.get("/clientes", headers={"Host": "rebind.atacante.example:8000"})
        self.assertEqual(r.status_code, 403)

    def test_origem_do_proprio_app_continua_funcionando(self):
        r = client.get("/clientes", headers={"Origin": "http://127.0.0.1:8000", "Host": "127.0.0.1:8000"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get("access-control-allow-origin"), "http://127.0.0.1:8000")
        r = client.get("/clientes")  # sem Origin: app desktop / navegação direta
        self.assertEqual(r.status_code, 200)


class TestCnpjAlfanumerico(RevisaoClientesBase):
    def test_validacao(self):
        self.assertTrue(validar_cpf_cnpj("12.ABC.345/01DE-35"))
        self.assertTrue(validar_cpf_cnpj("12abc34501de35"))
        self.assertFalse(validar_cpf_cnpj("12.ABC.345/01DE-36"))
        self.assertTrue(validar_cpf_cnpj("11.222.333/0001-81"))
        self.assertFalse(validar_cpf_cnpj("11.222.333/0001-82"))
        self.assertTrue(validar_cpf_cnpj(CPF_A))
        self.assertFalse(validar_cpf_cnpj("123ABC"))

    def test_normalizacao(self):
        self.assertEqual(limpar_documento("12.abc.345/01de-35"), CNPJ_ALFA)
        self.assertEqual(limpar_documento("11.222.333/0001-81"), CNPJ_NUM)
        self.assertIsNone(limpar_documento("  "))

    def test_cadastro_grava_normalizado_e_detecta_duplicidade_com_outra_mascara(self):
        cid = self._cadastrar(nome_completo="Fazenda Nova S/A", cpf_cnpj="12.abc.345/01de-35", tipo_pessoa="PJ")
        self.assertEqual(self._pessoa(cid)["cpf_cnpj"], CNPJ_ALFA)
        repetido = cadastrar_cliente({"nome_completo": "Outra", "cpf_cnpj": "12.ABC.345/01DE-35", "tipo_pessoa": "PJ"})
        self.assertEqual(repetido.get("error"), "CPF/CNPJ já cadastrado")

    def test_cnpj_com_digito_errado_e_recusado(self):
        res = cadastrar_cliente({"nome_completo": "Falsa", "cpf_cnpj": "12.ABC.345/01DE-99", "tipo_pessoa": "PJ"})
        self.assertEqual(res.get("error"), "CPF/CNPJ inválido")

    def test_atualizar_para_documento_de_pessoa_nao_cliente_da_erro_claro(self):
        cid = self._cadastrar()
        with DatabaseManager() as conn:
            conn.cursor().execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES ('Vizinho Confrontante', ?)", (CPF_C,))
            conn.commit()
        res = atualizar_cliente(cid, {"cpf_cnpj": CPF_C})
        self.assertIn("outra pessoa", res.get("error", ""))
        self.assertEqual(self._pessoa(cid)["cpf_cnpj"], CPF_A)

    def test_atualizacao_aceita_cnpj_alfanumerico(self):
        cid = self._cadastrar(nome_completo="Empresa", cpf_cnpj=CNPJ_NUM, tipo_pessoa="PJ")
        res = atualizar_cliente(cid, {"cpf_cnpj": "12.ABC.345/01DE-35"})
        self.assertNotIn("error", res, res)
        self.assertEqual(self._pessoa(cid)["cpf_cnpj"], CNPJ_ALFA)


class TestSemValoresInventados(RevisaoClientesBase):
    def test_rg_e_cnh_sem_orgao_nao_ganham_ssp_pr_detran(self):
        cid = self._cadastrar(rg_ie="1234567", cnh_numero="99887766554", cnh_categoria="B", estado="SP")
        docs = {d["tipo_documento"]: d for d in self._documentos(cid)}
        self.assertIsNone(docs["RG"]["orgao_emissor"])
        self.assertIsNone(docs["RG"]["uf_emissor"])
        self.assertIsNone(docs["CNH"]["orgao_emissor"])

    def test_atualizar_cnh_sem_orgao_nao_inventa_detran(self):
        cid = self._cadastrar()
        res = atualizar_cliente(cid, {"cnh_numero": "11122233344", "cnh_categoria": "AB"})
        self.assertNotIn("error", res, res)
        cnh = next(d for d in self._documentos(cid) if d["tipo_documento"] == "CNH")
        self.assertIsNone(cnh["orgao_emissor"])

    def test_orgao_informado_e_preservado(self):
        cid = self._cadastrar(rg_ie="7654321", rg_orgao="SESP", rg_uf="MT")
        rg = next(d for d in self._documentos(cid) if d["tipo_documento"] == "RG")
        self.assertEqual((rg["orgao_emissor"], rg["uf_emissor"]), ("SESP", "MT"))


class TestAuditoriaDeAlteracoes(RevisaoClientesBase):
    def test_limpar_um_campo_entra_no_historico(self):
        cid = self._cadastrar(telefone="(44) 99911-2233", email="a@b.com")
        res = atualizar_cliente(cid, {"telefone": None})
        self.assertNotIn("error", res, res)
        logs = self._historico(cid, "telefone")
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["valor_antigo"], "(44) 99911-2233")
        self.assertIn(logs[0]["valor_novo"], ("", None))
        self.assertEqual(self._historico(cid, "email"), [])  # o que não mudou não gera log

    def test_remover_senha_gov_com_string_vazia(self):
        cid = self._cadastrar(senha_gov="SenhaAntiga#9")
        self.assertIsNotNone(self._cliente(cid)["senha_gov"])

        # A máscara devolvida pela listagem significa "manter"
        atualizar_cliente(cid, {"senha_gov": "••••••••"})
        self.assertIsNotNone(self._cliente(cid)["senha_gov"])
        self.assertEqual(self._historico(cid, "senha_gov"), [])

        atualizar_cliente(cid, {"senha_gov": ""})
        self.assertIsNone(self._cliente(cid)["senha_gov"])
        logs = self._historico(cid, "senha_gov")
        self.assertEqual([(lg["valor_antigo"], lg["valor_novo"]) for lg in logs], [("[CONFIDENCIAL]", "[REMOVIDA]")])
        self.assertNotIn("SenhaAntiga", str(logs))

    def test_falha_na_pendencia_de_conjuge_nao_derruba_cadastro_ja_gravado(self):
        with patch.object(ClienteManager, "verificar_dados_conjuge", side_effect=RuntimeError("falha na pendência")):
            res = cadastrar_cliente({"nome_completo": "Casado", "cpf_cnpj": CPF_B, "estado_civil": "Casado(a)"})
        self.assertNotIn("error", res, res)
        self.assertTrue(res["id"])


class TestExclusaoEUsuario(RevisaoClientesBase):
    def test_exclusao_grava_trilha_que_sobrevive_ao_cascade_dos_acessos(self):
        cid = self._cadastrar(senha_gov="Segredo#1")
        client.post(f"/clientes/{cid}/revelar-senha")
        self.assertEqual(len(client.get(f"/clientes/{cid}/acessos").json()), 1)

        res = excluir_cliente(cid, usuario="Fulana Operadora")
        self.assertTrue(res.get("sucesso"), res)

        sobras = execute_query("SELECT COUNT(*) AS n FROM cliente_acesso_logs WHERE id_cliente = ?", params=(cid,), fetch_one=True)
        self.assertEqual(sobras["n"], 0)  # o cascade continua valendo para os acessos
        log = dict(execute_query("SELECT * FROM cliente_exclusoes_log WHERE cliente_id = ?", params=(cid,), fetch_one=True))
        self.assertEqual(log["nome"], "Cliente Revisao")
        self.assertEqual(log["usuario"], "Fulana Operadora")
        self.assertEqual(log["qtd_acessos_sensiveis"], 1)
        self.assertEqual(log["documento_mascarado"], f"{CPF_A[:3]}***{CPF_A[-2:]}")
        self.assertNotIn(CPF_A, str(log))

    def test_exclusao_limpa_representante_legal_pendurado(self):
        rep_id = self._cadastrar(nome_completo="Representante", cpf_cnpj=CPF_B)
        pessoa_rep = self._pessoa(rep_id)["id"]
        pj_id = self._cadastrar(nome_completo="Empresa", cpf_cnpj=CNPJ_NUM, tipo_pessoa="PJ", representante_legal_id=pessoa_rep)
        self.assertEqual(self._pessoa(pj_id)["representante_legal_id"], pessoa_rep)

        self.assertTrue(excluir_cliente(rep_id).get("sucesso"))
        self.assertIsNone(self._pessoa(pj_id)["representante_legal_id"])

    def test_revelar_senha_registra_usuario_logado(self):
        cid = self._cadastrar(senha_gov="Segredo#2")
        headers = self._logar("Maria Auditora")

        r = client.post(f"/clientes/{cid}/revelar-senha", headers=headers)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["senha_gov"], "Segredo#2")
        r = client.post(f"/clientes/{cid}/revelar-senha")  # sem sessão: operador genérico
        self.assertEqual(r.status_code, 200)

        usuarios = [a["usuario"] for a in client.get(f"/clientes/{cid}/acessos").json()]
        self.assertCountEqual(usuarios, ["Maria Auditora", "Operador Local"])

    def test_exclusao_via_rota_registra_usuario_da_sessao(self):
        cid = self._cadastrar()
        headers = self._logar("Joana Gestora")

        r = client.delete(f"/clientes/{cid}", headers=headers)
        self.assertEqual(r.status_code, 200, r.text)
        log = execute_query("SELECT usuario FROM cliente_exclusoes_log WHERE cliente_id = ?", params=(cid,), fetch_one=True)
        self.assertEqual(log["usuario"], "Joana Gestora")


if __name__ == "__main__":
    unittest.main()
