import os
from utils.transformer_cache import get_transformer
import subprocess

from database.connection import execute_query, DatabaseManager
def corrigir_rovers_em_bloco(levantamento_id: int, base_id: int) -> int:
    """
    Propaga a correção da Base (base_id) para todos os rovers vinculados (ponto_base_id = base_id)
    utilizando translação rigorosa tridimensional no espaço geocêntrico cartesiano ECEF
    para eliminar distorções de projeção e depois converte as coordenadas de volta
    para geodésicas (Lat/Lon) no elipsoide GRS80 (SIRGAS 2000) para gravação.
    """
    import math
    import logging
    from database.connection import execute_query, DatabaseManager
    from services.processamento.historico_campo import HistoricoCampoLogger
    from utils.transformer_cache import get_transformer

    logger = logging.getLogger(__name__)

    # 1. Recupera as informações da Base
    row_base = execute_query(
        "SELECT id, nome_vertice, lat, lon, alt, e_original, n_original, alt_original, sigma_lat, sigma_lon, sigma_alt, status_ponto FROM pontos WHERE id = ? AND levantamento_id = ?",
        params=(base_id, levantamento_id),
        fetch_one=True
    )
    if not row_base:
        logger.warning(f"[GEOPROCESSAMENTO] Base com ID {base_id} não encontrada no levantamento {levantamento_id}.")
        return 0

    base = dict(row_base)
    if not base["lat"] or base["lat"] == 0.0 or base["status_ponto"] != 'CORRIGIDO':
        logger.info(f"[GEOPROCESSAMENTO] A base {base['nome_vertice']} ainda está no estado BRUTO. Translação adiada.")
        return 0

    if not base["e_original"] or not base["n_original"]:
        logger.warning(f"[GEOPROCESSAMENTO] A base {base['nome_vertice']} não possui coordenadas originais UTM de campo para referenciar a translação.")
        return 0

    try:
        # A. Determina o fuso com base na longitude da base corrigida
        longitude_base = base["lon"]
        zona_utm = calcular_zona_utm_segura(longitude_base)
        epsg_utm = f"319{60 + zona_utm}"

        # B. Converte a coordenada original UTM de campo da Base para Geodésica original
        transformer_to_latlon = get_transformer(f"epsg:{epsg_utm}", "epsg:4674", always_xy=True)
        lon_base_orig, lat_base_orig = transformer_to_latlon.transform(base["e_original"], base["n_original"])
        alt_base_orig = base["alt_original"] if base["alt_original"] is not None else 0.0

        # C. Converte coordenada geodésica original da Base para ECEF original
        x_base_orig, y_base_orig, z_base_orig = geodesic_to_ecef(lat_base_orig, lon_base_orig, alt_base_orig)

        # D. Converte coordenada geodésica corrigida da Base (IBGE-PPP) para ECEF corrigida
        x_base_corr, y_base_corr, z_base_corr = geodesic_to_ecef(base["lat"], base["lon"], base["alt"])

        # E. Vetor Delta 3D ECEF
        delta_x = x_base_corr - x_base_orig
        delta_y = y_base_corr - y_base_orig
        delta_z = z_base_corr - z_base_orig

        logger.info(f"[GEOPROCESSAMENTO] Vetor Delta ECEF 3D para Base {base['nome_vertice']}: dX={delta_x:.4f}m, dY={delta_y:.4f}m, dZ={delta_z:.4f}m")
    except Exception as e_trans:
        logger.error(f"[GEOPROCESSAMENTO] Falha ao calcular vetor Delta ECEF para Base {base['nome_vertice']}: {e_trans}")
        return 0

    # 3. Recupera todos os rovers ativos vinculados a essa Base
    query_rovers = """
        SELECT id, nome_vertice, e_original, n_original, alt_original, sigma_n, sigma_e, sigma_z
        FROM pontos
        WHERE levantamento_id = ? AND ponto_base_id = ? AND (ponto_vizinho IS NULL OR ponto_vizinho = 0)
    """
    rows_rovers = execute_query(query_rovers, params=(levantamento_id, base_id), fetch_all=True)
    if not rows_rovers:
        logger.info(f"[GEOPROCESSAMENTO] Nenhum rover vinculado para a Base {base['nome_vertice']}.")
        return 0

    rovers = [dict(r) for r in rows_rovers]

    # 4. Transla e atualiza em transação atômica
    total_corrigidos = 0
    detalhamento_logs = []

    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()

            sig_base_lat = base["sigma_lat"] or 0.0
            sig_base_lon = base["sigma_lon"] or 0.0
            sig_base_alt = base["sigma_alt"] or 0.0

            for r in rovers:
                if not r["e_original"] or not r["n_original"]:
                    continue

                try:
                    e_orig = float(r["e_original"])
                    n_orig = float(r["n_original"])
                    alt_orig = float(r["alt_original"]) if r.get("alt_original") is not None else 0.0

                    # A. Converte UTM original do Rover para Geodésica original
                    lon_orig, lat_orig = transformer_to_latlon.transform(e_orig, n_orig)

                    # B. Converte Geodésica original do Rover para ECEF original
                    x_orig, y_orig, z_orig = geodesic_to_ecef(lat_orig, lon_orig, alt_orig)

                    # C. Aplica translação 3D ECEF
                    x_corr = x_orig + delta_x
                    y_corr = y_orig + delta_y
                    z_corr = z_orig + delta_z

                    # D. Converte ECEF corrigido para Geodésico corrigido
                    lat_corr, lon_corr, alt_corr = ecef_to_geodesic(x_corr, y_corr, z_corr)

                    # E. Propagação de Incertezas
                    sig_n_val = float(r["sigma_n"]) if r.get("sigma_n") is not None else 0.0
                    sig_e_val = float(r["sigma_e"]) if r.get("sigma_e") is not None else 0.0
                    sig_z_val = float(r["sigma_z"]) if r.get("sigma_z") is not None else 0.0

                    sig_lat_prop = math.sqrt(sig_n_val**2 + sig_base_lat**2)
                    sig_lon_prop = math.sqrt(sig_e_val**2 + sig_base_lon**2)
                    sig_alt_prop = math.sqrt(sig_z_val**2 + sig_base_alt**2)

                    # F. Atualiza no banco
                    cursor.execute(
                        """
                        UPDATE pontos
                        SET lat = ?, lon = ?, alt = ?,
                            lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                            sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                            status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO'
                        WHERE id = ? AND levantamento_id = ?
                        """,
                        (lat_corr, lon_corr, alt_corr,
                         lat_corr, lon_corr, alt_corr,
                         sig_lat_prop, sig_lon_prop, sig_alt_prop,
                         r["id"], levantamento_id)
                    )
                    total_corrigidos += 1
                    detalhamento_logs.append({
                        "id": r["id"],
                        "nome": r["nome_vertice"],
                        "original": {"E": e_orig, "N": n_orig, "H": alt_orig},
                        "corrigido": {"lat": lat_corr, "lon": lon_corr, "H": alt_corr}
                    })
                except (ValueError, TypeError) as e_pt:
                    logger.warning(f"[GEOPROCESSAMENTO] Ponto rover #{r.get('id')} ({r.get('nome_vertice')}) ignorado na translação em bloco devido a dados numéricos inválidos: {e_pt}")
                    continue

            conn.commit()

        if total_corrigidos > 0:
            desc_auditoria = f"Translação rigorosa ECEF 3D em lote aplicada com sucesso para {total_corrigidos} rovers vinculados à Base {base['nome_vertice']}."
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=levantamento_id,
                tipo_evento="CORRECAO_TRANSLACAO",
                descricao=desc_auditoria,
                dados_detalhados={
                    "base_id": base_id,
                    "base_nome": base["nome_vertice"],
                    "vetor_delta_utm": {"dX": delta_x, "dY": delta_y, "dZ": delta_z},
                    "rovers_corrigidos": detalhamento_logs
                }
            )

        logger.info(f"[GEOPROCESSAMENTO] Translação em bloco concluída. {total_corrigidos} rovers corrigidos com base no de {base['nome_vertice']}.")
    except Exception as e_db:
        logger.error(f"[GEOPROCESSAMENTO] Falha crítica ao persistir rovers corrigidos no banco: {e_db}")
        return 0

    return total_corrigidos

