"""
tests/test_clientes_detalhes_seguranca.py — Testes Unitários de Segurança, Auditoria, PF/PJ e Documentos.
"""

import unittest
from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from services.gestores.cliente_manager import (
    cadastrar_cliente,
    atualizar_cliente,
    revelar_senha_gov,
    obter_acessos_cliente,
    obter_documentos_cliente,
    salvar_documento_cliente,
    excluir_documento_cliente
)
from services.seguranca.crypto_service import encrypt_sensitive_data, decrypt_sensitive_data
from routes.clientes import get_clientes

class TestClientesDetalhesSeguranca(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)

    def setUp(self):
        self.created_cliente_ids = []

    def tearDown(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            for cid in self.created_cliente_ids:
                cursor.execute("SELECT pessoa_id FROM clientes WHERE id = ?", (cid,))
                row = cursor.fetchone()
                cursor.execute("DELETE FROM cliente_acesso_logs WHERE id_cliente = ?", (cid,))
                cursor.execute("DELETE FROM cliente_historico_logs WHERE id_cliente = ?", (cid,))
                cursor.execute("DELETE FROM cliente_metadados WHERE id_cliente = ?", (cid,))
                cursor.execute("DELETE FROM clientes WHERE id = ?", (cid,))
                if row and row[0]:
                    cursor.execute("DELETE FROM cliente_documentos WHERE pessoa_id = ?", (row[0],))
                    cursor.execute("DELETE FROM pessoas WHERE id = ?", (row[0],))
            conn.commit()

    def test_criptografia_e_revelacao_auditada(self):
        """Valida que a senha é cifrada em repouso e que a revelação gera registro de auditoria."""
        raw_pass = "GovSeguro#2026"
        cifrado = encrypt_sensitive_data(raw_pass)
        self.assertTrue(cifrado.startswith("ENC:G4G2:"))
        self.assertEqual(decrypt_sensitive_data(cifrado), raw_pass)

        # Cadastro com senha
        cli_data = {
            "nome_completo": "Cliente Criptografia Teste",
            "cpf_cnpj": "78612659191",
            "senha_gov": raw_pass
        }
        res = cadastrar_cliente(cli_data)
        self.assertNotIn("error", res)
        cid = res["id"]
        self.created_cliente_ids.append(cid)

        # Confere que no banco bruto o valor está criptografado
        row = execute_query("SELECT senha_gov FROM clientes WHERE id = ?", params=(cid,), fetch_one=True)
        self.assertTrue(row["senha_gov"].startswith("ENC:G4G2:"))

        # Confere que get_clientes() retorna mascarado
        clientes = get_clientes()
        c = next(x for x in clientes if x["id"] == cid)
        self.assertEqual(c["senha_gov"], "••••••••")
        self.assertTrue(c["tem_senha_gov"])

        # Revelação auditada
        rev = revelar_senha_gov(cid, usuario="Agente Teste", ip_origem="127.0.0.1")
        self.assertEqual(rev.get("senha_gov"), raw_pass)

        # Verifica logs de auditoria
        acessos = obter_acessos_cliente(cid)
        self.assertTrue(len(acessos) >= 1)
        self.assertEqual(acessos[0]["tipo_dado"], "SENHA_GOV")
        self.assertEqual(acessos[0]["acao"], "REVELACAO_VISUAL")

    def test_pessoa_juridica_e_representante_legal(self):
        """Valida cadastro de PJ, dados fiscais e vínculo com representante legal PF."""
        # 1. Cadastra Representante Legal PF
        pf_data = {
            "nome_completo": "Diretor Representante",
            "cpf_cnpj": "90378697501",
            "tipo_pessoa": "PF",
            "profissao": "Administrador"
        }
        res_pf = cadastrar_cliente(pf_data)
        self.assertNotIn("error", res_pf)
        pf_id = res_pf["id"]
        self.created_cliente_ids.append(pf_id)

        pf_cli = next(c for c in get_clientes() if c["id"] == pf_id)
        rep_pessoa_id = pf_cli["pessoa_id"]

        # 2. Cadastra Empresa PJ
        pj_data = {
            "nome_completo": "Agropecuaria do Oeste LTDA",
            "razao_social": "Agropecuaria do Oeste LTDA",
            "nome_fantasia": "AgroOeste",
            "cpf_cnpj": "11222333000181",
            "tipo_pessoa": "PJ",
            "inscricao_estadual": "90123456-78",
            "inscricao_municipal": "12345",
            "representante_legal_id": rep_pessoa_id
        }
        res_pj = cadastrar_cliente(pj_data)
        self.assertNotIn("error", res_pj)
        pj_id = res_pj["id"]
        self.created_cliente_ids.append(pj_id)

        # 3. Consulta e valida
        clientes = get_clientes()
        pj_cli = next(c for c in clientes if c["id"] == pj_id)
        self.assertEqual(pj_cli["tipo_pessoa"], "PJ")
        self.assertEqual(pj_cli["razao_social"], "Agropecuaria do Oeste LTDA")
        self.assertEqual(pj_cli["nome_fantasia"], "AgroOeste")
        self.assertEqual(pj_cli["inscricao_estadual"], "90123456-78")
        self.assertEqual(pj_cli["representante_legal_id"], rep_pessoa_id)
        self.assertEqual(pj_cli["representante_legal_nome"], "Diretor Representante")

    def test_gestao_multiplos_documentos_cnh_validade(self):
        """Valida inserção, listagem e exclusão de documentos estruturados (RG, CNH, CREA)."""
        cli_data = {
            "nome_completo": "Engenheiro Documentado",
            "cpf_cnpj": "39601739114",
            "documentos": [
                {
                    "tipo_documento": "CNH",
                    "numero": "01234567890",
                    "categoria_cnh": "AB",
                    "orgao_emissor": "DETRAN",
                    "uf_emissor": "PR",
                    "data_validade": "2024-01-10" # Vencida
                },
                {
                    "tipo_documento": "CREA",
                    "numero": "PR-998877",
                    "orgao_emissor": "CREA-PR"
                }
            ]
        }
        res = cadastrar_cliente(cli_data)
        self.assertNotIn("error", res)
        cid = res["id"]
        self.created_cliente_ids.append(cid)

        docs = obter_documentos_cliente(cid)
        self.assertEqual(len(docs), 2)
        cnh = next(d for d in docs if d["tipo_documento"] == "CNH")
        self.assertEqual(cnh["numero"], "01234567890")
        self.assertEqual(cnh["categoria_cnh"], "AB")
        self.assertEqual(cnh["data_validade"], "2024-01-10")

        # Adiciona outro documento via endpoint service
        res_doc = salvar_documento_cliente(cid, {
            "tipo_documento": "PASSAPORTE",
            "numero": "BR123456",
            "orgao_emissor": "DPF"
        })
        self.assertNotIn("error", res_doc)

        docs_atualizados = obter_documentos_cliente(cid)
        self.assertEqual(len(docs_atualizados), 3)

        # Exclui o passaporte
        passaporte = next(d for d in docs_atualizados if d["tipo_documento"] == "PASSAPORTE")
        res_del = excluir_documento_cliente(passaporte["id"])
        self.assertNotIn("error", res_del)

        docs_finais = obter_documentos_cliente(cid)
        self.assertEqual(len(docs_finais), 2)

    def test_qualificacao_civil_expandida_cnh_naturalidade_certidao(self):
        """Valida persistência e recuperação de CNH, RG com órgão/UF, Naturalidade e Matrícula de Casamento."""
        cli_data = {
            "nome_completo": "Carlos Roberto dos Santos",
            "cpf_cnpj": "01234567890",
            "rg_ie": "12.345.678-9",
            "rg_orgao": "SSP",
            "rg_uf": "PR",
            "naturalidade": "Ponta Grossa - PR",
            "nacionalidade": "Brasileiro",
            "estado_civil": "Casado(a)",
            "nome_conjuge": "Mariana dos Santos",
            "cpf_conjuge": "98765432100",
            "rg_conjuge": "98.765.432-1",
            "regime_bens": "Comunhão Parcial de Bens",
            "certidao_casamento_matricula": "123456.01.55.2020.1.00123.456.0007890-12",
            "cnh_numero": "99887766554",
            "cnh_categoria": "AB",
            "cnh_validade": "2028-12-31",
            "cnh_orgao_uf": "DETRAN/PR",
            "telefone": "(42) 99999-8888",
            "email": "carlos@exemplo.com"
        }

        res = cadastrar_cliente(cli_data)
        self.assertNotIn("error", res)
        cid = res["id"]
        self.created_cliente_ids.append(cid)

        # 1. Recupera via get_clientes()
        clientes = get_clientes()
        c = next(x for x in clientes if x["id"] == cid)
        self.assertEqual(c["rg_orgao"], "SSP")
        self.assertEqual(c["rg_uf"], "PR")
        self.assertEqual(c["naturalidade"], "Ponta Grossa - PR")
        self.assertEqual(c["certidao_casamento_matricula"], "123456.01.55.2020.1.00123.456.0007890-12")
        self.assertEqual(c["cnh_numero"], "99887766554")
        self.assertEqual(c["cnh_categoria"], "AB")
        self.assertEqual(c["cnh_validade"], "2028-12-31")
        self.assertEqual(c["cnh_orgao_uf"], "DETRAN/PR")

        # 2. Atualiza os dados
        cli_data["naturalidade"] = "Curitiba - PR"
        cli_data["cnh_categoria"] = "AE"
        cli_data["certidao_casamento_matricula"] = "NOVA-MATRICULA-999"
        res_up = atualizar_cliente(cid, cli_data)
        self.assertNotIn("error", res_up)

        clientes_up = get_clientes()
        c_up = next(x for x in clientes_up if x["id"] == cid)
        self.assertEqual(c_up["naturalidade"], "Curitiba - PR")
        self.assertEqual(c_up["cnh_categoria"], "AE")
        self.assertEqual(c_up["certidao_casamento_matricula"], "NOVA-MATRICULA-999")

    def test_importar_identidade_pdf_cnh_extracao(self):
        """Valida a geração de PDF de identidade, parsing de texto e persistência de anexo e dados civis."""
        import fitz
        from services.gestores.cliente_manager import importar_identidade_pdf

        # 1. Cadastra cliente básico sem CNH com CPF matematicamente válido
        cli_data = {
            "nome_completo": "Marcos da Silva Sauro",
            "cpf_cnpj": "78612659191",
            "estado_civil": "Solteiro(a)"
        }
        res = cadastrar_cliente(cli_data)
        self.assertNotIn("error", res)
        cid = res["id"]
        self.created_cliente_ids.append(cid)

        # 2. Cria PDF sintético em memória simulando CNH brasileira
        doc = fitz.open()
        page = doc.new_page()
        conteudo_cnh = (
            "REPÚBLICA FEDERATIVA DO BRASIL\n"
            "MINISTÉRIO DOS TRANSPORTES\n"
            "CARTEIRA NACIONAL DE HABILITAÇÃO\n"
            "NOME: MARCOS DA SILVA SAURO\n"
            "DOC. IDENTIDADE: 88776655 SSP/PR\n"
            "CPF: 786.126.591-91\n"
            "DATA DE NASCIMENTO: 15/06/1985\n"
            "NATURALIDADE: Cascavel - PR\n"
            "Nº REGISTRO: 01234567891\n"
            "CAT. HAB.: B\n"
            "VALIDADE: 20/10/2032\n"
            "DETRAN/PR\n"
        )
        page.insert_text((50, 50), conteudo_cnh)
        pdf_bytes = doc.tobytes()
        doc.close()

        # 3. Invoca a importação do PDF
        res_import = importar_identidade_pdf(cid, pdf_bytes, "cnh_marcos.pdf")
        self.assertNotIn("error", res_import)
        self.assertTrue(res_import.get("sucesso"))
        self.assertEqual(res_import.get("tipo_documento"), "CNH")
        self.assertEqual(res_import["dados_extraidos"].get("cnh_numero"), "01234567891")
        self.assertEqual(res_import["dados_extraidos"].get("cnh_categoria"), "B")

        # 4. Verifica se o cliente no banco foi atualizado com os dados extraídos
        clientes = get_clientes()
        c = next(x for x in clientes if x["id"] == cid)
        self.assertEqual(c["cnh_numero"], "01234567891")
        self.assertEqual(c["cnh_categoria"], "B")
        self.assertEqual(c["cnh_validade"], "2032-10-20")
        self.assertEqual(c["naturalidade"], "Cascavel - PR")

        # 5. Verifica se o documento foi anexado à lista com caminho de arquivo
        docs = obter_documentos_cliente(cid)
        self.assertTrue(len(docs) >= 1)
        doc_anexado = next(d for d in docs if d["arquivo_nome"] == "cnh_marcos.pdf")
        self.assertIsNotNone(doc_anexado["arquivo_path"])
        self.assertTrue(doc_anexado["tamanho_bytes"] > 0)


