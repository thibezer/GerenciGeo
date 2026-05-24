import tkinter as tk
from tkinter import ttk, messagebox
from ui.widgets.treeview_table import PaginatedTreeview
from database.connection import execute_query
from business.sigef_validator import VertexGenerator

class LevantamentoView(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.setup_ui()

    def setup_ui(self):
        lbl_title = ttk.Label(self, text="Gestão de Levantamentos Práticos", style="Title.TLabel")
        lbl_title.pack(pady=10, padx=10, anchor="w")
        
        form_frame = ttk.Frame(self, style="Card.TFrame", padding=10)
        form_frame.pack(fill="x", padx=10, pady=5)
        
        ttk.Label(form_frame, text="* Módulo para inserção de Levantamento (Data, Aparelho) e visualização de Pontos.", font=("Segoe UI", 9, "italic")).grid(row=0, column=0, columnspan=2, sticky="w")
        
        ttk.Label(form_frame, text="Data Lev (YYYY-MM-DD):").grid(row=1, column=0, sticky="w", pady=5)
        self.ent_data = ttk.Entry(form_frame)
        self.ent_data.grid(row=1, column=1, sticky="w", padx=5)

        ttk.Label(form_frame, text="Rovers Utilizados:").grid(row=2, column=0, sticky="w", pady=5)
        self.ent_equip = ttk.Entry(form_frame, width=30)
        self.ent_equip.grid(row=2, column=1, sticky="w", padx=5)

        btn_salvar = ttk.Button(form_frame, text="Registrar Base de Levantamento", style="Accent.TButton", command=self.save)
        btn_salvar.grid(row=3, column=0, columnspan=2, pady=15)

        ttk.Label(self, text="Pontos deste Levantamento:").pack(padx=10, anchor="w")
        
        cols = ("id", "nome_vertice", "tipo", "lat_bruta", "lon_bruta")
        headers = ("ID", "Nome (Ex: ABCD-M-0001)", "Tipo do Ponto", "Latitude Bruta", "Longitude Bruta")
        self.table = PaginatedTreeview(self, columns=cols, headers=headers)
        self.table.pack(fill="both", expand=True, padx=10, pady=10)

    def save(self):
        # Insert Lógico placeholder para expansão (em ambiente produtivo ligará Propriedade_ID explicitamente via combo)
        messagebox.showinfo("Sucesso", "Base cadastrada (Interface de demonstração estrutural)!")
