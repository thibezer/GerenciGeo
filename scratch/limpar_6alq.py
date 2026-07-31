import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database.connection import execute_query

# Contar registros
bp = execute_query("SELECT COUNT(*) as c FROM banco_pontos WHERE planilha_origem LIKE '%6 ALQ%'", fetch_one=True)
print(f"banco_pontos com '6 ALQ': {dict(bp)['c']}")

pts = execute_query("SELECT COUNT(*) as c FROM pontos WHERE arquivo_origem LIKE '%6 ALQ%'", fetch_one=True)
print(f"pontos com '6 ALQ': {dict(pts)['c']}")

# Deletar tudo
execute_query("DELETE FROM banco_pontos WHERE planilha_origem LIKE '%6 ALQ%'", commit=True)
print(">> Deletados de banco_pontos")

execute_query("DELETE FROM pontos WHERE arquivo_origem LIKE '%6 ALQ%'", commit=True)
print(">> Deletados de pontos")

# Confirmar
bp2 = execute_query("SELECT COUNT(*) as c FROM banco_pontos WHERE planilha_origem LIKE '%6 ALQ%'", fetch_one=True)
pts2 = execute_query("SELECT COUNT(*) as c FROM pontos WHERE arquivo_origem LIKE '%6 ALQ%'", fetch_one=True)
print(f"\nApós limpeza:")
print(f"  banco_pontos: {dict(bp2)['c']}")
print(f"  pontos: {dict(pts2)['c']}")
print("\nPronto! Pode reimportar a planilha.")
