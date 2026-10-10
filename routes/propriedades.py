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
from services.gestores.cliente_manager import vincular_cliente_propriedade, validar_composicao_proprietarios
from services.gestores.matricula_manager import resolver_campos_matricula, COLUNAS_MATRICULA
from config import EXPORT_BASE_FOLDER
from routes.deps import verificar_propriedade_arquivada

router = APIRouter(tags=["Propriedades & Matrículas"])

# ── Modelos ────────────────────────────────────────────────────────────────────

class PropriedadeCreate(BaseModel):
    # Os caminhos dos arquivos do CAR/CCIR são definidos apenas pelas rotas de upload
    nome_propriedade: str
    codigo_car: Optional[str] = None
    codigo_ccir: Optional[str] = None
    municipio: str
    uf: str

class PropriedadeUpdate(BaseModel):
    nome_propriedade: Optional[str] = None
    codigo_car: Optional[str] = None
    codigo_ccir: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None

class PropriedadeClienteCreate(BaseModel):
    cliente_id: int
    percentual_participacao: float = 0.0

class MatriculaCreate(BaseModel):
    numero_matricula: str
    ccir: Optional[str] = None
    codigo_ccir: Optional[str] = None
    itr: Optional[str] = None
    codigo_itr: Optional[str] = None
    area_ha: Optional[float] = None
    area_registrada_ha: Optional[float] = None
    valor_itr: Optional[float] = None
    denominacao: Optional[str] = None
    denominacao_gleba: Optional[str] = None
    georreferenciamento: Optional[str] = None
    matricula_origem_desenho_id: Optional[int] = None

# ── Rotas de Propriedades ───────────────────────────────────────────────────────

