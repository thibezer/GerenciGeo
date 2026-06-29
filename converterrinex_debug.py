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

def converter_rinex(arquivos_origem, pasta_destino, caminho_exe=r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe"):
    """
    Realiza a conversão de um ou mais arquivos .GNS para RINEX usando o HGO sem interrupções (modo contínuo).
    Os timeouts de janelas GUI foram reduzidos para 5 segundos para otimizar a velocidade.
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
        print("Finalizando qualquer processo anterior do HGO...")
        os.system("taskkill /f /im HGO.exe >nul 2>&1")
        time.sleep(0.5)
        
        # Inicia HGO com RunAsInvoker e define a pasta de execução CWD segura (evitando C:\WINDOWS\system32)
        print("Iniciando HGO.exe com CWD seguro...")
        os.environ["__COMPAT_LAYER"] = "RunAsInvoker"
        cwd_seguro = os.path.dirname(os.path.abspath(__file__))
        proc = subprocess.Popen([caminho_exe], cwd=cwd_seguro)
        # Conecta ao HGO.exe recém-iniciado pelo PID do processo (timeout de 10 segundos)
        print("Conectando ao HGO.exe pelo PID...")
        app = Application(backend="uia").connect(process=proc.pid, timeout=10)
        janela = app.window(title_re="(?i).*hi-target.*")
        print("Aguardando janela principal estar pronta...")
        janela.wait('ready', timeout=10)
        janela.set_focus()
        
        # 1. Cria o projeto
        print("Criando Novo Projeto via Alt+F -> N...")
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
        print(f"Definindo nome do projeto temporario: {proj_name}")
        tb_name.set_edit_text(proj_name)
        time.sleep(0.2)
        
        print("Confirmando criacao do projeto (Clicando em OK(O))...")
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
        
        # 2. Propriedades do Projeto -> OK
        print("Aguardando se abre automaticamente ou abrindo Propriedades do Projeto via Alt+F -> P...")
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
        
        print("Selecionando a aba 'Avancado'...")
        tab_avancado = dlg_prop.child_window(title="Avancado", control_type="TabItem")
        tab_avancado.select()
        time.sleep(0.3)
        
        cb_chars = dlg_prop.child_window(auto_id="cbZHDPtNameType", control_type="ComboBox")
        try:
            cb_chars.select("8")
            time.sleep(0.3)
            print(" -> Selecionado '8' via UIA.")
        except Exception as ex:
            print(f" -> Falha ao selecionar diretamente, usando teclado: {ex}")
            cb_chars.set_focus()
            send_keys("8{ENTER}", pause=0.01)
            time.sleep(0.3)
        
        print("Confirmando Propriedades do Projeto (Clicando em OK(O))...")
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
        
        # 3. Janela de Coordenadas -> Seleciona SIRGAS_UTM22S
        print("Aguardando se abre automaticamente ou abrindo Sistema de Coordenadas via Alt+F -> R...")
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
        print("Mapeando coordenadas fisicas da tela...")
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
        
        print(f"Clicando fisicamente no item 'SIRGAS_UTM22S' em X={x_clique}, Y={y_clique}...")
        import pywinauto.mouse as mouse
        mouse.click(button='left', coords=(x_clique, y_clique))
        time.sleep(1.2) # Aguarda o HGO processar o template carregado
        
        # Confirma sistema de coordenadas via botão OK (btOk) ou Enter
        print("Confirmando Sistema de Coordenadas (Clicando no botão OK)...")
        btn_ok = None
        try:
            btn_ok = dlg_coord.child_window(title="OK", auto_id="btOk", control_type="Button")
        except:
            pass
        if btn_ok and btn_ok.exists():
            btn_ok.click_input()
        else:
            send_keys("{ENTER}")
        
        # 4. Importar arquivos GNS
        print("Preparando importacao de arquivos...")
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
        
        print("Acionando botao de selecao de arquivos...")
        send_keys("%s")
        
        # Diálogo do Windows "Abrir"
        dlg_abrir = janela.child_window(title="Abrir", control_type="Window")
        dlg_abrir.wait('ready', timeout=5)
        
        print("Inserindo caminhos dos arquivos brutos GNSS...")
        caminhos_formatados = " ".join([f'"{arq}"' for arq in arquivos_origem])
        edit_box = dlg_abrir.child_window(class_name="Edit", control_type="Edit")
        edit_box.set_edit_text(caminhos_formatados)
        time.sleep(0.2)
        
        print("Confirmando dialogo de arquivo 'Abrir' clicando programaticamente no botao...")
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
        print("Focando janela principal do HGO...")
        janela.set_focus()
        send_keys("{ESC}")
        time.sleep(0.2)
        tab_control = janela.child_window(auto_id="tabControl1", control_type="Tab")
        tab_item = tab_control.child_window(title="Arq-Observacoes", control_type="TabItem")
        print("Selecionando aba 'Arq-Observacoes'...")
        tab_item.select()
        time.sleep(0.5)
        
        # Localiza e aguarda dinamicamente que o DataGridView esteja pronto na tela
        table = janela.child_window(title="DataGridView", auto_id="dataGridView1", control_type="Table")
        table.wait('ready', timeout=15)
        
        print("Focando tabela de arquivos (Clicando com o botão esquerdo na primeira linha)...")
        table.click_input(button="left", coords=(100, 60))
        time.sleep(0.3)
        send_keys("^a")
        time.sleep(0.5)
        
        print("Abrindo menu de contexto via clique com o botão direito na primeira linha da tabela...")
        table.click_input(button="right", coords=(100, 60))
        time.sleep(0.8)
        
        # Executa "Converter para Rinex(R)"
        print("Enviando comando para Converter para Rinex...")
        send_keys("r")
        time.sleep(0.3)
        send_keys("{ENTER}")
        
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
            
            # Adiciona a pasta de origem de cada arquivo GNSS bruto (e suas subpastas)
            for arq in arquivos_origem:
                origem_dir = os.path.dirname(os.path.abspath(arq))
                if os.path.exists(origem_dir):
                    diretorios_busca.append((origem_dir, False))
                    try:
                        for item in os.listdir(origem_dir):
                            caminho_item = os.path.join(origem_dir, item)
                            if os.path.isdir(caminho_item):
                                diretorios_busca.append((caminho_item, False))
                                diretorios_busca.append((os.path.join(caminho_item, "Rinex"), False))
                    except: pass
            
            # Adiciona a pasta de destino final (caso já tenham sido jogados lá)
            if os.path.exists(pasta_destino):
                diretorios_busca.append((pasta_destino, False))
                
            # Adiciona caminhos comuns de Area de Trabalho (onde o HGO costuma salvar os arquivos convertidos)
            paths_desktop = [
                r"D:\OneDrive_Thiago\OneDrive\Arquivos de Microsoft Copilot Chat\Área de Trabalho",
                os.path.join(os.path.expanduser("~"), "Desktop"),
                os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop"),
                os.path.join(os.path.expanduser("~"), "OneDrive", "Área de Trabalho"),
                os.path.join(os.path.expanduser("~"), "Arquivos de Microsoft Copilot Chat", "Área de Trabalho")
            ]
            for dp in paths_desktop:
                if os.path.exists(dp):
                    diretorios_busca.append((dp, False))
                
            # Filtra diretórios válidos e remove duplicatas
            diretorios_filtrados = []
            vistos = set()
            for d, filt_data in diretorios_busca:
                d_norm = os.path.normpath(d)
                if os.path.exists(d_norm) and d_norm not in vistos:
                    vistos.add(d_norm)
                    diretorios_filtrados.append((d_norm, filt_data))
                    
            for pasta, filtrar_data in diretorios_filtrados:
                try:
                    arquivos_pasta = os.listdir(pasta)
                except Exception as ex_list:
                    print(f"[AVISO] Ignorando pasta sem permissao de acesso: {pasta} ({ex_list})")
                    continue
                    
                for f in arquivos_pasta:
                    caminho_completo = os.path.join(pasta, f)
                    try:
                        if not os.path.isfile(caminho_completo):
                            continue
                    except:
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
                                if proj_dir and os.path.normpath(caminho_completo).startswith(os.path.normpath(proj_dir)):
                                    encontrados[f.lower()] = caminho_completo
                                else:
                                    mtime = os.path.getmtime(caminho_completo)
                                    if mtime >= (inicio_conversao - 600):
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
        time.sleep(4.0)
        
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

if __name__ == "__main__":
    arq_origem = r"D:\OneDrive_Thiago\OneDrive\Arquivos de Microsoft Copilot Chat\Área de Trabalho\2sarad8.GNS"
    pasta_dest = r"D:\OneDrive_Thiago\OneDrive\Desenvolvimento\GerenciGeo\scratch\debug_out"
    print(f"=== SCRIPT DE EXECUÇÃO CONTÍNUA HGO ===")
    print(f"Arquivo de origem: {arq_origem}")
    print(f"Diretorio destino: {pasta_dest}")
    print("Certifique-se de que a tela do computador nao esteja bloqueada e que o HGO possa assumir o foco.")
    
    # Execução contínua sem pausas
    sucesso = converter_rinex(arq_origem, pasta_dest)
    print(f"\n[FIM] Processo concluído de ponta a ponta. Retorno do HGO: {sucesso}")
