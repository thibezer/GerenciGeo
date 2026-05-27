import sqlite3
import json

db_path = "gerencigeo.db"

def inspect():
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("=== PROPRIEDADES ===")
    cursor.execute("SELECT id, nome_propriedade, municipio, uf FROM propriedades")
    for r in cursor.fetchall():
        print(dict(r))
        
    print("\n=== LEVANTAMENTOS ===")
    cursor.execute("""
        SELECT l.id, l.propriedade_id, p.nome_propriedade, l.profissional_id, l.status 
        FROM levantamentos l 
        JOIN propriedades p ON l.propriedade_id = p.id
    """)
    for r in cursor.fetchall():
        print(dict(r))
        
    print("\n=== MATRICULAS ===")
    cursor.execute("SELECT id, propriedade_id, numero_matricula, area_ha FROM matriculas")
    for r in cursor.fetchall():
        print(dict(r))
        
    print("\n=== PONTOS (Últimos 10) ===")
    cursor.execute("SELECT id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, status_ponto FROM pontos ORDER BY id DESC LIMIT 10")
    for r in cursor.fetchall():
        print(dict(r))
        
    conn.close()

if __name__ == "__main__":
    inspect()
