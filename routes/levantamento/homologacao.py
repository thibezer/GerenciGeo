"""
routes/levantamento/homologacao.py — Homologação de Pontos (INCRA/SIGEF) e Banco de Pontos
"""
import re
import io
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

# ── Modelos ────────────────────────────────────────────────────────────────────

class AssociarPlanilhaPayload(BaseModel):
    planilha_origem: str
    matricula_id: Optional[int] = None

# ── Funções Auxiliares de Parsing de Coordenadas e Números ──────────────────────

def parse_num_robust(val):
    """
    Converte uma string numérica formatada (BR ou US, com ou sem separadores de milhar) para float.
    Suporta: '7.344.988,720', '208.822,470', '-24,102244', '7344988.72', '7.344.988.720', etc.
    """
    if val is None:
        return None
    s = str(val).strip().replace('\xa0', '').replace(' ', '')
    if not s:
        return None
    
    # Tentativa direta se for float padrão (ex: "7344988.72" ou "-24.102244")
    try:
        return float(s)
    except ValueError:
        pass
    
    # Se contém ambos vírgula e ponto:
    if ',' in s and '.' in s:
        # Formato BR/PT: "7.344.988,720" -> ponto é milhar, vírgula é decimal
        if s.rfind(',') > s.rfind('.'):
            s = s.replace('.', '').replace(',', '.')
        # Formato US/EN: "7,344,988.720" -> vírgula é milhar, ponto é decimal
        else:
            s = s.replace(',', '')
    elif ',' in s:
        # Apenas vírgula: "7344988,720" ou "-24,102244" -> substitui vírgula por ponto
        s = s.replace(',', '.')
    elif s.count('.') > 1:
        # Múltiplos pontos sem vírgula: "7.344.988.720" -> último ponto é decimal
        parts = s.split('.')
        s = "".join(parts[:-1]) + "." + parts[-1]
        
    try:
        return float(s)
    except ValueError:
        return None


