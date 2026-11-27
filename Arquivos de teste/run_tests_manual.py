# -*- coding: utf-8 -*-
"""
Script de Testes Manuais - GerenciGeo
Testa: Upload Anuencia com imagem (os testes de delete/path traversal saíram junto com a rota removida)
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
# TESTE 1 — Upload de Anuência como imagem JPG/PNG
# ─────────────────────────────────────────────────────────────
sep("TESTE 1 — Upload de Anuência como imagem PNG")

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
print(f"[1a] Fazendo upload de '{nome_png}' como anuência assinada (confrontante_id={CONF_ID})...")
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
        print("\n  [PASSOU] TESTE 1 - Upload com PNG funcionou e a extensao .png foi preservada!")
    elif r4.status_code in (200, 201):
        print(f"\n  [PASSOU] TESTE 1 - Status 200 OK. Verifique manualmente se a extensao .png foi preservada no disco.")
    elif r4.status_code == 404:
        print(f"\n  [AVISO] TESTE 1 - Confrontante id={CONF_ID} nao existe. Tente outro ID.")
    else:
        print(f"\n  [FALHOU] TESTE 1 - Status {r4.status_code}")
except Exception as e:
    print(f"     ERRO na requisicao: {e}")

sep("FIM DOS TESTES")
