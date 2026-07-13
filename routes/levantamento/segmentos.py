"""
routes/levantamento/segmentos.py — Gestão de Confrontantes e Segmentos Perimetrais
"""
import os
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database.connection import DatabaseManager, execute_query
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
                   c.nome_propriedade, c.codigo_incra_imovel, c.created_at
            FROM confrontantes c
            JOIN pessoas p ON c.pessoa_id = p.id
            WHERE c.levantamento_id = ?
        """
        return [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
    except Exception as e:
        return {"error": str(e)}

@router.post("/levantamentos/{id}/confrontantes")
def create_confrontante(id: int, c: ConfrontanteCreate):
    verificar_levantamento_arquivado(id)
    try:
        cpf_cnpj = c.cpf_cnpj
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
                """, (c.nome, c.cpf_cnpj, c.rg, c.nacionalidade, c.profissao, c.estado_civil, c.regime_bens, c.endereco_completo, c.nome_conjuge, c.cpf_conjuge, c.rg_conjuge))
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
        return {"error": str(e)}

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
            cursor.execute("""
                UPDATE pessoas
                SET nome = ?, cpf_cnpj = ?, rg = ?, nacionalidade = ?, profissao = ?,
                    estado_civil = ?, regime_bens = ?, endereco_completo = ?,
                    nome_conjuge = ?, cpf_conjuge = ?, rg_conjuge = ?
                WHERE id = ?
            """, (c.nome, c.cpf_cnpj, c.rg, c.nacionalidade, c.profissao, c.estado_civil, c.regime_bens, c.endereco_completo, c.nome_conjuge, c.cpf_conjuge, c.rg_conjuge, pessoa_id))
            
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
        return {"error": str(e)}

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
async def importar_vizinho_csv(id: int, file: UploadFile = File(...)):
    import re
    import json
    from database.connection import DatabaseManager

    verificar_levantamento_arquivado(id)
    content_bytes = await file.read()
    filename = file.filename or "vizinho.csv"

    try:
        content_text = content_bytes.decode('utf-8')
    except UnicodeDecodeError:
        content_text = content_bytes.decode('latin-1')

    content_text = content_text.replace('\ufeff', '')
    lines = [line.strip() for line in content_text.splitlines() if line.strip()]

    if not lines:
        raise HTTPException(status_code=400, detail="O arquivo CSV enviado está vazio.")

    cabecalho = lines[0].upper().split(';')
    
    # 1. CASO DE VÉRTICES (CVS vertices.csv)
    if 'CODIGO' in cabecalho and 'GEOMETRIA_WKT' in cabecalho and 'TIPO_VERTICE' in cabecalho:
        try:
            idx_qrcode = cabecalho.index('QRCODE')
            idx_codigo = cabecalho.index('CODIGO')
            idx_metodo = cabecalho.index('METODO_POSICIONAMENTO')
            idx_tipo = cabecalho.index('TIPO_VERTICE')
            idx_x = cabecalho.index('X')
            idx_y = cabecalho.index('Y')
            idx_z = cabecalho.index('Z')
            idx_wkt = cabecalho.index('GEOMETRIA_WKT')
            
            idx_sigma_x = cabecalho.index('SIGMA_X') if 'SIGMA_X' in cabecalho else -1
            idx_sigma_y = cabecalho.index('SIGMA_Y') if 'SIGMA_Y' in cabecalho else -1
            idx_sigma_z = cabecalho.index('SIGMA_Z') if 'SIGMA_Z' in cabecalho else -1
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=f"Colunas obrigatórias ausentes no CSV: {ve}")

        pontos_detetados = []
        qrcode_imovel = None

        wkt_regex = re.compile(r"POINT\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)", re.IGNORECASE)

        for line in lines[1:]:
            parts = line.split(';')
            if len(parts) <= max(idx_codigo, idx_wkt):
                continue
            
            qrcode = parts[idx_qrcode].strip()
            if not qrcode_imovel and qrcode:
                qrcode_imovel = qrcode
                
            vertice = parts[idx_codigo].strip()
            match = re.match(r"^([A-Z0-9_]{3,10})-(M|P|V)-(\d+)$", vertice, re.IGNORECASE)
            if not match:
                continue
                
            tipo = match.group(2).upper()
            num = int(match.group(3))

            def parse_float(val):
                if not val: return 0.0
                try:
                    return float(val.replace(',', '.').strip())
                except:
                    return 0.0

            este = parse_float(parts[idx_x])
            norte = parse_float(parts[idx_y])
            altitude = parse_float(parts[idx_z])
            
            sigma_e = parse_float(parts[idx_sigma_x]) if idx_sigma_x != -1 else 0.0
            sigma_n = parse_float(parts[idx_sigma_y]) if idx_sigma_y != -1 else 0.0
            sigma_z = parse_float(parts[idx_sigma_z]) if idx_sigma_z != -1 else 0.0
            
            metodo = parts[idx_metodo].strip()
            
            wkt_str = parts[idx_wkt].strip()
            wkt_match = wkt_regex.search(wkt_str)
            lat, lon = None, None
            if wkt_match:
                lon = float(wkt_match.group(1))
                lat = float(wkt_match.group(2))

            pontos_detetados.append({
                "tipo_ponto": tipo,
                "numero": num,
                "codigo_completo": vertice,
                "norte": norte,
                "este": este,
                "altitude": altitude,
                "lat": lat,
                "lon": lon,
                "sigma_n": sigma_n,
                "sigma_e": sigma_e,
                "sigma_z": sigma_z,
                "metodo_posicionamento": metodo
            })

        if not qrcode_imovel:
            qrcode_imovel = f"CSV_{os.path.splitext(filename)[0]}"

        if not pontos_detetados:
            raise HTTPException(status_code=400, detail="Nenhum ponto válido no formato 'AAA-T-NNNN' encontrado no arquivo CSV de vértices.")

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
                    nome_propriedade = row_conf["nome_propriedade"]
                    nome_detentor = row_conf["nome"]
                else:
                    nome_detentor = f"Vizinho SIGEF - {qrcode_imovel[:8]}"
                    nome_propriedade = "Propriedade Vizinha"
                    
                    # 1. Cria a pessoa correspondente
                    cursor.execute("""
                        INSERT INTO pessoas (nome) VALUES (?)
                    """, (nome_detentor,))
                    pessoa_id = cursor.lastrowid
                    
                    # 2. Cria o confrontante
                    cursor.execute(
                        """
                        INSERT INTO confrontantes (pessoa_id, levantamento_id, nome_propriedade, codigo_incra_imovel)
                        VALUES (?, ?, ?, ?)
                        """,
                        (pessoa_id, id, nome_propriedade, qrcode_imovel)
                    )
                    confrontante_id = cursor.lastrowid

                cursor.execute(
                    "DELETE FROM pontos WHERE levantamento_id = ? AND confrontante_id = ? AND ponto_vizinho = 1",
                    (id, confrontante_id)
                )

                for pt in pontos_detetados:
                    dados_json = json.dumps({
                        "tipo_limite": "Limite de Propriedade",
                        "origem": "CSV SIGEF"
                    })
                    
                    cursor.execute(
                        """
                        INSERT INTO pontos (
                            levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt,
                            n_original, e_original, alt_original, sigma_n, sigma_e, sigma_z,
                            sigma_lat, sigma_lon, sigma_alt, status_ponto, metodo_posicionamento,
                            arquivo_origem, origem_homologada, confrontante_id, ponto_vizinho, dados_vizinho_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            id, None, pt["codigo_completo"], pt["tipo_ponto"], pt["lat"], pt["lon"], pt["altitude"],
                            pt["norte"], pt["este"], pt["altitude"], pt["sigma_n"], pt["sigma_e"], pt["sigma_z"],
                            pt["sigma_n"], pt["sigma_e"], pt["sigma_z"], "CORRIGIDO", pt["metodo_posicionamento"],
                            filename, 0, confrontante_id, 1, dados_json
                        )
                    )

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
                "mensagem": f"Importação concluída: {len(pontos_detetados)} pontos do vizinho '{prop_exibida}' importados."
            }
        except Exception as e_db:
            logging.getLogger(__name__).error(f"Erro ao salvar pontos CSV no banco: {e_db}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Erro ao persistir informações no banco: {str(e_db)}")

    # 2. CASO DE POLÍGONO (CVS poligono.csv)
    elif 'QRCODE' in cabecalho and 'NOME' in cabecalho and 'GEOMETRIA_WKT' in cabecalho:
        try:
            idx_qrcode = cabecalho.index('QRCODE')
            idx_nome = cabecalho.index('NOME')
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=f"Estrutura de arquivo de polígono inválida: {ve}")

        if len(lines) < 2:
            raise HTTPException(status_code=400, detail="Arquivo de polígono sem linhas de dados.")

        parts = lines[1].split(';')
        if len(parts) <= max(idx_qrcode, idx_nome):
            raise HTTPException(status_code=400, detail="Linha de dados de polígono truncada ou inválida.")

        qrcode_imovel = parts[idx_qrcode].strip()
        nome_propriedade = parts[idx_nome].strip()

        if not qrcode_imovel or not nome_propriedade:
            raise HTTPException(status_code=400, detail="Dados de QRCODE ou NOME ausentes no CSV do polígono.")

        try:
            with DatabaseManager() as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT c.id, p.nome, c.pessoa_id FROM confrontantes c
                    JOIN pessoas p ON c.pessoa_id = p.id
                    WHERE c.levantamento_id = ? AND c.codigo_incra_imovel = ?
                """, (id, qrcode_imovel))
                row_conf = cursor.fetchone()
                
                if row_conf:
                    confrontante_id = row_conf["id"]
                    novo_nome = row_conf["nome"]
                    if row_conf["nome"].startswith("Vizinho SIGEF -"):
                        novo_nome = f"Proprietário de {nome_propriedade}"
                        
                    # Atualiza a tabela pessoas
                    cursor.execute(
                        "UPDATE pessoas SET nome = ? WHERE id = ?",
                        (novo_nome, row_conf["pessoa_id"])
                    )
                    # Atualiza a tabela confrontantes
                    cursor.execute(
                        "UPDATE confrontantes SET nome_propriedade = ? WHERE id = ?",
                        (nome_propriedade, confrontante_id)
                    )
                else:
                    novo_nome = f"Proprietário de {nome_propriedade}"
                    
                    # 1. Cria a pessoa correspondente
                    cursor.execute("""
                        INSERT INTO pessoas (nome) VALUES (?)
                    """, (novo_nome,))
                    pessoa_id = cursor.lastrowid
                    
                    # 2. Cria o confrontante
                    cursor.execute(
                        """
                        INSERT INTO confrontantes (pessoa_id, levantamento_id, nome_propriedade, codigo_incra_imovel)
                        VALUES (?, ?, ?, ?)
                        """,
                        (pessoa_id, id, nome_propriedade, qrcode_imovel)
                    )
                    confrontante_id = cursor.lastrowid

                conn.commit()

            return {
                "success": True,
                "confrontante": {
                    "id": confrontante_id,
                    "nome_propriedade": nome_propriedade
                },
                "mensagem": f"Propriedade do vizinho identificada com sucesso: '{nome_propriedade}'."
            }
        except Exception as e_db:
            logging.getLogger(__name__).error(f"Erro ao salvar polígono no banco: {e_db}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Erro ao atualizar metadados da propriedade: {str(e_db)}")

    else:
        raise HTTPException(
            status_code=400, 
            detail="Estrutura de CSV do SIGEF não reconhecida. Certifique-se de enviar o arquivo de vértices (CVS vertices.csv) ou de polígono (CVS poligono.csv)."
        )

@router.get("/levantamentos/{id}/pontos-vizinhos")
def get_pontos_vizinhos(id: int):
    try:
        query = """
            SELECT p.id, p.levantamento_id, p.nome_vertice, p.tipo_ponto, p.lat, p.lon, p.alt,
                   p.sigma_lat, p.sigma_lon, p.sigma_alt, p.confrontante_id, p.dados_vizinho_json,
                   pe.nome as nome_confrontante, c.nome_propriedade
            FROM pontos p
            JOIN confrontantes c ON p.confrontante_id = c.id
            JOIN pessoas pe ON c.pessoa_id = pe.id
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