from fastapi import APIRouter
from routes.levantamento.crud import router as crud_router
from routes.levantamento.pontos import router as pontos_router
from routes.levantamento.homologacao import router as homologacao_router
from routes.levantamento.segmentos import router as segmentos_router
from routes.levantamento.documentos import router as documentos_router

router = APIRouter()
router.include_router(crud_router)
router.include_router(pontos_router)
router.include_router(homologacao_router)
router.include_router(segmentos_router)
router.include_router(documentos_router)
