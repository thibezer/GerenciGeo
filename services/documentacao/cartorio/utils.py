import os
import math
from datetime import datetime
from config import EXPORT_BASE_FOLDER
from pyproj import Geod

def formatar_cpf(valor) -> str:
    if not valor:
        return ""
    nums = "".join(filter(str.isdigit, str(valor)))
    if len(nums) == 11:
        return f"{nums[:3]}.{nums[3:6]}.{nums[6:9]}-{nums[9:]}"
    elif len(nums) == 14:
        return f"{nums[:2]}.{nums[2:5]}.{nums[5:8]}/{nums[8:12]}-{nums[12:]}"
    return str(valor)


def formatar_rg(valor) -> str:
    if not valor:
        return ""
    return str(valor).strip()


def obter_data_extenso() -> str:
    meses = {
        1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
        5: "maio", 6: "junho", 7: "julho", 8: "agosto",
        9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro"
    }
    agora = datetime.now()
    return f"{agora.day} de {meses[agora.month]} de {agora.year}"


def carregar_template(nome_arquivo: str) -> str:
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "templates", nome_arquivo)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def calcular_azimute_e_distancia(ini_lat, ini_lon, fim_lat, fim_lon) -> tuple[str, str]:
    if any(coord is None for coord in [ini_lat, ini_lon, fim_lat, fim_lon]):
        return "-", "-"
    
    try:
        # Usar pyproj.Geod com elipsoide GRS80 (SIRGAS 2000) para cálculo geodésico rigoroso 2D (elipsoidal)
        # Isso remove as distorções do fator de escala UTM (k) e bate perfeitamente com os cálculos do SIGEF.
        geod = Geod(ellps="GRS80")
        az_ida, az_volta, distancia = geod.inv(ini_lon, ini_lat, fim_lon, fim_lat)
        
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


