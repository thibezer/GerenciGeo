import os
import math
import logging
from datetime import datetime
from config import EXPORT_BASE_FOLDER, EMPRESA_NOME_FANTASIA, EMPRESA_RAZAO_SOCIAL
from pyproj import Geod

logger = logging.getLogger(__name__)


def calcular_azimute_e_distancia(ini_lat, ini_lon, fim_lat, fim_lon) -> tuple[str, str]:
    """Calcula o azimute e a distância entre dois pontos geodésicos.

    Parameters
    ----------
    ini_lat, ini_lon: float
        Latitude e longitude do ponto inicial.
    fim_lat, fim_lon: float
        Latitude e longitude do ponto final.
    Returns
    -------
    tuple[str, str]
        Azimute formatado e distância em metros como string.
    """
    try:
        # Usar pyproj.Geod com elipsoide GRS80 (SIRGAS 2000) para cálculo geodésico rigoroso 2D (elipsoidal)
        # Isso remove as distorções do fator de escala UTM (k) e bate perfeitamente com os cálculos do SIGEF.
        geod = Geod(ellps="GRS80")
        az_ida, _, distancia = geod.inv(ini_lon, ini_lat, fim_lon, fim_lat)

        distancia_str = f"{distancia:.2f} m"

        # Ajusta azimute para a faixa 0-360
        az_deg = az_ida % 360.0

        # Formatar azimute no padrão GMS (Graus, Minutos e Segundos)
        graus = int(az_deg)
        minutos_dec = (az_deg - graus) * 60.0
        minutos = int(minutos_dec)
        segundos = (minutos_dec - minutos) * 60.0

        # Proteção clássica para arredondamento de segundos
        if segundos >= 59.5:
            segundos = 0.0
            minutos += 1
            if minutos >= 60:
                minutos = 0
                graus = (graus + 1) % 360

        azimute_str = f"{graus}°{minutos:02d}'{segundos:02.0f}\""

        return azimute_str, distancia_str
    except Exception as e:
        logger.warning(f"Erro ao calcular azimute/distância geodésica do segmento: {e}")
        return "-", "-"
