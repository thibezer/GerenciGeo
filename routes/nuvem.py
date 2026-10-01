"""
routes/nuvem.py — Rotas de API para integração com a Nuvem Hostinger.
Gerencia autenticação do operador e sincronização de dados entre múltiplos computadores.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from routes.deps import verificar_ambiente_local
from services.gestores.nuvem_sync import (
    login_nuvem,
    logout_nuvem,
    obter_status_nuvem,
    push_dados_nuvem,
    pull_dados_nuvem,
    sincronizar_tudo
)
from services.gestores.realtime_sync import realtime_sync_engine

router = APIRouter(prefix="/nuvem", tags=["Sincronização Nuvem Hub"])


class LoginRequest(BaseModel):
    email: str
    password: str


class ToggleRealtimeRequest(BaseModel):
    enabled: bool


@router.get("/status")
async def rota_status_nuvem():
    """Retorna o status da conexão com a Nuvem e se há usuário autenticado."""
    return await obter_status_nuvem()


@router.get("/realtime/status")
async def rota_realtime_status():
    """Retorna o estado detalhado do motor de sincronização em tempo real."""
    return realtime_sync_engine.get_status_payload()


@router.get("/realtime/events")
async def rota_realtime_events():
    """Retorna o feed de eventos recentes de sincronização em tempo real."""
    return list(realtime_sync_engine._recent_events)


@router.post("/realtime/toggle", dependencies=[Depends(verificar_ambiente_local)])
async def rota_realtime_toggle(req: ToggleRealtimeRequest):
    """Ativa ou pausa a sincronização contínua em tempo real."""
    realtime_sync_engine.set_enabled(req.enabled)
    return realtime_sync_engine.get_status_payload()


@router.post("/login", dependencies=[Depends(verificar_ambiente_local)])
async def rota_login_nuvem(req: LoginRequest):
    """Realiza o login na Nuvem Hostinger e salva o token de sessão local."""
    res = await login_nuvem(req.email, req.password)
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("mensagem"))
    # Notifica o motor de tempo real para iniciar o ciclo
    realtime_sync_engine.registrar_evento("success", "Operador autenticado na nuvem", req.email)
    return res


@router.post("/logout", dependencies=[Depends(verificar_ambiente_local)])
async def rota_logout_nuvem():
    """Encerra a sessão local na Nuvem."""
    res = await logout_nuvem()
    realtime_sync_engine.registrar_evento("info", "Sessão na nuvem encerrada")
    return res


@router.post("/push", dependencies=[Depends(verificar_ambiente_local)])
async def rota_push_nuvem():
    """Envia todos os registros do banco local para o Hub na Nuvem."""
    res = await push_dados_nuvem()
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("mensagem"))
    realtime_sync_engine.registrar_evento("push", "Upload manual concluído", f"{res.get('total_registros', 0)} registros enviados")
    return res


@router.post("/pull", dependencies=[Depends(verificar_ambiente_local)])
async def rota_pull_nuvem():
    """Baixa os registros do Hub na Nuvem e aplica ao banco SQLite local."""
    res = await pull_dados_nuvem()
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("mensagem"))
    realtime_sync_engine.registrar_evento("pull", "Download manual concluído", f"{res.get('total_recebidos', 0)} registros recebidos")
    return res


@router.post("/sincronizar", dependencies=[Depends(verificar_ambiente_local)])
async def rota_sincronizar_nuvem():
    """Executa o ciclo completo de sincronização bidirecional (Pull + Push) via motor em tempo real."""
    res = await realtime_sync_engine.sincronizar_manual()
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("mensagem"))
    return res

