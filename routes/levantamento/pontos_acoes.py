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

def post_salvar_ordem_perimetro(id: int, matricula_id: int, payload: PayloadSalvarOrdem):
    verificar_levantamento_arquivado(id)
    pontos_ordem = [item.dict() for item in payload.pontos_ordem]
    res = salvar_ordem_caminhamento(id, matricula_id, pontos_ordem)
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("erro", "Erro ao salvar ordem"))
    return res

def post_reordenar_perimetro(id: int, matricula_id: int):
    verificar_levantamento_arquivado(id)
    from services.processamento.geoprocessamento import reordenar_perimetro_matricula
    resultado = reordenar_perimetro_matricula(id, matricula_id)
    if not resultado["sucesso"]:
        raise HTTPException(status_code=400, detail=resultado["erro"])
    wm = WorkspaceManager()
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

def post_ordenar_vizinhos_perimetro(id: int, matricula_id: int):
    verificar_levantamento_arquivado(id)
    from services.gestores.levantamento_manager import ordenar_vizinho_mais_proximo
    resultado = ordenar_vizinho_mais_proximo(id, matricula_id)
    if not resultado.get("sucesso"):
        raise HTTPException(status_code=400, detail=resultado.get("erro", "Erro ao ordenar"))
    wm = WorkspaceManager()
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

def post_salvar_ordem_global(id: int, payload: PayloadSalvarOrdem):
    verificar_levantamento_arquivado(id)
    pontos_ordem = [item.dict() for item in payload.pontos_ordem]
    res = salvar_ordem_caminhamento(id, None, pontos_ordem)
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("erro", "Erro ao salvar ordem"))
    return res

def post_reordenar_global(id: int):
    verificar_levantamento_arquivado(id)
    from services.processamento.geoprocessamento import reordenar_perimetro_matricula
    resultado = reordenar_perimetro_matricula(id, None)
    if not resultado["sucesso"]:
        raise HTTPException(status_code=400, detail=resultado["erro"])
    wm = WorkspaceManager()
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

def post_ordenar_vizinhos_global(id: int):
    verificar_levantamento_arquivado(id)
    from services.gestores.levantamento_manager import ordenar_vizinho_mais_proximo
    resultado = ordenar_vizinho_mais_proximo(id, None)
    if not resultado.get("sucesso"):
        raise HTTPException(status_code=400, detail=resultado.get("erro", "Erro ao ordenar"))
    wm = WorkspaceManager()
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

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
