"""
routes/levantamento/pontos.py — Gestão de Pontos de Campo, Matrículas e Ordenação
"""
import os
import re
import stat
import shutil
import logging
import datetime
from typing import List, Optional, Literal
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from utils.transformer_cache import get_transformer

from database.connection import DatabaseManager, execute_query
from services.gestores.workspace_manager import WorkspaceManager
from services.documentacao.exportacao_service import ExportacaoService
from services.parsers.txt_parser import TxtGeodesicParser
from services.gestores.levantamento_manager import salvar_ordem_caminhamento
from routes.deps import verificar_levantamento_arquivado

router = APIRouter(tags=["Pontos de Campo & Matrículas do Levantamento"])

# ── Modelos ────────────────────────────────────────────────────────────────────

from .pontos_crud import get_matriculas_do_levantamento as _get_matriculas_do_levantamento, create_matricula as _create_matricula, update_matricula as _update_matricula, delete_matricula as _delete_matricula, download_matricula_pdf as _download_matricula_pdf, delete_matricula_pdf as _delete_matricula_pdf, get_matricula_historico as _get_matricula_historico, get_pontos as _get_pontos, create_ponto as _create_ponto, delete_ponto as _delete_ponto, update_pontos_batch as _update_pontos_batch, update_ponto as _update_ponto
from .pontos_crud import PontoCreate, MatriculaCreate, ConfrontanteUpdateBatch, PontoUpdateBatchItem, PontoBatchUpdatePayload, PontoUpdate
from .pontos_acoes import sanitizar_ordens_duplicadas as _sanitizar_ordens_duplicadas, post_associar_base_lote as _post_associar_base_lote, post_corrigir_manual_lote as _post_corrigir_manual_lote, post_salvar_ordem_perimetro as _post_salvar_ordem_perimetro, post_reordenar_perimetro as _post_reordenar_perimetro, post_ordenar_vizinhos_perimetro as _post_ordenar_vizinhos_perimetro, post_salvar_ordem_global as _post_salvar_ordem_global, post_reordenar_global as _post_reordenar_global, post_ordenar_vizinhos_global as _post_ordenar_vizinhos_global, auditar_perimetro_matricula as _auditar_perimetro_matricula, integrar_ponto_vizinho as _integrar_ponto_vizinho
from .pontos_acoes import PayloadAssociarBase, PayloadOverrideManual, ItemOrdemPonto, PayloadSalvarOrdem
from .pontos_sync import sincronizar_cad_clipboard as _sincronizar_cad_clipboard
from .pontos_sync import PayloadSincronizarCAD

@router.get("/levantamentos/{id}/matriculas")
def get_matriculas_do_levantamento(id: int):
    return _get_matriculas_do_levantamento(id)

@router.post("/levantamentos/{id}/matriculas")
def create_matricula(id: int, m: MatriculaCreate):
    return _create_matricula(id, m)

@router.put("/matriculas/{mid}")
def update_matricula(mid: int, m: MatriculaCreate):
    return _update_matricula(mid, m)

@router.delete("/matriculas/{mid}")
def delete_matricula(mid: int):
    return _delete_matricula(mid)

@router.get("/matriculas/{mid}/download-pdf")
def download_matricula_pdf(mid: int):
    return _download_matricula_pdf(mid)

@router.delete("/matriculas/{mid}/pdf")
def delete_matricula_pdf(mid: int):
    return _delete_matricula_pdf(mid)

@router.get("/matriculas/{mid}/historico")
def get_matricula_historico(mid: int):
    return _get_matricula_historico(mid)

@router.get("/levantamentos/{id}/pontos")
def get_pontos(id: int):
    return _get_pontos(id)

@router.post("/levantamentos/{id}/pontos")
def create_ponto(id: int, p: PontoCreate):
    return _create_ponto(id, p)

@router.delete("/pontos/{pid}")
def delete_ponto(pid: int):
    return _delete_ponto(pid)

@router.post("/levantamentos/{id}/pontos/associar-base")
def post_associar_base_lote(id: int, payload: PayloadAssociarBase):
    return _post_associar_base_lote(id, payload)

@router.post("/levantamentos/{id}/pontos/corrigir-manual")
def post_corrigir_manual_lote(id: int, payload: PayloadOverrideManual):
    return _post_corrigir_manual_lote(id, payload)

@router.post("/levantamentos/{id}/matriculas/{matricula_id}/salvar-ordem")
def post_salvar_ordem_perimetro(id: int, matricula_id: int, payload: PayloadSalvarOrdem):
    return _post_salvar_ordem_perimetro(id, matricula_id, payload)

@router.post("/levantamentos/{id}/matriculas/{matricula_id}/reordenar")
def post_reordenar_perimetro(id: int, matricula_id: int):
    return _post_reordenar_perimetro(id, matricula_id)

@router.post("/levantamentos/{id}/matriculas/{matricula_id}/ordenar-vizinhos")
def post_ordenar_vizinhos_perimetro(id: int, matricula_id: int):
    return _post_ordenar_vizinhos_perimetro(id, matricula_id)

@router.post("/levantamentos/{id}/salvar-ordem")
def post_salvar_ordem_global(id: int, payload: PayloadSalvarOrdem):
    return _post_salvar_ordem_global(id, payload)

@router.post("/levantamentos/{id}/reordenar")
def post_reordenar_global(id: int):
    return _post_reordenar_global(id)

@router.post("/levantamentos/{id}/ordenar-vizinhos")
def post_ordenar_vizinhos_global(id: int):
    return _post_ordenar_vizinhos_global(id)

@router.put("/levantamentos/{id}/pontos/batch")
def update_pontos_batch(id: int, payload: PontoBatchUpdatePayload):
    return _update_pontos_batch(id, payload)

@router.put("/pontos/{pid}")
def update_ponto(pid: int, payload: PontoUpdate):
    return _update_ponto(pid, payload)

@router.get("/matriculas/{mid}/auditoria")
def auditar_perimetro_matricula(mid: int):
    return _auditar_perimetro_matricula(mid)

@router.post("/levantamentos/{id}/pontos/integrar-vizinho/{pid}")
def integrar_ponto_vizinho(id: int, pid: int, matricula_id: Optional[int] = None):
    return _integrar_ponto_vizinho(id, pid, matricula_id)

@router.post("/levantamentos/{id}/pontos/sincronizar-cad")
def sincronizar_cad_clipboard(id: int, payload: PayloadSincronizarCAD):
    return _sincronizar_cad_clipboard(id, payload)
