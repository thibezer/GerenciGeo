"""
Script de Migração de Caminhos do Banco de Dados GerenciGeo.
Atualiza com segurança todos os caminhos absolutos armazenados nas tabelas
de 'D:\\Desenvolvimento\\Geo' (e legados OneDrive) para 'D:\\Programação\\Geo'.
"""

import os
import shutil
import sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gerencigeo.db")
NOVO_DESTINO = r"D:\Programação\Geo"

PADROES_ANTIGOS = [
    r"D:\Desenvolvimento\Geo",
    r"D:/Desenvolvimento/Geo",
    r"D:\OneDrive_Thiago\OneDrive\Desenvolvimento\Geo",
    r"D:/OneDrive_Thiago/OneDrive/Desenvolvimento/Geo",
]

def migrar_caminhos():
    if not os.path.exists(DB_PATH):
        print(f"[ERRO] Banco de dados não encontrado em: {DB_PATH}")
        return False

    # 1. Backup de Segurança Atômico
    data_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{DB_PATH}.backup_pre_migracao_{data_str}"
    shutil.copy2(DB_PATH, backup_path)
    print(f"[OK] Backup de segurança criado em:\n     {backup_path}\n")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    total_modificados = 0

    print("--- Iniciando Atualização de Caminhos no Banco de Dados ---")
    for tabela in tables:
        colunas_info = cursor.execute(f'PRAGMA table_info("{tabela}")').fetchall()
        for col_info in colunas_info:
            col_nome = col_info[1]
            for padrao in PADROES_ANTIGOS:
                try:
                    # Verifica quantos registros possuem o padrão antigo
                    query_check = f'SELECT count(*) FROM "{tabela}" WHERE "{col_nome}" LIKE ?'
                    count = cursor.execute(query_check, (f"%{padrao}%",)).fetchone()[0]

                    if count > 0:
                        # Executa a substituição
                        query_update = f'''
                            UPDATE "{tabela}"
                            SET "{col_nome}" = replace("{col_nome}", ?, ?)
                            WHERE "{col_nome}" LIKE ?
                        '''
                        cursor.execute(query_update, (padrao, NOVO_DESTINO, f"%{padrao}%"))
                        print(f"  [ATUALIZADO] {tabela}.{col_nome}: {count} registro(s) ('{padrao}' -> '{NOVO_DESTINO}')")
                        total_modificados += count
                except Exception as e:
                    # Ignora erros de colunas não compatíveis
                    pass

    conn.commit()
    conn.close()

    print(f"\n[SUCESSO] Migração concluída! Total de alterações aplicadas: {total_modificados}")
    return True

if __name__ == "__main__":
    migrar_caminhos()
