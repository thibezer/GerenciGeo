import os
import io
import csv
import json
import logging
import zipfile
import xml.etree.ElementTree as ET
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database.connection import DatabaseManager, execute_query
from routes.deps import verificar_levantamento_arquivado
from utils.geodesia_parser import (
    extract_codigo_parts,
    parse_num_robust,
    parse_dms_robust,
    parse_wkt_point,
    parse_wkt_linestring,
    parse_wkt_geometry,
    resolver_coordenadas_robust,
    detect_csv_delimiter,
)

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
    nome_propriedade: Optional[str] = None
    codigo_incra_imovel: Optional[str] = None

class SegmentoCreate(BaseModel):
    matricula_id: int
    ponto_inicio_id: int
    ponto_fim_id: int
    confrontante_id: Optional[int] = None
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
            SELECT c.id, p.nome, p.cpf_cnpj, c.tipo_relacao, p.rg, p.nacionalidade, p.profissao,
                   p.estado_civil, p.regime_bens, p.endereco_completo, p.nome_conjuge,
                   p.cpf_conjuge, p.rg_conjuge, c.matricula_imovel, c.cns_confrontante,
                   c.levantamento_id
            FROM confrontantes c
            JOIN pessoas p ON c.pessoa_id = p.id
            WHERE REPLACE(REPLACE(REPLACE(p.cpf_cnpj, '.', ''), '-', ''), '/', '') = ?
              AND p.nome IS NOT NULL AND p.nome != ''
            ORDER BY c.id DESC LIMIT 1
        """
        row = execute_query(query, params=(cpf_limpo,), fetch_one=True)
        if row:
            return dict(row)
            
        # Se não achou na relação de confrontantes, busca apenas em pessoas para autopreencher
        query_pessoa = """
            SELECT id as pessoa_id, nome, cpf_cnpj, rg, nacionalidade, profissao,
                   estado_civil, regime_bens, endereco_completo, nome_conjuge,
                   cpf_conjuge, rg_conjuge
            FROM pessoas
            WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '') = ?
            LIMIT 1
        """
        row_p = execute_query(query_pessoa, params=(cpf_limpo,), fetch_one=True)
        if row_p:
            res = dict(row_p)
            res["nome"] = res.pop("nome")  # Renomeia nome para bater com form
            return res
            
        return {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{id}/confrontantes")
def get_confrontantes(id: int):
    try:
        query = """
            SELECT c.id, c.levantamento_id, p.nome, p.cpf_cnpj, c.tipo_relacao, p.rg,
                   p.nacionalidade, p.profissao, p.estado_civil, p.regime_bens,
                   p.endereco_completo, p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge,
                   c.matricula_imovel, c.cns_confrontante, c.caminho_matricula_pdf,
                   c.nome_propriedade, c.codigo_incra_imovel, c.poligono_wkt,
                   c.confrontacoes_json, c.created_at
            FROM confrontantes c
            JOIN pessoas p ON c.pessoa_id = p.id
            WHERE c.levantamento_id = ?
        """
        return [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/levantamentos/{id}/confrontantes")
def create_confrontante(id: int, c: ConfrontanteCreate):
    verificar_levantamento_arquivado(id)
    try:
        cpf_cnpj = c.cpf_cnpj if (c.cpf_cnpj and str(c.cpf_cnpj).strip()) else None
        cpf_limpo = "".join(char for char in cpf_cnpj if char.isdigit()) if cpf_cnpj else ""
        
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # Verifica se a pessoa já existe
            pessoa_id = None
            if cpf_limpo:
                cursor.execute("""
                    SELECT id FROM pessoas 
                    WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '') = ?
                """, (cpf_limpo,))
                row_p = cursor.fetchone()
                if row_p:
                    pessoa_id = row_p[0]
                    # Atualiza os dados civis da pessoa se houver novos dados informados
                    cursor.execute("""
                        UPDATE pessoas
                        SET nome = ?, rg = ?, nacionalidade = ?, profissao = ?, estado_civil = ?,
                            regime_bens = ?, endereco_completo = ?, nome_conjuge = ?,
                            cpf_conjuge = ?, rg_conjuge = ?
                        WHERE id = ?
                    """, (c.nome, c.rg, c.nacionalidade, c.profissao, c.estado_civil, c.regime_bens, c.endereco_completo, c.nome_conjuge, c.cpf_conjuge, c.rg_conjuge, pessoa_id))
            
            if not pessoa_id:
                cursor.execute("""
                    INSERT INTO pessoas (
                        nome, cpf_cnpj, rg, nacionalidade, profissao, estado_civil, regime_bens,
                        endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (c.nome, cpf_cnpj, c.rg, c.nacionalidade, c.profissao, c.estado_civil, c.regime_bens, c.endereco_completo, c.nome_conjuge, c.cpf_conjuge, c.rg_conjuge))
                pessoa_id = cursor.lastrowid
                
            cursor.execute("""
                INSERT INTO confrontantes (
                    pessoa_id, levantamento_id, nome, tipo_relacao, matricula_imovel, cns_confrontante,
                    nome_propriedade, codigo_incra_imovel
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (pessoa_id, id, c.nome, c.tipo_relacao, c.matricula_imovel, c.cns_confrontante, c.nome_propriedade, c.codigo_incra_imovel))
            confrontante_id = cursor.lastrowid
            conn.commit()
            
        return {
            "message": "Confrontante adicionado com sucesso",
            "id": confrontante_id,
            "confrontante_id": confrontante_id
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/confrontantes/{cid}")
def update_confrontante(cid: int, c: ConfrontanteCreate):
    try:
        row = execute_query("SELECT pessoa_id, levantamento_id FROM confrontantes WHERE id = ?", params=(cid,), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Confrontante não encontrado.")
            
        pessoa_id = row["pessoa_id"]
        verificar_levantamento_arquivado(row["levantamento_id"])
            
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # Atualiza os dados civis na tabela única pessoas
            cpf_cnpj_norm = c.cpf_cnpj if (c.cpf_cnpj and str(c.cpf_cnpj).strip()) else None
            cursor.execute("""
                UPDATE pessoas
                SET nome = ?, cpf_cnpj = ?, rg = ?, nacionalidade = ?, profissao = ?,
                    estado_civil = ?, regime_bens = ?, endereco_completo = ?,
                    nome_conjuge = ?, cpf_conjuge = ?, rg_conjuge = ?
                WHERE id = ?
            """, (c.nome, cpf_cnpj_norm, c.rg, c.nacionalidade, c.profissao, c.estado_civil, c.regime_bens, c.endereco_completo, c.nome_conjuge, c.cpf_conjuge, c.rg_conjuge, pessoa_id))
            
            # Atualiza metadados específicos da divisa na tabela confrontantes
            cursor.execute("""
                UPDATE confrontantes
                SET tipo_relacao = ?, matricula_imovel = ?, cns_confrontante = ?,
                    nome_propriedade = ?, codigo_incra_imovel = ?
                WHERE id = ?
            """, (c.tipo_relacao, c.matricula_imovel, c.cns_confrontante, c.nome_propriedade, c.codigo_incra_imovel, cid))
            
            conn.commit()

        return {"message": "Confrontante atualizado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/confrontantes/{cid}")
def delete_confrontante(cid: int):
    try:
        row = execute_query("SELECT levantamento_id FROM confrontantes WHERE id = ?", params=(cid,), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Confrontante não encontrado.")
            
        verificar_levantamento_arquivado(row["levantamento_id"])
            
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM confrontantes WHERE id = ?", (cid,))
            
            # Limpa pessoas órfãs (não associadas a clientes nem confrontantes)
            cursor.execute("""
                DELETE FROM pessoas 
                WHERE id NOT IN (SELECT pessoa_id FROM clientes WHERE pessoa_id IS NOT NULL)
                  AND id NOT IN (SELECT pessoa_id FROM confrontantes WHERE pessoa_id IS NOT NULL);
            """)
            conn.commit()
        return {"message": "Confrontante removido com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

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
        raise HTTPException(status_code=500, detail=str(e))

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
        raise HTTPException(status_code=500, detail=str(e))

# ── Rotas de Segmentos ─────────────────────────────────────────────────────────

@router.get("/levantamentos/{id}/segmentos")
def get_segmentos(id: int):
    try:
        # Retorna apenas segmentos de campo (origem_homologada=0 ou NULL)
        query = """
            SELECT s.*, 
                   p_ini.nome_vertice as nome_ponto_inicio, 
                   p_fim.nome_vertice as nome_ponto_fim, 
                   p.nome as nome_confrontante,
                   m.numero_matricula
            FROM segmentos s
            JOIN pontos p_ini ON s.ponto_inicio_id = p_ini.id
            JOIN pontos p_fim ON s.ponto_fim_id = p_fim.id
            JOIN matriculas m ON s.matricula_id = m.id
            LEFT JOIN confrontantes c ON s.confrontante_id = c.id
            LEFT JOIN pessoas p ON c.pessoa_id = p.id
            WHERE s.levantamento_id = ?
              AND (s.origem_homologada IS NULL OR s.origem_homologada = 0)
        """
        return [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        raise HTTPException(status_code=500, detail=str(e))

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
        raise HTTPException(status_code=500, detail=str(e))

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
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/confrontantes-ativos")
def get_confrontantes_ativos_matricula(id: int, matricula_id: int):
    try:
        rows = execute_query(
            """
            SELECT c.id, p.nome, p.cpf_cnpj, c.matricula_imovel, c.caminho_matricula_pdf
            FROM segmentos s
            JOIN confrontantes c ON s.confrontante_id = c.id
            JOIN pessoas p ON c.pessoa_id = p.id
            WHERE s.levantamento_id = ? AND s.matricula_id = ?
            GROUP BY c.id
            ORDER BY p.nome ASC
            """,
            params=(id, matricula_id),
            fetch_all=True
        )
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/levantamentos/{id}/importar-vizinho-csv")
async def importar_vizinho_csv(
    id: int,
    file: UploadFile = File(...),
    fuso_utm: int = Query(22, description="Fuso UTM padrão do levantamento")
):
    verificar_levantamento_arquivado(id)
    content_bytes = await file.read()
    filename = file.filename or "vizinho.csv"
    is_ods = filename.lower().endswith(".ods") or content_bytes.startswith(b"PK\x03\x04")

    pontos_detetados = []
    qrcode_imovel = None
    nome_propriedade = None
    is_poligono_only = False
    is_limites_segmentos = False
    segmentos_confrontacao = []

    if is_ods:
        try:
            with zipfile.ZipFile(io.BytesIO(content_bytes)) as zip_ref:
                if 'content.xml' in zip_ref.namelist():
                    xml_data = zip_ref.read('content.xml')
                    ns = {
                        'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
                        'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
                        'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
                    }
                    root = ET.fromstring(xml_data)
                    ods_rows = []
                    for table in root.findall('.//table:table', ns):
                        for row in table.findall('.//table:table-row', ns):
                            cells = row.findall('.//table:table-cell', ns)
                            cell_texts = []
                            for cell in cells:
                                repeated = cell.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated')
                                p_elements = cell.findall('.//text:p', ns)
                                cell_text = "".join([p.text for p in p_elements if p.text])
                                if not cell_text:
                                    cell_text = cell.get('{urn:oasis:names:tc:opendocument:xmlns:office:1.0}value') or ""
                                count = int(repeated) if repeated else 1
                                if count > 30: count = 1
                                cell_texts.extend([cell_text] * count)

                            if any(str(c).strip() for c in cell_texts):
                                ods_rows.append(cell_texts)

                    if ods_rows:
                        headers_ods = [str(c).strip().upper() for c in ods_rows[0]]
                        def get_col_ods(names):
                            for n in names:
                                if n in headers_ods:
                                    return headers_ods.index(n)
                            return -1

                        idx_cod_ods = get_col_ods(['CODIGO', 'VERTICE', 'DO_VERTICE', 'NOME', 'MARCO', 'PONTO', 'ID'])
                        idx_x_ods = get_col_ods(['X', 'LONGITUDE', 'ESTE', 'EASTING', 'COORD_X', 'LONG', 'E'])
                        idx_y_ods = get_col_ods(['Y', 'LATITUDE', 'NORTE', 'NORTHING', 'COORD_Y', 'LAT', 'N'])

                        has_header_ods = idx_cod_ods >= 0 and (idx_x_ods >= 0 or idx_y_ods >= 0)
                        data_rows_ods = ods_rows[1:] if has_header_ods else ods_rows

                        for row_cells in data_rows_ods:
                            if len(row_cells) < 2:
                                continue
                            if has_header_ods:
                                c_code = row_cells[idx_cod_ods] if 0 <= idx_cod_ods < len(row_cells) else ""
                                c_x = row_cells[idx_x_ods] if 0 <= idx_x_ods < len(row_cells) else ""
                                c_y = row_cells[idx_y_ods] if 0 <= idx_y_ods < len(row_cells) else ""
                            else:
                                c_code = row_cells[0]
                                c_x = row_cells[1] if len(row_cells) > 1 else ""
                                c_y = row_cells[3] if len(row_cells) > 3 else (row_cells[2] if len(row_cells) > 2 else "")

                            tipo, num, vertice = extract_codigo_parts(c_code)
                            if vertice:
                                lat, lon, este, norte = resolver_coordenadas_robust(c_x, c_y, fuso_utm)
                                if lat is not None and lon is not None:
                                    pontos_detetados.append({
                                        "tipo_ponto": tipo,
                                        "numero": num,
                                        "codigo_completo": vertice,
                                        "norte": norte,
                                        "este": este,
                                        "altitude": parse_num_robust(row_cells[5]) if len(row_cells) > 5 else 0.0,
                                        "lat": lat,
                                        "lon": lon,
                                        "sigma_n": parse_num_robust(row_cells[4]) if len(row_cells) > 4 else 0.0,
                                        "sigma_e": parse_num_robust(row_cells[2]) if len(row_cells) > 2 else 0.0,
                                        "sigma_z": parse_num_robust(row_cells[6]) if len(row_cells) > 6 else 0.0,
                                        "metodo_posicionamento": str(row_cells[7]).strip() if len(row_cells) > 7 else "PG1"
                                    })
        except Exception as e_ods:
            logging.getLogger(__name__).error(f"Erro ao processar ODS do vizinho: {e_ods}")
            raise HTTPException(status_code=400, detail=f"Erro ao processar planilha ODS do vizinho: {str(e_ods)}")
    else:
        try:
            content_text = content_bytes.decode('utf-8')
        except UnicodeDecodeError:
            content_text = content_bytes.decode('latin-1')

        content_text = content_text.replace('\ufeff', '')
        lines = [line.strip() for line in content_text.splitlines() if line.strip()]

        if not lines:
            raise HTTPException(status_code=400, detail="O arquivo CSV enviado está vazio.")

        delimiter = detect_csv_delimiter(lines[0])
        reader = csv.reader(lines, delimiter=delimiter)
        rows = list(reader)

        if not rows:
            raise HTTPException(status_code=400, detail="Nenhum dado legível no CSV.")

        headers = [str(h).strip().upper() for h in rows[0]]

        # Caso A: Polígono
        if 'QRCODE' in headers and 'NOME' in headers and 'GEOMETRIA_WKT' in headers and 'CODIGO' not in headers:
            is_poligono_only = True
            idx_qrcode = headers.index('QRCODE')
            idx_nome = headers.index('NOME')
            idx_wkt = headers.index('GEOMETRIA_WKT')

            if len(rows) < 2 or len(rows[1]) <= max(idx_qrcode, idx_nome):
                raise HTTPException(status_code=400, detail="Linha de dados do polígono truncada ou inválida.")

            qrcode_imovel = str(rows[1][idx_qrcode]).strip()
            nome_propriedade = str(rows[1][idx_nome]).strip()
            if not qrcode_imovel or not nome_propriedade:
                raise HTTPException(status_code=400, detail="Dados de QRCODE ou NOME ausentes no CSV do polígono.")

            for r_idx, row in enumerate(rows[1:]):
                if len(row) > idx_wkt:
                    val_wkt = str(row[idx_wkt]).strip()
                    coords = parse_wkt_geometry(val_wkt)
                    for pt_idx, (cx, cy) in enumerate(coords):
                        lat, lon, este, norte = resolver_coordenadas_robust(cx, cy, fuso_utm)
                        if lat is not None and lon is not None:
                            pontos_detetados.append({
                                "tipo_ponto": "V",
                                "numero": pt_idx + 1,
                                "codigo_completo": f"V-{pt_idx+1:04d}",
                                "norte": norte,
                                "este": este,
                                "altitude": 0.0,
                                "lat": lat,
                                "lon": lon,
                                "sigma_n": 0.0,
                                "sigma_e": 0.0,
                                "sigma_z": 0.0,
                                "metodo_posicionamento": "PG1"
                            })

        # Caso C: Limites / Segmentos de Confrontação (arquivo "limites" do SIGEF)
        # Identificado por DO_VERTICE + AO_VERTICE, SEM coluna CODIGO. Esse arquivo descreve
        # os trechos (segmentos) entre vértices já existentes no arquivo de vértices — a
        # GEOMETRIA_WKT aqui é um LINESTRING (segmento), não um POINT (vértice isolado).
        # NÃO deve ser tratado como ingestão de pontos: os vértices reais vêm do outro arquivo.
        elif 'DO_VERTICE' in headers and 'AO_VERTICE' in headers and 'CODIGO' not in headers:
            is_limites_segmentos = True

            def get_col_idx_limites(col_names):
                for name in col_names:
                    if name in headers:
                        return headers.index(name)
                return -1

            idx_qrcode_lim = get_col_idx_limites(['QRCODE'])
            idx_do_vertice = get_col_idx_limites(['DO_VERTICE'])
            idx_ao_vertice = get_col_idx_limites(['AO_VERTICE'])
            idx_confrontante_desc = get_col_idx_limites(['CONFRONTANTE_DESC'])
            idx_azimute = get_col_idx_limites(['AZIMUTE'])
            idx_comprimento = get_col_idx_limites(['COMPRIMENTO'])
            idx_wkt_lim = get_col_idx_limites(['GEOMETRIA_WKT', 'WKT'])

            def get_row_val_limites(row, idx):
                return str(row[idx]).strip() if 0 <= idx < len(row) else ""

            for row in rows[1:]:
                if not row:
                    continue

                if idx_qrcode_lim >= 0 and not qrcode_imovel:
                    q_val = get_row_val_limites(row, idx_qrcode_lim)
                    if q_val:
                        qrcode_imovel = q_val

                do_vertice = get_row_val_limites(row, idx_do_vertice)
                ao_vertice = get_row_val_limites(row, idx_ao_vertice)
                if not do_vertice or not ao_vertice:
                    continue

                vertices_linestring = parse_wkt_linestring(get_row_val_limites(row, idx_wkt_lim))

                segmentos_confrontacao.append({
                    "do_vertice": do_vertice.upper(),
                    "ao_vertice": ao_vertice.upper(),
                    "confrontante_desc": get_row_val_limites(row, idx_confrontante_desc) or None,
                    "azimute": parse_num_robust(get_row_val_limites(row, idx_azimute)),
                    "comprimento": parse_num_robust(get_row_val_limites(row, idx_comprimento)),
                    "vertices": vertices_linestring,
                })

            if not qrcode_imovel:
                qrcode_imovel = f"CSV_{os.path.splitext(filename)[0]}"

            if not segmentos_confrontacao:
                raise HTTPException(status_code=400, detail="Nenhum segmento de confrontação (DO_VERTICE/AO_VERTICE) foi localizado no arquivo de limites.")

        # Caso B: Vértices (ou fallback)
        else:
            def get_col_idx(col_names):
                for name in col_names:
                    if name in headers:
                        return headers.index(name)
                return -1

            idx_qrcode = get_col_idx(['QRCODE'])
            idx_codigo = get_col_idx(['CODIGO', 'VERTICE', 'DO_VERTICE', 'NOME', 'MARCO', 'PONTO', 'CODIGO_VERTICE', 'NOME_VERTICE', 'DENOMINACAO', 'ID', 'NUMERO'])
            idx_tipo = get_col_idx(['TIPO_VERTICE', 'TIPO', 'TIPO_MARCO'])
            idx_x = get_col_idx(['X', 'LONGITUDE', 'ESTE', 'EASTING', 'COORD_X', 'LONG', 'E', 'LONGITUDE_DECIMAL', 'X_UTM'])
            idx_y = get_col_idx(['Y', 'LATITUDE', 'NORTE', 'NORTHING', 'COORD_Y', 'LAT', 'N', 'LATITUDE_DECIMAL', 'Y_UTM'])
            idx_z = get_col_idx(['Z', 'ALTITUDE', 'ALT', 'ELEVATION', 'HEIGHT', 'H'])
            idx_wkt = get_col_idx(['GEOMETRIA_WKT', 'WKT'])
            idx_metodo = get_col_idx(['METODO_POSICIONAMENTO', 'METODO'])
            idx_sigma_x = get_col_idx(['SIGMA_X', 'SIGMA_E'])
            idx_sigma_y = get_col_idx(['SIGMA_Y', 'SIGMA_N'])
            idx_sigma_z = get_col_idx(['SIGMA_Z', 'SIGMA_ALT'])

            for row in rows[1:]:
                if not row:
                    continue

                def get_row_val(idx):
                    return str(row[idx]).strip() if 0 <= idx < len(row) else ""

                if idx_qrcode >= 0 and not qrcode_imovel:
                    q_val = get_row_val(idx_qrcode)
                    if q_val:
                        qrcode_imovel = q_val

                raw_vertice = get_row_val(idx_codigo)
                tipo, num, vertice = extract_codigo_parts(raw_vertice)
                if not vertice:
                    continue

                val_x = get_row_val(idx_x)
                val_y = get_row_val(idx_y)
                val_wkt = get_row_val(idx_wkt)

                wkt_lon, wkt_lat = parse_wkt_point(val_wkt)
                lat, lon, este, norte = None, None, None, None

                if val_x or val_y:
                    lat, lon, este, norte = resolver_coordenadas_robust(val_x, val_y, fuso_utm)

                if (lat is None or lon is None) and wkt_lat is not None and wkt_lon is not None:
                    lat, lon = wkt_lat, wkt_lon
                    if este is None or norte is None:
                        _, _, este, norte = resolver_coordenadas_robust(lon, lat, fuso_utm)

                pontos_detetados.append({
                    "tipo_ponto": tipo or "V",
                    "numero": num or 0,
                    "codigo_completo": vertice,
                    "norte": norte,
                    "este": este,
                    "altitude": parse_num_robust(get_row_val(idx_z)) or 0.0,
                    "lat": lat,
                    "lon": lon,
                    "sigma_n": parse_num_robust(get_row_val(idx_sigma_y)) or 0.0,
                    "sigma_e": parse_num_robust(get_row_val(idx_sigma_x)) or 0.0,
                    "sigma_z": parse_num_robust(get_row_val(idx_sigma_z)) or 0.0,
                    "metodo_posicionamento": get_row_val(idx_metodo) or "PG1"
                })

    # Tratamento caso arquivo de limites / segmentos de confrontação (Caso C)
    # IMPORTANTE: este arquivo NUNCA deve inserir, apagar ou alterar registros da tabela
    # `pontos` — os vértices já vêm do arquivo de vértices. Aqui só guardamos a poligonal
    # do perímetro (para desenho no mapa) e a descrição de confrontação de cada segmento.
    if is_limites_segmentos:
        try:
            anel = []
            for seg in segmentos_confrontacao:
                pts = seg.get("vertices") or []
                if not pts:
                    continue
                if not anel:
                    anel.extend(pts)
                else:
                    inicio = 1 if pts[0] == anel[-1] else 0
                    anel.extend(pts[inicio:])

            if anel and anel[0] != anel[-1]:
                anel.append(anel[0])

            poligono_wkt = None
            if len(anel) >= 4:
                coords_str = ", ".join(f"{lon} {lat}" for lon, lat in anel)
                poligono_wkt = f"POLYGON(({coords_str}))"

            confrontacoes_json = json.dumps(segmentos_confrontacao, ensure_ascii=False)

            with DatabaseManager() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT c.id, p.nome, c.pessoa_id, c.nome_propriedade FROM confrontantes c
                    JOIN pessoas p ON c.pessoa_id = p.id
                    WHERE c.levantamento_id = ? AND c.codigo_incra_imovel = ?
                """, (id, qrcode_imovel))
                row_conf = cursor.fetchone()

                if row_conf:
                    confrontante_id = row_conf["id"]
                    nome_propriedade_final = row_conf["nome_propriedade"] or "Propriedade Vizinha"
                else:
                    nome_detentor = f"Vizinho SIGEF - {qrcode_imovel[:8]}"
                    nome_propriedade_final = "Propriedade Vizinha"
                    cursor.execute("INSERT INTO pessoas (nome) VALUES (?)", (nome_detentor,))
                    pessoa_id = cursor.lastrowid
                    cursor.execute(
                        "INSERT INTO confrontantes (pessoa_id, levantamento_id, nome_propriedade, codigo_incra_imovel) VALUES (?, ?, ?, ?)",
                        (pessoa_id, id, nome_propriedade_final, qrcode_imovel)
                    )
                    confrontante_id = cursor.lastrowid

                cursor.execute(
                    "UPDATE confrontantes SET poligono_wkt = ?, confrontacoes_json = ? WHERE id = ?",
                    (poligono_wkt, confrontacoes_json, confrontante_id)
                )
                conn.commit()

            return {
                "success": True,
                "confrontante": {"id": confrontante_id, "nome_propriedade": nome_propriedade_final},
                "segmentos_importados": len(segmentos_confrontacao),
                "mensagem": f"Limites do vizinho importados: {len(segmentos_confrontacao)} segmento(s) de confrontação processados."
            }
        except Exception as e_db:
            logging.getLogger(__name__).error(f"Erro ao salvar limites/segmentos do vizinho no banco: {e_db}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Erro ao persistir limites do vizinho: {str(e_db)}")

    # Ingestão de Vértices e Polígonos
    if not qrcode_imovel:
        qrcode_imovel = f"CSV_{os.path.splitext(filename)[0]}"

    if not pontos_detetados:
        raise HTTPException(status_code=400, detail="Nenhum ponto ou geometria válida no formato de vértice ou WKT foi localizado no arquivo.")

    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT c.id, p.nome, c.nome_propriedade FROM confrontantes c
                JOIN pessoas p ON c.pessoa_id = p.id
                WHERE c.levantamento_id = ? AND c.codigo_incra_imovel = ?
            """, (id, qrcode_imovel))
            row_conf = cursor.fetchone()

            if row_conf:
                confrontante_id = row_conf["id"]
                if nome_propriedade and nome_propriedade != row_conf["nome_propriedade"]:
                    cursor.execute("UPDATE confrontantes SET nome_propriedade = ? WHERE id = ?", (nome_propriedade, confrontante_id))
                else:
                    nome_propriedade = row_conf["nome_propriedade"]
                nome_detentor = row_conf["nome"]
            else:
                nome_detentor = f"Vizinho SIGEF - {qrcode_imovel[:8]}" if not is_poligono_only else f"Proprietário de {nome_propriedade}"
                if not nome_propriedade:
                    nome_propriedade = "Propriedade Vizinha"

                cursor.execute("INSERT INTO pessoas (nome) VALUES (?)", (nome_detentor,))
                pessoa_id = cursor.lastrowid

                cursor.execute(
                    "INSERT INTO confrontantes (pessoa_id, levantamento_id, nome_propriedade, codigo_incra_imovel) VALUES (?, ?, ?, ?)",
                    (pessoa_id, id, nome_propriedade, qrcode_imovel)
                )
                confrontante_id = cursor.lastrowid

            cursor.execute(
                "DELETE FROM pontos WHERE levantamento_id = ? AND confrontante_id = ? AND ponto_vizinho = 1",
                (id, confrontante_id)
            )

            dados_json = json.dumps({"tipo_limite": "Limite de Propriedade", "origem": "SIGEF / INCRA"})
            pontos_to_insert = [
                (
                    id, None, pt["codigo_completo"], pt["tipo_ponto"], pt["lat"], pt["lon"], pt["altitude"],
                    pt["norte"], pt["este"], pt["altitude"], pt["sigma_n"], pt["sigma_e"], pt["sigma_z"],
                    pt["sigma_n"], pt["sigma_e"], pt["sigma_z"], "CORRIGIDO", "CORRIGIDO", pt["metodo_posicionamento"],
                    filename, 0, confrontante_id, 1, dados_json
                )
                for pt in pontos_detetados
            ]

            cursor.executemany(
                """
                INSERT INTO pontos (
                    levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt,
                    n_original, e_original, alt_original, sigma_n, sigma_e, sigma_z,
                    sigma_lat, sigma_lon, sigma_alt, status_ponto, status_correcao, metodo_posicionamento,
                    arquivo_origem, origem_homologada, confrontante_id, ponto_vizinho, dados_vizinho_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                pontos_to_insert
            )

            # Cruzamento com os pontos do levantamento atual para vincular confrontante aos segmentos
            cursor.execute(
                "SELECT id, nome_vertice, lat, lon FROM pontos WHERE levantamento_id = ? AND (ponto_vizinho IS NULL OR ponto_vizinho = 0)",
                (id,)
            )
            nossos_pontos = cursor.fetchall()

            pontos_vizinho_coincidentes = []
            for n_pt in nossos_pontos:
                pt_viz_match = next((v for v in pontos_detetados if v["codigo_completo"].upper() == n_pt["nome_vertice"].upper()), None)
                if pt_viz_match:
                    pontos_vizinho_coincidentes.append(n_pt["id"])
                    continue

                for v in pontos_detetados:
                    if v["lat"] is not None and v["lon"] is not None and n_pt["lat"] is not None and n_pt["lon"] is not None:
                        d_lat = abs(v["lat"] - n_pt["lat"])
                        d_lon = abs(v["lon"] - n_pt["lon"])
                        if d_lat < 0.0000005 and d_lon < 0.0000005:
                            pontos_vizinho_coincidentes.append(n_pt["id"])
                            break

            if pontos_vizinho_coincidentes:
                valores_in = ",".join(str(pid) for pid in pontos_vizinho_coincidentes)
                query_update_seg = f"""
                    UPDATE segmentos
                    SET confrontante_id = ?
                    WHERE levantamento_id = ? 
                      AND (ponto_inicio_id IN ({valores_in}) OR ponto_fim_id IN ({valores_in}))
                """
                cursor.execute(query_update_seg, (confrontante_id, id))

            conn.commit()

        prop_exibida = f"{nome_propriedade} ({nome_detentor})" if nome_propriedade else nome_detentor
        return {
            "success": True,
            "confrontante": {
                "id": confrontante_id,
                "nome": nome_detentor,
                "propriedade": nome_propriedade
            },
            "pontos_importados": len(pontos_detetados),
            "pontos": pontos_detetados,
            "mensagem": f"Importação concluída: {len(pontos_detetados)} pontos do vizinho '{prop_exibida}' importados."
        }
    except Exception as e_db:
        logging.getLogger(__name__).error(f"Erro ao salvar pontos do vizinho no banco: {e_db}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao persistir informações no banco: {str(e_db)}")

