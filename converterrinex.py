import os
import time
from pywinauto.application import Application
from pywinauto.keyboard import send_keys

def converter_rinex_ativo(janela, arquivo_origem, pasta_destino):
    """
    Executa os comandos de UI em uma janela do ConvertRinex que JÁ ESTÁ ABERTA.
    """
    if not arquivo_origem or not pasta_destino:
        print("    [ERRO] Caminho de origem ou destino está vazio.")
        return False

    arquivo_origem = os.path.normpath(arquivo_origem)
    pasta_destino = os.path.normpath(pasta_destino)

    try:
        janela.set_focus()
        print(f" -> Automatizando: {os.path.basename(arquivo_origem)}")
        
        # 1. Clique no botão de carregar (Abrir)
        btn_abrir_origem = janela.child_window(auto_id="btLoadFile", control_type="Button")
        btn_abrir_origem.click_input()
        
        # Aguarda a janela de arquivo do Windows
        time.sleep(1.0)
        
        # 2. Injeção do caminho do arquivo
        # Tenta focar no campo de nome de arquivo (Alt+N funciona em diálogos padrão do Windows)
        try:
            # Tenta clicar no campo de edição de nome de arquivo se disponível para garantir foco
            dialogo_abrir = app.window(title_re=".*Abrir.*") # Tenta achar a janela de diálogo
            edit_nome = dialogo_abrir.child_window(control_type="Edit", found_index=0)
            edit_nome.click_input()
        except:
            send_keys("%n", pause=0.2) 
            
        send_keys(arquivo_origem, with_spaces=True, pause=0.01)
        time.sleep(0.8) # Mais tempo para o Windows processar o caminho longo
        send_keys("{ENTER}")
        
        # Espera o software carregar os dados do arquivo (importante para arquivos grandes)
        time.sleep(1.5)
        
        # 3. Preencher Pasta de Destino
        # Tentamos por auto_id primeiro, depois por nome se falhar
        try:
            caixa_destino = None
            try:
                caixa_destino = janela.child_window(auto_id="tbOutFileDic", control_type="Edit")
            except:
                # Fallback: procura pelo controle de edição que costuma ser o destino
                caixa_destino = janela.child_window(control_type="Edit", found_index=0)

            if caixa_destino:
                caixa_destino.click_input() # Garante o foco
                send_keys("^a{BACKSPACE}", pause=0.1) # Limpa o campo
                caixa_destino.type_keys(pasta_destino, with_spaces=True, pause=0.01)
            else:
                print("    [AVISO] Não foi possível localizar o campo de destino.")
        except Exception as e:
            print(f"    [ERRO DESTINO] Falha ao preencher pasta: {e}")
            
        # 4. Configurar Versão RINEX para 2.11 (Opcional, mas recomendado)
        try:
            combo_versao = janela.child_window(auto_id="cbRinexVersion", control_type="ComboBox")
            if combo_versao.exists():
                combo_versao.select(0) # Geralmente 2.11 é o primeiro
        except: pass
        
        # 5. Clicar em Converter
        btn_converter = janela.child_window(auto_id="btConvert", control_type="Button")
        btn_converter.click() # Usar click() normal em vez de invoke() para maior compatibilidade
        
        # 6. Esperar finalização
        tempo_espera = 0
        limite_timeout = 180 # Aumentado para 3 min para arquivos muito longos
        
        # O botão costuma ficar desabilitado durante a conversão
        while not btn_converter.is_enabled():
            time.sleep(1.0)
            tempo_espera += 1
            if tempo_espera > limite_timeout:
                print(f"    [TIMEOUT] Conversão demorou demais: {arquivo_origem}")
                return False
            
        return True

    except Exception as e:
        print(f"    [FALHA] Erro na automação de {os.path.basename(arquivo_origem)}: {repr(e)}")
        return False


def converter_rinex(arquivo_origem, pasta_destino, caminho_exe=r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\ConvertRinex.exe"):
    """
    Wrapper para conversão única (abre o programa, converte e fecha).
    Mantido para casos em que você precise rodar 1 único arquivo isoladamente.
    """
    arquivo_origem = os.path.normpath(arquivo_origem)
    pasta_destino = os.path.normpath(pasta_destino)
    
    if not os.path.exists(arquivo_origem):
        return False
        
    try:
        os.environ["__COMPAT_LAYER"] = "RunAsInvoker"
        app = Application(backend="uia").start(caminho_exe)
        janela = app.window(title_re=".*ConvertRinex.*")
        janela.wait('ready', timeout=15)
        
        sucesso = converter_rinex_ativo(janela, arquivo_origem, pasta_destino)
        
        try:
            janela.close()
            app.kill()
        except: pass
            
        return sucesso
    except Exception as e:
        print(f"Erro na execução individual: {e}")
        return False