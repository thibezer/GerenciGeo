import sqlite3
import os

db_path = "gerencigeo.db"

def limpar_dados():
    if not os.path.exists(db_path):
        print(f"[!] Banco de dados '{db_path}' nao encontrado.")
        return
        
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        print("[*] Iniciando contagem de pontos homologados...")
        
        # Contagem antes
        cursor.execute("SELECT COUNT(*) as count FROM banco_pontos")
        banco_pontos_count = cursor.fetchone()["count"]
        
        cursor.execute("SELECT COUNT(*) as count FROM pontos WHERE origem_homologada = 1")
        pontos_count = cursor.fetchone()["count"]
        
        cursor.execute("SELECT COUNT(*) as count FROM segmentos WHERE origem_homologada = 1")
        segmentos_count = cursor.fetchone()["count"]
        
        print(f"Registros encontrados para limpeza:")
        print(f" - Em banco_pontos: {banco_pontos_count}")
        print(f" - Em pontos (origem_homologada = 1): {pontos_count}")
        print(f" - Em segmentos (origem_homologada = 1): {segmentos_count}")
        
        # Executar deleção
        print("\n[*] Executando limpeza...")
        
        cursor.execute("DELETE FROM banco_pontos")
        deleted_banco = cursor.rowcount
        
        cursor.execute("DELETE FROM pontos WHERE origem_homologada = 1")
        deleted_pontos = cursor.rowcount
        
        cursor.execute("DELETE FROM segmentos WHERE origem_homologada = 1")
        deleted_segmentos = cursor.rowcount
        
        # Opcionalmente, recalcular os contadores dos profissionais
        # Vamos obter todos os profissionais afetados
        cursor.execute("SELECT id FROM profissionais")
        profissionais = [r["id"] for r in cursor.fetchall()]
        
        for prof_id in profissionais:
            for t in ['M', 'P', 'V']:
                col_name = f"contador_{t.lower()}"
                cursor.execute(f"UPDATE profissionais SET {col_name} = 0 WHERE id = ?", (prof_id,))
        
        conn.commit()
        
        print(f"\n[SUCESSO] Limpeza concluida com sucesso!")
        print(f" - Deletados de banco_pontos: {deleted_banco}")
        print(f" - Deletados de pontos: {deleted_pontos}")
        print(f" - Deletados de segmentos: {deleted_segmentos}")
        print(" - Contadores de profissionais resetados para 0.")
        
    except Exception as e:
        conn.rollback()
        print(f"\n[ERRO] Ocorreu um erro ao limpar os dados: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    limpar_dados()
