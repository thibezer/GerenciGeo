import sqlite3

def check_db(path):
    print(f"\n--- Inspecionando Banco: {path} ---")
    try:
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Tabelas
        tables = ["levantamentos", "pontos", "propriedades", "profissionais", "confrontantes", "segmentos"]
        for t in tables:
            try:
                cursor.execute(f"SELECT count(*) as count FROM {t}")
                row = cursor.fetchone()
                print(f"  Tabela '{t}': {row['count']} registros")
            except Exception as e:
                print(f"  Tabela '{t}': erro ao ler ({e})")
        
        # Verificar o DDL de levantamentos
        try:
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='levantamentos'")
            row = cursor.fetchone()
            print("  DDL 'levantamentos':")
            print(f"    {row['sql'] if row else 'Não encontrada'}")
        except Exception as e:
            print(f"  Erro ao ler DDL de levantamentos: {e}")
            
        conn.close()
    except Exception as e:
        print(f"Erro ao abrir {path}: {e}")

if __name__ == "__main__":
    check_db("gerencigeo.db")
    check_db("gerencigeo.db.backup")
