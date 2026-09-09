"""
Utilitário de Sincronização e Migração: SQLite Local -> MySQL Hostinger (Nuvem)
Executa em modo estritamente READ-ONLY na base local gerencigeo.db.
"""

import sqlite3
import json
import urllib.request
import urllib.error
import sys
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gerencigeo.db")
REMOTE_API_URL = "https://darkgray-duck-674813.hostingersite.com/api.php?__route=/sync/batch"

def fetch_table(conn, table_name):
    cursor = conn.cursor()
    try:
        cursor.execute(f"SELECT * FROM {table_name}")
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        print(f"  [Aviso] Tabela {table_name} não pôde ser lida: {e}")
        return []

def main():
    if not os.path.exists(DB_PATH):
        print(f"Erro: Banco local {DB_PATH} não encontrado.")
        sys.exit(1)

    print("=" * 60)
    print("GerenciGeo - Sincronização Local -> Nuvem Hostinger")
    print("=" * 60)
    print(f"Conectando à base local (apenas leitura): {DB_PATH}")

    # Abre em modo estritamente leitura (read-only) para máxima segurança
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)

    tables = [
        "pessoas", "clientes", "propriedades", "matriculas",
        "levantamentos", "pontos", "segmentos", "pendencias", "profissionais"
    ]

    payload = {}
    print("\nColetando registros locais:")
    for t in tables:
        rows = fetch_table(conn, t)
        payload[t] = rows
        print(f"  - {t}: {len(rows)} registros")

    conn.close()

    total_registros = sum(len(v) for v in payload.values())
    if total_registros == 0:
        print("\nNenhum registro encontrado para sincronizar.")
        return

    print(f"\nTotal acumulado: {total_registros} registros prontos para envio.")
    print(f"Transmitindo payload para {REMOTE_API_URL}...")

    req_data = json.dumps({"data": payload}, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        REMOTE_API_URL,
        data=req_data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            res_body = response.read().decode('utf-8')
            print(f"\n[Sucesso HTTP {response.status}] {res_body}")
            print("\nBase de dados sincronizada na nuvem com sucesso!")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8') if e.fp else str(e)
        print(f"\n[Erro HTTP {e.code}] {err_body}")
    except Exception as e:
        print(f"\n[Erro de Conexão]: {e}")

if __name__ == "__main__":
    main()
