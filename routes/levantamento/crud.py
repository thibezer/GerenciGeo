"""
routes/levantamento/crud.py — CRUD de Levantamentos e Gestão de Arquivos do Projeto
"""
import os
import io
import re
import json
import stat
import shutil
import zipfile
import logging
import datetime
from collections import defaultdict
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks, Form
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from database.connection import DatabaseManager, execute_query
from database.repository import HistoricoRinexRepo
from services.gestores.workspace_manager import WorkspaceManager
from services.documentacao.exportacao_service import ExportacaoService
from services.processamento.triagem_inteligente import ler_metadados_rinex
from routes.deps import verificar_levantamento_arquivado
from routes.processamento import _converter_gns_background

router = APIRouter(tags=["Levantamentos (CRUD e Workspace)"])

# ── Modelos ────────────────────────────────────────────────────────────────────

class LevantamentoCreate(BaseModel):
    propriedade_id: int
    profissional_id: int
    data_inicio: str
    numero_trt: Optional[str] = None
    data_trt: Optional[str] = ""

class LevantamentoUpdate(BaseModel):
    propriedade_id: int
    profissional_id: int
    data_inicio: str
    status: str = "EM_ANDAMENTO"
    numero_trt: Optional[str] = None
    data_trt: Optional[str] = ""

# ── Rotas ──────────────────────────────────────────────────────────────────────

@router.get("/levantamentos")
def get_levantamentos():
    try:
        query = """
            SELECT l.*, 
                   p.nome_propriedade, p.codigo_car, p.codigo_ccir, p.municipio, p.uf,
                   (SELECT COUNT(*) FROM pontos p_pts WHERE p_pts.levantamento_id = l.id) as total_pontos,
                   (SELECT COUNT(*) FROM segmentos s WHERE s.levantamento_id = l.id) as total_segmentos
            FROM levantamentos l
            JOIN propriedades p ON l.propriedade_id = p.id
        """
        levantamentos = [dict(r) for r in execute_query(query, fetch_all=True)]
        
        if not levantamentos:
            return []

        from collections import defaultdict

        prop_ids = list(set(l['propriedade_id'] for l in levantamentos if l.get('propriedade_id') is not None))
        clients_by_prop = defaultdict(list)

        if prop_ids:
            placeholders = ', '.join(['?'] * len(prop_ids))
            clients_query = f"""
                SELECT pc.propriedade_id, c.id, p.nome as nome_completo, p.cpf_cnpj, pc.percentual_participacao
                FROM propriedade_clientes pc
                JOIN clientes c ON pc.cliente_id = c.id
                JOIN pessoas p ON c.pessoa_id = p.id
                WHERE pc.propriedade_id IN ({placeholders})
            """
            for row in execute_query(clients_query, params=tuple(prop_ids), fetch_all=True):
                r_dict = dict(row)
                prop_id = r_dict.pop('propriedade_id')
                clients_by_prop[prop_id].append(r_dict)

        for l in levantamentos:
            l['clientes'] = clients_by_prop.get(l['propriedade_id'], [])
        else:
            for l in levantamentos:
                l['clientes'] = []

        return levantamentos
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao listar levantamentos: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao buscar levantamentos.")

@router.post("/levantamentos")
def create_levantamento(lev: LevantamentoCreate):
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, numero_trt, data_trt) VALUES (?, ?, ?, ?, ?)",
                (lev.propriedade_id, lev.profissional_id, lev.data_inicio, lev.numero_trt, lev.data_trt)
            )
            lev_id = cursor.lastrowid
            conn.commit()
            
            # Criar Workspace físico e gerar DADOS_GERAIS.json
            wm = WorkspaceManager()
            pasta = wm.create_workspace(lev_id)
            
            # Atualiza o caminho físico no banco
            execute_query("UPDATE levantamentos SET pasta_projeto = ? WHERE id = ?", params=(pasta, lev_id), commit=True)
            
            # Gera DADOS_GERAIS.json unificado
            ExportacaoService.gerar_documento_cliente_workspace(lev_id)
            
            return {"id": lev_id, "pasta_projeto": pasta, "message": "Levantamento e workspace criados"}
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao criar levantamento: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao criar levantamento: {str(e)}")

