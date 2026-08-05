"""
routes/levantamento/documentos.py — Laudos, Requerimentos, Termos de Anuência e Exportações (Shapefile)
"""
import re
import os
import stat
import logging
import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Response
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel

from database.connection import DatabaseManager, execute_query
from services.gestores.workspace_manager import WorkspaceManager
from services.documentacao.exportacao_service import ExportacaoService
from routes.deps import verificar_levantamento_arquivado, verificar_propriedade_arquivada
from config import EXPORT_BASE_FOLDER

router = APIRouter(tags=["Documentos, Laudos e Exportações"])

# ── Modelos ────────────────────────────────────────────────────────────────────

class PayloadLaudoFronteira(BaseModel):
    matricula_id: int
    profissional_id: int
    numero_trt: str
    data_quitacao_trt: str = ""

class PayloadLaudoFronteiraLote(BaseModel):
    matriculas_ids: List[int]
    profissional_id: int
    numero_trt: str
    data_quitacao_trt: str = ""

class MatriculaFronteiraUpdate(BaseModel):
    id: int
    numero_matricula: str
    ccir: Optional[str] = ""
    itr: Optional[str] = ""
    area_ha: float = 0.0
    cri_comarca: Optional[str] = ""
    cri_circunscricao: Optional[str] = ""
    livro_registro: Optional[str] = ""
    folha_registro: Optional[str] = ""

class ProprietarioFronteiraUpdate(BaseModel):
    id: int
    nome_completo: str
    cpf_cnpj: str
    rg_ie: Optional[str] = ""
    estado_civil: Optional[str] = ""
    regime_bens: Optional[str] = ""
    nome_conjuge: Optional[str] = ""
    cpf_conjuge: Optional[str] = ""
    rg_conjuge: Optional[str] = ""

class PropriedadeFronteiraUpdate(BaseModel):
    id: int
    nome_propriedade: str
    municipio: str
    uf: str
    codigo_car: Optional[str] = ""
    codigo_ccir: Optional[str] = ""

class PayloadAtualizarDadosFronteira(BaseModel):
    propriedade: PropriedadeFronteiraUpdate
    proprietario: Optional[ProprietarioFronteiraUpdate] = None
    matriculas: List[MatriculaFronteiraUpdate]
    profissional_id: Optional[int] = None

# ── Rotas de Faixa de Fronteira ───────────────────────────────────────────────

