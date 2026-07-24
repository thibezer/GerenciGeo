"""
routes/dashboard.py — Status, logs, alertas e estatísticas gerais do sistema
"""
import logging
from fastapi import APIRouter, HTTPException
from database.repository import HistoricoRinexRepo, PendenciaRepo
from services.processamento.triagem_inteligente import gerar_alertas_integridade
from database.connection import execute_query

router = APIRouter(tags=["Dashboard & Status"])

# In-memory storage para logs mostrados no painel
system_logs = []

def add_log(msg: str):
    system_logs.append(msg)
    if len(system_logs) > 100:
        system_logs.pop(0)

@router.get("/status")
def get_status():
    return {"status": "online", "version": "2.0.0"}

@router.get("/logs")
def get_logs():
    return {"logs": system_logs}

@router.get("/history")
def get_history():
    try:
        repo = HistoricoRinexRepo()
        return repo.get_all_ordered()
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao buscar histórico RINEX: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao buscar histórico de arquivos RINEX.")

@router.get("/stats")
def get_stats():
    try:
        cli = execute_query("SELECT COUNT(*) as count FROM clientes", fetch_one=True)
        prop = execute_query("SELECT COUNT(*) as count FROM propriedades", fetch_one=True)
        prof = execute_query("SELECT COUNT(*) as count FROM profissionais", fetch_one=True)
        return {
            "clientes": cli['count'] if cli else 0,
            "propriedades": prop['count'] if prop else 0,
            "profissionais": prof['count'] if prof else 0
        }
    except Exception:
        return {"clientes": 0, "propriedades": 0, "profissionais": 0}

@router.delete("/history/{item_id}")
def delete_history_item(item_id: int):
    try:
        repo = HistoricoRinexRepo()
        repo.delete(item_id)
        return {"message": "Registro removido"}
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao deletar item do histórico id={item_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao remover registro do histórico.")

@router.get("/dashboard/alerts")
def get_alerts():
    try:
        repo = PendenciaRepo()
        pendencias_alta = repo.get_pendentes_alta(limit=3)

        manuais = []
        for p in pendencias_alta:
            manuais.append({
                "id": p['id'],
                "tipo": "MANUAL",
                "icone": "alert-circle",
                "mensagem": f"Urgent: {p['titulo']}",
                "original": p
            })

        automaticos = gerar_alertas_integridade()
        return {"alerts": manuais + automaticos}
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao buscar alertas do dashboard: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao gerar alertas do dashboard.")

@router.get("/dashboard/matriculas-geometrias")
def get_dashboard_matriculas_geometrias():
    """Retorna os polígonos perimetrais ordenados das matrículas para renderização dinâmica no mapa Leaflet"""
    try:
        # Busca todas as matrículas ativas
        # Usa subquery para pegar apenas o levantamento mais recente NÃO ARQUIVADO
        # evitando duplicatas quando uma propriedade tem múltiplos levantamentos ativos.
        query_mats = """
            SELECT m.id, m.numero_matricula, m.area_ha, m.propriedade_id,
                   p.nome_propriedade, p.municipio, p.uf,
                   l.id as levantamento_id
            FROM matriculas m
            JOIN propriedades p ON m.propriedade_id = p.id
            JOIN levantamentos l ON l.propriedade_id = p.id
            WHERE l.status != 'ARQUIVADO'
              AND l.id = (
                  SELECT id FROM levantamentos
                  WHERE propriedade_id = p.id AND status != 'ARQUIVADO'
                  ORDER BY id DESC LIMIT 1
              )
        """
        rows_mats = execute_query(query_mats, fetch_all=True)
        
        result = []
        if rows_mats:
            from collections import defaultdict

            # The combination of (levantamento_id, matricula_id) is what defines the active point set.
            # However, since we're using SQLite, IN with tuples `(levantamento_id, matricula_id) IN (...)` is less standard.
            # Since matricula_id is unique enough, we filter by matricula_id and then in Python we ensure it belongs to the right levantamento_id.

            matricula_ids = [str(r["id"]) for r in rows_mats]
            placeholders = ", ".join(["?"] * len(matricula_ids))

            # Busca todos os pontos de todas as matrículas ativas em uma única query
            query_pts = f"""
                SELECT levantamento_id, matricula_id, lat, lon, lat_corrigido, lon_corrigido, nome_vertice
                FROM pontos
                WHERE matricula_id IN ({placeholders}) AND (ignorar_poligono IS NULL OR ignorar_poligono = 0)
                ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
            """
            all_pts = execute_query(query_pts, params=tuple(matricula_ids), fetch_all=True)
            
            pts_by_mat_lev = defaultdict(list)
            if all_pts:
                for r in all_pts:
                    pt = dict(r)
                    lat = pt["lat_corrigido"] if pt["lat_corrigido"] is not None else pt["lat"]
                    lon = pt["lon_corrigido"] if pt["lon_corrigido"] is not None else pt["lon"]
                    if lat and lon:
                        key = (pt["levantamento_id"], pt["matricula_id"])
                        pts_by_mat_lev[key].append({"lat": lat, "lon": lon, "nome": pt["nome_vertice"]})

            for row in rows_mats:
                mat = dict(row)
                key = (mat["levantamento_id"], mat["id"])
                coords = pts_by_mat_lev.get(key, [])

                # Uma matrícula só é elegível se possuir uma poligonal fechável (pelo menos 3 pontos com coordenadas válidas)
                if len(coords) >= 3:
                    mat["coordenadas"] = coords
                    result.append(mat)
                
        return result
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao buscar geometrias para o dashboard: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