@router.put("/levantamentos/{lev_id}")
def update_levantamento(lev_id: int, lev: LevantamentoUpdate):
    verificar_levantamento_arquivado(lev_id)
    try:
        execute_query("""
            UPDATE levantamentos
            SET propriedade_id = ?, profissional_id = ?, data_inicio = ?, status = ?, numero_trt = ?, data_trt = ?
            WHERE id = ?
        """, params=(lev.propriedade_id, lev.profissional_id, lev.data_inicio, lev.status, lev.numero_trt, lev.data_trt, lev_id), commit=True)
        
        # Regenera o Workspace DADOS_GERAIS.json
        ExportacaoService.gerar_documento_cliente_workspace(lev_id)

        return {"message": "Levantamento atualizado com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao atualizar levantamento id={lev_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao atualizar levantamento: {str(e)}")

@router.delete("/levantamentos/{lev_id}")
def delete_levantamento(lev_id: int, apagar_arquivos: bool = False):
    verificar_levantamento_arquivado(lev_id)
    try:
        with DatabaseManager() as conn:
            # Apagar DB (CASCADE vai limpar pontos, confrontantes e segmentos)
            conn.execute("DELETE FROM levantamentos WHERE id = ?", (lev_id,))
            conn.commit()
            
            # Apagar Físico
            if apagar_arquivos:
                wm = WorkspaceManager()
                wm.delete_workspace(lev_id)
                
            return {"message": "Levantamento removido com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao deletar levantamento id={lev_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao remover levantamento: {str(e)}")

