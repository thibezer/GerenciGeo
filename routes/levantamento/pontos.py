"""
routes/levantamento/pontos.py — Gestão de Pontos de Campo, Matrículas e Ordenação
"""
import os
import re
import stat
import shutil
import logging
import datetime
from typing import List, Optional, Literal
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from utils.transformer_cache import get_transformer

from database.connection import DatabaseManager, execute_query
from services.gestores.workspace_manager import WorkspaceManager
from services.documentacao.exportacao_service import ExportacaoService
from services.parsers.txt_parser import TxtGeodesicParser
from services.gestores.levantamento_manager import salvar_ordem_caminhamento
from routes.deps import verificar_levantamento_arquivado

router = APIRouter(tags=["Pontos de Campo & Matrículas do Levantamento"])

# ── Modelos ────────────────────────────────────────────────────────────────────

class PontoCreate(BaseModel):
    matricula_id: int
    nome_vertice: str
    tipo_ponto: Literal['M', 'P', 'V', 'B']
    lat: float
    lon: float
    alt: float
    sigma_lat: float = 0.0
    sigma_lon: float = 0.0
    sigma_alt: float = 0.0
    ordem_caminhamento: Optional[int] = None
    status_ponto: str = "BRUTO"
    ponto_base_id: Optional[int] = None

class MatriculaCreate(BaseModel):
    numero_matricula: str
    ccir: Optional[str] = None
    codigo_ccir: Optional[str] = None
    itr: Optional[str] = None
    codigo_itr: Optional[str] = None
    area_ha: Optional[float] = None
    area_registrada_ha: Optional[float] = None
    valor_itr: Optional[float] = None
    denominacao: Optional[str] = None
    denominacao_gleba: Optional[str] = None
    georreferenciamento: Optional[str] = None

class PayloadAssociarBase(BaseModel):
    ponto_id_selecionado: int
    base_ppp_id: int

class PayloadOverrideManual(BaseModel):
    arquivo_origem: str
    dados_brutos: dict
    dados_corrigidos: dict

class ItemOrdemPonto(BaseModel):
    id: int
    ordem: int

class PayloadSalvarOrdem(BaseModel):
    pontos_ordem: List[ItemOrdemPonto]

# ── Funções Auxiliares ──────────────────────────────────────────────────────────

def sanitizar_ordens_duplicadas(levantamento_id: int):
    """
    Garante de forma robusta e determinística que não existam ordens de caminhamento duplicadas
    dentro do mesmo levantamento (divididas por matrícula) ou em pontos sem matrícula associada.
    Bases do tipo 'B' são mantidas com ordem NULL de forma rigorosa.
    """
    logger = logging.getLogger(__name__)
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()

            # 1. Sanitizar pontos de cada matrícula do levantamento
            cursor.execute(
                "SELECT DISTINCT matricula_id FROM pontos WHERE levantamento_id = ? AND matricula_id IS NOT NULL",
                (levantamento_id,)
            )
            matriculas = [r["matricula_id"] for r in cursor.fetchall()]

            for mid in matriculas:
                # Seleciona todos os pontos dessa matrícula, ignorando o tipo 'B'
                cursor.execute(
                    """
                    SELECT id, ordem_caminhamento, tipo_ponto
                    FROM pontos
                    WHERE levantamento_id = ? AND matricula_id = ? AND tipo_ponto != 'B'
                    ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
                    """,
                    (levantamento_id, mid)
                )
                rows = cursor.fetchall()
                
                ordens = [r["ordem_caminhamento"] for r in rows if r["ordem_caminhamento"] is not None]
                tem_duplicidade = len(ordens) != len(set(ordens))
                tem_nulo = any(r["ordem_caminhamento"] is None for r in rows)

                if tem_duplicidade or tem_nulo:
                    logger.info(f"[SANITIZACAO_ORDEM] Corrigindo ordens para levantamento={levantamento_id}, matricula={mid}")
                    update_data = []
                    nova_ordem = 1
                    for r in rows:
                        update_data.append((nova_ordem, r["id"]))
                        nova_ordem += 1
                    cursor.executemany("UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?", update_data)

            # 2. Sanitizar pontos sem matrícula (avulsos)
            cursor.execute(
                """
                SELECT id, ordem_caminhamento, tipo_ponto
                FROM pontos
                WHERE levantamento_id = ? AND matricula_id IS NULL AND tipo_ponto != 'B'
                ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
                """,
                (levantamento_id,)
            )
            rows_avulsos = cursor.fetchall()
            
            ordens_avulsas = [r["ordem_caminhamento"] for r in rows_avulsos if r["ordem_caminhamento"] is not None]
            tem_duplicidade_avulsa = len(ordens_avulsas) != len(set(ordens_avulsas))
            tem_nulo_avulso = any(r["ordem_caminhamento"] is None for r in rows_avulsos)

            if tem_duplicidade_avulsa or tem_nulo_avulso:
                logger.info(f"[SANITIZACAO_ORDEM] Corrigindo ordens avulsas para levantamento={levantamento_id}")
                update_data = []
                nova_ordem = 1
                for r in rows_avulsos:
                    update_data.append((nova_ordem, r["id"]))
                    nova_ordem += 1
                cursor.executemany("UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?", update_data)

            conn.commit()
    except Exception as e:
        logger.error(f"[SANITIZACAO_ORDEM] Falha ao sanitizar ordens: {e}")

# ── Rotas de Matrículas do Levantamento ────────────────────────────────────────

