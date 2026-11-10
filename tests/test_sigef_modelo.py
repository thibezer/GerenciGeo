import re
import tempfile
import unittest
import zipfile
from pathlib import Path

from services.documentacao.sigef_modelo import ModeloSigefError, preencher_modelo_sigef


def _vertices(n):
    return [[f"V-{i:03d}", "500000,12", "0,01", "7000000,34", "0,01", "100,00", "0,02", "PG1", "LA1", "", "", "X"] for i in range(1, n + 1)]


def _parte(nome, parcela, hemisferio="Sul", n=11):
    return {"denominacao": nome, "parcela": parcela, "meridiano_central": -51, "hemisferio": hemisferio, "vertices": _vertices(n)}


class TestPlanilhaSigefModelo(unittest.TestCase):
    def _gerar(self, partes):
        with tempfile.TemporaryDirectory() as d:
            destino = Path(d) / "saida.ods"
            preencher_modelo_sigef(str(destino), {"nome": "A", "documento": "12345678901", "sncr": "123", "cns": "012345", "matricula": "1234"}, partes)
            with zipfile.ZipFile(destino) as z:
                self.assertIsNone(z.testzip())
                return z.read("content.xml").decode("utf-8")

    def test_abas_e_ids_unicos(self):
        c = self._gerar([_parte("a", "001"), _parte("b", "002")])
        nomes = re.findall(r'table:name="([^"]+)"', c)
        self.assertIn("perimetro_1", nomes)
        self.assertIn("perimetro_2", nomes)
        ids = re.findall(r'xml:id="(control\d+)"', c)
        self.assertEqual(len(ids), len(set(ids)))

    def test_parcelas_e_hemisferio_gravados(self):
        c = self._gerar([_parte("a", "001", "Norte"), _parte("b", "002", "Norte")])
        self.assertIn(">001<", c)
        self.assertIn(">002<", c)
        self.assertIn(">Norte<", c)

    def test_vertices_preenchidos(self):
        c = self._gerar([_parte("a", "001", n=3)])
        self.assertEqual(c.count(">V-003<"), 1)

    def test_sem_partes_levanta_erro(self):
        with self.assertRaises(ModeloSigefError):
            preencher_modelo_sigef("x.ods", {}, [])


if __name__ == "__main__":
    unittest.main()
