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
from shapely.ops import split

from database.connection import DatabaseManager, execute_query
from utils.transformer_cache import get_transformer
from services.gestores.levantamento_manager import salvar_ordem_caminhamento
from services.gestores.matricula_manager import resolver_campos_matricula

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
    pontos_corte_coords: List[Tuple[float, float]] = []
    if inter_ext.geom_type == "MultiPoint":
        pontos_corte_coords = [(float(pt.x), float(pt.y)) for pt in inter_ext.geoms]
    elif inter_ext.geom_type == "Point":
        pontos_corte_coords = [(float(inter_ext.x), float(inter_ext.y))]

    # Caso a linha corte em exatamente 2 pontos (padrão)
    if len(pontos_corte_coords) < 2:
        raise ValueError("A linha de corte não intersectou ambos os lados do perímetro.")

    # Ordena os pontos de corte ao longo da linha de corte (projeção em u)
    pontos_corte_coords.sort(key=lambda pt: float(np.dot(np.array(pt) - cut_center, u)))
    p_corte_1 = pontos_corte_coords[0]
    p_corte_2 = pontos_corte_coords[-1]

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

    alt_corte_1 = _interpolar_altitude(p_corte_1)
    alt_corte_2 = _interpolar_altitude(p_corte_2)

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
            },
            {
                "este": round(p_corte_2[0], 3),
                "norte": round(p_corte_2[1], 3),
                "altitude": round(alt_corte_2, 3),
                "lat": round(float(lat_c2), 8),
                "lon": round(float(lon_c2), 8),
            }
        ]
    }


def simular_divisao_offset(
    levantamento_id: int,
    matricula_id: int,
    ponto_base_1_id: int,
    ponto_base_2_id: int,
    modo: str,
    alvo: str = "BASE",
    area_alvo_m2: Optional[float] = None
) -> Dict[str, Any]:
    """Endpoint service: executa a simulação analítica do corte sem persistir dados no banco."""
    pontos = _obter_pontos_perimetro_matricula(levantamento_id, matricula_id)
    resultado = calcular_geometria_divisao(
        pontos=pontos,
        ponto_base_1_id=ponto_base_1_id,
        ponto_base_2_id=ponto_base_2_id,
        modo=modo,
        alvo=alvo,
        area_alvo_m2=area_alvo_m2
    )
    # Remove objetos não-serializáveis
    resultado["lote_base"].pop("polygon_geom", None)
    resultado["lote_remanescente"].pop("polygon_geom", None)
    return resultado


