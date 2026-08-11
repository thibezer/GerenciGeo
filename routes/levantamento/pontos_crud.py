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

def get_matricula_historico(mid: int):
    try:
        query = "SELECT campo_alterado, valor_antigo, valor_novo, data_alteracao FROM matricula_historico_logs WHERE id_matricula = ? ORDER BY data_alteracao DESC"
        logs = [dict(r) for r in execute_query(query, params=(mid,), fetch_all=True)]
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

class ConfrontanteUpdateBatch(BaseModel):
    nome: Optional[str] = None
    matricula_imovel: Optional[str] = None
    cns_confrontante: Optional[str] = None

class PontoUpdateBatchItem(BaseModel):
    id: int
    tipo_ponto: Optional[Literal['M', 'P', 'V', 'B']] = None
    ignorar_poligono: Optional[int] = None
    sequencia_travada_id: Optional[str] = None
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
