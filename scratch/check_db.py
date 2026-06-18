import sqlite3
conn = sqlite3.connect('gerencigeo.db')
rows = conn.execute("select codigo_imovel, percentual_detencao, titular from ccir_cadastros where percentual_detencao > 100 limit 5").fetchall()
print("Registros com detenção > 100% (erro do passado):", rows)

# Verifica acentuação
rows_accent = conn.execute("select titular, municipio from ccir_cadastros where titular like '%Ã%' or municipio like '%Ã%' limit 5").fetchall()
print("Registros com caractere 'Ã' corrompido:", rows_accent)

# Registros com acentuação corrigida
rows_good = conn.execute("select titular, municipio from ccir_cadastros where titular like '%Ç%' or titular like '%ÃO%' limit 5").fetchall()
print("Registros com acentuação correta:", rows_good)
