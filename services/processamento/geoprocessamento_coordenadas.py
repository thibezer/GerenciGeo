import os
from utils.transformer_cache import get_transformer
import subprocess

def latlon_to_utm22s(lat, lon):
    """
    Converte coordenadas Latitude/Longitude (SIRGAS2000) para UTM Zona 22S (SIRGAS 2000).
    EPSG:4674 -> EPSG:31982
    """
    # Alterado de epsg:4326 para epsg:4674 para garantir consistência matemática absoluta
    transformer = get_transformer("epsg:4674", "epsg:31982", always_xy=True)
    easting, northing = transformer.transform(float(lon), float(lat))
    return easting, northing

def calcular_zona_utm_segura(lon) -> int:
    """
    Calcula dinamicamente a zona UTM a partir da longitude com tratamentos robustos
    para valores nulos, vazios ou inválidos, fazendo fallback para a zona 22 (padrão).
    """
    if lon is None:
        return 22
    try:
        lon_f = float(lon)
        if -180.0 <= lon_f <= 180.0:
            return int((lon_f + 180) / 6) + 1
        return 22
    except (ValueError, TypeError):
        return 22


def geodesic_to_ecef(lat: float, lon: float, alt: float) -> tuple[float, float, float]:
    """
    Converte coordenadas geodésicas (Latitude/Longitude em graus decimais, Altitude em metros)
    para cartesianas ECEF (X, Y, Z em metros) usando o elipsoide GRS80 (SIRGAS 2000).
    """
    import math
    a = 6378137.0
    f = 1 / 298.257222101
    e2 = 2 * f - f ** 2

    lat_r = math.radians(lat)
    lon_r = math.radians(lon)

    sin_lat = math.sin(lat_r)
    cos_lat = math.cos(lat_r)

    N = a / math.sqrt(1.0 - e2 * sin_lat ** 2)

    x = (N + alt) * cos_lat * math.cos(lon_r)
    y = (N + alt) * cos_lat * math.sin(lon_r)
    z = (N * (1.0 - e2) + alt) * sin_lat

    return x, y, z

def ecef_to_geodesic(x: float, y: float, z: float) -> tuple[float, float, float]:
    """
    Converte coordenadas cartesianas ECEF (X, Y, Z em metros) para geodésicas
    (Latitude/Longitude em graus decimais, Altitude em metros) usando o elipsoide GRS80 (Algoritmo de Bowring).
    """
    import math
    a = 6378137.0
    f = 1 / 298.257222101
    e2 = 2 * f - f ** 2

    b = a * (1.0 - f)
    e_prime2 = (a ** 2 - b ** 2) / (b ** 2)

    p = math.sqrt(x ** 2 + y ** 2)

    if p < 1e-10:  # Tratamento para os polos
        lat = 90.0 if z > 0 else -90.0
        lon = 0.0
        alt = abs(z) - b
        return lat, lon, alt

    theta = math.atan2(z * a, p * b)

    lat_r = math.atan2(
        z + e_prime2 * b * (math.sin(theta) ** 3),
        p - e2 * a * (math.cos(theta) ** 3)
    )

    lon_r = math.atan2(y, x)

    sin_lat = math.sin(lat_r)
    N = a / math.sqrt(1.0 - e2 * sin_lat ** 2)

    alt = p / math.cos(lat_r) - N

    lat = math.degrees(lat_r)
    lon = math.degrees(lon_r)

    return lat, lon, alt
