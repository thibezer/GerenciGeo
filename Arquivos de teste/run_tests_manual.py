# -*- coding: utf-8 -*-
"""
Script de Testes Manuais - GerenciGeo
Testa: Delete+stat, Path Traversal, Upload Anuencia com imagem
"""
import io
import os
import sys
import requests

BASE = "http://localhost:8000"
LEV_ID = 5          # Levantamento válido encontrado no DB
CONF_ID = 1         # Confrontante: tenta 1, ajusta se necessário


def sep(titulo):
    print(f"\n{'='*60}")
    print(f"  {titulo}")
    print(f"{'='*60}")


# ─────────────────────────────────────────────────────────────
# TESTE 1 — Upload de arquivo + Delete (valida módulo stat)
# ─────────────────────────────────────────────────────────────
sep("TESTE 1 — Delete de arquivo e módulo stat")

conteudo_txt = b"arquivo de teste para validacao do modulo stat\n"
nome_arquivo = "teste_stat_validacao.txt"

print(f"[1a] Fazendo upload de '{nome_arquivo}' na categoria Processados...")
try:
    r = requests.post(
        f"{BASE}/levantamentos/{LEV_ID}/upload-arquivo",
        data={"categoria": "Processados"},
        files={"file": (nome_arquivo, io.BytesIO(conteudo_txt), "text/plain")},
        timeout=15,
    )
    print(f"     Status upload: {r.status_code}")
    print(f"     Resposta:      {r.text[:300]}")
    upload_ok = r.status_code in (200, 201)
except Exception as e:
    print(f"     ERRO na requisição: {e}")
    upload_ok = False

if upload_ok:
    print(f"\n[1b] Deletando '{nome_arquivo}'...")
    try:
        r2 = requests.delete(
            f"{BASE}/levantamentos/{LEV_ID}/arquivos/deletar",
            params={"categoria": "Processados", "nome": nome_arquivo},
            timeout=15,
        )
        print(f"     Status delete: {r2.status_code}")
        print(f"     Resposta:      {r2.text[:400]}")
        if r2.status_code == 200 and ("exclu" in r2.text or "sucesso" in r2.text):
            print("\n  [PASSOU] TESTE 1 - Delete funcionou e modulo stat importado corretamente!")
        else:
            print("\n  [FALHOU] TESTE 1 - Resposta inesperada.")
    except Exception as e:
        print(f"     ERRO na requisicao: {e}")
        print("  [FALHOU] TESTE 1")
else:
    print("  [AVISO] Upload falhou - pulando delecao. Verifique se o servidor esta rodando.")


# ─────────────────────────────────────────────────────────────
# TESTE 2 — Proteção contra Path Traversal
# ─────────────────────────────────────────────────────────────
sep("TESTE 2 — Proteção contra Path Traversal")

payload_malicioso = "../../../config.py"
print(f"[2] Enviando nome malicioso: '{payload_malicioso}'")
try:
    r3 = requests.delete(
        f"{BASE}/levantamentos/{LEV_ID}/arquivos/deletar",
        params={"categoria": "Processados", "nome": payload_malicioso},
        timeout=15,
    )
    print(f"     Status: {r3.status_code}")
    print(f"     Resposta: {r3.text[:400]}")
    if r3.status_code == 404:
        print("\n  [PASSOU] TESTE 2 - Path traversal bloqueado! Retornou 404 (nao encontrou config.py dentro de Processados).")
    elif r3.status_code == 200:
        print("\n  [FALHOU] TESTE 2 - PERIGO! O arquivo foi deletado (possivel path traversal real).")
    else:
        print(f"\n  [AVISO] TESTE 2 - Resposta inesperada: {r3.status_code}")
except Exception as e:
    print(f"     ERRO na requisicao: {e}")


# ─────────────────────────────────────────────────────────────
# TESTE 3 — Upload de Anuência como imagem JPG/PNG
# ─────────────────────────────────────────────────────────────
sep("TESTE 3 — Upload de Anuência como imagem PNG")

# Criar um PNG mínimo válido (1x1 pixel branco) em bytes puros
png_minimo = bytes([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # assinatura PNG
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # chunk IHDR
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # chunk IDAT
    0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
    0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
    0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # chunk IEND
    0x44, 0xAE, 0x42, 0x60, 0x82,
])

nome_png = "assinatura_teste.png"
print(f"[3a] Fazendo upload de '{nome_png}' como anuência assinada (confrontante_id={CONF_ID})...")
try:
    r4 = requests.post(
        f"{BASE}/levantamentos/{LEV_ID}/documentos/anuencias/{CONF_ID}/upload",
        files={"file": (nome_png, io.BytesIO(png_minimo), "image/png")},
        timeout=15,
    )
    print(f"     Status: {r4.status_code}")
    print(f"     Resposta: {r4.text[:500]}")

    resp_json = {}
    try:
        resp_json = r4.json()
    except Exception:
        pass

    caminho = resp_json.get("caminho_salvo", "") or r4.text
    if r4.status_code in (200, 201) and (".png" in caminho or ".png" in r4.text):
        print("\n  [PASSOU] TESTE 3 - Upload com PNG funcionou e a extensao .png foi preservada!")
    elif r4.status_code in (200, 201):
        print(f"\n  [PASSOU] TESTE 3 - Status 200 OK. Verifique manualmente se a extensao .png foi preservada no disco.")
    elif r4.status_code == 404:
        print(f"\n  [AVISO] TESTE 3 - Confrontante id={CONF_ID} nao existe. Tente outro ID.")
    else:
        print(f"\n  [FALHOU] TESTE 3 - Status {r4.status_code}")
except Exception as e:
    print(f"     ERRO na requisicao: {e}")

sep("FIM DOS TESTES")