@router.post("/levantamentos/{lev_id}/documentos")
async def upload_documento_levantamento(lev_id: int, file: UploadFile = File(...)):
    verificar_levantamento_arquivado(lev_id)
    try:
        wm = WorkspaceManager()
        pasta_docs = os.path.join(wm.get_levantamento_folder(lev_id), "Documentos")
        os.makedirs(pasta_docs, exist_ok=True)
        
        file_path = os.path.join(pasta_docs, file.filename)
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
            
        return {"message": "Documento anexado", "path": file_path}
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao fazer upload de documento para lev_id={lev_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao salvar documento: {str(e)}")

@router.post("/levantamentos/{lev_id}/upload-arquivo")
async def upload_arquivo_categoria(lev_id: int, background_tasks: BackgroundTasks, categoria: str = Form(...), file: UploadFile = File(...)):
    verificar_levantamento_arquivado(lev_id)
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        categorias = ["Brutos", "Rinex", "Processados", "Documentos", "Exportacoes"]
        if categoria not in categorias:
            raise HTTPException(status_code=400, detail="Categoria de pasta de arquivos inválida.")
            
        pasta_destino = folder / categoria
        pasta_destino.mkdir(parents=True, exist_ok=True)
        
        file_path = pasta_destino / file.filename
        
        # Destrava permissão de escrita se já existir para poder sobrescrever se desejado
        if file_path.exists():
            try:
                os.chmod(file_path, stat.S_IWRITE)
            except Exception:
                pass
                
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
            
        # Blindagem física se for Brutos (somente leitura)
        if categoria == "Brutos":
            try:
                os.chmod(file_path, os.stat(file_path).st_mode & ~stat.S_IWRITE)
            except Exception:
                pass
        
        # GATILHO AUTOMÁTICO: Se o arquivo é .GNS na pasta Brutos, dispara conversão RINEX em background
        conversao_agendada = False
        if categoria == "Brutos" and file.filename.upper().endswith(".GNS"):
            pasta_rinex = folder / "Rinex"
            pasta_rinex.mkdir(parents=True, exist_ok=True)
            background_tasks.add_task(_converter_gns_background, str(file_path), str(pasta_rinex), lev_id)
            conversao_agendada = True
                
        # Sincroniza
        ExportacaoService.gerar_documento_cliente_workspace(lev_id)
        
        msg = f"Arquivo '{file.filename}' carregado com sucesso na pasta '{categoria}'."
        if conversao_agendada:
            msg += " Conversão RINEX iniciada automaticamente em segundo plano."
        
        return {"success": True, "message": msg, "conversao_rinex_agendada": conversao_agendada}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/levantamentos/{lev_id}/testar-busca-rinex")
async def testar_busca_rinex(lev_id: int):
    verificar_levantamento_arquivado(lev_id)
    try:
        import sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        from buscador_rinex import encontrar_rinex
        
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        
        pasta_brutos = folder / "Brutos"
        pasta_rinex = folder / "Rinex"
        os.makedirs(str(pasta_rinex), exist_ok=True)
        
        if not pasta_brutos.exists():
            return {"success": False, "message": "Pasta 'Brutos' não existe no workspace deste levantamento."}
            
        # Pega todos os arquivos brutos (.GNS ou .ZHD)
        arquivos_brutos = [f for f in os.listdir(pasta_brutos) if f.upper().endswith((".GNS", ".ZHD"))]
        if not arquivos_brutos:
            return {"success": False, "message": "Nenhum arquivo bruto (.GNS ou .ZHD) localizado na pasta 'Brutos'."}
        
        # Nomes base dos arquivos brutos para o buscador
        nomes_base = [os.path.splitext(a)[0] for a in arquivos_brutos]
        
        # Busca via buscador_rinex.py
        arquivos_encontrados = encontrar_rinex(
            nomes_base_origem=nomes_base,
            pasta_destino=str(pasta_rinex),
            pastas_extras=[str(folder)]
        )
        
        encontrados = []
        copiados = []
        ja_existentes = []
        erros = []
        registrados = []
        
        repo = HistoricoRinexRepo()
        
        for arq in arquivos_encontrados:
            f = os.path.basename(arq)
            origem = os.path.dirname(arq)
            nome_f, ext_f = os.path.splitext(f)
            ext_f_lower = ext_f.lower()
            
            # Identifica o arquivo bruto correspondente
            arq_bruto_match = next(
                (b for b in arquivos_brutos if nome_f.lower() == os.path.splitext(b)[0].lower()
                 or nome_f.lower().startswith(os.path.splitext(b)[0].lower())),
                arquivos_brutos[0]
            )
            
            encontrados.append({"bruto": arq_bruto_match, "rinex": f, "origem": origem, "caminho": arq})
            
            # Copia para a pasta Rinex do workspace
            dest_caminho = pasta_rinex / f
            ja_esta_no_workspace = os.path.normpath(arq) == os.path.normpath(str(dest_caminho))
            
            if ja_esta_no_workspace:
                ja_existentes.append(f)
            else:
                try:
                    if dest_caminho.exists():
                        os.chmod(str(dest_caminho), stat.S_IWRITE)
                    shutil.copy2(arq, str(dest_caminho))
                    copiados.append(f)
                except Exception as e_copy:
                    erros.append(f"Erro ao copiar {f}: {e_copy}")
                    continue
            
            # Se for arquivo de observação, faz o parse dos metadados e registra no BD
            if ext_f_lower in ['.obs', '.o'] or re.match(r'^\.\d{2}o$', ext_f_lower):
                tamanho_bruto = os.path.getsize(pasta_brutos / arq_bruto_match) if (pasta_brutos / arq_bruto_match).exists() else 0
                try:
                    meta = ler_metadados_rinex(str(dest_caminho))
                    if meta:
                        repo.insert(
                            arquivo_nome=arq_bruto_match,
                            arquivo_tamanho=tamanho_bruto,
                            arquivo_path=str(pasta_brutos / arq_bruto_match),
                            ponto_nome=meta['marcador'],
                            data_inicio=meta['inicio'],
                            data_fim=meta['fim'],
                            latitude=meta['lat'],
                            longitude=meta['lon'],
                            sucesso=True
                        )
                        registrados.append(f"{f} -> Marcador: {meta['marcador']}")
                    else:
                        repo.insert(
                            arquivo_nome=arq_bruto_match,
                            arquivo_tamanho=tamanho_bruto,
                            arquivo_path=str(pasta_brutos / arq_bruto_match),
                            sucesso=True
                        )
                        registrados.append(f"{f} (sem metadados)")
                except Exception as e_db:
                    erros.append(f"Erro ao registrar BD para {f}: {e_db}")
        
        # Regenera documentos
        ExportacaoService.gerar_documento_cliente_workspace(lev_id)
        
        total_msg = (
            f"Busca finalizada. {len(encontrados)} arquivo(s) encontrado(s): "
            f"{len(copiados)} copiado(s) para o workspace, "
            f"{len(ja_existentes)} já existia(m), "
            f"{len(registrados)} registrado(s) no banco."
        )
        return {
            "success": True,
            "message": total_msg,
            "arquivos_rinex_encontrados": encontrados,
            "arquivos_copiados": copiados,
            "arquivos_ja_existentes": ja_existentes,
            "arquivos_registrados": registrados,
            "erros": erros
        }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))


