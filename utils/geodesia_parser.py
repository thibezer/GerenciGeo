"""
utils/geodesia_parser.py — Centralizador de Parsing Geodésico e Coordenadas (SIGEF / INCRA)
"""
import re
import logging
from utils.transformer_cache import get_transformer

# ── Constantes & Padrões ───────────────────────────────────────────────────────

REGEX_MARCO_SIGEF = re.compile(r"\b([A-Z0-9]{3,5})-(M|P|V)-(\d+)\b", re.IGNORECASE)
REGEX_MARCO_SEM_PREFIXO = re.compile(r"\b(M|P|V)-(\d+)\b", re.IGNORECASE)
WKT_POINT_REGEX = re.compile(r"POINT\s*\(\s*(-?[\d.]+(?:[eE][+-]?\d+)?)\s+(-?[\d.]+(?:[eE][+-]?\d+)?)\s*\)", re.IGNORECASE)
WKT_LINESTRING_REGEX = re.compile(r"LINESTRING\s*\(\s*(.*?)\s*\)", re.IGNORECASE)
WKT_COORDS_REGEX = re.compile(r"(-?[\d.]+(?:[eE][+-]?\d+)?)\s+(-?[\d.]+(?:[eE][+-]?\d+)?)")

# ── Funções de Extração e Validação ────────────────────────────────────────────

def extract_codigo_parts(codigo):
    """
    Extrai tipo (M/P/V), número e código completo do vértice.
    Suporta formatos 'ABC-M-0001', 'M-0001', 'P1', 'V01', 'VRT-1', etc.
    """
    if not codigo:
        return None, None, None
    codigo = str(codigo).strip().strip('"').strip("'")
    if not codigo:
        return None, None, None

    match = REGEX_MARCO_SIGEF.search(codigo)
    if match and match.group(0) == codigo:
        return match.group(2).upper(), int(match.group(3)), codigo.upper()
    match_sem = REGEX_MARCO_SEM_PREFIXO.search(codigo)
    if match_sem and match_sem.group(0) == codigo:
        return match_sem.group(1).upper(), int(match_sem.group(2)), codigo.upper()

    # Fallback 1: se contem padrao SIGEF em qualquer trecho do texto
    if match:
        return match.group(2).upper(), int(match.group(3)), match.group(0).upper()
    if match_sem:
        return match_sem.group(1).upper(), int(match_sem.group(2)), match_sem.group(0).upper()

    # Rejeitar textos descritivos, metadados e cabeçalhos de planilhas
    palavras_bloqueadas = {
        'sistema', 'referencia', 'referência', 'sirgas', 'tabela', 'perimetro', 'perímetro',
        'lado', 'denominacao', 'denominação', 'parcela', 'coordenada', 'coordenadas',
        'latitude', 'longitude', 'altitude', 'meridiano', 'hemisferio', 'hemisfério',
        'fuso', 'datum', 'vertice', 'vértice', 'codigo', 'código', 'sigma', 'metodo', 'método'
    }
    tokens = set(re.split(r'[:\s\-_/]+', codigo.lower()))
    if tokens & palavras_bloqueadas or len(codigo.split()) > 2 or len(codigo) > 25:
        return None, None, None

    # Fallback 2: Vértice genérico (ex: P0001, P1, V1, M01, VRT-1, P_01, 101, etc.)
    # Exige presença de ao menos um número no código do ponto para descartar palavras genéricas ("INVALIDO", "OBS")
    m_num = re.search(r'\d+', codigo)
    if not m_num:
        return None, None, None

    m_tipo = re.search(r'\b(M|P|V)\b', codigo, re.IGNORECASE)
    if not m_tipo:
        m_tipo = re.search(r'(M|P|V)', codigo, re.IGNORECASE)
    tipo_flex = m_tipo.group(1).upper() if m_tipo else 'V'
    num_flex = int(m_num.group(0))
    return tipo_flex, num_flex, codigo.upper()


def parse_num_robust(val):
    """
    Converte uma representação numérica string em float de forma robusta.
    Suporta formato brasileiro (vírgula decimal '1.234,56'), internacional ('1234.56'),
    aspas e sanitiza espaços invisíveis/inquebráveis (\\xa0).
    """
    if val is None:
        return None
    s = str(val).strip().strip('"').strip("'").replace('\xa0', '').replace(' ', '')
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        pass
    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
    elif ',' in s:
        s = s.replace(',', '.')
    elif s.count('.') > 1:
        parts = s.split('.')
        s = "".join(parts[:-1]) + "." + parts[-1]
    try:
        return float(s)
    except ValueError:
        return None


def parse_dms_robust(val):
    """
    Converte notação Sexagesimal DMS (ex: 22° 30' 15.5" S ou -22 30 15.5) em Graus Decimais.
    """
    if not val:
        return None
    s = str(val).strip().replace('\xa0', ' ')
    if not s:
        return None
    m = re.search(r'([+-]?)\s*(\d+)[°º\s]+(\d+)[\'′\s]+([\d.,]+)[\"″]?\s*([NSEW]?)', s, re.IGNORECASE)
    if m:
        try:
            sinal = -1 if m.group(1) == '-' else 1
            deg = float(m.group(2))
            mins = float(m.group(3))
            secs = parse_num_robust(m.group(4)) or 0.0
            decimal = (deg + mins / 60.0 + secs / 3600.0) * sinal
            hemisferio = m.group(5).upper()
            if hemisferio in ('S', 'W'):
                decimal = -abs(decimal)
            return decimal
        except Exception:
            pass
    return None


