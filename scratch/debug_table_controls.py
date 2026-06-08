import os
import time
import subprocess
from pywinauto.application import Application

caminho_exe = r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe"

try:
    app = Application(backend="uia").connect(path=caminho_exe, timeout=20)
    janela = app.window(title_re=".*Hi-Target Geomatics Office.*")
    janela.set_focus()
    
    table = janela.child_window(title="DataGridView", auto_id="dataGridView1", control_type="Table")
    print("=== DUMP DA TABELA ===")
    table.print_control_identifiers()
    print("=== FIM DO DUMP ===")
except Exception as e:
    print("ERRO:", e)
