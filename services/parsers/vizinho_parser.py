"""Leitura dos arquivos de vizinho (SIGEF/INCRA): vértices, polígono (WKT), limites e planilhas ODS.

Só interpreta o arquivo e devolve pontos/segmentos candidatos; a gravação fica na rota. Também concentra o
casamento espacial dos vértices do vizinho com os vértices do levantamento (índice por células, O(n+m)).
"""

import csv
import os
import re
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Tuple

from utils.geodesia_parser import (
    detect_csv_delimiter,
    extract_codigo_parts,
    parse_num_robust,
    parse_wkt_geometry,
    parse_wkt_linestring,
    parse_wkt_point,
    resolver_coordenadas_robust,
)
from utils import ods_seguro

# Tolerância de coincidência entre um vértice do vizinho e um vértice do levantamento (graus, ~5,5 cm)
TOLERANCIA_GRAUS = 0.0000005

_NS_ODS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}
_ATTR_REPEAT_COLS = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated"
_ATTR_VALOR = "{urn:oasis:names:tc:opendocument:xmlns:office:1.0}value"
_MAX_LINHAS_ODS = 200_000

# Código completo de um vértice SIGEF (ex.: ABCD-V-0001): só ele casa com o nome do vértice do levantamento
_CODIGO_SIGEF_COMPLETO = re.compile(r"^[A-Z0-9]{3,5}-(M|P|V)-\d+$", re.IGNORECASE)


class VizinhoArquivoError(ValueError):
    """Arquivo de vizinho inválido (a rota converte em HTTP 400)."""


@dataclass
class VizinhoParseado:
    tipo: str = "vertices"                 # 'vertices' | 'poligono' | 'limites' | 'ods'
    pontos: List[dict] = field(default_factory=list)
    qrcode: Optional[str] = None
    nome_propriedade: Optional[str] = None
    segmentos_confrontacao: List[dict] = field(default_factory=list)
    casar_por_nome: bool = False           # True só no arquivo de vértices do SIGEF (códigos com credenciado)

    @property
    def is_poligono_only(self) -> bool:
        return self.tipo == "poligono"

    @property
    def is_limites_segmentos(self) -> bool:
        return self.tipo == "limites"


# ── ODS ────────────────────────────────────────────────────────────────────────

def _linhas_ods(conteudo: bytes) -> List[List[str]]:
    try:
        root = ods_seguro.carregar_raiz_ods(conteudo)
    except ods_seguro.ArquivoInseguroError as e:
        raise VizinhoArquivoError(str(e))

    linhas: List[List[str]] = []
    for table in root.findall(".//table:table", _NS_ODS):
        for row in table.findall(".//table:table-row", _NS_ODS):
            textos: List[str] = []
            for cell in row.findall(".//table:table-cell", _NS_ODS):
                repetido = cell.get(_ATTR_REPEAT_COLS)
                p_elements = cell.findall(".//text:p", _NS_ODS)
                texto = "".join(p.text for p in p_elements if p.text)
                if not texto:
                    texto = cell.get(_ATTR_VALOR) or ""
                try:
                    qtd = int(repetido) if repetido else 1
                except ValueError:
                    qtd = 1
                if qtd > 30:
                    qtd = 1
                textos.extend([texto] * qtd)
            if any(str(c).strip() for c in textos):
                linhas.append(textos)
                if len(linhas) > _MAX_LINHAS_ODS:
                    raise VizinhoArquivoError("A planilha ODS tem linhas demais para importar.")
    return linhas


