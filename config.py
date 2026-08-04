import os

APP_NAME = "GerenciGeo"
APP_VERSION = "1.0.0"

# Diretório base estrutural do próprio código (onde fica BD, assets, etc)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

if os.environ.get("GERENCIGEO_TEST"):
    DB_PATH = os.path.join(BASE_DIR, "gerencigeo_test.db")
else:
    DB_PATH = os.path.join(BASE_DIR, "gerencigeo.db")

# Configurações Externas (Usuario/PC)
CONVERT_RINEX_PATH = r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\ConvertRinex.exe"
IBGE_PPP_URL = "https://servicodados.ibge.gov.br/api/geociencias/v1/ppp" # Placeholder API PPP
IBGE_PPP_WEB_URL = "https://www.ibge.gov.br/geociencias/informacoes-sobre-posicionamento-geodesico/servicos-para-posicionamento-geodesico/16334-servico-online-para-pos-processamento-de-dados-gnss-ibge-ppp.html?=&t=processar-os-dados"
DEFAULT_ANTENNA = "HITV60 NONE"

# Configurações do Negócio
DEFAULT_EMAIL = "tsilvabertuchi@outlook.com"
EXPORT_BASE_FOLDER = r"D:\OneDrive_Thiago\OneDrive\Desenvolvimento\Geo"

IBGE_SIGEF_LIMITES = {
    'artificial': 0.50,
    'natural': 3.00,
    'inacessivel': 7.50
}

# Dados Institucionais da Empresa
EMPRESA_NOME_FANTASIA = "COMPLETA"
EMPRESA_RAZAO_SOCIAL = "Agrimensura e Projetos Agropecuários LTDA"

# ── Arquitetura Edge-First v2.4 ──────────────────────────────────────────────
RUNNING_LOCAL = True  # Setado como False exclusivamente no servidor da Hostinger
CLOUD_SYNC_URL = "https://gerencigeo-seu-site.com.br/api/v1/sync/imovel"
CLOUD_API_KEY = "G4G2_SECURE_SYNC_TOKEN_7D8E2B9A1C"


