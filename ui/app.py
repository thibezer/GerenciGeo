import tkinter as tk
from tkinter import ttk
from ui.styles import setup_styles

class GerenciGeoApp:
    def __init__(self, root):
        self.root = root
        self.root.title("GerenciGeo - Georreferenciamento Automático")
        self.root.geometry("1400x800")
        self.root.minsize(1024, 768) # Evita que a janela seja esmagada demais
        
        # Iniciar Estilos
        self.bg_color = setup_styles()
        self.root.configure(bg=self.bg_color)
        
        # ==============================================================
        # 1. STATUS BAR (Deve ser empacotada PRIMEIRO para pegar toda a base)
        # ==============================================================
        self.status_frame = ttk.Frame(self.root, height=35, style="Card.TFrame")
        self.status_frame.pack(side="bottom", fill="x")
        
        self.status_label = ttk.Label(self.status_frame, text="Sistema Módulo Base Iniciado. DB Conectado.")
        self.status_label.pack(side="left", padx=15, pady=5)

        # ==============================================================
        # 2. SIDEBAR LATERAL
        # ==============================================================
        self.sidebar = ttk.Frame(self.root, width=220, style="Card.TFrame")
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False) # FORÇA a sidebar a manter a largura de 220px fixos
        
        # ==============================================================
        # 3. ÁREA PRINCIPAL
        # ==============================================================
        self.main_area = ttk.Frame(self.root, style="TFrame")
        # Adicionado padx e pady para as abas não grudarem nas bordas da janela
        self.main_area.pack(side="left", fill="both", expand=True, padx=15, pady=15)

        self.frames = {}
        self.setup_sidebar()
        self.setup_placeholder_frames()
        self.show_frame("Dashboard")

    def setup_sidebar(self):
        # Título da Sidebar com mais respiro
        title_lbl = ttk.Label(self.sidebar, text="GerenciGeo", style="Title.TLabel")
        title_lbl.pack(pady=(25, 10), padx=10)
        
        # Linha separadora elegante abaixo do título
        separator = ttk.Separator(self.sidebar, orient="horizontal")
        separator.pack(fill="x", padx=20, pady=(0, 20))

        buttons = [
            "Dashboard", 
            "Profissionais", 
            "Clientes", 
            "Propriedades", 
            "Levantamentos",
            "Módulos PPP", 
            "Editor .MEM"
        ]

        for btn in buttons:
            # ipady=5 "engorda" o botão por dentro, deixando ele mais alto e clicável
            b = ttk.Button(self.sidebar, text=btn, command=lambda name=btn: self.show_frame(name))
            b.pack(fill="x", padx=15, pady=8, ipady=5)

    def setup_placeholder_frames(self):
        # Importação atrasada (lazy loading) para evitar import circular
        from ui.dashboard import DashboardView
        from ui.cliente_view import ClienteView
        from ui.mem_editor_view import MemEditorView
        from ui.processamento_view import ProcessamentoView
        from ui.profissional_view import ProfissionalView
        from ui.propriedade_view import PropriedadeView
        from ui.levantamento_view import LevantamentoView
        
        self.frames["Dashboard"] = DashboardView(self.main_area)
        self.frames["Clientes"] = ClienteView(self.main_area)
        self.frames["Profissionais"] = ProfissionalView(self.main_area)
        self.frames["Propriedades"] = PropriedadeView(self.main_area)
        self.frames["Levantamentos"] = LevantamentoView(self.main_area)
        self.frames["Editor .MEM"] = MemEditorView(self.main_area)
        self.frames["Módulos PPP"] = ProcessamentoView(self.main_area)

    def show_frame(self, frame_name):
        for f in self.frames.values():
            f.pack_forget()
            
        frame = self.frames.get(frame_name)
        if frame:
            frame.pack(fill="both", expand=True)