def parse_wkt_point(wkt_str):
    """
    Extrai (lon, lat) de uma string WKT POINT(lon lat).
    """
    if not wkt_str:
        return None, None
    m = WKT_POINT_REGEX.search(str(wkt_str))
    if m:
        try:
            return float(m.group(1)), float(m.group(2))
        except (ValueError, TypeError):
            pass
    return None, None


def parse_wkt_linestring(wkt_str):
    """
    Extrai a sequência de vértices [(lon, lat), (lon, lat), ...] de uma string
    WKT LINESTRING (lon1 lat1, lon2 lat2, ...), como a exportada pelo SIGEF/INCRA
    para descrever cada segmento de confrontação (arquivo de "limites").
    Retorna lista vazia se a string não for um LINESTRING válido.
    """
    if not wkt_str:
        return []
    m = WKT_LINESTRING_REGEX.search(str(wkt_str))
    if not m:
        return []

    pontos = []
    for par in m.group(1).split(','):
        partes = par.strip().split()
        if len(partes) >= 2:
            try:
                lon = float(partes[0])
                lat = float(partes[1])
                pontos.append((lon, lat))
            except (ValueError, TypeError):
                continue
    return pontos


def parse_wkt_geometry(wkt_str):
    """
    Extrai lista de coordenadas (x, y) de qualquer WKT (POINT, LINESTRING, POLYGON, MULTIPOLYGON).
    Retorna lista de tuplas [(x1, y1), (x2, y2), ...].
    """
    if not wkt_str:
        return []
    coords = WKT_COORDS_REGEX.findall(str(wkt_str))
    res = []
    for cx, cy in coords:
        try:
            res.append((float(cx), float(cy)))
        except (ValueError, TypeError):
            continue
    return res


def resolver_coordenadas_robust(val_x, val_y, fuso_utm_default=22):
    """
    Resolve e converte inteligentemente entre coordenadas Geográficas (Lat/Lon) e UTM (Easting/Northing).
    Retorna a tupla (lat, lon, este, norte).
    """
    v1 = parse_num_robust(val_x)
    if v1 is None:
        v1 = parse_dms_robust(val_x)
    v2 = parse_num_robust(val_y)
    if v2 is None:
        v2 = parse_dms_robust(val_y)
        
    lat, lon, este, norte = None, None, None, None
    if v1 is not None and v2 is not None:
        if abs(v1) <= 180 and abs(v2) <= 180:
            if abs(v2) <= 90 and abs(v1) <= 180:
                lon, lat = v1, v2
            else:
                lat, lon = v1, v2
            fuso = int((lon + 180) / 6) + 1
            epsg_utm = 31960 + fuso
            try:
                transformer_ll_to_utm = get_transformer("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)
                este, norte = transformer_ll_to_utm.transform(lon, lat)
            except Exception as e:
                logging.getLogger(__name__).warning(f"Erro ao converter GEO para UTM: {e}")
        else:
            # Tratamento de inversão UTM (Norte no v1 e Este no v2)
            if v1 > 1000000 and v2 < 1000000:
                norte, este = v1, v2
            else:
                este, norte = v1, v2
            epsg_utm = 31960 + fuso_utm_default
            try:
                transformer_utm_to_ll = get_transformer(f"epsg:{epsg_utm}", "epsg:4674", always_xy=True)
                lon, lat = transformer_utm_to_ll.transform(este, norte)
            except Exception as e:
                logging.getLogger(__name__).warning(f"Erro ao converter UTM para GEO: {e}")
    return lat, lon, este, norte


KNOWN_SIGEF_HEADERS = {
    'CODIGO', 'QRCODE', 'TIPO_VERTICE', 'GEOMETRIA_WKT', 'METODO_POSICIONAMENTO',
    'SIGMA_X', 'SIGMA_Y', 'SIGMA_Z', 'LONGITUDE', 'LATITUDE', 'ALTITUDE', 'NOME',
    'DO_VERTICE', 'ESTE', 'NORTE', 'X', 'Y', 'Z'
}

def detect_csv_delimiter(first_line: str) -> str:
    """
    Detecta dinamicamente se o delimitador de um CSV é ponto e vírgula, tabulação ou vírgula,
    analisando a contagem de colunas reconhecidas e prevenindo ambiguidades quando a vírgula
    é utilizada simultaneamente como separador decimal e delimitador de colunas.
    """
    if not first_line:
        return ';'
    
    first_line_clean = first_line.replace('\ufeff', '').strip()
    
    scores = {}
    for delim in [';', '\t', ',']:
        cols = [c.strip().strip('"').upper() for c in first_line_clean.split(delim)]
        score = sum(1 for c in cols if c in KNOWN_SIGEF_HEADERS)
        scores[delim] = (score, len(cols))

    best_delim = max(scores.keys(), key=lambda d: (scores[d][0], scores[d][1] if scores[d][0] > 0 else 0))
    if scores[best_delim][0] > 0:
        return best_delim

    if ';' in first_line_clean:
        return ';'
    if '\t' in first_line_clean:
        return '\t'
    if ',' in first_line_clean:
        return ','
    return ';'
