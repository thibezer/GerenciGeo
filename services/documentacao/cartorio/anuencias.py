import logging
import re
from collections import defaultdict

from database.connection import DatabaseManager, execute_query
from services.documentacao.erros import ErroDocumento, NaoEncontrado
from services.documentacao.cartorio.utils import (
    Html,
    carregar_template,
    esc,
    formatar_cpf,
    formatar_rg,
    obter_data_extenso,
    renderizar_template,
    uf_exibicao,
    valor_ou_lacuna,
    valor_preenchido,
    LACUNA_TRT,
)
from services.documentacao.cartorio.data_fetcher import (
    gerar_tabela_divisas_html,
    obter_dados_comuns,
    obter_segmentos_detalhados_lote,
)
from services.documentacao.cartorio.laudos_imovel import gerar_js_inicializacao_mapas
from services.documentacao.cartorio.qualificacao import (
    assinatura_div,
    categoria_estado_civil,
    descrever_proprietarios_curto,
    flex,
    genero_normalizado,
    genero_plural,
    legenda_conjuge_requerente,
    legenda_requerente,
    qualificar_pessoa,
    rotulo_doc,
    tem_conjuge,
)
from services.gestores.anuencia_status import filtrar_exigem_anuencia
from services.processamento.geoprocessamento import calcular_zona_utm_segura

logger = logging.getLogger(__name__)


def _inferir_genero(genero_raw, padrao):
    """Gênero 'M'/'F' da pessoa: vale somente o campo gênero do cadastro (a flexão da nacionalidade,
    "brasileiro/brasileira", não define nada). Sem valor válido, usa o padrão (que pode ser None = neutro)."""
    return genero_normalizado(genero_raw) or padrao


def _rotulo_doc(nome: str) -> str:
    """Nome em destaque para identificar de quem é o documento (no lugar de "este"/"aquele")."""
    return rotulo_doc(esc(nome))


# ── Consultas do confrontante (em lote, para não repetir N+1) ──────────────────────

_SQL_CONFRONTANTES = """
    SELECT c.id,
           COALESCE(p.nome, c.nome) AS nome,
           COALESCE(p.cpf_cnpj, c.cpf_cnpj) AS cpf_cnpj,
           COALESCE(p.rg, c.rg) AS rg,
           p.genero AS genero,
           COALESCE(p.nacionalidade, c.nacionalidade) AS nacionalidade,
           COALESCE(p.profissao, c.profissao) AS profissao,
           COALESCE(p.estado_civil, c.estado_civil) AS estado_civil,
           COALESCE(p.regime_bens, c.regime_bens) AS regime_bens,
           COALESCE(p.endereco_completo, c.endereco_completo) AS endereco_completo,
           COALESCE(p.nome_conjuge, c.nome_conjuge) AS nome_conjuge,
           COALESCE(p.cpf_conjuge, c.cpf_conjuge) AS cpf_conjuge,
           COALESCE(p.rg_conjuge, c.rg_conjuge) AS rg_conjuge,
           p.genero_conjuge AS genero_conjuge,
           p.nacionalidade_conjuge AS nacionalidade_conjuge,
           p.profissao_conjuge,
           c.matricula_imovel,
           c.lote
    FROM confrontantes c
    LEFT JOIN pessoas p ON c.pessoa_id = p.id
    WHERE c.levantamento_id = ? AND c.id IN ({marcas})
"""


def _prefetch_confrontantes(lev_id: int, mat_desenho_id: int, ids: list[int]) -> dict:
    """Carrega, em poucas consultas, confrontante + coproprietários + segmentos de todos os ids."""
    ids = list(dict.fromkeys(ids))
    if not ids:
        return {}
    marcas = ",".join("?" * len(ids))
    rows = execute_query(_SQL_CONFRONTANTES.format(marcas=marcas), params=tuple([lev_id] + ids), fetch_all=True)
    confs = {r["id"]: dict(r) for r in rows}
    rows_cp = execute_query(
        f"SELECT * FROM confrontante_coproprietarios WHERE confrontante_id IN ({marcas}) ORDER BY id ASC",
        params=tuple(ids), fetch_all=True
    )
    coprops = defaultdict(list)
    for cp in rows_cp or []:
        coprops[cp["confrontante_id"]].append(dict(cp))
    segs = obter_segmentos_detalhados_lote(mat_desenho_id, ids)
    return {cid: {"conf": confs.get(cid), "coprops": coprops.get(cid, []), "segs": segs.get(cid, [])} for cid in ids}


# ── Geometria do croqui ────────────────────────────────────────────────────────────

