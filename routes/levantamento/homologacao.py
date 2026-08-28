"""
routes/levantamento/homologacao.py — Homologação de Pontos (INCRA/SIGEF) e Banco de Pontos
"""
import re
import io
import csv
import logging
import zipfile
import xml.etree.ElementTree as ET
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from utils.transformer_cache import get_transformer

from database.connection import DatabaseManager, execute_query
from routes.deps import verificar_levantamento_arquivado, extrair_nome_confrontante_limpo

router = APIRouter(tags=["Homologação de Pontos & Banco de Pontos"])

from utils.geodesia_parser import (
    REGEX_MARCO_SIGEF,
    REGEX_MARCO_SEM_PREFIXO,
    extract_codigo_parts,
    parse_num_robust,
    parse_dms_robust,
    resolver_coordenadas_robust,
    detect_csv_delimiter,
)

# ── Modelos ────────────────────────────────────────────────────────────────────

class AssociarPlanilhaPayload(BaseModel):
    planilha_origem: str
    matricula_id: Optional[int] = None

# ── Funções Auxiliares de Parsing ──────────────────────────────────────────────

def parse_csv_sigef(content: bytes, fuso_utm: int):
    text = content.decode("utf-8", errors="ignore").replace('\ufeff', '')
    lines = text.splitlines()
    
    # Detecção Inteligente de Delimitador (Incluindo TAB)
    delimiter = detect_csv_delimiter(lines[0]) if lines else ';'
    reader = csv.reader(lines, delimiter=delimiter)
    
    pontos, limites, ordem = {}, {}, []
    headers = []
    
    for row in reader:
        if not row: continue
        if not headers and any(str(h).strip().upper() in ['CODIGO', 'DO_VERTICE', 'GEOMETRIA_WKT'] for h in row):
            headers = [str(h).strip().upper() for h in row]
            continue
            
        if headers:
            def get_val(col_name):
                if col_name in headers:
                    idx = headers.index(col_name)
                    if idx < len(row): return str(row[idx]).strip()
                return ""
            
            if 'CODIGO' in headers and ('X' in headers or 'LONGITUDE' in headers):
                tipo, num, vertice = extract_codigo_parts(get_val('CODIGO'))
                if not vertice: continue
                
                lat, lon, este, norte = resolver_coordenadas_robust(get_val('X') or get_val('LONGITUDE'), get_val('Y') or get_val('LATITUDE'), fuso_utm)
                if lat is None or lon is None or este is None or norte is None:
                    continue
                pontos[vertice] = {
                    "tipo_ponto": tipo, "numero": num, "codigo_completo": vertice,
                    "norte": norte, "este": este, "altitude": parse_num_robust(get_val('Z')),
                    "lat": lat, "lon": lon,
                    "sigma_e": parse_num_robust(get_val('SIGMA_X')),
                    "sigma_n": parse_num_robust(get_val('SIGMA_Y')),
                    "sigma_z": parse_num_robust(get_val('SIGMA_Z')),
                    "metodo_posicionamento": get_val('METODO_POSICIONAMENTO'),
                    "tipo_limite": get_val('LADO'),
                    "cns_confrontante": "", "matricula_confrontante": "", "confrontante_descritivo": ""
                }
                ordem.append(vertice)
                
            elif 'DO_VERTICE' in headers and 'CONFRONTANTE_DESC' in headers:
                _, _, do_vertice = extract_codigo_parts(get_val('DO_VERTICE'))
                if do_vertice:
                    limites[do_vertice] = {
                        "confrontante_descritivo": get_val('CONFRONTANTE_DESC'),
                        "tipo_limite": get_val('TIPO')
                    }
                    
    # Fallback puramente regex para arquivos despadronizados
    if not pontos and not limites:
        matches = REGEX_MARCO_SIGEF.findall(text)
        matches_sem = REGEX_MARCO_SEM_PREFIXO.findall(text)
        for m in matches + matches_sem:
            if len(m) == 3: vertice = f"{m[0].upper()}-{m[1].upper()}-{int(m[2]):04d}"
            else: vertice = f"{m[0].upper()}-{int(m[1]):04d}"
            tipo = m[1].upper() if len(m) == 3 else m[0].upper()
            num = int(m[2]) if len(m) == 3 else int(m[1])
            
            if vertice not in pontos:
                pontos[vertice] = {
                    "tipo_ponto": tipo, "numero": num, "codigo_completo": vertice,
                    "norte": None, "este": None, "altitude": None, "lat": None, "lon": None,
                    "sigma_e": None, "sigma_n": None, "sigma_z": None,
                    "metodo_posicionamento": None, "tipo_limite": None,
                    "cns_confrontante": None, "matricula_confrontante": None, "confrontante_descritivo": None
                }
                ordem.append(vertice)
                
    return pontos, limites, ordem

