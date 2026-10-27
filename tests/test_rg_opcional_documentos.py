import unittest
from services.documentacao.cartorio.qualificacao import qualificar_pessoa, qualificacao_resumida


class TestRGOpcionalDocumentos(unittest.TestCase):
    def test_qualificacao_individual_com_rg(self):
        pessoa = {
            "nome": "João da Silva",
            "cpf_cnpj": "123.456.789-00",
            "rg": "9.876.543-2",
            "genero": "M",
            "nacionalidade": "brasileiro",
            "profissao": "Engenheiro",
            "estado_civil": "solteiro",
            "endereco_completo": "Rua das Flores, 100",
        }
        html, info = qualificar_pessoa(pessoa)
        self.assertIn("cédula de identidade RG nº", html)
        self.assertIn("9.876.543-2", html)
        self.assertIn("inscrito no CPF/MF sob o nº", html)

    def test_qualificacao_individual_sem_rg(self):
        pessoa = {
            "nome": "João da Silva",
            "cpf_cnpj": "123.456.789-00",
            "rg": None,
            "genero": "M",
            "nacionalidade": "brasileiro",
            "profissao": "Engenheiro",
            "estado_civil": "solteiro",
            "endereco_completo": "Rua das Flores, 100",
        }
        html, info = qualificar_pessoa(pessoa)
        self.assertNotIn("cédula de identidade", html)
        self.assertNotIn("RG", html)
        self.assertIn("inscrito no CPF/MF sob o nº", html)

    def test_qualificacao_individual_rg_vazio(self):
        pessoa = {
            "nome": "Maria de Souza",
            "cpf_cnpj": "123.456.789-00",
            "rg": "   ",
            "genero": "F",
            "nacionalidade": "brasileira",
            "profissao": "Agrônoma",
            "estado_civil": "solteira",
            "endereco_completo": "Av. Brasil, 200",
        }
        html, info = qualificar_pessoa(pessoa)
        self.assertNotIn("cédula de identidade", html)
        self.assertNotIn("RG", html)
        self.assertIn("inscrita no CPF/MF sob o nº", html)

    def test_qualificacao_casal_um_com_rg_outro_sem_rg(self):
        casal = {
            "nome": "Carlos Silva",
            "cpf_cnpj": "111.222.333-44",
            "rg": "12.345.678-9",
            "genero": "M",
            "nacionalidade": "brasileiro",
            "profissao": "Produtor Rural",
            "estado_civil": "casado",
            "regime_bens": "Comunhão Parcial",
            "endereco_completo": "Fazenda Modelo",
            "nome_conjuge": "Ana Silva",
            "cpf_conjuge": "555.666.777-88",
            "rg_conjuge": None,
            "genero_conjuge": "F",
            "nacionalidade_conjuge": "brasileira",
            "profissao_conjuge": "Do Lar",
        }
        html, info = qualificar_pessoa(casal)
        # O titular tem RG
        self.assertIn("ele portador da cédula de identidade RG nº", html)
        self.assertIn("12.345.678-9", html)
        # O cônjuge NÃO tem RG
        self.assertIn("ela inscrita no CPF sob o nº", html)
        self.assertNotIn("ela portadora da cédula", html)

    def test_qualificacao_casal_ambos_sem_rg(self):
        casal = {
            "nome": "Carlos Silva",
            "cpf_cnpj": "111.222.333-44",
            "rg": "",
            "genero": "M",
            "nacionalidade": "brasileiro",
            "profissao": "Produtor Rural",
            "estado_civil": "casado",
            "regime_bens": "Comunhão Parcial",
            "endereco_completo": "Fazenda Modelo",
            "nome_conjuge": "Ana Silva",
            "cpf_conjuge": "555.666.777-88",
            "rg_conjuge": "",
            "genero_conjuge": "F",
            "nacionalidade_conjuge": "brasileira",
            "profissao_conjuge": "Do Lar",
        }
        html, info = qualificar_pessoa(casal)
        self.assertNotIn("cédula de identidade", html)
        self.assertNotIn("RG", html)
        self.assertIn("ele inscrito no CPF sob o nº", html)
        self.assertIn("ela inscrita no CPF sob o nº", html)

    def test_qualificacao_resumida_com_e_sem_rg(self):
        com_rg = {
            "nome": "Pedro Santos",
            "cpf_cnpj": "111.222.333-44",
            "rg": "7.654.321-0",
            "genero": "M",
        }
        html_com = qualificacao_resumida(com_rg)
        self.assertIn("portador do RG nº", html_com)
        self.assertIn("7.654.321-0", html_com)

        sem_rg = {
            "nome": "Pedro Santos",
            "cpf_cnpj": "111.222.333-44",
            "rg": None,
            "genero": "M",
        }
        html_sem = qualificacao_resumida(sem_rg)
        self.assertNotIn("portador do RG", html_sem)
        self.assertNotIn("RG", html_sem)
        self.assertIn("inscrito no CPF nº", html_sem)


if __name__ == "__main__":
    unittest.main()