def _montar_contexto_mapa(lev_id: int, matricula_id: int) -> dict | None:
    """Pontos válidos (coordenada corrigida quando existir) + poligonal geral da matrícula do desenho.
    Independe do confrontante: o lote calcula uma vez só. None = pontos insuficientes para o croqui."""
    todos_pontos = execute_query(
        """
        SELECT id, nome_vertice, lat, lon, lat_corrigido, lon_corrigido, tipo_ponto, ordem_caminhamento, ignorar_poligono, origem_homologada
        FROM pontos
        WHERE levantamento_id = ? AND matricula_id = ?
        ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
        """,
        params=(lev_id, matricula_id),
        fetch_all=True
    )
    if not todos_pontos:
        return None

    pts_validos = []
    lons = []
    for row in todos_pontos:
        pt = dict(row)
        lat = pt["lat_corrigido"] if pt["lat_corrigido"] is not None else pt["lat"]
        lon = pt["lon_corrigido"] if pt["lon_corrigido"] is not None else pt["lon"]
        if lat is not None and lon is not None:
            pt["_lat"] = lat
            pt["_lon"] = lon
            pts_validos.append(pt)
            lons.append(lon)

    if len(pts_validos) < 3:
        return None

    zona_utm = calcular_zona_utm_segura(sum(lons) / len(lons))
    pts_coords = {pt["id"]: (pt["_lat"], pt["_lon"], pt["nome_vertice"]) for pt in pts_validos}

    # Poligonal principal (Limite Geral): encadeamento topológico da cadeia de segmentos da matrícula
    rows_segs_mat = execute_query(
        """
        SELECT s.ponto_inicio_id, s.ponto_fim_id
        FROM segmentos s
        WHERE s.levantamento_id = ? AND s.matricula_id = ?
        ORDER BY s.id ASC
        """,
        params=(lev_id, matricula_id),
        fetch_all=True
    )
    poligono_coords = []
    if rows_segs_mat:
        adj_mat = {r["ponto_inicio_id"]: r["ponto_fim_id"] for r in rows_segs_mat}
        inicio = rows_segs_mat[0]["ponto_inicio_id"]
        curr = inicio
        visitados_anel = set()
        while curr not in visitados_anel:
            visitados_anel.add(curr)
            if curr in pts_coords:
                poligono_coords.append([pts_coords[curr][0], pts_coords[curr][1]])
            curr = adj_mat.get(curr)
            if not curr or curr == inicio:
                break

    # Fallback se não houver segmentos perimétricos ou se a cadeia tiver menos de 3 pontos
    if len(poligono_coords) < 3:
        pts_filtrados = [p for p in pts_validos if (p.get("ignorar_poligono") or 0) == 0 and p.get("tipo_ponto") != 'B']
        if any(p.get("origem_homologada") == 1 for p in pts_filtrados):
            pts_filtrados = [p for p in pts_filtrados if p.get("origem_homologada") == 1]
        poligono_coords = [[p["_lat"], p["_lon"]] for p in pts_filtrados]

    return {"pts_coords": pts_coords, "poligono_coords": poligono_coords, "zona_utm": zona_utm, "matricula_id": matricula_id}


def _ordenar_segmentos_encadeados(segs: list[dict]) -> list[tuple]:
    """Encadeia (ponto_inicio, ponto_fim) a partir da ponta inicial da divisa; segmentos soltos vão ao final."""
    fins = {s["ponto_fim_id"] for s in segs}
    pontas_ini = [s for s in segs if s["ponto_inicio_id"] not in fins]
    adj_conf = {s["ponto_inicio_id"]: s["ponto_fim_id"] for s in segs}
    start_node = pontas_ini[0]["ponto_inicio_id"] if pontas_ini else segs[0]["ponto_inicio_id"]

    segs_ordenados = []
    curr = start_node
    visitados_segs = set()
    while curr in adj_conf and curr not in visitados_segs:
        visitados_segs.add(curr)
        nxt = adj_conf[curr]
        segs_ordenados.append((curr, nxt))
        curr = nxt
        if curr == start_node:
            break

    if len(segs_ordenados) < len(segs):
        for s in segs:
            par = (s["ponto_inicio_id"], s["ponto_fim_id"])
            if par not in segs_ordenados:
                segs_ordenados.append(par)
    return segs_ordenados


