"""
Persistência e regras de pontos do levantamento (listagem, criação, exclusão e saneamento da ordem
de caminhamento). Extraído de routes/levantamento/pontos.py para manter as rotas apenas com HTTP.
"""
import logging

from database.connection import DatabaseManager, execute_query
from utils.transformer_cache import get_transformer


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
                    cursor.executemany(
                        "UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?",
                        update_data
                    )

            # 2. Sanitizar pontos órfãos (matricula_id IS NULL), ignorando tipo 'B'
            cursor.execute(
                """
                SELECT id, ordem_caminhamento, tipo_ponto
                FROM pontos
                WHERE levantamento_id = ? AND matricula_id IS NULL AND tipo_ponto != 'B'
                ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
                """,
                (levantamento_id,)
            )
            rows_orfaos = cursor.fetchall()
            ordens_orfaos = [r["ordem_caminhamento"] for r in rows_orfaos if r["ordem_caminhamento"] is not None]
            tem_dup_orf = len(ordens_orfaos) != len(set(ordens_orfaos))
            tem_nul_orf = any(r["ordem_caminhamento"] is None for r in rows_orfaos)

            if tem_dup_orf or tem_nul_orf:
                logger.info(f"[SANITIZACAO_ORDEM] Corrigindo ordens para levantamento={levantamento_id}, pontos orfaos")
                update_data = []
                nova_ordem = 1
                for r in rows_orfaos:
                    update_data.append((nova_ordem, r["id"]))
                    nova_ordem += 1
                cursor.executemany(
                    "UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?",
                    update_data
                )
                
            conn.commit()
    except Exception as e:
        logger.error(f"[SANITIZACAO_ORDEM] Erro ao sanitizar ordens do levantamento {levantamento_id}: {e}")


class PontoErro(Exception):
    """Erro de regra de negócio de pontos; `status` segue o código HTTP equivalente."""

    def __init__(self, status: int, mensagem: str):
        super().__init__(mensagem)
        self.status = status
        self.mensagem = mensagem


_CAMADAS_VALIDAS = ("CAMPO", "PERIMETRO", "HOMOLOGADO", "VIZINHO")
_MSG_LEV_ARQUIVADO = "Operação Bloqueada: O Levantamento correspondente está ARQUIVADO (Tranca de Segurança Read-Only ativa)."


def _levantamento_arquivado(levantamento_id: int) -> bool:
    row = execute_query("SELECT status FROM levantamentos WHERE id = ?", params=(levantamento_id,), fetch_one=True)
    return bool(row and row["status"] == "ARQUIVADO")


def _completar_utm_corrigido(p: dict) -> None:
    """Preenche E/N corrigidos (UTM) a partir da lat/lon quando ausentes."""
    if p.get("e_corrigido") is not None and p.get("n_corrigido") is not None:
        return
    lat_c = p.get("lat_corrigido") or p.get("lat")
    lon_c = p.get("lon_corrigido") or p.get("lon")
    if not (lat_c and lon_c):
        return
    try:
        zona_utm = p.get("fuso_utm") or (int((lon_c + 180) / 6) + 1)
        transformer = get_transformer("epsg:4674", f"epsg:319{60 + zona_utm}", always_xy=True)
        e_corr, n_corr = transformer.transform(lon_c, lat_c)
        if p.get("e_corrigido") is None:
            p["e_corrigido"] = round(e_corr, 3)
        if p.get("n_corrigido") is None:
            p["n_corrigido"] = round(n_corr, 3)
    except Exception:
        pass


