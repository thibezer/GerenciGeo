from pywinauto.application import Application
import time

# 1. Abre o programa usando o caminho real da instalação
caminho_exe = r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\ConvertRinex.exe"
print("Iniciando o conversor...")
app = Application(backend="uia").start(caminho_exe)

# 2. Dá 3 segundos para a janela abrir completamente
time.sleep(3)

# 3. Captura a janela principal pelo título
janela = app.window(title_re=".*ConvertRinex.*")

# 4. O "Raio-X": Imprime a árvore completa de todos os botões e campos
print("Imprimindo a estrutura da tela. Olhe o terminal!")
janela.print_control_identifiers()