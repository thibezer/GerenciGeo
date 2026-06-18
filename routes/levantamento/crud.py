"""
routes/levantamento/crud.py — CRUD de Levantamentos e Gestão de Arquivos do Projeto
"""
import os
import stat
import shutil
import logging
import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database.connection import DatabaseManager, execute_query
from database.repository import HistoricoRinexRepo
from business.workspace_manager import WorkspaceManager
from business.triagem_inteligente import ler_metadados_rinex
from routes.deps import verificar_levantamento_arquivado
from routes.processamento import _converter_gns_background

router = APIRouter(tags=["Levantamentos (CRUD e Workspace)"])

# ── Modelos ────────────────────────────────────────────────────────────────────

class LevantamentoCreate(BaseModel):
    propriedade_id: int
    profissional_id: int
    data_inicio: str

class LevantamentoUpdate(BaseModel):
    propriedade_id: int
    profissional_id: int
    data_inicio: str
    status: str = "EM_ANDAMENTO"

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
        
        # Busca proprietários vinculados para cada levantamento
        for l in levantamentos:
            clients_query = """
                SELECT c.id, c.nome_completo, c.cpf_cnpj, pc.percentual_participacao
                FROM propriedade_clientes pc
                JOIN clientes c ON pc.cliente_id = c.id
                WHERE pc.propriedade_id = ?
            """
            l['clientes'] = [dict(r) for r in execute_query(clients_query, params=(l['propriedade_id'],), fetch_all=True)]
            
        return levantamentos
    except Exception as e:
        return {"error": str(e)}

@router.post("/levantamentos")
def create_levantamento(lev: LevantamentoCreate):
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio) VALUES (?, ?, ?)",
                (lev.propriedade_id, lev.profissional_id, lev.data_inicio)
            )
            lev_id = cursor.lastrowid
            conn.commit()
            
            # Criar Workspace físico e gerar DADOS_GERAIS.json
            wm = WorkspaceManager()
            pasta = wm.create_workspace(lev_id)
            
            # Atualiza o caminho físico no banco
            execute_query("UPDATE levantamentos SET pasta_projeto = ? WHERE id = ?", params=(pasta, lev_id), commit=True)
            
            # Gera DADOS_GERAIS.json unificado
            wm.gerar_documento_cliente_workspace(lev_id)
            
            return {"id": lev_id, "pasta_projeto": pasta, "message": "Levantamento e workspace criados"}
    except Exception as e:
        return {"error": str(e)}

