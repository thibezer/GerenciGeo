"""
Persistência e regras de escopo dos vértices virtuais (apoio de cálculo, inserção, lote e promoção
ao perímetro). Extraído de routes/levantamento/pontos.py; o cálculo geométrico em si fica em
services/processamento/vertices_virtuais.py.
"""
import logging
from typing import List, Optional

from database.connection import DatabaseManager, execute_query
from services.gestores.pontos_manager import sanitizar_ordens_duplicadas
from utils.transformer_cache import get_transformer

# Fusos UTM que cobrem o território brasileiro (SIRGAS 2000 / UTM 18S a 25S)
FUSO_UTM_MIN, FUSO_UTM_MAX = 18, 25

_SQL_MATRICULA_NO_LEVANTAMENTO = """
    SELECT m.id FROM matriculas m
    JOIN levantamentos l ON m.propriedade_id = l.propriedade_id
    WHERE m.id = ? AND l.id = ?
"""


class VerticeVirtualErro(Exception):
    """Erro de regra de negócio dos vértices virtuais; `status` segue o código HTTP equivalente."""

    def __init__(self, status: int, mensagem: str):
        super().__init__(mensagem)
        self.status = status
        self.mensagem = mensagem


def _exigir_matricula_no_levantamento(levantamento_id: int, matricula_id: int) -> None:
    row = execute_query(_SQL_MATRICULA_NO_LEVANTAMENTO, params=(matricula_id, levantamento_id), fetch_one=True)
    if not row:
        raise VerticeVirtualErro(404, "Matrícula informada não pertence a este levantamento.")


def obter_pontos_apoio_db_lote(ponto_ids: List[int]):
    from services.processamento.vertices_virtuais import PontoApoio

    if not ponto_ids:
        return []

    ids_unicos = list(dict.fromkeys(ponto_ids))
    marcadores = ",".join("?" for _ in ids_unicos)
    rows = execute_query(
        f"""
        SELECT id, nome_vertice, lat, lon, alt, lat_corrigido, lon_corrigido, alt_corrigido,
               e_corrigido, n_corrigido, e_original, n_original, alt_original,
               sigma_e, sigma_n, sigma_z, sigma_lat, sigma_lon, sigma_alt, fuso_utm
        FROM pontos WHERE id IN ({marcadores})
        """,
        params=tuple(ids_unicos),
        fetch_all=True,
    )
    pontos_map = {}
    for row in (rows or []):
        p = dict(row)
        pid = p["id"]
        e = p.get("e_corrigido") or p.get("e_original")
        n = p.get("n_corrigido") or p.get("n_original")
        alt = p.get("alt_corrigido") or p.get("alt") or p.get("alt_original") or 0.0

        if e is None or n is None:
            lat = p.get("lat_corrigido") or p.get("lat")
            lon = p.get("lon_corrigido") or p.get("lon")
            if lat is not None and lon is not None:
                fuso = p.get("fuso_utm") or (int((lon + 180) / 6) + 1)
                transformer = get_transformer("epsg:4674", f"epsg:319{60 + fuso}", always_xy=True)
                e_calc, n_calc = transformer.transform(lon, lat)
                e = e or e_calc
                n = n or n_calc
            else:
                raise VerticeVirtualErro(
                    400, f"Vértice '{p.get('nome_vertice')}' não possui coordenadas UTM ou geográficas válidas."
                )

        s_e = p.get("sigma_e") or p.get("sigma_lon") or 0.02
        s_n = p.get("sigma_n") or p.get("sigma_lat") or 0.02
        s_z = p.get("sigma_z") or p.get("sigma_alt") or 0.03

        pontos_map[pid] = PontoApoio(
            nome=p.get("nome_vertice") or f"P{p['id']}",
            este=float(e),
            norte=float(n),
            altitude=float(alt),
            sigma_este=float(s_e),
            sigma_norte=float(s_n),
            sigma_altitude=float(s_z),
        )

    for pid in ponto_ids:
        if pid not in pontos_map:
            raise VerticeVirtualErro(404, f"Ponto de apoio ID {pid} não encontrado.")

    return [pontos_map[pid] for pid in ponto_ids]


def obter_ponto_apoio_db(ponto_id: int):
    return obter_pontos_apoio_db_lote([ponto_id])[0]


