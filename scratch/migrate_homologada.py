import sqlite3

conn = sqlite3.connect('gerencigeo.db')
cursor = conn.cursor()

# Adicionar coluna origem_homologada se nao existir
try:
    cursor.execute('ALTER TABLE pontos ADD COLUMN origem_homologada INTEGER DEFAULT 0')
    print('Coluna origem_homologada adicionada com sucesso.')
except sqlite3.OperationalError as e:
    print(f'Coluna ja existe ou erro: {e}')

# Marcar pontos que vieram de .ods ou .txt como homologados
sql = """
UPDATE pontos SET origem_homologada = 1 
WHERE arquivo_origem IS NOT NULL 
AND (LOWER(arquivo_origem) LIKE '%.ods' OR LOWER(arquivo_origem) LIKE '%.txt')
"""
cursor.execute(sql)
print(f'Pontos marcados como homologados: {cursor.rowcount}')

conn.commit()
conn.close()
print('Migracao concluida.')
