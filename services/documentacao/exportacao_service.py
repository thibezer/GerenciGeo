import json
import os
from pathlib import Path
from pyproj import Transformer
from database.connection import execute_query
from services.gestores.workspace_manager import WorkspaceManager
from utils.logger import tracer

class ExportacaoService:
    
    @staticmethod
    def gerar_documento_cliente_workspace(levantamento_id: int):
        """Varre clientes e matrículas vinculados à propriedade do levantamento e grava DADOS_GERAIS.json"""
        query_prop = """
            SELECT p.id, p.nome_propriedade, p.codigo_car, p.municipio, p.uf
            FROM levantamentos l
            JOIN propriedades p ON l.propriedade_id = p.id
            WHERE l.id = ?
        """
        try:
            prop_row = execute_query(query_prop, params=(levantamento_id,), fetch_one=True)
            if not prop_row:
                return
            propriedade_data = dict(prop_row)
            propriedade_id = propriedade_data['id']

            # 1. Busca todas as matrículas cadastradas da propriedade
            query_mat = """
                SELECT id, numero_matricula, ccir, itr, area_ha
                FROM matriculas
                WHERE propriedade_id = ?
            """
            mat_rows = execute_query(query_mat, params=(propriedade_id,), fetch_all=True)
            matriculas_list = [dict(m) for m in mat_rows]

            # 2. Busca todos os clientes associados à propriedade
            query_cli = """
                SELECT c.*
                FROM propriedade_clientes pc
                JOIN clientes c ON pc.cliente_id = c.id
                WHERE pc.propriedade_id = ?
            """
            cli_rows = execute_query(query_cli, params=(propriedade_id,), fetch_all=True)
            clientes_list = []
            
            if cli_rows:
                c_ids = [str(r['id']) for r in cli_rows]
                placeholders = ','.join(['?'] * len(c_ids))
                meta_query = f"SELECT id_cliente, chave, valor FROM cliente_metadados WHERE id_cliente IN ({placeholders})"
                meta_rows = execute_query(meta_query, params=tuple(c_ids), fetch_all=True)
                
                from collections import defaultdict
                meta_dict = defaultdict(dict)
                if meta_rows:
                    for m in meta_rows:
                        meta_dict[m['id_cliente']][m['chave']] = m['valor']

                for r in cli_rows:
                    c_dict = dict(r)
                    c_id = c_dict['id']
                    c_dict.pop('created_at', None)
                    c_dict['metadados'] = meta_dict.get(c_id, {})
                    clientes_list.append(c_dict)

            # 3. Compila dados estruturados do Levantamento
            dados_gerais = {
                "propriedade": propriedade_data,
                "clientes": clientes_list,
                "matriculas": matriculas_list
            }

            # 4. Garante a criação física da pasta e grava o JSON estruturado
            wm = WorkspaceManager()
            folder = wm.get_levantamento_folder(levantamento_id)
            wm.create_workspace(levantamento_id)
            
            caminho_json = folder / "Documentos" / "DADOS_GERAIS.json"
            with open(caminho_json, "w", encoding="utf-8") as f:
                json.dump(dados_gerais, f, indent=4, ensure_ascii=False)
                
            tracer.trace_file_usage("WRITE", str(caminho_json), "ExportacaoService.gerar_documento_cliente_workspace")
                
        except Exception as e:
            # Silencia erros de IO com logs adequados
            import logging
            logging.getLogger(__name__).error(f"Erro ao gerar metadados DADOS_GERAIS.json: {e}")

    @staticmethod
    def gerar_snapshot_arquivamento(levantamento_id: int) -> str:
        """Gera um snapshot JSON físico completo de segurança de todos os dados do levantamento para resguardo e o salva no workspace"""
        try:
            # profissional e levantamento
            lev_row = execute_query(
                "SELECT l.*, p.nome as nome_profissional, p.registro as registro_profissional, p.codigo_credenciado FROM levantamentos l JOIN profissionais p ON l.profissional_id = p.id WHERE l.id = ?",
                params=(levantamento_id,), fetch_one=True
            )
            if not lev_row:
                return ""
            lev_data = dict(lev_row)
            propriedade_id = lev_data["propriedade_id"]

            # propriedade e clientes
            prop_row = execute_query("SELECT * FROM propriedades WHERE id = ?", params=(propriedade_id,), fetch_one=True)
            prop_data = dict(prop_row) if prop_row else {}

            cli_rows = execute_query(
                "SELECT c.*, pc.percentual_participacao FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id WHERE pc.propriedade_id = ?",
                params=(propriedade_id,), fetch_all=True
            )
            clientes = [dict(c) for c in cli_rows]

            # matriculas
            mat_rows = execute_query("SELECT * FROM matriculas WHERE propriedade_id = ?", params=(propriedade_id,), fetch_all=True)
            matriculas = [dict(m) for m in mat_rows]

            # confrontantes
            conf_rows = execute_query("SELECT * FROM confrontantes WHERE levantamento_id = ?", params=(levantamento_id,), fetch_all=True)
            confrontantes = [dict(c) for c in conf_rows]

            # pontos
            pontos_rows = execute_query("SELECT * FROM pontos WHERE levantamento_id = ?", params=(levantamento_id,), fetch_all=True)
            pontos = [dict(p) for p in pontos_rows]

            # segmentos
            seg_rows = execute_query("SELECT * FROM segmentos WHERE levantamento_id = ?", params=(levantamento_id,), fetch_all=True)
            segmentos = [dict(s) for s in seg_rows]

            snapshot = {
                "levantamento": lev_data,
                "propriedade": prop_data,
                "clientes": clientes,
                "matriculas": matriculas,
                "confrontantes": confrontantes,
                "pontos": pontos,
                "segmentos": segmentos
            }

            wm = WorkspaceManager()
            folder = wm.get_levantamento_folder(levantamento_id)
            caminho_snap = folder / "Documentos" / "SNAPSHOT_FECHAMENTO.json"
            
            with open(caminho_snap, "w", encoding="utf-8") as f:
                json.dump(snapshot, f, indent=4, ensure_ascii=False)
                
            tracer.trace_file_usage("WRITE", str(caminho_snap), "ExportacaoService.gerar_snapshot_arquivamento")
                
            return str(caminho_snap)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"[WORKSPACE] Erro ao gerar SNAPSHOT_FECHAMENTO.json: {e}")
            return ""

    @staticmethod
    def consolidar_pontos_levantamento(levantamento_id: int) -> str:
        """
        Lê os pontos e segmentos do banco de dados, resolve o fuso UTM,
        computa os sigmas e confrontantes, e grava o arquivo PONTOS_CONSOLIDADOS_UTM.csv
        na pasta /Exportacoes do levantamento.
        """
        import math
        from pyproj import Transformer

        # 1. Recupera todos os pontos cadastrados do levantamento ordenados
        query_pontos = """
            SELECT p.id, p.nome_vertice, p.tipo_ponto, p.lat, p.lon, p.alt, 
                   p.sigma_lat, p.sigma_lon, p.sigma_alt, p.sigma_e, p.sigma_n, p.sigma_z,
                   p.ordem_caminhamento, p.matricula_id, p.confrontante_id,
                   p.metodo_posicionamento,
                   COALESCE(c.nome, pe.nome, '') as pt_nome_confrontante,
                   COALESCE(c.matricula_imovel, '') as pt_matricula_imovel,
                   COALESCE(c.cns_confrontante, '') as pt_cns_confrontante
            FROM pontos p
            LEFT JOIN confrontantes c ON p.confrontante_id = c.id
            LEFT JOIN pessoas pe ON c.pessoa_id = pe.id
            WHERE p.levantamento_id = ? 
              AND (p.ponto_vizinho IS NULL OR p.ponto_vizinho = 0)
              AND (p.origem_homologada IS NULL OR p.origem_homologada = 0)
              AND (p.ignorar_poligono IS NULL OR p.ignorar_poligono = 0)
            ORDER BY CASE WHEN p.matricula_id IS NULL THEN 1 ELSE 0 END ASC, p.matricula_id ASC, CASE WHEN p.ordem_caminhamento IS NULL OR p.ordem_caminhamento = 0 THEN 999999 ELSE p.ordem_caminhamento END ASC, p.id ASC
        """
        pontos = [dict(r) for r in execute_query(query_pontos, params=(levantamento_id,), fetch_all=True)]
        if not pontos:
            raise ValueError("Nenhum ponto geodésico localizado no banco de dados para este levantamento.")

        # 2. Recupera todos os segmentos de divisa
        query_segmentos = """
            SELECT s.ponto_inicio_id, s.tipo_limite_sigef, s.metodo_posicionamento_sigef,
                   COALESCE(c.nome, pe.nome, '') as nome_confrontante,
                   COALESCE(c.matricula_imovel, '') as matricula_imovel,
                   COALESCE(c.cns_confrontante, '') as cns_confrontante
            FROM segmentos s
            LEFT JOIN confrontantes c ON s.confrontante_id = c.id
            LEFT JOIN pessoas pe ON c.pessoa_id = pe.id
            WHERE s.levantamento_id = ?
        """
        segmentos = {s["ponto_inicio_id"]: dict(s) for s in execute_query(query_segmentos, params=(levantamento_id,), fetch_all=True)}

        # 3. Determina o fuso UTM baseado no primeiro ponto válido
        ponto_base = next((p for p in pontos if p["lon"] and p["lon"] != 0.0), pontos[0])
        lon0 = ponto_base["lon"]
        zona_utm = int((lon0 + 180) / 6) + 1
        epsg_utm = f"319{60 + zona_utm}"  # Família SIRGAS 2000 UTM Sul

        # Instancia o conversor geodésico -> plano UTM
        transformer = Transformer.from_crs("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)

        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(levantamento_id)
        wm.create_workspace(levantamento_id)
        caminho_exportacao = folder / "Exportacoes" / "PONTOS_CONSOLIDADOS_UTM.csv"

        linhas_arquivo = []
        # Cabeçalho padronizado (Novo Padrão PT-BR Excel)
        linhas_arquivo.append("*VERTICE;ESTE=X;NORTE=Y;ALTIT=Z;CONFRONTANTE;SIGMA X;SIGMA Y;SIGMA Z;MET POS;TIP LIM;CNS;MATR")

        for p in pontos:
            # Conversão de latitude/longitude corrigidas para coordenadas planas UTM
            e_utm, n_utm = transformer.transform(p["lon"], p["lat"])
            
            # Mapeia informações do segmento correspondente (onde o ponto é vértice de partida)
            seg = segmentos.get(p["id"])
            confrontante = ""
            met_pos = ""
            tip_lim = ""
            cns = ""
            matr = ""

            if seg:
                if seg["nome_confrontante"]:
                    confrontante = seg["nome_confrontante"].upper()
                else:
                    confrontante = p.get("pt_nome_confrontante", "").upper()
                met_pos = p.get("metodo_posicionamento") or seg.get("metodo_posicionamento_sigef") or ""
                tip_lim = seg.get("tipo_limite_sigef") or ""
                cns = seg.get("cns_confrontante") or p.get("pt_cns_confrontante") or ""
                matr = seg.get("matricula_imovel") or p.get("pt_matricula_imovel") or ""
            else:
                confrontante = p.get("pt_nome_confrontante", "").upper()
                met_pos = p.get("metodo_posicionamento") or ""
                tip_lim = ""
                cns = p.get("pt_cns_confrontante") or ""
                matr = p.get("pt_matricula_imovel") or ""
                if p["tipo_ponto"] == "M":
                    confrontante = "APOIO BASE PPP"

            # Sanitização simples para evitar vírgulas internas no CSV
            confrontante_limpo = confrontante.replace(",", " ")
            cns_limpo = cns.replace(",", " ")
            matr_limpa = matr.replace(",", " ")

            # Fallbacks para sigmas em metros (Easting = X, Northing = Y)
            sigma_e = p.get("sigma_e") if p.get("sigma_e") is not None else p.get("sigma_lon", 0.0)
            sigma_n = p.get("sigma_n") if p.get("sigma_n") is not None else p.get("sigma_lat", 0.0)
            sigma_z = p.get("sigma_z") if p.get("sigma_z") is not None else p.get("sigma_alt", 0.0)

            # Linha formatada no novo padrão CSV (Ponto e vírgula como separador e vírgula como decimal para o Excel PT-BR)
            e_utm_str = f"{e_utm:.3f}".replace('.', ',')
            n_utm_str = f"{n_utm:.3f}".replace('.', ',')
            alt_str = f"{p['alt']:.3f}".replace('.', ',')
            sigma_e_str = f"{sigma_e:.3f}".replace('.', ',')
            sigma_n_str = f"{sigma_n:.3f}".replace('.', ',')
            sigma_z_str = f"{sigma_z:.3f}".replace('.', ',')
            
            linhas_arquivo.append(
                f"{p['nome_vertice']};{e_utm_str};{n_utm_str};{alt_str};"
                f"{confrontante_limpo};{sigma_e_str};{sigma_n_str};"
                f"{sigma_z_str};{met_pos};{tip_lim};{cns_limpo};{matr_limpa}"
            )

        # Gravação física do arquivo unificado
        with open(caminho_exportacao, "w", encoding="utf-8") as f:
            f.write("\n".join(linhas_arquivo))
            
        tracer.trace_file_usage("WRITE", str(caminho_exportacao), "ExportacaoService.consolidar_pontos_levantamento")

        return str(caminho_exportacao)
