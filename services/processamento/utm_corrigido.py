"""
services/processamento/utm_corrigido.py
Regra única da coordenada UTM "corrigida" de um ponto.

A posição verdadeira do vértice é COALESCE(lat_corrigido, lat) — a mesma usada pelo mapa da Mesa de
Trabalho (coordenadas_mapa.ts), pelo resumo de confrontantes e pelos documentos. As colunas
e_corrigido/n_corrigido são só um cache dessa posição em UTM e, historicamente, várias rotinas de
correção gravavam lat/lon_corrigido sem atualizá-las. Tudo que precisa de E/N para cálculo (offset,
vértices virtuais) deve passar por `utm_do_ponto`, e toda rotina que move um ponto deve chamar
`sincronizar_utm_corrigido` antes do commit.
"""

from typing import Iterable, Optional, Tuple

from utils.transformer_cache import get_transformer

TOLERANCIA_SINCRONIA_M = 0.001
# Fuso UTM tem 3° para cada lado do meridiano central; acima disso a projeção não representa o ponto
LIMITE_DISTANCIA_MERIDIANO_GRAUS = 9.0


def _valido(v) -> bool:
    try:
        return v is not None and float(v) != 0.0
    except (TypeError, ValueError):
        return False


def zona_utm_da_longitude(lon: float) -> int:
    return min(60, max(1, int((float(lon) + 180) / 6) + 1))


def utm_de_geodesica(lat: float, lon: float, fuso: int) -> Tuple[float, float]:
    transformer = get_transformer("epsg:4674", f"epsg:{31960 + fuso}", always_xy=True)
    e, n = transformer.transform(float(lon), float(lat))
    return float(e), float(n)


def geodesica_de_utm(e: float, n: float, fuso: int) -> Tuple[float, float]:
    transformer = get_transformer(f"epsg:{31960 + fuso}", "epsg:4674", always_xy=True)
    lon, lat = transformer.transform(float(e), float(n))
    return float(lat), float(lon)


def coordenada_geodesica_do_ponto(p: dict) -> Optional[Tuple[float, float]]:
    """(lat, lon) verdadeiro do ponto: par corrigido quando existe, senão o par bruto."""
    if _valido(p.get("lat_corrigido")) and _valido(p.get("lon_corrigido")):
        return float(p["lat_corrigido"]), float(p["lon_corrigido"])
    if _valido(p.get("lat")) and _valido(p.get("lon")):
        return float(p["lat"]), float(p["lon"])
    return None


def utm_do_ponto(p: dict, fuso: Optional[int] = None) -> Optional[Tuple[float, float, int]]:
    """
    (E, N, fuso) da posição verdadeira do ponto.
    Com `fuso` informado, todos os pontos de um mesmo cálculo ficam na mesma projeção, mesmo que
    algum tenha sido gravado em outro fuso.
    """
    fuso_ponto = int(p["fuso_utm"]) if _valido(p.get("fuso_utm")) else None

    if _valido(p.get("lat_corrigido")) and _valido(p.get("lon_corrigido")):
        lat, lon = float(p["lat_corrigido"]), float(p["lon_corrigido"])
        f = fuso or fuso_ponto or zona_utm_da_longitude(lon)
        e, n = utm_de_geodesica(lat, lon, f)
        return e, n, f

    # Sem correção geodésica: vale o UTM gravado (corrigido manual ou bruto de campo)
    for ce, cn in (("e_corrigido", "n_corrigido"), ("e_original", "n_original")):
        if _valido(p.get(ce)) and _valido(p.get(cn)):
            e, n = float(p[ce]), float(p[cn])
            f_origem = fuso_ponto or (zona_utm_da_longitude(p["lon"]) if _valido(p.get("lon")) else None) or fuso or 22
            if fuso and fuso != f_origem:
                lat, lon = geodesica_de_utm(e, n, f_origem)
                e, n = utm_de_geodesica(lat, lon, fuso)
                return e, n, fuso
            return e, n, f_origem

    if _valido(p.get("lat")) and _valido(p.get("lon")):
        lat, lon = float(p["lat"]), float(p["lon"])
        f = fuso or fuso_ponto or zona_utm_da_longitude(lon)
        e, n = utm_de_geodesica(lat, lon, f)
        return e, n, f
    return None


def sincronizar_utm_corrigido(
    cursor,
    ponto_ids: Optional[Iterable[int]] = None,
    levantamento_id: Optional[int] = None,
) -> int:
    """
    Regrava e_corrigido/n_corrigido a partir de lat/lon_corrigido (ou do UTM bruto quando o ponto
    deixou de ser corrigido). Roda no cursor da transação do chamador; não faz commit.
    Retorna quantos pontos foram alterados.
    """
    filtros, params = [], []
    if ponto_ids is not None:
        ids = [int(i) for i in ponto_ids if i is not None]
        if not ids:
            return 0
        filtros.append(f"id IN ({', '.join('?' * len(ids))})")
        params.extend(ids)
    if levantamento_id is not None:
        filtros.append("levantamento_id = ?")
        params.append(levantamento_id)
    where = " AND ".join(filtros) if filtros else "1 = 1"

    cursor.execute(
        f"""
        SELECT id, lat, lon, lat_corrigido, lon_corrigido, e_corrigido, n_corrigido,
               e_original, n_original, fuso_utm
        FROM pontos WHERE {where}
        """,
        tuple(params),
    )
    cols = [c[0] for c in cursor.description]
    rows = [dict(zip(cols, tuple(r))) for r in cursor.fetchall()]

    alterados = 0
    for p in rows:
        if _valido(p.get("lat_corrigido")) and _valido(p.get("lon_corrigido")):
            e, n, f = utm_do_ponto(p)
            # Longitude muito longe do meridiano central do fuso: coordenada corrompida (ex.: N digitado
            # com um dígito a mais). Não grava lixo projetado; o ponto precisa ser corrigido à mão.
            if abs(float(p["lon_corrigido"]) - (f * 6 - 183)) > LIMITE_DISTANCIA_MERIDIANO_GRAUS:
                continue
        elif _valido(p.get("e_original")) and _valido(p.get("n_original")):
            e, n = float(p["e_original"]), float(p["n_original"])
        else:
            continue

        e_atual, n_atual = p.get("e_corrigido"), p.get("n_corrigido")
        if (
            e_atual is not None and n_atual is not None
            and abs(float(e_atual) - e) <= TOLERANCIA_SINCRONIA_M
            and abs(float(n_atual) - n) <= TOLERANCIA_SINCRONIA_M
        ):
            continue

        cursor.execute(
            "UPDATE pontos SET e_corrigido = ?, n_corrigido = ? WHERE id = ?",
            (round(e, 4), round(n, 4), p["id"]),
        )
        alterados += 1
    return alterados


def sincronizar_utm_corrigido_ids(ponto_ids: Iterable[int]) -> int:
    """Versão com transação própria, para rotinas que gravam via execute_query(commit=True)."""
    from database.connection import DatabaseManager

    with DatabaseManager() as conn:
        alterados = sincronizar_utm_corrigido(conn.cursor(), ponto_ids=ponto_ids)
        conn.commit()
    return alterados
