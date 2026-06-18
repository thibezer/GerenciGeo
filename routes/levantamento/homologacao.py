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
from pyproj import Transformer

from database.connection import DatabaseManager, execute_query
from routes.deps import verificar_levantamento_arquivado, extrair_nome_confrontante_limpo

router = APIRouter(tags=["Homologação de Pontos & Banco de Pontos"])

# ── Modelos ────────────────────────────────────────────────────────────────────

class AssociarPlanilhaPayload(BaseModel):
    planilha_origem: str
    matricula_id: Optional[int] = None

# ── Rotas ──────────────────────────────────────────────────────────────────────

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
            transformer = Transformer.from_crs("epsg:31982", "epsg:4674", always_xy=True)
            
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
                                        
                                        count = int(repeated) if repeated else 1
                                        if count > 30: # Limita colunas vazias
                                            count = 1
                                        for _ in range(count):
                                            cell_texts.append(cell_text)
                                            
                                    if len(cell_texts) >= 7:
                                        vertice = cell_texts[0].strip()
                                        match = re.match(rf"^({re.escape(codigo_credenciado)})-(M|P|V)-(\d+)$", vertice, re.IGNORECASE)
                                        if match:
                                            tipo = match.group(2).upper()
                                            num = int(match.group(3))
                                            
                                            def parse_num(val):
                                                if not val: return None
                                                try:
                                                    return float(val.replace(",", ".").strip())
                                                except:
                                                    return None
                                                    
                                            este = parse_num(cell_texts[1])
                                            sigma_e = parse_num(cell_texts[2])
                                            norte = parse_num(cell_texts[3])
                                            sigma_n = parse_num(cell_texts[4])
                                            altitude = parse_num(cell_texts[5])
                                            sigma_z = parse_num(cell_texts[6])
                                            
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
            pattern = re.compile(rf"\b({re.escape(codigo_credenciado)})-(M|P|V)-(\d+)\b", re.IGNORECASE)
            matches = pattern.findall(text)
            for m in matches:
                tipo = m[1].upper()
                num = int(m[2])
                pontos_detetados.append({
                    "tipo_ponto": tipo,
                    "numero": num,
                    "codigo_completo": f"{codigo_credenciado}-{tipo}-{num:04d}",
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
            # MOTOR DE RESOLUÇÃO DE CONFRONTANTES (SINGLE-PASS CACHE)
            # ───────────────────────────────────────────────────────────────────
            import unicodedata

            def normalizar_texto_busca(texto: str) -> str:
                """Remove acentos, espaços múltiplos e padroniza caixa para busca segura"""
                if not texto: return ""
                texto = "".join(ch for ch in unicodedata.normalize('NFKD', texto) if not unicodedata.combining(ch))
                return re.sub(r'\s+', ' ', texto.strip().upper())

            # Carrega todos os confrontantes históricos do levantamento em cache de memória
            cursor.execute("SELECT id, nome, matricula_imovel, cns_confrontante FROM confrontantes WHERE levantamento_id = ?", (id,))
            confrontantes_existentes = cursor.fetchall()
            
            cache_por_matricula = {}
            cache_por_nome = {}
            
            for c_row in confrontantes_existentes:
                c_id = c_row["id"]
                c_nome_norm = normalizar_texto_busca(c_row["nome"])
                c_mat = (c_row["matricula_imovel"] or "").strip().upper()
                
                if c_mat:
                    cache_por_matricula[c_mat] = c_id
                if c_nome_norm:
                    cache_por_nome[c_nome_norm] = c_id

            mapa_vertices_confrontante_id = {}
            
            # Varre e resolve a qualificação cadastral dos confrontantes de uma só vez
            for p in pontos_ordenados:
                matricula_conf = (p.get("matricula_confrontante") or "").strip().upper()
                cns_conf = (p.get("cns_confrontante") or "").strip()
                desc = (p.get("confrontante_descritivo") or "").strip()
                nome_conf = extrair_nome_confrontante_limpo(desc)
                nome_conf_norm = normalizar_texto_busca(nome_conf)
                
                if not matricula_conf and not nome_conf:
                    continue
                    
                confrontante_id_resolvido = None

                # 1ª Opção de Busca: Pela Matrícula do Imóvel Confrontante
                if matricula_conf and matricula_conf in cache_por_matricula:
                    confrontante_id_resolvido = cache_por_matricula[matricula_conf]
                    if nome_conf and nome_conf_norm != matricula_conf:
                        cursor.execute("UPDATE confrontantes SET nome = ?, cns_confrontante = COALESCE(cns_confrontante, ?) WHERE id = ?", (nome_conf, cns_conf, confrontante_id_resolvido))
                    elif cns_conf:
                        cursor.execute("UPDATE confrontantes SET cns_confrontante = COALESCE(cns_confrontante, ?) WHERE id = ?", (cns_conf, confrontante_id_resolvido))
                
                # 2ª Opção de Busca: Pelo Nome Normalizado (Casamento Fonético Antiduplicidade)
                elif nome_conf_norm and nome_conf_norm in cache_por_nome:
                    confrontante_id_resolvido = cache_por_nome[nome_conf_norm]
                    cursor.execute(
                        "UPDATE confrontantes SET matricula_imovel = COALESCE(matricula_imovel, ?), cns_confrontante = COALESCE(cns_confrontante, ?) WHERE id = ?",
                        (matricula_conf if matricula_conf else None, cns_conf if cns_conf else None, confrontante_id_resolvido)
                    )
                    if matricula_conf:
                        cache_por_matricula[matricula_conf] = confrontante_id_resolvido
                
                # 3ª Opção: Inserção Atômica de Novo Registro e Alimentação dos Caches Temporários
                else:
                    final_nome = nome_conf if nome_conf else f"Confrontante da Matrícula {matricula_conf}"
                    cursor.execute(
                        "INSERT INTO confrontantes (levantamento_id, nome, matricula_imovel, cns_confrontante) VALUES (?, ?, ?, ?)",
                        (id, final_nome, matricula_conf if matricula_conf else None, cns_conf if cns_conf else None)
                    )
                    confrontante_id_resolvido = cursor.lastrowid
                    
                    if matricula_conf:
                        cache_por_matricula[matricula_conf] = confrontante_id_resolvido
                    if nome_conf_norm:
                        cache_por_nome[nome_conf_norm] = confrontante_id_resolvido
                
                mapa_vertices_confrontante_id[p["codigo_completo"]] = confrontante_id_resolvido

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
                for i in range(N):
                    p_ini = pontos_ordenados[i]
                    p_fim = pontos_ordenados[(i + 1) % N]
                    
                    if "db_ponto_id" not in p_ini or "db_ponto_id" not in p_fim:
                        continue
                        
                    confrontante_id = mapa_vertices_confrontante_id.get(p_ini["codigo_completo"])
                                
                    cursor.execute(
                        """
                        INSERT INTO segmentos
                        (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id,
                         tipo_limite_sigef, metodo_posicionamento_sigef, origem_homologada)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                        """,
                        (
                            id, matricula_id, p_ini["db_ponto_id"], p_fim["db_ponto_id"], confrontante_id,
                            p_ini["tipo_limite"] or "Limite Não Definido", p_ini["metodo_posicionamento"] or "PG1"
                        )
                    )
            
            conn.commit()
            
        # 5. Recalcular os contadores de profissionais
        for t in ['M', 'P', 'V']:
            row_max = execute_query(
                "SELECT MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto = ?",
                params=(profissional_id, t),
                fetch_one=True
            )
            max_num = row_max["max_num"] if row_max and row_max["max_num"] is not None else 0
            col_name = f"contador_{t.lower()}"
            execute_query(
                f"UPDATE profissionais SET {col_name} = ? WHERE id = ?",
                params=(max_num, profissional_id),
                commit=True
            )
            
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
        execute_query(
            "UPDATE banco_pontos SET matricula_id = ? WHERE levantamento_id = ? AND planilha_origem = ?",
            params=(payload.matricula_id, id, payload.planilha_origem),
            commit=True
        )
        return {"sucesso": True, "mensagem": f"Planilha '{payload.planilha_origem}' associada com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao associar planilha: {str(e)}")

@router.delete("/levantamentos/{id}/planilhas-homologadas")
def deletar_planilha_homologada(id: int, planilha_origem: str = Query(...)):
    verificar_levantamento_arquivado(id)
    try:
        lev = execute_query(
            "SELECT profissional_id FROM levantamentos WHERE id = ?",
            params=(id,),
            fetch_one=True
        )
        if not lev:
            raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
        profissional_id = lev["profissional_id"]
        
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
        for mid_afetado in matriculas_afetadas:
            execute_query(
                "DELETE FROM segmentos WHERE levantamento_id = ? AND matricula_id = ?",
                params=(id, mid_afetado),
                commit=True
            )
        
        # Recalcular contadores do profissional
        for t in ['M', 'P', 'V']:
            row_max = execute_query(
                "SELECT MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto = ?",
                params=(profissional_id, t),
                fetch_one=True
            )
            max_num = row_max["max_num"] if row_max and row_max["max_num"] is not None else 0
            col_name = f"contador_{t.lower()}"
            execute_query(
                f"UPDATE profissionais SET {col_name} = ? WHERE id = ?",
                params=(max_num, profissional_id),
                commit=True
            )
            
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
        for t in ['M', 'P', 'V']:
            row_max = execute_query(
                "SELECT MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto = ?",
                params=(prof_id, t),
                fetch_one=True
            )
            max_num = row_max["max_num"] if row_max and row_max["max_num"] is not None else 0
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