def gerar_anexo_grafico_html(
    lev_id: int,
    matricula_id: int,
    confrontante_id: int,
    c_nome: str,
    c_matricula: str,
    rotulo_matricula: str = "Matrícula",
    num_matricula: str = None,
    contexto: dict | None = None,
    segmentos: list[dict] | None = None,
) -> tuple[str, dict]:
    """Gera o HTML da Página 2 (Anexo Gráfico) e os dados de coordenadas do Leaflet.
    `contexto` (poligonal da matrícula) e `segmentos` (do confrontante) podem vir pré-carregados pelo lote."""
    try:
        if contexto is None:
            contexto = _montar_contexto_mapa(lev_id, matricula_id)
        if not contexto:
            return "", {}
        pts_coords = contexto["pts_coords"]
        poligono_coords = contexto["poligono_coords"]
        zona_utm = contexto["zona_utm"]

        if len(poligono_coords) < 2:
            return "", {}

        if segmentos is None:
            segs = [dict(r) for r in execute_query(
                """
                SELECT s.id AS seg_id, s.ponto_inicio_id, s.ponto_fim_id
                FROM segmentos s
                WHERE s.levantamento_id = ? AND s.matricula_id = ? AND s.confrontante_id = ?
                ORDER BY s.id ASC
                """,
                params=(lev_id, matricula_id, confrontante_id),
                fetch_all=True
            )]
        else:
            segs = sorted(segmentos, key=lambda x: x.get("seg_id") or 0)
        if not segs:
            return "", {}

        segs_ordenados = _ordenar_segmentos_encadeados(segs)
        ext_ini_id = segs_ordenados[0][0]
        ext_fim_id = segs_ordenados[-1][1]

        lindeira_coords = []
        lindeira_pontos = []
        pts_vistos = set()

        for p_ini_id, p_fim_id in segs_ordenados:
            if p_ini_id in pts_coords and p_fim_id in pts_coords:
                lat1, lon1, nome1 = pts_coords[p_ini_id]
                lat2, lon2, nome2 = pts_coords[p_fim_id]

                lindeira_coords.append([[lat1, lon1], [lat2, lon2]])

                # O rótulo vai para um tooltip do Leaflet (HTML): escapa o nome do vértice.
                if p_ini_id not in pts_vistos:
                    exibir = (p_ini_id == ext_ini_id or p_ini_id == ext_fim_id)
                    lindeira_pontos.append({"coords": [lat1, lon1], "nome": esc(nome1), "exibir_nome": exibir})
                    pts_vistos.add(p_ini_id)
                if p_fim_id not in pts_vistos:
                    exibir = (p_fim_id == ext_ini_id or p_fim_id == ext_fim_id)
                    lindeira_pontos.append({"coords": [lat2, lon2], "nome": esc(nome2), "exibir_nome": exibir})
                    pts_vistos.add(p_fim_id)

        if not lindeira_coords:
            return "", {}

        map_id = f"map_confrontante_{int(confrontante_id)}"
        info_mat_requerente = (
            f" | {esc(rotulo_matricula)}: <strong class=\"text-slate-900\">{esc(num_matricula)}</strong>" if num_matricula else ""
        )

        html = f"""
<!-- ANEXO GRÁFICO - CROQUI DE LIMITES DE CONFRONTAÇÃO (PÁGINA 2) -->
<div class="page bg-white text-slate-800 pt-6 pb-6 px-12 max-w-[21cm] min-h-[29.7cm] w-full shadow-2xl border border-slate-200 rounded-xl print:rounded-none print:border-none print:shadow-none break-before-page print:break-before-page">
    <!-- CABEÇALHO DA EMPRESA -->
    <div class="flex flex-col items-center pb-1 mb-1.5 text-center border-b border-slate-100">
        <div class="text-2xl font-extrabold text-[#0c1510] tracking-wider uppercase mb-0.5">COMPLETA</div>
        <div class="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Agrimensura e Projetos Agropecuários LTDA</div>
    </div>

    <div class="text-center mb-4">
        <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wide">ANEXO GRÁFICO - CROQUI DE LIMITES</h2>
        <p class="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Confrontante: <strong class="text-slate-900">{esc(c_nome)}</strong> | Imóvel Confrontante: <strong class="text-slate-900">{esc(c_matricula)}</strong>{info_mat_requerente}</p>
    </div>

    <!-- Container do Mapa Leaflet -->
    <div id="{map_id}" class="w-full h-[580px] border border-slate-300 rounded-xl shadow-sm bg-slate-100 overflow-hidden relative break-inside-avoid">
        <!-- Indicador de Carregamento -->
        <div id="loader_{map_id}" class="absolute inset-0 flex items-center justify-center bg-white/70 z-[1000]">
            <div class="flex flex-col items-center gap-2">
                <svg class="animate-spin h-8 w-8 text-[#0284c7]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Carregando Imagens de Satélite...</span>
            </div>
        </div>
    </div>

    <!-- Legenda do Mapa -->
    <div class="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-around text-[10px] text-slate-600 font-bold uppercase tracking-wider break-inside-avoid">
        <div class="flex items-center gap-2">
            <div class="w-6 h-0.5 border-t-2 border-dashed border-[#94a3b8]"></div>
            <span>Limite Geral do Imóvel</span>
        </div>
        <div class="flex items-center gap-2">
            <div class="w-6 h-1 bg-[#0284c7] rounded"></div>
            <span class="text-[#0284c7]">Divisa Lindeira</span>
        </div>
        <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full border-[1.5px] border-[#0284c7] bg-white"></div>
            <span>Vértice de Divisa</span>
        </div>
    </div>

    <div class="mt-6 text-[8px] text-slate-400 text-justify leading-relaxed break-inside-avoid">
        * Este croqui possui caráter puramente ilustrativo para fins de anuência de divisa lindeira, não substituindo o memorial descritivo oficial de georreferenciamento nem as plantas técnicas aprovadas pelo INCRA/SIGEF. As coordenadas apresentadas baseiam-se na projeção UTM Zone {esc(zona_utm)}S sob o datum de referência SIRGAS 2000.
     </div>
</div>
<!-- FIM DE FOLHAS CONSOLIDADAS -->
        """

        map_data = {
            "id": map_id,
            "poligono": poligono_coords,
            "lindeira": lindeira_coords,
            "lindeira_pontos": lindeira_pontos
        }

        return Html(html), map_data
    except Exception as e:
        logger.warning(f"Falha ao gerar anexo gráfico para confrontante {confrontante_id}: {e}", exc_info=True)
        aviso = (
            '<div class="no-print print:hidden mt-4 p-3 rounded-lg border border-red-300 bg-red-50 text-red-700 text-xs font-bold">'
            f'Atenção: não foi possível gerar o croqui (anexo gráfico) do confrontante {int(confrontante_id)}. Verifique os vértices e divisas.'
            '</div>'
        )
        return Html(aviso), {}


# ── Textos coerentes com o gênero e o número de declarantes ─────────────────────────

def _termos_declarantes(plural: bool, genero_grupo: str | None) -> dict:
    if plural:
        declarantes = flex(genero_grupo, "Os declarantes", "As declarantes", "Os(As) declarantes")
        return {
            "suf_proprietario": flex(genero_grupo, "proprietários", "proprietárias", "proprietários(as)"),
            "suf_possuidor": flex(genero_grupo, "possuidores", "possuidoras", "possuidores(as)"),
            "suf_legitimo": flex(genero_grupo, "legítimos", "legítimas", "legítimos(as)"),
            "texto_declara": "DECLARAM",
            "texto_declarante": declarantes,
            "suf_m": "m",
            "texto_declaramos_ainda": "Declaramos ainda",
            "texto_concordam": f"{declarantes} concordam",
            "texto_reconhecem": "reconhecem",
        }
    declarante = flex(genero_grupo, "O declarante", "A declarante", "O(A) declarante")
    return {
        "suf_proprietario": flex(genero_grupo, "proprietário", "proprietária", "proprietário(a)"),
        "suf_possuidor": flex(genero_grupo, "possuidor", "possuidora", "possuidor(a)"),
        "suf_legitimo": flex(genero_grupo, "legítimo", "legítima", "legítimo(a)"),
        "texto_declara": "DECLARA",
        "texto_declarante": declarante,
        "suf_m": "",
        "texto_declaramos_ainda": "Declaro ainda",
        "texto_concordam": f"{declarante} concorda",
        "texto_reconhecem": "reconhece",
    }


def _rotulo_lote(c_lote, c_nome) -> str:
    """'Lote nº 5-A3' fica como está; '5-A3' vira 'Lote 5-A3'; igual ao nome do confrontante é omitido."""
    lote = valor_preenchido(c_lote)
    if not lote:
        return ""
    if re.sub(r"\s+", " ", lote).casefold() == re.sub(r"\s+", " ", valor_preenchido(c_nome)).casefold():
        return ""
    if re.match(r"^lote\b", lote, re.IGNORECASE):
        return lote
    return f"Lote {lote}"


def _nome_para_assinatura(valor):
    return valor_preenchido(valor)


