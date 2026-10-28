import logging
import shapefile
from pathlib import Path
from pyproj import Geod
from utils.transformer_cache import get_transformer
from database.connection import execute_query
from config import EXPORT_BASE_FOLDER

from services.documentacao.erros import ErroDocumento, NaoEncontrado
from services.documentacao.fronteira_arquivos import extrair_zip_seguro
from services.documentacao.cartorio.utils import (  # noqa: F401  (formatar_cpf/formatar_rg reexportados)
    Html,
    carregar_template,
    esc,
    estado_com_artigo,
    formatar_area_ha,
    formatar_cpf,
    formatar_data_br,
    formatar_numero_br,
    formatar_rg,
    nome_estado,
    obter_data_extenso,
    renderizar_template,
    uf_exibicao,
    valor_preenchido,
)
from services.documentacao.cartorio.data_fetcher import SQL_PROPRIETARIOS
from services.documentacao.cartorio.qualificacao import (
    assinatura_div,
    domicilio_do_proprietario,
    flex,
    genero_normalizado,
    genero_plural,
    qualificar_pessoa,
    tem_conjuge,
)

logger = logging.getLogger(__name__)

# Diretório base original dos templates definidos no Google Drive do usuário
ORIGINAL_TEMPLATES_DIR = Path(
    r"G:\.shortcut-targets-by-id\12gyUSmCZB9ndFe3-BOib0TWAYaaMTxaF\TRANSITO\Área de Fronteira\Modelos área de Fronteira"
)

# Coordenada fixada da Fronteira Internacional Brasil-Paraguai estabelecida constitucionalmente
BORDER_LAT = -24.0671222
BORDER_LON = -54.2868778

# Cache da leitura de shapefiles: (caminho, mtime, tamanho) -> (dist_km, lat, lon). O modal de fronteira pede a
# distância de TODAS as matrículas; sem cache cada uma relia o mesmo arquivo do disco.
_CACHE_SHAPEFILE: dict = {}
_CACHE_SHAPEFILE_MAX = 64


def medir_shapefile(shp_path: Path) -> tuple[float, float, float] | None:
    """Menor distância (km) do shapefile à fronteira e o ponto mais próximo. None se não houver pontos.
    Levanta exceção se o arquivo não puder ser lido (quem chama decide: validar upload x cair para o banco)."""
    shp_path = Path(shp_path)
    st = shp_path.stat()
    chave = (str(shp_path), st.st_mtime_ns, st.st_size)
    if chave in _CACHE_SHAPEFILE:
        return _CACHE_SHAPEFILE[chave]

    with shapefile.Reader(str(shp_path)) as sf:
        menor_dist = float('inf')
        ponto_mais_proximo = (0.0, 0.0)

        # Instancia transformador UTM Zone 22S (EPSG:31982) -> SIRGAS 2000 (EPSG:4674)
        transformer = get_transformer("epsg:31982", "epsg:4674", always_xy=True)
        geod = Geod(ellps="GRS80")
        pontos_lidos = 0

        for shape in sf.shapes():
            for pt in shape.points:
                x, y = pt[0], pt[1]
                # Eliminação de qualquer aproximação plana euclidiana (forçando elipsóide GRS80)
                if abs(x) > 180 or abs(y) > 90:
                    lon, lat = transformer.transform(x, y)
                else:
                    lon, lat = x, y

                _, _, dist_m = geod.inv(lon, lat, BORDER_LON, BORDER_LAT)
                dist_k = dist_m / 1000.0
                pontos_lidos += 1

                if dist_k < menor_dist:
                    menor_dist = dist_k
                    ponto_mais_proximo = (lat, lon)

    resultado = (menor_dist, ponto_mais_proximo[0], ponto_mais_proximo[1]) if pontos_lidos > 0 else None
    if len(_CACHE_SHAPEFILE) >= _CACHE_SHAPEFILE_MAX:
        _CACHE_SHAPEFILE.clear()
    _CACHE_SHAPEFILE[chave] = resultado
    return resultado


def _pasta_shapefile(propriedade_id: int, matricula_id: int = None) -> Path:
    base = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{propriedade_id}" / "Shapefile_Fronteira"
    if matricula_id:
        pasta_mat = base / f"Matricula_{matricula_id}"
        if pasta_mat.is_dir() and any(pasta_mat.glob("*.zip")) or (pasta_mat.is_dir() and any(pasta_mat.glob("*.shp"))):
            return pasta_mat
    return base


