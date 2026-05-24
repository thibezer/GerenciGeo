from tkinter import ttk

def setup_styles():
    style = ttk.Style()
    
    # Paleta de Cores (Tema Escuro Profissional)
    bg_color = "#1a1a2e"
    frame_color = "#16213e"
    accent_color = "#0f3460"
    highlight_color = "#e94560"
    text_color = "#eeeeee"
    
    # Opcional: usar o tema default como base pra não bugar em alguns SOs
    if "clam" in style.theme_names():
        style.theme_use("clam")
        
    # Frames
    style.configure("TFrame", background=bg_color)
    style.configure("Card.TFrame", background=frame_color, relief="groove", borderwidth=1)
    
    # Buttons
    style.configure("TButton", 
                    background=accent_color, 
                    foreground=text_color, 
                    font=("Segoe UI", 10, "bold"),
                    padding=6,
                    borderwidth=0)
    style.map("TButton",
              background=[('active', highlight_color)])

    # Accent Button (Para botões principais como "Salvar", "Converter")
    style.configure("Accent.TButton", 
                    background=highlight_color, 
                    foreground="white", 
                    font=("Segoe UI", 10, "bold"),
                    padding=6)
    style.map("Accent.TButton",
              background=[('active', "#ff5773")])

    # Labels
    style.configure("TLabel", 
                    background=bg_color, 
                    foreground=text_color, 
                    font=("Segoe UI", 10))
    style.configure("Title.TLabel", 
                    background=bg_color, 
                    foreground=highlight_color, 
                    font=("Segoe UI", 18, "bold"))
    
    # Treeview (Tabela)
    style.configure("Treeview",
                    background=frame_color,
                    foreground=text_color,
                    fieldbackground=frame_color,
                    font=("Segoe UI", 10),
                    rowheight=25)
    style.map('Treeview', background=[('selected', highlight_color)])
    style.configure("Treeview.Heading", 
                    background=accent_color, 
                    foreground=text_color, 
                    font=("Segoe UI", 10, "bold"),
                    relief="flat")
    style.map("Treeview.Heading", background=[('active', highlight_color)])

    return bg_color
