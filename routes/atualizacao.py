"""
routes/atualizacao.py — Aviso e instalação de atualizações do GerenciGeo desktop (sem precisar do terminal).
"""
from fastapi import APIRouter, Depends, HTTPException
from routes.deps import verificar_ambiente_local
from services.gestores import atualizador

router = APIRouter(prefix="/atualizacao", tags=["Atualização do Sistema"])


@router.get("/status")
def rota_status_atualizacao():
    """Verifica se há versão nova no repositório (bloqueia até ~30s no git fetch; roda em thread)."""
    return atualizador.verificar_atualizacao()


@router.get("/progresso")
def rota_progresso_atualizacao():
    return atualizador.obter_estado()


@router.post("/aplicar", dependencies=[Depends(verificar_ambiente_local)])
def rota_aplicar_atualizacao():
    if not atualizador.habilitado():
        raise HTTPException(status_code=400, detail="Atualização automática indisponível neste ambiente.")
    return atualizador.iniciar_atualizacao()


@router.post("/reiniciar", dependencies=[Depends(verificar_ambiente_local)])
def rota_reiniciar_aplicativo():
    if not atualizador.habilitado() or atualizador.obter_estado()["etapa"] != "pronto":
        raise HTTPException(status_code=400, detail="Não há atualização instalada aguardando reinício.")
    atualizador.reiniciar_aplicativo()
    return {"sucesso": True}
