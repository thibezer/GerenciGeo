import sqlite3

conn = sqlite3.connect('gerencigeo.db.backup')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

for tbl in ['profissionais', 'propriedades', 'clientes', 'propriedade_clientes', 'cliente_historico_logs', 'pendencias']:
    try:
        cursor.execute(f"SELECT * FROM {tbl}")
        rows = cursor.fetchall()
        print(f"\n=== BACKUP: {tbl} ({len(rows)} registros) ===")
        for r in rows:
            print(dict(r))
    except Exception as e:
        print(f"\n=== BACKUP: {tbl}: erro {e} ===")
conn.close()
