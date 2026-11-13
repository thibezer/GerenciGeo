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
from database.municipios_pr import sem_acento, validar_normalizar_cns
from services.gestores.cliente_manager import vincular_cliente_propriedade, validar_composicao_proprietarios
from services.gestores.matricula_manager import resolver_campos_matricula, validar_origem_desenho, COLUNAS_MATRICULA
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
    cns_ri: Optional[str] = None
    oficio_ri: Optional[str] = None

class PropriedadeUpdate(BaseModel):
    nome_propriedade: Optional[str] = None
    codigo_car: Optional[str] = None
    codigo_ccir: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    cns_ri: Optional[str] = None
    oficio_ri: Optional[str] = None

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
    area_sigef_ha: Optional[float] = None
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

class MunicipioCartorioSet(BaseModel):
    municipio: str
    uf: str
    cns: Optional[str] = None
    oficio: Optional[str] = None
    cartorio: Optional[str] = None


def _normalizar_cns_ou_400(valor: Optional[str]) -> Optional[str]:
    try:
        return validar_normalizar_cns(valor)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))


def _vincular_ri_municipio_conn(cursor, municipio: str, uf: str, cns: Optional[str], oficio: Optional[str], cartorio_legado: str = "") -> tuple[Optional[str], str]:
    """Registra cartório (CNS único) e o vínculo N:M com o município/UF na transação atual."""
    mun = (municipio or "").strip()
    uf_norm = (uf or "").strip().upper()
    oficio_clean = (oficio or "").strip()
    cns_norm = _normalizar_cns_ou_400(cns)
    if not mun or len(uf_norm) != 2:
        return None, oficio_clean

    if cns_norm:
        cursor.execute("""
            INSERT INTO cartorios_ri (cns, oficio, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(cns) DO UPDATE SET
                oficio = CASE WHEN TRIM(excluded.oficio) <> '' THEN excluded.oficio ELSE cartorios_ri.oficio END,
                updated_at = CURRENT_TIMESTAMP
        """, (cns_norm, oficio_clean))
        cursor.execute("SELECT oficio FROM cartorios_ri WHERE cns = ?", (cns_norm,))
        row_ri = cursor.fetchone()
        oficio_final = (row_ri["oficio"] if row_ri else "") or oficio_clean
        label_cartorio = f"{oficio_final} - CNS {cns_norm}".strip(" -") if oficio_final else f"CNS {cns_norm}"

        # Atualiza vínculo existente por chave normalizada (sem acento/caixa) ou insere novo vínculo N:M
        chave_alvo = (sem_acento(mun), uf_norm)
        cursor.execute(
            "SELECT id, municipio FROM municipio_cartorios WHERE uf = ? AND cns = ?",
            (uf_norm, cns_norm),
        )
        existente_id = None
        for row_mc in cursor.fetchall() or []:
            if (sem_acento(row_mc["municipio"]), uf_norm) == chave_alvo:
                existente_id = row_mc["id"]
                break

        if existente_id:
            cursor.execute(
                "UPDATE municipio_cartorios SET oficio = ?, cartorio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (oficio_final, label_cartorio, existente_id),
            )
        else:
            cursor.execute("""
                INSERT INTO municipio_cartorios (municipio, uf, cns, oficio, cartorio, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(municipio, uf, cns) DO UPDATE SET
                    oficio = excluded.oficio,
                    cartorio = excluded.cartorio,
                    updated_at = CURRENT_TIMESTAMP
            """, (mun, uf_norm, cns_norm, oficio_final, label_cartorio))

        cursor.execute(
            "DELETE FROM municipio_cartorios WHERE LOWER(municipio) = LOWER(?) AND uf = ? AND cns = ''",
            (mun, uf_norm),
        )
        return cns_norm, oficio_final

    legado = (cartorio_legado or "").strip()
    if legado:
        cursor.execute("""
            INSERT INTO municipio_cartorios (municipio, uf, cns, oficio, cartorio, updated_at)
            VALUES (?, ?, '', ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(municipio, uf, cns) DO UPDATE SET
                oficio = excluded.oficio,
                cartorio = excluded.cartorio,
                updated_at = CURRENT_TIMESTAMP
        """, (mun, uf_norm, oficio_clean, legado))
    return None, oficio_clean


