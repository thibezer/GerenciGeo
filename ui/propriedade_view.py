import tkinter as tk
from tkinter import ttk, messagebox
from ui.widgets.treeview_table import PaginatedTreeview
from database.repository import PropriedadeRepo, ClienteRepo, PropriedadeClienteRepo, MunicipioRepo

class PropriedadeView(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.repo = PropriedadeRepo()
        self.cli_repo = ClienteRepo()
        self.rel_repo = PropriedadeClienteRepo()
        self.mun_repo = MunicipioRepo()
        self.current_id = None
        self.socios_temporarios = []
        
        self.setup_ui()
        self.load_data()
        self.load_clientes_combobox()

    def load_clientes_combobox(self):
        self.clientes_disp = self.cli_repo.get_all()
        vals = [f"{c['id']} - {c['nome']}" for c in self.clientes_disp]
        self.cb_cliente['values'] = vals

    def setup_ui(self):
        lbl_title = ttk.Label(self, text="Gestão de Propriedades", style="Title.TLabel")
        lbl_title.pack(pady=10, padx=10, anchor="w")
        
        container = ttk.Frame(self)
        container.pack(fill="x", padx=10, pady=5)
        
        # Esquerda: Dados Basicos Propriedade
        f_dados = ttk.LabelFrame(container, text="Dados da Propriedade", padding=10)
        f_dados.pack(side="left", fill="both", expand=True, padx=5)

        ttk.Label(f_dados, text="Nome da Propriedade:").grid(row=0, column=0, sticky="w", pady=5)
        self.ent_nome = ttk.Entry(f_dados, width=40)
        self.ent_nome.grid(row=0, column=1, sticky="w", padx=5)

        ttk.Label(f_dados, text="Código SNCR:").grid(row=1, column=0, sticky="w", pady=5)
        self.ent_sncr = ttk.Entry(f_dados, width=20)
        self.ent_sncr.grid(row=1, column=1, sticky="w", padx=5)

        ttk.Label(f_dados, text="Município:").grid(row=2, column=0, sticky="w", pady=5)
        self.ent_mun = ttk.Combobox(f_dados, width=28)
        self.ent_mun.grid(row=2, column=1, sticky="w", padx=5)
        self.ent_mun.bind("<KeyRelease>", self.on_mun_key)

        ttk.Label(f_dados, text="UF:").grid(row=3, column=0, sticky="w", pady=5)
        self.ent_uf = ttk.Entry(f_dados, width=5)
        self.ent_uf.grid(row=3, column=1, sticky="w", padx=5)
        self.ent_uf.insert(0, "PR") # Default

        # Direita: Socios
        f_socios = ttk.LabelFrame(container, text="Proprietários / Sócios (%)", padding=10)
        f_socios.pack(side="right", fill="both", expand=True, padx=5)
        
        ttk.Label(f_socios, text="Cliente:").grid(row=0, column=0, sticky="w")
        self.cb_cliente = ttk.Combobox(f_socios, state="readonly", width=30)
        self.cb_cliente.grid(row=0, column=1, sticky="w", padx=5)

        ttk.Label(f_socios, text="% Participação:").grid(row=1, column=0, sticky="w")
        self.ent_pct = ttk.Entry(f_socios, width=10)
        self.ent_pct.grid(row=1, column=1, sticky="w", padx=5)

        btn_add = ttk.Button(f_socios, text="Adicionar Sócio", command=self.add_socio)
        btn_add.grid(row=2, column=0, padx=5, pady=5)
        
        btn_rem = ttk.Button(f_socios, text="Remover Selecionado", command=self.remove_socio)
        btn_rem.grid(row=2, column=1, padx=5, pady=5)

        self.listbox_soc = tk.Listbox(f_socios, height=5)
        self.listbox_soc.grid(row=3, column=0, columnspan=2, sticky="ew", pady=5)

        # Bottom Btn
        f_btn = ttk.Frame(self)
        f_btn.pack(pady=10)
        self.btn_salvar = ttk.Button(f_btn, text="Salvar Propriedade", style="Accent.TButton", command=self.save)
        self.btn_salvar.pack(side="left", padx=5)
        ttk.Button(f_btn, text="Limpar", command=self.clear_form).pack(side="left", padx=5)

        # Tabela
        self.table = PaginatedTreeview(self, columns=("id", "nome", "sncr", "mun"), headers=("ID", "Propriedade", "SNCR", "Município/UF"))
        self.table.pack(fill="both", expand=True, padx=10, pady=10)
        self.table.bind_double_click(self.carregar_para_edicao)

    def on_mun_key(self, event):
        termo = self.ent_mun.get()
        if len(termo) < 2: 
            self.ent_mun['values'] = []
            return
        
        uf = self.ent_uf.get().upper()
        sugestoes = self.mun_repo.search(termo, uf)
        if sugestoes:
            self.ent_mun['values'] = sugestoes
            # Abre o dropdown se houver resultados
            try:
                self.ent_mun.event_generate('<Down>')
            except: pass

    def add_socio(self):
        sel = self.cb_cliente.get()
        pct = self.ent_pct.get()
        if not sel or not pct: return
        
        try:
            pct_float = float(pct.replace(',','.'))
        except:
            messagebox.showerror("Erro", "% deve ser número")
            return
            
        cli_id = int(sel.split(' - ')[0])
        self.socios_temporarios.append({"id": cli_id, "percentual": pct_float, "lbl": f"{sel} | {pct_float}%"})
        self.update_listbox()
        
        self.cb_cliente.set('')
        self.ent_pct.delete(0, 'end')

    def remove_socio(self):
        idx = self.listbox_soc.curselection()
        if idx:
            self.socios_temporarios.pop(idx[0])
            self.update_listbox()

    def update_listbox(self):
        self.listbox_soc.delete(0, tk.END)
        for s in self.socios_temporarios:
            self.listbox_soc.insert(tk.END, s['lbl'])

    def load_data(self):
        props = self.repo.get_all()
        lista = [(p['id'], p['nome'], p['codigo_sncr'], f"{p['municipio']}-{p['uf']}") for p in props]
        self.table.populate(lista)

    def carregar_para_edicao(self, event):
        selected = self.table.get_selected()
        if not selected: return
        
        prop_id = selected[0]
        prop = self.repo.get_by_id(prop_id)
        if prop:
            self.clear_form()
            self.current_id = prop_id
            self.ent_nome.insert(0, prop['nome'] or '')
            self.ent_sncr.insert(0, prop['codigo_sncr'] or '')
            self.ent_mun.insert(0, prop['municipio'] or '')
            self.ent_uf.delete(0, tk.END)
            self.ent_uf.insert(0, prop['uf'] or 'PR')
            
            # Carregar Sócios
            socios = self.rel_repo.get_by_propriedade(prop_id)
            self.socios_temporarios = []
            for s in socios:
                self.socios_temporarios.append({
                    "id": s['cliente_id'], 
                    "percentual": s['percentual_participacao'],
                    "lbl": f"{s['cliente_id']} - {s['nome']} | {s['percentual_participacao']}%"
                })
            self.update_listbox()
            self.btn_salvar.config(text="Atualizar Propriedade")

    def clear_form(self):
        self.current_id = None
        self.ent_nome.delete(0, tk.END)
        self.ent_sncr.delete(0, tk.END)
        self.ent_mun.delete(0, tk.END)
        self.ent_uf.delete(0, tk.END)
        self.ent_uf.insert(0, "PR")
        self.socios_temporarios = []
        self.update_listbox()
        self.btn_salvar.config(text="Salvar Propriedade")

    def save(self):
        nome = self.ent_nome.get()
        sncr = self.ent_sncr.get()
        mun = self.ent_mun.get()
        uf = self.ent_uf.get().upper()
        
        if not nome or not mun or not uf or not self.socios_temporarios:
            messagebox.showwarning("Aviso", "Nome, Município, UF e Sócios são obrigatórios.")
            return

        total_pct = sum(s['percentual'] for s in self.socios_temporarios)
        if total_pct > 100.001: # Margem erro float
            messagebox.showwarning("Aviso", "Soma das cotas não pode passar de 100%")
            return

        try:
            # Salvar município no banco (aprendizado automático)
            self.mun_repo.insert_if_not_exists(mun, uf)

            if self.current_id:
                self.repo.update(self.current_id, nome, sncr, mun, uf)
                self.rel_repo.limpar_socios(self.current_id)
                self.rel_repo.associar_socios(self.current_id, self.socios_temporarios)
                messagebox.showinfo("Sucesso", "Propriedade atualizada!")
            else:
                prop_id = self.repo.insert(nome, sncr, mun, uf)
                self.rel_repo.associar_socios(prop_id, self.socios_temporarios)
                messagebox.showinfo("Sucesso", "Propriedade cadastrada!")
            
            self.clear_form()
            self.load_data()
        except Exception as e:
            messagebox.showerror("Erro", str(e))