def gerar_declaracao_anuencia_html(
    lev_id: int,
    matricula_id: int,
    confrontante_id: int,
    apenas_corpo: bool = False,
    dados_comuns: dict = None,
    retornar_map_data: bool = False,
    *,
    precarregado: dict | None = None,
    contexto_mapa: dict | None = None,
    validar_dispensa: bool = True,
) -> str | tuple[str, dict]:
    dados = dados_comuns if dados_comuns is not None else obter_dados_comuns(lev_id, matricula_id)
    mat_desenho_id = dados.get("matricula_desenho_id") or matricula_id

    if precarregado is None:
        precarregado = _prefetch_confrontantes(lev_id, mat_desenho_id, [confrontante_id])
    pre = precarregado.get(confrontante_id)
    if not pre or not pre.get("conf"):
        raise NaoEncontrado(f"Confrontante ID {confrontante_id} não encontrado para este levantamento.")
    conf = pre["conf"]
    coproprietarios = pre["coprops"]

    # Estrada/rio/ente público não é pessoa a qualificar: só gera se o usuário reexigiu a anuência.
    if validar_dispensa:
        with DatabaseManager() as conn:
            if not filtrar_exigem_anuencia(conn.cursor(), lev_id, [confrontante_id]):
                raise ErroDocumento(
                    f"Anuência dispensada: '{valor_preenchido(conf.get('nome')) or confrontante_id}' é ente público "
                    "(via/curso d'água); use 'Exigir' para gerar."
                )

    nome_lote = (dados["prop"].get("nome_propriedade") or dados["mat"].get("denominacao")) if dados.get("is_unificada") else (dados["mat"].get("denominacao") or dados["prop"].get("nome_propriedade"))
    comarca = str(dados["mat"].get("cri_comarca") or dados["prop"]["municipio"] or "").upper()
    proprietarios_html = descrever_proprietarios_curto(dados["owners"]) if dados["owners"] else Html("_" * 30)

    # Suporte a múltiplas matrículas e unificação territorial
    num_matricula_exibicao = dados.get("numeros_matricula_str") or str(dados["mat"].get("numero_matricula") or "")
    rotulo_matricula = dados.get("rotulo_matricula") or "Matrícula nº"
    clausula_unificacao = dados.get("clausula_unificacao_html") or ""
    plural_matriculas = "nºs" in rotulo_matricula
    objeto_matricula_html = Html(
        f"{'objeto das' if plural_matriculas else 'objeto da'} <strong>{esc(rotulo_matricula)} {esc(num_matricula_exibicao)}</strong>"
    )

    # Dados do Profissional para a Cláusula de Homologação (nunca "Não Informado" cravado: lacuna editável)
    nome_prof = valor_preenchido(dados["lev"].get("nome_profissional")) or "_" * 30
    registro_prof = valor_preenchido(dados["lev"].get("registro_profissional")) or "_" * 15
    conselho_prof = valor_preenchido(dados["lev"].get("conselho_profissional")) or "CFTA"
    credencial_incra = valor_preenchido(dados["lev"].get("codigo_credenciado")) or "_" * 15
    final_trt = valor_preenchido(dados["lev"].get("lev_numero_trt")) or LACUNA_TRT

    c_nome_raw = valor_preenchido(conf.get("nome"))
    c_nome_exib = c_nome_raw or "_" * 35
    c_matricula_raw = valor_preenchido(conf.get("matricula_imovel"))
    c_lote_raw = valor_preenchido(conf.get("lote"))

    # Qualificação do confrontante principal e dos coproprietários
    qualif_conf, info_conf = qualificar_pessoa(conf, rotulo_erro="O confrontante", regime_obrigatorio=True)
    qualificacoes = [qualif_conf]
    infos = [info_conf]
    for cp in coproprietarios:
        q_cp, info_cp = qualificar_pessoa(
            cp, rotulo_erro="O coproprietário", regime_obrigatorio=True, domicilio_padrao=conf.get("endereco_completo")
        )
        qualificacoes.append(q_cp)
        infos.append(info_cp)

    if len(qualificacoes) > 1:
        primeiros = "; ".join(qualificacoes[:-1])
        qualificacao_confrontante = Html(f"{primeiros}; e {qualificacoes[-1]}")
    else:
        qualificacao_confrontante = qualif_conf

    # Número e gênero dos declarantes (cônjuges também assinam)
    generos = []
    for info in infos:
        generos.append(info["genero"])
        if info["casal"]:
            generos.append(info["genero_conjuge"])
    plural = len(infos) > 1 or info_conf["casal"] or any(i["casal"] for i in infos)
    genero_grupo = genero_plural(generos) if plural else info_conf["genero"]
    termos = _termos_declarantes(plural, genero_grupo)
    if coproprietarios:
        termos["suf_proprietario"] = "proprietários e coproprietários em condomínio"
        termos["suf_possuidor"] = flex(genero_grupo, "possuidores", "possuidoras", "possuidores(as)")
        termos["suf_legitimo"] = flex(genero_grupo, "legítimos", "legítimas", "legítimos(as)")

    tabela_divisas_html = gerar_tabela_divisas_html(mat_desenho_id, confrontante_id, segmentos=pre["segs"])

    bloco_assinaturas = '<div class="mt-4 flex flex-row flex-wrap justify-around items-end gap-x-4 gap-y-4 w-full">'
    estilo_ass = dict(container="min-w-[170px] flex-1 max-w-[260px]", linha="mt-6 mb-1.5")

    # 1. Assinatura dos Proprietários Requerentes e Cônjuge (Imóvel que está sendo georreferenciado)
    for owner in dados["owners"]:
        g_owner = genero_normalizado(owner.get("genero"))
        bloco_assinaturas += assinatura_div(owner.get("nome_completo"), legenda_requerente(g_owner), **estilo_ass)
        if tem_conjuge(owner):
            bloco_assinaturas += assinatura_div(owner.get("nome_conjuge"), legenda_conjuge_requerente(owner, g_owner), **estilo_ass)

    # 2. Assinatura do Confrontante Anuente Principal
    if info_conf["pj"]:
        rotulo_conf_principal = "Confrontante Anuente (representante legal)"
    elif coproprietarios:
        rotulo_conf_principal = "Confrontante Anuente (Condômino)"
    else:
        rotulo_conf_principal = "Confrontante Anuente"
    bloco_assinaturas += assinatura_div(c_nome_raw, rotulo_conf_principal, **estilo_ass)
    if info_conf["casal"]:
        bloco_assinaturas += assinatura_div(info_conf["nome_conjuge"], "Cônjuge do Confrontante Anuente", **estilo_ass)

    # 3. Assinatura dos Coproprietários / Condôminos Extras
    for cp, info_cp in zip(coproprietarios, infos[1:]):
        bloco_assinaturas += assinatura_div(cp.get("nome"), "Coproprietário(a) Anuente", **estilo_ass)
        if info_cp["casal"]:
            bloco_assinaturas += assinatura_div(info_cp["nome_conjuge"], "Cônjuge do(a) Coproprietário(a) Anuente", **estilo_ass)

    bloco_assinaturas += "</div>"

    # Construção descritiva do imóvel confrontante (Lote / Matrícula)
    c_lote = _rotulo_lote(c_lote_raw, c_nome_raw)
    c_mat_exib = esc(c_matricula_raw) if c_matricula_raw else "_" * 24
    if c_lote and c_matricula_raw:
        imovel_confrontante_desc = f"denominada <strong>{esc(c_lote)}</strong>, registrada sob a <strong>Matrícula nº {c_mat_exib}</strong>"
        rotulo_confrontante_croqui = f"{c_lote} (Mat. {c_matricula_raw})"
    elif c_lote:
        imovel_confrontante_desc = f"denominada <strong>{esc(c_lote)}</strong>"
        rotulo_confrontante_croqui = c_lote
    else:
        imovel_confrontante_desc = f"registrada sob a <strong>Matrícula nº {c_mat_exib}</strong>"
        rotulo_confrontante_croqui = f"Mat. {c_matricula_raw or '_' * 12}"

    # Anexo gráfico (Página 2) e mapa Leaflet
    mapa_divisa_leaflet, map_data = gerar_anexo_grafico_html(
        lev_id, mat_desenho_id, confrontante_id, c_nome_exib, rotulo_confrontante_croqui,
        rotulo_matricula=rotulo_matricula, num_matricula=num_matricula_exibicao,
        contexto=contexto_mapa, segmentos=pre["segs"],
    )

    script_inicializacao_mapas = gerar_js_inicializacao_mapas([map_data]) if map_data else ""

    html_content = carregar_template("declaracao_anuencia.html")
    valores = {
        "c_nome": c_nome_exib,
        "municipio": dados["prop"].get("municipio") or "_____",
        "uf": uf_exibicao(dados["prop"].get("uf")),
        "data_extenso": obter_data_extenso(),
        "qualificacao_confrontante": qualificacao_confrontante,
        "c_matricula": c_matricula_raw,
        "c_lote": c_lote,
        "imovel_confrontante": Html(imovel_confrontante_desc),
        "nome_lote": nome_lote or "_" * 25,
        "proprietarios_str": proprietarios_html,
        "numero_matricula": num_matricula_exibicao,
        "rotulo_matricula": rotulo_matricula,
        "objeto_matricula_html": objeto_matricula_html,
        "clausula_unificacao": Html(clausula_unificacao),
        "comarca": comarca,
        "tabela_divisas_html": tabela_divisas_html,
        "mapa_divisa_leaflet": mapa_divisa_leaflet,
        "script_inicializacao_mapas": Html(script_inicializacao_mapas),
        "bloco_assinaturas": Html(bloco_assinaturas),
        "nome_profissional": nome_prof,
        "conselho_profissional": conselho_prof,
        "registro_profissional": registro_prof,
        "credencial_incra": credencial_incra,
        "final_trt": final_trt,
        **termos,
    }
    html_content = renderizar_template(html_content, valores)

    res_html = html_content
    if apenas_corpo:
        match = re.search(r'(<!-- INICIO CORPO CONSOLIDADO -->.*?<!-- FIM CORPO CONSOLIDADO -->)', html_content, re.DOTALL)
        if match:
            res_html = match.group(1)
        else:
            # Fallback robusto se os marcadores dedicados não forem encontrados
            match_fallback = re.search(r'(<!-- FOLHA A4 ESCRITÓRIO/CARTÓRIO -->.*)', html_content, re.DOTALL)
            if match_fallback:
                corpo_html = match_fallback.group(1)
                corpo_html = re.sub(r'<!-- SCRIPT DE INICIALIZAÇÃO DE MAPAS -->.*', '', corpo_html, flags=re.DOTALL)
                corpo_html = re.sub(r'<script.*', '', corpo_html, flags=re.DOTALL)
                corpo_html = re.sub(r'</body>.*', '', corpo_html, flags=re.DOTALL)
                res_html = corpo_html.strip()

    if retornar_map_data:
        return res_html, map_data
    return res_html


