import io
import zipfile
import shapefile
import logging
from database.connection import execute_query
from business.geoprocessamento import latlon_to_utm22s

logger = logging.getLogger(__name__)

# String WKT oficial da EPSG:31982 (SIRGAS 2000 / UTM zone 22S) definida constitucionalmente
EPSG_31982_WKT = (
    'PROJCS["SIRGAS 2000 / UTM zone 22S",GEOGCS["SIRGAS 2000",'
    'DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",'
    'SPHEROID["GRS 1980",6378137,298.257222101],TOWGS84[0,0,0,0,0,0,0]],'
    'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],'
    'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4674"]],'
    'PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],'
    'PARAMETER["central_meridian",-51],PARAMETER["scale_factor",0.9996],'
    'PARAMETER["false_easting",500000],PARAMETER["false_northing",10000000],'
    'UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",EAST],AXIS["Northing",NORTH],'
    'AUTHORITY["EPSG","31982"]]'
)

class ShapefileExporter:
    @staticmethod
    def exportar_matricula_zip(levantamento_id: int, matricula_id: int) -> bytes:
        """
        Gera um arquivo ZIP em memória contendo duas camadas geométricas no formato Shapefile:
        1. Camada de Pontos (pontos.shp, pontos.shx, pontos.dbf, pontos.prj)
        2. Camada de Polígono (perimetro.shp, perimetro.shx, perimetro.dbf, perimetro.prj)
        As coordenadas são projetadas rigorosamente no sistema UTM Zona 22S (EPSG:31982).
        """
        # 1. Recupera metadados do Levantamento, Propriedade e Profissional Responsável
        query_lev = """
            SELECT l.id as levantamento_id, l.propriedade_id, l.profissional_id,
                   p.nome_propriedade, p.municipio, p.uf, p.codigo_car, p.codigo_ccir,
                   prof.nome as profissional_nome, prof.registro as profissional_registro, prof.codigo_credenciado as profissional_codigo
            FROM levantamentos l
            JOIN propriedades p ON l.propriedade_id = p.id
            JOIN profissionais prof ON l.profissional_id = prof.id
            WHERE l.id = ?
        """
        row_lev = execute_query(query_lev, params=(levantamento_id,), fetch_one=True)
        if not row_lev:
            raise ValueError(f"Levantamento com ID {levantamento_id} não encontrado.")
        lev_data = dict(row_lev)
        propriedade_id = lev_data["propriedade_id"]

        # 2. Recupera metadados da Matrícula específica
        query_mat = """
            SELECT id, numero_matricula, ccir, itr, area_ha, cri_comarca, cri_circunscricao, livro_registro, folha_registro
            FROM matriculas
            WHERE id = ? AND propriedade_id = ?
        """
        row_mat = execute_query(query_mat, params=(matricula_id, propriedade_id), fetch_one=True)
        if not row_mat:
            raise ValueError(f"Matrícula com ID {matricula_id} não encontrada para a propriedade vinculada.")
        mat_data = dict(row_mat)

        # 3. Busca os proprietários (clientes vinculados à propriedade) e concatena seus nomes
        query_proprietarios = """
            SELECT c.nome_completo, pc.percentual_participacao
            FROM propriedade_clientes pc
            JOIN clientes c ON pc.cliente_id = c.id
            WHERE pc.propriedade_id = ?
        """
        rows_proprietarios = execute_query(query_proprietarios, params=(propriedade_id,), fetch_all=True)
        nomes_proprietarios = []
        for prop in rows_proprietarios:
            part = f"{prop['percentual_participacao']:.0f}%" if prop['percentual_participacao'] else "100%"
            nomes_proprietarios.append(f"{prop['nome_completo']} ({part})")
        string_proprietarios = "; ".join(nomes_proprietarios) if nomes_proprietarios else "Nenhum proprietário cadastrado"
        # Garante limite de tamanho razoável para campo do DBF
        if len(string_proprietarios) > 250:
            string_proprietarios = string_proprietarios[:247] + "..."

        # 4. Busca os pontos (vértices) que compõem o perímetro
        query_pontos = """
            SELECT id, nome_vertice, tipo_ponto, lat, lon, alt, 
                   lat_corrigido, lon_corrigido, alt_corrigido,
                   sigma_lat, sigma_lon, sigma_alt,
                   sigma_n, sigma_e, sigma_z,
                   status_ponto, ordem_caminhamento
            FROM pontos
            WHERE levantamento_id = ? AND matricula_id = ? AND (ignorar_poligono IS NULL OR ignorar_poligono = 0)
            ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
        """
        rows_pontos = execute_query(query_pontos, params=(levantamento_id, matricula_id), fetch_all=True)
        if not rows_pontos or len(rows_pontos) < 3:
            raise ValueError("Não há pontos ou topologia perimetral suficiente para exportação (mínimo 3 vértices ativos).")
        
        pontos = [dict(p) for p in rows_pontos]

        # 5. Processa as coordenadas e projeta para UTM Zona 22S (EPSG:31982)
        pontos_processados = []
        coordenadas_utm_poligono = []

        for pt in pontos:
            # Seleciona coordenadas de forma robusta e consistente
            lat_f = pt["lat_corrigido"] if pt["lat_corrigido"] is not None else pt["lat"]
            lon_f = pt["lon_corrigido"] if pt["lon_corrigido"] is not None else pt["lon"]
            alt_f = pt["alt_corrigido"] if pt["alt_corrigido"] is not None else pt["alt"]
            
            # Se não houver lat/lon válido, ignora
            if not lat_f or not lon_f:
                continue

            try:
                x_utm, y_utm = latlon_to_utm22s(lat_f, lon_f)
            except Exception as e_proj:
                logger.error(f"Erro ao projetar vértice {pt['nome_vertice']} para UTM Zone 22S: {e_proj}")
                continue

            # Mapeia sigmas (incertezas)
            sig_lat = pt["sigma_n"] if pt["sigma_n"] is not None else (pt["sigma_lat"] or 0.0)
            sig_lon = pt["sigma_e"] if pt["sigma_e"] is not None else (pt["sigma_lon"] or 0.0)
            sig_alt = pt["sigma_z"] if pt["sigma_z"] is not None else (pt["sigma_alt"] or 0.0)
            
            p_proc = {
                "nome": pt["nome_vertice"],
                "tipo": pt["tipo_ponto"],
                "lat": lat_f,
                "lon": lon_f,
                "alt": alt_f or 0.0,
                "x_utm": x_utm,
                "y_utm": y_utm,
                "sigma_lat": sig_lat,
                "sigma_lon": sig_lon,
                "sigma_alt": sig_alt,
                "status": pt["status_ponto"] or "BRUTO",
                "ordem": pt["ordem_caminhamento"] or 0
            }
            pontos_processados.append(p_proc)
            coordenadas_utm_poligono.append([x_utm, y_utm])

        if len(pontos_processados) < 3:
            raise ValueError("Pontos processados insuficientes após projeção de coordenadas.")

        # 5.1. Auditoria Topológica Rigorosa de Autointerssecção (Item 10)
        pontos_plano_val = [{"e": p["x_utm"], "n": p["y_utm"]} for p in pontos_processados]
        from business.sigef_validator import SigefValidator
        if SigefValidator.validar_autointerssecao(pontos_plano_val):
            raise ValueError(
                "A poligonal do perímetro possui autointerssecções (cruzamentos de segmentos). "
                "Corrija a ordem de caminhamento no ordenador perimetral antes de exportar o Shapefile para evitar a rejeição imediata no SIGEF."
            )

        # 6. GERAÇÃO DE ARQUIVOS EM MEMÓRIA
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # ----------------------------------------------------
            # CAMADA 1: Vértices do Perímetro (POINT)
            # ----------------------------------------------------
            shp_pt_buf = io.BytesIO()
            shx_pt_buf = io.BytesIO()
            dbf_pt_buf = io.BytesIO()

            w_pt = shapefile.Writer(shp=shp_pt_buf, shx=shx_pt_buf, dbf=dbf_pt_buf, shapeType=shapefile.POINT)
            
            # Estrutura da Tabela DBF (Camada de Vértices)
            w_pt.field("NOME", "C", size=20)
            w_pt.field("TIPO", "C", size=2)
            w_pt.field("LAT", "N", size=18, decimal=11)
            w_pt.field("LON", "N", size=18, decimal=11)
            w_pt.field("ALT", "N", size=10, decimal=3)
            w_pt.field("X_UTM", "N", size=15, decimal=3)
            w_pt.field("Y_UTM", "N", size=15, decimal=3)
            w_pt.field("SIGMA_E", "N", size=8, decimal=4)
            w_pt.field("SIGMA_N", "N", size=8, decimal=4)
            w_pt.field("SIGMA_Z", "N", size=8, decimal=4)
            w_pt.field("STATUS", "C", size=15)
            w_pt.field("ORDEM", "N", size=5, decimal=0)

            # Escrita dos dados geométricos e tabulares
            for pt in pontos_processados:
                w_pt.point(pt["x_utm"], pt["y_utm"])
                w_pt.record(
                    pt["nome"],
                    pt["tipo"],
                    pt["lat"],
                    pt["lon"],
                    pt["alt"],
                    pt["x_utm"],
                    pt["y_utm"],
                    pt["sigma_lon"], # E
                    pt["sigma_lat"], # N
                    pt["sigma_alt"], # Z
                    pt["status"],
                    pt["ordem"]
                )
            
            w_pt.close()

            # Adiciona ao pacote ZIP
            zip_file.writestr("pontos.shp", shp_pt_buf.getvalue())
            zip_file.writestr("pontos.shx", shx_pt_buf.getvalue())
            zip_file.writestr("pontos.dbf", dbf_pt_buf.getvalue())
            zip_file.writestr("pontos.prj", EPSG_31982_WKT)

            # ----------------------------------------------------
            # CAMADA 2: Perímetro Poligonal (POLYGON)
            # ----------------------------------------------------
            shp_poly_buf = io.BytesIO()
            shx_poly_buf = io.BytesIO()
            dbf_poly_buf = io.BytesIO()

            w_poly = shapefile.Writer(shp=shp_poly_buf, shx=shx_poly_buf, dbf=dbf_poly_buf, shapeType=shapefile.POLYGON)

            # Estrutura da Tabela DBF (Camada de Perímetro)
            w_poly.field("MATRICULA", "C", size=30)
            w_poly.field("PROPRIEDAD", "C", size=100)
            w_poly.field("MUNICIPIO", "C", size=80)
            w_poly.field("UF", "C", size=2)
            w_poly.field("AREA_HA", "N", size=12, decimal=4)
            w_poly.field("CCIR", "C", size=30)
            w_poly.field("ITR", "C", size=30)
            w_poly.field("PROFISSIONA", "C", size=100)
            w_poly.field("RT_REGISTRO", "C", size=50)
            w_poly.field("RT_CREDENC", "C", size=50)
            w_poly.field("PROPRIETAR", "C", size=250)

            # Garante o fechamento estrito da poligonal perimetral (Shoelace/Gauss - Horário)
            # pyshp w.poly recebe lista contendo partes, onde cada parte é uma lista de pontos.
            # O primeiro ponto é repetido ao final para fechamento obrigatório.
            polygon_parts = []
            if coordenadas_utm_poligono:
                poligono_fechado = list(coordenadas_utm_poligono)
                if coordenadas_utm_poligono[0] != coordenadas_utm_poligono[-1]:
                    poligono_fechado.append(coordenadas_utm_poligono[0])
                polygon_parts.append(poligono_fechado)

            w_poly.poly(polygon_parts)
            w_poly.record(
                mat_data["numero_matricula"],
                lev_data["nome_propriedade"],
                lev_data["municipio"],
                lev_data["uf"],
                mat_data["area_ha"] or 0.0,
                mat_data["ccir"] or "Não Informado",
                mat_data["itr"] or "Não Informado",
                lev_data["profissional_nome"],
                lev_data["profissional_registro"],
                lev_data["profissional_codigo"],
                string_proprietarios
            )

            w_poly.close()

            # Adiciona ao pacote ZIP
            zip_file.writestr("perimetro.shp", shp_poly_buf.getvalue())
            zip_file.writestr("perimetro.shx", shx_poly_buf.getvalue())
            zip_file.writestr("perimetro.dbf", dbf_poly_buf.getvalue())
            zip_file.writestr("perimetro.prj", EPSG_31982_WKT)

        return zip_buffer.getvalue()
