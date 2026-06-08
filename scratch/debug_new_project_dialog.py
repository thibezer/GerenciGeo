import os
import time
import subprocess
from pywinauto.application import Application

caminho_exe = r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe"

try:
    print("Matando instâncias anteriores...")
    os.system("taskkill /f /im HGO.exe >nul 2>&1")
    time.sleep(0.5)
    
    print("Iniciando HGO...")
    os.environ["__COMPAT_LAYER"] = "RunAsInvoker"
    subprocess.Popen([caminho_exe])
    
    app = Application(backend="uia").connect(path=caminho_exe, timeout=20)
    janela = app.window(title_re=".*Hi-Target Geomatics Office.*")
    janela.wait('ready', timeout=20)
    janela.set_focus()
    
    print("Abrindo diálogo Novo Projeto...")
    btn_novo = janela.child_window(title="Novo", control_type="Button")
    btn_novo.click_input()
    
    dlg_novo = janela.child_window(auto_id="frmNewProject", control_type="Window")
    dlg_novo.wait('ready', timeout=5)
    
    print("=== DUMP DO DIÁLOGO NOVO PROJETO ===")
    dlg_novo.print_control_identifiers()
    print("=== FIM DO DUMP ===")
    
    janela.close()
    os.system("taskkill /f /im HGO.exe >nul 2>&1")
except Exception as e:
    print("ERRO:", e)
    try:
        os.system("taskkill /f /im HGO.exe >nul 2>&1")
    except: pass