@router.get("/levantamentos/{lev_id}/rinex/download-zip")
def download_rinex_zip(lev_id: int):
    """Empacota todos os arquivos da pasta Rinex do levantamento num .zip em memória e o envia para download."""
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        pasta_rinex = folder / "Rinex"
        
        if not pasta_rinex.exists():
            raise HTTPException(status_code=404, detail="Pasta Rinex não encontrada para este levantamento.")
        
        arquivos = [f for f in pasta_rinex.iterdir() if f.is_file()]
        if not arquivos:
            raise HTTPException(status_code=404, detail="Nenhum arquivo Rinex encontrado para este levantamento.")
        
        # Empacota em memória
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
            for arq in arquivos:
                zf.write(arq, arcname=arq.name)
        buf.seek(0)
        
        nome_zip = f"Rinex_Lev{lev_id}.zip"
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={nome_zip}"}
        )
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{lev_id}/arquivos")
def get_arquivos_levantamento(lev_id: int):
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        
        categorias = ["Brutos", "Rinex", "Processados", "Documentos", "Exportacoes"]
        resultado = {cat: [] for cat in categorias}
        
        if not folder.exists():
            return resultado
            
        for cat in categorias:
            cat_folder = folder / cat
            if cat_folder.exists() and cat_folder.is_dir():
                for f in cat_folder.iterdir():
                    if f.is_file():
                        stat_info = f.stat()
                        size_kb = stat_info.st_size / 1024
                        size_str = f"{size_kb:.1f} KB" if size_kb < 1024 else f"{size_kb/1024:.2f} MB"
                        mod_time = datetime.datetime.fromtimestamp(stat_info.st_mtime).strftime("%d/%m/%Y %H:%M")
                        resultado[cat].append({
                            "nome": f.name,
                            "tamanho": size_str,
                            "modificado": mod_time
                        })
                        
        return resultado
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao listar arquivos do levantamento id={lev_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao listar arquivos do levantamento.")

@router.get("/levantamentos/arquivados/anos")
def get_anos_arquivados():
    try:
        query = """
            SELECT DISTINCT strftime('%Y', data_inicio) as ano
            FROM levantamentos
            WHERE status = 'ARQUIVADO' AND data_inicio IS NOT NULL
            ORDER BY ano DESC
        """
        anos = [r['ano'] for r in execute_query(query, fetch_all=True) if r['ano']]
        return {"anos": anos}
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao buscar anos de projetos arquivados: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao buscar anos arquivados")

import uuid

@router.post("/levantamentos/{lev_id}/compartilhar")
async def gerar_link_compartilhamento(lev_id: int):
    try:
        row = execute_query("SELECT codigo_compartilhamento FROM levantamentos WHERE id = ?", params=(lev_id,), fetch_all=True)
        if not row:
            raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
        
        codigo = row[0]['codigo_compartilhamento']
        if not codigo:
            import secrets
            codigo = secrets.token_hex(4) # gera 8 caracteres aleatórios (ex: 'f4a2b91c')
            execute_query("UPDATE levantamentos SET codigo_compartilhamento = ? WHERE id = ?", params=(codigo, lev_id), commit=True)

        # 1. Gera o payload com dados anonimizados
        payload = get_levantamento_publico(codigo)

        # 2. Transmite o payload para o endpoint api.php na Hostinger
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post("https://darkgray-duck-674813.hostingersite.com/api.php", json={
                    "codigo": codigo,
                    "payload": payload
                })
                if res.status_code in (200, 201):
                    logging.getLogger(__name__).info(f"Levantamento {lev_id} (código {codigo}) publicado na Hostinger com sucesso!")
                else:
                    logging.getLogger(__name__).warning(f"Aviso na sincronização Hostinger: HTTP {res.status_code} - {res.text}")
        except Exception as sync_err:
            logging.getLogger(__name__).warning(f"Não foi possível sincronizar com a Hostinger no momento (servidor offline ou sem conexão): {sync_err}")

        return {"codigo": codigo, "message": "Link de compartilhamento gerado e dados sincronizados com a nuvem!"}
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao gerar link de compartilhamento para lev_id={lev_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno: {str(e)}")

@router.get("/levantamentos/publico/{codigo}")
def get_levantamento_publico(codigo: str):
    try:
        # Busca o levantamento
        query_lev = """
            SELECT l.id, l.propriedade_id, l.data_inicio, l.status, l.numero_trt, l.data_trt, l.codigo_compartilhamento,
                   p.nome_propriedade, p.codigo_car, p.codigo_ccir, p.municipio, p.uf
            FROM levantamentos l
            JOIN propriedades p ON l.propriedade_id = p.id
            WHERE l.codigo_compartilhamento = ?
        """
        rows_lev = execute_query(query_lev, params=(codigo,), fetch_all=True)
        if not rows_lev:
            raise HTTPException(status_code=404, detail="Levantamento não encontrado ou link inválido.")
        
        lev_obj = dict(rows_lev[0])
        lev_id = lev_obj['id']
        prop_id = lev_obj['propriedade_id']

        # Busca proprietários de forma anônima (sem CPF, RG, endereços)
        query_proprietarios = """
            SELECT p.nome as nome_completo, pc.percentual_participacao
            FROM propriedade_clientes pc
            JOIN clientes c ON pc.cliente_id = c.id
            JOIN pessoas p ON c.pessoa_id = p.id
            WHERE pc.propriedade_id = ?
        """
        lev_obj['clientes'] = [dict(r) for r in execute_query(query_proprietarios, params=(prop_id,), fetch_all=True)]

        # Busca matrículas
        query_mat = "SELECT * FROM matriculas WHERE propriedade_id = ?"
        lev_obj['matriculas'] = [dict(r) for r in execute_query(query_mat, params=(prop_id,), fetch_all=True)]

        # Verifica se existem pontos homologados na tabela banco_pontos (Peças de Cartório)
        query_bp = """
            SELECT id, tipo_ponto as tipo, codigo_completo as nome_vertice, norte, este, altitude, lat, lon,
                   confrontante_descritivo as nome_confrontante, matricula_id
            FROM banco_pontos
            WHERE levantamento_id = ?
            ORDER BY id ASC
        """
        bp_rows = execute_query(query_bp, params=(lev_id,), fetch_all=True)

        if bp_rows and len(bp_rows) > 0:
            # Se a planilha de cartório foi enviada, envia EXCLUSIVAMENTE estes pontos homologados
            pontos = []
            for idx, r in enumerate(bp_rows, 1):
                p = dict(r)
                p['ordem_caminhamento'] = idx
                if (p.get('lat') is None or p.get('lon') is None or p.get('lat') == 0 or p.get('lon') == 0) and (p.get('norte') and p.get('este')):
                    try:
                        from pyproj import Transformer
                        tr = Transformer.from_crs("epsg:31982", "epsg:4674", always_xy=True)
                        lon_calc, lat_calc = tr.transform(p['este'], p['norte'])
                        p['lon'], p['lat'] = lon_calc, lat_calc
                    except Exception:
                        pass
                pontos.append(p)
            lev_obj['pontos'] = pontos
        else:
            # Caso contrário (sem planilha de cartório), envia os pontos de campo válidos (exclui vizinhos e ignorados)
            query_pts = """
                SELECT * FROM pontos 
                WHERE levantamento_id = ? 
                  AND (ponto_vizinho IS NULL OR ponto_vizinho = 0) 
                  AND (ignorar_poligono IS NULL OR ignorar_poligono = 0)
                ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
            """
            lev_obj['pontos'] = [dict(r) for r in execute_query(query_pts, params=(lev_id,), fetch_all=True)]

        # Busca segmentos
        query_seg = "SELECT * FROM segmentos WHERE levantamento_id = ?"
        lev_obj['segmentos'] = [dict(r) for r in execute_query(query_seg, params=(lev_id,), fetch_all=True)]

        return lev_obj
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao buscar levantamento público {codigo}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao carregar projeto público.")

@router.get("/levantamentos/{lev_id}/arquivos/download")
def download_arquivo_levantamento(lev_id: int, categoria: str, nome: str):
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        
        categorias = ["Brutos", "Rinex", "Processados", "Documentos", "Exportacoes"]
        if categoria not in categorias:
            raise HTTPException(status_code=400, detail="Categoria de pasta de arquivos inválida.")
            
        file_path = folder / categoria / nome
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="Arquivo não localizado no disco.")
            
        return FileResponse(file_path, filename=file_path.name)
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao fazer download de arquivo para lev_id={lev_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao baixar arquivo: {str(e)}")

# ── Tranca de Segurança e Arquivamento ─────────────────────────────────────────

class DesarquivarPayload(BaseModel):
    justificativa: str

@router.post("/levantamentos/{id}/arquivar")
def arquivar_levantamento(id: int):
    """Arquiva logicamente o levantamento (Tranca Read-Only), gera snapshot JSON e tranca a pasta no Windows"""
    lev_row = execute_query("SELECT id, status FROM levantamentos WHERE id = ?", params=(id,), fetch_one=True)
    if not lev_row: 
        raise HTTPException(status_code=404, detail="Levantamento não localizado.")
    
    wm = WorkspaceManager()
    snap_path = ExportacaoService.gerar_snapshot_arquivamento(id)
    
    execute_query("UPDATE levantamentos SET status = 'ARQUIVADO' WHERE id = ?", params=(id,), commit=True)
    wm.travar_workspace_inteiro_readonly(id)
    
    return {
        "message": "Levantamento arquivado com sucesso. Tranca de Segurança Read-Only ativada em banco e em disco.",
        "snapshot_fechamento": snap_path
    }

@router.post("/levantamentos/{id}/desarquivar")
def desarquivar_levantamento(id: int, payload: DesarquivarPayload):
    """Desarquiva sob justificativa formal de auditoria, restabelecendo a escrita lindeira"""
    lev_row = execute_query("SELECT id, status FROM levantamentos WHERE id = ?", params=(id,), fetch_one=True)
    if not lev_row: 
        raise HTTPException(status_code=404, detail="Levantamento não localizado.")
    
    execute_query(
        "INSERT INTO logs_auditoria_seguranca (levantamento_id, rota, metodo, usuario) VALUES (?, ?, ?, ?)",
        params=(id, f"/desarquivar - Justificativa: {payload.justificativa}", "POST", "Operador_Administrador"),
        commit=True
    )
    
    execute_query("UPDATE levantamentos SET status = 'EM_ANDAMENTO' WHERE id = ?", params=(id,), commit=True)
    
    wm = WorkspaceManager()
    wm.destravar_workspace_inteiro(id)
    
    return {"message": "Levantamento desarquivado com sucesso. Permissão de escrita restabelecida."}

@router.get("/levantamentos/{id}/historico-campo")
def obter_historico_campo(id: int):
    """Retorna o histórico cronológico de logs de auditoria e alterações de campo do levantamento"""
    try:
        rows = execute_query(
            "SELECT id, levantamento_id, timestamp, tipo_evento, descricao, dados_detalhados FROM historico_alteracoes_campo WHERE levantamento_id = ? ORDER BY timestamp DESC, id DESC",
            params=(id,),
            fetch_all=True
        )
        logs = []
        for r in rows:
            log_item = dict(r)
            try:
                log_item["dados_detalhados"] = json.loads(log_item["dados_detalhados"]) if log_item["dados_detalhados"] else {}
            except Exception:
                pass
            logs.append(log_item)
        return logs
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

