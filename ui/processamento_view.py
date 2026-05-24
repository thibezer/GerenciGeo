import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
import queue
import logging

from ui.widgets.treeview_table import PaginatedTreeview
from business.ppp_processor import LotePPPManager
from business.triagem_inteligente import ler_metadados_rinex, organizar_rastreios
from business.gnss_worker import GNSSPipelineWorker
from database.repository import HistoricoRinexRepo
from database.connection import execute_query
from config import EXPORT_BASE_FOLDER

logger = logging.getLogger(__name__)

class ProcessamentoView(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.arquivos_gns_ppp = []
        self.pasta_baguncada_hgo = ""
        self.current_worker = None # Armazena o worker ativo
        # Fila Única para todas as Threads falarem com a UI com segurança
        self.msg_queue = queue.Queue()
        self.setup_ui()
        # Inicia o monitoramento constante da fila
        self.monitorar_sistema()

    def setup_ui(self):
        lbl_title = ttk.Label(self, text="Gerenciador GNSS e Processamento", style="Title.TLabel")
        lbl_title.pack(pady=10, padx=10, anchor="w")

        container = ttk.Frame(self)
        container.pack(fill="both", expand=True, padx=10, pady=5)

        self.notebook = ttk.Notebook(container)
        self.notebook.pack(fill="both", expand=True)

        self.tab_ppp = ttk.Frame(self.notebook)
        self.tab_hgo = ttk.Frame(self.notebook)
        self.tab_hist = ttk.Frame(self.notebook)

        self.notebook.add(self.tab_ppp, text="PPP (IBGE)")
        self.notebook.add(self.tab_hgo, text="Organizador HGO / Triagem")
        self.notebook.add(self.tab_hist, text="Histórico Geral")

        self._setup_tab_ppp()
        self._setup_tab_hgo()
        self._setup_tab_historico()
        
        f_log = ttk.LabelFrame(self, text="Status do Sistema (Real-time)", padding=5)
        f_log.pack(fill="x", padx=10, pady=5)
        self.txt_log = tk.Text(f_log, height=5, font=("Consolas", 9), state="disabled", background="#1e1e1e", foreground="#d4d4d4")
        self.txt_log.pack(fill="x")

    def monitorar_sistema(self):
        """Loop principal de segurança: Único lugar que altera a UI."""
        try:
            while True:
                msg = self.msg_queue.get_nowait()
                tipo = msg.get("tipo")
                
                if tipo == "log":
                    self._do_log(msg["mensagem"])
                elif tipo == "tabela_ppp":
                    self.tabela_ppp.populate(msg["dados"])
                elif tipo == "tabela_hgo":
                    self.tabela_hgo.populate(msg["dados"])
                elif tipo == "btn_state":
                    msg["widget"].config(state=msg["state"])
                elif tipo == "erro_fatal":
                    messagebox.showerror("Erro de Processamento", msg["mensagem"])
                elif tipo == "update_label": # GATILHO PARA ATUALIZAR TEXTOS VIA THREAD
                    msg["widget"].config(text=msg["texto"])
                elif tipo == "tabela_historico":
                    self.tabela_hist.populate(msg["dados"])
                
        except queue.Empty:
            pass
        finally:
            self.after(100, self.monitorar_sistema)

    def _do_log(self, mensagem):
        self.txt_log.config(state="normal")
        self.txt_log.insert("end", f"> {mensagem}\n")
        self.txt_log.see("end")
        self.txt_log.config(state="disabled")

    def safe_log(self, texto):
        self.msg_queue.put({"tipo": "log", "mensagem": texto})

    def filtrar_arquivos_duplicados(self, caminhos):
        """Verifica no banco se os arquivos já foram convertidos (nome + tamanho)"""
        repo = HistoricoRinexRepo()
        duplicados = []
        limpos = []
        for p in caminhos:
            nome = os.path.basename(p)
            tamanho = os.path.getsize(p)
            found = repo.find_duplicate(nome, tamanho)
            if found:
                duplicados.append(nome)
            else:
                limpos.append(p)
        
        if duplicados:
            msg = f"Detectamos {len(duplicados)} arquivo(s) já convertidos anteriormente no banco de dados.\n\n"
            msg += "Deseja converter todos novamente?\n(Se clicar em NÃO, apenas os novos serão processados)"
            if messagebox.askyesno("Arquivos Já Convertidos", msg):
                return caminhos
            else:
                return limpos
        return caminhos

    # ================= TAB PPP =================
    def _setup_tab_ppp(self):
        f_top = ttk.Frame(self.tab_ppp)
        f_top.pack(fill="x", pady=5)

        ttk.Label(f_top, text="Selecione as Bases:").pack(side="left", padx=5)
        self.btn_add_ppp = ttk.Button(f_top, text="Adicionar Brutos (.GNS)", command=self.add_gns_ppp)
        self.btn_add_ppp.pack(side="left", padx=5)
        
        self.lbl_ppp_count = ttk.Label(f_top, text="Arquivos: 0")
        self.lbl_ppp_count.pack(side="left", padx=5)

        self.btn_exec_ppp = ttk.Button(self.tab_ppp, text="INICIAR FLUXO PPP COMPLETO", style="Accent.TButton", command=self.run_ppp_fluxo_completo)
        self.btn_exec_ppp.pack(pady=5)
        
        self.btn_cancel_ppp = ttk.Button(self.tab_ppp, text="CANCELAR PROCESSO", state="disabled", command=self.cancelar_processo)
        self.btn_cancel_ppp.pack(pady=5)

        self.tabela_ppp = PaginatedTreeview(self.tab_ppp, columns=("arquivo", "inicio", "fim", "status"), 
                                           headers=("Arquivo", "Início", "Fim", "Status PPP"))
        self.tabela_ppp.pack(fill="both", expand=True, pady=5)

    def add_gns_ppp(self):
        self.btn_add_ppp.config(state="disabled")
        self.safe_log("[DEBUG] Botão de Bases clicado. Iniciando thread separada...")
        threading.Thread(target=self._thread_ask_files, daemon=True).start()

    def _thread_ask_files(self):
        try:
            self.safe_log("[DEBUG] Thread iniciada. Construindo janela fantasma isolada...")
            import tkinter as tk
            from tkinter import filedialog
            
            temp_root = tk.Tk()
            temp_root.withdraw() # Oculta a janela fantasma
            
            self.safe_log("[DEBUG] Chamando o Explorador do Windows...")
            paths = filedialog.askopenfilenames(
                parent=temp_root, 
                title="Selecione Bases .GNS", 
                filetypes=[("Raw GNSS", "*.GNS"), ("Todos", "*.*")]
            )
            
            temp_root.destroy()
            self.safe_log(f"[DEBUG] O Windows respondeu! Retornou {len(paths)} arquivos.")
            
            if paths:
                self.arquivos_gns_ppp = list(paths)
                self.msg_queue.put({"tipo": "update_label", "widget": self.lbl_ppp_count, "texto": f"Arquivos: {len(self.arquivos_gns_ppp)}"})
                lista = [ (os.path.basename(p), "-", "-", "Pronto") for p in self.arquivos_gns_ppp ]
                self.msg_queue.put({"tipo": "tabela_ppp", "dados": lista})
        except Exception as e:
            self.safe_log(f"[ERRO FATAL NO SELETOR] O Windows bloqueou a ação: {repr(e)}")
        finally:
            self.msg_queue.put({"tipo": "btn_state", "widget": self.btn_add_ppp, "state": "normal"})

    def run_ppp_fluxo_completo(self):
        if not self.arquivos_gns_ppp:
            return messagebox.showwarning("Aviso", "Selecione arquivos .GNS primeiro.")

        arquivos_para_processar = self.filtrar_arquivos_duplicados(self.arquivos_gns_ppp)
        if not arquivos_para_processar:
            self.safe_log("Operação cancelada: todos os arquivos já constam no histórico.")
            return

        self.btn_exec_ppp.config(state="disabled")
        self.btn_cancel_ppp.config(state="normal")
        self.safe_log(f"Iniciando automação ConvertRinex ({len(arquivos_para_processar)} arquivos)...")
        
        # Lança a orquestração em uma thread separada para deixar o .join() do worker acontecer sem travar a UI
        threading.Thread(target=self._orchestrate_ppp, args=(arquivos_para_processar,), daemon=True).start()

    def cancelar_processo(self):
        if self.current_worker and self.current_worker.is_alive():
            self.safe_log("Sinal de cancelamento enviado. Aguardando finalização do ciclo atual...")
            self.current_worker.stop()
            self.btn_cancel_ppp.config(state="disabled")
            self.btn_cancel_hgo.config(state="disabled")

    def _orchestrate_ppp(self, arquivos):
        pasta_destino = os.path.join(EXPORT_BASE_FOLDER, "Bases_RINEX")
        os.makedirs(pasta_destino, exist_ok=True)
        
        self.current_worker = GNSSPipelineWorker(arquivos, pasta_destino, self.msg_queue)
        self.current_worker.start()
        self.current_worker.join() 
        
        self.safe_log("Conversão RPA Terminada. Iniciando Extração DB e Envio PPP...")
        self._fase_2_ppp(pasta_destino)
        self.atualizar_visualizacao_historico()

    def _fase_2_ppp(self, pasta_rinex):
        arquivos_rinex = [os.path.join(pasta_rinex, f) for f in os.listdir(pasta_rinex) if f.lower().endswith((".o", ".21o", ".22o", ".23o", ".24o"))]
        
        if not arquivos_rinex:
            self.safe_log("Nenhum arquivo RINEX foi gerado para proceguir com o PPP.")
            self.msg_queue.put({"tipo": "btn_state", "widget": self.btn_exec_ppp, "state": "normal"})
            return

        manager = LotePPPManager(use_api=True)
        out_pasta_ppp = os.path.join(EXPORT_BASE_FOLDER, "Processados_PPP")
        os.makedirs(out_pasta_ppp, exist_ok=True)

        lista_ui = []
        for rx in arquivos_rinex:
            meta = ler_metadados_rinex(rx)
            inicio = meta['inicio'].strftime('%d/%m/%Y %H:%M') if meta and meta['inicio'] else "Erro"
            fim = meta['fim'].strftime('%d/%m/%Y %H:%M') if meta and meta['fim'] else "Erro"
            lista_ui.append((os.path.basename(rx), inicio, fim, "Enviando pro IBGE..."))
        
        self.msg_queue.put({"tipo": "tabela_ppp", "dados": lista_ui})
        self.safe_log("Iniciando Envio Batch ao IBGE. Aguarde!")
        
        resultados = manager.processar_lote(arquivos_rinex, out_pasta_ppp)
        
        lista_final = []
        for rx in arquivos_rinex:
            meta = ler_metadados_rinex(rx)
            inicio = meta['inicio'].strftime('%d/%m/%Y %H:%M') if meta and meta['inicio'] else "-"
            fim = meta['fim'].strftime('%d/%m/%Y %H:%M') if meta and meta['fim'] else "-"
            sts = "PPP Sucesso" if resultados.get(rx, [False])[0] else "Erro PPP"
            lista_final.append((os.path.basename(rx), inicio, fim, sts))
            
        self.msg_queue.put({"tipo": "tabela_ppp", "dados": lista_final})
        self.msg_queue.put({"tipo": "btn_state", "widget": self.btn_exec_ppp, "state": "normal"})
        self.msg_queue.put({"tipo": "btn_state", "widget": self.btn_cancel_ppp, "state": "disabled"})
        self.safe_log("Processo PPP Finalizado!")

    # ================= TAB ORGANIZADOR HGO =================
    def _setup_tab_hgo(self):
        f_top = ttk.Frame(self.tab_hgo)
        f_top.pack(fill="x", pady=5)

        self.btn_sel_pasta = ttk.Button(f_top, text="Procurar Pasta de Campo", command=self.sel_pasta_hgo)
        self.btn_sel_pasta.pack(side="left", padx=5)
        
        self.lbl_pasta = ttk.Label(f_top, text="Selecione a pasta...")
        self.lbl_pasta.pack(side="left", padx=5)

        self.btn_exec_hgo = ttk.Button(self.tab_hgo, text="CONVERTER E ORGANIZAR PARA HGO", style="Accent.TButton", command=self.run_triagem_hgo)
        self.btn_exec_hgo.pack(pady=5)
        
        self.btn_cancel_hgo = ttk.Button(self.tab_hgo, text="CANCELAR PROCESSO", state="disabled", command=self.cancelar_processo)
        self.btn_cancel_hgo.pack(pady=5)
        
        self.btn_reproc_hgo = ttk.Button(self.tab_hgo, text="RE-PROCESSAR TRIAGEM (SKIP RPA)", style="TButton", command=self.run_reprocessar_triagem)
        self.btn_reproc_hgo.pack(pady=5)

        self.tabela_hgo = PaginatedTreeview(self.tab_hgo, columns=("base", "rovers", "status"), 
                                           headers=("Pasta Base Gerada", "Rovers", "Status"))
        self.tabela_hgo.pack(fill="both", expand=True, pady=5)

    def sel_pasta_hgo(self):
        self.btn_sel_pasta.config(state="disabled")
        self.safe_log("[DEBUG] Botão de Pasta clicado. Iniciando thread separada...")
        threading.Thread(target=self._thread_ask_dir, daemon=True).start()

    def _thread_ask_dir(self):
        try:
            self.safe_log("[DEBUG] Thread de pastas iniciada. Construindo janela fantasma...")
            import tkinter as tk
            from tkinter import filedialog
            
            temp_root = tk.Tk()
            temp_root.withdraw()
            
            self.safe_log("[DEBUG] Chamando o Explorador de Pastas do Windows...")
            pasta = filedialog.askdirectory(parent=temp_root, title="Selecione a pasta com arquivos .GNS")
            
            temp_root.destroy()
            self.safe_log(f"[DEBUG] O Windows respondeu! Retornou: '{pasta}'")
            
            if pasta and os.path.exists(pasta):
                self.pasta_baguncada_hgo = pasta
                self.msg_queue.put({"tipo": "update_label", "widget": self.lbl_pasta, "texto": os.path.basename(pasta)})
                self.safe_log(f"> Pasta carregada com sucesso!")
            else:
                self.safe_log("[DEBUG] Seleção cancelada pelo usuário ou pasta inválida.")
        except Exception as e:
            self.safe_log(f"[ERRO FATAL NO SELETOR] O Windows bloqueou a ação: {repr(e)}")
        finally:
            self.msg_queue.put({"tipo": "btn_state", "widget": self.btn_sel_pasta, "state": "normal"})

    def run_triagem_hgo(self):
        if not self.pasta_baguncada_hgo:
             return messagebox.showwarning("Aviso", "Selecione a pasta primeiro.")

        arquivos = [os.path.join(self.pasta_baguncada_hgo, a) for a in os.listdir(self.pasta_baguncada_hgo) if a.upper().endswith(".GNS")]
        if not arquivos:
            return messagebox.showwarning("Aviso", "Nenhum .GNS encontrado na pasta.")

        arquivos_para_processar = self.filtrar_arquivos_duplicados(arquivos)
        if not arquivos_para_processar:
            self.safe_log("Operação cancelada: todos os arquivos já constam no histórico.")
            return

        self.btn_exec_hgo.config(state="disabled")
        self.btn_cancel_hgo.config(state="normal")
        self.safe_log(f"Iniciando conversão em lote: {len(arquivos_para_processar)} arquivos.")
        
        threading.Thread(target=self._orchestrate_hgo, args=(arquivos_para_processar,), daemon=True).start()

    def run_reprocessar_triagem(self):
        if not self.pasta_baguncada_hgo:
             return messagebox.showwarning("Aviso", "Selecione a pasta primeiro.")
             
        pasta_dest_rinex = os.path.join(self.pasta_baguncada_hgo, "Rinex_Temporario")
        if not os.path.exists(pasta_dest_rinex):
            return messagebox.showerror("Erro", "Não encontramos a pasta 'Rinex_Temporario'. Você precisa converter os arquivos ao menos uma vez.")
            
        arquivos_rinex = [f for f in os.listdir(pasta_dest_rinex) if f.lower().endswith(('o', '.obs'))]
        if not arquivos_rinex:
            return messagebox.showerror("Erro", "A pasta 'Rinex_Temporario' está vazia.")

        self.safe_log(f"Iniciando Re-processamento da Triagem para {len(arquivos_rinex)} arquivos RINEX...")
        
        def _task_reproc():
            # 1. Revisão e Sincronização com Banco de Dados
            self.revisar_dados_historico(pasta_dest_rinex)
            # 2. Execução da Triagem Lógica (HGO)
            self._fase_2_hgo(pasta_dest_rinex)
            # 3. Refresh da UI de Histórico
            self.atualizar_visualizacao_historico()

        threading.Thread(target=_task_reproc, daemon=True).start()

    def revisar_dados_historico(self, pasta_rinex):
        """Varre a pasta de RINEX, extrai metadados e atualiza registros no banco se necessário."""
        self.safe_log("[SINCRO] Revisando metadados no banco de dados...")
        repo = HistoricoRinexRepo()
        arquivos = [f for f in os.listdir(pasta_rinex) if f.lower().endswith(('o', '.obs'))]
        
        count_upd = 0
        for arq_rx in arquivos:
            self.safe_log(f"   - Verificando: {arq_rx}")
            path_rx = os.path.join(pasta_rinex, arq_rx)
            meta = ler_metadados_rinex(path_rx)
            if not meta: continue
            
            # Tenta localizar no banco pelo nome base (ex: arquivo.GNS -> arquivo.o26)
            nome_base = os.path.splitext(arq_rx)[0]
            query = "SELECT * FROM historico_rinex WHERE arquivo_nome LIKE ?"
            rows = execute_query(query, params=(f"{nome_base}%",), fetch_all=True)
            
            for r in rows:
                # Se o registro estiver incompleto ou o ponto mudar, atualiza
                if not r['data_fim'] or not r['latitude'] or r['ponto_nome'] != meta['marcador']:
                    upd_data = {
                        'ponto_nome': meta['marcador'],
                        'data_inicio': meta['inicio'],
                        'data_fim': meta['fim'],
                        'latitude': meta['lat'],
                        'longitude': meta['lon'],
                        'sucesso': 1
                    }
                    repo.update(r['id'], upd_data)
                    count_upd += 1
        
        if count_upd > 0:
            self.safe_log(f"[SINCRO] Sucesso: {count_upd} registros do histórico foram atualizados com novos metadados.")
        else:
            self.safe_log("[SINCRO] Nenhum registro precisou de atualização.")

    def _orchestrate_hgo(self, arquivos):
        # Cria a pasta de resultado dentro da própria pasta dos arquivos originais
        pasta_dest_rinex = os.path.join(self.pasta_baguncada_hgo, "Rinex_Temporario")
        os.makedirs(pasta_dest_rinex, exist_ok=True)

        self.current_worker = GNSSPipelineWorker(arquivos, pasta_dest_rinex, self.msg_queue)
        self.current_worker.start()
        self.current_worker.join() # Aguarda a thread do ConvertRinex finalizar todos
        
        self.safe_log("Conversão HGO Terminada. Iniciando Triagem de Metadados...")
        self._fase_2_hgo(pasta_dest_rinex)
        self.atualizar_visualizacao_historico()

    def _fase_2_hgo(self, pasta_rinex):
        pasta_destino_hgo = os.path.join(self.pasta_baguncada_hgo, "Bases_e_Rovers_HGO_Prontos")
        os.makedirs(pasta_destino_hgo, exist_ok=True)

        self.safe_log("Analisando cabeçalhos e criando árvores de agrupamento...")
        bases = organizar_rastreios(pasta_rinex, pasta_destino_hgo)

        lista_ui = []
        # Fallback de segurança caso a função organizar_rastreios não retorne a lista iterável que o Tkinter espera
        if bases:
            for b in bases:
                nome_dir = f"Pronto_HGO_Base_{b['marcador']}_{b.get('inicio').strftime('%Y%m%d') if b.get('inicio') else 'SemData'}"
                qtd_rovers = len(b.get('rovers', []))
                lista_ui.append((nome_dir, str(qtd_rovers), "Agrupado com Sucesso"))
                self.safe_log(f"Pasta HGO Criada: {nome_dir} com {qtd_rovers} Rovers.")

        self.msg_queue.put({"tipo": "tabela_hgo", "dados": lista_ui})
        self.msg_queue.put({"tipo": "btn_state", "widget": self.btn_exec_hgo, "state": "normal"})
        self.msg_queue.put({"tipo": "btn_state", "widget": self.btn_cancel_hgo, "state": "disabled"})
        self.safe_log("Triagem de Rastreios Finalizada! Verifique a pasta raiz.")

    def _setup_tab_historico(self):
        f_top = ttk.Frame(self.tab_hist)
        f_top.pack(fill="x", pady=5)
        
        ttk.Button(f_top, text="Atualizar Lista", command=self.atualizar_visualizacao_historico).pack(side="left", padx=5)
        ttk.Button(f_top, text="Excluir Registro", command=self.excluir_historico_selecionado).pack(side="left", padx=5)
        ttk.Button(f_top, text="Limpar Histórico", command=self.limpar_todo_historico).pack(side="left", padx=5)
        
        self.btn_export_geo = ttk.Button(f_top, text="Converter/Exportar Selecionados", command=self.exportar_geometria_selecionada, style="Accent.TButton")
        self.btn_export_geo.pack(side="left", padx=5)
        
        self.tabela_hist = PaginatedTreeview(self.tab_hist, 
            columns=("id", "nome", "tamanho", "ponto", "inicio", "fim", "lat", "lon"),
            headers=("ID", "Arquivo", "Tam (KB)", "Ponto", "Início", "Fim", "Latitude", "Longitude")
        )
        self.tabela_hist.tree.column("id", width=50, anchor="center")
        self.tabela_hist.pack(fill="both", expand=True, pady=5)
        self.tabela_hist.bind_double_click(self.on_historico_double_click)
        self.atualizar_visualizacao_historico()

    def excluir_historico_selecionado(self):
        selecionados = self.tabela_hist.get_all_selected()
        if not selecionados:
            return messagebox.showwarning("Aviso", "Selecione um ou mais registros na tabela primeiro.")
        
        qtd = len(selecionados)
        msg = "Deseja excluir o registro selecionado?" if qtd == 1 else f"Deseja excluir os {qtd} registros selecionados?"
        
        if messagebox.askyesno("Confirmar Exclusão", msg):
            repo = HistoricoRinexRepo()
            for sel in selecionados:
                repo.delete(sel[0]) # ID é o primeiro valor
            self.atualizar_visualizacao_historico()
            self.safe_log(f"Removido(s) {qtd} registro(s) do histórico.")

    def on_historico_double_click(self, event):
        sel = self.tabela_hist.get_selected()
        if not sel: return
        
        item_id = sel[0]
        ponto_atual = sel[3]
        
        from tkinter import simpledialog
        novo_nome = simpledialog.askstring("Editar Ponto", f"Alterar nome do ponto para o registro {item_id}:", initialvalue=ponto_atual)
        
        if novo_nome is not None:
            repo = HistoricoRinexRepo()
            repo.update(item_id, {'ponto_nome': novo_nome})
            self.atualizar_visualizacao_historico()
            self.safe_log(f"Nome do ponto no registro {item_id} alterado para: {novo_nome}")

    def limpar_todo_historico(self):
        if messagebox.askyesno("Limpar Tudo", "Isso apagará TODO o histórico de conversões permanentemente. Deseja continuar?"):
            try:
                execute_query("DELETE FROM historico_rinex", commit=True)
                self.atualizar_visualizacao_historico()
                self.safe_log("Histórico de conversões limpo com sucesso.")
            except Exception as e:
                messagebox.showerror("Erro", f"Falha ao limpar histórico: {e}")

    def atualizar_visualizacao_historico(self):
        def _task():
            repo = HistoricoRinexRepo()
            rows = repo.get_all_ordered()
            dados = []
            for r in rows:
                tam_kb = round(r['arquivo_tamanho'] / 1024, 1)
                lat = f"{r['latitude']:.6f}" if r['latitude'] else "-"
                lon = f"{r['longitude']:.6f}" if r['longitude'] else "-"
                dados.append((
                    r['id'],
                    r['arquivo_nome'], 
                    str(tam_kb), 
                    r['ponto_nome'] or "-", 
                    r['data_inicio'] or "-", 
                    r['data_fim'] or "-",
                    lat, lon
                ))
            self.msg_queue.put({"tipo": "tabela_historico", "dados": dados})
        
        threading.Thread(target=_task, daemon=True).start()

    def exportar_geometria_selecionada(self):
        selecionados = self.tabela_hist.get_all_selected()
        if not selecionados:
            return messagebox.showwarning("Aviso", "Selecione um ou mais registros na tabela primeiro.")
        
        # Filtrar apenas os que têm coordenadas válidas
        pontos = []
        for sel in selecionados:
            # colunas: ("id", "nome", "tamanho", "ponto", "inicio", "fim", "lat", "lon")
            nome = sel[3] # ponto_nome
            lat = sel[6]
            lon = sel[7]
            if lat != "-" and lon != "-":
                pontos.append((nome, lat, lon))
        
        if not pontos:
            return messagebox.showwarning("Aviso", "Os registros selecionados não possuem coordenadas geográficas (Lat/Lon).")

        # Criar menu de opções (Janela Modal)
        popup = tk.Toplevel(self)
        popup.title("Geoprocessamento - Seleção")
        popup.geometry("400x220")
        popup.resizable(False, False)
        popup.transient(self)
        popup.grab_set()

        # Centralizar popup
        popup.update_idletasks()
        width = popup.winfo_width()
        height = popup.winfo_height()
        x = (popup.winfo_screenwidth() // 2) - (width // 2)
        y = (popup.winfo_screenheight() // 2) - (height // 2)
        popup.geometry(f'{width}x{height}+{x}+{y}')

        ttk.Label(popup, text=f"Foram identificados {len(pontos)} pontos válidos.\nEscolha o formato de saída:", 
                  padding=15, font=("Segoe UI", 10, "bold"), justify="center").pack()

        def acao_txt():
            filepath = filedialog.asksaveasfilename(
                defaultextension=".txt",
                filetypes=[("Arquivo de Texto", "*.txt")],
                initialfile="pontos_sirgas_utm22s.txt",
                title="Salvar Coordenadas UTM"
            )
            if filepath:
                from business.geoprocessamento import exportar_txt_utm
                try:
                    exportar_txt_utm(pontos, filepath)
                    messagebox.showinfo("Sucesso", f"Arquivo UTM exportado com sucesso!\nSalvo em: {filepath}")
                    popup.destroy()
                    self.safe_log(f"[EXPORT] Arquivo TXT UTM gerado: {os.path.basename(filepath)}")
                except Exception as e:
                    messagebox.showerror("Erro", f"Falha ao exportar TXT: {e}")

        def acao_kml():
            from config import EXPORT_BASE_FOLDER
            temp_kml = os.path.join(EXPORT_BASE_FOLDER, "visualizacao_google_earth.kml")
            os.makedirs(EXPORT_BASE_FOLDER, exist_ok=True)
            from business.geoprocessamento import gerar_kml_e_abrir
            try:
                gerar_kml_e_abrir(pontos, temp_kml)
                popup.destroy()
                self.safe_log(f"[EXPORT] KML gerado e enviado ao Google Earth.")
            except Exception as e:
                messagebox.showerror("Erro", f"Falha ao abrir Google Earth: {e}")

        btn_txt = ttk.Button(popup, text="Salvar TXT (SIRGAS 2000 UTM 22S)", command=acao_txt, style="TButton")
        btn_txt.pack(pady=10, fill="x", padx=40)

        btn_kml = ttk.Button(popup, text="Abrir Pontos no Google Earth", command=acao_kml, style="TButton")
        btn_kml.pack(pady=10, fill="x", padx=40)