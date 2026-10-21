import os

APP_NAME = "GerenciGeo"
APP_VERSION = "1.0.0"

# Diretório base estrutural do próprio código (onde fica BD, assets, etc)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

import sys

# Detecção automática e rigorosa de ambiente de testes para proteção irrestrita da base de produção
def _is_test_environment() -> bool:
    if os.environ.get("GERENCIGEO_TEST") in ("1", "true", "True"):
        return True
    if any("unittest" in str(arg).lower() or "pytest" in str(arg).lower() for arg in sys.argv):
        return True
    if sys.argv and any(str(sys.argv[0]).lower().endswith(x) for x in ("unittest", "pytest", "test", "__main__.py")):
        if any("test" in str(a).lower() for a in sys.argv):
            return True
    return False

if _is_test_environment():
    os.environ["GERENCIGEO_TEST"] = "1"
    # GERENCIGEO_TEST_SUFFIX permite rodar suítes em paralelo, cada uma com seu banco e seu workspace temporário
    _TEST_SUFFIX = os.environ.get("GERENCIGEO_TEST_SUFFIX", "")
    DB_PATH = os.path.join(BASE_DIR, f"gerencigeo_test{_TEST_SUFFIX}.db")
else:
    DB_PATH = os.path.join(BASE_DIR, "gerencigeo.db")

# Configurações Externas (Usuario/PC)
CONVERT_RINEX_PATH = r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\ConvertRinex.exe"
PYTHON_32BIT_PATH = os.environ.get(
    "GERENCIGEO_PYTHON_32BIT",
    os.path.join(BASE_DIR, "venv32", "Scripts", "python.exe")
)
CONVERT_RINEX_SCRIPT = os.path.join(BASE_DIR, "converterrinex.py")
IBGE_PPP_URL = "https://servicodados.ibge.gov.br/api/geociencias/v1/ppp" # Placeholder API PPP
IBGE_PPP_WEB_URL = "https://www.ibge.gov.br/geociencias/informacoes-sobre-posicionamento-geodesico/servicos-para-posicionamento-geodesico/16334-servico-online-para-pos-processamento-de-dados-gnss-ibge-ppp.html?=&t=processar-os-dados"
DEFAULT_ANTENNA = "HITV60 NONE"

# Configurações do Negócio
DEFAULT_EMAIL = "tsilvabertuchi@outlook.com"
_candidate_geo = r"D:\Programação\Geo" if os.path.exists(r"D:\Programação\Geo") or not os.path.exists(r"D:\Desenvolvimento\Geo") else r"D:\Desenvolvimento\Geo"
_DEFAULT_GEO_FOLDER = _candidate_geo if os.path.exists(os.path.splitdrive(_candidate_geo)[0]) else os.path.join(BASE_DIR, "Geo_Workspace")
EXPORT_BASE_FOLDER = os.environ.get("GERENCIGEO_EXPORT_FOLDER", _DEFAULT_GEO_FOLDER)
if os.environ.get("GERENCIGEO_TEST") == "1":
    # Testes nunca gravam workspaces na pasta real de projetos
    import tempfile
    EXPORT_BASE_FOLDER = os.path.join(tempfile.gettempdir(), f"gerencigeo_testes_workspace{os.environ.get('GERENCIGEO_TEST_SUFFIX', '')}")

IBGE_SIGEF_LIMITES = {
    'artificial': 0.50,
    'natural': 3.00,
    'inacessivel': 7.50
}

# Dados Institucionais da Empresa
EMPRESA_NOME_FANTASIA = "COMPLETA"
EMPRESA_RAZAO_SOCIAL = "Agrimensura e Projetos Agropecuários LTDA"

# ── Arquitetura Edge-First v2.4 (Nuvem Hostinger) ─────────────────────────────
RUNNING_LOCAL = True  # Setado como False exclusivamente no servidor da Hostinger
CLOUD_BASE_URL = os.environ.get("GERENCIGEO_CLOUD_URL", "https://darkgray-duck-674813.hostingersite.com/api.php")
CLOUD_SYNC_URL = f"{CLOUD_BASE_URL}?__route=/sync/batch"
CLOUD_PULL_URL = f"{CLOUD_BASE_URL}?__route=/sync/pull"
CLOUD_CHECK_URL = f"{CLOUD_BASE_URL}?__route=/sync/check"
CLOUD_LOGIN_URL = f"{CLOUD_BASE_URL}?__route=/auth/login"
CLOUD_STATUS_URL = f"{CLOUD_BASE_URL}?__route=/status"

# ── Configurações de Conexão em Tempo Real (Realtime Sync Engine) ────────────
REALTIME_SYNC_ENABLED = os.environ.get("GERENCIGEO_REALTIME_SYNC", "true").lower() in ("1", "true", "yes")
REALTIME_SYNC_INTERVAL_SEC = float(os.environ.get("GERENCIGEO_SYNC_INTERVAL", "8.0"))
REALTIME_SYNC_DEBOUNCE_SEC = float(os.environ.get("GERENCIGEO_SYNC_DEBOUNCE", "2.0"))