# ── Lote ─────────────────────────────────────────────────────────────────────────────

def _interpretar_ids(confrontantes_ids: str | None) -> list[int] | None:
    """None = todos. Item não numérico -> ErroDocumento (422): nada é descartado em silêncio."""
    if confrontantes_ids is None or not str(confrontantes_ids).strip():
        return None
    ids = []
    for token in str(confrontantes_ids).split(","):
        token = token.strip()
        if not token:
            continue
        if not token.isdigit():
            raise ErroDocumento(f"Lista de confrontantes_ids inválida: '{token[:20]}' não é um número inteiro.")
        ids.append(int(token))
    if not ids:
        return None
    return list(dict.fromkeys(ids))


def _confrontantes_do_perimetro(lev_id: int, mat_desenho_id: int) -> list[int]:
    """Confrontantes com divisa nesta matrícula, na ordem do perímetro (ordem_caminhamento do primeiro segmento)."""
    rows = execute_query(
        """
        SELECT s.confrontante_id AS cid,
               MIN(CASE WHEN pi.ordem_caminhamento IS NULL OR pi.ordem_caminhamento = 0 THEN 999999 ELSE pi.ordem_caminhamento END) AS ordem,
               MIN(s.id) AS primeiro_seg
        FROM segmentos s
        JOIN pontos pi ON pi.id = s.ponto_inicio_id
        WHERE s.levantamento_id = ? AND s.matricula_id = ? AND s.confrontante_id IS NOT NULL
        GROUP BY s.confrontante_id
        ORDER BY ordem ASC, primeiro_seg ASC
        """,
        params=(lev_id, mat_desenho_id),
        fetch_all=True
    )
    return [r["cid"] for r in rows]


