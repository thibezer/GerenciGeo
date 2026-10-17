"""
tests/test_crypto_aesgcm.py — Senha GOV em AES-256-GCM (ENC:G4G3), leitura do legado (ENC:G4G2) e migração.
"""
import base64
import hashlib
import os
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from database.connection import DatabaseManager, execute_query
from database.models import create_tables, migrar_retrocompatibilidade_documentos_e_senhas
from services.seguranca import crypto_service as cs
from services.seguranca.crypto_service import (
    CIPHER_PREFIX,
    LEGACY_PREFIX,
    decrypt_sensitive_data,
    encrypt_sensitive_data,
    esta_cifrado,
    precisa_recifrar,
)

CPF_MIG = ("99999999991", "99999999992", "99999999993", "99999999994")


class TestAesGcm(unittest.TestCase):
    def test_formato_atual_e_nonce_aleatorio(self):
        a = encrypt_sensitive_data("Gov#Segura2026")
        b = encrypt_sensitive_data("Gov#Segura2026")
        self.assertTrue(a.startswith("ENC:G4G3:"))
        self.assertNotEqual(a, b)
        self.assertNotIn("Gov#Segura2026", a)
        self.assertEqual(decrypt_sensitive_data(a), "Gov#Segura2026")
        self.assertEqual(decrypt_sensitive_data(b), "Gov#Segura2026")

    def test_unicode_e_vazios(self):
        self.assertEqual(decrypt_sensitive_data(encrypt_sensitive_data("açaí•ção")), "açaí•ção")
        self.assertIsNone(encrypt_sensitive_data(None))
        self.assertEqual(encrypt_sensitive_data(""), "")
        self.assertEqual(decrypt_sensitive_data(""), "")

    def test_valor_ja_cifrado_nao_e_cifrado_de_novo(self):
        atual = encrypt_sensitive_data("x1")
        legado = cs._encrypt_legacy("x2", cs._get_or_create_master_key())
        self.assertEqual(encrypt_sensitive_data(atual), atual)
        self.assertEqual(encrypt_sensitive_data(legado), legado)

    def test_legado_continua_legivel(self):
        legado = cs._encrypt_legacy("SenhaAntiga!", cs._get_or_create_master_key())
        self.assertTrue(legado.startswith(LEGACY_PREFIX))
        self.assertEqual(decrypt_sensitive_data(legado), "SenhaAntiga!")
        self.assertEqual(decrypt_sensitive_data("texto-puro-antigo"), "texto-puro-antigo")

    def test_classificacao_para_migracao(self):
        self.assertTrue(precisa_recifrar("texto puro"))
        self.assertTrue(precisa_recifrar(LEGACY_PREFIX + "abc"))
        self.assertFalse(precisa_recifrar(CIPHER_PREFIX + "abc"))
        self.assertFalse(precisa_recifrar(None))
        self.assertTrue(esta_cifrado(LEGACY_PREFIX + "abc"))
        self.assertFalse(esta_cifrado("texto puro"))

    def test_adulteracao_e_detectada(self):
        cifrado = encrypt_sensitive_data("intacta")
        payload = bytearray(base64.urlsafe_b64decode(cifrado[len(CIPHER_PREFIX):]))
        payload[15] ^= 0x01
        adulterado = CIPHER_PREFIX + base64.urlsafe_b64encode(bytes(payload)).decode()
        with self.assertLogs(cs.logger, level="ERROR"):
            self.assertIsNone(decrypt_sensitive_data(adulterado))

    def test_chave_errada_nao_decifra(self):
        cifrado = encrypt_sensitive_data("so-com-a-chave-certa")
        with patch.dict(os.environ, {"GERENCIGEO_SECRET_KEY": "outra-chave"}):
            with self.assertLogs(cs.logger, level="ERROR"):
                self.assertIsNone(decrypt_sensitive_data(cifrado))

    def test_dado_autenticado_amarra_o_contexto(self):
        """Blob cifrado sem o AAD do app (ou de outro contexto) é recusado."""
        chave = cs._get_or_create_master_key()
        nonce = bytes(range(12))
        estranho = CIPHER_PREFIX + base64.urlsafe_b64encode(nonce + AESGCM(chave).encrypt(nonce, b"x", None)).decode()
        with self.assertLogs(cs.logger, level="ERROR"):
            self.assertIsNone(decrypt_sensitive_data(estranho))

    def test_vetor_de_interoperabilidade_com_o_php(self):
        """
        Vetor fixo do layout compartilhado com frontend/public/api.php:
        chave = sha256("chave-de-teste-interop"), nonce = 00..0b, AAD = "gerencigeo:senha_gov",
        payload = urlsafe_b64(nonce || ciphertext || tag). O PHP deve produzir/ler exatamente este valor.
        """
        chave = hashlib.sha256(b"chave-de-teste-interop").digest()
        nonce = bytes(range(12))
        blob = AESGCM(chave).encrypt(nonce, "Senha#Gov2026".encode(), b"gerencigeo:senha_gov")
        valor = CIPHER_PREFIX + base64.urlsafe_b64encode(nonce + blob).decode()
        self.assertEqual(valor, VETOR_INTEROP)
        with patch.dict(os.environ, {"GERENCIGEO_SECRET_KEY": "chave-de-teste-interop"}):
            self.assertEqual(decrypt_sensitive_data(valor), "Senha#Gov2026")

    def test_sem_biblioteca_cai_no_legado_com_aviso(self):
        with patch.object(cs, "_aesgcm", return_value=None):
            with self.assertLogs(cs.logger, level="WARNING"):
                cifrado = encrypt_sensitive_data("emergencia")
            self.assertTrue(cifrado.startswith(LEGACY_PREFIX))
            self.assertEqual(decrypt_sensitive_data(cifrado), "emergencia")


