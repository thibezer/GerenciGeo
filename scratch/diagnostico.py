import os
db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gerencigeo.db")
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("=== Pontos do levantamento 15 ===")
cursor.execute("SELECT id, matricula_id, nome_vertice, tipo_ponto, ordem_caminhamento, arquivo_origem, origem_homologada FROM pontos WHERE levantamento_id = 15")
for r in cursor.fetchall():
    print(dict(r))

conn.close()
