import os
import sys
import logging
import ctypes  # Importação nativa do Windows para checar privilégios

from config import BASE_DIR, EXPORT_BASE_FOLDER
from database.connection import DatabaseManager
from database.models import create_tables

import tkinter as tk
from ui.app import GerenciGeoApp

def setup_logging():
    log_file = os.path.join(BASE_DIR, "gerencigeo.log")
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )

def setup_directories():
    if not os.path.exists(EXPORT_BASE_FOLDER):
        try:
            os.makedirs(EXPORT_BASE_FOLDER)
            logging.info(f"Pasta de exportacao base criada em: {EXPORT_BASE_FOLDER}")
        except Exception as e:
            logging.error(f"Erro ao criar pasta base: {e}")

def main():
    setup_logging()
    logging.info("Iniciando GerenciGeo (Modo Administrador)...")
    
    setup_directories()

    # Inicializar Base de Dados
    logging.info("Verificando/Criando estrutura do Banco de Dados...")
    with DatabaseManager() as conn:
        create_tables(conn)
    
    logging.info("Estrutura do banco de dados OK.")

    root = tk.Tk()
    app = GerenciGeoApp(root)
    root.mainloop()

# ==========================================
# GATILHO DE ADMINISTRAÇÃO DO WINDOWS
# ==========================================
def sou_administrador():
    """Verifica se o Python já está rodando como chefe no Windows."""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

if __name__ == "__main__":
    if sou_administrador():
        # Se você já clicou em "Sim" na tela do Windows, o sistema abre normalmente
        main()
    else:
        # Se é a primeira vez abrindo, ele "fecha" e pede pro Windows reabrir como Administrador
        print("Solicitando privilégios de Administrador...")
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, " ".join(sys.argv), None, 1)