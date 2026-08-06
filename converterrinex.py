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

import asyncio

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
        await asyncio.sleep(0.2)
        
        # Inicia HGO com RunAsInvoker e define a pasta de execução CWD segura (evitando C:\WINDOWS\system32)
        os.environ["__COMPAT_LAYER"] = "RunAsInvoker"
        cwd_seguro = os.path.dirname(os.path.abspath(__file__))
        proc = await asyncio.create_subprocess_exec(caminho_exe, cwd=cwd_seguro)
        # Conecta ao HGO.exe recém-iniciado pelo PID do processo
        app = Application(backend="uia").connect(process=proc.pid, timeout=10)
        janela = app.window(title_re="(?i).*hi-target.*")
        janela.wait('ready', timeout=10)
        janela.set_focus()
        
        # 1. Cria o projeto via atalho de teclado Alt+F -> N (Novo)
        send_keys("%f")
        time.sleep(0.4)
        send_keys("n")
        
        dlg_novo = janela.child_window(auto_id="frmNewProject", control_type="Window")
        dlg_novo.wait('ready', timeout=5)
        
        # Lê o caminho de trabalho padrão configurado no HGO
        tb_path = dlg_novo.child_window(auto_id="tbWorkPath", control_type="Edit")
        desktop_dir = os.path.normpath(os.path.abspath(tb_path.window_text()))
        proj_dir = os.path.normpath(os.path.abspath(os.path.join(desktop_dir, proj_name)))
        print(f" -> Pasta de trabalho identificada: {desktop_dir}")
        print(f" -> Pasta do projeto temporario: {proj_dir}")
        
        tb_name = dlg_novo.child_window(auto_id="tbProjectName", control_type="Edit")
        tb_name.set_edit_text(proj_name)
        time.sleep(0.2)
        
        # Confirma criacao do projeto clicando em OK(O) ou Alt+O
        btn_ok = None
        for auto_id_opt in ["btOK", "btnOK", "OK"]:
            try:
                btn_ok = dlg_novo.child_window(auto_id=auto_id_opt, control_type="Button")
                if btn_ok.exists():
                    break
            except:
                pass
        
        if not btn_ok or not btn_ok.exists():
            try:
                btn_ok = dlg_novo.child_window(title="OK(O)", control_type="Button")
            except:
                pass

        if btn_ok and btn_ok.exists():
            btn_ok.set_focus()
            time.sleep(0.1)
            btn_ok.invoke()
        else:
            send_keys("%o")
        
        # 2. Propriedades do Projeto -> Aguarda se abre automaticamente ou abre via Alt+F -> P
        time.sleep(0.5)
        dlg_prop = None
        try:
            dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
            dlg_prop.wait('ready', timeout=3.0)
            print(" -> Diálogo de propriedades detectado automaticamente.")
        except:
            print(" -> Diálogo de propriedades não abriu automaticamente. Forçando via Alt+F -> P...")
            janela.set_focus()
            send_keys("%f")
            time.sleep(0.4)
            send_keys("p")
            dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
            dlg_prop.wait('ready', timeout=5.0)
        
        tab_avancado = dlg_prop.child_window(title="Avancado", control_type="TabItem")
        tab_avancado.select()
        time.sleep(0.3)
        
        cb_chars = dlg_prop.child_window(auto_id="cbZHDPtNameType", control_type="ComboBox")
        try:
            cb_chars.select("8")
            time.sleep(0.3)
        except:
            cb_chars.set_focus()
            send_keys("8{ENTER}", pause=0.01)
            time.sleep(0.3)
        
        # Confirma propriedades clicando em OK(O) ou Alt+O
        btn_prop_ok = None
        for auto_id_opt in ["btOK", "btnOK", "OK"]:
            try:
                btn_prop_ok = dlg_prop.child_window(auto_id=auto_id_opt, control_type="Button")
                if btn_prop_ok.exists():
                    break
            except: pass
        if not btn_prop_ok or not btn_prop_ok.exists():
            try:
                btn_prop_ok = dlg_prop.child_window(title="OK(O)", control_type="Button")
            except: pass
            
        if btn_prop_ok and btn_prop_ok.exists():
            btn_prop_ok.set_focus()
            time.sleep(0.1)
            btn_prop_ok.invoke()
        else:
            send_keys("%o")
        
        # 3. Janela de Coordenadas -> Aguarda se abre automaticamente ou abre via Alt+F -> R
        time.sleep(0.5)
        dlg_coord = None
        for i in range(10):
            for title_opt in ["Coordenada", "Sistema de Coordenadas"]:
                try:
                    dlg_coord = janela.child_window(title=title_opt, control_type="Window")
                    if dlg_coord.exists():
                        break
                except:
                    pass
            if dlg_coord and dlg_coord.exists():
                break
            try:
                dlg_coord = janela.child_window(auto_id="frmCoord", control_type="Window")
                if dlg_coord.exists():
                    break
            except:
                pass
            time.sleep(0.3)

        if not dlg_coord or not dlg_coord.exists():
            print(" -> Diálogo de coordenadas não abriu automaticamente. Forçando via Alt+F -> R...")
            janela.set_focus()
            send_keys("%f")
            time.sleep(0.4)
            send_keys("r")
            
            for i in range(10):
                for title_opt in ["Coordenada", "Sistema de Coordenadas"]:
                    try:
                        dlg_coord = janela.child_window(title=title_opt, control_type="Window")
                        if dlg_coord.exists():
                            break
                    except:
                        pass
                if dlg_coord and dlg_coord.exists():
                    break
                try:
                    dlg_coord = janela.child_window(auto_id="frmCoord", control_type="Window")
                    if dlg_coord.exists():
                        break
                except:
                    pass
                time.sleep(0.3)

        if not dlg_coord or not dlg_coord.exists():
            raise Exception("Não foi possível localizar a janela de Coordenadas.")

        # Interage com o comboBox1 (superior) via clique físico com offset mapeado (+49px)
        cb_coord = dlg_coord.child_window(auto_id="comboBox1", control_type="ComboBox")
        btn_abrir = cb_coord.child_window(title="Abrir", control_type="Button")
        
        # Garante foco no diálogo e expande o combobox
        janela.set_focus()
        dlg_coord.set_focus()
        btn_abrir.click_input()
        time.sleep(0.8) # Aguarda a lista expandir
        
        # Clica no item SIRGAS_UTM22S usando as coordenadas físicas calculadas
        cb_rect = cb_coord.rectangle()
        x_clique = int((cb_rect.left + cb_rect.right) / 2)
        y_clique = cb_rect.bottom + 49
        
        import pywinauto.mouse as mouse
        mouse.click(button='left', coords=(x_clique, y_clique))
        time.sleep(1.2) # Aguarda o HGO processar o template carregado
        
        # Confirma sistema de coordenadas via botão OK (btOk) ou Enter
        btn_ok = None
        try:
            btn_ok = dlg_coord.child_window(title="OK", auto_id="btOk", control_type="Button")
        except:
            pass
        if btn_ok and btn_ok.exists():
            btn_ok.click_input()
        else:
            send_keys("{ENTER}")
        
        # 4. Importar arquivos GNS -> via Alt+F -> I
        time.sleep(0.8)
        janela.set_focus()
        send_keys("{ESC}")
        time.sleep(0.2)
        send_keys("%f")
        time.sleep(0.5)
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
        
        # 7. Aguarda dinamicamente a conclusão da conversão Rinex pelo HGO
        print(" -> Aguardando conversão Rinex dinâmica pelo HGO...")
        inicio_conversao = time.time()
        timeout_conversao = 30.0
        nomes_base_origem = [os.path.splitext(os.path.basename(a))[0].lower() for a in arquivos_origem]

        def encontrar_arquivos_rinex_temp():
            pastas_varredura = [proj_dir, os.path.join(proj_dir, "Rinex"), desktop_dir, pasta_destino]
            encontrados = {}
            for p_var in pastas_varredura:
                if not p_var or not os.path.exists(p_var):
                    continue
                try:
                    for f in os.listdir(p_var):
                        caminho_f = os.path.join(p_var, f)
                        if not os.path.isfile(caminho_f):
                            continue
                        nome_f, ext_f = os.path.splitext(f)
                        nome_f_lower = nome_f.lower()
                        ext_f_lower = ext_f.lower()

                        if not any(nome_f_lower == nb or nome_f_lower.startswith(nb) for nb in nomes_base_origem):
                            continue

                        if ext_f_lower in ['.obs', '.nav', '.o', '.n', '.g'] or bool(re.match(r'^\.\d{2}[ong]$', ext_f_lower)):
                            try:
                                mtime = os.path.getmtime(caminho_f)
                                if mtime >= (inicio_conversao - 5):
                                    encontrados[f.lower()] = caminho_f
                            except: pass
                except: pass
            return encontrados

        while True:
            arqs_dict = encontrar_arquivos_rinex_temp()
            bases_prontas = 0
            for nb in nomes_base_origem:
                tem_obs = any(
                    (k.startswith(nb) and (k.endswith('.obs') or k.endswith('.o') or bool(re.match(r'^.+\.\d{2}o$', k))))
                    for k in arqs_dict.keys()
                )
                if tem_obs:
                    bases_prontas += 1

            if bases_prontas >= len(nomes_base_origem) and len(arqs_dict) > 0:
                try:
                    tamanhos_ini = {path: os.path.getsize(path) for path in arqs_dict.values()}
                    time.sleep(0.5)
                    arqs_dict_check = encontrar_arquivos_rinex_temp()
                    tamanhos_fim = {path: os.path.getsize(path) for path in arqs_dict_check.values()}
                    if tamanhos_ini == tamanhos_fim:
                        print(f" -> Conversão Rinex concluída dinamicamente em {time.time() - inicio_conversao:.1f}s ({len(arqs_dict)} arquivos gerados).")
                        break
                except: pass

            if time.time() - inicio_conversao > timeout_conversao:
                print(f"[AVISO] Timeout na conversão Rinex ({timeout_conversao}s). Prosseguindo...")
                break
            time.sleep(0.4)
        
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
