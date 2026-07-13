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
from utils.logger import tracer
import time

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

# Middleware para evitar cache do WebView2 em arquivos estáticos e HTML do frontend
@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/assets/") or path.endswith(".html") or path.endswith(".js") or path.endswith(".css"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    
    # Rastreia apenas chamadas dinâmicas (API), ignora arquivos estáticos do frontend
    path = request.url.path
    if not (path.startswith("/assets/") or path.endswith(".html") or path.endswith(".js") or path.endswith(".css")):
        client_ip = request.client.host if request.client else "Unknown"
        tracer.trace_request(
            method=request.method,
            url=str(request.url),
            client_ip=client_ip,
            duration_ms=process_time,
            status_code=response.status_code
        )
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tracer.get_logger().error(f"Erro inesperado no servidor: {exc}", exc_info=True)
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