# ── Motor de Persistência Otimizado (Bulk Insert) ──────────────────────────────

def persistir_pontos_homologados(cursor, id_levantamento: int, matricula_id: Optional[int], profissional_id: int, pontos_ordenados: list, nome_planilha: str, skip_banco: bool = False):
    from services.gestores.confrontante_manager import resolver_confrontantes_planilha
    mapa_vertices_confrontante_id = resolver_confrontantes_planilha(id_levantamento, pontos_ordenados, cursor)
    
    banco_pontos_data = []
    pontos_data = []
    
    for idx, p in enumerate(pontos_ordenados):
        idx_ordem = idx + 1
        banco_pontos_data.append((
            profissional_id, id_levantamento, matricula_id, p.get("tipo_ponto"), p.get("numero"), p.get("codigo_completo"),
            p.get("norte"), p.get("este"), p.get("altitude"), p.get("lat"), p.get("lon"),
            p.get("sigma_n"), p.get("sigma_e"), p.get("sigma_z"),
            p.get("metodo_posicionamento"), p.get("tipo_limite"),
            p.get("cns_confrontante"), p.get("matricula_confrontante"), p.get("confrontante_descritivo"),
            nome_planilha
        ))
        
        if matricula_id:
            pontos_data.append((
                id_levantamento, matricula_id, p.get("codigo_completo"), p.get("tipo_ponto"), p.get("lat"), p.get("lon"), p.get("altitude"),
                p.get("sigma_e"), p.get("sigma_n"), p.get("sigma_z"), idx_ordem, 'CORRIGIDO', 'CORRIGIDO', p.get("metodo_posicionamento"), nome_planilha, 1
            ))

    if not skip_banco and banco_pontos_data:
        cursor.executemany(
            """
            INSERT OR IGNORE INTO banco_pontos 
            (profissional_id, levantamento_id, matricula_id, tipo_ponto, numero, codigo_completo,
             norte, este, altitude, lat, lon, sigma_n, sigma_e, sigma_z,
             metodo_posicionamento, tipo_limite, cns_confrontante, matricula_confrontante, confrontante_descritivo,
             planilha_origem) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, banco_pontos_data
        )
    
    if matricula_id and pontos_data:
        cursor.executemany(
            """
            INSERT INTO pontos 
            (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, 
             sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, status_ponto, status_correcao, metodo_posicionamento, arquivo_origem, origem_homologada)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(levantamento_id, matricula_id, nome_vertice, tipo_ponto) DO UPDATE SET
                lat = excluded.lat,
                lon = excluded.lon,
                alt = excluded.alt,
                sigma_lat = excluded.sigma_lat,
                sigma_lon = excluded.sigma_lon,
                sigma_alt = excluded.sigma_alt,
                ordem_caminhamento = excluded.ordem_caminhamento,
                status_ponto = excluded.status_ponto,
                status_correcao = excluded.status_correcao,
                metodo_posicionamento = excluded.metodo_posicionamento,
                arquivo_origem = excluded.arquivo_origem,
                origem_homologada = excluded.origem_homologada
            """, pontos_data
        )
        
        cursor.execute(
            "SELECT id, nome_vertice FROM pontos WHERE levantamento_id = ? AND matricula_id = ? AND origem_homologada = 1", 
            (id_levantamento, matricula_id)
        )
        mapa_db_ids = {row["nome_vertice"]: row["id"] for row in cursor.fetchall()}
        
        ids_desta_planilha = [mapa_db_ids[p["codigo_completo"]] for p in pontos_ordenados if p.get("codigo_completo") in mapa_db_ids]
        
        if len(pontos_ordenados) >= 2 and ids_desta_planilha:
            placeholders = ",".join("?" for _ in ids_desta_planilha)
            cursor.execute(
                f"""DELETE FROM segmentos 
                   WHERE levantamento_id = ? AND matricula_id = ? AND origem_homologada = 1 
                     AND (ponto_inicio_id IN ({placeholders}) OR ponto_fim_id IN ({placeholders}))""",
                [id_levantamento, matricula_id] + ids_desta_planilha + ids_desta_planilha
            )
            
            segmentos_data = []
            N_pts = len(pontos_ordenados)
            for i in range(N_pts):
                p_ini = pontos_ordenados[i]
                p_fim = pontos_ordenados[(i + 1) % N_pts]
                conf_id = mapa_vertices_confrontante_id.get(p_ini.get("codigo_completo"))
                
                id_ini = mapa_db_ids.get(p_ini.get("codigo_completo"))
                id_fim = mapa_db_ids.get(p_fim.get("codigo_completo"))
                
                if id_ini and id_fim:
                    segmentos_data.append((
                        id_levantamento, matricula_id, id_ini, id_fim, conf_id,
                        p_ini.get("tipo_limite") or "Limite Não Definido", p_ini.get("metodo_posicionamento") or "PG1", 1
                    ))
                    
            if segmentos_data:
                cursor.executemany(
                    """
                    INSERT INTO segmentos
                    (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id,
                     tipo_limite_sigef, metodo_posicionamento_sigef, origem_homologada)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, segmentos_data
                )
                
    return len(pontos_ordenados)

