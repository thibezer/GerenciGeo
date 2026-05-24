import sqlite3

db_path = "gerencigeo.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

with open("scratch/db_schema_output.txt", "w", encoding="utf-8") as f:
    f.write("--- TABLES ---\n")
    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table';")
    for row in cursor.fetchall():
        f.write(f"Table: {row[0]}\n")
        f.write(f"SQL: {row[1]}\n\n")

    f.write("--- VIEWS ---\n")
    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='view';")
    for row in cursor.fetchall():
        f.write(f"View: {row[0]}\n")
        f.write(f"SQL: {row[1]}\n\n")

    f.write("--- TRIGGERS ---\n")
    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='trigger';")
    for row in cursor.fetchall():
        f.write(f"Trigger: {row[0]}\n")
        f.write(f"SQL: {row[1]}\n\n")

conn.close()
