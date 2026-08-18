import sqlite3
import os

for db in ['gerencigeo.db', 'gerencigeo.db.backup']:
    if not os.path.exists(db):
        print(f"File {db} not found.")
        continue
    print(f"=== {db} (Size: {os.path.getsize(db)} bytes) ===")
    conn = sqlite3.connect(db)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cursor.fetchall() if not r[0].startswith('sqlite_')]
    for t in tables:
        try:
            cursor.execute(f"SELECT count(*) FROM {t}")
            cnt = cursor.fetchone()[0]
            print(f"  {t}: {cnt}")
        except Exception as e:
            print(f"  {t}: err {e}")
    conn.close()
