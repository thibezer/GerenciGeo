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
        self.assertIsNone(normalizar_data(None))
        self.assertIsNone(normalizar_data(""))

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


if __name__ == "__main__":
    unittest.main()
