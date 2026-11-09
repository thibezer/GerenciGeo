"""
services/processamento/divisao_lotes.py
Motor de cálculo analítico e topológico para Divisão e Desmembramento de Lotes.
Implementa corte por linha paralela (offset) a partir de uma divisa de referência com convergência exata de área
(via busca binária e Shapely 2.x), propagação de cotas, geração de vértices virtuais (Tipo V) e
autorregeneração topológica das matrículas resultantes (Opção A: Gleba A e Gleba B).
"""

import math
import logging
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
from shapely.geometry import Polygon, LineString, Point, MultiPolygon
from shapely.geometry.polygon import LinearRing, orient
from shapely.ops import split

from database.connection import DatabaseManager, execute_query
from utils.transformer_cache import get_transformer
from services.processamento.topologia_segmentos import (
    CAMPOS_HERDADOS,
    COLUNAS_SELECT_SEGMENTOS,
    montar_info_segmentos,
    segmentos_antigos_para_dicts,
)

logger = logging.getLogger(__name__)

SNAP_TOLERANCIA_METROS = 0.02  # 2 cm: tolerância de snap para vértices preexistentes


def _obter_pontos_perimetro_matricula(levantamento_id: int, matricula_id: int) -> List[Dict[str, Any]]:
    """Recupera os pontos ativos do perímetro da matrícula ordenados por ordem_caminhamento."""
    query = """
        SELECT id, levantamento_id, matricula_id, nome_vertice, tipo_ponto,
               lat, lon, alt, lat_corrigido, lon_corrigido, alt_corrigido,
               e_original, n_original, alt_original, e_corrigido, n_corrigido,
               fuso_utm, ordem_caminhamento, sigma_lat, sigma_lon, sigma_alt,
               sigma_e, sigma_n, sigma_z
        FROM pontos
        WHERE levantamento_id = ? AND matricula_id = ? AND tipo_ponto != 'B'
          AND (ignorar_poligono IS NULL OR ignorar_poligono = 0)
        ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
    """
    rows = execute_query(query, params=(levantamento_id, matricula_id), fetch_all=True)
    if not rows:
        raise ValueError("A matrícula não possui pontos cadastrados no perímetro.")
    if len(rows) < 3:
        raise ValueError("A matrícula deve possuir no mínimo 3 vértices para formar um polígono.")
    return [dict(r) for r in rows]


def _extrair_coordenadas_metricas(pontos: List[Dict[str, Any]]) -> Tuple[List[Tuple[float, float, float]], int]:
    """
    Extrai coordenadas métricas (Este, Norte, Altitude) em UTM SIRGAS 2000.
    Garante conversão caso o ponto só possua coordenadas geográficas.
    """
    fuso = 22
    for p in pontos:
        if p.get("fuso_utm"):
            try:
                fuso = int(p["fuso_utm"])
                break
            except (ValueError, TypeError):
                pass

    transformer = get_transformer("epsg:4674", f"epsg:319{60 + fuso}", always_xy=True)

    coords_3d = []
    for p in pontos:
        e = p.get("e_corrigido") or p.get("e_original")
        n = p.get("n_corrigido") or p.get("n_original")
        alt = p.get("alt_corrigido") or p.get("alt_original") or p.get("alt") or 0.0

        if e is None or n is None:
            lat = p.get("lat_corrigido") or p.get("lat")
            lon = p.get("lon_corrigido") or p.get("lon")
            if lat is not None and lon is not None:
                e_calc, n_calc = transformer.transform(float(lon), float(lat))
                e, n = e_calc, n_calc
            else:
                raise ValueError(f"Vértice {p.get('nome_vertice', p.get('id'))} sem coordenadas válidas.")

        coords_3d.append((float(e), float(n), float(alt)))

    return coords_3d, fuso


