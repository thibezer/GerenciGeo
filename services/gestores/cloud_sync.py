"""
business/cloud_sync.py — Motor de sincronização Edge-First do GerenciGeo.
Coleta dados locais, projeta UTM para WGS84 se necessário, serializa em GeoJSON e transmite.
"""
import logging
import httpx
from pyproj import Transformer
from database.connection import execute_query
from config import CLOUD_SYNC_URL, CLOUD_API_KEY, RUNNING_LOCAL

logger = logging.getLogger(__name__)

async def sincronizar_imovel(matricula_id: int, levantamento_id: int) -> dict:
    """
    Varre os segmentos locais do polígono perimetral da matrícula ativa,
    serializa em GeoJSON limpo e transmite via HTTP POST para o servidor Hostinger.
    """
    if not RUNNING_LOCAL:
        return {
            "sucesso": False,
            "mensagem": "Operação não permitida: A sincronização só pode ser disparada a partir do ambiente local."
        }

    try:
        # 1. Busca os dados cadastrais da matrícula e da propriedade
        query_cadastro = """
            SELECT m.numero_matricula, m.area_ha, m.ccir,
                   p.nome_propriedade, p.municipio, p.uf,
                   l.status as status_levantamento
            FROM matriculas m
            JOIN propriedades p ON m.propriedade_id = p.id
            JOIN levantamentos l ON l.propriedade_id = p.id
            WHERE m.id = ? AND l.id = ?
        """
        cad_row = execute_query(query_cadastro, params=(matricula_id, levantamento_id), fetch_one=True)
        if not cad_row:
            return {
                "sucesso": False,
                "mensagem": f"Matrícula {matricula_id} ou levantamento {levantamento_id} não localizado no banco de dados local."
            }
        
        cadastro = dict(cad_row)

        # 2. Busca os pontos ordenados para reconstruir o polígono perimetral
        query_pontos = """
            SELECT lat, lon, lat_corrigido, lon_corrigido, status_ponto, e_original, n_original, ordem_caminhamento
            FROM pontos
            WHERE matricula_id = ? AND levantamento_id = ? AND ignorar_poligono = 0
            ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
        """
        ponto_rows = execute_query(query_pontos, params=(matricula_id, levantamento_id), fetch_all=True)
        if not ponto_rows:
            return {
                "sucesso": False,
                "mensagem": "Nenhum ponto ativo (fora do ignore) localizado para construir o polígono perimetral desta matrícula."
            }

        pontos = [dict(r) for r in ponto_rows]

        # 3. Resolve coordenadas geodésicas (com fallback de UTM para LatLon se necessário)
        # O motor assume WGS84 para o GeoJSON. SIRGAS 2000 (EPSG:4674) é o default geodésico local
        # Usamos Zona 22S (EPSG:31982) como UTM default do motor geodésico
        transformer_to_latlon = Transformer.from_crs("epsg:31982", "epsg:4326", always_xy=True)

        coords = []
        for p in pontos:
            lat = p["lat_corrigido"] if (p["status_ponto"] == "CORRIGIDO" and p["lat_corrigido"] is not None) else p["lat"]
            lon = p["lon_corrigido"] if (p["status_ponto"] == "CORRIGIDO" and p["lon_corrigido"] is not None) else p["lon"]

            # Fallback se coordenadas geodésicas estiverem zeradas/nulas mas tivermos UTM
            if (lat is None or lon is None or lat == 0.0 or lon == 0.0) and (p["e_original"] and p["n_original"]):
                try:
                    lon_calc, lat_calc = transformer_to_latlon.transform(p["e_original"], p["n_original"])
                    lon, lat = lon_calc, lat_calc
                except Exception as e_trans:
                    logger.error(f"Erro ao projetar UTM para LatLon do ponto: {e_trans}")

            if lat is not None and lon is not None:
                # GeoJSON usa [longitude, latitude]
                coords.append([lon, lat])

        if len(coords) < 3:
            return {
                "sucesso": False,
                "mensagem": f"Quantidade insuficiente de vértices válidos ({len(coords)} encontrados). São necessários pelo menos 3 para formar um polígono."
            }

        # Garante o fechamento obrigatório do polígono GeoJSON (P_last -> P_1)
        if coords[0] != coords[-1]:
            coords.append(coords[0])

        # 4. Constrói a estrutura do GeoJSON
        geojson_polygon = {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords]
            },
            "properties": {
                "id_matricula": matricula_id,
                "numero_matricula": cadastro.get("numero_matricula"),
                "nome_propriedade": cadastro.get("nome_propriedade"),
                "municipio": cadastro.get("municipio"),
                "uf": cadastro.get("uf"),
                "area_ha": cadastro.get("area_ha"),
                "status_levantamento": cadastro.get("status_levantamento"),
                "ccir": cadastro.get("ccir")
            }
        }

        # 5. Efetua o envio via HTTP POST
        headers = {
            "X-API-KEY": CLOUD_API_KEY,
            "Content-Type": "application/json"
        }

        logger.info(f"Disparando sincronização da matrícula {matricula_id} para a nuvem: {CLOUD_SYNC_URL}")
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                CLOUD_SYNC_URL,
                json=geojson_polygon,
                headers=headers
            )

        if response.status_code in (200, 201):
            return {
                "sucesso": True,
                "mensagem": "Sincronização realizada com sucesso para o Hub em Nuvem!"
            }
        else:
            return {
                "sucesso": False,
                "mensagem": f"O servidor em nuvem retornou status {response.status_code}: {response.text}"
            }

    except Exception as e:
        logger.exception("Falha inesperada no pipeline de sincronização com a nuvem:")
        return {
            "sucesso": False,
            "mensagem": f"Erro interno na sincronização: {str(e)}"
        }