def calcular_menor_distancia_fronteira(propriedade_id: int, matricula_id: int = None) -> tuple[float, float, float]:
    """
    Retorna (distancia_km, lat_ponto, lon_ponto) representando o ponto do imóvel mais próximo da fronteira.

    1. Procura na pasta física de Shapefile da propriedade (específica da matrícula ou geral).
       Se encontrar um .zip, descompacta (extração segura: só arquivos de shapefile, com limites).
       Lê os arquivos .shp usando pyshp.
       Detecta se as coordenadas estão em UTM e converte se necessário para SIRGAS 2000 (EPSG:4674).
    2. Se não houver Shapefile, busca base geodésica M no banco associada a levantamentos da propriedade.
    3. Se não houver nada, levanta ErroDocumento (422).
    """
    folder_shp = _pasta_shapefile(propriedade_id, matricula_id)

    # Se a pasta existe, processa arquivos contidos nela
    if folder_shp.exists():
        # Se houver zip e nenhum shp, extrai primeiro
        zips = list(folder_shp.glob("*.zip"))
        shps = list(folder_shp.glob("*.shp"))

        if zips and not shps:
            for z in zips:
                try:
                    extrair_zip_seguro(z, folder_shp)
                    logger.info(f"[FRONTEIRA] Shapefile zip {z.name} extraído com sucesso na pasta.")
                except Exception as ze:
                    logger.error(f"[FRONTEIRA] Erro ao extrair zip {z.name}: {ze}")
            shps = list(folder_shp.glob("*.shp"))

        if shps:
            shp_path = shps[0]
            logger.info(f"[FRONTEIRA] Lendo Shapefile: {shp_path}")
            try:
                resultado = medir_shapefile(shp_path)
                if resultado is not None:
                    logger.info(f"[FRONTEIRA] Menor distância a partir do Shapefile: {resultado[0]:.3f} km")
                    return resultado
            except Exception as se:
                logger.error(f"[FRONTEIRA] Erro ao processar Shapefile {shp_path.name}: {se}")

    # Caso não tenha Shapefile ou tenha ocorrido erro, busca pontos geodésicos no banco.
    # REGRA 8 gemini.md: A distância deve ser calculada a partir da base do levantamento
    # (ponto tipo 'B' ativo, prioritariamente CORRIGIDO) usando pyproj.Geod(ellps="GRS80").
    # 'M' é marco de divisa, não base: sem base cadastrada, cai no fallback de todos os pontos.
    params_m = [propriedade_id]
    query_base_m = """
        SELECT p.lat, p.lon, p.lat_corrigido, p.lon_corrigido, p.nome_vertice, p.tipo_ponto, p.matricula_id, l.status
        FROM pontos p
        JOIN levantamentos l ON p.levantamento_id = l.id
        WHERE l.propriedade_id = ? AND p.tipo_ponto = 'B'
          AND p.lat IS NOT NULL AND p.lon IS NOT NULL
          AND p.lat != 0.0 AND p.lon != 0.0
    """
    if matricula_id:
        query_base_m += " ORDER BY (p.matricula_id = ?) DESC, l.status = 'EM_ANDAMENTO' DESC, (p.status_ponto = 'CORRIGIDO') DESC, p.id ASC"
        params_m.append(matricula_id)
    else:
        query_base_m += " ORDER BY l.status = 'EM_ANDAMENTO' DESC, (p.status_ponto = 'CORRIGIDO') DESC, p.id ASC"

    rows = execute_query(query_base_m, params=tuple(params_m), fetch_all=True)

    # Se não houver pontos tipo 'B', fallback para qualquer ponto do levantamento com coordenadas válidas
    if not rows:
        logger.warning("[FRONTEIRA] Nenhum ponto tipo 'B' (base) encontrado. Usando fallback com todos os pontos válidos.")
        params_fb = [propriedade_id]
        query_fallback = """
            SELECT p.lat, p.lon, p.lat_corrigido, p.lon_corrigido, p.nome_vertice, p.tipo_ponto, p.matricula_id, l.status
            FROM pontos p
            JOIN levantamentos l ON p.levantamento_id = l.id
            WHERE l.propriedade_id = ?
              AND p.lat IS NOT NULL AND p.lon IS NOT NULL
              AND p.lat != 0.0 AND p.lon != 0.0
        """
        if matricula_id:
            query_fallback += " ORDER BY (p.matricula_id = ?) DESC, l.status = 'EM_ANDAMENTO' DESC, (p.status_ponto = 'CORRIGIDO') DESC, p.id ASC"
            params_fb.append(matricula_id)
        else:
            query_fallback += " ORDER BY l.status = 'EM_ANDAMENTO' DESC, (p.status_ponto = 'CORRIGIDO') DESC, p.id ASC"
        rows = execute_query(query_fallback, params=tuple(params_fb), fetch_all=True)

    if rows:
        geod = Geod(ellps="GRS80")
        menor_dist = float('inf')
        coord_referencia = (0.0, 0.0)

        for row in rows:
            base = dict(row)
            lat = base["lat_corrigido"] if base["lat_corrigido"] is not None else base["lat"]
            lon = base["lon_corrigido"] if base["lon_corrigido"] is not None else base["lon"]
            if lat and lon:
                try:
                    _, _, dist_m = geod.inv(float(lon), float(lat), BORDER_LON, BORDER_LAT)
                    dist_k = dist_m / 1000.0
                    if dist_k < menor_dist:
                        menor_dist = dist_k
                        coord_referencia = (lat, lon)
                except Exception as e_geod:
                    logger.warning(f"[FRONTEIRA] Erro ao calcular distância geodésica para ponto '{base.get('nome_vertice')}': {e_geod}")
                    continue

        if menor_dist != float('inf'):
            logger.info(f"[FRONTEIRA] Calculada menor distância a partir dos pontos do Banco: {menor_dist:.3f} km")
            return menor_dist, coord_referencia[0], coord_referencia[1]

    raise ErroDocumento(
        "A propriedade selecionada não possui arquivos Shapefile enviados nem pontos geodésicos "
        "no banco de dados. Por favor, envie o Shapefile da área ou cadastre a base (tipo B) para calcular a distância."
    )


