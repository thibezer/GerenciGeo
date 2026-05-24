import sqlite3
import logging
from config import DB_PATH

logger = logging.getLogger(__name__)

class DatabaseManager:
    """Gerenciador de conexão SQLite com Context Manager"""
    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path
        self.connection = None

    def __enter__(self):
        try:
            self.connection = sqlite3.connect(self.db_path)
            self.connection.row_factory = sqlite3.Row
            
            # Melhoras de performance e concorrência no SQLite
            self.connection.execute("PRAGMA journal_mode = WAL;")
            self.connection.execute("PRAGMA synchronous = NORMAL;")
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

def execute_query(query, params=(), fetch_all=True, fetch_one=False, commit=False):
    """Função utilitária para executar queries rapidas"""
    with DatabaseManager() as conn:
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