def _nomes_confrontantes(lev_id: int, ids: list[int]) -> dict:
    if not ids:
        return {}
    rows = execute_query(
        f"""
        SELECT c.id, COALESCE(NULLIF(TRIM(c.nome), ''), p.nome) AS nome
        FROM confrontantes c LEFT JOIN pessoas p ON p.id = c.pessoa_id
        WHERE c.levantamento_id = ? AND c.id IN ({','.join('?' * len(ids))})
        """,
        params=tuple([lev_id] + ids), fetch_all=True
    )
    return {r["id"]: r["nome"] for r in rows}


def _banner_omitidos(omitidos: list[tuple], total_pedido: int, gerados: int) -> str:
    """Faixa vermelha (só na tela) no topo do lote: quem ficou de fora e por quê."""
    falhas = [o for o in omitidos if o[3] == "erro"]
    dispensadas = [o for o in omitidos if o[3] == "dispensa"]
    outros = [o for o in omitidos if o[3] == "fora"]
    if not omitidos:
        return ""

    def _li(o):
        cid, nome, motivo, _tipo = o
        return f"<li><strong>{esc(nome or 'Confrontante')}</strong> (ID {esc(cid)}): {esc(motivo)}</li>"

    partes = [
        '<div class="no-print print:hidden w-full max-w-[21cm] mb-4 p-4 rounded-xl border-2 border-red-400 bg-red-50 text-red-800 text-xs" '
        'id="aviso-anuencias-omitidas" role="alert">'
    ]
    if falhas:
        partes.append(
            f'<p class="font-bold uppercase tracking-wide mb-1">Atenção: lote incompleto — {gerados} anuência(s) gerada(s); '
            f'{len(falhas)} NÃO foi(ram) gerada(s):</p><ul class="list-disc pl-5 mb-2">{"".join(_li(o) for o in falhas)}</ul>'
        )
    if outros:
        partes.append(
            f'<p class="font-bold mb-1">Ids informados que não fazem parte desta matrícula (ignorados):</p>'
            f'<ul class="list-disc pl-5 mb-2">{"".join(_li(o) for o in outros)}</ul>'
        )
    if dispensadas:
        partes.append(
            f'<p class="font-bold mb-1">Anuência dispensada (ente público), não incluídos no lote:</p>'
            f'<ul class="list-disc pl-5">{"".join(_li(o) for o in dispensadas)}</ul>'
        )
    partes.append("</div>")
    return "".join(partes)