@router.get("/levantamentos/{id}/pontos-vizinhos")
def get_pontos_vizinhos(id: int):
    try:
        query = """
            SELECT p.id, p.levantamento_id, p.nome_vertice, p.tipo_ponto, p.lat, p.lon, p.alt,
                   p.sigma_lat, p.sigma_lon, p.sigma_alt, p.confrontante_id, p.dados_vizinho_json,
                   COALESCE(pe.nome, 'Vizinho Desconhecido') as nome_confrontante,
                   COALESCE(c.nome_propriedade, 'Propriedade Vizinha') as nome_propriedade
            FROM pontos p
            LEFT JOIN confrontantes c ON p.confrontante_id = c.id
            LEFT JOIN pessoas pe ON c.pessoa_id = pe.id
            WHERE p.levantamento_id = ? AND p.ponto_vizinho = 1 AND (p.ignorar_poligono IS NULL OR p.ignorar_poligono = 0)
            ORDER BY p.id ASC
        """
        rows = [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/levantamentos/{id}/pontos-vizinhos")
def limpar_pontos_vizinhos(id: int):
    verificar_levantamento_arquivado(id)
    try:
        execute_query("DELETE FROM pontos WHERE levantamento_id = ? AND ponto_vizinho = 1", params=(id,), commit=True)
        execute_query(
            """
            DELETE FROM confrontantes 
            WHERE levantamento_id = ? 
              AND codigo_incra_imovel IS NOT NULL 
              AND id NOT IN (SELECT DISTINCT confrontante_id FROM segmentos WHERE levantamento_id = ? AND confrontante_id IS NOT NULL)
            """,
            params=(id, id),
            commit=True
        )
        return {"success": True, "message": "Todos os pontos de vizinhos foram removidos com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pontos/{pid}/toggle-ignorar-vizinho")
def toggle_ignorar_vizinho(pid: int):
    try:
        row = execute_query("SELECT levantamento_id, ignorar_poligono FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Ponto não encontrado.")
            
        verificar_levantamento_arquivado(row["levantamento_id"])
        
        novo_status = 1 if not row["ignorar_poligono"] else 0
        execute_query("UPDATE pontos SET ignorar_poligono = ? WHERE id = ?", params=(novo_status, pid), commit=True)
        return {"success": True, "ignorar_poligono": novo_status}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))