def calcular_geometria_divisao(
    pontos: List[Dict[str, Any]],
    ponto_base_1_id: int,
    ponto_base_2_id: int,
    modo: str,
    alvo: str,
    area_alvo_m2: Optional[float] = None
) -> Dict[str, Any]:
    """
    Núcleo matemático: executa o corte paralelo com convergência exata de área.
    Retorna polígonos, distâncias e dados analíticos.
    """
    coords_3d, fuso = _extrair_coordenadas_metricas(pontos)
    n_pts = len(pontos)
    poly_coords_2d = [(c[0], c[1]) for c in coords_3d]
    poly = Polygon(poly_coords_2d)

    if not poly.is_valid:
        poly = poly.buffer(0)
        if not poly.is_valid or poly.geom_type != "Polygon":
            raise ValueError("O polígono da matrícula é autointerceptante ou inválido para cálculo de área.")

    area_total_m2 = poly.area
    if area_total_m2 <= 1.0:
        raise ValueError("Área total do polígono é insignificante ou nula.")

    # Localiza os índices dos dois pontos da reta base
    idx1 = next((i for i, p in enumerate(pontos) if p["id"] == ponto_base_1_id), None)
    idx2 = next((i for i, p in enumerate(pontos) if p["id"] == ponto_base_2_id), None)

    if idx1 is None or idx2 is None:
        raise ValueError("Os pontos de apoio da divisa de referência não foram encontrados na matrícula.")

    # Garante que os pontos formam um segmento do perímetro (adjacentes)
    eh_adjacente = (abs(idx1 - idx2) == 1) or (min(idx1, idx2) == 0 and max(idx1, idx2) == n_pts - 1)
    if not eh_adjacente:
        raise ValueError("Os dois vértices da divisa de referência devem ser adjacentes no perímetro.")

    p1_coords = np.array([coords_3d[idx1][0], coords_3d[idx1][1]])
    p2_coords = np.array([coords_3d[idx2][0], coords_3d[idx2][1]])

    delta = p2_coords - p1_coords
    comp_base = float(np.linalg.norm(delta))
    if comp_base < 0.1:
        raise ValueError("A distância entre os dois pontos da divisa de referência é inferior a 10 cm.")

    u = delta / comp_base
    n1 = np.array([-u[1], u[0]])
    n2 = np.array([u[1], -u[0]])
    mid_base = (p1_coords + p2_coords) / 2.0

    # Determina o vetor normal unitário apontando para o interior do polígono
    eps = min(1.0, comp_base * 0.05)
    test_pt = mid_base + eps * n1
    if poly.contains(Point(test_pt[0], test_pt[1])):
        n = n1
    else:
        n = n2

    # Área desejada para o Lote da Base
    if modo == "AREAS_IGUAIS":
        area_desejada_base_m2 = area_total_m2 / 2.0
    elif modo == "AREA_DEFINIDA":
        if area_alvo_m2 is None or area_alvo_m2 <= 0:
            raise ValueError("Informe uma área alvo válida e maior que zero.")
        if area_alvo_m2 >= area_total_m2:
            raise ValueError(
                f"A área informada ({area_alvo_m2:.2f} m²) é maior ou igual à área total do imóvel ({area_total_m2:.2f} m²)."
            )

        if alvo == "BASE":
            area_desejada_base_m2 = float(area_alvo_m2)
        else:
            area_desejada_base_m2 = area_total_m2 - float(area_alvo_m2)
    else:
        raise ValueError(f"Modo de divisão desconhecido: '{modo}'. Use 'AREAS_IGUAIS' ou 'AREA_DEFINIDA'.")
    if not 0.0 < area_desejada_base_m2 < area_total_m2:
        raise ValueError("A área desejada para o lote da base deve estar entre zero e a área total do imóvel.")

    # Calcula extensão da bounding box e distância máxima
    min_x, min_y, max_x, max_y = poly.bounds
    diag = math.hypot(max_x - min_x, max_y - min_y) * 2.5
    d_max = max(float(np.dot(np.array(pt) - mid_base, n)) for pt in poly_coords_2d)
    if d_max <= 0.01:
        raise ValueError("Não foi possível projetar o polígono a partir da divisa base.")

    # Função auxiliar de área contida pelo corte a distância d
    def _calcular_area_corte(d_val: float) -> float:
        center = mid_base + d_val * n
        c1 = center - diag * u
        c2 = center + diag * u
        c3 = c2 - 2.0 * diag * n
        c4 = c1 - 2.0 * diag * n
        clip_box = Polygon([c1, c2, c3, c4])
        inter = poly.intersection(clip_box)
        return float(inter.area)

    # Busca binária determinística para encontrar o afastamento d exato
    low, high = 0.0, d_max
    d_opt = low
    for _ in range(60):
        mid_d = (low + high) / 2.0
        cur_area = _calcular_area_corte(mid_d)
        if abs(cur_area - area_desejada_base_m2) < 1e-4:
            d_opt = mid_d
            break
        if cur_area < area_desejada_base_m2:
            low = mid_d
        else:
            high = mid_d
        d_opt = mid_d

    # Traça a linha de corte ótima
    cut_center = mid_base + d_opt * n
    c1 = cut_center - diag * u
    c2 = cut_center + diag * u
    cut_line = LineString([c1, c2])

    # Interseção e divisão do polígono
    split_result = split(poly, cut_line)
    geoms = list(split_result.geoms)

    # Filtra fragmentos espúrios (< 0.1 m²) oriundos de precisão numérica
    polys_validos = [g for g in geoms if isinstance(g, Polygon) and g.area > 0.1]

    # Blocker 1 da Revisão: verifica concavidades que criam mais de 2 lotes
    if len(polys_validos) != 2:
        raise ValueError(
            "A reta de corte intercepta reentrâncias côncavas do terreno, gerando mais de dois lotes isolados. "
            "Selecione outra divisa de referência ou execute o desmembramento em etapas."
        )

    # Identifica o lote da base e o lote remanescente
    base_candidates = [p for p in polys_validos if p.exterior.distance(Point(mid_base[0], mid_base[1])) < 0.05]
    if len(base_candidates) == 1:
        base_poly = base_candidates[0]
        rem_poly = [p for p in polys_validos if p != base_poly][0]
    else:
        # Fallback: o lote da base é o que está mais próximo da área esperada
        if abs(polys_validos[0].area - area_desejada_base_m2) < abs(polys_validos[1].area - area_desejada_base_m2):
            base_poly, rem_poly = polys_validos[0], polys_validos[1]
        else:
            base_poly, rem_poly = polys_validos[1], polys_validos[0]

    # Interseção com a borda para extrair os pontos exatos de corte
    inter_ext = cut_line.intersection(poly.exterior)
    if inter_ext.geom_type == "Point":
        brutos = [(float(inter_ext.x), float(inter_ext.y))]
    elif hasattr(inter_ext, "geoms"):
        brutos = [(float(g.x), float(g.y)) for g in inter_ext.geoms if g.geom_type == "Point"]
    else:
        brutos = []

    # Remove duplicidades numéricas e ordena ao longo da linha de corte (projeção em u)
    brutos.sort(key=lambda pt: float(np.dot(np.array(pt) - cut_center, u)))
    pontos_corte_coords: List[Tuple[float, float]] = []
    for pt in brutos:
        if not pontos_corte_coords or math.hypot(pt[0] - pontos_corte_coords[-1][0], pt[1] - pontos_corte_coords[-1][1]) > 1e-6:
            pontos_corte_coords.append(pt)
    if len(pontos_corte_coords) != 2:
        raise ValueError("A linha de corte não intersectou exatamente dois pontos do perímetro. Escolha outra divisa de referência.")

    # Snap: se o corte cai sobre um vértice existente, reutiliza o vértice (sem criar V duplicado)
    def _snap_vertice(pt_2d: Tuple[float, float]) -> Tuple[Tuple[float, float], Optional[int], Optional[float]]:
        for i, c in enumerate(coords_3d):
            if math.hypot(pt_2d[0] - c[0], pt_2d[1] - c[1]) <= SNAP_TOLERANCIA_METROS:
                return (c[0], c[1]), pontos[i]["id"], c[2]
        return pt_2d, None, None

    p_corte_1, snap_id_1, snap_alt_1 = _snap_vertice(pontos_corte_coords[0])
    p_corte_2, snap_id_2, snap_alt_2 = _snap_vertice(pontos_corte_coords[1])

    # Interpolação de altitude para os novos pontos de corte
    def _interpolar_altitude(pt_2d: Tuple[float, float]) -> float:
        pt_geom = Point(pt_2d[0], pt_2d[1])
        # Acha em qual segmento da borda original o ponto de corte incide
        for i in range(n_pts):
            c_a = coords_3d[i]
            c_b = coords_3d[(i + 1) % n_pts]
            seg = LineString([(c_a[0], c_a[1]), (c_b[0], c_b[1])])
            if seg.distance(pt_geom) < 0.05:
                l_seg = seg.length
                if l_seg < 1e-4:
                    return c_a[2]
                proj_dist = seg.project(pt_geom)
                t = max(0.0, min(1.0, proj_dist / l_seg))
                return c_a[2] + t * (c_b[2] - c_a[2])
        return float(np.mean([c[2] for c in coords_3d]))

    alt_corte_1 = snap_alt_1 if snap_alt_1 is not None else _interpolar_altitude(p_corte_1)
    alt_corte_2 = snap_alt_2 if snap_alt_2 is not None else _interpolar_altitude(p_corte_2)

    # Preserva o sentido de caminhamento original nos dois novos anéis
    sentido = 1.0 if LinearRing(poly_coords_2d).is_ccw else -1.0
    base_poly = orient(base_poly, sentido)
    rem_poly = orient(rem_poly, sentido)

    # Conversão de coordenadas para SIRGAS 2000 lat/lon
    transformer_inv = get_transformer(f"epsg:319{60 + fuso}", "epsg:4674", always_xy=True)
    lon_c1, lat_c1 = transformer_inv.transform(p_corte_1[0], p_corte_1[1])
    lon_c2, lat_c2 = transformer_inv.transform(p_corte_2[0], p_corte_2[1])

    # Converte os contornos dos dois polígonos para lat/lon (preview do Leaflet)
    def _coords_poly_to_geo(p_geom: Polygon):
        pts_utm = list(p_geom.exterior.coords)
        geo_list = []
        for e, n_val in pts_utm:
            lo, la = transformer_inv.transform(e, n_val)
            geo_list.append([round(float(la), 7), round(float(lo), 7)])
        return geo_list

    coords_base_geo = _coords_poly_to_geo(base_poly)
    coords_rem_geo = _coords_poly_to_geo(rem_poly)

    area_base_m2 = float(base_poly.area)
    area_rem_m2 = float(rem_poly.area)

    return {
        "sucesso": True,
        "distancia_offset_m": round(float(d_opt), 3),
        "area_total_m2": round(area_total_m2, 2),
        "area_total_ha": round(area_total_m2 / 10000.0, 4),
        "fuso_utm": fuso,
        "lote_base": {
            "area_m2": round(area_base_m2, 2),
            "area_ha": round(area_base_m2 / 10000.0, 4),
            "percentual": round((area_base_m2 / area_total_m2) * 100.0, 2),
            "coordenadas_geo": coords_base_geo,
            "coordenadas_utm": [[round(c[0], 3), round(c[1], 3)] for c in list(base_poly.exterior.coords)],
            "polygon_geom": base_poly,
        },
        "lote_remanescente": {
            "area_m2": round(area_rem_m2, 2),
            "area_ha": round(area_rem_m2 / 10000.0, 4),
            "percentual": round((area_rem_m2 / area_total_m2) * 100.0, 2),
            "coordenadas_geo": coords_rem_geo,
            "coordenadas_utm": [[round(c[0], 3), round(c[1], 3)] for c in list(rem_poly.exterior.coords)],
            "polygon_geom": rem_poly,
        },
        "pontos_corte": [
            {
                "este": round(p_corte_1[0], 3),
                "norte": round(p_corte_1[1], 3),
                "altitude": round(alt_corte_1, 3),
                "lat": round(float(lat_c1), 8),
                "lon": round(float(lon_c1), 8),
                "vertice_existente_id": snap_id_1,
            },
            {
                "este": round(p_corte_2[0], 3),
                "norte": round(p_corte_2[1], 3),
                "altitude": round(alt_corte_2, 3),
                "lat": round(float(lat_c2), 8),
                "lon": round(float(lon_c2), 8),
                "vertice_existente_id": snap_id_2,
            }
        ]
    }


