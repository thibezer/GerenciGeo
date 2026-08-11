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

from .pontos_acoes import sanitizar_ordens_duplicadas
class PayloadSincronizarCAD(BaseModel):
    payload_cad: str
    matricula_id: Optional[int] = None
    reconstruir_poligonal: Optional[bool] = True

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
