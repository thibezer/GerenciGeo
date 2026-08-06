import os
import time
import shutil
import subprocess
import re
from pywinauto.application import Application
from pywinauto.keyboard import send_keys
from pywinauto import timings

# Configura tempos rápidos globais para o pywinauto de forma a evitar os atrasos (delays) padrão do Windows
timings.Timings.fast()
timings.Timings.after_clickinput_wait = 0.05
timings.Timings.after_click_wait = 0.05
timings.Timings.after_setcursorpos_wait = 0.01

def set_clipboard_text(text):
    import ctypes
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    CF_UNICODETEXT = 13
    GMEM_MOVEABLE = 2
    
    if not user32.OpenClipboard(None):
        return False
    try:
        user32.EmptyClipboard()
        text_bytes = text.encode('utf-16le') + b'\x00\x00'
        h_global = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(text_bytes))
        if not h_global:
            return False
        p_mem = kernel32.GlobalLock(h_global)
        if not p_mem:
            return False
        try:
            ctypes.memmove(p_mem, text_bytes, len(text_bytes))
        except:
            return False
        finally:
            kernel32.GlobalUnlock(h_global)
        user32.SetClipboardData(CF_UNICODETEXT, h_global)
    finally:
        user32.CloseClipboard()
    return True

def garantir_foco(janela_alvo):
    if janela_alvo is not None:
        try:
            if janela_alvo.exists():
                import ctypes
                user32 = ctypes.windll.user32
                hwnd = janela_alvo.handle
                user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                user32.SetForegroundWindow(hwnd)
                janela_alvo.set_focus()
                time.sleep(0.05)
        except: pass

