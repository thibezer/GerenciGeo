import unittest
from unittest.mock import patch

from scripts.cadastrar_cliente_ia import normalizar_dados_cliente
from services.documentacao.cartorio.qualificacao import (
    domicilio_do_proprietario,
    qualificacao_resumida,
    qualificar_pessoa,
)
from services.documentacao.cartorio.utils import formatar_documento_identidade
from services.processamento.identidade_parser import parse_identidade_pdf


class TestCINEQualificacaoEndereco(unittest.TestCase):
    def test_formatar_documento_identidade_cin_e_rg_tradicional(self):
        doc_cin, eh_cin = formatar_documento_identidade("00914999923", "009.149.999-23", "IIPR", "PR")
        self.assertTrue(eh_cin)
        self.assertEqual(doc_cin, "009.149.999-23 - IIPR/PR")

        doc_rg, eh_cin_rg = formatar_documento_identidade("902.993-1", "188.864.429-04", "SESP", "PR")
        self.assertFalse(eh_cin_rg)
        self.assertEqual(doc_rg, "902.993-1 - SESP/PR")

        # Não duplica órgão/UF quando já embutidos no campo RG
        doc_legado, _ = formatar_documento_identidade("12.345.678-SSP/PR", "111.222.333-44", "SSP", "PR")
        self.assertEqual(doc_legado, "12.345.678-SSP/PR")

    def test_qualificar_pessoa_casal_com_cin_e_rg(self):
        casal = {
            "nome": "Francisco Antonio Cripa",
            "cpf_cnpj": "18886442904",
            "rg": "902.993-1",
            "rg_orgao": "SESP",
            "rg_uf": "PR",
            "genero": "M",
            "nacionalidade": "Brasileira",
            "profissao": "Produtor Rural",
            "estado_civil": "Casado(a)",
            "regime_bens": "Comunhão Parcial de Bens",
            "endereco_completo": "Rua das Flores, nº 100, Centro, Francisco Alves-PR, CEP 87570-000",
            "nome_conjuge": "Zilda Aparecida Cripa",
            "cpf_conjuge": "00914999923",
            "rg_conjuge": "009.149.999-23",
            "rg_orgao_conjuge": "IIPR",
            "rg_uf_conjuge": "PR",
            "genero_conjuge": "F",
            "nacionalidade_conjuge": "Brasileira",
            "profissao_conjuge": "Do Lar",
        }
        html, _ = qualificar_pessoa(casal)
        self.assertIn("cédula de identidade RG nº 902.993-1 - SESP/PR", html)
        self.assertIn("Carteira de Identidade Nacional (CIN) nº 009.149.999-23 - IIPR/PR", html)
        self.assertIn("inscrita no CPF sob o nº 009.149.999-23", html)

    def test_qualificacao_resumida_com_cin(self):
        pessoa_cin = {
            "nome": "Zilda Aparecida Cripa",
            "cpf_cnpj": "00914999923",
            "rg": "00914999923",
            "rg_orgao": "IIPR",
            "rg_uf": "PR",
            "genero": "F",
        }
        html = qualificacao_resumida(pessoa_cin)
        self.assertIn("Carteira de Identidade Nacional (CIN) nº 009.149.999-23 - IIPR/PR", html)

    def test_domicilio_do_proprietario_completo_sem_duplicar(self):
        owner = {
            "endereco_completo": "Av. Paraná",
            "numero_endereco": "450",
            "bairro": "Centro",
            "cidade": "Francisco Alves",
            "estado": "PR",
            "cep": "87570000",
        }
        self.assertEqual(
            domicilio_do_proprietario(owner),
            "Av. Paraná, nº 450, Centro, Francisco Alves-PR, CEP 87570-000",
        )

        # Quando endereco_completo já inclui tudo, não duplica
        owner_cheio = {
            "endereco_completo": "Avenida Brasil, nº 1500, Centro, Cascavel/PR, CEP 85800-000",
            "numero_endereco": "1500",
            "bairro": "Centro",
            "cidade": "Cascavel",
            "estado": "PR",
            "cep": "85800-000",
        }
        self.assertEqual(
            domicilio_do_proprietario(owner_cheio),
            "Avenida Brasil, nº 1500, Centro, Cascavel/PR, CEP 85800-000",
        )

    def test_identidade_parser_reconhece_cin(self):
        texto_cin = (
            "REPÚBLICA FEDERATIVA DO BRASIL\n"
            "CARTEIRA DE IDENTIDADE NACIONAL\n"
            "Nome: ZILDA APARECIDA CRIPA\n"
            "CPF: 009.149.999-23\n"
            "Órgão Emissor: IIPR/PR\n"
            "Data de Nascimento: 06/01/1955\n"
            "Nacionalidade: BRASILEIRA\n"
        )
        with patch("services.processamento.identidade_parser.extrair_texto_pdf", return_value=texto_cin):
            res = parse_identidade_pdf(b"%PDF-fake", "cin.pdf")

        self.assertTrue(res["is_cin"])
        self.assertEqual(res["tipo_identificado"], "RG")
        self.assertEqual(res["cpf"], "00914999923")
        self.assertEqual(res["rg_numero"], "009.149.999-23")
        self.assertEqual(res["rg_orgao"], "IIPR")
        self.assertEqual(res["rg_uf"], "PR")

    def test_normalizar_dados_cliente_cin(self):
        dados = normalizar_dados_cliente({
            "nome_completo": "Zilda Aparecida Cripa",
            "cpf_cnpj": "009.149.999-23",
            "tipo_documento": "CIN",
            "rg_orgao": "iipr",
            "rg_uf": "pr",
        })
        self.assertEqual(dados["rg_ie"], "009.149.999-23")
        self.assertEqual(dados["rg_orgao"], "IIPR")
        self.assertEqual(dados["rg_uf"], "PR")


if __name__ == "__main__":
    unittest.main()
