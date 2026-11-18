"""
routes/arquivos.py — Endpoints para consulta, verificação de duplicidade e registro de arquivos enviados.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.gestores.historico_arquivos_service import (
    excluir_arquivo_enviado,
    listar_arquivos_enviados,
    registrar_arquivo_enviado,
    verificar_lote_arquivos,
)

router = APIRouter(tags=["Histórico de Arquivos Enviados"])


class ArquivoVerificarItem(BaseModel):
    sha256: Optional[str] = None
    nome_arquivo: Optional[str] = None
    tamanho_bytes: Optional[int] = None


class ArquivosVerificarRequest(BaseModel):
    arquivos: List[ArquivoVerificarItem] = Field(default_factory=list)


class ArquivoRegistrarRequest(BaseModel):
    nome_arquivo: str
    sha256: Optional[str] = None
    tamanho_bytes: Optional[int] = 0
    categoria: str = "OUTRO"
    tipo_documento: Optional[str] = None
    entidade_tipo: Optional[str] = None
    entidade_id: Optional[int] = None
    entidade_nome: Optional[str] = None
    origem_envio: str = "UI_UPLOAD"
    resumo_extracao: Optional[str] = None


@router.get("/arquivos-enviados")
@router.get("/api/arquivos-enviados")
def get_arquivos_enviados(
    busca: Optional[str] = Query(None),
    categoria: Optional[str] = Query(None),
    limite: int = Query(200, ge=1, le=1000),
):
    try:
        return listar_arquivos_enviados(busca=busca, categoria=categoria, limite=limite)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/arquivos-enviados/verificar")
@router.post("/api/arquivos-enviados/verificar")
def post_verificar_arquivos_enviados(payload: ArquivosVerificarRequest):
    try:
        itens = [
            item.model_dump() if hasattr(item, "model_dump") else item.dict()
            for item in payload.arquivos
        ]
        return {"resultados": verificar_lote_arquivos(itens)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/arquivos-enviados")
@router.post("/api/arquivos-enviados")
def post_registrar_arquivo_enviado(payload: ArquivoRegistrarRequest):
    try:
        dados = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        return registrar_arquivo_enviado(**dados)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/arquivos-enviados/{registro_id}")
@router.delete("/api/arquivos-enviados/{registro_id}")
def delete_arquivo_enviado(registro_id: int):
    try:
        ok = excluir_arquivo_enviado(registro_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Registro de arquivo não encontrado.")
        return {"sucesso": True, "message": "Registro removido do histórico de arquivos enviados."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