@router.post("/propriedades/{prop_id}/upload-shapefile-fronteira")
async def upload_shapefile_fronteira(prop_id: int, matricula_id: Optional[int] = Query(None), file: UploadFile = File(...)):
    verificar_propriedade_arquivada(prop_id)
    try:
        if matricula_id:
            dest_dir = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / "Shapefile_Fronteira" / f"Matricula_{matricula_id}"
        else:
            dest_dir = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / "Shapefile_Fronteira"
            
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        # Purgar arquivos antigos da pasta de Shapefile
        for f in dest_dir.glob("*"):
            if f.is_file():
                try:
                    f.unlink()
                except Exception as ue:
                    logging.getLogger(__name__).warning(f"Não foi possível excluir {f.name}: {ue}")
                
        safe_filename = re.sub(r'[\\/*?:"<>|]', "", file.filename)
        dest_path = dest_dir / safe_filename
        
        with open(dest_path, "wb") as buffer:
            buffer.write(await file.read())
            
        from services.documentacao.report_generator import calcular_menor_distancia_fronteira
        dist_km, lat, lon = calcular_menor_distancia_fronteira(prop_id, matricula_id)
        
        return {
            "sucesso": True,
            "distancia_fronteira_km": round(dist_km, 3),
            "lat": lat,
            "lon": lon,
            "mensagem": f"Shapefile processado com sucesso! Distância de isolamento: {dist_km:.3f} km."
        }
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao processar shapefile de fronteira: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/laudo-fronteira-html", response_class=HTMLResponse)
def get_laudo_fronteira_html(id: int, matricula_id: int, numero_trt: str, data_trt: Optional[str] = ""):
    """Gera o laudo de fronteira em HTML estruturado de forma independente"""
    try:
        from services.documentacao.report_generator import BorderAreaReportGenerator
        html = BorderAreaReportGenerator.gerar_laudo_fronteira_html(
            lev_id=id,
            matricula_id=matricula_id,
            numero_trt=numero_trt,
            data_trt=data_trt
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/requerimento-ratificacao-html", response_class=HTMLResponse)
def get_requerimento_ratificacao_html(id: int, matricula_id: int):
    """Gera o requerimento de ratificação de fronteira em HTML estruturado de forma independente"""
    try:
        from services.documentacao.report_generator import BorderAreaReportGenerator
        html = BorderAreaReportGenerator.gerar_requerimento_ratificacao_html(
            lev_id=id,
            matricula_id=matricula_id
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/propriedades/{prop_id}/dados-fronteira")
def get_dados_fronteira(prop_id: int):
    """Consolida os dados da propriedade, de suas matrículas e do proprietário principal para o modal de fronteira"""
    try:
        prop = execute_query("SELECT id, nome_propriedade, municipio, uf, codigo_car, codigo_ccir FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
        if not prop:
            raise HTTPException(status_code=404, detail="Propriedade não encontrada")
        
        owner = execute_query("""
            SELECT c.id, p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie, p.estado_civil, p.regime_bens, 
                   p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge
            FROM propriedade_clientes pc
            JOIN clientes c ON pc.cliente_id = c.id
            JOIN pessoas p ON c.pessoa_id = p.id
            WHERE pc.propriedade_id = ?
            ORDER BY pc.percentual_participacao DESC, c.id ASC
            LIMIT 1
        """, params=(prop_id,), fetch_one=True)
        
        matriculas = execute_query("""
            SELECT m.id, m.numero_matricula, pr.codigo_ccir as ccir, m.itr, m.area_ha, m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro
            FROM matriculas m
            JOIN propriedades pr ON m.propriedade_id = pr.id
            WHERE m.propriedade_id = ?
        """, params=(prop_id,), fetch_all=True)
        
        matriculas_list = []
        for m in matriculas:
            m_dict = dict(m)
            folder_shp = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / "Shapefile_Fronteira" / f"Matricula_{m_dict['id']}"
            has_shp = folder_shp.exists() and (list(folder_shp.glob("*.shp")) or list(folder_shp.glob("*.zip")))
            m_dict["has_shapefile"] = bool(has_shp)
            
            try:
                from services.documentacao.report_generator import calcular_menor_distancia_fronteira
                dist_km, _, _ = calcular_menor_distancia_fronteira(prop_id, m_dict['id'])
                m_dict["distancia_fronteira_km"] = round(dist_km, 3)
            except Exception:
                m_dict["distancia_fronteira_km"] = None
                
            matriculas_list.append(m_dict)
            
        return {
            "propriedade": dict(prop),
            "proprietario": dict(owner) if owner else None,
            "matriculas": matriculas_list
        }
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao obter dados de fronteira: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/propriedades/{prop_id}/atualizar-dados-fronteira")
def post_atualizar_dados_fronteira(prop_id: int, payload: PayloadAtualizarDadosFronteira):
    """Atualiza dados de propriedade, do proprietário principal e das matrículas em lote"""
    verificar_propriedade_arquivada(prop_id)
    try:
        row_lev = execute_query(
            "SELECT id FROM levantamentos WHERE propriedade_id = ? ORDER BY status = 'EM_ANDAMENTO' DESC, id DESC LIMIT 1",
            params=(prop_id,),
            fetch_one=True
        )
        lev_id = row_lev["id"] if row_lev else None
        
        if not lev_id and payload.profissional_id:
            from datetime import date
            data_atual = date.today().strftime("%Y-%m-%d")
            
            with DatabaseManager() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio) VALUES (?, ?, ?)",
                    (prop_id, payload.profissional_id, data_atual)
                )
                lev_id = cursor.lastrowid
                conn.commit()
                
            wm = WorkspaceManager()
            pasta = wm.create_workspace(lev_id)
            execute_query("UPDATE levantamentos SET pasta_projeto = ? WHERE id = ?", params=(pasta, lev_id), commit=True)
            ExportacaoService.gerar_documento_cliente_workspace(lev_id)
            logging.getLogger(__name__).info(f"[FRONTEIRA] Criado levantamento automático ID {lev_id} para a propriedade ID {prop_id}.")

        p = payload.propriedade
        execute_query("""
            UPDATE propriedades 
            SET nome_propriedade = ?, municipio = ?, uf = ?, codigo_car = ?, codigo_ccir = ?
            WHERE id = ?
        """, params=(p.nome_propriedade, p.municipio, p.uf, p.codigo_car, p.codigo_ccir, prop_id), commit=True)
        
        if payload.proprietario:
            o = payload.proprietario
            row_cli = execute_query("SELECT pessoa_id FROM clientes WHERE id = ?", params=(o.id,), fetch_one=True)
            if row_cli:
                pessoa_id = row_cli["pessoa_id"]
                execute_query("""
                    UPDATE pessoas
                    SET nome = ?, cpf_cnpj = ?, rg = ?, estado_civil = ?, regime_bens = ?,
                        nome_conjuge = ?, cpf_conjuge = ?, rg_conjuge = ?
                    WHERE id = ?
                """, params=(o.nome_completo, o.cpf_cnpj if (o.cpf_cnpj and str(o.cpf_cnpj).strip()) else None, o.rg_ie, o.estado_civil, o.regime_bens,
                             o.nome_conjuge, o.cpf_conjuge, o.rg_conjuge, pessoa_id), commit=True)
            
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.executemany("""
                UPDATE matriculas 
                SET numero_matricula = ?, itr = ?, area_ha = ?, cri_comarca = ?, 
                    cri_circunscricao = ?, livro_registro = ?, folha_registro = ?
                WHERE id = ? AND propriedade_id = ?
            """, [(m.numero_matricula, m.itr, m.area_ha, m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro, m.id, prop_id) for m in payload.matriculas])
            conn.commit()
            
        query_ativos = "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'EM_ANDAMENTO'"
        ativos = execute_query(query_ativos, params=(prop_id,), fetch_all=True)
        wm = WorkspaceManager()
        for at in ativos:
            ExportacaoService.gerar_documento_cliente_workspace(at['id'])
            
        return {
            "sucesso": True, 
            "mensagem": "Dados de fronteira atualizados e sincronizados com sucesso!",
            "levantamento_id": lev_id
        }
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao atualizar dados de fronteira em lote: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ── Relatórios de Cartório e Anuências ─────────────────────────────────────────

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/requerimento-cartorio-html", response_class=HTMLResponse)
def get_requerimento_cartorio_html(id: int, matricula_id: int, numero_trt: Optional[str] = None, data_trt: Optional[str] = ""):
    try:
        from services.documentacao.cartorio_generator import CartorioReportGenerator
        html = CartorioReportGenerator.gerar_requerimento_cartorio_html(
            lev_id=id,
            matricula_id=matricula_id,
            numero_trt=numero_trt,
            data_trt=data_trt
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/declaracao-responsabilidade-html", response_class=HTMLResponse)
def get_declaracao_responsabilidade_html(id: int, matricula_id: int):
    try:
        from services.documentacao.cartorio_generator import CartorioReportGenerator
        html = CartorioReportGenerator.gerar_declaracao_responsabilidade_html(
            lev_id=id,
            matricula_id=matricula_id
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/laudo-tecnico-html", response_class=HTMLResponse)
def get_laudo_tecnico_html(id: int, matricula_id: int, numero_trt: Optional[str] = None, data_trt: Optional[str] = "", equipamento: Optional[str] = ""):
    try:
        from services.documentacao.cartorio_generator import CartorioReportGenerator
        html = CartorioReportGenerator.gerar_laudo_tecnico_html(
            lev_id=id,
            matricula_id=matricula_id,
            numero_trt=numero_trt,
            data_trt=data_trt,
            equipamento=equipamento
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/termo-responsabilidade-sigef-html", response_class=HTMLResponse)
def get_termo_responsabilidade_sigef_html(id: int, matricula_id: int, numero_trt: Optional[str] = None, data_trt: Optional[str] = ""):
    try:
        from services.documentacao.cartorio_generator import CartorioReportGenerator
        html = CartorioReportGenerator.gerar_termo_responsabilidade_sigef_html(
            lev_id=id,
            matricula_id=matricula_id,
            numero_trt=numero_trt,
            data_trt=data_trt
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/manual-proprietario-html", response_class=HTMLResponse)
def get_manual_proprietario_html(id: int, matricula_id: int):
    try:
        from services.documentacao.cartorio_generator import CartorioReportGenerator
        html = CartorioReportGenerator.gerar_manual_proprietario_html(
            lev_id=id,
            matricula_id=matricula_id
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/declaracao-anuencia-desmembramento-html", response_class=HTMLResponse)
def get_declaracao_anuencia_desmembramento_html(id: int, matricula_id: int, codigo_cns: Optional[str] = Query(None), qtd_parcelas: int = Query(3)):
    try:
        from services.documentacao.cartorio_generator import CartorioReportGenerator
        html = CartorioReportGenerator.gerar_declaracao_anuencia_desmembramento_html(
            lev_id=id,
            matricula_id=matricula_id,
            codigo_cns=codigo_cns,
            qtd_parcelas=qtd_parcelas
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/levantamentos/{id}/matriculas/{matricula_id}/confrontantes/{confrontante_id}/anuencia-html", response_class=HTMLResponse)
def get_declaracao_anuencia_html(id: int, matricula_id: int, confrontante_id: int):
    try:
        from services.documentacao.cartorio_generator import CartorioReportGenerator
        html = CartorioReportGenerator.gerar_declaracao_anuencia_html(
            lev_id=id,
            matricula_id=matricula_id,
            confrontante_id=confrontante_id
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/anuencia-lote-html", response_class=HTMLResponse)
def get_declaracao_anuencia_lote_html(id: int, matricula_id: int, confrontantes_ids: Optional[str] = Query(None)):
    try:
        from services.documentacao.cartorio_generator import CartorioReportGenerator
        html = CartorioReportGenerator.gerar_declaracao_anuencia_lote_html(
            lev_id=id,
            matricula_id=matricula_id,
            confrontantes_ids=confrontantes_ids
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/levantamentos/{id}/documentos/gerar-requerimento", response_class=HTMLResponse)
def gerar_requerimento(id: int, matricula_id: int):
    try:
        from services.gestores.levantamento_manager import gerar_requerimento_html
        html = gerar_requerimento_html(id, matricula_id)
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/levantamentos/{id}/documentos/anuencias/{confrontante_id}/pdf", response_class=HTMLResponse)
def gerar_termo_anuencia_na_matricula(id: int, confrontante_id: int):
    try:
        from services.gestores.levantamento_manager import gerar_termo_anuencia_html
        html = gerar_termo_anuencia_html(id, confrontante_id)
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/levantamentos/{id}/documentos/anuencias/{confrontante_id}/upload")
async def upload_anuencia_assinada(id: int, confrontante_id: int, file: UploadFile = File(...)):
    """Recebe o termo assinado digitalizado e atualiza o status de anuência da confrontação"""
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(id)
        pasta_anuencias = folder / "Documentos" / "Anuancias"
        pasta_anuencias.mkdir(parents=True, exist_ok=True)
        
        row_mat = execute_query(
            """
            SELECT m.numero_matricula 
            FROM segmentos s
            JOIN matriculas m ON s.matricula_id = m.id
            WHERE s.confrontante_id = ? AND s.levantamento_id = ?
            LIMIT 1
            """,
            params=(confrontante_id, id),
            fetch_one=True
        )
        matricula_num = row_mat["numero_matricula"] if (row_mat and row_mat["numero_matricula"]) else "SEM_MATRICULA"
        
        # Correção: Captura a extensão real do arquivo
        extensao = Path(file.filename).suffix if file.filename else ".pdf"
        
        caminho_salvo = pasta_anuencias / f"anuencia_matricula_{matricula_num}_{confrontante_id}_assinado{extensao}"
        with open(caminho_salvo, "wb") as buffer:
            buffer.write(await file.read())
            
        exists = execute_query("SELECT id FROM anuencias_confrontantes WHERE levantamento_id = ? AND confrontante_id = ?", params=(id, confrontante_id), fetch_one=True)
        if exists:
            execute_query(
                "UPDATE anuencias_confrontantes SET status_anuencia = 'ASSINADO', caminho_documento_assinado = ? WHERE levantamento_id = ? AND confrontante_id = ?",
                params=(str(caminho_salvo), id, confrontante_id), commit=True
            )
        else:
            execute_query(
                "INSERT INTO anuencias_confrontantes (levantamento_id, confrontante_id, status_anuencia, caminho_documento_assinado) VALUES (?, ?, 'ASSINADO', ?)",
                params=(id, confrontante_id, str(caminho_salvo)), commit=True
            )
            
        return {"message": "Anuência assinada arquivada e registrada com sucesso.", "caminho_fisico": str(caminho_salvo)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{id}/documentos/status-cartorio")
def status_cartorio(id: int):
    """Consolida um relatório completo de pendências civis, de CRI e de confrontantes para dar entrada no cartório"""
    try:
        lev_row = execute_query(
            "SELECT l.*, p.nome_propriedade FROM levantamentos l JOIN propriedades p ON l.propriedade_id = p.id WHERE l.id = ?",
            params=(id,), fetch_one=True
        )
        if not lev_row: 
            raise HTTPException(status_code=404, detail="Levantamento não localizado.")
        lev = dict(lev_row)
        prop_id = lev["propriedade_id"]
        
        clientes_prop = execute_query(
            "SELECT c.* FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id WHERE pc.propriedade_id = ?",
            params=(prop_id,), fetch_all=True
        )
        clientes_qualificados = True
        proprietarios_pendencias = []
        for c in clientes_prop:
            civil = dict(c)
            if not civil.get("cpf_cnpj") or not civil.get("endereco_completo") or not civil.get("rg_ie"):
                clientes_qualificados = False
                proprietarios_pendencias.append(f"Proprietário {civil.get('nome_completo')} com qualificação civil incompleta.")
                
        matriculas_prop = execute_query("SELECT * FROM matriculas WHERE propriedade_id = ?", params=(prop_id,), fetch_all=True)
        matriculas_qualificadas = True
        matriculas_pendencias = []
        for m in matriculas_prop:
            mat = dict(m)
            if not mat.get("cri_comarca") or not mat.get("cri_circunscricao") or not mat.get("livro_registro") or not mat.get("folha_registro"):
                matriculas_qualificadas = False
                matriculas_pendencias.append(f"Matrícula {mat.get('numero_matricula')} sem metadados do CRI definidos.")
                
        query_confrontantes = """
            SELECT c.*, p.nome
            FROM confrontantes c
            JOIN pessoas p ON c.pessoa_id = p.id
            WHERE c.levantamento_id = ?
        """
        confrontantes = execute_query(query_confrontantes, params=(id,), fetch_all=True)
        conf_total = len(confrontantes)
        
        anuencias_rows = execute_query("SELECT * FROM anuencias_confrontantes WHERE levantamento_id = ?", params=(id,), fetch_all=True)
        anuencias = {a["confrontante_id"]: dict(a) for a in anuencias_rows}
        
        conf_assinados = 0
        conf_pendentes_nomes = []
        
        for c in confrontantes:
            conf_id = c["id"]
            status_anu = anuencias.get(conf_id, {}).get("status_anuencia", "PENDENTE")
            if status_anu in ["ASSINADO", "DISPENSADO"]:
                conf_assinados += 1
            else:
                conf_pendentes_nomes.append(c["nome"])
                
        pronto = clientes_qualificados and matriculas_qualificadas and (conf_assinados == conf_total)
        
        pendencias = proprietarios_pendencias + matriculas_pendencias
        for nome in conf_pendentes_nomes:
            pendencias.append(f"Falta assinatura do Termo de Anuência de {nome}.")
            
        return {
            "levantamento_id": id,
            "propriedade": lev["nome_propriedade"],
            "proprietarios_qualificados": clientes_qualificados,
            "matriculas_qualificadas": matriculas_qualificadas,
            "confrontantes_totais": conf_total,
            "confrontantes_assinados": conf_assinados,
            "confrontantes_pendentes": conf_pendentes_nomes,
            "pronto_para_registro": pronto,
            "pendencias_cartorio": pendencias
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Arquivos e Consolidações da Propriedade ────────────────────────────────────

@router.get("/propriedades/{prop_id}/arquivos")
def get_arquivos_propriedade(prop_id: int):
    try:
        docs_dir = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / "Documentos"
        if not docs_dir.exists():
            return {"Documentos": []}
            
        arquivos = []
        for f in docs_dir.glob("*.docx"):
            if f.is_file():
                stat_info = f.stat()
                modificado = datetime.datetime.fromtimestamp(stat_info.st_mtime).strftime("%d/%m/%Y %H:%M")
                tamanho_kb = max(1, round(stat_info.st_size / 1024))
                arquivos.append({
                    "nome": f.name,
                    "tamanho": f"{tamanho_kb} KB",
                    "modificado": modificado
                })
        return {"Documentos": arquivos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/propriedades/{prop_id}/arquivos/download")
def download_arquivo_propriedade(prop_id: int, nome: str):
    try:
        safe_name = re.sub(r'[\\/*?:"<>|]', "", nome)
        file_path = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / "Documentos" / safe_name
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Arquivo não localizado no workspace da propriedade.")
            
        return FileResponse(
            path=str(file_path),
            filename=safe_name,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/levantamentos/{id}/consolidar-pontos")
def endpoint_consolidar_pontos(id: int):
    verificar_levantamento_arquivado(id)
    try:
        wm = WorkspaceManager()
        caminho_arquivo = ExportacaoService.consolidar_pontos_levantamento(id)
        return {
            "success": True,
            "message": "Pontos consolidados com coordenadas UTM corrigidas e confrontantes mapeados com sucesso!",
            "arquivo": "PONTOS_CONSOLIDADOS_UTM.csv",
            "caminho_completo": caminho_arquivo
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/levantamentos/{lev_id}/arquivos/deletar")
def deletar_arquivo_levantamento(lev_id: int, categoria: str, nome: str):
    verificar_levantamento_arquivado(lev_id)
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        
        categorias = ["Brutos", "Rinex", "Processados", "Documentos", "Exportacoes"]
        if categoria not in categorias:
            raise HTTPException(status_code=400, detail="Categoria de pasta de arquivos inválida.")
            
        # Correção 1: Limpeza de Path Traversal
        safe_nome = Path(nome).name
        file_path = folder / categoria / safe_nome
        
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="Arquivo não localizado no disco.")
            
        try:
            # Correção 2: Import stat adicionado no topo
            os.chmod(file_path, stat.S_IWRITE)
        except Exception:
            pass
            
        os.remove(file_path)

        pontos_removidos = 0
        if categoria == "Processados" and safe_nome.lower().endswith(".txt"):
            count_row = execute_query(
                "SELECT COUNT(*) as qtd FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ?",
                params=(lev_id, safe_nome),
                fetch_one=True
            )
            pontos_removidos = count_row["qtd"] if count_row else 0
            execute_query(
                "DELETE FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ?",
                params=(lev_id, safe_nome),
                commit=True
            )
            logging.getLogger(__name__).info(f"[WORKSPACE] Purgados {pontos_removidos} pontos pertencentes ao lote/arquivo deletado: {safe_nome}")
            
        return {
            "success": True, 
            "message": f"Arquivo '{safe_nome}' excluído com sucesso do repositório físico.",
            "pontos_removidos": pontos_removidos
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

# ── Exportação de Shapefile (.ZIP) ─────────────────────────────────────────────

@router.get("/levantamentos/{id}/matriculas/{matricula_id}/exportar-shapefile")
def exportar_shapefile_endpoint(id: int, matricula_id: int):
    try:
        from services.documentacao.shape_exporter import ShapefileExporter
        zip_bytes = ShapefileExporter.exportar_matricula_zip(id, matricula_id)
        
        headers = {
            "Content-Disposition": f'attachment; filename="matricula_{matricula_id}_shapefile.zip"'
        }
        return Response(content=zip_bytes, media_type="application/zip", headers=headers)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao exportar Shapefile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao gerar o Shapefile: {str(e)}")