def validar_escopo_pontos_apoio(levantamento_id: int, matricula_id: int, ponto_ids: List[int]) -> None:
    """Garante que matrícula e pontos de apoio pertencem ao levantamento e usam um único fuso UTM."""
    if matricula_id and matricula_id > 0:
        _exigir_matricula_no_levantamento(levantamento_id, matricula_id)

    ids_unicos = list(dict.fromkeys(ponto_ids))
    marcadores = ",".join("?" for _ in ids_unicos)
    rows = execute_query(
        f"SELECT id, fuso_utm FROM pontos WHERE levantamento_id = ? AND id IN ({marcadores})",
        params=(levantamento_id, *ids_unicos),
        fetch_all=True,
    )
    if len(rows or []) != len(ids_unicos):
        raise VerticeVirtualErro(400, "Há pontos de apoio que não pertencem a este levantamento.")

    fusos = {int(r["fuso_utm"]) for r in rows if r["fuso_utm"]}
    if len(fusos) > 1:
        raise VerticeVirtualErro(
            400, f"Os pontos de apoio estão em fusos UTM diferentes ({', '.join(str(f) for f in sorted(fusos))})."
        )


def _nomes_da_matricula_ou_orfaos(levantamento_id: int, matricula_id: int) -> list:
    rows = execute_query(
        "SELECT nome_vertice FROM pontos WHERE levantamento_id = ? AND (matricula_id = ? OR matricula_id IS NULL)",
        params=(levantamento_id, matricula_id),
        fetch_all=True,
    )
    return [r["nome_vertice"] for r in (rows or []) if r["nome_vertice"]]


def nome_virtual_livre(levantamento_id: int, matricula_id: int, nome: Optional[str], default: str = "V01") -> str:
    """Devolve o nome pedido ou, havendo colisão com algum ponto da matrícula, o próximo livre."""
    from services.processamento.vertices_virtuais import MotorVerticesVirtuais

    pedido = (nome or default).strip() or default
    ocupados = {str(n).strip().upper() for n in _nomes_da_matricula_ou_orfaos(levantamento_id, matricula_id)}
    if pedido.upper() not in ocupados:
        return pedido
    return MotorVerticesVirtuais.gerar_nomes_unicos(prefixo=pedido, quantidade=1, nomes_existentes=ocupados)[0]


def nomes_existentes_para_offset(levantamento_id: int, matricula_id: int) -> set:
    """Nomes já usados (como gravados) pela matrícula e por pontos sem matrícula, para o offset em lote."""
    return set(_nomes_da_matricula_ou_orfaos(levantamento_id, matricula_id))


