import tkinter as tk
from tkinter import ttk

class PaginatedTreeview(ttk.Frame):
    """Componente Reutilizável de Treeview (Tabela)"""
    def __init__(self, parent, columns, headers, show="headings", height=15):
        super().__init__(parent)
        
        # Scrollbar vertical
        self.tree_scroll = ttk.Scrollbar(self)
        self.tree_scroll.pack(side="right", fill="y")
        
        self.tree = ttk.Treeview(self, columns=columns, show=show, height=height, yscrollcommand=self.tree_scroll.set)
        
        for col, head in zip(columns, headers):
            self.tree.column(col, width=120, anchor="w")
            self.tree.heading(col, text=head, anchor="w")
            
        self.tree.pack(side="left", fill="both", expand=True)
        self.tree_scroll.config(command=self.tree.yview)
        
    def populate(self, rows_list, keys=None):
        """Popula a arvore. keys são as chaves caso rows_list seja json/dict. Se tupla, carrega direto."""
        self.tree.delete(*self.tree.get_children())
        for row in rows_list:
            if isinstance(row, dict) and keys:
                values = [row.get(k, "") for k in keys]
                self.tree.insert("", "end", values=values, tags=('zebrado',))
            else:
                self.tree.insert("", "end", values=row)

    def bind_double_click(self, callback):
        self.tree.bind("<Double-1>", callback)

    def get_selected(self):
        selected = self.tree.focus()
        if selected:
            return self.tree.item(selected, 'values')
        return None

    def get_all_selected(self):
        """Retorna uma lista com os values de todas as linhas selecionadas"""
        items = self.tree.selection()
        return [self.tree.item(i, 'values') for i in items]