# ── Rotas ──────────────────────────────────────────────────────────────────────

@router.post("/levantamentos/{id}/analisar-planilha-abas")
async def analisar_planilha_abas(id: int, file: UploadFile = File(...)):
    verificar_levantamento_arquivado(id)
    try:
        content = await file.read()
        filename = file.filename.lower() if file.filename else ""
        is_ods = filename.endswith(".ods") or content.startswith(b"PK\x03\x04")
        abas_detectadas = []
        
        if is_ods:
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as zip_ref:
                    if 'content.xml' in zip_ref.namelist():
                        xml_data = zip_ref.read('content.xml')
                        ns = {'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'}
                        root = ET.fromstring(xml_data)
                        
                        tables = root.findall('.//table:table', ns)
                        for table in tables:
                            table_name = table.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}name') or ""
                            pontos_count = 0
                            rows = table.findall('.//table:table-row', ns)
                            for row in rows:
                                cells = row.findall('.//table:table-cell', ns)
                                if cells:
                                    p_elements = cells[0].findall('.//text:p', ns)
                                    cell_text = "".join([p.text for p in p_elements if p.text]).strip()
                                    if cell_text and (REGEX_MARCO_SIGEF.search(cell_text) or REGEX_MARCO_SEM_PREFIXO.search(cell_text)):
                                        pontos_count += 1
                                            
                            if pontos_count > 0:
                                abas_detectadas.append({"nome": table_name, "qtd_pontos": pontos_count})
            except Exception as e_ods:
                logging.getLogger(__name__).error(f"Erro ao analisar ODS: {e_ods}")
                
        if not is_ods or (is_ods and not abas_detectadas):
            text = content.decode("utf-8", errors="ignore")
            total_pontos = len(REGEX_MARCO_SIGEF.findall(text)) + len(REGEX_MARCO_SEM_PREFIXO.findall(text))
            if total_pontos > 0:
                abas_detectadas.append({"nome": "Arquivo Único", "qtd_pontos": total_pontos})
                
        return {"sucesso": True, "is_ods": is_ods, "filename": file.filename, "abas": abas_detectadas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao analisar planilha: {str(e)}")

@router.post("/levantamentos/{id}/importar-pontos-aprovados-lote")
async def importar_pontos_aprovados_lote(id: int, files: list[UploadFile] = File(...), mapeamento: str = Query(...), fuso_utm: int = Query(22, description="Fuso UTM padrão")):
    verificar_levantamento_arquivado(id)
    try:
        import json
        map_dados = json.loads(mapeamento)
        
        lev = execute_query("SELECT profissional_id FROM levantamentos WHERE id = ?", params=(id,), fetch_one=True)
        if not lev: raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
        profissional_id = lev["profissional_id"]
        
        prof = execute_query("SELECT codigo_credenciado FROM profissionais WHERE id = ?", params=(profissional_id,), fetch_one=True)
        codigo_credenciado = prof["codigo_credenciado"] if prof else None
        if not codigo_credenciado:
            raise HTTPException(status_code=400, detail="Responsável Técnico sem Código Credenciado no INCRA.")
            
        planilhas_para_importar = []
        
        for file in files:
            filename = file.filename
            content = await file.read()
            is_ods = filename.lower().endswith(".ods") or content.startswith(b"PK\x03\x04")
            
            if is_ods:
                try:
                    with zipfile.ZipFile(io.BytesIO(content)) as zip_ref:
                        if 'content.xml' in zip_ref.namelist():
                            xml_data = zip_ref.read('content.xml')
                            ns = {'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'}
                            root = ET.fromstring(xml_data)
                            
                            tables = root.findall('.//table:table', ns)
                            for table in tables:
                                table_name = table.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}name') or ""
                                map_key = f"{filename}#{table_name}"
                                if map_key in map_dados and map_dados[map_key]:
                                    mat_id = int(map_dados[map_key])
                                    nome_planilha = table_name if filename.lower().replace('.ods', '') in table_name.lower() else f"{filename} - {table_name}"
                                    
                                    pontos_aba = {}
                                    ordem_aba = []
                                    limites_aba = {}
                                    
                                    rows = table.findall('.//table:table-row', ns)
                                    for row in rows:
                                        cells = row.findall('.//table:table-cell', ns)
                                        cell_texts = []
                                        for cell in cells:
                                            repeated = cell.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated')
                                            p_elements = cell.findall('.//text:p', ns)
                                            cell_text = "".join([p.text for p in p_elements if p.text])
                                            if not cell_text: cell_text = cell.get('{urn:oasis:names:tc:opendocument:xmlns:office:1.0}value') or ""
                                            count = int(repeated) if repeated else 1
                                            if count > 30: count = 1
                                            cell_texts.extend([cell_text] * count)
                                            
                                        if len(cell_texts) >= 7:
                                            tipo, num, vertice = extract_codigo_parts(cell_texts[0])
                                            if vertice:
                                                lat, lon, este, norte = resolver_coordenadas_robust(cell_texts[1], cell_texts[3], fuso_utm)
                                                if lat is None or lon is None or este is None or norte is None:
                                                    continue
                                                p_data = {
                                                    "tipo_ponto": tipo, "numero": num, "codigo_completo": vertice,
                                                    "norte": norte, "este": este, "altitude": parse_num_robust(cell_texts[5]),
                                                    "lat": lat, "lon": lon,
                                                    "sigma_e": parse_num_robust(cell_texts[2]), "sigma_n": parse_num_robust(cell_texts[4]), "sigma_z": parse_num_robust(cell_texts[6]),
                                                    "metodo_posicionamento": str(cell_texts[7]).strip() if len(cell_texts) > 7 else "", 
                                                    "tipo_limite": str(cell_texts[8]).strip() if len(cell_texts) > 8 else "",
                                                    "cns_confrontante": str(cell_texts[9]).strip() if len(cell_texts) > 9 else "", 
                                                    "matricula_confrontante": str(cell_texts[10]).strip() if len(cell_texts) > 10 else "", 
                                                    "confrontante_descritivo": str(cell_texts[11]).strip() if len(cell_texts) > 11 else ""
                                                }
                                                if vertice not in pontos_aba:
                                                    ordem_aba.append(vertice)
                                                    pontos_aba[vertice] = p_data
                                                elif p_data["lat"] is not None and pontos_aba[vertice]["lat"] is None:
                                                    pontos_aba[vertice].update(p_data)
                                                    
                                    if pontos_aba:
                                        planilhas_para_importar.append({
                                            "nome_planilha": nome_planilha,
                                            "mat_id": mat_id,
                                            "pontos_dict": pontos_aba,
                                            "ordem": ordem_aba,
                                            "limites_dict": limites_aba
                                        })
                except Exception as e_ods:
                    logging.getLogger(__name__).error(f"Erro ao processar ODS em lote: {e_ods}")
                    raise HTTPException(status_code=400, detail=f"Erro ao processar ODS '{filename}': {str(e_ods)}")
                    
            else:
                map_key = f"{filename}#Arquivo Único"
                if map_key in map_dados and map_dados[map_key]:
                    mat_id = int(map_dados[map_key])
                    nome_planilha = filename
                    
                    p_dict, l_dict, o_list = parse_csv_sigef(content, fuso_utm)
                    if p_dict:
                        planilhas_para_importar.append({
                            "nome_planilha": nome_planilha,
                            "mat_id": mat_id,
                            "pontos_dict": p_dict,
                            "ordem": o_list,
                            "limites_dict": l_dict
                        })

        # Processamento e Salvamento Isolado por Planilha/Perímetro
        total_importados = 0
        mensagens = []
        
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            for item in planilhas_para_importar:
                nome_planilha = item["nome_planilha"]
                mat_id = item["mat_id"]
                p_dict = item["pontos_dict"]
                l_dict = item["limites_dict"]
                o_list = item["ordem"]
                
                for vertice, p_data in p_dict.items():
                    if vertice in l_dict:
                        lim = l_dict[vertice]
                        p_data["confrontante_descritivo"] = lim.get("confrontante_descritivo", p_data.get("confrontante_descritivo"))
                        p_data["tipo_limite"] = lim.get("tipo_limite", p_data.get("tipo_limite"))
                
                pontos_ordenados = [p_dict[v] for v in o_list if v in p_dict]
                if pontos_ordenados:
                    cursor.execute("DELETE FROM banco_pontos WHERE levantamento_id = ? AND planilha_origem = ?", (id, nome_planilha))
                    
                    cursor.execute("SELECT id FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1", (id, nome_planilha))
                    pts_anteriores = [r["id"] for r in cursor.fetchall()]
                    if pts_anteriores:
                        placeholders = ",".join("?" for _ in pts_anteriores)
                        cursor.execute(f"DELETE FROM segmentos WHERE ponto_inicio_id IN ({placeholders}) OR ponto_fim_id IN ({placeholders})", pts_anteriores + pts_anteriores)
                        cursor.execute(f"DELETE FROM pontos WHERE id IN ({placeholders})", pts_anteriores)
                    
                    qtd = persistir_pontos_homologados(cursor, id, mat_id, profissional_id, pontos_ordenados, nome_planilha)
                    total_importados += qtd
                    mensagens.append(f"{nome_planilha} (Mat. {mat_id}): {qtd} pontos")
            
            # Recalcular Contadores INCRA
            for t in ['M', 'P', 'V']:
                cursor.execute("SELECT MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto = ? AND codigo_completo LIKE ?", (profissional_id, t, f"{codigo_credenciado}-%"))
                row_max = cursor.fetchone()
                cursor.execute(f"UPDATE profissionais SET contador_{t.lower()} = ? WHERE id = ?", (row_max["max_num"] if row_max and row_max["max_num"] else 0, profissional_id))
                
            conn.commit()
            
        return {
            "sucesso": True,
            "pontos_importados": total_importados,
            "pontos_adicionados": total_importados,
            "mensagem": f"Importação inteligente concluída com sucesso! " + " | ".join(mensagens)
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro interno ao importar em lote: {str(e)}")

@router.post("/levantamentos/{id}/importar-pontos-aprovados")
async def importar_pontos_aprovados(id: int, file: UploadFile = File(...), matricula_id: Optional[int] = Query(None), fuso_utm: int = Query(22, description="Fuso UTM padrão")):
    verificar_levantamento_arquivado(id)
    try:
        lev = execute_query("SELECT profissional_id FROM levantamentos WHERE id = ?", params=(id,), fetch_one=True)
        if not lev: raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
        profissional_id = lev["profissional_id"]
        
        prof = execute_query("SELECT codigo_credenciado FROM profissionais WHERE id = ?", params=(profissional_id,), fetch_one=True)
        codigo_credenciado = prof["codigo_credenciado"] if prof else None
        if not codigo_credenciado: raise HTTPException(status_code=400, detail="Responsável Técnico não possui Código Credenciado no INCRA.")
        
        filename_raw = file.filename if file.filename else "Planilha Importada"
        content = await file.read()
        filename = filename_raw.lower()
        is_ods = filename.endswith(".ods") or content.startswith(b"PK\x03\x04")
        
        planilhas_para_importar = []
        
        if is_ods:
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as zip_ref:
                    if 'content.xml' in zip_ref.namelist():
                        xml_data = zip_ref.read('content.xml')
                        ns = {'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'}
                        root = ET.fromstring(xml_data)
                        for table in root.findall('.//table:table', ns):
                            table_name = table.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}name') or ""
                            if "perimetro" in table_name.lower():
                                nome_aba = table_name if filename_raw.lower().replace('.ods', '') in table_name.lower() else f"{filename_raw} - {table_name}"
                                pontos_aba = {}
                                ordem_aba = []
                                
                                for row in table.findall('.//table:table-row', ns):
                                    cells = row.findall('.//table:table-cell', ns)
                                    cell_texts = []
                                    for cell in cells:
                                        repeated = cell.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated')
                                        p_elements = cell.findall('.//text:p', ns)
                                        cell_text = "".join([p.text for p in p_elements if p.text])
                                        if not cell_text: cell_text = cell.get('{urn:oasis:names:tc:opendocument:xmlns:office:1.0}value') or ""
                                        count = int(repeated) if repeated else 1
                                        if count > 30: count = 1
                                        cell_texts.extend([cell_text] * count)
                                        
                                    if len(cell_texts) >= 7:
                                        tipo, num, vertice = extract_codigo_parts(cell_texts[0])
                                        if vertice:
                                            lat, lon, este, norte = resolver_coordenadas_robust(cell_texts[1], cell_texts[3], fuso_utm)
                                            if lat is None or lon is None or este is None or norte is None:
                                                continue
                                            if vertice not in pontos_aba: ordem_aba.append(vertice)
                                            pontos_aba[vertice] = {
                                                "tipo_ponto": tipo, "numero": num, "codigo_completo": vertice,
                                                "norte": norte, "este": este, "altitude": parse_num_robust(cell_texts[5]),
                                                "lat": lat, "lon": lon,
                                                "sigma_e": parse_num_robust(cell_texts[2]), "sigma_n": parse_num_robust(cell_texts[4]), "sigma_z": parse_num_robust(cell_texts[6]),
                                                "metodo_posicionamento": cell_texts[7].strip() if len(cell_texts) > 7 else "",
                                                "tipo_limite": cell_texts[8].strip() if len(cell_texts) > 8 else "",
                                                "cns_confrontante": cell_texts[9].strip() if len(cell_texts) > 9 else "",
                                                "matricula_confrontante": cell_texts[10].strip() if len(cell_texts) > 10 else "",
                                                "confrontante_descritivo": cell_texts[11].strip() if len(cell_texts) > 11 else ""
                                            }
                                if pontos_aba:
                                    planilhas_para_importar.append({
                                        "nome_planilha": nome_aba,
                                        "pontos_dict": pontos_aba,
                                        "ordem": ordem_aba,
                                        "limites_dict": {}
                                    })
            except Exception as e_zip:
                logging.getLogger(__name__).error(f"Erro ao processar ODS: {e_zip}")
        else:
            p_dict, l_dict, o_list = parse_csv_sigef(content, fuso_utm)
            if p_dict:
                planilhas_para_importar.append({
                    "nome_planilha": filename_raw,
                    "pontos_dict": p_dict,
                    "ordem": o_list,
                    "limites_dict": l_dict
                })

        if not planilhas_para_importar:
            return {"sucesso": False, "pontos_importados": 0, "mensagem": f"Nenhum ponto válido com o padrão '{codigo_credenciado}-M/P/V-XXXX' foi localizado no arquivo."}

        total_qtd = 0
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            for item in planilhas_para_importar:
                nome_planilha = item["nome_planilha"]
                p_dict = item["pontos_dict"]
                l_dict = item["limites_dict"]
                o_list = item["ordem"]
                
                for v, p in p_dict.items():
                    if v in l_dict:
                        p["confrontante_descritivo"] = l_dict[v].get("confrontante_descritivo", p.get("confrontante_descritivo"))
                        p["tipo_limite"] = l_dict[v].get("tipo_limite", p.get("tipo_limite"))
                        
                pontos_ordenados = [p_dict[v] for v in o_list if v in p_dict]
                if pontos_ordenados:
                    cursor.execute("DELETE FROM banco_pontos WHERE levantamento_id = ? AND planilha_origem = ?", (id, nome_planilha))
                    
                    cursor.execute("SELECT id FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1", (id, nome_planilha))
                    pts_anteriores = [r["id"] for r in cursor.fetchall()]
                    if pts_anteriores:
                        placeholders = ",".join("?" for _ in pts_anteriores)
                        cursor.execute(f"DELETE FROM segmentos WHERE ponto_inicio_id IN ({placeholders}) OR ponto_fim_id IN ({placeholders})", pts_anteriores + pts_anteriores)
                        cursor.execute(f"DELETE FROM pontos WHERE id IN ({placeholders})", pts_anteriores)
                        
                    qtd = persistir_pontos_homologados(cursor, id, matricula_id, profissional_id, pontos_ordenados, nome_planilha)
                    total_qtd += qtd
            
            for t in ['M', 'P', 'V']:
                cursor.execute("SELECT MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto = ? AND codigo_completo LIKE ?", (profissional_id, t, f"{codigo_credenciado}-%"))
                row_max = cursor.fetchone()
                cursor.execute(f"UPDATE profissionais SET contador_{t.lower()} = ? WHERE id = ?", (row_max["max_num"] if row_max and row_max["max_num"] else 0, profissional_id))
                
            conn.commit()
            
        return {
            "sucesso": True,
            "pontos_importados": total_qtd,
            "pontos_adicionados": total_qtd,
            "mensagem": f"Processamento concluído. {total_qtd} vértices do credenciamento '{codigo_credenciado}' consolidados com sucesso em perímetros independentes."
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro interno ao importar pontos homologados: {str(e)}")

@router.get("/levantamentos/{id}/planilhas-homologadas")
def get_planilhas_homologadas(id: int):
    try:
        rows = execute_query(
            "SELECT planilha_origem, COUNT(*) as qtd_pontos, matricula_id FROM banco_pontos WHERE levantamento_id = ? AND planilha_origem IS NOT NULL GROUP BY planilha_origem",
            params=(id,), fetch_all=True
        )
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao listar planilhas homologadas: {str(e)}")

@router.post("/levantamentos/{id}/planilhas-homologadas/associar-matricula")
def associar_planilha_matricula(id: int, payload: AssociarPlanilhaPayload):
    verificar_levantamento_arquivado(id)
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            cursor.execute("SELECT id FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1", (id, payload.planilha_origem))
            ponto_ids = [r["id"] for r in cursor.fetchall()]
            
            if ponto_ids:
                placeholders = ",".join("?" for _ in ponto_ids)
                cursor.execute(f"DELETE FROM segmentos WHERE ponto_inicio_id IN ({placeholders}) OR ponto_fim_id IN ({placeholders})", ponto_ids + ponto_ids)
                cursor.execute("DELETE FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1", (id, payload.planilha_origem))

            cursor.execute("UPDATE banco_pontos SET matricula_id = ? WHERE levantamento_id = ? AND planilha_origem = ?", (payload.matricula_id, id, payload.planilha_origem))

            if payload.matricula_id:
                cursor.execute(
                    """
                    SELECT codigo_completo, tipo_ponto, numero, norte, este, altitude, lat, lon,
                           sigma_n, sigma_e, sigma_z, metodo_posicionamento, tipo_limite,
                           cns_confrontante, matricula_confrontante, confrontante_descritivo
                    FROM banco_pontos WHERE levantamento_id = ? AND planilha_origem = ? ORDER BY id ASC
                    """, (id, payload.planilha_origem)
                )
                pontos_banco = [dict(r) for r in cursor.fetchall()]
                if pontos_banco:
                    persistir_pontos_homologados(cursor, id, payload.matricula_id, 0, pontos_banco, payload.planilha_origem, skip_banco=True)
                        
            conn.commit()
        return {"sucesso": True, "mensagem": f"Planilha '{payload.planilha_origem}' associada com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao associar planilha: {str(e)}")

@router.delete("/levantamentos/{id}/planilhas-homologadas")
def deletar_planilha_homologada(id: int, planilha_origem: str = Query(...)):
    verificar_levantamento_arquivado(id)
    try:
        lev = execute_query(
            "SELECT l.profissional_id, p.codigo_credenciado FROM levantamentos l JOIN profissionais p ON l.profissional_id = p.id WHERE l.id = ?",
            params=(id,), fetch_one=True
        )
        if not lev: raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
        profissional_id, codigo_credenciado = lev["profissional_id"], lev["codigo_credenciado"] or ""
        
        execute_query("DELETE FROM banco_pontos WHERE levantamento_id = ? AND planilha_origem = ?", params=(id, planilha_origem), commit=True)
        
        pontos_da_planilha = execute_query("SELECT DISTINCT matricula_id FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1", params=(id, planilha_origem), fetch_all=True)
        matriculas_afetadas = [r["matricula_id"] for r in (pontos_da_planilha or []) if r["matricula_id"]]
        
        execute_query("DELETE FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1", params=(id, planilha_origem), commit=True)
        if matriculas_afetadas:
            placeholders = ",".join(["?"] * len(matriculas_afetadas))
            execute_query(f"DELETE FROM segmentos WHERE levantamento_id = ? AND matricula_id IN ({placeholders})", params=tuple([id] + list(matriculas_afetadas)), commit=True)
        
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            for t in ['M', 'P', 'V']:
                cursor.execute("SELECT MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto = ? AND codigo_completo LIKE ?", (profissional_id, t, f"{codigo_credenciado}-%"))
                row_max = cursor.fetchone()
                cursor.execute(f"UPDATE profissionais SET contador_{t.lower()} = ? WHERE id = ?", (row_max["max_num"] if row_max and row_max["max_num"] else 0, profissional_id))
            conn.commit()
            
        return {"sucesso": True, "mensagem": f"Planilha '{planilha_origem}' e seus pontos foram excluídos com sucesso."}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao excluir planilha homologada: {str(e)}")

@router.get("/levantamentos/{id}/pontos-sugeridos")
def get_pontos_sugeridos_levantamento(id: int):
    try:
        row = execute_query("SELECT profissional_id FROM levantamentos WHERE id = ?", params=(id,), fetch_one=True)
        if not row: raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
        prof_id = row["profissional_id"]
        
        prof = execute_query("SELECT codigo_credenciado FROM profissionais WHERE id = ?", params=(prof_id,), fetch_one=True)
        codigo_cred = prof["codigo_credenciado"] if prof else ""
        
        sugestoes = {}
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT tipo_ponto, MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto IN ('M', 'P', 'V') GROUP BY tipo_ponto", (prof_id,))
            max_nums = {'M': 0, 'P': 0, 'V': 0}
            for row in cursor.fetchall():
                if row["tipo_ponto"] in max_nums: max_nums[row["tipo_ponto"]] = row["max_num"] if row["max_num"] else 0

            for t in ['M', 'P', 'V']:
                proximo = max_nums[t] + 1
                sugestoes[t] = {
                    "proximo_numero": proximo,
                    "codigo_sugerido": f"{codigo_cred}-{t}-{proximo:04d}" if codigo_cred else f"{t}-{proximo}"
                }
            
        return {"profissional_id": prof_id, "codigo_credenciado": codigo_cred, "sugestoes": sugestoes}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{id}/banco-pontos")
def get_banco_pontos_levantamento(id: int):
    try:
        rows = execute_query(
            """
            SELECT id, tipo_ponto, numero, codigo_completo, norte, este, altitude, lat, lon,
                   sigma_n, sigma_e, sigma_z, metodo_posicionamento, tipo_limite,
                   cns_confrontante, matricula_confrontante, confrontante_descritivo, matricula_id
            FROM banco_pontos WHERE levantamento_id = ? ORDER BY id ASC
            """, params=(id,), fetch_all=True
        )
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{id}/banco-pontos/auditoria")
def get_auditoria_banco_pontos(id: int):
    try:
        rows = execute_query(
            """
            SELECT id, tipo_ponto, numero, codigo_completo, norte, este, altitude,
                   metodo_posicionamento, tipo_limite, matricula_confrontante,
                   confrontante_descritivo, matricula_id, planilha_origem, created_at
            FROM banco_pontos WHERE levantamento_id = ? ORDER BY planilha_origem ASC, tipo_ponto ASC, numero ASC
            """, params=(id,), fetch_all=True
        )
        pontos = [dict(r) for r in rows]
        
        from collections import Counter
        contagem_codigos = Counter(p["codigo_completo"] for p in pontos)
        codigos_duplicados = {cod for cod, qtd in contagem_codigos.items() if qtd > 1}

        grupos = {}
        for p in pontos:
            p["is_duplicado"] = p["codigo_completo"] in codigos_duplicados
            origem = p["planilha_origem"] or "Sem arquivo (manual)"
            if origem not in grupos:
                grupos[origem] = {"planilha_origem": origem, "total": 0, "pontos": [], "tem_duplicata": False}
            grupos[origem]["pontos"].append(p)
            grupos[origem]["total"] += 1
            if p["is_duplicado"]: grupos[origem]["tem_duplicata"] = True

        return {"total_pontos": len(pontos), "total_grupos": len(grupos), "total_duplicatas": len(codigos_duplicados), "grupos": list(grupos.values())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/pontos-homologados")
def get_pontos_homologados_matricula(id: int, matricula_id: int):
    try:
        query = """
            SELECT p.id, p.levantamento_id, p.matricula_id, p.nome_vertice as codigo_completo,
                   p.tipo_ponto, p.lat, p.lon, p.alt as altitude, p.sigma_lat, p.sigma_lon, p.sigma_alt,
                   p.ordem_caminhamento, p.status_ponto, p.metodo_posicionamento, p.arquivo_origem
            FROM pontos p WHERE p.levantamento_id = ? AND p.matricula_id = ? AND p.origem_homologada = 1
            ORDER BY CASE WHEN p.ordem_caminhamento IS NULL OR p.ordem_caminhamento = 0 THEN 999999 ELSE p.ordem_caminhamento END ASC, p.id ASC
        """
        return [dict(r) for r in execute_query(query, params=(id, matricula_id), fetch_all=True)]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{id}/pontos-homologados")
def get_todos_pontos_homologados_levantamento(id: int):
    try:
        query = """
            SELECT p.id, p.levantamento_id, p.matricula_id, p.nome_vertice as codigo_completo,
                   p.tipo_ponto, p.lat, p.lon, p.alt as altitude, p.sigma_lat, p.sigma_lon, p.sigma_alt,
                   p.ordem_caminhamento, p.status_ponto, p.metodo_posicionamento, p.arquivo_origem as planilha_origem
            FROM pontos p WHERE p.levantamento_id = ? AND p.origem_homologada = 1
            ORDER BY p.matricula_id ASC, CASE WHEN p.ordem_caminhamento IS NULL OR p.ordem_caminhamento = 0 THEN 999999 ELSE p.ordem_caminhamento END ASC, p.id ASC
        """
        return [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))