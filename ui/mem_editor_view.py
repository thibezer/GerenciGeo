import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from ui.widgets.treeview_table import PaginatedTreeview
from business.mem_editor import MemEditorEngine

class MemEditorView(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.engine = None
        self.setup_ui()

    def setup_ui(self):
        lbl_title = ttk.Label(self, text="Leitor e Editor de Memorial Descritivo (.MEM)", style="Title.TLabel")
        lbl_title.pack(pady=10, padx=10, anchor="w")

        # Top Bar Command
        top_frame = ttk.Frame(self, style="Card.TFrame", padding=10)
        top_frame.pack(fill="x", padx=10, pady=5)

        ttk.Button(top_frame, text="Carregar Arquivo .MEM", command=self.load_file).pack(side="left", padx=5)
        ttk.Button(top_frame, text="Salvar Atualizações", style="Accent.TButton", command=self.save_file).pack(side="left", padx=5)

        self.lbl_file = ttk.Label(top_frame, text="Nenhum arquivo carregado.", font=("Segoe UI", 9, "italic"))
        self.lbl_file.pack(side="left", padx=15)

        # Table
        cols = ("idx", "vertice", "e", "n", "lat", "lon")
        headers = ("Idx", "Vértice", "Coordenada E", "Coordenada N", "Latitude", "Longitude")
        self.table = PaginatedTreeview(self, columns=cols, headers=headers)
        self.table.pack(fill="both", expand=True, padx=10, pady=10)
        
        self.table.bind_double_click(self.on_row_double_click)
        
        # Info
        ttk.Label(self, text="* Dê um duplo clique numa linha para editar coordenadas manualmente. Substituição em lote via importação PPP na ABA Módulos PPP.", font=("Segoe UI", 8)).pack(pady=5)

    def load_file(self):
        filepath = filedialog.askopenfilename(title="Selecione o arquivo .MEM", filetypes=[("Topocad2000 MEM", "*.MEM"), ("All Files", "*.*")])
        if not filepath: return
        
        self.engine = MemEditorEngine(filepath)
        try:
            self.engine.read_mem()
            pontos = self.engine.get_pontos()
            self.lbl_file.config(text=f"Arquivo: {filepath}")
            
            lista = []
            for p in pontos:
                lista.append((str(p['line_index']), p.get('nome_vertice', ''), p.get('E', ''), p.get('N', ''), p.get('lat', ''), p.get('lon', '')))
            self.table.populate(lista)
            messagebox.showinfo("Sucesso", f"{len(pontos)} vértices carregados!")
        except Exception as e:
            messagebox.showerror("Erro", f"Não foi possível ler o arquivo: {e}")

    def on_row_double_click(self, event):
        selected = self.table.get_selected()
        if not selected: return
        
        idx_line, vertice, e, n, lat, lon = selected
        self.open_edit_window(int(idx_line), vertice, e, n, lat, lon)

    def open_edit_window(self, idx, vertice, e, n, lat, lon):
        top = tk.Toplevel(self)
        top.title(f"Editor: {vertice}")
        top.geometry("300x300")
        
        ttk.Label(top, text=f"Editando Vértice {vertice}").pack(pady=10)

        f_lat = ttk.Frame(top)
        f_lat.pack(fill="x", padx=10, pady=5)
        ttk.Label(f_lat, text="Lat:", width=5).pack(side="left")
        e_lat = ttk.Entry(f_lat)
        e_lat.insert(0, lat)
        e_lat.pack(side="left", fill="x", expand=True)

        f_lon = ttk.Frame(top)
        f_lon.pack(fill="x", padx=10, pady=5)
        ttk.Label(f_lon, text="Lon:", width=5).pack(side="left")
        e_lon = ttk.Entry(f_lon)
        e_lon.insert(0, lon)
        e_lon.pack(side="left", fill="x", expand=True)

        def salvar_edicao():
            if self.engine:
                self.engine.update_coordenadas(idx, e_lat.get(), e_lon.get())
                self.load_table_from_engine()
                top.destroy()
        
        ttk.Button(top, text="Confirmar", command=salvar_edicao).pack(pady=20)

    def load_table_from_engine(self):
        self.engine.parse_pontos() # recarrega base
        pontos = self.engine.get_pontos()
        lista = []
        for p in pontos:
            lista.append((str(p['line_index']), p.get('nome_vertice', ''), p.get('E', ''), p.get('N', ''), p.get('lat', ''), p.get('lon', '')))
        self.table.populate(lista)

    def save_file(self):
        if not self.engine: return
        try:
            save_path = filedialog.asksaveasfilename(defaultextension=".MEM", title="Salvar .MEM como", initialfile="Atualizado.MEM")
            if save_path:
                self.engine.save(save_path)
                messagebox.showinfo("Sucesso", "Arquivo salvo!")
        except Exception as e:
            messagebox.showerror("Erro", str(e))
