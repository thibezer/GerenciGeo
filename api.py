import os
import logging
from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from config import EXPORT_BASE_FOLDER
from database.connection import DatabaseManager
from database.models import create_tables
from routes.deps import verificar_tranca_read_only
from routes import router as api_router

# Inicializa o Logger do sistema
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="GerenciGeo API", dependencies=[Depends(verificar_tranca_read_only)])

# Garante que as tabelas de banco de dados e pastas padrão existam
try:
    with DatabaseManager() as conn:
        create_tables(conn)
        
    ccir_dir = os.path.join(EXPORT_BASE_FOLDER, "Banco_CCIR")
    if not os.path.exists(ccir_dir):
        os.makedirs(ccir_dir, exist_ok=True)
        logging.getLogger(__name__).info(f"Pasta Banco_CCIR criada em: {ccir_dir}")
except Exception as e:
    logging.getLogger(__name__).critical(f"Erro crítico na inicialização do banco/pastas: {e}")

# Configura middlewares de CORS para o frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.getLogger(__name__).error(f"Erro inesperado no servidor: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": f"Erro interno do servidor: {str(exc)}"}
    )

# Inclui todas as rotas centralizadas do diretório routes/
app.include_router(api_router)

# Monta o frontend Vite compilado para ser servido na raiz
frontend_dist = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    logging.getLogger(__name__).warning(f"Diretório frontend/dist não encontrado em {frontend_dist}. Estáticos não montados.")


def sou_administrador():
    import ctypes
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

if __name__ == "__main__":
    import sys
    import ctypes
    
    if sou_administrador():
        try:
            print("Iniciando Uvicorn (Modo Administrador)...")
            uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=False)
        except Exception as e:
            print(f"Erro ao iniciar o servidor: {e}")
    else:
        print("Solicitando privilégios de Administrador para a API...")
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, " ".join(sys.argv), None, 1)