def gerar_declaracao_anuencia_lote_html(lev_id: int, matricula_id: int, confrontantes_ids: str = None) -> str:
    dados = obter_dados_comuns(lev_id, matricula_id)
    mat_desenho_id = dados.get("matricula_desenho_id") or matricula_id
    num_mat = str(dados.get("numeros_matricula_str") or dados["mat"].get("numero_matricula") or "SEM_MATRICULA")
    rotulo_mat = dados.get("rotulo_matricula") or "Matrícula nº"

    pedidos = _interpretar_ids(confrontantes_ids)  # 422 para item não numérico
    no_perimetro = _confrontantes_do_perimetro(lev_id, mat_desenho_id)
    omitidos: list[tuple] = []  # (id, nome, motivo, tipo)

    if pedidos is None:
        ids = list(no_perimetro)
    else:
        validos = set(no_perimetro)
        estranhos = [c for c in pedidos if c not in validos]
        nomes_estranhos = _nomes_confrontantes(lev_id, estranhos)
        for c in estranhos:
            omitidos.append((c, nomes_estranhos.get(c), "não possui divisa nesta matrícula", "fora"))
        ids = [c for c in no_perimetro if c in set(pedidos)]  # ordem do perímetro, não a do pedido

    if not ids:
        if omitidos:
            raise ErroDocumento(
                "Nenhum dos confrontantes informados possui divisa nesta matrícula: "
                + ", ".join(str(o[0]) for o in omitidos) + "."
            )
        raise ErroDocumento("Nenhum confrontante com limites definidos encontrado para esta matrícula.")

    # Vias e cursos d'água públicos têm a anuência dispensada: não entram no lote (mas aparecem no aviso).
    with DatabaseManager() as conn:
        exigem = filtrar_exigem_anuencia(conn.cursor(), lev_id, ids)
    dispensados = [c for c in ids if c not in set(exigem)]
    if dispensados:
        nomes = _nomes_confrontantes(lev_id, dispensados)
        for c in dispensados:
            omitidos.append((c, nomes.get(c), "anuência dispensada: ente público", "dispensa"))
    ids = exigem
    if not ids:
        raise ErroDocumento("Todos os confrontantes desta matrícula estão com a anuência dispensada (vias/cursos d'água públicos).")

    # Dados comuns carregados uma vez só (template em cache, poligonal, confrontantes/coproprietários/segmentos).
    template_base = carregar_template("declaracao_anuencia.html")
    contexto_mapa = _montar_contexto_mapa(lev_id, mat_desenho_id)
    precarregado = _prefetch_confrontantes(lev_id, mat_desenho_id, ids)

    corpos_paginas = []
    lista_mapas_data = []
    for c_id in ids:
        try:
            corpo, map_data = gerar_declaracao_anuencia_html(
                lev_id, matricula_id, c_id, apenas_corpo=True, dados_comuns=dados, retornar_map_data=True,
                precarregado=precarregado, contexto_mapa=contexto_mapa, validar_dispensa=False,
            )
            corpos_paginas.append(corpo)
            if map_data:
                lista_mapas_data.append(map_data)
        except ErroDocumento as e:
            nome = (precarregado.get(c_id) or {}).get("conf", {}) or {}
            logger.warning(f"Confrontante {c_id} omitido do lote de anuências: {e}")
            omitidos.append((c_id, nome.get("nome"), str(e), "erro"))
        except Exception as e:
            nome = (precarregado.get(c_id) or {}).get("conf", {}) or {}
            logger.exception(f"Erro inesperado ao gerar a anuência do confrontante {c_id} no lote")
            omitidos.append((c_id, nome.get("nome"), "erro interno ao gerar esta anuência (veja o log do servidor)", "erro"))

    if not corpos_paginas:
        detalhes = "; ".join(f"{o[1] or o[0]}: {o[2]}" for o in omitidos if o[3] == "erro")
        raise ErroDocumento(f"Não foi possível gerar nenhuma anuência para as confrontações indicadas. {detalhes}".strip())

    # Ajusta título e barra de ações
    template_base = template_base.replace(
        "<title>Declaração de Anuência do Confrontante - {c_nome}</title>",
        f"<title>Lote de Anuências - {esc(rotulo_mat)} {esc(num_mat)}</title>"
    )

    barra_lote_html = f"""<!-- BARRA_ACOES_INICIO -->
<div
    class="no-print print:hidden w-full max-w-[21cm] bg-[#0c1510] text-white py-4 px-6 mb-6 flex justify-between items-center rounded-xl border border-white/10 shadow-lg">
    <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-[#00f5a0]/10 border border-[#00f5a0]/30 rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="text-[#00f5a0] w-5 h-5" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
            </svg>
        </div>
        <div>
            <h4 class="text-sm font-bold text-white uppercase tracking-wider">Lote de Anuências do Confrontante</h4>
            <p class="text-[10px] text-white/40 mt-0.5">Múltiplos Termos de Respeito de Divisas ({esc(rotulo_mat)} {esc(num_mat)}) — {len(corpos_paginas)} termo(s)</p>
        </div>
    </div>
    <button onclick="window.print()"
        class="no-print print:hidden px-5 py-2 bg-[#00f5a0] hover:bg-[#00d48a] text-[#0c1510] font-bold rounded-lg shadow-md transition-all text-xs uppercase tracking-wider cursor-pointer">
        Imprimir Todos em Lote
    </button>
</div>
{_banner_omitidos(omitidos, len(ids), len(corpos_paginas))}
<!-- BARRA_ACOES_FIM -->"""

    template_base = re.sub(r'<!-- BARRA_ACOES_INICIO -->.*?<!-- BARRA_ACOES_FIM -->', lambda _m: barra_lote_html, template_base, flags=re.DOTALL)

    idx_corpo_ini = template_base.find("<!-- INICIO CORPO CONSOLIDADO -->")
    if idx_corpo_ini == -1:
        idx_corpo_ini = template_base.find("<!-- FOLHA A4 ESCRITÓRIO/CARTÓRIO -->")
    if idx_corpo_ini == -1:
        idx_corpo_ini = template_base.find("<div\n        class=\"page")

    header_html = template_base[:idx_corpo_ini]
    lote_corpos = "\n    <!-- FIM DE FOLHA / QUEBRA DE PÁGINA -->\n".join(corpos_paginas)

    # Gerar o JS de inicialização de todos os mapas consolidado
    script_inicializacao_mapas = gerar_js_inicializacao_mapas(lista_mapas_data) if lista_mapas_data else ""

    # O header já abre a tabela-moldura (.folha-print) do template (espaçadores de topo/base em cada folha): fecha aqui
    fecha_moldura = "\n</td></tr></tbody></table>" if 'class="folha-print' in header_html else ""
    footer_html = f"{fecha_moldura}\n{script_inicializacao_mapas}\n</body>\n</html>"

    return header_html + lote_corpos + footer_html


# ── Pré-visualização interativa da divisa ───────────────────────────────────────────────

