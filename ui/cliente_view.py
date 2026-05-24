import re
import tkinter as tk
from tkinter import ttk, messagebox
from ui.widgets.treeview_table import PaginatedTreeview
from database.repository import ClienteRepo

class ClienteView(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.repo = ClienteRepo()
        self.current_id = None
        
        self.setup_ui()
        self.load_data()

    def formatar_cpf_cnpj(self, event):
        """Aplica máscara de CPF ou CNPJ enquanto o usuário digita"""
        text = self.ent_cpf.get()
        # Remove tudo que não é dígito
        raw_text = re.sub(r'\D', '', text)
        formatted = ""

        if len(raw_text) <= 11:
            # Máscara CPF: 000.000.000-00
            if len(raw_text) > 0: formatted += raw_text[:3]
            if len(raw_text) > 3: formatted += "." + raw_text[3:6]
            if len(raw_text) > 6: formatted += "." + raw_text[6:9]
            if len(raw_text) > 9: formatted += "-" + raw_text[9:11]
            self._is_cnpj = False
        else:
            # Máscara CNPJ: 00.000.000/0000-00
            if len(raw_text) > 0: formatted += raw_text[:2]
            if len(raw_text) > 2: formatted += "." + raw_text[2:5]
            if len(raw_text) > 5: formatted += "." + raw_text[5:8]
            if len(raw_text) > 8: formatted += "/" + raw_text[8:12]
            if len(raw_text) > 12: formatted += "-" + raw_text[12:14]
            self._is_cnpj = True

        self.ent_cpf.delete(0, tk.END)
        self.ent_cpf.insert(0, formatted)
        self.verificar_campos_cnpj()

    def verificar_campos_cnpj(self):
        """Se for CNPJ bloqueia os campos de civil/conjuge que nao fazem sentido para Pessoa Juridica"""
        raw_text = re.sub(r'\D', '', self.ent_cpf.get())
        if len(raw_text) > 11:
            # Pessoa Jurídica
            self.cb_est_civil.set('')
            self.cb_est_civil.config(state="disabled")
            self.ent_conjuge.delete(0, 'end')
            self.ent_conjuge.config(state="disabled")
            self.ent_cpf_conjuge.delete(0, 'end')
            self.ent_cpf_conjuge.config(state="disabled")
            self.ent_profissao.delete(0, 'end')
            self.ent_profissao.config(state="disabled")
        else:
            # Pessoa Física
            self.cb_est_civil.config(state="readonly")
            self.ent_profissao.config(state="normal")
            self.on_estado_civil_change(None)

    def setup_ui(self):
        # Título
        lbl_title = ttk.Label(self, text="Gestão de Clientes", style="Title.TLabel")
        lbl_title.pack(pady=10, padx=10, anchor="w")
        
        # Form Frame
        form_frame = ttk.Frame(self, style="Card.TFrame", padding=10)
        form_frame.pack(fill="x", padx=10, pady=5)
        
        # Row 1
        ttk.Label(form_frame, text="Nome/Razão Social:").grid(row=0, column=0, sticky="w", pady=5)
        self.ent_nome = ttk.Entry(form_frame, width=40)
        self.ent_nome.grid(row=0, column=1, sticky="w", padx=5)

        ttk.Label(form_frame, text="CPF/CNPJ:").grid(row=0, column=2, sticky="w", pady=5, padx=10)
        self.ent_cpf = ttk.Entry(form_frame, width=20)
        self.ent_cpf.grid(row=0, column=3, sticky="w", padx=5)
        self.ent_cpf.bind("<KeyRelease>", self.formatar_cpf_cnpj)

        # Row 2 (Estado Civil / Casamento)
        ttk.Label(form_frame, text="Estado Civil:").grid(row=1, column=0, sticky="w", pady=5)
        self.cb_est_civil = ttk.Combobox(form_frame, values=["Solteiro(a)", "Casado(a)", "Viúvo(a)", "Divorciado(a)"], state="readonly", width=15)
        self.cb_est_civil.grid(row=1, column=1, sticky="w", padx=5)
        self.cb_est_civil.bind("<<ComboboxSelected>>", self.on_estado_civil_change)

        ttk.Label(form_frame, text="Profissão:").grid(row=1, column=2, sticky="w", pady=5, padx=10)
        self.ent_profissao = ttk.Entry(form_frame, width=20)
        self.ent_profissao.grid(row=1, column=3, sticky="w", padx=5)

        # Row Casamento
        ttk.Label(form_frame, text="Cônjuge:").grid(row=2, column=0, sticky="w", pady=5)
        self.ent_conjuge = ttk.Entry(form_frame, width=40, state="disabled")
        self.ent_conjuge.grid(row=2, column=1, sticky="w", padx=5)

        ttk.Label(form_frame, text="CPF Cônjuge:").grid(row=2, column=2, sticky="w", pady=5, padx=10)
        self.ent_cpf_conjuge = ttk.Entry(form_frame, width=20, state="disabled")
        self.ent_cpf_conjuge.grid(row=2, column=3, sticky="w", padx=5)

        # Municipio e UF
        ttk.Label(form_frame, text="Município:").grid(row=3, column=0, sticky="w", pady=5)
        self.ent_municipio = ttk.Entry(form_frame, width=30)
        self.ent_municipio.grid(row=3, column=1, sticky="w", padx=5)

        ttk.Label(form_frame, text="UF:").grid(row=3, column=2, sticky="w", pady=5, padx=10)
        self.ent_uf = ttk.Entry(form_frame, width=5)
        self.ent_uf.grid(row=3, column=3, sticky="w", padx=5)

        # Botões
        btn_frame = ttk.Frame(form_frame, style="TFrame")
        btn_frame.grid(row=4, column=0, columnspan=4, pady=15)
        
        ttk.Button(btn_frame, text="Limpar", command=self.clear_form).pack(side="left", padx=5)
        self.btn_salvar = ttk.Button(btn_frame, text="Inserir Cliente", style="Accent.TButton", command=self.save)
        self.btn_salvar.pack(side="left", padx=5)

        # Tabela
        cols = ("id", "nome", "cpf", "est_civil", "conjuge", "municipio")
        headers = ("ID", "Nome / Razão", "CPF/CNPJ", "Estado Civil", "Cônjuge", "Município")
        self.table = PaginatedTreeview(self, columns=cols, headers=headers)
        self.table.pack(fill="both", expand=True, padx=10, pady=10)
        self.table.bind_double_click(self.carregar_para_edicao)

    def on_estado_civil_change(self, event):
        est = self.cb_est_civil.get()
        if est == "Casado(a)":
            self.ent_conjuge.config(state="normal")
            self.ent_cpf_conjuge.config(state="normal")
        else:
            self.ent_conjuge.delete(0, 'end')
            self.ent_cpf_conjuge.delete(0, 'end')
            self.ent_conjuge.config(state="disabled")
            self.ent_cpf_conjuge.config(state="disabled")

    def load_data(self):
        clientes = self.repo.get_all()
        lista = []
        for c in clientes:
            lista.append((c['id'], c['nome'], c['cpf_cnpj'], c['estado_civil'], c['nome_conjuge'], c['municipio']))
        self.table.populate(lista)

    def carregar_para_edicao(self, event):
        selected = self.table.get_selected()
        if not selected: return
        
        item_id = selected[0]
        cliente = self.repo.get_by_id(item_id)
        if cliente:
            self.clear_form()
            self.current_id = item_id
            
            self.ent_nome.insert(0, cliente.get('nome') or '')
            self.ent_cpf.insert(0, cliente.get('cpf_cnpj') or '')
            self.formatar_cpf_cnpj(None) # Dispara mascara
            
            if cliente.get('estado_civil'):
                self.cb_est_civil.set(cliente.get('estado_civil'))
            if cliente.get('profissao'):
                self.ent_profissao.insert(0, cliente.get('profissao') or '')
            
            self.verificar_campos_cnpj() # Força update dos botões de cônjuge  
            
            if cliente.get('nome_conjuge') and self.cb_est_civil.get() == "Casado(a)":
                self.ent_conjuge.insert(0, cliente.get('nome_conjuge') or '')
            if cliente.get('cpf_conjuge') and self.cb_est_civil.get() == "Casado(a)":
                self.ent_cpf_conjuge.insert(0, cliente.get('cpf_conjuge') or '')
                
            self.ent_municipio.insert(0, cliente.get('municipio') or '')
            self.ent_uf.insert(0, cliente.get('uf') or '')
            
            self.btn_salvar.config(text="Atualizar Dados")

    def clear_form(self):
        self.current_id = None
        self.ent_nome.delete(0, 'end')
        self.ent_cpf.delete(0, 'end')
        
        self.cb_est_civil.config(state="readonly")
        self.cb_est_civil.set('')
        
        self.ent_profissao.config(state="normal")
        self.ent_profissao.delete(0, 'end')
        
        self.ent_conjuge.config(state="normal")
        self.ent_conjuge.delete(0, 'end')
        self.ent_cpf_conjuge.config(state="normal")
        self.ent_cpf_conjuge.delete(0, 'end')
        
        self.ent_municipio.delete(0, 'end')
        self.ent_uf.delete(0, 'end')
        
        self.on_estado_civil_change(None)
        self.btn_salvar.config(text="Inserir Cliente")

    def save(self):
        dados = {
            "nome": self.ent_nome.get(),
            "cpf_cnpj": self.ent_cpf.get(),
            "estado_civil": self.cb_est_civil.get() if self.cb_est_civil.instate(['!disabled']) else None,
            "profissao": self.ent_profissao.get() if self.ent_profissao.instate(['!disabled']) else None,
            "nome_conjuge": self.ent_conjuge.get() if self.cb_est_civil.get() == "Casado(a)" and self.ent_conjuge.instate(['!disabled']) else None,
            "cpf_conjuge": self.ent_cpf_conjuge.get() if self.cb_est_civil.get() == "Casado(a)" and self.ent_cpf_conjuge.instate(['!disabled']) else None,
            "municipio": self.ent_municipio.get(),
            "uf": self.ent_uf.get()
        }

        if not dados["nome"] or not dados["cpf_cnpj"]:
            messagebox.showwarning("Aviso", "Nome e CPF/CNPJ são obrigatórios!")
            return

        try:
            if self.current_id:
                self.repo.update(self.current_id, dados)
                messagebox.showinfo("Sucesso", "Dados do Cliente atualizados com sucesso!")
            else:
                self.repo.insert(dados)
                messagebox.showinfo("Sucesso", "Cliente cadastrado com sucesso!")
                
            self.clear_form()
            self.load_data()
        except Exception as e:
            messagebox.showerror("Erro", f"Erro no BD: {e}. Verifique se o CPF/CNPJ ou dados já existem.")