def _resolver_contexto(
    levantamento_id: int,
    matricula_id: int,
    modo: str,
    alvo: str,
    area_alvo_m2: Optional[float],
    matricula_base_id: Optional[int],
) -> Dict[str, Any]:
    """
    Define o tipo de operação conforme o desenho da matrícula:
    - SIMPLES: uma matrícula com perímetro próprio vira duas (Gleba A + nova Gleba B).
    - SEPARACAO: perímetro unificado (2 matrículas no mesmo polígono, via matricula_origem_desenho_id)
      é cortado de volta em dois polígonos, um por matrícula, com área igual à área registrada.
    """
    row = execute_query(
        "SELECT id, propriedade_id, numero_matricula, matricula_origem_desenho_id FROM matriculas WHERE id = ?",
        params=(matricula_id,), fetch_one=True
    )
    if not row:
        raise ValueError(f"Matrícula ID {matricula_id} não encontrada.")
    desenho_id = row["matricula_origem_desenho_id"] or row["id"]
    grupo_rows = execute_query(
        "SELECT id, numero_matricula, area_ha FROM matriculas WHERE id = ? OR matricula_origem_desenho_id = ? ORDER BY id",
        params=(desenho_id, desenho_id), fetch_all=True
    )
    grupo = [dict(g) for g in (grupo_rows or [])]

    if modo == "SEPARAR_MATRICULAS":
        if len(grupo) != 2:
            raise ValueError(
                "A separação exige um perímetro unificado com exatamente 2 matrículas. "
                f"Este desenho possui {len(grupo)} matrícula(s)."
            )
        base_id = matricula_base_id or matricula_id
        mat_base = next((g for g in grupo if g["id"] == base_id), None)
        if not mat_base:
            raise ValueError("A matrícula escolhida para o lote da base não pertence ao perímetro unificado.")
        mat_fundo = next(g for g in grupo if g["id"] != mat_base["id"])
        area_reg_m2 = float(mat_base["area_ha"] or 0.0) * 10000.0
        if area_reg_m2 <= 0:
            raise ValueError(f"A matrícula {mat_base['numero_matricula']} não possui área registrada para orientar o corte.")
        return {
            "tipo": "SEPARACAO", "desenho_id": desenho_id, "propriedade_id": row["propriedade_id"],
            "mat_base": mat_base, "mat_fundo": mat_fundo,
            "modo_calc": "AREA_DEFINIDA", "alvo_calc": "BASE", "area_alvo_m2": area_reg_m2,
            "area_registrada_total_m2": sum(float(g["area_ha"] or 0.0) for g in grupo) * 10000.0,
        }

    if len(grupo) > 1:
        raise ValueError(
            "Esta matrícula faz parte de um perímetro unificado. Use o modo 'Separar matrículas' "
            "para dividir o polígono entre as matrículas."
        )
    return {
        "tipo": "SIMPLES", "desenho_id": matricula_id, "propriedade_id": row["propriedade_id"],
        "modo_calc": modo, "alvo_calc": alvo, "area_alvo_m2": area_alvo_m2,
    }


