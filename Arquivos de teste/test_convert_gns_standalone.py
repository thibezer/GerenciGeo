import os
import time
import subprocess
import re
import asyncio
from pywinauto.application import Application
from pywinauto.keyboard import send_keys
from pywinauto import timings

timings.Timings.fast()
timings.Timings.after_clickinput_wait = 0.05
timings.Timings.after_click_wait = 0.05
timings.Timings.after_setcursorpos_wait = 0.01

def test_hgo_standalone(arquivo_gns, pasta_saida):
    arquivo_gns = os.path.normpath(os.path.abspath(arquivo_gns))
    pasta_saida = os.path.normpath(os.path.abspath(pasta_saida))
    os.makedirs(pasta_saida, exist_ok=True)

    caminho_exe = r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe"
    timestamp = int(time.time())
    proj_name = f"proj_teste_{timestamp}"

    print(f"\n==================================================")
    print(f"  TESTE STANDALONE COM HGO.EXE")
    print(f"  Arquivo GNS: {arquivo_gns}")
    print(f"  Pasta Saída: {pasta_saida}")
    print(f"==================================================\n")

    if not os.path.exists(arquivo_gns):
        print(f"[ERRO] Arquivo cobaia não encontrado: {arquivo_gns}")
        return False

    try:
        # PASSO 1: Encerrar instâncias anteriores e iniciar HGO.exe
        print("[PASSO 1] Encerrando HGOs antigos e iniciando novo processo HGO.exe...")
        os.system("taskkill /f /im HGO.exe >nul 2>&1")
        time.sleep(0.5)

        os.environ["__COMPAT_LAYER"] = "RunAsInvoker"
        cwd_bin = os.path.dirname(caminho_exe)
        proc = subprocess.Popen([caminho_exe], cwd=cwd_bin)
        
        print("[PASSO 1] Conectando pywinauto ao HGO.exe...")
        app = Application(backend="uia").connect(process=proc.pid, timeout=12)
        time.sleep(1.0)
        janela = app.top_window()
        print(f"  -> Janela principal encontrada: '{janela.window_text()}' (Control Type: {janela.element_info.control_type})")
        janela.set_focus()

        # PASSO 2: Criar Projeto Temporário
        print("\n[PASSO 2] Criando projeto temporário...")
        send_keys("%f")
        time.sleep(0.4)
        send_keys("n")

        dlg_novo = janela.child_window(auto_id="frmNewProject", control_type="Window")
        dlg_novo.wait('ready', timeout=6)

        tb_path = dlg_novo.child_window(auto_id="tbWorkPath", control_type="Edit")
        desktop_dir = os.path.normpath(os.path.abspath(tb_path.window_text()))
        proj_dir = os.path.normpath(os.path.abspath(os.path.join(desktop_dir, proj_name)))
        print(f"  -> Pasta de trabalho: {desktop_dir}")
        print(f"  -> Projeto temporário: {proj_dir}")

        tb_name = dlg_novo.child_window(auto_id="tbProjectName", control_type="Edit")
        tb_name.set_edit_text(proj_name)
        time.sleep(0.2)
        send_keys("{ENTER}")

        # PASSO 3: Propriedades do Projeto
        print("\n[PASSO 3] Confirmando Propriedades do Projeto...")
        time.sleep(0.3)
        dlg_prop = None
        try:
            dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
            dlg_prop.wait('ready', timeout=4.0)
        except:
            janela.set_focus()
            send_keys("%f")
            time.sleep(0.3)
            send_keys("p")
            try:
                dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
                dlg_prop.wait('ready', timeout=4.0)
            except: pass

        if dlg_prop and dlg_prop.exists():
            try:
                dlg_prop.set_focus()
                time.sleep(0.1)
                btn_ok = dlg_prop.child_window(auto_id="btOK", control_type="Button")
                if btn_ok.exists():
                    btn_ok.click_input()
                else:
                    send_keys("%o")
            except:
                send_keys("%o")

        # PASSO 4: Janela de Coordenadas (se surgir)
        time.sleep(0.3)
        try:
            dlg_coord = janela.child_window(auto_id="frmCoord", control_type="Window")
            dlg_coord.wait('ready', timeout=3.0)
            dlg_coord.set_focus()
            time.sleep(0.1)
            try:
                btn_coord_ok = dlg_coord.child_window(auto_id="btOk", control_type="Button")
                if btn_coord_ok.exists():
                    print("  -> Confirmando diálogo de coordenadas...")
                    btn_coord_ok.click_input()
                else:
                    send_keys("%o")
            except:
                send_keys("{ENTER}")
        except: pass

        # PASSO 5: Importar Arquivo GNS cobaia
        print("\n[PASSO 5] Abrindo janela de Importação (Alt+F -> I)...")
        time.sleep(0.3)
        janela.set_focus()
        time.sleep(0.2)
        send_keys("%f")
        time.sleep(0.3)
        send_keys("i")

        dlg_importar = janela.child_window(auto_id="frmFileFilter", control_type="Window")
        dlg_importar.wait('ready', timeout=5)

        send_keys("%s")

        dlg_abrir = janela.child_window(title="Abrir", control_type="Window")
        dlg_abrir.wait('ready', timeout=5)

        print(f"  -> Injetando caminho do arquivo cobaia no diálogo Abrir...")
        caminhos_formatados = f'"{arquivo_gns}"'
        edit_box = dlg_abrir.child_window(class_name="Edit", control_type="Edit")
        edit_box.set_edit_text(caminhos_formatados)
        time.sleep(0.2)
        send_keys("{ENTER}")

        # PASSO 6: Aguardar importação do .zsd
        obs_dir = os.path.join(proj_dir, "ObsBinData")
        nome_esperado = os.path.splitext(os.path.basename(arquivo_gns))[0] + ".zsd"
        print(f"\n[PASSO 6] Aguardando importação bruta no disco: {obs_dir} (Procurando: {nome_esperado})...")

        inicio_espera = time.time()
        while True:
            if os.path.exists(obs_dir):
                if nome_esperado in os.listdir(obs_dir):
                    t1 = os.path.getsize(os.path.join(obs_dir, nome_esperado))
                    time.sleep(0.5)
                    t2 = os.path.getsize(os.path.join(obs_dir, nome_esperado))
                    if t1 == t2 and t1 > 0:
                        print(f"  -> Arquivo bruto importado e estabilizado ({t2} bytes) em {time.time() - inicio_espera:.1f}s!")
                        break
            if time.time() - inicio_espera > 15:
                print("  -> [AVISO] Timeout na aguarda do .zsd. Prosseguindo...")
                break
            time.sleep(0.2)

        # PASSO 7: Ativar Aba Arq-Observações e disparar conversão RINEX
        print("\n[PASSO 7] Selecionando aba 'Arq-Observacoes' e disparando conversão para RINEX...")
        time.sleep(0.3)
        janela.set_focus()
        send_keys("{ESC}")
        time.sleep(0.2)

        tab_control = janela.child_window(auto_id="tabControl1", control_type="Tab")
        tab_item = tab_control.child_window(title="Arq-Observacoes", control_type="TabItem")
        tab_item.select()
        time.sleep(0.4)

        table = janela.child_window(title="DataGridView", auto_id="dataGridView1", control_type="Table")
        table.wait('ready', timeout=8)

        table.set_focus()
        time.sleep(0.2)
        janela.type_keys("^a", pause=0.1)
        time.sleep(0.2)
        janela.type_keys("+{F10}", pause=0.1)
        time.sleep(0.3)
        janela.type_keys("r{ENTER}", pause=0.1)
        print("  -> Comando de conversão RINEX enviado!")

        # PASSO 8: Monitorar geração dinâmica dos arquivos RINEX
        print("\n[PASSO 8] Monitorando geração dinâmica dos arquivos RINEX no disco...")
        inicio_conversao = time.time()
        nome_base = os.path.splitext(os.path.basename(arquivo_gns))[0].lower()

        arquivos_rinex_encontrados = []
        while True:
            pastas_varredura = [proj_dir, os.path.join(proj_dir, "Rinex"), desktop_dir, pasta_saida]
            encontrados = []
            for p_var in pastas_varredura:
                if not p_var or not os.path.exists(p_var): continue
                for f in os.listdir(p_var):
                    if f.lower().startswith(nome_base):
                        ext = os.path.splitext(f)[1].lower()
                        if ext in ['.obs', '.nav', '.o', '.n', '.g'] or re.match(r'^\.\d{2}[ong]$', ext):
                            encontrados.append(os.path.join(p_var, f))

            if encontrados:
                t_ini = {p: os.path.getsize(p) for p in encontrados}
                time.sleep(0.5)
                t_fim = {p: os.path.getsize(p) for p in encontrados}
                if t_ini == t_fim and all(sz > 0 for sz in t_fim.values()):
                    arquivos_rinex_encontrados = encontrados
                    print(f"  -> RINEX gerado e estabilizado em {time.time() - inicio_conversao:.1f}s!")
                    break

            if time.time() - inicio_conversao > 25:
                print("  -> [AVISO] Timeout aguardando geração RINEX.")
                break
            time.sleep(0.3)

        # PASSO 9: Copiar para pasta destino e encerrar
        print("\n[PASSO 9] Copiando arquivos gerados para a pasta de saída de teste e encerrando HGO...")
        import shutil
        for arq in arquivos_rinex_encontrados:
            dest = os.path.join(pasta_saida, os.path.basename(arq))
            shutil.copy2(arq, dest)
            print(f"  -> Arquivo copiado para: {dest} ({os.path.getsize(dest)} bytes)")

        try:
            janela.close()
        except: pass
        os.system("taskkill /f /im HGO.exe >nul 2>&1")

        print(f"\n==================================================")
        print(f"  TESTE CONCLUÍDO COM SUCESSO EM {time.time() - inicio_espera:.1f} SEGUNDOS!")
        print(f"==================================================\n")
        return True

    except Exception as e:
        print(f"\n[FALHA NO PASSO] Erro durante a automação: {e}")
        import traceback
        traceback.print_exc()
        try:
            os.system("taskkill /f /im HGO.exe >nul 2>&1")
        except: pass
        return False

if __name__ == "__main__":
    caminho_gns = os.path.abspath(r"Arquivos de teste\16062026.GNS")
    caminho_saida = os.path.abspath(r"Arquivos de teste\Saida_Rinex_Teste")
    test_hgo_standalone(caminho_gns, caminho_saida)
