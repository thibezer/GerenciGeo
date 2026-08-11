import os
from utils.transformer_cache import get_transformer
import subprocess

from database.connection import execute_query
def reordenar_perimetro_matricula(levantamento_id: int, matricula_id: int) -> dict:
    """
    Algoritmo rigoroso para reordenação de poligonal topológica perimetral (Norma INCRA / SIGEF).
    1. Identifica o ponto extremo norte (maior latitude, desempate maior longitude).
    2. Projetará em UTM para calcular a orientação via Shoelace (Área com sinal).
    3. Reverte para sentido horário se necessário.
    4. Rotaciona ciclicamente a lista para iniciar no ponto extremo norte.
    5. Recria os segmentos com fechamento estrito em transação isolada de banco de dados.
    """
    import math
    import logging
    from utils.transformer_cache import get_transformer
    from database.connection import DatabaseManager, execute_query

    logger = logging.getLogger(__name__)
    try:
        # 1. Recupera todos os pontos cadastrados para a matrícula (ou avulsos)
        if matricula_id is None or matricula_id == 0:
            query_pontos = """
                SELECT id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, sigma_lat
                FROM pontos
                WHERE levantamento_id = ? AND matricula_id IS NULL AND tipo_ponto != 'B' AND (ignorar_poligono IS NULL OR ignorar_poligono = 0)
                ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
            """
            params_query = (levantamento_id,)
            msg_erro = "O levantamento precisa de pelo menos 3 pontos avulsos com coordenadas para ordenar."
        else:
            query_pontos = """
                SELECT id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, sigma_lat
                FROM pontos
                WHERE levantamento_id = ? AND matricula_id = ? AND tipo_ponto != 'B' AND (ignorar_poligono IS NULL OR ignorar_poligono = 0)
                ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
            """
            params_query = (levantamento_id, matricula_id)
            msg_erro = "A matrícula precisa de pelo menos 3 pontos com coordenadas para ordenar a poligonal."

        rows = execute_query(query_pontos, params=params_query, fetch_all=True)
        pontos_filtrados = []
        for r in (rows or []):
            d = dict(r)
            if d.get("lat") is not None and d.get("lon") is not None:
                try:
                    float(d["lat"])
                    float(d["lon"])
                    pontos_filtrados.append(d)
                except (ValueError, TypeError):
                    continue

        pontos = pontos_filtrados
        n = len(pontos)
        if n < 3:
            return {
                "sucesso": False,
                "erro": msg_erro
            }

        # 2. Identifica o ponto mais ao norte (Maior Latitude)
        # Critério de desempate: maior longitude (mais a Leste)
        ponto_norte_idx = 0
        max_lat = -999.0
        max_lon = -999.0

        for idx, pt in enumerate(pontos):
            lat = float(pt["lat"])
            lon = float(pt["lon"])
            if lat > max_lat:
                max_lat = lat
                max_lon = lon
                ponto_norte_idx = idx
            elif abs(lat - max_lat) < 1e-9:  # Empate técnico de latitude
                if lon > max_lon:
                    max_lon = lon
                    ponto_norte_idx = idx

        ponto_norte = pontos[ponto_norte_idx]
        logger.info(f"[TOPOLOGIA] Ponto mais ao norte identificado: {ponto_norte['nome_vertice']} (Lat: {ponto_norte['lat']:.8f})")

        # 3. Conversão UTM Dinâmica para Cálculo do Shoelace
        lon_referencia = pontos[0]["lon"]
        zona_utm = calcular_zona_utm_segura(lon_referencia)
        epsg_utm = f"319{60 + zona_utm}"  # EPSG para Hemisfério Sul

        transformer = get_transformer("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)

        pontos_planos = []
        for pt in pontos:
            e, n_coord = transformer.transform(pt["lon"], pt["lat"])
            pontos_planos.append({
                "id": pt["id"],
                "nome": pt["nome_vertice"],
                "e": e,
                "n": n_coord
            })

        # 4. Cálculo da Área Direcionada por Shoelace/Gauss
        soma_shoelace = 0.0
        for i in range(n):
            curr = pontos_planos[i]
            nxt = pontos_planos[(i + 1) % n]
            soma_shoelace += (curr["e"] * nxt["n"]) - (nxt["e"] * curr["n"])

        area_sinalizada = soma_shoelace / 2.0
        orientacao_original = "ANTI-HORÁRIO" if area_sinalizada > 0.0 else "HORÁRIO"
        logger.info(f"[TOPOLOGIA] Área com sinal: {area_sinalizada:.3f} m². Orientação original: {orientacao_original}")

        # 5. Inversão se for Anti-horário
        if area_sinalizada > 0.0:
            # Reverte a lista de pontos
            pontos.reverse()
            # Atualiza o índice do ponto norte após a inversão
            for idx, pt in enumerate(pontos):
                if pt["id"] == ponto_norte["id"]:
                    ponto_norte_idx = idx
                    break
            logger.info("[TOPOLOGIA] Poligonal invertida com sucesso para sentido HORÁRIO.")
        else:
            logger.info("[TOPOLOGIA] Poligonal já se encontra no sentido HORÁRIO de caminhamento.")

        # 6. Rotação Cíclica (Shift circular) para que o ponto mais ao norte seja o índice 0
        pontos_ordenados = pontos[ponto_norte_idx:] + pontos[:ponto_norte_idx]

        # 7. Persistência em Transação de Banco de Dados Protegida
        try:
            with DatabaseManager() as conn:
                cursor = conn.cursor()

                try:

                    # A. Atualiza a nova ordem de caminhamento nos vértices
                    query_update_pt = "UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?"
                    for nova_ordem, pt in enumerate(pontos_ordenados, start=1):
                        cursor.execute(query_update_pt, (nova_ordem, pt["id"]))

                    if matricula_id is not None and matricula_id != 0:
                        # B. Obtém metadados dos limites dos segmentos anteriores para preservá-los
                        query_preservar_limites = """
                            SELECT ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef
                            FROM segmentos
                            WHERE levantamento_id = ? AND matricula_id = ?
                        """
                        cursor.execute(query_preservar_limites, (levantamento_id, matricula_id))
                        segmentos_antigos = cursor.fetchall()

                        # Mapeia as conexões antigas para manter limites e confrontantes configurados pelo topógrafo
                        mapa_segmento_info = {}
                        for seg in segmentos_antigos:
                            # Chave baseada na conexão bidirecional por segurança
                            chave = (seg[0], seg[1])
                            mapa_segmento_info[chave] = {
                                "confrontante_id": seg[2],
                                "tipo_limite_sigef": seg[3],
                                "metodo_posicionamento_sigef": seg[4]
                            }

                        # C. Remove todos os segmentos anteriores
                        cursor.execute("DELETE FROM segmentos WHERE levantamento_id = ? AND matricula_id = ?", (levantamento_id, matricula_id))

                        # D. Reconstroi a cadeia de segmentos
                        primeiro_pt = pontos_ordenados[0]
                        metodo_padrao = "PG1" if (primeiro_pt.get("sigma_lat") or 0.0) > 0.0 else "MC1"

                        query_insert_seg = """
                            INSERT INTO segmentos (
                                levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id,
                                confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef
                            ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """

                        segmentos_criados = 0
                        for i in range(n):
                            pt_ini = pontos_ordenados[i]
                            pt_fim = pontos_ordenados[(i + 1) % n]

                            # Tenta reaproveitar limites e confrontantes já inseridos
                            chave_original = (pt_ini["id"], pt_fim["id"])
                            chave_inversa = (pt_fim["id"], pt_ini["id"])

                            if chave_original in mapa_segmento_info:
                                info = mapa_segmento_info[chave_original]
                            elif chave_inversa in mapa_segmento_info:
                                info = mapa_segmento_info[chave_inversa]
                            else:
                                info = {
                                    "confrontante_id": None,
                                    "tipo_limite_sigef": "LN1",  # Limite padrão: Linha
                                    "metodo_posicionamento_sigef": metodo_padrao
                                }

                            cursor.execute(query_insert_seg, (
                                levantamento_id,
                                matricula_id,
                                pt_ini["id"],
                                pt_fim["id"],
                                info["confrontante_id"],
                                info["tipo_limite_sigef"],
                                info["metodo_posicionamento_sigef"]
                            ))
                            segmentos_criados += 1

                        conn.commit()
                        logger.info(f"[TOPOLOGIA] Perímetro ordenado com sucesso. {segmentos_criados} segmentos gravados.")
                    else:
                        conn.commit()
                        logger.info("[TOPOLOGIA] Pontos avulsos do levantamento ordenados com sucesso no banco.")
                except Exception as e:
                    conn.rollback()
                    raise e

            return {
                "sucesso": True,
                "total_vertices": n,
                "orientacao_original": orientacao_original,
                "ponto_inicial": ponto_norte["nome_vertice"],
                "mensagem": "Poligonal reordenada com sucesso para sentido horário iniciando no extremo norte."
            }

        except Exception as e_db:
            logger.error(f"[TOPOLOGIA] Falha no commit de reordenação: {e_db}")
            raise e_db

    except Exception as e:
        logger.error(f"[TOPOLOGIA] Falha crítica no algoritmo de reordenação perimetral: {e}")
        return {
            "sucesso": False,
            "erro": str(e)
        }

def associar_base_ao_lote(ponto_id_selecionado: int, base_ppp_id: int) -> int:
    """
    Associa uma base PPP processada e corrigida a um lote de pontos importados (mesmo arquivo_origem),
    recalculando rigorosamente as coordenadas de todos os pontos do lote através de translação plana rigorosa.
    """
    import math
    import logging
    from database.connection import execute_query, DatabaseManager
    from services.processamento.historico_campo import HistoricoCampoLogger
    from utils.transformer_cache import get_transformer
    from services.gestores.workspace_manager import WorkspaceManager
    from services.parsers.txt_parser import TxtGeodesicParser

    logger = logging.getLogger(__name__)

    # 1. Identifica o ponto selecionado no banco
    row_selecionado = execute_query(
        "SELECT levantamento_id, arquivo_origem, e_original, n_original, alt_original, sigma_n, sigma_e, sigma_z FROM pontos WHERE id = ?",
        params=(ponto_id_selecionado,),
        fetch_one=True
    )
    if not row_selecionado:
        logger.error(f"[VINCULO_TARDE] Ponto com ID {ponto_id_selecionado} não encontrado no banco.")
        raise ValueError("Ponto selecionado não encontrado.")

    ponto_sel = dict(row_selecionado)
    arquivo_origem = ponto_sel.get("arquivo_origem")
    levantamento_id = ponto_sel.get("levantamento_id")

    if not arquivo_origem:
        logger.error(f"[VINCULO_TARDE] Ponto {ponto_id_selecionado} não possui 'arquivo_origem' definido no banco.")
        raise ValueError("Ponto selecionado não possui arquivo de origem associado.")

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
        logger.warning(f"[VINCULO_TARDE] Verificação de layout do arquivo {arquivo_origem}: {e_layout}")
        if "não é do tipo RTK" in str(e_layout):
            raise e_layout

    # 2. Recupera as informações corrigidas oficiais da base_ppp_id
    row_base = execute_query(
        "SELECT id, nome_vertice, lat, lon, alt, sigma_lat, sigma_lon, sigma_alt, status_ponto, status_correcao FROM pontos WHERE id = ?",
        params=(base_ppp_id,),
        fetch_one=True
    )
    if not row_base:
        logger.error(f"[VINCULO_TARDE] Base com ID {base_ppp_id} não encontrada.")
        raise ValueError("Base PPP especificada não encontrada.")

    base_corr = dict(row_base)
    if not base_corr["lat"] or base_corr["lat"] == 0.0:
        logger.error(f"[VINCULO_TARDE] A base selecionada {base_corr['nome_vertice']} não possui coordenadas geodésicas válidas.")
        raise ValueError(f"A base selecionada {base_corr['nome_vertice']} não possui coordenadas geodésicas válidas.")

    # 3. Determina o Vetor Delta ECEF 3D a partir das coordenadas
    longitude_base = base_corr["lon"]
    zona_utm = int((longitude_base + 180) / 6) + 1
    epsg_utm = f"319{60 + zona_utm}"

    transformer_to_latlon = get_transformer(f"epsg:{epsg_utm}", "epsg:4674", always_xy=True)

    # Converte coordenadas brutas de campo (UTM) do ponto selecionado (amarração) para Geodésica original
    lon_base_orig, lat_base_orig = transformer_to_latlon.transform(ponto_sel["e_original"], ponto_sel["n_original"])
    alt_base_orig = ponto_sel["alt_original"] if ponto_sel["alt_original"] is not None else 0.0

    # Converte coordenada geodésica original da Base para ECEF original
    x_base_orig, y_base_orig, z_base_orig = geodesic_to_ecef(lat_base_orig, lon_base_orig, alt_base_orig)

    # Converte coordenada geodésica corrigida da Base (oficial) para ECEF corrigida
    x_base_corr, y_base_corr, z_base_corr = geodesic_to_ecef(base_corr["lat"], base_corr["lon"], base_corr["alt"])

    # Vetor Delta ECEF 3D
    delta_x = x_base_corr - x_base_orig
    delta_y = y_base_corr - y_base_orig
    delta_z = z_base_corr - z_base_orig

    logger.info(f"[VINCULO_TARDE] Vetor Delta ECEF 3D calculado: dX={delta_x:.4f}m, dY={delta_y:.4f}m, dZ={delta_z:.4f}m")

    # 4. Recupera todos os rovers pertencentes ao mesmo arquivo_origem e levantamento
    query_rovers = """
        SELECT id, nome_vertice, e_original, n_original, alt_original, sigma_n, sigma_e, sigma_z
        FROM pontos
        WHERE levantamento_id = ? AND arquivo_origem = ? AND id != ? AND (ponto_vizinho IS NULL OR ponto_vizinho = 0)
    """
    rows_rovers = execute_query(query_rovers, params=(levantamento_id, arquivo_origem, ponto_id_selecionado), fetch_all=True)
    rovers = [dict(r) for r in rows_rovers]

    total_atualizados = 0
    detalhamento_logs = []

    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()

            sig_base_lat = base_corr["sigma_lat"] or 0.0
            sig_base_lon = base_corr["sigma_lon"] or 0.0
            sig_base_alt = base_corr["sigma_alt"] or 0.0

            sig_lat_sel = ponto_sel["sigma_lat"] if ponto_sel.get("sigma_lat") is not None else (ponto_sel["sigma_n"] or 0.0)
            sig_lon_sel = ponto_sel["sigma_lon"] if ponto_sel.get("sigma_lon") is not None else (ponto_sel["sigma_e"] or 0.0)
            sig_alt_sel = ponto_sel["sigma_alt"] if ponto_sel.get("sigma_alt") is not None else (ponto_sel["sigma_z"] or 0.0)

            cursor.execute(
                """
                UPDATE pontos
                SET lat = ?, lon = ?, alt = ?,
                    lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                    sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                    status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO',
                    ponto_base_id = ?, tipo_ponto = 'B', ordem_caminhamento = NULL
                WHERE id = ?
                """,
                (base_corr["lat"], base_corr["lon"], base_corr["alt"],
                 base_corr["lat"], base_corr["lon"], base_corr["alt"],
                 sig_lat_sel, sig_lon_sel, sig_alt_sel,
                 base_ppp_id, ponto_id_selecionado)
            )
            total_atualizados += 1
            detalhamento_logs.append({
                "id": ponto_id_selecionado,
                "nome": "Base_Amarração_" + base_corr["nome_vertice"],
                "original": {"E": ponto_sel["e_original"], "N": ponto_sel["n_original"], "H": ponto_sel["alt_original"]},
                "corrigido": {"lat": base_corr["lat"], "lon": base_corr["lon"], "H": base_corr["alt"]}
            })

            for r in rovers:
                if not r["e_original"] or not r["n_original"]:
                    continue

                e_orig = r["e_original"]
                n_orig = r["n_original"]
                alt_orig = r["alt_original"] if r.get("alt_original") is not None else 0.0

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

                sig_lat_prop = r["sigma_lat"] if r.get("sigma_lat") is not None else (r["sigma_n"] or 0.0)
                sig_lon_prop = r["sigma_lon"] if r.get("sigma_lon") is not None else (r["sigma_e"] or 0.0)
                sig_alt_prop = r["sigma_alt"] if r.get("sigma_alt") is not None else (r["sigma_z"] or 0.0)

                cursor.execute(
                    """
                    UPDATE pontos
                    SET lat = ?, lon = ?, alt = ?,
                        lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                        sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                        status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO',
                        ponto_base_id = ?
                    WHERE id = ?
                    """,
                    (lat_corr, lon_corr, alt_corr,
                     lat_corr, lon_corr, alt_corr,
                     sig_lat_prop, sig_lon_prop, sig_alt_prop,
                     base_ppp_id, r["id"])
                )
                total_atualizados += 1
                detalhamento_logs.append({
                    "id": r["id"],
                    "nome": r["nome_vertice"],
                    "original": {"E": r["e_original"], "N": r["n_original"], "H": r["alt_original"]},
                    "corrigido": {"lat": lat_corr, "lon": lon_corr, "H": alt_corr}
                })

            conn.commit()

        desc_auditoria = f"Vínculo Tardio V.L.A.E.G. aplicado com sucesso. {total_atualizados} pontos do arquivo '{arquivo_origem}' foram transladados e amarrados no espaço ECEF 3D à Base '{base_corr['nome_vertice']}'."
        HistoricoCampoLogger.registrar_evento(
            levantamento_id=levantamento_id,
            tipo_evento="VINCULO_BASE_TARDE",
            descricao=desc_auditoria,
            dados_detalhados={
                "arquivo_origem": arquivo_origem,
                "base_id": base_ppp_id,
                "base_nome": base_corr["nome_vertice"],
                "vetor_delta_utm": {"dX": delta_x, "dY": delta_y, "dZ": delta_z},
                "total_pontos_vinculados": total_atualizados,
                "detalhes": detalhamento_logs
            }
        )

        logger.info(f"[VINCULO_TARDE] Processamento de amarração tardia concluído. {total_atualizados} atualizados.")
        return total_atualizados

    except Exception as e_db:
        logger.error(f"[VINCULO_TARDE] Falha crítica de transação ao atualizar rovers: {e_db}")
        raise e_db
