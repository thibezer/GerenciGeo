import sys
import os

# Adiciona o diretório atual ao sys.path para garantir as importações corretas
diretorio_raiz = os.path.dirname(os.path.abspath(__file__))
if diretorio_raiz not in sys.path:
    sys.path.insert(0, diretorio_raiz)

from ui.app import main

if __name__ == "__main__":
    main()