def _avisos_contexto(ctx: Dict[str, Any], area_total_m2: float) -> List[str]:
    avisos: List[str] = []
    if ctx["tipo"] == "SEPARACAO":
        soma = ctx["area_registrada_total_m2"]
        if soma > 0 and abs(soma - area_total_m2) / area_total_m2 > 0.01:
            avisos.append(
                f"A soma das áreas registradas ({soma / 10000.0:.4f} ha) difere da área do polígono "
                f"({area_total_m2 / 10000.0:.4f} ha) em mais de 1%. O corte segue a área registrada da matrícula da base."
            )
    return avisos


def simular_divisao_offset(
    levantamento_id: int,
    matricula_id: int,
    ponto_base_1_id: int,
    ponto_base_2_id: int,
    modo: str,
    alvo: str = "BASE",
    area_alvo_m2: Optional[float] = None,
    matricula_base_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Endpoint service: executa a simulação analítica do corte sem persistir dados no banco."""
    ctx = _resolver_contexto(levantamento_id, matricula_id, modo, alvo, area_alvo_m2, matricula_base_id)
    pontos = _obter_pontos_perimetro_matricula(levantamento_id, ctx["desenho_id"])
    resultado = calcular_geometria_divisao(
        pontos=pontos,
        ponto_base_1_id=ponto_base_1_id,
        ponto_base_2_id=ponto_base_2_id,
        modo=ctx["modo_calc"],
        alvo=ctx["alvo_calc"],
        area_alvo_m2=ctx["area_alvo_m2"],
    )
    # Remove objetos não-serializáveis
    resultado["lote_base"].pop("polygon_geom", None)
    resultado["lote_remanescente"].pop("polygon_geom", None)
    resultado["tipo_operacao"] = ctx["tipo"]
    resultado["avisos"] = _avisos_contexto(ctx, resultado["area_total_m2"])
    if ctx["tipo"] == "SEPARACAO":
        resultado["lote_base"]["matricula"] = ctx["mat_base"]["numero_matricula"]
        resultado["lote_remanescente"]["matricula"] = ctx["mat_fundo"]["numero_matricula"]
    return resultado


def _nome_matricula_livre(propriedade_id: int, nome: str, ignorar_id: Optional[int] = None) -> str:
    rows = execute_query(
        "SELECT id, numero_matricula FROM matriculas WHERE propriedade_id = ?",
        params=(propriedade_id,), fetch_all=True
    )
    ocupados = {str(r["numero_matricula"]).strip().upper() for r in (rows or []) if r["id"] != ignorar_id}
    final, n = nome, 2
    while final.upper() in ocupados:
        final = f"{nome} ({n})"
        n += 1
    return final


def _coord_ponto(pt: Dict[str, Any]) -> Tuple[float, float]:
    return (
        float(pt.get("e_corrigido") or pt.get("e_original") or 0.0),
        float(pt.get("n_corrigido") or pt.get("n_original") or 0.0),
    )


def executar_divisao_offset(
    levantamento_id: int,
    matricula_id: int,
    ponto_base_1_id: int,
    ponto_base_2_id: int,
    modo: str,
    alvo: str = "BASE",
    area_alvo_m2: Optional[float] = None,
    nome_gleba_a: Optional[str] = None,
    nome_gleba_b: Optional[str] = None,
    matricula_base_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Executa a divisão em uma única transação (tudo ou nada).

    SIMPLES: a matrícula de origem fica com o lote da base (Gleba A, número preservado salvo se
    `nome_gleba_a` for informado) e uma nova matrícula recebe o remanescente (Gleba B).
    SEPARACAO: o perímetro unificado é cortado entre as 2 matrículas; cada uma passa a ter desenho
    próprio (o vínculo matricula_origem_desenho_id é removido) e mantém número e área registrada.
    Em ambos os casos os segmentos são refeitos herdando confrontante/limite/anuência das divisas antigas.
    """
    ctx = _resolver_contexto(levantamento_id, matricula_id, modo, alvo, area_alvo_m2, matricula_base_id)
    desenho_id = ctx["desenho_id"]
    prop_id = ctx["propriedade_id"]

    pontos_originais = _obter_pontos_perimetro_matricula(levantamento_id, desenho_id)
    geo_res = calcular_geometria_divisao(
        pontos=pontos_originais,
        ponto_base_1_id=ponto_base_1_id,
        ponto_base_2_id=ponto_base_2_id,
        modo=ctx["modo_calc"],
        alvo=ctx["alvo_calc"],
        area_alvo_m2=ctx["area_alvo_m2"],
    )

    fuso = geo_res["fuso_utm"]
    base_poly = geo_res["lote_base"]["polygon_geom"]
    rem_poly = geo_res["lote_remanescente"]["polygon_geom"]
    cortes = geo_res["pontos_corte"]
    nomes_pontos = {p["id"]: p["nome_vertice"] for p in pontos_originais}
    pos_original = {p["id"]: i for i, p in enumerate(pontos_originais)}

    # Nomes para os vértices de corte novos (V-01, V-02...), únicos no levantamento
    rows_pts = execute_query(
        "SELECT nome_vertice FROM pontos WHERE levantamento_id = ?",
        params=(levantamento_id,), fetch_all=True
    )
    nomes_ocupados = {str(r["nome_vertice"]).strip().upper() for r in (rows_pts or [])}

    def _proximo_nome_v() -> str:
        num = 1
        while f"V-{num:02d}" in nomes_ocupados or f"V{num}" in nomes_ocupados:
            num += 1
        nome = f"V-{num:02d}"
        nomes_ocupados.add(nome)
        return nome

    nomes_corte = [
        nomes_pontos.get(c["vertice_existente_id"]) if c.get("vertice_existente_id") else _proximo_nome_v()
        for c in cortes
    ]

    metodo_padrao = "PG1" if (pontos_originais[0].get("sigma_lat") or 0.0) > 0.0 else "MC1"

    with DatabaseManager() as conn:  # commit no sucesso, rollback em qualquer exceção
        cursor = conn.cursor()

        # Segmentos antigos do desenho (herança de confrontante/limite/anuência)
        cursor.execute(
            f"SELECT {COLUNAS_SELECT_SEGMENTOS} FROM segmentos WHERE levantamento_id = ? AND matricula_id = ?",
            (levantamento_id, desenho_id)
        )
        segmentos_antigos = segmentos_antigos_para_dicts(cursor.fetchall())

        # 1. Define as matrículas donas de cada lote
        if ctx["tipo"] == "SIMPLES":
            cursor.execute(
                "SELECT numero_matricula, denominacao, ccir, itr, cri_comarca, cri_circunscricao, "
                "livro_registro, folha_registro, georreferenciamento FROM matriculas WHERE id = ?",
                (matricula_id,)
            )
            row_mat = cursor.fetchone()
            num_orig = (row_mat["numero_matricula"] or "").strip()
            denom_orig = (row_mat["denominacao"] or "").strip()

            if nome_gleba_a and nome_gleba_a.strip():
                nome_a = nome_gleba_a.strip()
                if _nome_matricula_livre(prop_id, nome_a, ignorar_id=matricula_id) != nome_a:
                    raise ValueError(f"Já existe uma matrícula '{nome_a}' nesta propriedade.")
            else:
                nome_a = num_orig  # preserva o número oficial da matrícula de origem
            base_b = (nome_gleba_b or "").strip() or (f"{num_orig} - GLEBA B" if num_orig else "GLEBA B")
            nome_b = _nome_matricula_livre(prop_id, base_b)
            if nome_b.upper() == nome_a.upper():
                nome_b = _nome_matricula_livre(prop_id, f"{base_b} (2)")

            # Nova matrícula com desenho PRÓPRIO (matricula_origem_desenho_id = NULL)
            cursor.execute(
                """
                INSERT INTO matriculas (
                    propriedade_id, numero_matricula, denominacao, ccir, itr, area_ha,
                    cri_comarca, cri_circunscricao, livro_registro, folha_registro, georreferenciamento
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    prop_id, nome_b, f"Desmembramento de {denom_orig or num_orig}".strip(),
                    row_mat["ccir"], row_mat["itr"], geo_res["lote_remanescente"]["area_ha"],
                    row_mat["cri_comarca"], row_mat["cri_circunscricao"],
                    row_mat["livro_registro"], row_mat["folha_registro"], row_mat["georreferenciamento"],
                )
            )
            dono_base, dono_rem = matricula_id, cursor.lastrowid
            cursor.execute(
                "UPDATE matriculas SET numero_matricula = ?, area_ha = ? WHERE id = ?",
                (nome_a, geo_res["lote_base"]["area_ha"], matricula_id)
            )
            nome_resultado_a, nome_resultado_b = nome_a, nome_b
        else:
            dono_base, dono_rem = ctx["mat_base"]["id"], ctx["mat_fundo"]["id"]
            # A matrícula derivada deixa de usar o desenho da outra
            derivada_id = dono_rem if dono_base == desenho_id else dono_base
            cursor.execute("UPDATE matriculas SET matricula_origem_desenho_id = NULL WHERE id = ?", (derivada_id,))
            nome_resultado_a = ctx["mat_base"]["numero_matricula"]
            nome_resultado_b = ctx["mat_fundo"]["numero_matricula"]

        # 2. Helpers de gravação de pontos
        def _inserir_vertice_corte(mat_id: int, nome: str, c: Dict[str, Any]) -> int:
            cursor.execute(
                """
                INSERT INTO pontos (
                    levantamento_id, matricula_id, nome_vertice, tipo_ponto,
                    lat, lon, alt, lat_corrigido, lon_corrigido, alt_corrigido,
                    e_original, n_original, alt_original, e_corrigido, n_corrigido,
                    fuso_utm, status_ponto, status_correcao, metodo_posicionamento,
                    camada_ciclo_vida, sigma_e, sigma_n, sigma_z, sigma_lat, sigma_lon, sigma_alt
                ) VALUES (
                    ?, ?, ?, 'V',
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, 'CORRIGIDO', 'CORRIGIDO', 'PA1',
                    'PERIMETRO', 0.05, 0.05, 0.10, 0.0000005, 0.0000005, 0.10
                )
                """,
                (
                    levantamento_id, mat_id, nome,
                    c["lat"], c["lon"], c["altitude"], c["lat"], c["lon"], c["altitude"],
                    c["este"], c["norte"], c["altitude"], c["este"], c["norte"],
                    fuso
                )
            )
            return cursor.lastrowid

        def _clonar_ponto(pid: int, mat_id: int) -> int:
            cursor.execute("SELECT * FROM pontos WHERE id = ?", (pid,))
            dados = dict(cursor.fetchone())
            dados.pop("id", None)
            dados["matricula_id"] = mat_id
            colunas = list(dados.keys())
            cursor.execute(
                f"INSERT INTO pontos ({', '.join(colunas)}) VALUES ({', '.join('?' for _ in colunas)})",
                tuple(dados[c] for c in colunas)
            )
            return cursor.lastrowid

        # 3. Monta o anel de cada lote
        def _montar_anel(poly_target: Polygon, dono: int):
            coords_poly = list(poly_target.exterior.coords)[:-1]
            ids: List[int] = []
            remap: Dict[int, int] = {}   # id original -> clone usado neste anel
            movidos: List[int] = []
            for ce, cn in coords_poly:
                pid: Optional[int] = None
                for k, c in enumerate(cortes):
                    if math.hypot(ce - c["este"], cn - c["norte"]) < 0.01:
                        exist = c.get("vertice_existente_id")
                        if exist:
                            if dono == desenho_id:
                                pid = exist
                            else:
                                pid = _clonar_ponto(exist, dono)
                                remap[exist] = pid
                        else:
                            pid = _inserir_vertice_corte(dono, nomes_corte[k], c)
                        break
                if pid is None:
                    prox = min(pontos_originais, key=lambda pt: math.hypot(ce - _coord_ponto(pt)[0], cn - _coord_ponto(pt)[1]))
                    ex, ny = _coord_ponto(prox)
                    if math.hypot(ce - ex, cn - ny) < 0.01:
                        pid = prox["id"]
                        if dono != desenho_id:
                            movidos.append(pid)
                if pid is not None and (not ids or ids[-1] != pid):
                    ids.append(pid)
            if len(ids) > 1 and ids[0] == ids[-1]:
                ids.pop()
            # Começa no vértice que vinha primeiro no caminhamento original
            inverso = {v: k for k, v in remap.items()}
            candidatos = [(pos_original[inverso.get(i, i)], idx) for idx, i in enumerate(ids) if inverso.get(i, i) in pos_original]
            if candidatos:
                ini = min(candidatos)[1]
                ids = ids[ini:] + ids[:ini]
            return ids, remap, movidos

        aneis: Dict[str, List[int]] = {}
        segs_novos: Dict[str, list] = {}
        for chave, poly_target, dono in (("base", base_poly, dono_base), ("rem", rem_poly, dono_rem)):
            ids, remap, movidos = _montar_anel(poly_target, dono)
            if len(ids) < 3:
                raise ValueError("Falha ao montar o perímetro de um dos lotes (menos de 3 vértices).")

            if movidos:
                cursor.execute(
                    f"UPDATE pontos SET matricula_id = ? WHERE levantamento_id = ? AND id IN ({','.join('?' for _ in movidos)})",
                    (dono, levantamento_id, *movidos)
                )
            for ordem_idx, pid in enumerate(ids, start=1):
                cursor.execute("UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?", (ordem_idx, pid))

            # Herda metadados das divisas antigas (aplicando o mapa de clones deste anel)
            antigos = [
                {**sg, "ponto_inicio_id": remap.get(sg["ponto_inicio_id"], sg["ponto_inicio_id"]),
                 "ponto_fim_id": remap.get(sg["ponto_fim_id"], sg["ponto_fim_id"])}
                for sg in segmentos_antigos
            ] if remap else segmentos_antigos
            aneis[chave] = ids
            segs_novos[chave] = montar_info_segmentos(antigos, ids, metodo_padrao)

        query_seg = f"""
            INSERT INTO segmentos (
                levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id,
                {", ".join(CAMPOS_HERDADOS)}
            ) VALUES (?, ?, ?, ?, {", ".join("?" for _ in CAMPOS_HERDADOS)})
        """
        cursor.execute("DELETE FROM segmentos WHERE levantamento_id = ? AND matricula_id = ?", (levantamento_id, desenho_id))
        for chave, dono in (("base", dono_base), ("rem", dono_rem)):
            cursor.execute("DELETE FROM segmentos WHERE levantamento_id = ? AND matricula_id = ?", (levantamento_id, dono))
            for pt_ini, pt_fim, info in segs_novos[chave]:
                cursor.execute(query_seg, (
                    levantamento_id, dono, pt_ini, pt_fim,
                    *(info[campo] for campo in CAMPOS_HERDADOS)
                ))

    # Sincroniza o workspace físico (fora da transação; falha aqui não desfaz a divisão)
    try:
        from services.documentacao.exportacao_service import ExportacaoService
        ExportacaoService.gerar_documento_cliente_workspace(levantamento_id)
    except Exception as e:
        logger.warning(f"[DIVISAO_LOTES] Divisão salva, mas falhou ao sincronizar o workspace: {e}")

    logger.info(
        f"[DIVISAO_LOTES] {ctx['tipo']} concluída: matrículas {dono_base} ({nome_resultado_a}) e {dono_rem} ({nome_resultado_b})."
    )

    if ctx["tipo"] == "SIMPLES":
        mensagem = f"Desmembramento realizado! Matrícula '{nome_resultado_a}' (Gleba A) e nova matrícula '{nome_resultado_b}' (Gleba B)."
    else:
        mensagem = f"Perímetro separado! Matrículas '{nome_resultado_a}' e '{nome_resultado_b}' agora possuem desenho próprio."

    return {
        "sucesso": True,
        "tipo_operacao": ctx["tipo"],
        "mensagem": mensagem,
        "avisos": _avisos_contexto(ctx, geo_res["area_total_m2"]),
        "distancia_offset_m": geo_res["distancia_offset_m"],
        "gleba_a": {
            "matricula_id": dono_base,
            "numero_matricula": nome_resultado_a,
            "area_ha": geo_res["lote_base"]["area_ha"],
            "area_m2": geo_res["lote_base"]["area_m2"],
            "total_vertices": len(aneis["base"]),
        },
        "gleba_b": {
            "matricula_id": dono_rem,
            "numero_matricula": nome_resultado_b,
            "area_ha": geo_res["lote_remanescente"]["area_ha"],
            "area_m2": geo_res["lote_remanescente"]["area_m2"],
            "total_vertices": len(aneis["rem"]),
        },
        "vertices_divisao": nomes_corte,
    }