def inserir_vertice_virtual(levantamento_id: int, matricula_id: int, d: dict) -> dict:
    """
    Insere um vértice virtual como rascunho (CAMPO, ignorar_poligono=1, sem ordem própria): ele só
    entra no perímetro pela ação "promover". Converte UTM para geográficas SIRGAS 2000.
    """
    from services.processamento.historico_campo import HistoricoCampoLogger
    from services.processamento.vertices_virtuais import MotorVerticesVirtuais

    fuso = d.get("fuso_utm") or 22
    transformer = get_transformer(f"epsg:319{60 + fuso}", "epsg:4674", always_xy=True)
    lon_calc, lat_calc = transformer.transform(d["este"], d["norte"])

    rows_db = execute_query(
        "SELECT nome_vertice FROM pontos WHERE levantamento_id = ? AND matricula_id = ? AND tipo_ponto = 'V'",
        params=(levantamento_id, matricula_id),
    )
    nomes_ocupados = {r["nome_vertice"].upper() for r in (rows_db or []) if r["nome_vertice"]}
    nome_final = (d.get("nome_vertice") or "V-01").strip()
    if nome_final.upper() in nomes_ocupados:
        nome_final = MotorVerticesVirtuais.gerar_nomes_unicos(
            prefixo=nome_final, quantidade=1, nomes_existentes=nomes_ocupados,
        )[0]

    with DatabaseManager() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO pontos (
                levantamento_id, matricula_id, nome_vertice, tipo_ponto,
                lat, lon, alt, lat_corrigido, lon_corrigido, alt_corrigido,
                n_corrigido, e_corrigido,
                sigma_n, sigma_e, sigma_z, sigma_lat, sigma_lon, sigma_alt,
                fuso_utm, metodo_posicionamento,
                status_ponto, status_correcao, camada_ciclo_vida, ignorar_poligono,
                ordem_caminhamento, confrontante_id
            ) VALUES (
                ?, ?, ?, 'V',
                ?, ?, ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?,
                'CORRIGIDO', 'CORRIGIDO', 'CAMPO', 1,
                ?, ?
            )
            """,
            (
                levantamento_id, matricula_id, nome_final,
                lat_calc, lon_calc, d["altitude"], lat_calc, lon_calc, d["altitude"],
                d["norte"], d["este"],
                d["sigma_norte"], d["sigma_este"], d["sigma_altitude"],
                d["sigma_norte"], d["sigma_este"], d["sigma_altitude"],
                fuso, d["metodo"],
                None, d.get("confrontante_id"),
            ),
        )
        novo_id = cursor.lastrowid
        conn.commit()

    sanitizar_ordens_duplicadas(levantamento_id)

    HistoricoCampoLogger.registrar_evento(
        levantamento_id=levantamento_id,
        tipo_evento="VERTICE_VIRTUAL_CRIADO",
        descricao=f"Vértice Virtual {nome_final} ({d['metodo']}) inserido com sucesso em E={d['este']:.3f}, N={d['norte']:.3f}, Alt={d['altitude']:.3f}.",
        dados_detalhados={
            "ponto_id": novo_id,
            "nome_vertice": nome_final,
            "metodo": d["metodo"],
            "este": d["este"],
            "norte": d["norte"],
            "altitude": d["altitude"],
            "sigma_planimetrico": d["sigma_planimetrico"],
        }
    )
    return {"id": novo_id, "nome": nome_final, "lat": lat_calc, "lon": lon_calc}


def inserir_lote_vertices_virtuais(
    levantamento_id: int, matricula_id: int, fuso_utm: Optional[int],
    confrontante_id: Optional[int], vertices: List[dict],
) -> dict:
    """Insere atomicamente um lote de vértices virtuais (rascunho). Retorna {ids, renomeados}."""
    from services.processamento.historico_campo import HistoricoCampoLogger
    from services.processamento.vertices_virtuais import MotorVerticesVirtuais

    if not vertices:
        raise VerticeVirtualErro(400, "Nenhum vértice virtual fornecido para inserção.")

    if matricula_id and matricula_id > 0:
        _exigir_matricula_no_levantamento(levantamento_id, matricula_id)

    if confrontante_id:
        row_conf = execute_query(
            "SELECT id FROM confrontantes WHERE id = ? AND levantamento_id = ?",
            params=(confrontante_id, levantamento_id), fetch_one=True,
        )
        if not row_conf:
            raise VerticeVirtualErro(400, "Confrontante informado não pertence a este levantamento.")

    fuso = fuso_utm or 22
    if not (FUSO_UTM_MIN <= fuso <= FUSO_UTM_MAX):
        raise VerticeVirtualErro(400, f"Fuso UTM inválido ({fuso}). Deve situar-se entre {FUSO_UTM_MIN} e {FUSO_UTM_MAX}.")

    transformer = get_transformer(f"epsg:319{60 + fuso}", "epsg:4674", always_xy=True)
    nomes_ocupados = {str(n).strip().upper() for n in _nomes_da_matricula_ou_orfaos(levantamento_id, matricula_id)}

    inseridos_ids = []
    renomeados = []
    with DatabaseManager() as conn:
        cursor = conn.cursor()
        for v in vertices:
            lon_calc, lat_calc = transformer.transform(v["este"], v["norte"])

            nome_pedido = (v["nome_vertice"] or "V-01").strip()
            nome_final = nome_pedido
            if nome_final.upper() in nomes_ocupados:
                nome_final = MotorVerticesVirtuais.gerar_nomes_unicos(
                    prefixo=nome_final, quantidade=1, nomes_existentes=nomes_ocupados,
                )[0]
                renomeados.append({"de": nome_pedido, "para": nome_final})
            nomes_ocupados.add(nome_final.upper())

            cursor.execute(
                """
                INSERT INTO pontos (
                    levantamento_id, matricula_id, nome_vertice, tipo_ponto,
                    lat, lon, alt, lat_corrigido, lon_corrigido, alt_corrigido,
                    n_corrigido, e_corrigido, n_original, e_original, alt_original,
                    sigma_n, sigma_e, sigma_z, sigma_lat, sigma_lon, sigma_alt,
                    fuso_utm, metodo_posicionamento,
                    status_ponto, status_correcao, camada_ciclo_vida, ignorar_poligono,
                    ordem_caminhamento, confrontante_id
                ) VALUES (
                    ?, ?, ?, 'V',
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?,
                    'CORRIGIDO', 'CORRIGIDO', 'CAMPO', 1,
                    ?, ?
                )
                """,
                (
                    levantamento_id, matricula_id, nome_final,
                    lat_calc, lon_calc, v["altitude"], lat_calc, lon_calc, v["altitude"],
                    v["norte"], v["este"], v["norte"], v["este"], v["altitude"],
                    v["sigma_norte"], v["sigma_este"], v["sigma_altitude"],
                    v["sigma_norte"], v["sigma_este"], v["sigma_altitude"],
                    fuso, v["metodo"],
                    None, confrontante_id
                ),
            )
            inseridos_ids.append(cursor.lastrowid)
        conn.commit()

    sanitizar_ordens_duplicadas(levantamento_id)

    HistoricoCampoLogger.registrar_evento(
        levantamento_id=levantamento_id,
        tipo_evento="VERTICE_VIRTUAL_LOTE_CRIADO",
        descricao=f"Lote de {len(inseridos_ids)} vértices virtuais criado como rascunho (fora do perímetro).",
        dados_detalhados={"total_inseridos": len(inseridos_ids), "ids": inseridos_ids, "matricula_id": matricula_id}
    )
    return {"ids": inseridos_ids, "renomeados": renomeados}


def promover_vertices_virtuais(
    levantamento_id: int, matricula_id: int, ponto_ids: List[int], apos_ponto_id: Optional[int],
) -> List[int]:
    """Insere rascunhos de vértice virtual no perímetro da matrícula, após o ponto indicado."""
    from services.processamento.historico_campo import HistoricoCampoLogger

    if not ponto_ids:
        raise VerticeVirtualErro(400, "Nenhum vértice virtual informado para inserir no perímetro.")
    ids_promover = list(dict.fromkeys(ponto_ids))

    _exigir_matricula_no_levantamento(levantamento_id, matricula_id)

    rows = execute_query(
        """
        SELECT id, nome_vertice, tipo_ponto, matricula_id, ignorar_poligono
        FROM pontos
        WHERE levantamento_id = ? AND matricula_id = ? AND tipo_ponto != 'B'
        ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
        """,
        params=(levantamento_id, matricula_id),
        fetch_all=True,
    )
    todos = [dict(r) for r in (rows or [])]
    por_id = {p["id"]: p for p in todos}

    for pid in ids_promover:
        p = por_id.get(pid)
        if p is None:
            raise VerticeVirtualErro(400, f"Ponto {pid} não pertence a esta matrícula.")
        if p["tipo_ponto"] != "V" or p["ignorar_poligono"] != 1:
            raise VerticeVirtualErro(400, f"O ponto '{p['nome_vertice']}' não é um vértice virtual em rascunho.")

    restantes = [p for p in todos if p["id"] not in set(ids_promover)]
    no_perimetro = [p for p in restantes if p["ignorar_poligono"] != 1]

    if apos_ponto_id is not None:
        if apos_ponto_id not in {p["id"] for p in no_perimetro}:
            raise VerticeVirtualErro(400, "O ponto de referência não está no perímetro desta matrícula.")
        ancora = apos_ponto_id
    else:
        ancora = no_perimetro[-1]["id"] if no_perimetro else None

    novos = [por_id[pid] for pid in ids_promover]
    nova_lista: list = []
    if ancora is None:
        nova_lista = novos + restantes
    else:
        for p in restantes:
            nova_lista.append(p)
            if p["id"] == ancora:
                nova_lista.extend(novos)

    with DatabaseManager() as conn:
        cursor = conn.cursor()
        cursor.executemany(
            "UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?",
            [(i, p["id"]) for i, p in enumerate(nova_lista, start=1)],
        )
        cursor.executemany(
            "UPDATE pontos SET ignorar_poligono = 0, camada_ciclo_vida = 'PERIMETRO' WHERE id = ?",
            [(pid,) for pid in ids_promover],
        )
        conn.commit()

    try:
        from services.processamento.geoprocessamento import reordenar_perimetro_matricula
        reordenar_perimetro_matricula(levantamento_id, matricula_id)
    except Exception as ex_reorder:
        logging.getLogger(__name__).warning(f"Falha ao regenerar divisas após promoção: {ex_reorder}")

    HistoricoCampoLogger.registrar_evento(
        levantamento_id=levantamento_id,
        tipo_evento="VERTICE_VIRTUAL_PROMOVIDO",
        descricao=f"{len(ids_promover)} vértice(s) virtual(is) inserido(s) no perímetro da matrícula {matricula_id}.",
        dados_detalhados={"ids": ids_promover, "apos_ponto_id": apos_ponto_id, "matricula_id": matricula_id},
    )
    return ids_promover
