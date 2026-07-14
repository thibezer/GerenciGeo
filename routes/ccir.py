"""
routes/ccir.py — Integração com o Banco CCIR
"""
import os
import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from config import EXPORT_BASE_FOLDER

router = APIRouter(tags=["CCIR"])

@router.get("/ccir/sync")
def sync_ccir_folder():
    try:
        from services.parsers.ccir_parser import sincronizar_pasta_ccir
        logs = sincronizar_pasta_ccir()
        return {"sucesso": True, "logs": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ccir/search")
def search_ccir(
    codigo_imovel: Optional[str] = Query(None),
    denominacao: Optional[str] = Query(None),
    titular: Optional[str] = Query(None),
    municipio: Optional[str] = Query(None),
    area_min: Optional[float] = Query(None),
    area_max: Optional[float] = Query(None),
    pct_min: Optional[float] = Query(None),
    pct_max: Optional[float] = Query(None)
):
    try:
        from database.repository import CcirCadastroRepo
        repo = CcirCadastroRepo()
        filters = {
            "codigo_imovel": codigo_imovel,
            "denominacao": denominacao,
            "titular": titular,
            "municipio": municipio,
            "area_min": area_min,
            "area_max": area_max,
            "pct_min": pct_min,
            "pct_max": pct_max
        }
        resultados = repo.search_ccir_avancado(filters, limit=200)
        return resultados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ccir/imovel/{codigo_imovel}")
def get_ccir_imovel_details(codigo_imovel: str):
    try:
        from database.repository import CcirCadastroRepo
        repo = CcirCadastroRepo()
        return repo.get_by_codigo_imovel(codigo_imovel)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ccir/files")
def get_ccir_files():
    try:
        from database.repository import CcirCadastroRepo
        repo = CcirCadastroRepo()
        return repo.get_imported_files()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/ccir/files/{filename}")
def delete_ccir_file(filename: str):
    try:
        from database.repository import CcirCadastroRepo
        repo = CcirCadastroRepo()
        repo.delete_by_arquivo(filename)
        return {"sucesso": True, "message": f"Registros do arquivo {filename} deletados."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ccir/abrir-pasta")
def abrir_pasta_ccir_local():
    try:
        ccir_dir = os.path.join(EXPORT_BASE_FOLDER, "Banco_CCIR")
        os.makedirs(ccir_dir, exist_ok=True)
        os.startfile(ccir_dir)
        return {"sucesso": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao abrir pasta: {str(e)}")
