"""
routes/levantamento/segmentos.py — Gestão de Confrontantes e Segmentos Perimetrais
"""
import os
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database.connection import execute_query
from routes.deps import verificar_levantamento_arquivado

router = APIRouter(tags=["Confrontantes & Segmentos"])

# ── Modelos ────────────────────────────────────────────────────────────────────

class ConfrontanteCreate(BaseModel):
    nome: str
    cpf_cnpj: Optional[str] = None
    tipo_relacao: Optional[str] = None
    rg: Optional[str] = None
    nacionalidade: Optional[str] = None
    profissao: Optional[str] = None
    estado_civil: Optional[str] = None
    regime_bens: Optional[str] = None
    endereco_completo: Optional[str] = None
    nome_conjuge: Optional[str] = None
    cpf_conjuge: Optional[str] = None
    rg_conjuge: Optional[str] = None
    matricula_imovel: Optional[str] = None
    cns_confrontante: Optional[str] = None # ADICIONADO PARA AMARRAÇÃO MANUAL

class SegmentoCreate(BaseModel):
    matricula_id: int
    ponto_inicio_id: int
    ponto_fim_id: int
    confrontante_id: int = None
    tipo_limite_sigef: str
    metodo_posicionamento_sigef: str

# ── Rotas de Confrontantes ─────────────────────────────────────────────────────

