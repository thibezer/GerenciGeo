import os
import time
import shutil
import subprocess
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

def converter_rinex(arquivos_origem, pasta_destino, caminho_exe=r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe"):
    """
    Realiza a conversão de um ou mais arquivos .GNS para RINEX usando o HGO.
    Suporta arquivo único (string) ou lote de arquivos (lista).
    """
    if isinstance(arquivos_origem, str):
        arquivos_origem = [arquivos_origem]
        
    # Normaliza caminhos e filtra arquivos existentes
    arquivos_origem = [os.path.normpath(a) for a in arquivos_origem if os.path.exists(a)]
    pasta_destino = os.path.normpath(pasta_destino)
    
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
        
        # Inicia HGO com RunAsInvoker para evitar necessidade de elevação UAC
        os.environ["__COMPAT_LAYER"] = "RunAsInvoker"
        subprocess.Popen([caminho_exe])
        
        # Conecta ao HGO.exe recém-iniciado
        app = Application(backend="uia").connect(path=caminho_exe, timeout=5)
        janela = app.window(title_re=".*Hi-Target Geomatics Office.*")
        janela.wait('ready', timeout=5)
        janela.set_focus()
        
        # 1. Cria o projeto
        btn_novo = janela.child_window(title="Novo", control_type="Button")
        btn_novo.click_input()
        
        dlg_novo = janela.child_window(auto_id="frmNewProject", control_type="Window")
        dlg_novo.wait('ready', timeout=5)
        
        # Lê o caminho de trabalho padrão configurado no HGO
        tb_path = dlg_novo.child_window(auto_id="tbWorkPath", control_type="Edit")
        desktop_dir = os.path.normpath(tb_path.window_text())
        proj_dir = os.path.join(desktop_dir, proj_name)
        print(f" -> Pasta de trabalho identificada: {desktop_dir}")
        print(f" -> Pasta do projeto temporario: {proj_dir}")
        
        tb_name = dlg_novo.child_window(auto_id="tbProjectName", control_type="Edit")
        tb_name.click_input()
        send_keys(f"^a{{BACKSPACE}}{proj_name}", pause=0.01)
        
        btn_ok = dlg_novo.child_window(auto_id="btOK", control_type="Button")
        btn_ok.click_input()
        
        # 2. Propriedades do Projeto -> OK
        dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
        dlg_prop.wait('ready', timeout=5)
        
        tab_avancado = dlg_prop.child_window(title="Avancado", control_type="TabItem")
        tab_avancado.click_input()
        
        cb_chars = dlg_prop.child_window(auto_id="cbZHDPtNameType", control_type="ComboBox")
        cb_chars.click_input()
        send_keys("8{ENTER}", pause=0.01)
        
        btn_prop_ok = dlg_prop.child_window(auto_id="btOK", control_type="Button")
        btn_prop_ok.click_input()
        
        # 3. Janela de Coordenadas -> Seleciona SIRGAS_UTM22S
        dlg_coord = janela.child_window(auto_id="frmCoord", control_type="Window")
        dlg_coord.wait('ready', timeout=5)
        
        cb_coord = dlg_coord.child_window(auto_id="comboBox1", control_type="ComboBox")
        btn_abrir = cb_coord.child_window(title="Abrir", control_type="Button")
        btn_abrir.click_input()
        time.sleep(0.05)
        
        item_sirgas = cb_coord.child_window(title="SIRGAS_UTM22S", control_type="ListItem")
        item_sirgas.click_input()
        time.sleep(0.05)
        
        btn_coord_ok = dlg_coord.child_window(auto_id="btOk", control_type="Button")
        btn_coord_ok.click_input()
        
        # 4. Importar arquivos GNS
        janela.wait('ready', timeout=5)
        time.sleep(0.05)
        
        btn_importar = janela.child_window(title="Importar", control_type="Button")
        btn_importar.click_input()
        
        # Diálogo frmFileFilter
        dlg_importar = janela.child_window(auto_id="frmFileFilter", control_type="Window")
        dlg_importar.wait('ready', timeout=5)
        
        list_view = dlg_importar.child_window(auto_id="listViewNode", control_type="List")
        item_raw = list_view.child_window(title="Arquivo Raw GNSS", control_type="ListItem")
        item_raw.click_input()
        
        btn_select = dlg_importar.child_window(auto_id="btOK", control_type="Button")
        btn_select.click_input()
        
        # Diálogo do Windows "Abrir"
        dlg_abrir = janela.child_window(title="Abrir", control_type="Window")
        dlg_abrir.wait('ready', timeout=1)
        
        # Copia os caminhos dos arquivos brutos para o clipboard e cola
        caminhos_formatados = " ".join([f'"{arq}"' for arq in arquivos_origem])
        set_clipboard_text(caminhos_formatados)
        
        edit_caminho = dlg_abrir.child_window(title="Nome:", auto_id="1148", control_type="Edit")
        edit_caminho.click_input()
        send_keys("^a^v{ENTER}", pause=0.01)
        
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
            time.sleep(0.1)
            
        # Aguarda estabilização da interface após término da importação
        time.sleep(1.0)
        
        # 6. Ativar aba Arq-Observacoes e iniciar conversão
        janela.set_focus()
        tab_control = janela.child_window(auto_id="tabControl1", control_type="Tab")
        tab_item = tab_control.child_window(title="Arq-Observacoes", control_type="TabItem")
        tab_item.click_input()
        
        # Localiza e aguarda dinamicamente que o DataGridView esteja pronto na tela
        table = janela.child_window(title="DataGridView", auto_id="dataGridView1", control_type="Table")
        table.wait('ready', timeout=15)
        
        # Envia a tecla ALT antes de clicar com o botão direito para ativar os atalhos de teclado no menu
        send_keys("{VK_MENU}", pause=0.1)
        time.sleep(0.3)
        
        celula = table.child_window(title="Arquivo Linha 0", control_type="DataItem")
        celula.click_input()
        time.sleep(0.5)
        
        # Seleciona tudo e abre o menu
        send_keys("^a", pause=0.05)
        time.sleep(0.5)
        celula.click_input(button="right")
        time.sleep(1.5)
        
        # Executa "Converter para Rinex(R)"
        send_keys("r{ENTER}", pause=0.05)
        
        # 7. Espera dinâmica pela conversão Rinex
        print(" -> Aguardando conversao Rinex...")
        rinex_dir = os.path.join(proj_dir, "Rinex")
        parent_dir = os.path.dirname(proj_dir)
        timeout_conversao = 40
        inicio_conversao = time.time()
        
        # Nomes base dos arquivos de origem para filtragem precisa
        nomes_base_origem = [os.path.splitext(os.path.basename(a))[0].lower() for a in arquivos_origem]
        
        def encontrar_arquivos_rinex():
            encontrados = {}
            diretorios_busca = []
            if os.path.exists(rinex_dir):
                diretorios_busca.append((rinex_dir, False))
            if os.path.exists(proj_dir):
                diretorios_busca.append((proj_dir, False))
            if os.path.exists(parent_dir):
                diretorios_busca.append((parent_dir, False))
                # Varre subpastas de primeiro nível da Area de Trabalho (projetos do HGO)
                try:
                    for item in os.listdir(parent_dir):
                        caminho_item = os.path.join(parent_dir, item)
                        if os.path.isdir(caminho_item):
                            diretorios_busca.append((caminho_item, False))
                            diretorios_busca.append((os.path.join(caminho_item, "Rinex"), False))
                except Exception as ex:
                    print(f"[AVISO] Falha ao listar subpastas da Area de Trabalho: {ex}")
                
            # Filtra diretórios válidos e remove duplicatas
            diretorios_filtrados = []
            vistos = set()
            for d, filt_data in diretorios_busca:
                d_norm = os.path.normpath(d)
                if os.path.exists(d_norm) and d_norm not in vistos:
                    vistos.add(d_norm)
                    diretorios_filtrados.append((d_norm, filt_data))
                    
            for pasta, filtrar_data in diretorios_filtrados:
                for f in os.listdir(pasta):
                    caminho_completo = os.path.join(pasta, f)
                    if not os.path.isfile(caminho_completo):
                        continue
                        
                    nome_f, ext_f = os.path.splitext(f)
                    nome_f_lower = nome_f.lower()
                    ext_f_lower = ext_f.lower()
                    
                    pertence_a_origem = False
                    for nb in nomes_base_origem:
                        if nome_f_lower == nb or nome_f_lower.startswith(nb):
                            pertence_a_origem = True
                            break
                            
                    if not pertence_a_origem:
                        continue
                        
                    import re
                    eh_rinex = False
                    if ext_f_lower in ['.obs', '.nav', '.o', '.n', '.g']:
                        eh_rinex = True
                    elif re.match(r'^\.\d{2}[ong]$', ext_f_lower):
                        eh_rinex = True
                        
                    if eh_rinex:
                        if filtrar_data:
                            try:
                                mtime = os.path.getmtime(caminho_completo)
                                if mtime >= (inicio_conversao - 10):
                                    encontrados[f.lower()] = caminho_completo
                            except: pass
                        else:
                            encontrados[f.lower()] = caminho_completo
                            
            return list(encontrados.values())

        while True:
            arqs_rinex = encontrar_arquivos_rinex()
            
            # Garante que cada arquivo de origem tenha pelo menos um arquivo de observacao correspondente gerado
            bases_com_obs = 0
            for nb in nomes_base_origem:
                has_obs = False
                for arq_caminho in arqs_rinex:
                    f_name = os.path.basename(arq_caminho).lower()
                    nome_f, ext_f = os.path.splitext(f_name)
                    if nome_f == nb or nome_f.startswith(nb):
                        if ext_f in ['.obs', '.o'] or re.match(r'^\.\d{2}o$', ext_f):
                            has_obs = True
                            break
                if has_obs:
                    bases_com_obs += 1
            
            if bases_com_obs >= len(arquivos_origem):
                # Checa estabilidade dos arquivos
                try:
                    tamanhos_iniciais = {path: os.path.getsize(path) for path in arqs_rinex}
                    time.sleep(1.0)
                    arqs_rinex_check = encontrar_arquivos_rinex()
                    tamanhos_finais = {path: os.path.getsize(path) for path in arqs_rinex_check}
                    if tamanhos_iniciais == tamanhos_finais:
                        break
                except: pass
                    
            if time.time() - inicio_conversao > timeout_conversao:
                print("[AVISO] Timeout na conversao Rinex.")
                break
            time.sleep(1.0)
            
        # 8. Copia os arquivos resultantes para a pasta de destino antes de fechar o HGO
        print(" -> Copiando arquivos Rinex convertidos...")
        arquivos_para_mover = encontrar_arquivos_rinex()
        sucesso_movimentacao = False
        
        for arq in arquivos_para_mover:
            dest_file = os.path.join(pasta_destino, os.path.basename(arq))
            try:
                if os.path.exists(dest_file):
                    import stat
                    try:
                        os.chmod(dest_file, stat.S_IWRITE)
                    except: pass
                    os.remove(dest_file)
                shutil.copy2(arq, dest_file)
                print(f" -> Arquivo copiado com sucesso: {os.path.basename(arq)} -> {pasta_destino}")
                sucesso_movimentacao = True
            except Exception as e:
                print(f"[ERRO] Falha ao copiar arquivo {os.path.basename(arq)}: {e}")
                
        # 9. Espera 4 segundos (delay técnico para garantir estabilidade e encerramento de I/O)
        print(" -> Aguardando 4 segundos com o HGO aberto...")
        time.sleep(5.0)
        
        # 10. Fecha o HGO de forma segura
        print(" -> Fechando o HGO...")
        try:
            janela.close()
        except: pass
        os.system("taskkill /f /im HGO.exe >nul 2>&1")
        time.sleep(1.5)
        
        # 11. Limpa os arquivos temporários da Área de Trabalho e subpastas de projetos HGO
        for arq in arquivos_para_mover:
            try:
                caminho_dir = os.path.dirname(arq)
                if caminho_dir == parent_dir or caminho_dir.startswith(parent_dir):
                    if os.path.exists(arq):
                        os.remove(arq)
                        print(f" -> Temporario removido: {os.path.basename(arq)}")
            except Exception as ex:
                print(f"[AVISO] Nao foi possivel remover temporario {os.path.basename(arq)}: {ex}")
                
        # Remove a pasta temporária do projeto
        if proj_dir and os.path.exists(proj_dir):
            try:
                shutil.rmtree(proj_dir)
                print(" -> Pasta temporaria do projeto removida com sucesso.")
            except Exception as e:
                print(f"[AVISO] Nao foi possivel remover pasta temporaria {proj_dir}: {e}")
                
        return sucesso_movimentacao
        
    except Exception as e:
        print(f"[FALHA] Erro na conversao HGO: {e}")
        try:
            os.system("taskkill /f /im HGO.exe >nul 2>&1")
        except: pass
        return False