"""
routes/propriedades.py — CRUD de Propriedades, Matrículas e Vínculos com Clientes
"""
import re
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from database.connection import DatabaseManager, execute_query
from business.levantamento_manager import vincular_cliente_propriedade
from config import EXPORT_BASE_FOLDER
from routes.deps import verificar_propriedade_arquivada

router = APIRouter(tags=["Propriedades & Matrículas"])

# ── Modelos ────────────────────────────────────────────────────────────────────

class PropriedadeCreate(BaseModel):
    nome_propriedade: str
    codigo_car: str = None
    codigo_ccir: str = None
    caminho_arquivo_car: str = None
    caminho_arquivo_ccir: str = None
    municipio: str
    uf: str

class PropriedadeClienteCreate(BaseModel):
    cliente_id: int
    percentual_participacao: float = 0.0

class MatriculaCreate(BaseModel):
    numero_matricula: str
    ccir: str = None
    itr: str = None
    area_ha: float = 0.0
    valor_itr: Optional[float] = None
    denominacao: Optional[str] = None
    georreferenciamento: Optional[str] = None

# ── Rotas de Propriedades ───────────────────────────────────────────────────────

@router.get("/propriedades")
def get_propriedades():
    try:
        propriedades = [dict(r) for r in execute_query("SELECT * FROM propriedades", fetch_all=True)]
        for p in propriedades:
            # Busca clientes vinculados
            clients_query = """
                SELECT c.id, c.nome_completo, c.cpf_cnpj, pc.percentual_participacao
                FROM propriedade_clientes pc
                JOIN clientes c ON pc.cliente_id = c.id
                WHERE pc.propriedade_id = ?
            """
            p['clientes'] = [dict(r) for r in execute_query(clients_query, params=(p['id'],), fetch_all=True)]
            
            # Conta as matrículas associadas
            mats = execute_query("SELECT count(*) as qtd FROM matriculas WHERE propriedade_id = ?", params=(p['id'],), fetch_one=True)
            p['total_matriculas'] = mats['qtd'] if mats else 0
            
            # Conta os levantamentos associados
            levs = execute_query("SELECT count(*) as qtd FROM levantamentos WHERE propriedade_id = ?", params=(p['id'],), fetch_one=True)
            p['total_levantamentos'] = levs['qtd'] if levs else 0
        return propriedades
    except Exception as e:
        return {"error": str(e)}

@router.post("/propriedades")
def create_propriedade(p: PropriedadeCreate):
    if len(p.uf) != 2:
        return {"error": "UF deve conter exatamente 2 caracteres"}
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, codigo_car, codigo_ccir, caminho_arquivo_car, caminho_arquivo_ccir, municipio, uf)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (p.nome_propriedade, p.codigo_car, p.codigo_ccir, p.caminho_arquivo_car, p.caminho_arquivo_ccir, p.municipio, p.uf.upper()))
            prop_id = cursor.lastrowid
            conn.commit()
        return {"id": prop_id, "message": "Propriedade cadastrada com sucesso"}
    except Exception as e:
        return {"error": str(e)}

@router.put("/propriedades/{prop_id}")
def update_propriedade(prop_id: int, p: PropriedadeCreate):
    verificar_propriedade_arquivada(prop_id)
    if len(p.uf) != 2:
        return {"error": "UF deve conter exatamente 2 caracteres"}
    try:
        execute_query("""
            UPDATE propriedades
            SET nome_propriedade = ?, codigo_car = ?, codigo_ccir = ?, caminho_arquivo_car = ?, caminho_arquivo_ccir = ?, municipio = ?, uf = ?
            WHERE id = ?
        """, params=(p.nome_propriedade, p.codigo_car, p.codigo_ccir, p.caminho_arquivo_car, p.caminho_arquivo_ccir, p.municipio, p.uf.upper(), prop_id), commit=True)
        return {"message": "Propriedade atualizada com sucesso"}
    except Exception as e:
        return {"error": str(e)}

@router.delete("/propriedades/{prop_id}")
def delete_propriedade(prop_id: int):
    verificar_propriedade_arquivada(prop_id)
    try:
        execute_query("DELETE FROM propriedades WHERE id = ?", params=(prop_id,), commit=True)
        return {"message": "Propriedade excluída com sucesso"}
    except Exception as e:
        return {"error": str(e)}

# ── Upload / Download de Arquivos CAR e CCIR ───────────────────────────────────

@router.post("/propriedades/{prop_id}/upload-car")
async def upload_propriedade_car(prop_id: int, file: UploadFile = File(...)):
    verificar_propriedade_arquivada(prop_id)
    try:
        prop = execute_query("SELECT id, nome_propriedade FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
        if not prop:
            raise HTTPException(status_code=404, detail="Propriedade não localizada.")
        
        dest_dir = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}"
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        # Limpa caracteres especiais
        safe_filename = re.sub(r'[\\/*?:"<>|]', "", file.filename)
        dest_path = dest_dir / f"CAR_{safe_filename}"
        
        with open(dest_path, "wb") as buffer:
            buffer.write(await file.read())
            
        execute_query(
            "UPDATE propriedades SET caminho_arquivo_car = ? WHERE id = ?",
            params=(str(dest_path), prop_id),
            commit=True
        )
        return {"message": "Arquivo do CAR enviado com sucesso", "caminho": str(dest_path)}
    except Exception as e:
        return {"error": str(e)}