def executar_divisao_offset(
    levantamento_id: int,
    matricula_id: int,
    ponto_base_1_id: int,
    ponto_base_2_id: int,
    modo: str,
    alvo: str = "BASE",
    area_alvo_m2: Optional[float] = None,
    nome_gleba_a: Optional[str] = None,
    nome_gleba_b: Optional[str] = None
) -> Dict[str, Any]:
    """
    Executa a divisão e desmembramento atômico no banco de dados (Opção A):
    1. Calcula a geometria e novos vértices de corte.
    2. Atualiza a matrícula de origem (Lote 1 / Gleba A) com sua nova área e perímetro.
    3. Cria a nova matrícula derivada (Lote 2 / Gleba B) com sua área e perímetro.
    4. Insere os novos vértices virtuais (Tipo V) no banco.
    5. Reconstrói os segmentos perimetrais e preserva os confrontantes.
    """
    pontos_originais = _obter_pontos_perimetro_matricula(levantamento_id, matricula_id)
    geo_res = calcular_geometria_divisao(
        pontos=pontos_originais,
        ponto_base_1_id=ponto_base_1_id,
        ponto_base_2_id=ponto_base_2_id,
        modo=modo,
        alvo=alvo,
        area_alvo_m2=area_alvo_m2
    )

    fuso = geo_res["fuso_utm"]
    base_poly = geo_res["lote_base"]["polygon_geom"]
    rem_poly = geo_res["lote_remanescente"]["polygon_geom"]
    cortes = geo_res["pontos_corte"]

    # Consulta dados da matrícula original
    row_mat = execute_query(
        "SELECT id, propriedade_id, numero_matricula, denominacao, ccir, itr FROM matriculas WHERE id = ?",
        params=(matricula_id,),
        fetch_one=True
    )
    if not row_mat:
        raise ValueError(f"Matrícula ID {matricula_id} não encontrada.")

    prop_id = row_mat["propriedade_id"]
    num_orig = (row_mat["numero_matricula"] or "").strip()
    denom_orig = (row_mat["denominacao"] or "").strip()

    # Define os nomes das glebas
    if not nome_gleba_a:
        nome_gleba_a = f"{num_orig} - GLEBA A" if num_orig else "GLEBA A"
    if not nome_gleba_b:
        nome_gleba_b = f"{num_orig} - GLEBA B" if num_orig else "GLEBA B"

    # Garante que o nome da nova matrícula seja único na propriedade
    rows_existentes = execute_query(
        "SELECT numero_matricula FROM matriculas WHERE propriedade_id = ?",
        params=(prop_id,),
        fetch_all=True
    )
    nomes_matriculas = {str(r["numero_matricula"]).strip().upper() for r in (rows_existentes or [])}
    sufixo_num = 2
    nome_final_b = nome_gleba_b
    while nome_final_b.upper() in nomes_matriculas:
        nome_final_b = f"{nome_gleba_b} ({sufixo_num})"
        sufixo_num += 1

    # Nomes para os vértices de corte (V-01, V-02...)
    rows_pts = execute_query(
        "SELECT nome_vertice FROM pontos WHERE levantamento_id = ?",
        params=(levantamento_id,),
        fetch_all=True
    )
    nomes_ocupados = {str(r["nome_vertice"]).strip().upper() for r in (rows_pts or [])}

    def _proximo_nome_v():
        num = 1
        while f"V-{num:02d}".upper() in nomes_ocupados or f"V{num}".upper() in nomes_ocupados:
            num += 1
        nome = f"V-{num:02d}"
        nomes_ocupados.add(nome.upper())
        return nome

    nome_corte_1 = _proximo_nome_v()
    nome_corte_2 = _proximo_nome_v()

    # Transação atômica
    with DatabaseManager() as conn:
        cursor = conn.cursor()

        # 1. Cria a nova matrícula para a Gleba B
        cursor.execute(
            """
            INSERT INTO matriculas (
                propriedade_id, numero_matricula, denominacao, ccir, itr,
                area_ha, matricula_origem_desenho_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                prop_id,
                nome_final_b,
                f"Desmembramento de {denom_orig or num_orig}",
                row_mat["ccir"],
                row_mat["itr"],
                geo_res["lote_remanescente"]["area_ha"],
                matricula_id
            )
        )
        nova_matricula_id = cursor.lastrowid

        # 2. Atualiza a matrícula de origem (Gleba A)
        cursor.execute(
            """
            UPDATE matriculas
            SET numero_matricula = ?, area_ha = ?
            WHERE id = ?
            """,
            (
                nome_gleba_a,
                geo_res["lote_base"]["area_ha"],
                matricula_id
            )
        )

        # 3. Insere os pontos de corte virtuais para a Matrícula A (Gleba A)
        def _inserir_ponto(mat_id: int, nome: str, c: Dict[str, Any]) -> int:
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

        p1_mat_a_id = _inserir_ponto(matricula_id, nome_corte_1, cortes[0])
        p2_mat_a_id = _inserir_ponto(matricula_id, nome_corte_2, cortes[1])

        # Insere também os pontos de corte para a Matrícula B (Gleba B)
        p1_mat_b_id = _inserir_ponto(nova_matricula_id, nome_corte_1, cortes[0])
        p2_mat_b_id = _inserir_ponto(nova_matricula_id, nome_corte_2, cortes[1])

        # 4. Associa os vértices aos seus respectivos anéis perimetrais
        # Identifica quais pontos originais caem no polígono do Lote 1 e no Lote 2
        coords_orig_map = []
        for p in pontos_originais:
            e = float(p.get("e_corrigido") or p.get("e_original"))
            n_val = float(p.get("n_corrigido") or p.get("n_original"))
            coords_orig_map.append({"id": p["id"], "este": e, "norte": n_val})

        # Função para ordenar os pontos em um anel poligonal do Shapely
        def _montar_anel_ordenado(poly_target: Polygon, id_corte_1: int, id_corte_2: int) -> List[int]:
            coords_poly = list(poly_target.exterior.coords)[:-1]  # remove o fechamento duplicado
            anel_ids = []

            for ce, cn in coords_poly:
                # Verifica se coincide com o corte 1
                if math.hypot(ce - cortes[0]["este"], cn - cortes[0]["norte"]) < 0.05:
                    anel_ids.append(id_corte_1)
                    continue
                # Verifica se coincide com o corte 2
                if math.hypot(ce - cortes[1]["este"], cn - cortes[1]["norte"]) < 0.05:
                    anel_ids.append(id_corte_2)
                    continue

                # Procura ponto original mais próximo
                p_mais_prox = min(
                    coords_orig_map,
                    key=lambda pt: math.hypot(ce - pt["este"], cn - pt["norte"])
                )
                if math.hypot(ce - p_mais_prox["este"], cn - p_mais_prox["norte"]) < 0.10:
                    anel_ids.append(p_mais_prox["id"])

            return anel_ids

        anel_lote_a = _montar_anel_ordenado(base_poly, p1_mat_a_id, p2_mat_a_id)
        anel_lote_b = _montar_anel_ordenado(rem_poly, p1_mat_b_id, p2_mat_b_id)

        # Mover os pontos originais que pertencem ao Lote 2 para a nova_matricula_id
        ids_exclusivos_lote_b = [pid for pid in anel_lote_b if pid not in (p1_mat_b_id, p2_mat_b_id)]
        if ids_exclusivos_lote_b:
            cursor.execute(
                f"UPDATE pontos SET matricula_id = ? WHERE id IN ({','.join('?' for _ in ids_exclusivos_lote_b)})",
                (nova_matricula_id, *ids_exclusivos_lote_b)
            )

        # Configurar ordem perimetral de caminhamento nos pontos da Matrícula A
        for ordem_idx, pid in enumerate(anel_lote_a, start=1):
            cursor.execute(
                "UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?",
                (ordem_idx, pid)
            )

        # Configurar ordem perimetral de caminhamento nos pontos da Matrícula B
        for ordem_idx, pid in enumerate(anel_lote_b, start=1):
            cursor.execute(
                "UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?",
                (ordem_idx, pid)
            )

        conn.commit()

    # 5. Autorregeneração topológica das divisas para ambas as matrículas
    salvar_ordem_caminhamento(
        levantamento_id,
        matricula_id,
        [{"id": pid, "ordem": idx} for idx, pid in enumerate(anel_lote_a, start=1)]
    )
    salvar_ordem_caminhamento(
        levantamento_id,
        nova_matricula_id,
        [{"id": pid, "ordem": idx} for idx, pid in enumerate(anel_lote_b, start=1)]
    )

    logger.info(
        f"[DIVISAO_LOTES] Desmembramento concluído com sucesso. "
        f"Matrícula {matricula_id} ({nome_gleba_a}) e Nova Matrícula {nova_matricula_id} ({nome_final_b})."
    )

    return {
        "sucesso": True,
        "mensagem": f"Desmembramento realizado com sucesso! Geradas as glebas '{nome_gleba_a}' e '{nome_final_b}'.",
        "distancia_offset_m": geo_res["distancia_offset_m"],
        "gleba_a": {
            "matricula_id": matricula_id,
            "numero_matricula": nome_gleba_a,
            "area_ha": geo_res["lote_base"]["area_ha"],
            "area_m2": geo_res["lote_base"]["area_m2"],
            "total_vertices": len(anel_lote_a),
        },
        "gleba_b": {
            "matricula_id": nova_matricula_id,
            "numero_matricula": nome_final_b,
            "area_ha": geo_res["lote_remanescente"]["area_ha"],
            "area_m2": geo_res["lote_remanescente"]["area_m2"],
            "total_vertices": len(anel_lote_b),
        },
        "vertices_divisao": [nome_corte_1, nome_corte_2],
    }
