"""
services/seguranca/crypto_service.py — Criptografia e Proteção de Dados Sensíveis em Repouso.
Garante que credenciais como 'senha_gov' nunca fiquem em texto claro no banco de dados SQLite.

Formatos de ciphertext (o prefixo identifica o formato):
  ENC:G4G3:  atual — AES-256-GCM (biblioteca `cryptography`), nonce de 12 bytes, tag de 16 bytes.
             Payload = urlsafe_b64(nonce || ciphertext || tag). Mesmo layout implementado em frontend/public/api.php.
  ENC:G4G2:  legado — CTR sobre HMAC-SHA256 + MAC (esquema próprio). Só é lido; nunca mais gravado,
             exceto se a biblioteca `cryptography` não estiver instalada (cai no legado com aviso).
  (sem prefixo) texto puro de bases muito antigas; lido como está e cifrado pela migração.
"""

import os
import hmac
import hashlib
import base64
import secrets
import logging
from config import BASE_DIR

logger = logging.getLogger(__name__)

# Prefixo do formato atual (AES-256-GCM)
CIPHER_PREFIX = "ENC:G4G3:"
# Prefixo do formato legado (CTR + HMAC próprio): continua legível para dados já gravados
LEGACY_PREFIX = "ENC:G4G2:"
_PREFIXOS_CONHECIDOS = (CIPHER_PREFIX, LEGACY_PREFIX)

# Dado autenticado junto ao ciphertext: impede reaproveitar um blob de outro contexto
_AAD = b"gerencigeo:senha_gov"
_NONCE_BYTES = 12
_TAG_BYTES = 16


# Arquivo de texto (ignorado pelo git) com a chave compartilhada PC <-> nuvem. Gravado por
# scripts/trocar_chave_senha_gov.py; dispensa configurar variável de ambiente no Windows.
ARQUIVO_CHAVE_COMPARTILHADA = "app_secrets.shared"


def _chave_compartilhada() -> str | None:
    """Chave de texto definida pelo usuário: GERENCIGEO_SECRET_KEY, ou o conteúdo de app_secrets.shared."""
    env_key = os.environ.get("GERENCIGEO_SECRET_KEY")
    if env_key:
        return env_key
    try:
        with open(os.path.join(BASE_DIR, ARQUIVO_CHAVE_COMPARTILHADA), encoding="utf-8") as f:
            texto = f.read().strip()
        return texto or None
    except FileNotFoundError:
        return None
    except Exception as e:
        logger.warning(f"Aviso ao ler {ARQUIVO_CHAVE_COMPARTILHADA}: {e}")
        return None


def _get_or_create_master_key() -> bytes:
    """
    Obtém a chave mestra: chave compartilhada (variável de ambiente ou app_secrets.shared) ou, na falta dela,
    o arquivo de segredo local aleatório app_secrets.key. Para PC e nuvem lerem as senhas um do outro, a chave
    compartilhada precisa ser a mesma nos dois.
    """
    env_key = _chave_compartilhada()
    if env_key:
        return hashlib.sha256(env_key.encode('utf-8')).digest()

    key_file = os.path.join(BASE_DIR, "app_secrets.key")
    if os.path.exists(key_file):
        try:
            with open(key_file, "rb") as f:
                key_bytes = f.read().strip()
                if len(key_bytes) >= 32:
                    return hashlib.sha256(key_bytes).digest()
        except Exception as e:
            logger.warning(f"Aviso ao ler chave mestra local: {e}")

    # Gera nova chave randômica de 256 bits criptograficamente segura
    new_key = secrets.token_bytes(32)
    try:
        with open(key_file, "wb") as f:
            f.write(new_key)
        try:
            os.chmod(key_file, 0o600)
        except Exception:
            pass
    except Exception as e:
        logger.warning(f"Aviso ao salvar app_secrets.key: {e}")

    return hashlib.sha256(new_key).digest()


def _aesgcm():
    """AESGCM da biblioteca `cryptography`, ou None se ela não estiver instalada."""
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        return AESGCM
    except ImportError:
        return None


def aesgcm_disponivel() -> bool:
    return _aesgcm() is not None


def esta_cifrado(valor: str | None) -> bool:
    """True se o valor já carrega o prefixo de qualquer formato conhecido (atual ou legado)."""
    return bool(valor) and str(valor).startswith(_PREFIXOS_CONHECIDOS)


def precisa_recifrar(valor: str | None) -> bool:
    """True para texto puro e para o formato legado: candidatos à migração para AES-GCM."""
    if not valor:
        return False
    return not str(valor).startswith(CIPHER_PREFIX)


# ── Formato legado (somente leitura, mais a escrita de emergência sem `cryptography`) ─────────────

