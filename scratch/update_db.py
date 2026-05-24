import sqlite3
import os
import sys

# Ensure we use the correct path
BASE_DIR = r"d:\OneDrive_Thiago\OneDrive\Desenvolvimento\GerenciGeo"
sys.path.insert(0, BASE_DIR)

from database.models import create_tables

db_path = os.path.join(BASE_DIR, "gerencigeo.db")
print(f"Updating db: {db_path}")

try:
    conn = sqlite3.connect(db_path)
    create_tables(conn)
    conn.commit()
    print("Tables created successfully!")
    
    tables = [r[0] for r in conn.execute('SELECT name FROM sqlite_master WHERE type="table"')]
    print(f"Current tables: {tables}")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