def aplicar_correcao_manual_lote(levantamento_id: int, matricula_id: int, arquivo_origem: str, dados_brutos: dict, dados_corrigidos: dict, base_id: int = None, tipo_ponto_base: str = 'M') -> int:
    """
    Aplica a correção manual por translação plana rigorosa em todo o lote de pontos
    pertencente ao arquivo_origem, usando dados brutos de campo e coordenadas oficiais homologadas.
    Insere/atualiza o ponto base de campo com coordenadas oficiais, respeitando o tipo
    solicitado (tipo_ponto_base: 'M' para Base PPP ou 'B' para Base Física).
    """
    import math
    import logging
    from database.connection import execute_query, DatabaseManager
    from services.processamento.historico_campo import HistoricoCampoLogger
    from utils.transformer_cache import get_transformer
    from services.gestores.workspace_manager import WorkspaceManager
    from services.parsers.txt_parser import TxtGeodesicParser

    logger = logging.getLogger(__name__)

    # BUGFIX: o tipo do ponto base ficava hardcoded como 'M' (Base PPP) tanto no
    # UPDATE quanto no INSERT abaixo, mesmo quando o usuário pedia explicitamente
    # tipo 'B' (Base Física). O ponto virava/permanecia 'M' silenciosamente, dando
    # a impressão de que "marcar como base" não tinha feito efeito.
    if tipo_ponto_base not in ('M', 'B'):
        tipo_ponto_base = 'M'

    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(levantamento_id)
        caminho_arquivo = folder / "Processados" / arquivo_origem
        if caminho_arquivo.exists():
            with open(caminho_arquivo, "r", encoding="utf-8", errors="ignore") as f:
                linhas = f.readlines()
            parser_layout = TxtGeodesicParser(levantamento_id)
            layout = parser_layout.identificar_layout(linhas)
            if layout != "rtk":
                raise ValueError("Este arquivo de pontos não é do tipo RTK (foi gerado por software próprio e seus pontos já estão corrigidos).")
    except Exception as e_layout:
        logger.warning(f"[OVERRIDE_MANUAL] Verificação de layout do arquivo {arquivo_origem}: {e_layout}")
        if "não é do tipo RTK" in str(e_layout):
            raise e_layout

    # 1. Determina a Coordenada Corrigida Oficinal da Base (em Lat/Lon/Alt Geodésica)
    try:
        alt_corr_oficial = float(dados_corrigidos.get("alt_corrigida") or dados_corrigidos.get("alt") or 0.0)

        fuso_selecionado = dados_corrigidos.get("fuso")
        fuso_limpo = ''.join(filter(str.isdigit, fuso_selecionado or "22S"))
        zona = int(fuso_limpo) if fuso_limpo else 22
        epsg_utm = f"319{60 + zona}"

        transformer_to_latlon = get_transformer(f"epsg:{epsg_utm}", "epsg:4674", always_xy=True)

        lat_corr_oficial = 0.0
        lon_corr_oficial = 0.0

        if dados_corrigidos.get("tipo_entrada") == "utm":
            e_corr = float(dados_corrigidos["e_corrigido"])
            n_corr = float(dados_corrigidos["n_corrigido"])
            lon_corr_oficial, lat_corr_oficial = transformer_to_latlon.transform(e_corr, n_corr)
            logger.info(f"[OVERRIDE_MANUAL] Projeção reversa da Base Corrigida concluída: Lat={lat_corr_oficial:.8f}, Lon={lon_corr_oficial:.8f}")
        else:
            lat_corr_oficial = float(dados_corrigidos["lat_corrigida"])
            lon_corr_oficial = float(dados_corrigidos["lon_corrigida"])

            transformer_to_utm = get_transformer("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)
            e_corr, n_corr = transformer_to_utm.transform(lon_corr_oficial, lat_corr_oficial)

        # 2. Dados brutos
        e_bruto = float(dados_brutos["e_bruto"])
        n_bruto = float(dados_brutos["n_bruto"])
        alt_bruta = float(dados_brutos["alt_bruta"])
        nome_base = dados_brutos.get("nome_base", "BASE-MANUAL")

    except (KeyError, ValueError, TypeError) as e_conv:
        logger.error(f"[OVERRIDE_MANUAL] Dados de entrada da correção manual mal-formatados ou incompletos: {e_conv}")
        raise ValueError(f"Dados numéricos da base inválidos ou ausentes para a correção manual: {e_conv}")

    # 3. Determina o Vetor Delta ECEF 3D a partir das coordenadas
    # Converte coordenadas UTM da base bruta para Geodésica original
    lon_base_orig, lat_base_orig = transformer_to_latlon.transform(e_bruto, n_bruto)
    alt_base_orig = alt_bruta if alt_bruta is not None else 0.0

    # Converte Geodésica original da Base para ECEF original
    x_base_orig, y_base_orig, z_base_orig = geodesic_to_ecef(lat_base_orig, lon_base_orig, alt_base_orig)

    # Converte Geodésica corrigida da Base (IBGE-PPP / Oficial) para ECEF corrigida
    x_base_corr, y_base_corr, z_base_corr = geodesic_to_ecef(lat_corr_oficial, lon_corr_oficial, alt_corr_oficial)

    # Vetor Delta 3D ECEF
    delta_x = x_base_corr - x_base_orig
    delta_y = y_base_corr - y_base_orig
    delta_z = z_base_corr - z_base_orig

    logger.info(f"[OVERRIDE_MANUAL] Vetor Delta ECEF 3D gerado: dX={delta_x:.4f}m, dY={delta_y:.4f}m, dZ={delta_z:.4f}m")

    # A. Recupera a matrícula id e pontos do lote
    query_mat = """
        SELECT matricula_id FROM pontos
        WHERE levantamento_id = ? AND arquivo_origem = ? AND matricula_id IS NOT NULL
        LIMIT 1
    """
    row_mat = execute_query(query_mat, params=(levantamento_id, arquivo_origem), fetch_one=True)
    matricula_id_efetiva = row_mat["matricula_id"] if row_mat else None

    sig_base_lat = float(dados_corrigidos.get("sigma_lat") or 0.0050)
    sig_base_lon = float(dados_corrigidos.get("sigma_lon") or 0.0050)
    sig_base_alt = float(dados_corrigidos.get("sigma_alt") or 0.0100)

    if base_id is None:
        query_check_base = """
            SELECT id FROM pontos
            WHERE levantamento_id = ? AND nome_vertice = ? AND tipo_ponto = ?
        """
        row_base = execute_query(query_check_base, params=(levantamento_id, nome_base, tipo_ponto_base), fetch_one=True)
        base_id = row_base["id"] if row_base else None

    if base_id:
        query_upsert_base = """
            UPDATE pontos
            SET matricula_id = ?, lat = ?, lon = ?, alt = ?,
                lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                n_original = ?, e_original = ?, alt_original = ?,
                sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                sigma_n = ?, sigma_e = ?, sigma_z = ?,
                status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO',
                arquivo_origem = ?, ignorar_poligono = 1, nome_vertice = ?,
                tipo_ponto = ?, ponto_base_id = NULL
            WHERE id = ?
        """
        execute_query(query_upsert_base, params=(
            matricula_id_efetiva, lat_corr_oficial, lon_corr_oficial, alt_corr_oficial,
            lat_corr_oficial, lon_corr_oficial, alt_corr_oficial,
            n_bruto, e_bruto, alt_bruta,
            sig_base_lat, sig_base_lon, sig_base_alt,
            sig_base_lat, sig_base_lon, sig_base_alt,
            arquivo_origem, nome_base, tipo_ponto_base, base_id
        ), commit=True)
    else:
        query_upsert_base = """
            INSERT INTO pontos (
                levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt,
                lat_corrigido, lon_corrigido, alt_corrigido,
                n_original, e_original, alt_original,
                sigma_lat, sigma_lon, sigma_alt,
                sigma_n, sigma_e, sigma_z,
                status_ponto, status_correcao, arquivo_origem, ignorar_poligono
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CORRIGIDO', 'CORRIGIDO', ?, 1)
        """
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(query_upsert_base, (
                levantamento_id, matricula_id_efetiva, nome_base, tipo_ponto_base, lat_corr_oficial, lon_corr_oficial, alt_corr_oficial,
                lat_corr_oficial, lon_corr_oficial, alt_corr_oficial,
                n_bruto, e_bruto, alt_bruta,
                sig_base_lat, sig_base_lon, sig_base_alt,
                sig_base_lat, sig_base_lon, sig_base_alt,
                arquivo_origem
            ))
            conn.commit()
            base_id = cursor.lastrowid

    # 4. Abre uma transação no banco e faz o loop para os rovers
    query_rovers = """
        SELECT id, nome_vertice, e_original, n_original, alt_original, sigma_n, sigma_e, sigma_z
        FROM pontos
        WHERE levantamento_id = ? AND arquivo_origem = ? AND (ponto_vizinho IS NULL OR ponto_vizinho = 0)
    """
    rows_rovers = execute_query(query_rovers, params=(levantamento_id, arquivo_origem), fetch_all=True)
    rovers = [dict(r) for r in rows_rovers]

    total_corrigidos = 0
    detalhamento_logs = []

    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()

            for r in rovers:
                if r["id"] == base_id:
                    continue
                if not r["e_original"] or not r["n_original"]:
                    continue

                try:
                    e_orig = float(r["e_original"])
                    n_orig = float(r["n_original"])
                    alt_orig = float(r["alt_original"]) if r.get("alt_original") is not None else 0.0

                    # A. Converte UTM original do Rover para Geodésica original
                    lon_orig, lat_orig = transformer_to_latlon.transform(e_orig, n_orig)

                    # B. Converte Geodésica original do Rover para ECEF original
                    x_orig, y_orig, z_orig = geodesic_to_ecef(lat_orig, lon_orig, alt_orig)

                    # C. Aplica translação 3D ECEF
                    x_corr = x_orig + delta_x
                    y_corr = y_orig + delta_y
                    z_corr = z_orig + delta_z

                    # D. Converte ECEF corrigido para Geodésico corrigido
                    lat_corr, lon_corr, alt_corr = ecef_to_geodesic(x_corr, y_corr, z_corr)

                    sig_n_val = float(r["sigma_n"]) if r.get("sigma_n") is not None else 0.0
                    sig_e_val = float(r["sigma_e"]) if r.get("sigma_e") is not None else 0.0
                    sig_z_val = float(r["sigma_z"]) if r.get("sigma_z") is not None else 0.0

                    sig_lat_prop = math.sqrt(sig_n_val**2 + sig_base_lat**2)
                    sig_lon_prop = math.sqrt(sig_e_val**2 + sig_base_lon**2)
                    sig_alt_prop = math.sqrt(sig_z_val**2 + sig_base_alt**2)

                    cursor.execute(
                        """
                        UPDATE pontos
                        SET lat = ?, lon = ?, alt = ?,
                            lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                            sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                            status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO',
                            ponto_base_id = ?
                        WHERE id = ? AND levantamento_id = ?
                        """,
                        (lat_corr, lon_corr, alt_corr,
                         lat_corr, lon_corr, alt_corr,
                         sig_lat_prop, sig_lon_prop, sig_alt_prop,
                         base_id, r["id"], levantamento_id)
                    )
                    total_corrigidos += 1
                    detalhamento_logs.append({
                        "id": r["id"],
                        "nome": r["nome_vertice"],
                        "original": {"E": e_orig, "N": n_orig, "H": alt_orig},
                        "corrigido": {"lat": lat_corr, "lon": lon_corr, "H": alt_corr}
                    })
                except (ValueError, TypeError) as e_pt:
                    logger.warning(f"[OVERRIDE_MANUAL] Ponto rover #{r.get('id')} ({r.get('nome_vertice')}) ignorado na translação manual devido a dados numéricos inválidos: {e_pt}")
                    continue

            conn.commit()

        desc_auditoria = f"Override Manual / Forçar Correção UTM plana aplicada em lote para {total_corrigidos} pontos do arquivo '{arquivo_origem}'."
        HistoricoCampoLogger.registrar_evento(
            levantamento_id=levantamento_id,
            tipo_evento="CORRECAO_MANUAL_OVERRIDE",
            descricao=desc_auditoria,
            dados_detalhados={
                "arquivo_origem": arquivo_origem,
                "dados_brutos_base": dados_brutos,
                "dados_corrigidos_base": dados_corrigidos,
                "vetor_delta_utm": {"dX": delta_x, "dY": delta_y, "dZ": delta_z},
                "total_pontos_corrigidos": total_corrigidos,
                "detalhes": detalhamento_logs
            }
        )

        logger.info(f"[OVERRIDE_MANUAL] Correção plana aplicada com sucesso. {total_corrigidos} corrigidos.")
        return total_corrigidos

    except Exception as e_db:
        logger.error(f"[OVERRIDE_MANUAL] Falha crítica de transação ao aplicar correção manual: {e_db}")
        raise e_db


def reverter_rovers_para_bruto(levantamento_id: int, base_id: int) -> int:
    """
    Localiza todos os rovers órfãos vinculados à base (base_id) que foi excluída ou desassociada,
    e os reverte com segurança para o estado 'BRUTO', recalculando suas coordenadas lat/lon geodésicas
    cruas diretamente de suas coordenadas originais de campo (sem delta de translação).
    """
    import logging
    from database.connection import execute_query, DatabaseManager
    from utils.transformer_cache import get_transformer
    from services.processamento.historico_campo import HistoricoCampoLogger

    logger = logging.getLogger(__name__)
    logger.info(f"[REVERSAO_ORFÃOS] Iniciando reversão para bruto de rovers órfãos da base ID={base_id}")

    # 1. Recupera todos os rovers vinculados a essa base
    query_rovers = """
        SELECT id, nome_vertice, e_original, n_original, alt_original, sigma_n, sigma_e, sigma_z, tipo_ponto
        FROM pontos
        WHERE levantamento_id = ? AND ponto_base_id = ?
    """
    rows_rovers = execute_query(query_rovers, params=(levantamento_id, base_id), fetch_all=True)
    rovers = [dict(r) for r in rows_rovers]

    if not rovers:
        logger.info(f"[REVERSAO_ORFÃOS] Nenhum rover órfão localizado para a base ID={base_id}")
        return 0

    total_revertidos = 0
    detalhamento_logs = []

    try:
        # Tenta calcular a zona UTM correta com base na longitude da base original que está sendo desvinculada (Item 1)
        epsg_dinamico = "31982"
        try:
            query_base_coords = "SELECT lon FROM pontos WHERE id = ? AND lon IS NOT NULL AND lon != 0.0"
            row_base = execute_query(query_base_coords, params=(base_id,), fetch_one=True)
            if row_base:
                longitude_base = row_base["lon"]
                zona_utm = int((longitude_base + 180) / 6) + 1
                epsg_dinamico = f"319{60 + zona_utm}"
                logger.info(f"[REVERSAO_ORFÃOS] Fuso UTM recuperado da base original: Zona {zona_utm}S (EPSG:{epsg_dinamico})")
            else:
                # Tenta pegar de qualquer outro ponto do levantamento
                query_any_p = "SELECT lon FROM pontos WHERE levantamento_id = ? AND lon IS NOT NULL AND lon != 0.0 LIMIT 1"
                row_any = execute_query(query_any_p, params=(levantamento_id,), fetch_one=True)
                if row_any:
                    longitude_p = row_any["lon"]
                    zona_utm = int((longitude_p + 180) / 6) + 1
                    epsg_dinamico = f"319{60 + zona_utm}"
                    logger.info(f"[REVERSAO_ORFÃOS] Fuso UTM inferido de outro ponto: Zona {zona_utm}S (EPSG:{epsg_dinamico})")
        except Exception as e_fuso_orf:
            logger.warning(f"[REVERSAO_ORFÃOS] Falha ao recuperar fuso dinâmico para órfãos: {e_fuso_orf}")

        transformer_to_latlon = get_transformer(f"epsg:{epsg_dinamico}", "epsg:4674", always_xy=True)

        with DatabaseManager() as conn:
            cursor = conn.cursor()

            for r in rovers:
                if not r["e_original"] or not r["n_original"]:
                    continue

                # Retroprojeta de volta sem aplicar nenhum delta
                lon_bruta, lat_bruta = transformer_to_latlon.transform(r["e_original"], r["n_original"])
                alt_bruta = r["alt_original"]

                # Coordenadas originais, desvios originais
                sig_lat = r["sigma_n"] or 0.0
                sig_lon = r["sigma_e"] or 0.0
                sig_alt = r["sigma_z"] or 0.0

                # Reverte rover. Se o tipo_ponto atual for 'B' (base orfã), reverte para 'P'
                novo_tipo = r["tipo_ponto"]
                if novo_tipo == 'B':
                    import re
                    nome_upper = r["nome_vertice"].strip().upper()
                    match_completo = re.search(r"\b([A-Z]{3,4})-(M|P|V)-(\d+)\b", nome_upper)
                    match_simples = re.search(r"\b(M|P|V)-(\d+)\b", nome_upper)

                    if match_completo:
                        novo_tipo = match_completo.group(2)
                    elif match_simples:
                        novo_tipo = match_simples.group(1)
                    elif nome_upper.startswith("M"):
                        novo_tipo = "M"
                    elif nome_upper.startswith("V"):
                        novo_tipo = "V"
                    else:
                        novo_tipo = "P"

                cursor.execute(
                    """
                    UPDATE pontos
                    SET lat = ?, lon = ?, alt = ?,
                        lat_corrigido = NULL, lon_corrigido = NULL, alt_corrigido = NULL,
                        sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                        status_ponto = 'BRUTO', status_correcao = 'BRUTO',
                        ponto_base_id = NULL, tipo_ponto = ?
                    WHERE id = ?
                    """,
                    (lat_bruta, lon_bruta, alt_bruta,
                     sig_lat, sig_lon, sig_alt,
                     novo_tipo, r["id"])
                )
                total_revertidos += 1
                detalhamento_logs.append({
                    "id": r["id"],
                    "nome": r["nome_vertice"],
                    "tipo_anterior": r["tipo_ponto"],
                    "tipo_atual": novo_tipo,
                    "lat_bruta": lat_bruta,
                    "lon_bruta": lon_bruta
                })

            conn.commit()

        # Registrar no histórico de campo
        desc_auditoria = f"Reversão para BRUTO executada com sucesso. {total_revertidos} rovers órfãos da base ID={base_id} perderam o vínculo de correção."
        HistoricoCampoLogger.registrar_evento(
            levantamento_id=levantamento_id,
            tipo_evento="REVERSAO_ROVERS_ORFÃOS",
            descricao=desc_auditoria,
            dados_detalhados={
                "base_id": base_id,
                "total_revertidos": total_revertidos,
                "detalhes": detalhamento_logs
            }
        )

        logger.info(f"[REVERSAO_ORFÃOS] Reversão de {total_revertidos} pontos órfãos para BRUTO concluída.")
        return total_revertidos

    except Exception as e:
        logger.error(f"[REVERSAO_ORFÃOS] Erro ao reverter rovers para bruto: {e}")
        raise e