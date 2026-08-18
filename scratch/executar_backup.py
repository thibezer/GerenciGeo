import sqlite3
import shutil
import os
from datetime import datetime

def fazer_backup_seguro():
    origem = "gerencigeo.db"
    if not os.path.exists(origem):
        print(f"Erro: {origem} não encontrado.")
        return

    # Cria pasta backups se não existir
    os.makedirs("backups", exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest_timestamp = f"backups/gerencigeo_backup_{timestamp}.db"
    dest_oficial = "backups/gerencigeo_restaurado_oficial.db"
    dest_raiz = "gerencigeo.db.backup"

    # Usa a API oficial de backup do SQLite para cópia consistente e atômica com WAL
    src_conn = sqlite3.connect(origem)
    
    # 1. Verifica integridade do banco atual
    cur = src_conn.cursor()
    cur.execute("PRAGMA integrity_check")
    res = cur.fetchone()[0]
    print(f"Integridade do banco atual: {res}")
    if res != "ok":
        print("AVISO: Integridade reportou problemas:", res)

    # 2. Cópia atômica para os 3 destinos
    for dest in [dest_timestamp, dest_oficial, dest_raiz]:
        dst_conn = sqlite3.connect(dest)
        with dst_conn:
            src_conn.backup(dst_conn)
        dst_conn.close()
        print(f"Backup gravado com sucesso em: {dest} ({os.path.getsize(dest)} bytes)")

    src_conn.close()

if __name__ == '__main__':
    fazer_backup_seguro()
