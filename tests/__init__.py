import os
import sys

# Força o ambiente de testes em toda a suíte
os.environ["GERENCIGEO_TEST"] = "1"

import config
config.DB_PATH = os.path.join(config.BASE_DIR, f"gerencigeo_test{os.environ.get('GERENCIGEO_TEST_SUFFIX', '')}.db")

from database.connection import DatabaseManager
from database.models import create_tables

# Inicializa o banco de dados de testes se necessário
with DatabaseManager(db_path=config.DB_PATH) as conn:
    create_tables(conn)