@router.get("/confrontantes/buscar-por-cpf")
def buscar_confrontante_por_cpf(cpf: str):
    if not cpf or not cpf.strip():
        raise HTTPException(status_code=400, detail="CPF/CNPJ não informado")
    
    cpf_limpo = "".join(char for char in cpf if char.isdigit())
    if not cpf_limpo:
        raise HTTPException(status_code=400, detail="CPF/CNPJ inválido")
        
    try:
        query = """
            SELECT * FROM confrontantes
            WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '') = ?
              AND nome IS NOT NULL AND nome != ''
            ORDER BY id DESC LIMIT 1
        """
        row = execute_query(query, params=(cpf_limpo,), fetch_one=True)
        if row:
            return dict(row)
        return {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{id}/confrontantes")
def get_confrontantes(id: int):
    try:
        return [dict(r) for r in execute_query("SELECT * FROM confrontantes WHERE levantamento_id = ?", params=(id,), fetch_all=True)]
    except Exception as e:
        return {"error": str(e)}

@router.post("/levantamentos/{id}/confrontantes")
def create_confrontante(id: int, c: ConfrontanteCreate):
    verificar_levantamento_arquivado(id)
    try:
        query = """
            INSERT INTO confrontantes 
            (levantamento_id, nome, cpf_cnpj, tipo_relacao, rg, nacionalidade, profissao, 
             estado_civil, regime_bens, endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge, matricula_imovel, cns_confrontante)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        execute_query(
            query, 
            params=(
                id, c.nome, c.cpf_cnpj, c.tipo_relacao, c.rg, c.nacionalidade, c.profissao,
                c.estado_civil, c.regime_bens, c.endereco_completo, c.nome_conjuge, c.cpf_conjuge, c.rg_conjuge, c.matricula_imovel, c.cns_confrontante
            ), 
            commit=True
        )
        return {"message": "Confrontante adicionado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@router.put("/confrontantes/{cid}")
def update_confrontante(cid: int, c: ConfrontanteCreate):
    try:
        row = execute_query("SELECT levantamento_id FROM confrontantes WHERE id = ?", params=(cid,), fetch_one=True)
        if row:
            verificar_levantamento_arquivado(row["levantamento_id"])
            
        query = """
            UPDATE confrontantes 
            SET nome = ?, cpf_cnpj = ?, tipo_relacao = ?, rg = ?, nacionalidade = ?, profissao = ?, 
                estado_civil = ?, regime_bens = ?, endereco_completo = ?, nome_conjuge = ?, cpf_conjuge = ?, rg_conjuge = ?, matricula_imovel = ?, cns_confrontante = ?
            WHERE id = ?
        """
        execute_query(
            query, 
            params=(
                c.nome, c.cpf_cnpj, c.tipo_relacao, c.rg, c.nacionalidade, c.profissao,
                c.estado_civil, c.regime_bens, c.endereco_completo, c.nome_conjuge, c.cpf_conjuge, c.rg_conjuge, c.matricula_imovel, c.cns_confrontante, cid
            ), 
            commit=True
        )

        # Propagação automática de dados para outros registros de confrontante com o mesmo CPF/CNPJ (se informado)
        # desde que o levantamento correspondente não esteja ARQUIVADO.
        if c.cpf_cnpj and c.cpf_cnpj.strip():
            cpf_limpo = "".join(char for char in c.cpf_cnpj if char.isdigit())
            if cpf_limpo:
                query_propagar = """
                    UPDATE confrontantes
                    SET nome = ?, 
                        rg = ?, 
                        nacionalidade = ?, 
                        profissao = ?, 
                        estado_civil = ?, 
                        regime_bens = ?, 
                        endereco_completo = ?, 
                        nome_conjuge = ?, 
                        cpf_conjuge = ?, 
                        rg_conjuge = ?
                    WHERE id != ? 
                      AND REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '') = ?
                      AND levantamento_id IN (SELECT id FROM levantamentos WHERE status != 'ARQUIVADO')
                """
                execute_query(
                    query_propagar,
                    params=(
                        c.nome, c.rg, c.nacionalidade, c.profissao,
                        c.estado_civil, c.regime_bens, c.endereco_completo,
                        c.nome_conjuge, c.cpf_conjuge, c.rg_conjuge,
                        cid, cpf_limpo
                    ),
                    commit=True
                )

        return {"message": "Confrontante atualizado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@router.delete("/confrontantes/{cid}")
def delete_confrontante(cid: int):
    try:
        row = execute_query("SELECT levantamento_id FROM confrontantes WHERE id = ?", params=(cid,), fetch_one=True)
        if row:
            verificar_levantamento_arquivado(row["levantamento_id"])
            
        execute_query("DELETE FROM confrontantes WHERE id = ?", params=(cid,), commit=True)
        return {"message": "Confrontante removido com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@router.post("/confrontantes/{cid}/upload-matricula")
async def upload_confrontante_matricula(cid: int, file: UploadFile = File(...)):
    try:
        # 1. Validação de extensão
        ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
        if ext not in [".pdf", ".png", ".jpg", ".jpeg", ".gif"]:
            raise HTTPException(
                status_code=400, 
                detail="Formato de arquivo inválido. Permitido apenas PDF ou Imagens (.png, .jpg, .jpeg, .gif)."
            )
            
        # 2. Validação de tamanho máximo (15MB)
        limite_bytes = 15 * 1024 * 1024
        content = await file.read(limite_bytes + 1)
        if len(content) > limite_bytes:
            raise HTTPException(
                status_code=400, 
                detail="Tamanho de arquivo excede o limite máximo permitido de 15MB."
            )
            
        row = execute_query(
            """
            SELECT c.levantamento_id, l.propriedade_id 
            FROM confrontantes c
            JOIN levantamentos l ON c.levantamento_id = l.id
            WHERE c.id = ?
            """, 
            params=(cid,), 
            fetch_one=True
        )
        if not row:
            raise HTTPException(status_code=404, detail="Confrontante não encontrado")
            
        verificar_levantamento_arquivado(row["levantamento_id"])
        
        prop_id = row["propriedade_id"]
        from config import EXPORT_BASE_FOLDER
        conf_folder = os.path.join(EXPORT_BASE_FOLDER, "Propriedades", f"Prop_{prop_id}", "Confrontantes")
        os.makedirs(conf_folder, exist_ok=True)
        
        if not ext:
            ext = ".pdf"
            
        filename = f"Confrontante_{cid}_Matricula{ext}"
        filepath = os.path.join(conf_folder, filename)
        
        with open(filepath, "wb") as buffer:
            buffer.write(content)
            
        execute_query("UPDATE confrontantes SET caminho_matricula_pdf = ? WHERE id = ?", params=(filepath, cid), commit=True)
        return {"message": "Matrícula do confrontante anexada com sucesso", "caminho": filepath}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@router.get("/confrontantes/{cid}/visualizar-matricula")
def visualizar_confrontante_matricula(cid: int):
    try:
        row = execute_query("SELECT caminho_matricula_pdf FROM confrontantes WHERE id = ?", params=(cid,), fetch_one=True)
        if not row or not row["caminho_matricula_pdf"]:
            raise HTTPException(status_code=404, detail="Matrícula do confrontante não anexada")
            
        path = row["caminho_matricula_pdf"]
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Arquivo físico não encontrado no servidor")
            
        return FileResponse(path)
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/confrontantes/{cid}/matricula")
def deletar_confrontante_matricula(cid: int):
    try:
        row = execute_query("SELECT levantamento_id, caminho_matricula_pdf FROM confrontantes WHERE id = ?", params=(cid,), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Confrontante não encontrado")
            
        verificar_levantamento_arquivado(row["levantamento_id"])
        
        path = row["caminho_matricula_pdf"]
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                logging.warning(f"Erro ao remover arquivo físico da matrícula do confrontante: {e}")
                
        execute_query("UPDATE confrontantes SET caminho_matricula_pdf = NULL WHERE id = ?", params=(cid,), commit=True)
        return {"message": "Matrícula do confrontante excluída com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

# ── Rotas de Segmentos ─────────────────────────────────────────────────────────

@router.get("/levantamentos/{id}/segmentos")
def get_segmentos(id: int):
    try:
        # Retorna apenas segmentos de campo (origem_homologada=0 ou NULL)
        query = """
            SELECT s.*, 
                   p_ini.nome_vertice as nome_ponto_inicio, 
                   p_fim.nome_vertice as nome_ponto_fim, 
                   c.nome as nome_confrontante,
                   m.numero_matricula
            FROM segmentos s
            JOIN pontos p_ini ON s.ponto_inicio_id = p_ini.id
            JOIN pontos p_fim ON s.ponto_fim_id = p_fim.id
            JOIN matriculas m ON s.matricula_id = m.id
            LEFT JOIN confrontantes c ON s.confrontante_id = c.id
            WHERE s.levantamento_id = ?
              AND (s.origem_homologada IS NULL OR s.origem_homologada = 0)
        """
        return [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
    except Exception as e:
        return {"error": str(e)}

@router.post("/levantamentos/{id}/segmentos")
def create_segmento(id: int, s: SegmentoCreate):
    verificar_levantamento_arquivado(id)
    try:
        query = """
            INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        execute_query(query, params=(id, s.matricula_id, s.ponto_inicio_id, s.ponto_fim_id, s.confrontante_id, s.tipo_limite_sigef, s.metodo_posicionamento_sigef), commit=True)
        return {"message": "Segmento criado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@router.put("/segmentos/{sid}")
def update_segmento(sid: int, s: SegmentoCreate):
    try:
        row = execute_query("SELECT levantamento_id FROM segmentos WHERE id = ?", params=(sid,), fetch_one=True)
        if row:
            verificar_levantamento_arquivado(row["levantamento_id"])
            
        query = """
            UPDATE segmentos 
            SET matricula_id = ?, ponto_inicio_id = ?, ponto_fim_id = ?, confrontante_id = ?, tipo_limite_sigef = ?, metodo_posicionamento_sigef = ?
            WHERE id = ?
        """
        execute_query(query, params=(s.matricula_id, s.ponto_inicio_id, s.ponto_fim_id, s.confrontante_id, s.tipo_limite_sigef, s.metodo_posicionamento_sigef, sid), commit=True)
        return {"message": "Segmento atualizado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@router.delete("/segmentos/{sid}")
def delete_segmento(sid: int):
    try:
        row = execute_query("SELECT levantamento_id FROM segmentos WHERE id = ?", params=(sid,), fetch_one=True)
        if row:
            verificar_levantamento_arquivado(row["levantamento_id"])
            
        execute_query("DELETE FROM segmentos WHERE id = ?", params=(sid,), commit=True)
        return {"message": "Segmento removido com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/confrontantes-ativos")
def get_confrontantes_ativos_matricula(id: int, matricula_id: int):
    try:
        rows = execute_query(
            """
            SELECT c.id, c.nome, c.cpf_cnpj, c.matricula_imovel, c.caminho_matricula_pdf
            FROM segmentos s
            JOIN confrontantes c ON s.confrontante_id = c.id
            WHERE s.levantamento_id = ? AND s.matricula_id = ?
            GROUP BY c.id
            ORDER BY c.nome ASC
            """,
            params=(id, matricula_id),
            fetch_all=True
        )
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