def _derive_keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    """Fluxo de chave do formato legado: HMAC-SHA256 em modo contador."""
    keystream = bytearray()
    counter = 0
    while len(keystream) < length:
        block = hmac.new(key, nonce + counter.to_bytes(4, byteorder='big'), hashlib.sha256).digest()
        keystream.extend(block)
        counter += 1
    return bytes(keystream[:length])


def _encrypt_legacy(plaintext: str, master_key: bytes) -> str:
    nonce = secrets.token_bytes(16)
    data_bytes = plaintext.encode('utf-8')
    keystream = _derive_keystream(master_key, nonce, len(data_bytes))
    ciphertext = bytes(a ^ b for a, b in zip(data_bytes, keystream))
    mac = hmac.new(master_key, nonce + ciphertext, hashlib.sha256).digest()
    return f"{LEGACY_PREFIX}{base64.urlsafe_b64encode(nonce + ciphertext + mac).decode('utf-8')}"


def _decrypt_legacy(ciphertext_str: str, master_key: bytes) -> str:
    payload = base64.urlsafe_b64decode(ciphertext_str[len(LEGACY_PREFIX):])
    if len(payload) < 48:  # 16 (nonce) + 0 (min cipher) + 32 (mac)
        raise ValueError("Payload de criptografia corrompido.")
    nonce, mac, cipher = payload[:16], payload[-32:], payload[16:-32]
    expected_mac = hmac.new(master_key, nonce + cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(mac, expected_mac):
        raise ValueError("Falha de autenticação do dado criptografado (HMAC inválido).")
    keystream = _derive_keystream(master_key, nonce, len(cipher))
    return bytes(a ^ b for a, b in zip(cipher, keystream)).decode('utf-8')


# ── API pública ───────────────────────────────────────────────────────────────────────────────────

def encrypt_sensitive_data(plaintext: str | None) -> str | None:
    """
    Criptografa um dado sensível com AES-256-GCM (ciphertext autenticado).
    Valor nulo/vazio ou já cifrado (em qualquer formato conhecido) volta como está.
    """
    if plaintext is None or plaintext == "":
        return plaintext

    plaintext_str = str(plaintext)
    if esta_cifrado(plaintext_str):
        return plaintext_str

    try:
        master_key = _get_or_create_master_key()
        aesgcm_cls = _aesgcm()
        if aesgcm_cls is None:
            logger.warning(
                "Biblioteca 'cryptography' ausente: gravando no formato legado ENC:G4G2. "
                "Instale-a (pip install cryptography) para usar AES-GCM; a migração converte depois."
            )
            return _encrypt_legacy(plaintext_str, master_key)

        nonce = secrets.token_bytes(_NONCE_BYTES)
        # A biblioteca devolve ciphertext || tag
        blob = aesgcm_cls(master_key).encrypt(nonce, plaintext_str.encode('utf-8'), _AAD)
        return f"{CIPHER_PREFIX}{base64.urlsafe_b64encode(nonce + blob).decode('utf-8')}"
    except Exception as e:
        logger.error(f"Erro ao criptografar dado sensível: {e}")
        raise ValueError("Falha na criptografia de dados sensíveis.")


def decrypt_sensitive_data(ciphertext: str | None) -> str | None:
    """
    Descriptografa um ciphertext autenticado (AES-GCM ou legado).
    Sem prefixo, assume texto puro legado. Em caso de falha (chave errada, dado adulterado) devolve None.
    """
    if ciphertext is None or ciphertext == "":
        return ciphertext

    ciphertext_str = str(ciphertext)
    if not esta_cifrado(ciphertext_str):
        # Compatibilidade com dados legados ainda não cifrados
        return ciphertext_str

    try:
        master_key = _get_or_create_master_key()
        if ciphertext_str.startswith(LEGACY_PREFIX):
            return _decrypt_legacy(ciphertext_str, master_key)

        aesgcm_cls = _aesgcm()
        if aesgcm_cls is None:
            raise RuntimeError("Biblioteca 'cryptography' ausente: não é possível ler ENC:G4G3.")
        payload = base64.urlsafe_b64decode(ciphertext_str[len(CIPHER_PREFIX):])
        if len(payload) < _NONCE_BYTES + _TAG_BYTES:
            raise ValueError("Payload de criptografia corrompido.")
        nonce, blob = payload[:_NONCE_BYTES], payload[_NONCE_BYTES:]
        return aesgcm_cls(master_key).decrypt(nonce, blob, _AAD).decode('utf-8')
    except Exception as e:
        logger.error(f"Erro ao descriptografar dado sensível: {e}")
        return None
