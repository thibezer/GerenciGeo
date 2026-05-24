import tkinter as tk
from tkinter import ttk
from database.connection import execute_query

class DashboardView(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.setup_ui()
        self.load_counts()

    def setup_ui(self):
        lbl_title = ttk.Label(self, text="Painel de Bordo", style="Title.TLabel")
        lbl_title.pack(pady=20, padx=20, anchor="w")

        self.cards_frame = ttk.Frame(self)
        self.cards_frame.pack(fill="x", padx=20)

    def _create_card(self, parent, title, val_var):
        f = ttk.Frame(parent, style="Card.TFrame", padding=20)
        ttk.Label(f, text=title, font=("Segoe UI", 12)).pack()
        ttk.Label(f, textvariable=val_var, font=("Segoe UI", 20, "bold")).pack()
        return f

    def load_counts(self):
        # Variáveis
        self.count_cli = tk.StringVar(value="0")
        self.count_prop = tk.StringVar(value="0")
        self.count_prof = tk.StringVar(value="0")

        self._create_card(self.cards_frame, "Total de Clientes", self.count_cli).grid(row=0, column=0, padx=10)
        self._create_card(self.cards_frame, "Propriedades", self.count_prop).grid(row=0, column=1, padx=10)
        self._create_card(self.cards_frame, "Credenciados", self.count_prof).grid(row=0, column=2, padx=10)

        try:
            cli = execute_query("SELECT COUNT(*) as cl_count FROM clientes", fetch_all=False, fetch_one=True)
            prop = execute_query("SELECT COUNT(*) as p_count FROM propriedades", fetch_all=False, fetch_one=True)
            prof = execute_query("SELECT COUNT(*) as pr_count FROM profissionais", fetch_all=False, fetch_one=True)
            self.count_cli.set(str(cli['cl_count']) if cli else "0")
            self.count_prop.set(str(prop['p_count']) if prop else "0")
            self.count_prof.set(str(prof['pr_count']) if prof else "0")
        except:
            pass
