#!/usr/bin/env python3
"""
scripts/recalcular_utm_corrigido.py — Regrava e_corrigido/n_corrigido a partir da posição verdadeira.

Contexto: várias rotinas de correção (vínculo tardio de base, troca de base do rover, edição de
coordenadas no painel, sincronização com o CAD) gravavam lat/lon_corrigido sem atualizar o cache UTM,
e a inicialização do banco copiava o UTM bruto para e/n_corrigido. O offset da Mesa de Trabalho usava
esse cache e gerava vértices virtuais deslocados nos pontos afetados. A regra agora está em
services/processamento/utm_corrigido.py; este script corrige o que já está gravado.

Sem --aplicar, só simula (roda numa transação desfeita no fim) e mostra o que mudaria.
Com --aplicar, copia o banco para <nome>.bak_utm_<data>.db antes de gravar.

Uso:
    python scripts/recalcular_utm_corrigido.py [caminho_db] [--aplicar]
"""

import os
import sqlite3
import sys
from collections import Counter
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

from services.processamento.utm_corrigido import sincronizar_utm_corrigido  # noqa: E402

DB_PADRAO = os.path.join(BASE_DIR, "gerencigeo.db")


def fazer_backup(caminho_db: str) -> str:
    raiz, ext = os.path.splitext(caminho_db)
    destino = f"{raiz}.bak_utm_{datetime.now():%Y%m%d_%H%M%S}{ext or '.db'}"
    origem = sqlite3.connect(caminho_db)
    copia = sqlite3.connect(destino)
    with copia:
        origem.backup(copia)
    copia.close()
    origem.close()
    return destino


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    aplicar = "--aplicar" in sys.argv
    caminho_db = os.path.abspath(args[0] if args else DB_PADRAO)
    if not os.path.exists(caminho_db):
        sys.exit(f"Banco não encontrado: {caminho_db}")

    if aplicar:
        print(f"Backup: {fazer_backup(caminho_db)}")

    con = sqlite3.connect(caminho_db, timeout=30.0)
    con.row_factory = sqlite3.Row
    antes = {
        r["id"]: (r["levantamento_id"], r["e_corrigido"], r["n_corrigido"])
        for r in con.execute("SELECT id, levantamento_id, e_corrigido, n_corrigido FROM pontos")
    }

    cursor = con.cursor()
    alterados = sincronizar_utm_corrigido(cursor)

    por_lev = Counter()
    maior_desvio = {}
    for r in con.execute("SELECT id, e_corrigido, n_corrigido FROM pontos"):
        lev, e0, n0 = antes[r["id"]]
        if (e0, n0) == (r["e_corrigido"], r["n_corrigido"]):
            continue
        por_lev[lev] += 1
        if e0 is not None and n0 is not None:
            d = ((r["e_corrigido"] - e0) ** 2 + (r["n_corrigido"] - n0) ** 2) ** 0.5
            maior_desvio[lev] = max(maior_desvio.get(lev, 0.0), d)

    if aplicar:
        con.commit()
    else:
        con.rollback()
    con.close()

    print(f"{'Gravados' if aplicar else 'Seriam gravados'}: {alterados} pontos")
    if por_lev:
        print("levantamento_id | pontos | maior desvio do cache antigo (m; '-' = cache vazio)")
        for lev in sorted(por_lev, key=lambda x: (x is None, x)):
            desvio = f"{maior_desvio[lev]:.3f}" if lev in maior_desvio else "-"
            print(f"{lev} | {por_lev[lev]} | {desvio}")
    if not aplicar and alterados:
        print("\nNada foi gravado. Rode com --aplicar para gravar (um backup é feito antes).")


if __name__ == "__main__":
    main()