@router.get("/levantamentos/{id}/matriculas")
def get_matriculas_do_levantamento(id: int):
    try:
        query = """
            SELECT m.* 
            FROM matriculas m
            JOIN propriedades p ON m.propriedade_id = p.id
            JOIN levantamentos l ON l.propriedade_id = p.id
            WHERE l.id = ?
        """
        return [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/levantamentos/{id}/matriculas")
def create_matricula(id: int, m: MatriculaCreate):
    verificar_levantamento_arquivado(id)
    try:
        row = execute_query("SELECT propriedade_id FROM levantamentos WHERE id = ?", params=(id,), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Levantamento não encontrado")
        propriedade_id = row['propriedade_id']
        
        query = "INSERT INTO matriculas (propriedade_id, numero_matricula, itr, area_ha, valor_itr, denominacao, georreferenciamento) VALUES (?, ?, ?, ?, ?, ?, ?)"
        execute_query(query, params=(propriedade_id, m.numero_matricula, m.itr, m.area_ha, m.valor_itr, m.denominacao, m.georreferenciamento), commit=True)
        
        query_ativos = "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'EM_ANDAMENTO'"
        ativos = execute_query(query_ativos, params=(propriedade_id,), fetch_all=True)
        wm = WorkspaceManager()
        for at in ativos:
            ExportacaoService.gerar_documento_cliente_workspace(at['id'])
            
        return {"message": "Matrícula adicionada com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/matriculas/{mid}")
def update_matricula(mid: int, m: MatriculaCreate):
    try:
        antigo = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
        if not antigo:
            raise HTTPException(status_code=404, detail="Matrícula não encontrada")
        propriedade_id = antigo["propriedade_id"]
        
        rows_lev = execute_query("SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'ARQUIVADO'", params=(propriedade_id,), fetch_all=True)
        if rows_lev:
            raise HTTPException(status_code=403, detail="Operação bloqueada: A matrícula pertence a um levantamento arquivado (Tranca Read-Only ativa).")
            
        area = m.area_registrada_ha if m.area_registrada_ha is not None and m.area_registrada_ha > 0 else (m.area_ha or 0.0)
        ccir_val = m.codigo_ccir or m.ccir
        itr_val = m.codigo_itr or m.itr
        denominacao_val = m.denominacao_gleba or m.denominacao

        query = """
            UPDATE matriculas 
            SET numero_matricula = ?, itr = ?, area_ha = ?, valor_itr = ?, denominacao = ?, georreferenciamento = ?
            WHERE id = ?
        """
        execute_query(query, params=(m.numero_matricula, itr_val, area, m.valor_itr, denominacao_val, m.georreferenciamento, mid), commit=True)
        
        campos_monitorados = [
            ("numero_matricula", m.numero_matricula, str),
            ("itr", itr_val, str),
            ("area_ha", area, float),
            ("valor_itr", m.valor_itr, float),
            ("denominacao", denominacao_val, str),
            ("georreferenciamento", m.georreferenciamento, str)
        ]
        
        logs_historico = []
        for campo, novo_valor, tipo in campos_monitorados:
            val_antigo = antigo[campo]
            if val_antigo is not None:
                if tipo == float:
                    val_antigo_cmp = float(val_antigo)
                else:
                    val_antigo_cmp = str(val_antigo).strip()
            else:
                val_antigo_cmp = None
                
            if novo_valor is not None:
                if tipo == float:
                    novo_valor_cmp = float(novo_valor)
                else:
                    novo_valor_cmp = str(novo_valor).strip()
            else:
                novo_valor_cmp = None
                
            if val_antigo_cmp != novo_valor_cmp:
                logs_historico.append((mid, campo, str(val_antigo) if val_antigo is not None else None, str(novo_valor) if novo_valor is not None else None))

        if logs_historico:
            with DatabaseManager() as conn:
                cursor = conn.cursor()
                cursor.executemany("INSERT INTO matricula_historico_logs (id_matricula, campo_alterado, valor_antigo, valor_novo) VALUES (?, ?, ?, ?)", logs_historico)
                conn.commit()

        query_ativos = "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'EM_ANDAMENTO'"
        ativos = execute_query(query_ativos, params=(propriedade_id,), fetch_all=True)
        wm = WorkspaceManager()
        for at in ativos:
            ExportacaoService.gerar_documento_cliente_workspace(at['id'])
            
        return {"message": "Matrícula atualizada e sincronizada com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/matriculas/{mid}")
def delete_matricula(mid: int):
    try:
        row = execute_query("SELECT propriedade_id FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
        if row:
            propriedade_id = row['propriedade_id']
            
            rows_lev = execute_query("SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'ARQUIVADO'", params=(propriedade_id,), fetch_all=True)
            if rows_lev:
                raise HTTPException(status_code=403, detail="Operação bloqueada: A matrícula pertence a um levantamento arquivado (Tranca Read-Only ativa).")
                
            execute_query("DELETE FROM matriculas WHERE id = ?", params=(mid,), commit=True)
            
            query_ativos = "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'EM_ANDAMENTO'"
            ativos = execute_query(query_ativos, params=(propriedade_id,), fetch_all=True)
            wm = WorkspaceManager()
            for at in ativos:
                ExportacaoService.gerar_documento_cliente_workspace(at['id'])
                
        return {"message": "Matrícula removida"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/matriculas/{mid}/upload-pdf")
async def upload_matricula_pdf(mid: int, file: UploadFile = File(...)):
    try:
        row = execute_query("SELECT propriedade_id, numero_matricula FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Matrícula não encontrada")
        
        prop_id = row["propriedade_id"]
        from config import EXPORT_BASE_FOLDER
        prop_folder = os.path.join(EXPORT_BASE_FOLDER, "Propriedades", f"Prop_{prop_id}")
        os.makedirs(prop_folder, exist_ok=True)
        
        ext = os.path.splitext(file.filename)[1]
        if not ext:
            ext = ".pdf"
        
        filename = f"Matricula_{mid}_Certidao{ext}"
        filepath = os.path.join(prop_folder, filename)
        
        with open(filepath, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
            
        execute_query("UPDATE matriculas SET caminho_arquivo_pdf = ? WHERE id = ?", params=(filepath, mid), commit=True)
        return {"message": "PDF da matrícula anexado com sucesso", "caminho": filepath}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/matriculas/{mid}/download-pdf")
def download_matricula_pdf(mid: int):
    try:
        row = execute_query("SELECT caminho_arquivo_pdf FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
        if not row or not row["caminho_arquivo_pdf"]:
            raise HTTPException(status_code=404, detail="PDF da matrícula não encontrado")
        
        path = row["caminho_arquivo_pdf"]
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Arquivo físico não encontrado no servidor")
            
        return FileResponse(path, filename=os.path.basename(path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/matriculas/{mid}/pdf")
def delete_matricula_pdf(mid: int):
    try:
        row = execute_query("SELECT caminho_arquivo_pdf FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
        if row and row["caminho_arquivo_pdf"]:
            path = row["caminho_arquivo_pdf"]
            if os.path.exists(path):
                os.remove(path)
        execute_query("UPDATE matriculas SET caminho_arquivo_pdf = NULL WHERE id = ?", params=(mid,), commit=True)
        return {"message": "PDF da matrícula excluído com sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/matriculas/{mid}/historico")
def get_matricula_historico(mid: int):
    try:
        query = "SELECT campo_alterado, valor_antigo, valor_novo, data_alteracao FROM matricula_historico_logs WHERE id_matricula = ? ORDER BY data_alteracao DESC"
        logs = [dict(r) for r in execute_query(query, params=(mid,), fetch_all=True)]
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Rotas de Pontos ────────────────────────────────────────────────────────────

@router.get("/levantamentos/{id}/pontos")
def get_pontos(id: int):
    try:
        sanitizar_ordens_duplicadas(id)
        query = """
            SELECT p.*, m.numero_matricula 
            FROM pontos p
            LEFT JOIN matriculas m ON p.matricula_id = m.id
            WHERE p.levantamento_id = ?
              AND (p.origem_homologada IS NULL OR p.origem_homologada = 0)
              AND (p.ponto_vizinho IS NULL OR p.ponto_vizinho = 0)
            ORDER BY CASE WHEN p.matricula_id IS NULL THEN 1 ELSE 0 END ASC, p.matricula_id ASC, CASE WHEN p.ordem_caminhamento IS NULL OR p.ordem_caminhamento = 0 THEN 999999 ELSE p.ordem_caminhamento END ASC, p.id ASC
        """
        rows = [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
        
        for p in rows:
            p["e_corrigido"] = None
            p["n_corrigido"] = None
            lat_c = p.get("lat_corrigido") or p.get("lat")
            lon_c = p.get("lon_corrigido") or p.get("lon")
            if lat_c and lon_c:
                try:
                    zona_utm = int((lon_c + 180) / 6) + 1
                    epsg_code = f"319{60 + zona_utm}"
                    transformer = get_transformer("epsg:4674", f"epsg:{epsg_code}", always_xy=True)
                    e_corr, n_corr = transformer.transform(lon_c, lat_c)
                    p["e_corrigido"] = round(e_corr, 3)
                    p["n_corrigido"] = round(n_corr, 3)
                except Exception:
                    pass
        return rows
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao buscar pontos: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno de banco de dados: {str(e)}")

@router.post("/levantamentos/{id}/pontos")
def create_ponto(id: int, p: PontoCreate):
    verificar_levantamento_arquivado(id)
    if p.tipo_ponto not in ['M', 'P', 'V', 'B']:
        raise HTTPException(status_code=400, detail=f"Tipo de ponto inválido '{p.tipo_ponto}'. Deve ser 'M', 'P', 'V' ou 'B'.")
    try:
        ordem = p.ordem_caminhamento
        if not ordem and p.tipo_ponto != 'B':
            if p.matricula_id:
                row_max = execute_query("SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ? AND matricula_id = ?", params=(id, p.matricula_id), fetch_one=True)
            else:
                row_max = execute_query("SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ?", params=(id,), fetch_one=True)
            max_ord = row_max["max_ord"] if row_max else None
            ordem = (max_ord + 1) if max_ord is not None else 1

        status_final = "CORRIGIDO" if p.tipo_ponto == 'V' else p.status_ponto

        query = """
            INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, status_ponto, status_correcao, ponto_base_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        execute_query(query, params=(
            id, p.matricula_id, p.nome_vertice, p.tipo_ponto, p.lat, p.lon, p.alt, 
            p.sigma_lat, p.sigma_lon, p.sigma_alt, ordem, status_final, status_final, p.ponto_base_id
        ), commit=True)
        
        sanitizar_ordens_duplicadas(id)
        return {"message": "Ponto cadastrado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/pontos/{pid}")
def delete_ponto(pid: int):
    try:
        row = execute_query("SELECT levantamento_id, nome_vertice, tipo_ponto, lat, lon, alt, ponto_vizinho FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        if row:
            p_data = dict(row)
            if p_data.get("ponto_vizinho") == 1:
                raise HTTPException(status_code=403, detail="Pontos de confrontantes/vizinhos são imutáveis e não podem ser excluídos individualmente.")
            verificar_levantamento_arquivado(p_data["levantamento_id"])
            
            check_base_uso = execute_query("SELECT COUNT(*) as count FROM pontos WHERE ponto_base_id = ?", params=(pid,), fetch_one=True)
            eh_base_apoio = check_base_uso and check_base_uso["count"] > 0
            
            if p_data["tipo_ponto"] == "B" or eh_base_apoio:
                from services.processamento.geoprocessamento import reverter_rovers_para_bruto
                reverter_rovers_para_bruto(p_data["levantamento_id"], pid)
            
            execute_query("DELETE FROM pontos WHERE id = ?", params=(pid,), commit=True)
            
            from services.processamento.historico_campo import HistoricoCampoLogger
            desc = f"Vértice {p_data['nome_vertice']} do Tipo '{p_data['tipo_ponto']}' foi excluído definitivamente pelo usuário."
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=p_data["levantamento_id"],
                tipo_evento="EXCLUSAO_PONTO",
                descricao=desc,
                dados_detalhados={
                    "ponto_id": pid,
                    "nome_vertice": p_data["nome_vertice"],
                    "tipo_ponto": p_data["tipo_ponto"],
                    "coordenadas_ultimo_estado": {"lat": p_data["lat"], "lon": p_data["lon"], "alt": p_data["alt"]}
                }
            )
            return {"message": "Ponto removido com sucesso"}
        else:
            raise HTTPException(status_code=404, detail="Ponto não encontrado")
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

# ── Importação de TXT/RTK ──────────────────────────────────────────────────────

@router.post("/levantamentos/{id}/importar-txt")
async def importar_caderneta_txt(
    id: int, 
    matricula_id: int = Form(None), 
    base_escolhida_id: int = Form(None), 
    inverter_ne: bool = Form(False),
    file: UploadFile = File(...)
):
    verificar_levantamento_arquivado(id)
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(id)
        pasta_processados = folder / "Processados"
        pasta_processados.mkdir(parents=True, exist_ok=True)
        
        caminho_salvo = pasta_processados / file.filename
        
        with open(caminho_salvo, "wb") as buffer:
            buffer.write(await file.read())
            
        parser = TxtGeodesicParser(id, matricula_id, base_escolhida_id, inverter_ne=inverter_ne)
        pontos_processados = parser.processar_arquivo(str(caminho_salvo))
        
        if not pontos_processados:
            raise HTTPException(status_code=400, detail="Nenhum vértice válido encontrado ou processado no arquivo.")
            
        ids_pontos = parser.persistir_no_banco(pontos_processados)
        total_segmentos = parser.gerar_topologia_perimetral(ids_pontos, pontos_processados)
        ExportacaoService.gerar_documento_cliente_workspace(id)
        
        primeiro_pt = pontos_processados[0]
        layout = "RTK" if primeiro_pt["sigma_lat"] > 0.0 else "Topcon Estático"
        
        from services.processamento.historico_campo import HistoricoCampoLogger
        pontos_nomes = [pt["nome_vertice"] for pt in pontos_processados]
        desc = f"Importação de caderneta no layout '{layout}' do arquivo '{file.filename}' com {len(ids_pontos)} ponto(s)."
        if base_escolhida_id:
            row_base_nome = execute_query("SELECT nome_vertice FROM pontos WHERE id = ?", params=(base_escolhida_id,), fetch_one=True)
            if row_base_nome:
                desc += f" Vinculado à Base de Campo: {row_base_nome['nome_vertice']}."
                
        HistoricoCampoLogger.registrar_evento(
            levantamento_id=id,
            tipo_evento="IMPORTACAO_TXT",
            descricao=desc,
            dados_detalhados={
                "arquivo_nome": file.filename,
                "layout_detectado": layout,
                "total_pontos_importados": len(ids_pontos),
                "pontos": pontos_nomes,
                "base_escolhida_id": base_escolhida_id,
                "matricula_id": matricula_id
            }
        )
        return {
            "message": f"Sucesso: {len(ids_pontos)} pontos importados e {total_segmentos} segmentos perimetrais gerados automaticamente.",
            "pontos_importados": len(ids_pontos),
            "layout_detectado": layout
        }
    except ValueError as val_err:
        logging.getLogger(__name__).warning(f"Tentativa de importação inválida: {val_err}")
        raise HTTPException(
            status_code=400,
            detail={
                "erro": "VIOLACAO_REGRA_NEGOCIO",
                "mensagem": str(val_err)
            }
        )
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro na importação de caderneta TXT: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "erro": "ERRO_INTERNO_PROCESSAMENTO",
                "mensagem": f"Falha no processamento: {str(e)}"
            }
        )

# ── Translação e Correção de Lotes ─────────────────────────────────────────────

@router.post("/levantamentos/{id}/pontos/associar-base")
def post_associar_base_lote(id: int, payload: PayloadAssociarBase):
    verificar_levantamento_arquivado(id)
    try:
        from services.processamento.geoprocessamento import associar_base_ao_lote
        qtd = associar_base_ao_lote(payload.ponto_id_selecionado, payload.base_ppp_id)
        wm = WorkspaceManager()
        ExportacaoService.gerar_documento_cliente_workspace(id)
        return {"sucesso": True, "pontos_corrigidos": qtd, "mensagem": "Vínculo tardio e translação em bloco aplicados com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/levantamentos/{id}/pontos/corrigir-manual")
def post_corrigir_manual_lote(id: int, payload: PayloadOverrideManual):
    verificar_levantamento_arquivado(id)
    try:
        from services.processamento.geoprocessamento import aplicar_correcao_manual_lote
        qtd = aplicar_correcao_manual_lote(
            id, 
            None, 
            payload.arquivo_origem, 
            payload.dados_brutos, 
            payload.dados_corrigidos
        )
        wm = WorkspaceManager()
        ExportacaoService.gerar_documento_cliente_workspace(id)
        return {"sucesso": True, "pontos_corrigidos": qtd, "mensagem": "Override manual e translação ECEF 3D aplicados com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ── Ordenação e Reordenação de Perímetros ──────────────────────────────────────

@router.post("/levantamentos/{id}/matriculas/{matricula_id}/salvar-ordem")
def post_salvar_ordem_perimetro(id: int, matricula_id: int, payload: PayloadSalvarOrdem):
    verificar_levantamento_arquivado(id)
    pontos_ordem = [item.dict() for item in payload.pontos_ordem]
    res = salvar_ordem_caminhamento(id, matricula_id, pontos_ordem)
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("erro", "Erro ao salvar ordem"))
    return res

@router.post("/levantamentos/{id}/matriculas/{matricula_id}/reordenar")
def post_reordenar_perimetro(id: int, matricula_id: int):
    verificar_levantamento_arquivado(id)
    from services.processamento.geoprocessamento import reordenar_perimetro_matricula
    resultado = reordenar_perimetro_matricula(id, matricula_id)
    if not resultado["sucesso"]:
        raise HTTPException(status_code=400, detail=resultado["erro"])
    wm = WorkspaceManager()
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

@router.post("/levantamentos/{id}/matriculas/{matricula_id}/ordenar-vizinhos")
def post_ordenar_vizinhos_perimetro(id: int, matricula_id: int):
    verificar_levantamento_arquivado(id)
    from services.gestores.levantamento_manager import ordenar_vizinho_mais_proximo
    resultado = ordenar_vizinho_mais_proximo(id, matricula_id)
    if not resultado.get("sucesso"):
        raise HTTPException(status_code=400, detail=resultado.get("erro", "Erro ao ordenar"))
    wm = WorkspaceManager()
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

@router.post("/levantamentos/{id}/salvar-ordem")
def post_salvar_ordem_global(id: int, payload: PayloadSalvarOrdem):
    verificar_levantamento_arquivado(id)
    pontos_ordem = [item.dict() for item in payload.pontos_ordem]
    res = salvar_ordem_caminhamento(id, None, pontos_ordem)
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("erro", "Erro ao salvar ordem"))
    return res

@router.post("/levantamentos/{id}/reordenar")
def post_reordenar_global(id: int):
    verificar_levantamento_arquivado(id)
    from services.processamento.geoprocessamento import reordenar_perimetro_matricula
    resultado = reordenar_perimetro_matricula(id, None)
    if not resultado["sucesso"]:
        raise HTTPException(status_code=400, detail=resultado["erro"])
    wm = WorkspaceManager()
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

@router.post("/levantamentos/{id}/ordenar-vizinhos")
def post_ordenar_vizinhos_global(id: int):
    verificar_levantamento_arquivado(id)
    from services.gestores.levantamento_manager import ordenar_vizinho_mais_proximo
    resultado = ordenar_vizinho_mais_proximo(id, None)
    if not resultado.get("sucesso"):
        raise HTTPException(status_code=400, detail=resultado.get("erro", "Erro ao ordenar"))
    wm = WorkspaceManager()
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

# ── Atualização Manual e Auditoria Topológica ──────────────────────────────────

class ConfrontanteUpdateBatch(BaseModel):
    nome: Optional[str] = None
    matricula_imovel: Optional[str] = None
    cns_confrontante: Optional[str] = None

class PontoUpdateBatchItem(BaseModel):
    id: int
    tipo_ponto: Optional[Literal['M', 'P', 'V', 'B']] = None
    ignorar_poligono: Optional[int] = None
    sequencia_travada_id: Optional[str] = None
    matricula_id: Optional[int] = None
    confrontante: Optional[ConfrontanteUpdateBatch] = None

class PontoBatchUpdatePayload(BaseModel):
    pontos: List[PontoUpdateBatchItem]

class PontoUpdate(BaseModel):
    nome_vertice: Optional[str] = None
    tipo_ponto: Optional[Literal['M', 'P', 'V', 'B']] = None
    metodo_posicionamento: Optional[str] = None
    matricula_id: Optional[int] = None
    ponto_base_id: Optional[int] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    alt: Optional[float] = None
    sigma_lat: Optional[float] = None
    sigma_lon: Optional[float] = None
    sigma_alt: Optional[float] = None
    status_ponto: Optional[str] = None
    ignorar_poligono: Optional[int] = None
    n_corrigido: Optional[float] = None
    e_corrigido: Optional[float] = None
    alt_corrigido: Optional[float] = None
    fuso: Optional[str] = None
    sequencia_travada_id: Optional[str] = None

@router.put("/levantamentos/{id}/pontos/batch")
def update_pontos_batch(id: int, payload: PontoBatchUpdatePayload):
    try:
        verificar_levantamento_arquivado(id)
        from services.gestores.levantamento_manager import atualizar_pontos_geodesicos_batch
        res = atualizar_pontos_geodesicos_batch(id, payload.dict())
        if "error" in res:
            status = res.get("status_code", 400)
            raise HTTPException(status_code=status, detail=res["error"])
        return {"success": True}
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Erro ao atualizar pontos em lote: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/pontos/{pid}")
def update_ponto(pid: int, payload: PontoUpdate):
    try:
        row = execute_query("SELECT levantamento_id, ponto_vizinho FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Ponto não encontrado.")
            
        if row["ponto_vizinho"] == 1:
            raise HTTPException(status_code=403, detail="Pontos de confrontantes/vizinhos são imutáveis e não podem ser alterados.")
            
        verificar_levantamento_arquivado(row["levantamento_id"])
        
        from services.gestores.levantamento_manager import atualizar_ponto_geodesico
        res = atualizar_ponto_geodesico(pid, payload.dict())
        if "error" in res:
            status = res.get("status_code", 400)
            raise HTTPException(status_code=status, detail=res["error"])
            
        sanitizar_ordens_duplicadas(row["levantamento_id"])
        return res
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao atualizar ponto: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/matriculas/{mid}/auditoria")
def auditar_perimetro_matricula(mid: int):
    """Efetua a auditoria topológica completa de caminhamento e área real da matrícula rústica"""
    mat_row = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
    if not mat_row: 
        raise HTTPException(status_code=404, detail="Matrícula não cadastrada.")
    mat = dict(mat_row)
    
    pontos_rows = execute_query(
        "SELECT id, nome_vertice, lat, lon, alt, ordem_caminhamento FROM pontos WHERE matricula_id = ? ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC",
        params=(mid,), fetch_all=True
    )
    if not pontos_rows:
        return {"sucesso": False, "erro": "Nenhum ponto geodésico cadastrado para esta matrícula."}
        
    pontos = [dict(p) for p in pontos_rows]
    
    from services.processamento.sigef_validator import SigefValidator
    res_auditoria = SigefValidator.auditar_poligonal_matricula(pontos, area_declarada_ha=mat.get("area_ha") or 0.0)
    return res_auditoria


@router.post("/pontos/analisar-txt")
async def analisar_arquivo_txt_temporario(
    fuso_utm: int = Form(22),
    inverter_ne: bool = Form(False),
    file: UploadFile = File(...)
):
    try:
        content = await file.read()
        linhas = content.decode("utf-8", errors="ignore").splitlines()
        
        # Identificar layout
        layout = "topcon"
        for linha in linhas:
            linha_limpa = linha.strip()
            if not linha_limpa or linha_limpa.startswith("#"):
                continue
            partes = [p.strip() for p in linha_limpa.split(",")]
            if len(partes) == 7:
                layout = "topcon"
                break
            elif len(partes) >= 8:
                quinta_coluna = partes[4]
                if quinta_coluna.lower() in ["set_base", "rover", "base_rtk", "rtk_base", "base", "set-base"]:
                    layout = "rtk"
                    break
                try:
                    float(quinta_coluna)
                    layout = "topcon"
                except ValueError:
                    layout = "rtk"
                break

        pontos_brutos = []
        for linha in linhas:
            linha_limpa = linha.strip()
            if not linha_limpa or linha_limpa.startswith("#"):
                continue
            partes = [p.strip() for p in linha_limpa.split(",")]
            if len(partes) < 4:
                continue
            try:
                nome = partes[0]
                n1 = float(partes[1])
                e1 = float(partes[2])
                alt = float(partes[3])
                
                if inverter_ne:
                    norte = e1
                    este = n1
                else:
                    norte = n1
                    este = e1
                desc = ""
                sig_n = 0.0
                sig_e = 0.0
                sig_z = 0.0

                if layout == "rtk":
                    if len(partes) >= 5:
                        desc = partes[4]
                    if len(partes) >= 8:
                        sig_n = float(partes[5])
                        sig_e = float(partes[6])
                        sig_z = float(partes[7])
                else:
                    if len(partes) >= 7:
                        sig_n = float(partes[4])
                        sig_e = float(partes[5])
                        sig_z = float(partes[6])

                pontos_brutos.append({
                    "nome": nome,
                    "norte": norte,
                    "este": este,
                    "alt": alt,
                    "descricao": desc,
                    "sigma_n": sig_n,
                    "sigma_e": sig_e,
                    "sigma_z": sig_z
                })
            except Exception:
                continue

        if not pontos_brutos:
            raise HTTPException(status_code=400, detail="Nenhum ponto válido encontrado no arquivo.")

        # Converter de UTM para Geodésica Lat/Lon
        crs_geodesica = "epsg:4674"
        crs_plana = f"epsg:319{60 + fuso_utm}"
        transformer_to_latlon = get_transformer(crs_plana, crs_geodesica, always_xy=True)

        pontos_convertidos = []
        for p in pontos_brutos:
            try:
                lon, lat = transformer_to_latlon.transform(p["este"], p["norte"])
                pontos_convertidos.append({
                    "nome": p["nome"],
                    "lat": lat,
                    "lon": lon,
                    "alt": p["alt"],
                    "norte": p["norte"],
                    "este": p["este"],
                    "sigma_n": p["sigma_n"],
                    "sigma_e": p["sigma_e"],
                    "sigma_z": p["sigma_z"],
                    "descricao": p["descricao"]
                })
            except Exception as e_trans:
                logging.getLogger(__name__).warning(f"Erro ao converter ponto {p['nome']}: {e_trans}")

        return {
            "layout_detectado": layout.upper(),
            "fuso_utm": fuso_utm,
            "pontos": pontos_convertidos
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao processar arquivo: {str(e)}")

@router.post("/levantamentos/{id}/pontos/integrar-vizinho/{pid}")
def integrar_ponto_vizinho(id: int, pid: int, matricula_id: Optional[int] = None):
    verificar_levantamento_arquivado(id)
    try:
        p_viz = execute_query(
            "SELECT * FROM pontos WHERE id = ? AND levantamento_id = ? AND ponto_vizinho = 1",
            params=(pid, id),
            fetch_one=True
        )
        if not p_viz:
            raise HTTPException(status_code=404, detail="Ponto de vizinho não encontrado neste levantamento.")
            
        if matricula_id:
            row_max = execute_query(
                "SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ? AND matricula_id = ?",
                params=(id, matricula_id),
                fetch_one=True
            )
        else:
            row_max = execute_query(
                "SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ?",
                params=(id,),
                fetch_one=True
            )
        max_ord = row_max["max_ord"] if row_max and row_max["max_ord"] is not None else 0
        nova_ordem = max_ord + 1
        
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO pontos (
                    levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt,
                    n_original, e_original, alt_original, sigma_n, sigma_e, sigma_z,
                    sigma_lat, sigma_lon, sigma_alt, status_ponto, status_correcao, metodo_posicionamento,
                    arquivo_origem, origem_homologada, confrontante_id, ponto_vizinho, ordem_caminhamento
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    id, matricula_id, p_viz["nome_vertice"], p_viz["tipo_ponto"], p_viz["lat"], p_viz["lon"], p_viz["alt"],
                    p_viz["n_original"], p_viz["e_original"], p_viz["alt_original"], p_viz["sigma_n"], p_viz["sigma_e"], p_viz["sigma_z"],
                    p_viz["sigma_lat"], p_viz["sigma_lon"], p_viz["sigma_alt"], "CORRIGIDO", "CORRIGIDO", p_viz["metodo_posicionamento"],
                    p_viz["arquivo_origem"], 0, p_viz["confrontante_id"], 0, nova_ordem
                )
            )
            novo_ponto_id = cursor.lastrowid
            conn.commit()
            
        return {
            "success": True, 
            "novo_ponto_id": novo_ponto_id, 
            "mensagem": f"Vértice '{p_viz['nome_vertice']}' integrado com sucesso!"
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

class PayloadSincronizarCAD(BaseModel):
    payload_cad: str
    matricula_id: Optional[int] = None
    reconstruir_poligonal: Optional[bool] = True

@router.post("/levantamentos/{id}/pontos/sincronizar-cad")
def sincronizar_cad_clipboard(id: int, payload: PayloadSincronizarCAD):
    """
    Sincroniza os vértices recebidos do CAD via Clipboard (comando GCOPIAR).
    Aplica lógica inteligente de Upsert:
    - Se o nome_vertice já existir no levantamento: atualiza coordenadas, tipo e metadados.
    - Se for um vértice novo (ex: Vértice Virtual 'V'): insere no banco, calcula Lat/Lon geodésica e vincula à poligonal.
    - Integra confrontantes automaticamente caso especificados no bloco CAD.
    - Reconstrói a poligonal e sequência de caminhamento da matrícula caso haja polilinha associada.
    """
    verificar_levantamento_arquivado(id)
    if not payload.payload_cad or not payload.payload_cad.strip():
        raise HTTPException(status_code=400, detail="Payload do CAD está vazio ou inválido.")

    try:
        lines = [l.strip() for l in payload.payload_cad.strip().split("\n") if l.strip()]
        if not lines:
            raise HTTPException(status_code=400, detail="Nenhum vértice encontrado no payload informando.")

        transformer = get_transformer("epsg:31982", "epsg:4674", always_xy=True)
        count_atualizados = 0
        count_inseridos = 0
        confrontantes_criados = 0
        pontos_processados = []
        target_mat_id = payload.matricula_id

        with DatabaseManager() as conn:
            cursor = conn.cursor()

            # Se não veio matrícula no payload, descobre a matrícula padrão do levantamento
            if not target_mat_id:
                cursor.execute("SELECT id FROM matriculas WHERE propriedade_id = (SELECT propriedade_id FROM levantamentos WHERE id = ?) LIMIT 1", (id,))
                mat_row = cursor.fetchone()
                if mat_row:
                    target_mat_id = mat_row["id"]

            for line in lines:
                parts = line.split(";")
                x, y, z = None, None, 0.0
                id_vertice, tipo, sigma, metpos, tiplim, cns, matr, confro = "", "", "0.000", "", "", "", "", ""
                bloco = ""
                poligono_str = "1"
                ordem_str = "0"

                for part in parts:
                    if "=" in part and not part.startswith("ATRIB("):
                        param, val = part.split("=", 1)
                        param = param.strip().upper()
                        val = val.strip()
                        if param == "BLOCO":
                            bloco = val
                        elif param == "X":
                            try: x = float(val)
                            except ValueError: pass
                        elif param == "Y":
                            try: y = float(val)
                            except ValueError: pass
                        elif param == "Z":
                            try: z = float(val)
                            except ValueError: pass
                        elif param == "POLIGONO":
                            poligono_str = val
                        elif param == "ORDEM":
                            ordem_str = val

                    if part.startswith("ATRIB(") and part.endswith(")"):
                        attr_str = part[6:-1]
                        matches = re.findall(
                            r'(ID|TIPO|SIGMA|METPOS|TIPLIM|CNS|MATR|CONFRO)\s*:\s*(.*?)(?=(?:,\s*(?:ID|TIPO|SIGMA|METPOS|TIPLIM|CNS|MATR|CONFRO)\s*:)|$)',
                            attr_str,
                            re.IGNORECASE
                        )
                        for k, v in matches:
                            k = k.strip().upper()
                            v = v.strip()
                            if k == "ID": id_vertice = v
                            elif k == "TIPO": tipo = v.upper() if v else ""
                            elif k == "SIGMA": sigma = v
                            elif k == "METPOS": metpos = v
                            elif k == "TIPLIM": tiplim = v
                            elif k == "CNS": cns = v
                            elif k == "MATR": matr = v
                            elif k == "CONFRO": confro = v

                if not id_vertice or x is None or y is None:
                    continue

                # Converte UTM Zone 22S para SIRGAS 2000 Geodésico (Lat, Lon)
                lon, lat = transformer.transform(x, y)
                
                # Determina tipo inteligente caso não venha explícito ou seja default 'V'
                tipo_final = tipo.upper() if tipo and tipo.upper() in ['M', 'P', 'V', 'B'] else ''
                if not tipo_final or tipo_final == 'V':
                    if "MEMOVEM" in bloco.upper() or "-M-" in id_vertice.upper():
                        tipo_final = "M"
                    elif "MEMOVEP" in bloco.upper() or "-P-" in id_vertice.upper():
                        tipo_final = "P"
                    elif "MEMOVEB" in bloco.upper() or "-B-" in id_vertice.upper() or id_vertice.upper().startswith("BASE"):
                        tipo_final = "B"
                    else:
                        tipo_final = tipo_final or "V"

                try:
                    sig_val = float(sigma) if sigma else 0.0
                except ValueError:
                    sig_val = 0.0

                ignorar_poligono_val = 0 if poligono_str == "1" else 1
                try:
                    ord_num = int(ordem_str)
                except ValueError:
                    ord_num = 0

                # Gerencia auto-criação e amarração de Confrontantes
                confrontante_id = None
                if confro and confro.strip():
                    conf_nome = confro.strip()
                    cursor.execute(
                        "SELECT id FROM confrontantes WHERE levantamento_id = ? AND LOWER(TRIM(nome)) = LOWER(?)",
                        (id, conf_nome)
                    )
                    c_row = cursor.fetchone()
                    if c_row:
                        confrontante_id = c_row["id"]
                        if matr or cns:
                            cursor.execute(
                                """
                                UPDATE confrontantes
                                SET matricula_imovel = CASE WHEN ? != '' THEN ? ELSE matricula_imovel END,
                                    cns_confrontante = CASE WHEN ? != '' THEN ? ELSE cns_confrontante END
                                WHERE id = ?
                                """,
                                (matr, matr, cns, cns, confrontante_id)
                            )
                    else:
                        cursor.execute("INSERT INTO pessoas (nome) VALUES (?)", (conf_nome,))
                        pessoa_id = cursor.lastrowid
                        cursor.execute(
                            """
                            INSERT INTO confrontantes (pessoa_id, levantamento_id, nome, matricula_imovel, cns_confrontante, tipo_relacao)
                            VALUES (?, ?, ?, ?, ?, 'CONFRONTANTE')
                            """,
                            (pessoa_id, id, conf_nome, matr or "", cns or "")
                        )
                        confrontante_id = cursor.lastrowid
                        confrontantes_criados += 1

                # Verifica existência prévia do vértice pelo nome
                cursor.execute(
                    "SELECT id, matricula_id FROM pontos WHERE levantamento_id = ? AND nome_vertice = ? AND (ponto_vizinho IS NULL OR ponto_vizinho = 0)",
                    (id, id_vertice)
                )
                existente = cursor.fetchone()

                if existente:
                    pid = existente["id"]
                    cursor.execute(
                        """
                        UPDATE pontos
                        SET lat = ?, lon = ?, alt = ?,
                            lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                            tipo_ponto = ?,
                            sigma_lat = CASE WHEN ? > 0 THEN ? ELSE sigma_lat END,
                            sigma_lon = CASE WHEN ? > 0 THEN ? ELSE sigma_lon END,
                            sigma_alt = CASE WHEN ? > 0 THEN ? ELSE sigma_alt END,
                            status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO',
                            metodo_posicionamento = CASE WHEN ? != '' THEN ? ELSE metodo_posicionamento END,
                            confrontante_id = CASE WHEN ? IS NOT NULL THEN ? ELSE confrontante_id END,
                            ignorar_poligono = ?,
                            ordem_caminhamento = CASE WHEN ? > 0 THEN ? ELSE ordem_caminhamento END,
                            matricula_id = CASE WHEN ? IS NOT NULL THEN ? ELSE matricula_id END
                        WHERE id = ?
                        """,
                        (lat, lon, z, lat, lon, z, tipo_final, sig_val, sig_val, sig_val, sig_val, sig_val, sig_val,
                         metpos, metpos, confrontante_id, confrontante_id, ignorar_poligono_val,
                         ord_num, ord_num, target_mat_id, target_mat_id, pid)
                    )
                    count_atualizados += 1
                    pontos_processados.append({
                        "id": pid,
                        "nome": id_vertice,
                        "ordem": ord_num,
                        "ignorar_poligono": ignorar_poligono_val,
                        "matricula_id": target_mat_id or existente["matricula_id"],
                        "confrontante_id": confrontante_id,
                        "tipo_limite": tiplim,
                        "metodo": metpos
                    })
                else:
                    cursor.execute(
                        "SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ? AND (matricula_id = ? OR (? IS NULL AND matricula_id IS NULL)) AND tipo_ponto != 'B'",
                        (id, target_mat_id, target_mat_id)
                    )
                    max_row = cursor.fetchone()
                    nova_ordem = ord_num if ord_num > 0 else ((max_row["max_ord"] + 1) if max_row and max_row["max_ord"] is not None else 1)

                    cursor.execute(
                        """
                        INSERT INTO pontos (
                            levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt,
                            lat_corrigido, lon_corrigido, alt_corrigido,
                            sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, status_ponto, status_correcao,
                            metodo_posicionamento, confrontante_id, ignorar_poligono
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CORRIGIDO', 'CORRIGIDO', ?, ?, ?)
                        """,
                        (id, target_mat_id, id_vertice, tipo_final, lat, lon, z, lat, lon, z,
                         sig_val, sig_val, sig_val, nova_ordem, metpos, confrontante_id, ignorar_poligono_val)
                    )
                    pid = cursor.lastrowid
                    count_inseridos += 1
                    pontos_processados.append({
                        "id": pid,
                        "nome": id_vertice,
                        "ordem": nova_ordem,
                        "ignorar_poligono": ignorar_poligono_val,
                        "matricula_id": target_mat_id,
                        "confrontante_id": confrontante_id,
                        "tipo_limite": tiplim,
                        "metodo": metpos
                    })

            conn.commit()

        # Reconstrução da poligonal perimetral caso solicitado
        segmentos_gerados = 0
        if payload.reconstruir_poligonal and target_mat_id:
            pontos_na_poligonal = [p for p in pontos_processados if p["ignorar_poligono"] == 0 and p.get("ordem", 0) > 0 and p.get("matricula_id") == target_mat_id]
            if len(pontos_na_poligonal) >= 3:
                pontos_na_poligonal.sort(key=lambda x: x["ordem"])
                pontos_ordem_payload = [{"id": p["id"], "ordem": idx + 1} for idx, p in enumerate(pontos_na_poligonal)]
                res_ord = salvar_ordem_caminhamento(id, target_mat_id, pontos_ordem_payload)
                segmentos_gerados = res_ord.get("segmentos_gerados", 0)

                # Atualiza tipos de limite e confrontantes nos segmentos com base no vértice inicial
                with DatabaseManager() as conn_seg:
                    cur_seg = conn_seg.cursor()
                    for p_info in pontos_na_poligonal:
                        if p_info.get("tipo_limite") or p_info.get("confrontante_id"):
                            cur_seg.execute(
                                """
                                UPDATE segmentos
                                SET tipo_limite_sigef = CASE WHEN ? != '' THEN ? ELSE tipo_limite_sigef END,
                                    confrontante_id = CASE WHEN ? IS NOT NULL THEN ? ELSE confrontante_id END,
                                    metodo_posicionamento_sigef = CASE WHEN ? != '' THEN ? ELSE metodo_posicionamento_sigef END
                                WHERE levantamento_id = ? AND matricula_id = ? AND ponto_inicio_id = ?
                                """,
                                (p_info.get("tipo_limite", ""), p_info.get("tipo_limite", ""),
                                 p_info.get("confrontante_id"), p_info.get("confrontante_id"),
                                 p_info.get("metodo", ""), p_info.get("metodo", ""),
                                 id, target_mat_id, p_info["id"])
                            )
                    conn_seg.commit()

        sanitizar_ordens_duplicadas(id)
        wm = WorkspaceManager()
        ExportacaoService.gerar_documento_cliente_workspace(id)

        from services.processamento.historico_campo import HistoricoCampoLogger
        HistoricoCampoLogger.registrar_evento(
            levantamento_id=id,
            tipo_evento="SINCRONIZACAO_CAD",
            descricao=f"Sincronização via Clipboard do CAD realizada com sucesso: {count_atualizados} atualizados, {count_inseridos} inseridos, {confrontantes_criados} confrontantes criados.",
            dados_detalhados={"atualizados": count_atualizados, "inseridos": count_inseridos, "confrontantes_criados": confrontantes_criados}
        )

        return {
            "sucesso": True,
            "atualizados": count_atualizados,
            "inseridos": count_inseridos,
            "confrontantes_criados": confrontantes_criados,
            "segmentos_gerados": segmentos_gerados,
            "mensagem": f"Sincronização CAD concluída: {count_atualizados} vértice(s) atualizado(s), {count_inseridos} novo(s) inserido(s) e {confrontantes_criados} confrontante(s) vinculado(s)."
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro na sincronização CAD: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno durante a sincronização CAD: {str(e)}")