def _parse_ods(conteudo: bytes, fuso_utm: int) -> VizinhoParseado:
    resultado = VizinhoParseado(tipo="ods")
    ods_rows = _linhas_ods(conteudo)
    if not ods_rows:
        return resultado

    cabecalho = [str(c).strip().upper() for c in ods_rows[0]]

    def col(nomes):
        for n in nomes:
            if n in cabecalho:
                return cabecalho.index(n)
        return -1

    idx_cod = col(["CODIGO", "VERTICE", "DO_VERTICE", "NOME", "MARCO", "PONTO", "ID"])
    idx_x = col(["X", "LONGITUDE", "ESTE", "EASTING", "COORD_X", "LONG", "E"])
    idx_y = col(["Y", "LATITUDE", "NORTE", "NORTHING", "COORD_Y", "LAT", "N"])
    tem_cabecalho = idx_cod >= 0 and (idx_x >= 0 or idx_y >= 0)
    dados = ods_rows[1:] if tem_cabecalho else ods_rows

    for cells in dados:
        if len(cells) < 2:
            continue
        if tem_cabecalho:
            c_code = cells[idx_cod] if 0 <= idx_cod < len(cells) else ""
            c_x = cells[idx_x] if 0 <= idx_x < len(cells) else ""
            c_y = cells[idx_y] if 0 <= idx_y < len(cells) else ""
        else:
            c_code = cells[0]
            c_x = cells[1] if len(cells) > 1 else ""
            c_y = cells[3] if len(cells) > 3 else (cells[2] if len(cells) > 2 else "")

        tipo, num, vertice = extract_codigo_parts(c_code)
        if not vertice:
            continue
        lat, lon, este, norte = resolver_coordenadas_robust(c_x, c_y, fuso_utm)
        if lat is None or lon is None:
            continue
        resultado.pontos.append({
            "tipo_ponto": tipo,
            "numero": num,
            "codigo_completo": vertice,
            "norte": norte,
            "este": este,
            "altitude": parse_num_robust(cells[5]) if len(cells) > 5 else 0.0,
            "lat": lat,
            "lon": lon,
            "sigma_n": parse_num_robust(cells[4]) if len(cells) > 4 else 0.0,
            "sigma_e": parse_num_robust(cells[2]) if len(cells) > 2 else 0.0,
            "sigma_z": parse_num_robust(cells[6]) if len(cells) > 6 else 0.0,
            "metodo_posicionamento": str(cells[7]).strip() if len(cells) > 7 else "PG1",
        })
    return resultado


# ── CSV ────────────────────────────────────────────────────────────────────────

