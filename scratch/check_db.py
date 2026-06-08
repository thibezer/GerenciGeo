import sqlite3
import json

try:
    conn = sqlite3.connect('gerencigeo.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("=== LEVANTAMENTOS ===")
    cursor.execute("SELECT * FROM levantamentos")
    for r in cursor.fetchall():
        print(dict(r))
        
    print("=== PROPRIEDADES ===")
    cursor.execute("SELECT * FROM propriedades")
    for r in cursor.fetchall():
        print(dict(r))

except Exception as e:
    print("ERRO:", e)
