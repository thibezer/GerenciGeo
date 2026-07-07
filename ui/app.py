import os
import sys
import ctypes
import threading

# Adiciona o diretório pai (raiz do projeto) ao sys.path para evitar problemas de importação do api.py
diretorio_raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if diretorio_raiz not in sys.path:
    sys.path.insert(0, diretorio_raiz)

import uvicorn
import webview
from api import app as fastapi_app

def sou_administrador():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def iniciar_servidor():
    # Inicializa o servidor local em background e captura possíveis erros
    try:
        print("Subindo servidor FastAPI na porta 8000...")
        uvicorn.run(fastapi_app, host="127.0.0.1", port=8000, log_level="info")
    except Exception as err:
        print(f"ERRO Crítico ao subir o Uvicorn: {err}")

def start_app():
    # GARANTIA UAC: Re-executa o processo solicitando permissões elevadas se necessário
    if not sou_administrador():
        print("Solicitando privilégios de Administrador para o ecossistema Edge-First...")
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, " ".join(sys.argv), None, 1)
        sys.exit(0)
        
    # Se já possuir privilégios administrativos, inicializa o pipeline desktop
    print("Iniciando Uvicorn Daemon e Janela Webview Nativa...")
    t = threading.Thread(target=iniciar_servidor, daemon=True)
    t.start()
    
    class WindowAPI:
        def minimize(self):
            w = webview.active_window()
            if w:
                w.minimize()
        def toggle_maximize(self):
            w = webview.active_window()
            if w:
                try:
                    w.toggle_maximize()
                except:
                    w.maximize()
        def close(self):
            w = webview.active_window()
            if w:
                w.destroy()

    api = WindowAPI()
    webview.create_window(
        "GerenciGeo - Georreferenciamento Avançado v2.4",
        "http://127.0.0.1:8000/principal.html",
        width=1280,
        height=720,
        min_size=(1024, 768),
        frameless=True,
        js_api=api
    )
    webview.start(debug=True)

if __name__ == "__main__":
    start_app()