# ── Peças da faixa de fronteira ──────────────────────────────────────────────────────

def _aviso_modelo_uf(uf) -> Html:
    """O modelo de laudo/requerimento de ratificação cita o Código de Normas do TJ-PR e a Justiça Federal da 4ª Região.
    Fora do Paraná, a fundamentação precisa de revisão: aviso visível só na tela."""
    uf_txt = valor_preenchido(uf).upper()
    if uf_txt == "PR":
        return Html("")
    return Html(
        '<div class="no-print print:hidden w-full max-w-[21cm] mb-4 p-3 rounded-lg border-2 border-red-400 bg-red-50 text-red-800 text-xs font-bold" role="alert">'
        f'Atenção: este modelo cita o Código de Normas da Corregedoria-Geral da Justiça do Estado do Paraná (arts. 656-BU/656-BV) e a Justiça Federal da 4ª Região. '
        f'O imóvel está em {esc(uf_txt or "UF não informada")}: revise a fundamentação normativa e as certidões antes de protocolar.</div>'
    )


def _carregar_contexto_fronteira(lev_id: int, matricula_id: int, campos_prof: str) -> tuple[dict, dict, dict]:
    row_lev = execute_query(
        f"""
        SELECT l.propriedade_id, l.profissional_id, {campos_prof}
        FROM levantamentos l
        JOIN profissionais p ON l.profissional_id = p.id
        WHERE l.id = ?
        """,
        params=(lev_id,), fetch_one=True
    )
    if not row_lev:
        raise NaoEncontrado(f"Levantamento ID {lev_id} não encontrado.")
    lev_data = dict(row_lev)
    propriedade_id = lev_data["propriedade_id"]

    row_prop = execute_query(
        "SELECT id, nome_propriedade, municipio, uf, codigo_car, codigo_ccir FROM propriedades WHERE id = ?",
        params=(propriedade_id,), fetch_one=True
    )
    if not row_prop:
        raise NaoEncontrado(f"Propriedade com ID {propriedade_id} não encontrada.")
    prop_data = dict(row_prop)

    row_mat = execute_query(
        """
        SELECT m.id, m.numero_matricula, pr.codigo_ccir as ccir, m.itr, m.area_ha, m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro,
               m.valor_itr, m.denominacao, m.georreferenciamento
        FROM matriculas m
        JOIN propriedades pr ON m.propriedade_id = pr.id
        WHERE m.id = ? AND m.propriedade_id = ?
        """,
        params=(matricula_id, propriedade_id), fetch_one=True
    )
    if not row_mat:
        raise NaoEncontrado(f"Matrícula com ID {matricula_id} não encontrada para a propriedade correspondente.")
    return lev_data, prop_data, dict(row_mat)


