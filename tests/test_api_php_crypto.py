"""
tests/test_api_php_crypto.py — Interoperabilidade PC (Python) <-> nuvem (PHP) da senha GOV e da validação de documentos.

Roda as funções reais de frontend/public/api.php por meio de tests/php/harness_api.php. Se não houver PHP no
PATH (nem o do XAMPP), os testes são pulados.
"""
import os
import shutil
import subprocess
import unittest
from unittest.mock import patch

from services.seguranca import crypto_service as cs
from services.seguranca.crypto_service import CIPHER_PREFIX, decrypt_sensitive_data, encrypt_sensitive_data

HARNESS = os.path.join(os.path.dirname(__file__), "php", "harness_api.php")
CHAVE = "chave-compartilhada-pc-nuvem"


def _achar_php():
    for candidato in (shutil.which("php"), r"C:\xampp\php\php.exe"):
        if candidato and os.path.exists(candidato):
            return candidato
    return None


PHP = _achar_php()


@unittest.skipUnless(PHP, "PHP não encontrado")
class TestInteroperabilidadePhp(unittest.TestCase):
    def _php(self, *args, chave=CHAVE):
        env = dict(os.environ, GERENCIGEO_SECRET_KEY=chave)
        r = subprocess.run([PHP, HARNESS, *args], capture_output=True, env=env, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout.decode("utf-8", "replace") + r.stderr.decode("utf-8", "replace"))
        return r.stdout.decode("utf-8")

    def test_autoteste_das_funcoes_do_php(self):
        saida = self._php("selftest")
        self.assertIn("0 falhas", saida)
        self.assertNotIn("FAIL", saida)

    def test_php_cifra_python_decifra(self):
        blob = self._php("cifrar", "Gov#Senha-2026")
        self.assertTrue(blob.startswith(CIPHER_PREFIX))
        with patch.dict(os.environ, {"GERENCIGEO_SECRET_KEY": CHAVE}):
            self.assertEqual(decrypt_sensitive_data(blob), "Gov#Senha-2026")

    def test_python_cifra_php_decifra(self):
        with patch.dict(os.environ, {"GERENCIGEO_SECRET_KEY": CHAVE}):
            blob = encrypt_sensitive_data("Gov#Senha-2026")
            legado = cs._encrypt_legacy("SenhaLegadaPC", cs._get_or_create_master_key())
        self.assertEqual(self._php("decifrar", blob), "Gov#Senha-2026")
        self.assertEqual(self._php("decifrar", legado), "SenhaLegadaPC")

    def test_formato_antigo_da_nuvem_continua_legivel(self):
        cbc = self._php("legadoCbc", "SenhaDaNuvemAntiga")
        self.assertTrue(cbc.startswith(cs.LEGACY_PREFIX))
        self.assertEqual(self._php("decifrar", cbc), "SenhaDaNuvemAntiga")

    def test_chave_diferente_nao_decifra_no_php(self):
        with patch.dict(os.environ, {"GERENCIGEO_SECRET_KEY": CHAVE}):
            blob = encrypt_sensitive_data("segredo")
        self.assertEqual(self._php("decifrar", blob, chave="outra-chave"), "")


if __name__ == "__main__":
    unittest.main()
