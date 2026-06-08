import os
import time
import subprocess
from pywinauto.application import Application
from pywinauto.keyboard import send_keys
from pywinauto import timings

timings.Timings.fast()

caminho_exe = r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe"
proj_name = "proj_debug_flow_2"
arquivo_gns = r"D:\OneDrive_Thiago\OneDrive\Desenvolvimento\Geo\area\Base\gnss\0202t.GNS"

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
    
    # 1. Cria projeto
    btn_novo = janela.child_window(title="Novo", control_type="Button")
    btn_novo.click_input()
    
    dlg_novo = janela.child_window(auto_id="frmNewProject", control_type="Window")
    dlg_novo.wait('ready', timeout=5)
    
    # Obtém caminho dinâmico do WorkPath
    tb_path = dlg_novo.child_window(auto_id="tbWorkPath", control_type="Edit")
    desktop_dir = os.path.normpath(tb_path.window_text())
    proj_dir = os.path.join(desktop_dir, proj_name)
    
    tb_name = dlg_novo.child_window(auto_id="tbProjectName", control_type="Edit")
    tb_name.click_input()
    send_keys(f"^a{{BACKSPACE}}{proj_name}", pause=0.01)
    
    btn_ok = dlg_novo.child_window(auto_id="btOK", control_type="Button")
    btn_ok.click_input()
    
    # 2. Propriedades -> OK
    dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
    dlg_prop.wait('ready', timeout=5)
    
    tab_avancado = dlg_prop.child_window(title="Avancado", control_type="TabItem")
    tab_avancado.click_input()
    
    cb_chars = dlg_prop.child_window(auto_id="cbZHDPtNameType", control_type="ComboBox")
    cb_chars.click_input()
    send_keys("8{ENTER}", pause=0.01)
    
    btn_prop_ok = dlg_prop.child_window(auto_id="btOK", control_type="Button")
    btn_prop_ok.click_input()
    
    # 3. Coordenadas -> OK
    dlg_coord = janela.child_window(auto_id="frmCoord", control_type="Window")
    dlg_coord.wait('ready', timeout=5)
    
    cb_coord = dlg_coord.child_window(auto_id="comboBox1", control_type="ComboBox")
    btn_abrir = cb_coord.child_window(title="Abrir", control_type="Button")
    btn_abrir.click_input()
    time.sleep(0.1)
    
    item_sirgas = cb_coord.child_window(title="SIRGAS_UTM22S", control_type="ListItem")
    item_sirgas.click_input()
    time.sleep(0.1)
    
    btn_coord_ok = dlg_coord.child_window(auto_id="btOk", control_type="Button")
    btn_coord_ok.click_input()
    
    # 4. Importar arquivos GNS
    janela.wait('ready', timeout=5)
    time.sleep(0.5)
    
    btn_importar = janela.child_window(title="Importar", control_type="Button")
    btn_importar.click_input()
    
    dlg_importar = janela.child_window(auto_id="frmFileFilter", control_type="Window")
    dlg_importar.wait('ready', timeout=5)
    
    list_view = dlg_importar.child_window(auto_id="listViewNode", control_type="List")
    item_raw = list_view.child_window(title="Arquivo Raw GNSS", control_type="ListItem")
    item_raw.click_input()
    
    btn_select = dlg_importar.child_window(auto_id="btOK", control_type="Button")
    btn_select.click_input()
    
    # Diálogo do Windows "Abrir"
    dlg_abrir = janela.child_window(title="Abrir", control_type="Window")
    dlg_abrir.wait('ready', timeout=10)
    
    caminhos_formatados = f'"{arquivo_gns}"'
    subprocess.run(['powershell', '-Command', f'Set-Clipboard -Value \'{caminhos_formatados}\''], shell=True)
    
    edit_caminho = dlg_abrir.child_window(title="Nome:", auto_id="1148", control_type="Edit")
    edit_caminho.click_input()
    send_keys("^a^v{ENTER}", pause=0.01)
    
    # Restaura timings padrão
    timings.Timings.defaults()
    
    # 5. Espera pela importação dinâmica (.zsd)
    obs_dir = os.path.join(proj_dir, "ObsBinData")
    print(f"Aguardando importação na pasta: {obs_dir}")
    
    # Espera fixa de 10 segundos
    time.sleep(10)
    
    # 6. Ativar aba Arq-Observacoes e iniciar conversão
    janela.set_focus()
    tab_control = janela.child_window(auto_id="tabControl1", control_type="Tab")
    tab_item = tab_control.child_window(title="Arq-Observacoes", control_type="TabItem")
    tab_item.click_input()
    
    print("Aba Arq-Observacoes clicada.")
    time.sleep(1.0)
    
    # Localiza DataGridView
    table = janela.child_window(title="DataGridView", auto_id="dataGridView1", control_type="Table")
    table.wait('ready', timeout=15)
    
    print("=== DUMP DOS CONTROLES DA TABELA ===")
    table.print_control_identifiers()
    print("=== FIM DO DUMP DA TABELA ===")
    
    # Fecha tudo
    janela.close()
    os.system("taskkill /f /im HGO.exe >nul 2>&1")
except Exception as e:
    print("ERRO:", e)
    try:
        os.system("taskkill /f /im HGO.exe >nul 2>&1")
    except: pass
