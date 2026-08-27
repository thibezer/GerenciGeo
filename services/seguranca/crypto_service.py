"""
services/seguranca/crypto_service.py — Criptografia e Proteção de Dados Sensíveis em Repouso.
Garante que credenciais como 'senha_gov' nunca fiquem em texto claro no banco de dados SQLite.
"""

import os
import hmac
import hashlib
import base64
import secrets
import logging
from config import BASE_DIR

logger = logging.getLogger(__name__)

# Prefixo padrão para identificar ciphertexts gerenciados por este módulo
CIPHER_PREFIX = "ENC:G4G2:"

def _get_or_create_master_key() -> bytes:
    """
    Obtém a chave mestra a partir de variável de ambiente ou de arquivo de segredo local seguro.
    """
    env_key = os.environ.get("GERENCIGEO_SECRET_KEY")
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


def _derive_keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    """Deriva um fluxo de chave seguro baseado em HKDF-HMAC-SHA256 (CTR stream)."""
    keystream = bytearray()
    counter = 0
    while len(keystream) < length:
        block = hmac.new(key, nonce + counter.to_bytes(4, byteorder='big'), hashlib.sha256).digest()
        keystream.extend(block)
        counter += 1
    return bytes(keystream[:length])


def encrypt_sensitive_data(plaintext: str | None) -> str | None:
    """
    Criptografa um dado sensível gerando um ciphertext autenticado (Nonce + Ciphertext + MAC).
    Se o valor já estiver criptografado ou for nulo/vazio, retorna o próprio valor sanitizado.
    """
    if plaintext is None or plaintext == "":
        return plaintext
    
    plaintext_str = str(plaintext)
    if plaintext_str.startswith(CIPHER_PREFIX):
        return plaintext_str
    
    try:
        master_key = _get_or_create_master_key()
        nonce = secrets.token_bytes(16)
        data_bytes = plaintext_str.encode('utf-8')
        
        # Cifra CTR com derivação segura
        keystream = _derive_keystream(master_key, nonce, len(data_bytes))
        ciphertext = bytes(a ^ b for a, b in zip(data_bytes, keystream))
        
        # MAC de autenticidade (HMAC-SHA256)
        mac = hmac.new(master_key, nonce + ciphertext, hashlib.sha256).digest()
        
        payload = nonce + ciphertext + mac
        encoded = base64.urlsafe_b64encode(payload).decode('utf-8')
        return f"{CIPHER_PREFIX}{encoded}"
    except Exception as e:
        logger.error(f"Erro ao criptografar dado sensível: {e}")
        raise ValueError("Falha na criptografia de dados sensíveis.")


def decrypt_sensitive_data(ciphertext: str | None) -> str | None:
    """
    Descriptografa um ciphertext autenticado.
    Se o valor não possuir o prefixo de cifra, assume formato legado em texto puro.
    """
    if ciphertext is None or ciphertext == "":
        return ciphertext
    
    ciphertext_str = str(ciphertext)
    if not ciphertext_str.startswith(CIPHER_PREFIX):
        # Compatibilidade com dados legados ainda não cifrados
        return ciphertext_str
    
    try:
        raw_b64 = ciphertext_str[len(CIPHER_PREFIX):]
        payload = base64.urlsafe_b64decode(raw_b64)
        
        if len(payload) < 48: # 16 (nonce) + 0 (min cipher) + 32 (mac)
            raise ValueError("Payload de criptografia corrompido.")
            
        nonce = payload[:16]
        mac = payload[-32:]
        cipher = payload[16:-32]
        
        master_key = _get_or_create_master_key()
        
        # Validação do MAC
        expected_mac = hmac.new(master_key, nonce + cipher, hashlib.sha256).digest()
        if not hmac.compare_digest(mac, expected_mac):
            raise ValueError("Falha de autenticação do dado criptografado (HMAC inválido).")
            
        keystream = _derive_keystream(master_key, nonce, len(cipher))
        plaintext_bytes = bytes(a ^ b for a, b in zip(cipher, keystream))
        return plaintext_bytes.decode('utf-8')
    except Exception as e:
        logger.error(f"Erro ao descriptografar dado sensível: {e}")
        return None
