import os
import re
import sqlite3
import logging
from datetime import datetime
from config import DB_PATH

logger = logging.getLogger(__name__)

_backup_realizado_sessao = False

def _executar_backup_automatico(db_path: str):
    """Cria backup atômico automático diário em backups/ se estiver usando o banco de produção."""
    global _backup_realizado_sessao
    if _backup_realizado_sessao:
        return
    
    # Executa apenas se for a base principal gerencigeo.db
    if not db_path or not os.path.basename(db_path) == "gerencigeo.db" or not os.path.exists(db_path):
        return
    
    try:
        os.makedirs("backups", exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest_timestamp = f"backups/gerencigeo_backup_{timestamp}.db"
        dest_raiz = "gerencigeo.db.backup"

        src_conn = sqlite3.connect(db_path)
        for dest in [dest_timestamp, dest_raiz]:
            dst_conn = sqlite3.connect(dest)
            with dst_conn:
                src_conn.backup(dst_conn)
            dst_conn.close()
        src_conn.close()
        _backup_realizado_sessao = True
        logger.info(f"[BACKUP AUTOMATICO] Backup de segurança gerado: {dest_timestamp}")
    except Exception as e:
        logger.warning(f"[BACKUP AUTOMATICO] Aviso ao gerar backup automático: {e}")

def _validar_seguranca_query(query: str, db_path: str):
    """Bloqueia instruções DELETE irrestritas sem WHERE em tabelas vitais no banco de produção."""
    if not db_path or os.path.basename(db_path) != "gerencigeo.db":
        return
    
    q_limpa = query.strip().upper()
    # Verifica se é DELETE FROM tabela sem WHERE
    padrao_delete_global = r"^DELETE\s+FROM\s+(CLIENTES|PESSOAS|PROPRIEDADES|LEVANTAMENTOS|PONTOS|PROFISSIONAIS)\s*(;|)$"
    if re.match(padrao_delete_global, q_limpa):
        msg = f"[SEGURANCA BANCO DE DADOS] Tentativa de DELETE global sem WHERE interceptada no banco de produção ({db_path}): {query}"
        logger.critical(msg)
        raise RuntimeError(msg)

class DatabaseManager:
    """Gerenciador de conexão SQLite com Context Manager e Blindagem de Segurança"""
    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path
        self.connection = None
        _executar_backup_automatico(self.db_path)

    def __enter__(self):
        try:
            self.connection = sqlite3.connect(self.db_path, timeout=30.0)
            self.connection.row_factory = sqlite3.Row
            
            # Melhoras de performance e concorrência no SQLite
            self.connection.execute("PRAGMA journal_mode = WAL;")
            self.connection.execute("PRAGMA synchronous = NORMAL;")
            self.connection.execute("PRAGMA busy_timeout = 30000;")
            self.connection.execute("PRAGMA foreign_keys = ON;")
            return self.connection
        except sqlite3.Error as e:
            logger.error(f"Erro ao conectar ao banco de dados: {e}")
            raise e

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.connection:
            if exc_type:
                logger.warning("Exceção capturada, fazendo rollback das transações não comitadas.")
                self.connection.rollback()
            else:
                self.connection.commit()
            
            self.connection.close()

def execute_query(query, params=(), fetch_all=True, fetch_one=False, commit=False, db_path=DB_PATH):
    """Função utilitária para executar queries rápidas com proteção de segurança"""
    _validar_seguranca_query(query, db_path)
    with DatabaseManager(db_path=db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        
        if commit:
            conn.commit()
            return cursor.lastrowid
        
        if fetch_one:
            return cursor.fetchone()
        
        if fetch_all:
            return cursor.fetchall()
            
        return None
