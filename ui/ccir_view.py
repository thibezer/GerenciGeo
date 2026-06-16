import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import os
from ui.widgets.treeview_table import PaginatedTreeview
from database.repository import CcirCadastroRepo
from business.ccir_parser import parse_ccir_csv

class CcirView(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.repo = CcirCadastroRepo()
        
        # Obter a cor de fundo padrão do tema escuro
        self.bg_color = "#1a1a2e"
        
        self.setup_ui()
        self.load_arquivos()
        self.buscar() # Carga inicial de registros

    def setup_ui(self):
        # Título da Tela
        lbl_title = ttk.Label(self, text="Banco de Dados e Consultas de CCIRs", style="Title.TLabel")
        lbl_title.pack(pady=10, padx=10, anchor="w")

        # Container Principal Dividido (Top: Filtros | Mid: Tabela | Bottom: Arquivos)
        
        # 1. Painel de Busca Avançada (Filtros)
        f_filtros = ttk.LabelFrame(self, text="Busca Avançada (Filtros)", padding=10)
        f_filtros.pack(fill="x", padx=10, pady=5)
        
        # Grid layout para os filtros
        f_filtros.columnconfigure(1, weight=1)
        f_filtros.columnconfigure(3, weight=1)
        
        # Linha 0: Código e Denominação
        ttk.Label(f_filtros, text="Código do Imóvel:").grid(row=0, column=0, sticky="w", pady=5, padx=5)
        self.ent_codigo = ttk.Entry(f_filtros)
        self.ent_codigo.grid(row=0, column=1, sticky="ew", pady=5, padx=5)
        
        ttk.Label(f_filtros, text="Denominação:").grid(row=0, column=2, sticky="w", pady=5, padx=5)
        self.ent_denominacao = ttk.Entry(f_filtros)
        self.ent_denominacao.grid(row=0, column=3, sticky="ew", pady=5, padx=5)

        # Linha 1: Titular e Município
        ttk.Label(f_filtros, text="Titular:").grid(row=1, column=0, sticky="w", pady=5, padx=5)
        self.ent_titular = ttk.Entry(f_filtros)
        self.ent_titular.grid(row=1, column=1, sticky="ew", pady=5, padx=5)
        
        ttk.Label(f_filtros, text="Município/UF:").grid(row=1, column=2, sticky="w", pady=5, padx=5)
        self.ent_municipio = ttk.Entry(f_filtros)
        self.ent_municipio.grid(row=1, column=3, sticky="ew", pady=5, padx=5)

        # Linha 2: Faixa de Área e Faixa de Percentual
        f_faixas = ttk.Frame(f_filtros)
        f_faixas.grid(row=2, column=0, columnspan=4, sticky="w", pady=5, padx=5)
        
        ttk.Label(f_faixas, text="Área (ha) de:").pack(side="left", padx=2)
        self.ent_area_min = ttk.Entry(f_faixas, width=8)
        self.ent_area_min.pack(side="left", padx=2)
        ttk.Label(f_faixas, text="até:").pack(side="left", padx=2)
        self.ent_area_max = ttk.Entry(f_faixas, width=8)
        self.ent_area_max.pack(side="left", padx=2)
        
        ttk.Label(f_faixas, text=" | Detenção (%) de:").pack(side="left", padx=(15, 2))
        self.ent_pct_min = ttk.Entry(f_faixas, width=8)
        self.ent_pct_min.pack(side="left", padx=2)
        ttk.Label(f_faixas, text="até:").pack(side="left", padx=2)
        self.ent_pct_max = ttk.Entry(f_faixas, width=8)
        self.ent_pct_max.pack(side="left", padx=2)

        # Linha 3: Botões de Ação de Busca
        f_botoes_busca = ttk.Frame(f_filtros)
        f_botoes_busca.grid(row=3, column=0, columnspan=4, sticky="e", pady=10, padx=5)
        
        btn_buscar = ttk.Button(f_botoes_busca, text="Filtrar", style="Accent.TButton", command=self.buscar)
        btn_buscar.pack(side="left", padx=5)
        
        btn_limpar = ttk.Button(f_botoes_busca, text="Limpar Filtros", command=self.limpar_filtros)
        btn_limpar.pack(side="left", padx=5)

        # 2. Tabela de Resultados
        cols = ("id", "codigo", "denominacao", "municipio", "area", "titular", "pct")
        headers = ("ID", "Código CCIR", "Denominação do Imóvel", "Município/UF", "Área Total (ha)", "Titular (Co-proprietário)", "% Detenção")
        
        self.table = PaginatedTreeview(self, columns=cols, headers=headers, height=12)
        self.table.pack(fill="both", expand=True, padx=10, pady=5)
        self.table.bind_double_click(self.mostrar_detalhes_imovel)

        # Status Label para quantidade de linhas
        self.lbl_status = ttk.Label(self, text="Resultados encontrados: 0", font=("Segoe UI", 9, "italic"))
        self.lbl_status.pack(anchor="w", padx=15, pady=2)

        # 3. Painel de Gestão e Importação de Arquivos CSV
        f_arquivos = ttk.LabelFrame(self, text="Gerenciamento de Arquivos e Importação", padding=10)
        f_arquivos.pack(fill="x", padx=10, pady=10)
        
        # Coluna da esquerda: botões de importação/exclusão
        f_arq_acoes = ttk.Frame(f_arquivos)
        f_arq_acoes.pack(side="left", fill="y", padx=5, pady=5)
        
        btn_importar = ttk.Button(f_arq_acoes, text="Importar CSV CCIR", style="Accent.TButton", command=self.importar_csv)
        btn_importar.pack(fill="x", pady=5)
        
        btn_excluir = ttk.Button(f_arq_acoes, text="Excluir Planilha Selecionada", command=self.excluir_arquivo_selecionado)
        btn_excluir.pack(fill="x", pady=5)
        
        # Coluna da direita: Lista de arquivos importados
        f_arq_lista = ttk.Frame(f_arquivos)
        f_arq_lista.pack(side="right", fill="both", expand=True, padx=15)
        
        ttk.Label(f_arq_lista, text="Planilhas CCIR no Sistema:").pack(anchor="w")
        
        # Scrollbar e Listbox de arquivos
        scroll_arq = ttk.Scrollbar(f_arq_lista)
        scroll_arq.pack(side="right", fill="y")
        
        # Listbox estilizado escuro
        self.listbox_arquivos = tk.Listbox(
            f_arq_lista, 
            height=4, 
            yscrollcommand=scroll_arq.set,
            bg="#16213e",
            fg="#eeeeee",
            selectbackground="#e94560",
            selectforeground="white",
            borderwidth=0,
            highlightthickness=0
        )
        self.listbox_arquivos.pack(fill="both", expand=True)
        scroll_arq.config(command=self.listbox_arquivos.yview)

    def load_arquivos(self):
        """Carrega os arquivos já importados no listbox"""
        self.listbox_arquivos.delete(0, tk.END)
        self.arquivos_importados = self.repo.get_imported_files()
        for arq in self.arquivos_importados:
            label = f"{arq['arquivo_origem']} ({arq['total_registros']} registros) - Importado em {arq['data_importacao'][:16]}"
            self.listbox_arquivos.insert(tk.END, label)

    def buscar(self):
        """Executa a busca baseada nos filtros e atualiza a tabela"""
        # Tratar filtros numéricos
        def to_float(val):
            if not val:
                return None
            try:
                return float(val.replace(',', '.'))
            except ValueError:
                return None

        filters = {
            "codigo_imovel": self.ent_codigo.get().strip(),
            "denominacao": self.ent_denominacao.get().strip(),
            "titular": self.ent_titular.get().strip(),
            "municipio": self.ent_municipio.get().strip(),
            "area_min": to_float(self.ent_area_min.get().strip()),
            "area_max": to_float(self.ent_area_max.get().strip()),
            "pct_min": to_float(self.ent_pct_min.get().strip()),
            "pct_max": to_float(self.ent_pct_max.get().strip()),
        }

        try:
            resultados = self.repo.search_ccir_avancado(filters, limit=200)
            lista_tabela = []
            for r in resultados:
                # Formatar área para o padrão brasileiro
                area_fmt = f"{r['area_total']:.4f}".replace('.', ',') if r['area_total'] is not None else ""
                # Formatar percentual
                pct_fmt = f"{r['percentual_detencao']:.2f}%".replace('.', ',') if r['percentual_detencao'] is not None else ""
                
                lista_tabela.append((
                    r['id'],
                    r['codigo_imovel'],
                    r['denominacao'] or "",
                    f"{r['municipio']}-{r['uf']}" if r['municipio'] else "",
                    area_fmt,
                    r['titular'] or "",
                    pct_fmt
                ))
            
            self.table.populate(lista_tabela)
            self.lbl_status.config(text=f"Resultados encontrados: {len(resultados)} (limite máximo de 200 para visualização)")
        except Exception as e:
            messagebox.showerror("Erro de Busca", f"Ocorreu um erro ao realizar a consulta: {e}")

    def limpar_filtros(self):
        """Limpa as caixas de texto de filtro"""
        self.ent_codigo.delete(0, tk.END)
        self.ent_denominacao.delete(0, tk.END)
        self.ent_titular.delete(0, tk.END)
        self.ent_municipio.delete(0, tk.END)
        self.ent_area_min.delete(0, tk.END)
        self.ent_area_max.delete(0, tk.END)
        self.ent_pct_min.delete(0, tk.END)
        self.ent_pct_max.delete(0, tk.END)
        self.buscar()

    def importar_csv(self):
        """Abre caixa de diálogo para importar planilha CCIR"""
        filepath = filedialog.askopenfilename(
            title="Selecionar Planilha CCIR (CSV)",
            filetypes=[("Arquivos CSV", "*.csv")]
        )
        if not filepath:
            return

        filename = os.path.basename(filepath)
        
        # Verifica se o arquivo já foi importado
        for arq in self.arquivos_importados:
            if arq['arquivo_origem'] == filename:
                resposta = messagebox.askyesno(
                    "Arquivo Já Importado", 
                    f"A planilha '{filename}' já foi cadastrada anteriormente no sistema.\nDeseja substituí-la (isso apagará os registros anteriores deste arquivo e inserirá os novos)?"
                )
                if not resposta:
                    return
                # Deleta registros anteriores antes da importação
                self.repo.delete_by_arquivo(filename)
                break

        # Inicia indicador de espera
        self.config(cursor="watch")
        self.update()

        try:
            dados = parse_ccir_csv(filepath)
            if not dados:
                messagebox.showwarning("Importação Vazia", "Nenhum registro válido foi encontrado para importação no arquivo selecionado.")
                return

            # Insere no banco
            self.repo.insert_bulk(dados)
            
            messagebox.showinfo("Sucesso", f"Importação de '{filename}' concluída!\nTotal de {len(dados)} registros cadastrados.")
            self.load_arquivos()
            self.buscar()
        except Exception as e:
            messagebox.showerror("Erro na Importação", f"Falha ao ler ou importar a planilha:\n{e}")
        finally:
            self.config(cursor="")

    def excluir_arquivo_selecionado(self):
        """Remove a planilha e seus cadastros do banco de dados"""
        selected_idx = self.listbox_arquivos.curselection()
        if not selected_idx:
            messagebox.showwarning("Aviso", "Selecione uma planilha na lista para exclusão.")
            return

        arq_info = self.arquivos_importados[selected_idx[0]]
        filename = arq_info['arquivo_origem']
        
        confirma = messagebox.askyesno(
            "Confirmar Exclusão", 
            f"Tem certeza de que deseja remover TODOS os {arq_info['total_registros']} registros importados da planilha '{filename}'?"
        )
        if confirma:
            try:
                self.repo.delete_by_arquivo(filename)
                messagebox.showinfo("Sucesso", f"Planilha '{filename}' e seus registros foram removidos com sucesso.")
                self.load_arquivos()
                self.buscar()
            except Exception as e:
                messagebox.showerror("Erro na Exclusão", f"Não foi possível excluir os registros: {e}")

    def mostrar_detalhes_imovel(self, event):
        """Abre janela de detalhamento com todos os co-proprietários cadastrados para o CCIR clicado"""
        selected = self.table.get_selected()
        if not selected:
            return

        ccir_codigo = selected[1]
        
        try:
            detalhes = self.repo.get_by_codigo_imovel(ccir_codigo)
            if not detalhes:
                messagebox.showwarning("Aviso", "Não foram encontrados mais detalhes sobre este imóvel.")
                return

            # Abre janela pop-up customizada
            CcirDetailsWindow(self, ccir_codigo, detalhes)
        except Exception as e:
            messagebox.showerror("Erro ao carregar detalhes", str(e))


class CcirDetailsWindow(tk.Toplevel):
    def __init__(self, parent, codigo_imovel, registros):
        super().__init__(parent)
        self.title(f"Detalhamento do Imóvel CCIR: {codigo_imovel}")
        self.geometry("850x500")
        self.minsize(700, 400)
        self.configure(bg="#1a1a2e")
        
        # Garante foco na janela de detalhes
        self.transient(parent)
        self.grab_set()
        
        self.registros = registros
        self.codigo_imovel = codigo_imovel
        self.setup_ui()

    def setup_ui(self):
        # Primeiro registro para informações gerais do imóvel
        reg_base = self.registros[0]
        
        # Cabeçalho da Ficha
        lbl_head = tk.Label(
            self, 
            text=f"FICHA COMPLETA DO IMÓVEL — CCIR {self.codigo_imovel}", 
            font=("Segoe UI", 12, "bold"),
            bg="#1a1a2e",
            fg="#e94560"
        )
        lbl_head.pack(pady=10, padx=15, anchor="w")
        
        # Bloco de Informações Gerais
        f_geral = tk.LabelFrame(
            self, 
            text="Informações Gerais da Propriedade (CCIR)", 
            font=("Segoe UI", 9, "bold"),
            bg="#16213e",
            fg="#eeeeee",
            bd=1,
            relief="groove"
        )
        f_geral.pack(fill="x", padx=15, pady=5, ipadx=10, ipady=5)
        
        # Configuração de colunas do grid
        f_geral.columnconfigure(1, weight=1)
        f_geral.columnconfigure(3, weight=1)
        
        def add_info_label(row, col_lbl, text_lbl, text_val):
            l_lbl = tk.Label(f_geral, text=text_lbl, font=("Segoe UI", 9, "bold"), bg="#16213e", fg="#eeeeee")
            l_lbl.grid(row=row, column=col_lbl, sticky="w", padx=10, pady=3)
            l_val = tk.Label(f_geral, text=text_val, font=("Segoe UI", 9), bg="#16213e", fg="#eeeeee")
            l_val.grid(row=row, column=col_lbl+1, sticky="w", padx=10, pady=3)

        add_info_label(0, 0, "Denominação:", reg_base.get("denominacao") or "N/A")
        add_info_label(0, 2, "Município/UF:", f"{reg_base.get('municipio') or 'N/A'}-{reg_base.get('uf') or ''}")
        
        area_fmt = f"{reg_base.get('area_total'):.4f}".replace('.', ',') if reg_base.get('area_total') is not None else "N/A"
        add_info_label(1, 0, "Área Total:", f"{area_fmt} ha")
        add_info_label(1, 2, "Código IBGE:", reg_base.get("codigo_municipio") or "N/A")
        
        add_info_label(2, 0, "Origem Importação:", reg_base.get("arquivo_origem") or "N/A")
        add_info_label(2, 2, "País:", reg_base.get("pais") or "N/A")

        # Bloco de Coproprietários / Partilha
        f_socios = tk.LabelFrame(
            self, 
            text="Distribuição de Detenção e Coproprietários", 
            font=("Segoe UI", 9, "bold"),
            bg="#16213e",
            fg="#eeeeee",
            bd=1,
            relief="groove"
        )
        f_socios.pack(fill="both", expand=True, padx=15, pady=10)

        # Tabela secundária (Treeview) estilizada
        cols = ("titular", "condicao", "natureza", "pct")
        headers = ("Titular / Beneficiário", "Condição da Pessoa", "Natureza Jurídica", "% Detenção")
        
        # Criar Treeview nativo para a janela modal
        scroll_y = ttk.Scrollbar(f_socios)
        scroll_y.pack(side="right", fill="y")
        
        style = ttk.Style()
        style.configure("Modal.Treeview", background="#16213e", foreground="#eeeeee", fieldbackground="#16213e", font=("Segoe UI", 9))
        
        tree = ttk.Treeview(
            f_socios, 
            columns=cols, 
            show="headings", 
            style="Modal.Treeview", 
            yscrollcommand=scroll_y.set
        )
        
        for col, head in zip(cols, headers):
            tree.column(col, width=120, anchor="w")
            tree.heading(col, text=head, anchor="w")
            
        tree.pack(fill="both", expand=True)
        scroll_y.config(command=tree.yview)

        # Popula a tabela e calcula o percentual total
        pct_acumulado = 0.0
        for r in self.registros:
            pct = r.get("percentual_detencao")
            pct_val = pct if pct is not None else 0.0
            pct_acumulado += pct_val
            
            pct_fmt = f"{pct:.2f}%".replace('.', ',') if pct is not None else "N/A"
            
            tree.insert("", "end", values=(
                r.get("titular") or "",
                r.get("condicao_pessoa") or "",
                r.get("natureza_juridica") or "",
                pct_fmt
            ))
            
        # Barra de Resumo inferior
        f_resumo = tk.Frame(self, bg="#1a1a2e")
        f_resumo.pack(fill="x", padx=15, pady=5)
        
        lbl_soma = tk.Label(
            f_resumo, 
            text=f"Soma de Detenção Cadastrada: {pct_acumulado:.2f}%".replace('.', ','), 
            font=("Segoe UI", 10, "bold"),
            bg="#1a1a2e",
            fg="#eeeeee"
        )
        lbl_soma.pack(side="left")

        btn_fechar = ttk.Button(f_resumo, text="Fechar Ficha", command=self.destroy)
        btn_fechar.pack(side="right")
