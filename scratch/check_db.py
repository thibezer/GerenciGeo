import sqlite3
import os

db_path = "gerencigeo.db"
output_path = "scratch/db_info.txt"

with open(output_path, "w") as f:
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        f.write(f"Tables: {tables}\n")
        
        cursor.execute("PRAGMA table_info(clientes);")
        columns = cursor.fetchall()
        f.write(f"Columns in 'clientes': {columns}\n")
        conn.close()
    else:
        f.write("Database not found\n")
