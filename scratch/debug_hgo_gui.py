import os
import time
import subprocess
from pywinauto.application import Application

caminho_exe = r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe"
proj_name = "proj_debug_temp"

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
    
    tb_name = dlg_novo.child_window(auto_id="tbProjectName", control_type="Edit")
    tb_name.click_input()
    from pywinauto.keyboard import send_keys
    send_keys(f"^a{{BACKSPACE}}{proj_name}", pause=0.01)
    
    btn_ok = dlg_novo.child_window(auto_id="btOK", control_type="Button")
    btn_ok.click_input()
    
    print("Abrindo diálogo Propriedades...")
    dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
    dlg_prop.wait('ready', timeout=5)
    
    btn_prop_ok = dlg_prop.child_window(auto_id="btOK", control_type="Button")
    btn_prop_ok.click_input()
    
    print("Abrindo diálogo Coordenadas...")
    dlg_coord = janela.child_window(auto_id="frmCoord", control_type="Window")
    dlg_coord.wait('ready', timeout=5)
    
    btn_coord_ok = dlg_coord.child_window(auto_id="btOk", control_type="Button")
    btn_coord_ok.click_input()
    
    print("Abrindo diálogo Importar...")
    janela.wait('ready', timeout=5)
    time.sleep(0.5)
    
    btn_importar = janela.child_window(title="Importar", control_type="Button")
    btn_importar.click_input()
    
    dlg_importar = janela.child_window(auto_id="frmFileFilter", control_type="Window")
    dlg_importar.wait('ready', timeout=5)
    
    print("=== DUMP DO DIÁLOGO IMPORTAR ===")
    dlg_importar.print_control_identifiers()
    print("=== FIM DO DUMP ===")
    
    # Fecha tudo
    janela.close()
    os.system("taskkill /f /im HGO.exe >nul 2>&1")
except Exception as e:
    print("ERRO:", e)
    try:
        os.system("taskkill /f /im HGO.exe >nul 2>&1")
    except: pass
