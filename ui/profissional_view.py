import tkinter as tk
from tkinter import ttk, messagebox
from ui.widgets.treeview_table import PaginatedTreeview
from database.repository import ProfissionalRepo

class ProfissionalView(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.repo = ProfissionalRepo()
        self.setup_ui()
        self.load_data()

    def setup_ui(self):
        lbl_title = ttk.Label(self, text="Gestão de Profissionais", style="Title.TLabel")
        lbl_title.pack(pady=10, padx=10, anchor="w")
        
        form_frame = ttk.Frame(self, style="Card.TFrame", padding=10)
        form_frame.pack(fill="x", padx=10, pady=5)
        
        ttk.Label(form_frame, text="Nome Completo:").grid(row=0, column=0, sticky="w", pady=5)
        self.ent_nome = ttk.Entry(form_frame, width=40)
        self.ent_nome.grid(row=0, column=1, sticky="w", padx=5)

        ttk.Label(form_frame, text="Registro (CREA/CAU):").grid(row=1, column=0, sticky="w", pady=5)
        self.ent_crea = ttk.Entry(form_frame, width=20)
        self.ent_crea.grid(row=1, column=1, sticky="w", padx=5)

        ttk.Label(form_frame, text="Cod. INCRA (4 let.):").grid(row=2, column=0, sticky="w", pady=5)
        self.ent_cod = ttk.Entry(form_frame, width=10)
        self.ent_cod.grid(row=2, column=1, sticky="w", padx=5)

        btn_salvar = ttk.Button(form_frame, text="Cadastrar", style="Accent.TButton", command=self.save)
        btn_salvar.grid(row=3, column=0, columnspan=2, pady=15)

        cols = ("id", "nome", "crea", "cod", "cm", "cp", "cv")
        headers = ("ID", "Nome", "CREA", "Código", "Contador M", "Contador P", "Contador V")
        self.table = PaginatedTreeview(self, columns=cols, headers=headers)
        self.table.pack(fill="both", expand=True, padx=10, pady=10)

    def load_data(self):
        dados = self.repo.get_all()
        lista = []
        for d in dados:
            lista.append((d['id'], d['nome'], d['registro'], d['codigo_credenciado'], d['contador_m'], d['contador_p'], d['contador_v']))
        self.table.populate(lista)

    def save(self):
        n = self.ent_nome.get()
        r = self.ent_crea.get()
        c = self.ent_cod.get().upper()
        if not n or not r or len(c)!=4:
            messagebox.showwarning("Aviso", "Preencha todos e código INCRA tem que ter exatos 4 dígitos!")
            return
        
        try:
            self.repo.insert(n, r, c)
            self.ent_nome.delete(0, 'end'); self.ent_crea.delete(0, 'end'); self.ent_cod.delete(0, 'end')
            self.load_data()
        except Exception as e:
            messagebox.showerror("Erro", str(e))