@router.post("/propriedades/{prop_id}/upload-ccir")
async def upload_propriedade_ccir(prop_id: int, file: UploadFile = File(...)):
    verificar_propriedade_arquivada(prop_id)
    try:
        prop = execute_query("SELECT id, nome_propriedade FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
        if not prop:
            raise HTTPException(status_code=404, detail="Propriedade não localizada.")
        
        dest_dir = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}"
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        safe_filename = re.sub(r'[\\/*?:"<>|]', "", file.filename)
        dest_path = dest_dir / f"CCIR_{safe_filename}"
        
        with open(dest_path, "wb") as buffer:
            buffer.write(await file.read())
            
        execute_query(
            "UPDATE propriedades SET caminho_arquivo_ccir = ? WHERE id = ?",
            params=(str(dest_path), prop_id),
            commit=True
        )
        return {"message": "Arquivo do CCIR enviado com sucesso", "caminho": str(dest_path)}
    except Exception as e:
        return {"error": str(e)}

@router.get("/propriedades/{prop_id}/arquivo-car")
def download_propriedade_car(prop_id: int):
    row = execute_query("SELECT caminho_arquivo_car FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
    if not row or not row["caminho_arquivo_car"]:
        raise HTTPException(status_code=404, detail="Arquivo do CAR não cadastrado para esta propriedade.")
    path = Path(row["caminho_arquivo_car"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Arquivo do CAR físico não foi localizado no disco.")
    return FileResponse(path, filename=path.name)

@router.get("/propriedades/{prop_id}/arquivo-ccir")
def download_propriedade_ccir(prop_id: int):
    row = execute_query("SELECT caminho_arquivo_ccir FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
    if not row or not row["caminho_arquivo_ccir"]:
        raise HTTPException(status_code=404, detail="Arquivo do CCIR não cadastrado para esta propriedade.")
    path = Path(row["caminho_arquivo_ccir"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Arquivo do CCIR físico não foi localizado no disco.")
    return FileResponse(path, filename=path.name)

@router.delete("/propriedades/{prop_id}/arquivo-car")
def delete_propriedade_car(prop_id: int):
    verificar_propriedade_arquivada(prop_id)
    try:
        row = execute_query("SELECT caminho_arquivo_car FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
        if row and row["caminho_arquivo_car"]:
            path = Path(row["caminho_arquivo_car"])
            if path.exists():
                path.unlink()
        execute_query("UPDATE propriedades SET caminho_arquivo_car = NULL WHERE id = ?", params=(prop_id,), commit=True)
        return {"message": "Arquivo do CAR excluído com sucesso"}
    except Exception as e:
        return {"error": str(e)}

@router.delete("/propriedades/{prop_id}/arquivo-ccir")
def delete_propriedade_ccir(prop_id: int):
    verificar_propriedade_arquivada(prop_id)
    try:
        row = execute_query("SELECT caminho_arquivo_ccir FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
        if row and row["caminho_arquivo_ccir"]:
            path = Path(row["caminho_arquivo_ccir"])
            if path.exists():
                path.unlink()
        execute_query("UPDATE propriedades SET caminho_arquivo_ccir = NULL WHERE id = ?", params=(prop_id,), commit=True)
        return {"message": "Arquivo do CCIR excluído com sucesso"}
    except Exception as e:
        return {"error": str(e)}

# ── Matrículas da Propriedade ──────────────────────────────────────────────────

@router.get("/propriedades/{prop_id}/matriculas")
def get_matriculas_da_propriedade(prop_id: int):
    try:
        rows = execute_query("SELECT * FROM matriculas WHERE propriedade_id = ? ORDER BY numero_matricula ASC", params=(prop_id,), fetch_all=True)
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/propriedades/{prop_id}/matriculas")
def create_matricula_na_propriedade(prop_id: int, m: MatriculaCreate):
    try:
        exists = execute_query("SELECT id FROM matriculas WHERE propriedade_id = ? AND numero_matricula = ?", params=(prop_id, m.numero_matricula), fetch_one=True)
        if exists:
            raise HTTPException(status_code=400, detail="Matrícula já cadastrada para esta propriedade.")
            
        query = "INSERT INTO matriculas (propriedade_id, numero_matricula, ccir, itr, area_ha, valor_itr, denominacao, georreferenciamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        execute_query(query, params=(prop_id, m.numero_matricula, m.ccir, m.itr, m.area_ha, m.valor_itr, m.denominacao, m.georreferenciamento), commit=True)
        return {"message": "Matrícula cadastrada com sucesso na propriedade."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ── Vínculo de Clientes e Proprietários ──────────────────────────────────────────

@router.post("/propriedades/{prop_id}/clientes")
def link_cliente_propriedade(prop_id: int, pc: PropriedadeClienteCreate):
    verificar_propriedade_arquivada(prop_id)
    res = vincular_cliente_propriedade(prop_id, pc.cliente_id, pc.percentual_participacao)
    if "error" in res:
        return {"error": res["error"]}
    return res

@router.delete("/propriedades/{prop_id}/clientes/{cliente_id}")
def unlink_cliente_propriedade(prop_id: int, cliente_id: int):
    verificar_propriedade_arquivada(prop_id)
    try:
        execute_query(
            "DELETE FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ?",
            params=(prop_id, cliente_id),
            commit=True
        )
        return {"message": "Proprietário desvinculado com sucesso"}
    except Exception as e:
        return {"error": str(e)}