class TestMigracaoSenhasGov(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)

    def _limpar(self):
        with DatabaseManager() as conn:
            cur = conn.cursor()
            m = ",".join("?" * len(CPF_MIG))
            cur.execute(f"SELECT id FROM pessoas WHERE cpf_cnpj IN ({m})", CPF_MIG)
            p_ids = [r[0] for r in cur.fetchall()]
            if p_ids:
                pm = ",".join("?" * len(p_ids))
                cur.execute(f"DELETE FROM clientes WHERE pessoa_id IN ({pm})", p_ids)
                cur.execute(f"DELETE FROM pessoas WHERE id IN ({pm})", p_ids)
            conn.commit()

    def setUp(self):
        self._limpar()

    def tearDown(self):
        self._limpar()

    def _cliente_com_senha(self, cpf, senha_bruta):
        with DatabaseManager() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES (?, ?)", (f"Mig {cpf}", cpf))
            pid = cur.lastrowid
            cur.execute("INSERT INTO clientes (pessoa_id, senha_gov) VALUES (?, ?)", (pid, senha_bruta))
            cid = cur.lastrowid
            conn.commit()
        return cid

    def _senha(self, cid):
        return execute_query("SELECT senha_gov FROM clientes WHERE id = ?", params=(cid,), fetch_one=True)["senha_gov"]

    def _migrar(self):
        with DatabaseManager() as conn:
            migrar_retrocompatibilidade_documentos_e_senhas(conn)

    def test_texto_puro_e_legado_viram_aes_gcm_e_continuam_legiveis(self):
        chave = cs._get_or_create_master_key()
        puro = self._cliente_com_senha(CPF_MIG[0], "senha-pura")
        legado = self._cliente_com_senha(CPF_MIG[1], cs._encrypt_legacy("senha-legada", chave))
        atual = self._cliente_com_senha(CPF_MIG[2], encrypt_sensitive_data("senha-atual"))
        antes_atual = self._senha(atual)

        self._migrar()

        for cid, esperado in ((puro, "senha-pura"), (legado, "senha-legada"), (atual, "senha-atual")):
            self.assertTrue(self._senha(cid).startswith(CIPHER_PREFIX), cid)
            self.assertEqual(decrypt_sensitive_data(self._senha(cid)), esperado)
        self.assertEqual(self._senha(atual), antes_atual)  # já no formato novo: intocado

        depois = self._senha(legado)
        self._migrar()  # idempotente
        self.assertEqual(self._senha(legado), depois)

    def test_legado_ilegivel_com_a_chave_atual_nao_e_destruido(self):
        outra = hashlib.sha256(b"chave-de-outro-pc").digest()
        ilegivel = cs._encrypt_legacy("segredo-do-outro-pc", outra)
        cid = self._cliente_com_senha(CPF_MIG[3], ilegivel)
        with self.assertLogs(cs.logger, level="ERROR"):
            self._migrar()
        self.assertEqual(self._senha(cid), ilegivel)

    def test_sem_biblioteca_legado_fica_como_esta(self):
        legado = cs._encrypt_legacy("senha-legada", cs._get_or_create_master_key())
        cid = self._cliente_com_senha(CPF_MIG[0], legado)
        with patch.object(cs, "_aesgcm", return_value=None):
            self._migrar()
        self.assertEqual(self._senha(cid), legado)


# Valor gerado uma vez pelo teste de interoperabilidade; o PHP deve reproduzi-lo bit a bit.
VETOR_INTEROP = 'ENC:G4G3:AAECAwQFBgcICQoLeAkG74eWx1hiQvHNydJcW_SJrbHhqYduypVUNdw='

if __name__ == "__main__":
    unittest.main()