def listar_pontos(levantamento_id: int, camada: str | None = None) -> list[dict]:
    """Pontos do levantamento por camada do ciclo de vida, já com E/N corrigidos completados."""
    camada_upper = camada.upper() if camada else None
    if camada_upper is not None and camada_upper != "TODOS" and camada_upper not in _CAMADAS_VALIDAS:
        raise PontoErro(400, f"Camada inválida: '{camada}'. Opções: CAMPO, PERIMETRO, HOMOLOGADO, VIZINHO, TODOS")

    # Autocorreção de ordens duplicadas: nunca altera um levantamento ARQUIVADO (tranca read-only)
    if not camada or camada_upper in ("CAMPO", "PERIMETRO"):
        row_status = execute_query("SELECT status FROM levantamentos WHERE id = ?", params=(levantamento_id,), fetch_one=True)
        if row_status and row_status["status"] != "ARQUIVADO":
            sanitizar_ordens_duplicadas(levantamento_id)

    filtros = ["p.levantamento_id = ?"]
    params = [levantamento_id]
    if not camada:
        filtros.append("(p.ponto_vizinho IS NULL OR p.ponto_vizinho = 0)")
    elif camada_upper != "TODOS":
        filtros.append("p.camada_ciclo_vida = ?")
        params.append(camada_upper)

    where_clause = " AND ".join(filtros)
    query = f"""
        SELECT p.*, m.numero_matricula
        FROM pontos p
        LEFT JOIN matriculas m ON p.matricula_id = m.id
        WHERE {where_clause}
        ORDER BY CASE WHEN p.matricula_id IS NULL THEN 1 ELSE 0 END ASC, p.matricula_id ASC, CASE WHEN p.ordem_caminhamento IS NULL OR p.ordem_caminhamento = 0 THEN 999999 ELSE p.ordem_caminhamento END ASC, p.id ASC
    """
    rows = [dict(r) for r in execute_query(query, params=tuple(params), fetch_all=True)]
    for p in rows:
        _completar_utm_corrigido(p)
    return rows


def criar_ponto(levantamento_id: int, dados: dict) -> None:
    """Insere o ponto (ordem automática no fim do perímetro, exceto bases) e saneia as ordens."""
    ordem = dados.get("ordem_caminhamento")
    tipo = dados["tipo_ponto"]
    if not ordem and tipo != 'B':
        if dados.get("matricula_id"):
            row_max = execute_query(
                "SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ? AND matricula_id = ?",
                params=(levantamento_id, dados["matricula_id"]), fetch_one=True)
        else:
            row_max = execute_query(
                "SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ?",
                params=(levantamento_id,), fetch_one=True)
        max_ord = row_max["max_ord"] if row_max else None
        ordem = (max_ord + 1) if max_ord is not None else 1

    status_final = "CORRIGIDO" if tipo == 'V' else dados["status_ponto"]
    execute_query(
        """
        INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, status_ponto, status_correcao, ponto_base_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        params=(
            levantamento_id, dados["matricula_id"], dados["nome_vertice"], tipo, dados["lat"], dados["lon"], dados["alt"],
            dados["sigma_lat"], dados["sigma_lon"], dados["sigma_alt"], ordem, status_final, status_final, dados.get("ponto_base_id")
        ),
        commit=True
    )
    sanitizar_ordens_duplicadas(levantamento_id)


def excluir_ponto(pid: int) -> int:
    """Exclui o ponto, reverte rovers dependentes e registra o evento. Retorna o `levantamento_id`."""
    from services.processamento.geoprocessamento import reverter_rovers_para_bruto
    from services.processamento.historico_campo import HistoricoCampoLogger

    row = execute_query(
        "SELECT levantamento_id, nome_vertice, tipo_ponto, lat, lon, alt, ponto_vizinho FROM pontos WHERE id = ?",
        params=(pid,), fetch_one=True)
    if not row:
        raise PontoErro(404, "Ponto não encontrado")
    p_data = dict(row)
    if p_data.get("ponto_vizinho") == 1:
        raise PontoErro(403, "Pontos de confrontantes/vizinhos são imutáveis e não podem ser excluídos individualmente.")
    if _levantamento_arquivado(p_data["levantamento_id"]):
        raise PontoErro(403, _MSG_LEV_ARQUIVADO)

    check_base_uso = execute_query("SELECT COUNT(*) as count FROM pontos WHERE ponto_base_id = ?", params=(pid,), fetch_one=True)
    eh_base_apoio = check_base_uso and check_base_uso["count"] > 0
    if p_data["tipo_ponto"] == "B" or eh_base_apoio:
        reverter_rovers_para_bruto(p_data["levantamento_id"], pid)

    execute_query("DELETE FROM pontos WHERE id = ?", params=(pid,), commit=True)

    HistoricoCampoLogger.registrar_evento(
        levantamento_id=p_data["levantamento_id"],
        tipo_evento="EXCLUSAO_PONTO",
        descricao=f"Vértice {p_data['nome_vertice']} do Tipo '{p_data['tipo_ponto']}' foi excluído definitivamente pelo usuário.",
        dados_detalhados={
            "ponto_id": pid,
            "nome_vertice": p_data["nome_vertice"],
            "tipo_ponto": p_data["tipo_ponto"],
            "coordenadas_ultimo_estado": {"lat": p_data["lat"], "lon": p_data["lon"], "alt": p_data["alt"]}
        }
    )
    return p_data["levantamento_id"]