async def converter_rinex(arquivos_origem, pasta_destino, caminho_exe=r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe"):
    """
    Realiza a conversão de um ou mais arquivos .GNS para RINEX usando o HGO.
    Suporta arquivo único (string) ou lote de arquivos (lista).
    """
    if isinstance(arquivos_origem, str):
        arquivos_origem = [arquivos_origem]
        
    # Converte caminhos para absolutos, normaliza e filtra arquivos existentes
    arquivos_origem = [os.path.normpath(os.path.abspath(a)) for a in arquivos_origem if os.path.exists(a)]
    pasta_destino = os.path.normpath(os.path.abspath(pasta_destino))
    
    if not arquivos_origem:
        print("[ERRO] Nenhum arquivo de origem válido foi encontrado.")
        return False
        
    os.makedirs(pasta_destino, exist_ok=True)
    
    # Cria projeto temporário com timestamp para evitar colisões
    timestamp = int(time.time())
    proj_name = f"proj_hgo_auto_{timestamp}"
    
    desktop_dir = None
    proj_dir = None
    
    try:
        # Garante que nenhum HGO anterior esteja rodando para evitar conflitos de foco
        os.system("taskkill /f /im HGO.exe >nul 2>&1")
        time.sleep(0.2)
        
        # Inicia HGO com RunAsInvoker e define a pasta de execução CWD segura
        os.environ["__COMPAT_LAYER"] = "RunAsInvoker"
        cwd_seguro = os.path.dirname(os.path.abspath(__file__))
        proc = await asyncio.create_subprocess_exec(caminho_exe, cwd=cwd_seguro)
        
        app = Application(backend="uia").connect(process=proc.pid, timeout=10)
        janela = app.window(title_re="(?i).*hi-target.*")
        janela.wait('ready', timeout=10)
        garantir_foco(janela)
        
        # 1. Cria o projeto via atalho de teclado Alt+F -> N (Novo)
        garantir_foco(janela)
        send_keys("%f")
        time.sleep(0.3)
        send_keys("n")
        
        dlg_novo = janela.child_window(auto_id="frmNewProject", control_type="Window")
        dlg_novo.wait('ready', timeout=5)
        
        # Lê o caminho de trabalho padrão configurado no HGO
        tb_path = dlg_novo.child_window(auto_id="tbWorkPath", control_type="Edit")
        desktop_dir = os.path.normpath(os.path.abspath(tb_path.window_text()))
        proj_dir = os.path.normpath(os.path.abspath(os.path.join(desktop_dir, proj_name)))
        
        tb_name = dlg_novo.child_window(auto_id="tbProjectName", control_type="Edit")
        tb_name.set_edit_text(proj_name)
        time.sleep(0.2)
        
        # Confirma criação do projeto
        try:
            btn_ok = dlg_novo.child_window(auto_id="btOK", control_type="Button")
            if btn_ok.exists():
                btn_ok.click_input()
            else:
                send_keys("%o")
        except:
            send_keys("{ENTER}")
        
        # 2. Propriedades do Projeto -> Confirma diretamente com ENTER / OK
        time.sleep(0.3)
        dlg_prop = None
        try:
            dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
            dlg_prop.wait('ready', timeout=3.0)
        except:
            garantir_foco(janela)
            send_keys("%f")
            time.sleep(0.2)
            send_keys("p")
            try:
                dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
                dlg_prop.wait('ready', timeout=3.0)
            except: pass

        if dlg_prop and dlg_prop.exists():
            try:
                garantir_foco(dlg_prop)
                time.sleep(0.1)
                btn_prop_ok = dlg_prop.child_window(auto_id="btOK", control_type="Button")
                if btn_prop_ok.exists():
                    btn_prop_ok.click_input()
                else:
                    send_keys("%o")
            except:
                send_keys("{ENTER}")

        # 3. Janela de Coordenadas -> Confirma instantaneamente se aberta
        time.sleep(0.3)
        try:
            dlg_coord = janela.child_window(auto_id="frmCoord", control_type="Window")
            if dlg_coord.exists():
                garantir_foco(dlg_coord)
                time.sleep(0.1)
                try:
                    btn_coord_ok = dlg_coord.child_window(auto_id="btOk", control_type="Button")
                    if btn_coord_ok.exists():
                        btn_coord_ok.click_input()
                    else:
                        send_keys("%o")
                except:
                    send_keys("{ENTER}")
        except: pass

        # 4. Importar arquivos GNS -> via Alt+F -> I
        time.sleep(0.3)
        garantir_foco(janela)
        time.sleep(0.1)
        send_keys("%f")
        time.sleep(0.3)
        send_keys("i")
        
        # Diálogo frmFileFilter
        dlg_importar = janela.child_window(auto_id="frmFileFilter", control_type="Window")
        dlg_importar.wait('ready', timeout=5)
        
        # Selecionar arquivos via atalho nativo Alt+S
        send_keys("%s")
        
        # Diálogo do Windows "Abrir"
        dlg_abrir = janela.child_window(title="Abrir", control_type="Window")
        dlg_abrir.wait('ready', timeout=5)
        
        caminhos_formatados = " ".join([f'"{arq}"' for arq in arquivos_origem])
        edit_box = dlg_abrir.child_window(class_name="Edit", control_type="Edit")
        edit_box.set_edit_text(caminhos_formatados)
        time.sleep(0.2)
        
        # Confirma abertura de arquivos clicando programaticamente no botão "Abrir"
        btn_abrir_confirm = None
        for title_opt in ["&Abrir", "Abrir", "Open", "&Open"]:
            try:
                btn_abrir_confirm = dlg_abrir.child_window(title=title_opt, control_type="Button")
                if btn_abrir_confirm.exists():
                    break
            except: pass
        if btn_abrir_confirm and btn_abrir_confirm.exists():
            btn_abrir_confirm.click_input()
        else:
            send_keys("{ENTER}")
        
        # Restaura os timings padrão do pywinauto para a fase de conversão e menus
        timings.Timings.defaults()
        
        # 5. Espera dinâmica pela importação dos arquivos (.zsd)
        obs_dir = os.path.join(proj_dir, "ObsBinData")
        print(f" -> Aguardando importacao dinamica na pasta: {obs_dir}")
        
        arquivos_esperados = [os.path.splitext(os.path.basename(a))[0] + ".zsd" for a in arquivos_origem]
        timeout_importacao = 20
        inicio_espera = time.time()
        
        while True:
            todos_existem = True
            if os.path.exists(obs_dir):
                arquivos_pasta = os.listdir(obs_dir)
                for arq in arquivos_esperados:
                    if arq not in arquivos_pasta:
                        todos_existem = False
                        break
            else:
                todos_existem = False
                
            if todos_existem:
                # Checa estabilidade de tamanho do arquivo importado
                tamanhos_iniciais = {arq: os.path.getsize(os.path.join(obs_dir, arq)) for arq in arquivos_esperados}
                time.sleep(0.8)
                tamanhos_finais = {arq: os.path.getsize(os.path.join(obs_dir, arq)) for arq in arquivos_esperados}
                if tamanhos_iniciais == tamanhos_finais:
                    break
                    
            if time.time() - inicio_espera > timeout_importacao:
                print("[AVISO] Timeout na importacao de arquivos brutos. Prosseguindo...")
                break
            time.sleep(0.2)
            
        # Aguarda estabilização da interface após término da importação
        time.sleep(1.0)
        
        # 6. Ativar aba Arq-Observacoes e iniciar conversão
        janela.set_focus()
        send_keys("{ESC}")
        time.sleep(0.2)
        tab_control = janela.child_window(auto_id="tabControl1", control_type="Tab")
        tab_item = tab_control.child_window(title="Arq-Observacoes", control_type="TabItem")
        tab_item.select()
        time.sleep(0.5)
        
        # Localiza e aguarda dinamicamente que o DataGridView esteja pronto na tela
        table = janela.child_window(title="DataGridView", auto_id="dataGridView1", control_type="Table")
        table.wait('ready', timeout=15)
        
        # Foca a tabela clicando na primeira linha e seleciona todos os arquivos
        table.click_input(button="left", coords=(100, 60))
        time.sleep(0.3)
        send_keys("^a")
        time.sleep(0.5)
        
        # Abre o menu de contexto via clique com o botão direito na primeira linha da tabela
        table.click_input(button="right", coords=(100, 60))
        time.sleep(0.8)
        
        # Executa "Converter para Rinex(R)" enviando a tecla de atalho nativa do item do menu
        send_keys("r")
        time.sleep(0.3)
        send_keys("{ENTER}")
        
        # 7. Aguarda tempo fixo para a conversão Rinex ser concluída pelo HGO
        print(" -> Aguardando 30 segundos para a conversao Rinex...")
        time.sleep(30.0)
        
        # 8. Fecha o HGO de forma segura
        print(" -> Fechando o HGO...")
        try:
            janela.close()
        except: pass
        os.system("taskkill /f /im HGO.exe >nul 2>&1")
        time.sleep(1.5)
        
        return True
        
    except Exception as e:
        print(f"[FALHA] Erro na conversao HGO: {e}")
        try:
            os.system("taskkill /f /im HGO.exe >nul 2>&1")
        except: pass
        return False