def _parse_csv(conteudo: bytes, filename: str, fuso_utm: int) -> VizinhoParseado:
    try:
        texto = conteudo.decode("utf-8")
    except UnicodeDecodeError:
        texto = conteudo.decode("latin-1")

    texto = texto.replace("﻿", "")
    linhas = [ln.strip() for ln in texto.splitlines() if ln.strip()]
    if not linhas:
        raise VizinhoArquivoError("O arquivo CSV enviado está vazio.")

    rows = list(csv.reader(linhas, delimiter=detect_csv_delimiter(linhas[0])))
    if not rows:
        raise VizinhoArquivoError("Nenhum dado legível no CSV.")
    headers = [str(h).strip().upper() for h in rows[0]]

    def col(nomes):
        for n in nomes:
            if n in headers:
                return headers.index(n)
        return -1

    # Caso A: polígono (QRCODE + NOME + GEOMETRIA_WKT, sem CODIGO)
    if "QRCODE" in headers and "NOME" in headers and "GEOMETRIA_WKT" in headers and "CODIGO" not in headers:
        res = VizinhoParseado(tipo="poligono")
        idx_qr, idx_nome, idx_wkt = headers.index("QRCODE"), headers.index("NOME"), headers.index("GEOMETRIA_WKT")
        if len(rows) < 2 or len(rows[1]) <= max(idx_qr, idx_nome):
            raise VizinhoArquivoError("Linha de dados do polígono truncada ou inválida.")
        res.qrcode = str(rows[1][idx_qr]).strip()
        res.nome_propriedade = str(rows[1][idx_nome]).strip()
        if not res.qrcode or not res.nome_propriedade:
            raise VizinhoArquivoError("Dados de QRCODE ou NOME ausentes no CSV do polígono.")

        # Contador contínuo entre as linhas: códigos genéricos V-0001... nunca se repetem
        seq = 0
        for row in rows[1:]:
            if len(row) <= idx_wkt:
                continue
            for cx, cy in parse_wkt_geometry(str(row[idx_wkt]).strip()):
                lat, lon, este, norte = resolver_coordenadas_robust(cx, cy, fuso_utm)
                if lat is None or lon is None:
                    continue
                seq += 1
                res.pontos.append({
                    "tipo_ponto": "V", "numero": seq, "codigo_completo": f"V-{seq:04d}",
                    "norte": norte, "este": este, "altitude": 0.0, "lat": lat, "lon": lon,
                    "sigma_n": 0.0, "sigma_e": 0.0, "sigma_z": 0.0, "metodo_posicionamento": "PG1",
                })
        return res

    # Caso C: limites/segmentos de confrontação (DO_VERTICE + AO_VERTICE, sem CODIGO)
    if "DO_VERTICE" in headers and "AO_VERTICE" in headers and "CODIGO" not in headers:
        res = VizinhoParseado(tipo="limites")
        i_qr, i_do, i_ao = col(["QRCODE"]), col(["DO_VERTICE"]), col(["AO_VERTICE"])
        i_desc, i_az, i_comp = col(["CONFRONTANTE_DESC"]), col(["AZIMUTE"]), col(["COMPRIMENTO"])
        i_wkt = col(["GEOMETRIA_WKT", "WKT"])

        def val(row, idx):
            return str(row[idx]).strip() if 0 <= idx < len(row) else ""

        for row in rows[1:]:
            if not row:
                continue
            if i_qr >= 0 and not res.qrcode:
                q = val(row, i_qr)
                if q:
                    res.qrcode = q
            do_v, ao_v = val(row, i_do), val(row, i_ao)
            if not do_v or not ao_v:
                continue
            res.segmentos_confrontacao.append({
                "do_vertice": do_v.upper(),
                "ao_vertice": ao_v.upper(),
                "confrontante_desc": val(row, i_desc) or None,
                "azimute": parse_num_robust(val(row, i_az)),
                "comprimento": parse_num_robust(val(row, i_comp)),
                "vertices": parse_wkt_linestring(val(row, i_wkt)),
            })

        if not res.qrcode:
            res.qrcode = f"CSV_{os.path.splitext(filename)[0]}"
        if not res.segmentos_confrontacao:
            raise VizinhoArquivoError("Nenhum segmento de confrontação (DO_VERTICE/AO_VERTICE) foi localizado no arquivo de limites.")
        return res

    # Caso B: vértices (arquivo de vértices do SIGEF ou planilha genérica)
    res = VizinhoParseado(tipo="vertices")
    i_qr = col(["QRCODE"])
    i_cod = col(["CODIGO", "VERTICE", "DO_VERTICE", "NOME", "MARCO", "PONTO", "CODIGO_VERTICE", "NOME_VERTICE", "DENOMINACAO", "ID", "NUMERO"])
    i_x = col(["X", "LONGITUDE", "ESTE", "EASTING", "COORD_X", "LONG", "E", "LONGITUDE_DECIMAL", "X_UTM"])
    i_y = col(["Y", "LATITUDE", "NORTE", "NORTHING", "COORD_Y", "LAT", "N", "LATITUDE_DECIMAL", "Y_UTM"])
    i_z = col(["Z", "ALTITUDE", "ALT", "ELEVATION", "HEIGHT", "H"])
    i_wkt = col(["GEOMETRIA_WKT", "WKT"])
    i_met = col(["METODO_POSICIONAMENTO", "METODO"])
    i_sx = col(["SIGMA_X", "SIGMA_E"])
    i_sy = col(["SIGMA_Y", "SIGMA_N"])
    i_sz = col(["SIGMA_Z", "SIGMA_ALT"])

    # É o arquivo de vértices do SIGEF quando traz CODIGO junto de QRCODE/TIPO_VERTICE
    res.casar_por_nome = "CODIGO" in headers and ("QRCODE" in headers or "TIPO_VERTICE" in headers)

    for row in rows[1:]:
        if not row:
            continue

        def get(idx):
            return str(row[idx]).strip() if 0 <= idx < len(row) else ""

        if i_qr >= 0 and not res.qrcode:
            q = get(i_qr)
            if q:
                res.qrcode = q

        tipo, num, vertice = extract_codigo_parts(get(i_cod))
        if not vertice:
            continue

        val_x, val_y, val_wkt = get(i_x), get(i_y), get(i_wkt)
        wkt_lon, wkt_lat = parse_wkt_point(val_wkt)
        lat = lon = este = norte = None
        if val_x or val_y:
            lat, lon, este, norte = resolver_coordenadas_robust(val_x, val_y, fuso_utm)
        if (lat is None or lon is None) and wkt_lat is not None and wkt_lon is not None:
            lat, lon = wkt_lat, wkt_lon
            if este is None or norte is None:
                _, _, este, norte = resolver_coordenadas_robust(lon, lat, fuso_utm)

        res.pontos.append({
            "tipo_ponto": tipo or "V", "numero": num or 0, "codigo_completo": vertice,
            "norte": norte, "este": este,
            "altitude": parse_num_robust(get(i_z)) or 0.0,
            "lat": lat, "lon": lon,
            "sigma_n": parse_num_robust(get(i_sy)) or 0.0,
            "sigma_e": parse_num_robust(get(i_sx)) or 0.0,
            "sigma_z": parse_num_robust(get(i_sz)) or 0.0,
            "metodo_posicionamento": get(i_met) or "PG1",
        })
    return res


