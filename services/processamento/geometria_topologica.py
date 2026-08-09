"""
Módulo de Geometria e Topologia Cadastral (GerenciGeo)
Validação de simplicidade poligonal (OGC / SIGEF / INCRA),
detecção determinística de autointerseções e desentrelaçamento 2-Opt geométrico e métrico.
"""
import math
from typing import List, Dict, Any, Tuple, Optional


def segmentos_se_cruzam(p1: Tuple[float, float], p2: Tuple[float, float],
                        p3: Tuple[float, float], p4: Tuple[float, float]) -> bool:
    """
    Determina se o segmento aberto (p1, p2) intercepta estritamente o segmento aberto (p3, p4).
    Cada ponto é uma tupla (x, y) ou (lat, lon).
    """
    def orientacao(a: Tuple[float, float], b: Tuple[float, float], c: Tuple[float, float]) -> int:
        val = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
        if abs(val) < 1e-12:
            return 0  # Colinear
        return 1 if val > 0 else 2  # 1: Horário, 2: Anti-horário

    o1 = orientacao(p1, p2, p3)
    o2 = orientacao(p1, p2, p4)
    o3 = orientacao(p3, p4, p1)
    o4 = orientacao(p3, p4, p2)

    # Interseção estrita quando os pontos estão em lados opostos
    if o1 != 0 and o2 != 0 and o3 != 0 and o4 != 0:
        return (o1 != o2) and (o3 != o4)

    return False


def _obter_coordenadas_ponto(p: Dict[str, Any]) -> Tuple[float, float]:
    """Retorna a melhor coordenada (lat, lon) disponível para o ponto."""
    lat = p.get("lat_corrigido") if p.get("lat_corrigido") is not None else p.get("lat")
    lon = p.get("lon_corrigido") if p.get("lon_corrigido") is not None else p.get("lon")
    return float(lat or 0.0), float(lon or 0.0)


def _distancia_metrica_2d(p1: Dict[str, Any], p2: Dict[str, Any]) -> float:
    """Calcula a distância métrica euclidiana aproximada entre dois pontos em metros."""
    e1, n1 = p1.get("e_original"), p1.get("n_original")
    e2, n2 = p2.get("e_original"), p2.get("n_original")
    if e1 is not None and n1 is not None and e2 is not None and n2 is not None:
        try:
            dx = float(e1) - float(e2)
            dy = float(n1) - float(n2)
            return math.hypot(dx, dy)
        except (ValueError, TypeError):
            pass

    lat1, lon1 = _obter_coordenadas_ponto(p1)
    lat2, lon2 = _obter_coordenadas_ponto(p2)
    lat_med = math.radians((lat1 + lat2) / 2.0)
    dx = (lon1 - lon2) * math.cos(lat_med) * 111319.5
    dy = (lat1 - lat2) * 111139.0
    return math.hypot(dx, dy)