@router.get("/municipios-cartorios")
def listar_municipios_cartorios():
    """
    Retorna todos os municípios cadastrados/PR com a lista de cartórios (RIs: CNS + Ofício).
    Suporta relação N:M (vários cartórios por município e o mesmo CNS atendendo vários municípios).
    """
    try:
        rows_mun = execute_query(
            "SELECT nome AS municipio, UPPER(TRIM(uf)) AS uf FROM municipios WHERE TRIM(COALESCE(nome, '')) <> ''",
            fetch_all=True,
        ) or []
        rows_mc = execute_query("""
            SELECT TRIM(mc.municipio) AS municipio, UPPER(TRIM(mc.uf)) AS uf,
                   TRIM(COALESCE(mc.cns, '')) AS cns,
                   COALESCE(NULLIF(TRIM(cr.oficio), ''), TRIM(COALESCE(mc.oficio, ''))) AS oficio,
                   TRIM(COALESCE(mc.cartorio, '')) AS cartorio
            FROM municipio_cartorios mc
            LEFT JOIN cartorios_ri cr ON cr.cns = mc.cns
            WHERE TRIM(COALESCE(mc.municipio, '')) <> ''
        """, fetch_all=True) or []
        rows_props = execute_query("""
            SELECT TRIM(p.municipio) AS municipio, UPPER(TRIM(p.uf)) AS uf,
                   TRIM(COALESCE(p.cns_ri, '')) AS cns_ri,
                   COALESCE(NULLIF(TRIM(cr.oficio), ''), TRIM(COALESCE(p.oficio_ri, ''))) AS oficio_ri
            FROM propriedades p
            LEFT JOIN cartorios_ri cr ON cr.cns = p.cns_ri
            WHERE TRIM(COALESCE(p.municipio, '')) <> ''
        """, fetch_all=True) or []

        mapa: dict[tuple[str, str], dict] = {}

        def _garantir_entrada(nome: str, uf: str, preferir_nome: bool = False) -> dict:
            nome_limpo = (nome or "").strip()
            uf_limpa = (uf or "").strip().upper()
            chave = (sem_acento(nome_limpo), uf_limpa)
            if chave not in mapa:
                mapa[chave] = {
                    "municipio": nome_limpo,
                    "uf": uf_limpa,
                    "_ris_por_cns": {},
                    "_cartorio_legado": "",
                }
            elif preferir_nome and nome_limpo:
                mapa[chave]["municipio"] = nome_limpo
            return mapa[chave]

        for r in rows_mun:
            _garantir_entrada(r["municipio"], r["uf"], preferir_nome=True)

        for r in rows_mc:
            item = _garantir_entrada(r["municipio"], r["uf"])
            cns = (r["cns"] or "").strip()
            oficio = (r["oficio"] or "").strip()
            if cns:
                atual = item["_ris_por_cns"].get(cns)
                if not atual or (oficio and not atual["oficio"]):
                    item["_ris_por_cns"][cns] = {"cns": cns, "oficio": oficio}
            elif r["cartorio"]:
                item["_cartorio_legado"] = r["cartorio"]

        for r in rows_props:
            item = _garantir_entrada(r["municipio"], r["uf"])
            cns = (r["cns_ri"] or "").strip()
            oficio = (r["oficio_ri"] or "").strip()
            if cns:
                atual = item["_ris_por_cns"].get(cns)
                if not atual or (oficio and not atual["oficio"]):
                    item["_ris_por_cns"][cns] = {"cns": cns, "oficio": oficio}

        resultado = []
        for item in sorted(mapa.values(), key=lambda x: (sem_acento(x["municipio"]), x["uf"])):
            ris = sorted(
                item["_ris_por_cns"].values(),
                key=lambda x: (sem_acento(x["oficio"]), x["cns"]),
            )
            if len(ris) == 1:
                r0 = ris[0]
                resumo = f"{r0['oficio']} · CNS {r0['cns']}" if r0["oficio"] else f"CNS {r0['cns']}"
            elif len(ris) > 1:
                resumo = f"{len(ris)} RIs ({', '.join(r['cns'] for r in ris)})"
            else:
                resumo = item["_cartorio_legado"] or None

            resultado.append({
                "municipio": item["municipio"],
                "uf": item["uf"],
                "ris": ris,
                "cartorio": resumo,
            })
        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/municipios-cartorios")
