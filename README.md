# GerenciGeo — Guia de Configuração do Ambiente 32-bit (HGO / pywinauto)

## 📌 Contexto Arquitetural
O software de pós-processamento GNSS **Hi-Target Geomatics Office (HGO.exe)** é uma aplicação nativa de **32 bits**.
Ao executar automações de UI Automation (pywinauto) a partir de um processo Python de 64 bits, cada chamada COM passa por marshaling entre processos de arquiteturas diferentes, tornando a automação extremamente lenta (ordens de magnitude mais devagar).

Para evitar essa degradação e impedir que o event loop do FastAPI seja bloqueado, o backend 64-bit executa o script `converterrinex.py` como um **subprocesso isolado utilizando um interpretador Python 32-bit**.

---

## 🛠️ Instalação e Configuração do Ambiente `venv32`

Caso esteja configurando uma nova máquina de desenvolvimento ou servidor local, siga os passos abaixo:

### 1. Baixar e Instalar o Python 32-bit
1. Acesse [python.org/downloads](https://www.python.org/downloads/windows/).
2. Baixe o instalador **Windows installer (32-bit)** (recomendado: mesma versão do Python do projeto, ex: Python 3.12 ou 3.13 32-bit).
3. Ao instalar, escolha a opção "Customize installation" e instale em um diretório acessível (ex: `C:\Python313-32` ou `C:\Users\<Usuario>\AppData\Local\Programs\Python\Python313-32`).

### 2. Criar o Ambiente Virtual `venv32`
No terminal, dentro da pasta raiz do projeto GerenciGeo, execute:

```powershell
# Usando o executável do Python 32-bit instalado:
C:\Python313-32\python.exe -m venv venv32

# Ativar e instalar o pywinauto no venv 32-bit:
.\venv32\Scripts\pip.exe install pywinauto
```

### 3. Configuração no Backend (`config.py`)
O caminho do interpretador é configurado no arquivo `config.py`:

```python
PYTHON_32BIT_PATH = os.environ.get(
    "GERENCIGEO_PYTHON_32BIT",
    os.path.join(BASE_DIR, "venv32", "Scripts", "python.exe")
)
```

Caso precise sobrescrever o caminho em um ambiente específico, defina a variável de ambiente:
```powershell
$env:GERENCIGEO_PYTHON_32BIT = "C:\Caminho\Customizado\venv32\Scripts\python.exe"
```

---

## 🚀 Execução Manual da CLI (`converterrinex.py`)

O script de conversão expõe uma CLI 32-bit independente que pode ser testada diretamente pelo terminal:

```powershell
.\venv32\Scripts\python.exe converterrinex.py "C:\caminho\arquivo.gns" --destino "C:\caminho\saida_rinex" --exe "C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe"
```

O resultado é retornado em formato JSON na última linha do `stdout`.