def detectar_autointersecoes_poligono(pontos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Identifica todos os pares de segmentos não adjacentes que se cruzam no perímetro fechado.
    Retorna uma lista descritiva dos conflitos topológicos encontrados.
    """
    n = len(pontos)
    if n < 4:
        return []

    coords = [_obter_coordenadas_ponto(p) for p in pontos]
    cruzamentos = []

    for i in range(n):
        p1, p2 = coords[i], coords[(i + 1) % n]
        # Compara com segmentos não adjacentes (evita i, i-1 e i+1)
        limite_fim = n if i > 0 else n - 1
        for j in range(i + 2, limite_fim):
            p3, p4 = coords[j], coords[(j + 1) % n]
            if segmentos_se_cruzam(p1, p2, p3, p4):
                nome1 = pontos[i].get("nome_vertice") or f"P{i+1}"
                nome2 = pontos[(i + 1) % n].get("nome_vertice") or f"P{((i + 1) % n) + 1}"
                nome3 = pontos[j].get("nome_vertice") or f"P{j+1}"
                nome4 = pontos[(j + 1) % n].get("nome_vertice") or f"P{((j + 1) % n) + 1}"

                cruzamentos.append({
                    "segmento_1": f"{nome1} -> {nome2}",
                    "segmento_2": f"{nome3} -> {nome4}",
                    "indices": (i, (i + 1) % n, j, (j + 1) % n),
                    "descricao": f"Segmento ({nome1} → {nome2}) cruza com ({nome3} → {nome4})"
                })

    return cruzamentos


def _pode_inverter_subrota_com_travamentos(pontos: List[Dict[str, Any]], inicio: int, fim: int) -> bool:
    """
    Verifica se a inversão do intervalo [inicio : fim] não divide ao meio nenhum bloco travado.
    Um bloco travado só pode ser invertido se estiver 100% contido dentro de [inicio : fim]
    ou 100% fora de [inicio : fim].
    """
    seqs_no_intervalo = set()
    for idx in range(inicio, fim + 1):
        seq = pontos[idx].get("sequencia_travada_id")
        if seq:
            seqs_no_intervalo.add(str(seq))

    if not seqs_no_intervalo:
        return True

    # Verifica se algum ponto dessa mesma sequência está fora do intervalo
    for idx, p in enumerate(pontos):
        if idx < inicio or idx > fim:
            seq = p.get("sequencia_travada_id")
            if seq and str(seq) in seqs_no_intervalo:
                return False  # O bloco seria cortado ao meio!

    return True


def desembaracar_poligono_2opt(pontos_ordenados: List[Dict[str, Any]], max_iter: int = 300) -> List[Dict[str, Any]]:
    """
    Aplica o algoritmo 2-Opt geométrico e métrico:
    1. Elimina autointerseções e cruzamentos em X do polígono fechado.
    2. Otimiza o comprimento perimetral, eliminando dobras internas, linhas duplas e zig-zags.
    Preserva 100% a integridade de blocos com sequencia_travada_id.
    """
    n = len(pontos_ordenados)
    if n < 4:
        return pontos_ordenados

    lista = list(pontos_ordenados)

    # ── Fase 1: Desentrelaçamento de Autointerseções Estritas ──────────────
    melhorou = True
    iter_count = 0
    while melhorou and iter_count < max_iter:
        melhorou = False
        iter_count += 1
        coords = [_obter_coordenadas_ponto(p) for p in lista]

        for i in range(n):
            p1, p2 = coords[i], coords[(i + 1) % n]
            limite_fim = n if i > 0 else n - 1

            for j in range(i + 2, limite_fim):
                p3, p4 = coords[j], coords[(j + 1) % n]

                if segmentos_se_cruzam(p1, p2, p3, p4):
                    sub_ini = i + 1
                    sub_fim = j

                    if _pode_inverter_subrota_com_travamentos(lista, sub_ini, sub_fim):
                        lista[sub_ini:sub_fim + 1] = list(reversed(lista[sub_ini:sub_fim + 1]))
                        melhorou = True
                        break

            if melhorou:
                break

    # ── Fase 2: Otimização Métrica de Comprimento Euclidiano (2-Opt TSP) ───
    # Elimina dobras paralelas, ziguezagues e rotas de ida-e-volta internas
    melhorou = True
    iter_count = 0
    while melhorou and iter_count < max_iter:
        melhorou = False
        iter_count += 1

        for i in range(n):
            limite_fim = n if i > 0 else n - 1
            for j in range(i + 2, limite_fim):
                p1, p2 = lista[i], lista[(i + 1) % n]
                p3, p4 = lista[j], lista[(j + 1) % n]

                d_atual = _distancia_metrica_2d(p1, p2) + _distancia_metrica_2d(p3, p4)
                d_nova = _distancia_metrica_2d(p1, p3) + _distancia_metrica_2d(p2, p4)

                if d_nova < d_atual - 1e-4:
                    sub_ini = i + 1
                    sub_fim = j

                    if _pode_inverter_subrota_com_travamentos(lista, sub_ini, sub_fim):
                        lista[sub_ini:sub_fim + 1] = list(reversed(lista[sub_ini:sub_fim + 1]))
                        melhorou = True
                        break

            if melhorou:
                break

    return lista
