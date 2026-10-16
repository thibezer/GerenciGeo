"""Reaproveitamento dos metadados de divisa ao reconstruir a cadeia de segmentos de uma matrícula.

Quando a ordem dos vértices muda (ou um vértice é inserido/movido), os segmentos são apagados e
recriados. Sem este helper, tudo o que não fosse (confrontante, tipo de limite, método) voltava ao
padrão, inclusive a anuência já assinada, e uma divisa dividida por um novo vértice perdia o confrontante.
"""

from typing import Dict, Iterable, List, Optional, Sequence, Tuple

CAMPOS_HERDADOS = (
    "confrontante_id",
    "tipo_limite_sigef",
    "metodo_posicionamento_sigef",
    "origem_homologada",
    "anuencia_assinada",
)

COLUNAS_SELECT_SEGMENTOS = "ponto_inicio_id, ponto_fim_id, " + ", ".join(CAMPOS_HERDADOS)


def segmentos_antigos_para_dicts(rows: Iterable[Sequence]) -> List[dict]:
    """Converte linhas de `SELECT COLUNAS_SELECT_SEGMENTOS ...` (tupla ou Row) em dicts."""
    nomes = ("ponto_inicio_id", "ponto_fim_id") + CAMPOS_HERDADOS
    return [{nome: row[i] for i, nome in enumerate(nomes)} for row in rows]


def _info(seg: dict) -> dict:
    return {campo: seg.get(campo) for campo in CAMPOS_HERDADOS}


def _info_padrao(metodo_padrao: str) -> dict:
    return {
        "confrontante_id": None,
        "tipo_limite_sigef": "LN1",
        "metodo_posicionamento_sigef": metodo_padrao,
        "origem_homologada": 0,
        "anuencia_assinada": 0,
    }


def _caminho_so_com_vertices_novos(ids: Sequence[int], ia: int, ib: int, passo: int, pontos_antigos: set) -> Optional[List[int]]:
    """Percorre o anel de `ia` até `ib` e devolve os índices visitados se todos os intermediários forem vértices novos."""
    n = len(ids)
    percurso = [ia]
    i = (ia + passo) % n
    while i != ib:
        if ids[i] in pontos_antigos or len(percurso) > n:
            return None
        percurso.append(i)
        i = (i + passo) % n
    percurso.append(ib)
    return percurso if len(percurso) > 2 else None


def montar_info_segmentos(segmentos_antigos: List[dict], ids_ordenados: Sequence[int], metodo_padrao: str) -> List[Tuple[int, int, dict]]:
    """Devolve (ponto_inicio, ponto_fim, info) para cada aresta do anel fechado `ids_ordenados`.

    - Aresta que já existia (nos dois sentidos) herda todos os metadados do segmento antigo.
    - Aresta nascida de um vértice inserido no meio de uma divisa herda os metadados do segmento
      que foi dividido.
    - Qualquer outra aresta recebe o padrão (sem confrontante, LN1, anuência pendente).
    """
    n = len(ids_ordenados)
    if n < 2:
        return []

    ids = list(ids_ordenados)
    arestas = [(ids[i], ids[(i + 1) % n]) for i in range(n)]

    por_chave: Dict[Tuple[int, int], dict] = {}
    for seg in segmentos_antigos:
        por_chave.setdefault((seg["ponto_inicio_id"], seg["ponto_fim_id"]), seg)

    resultado: List[Optional[dict]] = [None] * n
    for i, (a, b) in enumerate(arestas):
        seg = por_chave.get((a, b)) or por_chave.get((b, a))
        if seg is not None:
            resultado[i] = _info(seg)

    # Divisa dividida por vértice(s) novo(s): A->B antigo vira A->V->B no anel atual.
    pontos_antigos = {p for seg in segmentos_antigos for p in (seg["ponto_inicio_id"], seg["ponto_fim_id"])}
    posicao = {pid: i for i, pid in enumerate(ids)}
    for seg in segmentos_antigos:
        a, b = seg["ponto_inicio_id"], seg["ponto_fim_id"]
        if a not in posicao or b not in posicao or a == b:
            continue
        if (a, b) in arestas or (b, a) in arestas:
            continue
        ia, ib = posicao[a], posicao[b]
        for passo, origem in ((1, ia), (-1, ia)):
            percurso = _caminho_so_com_vertices_novos(ids, origem, ib, passo, pontos_antigos)
            if percurso is None:
                continue
            for k in range(len(percurso) - 1):
                x, y = percurso[k], percurso[k + 1]
                idx_aresta = x if passo == 1 else y
                if resultado[idx_aresta] is None:
                    resultado[idx_aresta] = _info(seg)
            break

    padrao = _info_padrao(metodo_padrao)
    return [(a, b, resultado[i] or dict(padrao)) for i, (a, b) in enumerate(arestas)]
