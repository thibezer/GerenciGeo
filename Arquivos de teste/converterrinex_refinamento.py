import os
import time
import shutil
import subprocess
import re
import asyncio
from pywinauto.application import Application
from pywinauto.keyboard import send_keys
from pywinauto import timings

# Configura tempos ultrarrápidos globais para o pywinauto
timings.Timings.fast()
timings.Timings.after_clickinput_wait = 0.02
timings.Timings.after_click_wait = 0.02
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

async def converter_rinex(arquivos_origem, pasta_destino, caminho_exe=r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe", modo_interativo=True):
    """
    Realiza a conversão de arquivos .GNS para RINEX usando o HGO com pausas interativas para calibração fina de tempo e validação visual de cada passo.
    """
    if isinstance(arquivos_origem, str):
        arquivos_origem = [arquivos_origem]
        
    arquivos_origem = [os.path.normpath(os.path.abspath(a)) for a in arquivos_origem if os.path.exists(a)]
    pasta_destino = os.path.normpath(os.path.abspath(pasta_destino))
    
    if not arquivos_origem:
        print("[ERRO] Nenhum arquivo de origem válido foi encontrado.")
        return False
        
    os.makedirs(pasta_destino, exist_ok=True)
    
    timestamp = int(time.time())
    proj_name = f"proj_hgo_auto_{timestamp}"
    
    desktop_dir = None
    proj_dir = None
    
    def pausar_e_perguntar(nome_passo, descricao, tempo_passo=None):
        if modo_interativo:
            tempo_str = f" (Tempo decorrido: {tempo_passo:.2f}s)" if tempo_passo is not None else ""
            print(f"\n==================================================")
            print(f" ⏸️ PAUSA - {nome_passo}{tempo_str}")
            print(f" Ação realizada: {descricao}")
            print(f"==================================================")
            input("👉 Confira na tela e pressione ENTER no terminal para continuar para o próximo passo...")

    try:
        # PASSO 1: Inicialização do HGO
        t0 = time.perf_counter()
        print("\n[PASSO 1] Fechando HGOs antigos e iniciando novo HGO.exe...")
        os.system("taskkill /f /im HGO.exe >nul 2>&1")
        await asyncio.sleep(0.1)
        
        os.environ["__COMPAT_LAYER"] = "RunAsInvoker"
        cwd_seguro = os.path.dirname(os.path.abspath(__file__))
        proc = await asyncio.create_subprocess_exec(caminho_exe, cwd=cwd_seguro)
        
        app = Application(backend="uia").connect(process=proc.pid, timeout=8)
        janela = app.window(title_re="(?i).*hi-target.*")
        janela.wait('ready', timeout=8)
        janela.set_focus()
        t1 = time.perf_counter() - t0
        
        pausar_e_perguntar("PASSO 1: Abertura do HGO", "Aplicação HGO.exe aberta e focada.", t1)

        # PASSO 2: Abrir janela Novo Projeto (Alt+F -> N)
        t0 = time.perf_counter()
        print("\n[PASSO 2] Abrindo menu de Novo Projeto (Alt+F -> N)...")
        send_keys("%f")
        time.sleep(0.15)
        send_keys("n")
        
        dlg_novo = janela.child_window(auto_id="frmNewProject", control_type="Window")
        dlg_novo.wait('ready', timeout=4)
        
        tb_path = dlg_novo.child_window(auto_id="tbWorkPath", control_type="Edit")
        desktop_dir = os.path.normpath(os.path.abspath(tb_path.window_text()))
        proj_dir = os.path.normpath(os.path.abspath(os.path.join(desktop_dir, proj_name)))
        
        tb_name = dlg_novo.child_window(auto_id="tbProjectName", control_type="Edit")
        tb_name.set_edit_text(proj_name)
        time.sleep(0.1)
        t2 = time.perf_counter() - t0
        
        pausar_e_perguntar("PASSO 2: Novo Projeto", f"Janela Novo Projeto aberta e nome '{proj_name}' preenchido.", t2)

        # PASSO 3: Confirmar Novo Projeto e ir para Propriedades
        t0 = time.perf_counter()
        print("\n[PASSO 3] Confirmando nome do projeto e abrindo Propriedades...")
        send_keys("{ENTER}")
        
        time.sleep(0.2)
        try:
            dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
            dlg_prop.wait('ready', timeout=2.0)
        except:
            janela.set_focus()
            send_keys("%f")
            time.sleep(0.15)
            send_keys("p")
            dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
            dlg_prop.wait('ready', timeout=3.0)
            
        t3 = time.perf_counter() - t0
        pausar_e_perguntar("PASSO 3: Propriedades do Projeto", "Janela Propriedades do Projeto aberta.", t3)

        # PASSO 4: Confirmar Propriedades e Tratar Coordenadas
        t0 = time.perf_counter()
        print("\n[PASSO 4] Confirmando Propriedades (ENTER) e tratando diálogo de Coordenadas...")
        send_keys("{ENTER}")
        
        time.sleep(0.2)
        try:
            dlg_coord = janela.child_window(auto_id="frmCoord", control_type="Window")
            if dlg_coord.exists():
                send_keys("{ENTER}")
        except: pass
        
        t4 = time.perf_counter() - t0
        pausar_e_perguntar("PASSO 4: Coordenadas / Confirmação", "Propriedades confirmadas e projeto criado na tela principal.", t4)

        # PASSO 5: Abrir diálogo de Importação GNS (Alt+F -> I)
        t0 = time.perf_counter()
        print("\n[PASSO 5] Abrindo janela de Importação de arquivos GNS (Alt+F -> I)...")
        time.sleep(0.2)
        janela.set_focus()
        send_keys("{ESC}")
        time.sleep(0.1)
        send_keys("%f")
        time.sleep(0.15)
        send_keys("i")
        
        dlg_importar = janela.child_window(auto_id="frmFileFilter", control_type="Window")
        dlg_importar.wait('ready', timeout=4)
        
        send_keys("%s")
        
        dlg_abrir = janela.child_window(title="Abrir", control_type="Window")
        dlg_abrir.wait('ready', timeout=4)
        
        caminhos_formatados = " ".join([f'"{arq}"' for arq in arquivos_origem])
        edit_box = dlg_abrir.child_window(class_name="Edit", control_type="Edit")
        edit_box.set_edit_text(caminhos_formatados)
        time.sleep(0.1)
        t5 = time.perf_counter() - t0
        
        pausar_e_perguntar("PASSO 5: Seleção de Arquivo GNS", f"Caminho do arquivo injetado na janela Abrir: {caminhos_formatados}", t5)

        # PASSO 6: Confirmar Importação e Aguardar .zsd
        t0 = time.perf_counter()
        print("\n[PASSO 6] Confirmando importação no diálogo (ENTER) e aguardando arquivo bruto (.zsd)...")
        send_keys("{ENTER}")
        
        obs_dir = os.path.join(proj_dir, "ObsBinData")
        arquivos_esperados = [os.path.splitext(os.path.basename(a))[0] + ".zsd" for a in arquivos_origem]
        timeout_importacao = 15
        inicio_espera = time.time()
        
        while True:
            todos_existem = False
            if os.path.exists(obs_dir):
                arquivos_pasta = os.listdir(obs_dir)
                todos_existem = all(arq in arquivos_pasta for arq in arquivos_esperados)
                
            if todos_existem:
                try:
                    tamanhos_iniciais = {arq: os.path.getsize(os.path.join(obs_dir, arq)) for arq in arquivos_esperados}
                    time.sleep(0.3)
                    tamanhos_finais = {arq: os.path.getsize(os.path.join(obs_dir, arq)) for arq in arquivos_esperados}
                    if tamanhos_iniciais == tamanhos_finais:
                        break
                except: pass
                    
            if time.time() - inicio_espera > timeout_importacao:
                break
            time.sleep(0.1)
            
        t6 = time.perf_counter() - t0
        pausar_e_perguntar("PASSO 6: Processamento de Importação Bruta", "Arquivo .zsd importado e estabilizado na pasta do projeto.", t6)

        # PASSO 7: Ativar Aba Arq-Observações e disparar conversão RINEX
        t0 = time.perf_counter()
        print("\n[PASSO 7] Selecionando aba 'Arq-Observacoes' e disparando comando RINEX...")
        time.sleep(0.2)
        janela.set_focus()
        send_keys("{ESC}")
        time.sleep(0.1)
        
        tab_control = janela.child_window(auto_id="tabControl1", control_type="Tab")
        tab_item = tab_control.child_window(title="Arq-Observacoes", control_type="TabItem")
        tab_item.select()
        time.sleep(0.2)
        
        table = janela.child_window(title="DataGridView", auto_id="dataGridView1", control_type="Table")
        table.wait('ready', timeout=8)
        
        table.click_input(button="left", coords=(100, 40))
        time.sleep(0.1)
        send_keys("^a")
        time.sleep(0.1)
        
        table.click_input(button="right", coords=(100, 40))
        time.sleep(0.2)
        
        send_keys("r{ENTER}")
        t7 = time.perf_counter() - t0
        
        pausar_e_perguntar("PASSO 7: Disparo da Conversão RINEX", "Comando de conversão acionado na tabela de observações.", t7)

        # PASSO 8: Aguardar Conclusão da Conversão RINEX
        t0 = time.perf_counter()
        print("\n[PASSO 8] Monitorando geração dos arquivos RINEX...")
        inicio_conversao = time.time()
        timeout_conversao = 25.0
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
            bases_prontas = sum(
                1 for nb in nomes_base_origem
                if any(k.startswith(nb) and (k.endswith('.obs') or k.endswith('.o') or bool(re.match(r'^.+\.\d{2}o$', k))) for k in arqs_dict.keys())
            )

            if bases_prontas >= len(nomes_base_origem) and len(arqs_dict) > 0:
                try:
                    tamanhos_ini = {path: os.path.getsize(path) for path in arqs_dict.values()}
                    time.sleep(0.3)
                    arqs_dict_check = encontrar_arquivos_rinex_temp()
                    tamanhos_fim = {path: os.path.getsize(path) for path in arqs_dict_check.values()}
                    if tamanhos_ini == tamanhos_fim:
                        print(f" -> Conversão Rinex concluída dinamicamente em {time.time() - inicio_conversao:.1f}s ({len(arqs_dict)} arquivos gerados).")
                        break
                except: pass

            if time.time() - inicio_conversao > timeout_conversao:
                break
            time.sleep(0.2)
            
        t8 = time.perf_counter() - t0
        pausar_e_perguntar("PASSO 8: Finalização do RINEX", f"Arquivos RINEX gerados com sucesso no disco.", t8)

        # Encerramento seguro
        try:
            janela.close()
        except: pass
        os.system("taskkill /f /im HGO.exe >nul 2>&1")
        return True
        
    except Exception as e:
        print(f"[FALHA] Erro na conversão HGO: {e}")
        try:
            os.system("taskkill /f /im HGO.exe >nul 2>&1")
        except: pass
        return False

if __name__ == "__main__":
    diretorio_atual = os.path.dirname(os.path.abspath(__file__))
    arquivo_cobaia = os.path.normpath(os.path.join(diretorio_atual, "16062026.GNS"))
    pasta_saida_teste = os.path.normpath(os.path.join(diretorio_atual, "Saida_Rinex_Teste"))

    print("==================================================")
    print(" REFINAMENTO INTERATIVO PASSO A PASSO (HGO.EXE)")
    print(f" Arquivo cobaia: {arquivo_cobaia}")
    print(f" Pasta de saída: {pasta_saida_teste}")
    print("==================================================")

    # Executa com modo interativo ativado por padrão
    asyncio.run(converter_rinex(arquivo_cobaia, pasta_saida_teste, modo_interativo=True))
