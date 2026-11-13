"""
tests/test_cadastrar_cliente_ia.py — Testes unitários para o script de automação de cadastro de clientes via IA.
"""

import os
import unittest
import tempfile
import json
from scripts.cadastrar_cliente_ia import (
    normalizar_data,
    normalizar_dados_cliente,
    processar_cadastro_ia
)
from database.connection import execute_query


class TestCadastrarClienteIA(unittest.TestCase):
    
    def test_normalizar_data(self):
        # Teste DD/MM/AAAA para AAAA-MM-DD
        self.assertEqual(normalizar_data("25/12/1985"), "1985-12-25")
        self.assertEqual(normalizar_data("01/01/2000"), "2000-01-01")
        self.assertEqual(normalizar_data("5/7/1990"), "1990-07-05")
        self.assertEqual(normalizar_data("1980-05-15"), "1980-05-15")
        self.assertEqual(normalizar_data("15 de março de 1985"), "1985-03-15")
        self.assertEqual(normalizar_data("2 de Abril de 2010"), "2010-04-02")
        self.assertIsNone(normalizar_data(None))
        self.assertIsNone(normalizar_data(""))

    def test_normalizar_dados_nao_forca_sexo_ou_metadados_vazios(self):
        raw = {
            "cpf_cnpj": "52998224725",
            "endereco_completo": "Rua das Flores, 100",
            "cep": "87500000",
            "cnh_numero": None,
            "rg_ie": ""
        }
        norm = normalizar_dados_cliente(raw)
        self.assertNotIn("sexo", norm)
        self.assertNotIn("metadados", norm)
        self.assertNotIn("cnh_numero", norm)
        self.assertNotIn("rg_ie", norm)
        self.assertEqual(norm["cep"], "87500-000")

    def test_normalizar_dados_cliente(self):
        raw = {
            "nome": "João da Silva Sauro",
            "cpf": "111.444.777-35",
            "rg": "12.345.678-9",
            "rg_orgao": "ssp",
            "rg_uf": "pr",
            "data_nascimento": "14/08/1982",
            "estado_civil": "casado",
            "genero": "masculino",
            "filiacao_mae": "Maria da Silva"
        }
        normalizado = normalizar_dados_cliente(raw)
        self.assertEqual(normalizado["nome_completo"], "João da Silva Sauro")
        self.assertEqual(normalizado["cpf_cnpj"], "11144477735")
        self.assertEqual(normalizado["rg_ie"], "12.345.678-9")
        self.assertEqual(normalizado["rg_orgao"], "SSP")
        self.assertEqual(normalizado["rg_uf"], "PR")
        self.assertEqual(normalizado["data_nascimento_fundacao"], "1982-08-14")
        self.assertEqual(normalizado["estado_civil"], "Casado(a)")
        self.assertEqual(normalizado["sexo"], "M")
        self.assertEqual(normalizado["metadados"]["filiacao_mae"], "Maria da Silva")

    def test_processar_cadastro_novo_e_atualizacao(self):
        # Gera CPF válido para teste
        cpf_teste = "52998224725"
        
        # Limpa caso exista resquício no banco de teste
        row_antigo = execute_query(
            "SELECT c.id FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE p.cpf_cnpj = ?",
            params=(cpf_teste,),
            fetch_one=True
        )
        if row_antigo:
            execute_query("DELETE FROM clientes WHERE id = ?", params=(row_antigo["id"],), commit=True)
        execute_query("DELETE FROM pessoas WHERE cpf_cnpj = ?", params=(cpf_teste,), commit=True)

        payload_novo = {
            "nome_completo": "Cliente Teste IA Automatizado",
            "cpf_cnpj": cpf_teste,
            "rg_ie": "99.888.777-6",
            "rg_orgao": "SSP",
            "rg_uf": "PR",
            "data_nascimento_fundacao": "1990-05-20",
            "estado_civil": "Solteiro(a)",
            "profissao": "Engenheiro Agrônomo",
            "cidade": "Cascavel",
            "estado": "PR"
        }

        # 1. Cadastro Novo
        res_novo = processar_cadastro_ia(payload_novo)
        self.assertTrue(res_novo["sucesso"], f"Falha no cadastro: {res_novo}")
        self.assertEqual(res_novo["acao"], "CRIADO")
        self.assertIsNotNone(res_novo["cliente_id"])
        cli_id = res_novo["cliente_id"]

        # 2. Atualização Enriquecida com CNH
        payload_update = {
            "cpf_cnpj": cpf_teste,
            "cnh_numero": "12345678901",
            "cnh_categoria": "AB",
            "cnh_validade": "2030-10-15",
            "cnh_orgao_uf": "DETRAN/PR"
        }
        res_upd = processar_cadastro_ia(payload_update)
        self.assertTrue(res_upd["sucesso"])
        self.assertEqual(res_upd["acao"], "ATUALIZADO")
        self.assertEqual(res_upd["cliente_id"], cli_id)

        # 3. Anexo de documento temporário
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(b"fake image bytes")
            tmp_path = tmp.name

        try:
            res_doc = processar_cadastro_ia({
                "cpf_cnpj": cpf_teste,
                "tipo_documento": "RG",
                "rg_ie": "99.888.777-6"
            }, caminho_imagem=tmp_path)
            self.assertTrue(res_doc["sucesso"])
            self.assertIsNotNone(res_doc["documento_anexo"])
            self.assertTrue(os.path.exists(res_doc["documento_anexo"]["caminho"]))
            # Limpeza do arquivo criado na pasta uploads
            if os.path.exists(res_doc["documento_anexo"]["caminho"]):
                os.remove(res_doc["documento_anexo"]["caminho"])
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)


    def test_cpf_invalido(self):
        res = processar_cadastro_ia({
            "nome_completo": "Cliente CPF Errado",
            "cpf_cnpj": "12345678900"  # CPF inválido
        })
        self.assertFalse(res["sucesso"])
        self.assertIn("CPF/CNPJ inválido", res["erro"])

    def test_cliente_casado_alerta_conjuge(self):
        cpf_teste = "71542360005"
        res = processar_cadastro_ia({
            "nome_completo": "Cliente Casado Sem Dados Esposa",
            "cpf_cnpj": cpf_teste,
            "estado_civil": "Casado(a)"
        })
        self.assertTrue(res["sucesso"])
        self.assertIsNotNone(res["alerta_conjuge"])
        self.assertIn("pendência técnica", res["alerta_conjuge"])

    def test_cli_execution(self):
        import subprocess
        payload = json.dumps({
            "nome_completo": "Cliente Teste Via CLI",
            "cpf_cnpj": "02359487051",
            "cidade": "Douradina",
            "estado": "PR"
        })
        cmd = [
            "python",
            "scripts/cadastrar_cliente_ia.py",
            "--json",
            payload
        ]
        p = subprocess.run(cmd, capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(__file__)))
        self.assertEqual(p.returncode, 0, f"Erro CLI: {p.stderr}")
        data = json.loads(p.stdout)
        self.assertTrue(data["sucesso"])
        self.assertEqual(data["nome"], "Cliente Teste Via CLI")

    def test_enriquecimento_preserva_dados_e_sobrescrita_explicita(self):
        cpf_teste = "11144477735"
        row_antigo = execute_query(
            "SELECT c.id FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE p.cpf_cnpj = ?",
            params=(cpf_teste,),
            fetch_one=True
        )
        if row_antigo:
            execute_query("DELETE FROM clientes WHERE id = ?", params=(row_antigo["id"],), commit=True)
        execute_query("DELETE FROM pessoas WHERE cpf_cnpj = ?", params=(cpf_teste,), commit=True)

        # 1. Cadastra cliente mulher com RG e filiação
        res1 = processar_cadastro_ia({
            "nome_completo": "Maria da Silva",
            "cpf_cnpj": cpf_teste,
            "sexo": "F",
            "rg_ie": "11.222.333-4",
            "filiacao_mae": "Ana da Silva"
        })
        self.assertTrue(res1["sucesso"])
        cli_id = res1["cliente_id"]

        # 2. Enriquecimento com comprovante de endereço (sem sexo, com nome abreviado e rg_ie null)
        res2 = processar_cadastro_ia({
            "nome_completo": "Maria S.",
            "cpf_cnpj": cpf_teste,
            "rg_ie": None,
            "endereco_completo": "Linha São José, s/n",
            "cidade": "Iporã",
            "estado": "PR",
            "cep": "87560000"
        })
        self.assertTrue(res2["sucesso"])
        self.assertEqual(res2["acao"], "ATUALIZADO")

        row = execute_query("""
            SELECT p.nome, p.genero, p.rg, p.endereco_completo, c.cidade, c.cep
            FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE c.id = ?
        """, params=(cli_id,), fetch_one=True)
        self.assertEqual(row["nome"], "Maria da Silva")
        self.assertEqual(row["genero"], "F")
        self.assertEqual(row["rg"], "11.222.333-4")
        self.assertEqual(row["endereco_completo"], "Linha São José, s/n")
        self.assertEqual(row["cep"], "87560-000")

        # Metadado filiacao_mae preservado
        meta = execute_query(
            "SELECT valor FROM cliente_metadados WHERE id_cliente = ? AND chave = 'filiacao_mae'",
            params=(cli_id,),
            fetch_one=True
        )
        self.assertIsNotNone(meta)
        self.assertEqual(meta["valor"], "Ana da Silva")

        # 3. Atualização com sobrescrever=True altera endereço existente
        res3 = processar_cadastro_ia({
            "cpf_cnpj": cpf_teste,
            "endereco_completo": "Av. Brasil, 500"
        }, sobrescrever=True)
        self.assertTrue(res3["sucesso"])
        row_upd = execute_query(
            "SELECT p.endereco_completo FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE c.id = ?",
            params=(cli_id,),
            fetch_one=True
        )
        self.assertEqual(row_upd["endereco_completo"], "Av. Brasil, 500")

    def test_cadastro_pj_e_multiplos_anexos(self):
        cnpj_teste = "11222333000181"
        row_antigo = execute_query(
            "SELECT c.id FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE p.cpf_cnpj = ?",
            params=(cnpj_teste,),
            fetch_one=True
        )
        if row_antigo:
            execute_query("DELETE FROM clientes WHERE id = ?", params=(row_antigo["id"],), commit=True)
        execute_query("DELETE FROM pessoas WHERE cpf_cnpj = ?", params=(cnpj_teste,), commit=True)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as t1, \
             tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as t2:
            t1.write(b"img1")
            t2.write(b"pdf2")
            p1, p2 = t1.name, t2.name

        try:
            res = processar_cadastro_ia({
                "cnpj": cnpj_teste,
                "razao_social": "Agropecuária Modelo Ltda",
                "nome_fantasia": "Fazenda Modelo",
                "data_abertura": "10/03/2015",
                "cidade": "Umuarama",
                "estado": "PR"
            }, caminho_imagem=[p1, p2])

            self.assertTrue(res["sucesso"], f"Falha PJ: {res}")
            self.assertEqual(res["acao"], "CRIADO")
            self.assertEqual(len(res["documentos_anexos"]), 2)
            self.assertEqual(res["documentos_anexos"][0]["tipo"], "CARTAO_CNPJ")

            for doc in res["documentos_anexos"]:
                if os.path.exists(doc["caminho"]):
                    os.remove(doc["caminho"])
        finally:
            for p_tmp in (p1, p2):
                if os.path.exists(p_tmp):
                    os.remove(p_tmp)

    def test_capitalizacao_ocr_caixa_alta(self):
        norm = normalizar_dados_cliente({
            "nome_completo": "JOAO DA SILVA SAURO",
            "razao_social": "AGROPECUARIA MODELO LTDA",
            "naturalidade": "CAMPO MOURAO - PR",
            "endereco_completo": "ESTRADA DA GLEBA, S/N"
        })
        self.assertEqual(norm["nome_completo"], "Joao da Silva Sauro")
        self.assertEqual(norm["razao_social"], "Agropecuaria Modelo LTDA")
        self.assertEqual(norm["naturalidade"], "Campo Mourao - PR")
        self.assertEqual(norm["endereco_completo"], "Estrada da Gleba, s/n")

    def test_busca_por_nome_sem_cpf_e_dry_run(self):
        cpf_teste = "39053344705"
        row_antigo = execute_query(
            "SELECT c.id FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE p.cpf_cnpj = ?",
            params=(cpf_teste,),
            fetch_one=True
        )
        if row_antigo:
            execute_query("DELETE FROM clientes WHERE id = ?", params=(row_antigo["id"],), commit=True)
        execute_query("DELETE FROM pessoas WHERE cpf_cnpj = ?", params=(cpf_teste,), commit=True)

        res1 = processar_cadastro_ia({
            "nome_completo": "Carlos Eduardo Ferreira",
            "cpf_cnpj": cpf_teste
        })
        self.assertTrue(res1["sucesso"])
        cli_id = res1["cliente_id"]

        # Dry-run sem CPF localiza por nome e não grava endereço
        res_dry = processar_cadastro_ia({
            "nome_completo": "CARLOS EDUARDO FERREIRA",
            "endereco_completo": "RUA DAS PALMEIRAS, 200"
        }, dry_run=True)
        self.assertTrue(res_dry["sucesso"])
        self.assertTrue(res_dry["dry_run"])
        self.assertEqual(res_dry["acao"], "ATUALIZADO")
        self.assertEqual(res_dry["cliente_id"], cli_id)

        row_check = execute_query(
            "SELECT p.endereco_completo FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE c.id = ?",
            params=(cli_id,),
            fetch_one=True
        )
        self.assertIsNone(row_check["endereco_completo"])

        # Atualização real sem CPF por nome único
        res2 = processar_cadastro_ia({
            "nome_completo": "carlos eduardo ferreira",
            "endereco_completo": "Rua das Palmeiras, 200"
        })
        self.assertTrue(res2["sucesso"])
        self.assertEqual(res2["acao"], "ATUALIZADO")

    def test_anexo_duplicado_e_representante_legal_pj(self):
        cpf_rep = "52998224725"
        cnpj_pj = "11222333000181"

        # Garante representante cadastrado
        res_rep = processar_cadastro_ia({
            "nome_completo": "Representante Legal Teste",
            "cpf_cnpj": cpf_rep
        })
        self.assertTrue(res_rep["sucesso"])
        rep_pessoa_id = res_rep["pessoa_id"]

        # Cadastra/atualiza PJ vinculando representante_legal_cpf
        res_pj = processar_cadastro_ia({
            "cnpj": cnpj_pj,
            "razao_social": "Agropecuária Modelo Ltda",
            "representante_legal_cpf": cpf_rep
        }, sobrescrever=True)
        self.assertTrue(res_pj["sucesso"])
        row_pj = execute_query(
            "SELECT p.representante_legal_id FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE c.id = ?",
            params=(res_pj["cliente_id"],),
            fetch_one=True
        )
        self.assertEqual(row_pj["representante_legal_id"], rep_pessoa_id)

        # Testa anexo duplicado (mesmo conteúdo)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(b"conteudo-identico-para-teste-dedup")
            tmp_path = tmp.name

        try:
            r_a1 = processar_cadastro_ia({"cpf_cnpj": cnpj_pj}, caminho_imagem=tmp_path)
            r_a2 = processar_cadastro_ia({"cpf_cnpj": cnpj_pj}, caminho_imagem=tmp_path)
            self.assertFalse(r_a1["documento_anexo"].get("duplicado", False))
            self.assertTrue(r_a2["documento_anexo"].get("duplicado", False))
            if os.path.exists(r_a1["documento_anexo"]["caminho"]):
                os.remove(r_a1["documento_anexo"]["caminho"])
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)


if __name__ == "__main__":
    unittest.main()
