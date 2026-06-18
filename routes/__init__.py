from fastapi import APIRouter
from routes.clientes import router as clientes_router
from routes.propriedades import router as propriedades_router
from routes.dashboard import router as dashboard_router
from routes.ccir import router as ccir_router
from routes.processamento import router as processamento_router
from routes.levantamento import router as levantamento_router

router = APIRouter()
router.include_router(clientes_router)
router.include_router(propriedades_router)
router.include_router(dashboard_router)
router.include_router(ccir_router)
router.include_router(processamento_router)
router.include_router(levantamento_router)