@router.get("/propriedades")
def get_propriedades():
    try:
        # Fetch properties with their related counts in a single query to avoid N+1 issue
        prop_query = """
            SELECT
                p.*,
                (SELECT count(*) FROM matriculas m WHERE m.propriedade_id = p.id) as total_matriculas,
                (SELECT count(*) FROM levantamentos l WHERE l.propriedade_id = p.id) as total_levantamentos
            FROM propriedades p
        """
        propriedades = [dict(r) for r in execute_query(prop_query, fetch_all=True)]

        if not propriedades:
            return []

        # Fetch all clients related to these properties in a single query
        prop_ids = [p['id'] for p in propriedades]
        placeholders = ', '.join(['?'] * len(prop_ids))

        clients_query = f"""
            SELECT pc.propriedade_id, c.id, pe.nome as nome_completo, pe.cpf_cnpj, pc.percentual_participacao
            FROM propriedade_clientes pc
            JOIN clientes c ON pc.cliente_id = c.id
            JOIN pessoas pe ON c.pessoa_id = pe.id
            WHERE pc.propriedade_id IN ({placeholders})
        """
        all_clients = execute_query(clients_query, params=tuple(prop_ids), fetch_all=True)

        # Group clients by property ID
        from collections import defaultdict
        clients_by_prop = defaultdict(list)
        if all_clients:
            for c in all_clients:
                client_dict = dict(c)
                prop_id = client_dict.pop('propriedade_id')
                clients_by_prop[prop_id].append(client_dict)
            
        # Attach clients to properties and compute composition metrics
        for p in propriedades:
            p_clientes = clients_by_prop.get(p['id'], [])
            p['clientes'] = p_clientes
            total_part = sum(float(c.get('percentual_participacao') or 0.0) for c in p_clientes)
            p['total_participacao'] = round(total_part, 2)
            p['composicao_completa'] = abs(round(total_part, 4) - 100.0) <= 0.01
            
        return propriedades
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/propriedades")
def create_propriedade(p: PropriedadeCreate):
    if len(p.uf) != 2:
        raise HTTPException(status_code=400, detail="UF deve conter exatamente 2 caracteres")
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, codigo_car, codigo_ccir, municipio, uf)
                VALUES (?, ?, ?, ?, ?)
            """, (p.nome_propriedade, p.codigo_car, p.codigo_ccir, p.municipio, p.uf.upper()))
            prop_id = cursor.lastrowid
            conn.commit()
        return {"id": prop_id, "message": "Propriedade cadastrada com sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/propriedades/{prop_id}")
def update_propriedade(prop_id: int, p: PropriedadeUpdate):
    verificar_propriedade_arquivada(prop_id)
    # Atualização parcial: só os campos enviados são alterados
    dados = p.model_dump(exclude_unset=True)
    if "uf" in dados:
        if not dados["uf"] or len(dados["uf"]) != 2:
            raise HTTPException(status_code=400, detail="UF deve conter exatamente 2 caracteres")
        dados["uf"] = dados["uf"].upper()
    for obrigatorio in ("nome_propriedade", "municipio"):
        if obrigatorio in dados and not (dados[obrigatorio] or "").strip():
            raise HTTPException(status_code=400, detail=f"O campo {obrigatorio} é obrigatório.")
    if not execute_query("SELECT id FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True):
        raise HTTPException(status_code=404, detail="Propriedade não localizada.")
    if not dados:
        return {"message": "Nenhuma alteração enviada"}
    try:
        colunas = ", ".join(f"{campo} = ?" for campo in dados)
        execute_query(
            f"UPDATE propriedades SET {colunas} WHERE id = ?",
            params=(*dados.values(), prop_id),
            commit=True
        )
        return {"message": "Propriedade atualizada com sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/propriedades/{prop_id}")
def delete_propriedade(prop_id: int):
    verificar_propriedade_arquivada(prop_id)
    # A exclusão apagaria em cascata os levantamentos (pontos, segmentos, confrontantes)
    levs = execute_query("SELECT count(*) as qtd FROM levantamentos WHERE propriedade_id = ?", params=(prop_id,), fetch_one=True)
    if levs and levs["qtd"] > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Não é possível excluir a propriedade: existem {levs['qtd']} levantamento(s) vinculado(s). Exclua os levantamentos antes."
        )
    try:
        execute_query("DELETE FROM propriedades WHERE id = ?", params=(prop_id,), commit=True)
        return {"message": "Propriedade excluída com sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/propriedades/{prop_id}/arquivo-car")
def download_propriedade_car(prop_id: int, download: bool = False):
    row = execute_query("SELECT caminho_arquivo_car FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
    if not row or not row["caminho_arquivo_car"]:
        raise HTTPException(status_code=404, detail="Arquivo do CAR não cadastrado para esta propriedade.")
    path = Path(row["caminho_arquivo_car"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Arquivo do CAR físico não foi localizado no disco.")
    disposition = "attachment" if download else "inline"
    return FileResponse(path, filename=path.name, content_disposition_type=disposition)

@router.get("/propriedades/{prop_id}/arquivo-ccir")
def download_propriedade_ccir(prop_id: int, download: bool = False):
    row = execute_query("SELECT caminho_arquivo_ccir FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
    if not row or not row["caminho_arquivo_ccir"]:
        raise HTTPException(status_code=404, detail="Arquivo do CCIR não cadastrado para esta propriedade.")
    path = Path(row["caminho_arquivo_ccir"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Arquivo do CCIR físico não foi localizado no disco.")
    disposition = "attachment" if download else "inline"
    return FileResponse(path, filename=path.name, content_disposition_type=disposition)

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
        raise HTTPException(status_code=500, detail=str(e))

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
        raise HTTPException(status_code=500, detail=str(e))

# ── Matrículas da Propriedade ──────────────────────────────────────────────────

@router.get("/propriedades/{prop_id}/matriculas")
def get_matriculas_da_propriedade(prop_id: int):
    try:
        rows = execute_query("SELECT * FROM matriculas WHERE propriedade_id = ? ORDER BY numero_matricula ASC", params=(prop_id,), fetch_all=True)
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/propriedades/{prop_id}/matriculas")
def create_matricula_na_propriedade(prop_id: int, m: MatriculaCreate):
    try:
        exists = execute_query("SELECT id FROM matriculas WHERE propriedade_id = ? AND numero_matricula = ?", params=(prop_id, m.numero_matricula), fetch_one=True)
        if exists:
            raise HTTPException(status_code=400, detail="Matrícula já cadastrada para esta propriedade.")
            
        campos = resolver_campos_matricula(m.model_dump(exclude_unset=True))
        colunas = ", ".join(COLUNAS_MATRICULA)
        marcadores = ", ".join("?" for _ in COLUNAS_MATRICULA)
        execute_query(
            f"INSERT INTO matriculas (propriedade_id, {colunas}) VALUES (?, {marcadores})",
            params=(prop_id, *(campos[c] for c in COLUNAS_MATRICULA)),
            commit=True
        )
        return {"message": "Matrícula cadastrada com sucesso na propriedade."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Vínculo de Clientes e Proprietários ──────────────────────────────────────────

@router.post("/propriedades/{prop_id}/clientes")
@router.post("/propriedades/{prop_id}/proprietarios")
def link_cliente_propriedade(prop_id: int, pc: PropriedadeClienteCreate):
    verificar_propriedade_arquivada(prop_id)
    res = vincular_cliente_propriedade(prop_id, pc.cliente_id, pc.percentual_participacao)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@router.delete("/propriedades/{prop_id}/clientes/{cliente_id}")
@router.delete("/propriedades/{prop_id}/proprietarios/{cliente_id}")
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
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/propriedades/{prop_id}/validar-proprietarios")
@router.get("/api/propriedades/{prop_id}/validar-proprietarios")
def get_validacao_proprietarios(prop_id: int):
    return validar_composicao_proprietarios(prop_id)

