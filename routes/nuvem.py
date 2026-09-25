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

router = APIRouter(prefix="/nuvem", tags=["Sincronização Nuvem Hub"])


class LoginRequest(BaseModel):
    email: str
    password: str


@router.get("/status")
async def rota_status_nuvem():
    """Retorna o status da conexão com a Nuvem e se há usuário autenticado."""
    return await obter_status_nuvem()


@router.post("/login", dependencies=[Depends(verificar_ambiente_local)])
async def rota_login_nuvem(req: LoginRequest):
    """Realiza o login na Nuvem Hostinger e salva o token de sessão local."""
    res = await login_nuvem(req.email, req.password)
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("mensagem"))
    return res


@router.post("/logout", dependencies=[Depends(verificar_ambiente_local)])
async def rota_logout_nuvem():
    """Encerra a sessão local na Nuvem."""
    return await logout_nuvem()


@router.post("/push", dependencies=[Depends(verificar_ambiente_local)])
async def rota_push_nuvem():
    """Envia todos os registros do banco local para o Hub na Nuvem."""
    res = await push_dados_nuvem()
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("mensagem"))
    return res


@router.post("/pull", dependencies=[Depends(verificar_ambiente_local)])
async def rota_pull_nuvem():
    """Baixa os registros do Hub na Nuvem e aplica ao banco SQLite local."""
    res = await pull_dados_nuvem()
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("mensagem"))
    return res


@router.post("/sincronizar", dependencies=[Depends(verificar_ambiente_local)])
async def rota_sincronizar_nuvem():
    """Executa o ciclo completo de sincronização bidirecional (Pull + Push)."""
    res = await sincronizar_tudo()
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("mensagem"))
    return res