@router.put("/levantamentos/{lev_id}")
def update_levantamento(lev_id: int, lev: LevantamentoUpdate):
    verificar_levantamento_arquivado(lev_id)
    try:
        execute_query("""
            UPDATE levantamentos
            SET propriedade_id = ?, profissional_id = ?, data_inicio = ?, status = ?
            WHERE id = ?
        """, params=(lev.propriedade_id, lev.profissional_id, lev.data_inicio, lev.status, lev_id), commit=True)
        
        # Regenera o Workspace DADOS_GERAIS.json
        wm = WorkspaceManager()
        wm.gerar_documento_cliente_workspace(lev_id)
        
        return {"message": "Levantamento atualizado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

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
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

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
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

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
        wm.gerar_documento_cliente_workspace(lev_id)
        
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
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        
        pasta_brutos = folder / "Brutos"
        pasta_rinex = folder / "Rinex"
        
        if not pasta_brutos.exists():
            return {"success": False, "message": "Pasta 'Brutos' não existe no workspace deste levantamento."}
            
        # Pega todos os arquivos brutos (.GNS ou .ZHD)
        arquivos_brutos = [f for f in os.listdir(pasta_brutos) if f.upper().endswith((".GNS", ".ZHD"))]
        if not arquivos_brutos:
            return {"success": False, "message": "Nenhum arquivo bruto (.GNS ou .ZHD) localizado na pasta 'Brutos'."}
            
        area_trabalho = r"D:\OneDrive_Thiago\OneDrive\Arquivos de Microsoft Copilot Chat\Área de Trabalho"
        diretorios_busca = [
            area_trabalho,
            str(pasta_rinex),
            str(folder)
        ]
        
        # Adiciona subpastas do HGO na Área de Trabalho
        if os.path.exists(area_trabalho):
            for item in os.listdir(area_trabalho):
                caminho_item = os.path.join(area_trabalho, item)
                if os.path.isdir(caminho_item):
                    diretorios_busca.append(caminho_item)
                    diretorios_busca.append(os.path.join(caminho_item, "Rinex"))
                    
        # Filtra pastas que existem
        diretorios_busca = list(set([os.path.normpath(d) for d in diretorios_busca if os.path.exists(d)]))
        
        import re
        encontrados = []
        copiados = []
        erros = []
        registrados = []
        
        repo = HistoricoRinexRepo()
        
        for arq_bruto in arquivos_brutos:
            prefixo = os.path.splitext(arq_bruto)[0].lower()
            tamanho_bruto = os.path.getsize(pasta_brutos / arq_bruto)
            
            for dir_busca in diretorios_busca:
                try:
                    for f in os.listdir(dir_busca):
                        caminho_completo = os.path.join(dir_busca, f)
                        if not os.path.isfile(caminho_completo):
                            continue
                            
                        nome_f, ext_f = os.path.splitext(f)
                        nome_f_lower = nome_f.lower()
                        ext_f_lower = ext_f.lower()
                        
                        # Verifica se pertence ao arquivo bruto
                        if nome_f_lower == prefixo or nome_f_lower.startswith(prefixo):
                            eh_rinex = False
                            if ext_f_lower in ['.obs', '.nav', '.o', '.n', '.g']:
                                eh_rinex = True
                            elif re.match(r'^\.\d{2}[ong]$', ext_f_lower):
                                eh_rinex = True
                                
                            if eh_rinex:
                                encontrados.append({
                                    "bruto": arq_bruto,
                                    "rinex": f,
                                    "origem": dir_busca,
                                    "caminho": caminho_completo
                                })
                                
                                # Move para a pasta Rinex
                                dest_caminho = pasta_rinex / f
                                if os.path.normpath(caminho_completo) != os.path.normpath(dest_caminho):
                                    try:
                                        if dest_caminho.exists():
                                            os.chmod(dest_caminho, stat.S_IWRITE)
                                        shutil.copy2(caminho_completo, dest_caminho)
                                        copiados.append(f)
                                    except Exception as e_copy:
                                        erros.append(f"Erro ao copiar {f}: {e_copy}")
                                        continue
                                
                                # Se for arquivo de observação, faz o parse dos metadados e registra no BD
                                if ext_f_lower in ['.obs', '.o'] or re.match(r'^\.\d{2}o$', ext_f_lower):
                                    try:
                                        meta = ler_metadados_rinex(str(dest_caminho))
                                        if meta:
                                            repo.insert(
                                                arquivo_nome=arq_bruto,
                                                arquivo_tamanho=tamanho_bruto,
                                                arquivo_path=str(pasta_brutos / arq_bruto),
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
                                                arquivo_nome=arq_bruto,
                                                arquivo_tamanho=tamanho_bruto,
                                                arquivo_path=str(pasta_brutos / arq_bruto),
                                                sucesso=True
                                            )
                                            registrados.append(f"{f} (sem metadados)")
                                    except Exception as e_db:
                                        erros.append(f"Erro ao registrar BD para {f}: {e_db}")
                                        
                except Exception as e_dir:
                    erros.append(f"Erro ao ler pasta {dir_busca}: {e_dir}")
                    
        # Regenera documentos
        wm.gerar_documento_cliente_workspace(lev_id)
        
        return {
            "success": True,
            "message": f"Busca finalizada. Encontrados {len(encontrados)} arquivos Rinex, copiados {len(copiados)}, registrados {len(registrados)}.",
            "arquivos_rinex_encontrados": encontrados,
            "arquivos_copiados": copiados,
            "arquivos_registrados": registrados,
            "erros": erros
        }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))

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
        return {"error": str(e)}

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
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

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
    snap_path = wm.gerar_snapshot_arquivamento(id)
    
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
            import json
            log_item = dict(r)
            try:
                log_item["dados_detalhados"] = json.loads(log_item["dados_detalhados"]) if log_item["dados_detalhados"] else {}
            except Exception:
                pass
            logs.append(log_item)
        return logs
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

