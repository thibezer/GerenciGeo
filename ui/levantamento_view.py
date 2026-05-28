import tkinter as tk
from tkinter import ttk, messagebox
import math
import logging
from ui.widgets.treeview_table import PaginatedTreeview
from database.connection import execute_query
from pyproj import Transformer

# Importações de negócios seguras
from business.geoprocessamento import (
    associar_base_ao_lote,
    aplicar_correcao_manual_lote,
    geodesic_to_ecef,
    ecef_to_geodesic
)

logger = logging.getLogger(__name__)

class LevantamentoView(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.levantamento_selecionado = None
        self.arquivo_selecionado = None
        self.setup_ui()
        self.load_levantamentos()

    def setup_ui(self):
        # Título elegante
        lbl_title = ttk.Label(self, text="Gestão e Conferência de Levantamentos", style="Title.TLabel")
        lbl_title.pack(pady=10, padx=10, anchor="w")
        
        # Painel de Filtros e Seleção
        f_filtros = ttk.LabelFrame(self, text="Filtros de Lote e Levantamento", padding=10)
        f_filtros.pack(fill="x", padx=10, pady=5)
        
        ttk.Label(f_filtros, text="Levantamento:").grid(row=0, column=0, sticky="w", pady=5)
        self.cb_levantamento = ttk.Combobox(f_filtros, state="readonly", width=40)
        self.cb_levantamento.grid(row=0, column=1, sticky="w", padx=5)
        self.cb_levantamento.bind("<<ComboboxSelected>>", self.on_levantamento_selected)
        
        ttk.Label(f_filtros, text="Arquivo de Origem:").grid(row=0, column=2, sticky="w", pady=5, padx=(20, 0))
        self.cb_arquivo = ttk.Combobox(f_filtros, state="readonly", width=40)
        self.cb_arquivo.grid(row=0, column=3, sticky="w", padx=5)
        self.cb_arquivo.bind("<<ComboboxSelected>>", self.on_arquivo_selected)

        # Botão para atualizar a grid
        self.btn_refresh = ttk.Button(f_filtros, text="Atualizar Tabela", command=self.carregar_pontos)
        self.btn_refresh.grid(row=0, column=4, padx=15)

        # Grid de Pontos - Confronto Metrológico "Antes e Depois"
        ttk.Label(self, text="Pontos do Lote Selecionado:").pack(padx=10, anchor="w", pady=(10, 0))
        
        cols = ("id", "nome_vertice", "tipo", "n_original", "e_original", "lat_corrigido", "lon_corrigido", "delta_n", "delta_e", "status")
        headers = ("ID", "Vértice", "Tipo", "Norte Bruto (m)", "Este Bruto (m)", "Lat Corrigida", "Lon Corrigida", "Δ N (m)", "Δ E (m)", "Status")
        
        self.table = PaginatedTreeview(self, columns=cols, headers=headers, height=18)
        self.table.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Configurar largura das colunas
        self.table.tree.column("id", width=50, anchor="center")
        self.table.tree.column("nome_vertice", width=100, anchor="w")
        self.table.tree.column("tipo", width=50, anchor="center")
        self.table.tree.column("status", width=90, anchor="center")
        
        # Destaque visual premium para pontos Brutos (Amarelo Mostarda para tema escuro)
        self.table.tree.tag_configure('bruto', background='#b58900', foreground='white')
        
        # Menu de contexto (Clique com botão direito)
        self.menu_contexto = tk.Menu(self, tearoff=0, background="#16213e", foreground="#eeeeee", activebackground="#e94560")
        self.menu_contexto.add_command(label="Vincular Ponto à Base PPP (Late Binding)", command=self.abrir_modal_vincular_base)
        self.menu_contexto.add_command(label="Forçar Correção Geométrica Manual (Fallback)", command=self.abrir_modal_override_manual)
        
        self.table.tree.bind("<Button-3>", self.mostrar_menu_contexto)

    def load_levantamentos(self):
        query = """
            SELECT l.id, p.nome_propriedade, l.data_inicio 
            FROM levantamentos l
            JOIN propriedades p ON l.propriedade_id = p.id
            ORDER BY l.id DESC
        """
        rows = execute_query(query, fetch_all=True)
        self.levantamentos_map = {}
        vals = []
        for r in rows:
            lbl = f"ID {r['id']} - {r['nome_propriedade']} ({r['data_inicio']})"
            vals.append(lbl)
            self.levantamentos_map[lbl] = r['id']
            
        self.cb_levantamento['values'] = vals
        if vals:
            self.cb_levantamento.set(vals[0])
            self.on_levantamento_selected(None)

    def on_levantamento_selected(self, event):
        lbl = self.cb_levantamento.get()
        lev_id = self.levantamentos_map.get(lbl)
        if not lev_id: return
        self.levantamento_selecionado = lev_id
        
        # Carrega os arquivos de origem distintos daquele levantamento
        query = "SELECT DISTINCT arquivo_origem FROM pontos WHERE levantamento_id = ? AND arquivo_origem IS NOT NULL"
        rows = execute_query(query, params=(lev_id,), fetch_all=True)
        
        vals = [r['arquivo_origem'] for r in rows if r['arquivo_origem']]
        self.cb_arquivo['values'] = vals
        if vals:
            self.cb_arquivo.set(vals[0])
            self.arquivo_selecionado = vals[0]
            self.carregar_pontos()
        else:
            self.cb_arquivo.set('')
            self.arquivo_selecionado = None
            self.table.populate([])

    def on_arquivo_selected(self, event):
        self.arquivo_selecionado = self.cb_arquivo.get()
        self.carregar_pontos()

    def carregar_pontos(self):
        if not self.levantamento_selecionado or not self.arquivo_selecionado:
            return
            
        query = """
            SELECT id, nome_vertice, tipo_ponto, lat, lon, alt, n_original, e_original, alt_original, status_correcao
            FROM pontos
            WHERE levantamento_id = ? AND arquivo_origem = ?
            ORDER BY ordem_caminhamento ASC, id ASC
        """
        rows = execute_query(query, params=(self.levantamento_selecionado, self.arquivo_selecionado), fetch_all=True)
        
        dados_tabela = []
        for r in rows:
            pt = dict(r)
            status = pt.get("status_correcao") or "BRUTO"
            
            # Cálculo de deltas dinâmico em tempo de exibição
            delta_n = 0.0
            delta_e = 0.0
            
            lat_corr_lbl = "-"
            lon_corr_lbl = "-"
            
            if status == "CORRIGIDO" and pt["lat"] and pt["lon"] and pt["lat"] != 0.0:
                lat_corr_lbl = f"{pt['lat']:.8f}"
                lon_corr_lbl = f"{pt['lon']:.8f}"
                
                try:
                    # Determina o fuso UTM do ponto para projeção
                    longitude = pt["lon"]
                    zona_utm = int((longitude + 180) / 6) + 1
                    epsg_utm = f"319{60 + zona_utm}"
                    
                    transformer = Transformer.from_crs("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)
                    e_atual, n_atual = transformer.transform(pt["lon"], pt["lat"])
                    
                    delta_n = n_atual - (pt["n_original"] or 0.0)
                    delta_e = e_atual - (pt["e_original"] or 0.0)
                except Exception as ex:
                    logger.warning(f"Falha ao calcular delta dinâmico para ponto {pt['nome_vertice']}: {ex}")
            
            dados_tabela.append((
                pt["id"],
                pt["nome_vertice"],
                pt["tipo_ponto"],
                f"{pt['n_original']:.3f}" if pt['n_original'] else "0.000",
                f"{pt['e_original']:.3f}" if pt['e_original'] else "0.000",
                lat_corr_lbl,
                lon_corr_lbl,
                f"{delta_n:.3f}",
                f"{delta_e:.3f}",
                status
            ))
            
        self.table.tree.delete(*self.table.tree.get_children())
        for row in dados_tabela:
            status_ponto = row[9]
            if status_ponto == "BRUTO":
                self.table.tree.insert("", "end", values=row, tags=('bruto',))
            else:
                self.table.tree.insert("", "end", values=row)

    def mostrar_menu_contexto(self, event):
        item = self.table.tree.identify_row(event.y)
        if item:
            self.table.tree.selection_set(item)
            self.menu_contexto.post(event.x_root, event.y_root)

    def abrir_modal_vincular_base(self):
        sel = self.table.get_selected()
        if not sel:
            messagebox.showwarning("Aviso", "Selecione um ponto na tabela primeiro.")
            return
            
        ponto_id = sel[0]
        ponto_nome = sel[1]
        
        # Diálogo modal de vínculo
        modal = tk.Toplevel(self)
        modal.title(f"Vínculo Tardio V.L.A.E.G. - Ponto {ponto_nome}")
        modal.geometry("500x300")
        modal.resizable(False, False)
        modal.transient(self)
        modal.grab_set()
        
        # Centralizar
        modal.update_idletasks()
        w, h = modal.winfo_width(), modal.winfo_height()
        x = (modal.winfo_screenwidth() // 2) - (w // 2)
        y = (modal.winfo_screenheight() // 2) - (h // 2)
        modal.geometry(f"{w}x{h}+{x}+{y}")
        
        container = ttk.Frame(modal, padding=15)
        container.pack(fill="both", expand=True)
        
        ttk.Label(container, text=f"Associar ponto de amarração '{ponto_nome}' a uma Base PPP:", font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(0, 10))
        ttk.Label(container, text="Selecione a Base Corrigida ativa disponível:", font=("Segoe UI", 9)).pack(anchor="w", pady=(0, 5))
        
        # Lista as bases (pontos do tipo 'M' ou corrigidas) do mesmo levantamento
        query = """
            SELECT id, nome_vertice, lat, lon, alt 
            FROM pontos 
            WHERE levantamento_id = ? AND tipo_ponto = 'M' AND lat IS NOT NULL AND lat != 0.0
        """
        rows = execute_query(query, params=(self.levantamento_selecionado,), fetch_all=True)
        
        bases_map = {}
        vals = []
        for r in rows:
            lbl = f"{r['nome_vertice']} (Lat: {r['lat']:.8f}, Lon: {r['lon']:.8f})"
            vals.append(lbl)
            bases_map[lbl] = r['id']
            
        cb_base = ttk.Combobox(container, state="readonly", values=vals, width=50)
        cb_base.pack(pady=10)
        if vals:
            cb_base.set(vals[0])
        else:
            ttk.Label(container, text="Aviso: Nenhuma base PPP ativa/corrigida encontrada neste levantamento.", foreground="#e94560").pack()
            
        def realizar_vinculo():
            base_lbl = cb_base.get()
            base_id = bases_map.get(base_lbl)
            if not base_id:
                messagebox.showerror("Erro", "Selecione uma base PPP válida.")
                return
                
            try:
                qtd = associar_base_ao_lote(ponto_id, base_id)
                messagebox.showinfo("Sucesso", f"Vínculo V.L.A.E.G. concluído! {qtd} pontos do lote foram transladados com sucesso.")
                modal.destroy()
                self.carregar_pontos()
            except Exception as e:
                messagebox.showerror("Erro de Translação", str(e))
                
        btn_vincular = ttk.Button(container, text="Aplicar Vínculo e Translação ECEF", style="Accent.TButton", command=realizar_vinculo)
        btn_vincular.pack(pady=15)
        
        ttk.Button(container, text="Fechar", command=modal.destroy).pack()

    def abrir_modal_override_manual(self):
        sel = self.table.get_selected()
        if not sel:
            messagebox.showwarning("Aviso", "Selecione um ponto na tabela primeiro.")
            return
            
        ponto_id = sel[0]
        ponto_nome = sel[1]
        
        # Pega as originais do banco para pré-preencher o Bloco A
        row = execute_query(
            "SELECT n_original, e_original, alt_original FROM pontos WHERE id = ?",
            params=(ponto_id,),
            fetch_one=True
        )
        pt_dados = dict(row) if row else {}
        
        # Janela modal do Override
        modal = tk.Toplevel(self)
        modal.title(f"Override de Calibração Manual - Base {ponto_nome}")
        modal.geometry("600x550")
        modal.resizable(False, False)
        modal.transient(self)
        modal.grab_set()
        
        # Centralizar
        modal.update_idletasks()
        w, h = modal.winfo_width(), modal.winfo_height()
        x = (modal.winfo_screenwidth() // 2) - (w // 2)
        y = (modal.winfo_screenheight() // 2) - (h // 2)
        modal.geometry(f"{w}x{h}+{x}+{y}")
        
        container = ttk.Frame(modal, padding=15)
        container.pack(fill="both", expand=True)
        
        # Bloco A: Coordenadas Brutas de Campo
        f_bloco_a = ttk.LabelFrame(container, text="Bloco A: Coordenadas Brutas de Campo", padding=10)
        f_bloco_a.pack(fill="x", pady=5)
        
        ttk.Label(f_bloco_a, text="Norte Bruto (m):").grid(row=0, column=0, sticky="w", pady=5)
        ent_n_bruto = ttk.Entry(f_bloco_a)
        ent_n_bruto.grid(row=0, column=1, sticky="w", padx=5)
        if pt_dados.get("n_original"):
            ent_n_bruto.insert(0, f"{pt_dados['n_original']:.3f}")
            
        ttk.Label(f_bloco_a, text="Este Bruto (m):").grid(row=0, column=2, sticky="w", pady=5, padx=(10, 0))
        ent_e_bruto = ttk.Entry(f_bloco_a)
        ent_e_bruto.grid(row=0, column=3, sticky="w", padx=5)
        if pt_dados.get("e_original"):
            ent_e_bruto.insert(0, f"{pt_dados['e_original']:.3f}")
            
        ttk.Label(f_bloco_a, text="Altitude Bruta (m):").grid(row=1, column=0, sticky="w", pady=5)
        ent_h_bruto = ttk.Entry(f_bloco_a)
        ent_h_bruto.grid(row=1, column=1, sticky="w", padx=5)
        if pt_dados.get("alt_original"):
            ent_h_bruto.insert(0, f"{pt_dados['alt_original']:.3f}")

        # Bloco B: Coordenadas Corrigidas (Híbrido)
        f_bloco_b = ttk.LabelFrame(container, text="Bloco B: Coordenadas Corrigidas / Oficiais (IBGE-PPP)", padding=5)
        f_bloco_b.pack(fill="both", expand=True, pady=5)
        
        notebook_b = ttk.Notebook(f_bloco_b)
        notebook_b.pack(fill="both", expand=True, padx=5, pady=5)
        
        tab_geodesica = ttk.Frame(notebook_b, padding=10)
        tab_plana = ttk.Frame(notebook_b, padding=10)
        
        notebook_b.add(tab_geodesica, text="Opção 1: Geodésicas Corrigidas")
        notebook_b.add(tab_plana, text="Opção 2: Planas UTM Corrigidas")
        
        # Aba Geodésica
        ttk.Label(tab_geodesica, text="Latitude Corrigida (Graus Decimais):").grid(row=0, column=0, sticky="w", pady=5)
        ent_lat_corr = ttk.Entry(tab_geodesica, width=25)
        ent_lat_corr.grid(row=0, column=1, sticky="w", padx=5)
        
        ttk.Label(tab_geodesica, text="Longitude Corrigida (Graus Decimais):").grid(row=1, column=0, sticky="w", pady=5)
        ent_lon_corr = ttk.Entry(tab_geodesica, width=25)
        ent_lon_corr.grid(row=1, column=1, sticky="w", padx=5)
        
        # Aba Plana UTM
        ttk.Label(tab_plana, text="Norte Corrigido (N) (m):").grid(row=0, column=0, sticky="w", pady=5)
        ent_n_corr = ttk.Entry(tab_plana, width=20)
        ent_n_corr.grid(row=0, column=1, sticky="w", padx=5)
        
        ttk.Label(tab_plana, text="Este Corrigido (E) (m):").grid(row=1, column=0, sticky="w", pady=5)
        ent_e_corr = ttk.Entry(tab_plana, width=20)
        ent_e_corr.grid(row=1, column=1, sticky="w", padx=5)
        
        ttk.Label(tab_plana, text="Zona/Fuso UTM:").grid(row=2, column=0, sticky="w", pady=5)
        cb_fuso = ttk.Combobox(tab_plana, state="readonly", values=["21S", "22S", "23S", "24S"], width=10)
        cb_fuso.grid(row=2, column=1, sticky="w", padx=5)
        cb_fuso.set("22S")
        
        # Incertezas e Alt elipsoidal comum
        f_comum = ttk.LabelFrame(container, text="Altitudes e Desvios Padrão (Incertezas Oficiais)", padding=10)
        f_comum.pack(fill="x", pady=5)
        
        ttk.Label(f_comum, text="Altitude Elipsoidal Corrigida (h) (m):").grid(row=0, column=0, sticky="w", pady=5)
        ent_h_corr = ttk.Entry(f_comum, width=15)
        ent_h_corr.grid(row=0, column=1, sticky="w", padx=5)
        
        ttk.Label(f_comum, text="Sigma Lat/Norte (m):").grid(row=1, column=0, sticky="w", pady=5)
        ent_sig_n = ttk.Entry(f_comum, width=10)
        ent_sig_n.grid(row=1, column=1, sticky="w", padx=5)
        ent_sig_n.insert(0, "0.015")
        
        ttk.Label(f_comum, text="Sigma Lon/Este (m):").grid(row=1, column=2, sticky="w", pady=5, padx=(10, 0))
        ent_sig_e = ttk.Entry(f_comum, width=10)
        ent_sig_e.grid(row=1, column=3, sticky="w", padx=5)
        ent_sig_e.insert(0, "0.015")
        
        ttk.Label(f_comum, text="Sigma Alt (m):").grid(row=2, column=0, sticky="w", pady=5)
        ent_sig_h = ttk.Entry(f_comum, width=10)
        ent_sig_h.grid(row=2, column=1, sticky="w", padx=5)
        ent_sig_h.insert(0, "0.030")
        
        def processar_correcao_manual():
            try:
                # Dados Brutos
                brutos = {
                    "e_bruto": float(ent_e_bruto.get()),
                    "n_bruto": float(ent_n_bruto.get()),
                    "alt_bruta": float(ent_h_bruto.get())
                }
                
                # Coordenadas Corrigidas
                aba_ativa = notebook_b.index(notebook_b.select())
                
                corrigidos = {
                    "alt_corrigida": float(ent_h_corr.get()),
                    "sigma_lat": float(ent_sig_n.get()),
                    "sigma_lon": float(ent_sig_e.get()),
                    "sigma_alt": float(ent_sig_h.get())
                }
                
                if aba_ativa == 0: # Aba Geodésica
                    corrigidos["tipo_entrada"] = "geodesica"
                    corrigidos["lat_corrigida"] = float(ent_lat_corr.get())
                    corrigidos["lon_corrigida"] = float(ent_lon_corr.get())
                else: # Aba UTM
                    corrigidos["tipo_entrada"] = "utm"
                    corrigidos["e_corrigido"] = float(ent_e_corr.get())
                    corrigidos["n_corrigido"] = float(ent_n_corr.get())
                    corrigidos["fuso"] = cb_fuso.get()
                
                # Executa
                qtd = aplicar_correcao_manual_lote(
                    self.levantamento_selecionado, 
                    None, 
                    self.arquivo_selecionado, 
                    brutos, 
                    corrigidos
                )
                
                messagebox.showinfo("Sucesso", f"Forçar Correção Manual concluído! {qtd} pontos foram corrigidos de forma absoluta.")
                modal.destroy()
                self.carregar_pontos()
                
            except Exception as e:
                messagebox.showerror("Erro de Inserção", f"Falha ao realizar override manual: {e}")
                
        btn_aplicar = ttk.Button(container, text="Forçar Correção Geométrica Manual", style="Accent.TButton", command=processar_correcao_manual)
        btn_aplicar.pack(pady=10)
        
        ttk.Button(container, text="Cancelar", command=modal.destroy).pack()
