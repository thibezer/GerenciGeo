import threading
import logging
import sys
import os
import ctypes
import time
import subprocess
from pywinauto.application import Application

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from converterrinex import converter_rinex_ativo # Importamos a função nova do arquivo na raiz
from database.repository import HistoricoRinexRepo
from business.triagem_inteligente import ler_metadados_rinex
from business.workspace_manager import WorkspaceManager

logger = logging.getLogger(__name__)

class GNSSPipelineWorker(threading.Thread):
    def __init__(self, lista_arquivos, pasta_destino, result_queue, caminho_exe=None, levantamento_id=None):
        super().__init__()
        self.lista_arquivos = lista_arquivos
        self.pasta_destino = pasta_destino
        self.result_queue = result_queue
        self.caminho_exe = caminho_exe or r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\ConvertRinex.exe"
        self.repo = HistoricoRinexRepo()
        self.daemon = True
        self._stop_event = threading.Event()
        self.levantamento_id = levantamento_id
        self.workspace_mgr = WorkspaceManager() if levantamento_id else None

    def stop(self):
        self._stop_event.set()

    def run(self):
        # 1. TRIAGEM DE QUALIDADE (< 50KB)
        validos = []
        corrompidos = []
        
        for arq in self.lista_arquivos:
            tamanho = os.path.getsize(arq)
            if tamanho < 51200:
                corrompidos.append(arq)
                # Persistência física imediata para o Action Center detectar o arquivo corrompido
                nome_arq = os.path.basename(arq)
                self.repo.insert(
                    arquivo_nome=nome_arq,
                    arquivo_tamanho=tamanho,
                    arquivo_path=arq,
                    sucesso=False
                )
            else:
                validos.append(arq)
                
        if corrompidos:
            self.result_queue.put({"tipo": "log", "mensagem": f"[FILTRO QC] {len(corrompidos)} arquivos menores que 50KB ignorados e salvos no histórico."})

        total = len(validos)
        if total == 0:
            self.result_queue.put({"tipo": "log", "mensagem": "Nenhum arquivo válido para processar."})
            return

        self.result_queue.put({"tipo": "log", "mensagem": f"Iniciando conversão de {total} arquivos GNSS..."})

        # 2. INICIA O PROGRAMA COMO ADMINISTRADOR (UAC)
        try:
            if not os.path.exists(self.caminho_exe):
                self.result_queue.put({"tipo": "erro_fatal", "mensagem": f"Executável não encontrado: {self.caminho_exe}"})
                return

            self.result_queue.put({"tipo": "log", "mensagem": "[LIMPEZA] Encerrando instâncias antigas..."})
            subprocess.run(["taskkill", "/f", "/im", "ConvertRinex.exe", "/t"], capture_output=True, shell=True)
            time.sleep(1.5)

            self.result_queue.put({"tipo": "log", "mensagem": "[UAC] Solicitando permissão de Administrador para o ConvertRinex..."})
            
            # Pede a elevação pelo shell do Windows diretamente
            ctypes.windll.shell32.ShellExecuteW(None, "runas", self.caminho_exe, None, None, 1)
            
            # Aguarda o usuário clicar em "Sim" e o programa carregar (Aumentado para 8s para segurança)
            time.sleep(8) 
            
            # Conecta à instância que acabou de abrir
            app = Application(backend="uia").connect(path=self.caminho_exe, timeout=30)
            janela = app.window(title_re=".*ConvertRinex.*")
            janela.wait('ready', timeout=25)
            
        except Exception as e:
            self.result_queue.put({"tipo": "erro_fatal", "mensagem": f"Falha ao abrir o ConvertRinex com privilégios: {e}"})
            return

        # 3. RODA A ESTEIRA
        for i, arquivo in enumerate(validos):
            if self._stop_event.is_set():
                self.result_queue.put({"tipo": "log", "mensagem": "[CANCELADO] Interrupção pelo usuário."})
                break
                
            nome_arq = os.path.basename(arquivo)
            tamanho = os.path.getsize(arquivo)
            try:
                self.result_queue.put({"tipo": "log", "mensagem": f"[{i+1}/{total}] Convertendo: {nome_arq}"})
                
                sucesso = converter_rinex_ativo(janela, arquivo, self.pasta_destino)

                if sucesso:
                    # Tenta ler metadados do arquivo gerado
                    # O ConvertRinex gera arquivos com o mesmo nome na pasta destino, mas extensão .obs ou .??o
                    # Vamos procurar o .obs ou similar na pasta de destino que corresponda ao arquivo original
                    obs_path = os.path.join(self.pasta_destino, os.path.splitext(nome_arq)[0] + ".obs")
                    if not os.path.exists(obs_path):
                        # Caso não ache .obs, procura qualquer um que termine em 'o' ou 'O'
                        prefixo = os.path.splitext(nome_arq)[0].lower()
                        for f_dest in os.listdir(self.pasta_destino):
                            if f_dest.lower().startswith(prefixo) and f_dest.lower().endswith(('o', '.obs')):
                                obs_path = os.path.join(self.pasta_destino, f_dest)
                                break
                    
                    meta = ler_metadados_rinex(obs_path) if os.path.exists(obs_path) else None
                    
                    if meta:
                        self.repo.insert(
                            arquivo_nome=nome_arq,
                            arquivo_tamanho=tamanho,
                            arquivo_path=arquivo,
                            ponto_nome=meta['marcador'],
                            data_inicio=meta['inicio'],
                            data_fim=meta['fim'],
                            latitude=meta['lat'],
                            longitude=meta['lon'],
                            sucesso=True
                        )
                    else:
                        self.repo.insert(nome_arq, tamanho, arquivo, sucesso=True)

                    if self.workspace_mgr and self.levantamento_id and os.path.exists(obs_path):
                        try:
                            # Move arquivo gerado (.obs) para a pasta Rinex
                            self.workspace_mgr.move_file_to_workspace(self.levantamento_id, obs_path, "Rinex")
                            self.result_queue.put({"tipo": "log", "mensagem": f"   [ARQUIVO MOVIDO] {os.path.basename(obs_path)} para o Workspace."})
                        except Exception as e:
                            self.result_queue.put({"tipo": "log", "mensagem": f"   [AVISO] Erro ao mover {obs_path} para o Workspace: {e}"})
                else:
                    self.repo.insert(nome_arq, tamanho, arquivo, sucesso=False)
                    self.result_queue.put({"tipo": "log", "mensagem": f"   [AVISO] Falha ao converter {nome_arq}"})

            except Exception as e:
                self.repo.insert(nome_arq, tamanho, arquivo, sucesso=False)
                self.result_queue.put({"tipo": "log", "mensagem": f"   [ERRO] Crash em {nome_arq}: {repr(e)}"})

        # 4. DESLIGA O PROGRAMA
        try:
            if 'janela' in locals() and janela.exists():
                janela.close()
            if 'app' in locals():
                app.kill()
        except:
            # Força encerramento via taskkill se a automação falhar no fechamento
            subprocess.run(["taskkill", "/f", "/im", "ConvertRinex.exe", "/t"], capture_output=True, shell=True)

        self.result_queue.put({"tipo": "concluido", "mensagem": "Todos os processamentos finalizados."})
        self.result_queue.put({"tipo": "log", "mensagem": ">>> Lote de conversão RPA 100% finalizado!"})