def parse_vizinho(conteudo: bytes, filename: str, fuso_utm: int) -> VizinhoParseado:
    """Interpreta o arquivo enviado (CSV ou ODS) e devolve o que foi detectado."""
    nome = (filename or "vizinho.csv")
    eh_ods = nome.lower().endswith(".ods") or conteudo.startswith(b"PK\x03\x04")
    if eh_ods:
        return _parse_ods(conteudo, fuso_utm)
    return _parse_csv(conteudo, nome, fuso_utm)


# ── Casamento espacial ─────────────────────────────────────────────────────────

def _celula(lat: float, lon: float, tol: float) -> Tuple[int, int]:
    return int(lat // tol), int(lon // tol)


def casar_vertices(nossos: Iterable[dict], pontos_vizinho: List[dict], casar_por_nome: bool,
                   tolerancia: float = TOLERANCIA_GRAUS) -> List[int]:
    """Ids dos vértices do levantamento que coincidem com algum vértice do vizinho.

    - por coordenada (|dlat| e |dlon| < tolerância), com índice em células: custo O(n + m), não O(n·m);
    - por nome somente quando `casar_por_nome` (arquivo de vértices do SIGEF) e o código é um código SIGEF
      completo: nomes genéricos (V-0001...) do polígono WKT nunca casam por engano."""
    indice: Dict[Tuple[int, int], List[Tuple[float, float]]] = {}
    nomes = set()
    for v in pontos_vizinho:
        if v.get("lat") is not None and v.get("lon") is not None:
            indice.setdefault(_celula(v["lat"], v["lon"], tolerancia), []).append((v["lat"], v["lon"]))
        codigo = (v.get("codigo_completo") or "").upper()
        if casar_por_nome and _CODIGO_SIGEF_COMPLETO.match(codigo):
            nomes.add(codigo)

    casados = []
    for n in nossos:
        nome = (n.get("nome_vertice") or "").upper()
        if nome and nome in nomes:
            casados.append(n["id"])
            continue
        lat, lon = n.get("lat"), n.get("lon")
        if lat is None or lon is None:
            continue
        ci, cj = _celula(lat, lon, tolerancia)
        achou = False
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for vlat, vlon in indice.get((ci + di, cj + dj), ()):
                    if abs(vlat - lat) < tolerancia and abs(vlon - lon) < tolerancia:
                        achou = True
                        break
                if achou:
                    break
            if achou:
                break
        if achou:
            casados.append(n["id"])
    return casados
