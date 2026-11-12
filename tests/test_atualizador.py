import unittest
from unittest.mock import patch

from services.gestores import atualizador


class TestAtualizador(unittest.TestCase):
    def test_desabilitado_em_ambiente_de_teste(self):
        self.assertFalse(atualizador.habilitado())
        self.assertEqual(atualizador.verificar_atualizacao(), {"habilitado": False, "disponivel": False})

    def test_verificar_detecta_commits_novos(self):
        saidas = {"fetch": "", "rev-parse": "a1b2c3d4", "rev-list": "2", "log": "feat: x\nfix: y"}
        with patch.object(atualizador, "habilitado", return_value=True), \
             patch.object(atualizador, "_git", side_effect=lambda *a, **k: saidas[a[0]]):
            r = atualizador.verificar_atualizacao()
        self.assertTrue(r["disponivel"])
        self.assertEqual(r["commits_atras"], 2)
        self.assertEqual(r["novidades"], ["feat: x", "fix: y"])

    def test_verificar_reporta_erro_sem_quebrar(self):
        with patch.object(atualizador, "habilitado", return_value=True), \
             patch.object(atualizador, "_git", side_effect=RuntimeError("sem rede")):
            r = atualizador.verificar_atualizacao()
        self.assertFalse(r["disponivel"])
        self.assertEqual(r["erro"], "sem rede")


if __name__ == "__main__":
    unittest.main()
