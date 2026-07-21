import os
import sys
import ctypes
import threading
import traceback

def sou_administrador():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def main():
    try:
        # Adiciona o diretório pai (raiz do projeto) ao sys.path
        diretorio_raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if diretorio_raiz not in sys.path:
            sys.path.insert(0, diretorio_raiz)
            
        # Trava o CWD para a raiz para evitar side-effects do UAC (que inicia na pasta System32)
        os.chdir(diretorio_raiz)

        # Importações perigosas que podem falhar dependendo do path
        import uvicorn
        import webview
        from api import app as fastapi_app

        def iniciar_servidor():
            try:
                print("Subindo servidor FastAPI na porta 8000...")
                uvicorn.run(fastapi_app, host="127.0.0.1", port=8000, log_level="info")
            except Exception as err:
                print(f"ERRO Crítico ao subir o Uvicorn: {err}")

        # GARANTIA UAC
        if not sou_administrador():
            print("Solicitando privilégios de Administrador...")
            # Força o uso do python.exe para ter console se quisermos ver o erro
            exec_path = sys.executable.replace("pythonw.exe", "python.exe")
            args = " ".join([f'"{arg}"' for arg in sys.argv])
            cwd = diretorio_raiz
            ctypes.windll.shell32.ShellExecuteW(None, "runas", exec_path, args, cwd, 1)
            sys.exit(0)

        # Já elevado
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
            def open_map_settings(self):
                for w in webview.windows:
                    if w.title == "Opções":
                        w.restore()
                        return
                        
                # Abre janela estilo modal Options do CAD
                webview.create_window(
                    "Opções",
                    "http://127.0.0.1:8000/config_mapa.html",
                    width=660,
                    height=520,
                    resizable=False
                )

        api = WindowAPI()
        webview.create_window(
            "GerenciGeo - Georreferenciamento Avançado v2.4",
            "http://127.0.0.1:8000/principal.html",
            width=1280,
            height=800,
            min_size=(1024, 768),
            frameless=False,
            js_api=api
        )
        webview.start(debug=False, private_mode=False)

    except Exception as e:
        error_msg = traceback.format_exc()
        try:
            log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "crash_app.log")
            with open(log_path, "w", encoding="utf-8") as f:
                f.write(error_msg)
        except:
            pass
        print("FALHA CRÍTICA:\n", error_msg)
        if sys.stdin and sys.stdin.isatty():
            input("\nPressione ENTER para fechar...")

if __name__ == "__main__":
    main()