def _proprietarios_da_propriedade(propriedade_id: int) -> list[dict]:
    rows = execute_query(SQL_PROPRIETARIOS, params=(propriedade_id,), fetch_all=True)
    return [dict(r) for r in rows]


def _owner_texto(owner: dict) -> dict:
    return {**owner, "endereco_completo": domicilio_do_proprietario(owner)}


def _percentual_str(percentual, total_owners: int) -> str:
    """'50%', '33,33%'; sem percentual cadastrado só se presume 100% quando há um único proprietário."""
    if percentual is None:
        return "100%" if total_owners == 1 else "____%"
    try:
        valor = float(percentual)
    except (TypeError, ValueError):
        return "____%"
    return f"{int(valor)}%" if valor % 1 == 0 else f"{formatar_numero_br(valor, 2)}%"


class BorderAreaReportGenerator:
    @staticmethod
    def gerar_laudo_fronteira_html(lev_id: int, matricula_id: int, numero_trt: str, data_trt: str) -> str:
        """Gera a string HTML correspondente ao Laudo Técnico de Faixa de Fronteira.
        Número da TRT é obrigatório (422 se vazio); a data é opcional (lacuna) mas, se informada, deve ser válida."""
        numero = valor_preenchido(numero_trt)
        if not numero:
            raise ErroDocumento("Informe o número da TRT para gerar o laudo de faixa de fronteira.")
        data_trt_formatada = formatar_data_br(data_trt, "Data de quitação da TRT")

        lev_data, prop_data, mat_data = _carregar_contexto_fronteira(
            lev_id, matricula_id,
            """p.nome as nome_profissional, p.registro as registro_profissional,
               p.codigo_credenciado, p.formacao as formacao_profissional, p.conselho as conselho_profissional,
               p.nacionalidade as nacionalidade_profissional, p.cpf as cpf_profissional, p.rg as rg_profissional,
               p.endereco_residencial as endereco_residencial_profissional, p.endereco as endereco_profissional"""
        )
        propriedade_id = lev_data["propriedade_id"]

        owners = _proprietarios_da_propriedade(propriedade_id)
        if not owners:
            raise ErroDocumento("Não há proprietários vinculados a esta propriedade. Cadastre o proprietário primeiro.")

        # Cálculo Elipsoidal Determinístico da Distância
        dist_km, _, _ = calcular_menor_distancia_fronteira(propriedade_id, matricula_id)

        lacuna = "_" * 20
        nome_prof = valor_preenchido(lev_data.get("nome_profissional")) or "_____"
        nac_prof = valor_preenchido(lev_data.get("nacionalidade_profissional")) or "brasileiro(a)"
        formacao_prof = valor_preenchido(lev_data.get("formacao_profissional")) or "Responsável Técnico"
        cpf_prof = formatar_cpf(lev_data.get("cpf_profissional")) or lacuna
        rg_prof_raw = valor_preenchido(lev_data.get("rg_profissional"))
        if rg_prof_raw:
            rg_prof = formatar_rg(rg_prof_raw)
            trecho_rg_prof = Html(f', portador da Carteira de Identidade RG nº <strong class="text-slate-900">{esc(rg_prof)}</strong>')
        else:
            rg_prof = ""
            trecho_rg_prof = Html("")
        conselho_prof = valor_preenchido(lev_data.get("conselho_profissional"))
        registro_prof = valor_preenchido(lev_data.get("registro_profissional"))

        if conselho_prof:
            if conselho_prof.lower() in registro_prof.lower():
                conselho_exibicao = registro_prof
            else:
                conselho_exibicao = f"{conselho_prof} {registro_prof}".strip()
        else:
            conselho_exibicao = registro_prof or lacuna

        end_residencial_prof = valor_preenchido(lev_data.get("endereco_residencial_profissional")) or lacuna
        end_comercial_prof = valor_preenchido(lev_data.get("endereco_profissional")) or lacuna
        municipio_cartorio = valor_preenchido(mat_data.get('cri_comarca')) or prop_data['municipio']
        uf = uf_exibicao(prop_data.get("uf"))

        # Seção 2: todos os proprietários, com qualificação por gênero real e o percentual de cada um
        partes = []
        for owner in owners:
            qualif, info = qualificar_pessoa(_owner_texto(owner), rotulo_erro="O proprietário")
            g = info["genero"]
            este = flex(g, "este detentor", "esta detentora", "este(a) detentor(a)") if not info["pj"] else "esta detentora"
            partes.append(
                f'{qualif}, {este} de <strong class="text-slate-900">{esc(_percentual_str(owner.get("percentual_participacao"), len(owners)))}</strong> da propriedade'
            )
        texto_secao2 = Html(";<br>".join(partes) + ":")

        nome_lote = mat_data.get("denominacao") or prop_data['nome_propriedade']
        texto_secao3 = (
            f"imóvel rural denominado <strong class=\"text-slate-900\">{esc(nome_lote)}</strong>, matrícula nº "
            f"<strong class=\"text-slate-900\">{esc(valor_preenchido(mat_data.get('numero_matricula')) or '_____')}</strong>, "
            f"localizado no município de <strong class=\"text-slate-900\">{esc(prop_data['municipio'])}/{esc(uf)}</strong>, "
            f"Comarca de <strong class=\"text-slate-900\">{esc(municipio_cartorio)}</strong>, "
            f"com área de <strong class=\"text-slate-900\">{esc(formatar_area_ha(mat_data.get('area_ha')))} hectares</strong>."
        )

        template = carregar_template("laudo_fronteira.html")
        return renderizar_template(template, {
            "nome_lote": nome_lote,
            "aviso_modelo_html": _aviso_modelo_uf(prop_data.get("uf")),
            "nome_prof": nome_prof,
            "nac_prof": nac_prof,
            "formacao_prof": formacao_prof,
            "cpf_prof": cpf_prof,
            "rg_prof": rg_prof,
            "trecho_rg_prof": trecho_rg_prof,
            "conselho_exibicao": conselho_exibicao,
            "end_residencial_prof": end_residencial_prof,
            "end_comercial_prof": end_comercial_prof,
            "texto_secao2": texto_secao2,
            "texto_secao3": Html(texto_secao3),
            "dist_km": f"{dist_km:.3f}",
            "numero_trt": numero,
            "data_trt_formatada": data_trt_formatada,
            "municipio_cartorio": municipio_cartorio,
            "municipio": prop_data["municipio"] or "_____",
            "uf": uf,
            "data_hoje_extenso": obter_data_extenso(),
        })

    @staticmethod
    def gerar_requerimento_ratificacao_html(lev_id: int, matricula_id: int) -> str:
        """Gera a string HTML correspondente ao Requerimento de Ratificação de Fronteira"""
        lev_data, prop_data, mat_data = _carregar_contexto_fronteira(
            lev_id, matricula_id, "p.nome as nome_profissional, p.registro as registro_profissional, p.codigo_credenciado"
        )
        propriedade_id = lev_data["propriedade_id"]

        owners = _proprietarios_da_propriedade(propriedade_id)
        if not owners:
            raise ErroDocumento("Não há proprietários vinculados a esta propriedade.")

        qualificacoes = []
        infos = []
        for owner in owners:
            qualif, info = qualificar_pessoa(_owner_texto(owner), rotulo_erro="O proprietário")
            qualificacoes.append(qualif)
            infos.append(info)

        total_owners = len(owners)
        any_casado = any(i["casal"] for i in infos)
        uf = uf_exibicao(prop_data.get("uf"))
        municipio = prop_data.get("municipio") or "_____"
        comarca_exibicao = str(valor_preenchido(mat_data.get('cri_comarca')) or municipio).upper()
        ccir_exibicao = valor_preenchido(mat_data.get('ccir')) or valor_preenchido(prop_data.get('codigo_ccir')) or "_" * 20
        nome_lote = mat_data.get("denominacao") or prop_data['nome_propriedade']
        area_str = formatar_area_ha(mat_data.get("area_ha"))
        num_mat = valor_preenchido(mat_data.get("numero_matricula")) or "_____"

        generos = []
        for i in infos:
            generos.append(i["genero"])
            if i["casal"]:
                generos.append(i["genero_conjuge"])

        if total_owners == 1 and not any_casado:
            g1 = infos[0]["genero"]
            pron_prop_final = flex(g1, "legítimo proprietário", "legítima proprietária", "legítimo(a) proprietário(a)")
            qualificacao_completa = qualificacoes[0]
            verbo = "vem"
        else:
            if total_owners == 1:
                qualificacao_completa = qualificacoes[0]
            else:
                primeiros = ";<br>".join(qualificacoes[:-1])
                qualificacao_completa = f"{primeiros};<br>e {qualificacoes[-1]}"
            pron_prop_final = flex(genero_plural(generos), "legítimos proprietários", "legítimas proprietárias", "legítimos(as) proprietários(as)")
            verbo = "vêm"

        texto_requerimento = (
            f"{qualificacao_completa}, na qualidade de {pron_prop_final}, {verbo} requerer e autorizar, nos termos da Lei nº 13.178/2015, "
            f"bem como nos arts. 656-BU e seguintes do Código de Normas da Corregedoria-Geral da Justiça do Estado do Paraná, "
            f"a ratificação do imóvel situado em faixa de fronteira, denominado <strong class=\"text-slate-900\">{esc(nome_lote)}</strong>, "
            f"com área de <strong class=\"text-slate-900\">{esc(area_str)} ha</strong>, localizado no município de {esc(municipio)}/{esc(uf)}, "
            f"objeto da matrícula nº <strong class=\"text-slate-900\">{esc(num_mat)}</strong> do Registro de Imóveis da Comarca de {esc(comarca_exibicao)}, "
            f"inscrito no CCIR/INCRA sob o nº <strong class=\"text-slate-900\">{esc(ccir_exibicao)}</strong>."
        )

        # Assinaturas no rodapé
        ass = dict(container="min-w-[240px] flex-1 max-w-[280px]", linha="mt-8 mb-2",
                   nome_cls="text-xs font-bold text-slate-900 text-center uppercase tracking-wide",
                   legenda_cls="text-[10px] text-slate-500 text-center font-medium mt-0.5")
        bloco_assinaturas_html = '<div class="mt-6 pt-2 flex flex-row flex-wrap justify-around gap-x-8 gap-y-8 w-full">'
        for owner, info in zip(owners, infos):
            legenda = flex(info["genero"], "Requerente Proprietário", "Requerente Proprietária", "Requerente Proprietário(a)")
            bloco_assinaturas_html += assinatura_div(owner.get("nome_completo"), legenda, **ass)
            if info["casal"]:
                bloco_assinaturas_html += assinatura_div(info["nome_conjuge"], "Requerente Cônjuge", **ass)
        bloco_assinaturas_html += "</div>"

        # Valor venal / ITR
        valor_venal_itr = mat_data.get("valor_itr")
        if valor_venal_itr is not None:
            valor_venal_itr_str = formatar_numero_br(valor_venal_itr, 2, vazio=str(valor_venal_itr))
        else:
            valor_venal_itr_str = valor_preenchido(mat_data.get("itr")) or "_" * 20

        # Injeção condicional do item X (SIGEF/INCRA) baseado em limite de 200 hectares
        codigo_sigef_exibicao = valor_preenchido(mat_data.get("georreferenciamento")) or "_" * 20
        exibir_sigef = (mat_data.get("area_ha") or 0.0) >= 200.0
        bloco_sigef_html = ""
        if exibir_sigef:
            bloco_sigef_html = f"""
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">X -</span>
                        <span>Certificação obtida junto ao SIGEF/INCRA código nº <strong class="text-slate-800 font-mono">{esc(codigo_sigef_exibicao)}</strong>.</span>
                    </div>
            """

        template = carregar_template("requerimento_ratificacao.html")
        return renderizar_template(template, {
            "nome_lote": nome_lote,
            "aviso_modelo_html": _aviso_modelo_uf(prop_data.get("uf")),
            "comarca_exibicao": comarca_exibicao,
            "estado_nome": (nome_estado(prop_data.get("uf")) or "UF NÃO INFORMADA").upper(),
            "texto_requerimento": Html(texto_requerimento),
            "valor_venal_itr_str": valor_venal_itr_str,
            "municipio": municipio,
            "uf": uf,
            "bloco_sigef_html": Html(bloco_sigef_html),
            "bloco_assinaturas_html": Html(bloco_assinaturas_html),
            "data_hoje_extenso": obter_data_extenso(),
        })