def obter_preview_divisa_confrontante(lev_id: int, matricula_id: int, confrontante_id: int) -> dict:
    """Retorna os dados geométricos e cadastrais para a pré-visualização interativa do trecho da divisa a ser anuído."""
    from services.documentacao.cartorio.utils import calcular_azimute_e_distancia
    from pyproj import Geod

    dados = obter_dados_comuns(lev_id, matricula_id)
    mat_desenho_id = dados.get("matricula_desenho_id") or matricula_id
    num_matricula_exibicao = dados.get("numeros_matricula_str") or str(dados["mat"].get("numero_matricula") or "")
    nome_lote = (dados["prop"].get("nome_propriedade") or dados["mat"].get("denominacao")) if dados.get("is_unificada") else (dados["mat"].get("denominacao") or dados["prop"].get("nome_propriedade"))

    row_conf = execute_query(
        """
        SELECT c.id,
               COALESCE(p.nome, c.nome) AS nome,
               COALESCE(p.cpf_cnpj, c.cpf_cnpj) AS cpf_cnpj,
               COALESCE(p.rg, c.rg) AS rg,
               c.matricula_imovel,
               c.lote,
               COALESCE(p.endereco_completo, c.endereco_completo) AS endereco_completo
        FROM confrontantes c
        LEFT JOIN pessoas p ON c.pessoa_id = p.id
        WHERE c.id = ? AND c.levantamento_id = ?
        """,
        params=(confrontante_id, lev_id),
        fetch_one=True
    )
    if not row_conf:
        raise NaoEncontrado(f"Confrontante ID {confrontante_id} não encontrado para este levantamento.")
    conf = dict(row_conf)

    contexto = _montar_contexto_mapa(lev_id, mat_desenho_id)
    poligono_coords = contexto["poligono_coords"] if contexto else []

    # Segmentos do confrontante ordenados topologicamente (coordenadas CORRIGIDAS quando existirem, como o resto do documento)
    rows_segs = execute_query(
        """
        SELECT s.id, s.ponto_inicio_id, s.ponto_fim_id, s.tipo_limite_sigef, s.metodo_posicionamento_sigef,
               pi.nome_vertice as ini_nome, COALESCE(pi.lat_corrigido, pi.lat) as ini_lat, COALESCE(pi.lon_corrigido, pi.lon) as ini_lon,
               pi.ordem_caminhamento as ini_ordem,
               pf.nome_vertice as fim_nome, COALESCE(pf.lat_corrigido, pf.lat) as fim_lat, COALESCE(pf.lon_corrigido, pf.lon) as fim_lon
        FROM segmentos s
        JOIN pontos pi ON s.ponto_inicio_id = pi.id
        JOIN pontos pf ON s.ponto_fim_id = pf.id
        WHERE s.levantamento_id = ? AND s.matricula_id = ? AND s.confrontante_id = ?
        ORDER BY s.id ASC
        """,
        params=(lev_id, mat_desenho_id, confrontante_id),
        fetch_all=True
    )

    segs = [dict(r) for r in (rows_segs or [])]

    lindeira_coords = []
    lindeira_pontos = []
    segmentos_detalhados = []
    extensao_total = 0.0
    ext_ini_nome = "-"
    ext_fim_nome = "-"

    if segs:
        fins = {s["ponto_fim_id"] for s in segs}
        pontas_ini = [s for s in segs if s["ponto_inicio_id"] not in fins]

        adj_conf = {s["ponto_inicio_id"]: s for s in segs}
        start_seg = pontas_ini[0] if pontas_ini else segs[0]
        start_node = start_seg["ponto_inicio_id"]

        segs_ordenados = []
        curr = start_node
        visitados_segs = set()
        while curr in adj_conf and curr not in visitados_segs:
            visitados_segs.add(curr)
            s_obj = adj_conf[curr]
            segs_ordenados.append(s_obj)
            curr = s_obj["ponto_fim_id"]
            if curr == start_node:
                break

        if len(segs_ordenados) < len(segs):
            segs_restantes = [s for s in segs if s not in segs_ordenados]
            segs_ordenados.extend(segs_restantes)

        ext_ini_id = segs_ordenados[0]["ponto_inicio_id"]
        ext_fim_id = segs_ordenados[-1]["ponto_fim_id"]
        ext_ini_nome = segs_ordenados[0]["ini_nome"]
        ext_fim_nome = segs_ordenados[-1]["fim_nome"]

        pts_vistos = set()
        geod = Geod(ellps="GRS80")

        for s in segs_ordenados:
            p_ini_id = s["ponto_inicio_id"]
            p_fim_id = s["ponto_fim_id"]
            lat1 = s["ini_lat"]
            lon1 = s["ini_lon"]
            lat2 = s["fim_lat"]
            lon2 = s["fim_lon"]

            if lat1 is not None and lon1 is not None and lat2 is not None and lon2 is not None:
                lindeira_coords.append([[lat1, lon1], [lat2, lon2]])

                # Distância geodésica em metros
                _, _, dist_m = geod.inv(lon1, lat1, lon2, lat2)
                extensao_total += dist_m
                azimute_str, dist_str = calcular_azimute_e_distancia(lat1, lon1, lat2, lon2)

                segmentos_detalhados.append({
                    "id": s["id"],
                    "de": s["ini_nome"],
                    "para": s["fim_nome"],
                    "azimute": azimute_str,
                    "distancia_m": round(dist_m, 2),
                    "distancia_str": dist_str,
                    "tipo_limite": s.get("tipo_limite_sigef") or "Não especificado",
                    "metodo": s.get("metodo_posicionamento_sigef") or "Não especificado",
                    "ini_coords": [lat1, lon1],
                    "fim_coords": [lat2, lon2]
                })

            if p_ini_id not in pts_vistos and lat1 is not None and lon1 is not None:
                lindeira_pontos.append({
                    "id": p_ini_id,
                    "nome": s["ini_nome"],
                    "coords": [lat1, lon1],
                    "is_extremo": (p_ini_id == ext_ini_id or p_ini_id == ext_fim_id)
                })
                pts_vistos.add(p_ini_id)

            if p_fim_id not in pts_vistos and lat2 is not None and lon2 is not None:
                lindeira_pontos.append({
                    "id": p_fim_id,
                    "nome": s["fim_nome"],
                    "coords": [lat2, lon2],
                    "is_extremo": (p_fim_id == ext_ini_id or p_fim_id == ext_fim_id)
                })
                pts_vistos.add(p_fim_id)

    return {
        "confrontante": {
            "id": conf["id"],
            "nome": conf["nome"],
            "cpf_cnpj": formatar_cpf(conf.get("cpf_cnpj") or ""),
            "rg": formatar_rg(conf.get("rg") or ""),
            "matricula_imovel": conf.get("matricula_imovel") or "Não informada",
            "lote": conf.get("lote") or "",
            "endereco_completo": conf.get("endereco_completo") or "Não informado"
        },
        "imovel": {
            "id": mat_desenho_id,
            "nome": nome_lote,
            "matricula": num_matricula_exibicao,
            "municipio": dados["prop"].get("municipio") or "",
            "uf": dados["prop"].get("uf") or ""
        },
        "poligono_imovel": poligono_coords,
        "lindeira_coords": lindeira_coords,
        "lindeira_pontos": lindeira_pontos,
        "metricas": {
            "vertice_inicial": ext_ini_nome,
            "vertice_final": ext_fim_nome,
            "extensao_total_m": round(extensao_total, 2),
            "extensao_total_str": f"{extensao_total:.2f} m",
            "qtd_segmentos": len(segmentos_detalhados),
            "qtd_vertices": len(lindeira_pontos)
        },
        "segmentos": segmentos_detalhados
    }
