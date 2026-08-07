import threading
import logging
import sys
import os
import re
import time

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio
import json

async def rodar_conversao_hgo_subprocess(
    arquivos: list[str],
    destino: str,
    caminho_exe: str = None
) -> dict:
    from config import PYTHON_32BIT_PATH, CONVERT_RINEX_SCRIPT

    cmd = [
        PYTHON_32BIT_PATH,
        CONVERT_RINEX_SCRIPT,
        *arquivos,
        "--destino", destino,
    ]
    if caminho_exe:
        cmd.extend(["--exe", caminho_exe])

    processo = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(processo.communicate(), timeout=300.0)
    except asyncio.TimeoutError:
        try:
            processo.kill()
        except OSError:
            pass
        raise RuntimeError("Timeout na conversão HGO (execução excedeu 300 segundos).")

    if stderr:
        logger.debug("stderr do converterrinex: %s", stderr.decode(errors="ignore"))

    if processo.returncode != 0:
        raise RuntimeError(f"converterrinex.py encerrou com código de erro {processo.returncode}.")

    linhas = stdout.decode("utf-8", errors="ignore").strip().splitlines()
    if not linhas:
        raise RuntimeError("converterrinex.py não retornou nenhuma saída no stdout.")

    try:
        resultado = json.loads(linhas[-1])
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"Falha ao decodificar JSON retornado pelo converterrinex: {e}. Última linha: '{linhas[-1]}'"
        )

    return resultado

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
            try:
                if tamanho < 51200:
                    raise ValueError("Arquivo corrompido: tamanho inferior a 50KB")
                validos.append(arq)
            except ValueError as e:
                corrompidos.append(arq)
                nome_arq = os.path.basename(arq)
                self.repo.insert(
                    arquivo_nome=nome_arq,
                    arquivo_tamanho=tamanho,
                    arquivo_path=arq,
                    sucesso=False
                )
                try:
                    os.remove(arq)
                except OSError as e:
                    logger.warning(f"Erro ao remover arquivo corrompido {arq}: {e}")
                self.result_queue.put({"tipo": "log", "mensagem": f"[ERRO] {str(e)}: {nome_arq}"})
                
        if corrompidos:
            self.result_queue.put({"tipo": "log", "mensagem": f"[FILTRO QC] {len(corrompidos)} arquivos corrompidos menores que 50KB isolados, apagados e registrados no histórico."})

        total = len(validos)
        if total == 0:
            self.result_queue.put({"tipo": "log", "mensagem": "Nenhum arquivo válido para processar."})
            return

        self.result_queue.put({"tipo": "log", "mensagem": f"Iniciando conversão de {total} arquivos GNSS com HGO..."})

        # 2. SE EXECUÇÃO CANCELADA
        if self._stop_event.is_set():
            self.result_queue.put({"tipo": "log", "mensagem": "[CANCELADO] Interrupção pelo usuário antes do início."})
            return

        # 3. CHAMAR O CONVERSOR RINEX DO HGO VIA SUBPROCESSO 32-BIT ASSÍNCRONO
        try:
            self.result_queue.put({"tipo": "log", "mensagem": "[HGO] Iniciando automação do HGO no backend (32-bit)..."})
            
            resultado_dict = asyncio.run(
                rodar_conversao_hgo_subprocess(validos, self.pasta_destino, caminho_exe=self.caminho_exe)
            )
            sucesso_geral = resultado_dict.get("sucesso", False)
            if not sucesso_geral:
                msg_erro = resultado_dict.get("mensagem_erro") or "Conversão HGO não gerou arquivos RINEX."
                self.result_queue.put({"tipo": "log", "mensagem": f"[AVISO HGO] {msg_erro}"})

            
            if self._stop_event.is_set():
                self.result_queue.put({"tipo": "log", "mensagem": "[CANCELADO] Interrupção pelo usuário."})
                return

            self.result_queue.put({"tipo": "log", "mensagem": "[HGO] Conversão concluída. Iniciando busca dos arquivos RINEX gerados..."})

            # 4. BUSCAR OS ARQUIVOS RINEX GERADOS PELO HGO (via buscador_rinex)
            nomes_base = [os.path.splitext(os.path.basename(a))[0] for a in validos]

            # Pasta destino do workspace (Rinex) para cópia
            pasta_rinex_destino = self.pasta_destino
            if self.workspace_mgr and self.levantamento_id:
                pasta_ws = self.workspace_mgr.get_levantamento_folder(self.levantamento_id) / "Rinex"
                os.makedirs(str(pasta_ws), exist_ok=True)
                pasta_rinex_destino = str(pasta_ws)

            self.result_queue.put({"tipo": "log", "mensagem": f"[BUSCADOR] Varrendo pastas do HGO por {nomes_base}..."})

            arquivos_rinex = encontrar_rinex(
                nomes_base_origem=nomes_base,
                pasta_destino=pasta_rinex_destino,
                pastas_extras=[self.pasta_destino] if self.pasta_destino != pasta_rinex_destino else None
            )

            if not arquivos_rinex:
                self.result_queue.put({"tipo": "log", "mensagem": "[BUSCADOR] Nenhum arquivo RINEX encontrado nas pastas conhecidas. Verifique o HGO manualmente."})
            else:
                self.result_queue.put({"tipo": "log", "mensagem": f"[BUSCADOR] {len(arquivos_rinex)} arquivo(s) RINEX localizado(s)."})

            # 5. COPIAR PARA O WORKSPACE E REGISTRAR NO BANCO
            for arquivo_rinex in arquivos_rinex:
                f_nome = os.path.basename(arquivo_rinex)
                nome_f, ext_f = os.path.splitext(f_nome)
                ext_f_lower = ext_f.lower()

                # Identifica o arquivo bruto de origem correspondente
                arq_bruto_match = next(
                    (a for a in validos
                     if nome_f.lower() == os.path.splitext(os.path.basename(a))[0].lower()
                     or nome_f.lower().startswith(os.path.splitext(os.path.basename(a))[0].lower())),
                    validos[0]
                )
                nome_arq = os.path.basename(arq_bruto_match)
                tamanho = os.path.getsize(arq_bruto_match)

                # Copia para a pasta de destino (workspace Rinex) se ainda não está lá
                dest_path = os.path.join(pasta_rinex_destino, f_nome)
                if os.path.normpath(arquivo_rinex) != os.path.normpath(dest_path):
                    try:
                        import shutil, stat as _stat
                        if os.path.exists(dest_path):
                            os.chmod(dest_path, _stat.S_IWRITE)
                        shutil.copy2(arquivo_rinex, dest_path)
                        self.result_queue.put({"tipo": "log", "mensagem": f"   [COPIADO] {f_nome} → {pasta_rinex_destino}"})
                    except Exception as e_copy:
                        self.result_queue.put({"tipo": "log", "mensagem": f"   [AVISO] Erro ao copiar {f_nome}: {e_copy}"})
                        continue
                else:
                    self.result_queue.put({"tipo": "log", "mensagem": f"   [OK] {f_nome} já está no workspace."})

                # Só registra no banco para o arquivo de observação (.obs / .o / .25o)
                if ext_f_lower in ['.obs', '.o'] or re.match(r'^\.\d{2}o$', ext_f_lower):
                    try:
                        meta = ler_metadados_rinex(dest_path)
                        if meta:
                            self.repo.insert(
                                arquivo_nome=nome_arq,
                                arquivo_tamanho=tamanho,
                                arquivo_path=arq_bruto_match,
                                ponto_nome=meta['marcador'],
                                data_inicio=meta['inicio'],
                                data_fim=meta['fim'],
                                latitude=meta['lat'],
                                longitude=meta['lon'],
                                sucesso=True
                            )
                            self.result_queue.put({"tipo": "log", "mensagem": f"   [BANCO] {nome_arq} → Marcador: {meta['marcador']}"})
                        else:
                            self.repo.insert(nome_arq, tamanho, arq_bruto_match, sucesso=True)
                            self.result_queue.put({"tipo": "log", "mensagem": f"   [BANCO] {nome_arq} registrado (sem metadados RINEX legíveis)."})
                    except Exception as e_db:
                        self.result_queue.put({"tipo": "log", "mensagem": f"   [AVISO] Erro ao registrar banco para {f_nome}: {e_db}"})

            # 6. ARQUIVOS QUE FALHARAM NA BUSCA
            nomes_com_obs = set()
            for arq_r in arquivos_rinex:
                ext = os.path.splitext(arq_r)[1].lower()
                if ext in ['.obs', '.o'] or re.match(r'^\.\d{2}o$', ext):
                    nome_base = os.path.splitext(os.path.basename(arq_r))[0].lower()
                    nomes_com_obs.add(nome_base)

            for arq in validos:
                prefixo = os.path.splitext(os.path.basename(arq))[0].lower()
                if prefixo not in nomes_com_obs:
                    nome_arq = os.path.basename(arq)
                    tamanho = os.path.getsize(arq)
                    self.repo.insert(nome_arq, tamanho, arq, sucesso=False)
                    self.result_queue.put({"tipo": "log", "mensagem": f"   [FALHA] {nome_arq} não teve arquivo de observação RINEX gerado."})

        except Exception as e:
            self.result_queue.put({"tipo": "erro_fatal", "mensagem": f"Erro crítico durante a automação do HGO: {e}"})
            return

        self.result_queue.put({"tipo": "concluido", "mensagem": "Todos os processamentos finalizados."})
        self.result_queue.put({"tipo": "log", "mensagem": ">>> Lote de conversão HGO 100% finalizado!"})


