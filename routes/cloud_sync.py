"""
routes/cloud_sync.py — Endpoint de sincronização da arquitetura Edge-First.
"""
from fastapi import APIRouter, HTTPException, Depends
from services.gestores.cloud_sync import sincronizar_imovel
from routes.deps import verificar_ambiente_local

router = APIRouter(tags=["Sincronização Cloud Edge-First"])

@router.post("/sincronizar/{levantamento_id}/matriculas/{matricula_id}", dependencies=[Depends(verificar_ambiente_local)])
async def sincronizar_nuvem(levantamento_id: int, matricula_id: int):
    """
    Endpoint local que aciona o pipeline de sincronização da matrícula com o Hub em Nuvem (Hostinger).
    """
    res = await sincronizar_imovel(matricula_id, levantamento_id)
    if not res["sucesso"]:
        raise HTTPException(status_code=400, detail=res["mensagem"])
    return res