def parse_dms_robust(val):
    """
    Converte coordenada GMS (Graus, Minutos, Segundos) para Graus Decimais.
    Formatos aceitos:
    - 24°10'22.440"S ou 24º10'22,440" S
    - -24°10'22.440 ou 24 10 22.44 S
    - 53°51'41.600"W
    """
    if not val:
        return None
    s = str(val).strip().replace('\xa0', ' ')
    if not s:
        return None
    
    # Regex flexível para capturar GMS
    m = re.search(r'([+-]?)\s*(\d+)[°º\s]+(\d+)[\'′\s]+([\d.,]+)[\"″]?\s*([NSEW]?)', s, re.IGNORECASE)
    if m:
        try:
            sinal = -1 if m.group(1) == '-' else 1
            deg = float(m.group(2))
            mins = float(m.group(3))
            secs = parse_num_robust(m.group(4)) or 0.0
            decimal = (deg + mins / 60.0 + secs / 3600.0) * sinal
            hemisferio = m.group(5).upper()
            if hemisferio in ('S', 'W'):
                decimal = -abs(decimal)
            return decimal
        except Exception:
            pass
    return None

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
                        ns = {
                            'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
                            'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
                            'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
                        }
                        root = ET.fromstring(xml_data)
                        
                        tables = root.findall('.//table:table', ns)
                        for table in tables:
                            table_name = table.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}name') or ""
                            # Contar pontos válidos na aba
                            pontos_count = 0
                            rows = table.findall('.//table:table-row', ns)
                            for row in rows:
                                cells = row.findall('.//table:table-cell', ns)
                                if cells:
                                    p_elements = cells[0].findall('.//text:p', ns)
                                    cell_text = "".join([p.text for p in p_elements if p.text]).strip()
                                    if cell_text:
                                        # Regex clássica de marco do SIGEF
                                        if re.match(r"^([A-Z0-9]{3,5})-(M|P|V)-(\d+)$", cell_text, re.IGNORECASE) or re.match(r"^(M|P|V)-(\d+)$", cell_text, re.IGNORECASE):
                                            pontos_count += 1
                                            
                            if pontos_count > 0:
                                abas_detectadas.append({
                                    "nome": table_name,
                                    "qtd_pontos": pontos_count
                                })
            except Exception as e_ods:
                logging.getLogger(__name__).error(f"Erro ao analisar ODS: {e_ods}")
                
        # Se não for ODS, ou se for ODS mas não detectou abas formatadas, trata como arquivo de texto simples
        if not is_ods or (is_ods and not abas_detectadas):
            text = content.decode("utf-8", errors="ignore")
            # Buscar marcos por regex no texto completo
            pattern = re.compile(r"\b([A-Z0-9]{3,5})-(M|P|V)-(\d+)\b", re.IGNORECASE)
            matches = pattern.findall(text)
            
            pattern_sem_prefixo = re.compile(r"\b(M|P|V)-(\d+)\b", re.IGNORECASE)
            matches_sem = pattern_sem_prefixo.findall(text)
            
            total_pontos = len(matches) + len(matches_sem)
            if total_pontos > 0:
                abas_detectadas.append({
                    "nome": "Arquivo Único",
                    "qtd_pontos": total_pontos
                })
                
        return {
            "sucesso": True,
            "is_ods": is_ods,
            "filename": file.filename,
            "abas": abas_detectadas
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao analisar planilha: {str(e)}")

@router.post("/levantamentos/{id}/importar-pontos-aprovados-lote")
async def importar_pontos_aprovados_lote(id: int, files: list[UploadFile] = File(...), mapeamento: str = Query(...)):
    verificar_levantamento_arquivado(id)
    try:
        import json
        map_dados = json.loads(mapeamento)  # Dicionário {"filename#nome_aba": matricula_id}
        
        # 1. Obter o profissional_id associado ao levantamento
        lev = execute_query(
            "SELECT profissional_id, propriedade_id FROM levantamentos WHERE id = ?",
            params=(id,),
            fetch_one=True
        )
        if not lev:
            raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
        
        profissional_id = lev["profissional_id"]
        
        # 2. Obter o codigo_credenciado do profissional
        prof = execute_query(
            "SELECT codigo_credenciado FROM profissionais WHERE id = ?",
            params=(profissional_id,),
            fetch_one=True
        )
        if not prof:
            raise HTTPException(status_code=404, detail="Responsável Técnico não encontrado para este levantamento.")
        
        codigo_credenciado = prof["codigo_credenciado"]
        if not codigo_credenciado:
            raise HTTPException(
                status_code=400,
                detail="O Responsável Técnico deste levantamento não possui um Código Credenciado cadastrado no INCRA."
            )
            
        transformer_utm_to_ll = get_transformer("epsg:31982", "epsg:4674", always_xy=True)
        transformer_ll_to_utm = get_transformer("epsg:4674", "epsg:31982", always_xy=True)
        
        def extract_ponto_from_cells(cell_texts):
            if not cell_texts or len(cell_texts) < 7: return None
            vertice = str(cell_texts[0]).strip()
            match = re.match(r"^([A-Z0-9]{3,5})-(M|P|V)-(\d+)$", vertice, re.IGNORECASE)
            if not match: return None
            
            tipo = match.group(2).upper()
            num = int(match.group(3))
            
            v1 = parse_num_robust(cell_texts[1])
            sigma_e = parse_num_robust(cell_texts[2])
            v2 = parse_num_robust(cell_texts[3])
            sigma_n = parse_num_robust(cell_texts[4])
            altitude = parse_num_robust(cell_texts[5])
            sigma_z = parse_num_robust(cell_texts[6])
            
            # Fallback GMS: se v1 ou v2 falharam como número, tenta DMS
            if v1 is None:
                v1 = parse_dms_robust(cell_texts[1])
            if v2 is None:
                v2 = parse_dms_robust(cell_texts[3])
            
            # Log de debug se ainda sem coordenadas
            if v1 is None and v2 is None:
                logging.getLogger(__name__).warning(
                    f"[PARSE DEBUG] Vértice {vertice}: v1='{cell_texts[1]}', v2='{cell_texts[3]}' "
                    f"(raw cells: {cell_texts[:7]})"
                )
            
            metodo = str(cell_texts[7]).strip() if len(cell_texts) > 7 else ""
            tipo_limite = str(cell_texts[8]).strip() if len(cell_texts) > 8 else ""
            cns = str(cell_texts[9]).strip() if len(cell_texts) > 9 else ""
            matricula_conf = str(cell_texts[10]).strip() if len(cell_texts) > 10 else ""
            descritivo = str(cell_texts[11]).strip() if len(cell_texts) > 11 else ""
            
            lat, lon, este, norte = None, None, None, None
            if v1 is not None and v2 is not None:
                if -180 <= v1 <= 180 and -90 <= v2 <= 90:
                    lon, lat = v1, v2
                    try:
                        este, norte = transformer_ll_to_utm.transform(lon, lat)
                    except Exception as e:
                        logging.getLogger(__name__).warning(f"Erro ll_to_utm {vertice}: {e}")
                else:
                    este, norte = v1, v2
                    try:
                        lon, lat = transformer_utm_to_ll.transform(este, norte)
                    except Exception as e:
                        logging.getLogger(__name__).warning(f"Erro utm_to_ll {vertice}: {e}")
                        
            return {
                "tipo_ponto": tipo,
                "numero": num,
                "codigo_completo": vertice.upper(),
                "norte": norte, "este": este, "altitude": altitude,
                "lat": lat, "lon": lon,
                "sigma_n": sigma_n, "sigma_e": sigma_e, "sigma_z": sigma_z,
                "metodo_posicionamento": metodo, "tipo_limite": tipo_limite,
                "cns_confrontante": cns, "matricula_confrontante": matricula_conf,
                "confrontante_descritivo": descritivo
            }
        total_importados = 0
        total_adicionados = 0
        mensagens = []
        
        # Vamos rodar tudo em uma transação do SQLite
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # Para cada matrícula que possui mapeamento, vamos purgar as tabelas antes
            # de inserir os novos pontos correspondentes
            matriculas_afetadas = set()
            for key, mat_id in map_dados.items():
                if mat_id:
                    matriculas_afetadas.add(int(mat_id))
                    
            if matriculas_afetadas:
                placeholders = ','.join(['?'] * len(matriculas_afetadas))
                params = [id] + list(matriculas_afetadas)
                # Deletar pontos anteriores da tabela pontos e segmentos correspondentes em lote
                cursor.execute(
                    f"DELETE FROM pontos WHERE levantamento_id = ? AND matricula_id IN ({placeholders}) AND origem_homologada = 1",
                    params
                )
                cursor.execute(
                    f"DELETE FROM segmentos WHERE levantamento_id = ? AND matricula_id IN ({placeholders})",
                    params
                )
                
            # Processar cada arquivo
            for file in files:
                filename = file.filename
                content = await file.read()
                
                is_ods = filename.lower().endswith(".ods") or content.startswith(b"PK\x03\x04")
                
                if is_ods:
                    try:
                        with zipfile.ZipFile(io.BytesIO(content)) as zip_ref:
                            if 'content.xml' in zip_ref.namelist():
                                xml_data = zip_ref.read('content.xml')
                                ns = {
                                    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
                                    'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
                                    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
                                }
                                root = ET.fromstring(xml_data)
                                
                                tables = root.findall('.//table:table', ns)
                                for table in tables:
                                    table_name = table.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}name') or ""
                                    
                                    # Verificar se esta aba está mapeada para alguma matrícula
                                    map_key = f"{filename}#{table_name}"
                                    if map_key not in map_dados or not map_dados[map_key]:
                                        continue
                                        
                                    mat_id = int(map_dados[map_key])
                                    nome_planilha_salvar = map_key
                                    
                                    # Purgar pontos anteriores da tabela banco_pontos para essa planilha de origem e matrícula
                                    cursor.execute(
                                        "DELETE FROM banco_pontos WHERE levantamento_id = ? AND planilha_origem = ?",
                                        (id, nome_planilha_salvar)
                                    )
                                    
                                    # Extrair pontos
                                    pontos_detetados = []
                                    rows = table.findall('.//table:table-row', ns)
                                    for row in rows:
                                        cells = row.findall('.//table:table-cell', ns)
                                        cell_texts = []
                                        for cell in cells:
                                            repeated = cell.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated')
                                            p_elements = cell.findall('.//text:p', ns)
                                            cell_text = "".join([p.text for p in p_elements if p.text])
                                            
                                            # Fallback: ODS armazena valores numéricos no atributo office:value
                                            if not cell_text:
                                                office_val = cell.get('{urn:oasis:names:tc:opendocument:xmlns:office:1.0}value')
                                                if office_val:
                                                    cell_text = office_val
                                            
                                            count = int(repeated) if repeated else 1
                                            if count > 30: count = 1
                                            for _ in range(count):
                                                cell_texts.append(cell_text)
                                                
                                        p_data = extract_ponto_from_cells(cell_texts)
                                        if p_data:
                                            pontos_detetados.append(p_data)
                                    
                                    if pontos_detetados:
                                        # Processar desduplicação e gravação dos pontos para essa aba/matrícula
                                        pontos_unicos = {}
                                        for idx, p in enumerate(pontos_detetados):
                                            key = (p["tipo_ponto"], p["numero"])
                                            if key not in pontos_unicos:
                                                p["index_original"] = idx
                                                pontos_unicos[key] = p
                                            elif p["lat"] is not None and pontos_unicos[key]["lat"] is None:
                                                p["index_original"] = pontos_unicos[key]["index_original"]
                                                pontos_unicos[key] = p
                                                
                                        pontos_ordenados = list(pontos_unicos.values())
                                        pontos_ordenados.sort(key=lambda x: x["index_original"])
                                        
                                        # Chamar o confrontante manager
                                        from services.gestores.confrontante_manager import resolver_confrontantes_planilha
                                        mapa_vertices_confrontante_id = resolver_confrontantes_planilha(id, pontos_ordenados, cursor)
                                        
                                        # Inserir no banco
                                        pontos_inseridos = []
                                        for idx, p in enumerate(pontos_ordenados):
                                            idx_ordem = idx + 1
                                            cursor.execute(
                                                """
                                                INSERT OR IGNORE INTO banco_pontos 
                                                (profissional_id, levantamento_id, matricula_id, tipo_ponto, numero, codigo_completo,
                                                 norte, este, altitude, lat, lon, sigma_n, sigma_e, sigma_z,
                                                 metodo_posicionamento, tipo_limite, cns_confrontante, matricula_confrontante, confrontante_descritivo,
                                                 planilha_origem) 
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                                """,
                                                (
                                                    profissional_id, id, mat_id, p["tipo_ponto"], p["numero"], p["codigo_completo"],
                                                    p["norte"], p["este"], p["altitude"], p["lat"], p["lon"],
                                                    p["sigma_n"], p["sigma_e"], p["sigma_z"],
                                                    p["metodo_posicionamento"], p["tipo_limite"],
                                                    p["cns_confrontante"], p["matricula_confrontante"], p["confrontante_descritivo"],
                                                    nome_planilha_salvar
                                                )
                                            )
                                            if cursor.rowcount > 0:
                                                total_adicionados += 1
                                                
                                            cursor.execute(
                                                """
                                                INSERT INTO pontos 
                                                (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, 
                                                 sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, status_ponto, metodo_posicionamento, arquivo_origem, origem_homologada)
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                                                """,
                                                (
                                                    id, mat_id, p["codigo_completo"], p["tipo_ponto"], p["lat"], p["lon"], p["altitude"],
                                                    p["sigma_e"], p["sigma_n"], p["sigma_z"], idx_ordem, 'CORRIGIDO', p["metodo_posicionamento"], nome_planilha_salvar
                                                )
                                            )
                                            p["db_ponto_id"] = cursor.lastrowid
                                            pontos_inseridos.append(p)
                                            
                                        # Gerar segmentos se houver pelo menos 2 pontos
                                        if len(pontos_inseridos) >= 2:
                                            N_pts = len(pontos_inseridos)
                                            for i in range(N_pts):
                                                p_ini = pontos_inseridos[i]
                                                p_fim = pontos_inseridos[(i + 1) % N_pts]
                                                conf_id = mapa_vertices_confrontante_id.get(p_ini["codigo_completo"])
                                                cursor.execute(
                                                    """
                                                    INSERT INTO segmentos
                                                    (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id,
                                                     tipo_limite_sigef, metodo_posicionamento_sigef, origem_homologada)
                                                    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                                                    """,
                                                    (
                                                        id, mat_id, p_ini["db_ponto_id"], p_fim["db_ponto_id"], conf_id,
                                                        p_ini["tipo_limite"] or "Limite Não Definido", p_ini["metodo_posicionamento"] or "PG1"
                                                    )
                                                )
                                        
                                        total_importados += len(pontos_ordenados)
                                        mensagens.append(f"Aba '{table_name}' de '{filename}': {len(pontos_ordenados)} pontos importados.")
                    except Exception as e_ods:
                        logging.getLogger(__name__).error(f"Erro ao processar ODS em lote: {e_ods}")
                        raise HTTPException(status_code=400, detail=f"Erro ao processar ODS '{filename}': {str(e_ods)}")
                        
                else:
                    # Texto simples (TXT/CSV)
                    map_key = f"{filename}#Arquivo Único"
                    if map_key in map_dados and map_dados[map_key]:
                        mat_id = int(map_dados[map_key])
                        nome_planilha_salvar = filename
                        
                        cursor.execute(
                            "DELETE FROM banco_pontos WHERE levantamento_id = ? AND planilha_origem = ?",
                            (id, nome_planilha_salvar)
                        )
                        
                        text = content.decode("utf-8", errors="ignore")
                        pontos_detetados = []
                        import csv
                        
                        # Tentar tabular via CSV (comum no SIGEF)
                        # Verifica o provável delimitador (vírgula ou ponto e vírgula)
                        lines = text.splitlines()
                        delimiter = ';' if lines and ';' in lines[0] else ','
                        reader = csv.reader(lines, delimiter=delimiter)
                        
                        headers = []
                        for row in reader:
                            if not row: continue
                            
                            # Verifica se é o cabeçalho do SIGEF CSV (ex: QRCODE;CODIGO;...;X;Y;Z)
                            if not headers and any(h.strip().upper() == 'CODIGO' for h in row):
                                headers = [h.strip().upper() for h in row]
                                continue
                                
                            if headers and 'CODIGO' in headers:
                                def get_val(col_name):
                                    if col_name in headers:
                                        idx = headers.index(col_name)
                                        if idx < len(row): return str(row[idx]).strip()
                                    return ""
                                
                                vertice = get_val('CODIGO')
                                match = re.match(r"^([A-Z0-9]{3,5})-(M|P|V)-(\d+)$", vertice, re.IGNORECASE)
                                if not match: continue
                                
                                tipo = match.group(2).upper()
                                num = int(match.group(3))
                                
                                este = parse_num_robust(get_val('X'))
                                norte = parse_num_robust(get_val('Y'))
                                altitude = parse_num_robust(get_val('Z'))
                                sigma_e = parse_num_robust(get_val('SIGMA_X'))
                                sigma_n = parse_num_robust(get_val('SIGMA_Y'))
                                sigma_z = parse_num_robust(get_val('SIGMA_Z'))
                                metodo = get_val('METODO_POSICIONAMENTO')
                                
                                if este is None:
                                    este = parse_dms_robust(get_val('X'))
                                if norte is None:
                                    norte = parse_dms_robust(get_val('Y'))
                                
                                lat, lon = None, None
                                if este is not None and norte is not None:
                                    try:
                                        lon, lat = transformer_utm_to_ll.transform(este, norte)
                                    except:
                                        pass
                                        
                                pontos_detetados.append({
                                    "tipo_ponto": tipo, "numero": num, "codigo_completo": vertice.upper(),
                                    "norte": norte, "este": este, "altitude": altitude,
                                    "lat": lat, "lon": lon,
                                    "sigma_n": sigma_n, "sigma_e": sigma_e, "sigma_z": sigma_z,
                                    "metodo_posicionamento": metodo, "tipo_limite": get_val('LADO'),
                                    "cns_confrontante": "", "matricula_confrontante": "", "confrontante_descritivo": ""
                                })
                            else:
                                p_data = extract_ponto_from_cells(row)
                                if p_data:
                                    pontos_detetados.append(p_data)
                                    
                        # Se não encontrar nada pelo delimitador padrão (ou for um TXT maluco), fallback pro regex (sem coordenadas)
                        if not pontos_detetados:
                            pattern = re.compile(r"\b([A-Z0-9]{3,5})-(M|P|V)-(\d+)\b", re.IGNORECASE)
                            matches = pattern.findall(text)
                            for m in matches:
                                cod_det = m[0].upper()
                                tipo = m[1].upper()
                                num = int(m[2])
                                pontos_detetados.append({
                                    "tipo_ponto": tipo,
                                    "numero": num,
                                    "codigo_completo": f"{cod_det}-{tipo}-{num:04d}",
                                    "norte": None, "este": None, "altitude": None,
                                    "lat": None, "lon": None,
                                    "sigma_n": None, "sigma_e": None, "sigma_z": None,
                                    "metodo_posicionamento": None, "tipo_limite": None,
                                    "cns_confrontante": None, "matricula_confrontante": None,
                                    "confrontante_descritivo": None
                                })
                            
                        if pontos_detetados:
                            # Desduplicar
                            pontos_unicos = {}
                            for idx, p in enumerate(pontos_detetados):
                                key = (p["tipo_ponto"], p["numero"])
                                if key not in pontos_unicos:
                                    p["index_original"] = idx
                                    pontos_unicos[key] = p
                                    
                            pontos_ordenados = list(pontos_unicos.values())
                            pontos_ordenados.sort(key=lambda x: x["index_original"])
                            
                            from services.gestores.confrontante_manager import resolver_confrontantes_planilha
                            mapa_vertices_confrontante_id = resolver_confrontantes_planilha(id, pontos_ordenados, cursor)
                            
                            pontos_inseridos = []
                            for idx, p in enumerate(pontos_ordenados):
                                idx_ordem = idx + 1
                                cursor.execute(
                                    """
                                    INSERT OR IGNORE INTO banco_pontos 
                                    (profissional_id, levantamento_id, matricula_id, tipo_ponto, numero, codigo_completo,
                                     norte, este, altitude, lat, lon, sigma_n, sigma_e, sigma_z,
                                     metodo_posicionamento, tipo_limite, cns_confrontante, matricula_confrontante, confrontante_descritivo,
                                     planilha_origem) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """,
                                    (
                                        profissional_id, id, mat_id, p["tipo_ponto"], p["numero"], p["codigo_completo"],
                                        p["norte"], p["este"], p["altitude"], p["lat"], p["lon"],
                                        p["sigma_n"], p["sigma_e"], p["sigma_z"],
                                        p["metodo_posicionamento"], p["tipo_limite"],
                                        p["cns_confrontante"], p["matricula_confrontante"], p["confrontante_descritivo"],
                                        nome_planilha_salvar
                                    )
                                )
                                if cursor.rowcount > 0:
                                    total_adicionados += 1
                                    
                                cursor.execute(
                                    """
                                    INSERT INTO pontos 
                                    (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, 
                                     sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, status_ponto, metodo_posicionamento, arquivo_origem, origem_homologada)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                                    """,
                                    (
                                        id, mat_id, p["codigo_completo"], p["tipo_ponto"], p["lat"], p["lon"], p["altitude"],
                                        p["sigma_e"], p["sigma_n"], p["sigma_z"], idx_ordem, 'CORRIGIDO', p["metodo_posicionamento"], nome_planilha_salvar
                                    )
                                )
                                p["db_ponto_id"] = cursor.lastrowid
                                pontos_inseridos.append(p)
                                
                            if len(pontos_inseridos) >= 2:
                                N_pts = len(pontos_inseridos)
                                for i in range(N_pts):
                                    p_ini = pontos_inseridos[i]
                                    p_fim = pontos_inseridos[(i + 1) % N_pts]
                                    conf_id = mapa_vertices_confrontante_id.get(p_ini["codigo_completo"])
                                    cursor.execute(
                                        """
                                        INSERT INTO segmentos
                                        (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id,
                                         tipo_limite_sigef, metodo_posicionamento_sigef, origem_homologada)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                                        """,
                                        (
                                            id, mat_id, p_ini["db_ponto_id"], p_fim["db_ponto_id"], conf_id,
                                            "Limite Não Definido", "PG1"
                                        )
                                    )
                            total_importados += len(pontos_ordenados)
                            mensagens.append(f"Arquivo '{filename}': {len(pontos_ordenados)} pontos importados.")
                            
            conn.commit()
            
        # 5. Recalcular os contadores de profissionais
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            for t in ['M', 'P', 'V']:
                cursor.execute(
                    "SELECT MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto = ? AND codigo_completo LIKE ?",
                    (profissional_id, t, f"{codigo_credenciado}-%")
                )
                row_max = cursor.fetchone()
                max_num = row_max["max_num"] if row_max and row_max["max_num"] is not None else 0
                col_name = f"contador_{t.lower()}"
                cursor.execute(
                    f"UPDATE profissionais SET {col_name} = ? WHERE id = ?",
                    (max_num, profissional_id)
                )
            conn.commit()
            
        return {
            "sucesso": True,
            "pontos_importados": total_importados,
            "pontos_adicionados": total_adicionados,
            "mensagem": f"Importação em lote concluída com sucesso! " + " | ".join(mensagens)
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro interno ao importar em lote: {str(e)}")

@router.post("/levantamentos/{id}/importar-pontos-aprovados")
async def importar_pontos_aprovados(id: int, file: UploadFile = File(...), matricula_id: Optional[int] = Query(None)):
    verificar_levantamento_arquivado(id)
    try:
        # 1. Obter o profissional_id associado ao levantamento
        lev = execute_query(
            "SELECT profissional_id, propriedade_id FROM levantamentos WHERE id = ?",
            params=(id,),
            fetch_one=True
        )
        if not lev:
            raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
        
        profissional_id = lev["profissional_id"]
        
        # 2. Obter o codigo_credenciado do profissional
        prof = execute_query(
            "SELECT codigo_credenciado FROM profissionais WHERE id = ?",
            params=(profissional_id,),
            fetch_one=True
        )
        if not prof:
            raise HTTPException(status_code=404, detail="Responsável Técnico não encontrado para este levantamento.")
        
        codigo_credenciado = prof["codigo_credenciado"]
        if not codigo_credenciado:
            raise HTTPException(
                status_code=400,
                detail="O Responsável Técnico deste levantamento não possui um Código Credenciado cadastrado no INCRA."
            )
        
        # 3. Checagem preventiva se a planilha com o mesmo nome já foi importada
        nome_planilha = file.filename if file.filename else "Planilha Importada"
        exists = execute_query(
            "SELECT count(*) as qtd FROM banco_pontos WHERE levantamento_id = ? AND planilha_origem = ?",
            params=(id, nome_planilha),
            fetch_one=True
        )
        if exists and exists["qtd"] > 0:
            raise HTTPException(
                status_code=400,
                detail=f"A planilha '{nome_planilha}' já foi importada anteriormente para este levantamento. "
                       f"Caso queira reimportá-la, exclua a versão anterior no painel de Auditoria de Pontos."
            )
        
        # 4. Ler o conteúdo do arquivo
        content = await file.read()
        
        filename = file.filename.lower() if file.filename else ""
        is_ods = filename.endswith(".ods") or content.startswith(b"PK\x03\x04")
        
        pontos_detetados = []
        text = ""
        
        if is_ods:
            # Instancia o transformador UTM Zone 22S (EPSG:31982) -> SIRGAS 2000 (EPSG:4674)
            transformer = get_transformer("epsg:31982", "epsg:4674", always_xy=True)
            
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as zip_ref:
                    if 'content.xml' in zip_ref.namelist():
                        xml_data = zip_ref.read('content.xml')
                        ns = {
                            'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
                            'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
                            'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
                        }
                        root = ET.fromstring(xml_data)
                        
                        # Encontra tabelas que contenham perimetro no nome
                        tables = root.findall('.//table:table', ns)
                        for table in tables:
                            table_name = table.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}name') or ""
                            if "perimetro" in table_name.lower():
                                rows = table.findall('.//table:table-row', ns)
                                for row in rows:
                                    cells = row.findall('.//table:table-cell', ns)
                                    cell_texts = []
                                    for cell in cells:
                                        repeated = cell.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated')
                                        p_elements = cell.findall('.//text:p', ns)
                                        cell_text = "".join([p.text for p in p_elements if p.text])
                                        
                                        # Fallback: ODS armazena valores numéricos no atributo office:value
                                        if not cell_text:
                                            office_val = cell.get('{urn:oasis:names:tc:opendocument:xmlns:office:1.0}value')
                                            if office_val:
                                                cell_text = office_val
                                        
                                        count = int(repeated) if repeated else 1
                                        if count > 30: # Limita colunas vazias
                                            count = 1
                                        for _ in range(count):
                                            cell_texts.append(cell_text)
                                            
                                    if len(cell_texts) >= 7:
                                        vertice = cell_texts[0].strip()
                                        match = re.match(r"^([A-Z0-9]{3,5})-(M|P|V)-(\d+)$", vertice, re.IGNORECASE)
                                        if match:
                                            tipo = match.group(2).upper()
                                            num = int(match.group(3))
                                            
                                            este = parse_num_robust(cell_texts[1])
                                            sigma_e = parse_num_robust(cell_texts[2])
                                            norte = parse_num_robust(cell_texts[3])
                                            sigma_n = parse_num_robust(cell_texts[4])
                                            altitude = parse_num_robust(cell_texts[5])
                                            sigma_z = parse_num_robust(cell_texts[6])
                                            
                                            if este is None:
                                                este = parse_dms_robust(cell_texts[1])
                                            if norte is None:
                                                norte = parse_dms_robust(cell_texts[3])
                                            
                                            metodo = cell_texts[7].strip() if len(cell_texts) > 7 else ""
                                            tipo_limite = cell_texts[8].strip() if len(cell_texts) > 8 else ""
                                            cns = cell_texts[9].strip() if len(cell_texts) > 9 else ""
                                            matricula_conf = cell_texts[10].strip() if len(cell_texts) > 10 else ""
                                            descritivo = cell_texts[11].strip() if len(cell_texts) > 11 else ""
                                            
                                            # Conversão de UTM para Lat/Lon
                                            lat, lon = None, None
                                            if este and norte:
                                                try:
                                                    lon, lat = transformer.transform(este, norte)
                                                except Exception as e_trans:
                                                    logging.getLogger(__name__).warning(f"Erro na conversão UTM de {vertice}: {e_trans}")
                                                    
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
                                                "metodo_posicionamento": metodo,
                                                "tipo_limite": tipo_limite,
                                                "cns_confrontante": cns,
                                                "matricula_confrontante": matricula_conf,
                                                "confrontante_descritivo": descritivo
                                            })
                        
                        # Fallback se a estrutura de tabela perimetro não retornou nada (mas content.xml existe)
                        if not pontos_detetados:
                            text = xml_data.decode('utf-8', errors='ignore')
            except Exception as e_zip:
                logging.getLogger(__name__).error(f"Erro ao processar ODS: {e_zip}")
                
        if not is_ods or (is_ods and not pontos_detetados and text):
            if not is_ods:
                text = content.decode("utf-8", errors="ignore")
                
            # Fallback regex tradicional
            pattern = re.compile(r"\b([A-Z0-9]{3,5})-(M|P|V)-(\d+)\b", re.IGNORECASE)
            matches = pattern.findall(text)
            for m in matches:
                cod_det = m[0].upper()
                tipo = m[1].upper()
                num = int(m[2])
                pontos_detetados.append({
                    "tipo_ponto": tipo,
                    "numero": num,
                    "codigo_completo": f"{cod_det}-{tipo}-{num:04d}",
                    "norte": None, "este": None, "altitude": None,
                    "lat": None, "lon": None,
                    "sigma_n": None, "sigma_e": None, "sigma_z": None,
                    "metodo_posicionamento": None, "tipo_limite": None,
                    "cns_confrontante": None, "matricula_confrontante": None,
                    "confrontante_descritivo": None
                })

        if not pontos_detetados:
            return {
                "sucesso": False,
                "pontos_importados": 0,
                "mensagem": f"Nenhum ponto válido com o padrão '{codigo_credenciado}-M/P/V-XXXX' foi localizado no arquivo."
            }

        # Desduplicar pontos pela chave (tipo_ponto, numero) e preservar a ordem do arquivo
        pontos_unicos = {}
        for idx, p in enumerate(pontos_detetados):
            key = (p["tipo_ponto"], p["numero"])
            if key not in pontos_unicos:
                p["index_original"] = idx
                pontos_unicos[key] = p
            elif p["lat"] is not None and pontos_unicos[key]["lat"] is None:
                p["index_original"] = pontos_unicos[key]["index_original"]
                pontos_unicos[key] = p

        pontos_ordenados = list(pontos_unicos.values())
        pontos_ordenados.sort(key=lambda x: x["index_original"])

        # Salvar no banco (transacional)
        pontos_adicionados = 0
        confrontantes_a_inserir = set()
        
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # Deletar pontos anteriores da mesma planilha de origem no levantamento
            cursor.execute("DELETE FROM banco_pontos WHERE levantamento_id = ? AND planilha_origem = ?", (id, nome_planilha))
            
            # Se matricula_id for informado, deleta apenas os pontos homologados anteriores daquela matricula
            if matricula_id:
                cursor.execute(
                    "DELETE FROM pontos WHERE levantamento_id = ? AND matricula_id = ? AND origem_homologada = 1",
                    (id, matricula_id)
                )
                cursor.execute(
                    "DELETE FROM segmentos WHERE levantamento_id = ? AND matricula_id = ?",
                    (id, matricula_id)
                )
                
            # ───────────────────────────────────────────────────────────────────
            # MOTOR DE RESOLUÇÃO DE CONFRONTANTES (DELEGADO AO CONFRONTANTE_MANAGER)
            # ───────────────────────────────────────────────────────────────────
            from services.gestores.confrontante_manager import resolver_confrontantes_planilha
            mapa_vertices_confrontante_id = resolver_confrontantes_planilha(id, pontos_ordenados, cursor)

            # ───────────────────────────────────────────────────────────────────
            # PERSISTÊNCIA DOS PONTOS E RECONSTRUÇÃO DA CADEIA DE SEGMENTOS
            # ───────────────────────────────────────────────────────────────────
            for idx, p in enumerate(pontos_ordenados):
                idx_ordem = idx + 1
                try:
                    cursor.execute(
                        """
                        INSERT OR IGNORE INTO banco_pontos 
                        (profissional_id, levantamento_id, matricula_id, tipo_ponto, numero, codigo_completo,
                         norte, este, altitude, lat, lon, sigma_n, sigma_e, sigma_z,
                         metodo_posicionamento, tipo_limite, cns_confrontante, matricula_confrontante, confrontante_descritivo,
                         planilha_origem) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            profissional_id, id, matricula_id, p["tipo_ponto"], p["numero"], p["codigo_completo"],
                            p["norte"], p["este"], p["altitude"], p["lat"], p["lon"],
                            p["sigma_n"], p["sigma_e"], p["sigma_z"],
                            p["metodo_posicionamento"], p["tipo_limite"],
                            p["cns_confrontante"], p["matricula_confrontante"], p["confrontante_descritivo"],
                            nome_planilha
                        )
                    )
                    if cursor.rowcount > 0:
                        pontos_adicionados += 1
                    
                    if matricula_id:
                        cursor.execute(
                            """
                            INSERT INTO pontos 
                            (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, 
                             sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, status_ponto, metodo_posicionamento, arquivo_origem, origem_homologada)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                            """,
                            (
                                id, matricula_id, p["codigo_completo"], p["tipo_ponto"], p["lat"], p["lon"], p["altitude"],
                                p["sigma_e"], p["sigma_n"], p["sigma_z"], idx_ordem, 'CORRIGIDO', p["metodo_posicionamento"], nome_planilha
                            )
                        )
                        p["db_ponto_id"] = cursor.lastrowid
                except Exception as e_db:
                    logging.getLogger(__name__).warning(f"Erro ao inserir ponto {p['codigo_completo']}: {e_db}")
            
            # Geração de polilinhas perimetrais ultra-veloz via Cache O(1) em memória
            if matricula_id and len(pontos_ordenados) >= 2:
                N = len(pontos_ordenados)
                segmentos_data = []
                for i in range(N):
                    p_ini = pontos_ordenados[i]
                    p_fim = pontos_ordenados[(i + 1) % N]
                    
                    if "db_ponto_id" not in p_ini or "db_ponto_id" not in p_fim:
                        continue
                        
                    confrontante_id = mapa_vertices_confrontante_id.get(p_ini["codigo_completo"])
                                
                    segmentos_data.append((
                        id, matricula_id, p_ini["db_ponto_id"], p_fim["db_ponto_id"], confrontante_id,
                        p_ini["tipo_limite"] or "Limite Não Definido", p_ini["metodo_posicionamento"] or "PG1"
                    ))

                if segmentos_data:
                    cursor.executemany(
                        """
                        INSERT INTO segmentos
                        (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id,
                         tipo_limite_sigef, metodo_posicionamento_sigef, origem_homologada)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                        """,
                        segmentos_data
                    )
            
            conn.commit()
            
        # 5. Recalcular os contadores de profissionais
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            for t in ['M', 'P', 'V']:
                cursor.execute(
                    "SELECT MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto = ? AND codigo_completo LIKE ?",
                    (profissional_id, t, f"{codigo_credenciado}-%")
                )
                row_max = cursor.fetchone()
                max_num = row_max["max_num"] if row_max and row_max["max_num"] is not None else 0
                col_name = f"contador_{t.lower()}"
                cursor.execute(
                    f"UPDATE profissionais SET {col_name} = ? WHERE id = ?",
                    (max_num, profissional_id)
                )
            conn.commit()
            
        return {
            "sucesso": True,
            "pontos_importados": len(pontos_unicos),
            "pontos_adicionados": pontos_adicionados,
            "mensagem": f"Processamento concluído. {len(pontos_unicos)} vértices homologados do credenciamento '{codigo_credenciado}' foram vinculados ao banco de pontos."
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro interno ao importar pontos homologados: {str(e)}")

@router.get("/levantamentos/{id}/planilhas-homologadas")
def get_planilhas_homologadas(id: int):
    try:
        rows = execute_query(
            """
            SELECT planilha_origem, COUNT(*) as qtd_pontos, matricula_id
            FROM banco_pontos
            WHERE levantamento_id = ? AND planilha_origem IS NOT NULL
            GROUP BY planilha_origem
            """,
            params=(id,),
            fetch_all=True
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
            
            # 1. Obter os IDs dos pontos homologados que serão deletados da tabela pontos para limpar segmentos
            cursor.execute(
                "SELECT id FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1",
                (id, payload.planilha_origem)
            )
            ponto_ids = [r["id"] for r in cursor.fetchall()]
            
            if ponto_ids:
                # Deleta segmentos que usavam esses pontos (por precaução)
                placeholders = ",".join("?" for _ in ponto_ids)
                cursor.execute(
                    f"DELETE FROM segmentos WHERE ponto_inicio_id IN ({placeholders}) OR ponto_fim_id IN ({placeholders})",
                    ponto_ids + ponto_ids
                )
                # Deleta os pontos da tabela pontos
                cursor.execute(
                    "DELETE FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1",
                    (id, payload.planilha_origem)
                )

            # 2. Atualizar a tabela banco_pontos com a nova matrícula
            cursor.execute(
                "UPDATE banco_pontos SET matricula_id = ? WHERE levantamento_id = ? AND planilha_origem = ?",
                (payload.matricula_id, id, payload.planilha_origem)
            )

            # 3. Se a nova matrícula foi informada, reinsere os pontos e gera os novos segmentos
            if payload.matricula_id:
                # Busca os pontos salvos em banco_pontos para esta planilha
                cursor.execute(
                    """
                    SELECT codigo_completo, tipo_ponto, lat, lon, altitude,
                           sigma_n, sigma_e, sigma_z, metodo_posicionamento, tipo_limite,
                           cns_confrontante, matricula_confrontante, confrontante_descritivo
                    FROM banco_pontos
                    WHERE levantamento_id = ? AND planilha_origem = ?
                    ORDER BY id ASC
                    """,
                    (id, payload.planilha_origem)
                )
                pontos_banco = [dict(r) for r in cursor.fetchall()]
                
                # Inserir na tabela pontos
                pontos_inseridos = []
                for idx, p in enumerate(pontos_banco):
                    idx_ordem = idx + 1
                    cursor.execute(
                        """
                        INSERT INTO pontos 
                        (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, 
                         sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, status_ponto, metodo_posicionamento, arquivo_origem, origem_homologada)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                        """,
                        (
                            id, payload.matricula_id, p["codigo_completo"], p["tipo_ponto"], p["lat"], p["lon"], p["altitude"],
                            p["sigma_e"], p["sigma_n"], p["sigma_z"], idx_ordem, 'CORRIGIDO', p["metodo_posicionamento"], payload.planilha_origem
                        )
                    )
                    p["db_ponto_id"] = cursor.lastrowid
                    pontos_inseridos.append(p)
                
                # Gerar segmentos se houver pelo menos 2 pontos
                if len(pontos_inseridos) >= 2:
                    # Precisamos dos confrontantes associados para vincular nos segmentos (delegado ao confrontante_manager)
                    from services.gestores.confrontante_manager import vincular_confrontantes_pontos
                    mapa_vertices_conf = vincular_confrontantes_pontos(id, pontos_inseridos, cursor)
                    
                    N = len(pontos_inseridos)
                    for i in range(N):
                        p_ini = pontos_inseridos[i]
                        p_fim = pontos_inseridos[(i + 1) % N]
                        
                        conf_id = mapa_vertices_conf.get(p_ini["codigo_completo"])
                        
                        cursor.execute(
                            """
                            INSERT INTO segmentos
                            (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id,
                             tipo_limite_sigef, metodo_posicionamento_sigef, origem_homologada)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                            """,
                            (
                                id, payload.matricula_id, p_ini["db_ponto_id"], p_fim["db_ponto_id"], conf_id,
                                p_ini["tipo_limite"] or "Limite Não Definido", p_ini["metodo_posicionamento"] or "PG1"
                            )
                        )
                        
            conn.commit()
            
        return {"sucesso": True, "mensagem": f"Planilha '{payload.planilha_origem}' associada com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao associar planilha: {str(e)}")

@router.delete("/levantamentos/{id}/planilhas-homologadas")
def deletar_planilha_homologada(id: int, planilha_origem: str = Query(...)):
    verificar_levantamento_arquivado(id)
    try:
        lev = execute_query(
            """
            SELECT l.profissional_id, p.codigo_credenciado 
            FROM levantamentos l
            JOIN profissionais p ON l.profissional_id = p.id
            WHERE l.id = ?
            """,
            params=(id,),
            fetch_one=True
        )
        if not lev:
            raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
        profissional_id = lev["profissional_id"]
        codigo_credenciado = lev["codigo_credenciado"] or ""
        
        execute_query(
            "DELETE FROM banco_pontos WHERE levantamento_id = ? AND planilha_origem = ?",
            params=(id, planilha_origem),
            commit=True
        )
        
        # Remover também os pontos da tabela pontos marcados como origem_homologada=1
        pontos_da_planilha = execute_query(
            "SELECT DISTINCT matricula_id FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1",
            params=(id, planilha_origem),
            fetch_all=True
        )
        matriculas_afetadas = [r["matricula_id"] for r in (pontos_da_planilha or []) if r["matricula_id"]]
        
        execute_query(
            "DELETE FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1",
            params=(id, planilha_origem),
            commit=True
        )
        if matriculas_afetadas:
            placeholders = ",".join(["?"] * len(matriculas_afetadas))
            execute_query(
                f"DELETE FROM segmentos WHERE levantamento_id = ? AND matricula_id IN ({placeholders})",
                params=tuple([id] + list(matriculas_afetadas)),
                commit=True
            )
        
        # Recalcular contadores do profissional
        with DatabaseManager() as conn:
            cursor = conn.cursor()

            # Buscamos o MAX(numero) para todos os tipos (M, P, V) em uma única query
            cursor.execute(
                "SELECT tipo_ponto, MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto IN ('M', 'P', 'V') AND codigo_completo LIKE ? GROUP BY tipo_ponto",
                (profissional_id, f"{codigo_credenciado}-%")
            )
            rows = cursor.fetchall()

            max_nums = {'M': 0, 'P': 0, 'V': 0}
            for row in rows:
                if row["tipo_ponto"] in max_nums:
                    max_nums[row["tipo_ponto"]] = row["max_num"] if row["max_num"] is not None else 0

            # Atualizamos os contadores de uma vez
            cursor.execute(
                "UPDATE profissionais SET contador_m = ?, contador_p = ?, contador_v = ? WHERE id = ?",
                (max_nums['M'], max_nums['P'], max_nums['V'], profissional_id)
            )

            conn.commit()
            
        return {"sucesso": True, "mensagem": f"Planilha '{planilha_origem}' e seus pontos foram excluídos com sucesso."}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao excluir planilha homologada: {str(e)}")

@router.get("/levantamentos/{id}/pontos-sugeridos")
def get_pontos_sugeridos_levantamento(id: int):
    try:
        row = execute_query(
            "SELECT profissional_id FROM levantamentos WHERE id = ?",
            params=(id,),
            fetch_one=True
        )
        if not row:
            raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
            
        prof_id = row["profissional_id"]
        
        prof = execute_query(
            "SELECT codigo_credenciado FROM profissionais WHERE id = ?",
            params=(prof_id,),
            fetch_one=True
        )
        codigo_cred = prof["codigo_credenciado"] if prof else ""
        
        sugestoes = {}
        with DatabaseManager() as conn:
            cursor = conn.cursor()

            # Buscamos o MAX(numero) para todos os tipos de uma vez
            cursor.execute(
                "SELECT tipo_ponto, MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto IN ('M', 'P', 'V') GROUP BY tipo_ponto",
                (prof_id,)
            )
            rows = cursor.fetchall()

            max_nums = {'M': 0, 'P': 0, 'V': 0}
            for row in rows:
                if row["tipo_ponto"] in max_nums:
                    max_nums[row["tipo_ponto"]] = row["max_num"] if row["max_num"] is not None else 0

            for t in ['M', 'P', 'V']:
                max_num = max_nums[t]
                proximo = max_num + 1
                sugestoes[t] = {
                    "proximo_numero": proximo,
                    "codigo_sugerido": f"{codigo_cred}-{t}-{proximo:04d}" if codigo_cred else f"{t}-{proximo}"
                }
            
        return {
            "profissional_id": prof_id,
            "codigo_credenciado": codigo_cred,
            "sugestoes": sugestoes
        }
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
            FROM banco_pontos
            WHERE levantamento_id = ?
            ORDER BY id ASC
            """,
            params=(id,),
            fetch_all=True
        )
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{id}/banco-pontos/auditoria")
def get_auditoria_banco_pontos(id: int):
    """
    Retorna todos os pontos do banco_pontos agrupados por arquivo de origem.
    Identifica pontos duplicados (mesmo código em arquivos diferentes).
    """
    try:
        rows = execute_query(
            """
            SELECT id, tipo_ponto, numero, codigo_completo, norte, este, altitude,
                   metodo_posicionamento, tipo_limite, matricula_confrontante,
                   confrontante_descritivo, matricula_id, planilha_origem, created_at
            FROM banco_pontos
            WHERE levantamento_id = ?
            ORDER BY planilha_origem ASC, tipo_ponto ASC, numero ASC
            """,
            params=(id,),
            fetch_all=True
        )
        pontos = [dict(r) for r in rows]

        from collections import Counter
        contagem_codigos = Counter(p["codigo_completo"] for p in pontos)
        codigos_duplicados = {cod for cod, qtd in contagem_codigos.items() if qtd > 1}

        for p in pontos:
            p["is_duplicado"] = p["codigo_completo"] in codigos_duplicados

        grupos = {}
        for p in pontos:
            origem = p["planilha_origem"] or "Sem arquivo (manual)"
            if origem not in grupos:
                grupos[origem] = {"planilha_origem": origem, "total": 0, "pontos": [], "tem_duplicata": False}
            grupos[origem]["pontos"].append(p)
            grupos[origem]["total"] += 1
            if p["is_duplicado"]:
                grupos[origem]["tem_duplicata"] = True

        return {
            "total_pontos": len(pontos),
            "total_grupos": len(grupos),
            "total_duplicatas": len(codigos_duplicados),
            "grupos": list(grupos.values())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/levantamentos/{id}/matriculas/{matricula_id}/pontos-homologados")
def get_pontos_homologados_matricula(id: int, matricula_id: int):
    try:
        query = """
            SELECT p.id, p.levantamento_id, p.matricula_id, p.nome_vertice as codigo_completo,
                   p.tipo_ponto, p.lat, p.lon, p.alt as altitude, p.sigma_lat, p.sigma_lon, p.sigma_alt,
                   p.ordem_caminhamento, p.status_ponto, p.metodo_posicionamento, p.arquivo_origem
            FROM pontos p
            WHERE p.levantamento_id = ? 
              AND p.matricula_id = ? 
              AND p.origem_homologada = 1
            ORDER BY CASE WHEN p.ordem_caminhamento IS NULL OR p.ordem_caminhamento = 0 THEN 999999 ELSE p.ordem_caminhamento END ASC, p.id ASC
        """
        rows = [dict(r) for r in execute_query(query, params=(id, matricula_id), fetch_all=True)]
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/levantamentos/{id}/pontos-homologados")
def get_todos_pontos_homologados_levantamento(id: int):
    try:
        query = """
            SELECT p.id, p.levantamento_id, p.matricula_id, p.nome_vertice as codigo_completo,
                   p.tipo_ponto, p.lat, p.lon, p.alt as altitude, p.sigma_lat, p.sigma_lon, p.sigma_alt,
                   p.ordem_caminhamento, p.status_ponto, p.metodo_posicionamento, p.arquivo_origem as planilha_origem
            FROM pontos p
            WHERE p.levantamento_id = ? 
              AND p.origem_homologada = 1
            ORDER BY p.matricula_id ASC, CASE WHEN p.ordem_caminhamento IS NULL OR p.ordem_caminhamento = 0 THEN 999999 ELSE p.ordem_caminhamento END ASC, p.id ASC
        """
        rows = [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

