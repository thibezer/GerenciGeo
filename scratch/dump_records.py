import sqlite3

def dump_db(filename):
    print(f"\n==================== {filename} ====================")
    conn = sqlite3.connect(filename)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    for tbl in ['profissionais', 'propriedades', 'clientes', 'pessoas', 'propriedade_clientes', 'matriculas', 'levantamentos', 'pontos', 'confrontantes']:
        try:
            cursor.execute(f"SELECT * FROM {tbl}")
            rows = cursor.fetchall()
            print(f"\n--- {tbl} ({len(rows)} registros) ---")
            for r in rows:
                print(dict(r))
        except Exception as e:
            print(f"\n--- {tbl}: erro {e} ---")
    conn.close()

dump_db('gerencigeo.db.backup')
dump_db('gerencigeo.db')