def salvar_municipio_cartorio(d: MunicipioCartorioSet):
    municipio = (d.municipio or "").strip()
    uf = (d.uf or "").strip().upper()
    if not municipio or len(uf) != 2:
        raise HTTPException(status_code=400, detail="Município e UF (2 letras) são obrigatórios.")
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cns_norm, oficio_final = _vincular_ri_municipio_conn(
                cursor,
                municipio=municipio,
                uf=uf,
                cns=d.cns,
                oficio=d.oficio,
                cartorio_legado=d.cartorio or "",
            )
            conn.commit()
        return {
            "message": "Cartório/RI do município salvo.",
            "cns": cns_norm,
            "oficio": oficio_final,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/municipios-cartorios")
def desvincular_municipio_cartorio(
    municipio: str = Query(...),
    uf: str = Query(...),
    cns: Optional[str] = Query(None),
):
    mun = (municipio or "").strip()
    uf_norm = (uf or "").strip().upper()
    cns_norm = _normalizar_cns_ou_400(cns) if cns else ""
    if not mun or len(uf_norm) != 2:
        raise HTTPException(status_code=400, detail="Município e UF válidos são obrigatórios.")
    try:
        chave_alvo = (sem_acento(mun), uf_norm)
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            if cns_norm:
                cursor.execute(
                    "SELECT id, municipio FROM municipio_cartorios WHERE uf = ? AND cns = ?",
                    (uf_norm, cns_norm),
                )
            else:
                cursor.execute(
                    "SELECT id, municipio FROM municipio_cartorios WHERE uf = ?",
                    (uf_norm,),
                )
            ids_remover = [
                row["id"]
                for row in (cursor.fetchall() or [])
                if (sem_acento(row["municipio"]), uf_norm) == chave_alvo
            ]
            if ids_remover:
                placeholders = ", ".join("?" for _ in ids_remover)
                cursor.execute(f"DELETE FROM municipio_cartorios WHERE id IN ({placeholders})", tuple(ids_remover))
            conn.commit()
        return {"message": "Vínculo de RI removido do município."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/propriedades")
def create_propriedade(p: PropriedadeCreate):
    uf_norm = (p.uf or "").strip().upper()
    if len(uf_norm) != 2:
        raise HTTPException(status_code=400, detail="UF deve conter exatamente 2 caracteres")
    cns_ri = _normalizar_cns_ou_400(p.cns_ri)
    oficio_ri = (p.oficio_ri or "").strip() or None
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            if cns_ri:
                cns_ri, oficio_final = _vincular_ri_municipio_conn(cursor, p.municipio, uf_norm, cns_ri, oficio_ri)
                oficio_ri = oficio_final or None
            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, codigo_car, codigo_ccir, municipio, uf, cns_ri, oficio_ri)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (p.nome_propriedade, p.codigo_car, p.codigo_ccir, p.municipio.strip(), uf_norm, cns_ri, oficio_ri))
            prop_id = cursor.lastrowid
            conn.commit()
        return {"id": prop_id, "message": "Propriedade cadastrada com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/propriedades/{prop_id}")
def update_propriedade(prop_id: int, p: PropriedadeUpdate):
    verificar_propriedade_arquivada(prop_id)
    # Atualização parcial: só os campos enviados são alterados
    dados = p.model_dump(exclude_unset=True)
    if "uf" in dados:
        if not dados["uf"] or len(dados["uf"].strip()) != 2:
            raise HTTPException(status_code=400, detail="UF deve conter exatamente 2 caracteres")
        dados["uf"] = dados["uf"].strip().upper()
    if "cns_ri" in dados:
        dados["cns_ri"] = _normalizar_cns_ou_400(dados["cns_ri"])
    if "oficio_ri" in dados:
        dados["oficio_ri"] = (dados["oficio_ri"] or "").strip() or None
    for obrigatorio in ("nome_propriedade", "municipio"):
        if obrigatorio in dados and not (dados[obrigatorio] or "").strip():
            raise HTTPException(status_code=400, detail=f"O campo {obrigatorio} é obrigatório.")
    atual = execute_query("SELECT id, municipio, uf, cns_ri, oficio_ri FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
    if not atual:
        raise HTTPException(status_code=404, detail="Propriedade não localizada.")
    if not dados:
        return {"message": "Nenhuma alteração enviada"}
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cns_eff = dados.get("cns_ri") if "cns_ri" in dados else atual["cns_ri"]
            if cns_eff:
                mun_eff = dados.get("municipio") or atual["municipio"]
                uf_eff = dados.get("uf") or atual["uf"]
                of_eff = dados.get("oficio_ri") if "oficio_ri" in dados else atual["oficio_ri"]
                cns_norm, of_final = _vincular_ri_municipio_conn(cursor, mun_eff, uf_eff, cns_eff, of_eff)
                if "cns_ri" in dados:
                    dados["cns_ri"] = cns_norm
                if of_final and not dados.get("oficio_ri"):
                    dados["oficio_ri"] = of_final
            colunas = ", ".join(f"{campo} = ?" for campo in dados)
            cursor.execute(
                f"UPDATE propriedades SET {colunas} WHERE id = ?",
                (*dados.values(), prop_id),
            )
            conn.commit()
        return {"message": "Propriedade atualizada com sucesso"}
    except HTTPException:
        raise
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
        fallback = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / path.name
        if fallback.exists():
            path = fallback
        else:
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
        fallback = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / path.name
        if fallback.exists():
            path = fallback
        else:
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
        erro_vinculo = validar_origem_desenho(None, campos["matricula_origem_desenho_id"], prop_id)
        if erro_vinculo:
            raise HTTPException(status_code=400, detail=erro_vinculo)
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

