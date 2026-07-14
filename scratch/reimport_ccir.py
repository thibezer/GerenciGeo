import sqlite3
import sys
import os

# Ajusta o path do python para encontrar os módulos locais
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.repository import CcirCadastroRepo
from services.parsers.ccir_parser import sincronizar_pasta_ccir

print("Limpando banco de dados de CCIRs antigos...")
conn = sqlite3.connect('gerencigeo.db')
cursor = conn.cursor()
cursor.execute("DELETE FROM ccir_cadastros")
conn.commit()
conn.close()
print("Banco de dados limpo com sucesso!")

print("Forçando sincronização e re-importação das planilhas...")
logs = sincronizar_pasta_ccir()
print("Sincronização concluída! Logs:")
for log in logs:
    print(" -", log)
