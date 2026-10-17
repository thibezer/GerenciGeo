"""Qualificação de casais na anuência: gênero só pelo campo do cadastro e nomes no lugar de "este/aquele"."""
import unittest

from services.documentacao.cartorio.anuencias import _inferir_genero, _rotulo_doc


class TestInferirGenero(unittest.TestCase):
    def test_campo_genero_e_o_unico_criterio(self):
        self.assertEqual(_inferir_genero("M", "F"), "M")
        self.assertEqual(_inferir_genero("f", "M"), "F")

    def test_sem_valor_valido_usa_padrao(self):
        self.assertEqual(_inferir_genero(None, "F"), "F")
        self.assertEqual(_inferir_genero("", "M"), "M")
        self.assertEqual(_inferir_genero("X", "M"), "M")


class TestRotuloDoc(unittest.TestCase):
    def test_identifica_pelo_nome_em_destaque(self):
        self.assertIn("<strong", _rotulo_doc("Maria"))
        self.assertIn("Maria", _rotulo_doc("Maria"))


if __name__ == "__main__":
    unittest.main()
