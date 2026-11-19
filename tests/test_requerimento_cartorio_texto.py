"""Concordância, lista de qualificações e avisos do Requerimento ao Registro de Imóveis (sem banco)."""
import unittest

from services.documentacao.cartorio.laudos_imovel import (
    _avisos_requerimento,
    _juntar_qualificacoes,
    _termos_requerentes,
)
from services.documentacao.cartorio.utils import LACUNA_DATA, LACUNA_TRT


class TestTermosRequerentes(unittest.TestCase):
    def test_um_proprietario_solteiro_vai_ao_singular(self):
        t = _termos_requerentes([{"genero": "M", "estado_civil": "Solteiro"}])
        self.assertEqual(t["vem"], "vem")
        self.assertEqual(t["requerem"], "REQUER")
        self.assertEqual(t["req_cap"], "O requerente")
        self.assertEqual(t["sao"], "é")
        self.assertEqual(t["pedem"], "pede e espera")

    def test_proprietaria_solteira_flexiona_no_feminino(self):
        t = _termos_requerentes([{"genero": "F", "estado_civil": "Solteira"}])
        self.assertEqual(t["req_cap"], "A requerente")
        self.assertEqual(t["req_legitimos"], "a legítima proprietária e possuidora")

    def test_casal_vai_ao_plural(self):
        t = _termos_requerentes([{"genero": "M", "estado_civil": "Casado", "nome_conjuge": "Maria"}])
        self.assertEqual(t["vem"], "vêm")
        self.assertEqual(t["requerem"], "REQUEREM")
        self.assertEqual(t["req_cap"], "Os requerentes")

    def test_dois_proprietarios_plural(self):
        t = _termos_requerentes([{"genero": "F", "estado_civil": "Solteira"}, {"genero": "F", "estado_civil": "Solteira"}])
        self.assertEqual(t["req_cap"], "As requerentes")
        self.assertEqual(t["terem"], "terem")

    def test_genero_desconhecido_singular_neutro(self):
        t = _termos_requerentes([{"estado_civil": "Solteiro"}])
        self.assertEqual(t["req_cap"], "O(A) requerente")


class TestJuntarQualificacoes(unittest.TestCase):
    def test_vazio_vira_lacuna(self):
        self.assertEqual(_juntar_qualificacoes([]), "_" * 40)

    def test_um(self):
        self.assertEqual(_juntar_qualificacoes(["A"]), "A")

    def test_dois_e_tres_levam_e_antes_do_ultimo(self):
        self.assertEqual(_juntar_qualificacoes(["A", "B"]), "A;<br>e B")
        self.assertEqual(_juntar_qualificacoes(["A", "B", "C"]), "A;<br>B;<br>e C")


class TestAvisosRequerimento(unittest.TestCase):
    def _dados(self, **lev):
        base = {"nome_profissional": "Fulano", "registro_profissional": "123"}
        return {"owners": [{"nome_completo": "X"}], "lev": {**base, **lev}}

    def test_sem_pendencias_sem_avisos(self):
        mats = [{"numero_matricula": "1", "georreferenciamento": "abc"}]
        self.assertEqual(_avisos_requerimento(self._dados(), mats, [], "TRT-1", "01/01/2026"), [])

    def test_trt_e_endereco_pendentes(self):
        avisos = _avisos_requerimento(self._dados(), [{}], ["Fulano"], LACUNA_TRT, LACUNA_DATA)
        self.assertEqual(len(avisos), 2)

    def test_unificada_sem_sigef_e_comarcas_diferentes(self):
        mats = [
            {"numero_matricula": "1", "georreferenciamento": "abc", "cri_comarca": "Umuarama"},
            {"numero_matricula": "2", "georreferenciamento": "", "cri_comarca": "Cianorte"},
        ]
        avisos = _avisos_requerimento(self._dados(), mats, [], "TRT-1", "01/01/2026")
        texto = " ".join(avisos)
        self.assertEqual(len(avisos), 2)
        self.assertIn("2", texto)
        self.assertIn("CIANORTE", texto)

    def test_sem_proprietario(self):
        d = {"owners": [], "lev": {"nome_profissional": "F", "registro_profissional": "1"}}
        self.assertEqual(len(_avisos_requerimento(d, [{}], [], "TRT-1", "01/01/2026")), 1)


if __name__ == "__main__":
    unittest.main()
