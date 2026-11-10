import json
import os
import re
from pathlib import Path
from utils.transformer_cache import get_transformer
from database.connection import execute_query
from services.gestores.workspace_manager import WorkspaceManager
from utils.logger import tracer
from services.documentacao.sigef_modelo import preencher_modelo_sigef

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

            # 2. Busca todos os clientes associados à propriedade com seus dados civis completos
            query_cli = """
                SELECT c.id, c.pessoa_id, p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie,
                       p.nacionalidade, p.profissao, p.estado_civil, p.regime_bens,
                       p.endereco_completo, p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge,
                       c.data_nascimento_fundacao, c.email, c.telefone, c.cidade, c.estado, c.cep, c.sexo,
                       pc.percentual_participacao
                FROM propriedade_clientes pc
                JOIN clientes c ON pc.cliente_id = c.id
                JOIN pessoas p ON c.pessoa_id = p.id
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
                    c_dict.pop('senha_gov', None)
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
    def _coletar_linhas_perimetro(levantamento_id: int, incluir_apoio: bool = True) -> tuple:
        """
        Lê pontos e segmentos do banco, converte para UTM (fuso do primeiro ponto válido) e
        devolve (linhas, zona_utm). Cada linha é um dict com o vértice, coordenadas planas, sigmas (m),
        método de posicionamento, tipo de limite, confrontante, CNS e matrícula do confrontante.
        """
        query_pontos = """
            SELECT p.id, p.nome_vertice, p.codigo_sigef, p.tipo_ponto, p.lat, p.lon, p.alt,
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
        if not incluir_apoio:
            pontos = [p for p in pontos if p["tipo_ponto"] != "B"]
        if not pontos:
            raise ValueError("Nenhum ponto geodésico localizado no banco de dados para este levantamento.")

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

        ponto_base = next((p for p in pontos if p["lon"] and p["lon"] != 0.0), pontos[0])
        zona_utm = int((ponto_base["lon"] + 180) / 6) + 1
        transformer = get_transformer("epsg:4674", f"epsg:{31960 + zona_utm}", always_xy=True)

        linhas = []
        for p in pontos:
            e_utm, n_utm = transformer.transform(p["lon"], p["lat"])
            seg = segmentos.get(p["id"])
            if seg:
                confrontante = seg["nome_confrontante"] or p.get("pt_nome_confrontante", "")
                met_pos = p.get("metodo_posicionamento") or seg.get("metodo_posicionamento_sigef") or ""
                tip_lim = seg.get("tipo_limite_sigef") or ""
                cns = seg.get("cns_confrontante") or p.get("pt_cns_confrontante") or ""
                matr = seg.get("matricula_imovel") or p.get("pt_matricula_imovel") or ""
            else:
                confrontante = p.get("pt_nome_confrontante", "")
                met_pos = p.get("metodo_posicionamento") or ""
                tip_lim = ""
                cns = p.get("pt_cns_confrontante") or ""
                matr = p.get("pt_matricula_imovel") or ""
                if p["tipo_ponto"] == "B":
                    confrontante = "APOIO BASE PPP"

            def _sig(principal, fallback):
                v = p.get(principal)
                if v is None:
                    v = p.get(fallback)
                return v or 0.0

            linhas.append({
                "vertice": (p.get("codigo_sigef") or "").strip() or p["nome_vertice"], "matricula_id": p["matricula_id"], "tipo_ponto": p["tipo_ponto"],
                "e": e_utm, "n": n_utm, "z": p["alt"] or 0.0,
                "sigma_e": _sig("sigma_e", "sigma_lon"), "sigma_n": _sig("sigma_n", "sigma_lat"),
                "sigma_z": _sig("sigma_z", "sigma_alt"),
                "confrontante": confrontante, "met_pos": met_pos, "tip_lim": tip_lim, "cns": cns, "matr": matr,
            })
        return linhas, zona_utm

    @staticmethod
    def consolidar_pontos_levantamento(levantamento_id: int) -> str:
        """Grava PONTOS_CONSOLIDADOS_UTM.csv (pt-BR/Excel) na pasta /Exportacoes do levantamento."""
        linhas, _ = ExportacaoService._coletar_linhas_perimetro(levantamento_id)

        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(levantamento_id)
        wm.create_workspace(levantamento_id)
        caminho_exportacao = folder / "Exportacoes" / "PONTOS_CONSOLIDADOS_UTM.csv"

        def f3(v: float) -> str:
            return f"{v:.3f}".replace('.', ',')

        linhas_arquivo = ["*VERTICE;ESTE=X;NORTE=Y;ALTIT=Z;CONFRONTANTE;SIGMA X;SIGMA Y;SIGMA Z;MET POS;TIP LIM;CNS;MATR"]
        for l in linhas:
            linhas_arquivo.append(
                f"{l['vertice']};{f3(l['e'])};{f3(l['n'])};{f3(l['z'])};"
                f"{l['confrontante'].upper().replace(',', ' ')};{f3(l['sigma_e'])};{f3(l['sigma_n'])};"
                f"{f3(l['sigma_z'])};{l['met_pos']};{l['tip_lim']};{l['cns'].replace(',', ' ')};{l['matr'].replace(',', ' ')}"
            )

        with open(caminho_exportacao, "w", encoding="utf-8") as f:
            f.write("\n".join(linhas_arquivo))

        tracer.trace_file_usage("WRITE", str(caminho_exportacao), "ExportacaoService.consolidar_pontos_levantamento")
        return str(caminho_exportacao)

    @staticmethod
    def gerar_planilha_sigef(levantamento_id: int) -> tuple:
        """
        Gera a Planilha Eletrônica SIGEF (.ods) em /Exportacoes: aba `identificacao` + uma aba
        `perimetro_N` por matrícula (parte da parcela). Retorna (caminho, avisos).
        """
        avisos: list = []
        linhas, zona_utm = ExportacaoService._coletar_linhas_perimetro(levantamento_id, incluir_apoio=False)
        meridiano_central = zona_utm * 6 - 183

        lev = execute_query(
            """SELECT l.propriedade_id, pr.nome_propriedade, pr.codigo_ccir, pr.municipio, pr.uf
               FROM levantamentos l JOIN propriedades pr ON l.propriedade_id = pr.id WHERE l.id = ?""",
            params=(levantamento_id,), fetch_one=True)
        if not lev:
            raise ValueError("Levantamento ou propriedade não encontrados.")
        lev = dict(lev)
        mats = {m["id"]: dict(m) for m in execute_query(
            "SELECT id, numero_matricula, denominacao, cri_circunscricao FROM matriculas WHERE propriedade_id = ? ORDER BY id",
            params=(lev["propriedade_id"],), fetch_all=True)}
        detentor = execute_query(
            """SELECT p.nome, p.cpf_cnpj, p.tipo_pessoa, p.razao_social
               FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id JOIN pessoas p ON c.pessoa_id = p.id
               WHERE pc.propriedade_id = ? ORDER BY pc.percentual_participacao DESC, pc.id ASC LIMIT 1""",
            params=(lev["propriedade_id"],), fetch_one=True)
        detentor = dict(detentor) if detentor else {}

        # Agrupa por matrícula preservando a ordem (sem matrícula -> grupo único)
        grupos: dict = {}
        for l in linhas:
            grupos.setdefault(l["matricula_id"], []).append(l)

        def dec(v, casas=2) -> str:
            return f"{v:.{casas}f}".replace(".", ",")

        # --- Identificação ---
        juridica = (detentor.get("tipo_pessoa") or "").upper() in ("PJ", "JURIDICA", "JURÍDICA")
        if not detentor:
            avisos.append("Nenhum cliente vinculado à propriedade: preencha o detentor na planilha.")
        mat_ref = next((mats[k] for k in grupos if k in mats), next(iter(mats.values()), {}))
        cns_imovel = (mat_ref.get("cri_circunscricao") or "").strip()
        if not lev.get("codigo_ccir"):
            avisos.append("Propriedade sem código do imóvel (SNCR/CCIR).")
        if not cns_imovel:
            avisos.append("Matrícula sem CNS do cartório (cri_circunscricao).")
        ident = {
            "juridica": juridica,
            "nome": (detentor.get("razao_social") if juridica else None) or detentor.get("nome") or "",
            "documento": detentor.get("cpf_cnpj") or "",
            "denominacao": mat_ref.get("denominacao") or lev.get("nome_propriedade") or "Parcela 1",
            "sncr": lev.get("codigo_ccir") or "",
            "cns": cns_imovel,
            "matricula": (mat_ref.get("numero_matricula") or "").strip(),
            "municipio_uf": f"{lev.get('municipio') or ''}-{lev.get('uf') or ''}",
        }

        # --- Perímetros (uma parte por matrícula) ---
        incompletos: list = []
        partes = []
        for idx, (mid, vertices) in enumerate(grupos.items(), start=1):
            linhas_v = []
            for v in vertices:
                if not v["met_pos"] or not v["tip_lim"]:
                    incompletos.append(v["vertice"])
                linhas_v.append([
                    v["vertice"], dec(v["e"]), dec(v["sigma_e"]), dec(v["n"]), dec(v["sigma_n"]),
                    dec(v["z"]), dec(v["sigma_z"]), v["met_pos"], v["tip_lim"], v["cns"], v["matr"], v["confrontante"],
                ])
            partes.append({
                "denominacao": (mats.get(mid) or {}).get("denominacao") or f"Parte {idx}",
                "parcela": "001",
                "meridiano_central": meridiano_central,
                "hemisferio": "Sul",
                "vertices": linhas_v,
            })
        if incompletos:
            avisos.append(f"{len(incompletos)} vértice(s) sem método de posicionamento ou tipo de limite (ex.: {', '.join(incompletos[:3])}).")

        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(levantamento_id)
        wm.create_workspace(levantamento_id)
        caminho = folder / "Exportacoes" / "PLANILHA_SIGEF.ods"
        preencher_modelo_sigef(str(caminho), ident, partes)
        tracer.trace_file_usage("WRITE", str(caminho), "ExportacaoService.gerar_planilha_sigef")
        return str(caminho), avisos
