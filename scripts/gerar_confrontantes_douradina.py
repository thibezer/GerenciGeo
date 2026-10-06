"""Gera confrontantes_douradina.html (página standalone editável) a partir do banco.

Uso: python scripts/gerar_confrontantes_douradina.py
Atenção: regerar sobrescreve o HTML; edições feitas no navegador ficam no localStorage
(ou exportadas em JSON), não dentro do arquivo.
"""
import json
import os
import sqlite3

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVANTAMENTO_ID, MATRICULA_ID = 17, 17  # Fazenda Douradina
DE, ATE = "XRXR-P-0093", "XRXR-P-0170"

con = sqlite3.connect(f"file:{os.path.join(RAIZ, 'gerencigeo.db')}?mode=ro", uri=True)
con.row_factory = sqlite3.Row
rows = con.execute(
    """SELECT codigo_completo AS codigo, lat, lon, tipo_limite,
              confrontante_descritivo AS confrontante, matricula_confrontante AS matricula,
              cns_confrontante AS cns
       FROM banco_pontos
       WHERE levantamento_id = ? AND matricula_id = ? AND codigo_completo BETWEEN ? AND ?
       ORDER BY codigo_completo""",
    (LEVANTAMENTO_ID, MATRICULA_ID, DE, ATE),
).fetchall()
dados = [{k: (r[k] if r[k] is not None else "") for k in r.keys()} for r in rows]
assert len(dados) == 78, f"esperava 78 pontos, vieram {len(dados)}"

with open(os.path.join(RAIZ, "scripts", "confrontantes_douradina.tpl.html"), encoding="utf-8") as f:
    html = f.read().replace("/*DADOS*/", json.dumps(dados, ensure_ascii=False))
with open(os.path.join(RAIZ, "confrontantes_douradina.html"), "w", encoding="utf-8") as f:
    f.write(html)
print(f"OK: {len(dados)} pontos")
