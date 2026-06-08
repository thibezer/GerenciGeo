import threading
import logging
import sys
import os
import time

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from converterrinex import converter_rinex # Importamos a nova função de conversão em lote
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
        self.caminho_exe = caminho_exe or r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe"
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

        self.result_queue.put({"tipo": "log", "mensagem": f"Iniciando conversão de {total} arquivos GNSS com HGO..."})

        # 2. SE EXECUÇÃO CANCELADA
        if self._stop_event.is_set():
            self.result_queue.put({"tipo": "log", "mensagem": "[CANCELADO] Interrupção pelo usuário antes do início."})
            return

        # 3. CHAMAR O CONVERSOR RINEX DO HGO
        try:
            self.result_queue.put({"tipo": "log", "mensagem": "[HGO] Iniciando automação do HGO no backend..."})
            
            # Chama a função principal de conversão
            sucesso_geral = converter_rinex(validos, self.pasta_destino, caminho_exe=self.caminho_exe)
            
            # Se cancelou durante a conversão
            if self._stop_event.is_set():
                self.result_queue.put({"tipo": "log", "mensagem": "[CANCELADO] Interrupção pelo usuário."})
                return

            self.result_queue.put({"tipo": "log", "mensagem": f"[HGO] Conversão concluída. Processando resultados..."})
            
            # 4. PROCESSAR E REGISTRAR OS RESULTADOS INDIVIDUAIS
            for i, arquivo in enumerate(validos):
                nome_arq = os.path.basename(arquivo)
                tamanho = os.path.getsize(arquivo)
                prefixo = os.path.splitext(nome_arq)[0].lower()
                
                # Busca dinâmica na pasta de destino por arquivos que correspondam ao prefixo e à extensão de observação RINEX (.obs, .o, ou .yyo onde yy é o ano)
                import re
                obs_path = None
                if os.path.exists(self.pasta_destino):
                    for f_dest in os.listdir(self.pasta_destino):
                        f_dest_lower = f_dest.lower()
                        if f_dest_lower.startswith(prefixo):
                            ext = os.path.splitext(f_dest_lower)[1]
                            if ext in ['.obs', '.o'] or re.match(r'^\.\d{2}o$', ext):
                                obs_path = os.path.join(self.pasta_destino, f_dest)
                                break
                
                
                # Verifica se o arquivo foi realmente gerado e tem dados
                if obs_path and os.path.exists(obs_path) and os.path.getsize(obs_path) > 0:
                    meta = ler_metadados_rinex(obs_path)
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
                        self.result_queue.put({"tipo": "log", "mensagem": f"   [SUCESSO] {nome_arq} convertido para {os.path.basename(obs_path)} (Marcador: {meta['marcador']})"})
                    else:
                        self.repo.insert(nome_arq, tamanho, arquivo, sucesso=True)
                        self.result_queue.put({"tipo": "log", "mensagem": f"   [SUCESSO] {nome_arq} convertido para {os.path.basename(obs_path)} (Metadados ilegíveis)"})
                        
                    if self.workspace_mgr and self.levantamento_id:
                        pasta_workspace_rinex = self.workspace_mgr.get_levantamento_folder(self.levantamento_id) / "Rinex"
                        if os.path.normpath(os.path.dirname(obs_path)) != os.path.normpath(pasta_workspace_rinex):
                            try:
                                self.workspace_mgr.move_file_to_workspace(self.levantamento_id, obs_path, "Rinex")
                                self.result_queue.put({"tipo": "log", "mensagem": f"   [ARQUIVO MOVIDO] {os.path.basename(obs_path)} para o Workspace."})
                            except Exception as e:
                                self.result_queue.put({"tipo": "log", "mensagem": f"   [AVISO] Erro ao mover {obs_path} para o Workspace: {e}"})
                else:
                    self.repo.insert(nome_arq, tamanho, arquivo, sucesso=False)
                    self.result_queue.put({"tipo": "log", "mensagem": f"   [FALHA] {nome_arq} não pôde ser convertido."})
            
        except Exception as e:
            self.result_queue.put({"tipo": "erro_fatal", "mensagem": f"Erro crítico durante a automação do HGO: {e}"})
            return

        self.result_queue.put({"tipo": "concluido", "mensagem": "Todos os processamentos finalizados."})
        self.result_queue.put({"tipo": "log", "mensagem": ">>> Lote de conversão HGO 100% finalizado!"})