import logging
import re

from services.documentacao.erros import ErroDocumento, NaoEncontrado
from services.documentacao.cartorio.utils import (
    Html,
    LACUNA_DATA,
    carregar_template,
    esc,
    estado_com_artigo,
    extenso_parcelas,  # noqa: F401  (reexportado: usado por testes e rotas)
    formatar_area_ha,
    formatar_cpf,
    formatar_data_br,
    formatar_numero_br,
    formatar_regime_bens_extenso,  # noqa: F401  (reexportado: único formatador de regime de bens)
    formatar_rg,
    json_para_script,
    obter_data_extenso,
    renderizar_template,
    resolver_trt,
    uf_exibicao,
    valor_preenchido,
)
from services.documentacao.cartorio.data_fetcher import (
    obter_dados_comuns,
    obter_dados_matricula_sem_levantamento,
)
from services.documentacao.cartorio.qualificacao import (
    assinatura_div,
    domicilio_do_proprietario,
    flex,
    flexionar_nacionalidade,
    genero_conjuge_efetivo,
    genero_normalizado,
    genero_plural,
    legenda_requerente,
    qualificacao_resumida,
    qualificar_pessoa,
    tem_conjuge,
)
from database.connection import execute_query

logger = logging.getLogger(__name__)


# ── Helpers comuns ────────────────────────────────────────────────────────────────────

def _municipio(dados: dict) -> str:
    return valor_preenchido(dados["prop"].get("municipio")) or "_____"


def _uf(dados: dict) -> str:
    return uf_exibicao(dados["prop"].get("uf"))


def _comarca(dados: dict) -> str:
    return str(valor_preenchido(dados["mat"].get("cri_comarca")) or valor_preenchido(dados["prop"].get("municipio")) or "_____").upper()


def _mats(dados: dict) -> list:
    """Matrículas do documento: o grupo unificado, ou a matrícula individual."""
    return dados["grupo_matriculas"] if dados.get("is_unificada") else [dados["mat"]]


def _num_mat(m: dict) -> str:
    return valor_preenchido(m.get("numero_matricula")) or "_____"


def _lista_mats_str(dados: dict, mats: list) -> str:
    nums = [_num_mat(m) for m in mats]
    return dados.get("numeros_matricula_str") or (" e ".join(nums) if len(nums) == 2 else ", ".join(nums))


def _nome_lote_unificado(dados: dict, lista_mats_str: str) -> str:
    rotulo_mat = dados.get("rotulo_matricula") or "Matrículas nºs"
    return f"{dados['prop']['nome_propriedade']} ({dados.get('denominacoes_str') or 'Glebas Unificadas'} - {rotulo_mat} {lista_mats_str})"


def _area_total(mats: list) -> float | None:
    areas = [float(m["area_ha"]) for m in mats if m.get("area_ha") is not None]
    return sum(areas) if areas else None


def _owner_texto(owner: dict) -> dict:
    return {**owner, "endereco_completo": domicilio_do_proprietario(owner)}


def _nome_prof(dados: dict) -> str:
    return valor_preenchido(dados["lev"].get("nome_profissional")) or "_____"


def _conselho_exibicao(dados: dict) -> str:
    conselho = valor_preenchido(dados["lev"].get("conselho_profissional")) or "CFTA"
    registro = valor_preenchido(dados["lev"].get("registro_profissional")) or "_____"
    return f"{conselho} nº {registro}"


def _trt_do_levantamento(dados: dict, numero_trt, data_trt) -> tuple[str, str]:
    return resolver_trt(numero_trt, data_trt, dados["lev"].get("lev_numero_trt"), dados["lev"].get("lev_data_trt"))


# ── Requerimento ao Registro de Imóveis ──────────────────────────────────────────────

def gerar_requerimento_cartorio_html(lev_id: int, matricula_id: int, numero_trt: str = None, data_trt: str = "") -> str:
    dados = obter_dados_comuns(lev_id, matricula_id)

    # Fallback para os dados persistidos no levantamento; data informada em formato inválido -> 422
    final_trt, data_trt_f = _trt_do_levantamento(dados, numero_trt, data_trt)

    qualificacoes = []
    for owner in dados["owners"]:
        qualif, _info = qualificar_pessoa(_owner_texto(owner), rotulo_erro="O proprietário")
        qualificacoes.append(qualif)
    qualificacao_completa = Html(";<br>".join(qualificacoes) if qualificacoes else "_" * 40)

    mats = _mats(dados)
    comarca = _comarca(dados)
    municipio_uf = f"{esc(_municipio(dados))}/{esc(_uf(dados))}"

    # Se houver múltiplas matrículas, consolidamos os dados em uma tabela
    if len(mats) > 1:
        linhas_tabela = ""
        for m in mats:
            sigef_m = valor_preenchido(m.get("georreferenciamento")) or "Não Certificado"
            denominacao_m = m.get("denominacao") or dados["prop"]["nome_propriedade"]
            linhas_tabela += f"""
            <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700 hover:bg-slate-50/50 transition-colors">
                <td class="px-3 py-2 font-bold text-slate-900">{esc(denominacao_m)}</td>
                <td class="px-3 py-2 text-center font-semibold">{esc(_num_mat(m))}</td>
                <td class="px-3 py-2 text-right">{esc(formatar_area_ha(m.get("area_ha")))} ha</td>
                <td class="px-3 py-2 text-center text-[9px]">{esc(sigef_m)}</td>
            </tr>
            """

        area_total_str = formatar_area_ha(_area_total(mats))
        lista_mats_str = _lista_mats_str(dados, mats)
        nome_lote = _nome_lote_unificado(dados, lista_mats_str)

        itens_iniciais_requerimento_html = f"""
            <li class="flex items-start gap-2">
                <span class="font-bold text-slate-900">1.</span>
                <span class="w-full">Os requerentes são os legítimos proprietários e possuidores dos imóveis rurais contíguos situados no município de <strong class="text-slate-900">{municipio_uf}</strong>, denominados e caracterizados conforme a tabela de glebas abaixo descrita, as quais formam uma <strong>gleba territorial contínua e unificada</strong>:

                    <div class="overflow-x-auto mt-3 border border-slate-200 rounded-lg shadow-sm w-full break-inside-avoid">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 border-b border-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                                    <th class="px-3 py-2">Denominação (Gleba)</th>
                                    <th class="px-3 py-2 text-center">Matrícula Originária</th>
                                    <th class="px-3 py-2 text-right">Área Registrada</th>
                                    <th class="px-3 py-2 text-center">Certificação SIGEF (Código)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                {linhas_tabela}
                            </tbody>
                        </table>
                    </div>
                </span>
            </li>

            <li class="flex items-start gap-2 mt-4">
                <span class="font-bold text-slate-900">2.</span>
                <span>As referidas áreas contíguas, somadas, perfazem uma extensão territorial total de <strong>{esc(area_total_str)} ha</strong> de direito, registradas conforme as antigas descrições precárias de limites nos assentos imobiliários originários descritos.</span>
            </li>

            <li class="flex items-start gap-2">
                <span class="font-bold text-slate-900">3.</span>
                <span>Ocorre que, realizando-se o levantamento topográfico georreferenciado e de alta precisão do perímetro unificado das glebas para fins de obtenção da certificação técnica junto ao INCRA, constatou-se formalmente que os dados descritivos e as áreas históricas contidos nas matrículas descritas não correspondem à exata, fidedigna e atual realidade de fato existente e consolidada em campo.</span>
            </li>

            <li class="flex items-start gap-2">
                <span class="font-bold text-slate-900">4.</span>
                <span>Em cumprimento às normas vigentes, o <strong>INCRA aprovou o projeto de georreferenciamento</strong> da gleba contínua, emitindo a respectiva Certificação SIGEF com os protocolos técnicos e código identificador perimétrico.</span>
            </li>
        """
        texto_encerramento_html = f"<strong>ENCERRAMENTO DAS MATRÍCULAS ORIGINÁRIAS DE NÚMEROS {esc(lista_mats_str.upper())}</strong> e a subsequente <strong>ABERTURA DE NOVA MATRÍCULA GEORREFERENCIADA E UNIFICADA</strong>"

    else:
        # Caso de matrícula única (preserva comportamento original de forma isolada)
        nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
        area_m_str = formatar_area_ha(dados["mat"].get("area_ha"))
        georref_sigef = valor_preenchido(dados["mat"].get("georreferenciamento")) or "_" * 20
        num_mat = _num_mat(dados["mat"])

        itens_iniciais_requerimento_html = f"""
            <li class="flex items-start gap-2">
                <span class="font-bold text-slate-900">1.</span>
                <span>Os requerentes são os legítimos proprietários e possuidores do imóvel rural denominado <strong
                        class="text-slate-900">{esc(nome_lote)}</strong>, situado no município de {municipio_uf},
                    objeto da <strong>Matrícula nº {esc(num_mat)}</strong> deste prestigiado Ofício de Registro
                    Imobiliário.</span>
            </li>

            <li class="flex items-start gap-2">
                <span class="font-bold text-slate-900">2.</span>
                <span>O referido imóvel rural perfaz originalmente uma área total descrita de <strong>{esc(area_m_str)}
                        ha</strong>, registrada conforme as antigas descrições precárias de divisas constantes no
                    assento imobiliário original.</span>
            </li>

            <li class="flex items-start gap-2">
                <span class="font-bold text-slate-900">3.</span>
                <span>Ocorre que, realizando-se o levantamento topográfico georreferenciado e de alta precisão do
                    imóvel para fins de obtenção da certificação técnica junto ao INCRA, constatou-se formalmente
                    que os dados descritivos e a área histórica contidos na matrícula descrita não correspondem à
                    exata, fidedigna e atual realidade de fato existente e consolidada em campo.</span>
            </li>

            <li class="flex items-start gap-2">
                <span class="font-bold text-slate-900">4.</span>
                <span>Em cumprimento às normas vigentes, o <strong>INCRA aprovou o projeto de
                        georreferenciamento</strong> do referido imóvel, emitindo a Certificação SIGEF sob o número
                    de protocolo técnico <strong
                        class="font-mono text-slate-900 font-bold">{esc(georref_sigef)}</strong>, apurando e certificando
                    a poligonal perimetral exata da propriedade.</span>
            </li>
        """
        texto_encerramento_html = f"<strong>ENCERRAMENTO DA MATRÍCULA Nº {esc(num_mat)}</strong> e a subsequente <strong>ABERTURA DE NOVA MATRÍCULA GEORREFERENCIADA</strong>"

    bloco_assinaturas = '<div class="mt-3 flex flex-row flex-wrap justify-around items-end gap-x-4 gap-y-3 w-full">'
    for owner in dados["owners"]:
        g = genero_normalizado(owner.get("genero"))
        bloco_assinaturas += assinatura_div(owner.get("nome_completo"), legenda_requerente(g))
        if tem_conjuge(owner):
            bloco_assinaturas += assinatura_div(owner.get("nome_conjuge"), "Cônjuge Requerente")
    bloco_assinaturas += "</div>"

    template = carregar_template("requerimento_cartorio.html")
    return renderizar_template(template, {
        "nome_lote": nome_lote,
        "comarca": comarca,
        "estado_com_artigo": estado_com_artigo(dados["prop"].get("uf")),
        "qualificacao_completa": qualificacao_completa,
        "itens_iniciais_requerimento_html": Html(itens_iniciais_requerimento_html),
        "texto_encerramento_html": Html(texto_encerramento_html),
        "nome_profissional": _nome_prof(dados),
        "conselho_profissional": valor_preenchido(dados["lev"].get("conselho_profissional")) or "conselho profissional",
        "registro_profissional": valor_preenchido(dados["lev"].get("registro_profissional")) or "_____",
        "final_trt": final_trt,
        "data_trt_f": data_trt_f,
        "municipio": _municipio(dados),
        "uf": _uf(dados),
        "data_extenso": obter_data_extenso(),
        "bloco_assinaturas": Html(bloco_assinaturas),
    })


# ── Declaração de responsabilidade de limites ───────────────────────────────────────

def gerar_declaracao_responsabilidade_html(lev_id: int, matricula_id: int) -> str:
    dados = obter_dados_comuns(lev_id, matricula_id)
    comarca = _comarca(dados)

    qualificacoes = [qualificacao_resumida(o) for o in dados["owners"]]
    qualificacao_completa = Html(" e ".join(qualificacoes) if qualificacoes else "_" * 40)
    municipio_uf = f"{esc(_municipio(dados))}/{esc(_uf(dados))}"

    mats = _mats(dados)

    if len(mats) > 1:
        linhas_tabela = ""
        for m in mats:
            denominacao_m = m.get("denominacao") or dados["prop"]["nome_propriedade"]
            cri_comarca_m = m.get("cri_comarca") or dados["prop"]["municipio"]
            linhas_tabela += f"""
            <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700 hover:bg-slate-50/50 transition-colors">
                <td class="px-3 py-2 font-bold text-slate-900">{esc(denominacao_m)}</td>
                <td class="px-3 py-2 text-center font-semibold">{esc(_num_mat(m))}</td>
                <td class="px-3 py-2 text-right">{esc(formatar_area_ha(m.get("area_ha")))} ha</td>
                <td class="px-3 py-2">{esc(cri_comarca_m)}</td>
            </tr>
            """

        lista_mats_str = _lista_mats_str(dados, mats)
        nome_lote = _nome_lote_unificado(dados, lista_mats_str)

        texto_inicial_declaracao_html = f"""
            <p>Os abaixo assinados, {qualificacao_completa}, na qualidade de legítimos proprietários dos imóveis rurais contíguos situados no município de <strong class="text-slate-900">{municipio_uf}</strong>, declaram sob as penas da lei, em especial as sanções previstas no art. 299 do Código Penal Brasileiro, ser de sua inteira responsabilidade as divisas físicas e a posse pacífica da gleba contínua e unificada constituída pelas seguintes matrículas descritas abaixo:

                <div class="overflow-x-auto mt-3 border border-slate-200 rounded-lg shadow-sm w-full break-inside-avoid">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-50 border-b border-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                                <th class="px-3 py-2">Denominação (Gleba)</th>
                                <th class="px-3 py-2 text-center">Matrícula</th>
                                <th class="px-3 py-2 text-right">Área</th>
                                <th class="px-3 py-2">Comarca / CRI</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            {linhas_tabela}
                        </tbody>
                    </table>
                </div>
            </p>
            <p class="mt-4">Declaramos, para todos os fins de direito e sob as penas da lei, que:</p>
        """

    else:
        nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
        area_m_str = formatar_area_ha(dados["mat"].get("area_ha"))
        num_mat = _num_mat(dados["mat"])

        texto_inicial_declaracao_html = f"""
            <p>Os abaixo assinados, {qualificacao_completa}, na qualidade de legítimos proprietários do imóvel rural
                denominado <strong>{esc(nome_lote)}</strong>, com área de <strong>{esc(area_m_str)} ha</strong>, localizado no
                município de {municipio_uf}, objeto da Matrícula nº <strong>{esc(num_mat)}</strong> do
                Registro de Imóveis da Comarca de {esc(comarca)}, declaram sob as penas da lei, em especial as sanções
                previstas no art. 299 do Código Penal Brasileiro, que:</p>
        """

    bloco_assinaturas = '<div class="mt-4 flex flex-row flex-wrap justify-center gap-x-4 gap-y-3 w-full">'
    for owner in dados["owners"]:
        bloco_assinaturas += assinatura_div(
            owner.get("nome_completo"), "Declarante Proprietário", legenda_cls="text-[9.5px] text-slate-500 text-center font-medium mt-0.5"
        )
    bloco_assinaturas += "</div>"

    template = carregar_template("declaracao_responsabilidade.html")
    return renderizar_template(template, {
        "nome_lote": nome_lote,
        "comarca": comarca,
        "qualificacao_completa": qualificacao_completa,
        "texto_inicial_declaracao_html": Html(texto_inicial_declaracao_html),
        "municipio": _municipio(dados),
        "uf": _uf(dados),
        "data_extenso": obter_data_extenso(),
        "bloco_assinaturas": Html(bloco_assinaturas),
    })


# ── Laudo técnico ────────────────────────────────────────────────────────────────────────

def _fmt2(valor) -> str:
    return formatar_numero_br(valor, 2, vazio="-") if valor is not None else "-"


def gerar_laudo_tecnico_html(lev_id: int, matricula_id: int, numero_trt: str = None, data_trt: str = "", equipamento: str = "") -> str:
    dados = obter_dados_comuns(lev_id, matricula_id)

    final_trt, data_trt_f = _trt_do_levantamento(dados, numero_trt, data_trt)

    proprietarios_str = " e ".join(o["nome_completo"] for o in dados["owners"]) or "_" * 30
    credencial_incra = valor_preenchido(dados["lev"].get("codigo_credenciado")) or "_" * 15
    endereco_prof = valor_preenchido(dados["lev"].get("endereco_profissional")) or "_" * 30
    equipamento_f = valor_preenchido(equipamento) or "Receptor GNSS Hi-Target V30 / RTK de Dupla Frequência (L1/L2)"
    municipio_uf = f"{esc(_municipio(dados))}/{esc(_uf(dados))}"

    mats = _mats(dados)
    mat_desenho_id = dados.get("matricula_desenho_id") or matricula_id

    if len(mats) > 1:
        linhas_resumo = ""
        mats_ids = []
        for m in mats:
            mats_ids.append(m["id"])
            denominacao_m = m.get("denominacao") or dados["prop"]["nome_propriedade"]
            cri_comarca_m = m.get("cri_comarca") or dados["prop"]["municipio"]
            linhas_resumo += f"""
            <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700 hover:bg-slate-50/50 transition-colors">
                <td class="px-3 py-2 font-bold text-slate-900">{esc(denominacao_m)}</td>
                <td class="px-3 py-2 text-center font-semibold">{esc(_num_mat(m))}</td>
                <td class="px-3 py-2 text-right">{esc(formatar_area_ha(m.get("area_ha")))} ha</td>
                <td class="px-3 py-2">{esc(cri_comarca_m)}</td>
            </tr>
            """

        lista_mats_str = _lista_mats_str(dados, mats)
        nome_lote = _nome_lote_unificado(dados, lista_mats_str)

        texto_inicial_laudo_html = f"""
            <p>O presente Laudo Técnico tem por objetivo descrever e justificar as operações de campo e escritório
                realizadas para o Georreferenciamento e Retificação Territorial do perímetro unificado dos imóveis rurais pertencentes a
                <strong>{esc(proprietarios_str)}</strong>, localizados no município de {municipio_uf}, caracterizados e denominados conforme detalhado a seguir:

                <div class="overflow-x-auto mt-3 border border-slate-200 rounded-lg shadow-sm w-full break-inside-avoid">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-50 border-b border-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                                <th class="px-3 py-2">Denominação (Gleba)</th>
                                <th class="px-3 py-2 text-center">Matrícula</th>
                                <th class="px-3 py-2 text-right">Área</th>
                                <th class="px-3 py-2">Comarca / CRI</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            {linhas_resumo}
                        </tbody>
                    </table>
                </div>
            </p>
        """

        cabecalho_tabela_html = """
            <tr class="bg-slate-50 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <th class="px-2 py-1.5">Vértice</th>
                <th class="px-2 py-1.5 text-center">Tipo</th>
                <th class="px-2 py-1.5 text-right">Este (X)</th>
                <th class="px-2 py-1.5 text-right">Norte (Y)</th>
                <th class="px-2 py-1.5 text-right">Altitude (Z)</th>
                <th class="px-2 py-1.5">Lote / Matrícula</th>
            </tr>
        """

        placeholders = ",".join(["?"] * len(mats_ids))
        query_pontos = f"""
            SELECT bp.codigo_completo, bp.norte, bp.este, bp.altitude, bp.tipo_ponto, bp.numero, bp.matricula_id,
                   m.numero_matricula, m.denominacao
            FROM banco_pontos bp
            LEFT JOIN matriculas m ON bp.matricula_id = m.id
            WHERE bp.levantamento_id = ? AND bp.matricula_id IN ({placeholders})
            ORDER BY bp.matricula_id, bp.tipo_ponto, bp.numero
        """
        rows_pontos = execute_query(query_pontos, params=[lev_id] + mats_ids, fetch_all=True)
        pontos_list = [dict(p) for p in rows_pontos]
        total_pontos = len(pontos_list)

        tabela_pontos_html = ""
        if pontos_list:
            for p in pontos_list:
                denominacao_m = p["denominacao"] or dados["prop"]["nome_propriedade"]
                num_mat = valor_preenchido(p["numero_matricula"]) or "_____"
                tabela_pontos_html += f"""
                <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700 hover:bg-slate-50/50 transition-colors">
                    <td class="px-2 py-1.5 font-bold text-slate-900">{esc(p["codigo_completo"])}</td>
                    <td class="px-2 py-1.5 text-center">{esc(p["tipo_ponto"])}</td>
                    <td class="px-2 py-1.5 text-right">{_fmt2(p["este"])}</td>
                    <td class="px-2 py-1.5 text-right">{_fmt2(p["norte"])}</td>
                    <td class="px-2 py-1.5 text-right">{_fmt2(p["altitude"])}</td>
                    <td class="px-2 py-1.5 font-sans font-medium text-slate-600 text-[9px]">{esc(denominacao_m)} ({esc(num_mat)})</td>
                </tr>
                """
        else:
            tabela_pontos_html = """
            <tr>
                <td colspan="6" class="px-4 py-8 text-center text-slate-400 italic text-xs">Nenhum ponto homologado registrado no banco deste levantamento.</td>
            </tr>
            """

    else:
        nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
        area_m_str = formatar_area_ha(dados["mat"].get("area_ha"))
        num_mat = _num_mat(dados["mat"])

        texto_inicial_laudo_html = f"""
            <p>O presente Laudo Técnico tem por objetivo descrever e justificar as operações de campo e escritório
                realizadas para o Georreferenciamento e Retificação Territorial do imóvel rural
                <strong>{esc(nome_lote)}</strong>, com área total medida de <strong>{esc(area_m_str)} ha</strong>, pertencente a
                <strong>{esc(proprietarios_str)}</strong>, localizado no município de {municipio_uf}, sob a Matrícula nº
                <strong>{esc(num_mat)}</strong>.
            </p>
        """

        cabecalho_tabela_html = """
            <tr class="bg-slate-50 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <th class="px-2 py-1.5">Vértice</th>
                <th class="px-2 py-1.5 text-center">Tipo</th>
                <th class="px-2 py-1.5 text-right">Este (X)</th>
                <th class="px-2 py-1.5 text-right">Norte (Y)</th>
                <th class="px-2 py-1.5 text-right">Altitude (Z)</th>
            </tr>
        """

        rows_pontos = execute_query(
            "SELECT codigo_completo, norte, este, altitude, tipo_ponto, numero FROM banco_pontos WHERE levantamento_id = ? AND matricula_id = ? ORDER BY tipo_ponto, numero",
            params=(lev_id, mat_desenho_id),
            fetch_all=True
        )
        pontos_list = [dict(p) for p in rows_pontos]
        total_pontos = len(pontos_list)

        tabela_pontos_html = ""
        if pontos_list:
            for p in pontos_list:
                tabela_pontos_html += f"""
                <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700">
                    <td class="px-2 py-1.5 font-bold text-slate-900">{esc(p["codigo_completo"])}</td>
                    <td class="px-2 py-1.5 text-center">{esc(p["tipo_ponto"])}</td>
                    <td class="px-2 py-1.5 text-right">{_fmt2(p["este"])}</td>
                    <td class="px-2 py-1.5 text-right">{_fmt2(p["norte"])}</td>
                    <td class="px-2 py-1.5 text-right">{_fmt2(p["altitude"])}</td>
                </tr>
                """
        else:
            tabela_pontos_html = """
            <tr>
                <td colspan="5" class="px-4 py-8 text-center text-slate-400 italic text-xs">Nenhum ponto homologado registrado no banco deste levantamento.</td>
            </tr>
            """

    from services.processamento.geoprocessamento import calcular_zona_utm_segura

    zona_utm = 22
    row_lon = execute_query(
        """
        SELECT AVG(COALESCE(lon_corrigido, lon)) as avg_lon 
        FROM pontos 
        WHERE levantamento_id = ? 
          AND (lon IS NOT NULL OR lon_corrigido IS NOT NULL) 
          AND (lon != 0.0 OR lon_corrigido != 0.0)
        """,
        params=(lev_id,),
        fetch_one=True
    )
    if row_lon and row_lon["avg_lon"] is not None:
        try:
            zona_utm = calcular_zona_utm_segura(float(row_lon["avg_lon"]))
        except Exception:
            zona_utm = 22

    meridiano_central = abs(6 * zona_utm - 183)
    epsg_utm = 31960 + zona_utm
    formacao_prof = valor_preenchido(dados["lev"].get("formacao_profissional")) or "Responsável Técnico"

    template = carregar_template("laudo_tecnico.html")
    return renderizar_template(template, {
        "nome_lote": nome_lote,
        "texto_inicial_laudo_html": Html(texto_inicial_laudo_html),
        "cabecalho_tabela_html": Html(cabecalho_tabela_html),
        "proprietarios_str": proprietarios_str,
        "municipio": _municipio(dados),
        "uf": _uf(dados),
        "equipamento_f": equipamento_f,
        "total_pontos": total_pontos,
        "tabela_pontos_html": Html(tabela_pontos_html),
        "credencial_incra": credencial_incra,
        "final_trt": final_trt,
        "data_trt_f": data_trt_f,
        "data_extenso": obter_data_extenso(),
        "nome_prof": _nome_prof(dados),
        "conselho_exibicao": _conselho_exibicao(dados),
        "endereco_prof": endereco_prof,
        "formacao_prof": formacao_prof,
        "zona_utm": str(zona_utm),
        "meridiano_central": str(meridiano_central),
        "epsg_utm": str(epsg_utm),
    })


# ── Termo de responsabilidade técnica SIGEF ──────────────────────────────────────────

def gerar_termo_responsabilidade_sigef_html(lev_id: int, matricula_id: int, numero_trt: str = None, data_trt: str = "") -> str:
    """Gera o HTML correspondente ao Termo de Responsabilidade Técnica SIGEF"""
    dados = obter_dados_comuns(lev_id, matricula_id)

    final_trt, _data_trt_f = _trt_do_levantamento(dados, numero_trt, data_trt)  # valida a data informada (422)

    lacuna_prof = "_" * 20
    formacao_prof = valor_preenchido(dados["lev"].get("formacao_profissional")) or "Responsável Técnico"
    rg_prof = valor_preenchido(dados["lev"].get("rg_profissional")) or lacuna_prof
    cpf_prof = formatar_cpf(dados["lev"].get("cpf_profissional")) or lacuna_prof
    end_residencial_prof = valor_preenchido(dados["lev"].get("endereco_residencial_profissional")) or lacuna_prof
    end_comercial_prof = valor_preenchido(dados["lev"].get("endereco_profissional")) or lacuna_prof
    credencial_incra = valor_preenchido(dados["lev"].get("codigo_credenciado")) or lacuna_prof

    municipio_cartorio = valor_preenchido(dados["mat"].get("cri_comarca")) or _municipio(dados)

    mats = _mats(dados)

    if len(mats) > 1:
        linhas_tabela = ""
        for m in mats:
            sigef_m = valor_preenchido(m.get("georreferenciamento")) or "Não Certificado"
            denominacao_m = m.get("denominacao") or dados["prop"]["nome_propriedade"]
            linhas_tabela += f"""
            <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700 hover:bg-slate-50/50 transition-colors">
                <td class="px-3 py-2 font-bold text-slate-900">{esc(denominacao_m)}</td>
                <td class="px-3 py-2 text-center font-semibold">{esc(_num_mat(m))}</td>
                <td class="px-3 py-2 text-right">{esc(formatar_area_ha(m.get("area_ha"), 2))} ha</td>
                <td class="px-3 py-2 text-center text-[9px]">{esc(sigef_m)}</td>
            </tr>
            """

        area_total_str = formatar_area_ha(_area_total(mats), 2)
        nome_lote = _nome_lote_unificado(dados, _lista_mats_str(dados, mats))

        texto_declaracao_imoveis_html = f"""
            <p>
                <strong>DECLARA</strong> que é responsável técnico pelo Levantamento Geodésico executado
                com fulcro no § 5º do art. 176 da Lei 6015/73 e Lei 10.267/01, Decreto 4.449/02 e
                5.570/05, dos imóveis rurais localizados no município e comarca de
                <strong class="text-slate-900">{esc(municipio_cartorio)}</strong>, através da emissão da Anotação de Responsabilidade Técnica – ART/TRT nº
                <strong class="text-slate-900">{esc(final_trt)}</strong>, caracterizados e certificados individualmente conforme detalhado a seguir:
            </p>

            <div class="overflow-x-auto mt-3 border border-slate-200 rounded-lg shadow-sm w-full break-inside-avoid">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-50 border-b border-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                            <th class="px-3 py-2">Denominação (Gleba)</th>
                            <th class="px-3 py-2 text-center">Matrícula Originária</th>
                            <th class="px-3 py-2 text-right">Área Certificada</th>
                            <th class="px-3 py-2 text-center">Certificação SIGEF (Código)</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        {linhas_tabela}
                    </tbody>
                </table>
            </div>

            <p class="mt-4">
                A área total consolidada sob responsabilidade técnica deste levantamento georreferenciado perfaz a extensão total de <strong class="text-slate-900">{esc(area_total_str)} ha</strong>.
            </p>
        """
    else:
        nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
        num_mat = _num_mat(dados["mat"])
        georreferenciamento = valor_preenchido(dados["mat"].get("georreferenciamento")) or "_" * 20
        area_ha_str = formatar_area_ha(dados["mat"].get("area_ha"), 2)

        texto_declaracao_imoveis_html = f"""
            <p>
                <strong>DECLARA</strong> que é responsável técnico pelo Levantamento Geodésico executado
                com fulcro no § 5º do art. 176 da Lei 6015/73 e Lei 10.267/01, Decreto 4.449/02 e
                5.570/05, do imóvel rural: <strong class="text-slate-900">{esc(nome_lote)}</strong>,
                com matrícula nº <strong class="text-slate-900">{esc(num_mat)}</strong>, localizado no município e comarca de
                <strong class="text-slate-900">{esc(municipio_cartorio)}</strong>, através da emissão da Anotação de Responsabilidade Técnica – ART/TRT nº
                <strong class="text-slate-900">{esc(final_trt)}</strong>, certificação da parcela nº
                <strong class="text-slate-900 font-mono">{esc(georreferenciamento)}</strong> e área certificada em <strong class="text-slate-900">{esc(area_ha_str)} ha</strong>.
            </p>
        """

    template = carregar_template("termo_responsabilidade_sigef.html")
    return renderizar_template(template, {
        "nome_lote": nome_lote,
        "nome_prof": _nome_prof(dados),
        "formacao_prof": formacao_prof,
        "conselho_exibicao": _conselho_exibicao(dados),
        "rg_prof": rg_prof,
        "cpf_prof": cpf_prof,
        "end_residencial_prof": end_residencial_prof,
        "end_comercial_prof": end_comercial_prof,
        "credencial_incra": credencial_incra,
        "texto_declaracao_imoveis_html": Html(texto_declaracao_imoveis_html),
        "municipio": _municipio(dados),
        "uf": _uf(dados),
        "data_hoje_extenso": obter_data_extenso(),
    })


def gerar_manual_proprietario_html(lev_id: int, matricula_id: int) -> str:
    """Gera o HTML correspondente ao Manual do Proprietário Pós-Georreferenciamento"""
    dados = obter_dados_comuns(lev_id, matricula_id)

    formacao_prof = valor_preenchido(dados["lev"].get("formacao_profissional")) or "Responsável Técnico"
    municipio_cartorio = valor_preenchido(dados["mat"].get("cri_comarca")) or _municipio(dados)

    mats = _mats(dados)
    if len(mats) > 1:
        lista_mats = [_num_mat(m) for m in mats]
        rotulo_mat = dados.get("rotulo_matricula") or "Matrículas"
        nome_lote = f"{dados['prop']['nome_propriedade']} ({rotulo_mat}: {dados.get('numeros_matricula_str') or ', '.join(lista_mats)})"
    else:
        nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]

    template = carregar_template("manual_proprietario.html")
    return renderizar_template(template, {
        "nome_lote": nome_lote,
        "nome_prof": _nome_prof(dados),
        "formacao_prof": formacao_prof,
        "conselho_exibicao": _conselho_exibicao(dados),
        "municipio_cartorio": municipio_cartorio,
        "municipio": _municipio(dados),
        "uf": _uf(dados),
    })


# ── Mapas (Leaflet) ──────────────────────────────────────────────────────────────────────

# Segundos até avisar que os tiles de satélite não carregaram (o loader não some mais "no chute" após 1,5 s).
TIMEOUT_TILES_MS = 8000


def gerar_js_inicializacao_mapas(lista_mapas_data: list[dict]) -> str:
    """Gera a tag <script> que inicializa os mapas Leaflet com imagens de satélite do Google.
    O indicador de carregamento só some quando os tiles carregam (evento `load` da camada); se não vierem em
    ~8 s (sem internet/bloqueio), um aviso visível só na tela alerta para NÃO imprimir o mapa em branco."""
    mapas_json = json_para_script(lista_mapas_data)

    js_code = f"""
<script>
    document.addEventListener("DOMContentLoaded", function() {{
        const mapasData = {mapas_json};
        const TIMEOUT_TILES_MS = {TIMEOUT_TILES_MS};

        function avisoMapa(m, texto) {{
            const loader = document.getElementById("loader_" + m.id);
            if (loader) loader.style.display = "none";
            const box = document.getElementById(m.id);
            if (!box || box.querySelector("[data-aviso-mapa]")) return;
            const aviso = document.createElement("div");
            aviso.setAttribute("data-aviso-mapa", "1");
            aviso.className = "no-print";
            aviso.style.cssText = "position:absolute;top:0;left:0;right:0;z-index:1001;background:#fef2f2;color:#991b1b;border-bottom:2px solid #f87171;padding:8px 12px;font:bold 12px sans-serif;text-align:center";
            aviso.textContent = texto;
            box.appendChild(aviso);
        }}

        mapasData.forEach(function(m) {{
            try {{
                if (typeof L === "undefined") {{
                    avisoMapa(m, "O mapa não carregou (biblioteca Leaflet indisponível: sem acesso à internet?). Não imprima esta página sem o mapa.");
                    return;
                }}

                const map = L.map(m.id, {{
                    zoomControl: false,
                    attributionControl: false,
                    fadeAnimation: false,
                    zoomAnimation: false
                }});

                const googleSat = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={{x}}&y={{y}}&z={{z}}', {{
                    maxZoom: 20,
                    crossOrigin: true
                }});

                googleSat.addTo(map);

                if (m.poligono && m.poligono.length > 0) {{
                    L.polygon(m.poligono, {{
                        color: '#94a3b8',
                        fill: false,
                        weight: 1.5,
                        dashArray: '4, 4'
                    }}).addTo(map);
                }}

                const bounds = L.latLngBounds();
                if (m.lindeira && m.lindeira.length > 0) {{
                    m.lindeira.forEach(function(seg) {{
                        L.polyline(seg, {{
                            color: '#0284c7',
                            weight: 4.5,
                            lineCap: 'round',
                            lineJoin: 'round'
                        }}).addTo(map);
                        bounds.extend(seg[0]);
                        bounds.extend(seg[1]);
                    }});
                }}

                if (m.lindeira_pontos && m.lindeira_pontos.length > 0) {{
                    m.lindeira_pontos.forEach(function(pt) {{
                        const marker = L.circleMarker(pt.coords, {{
                            radius: 2.0,
                            color: '#0284c7',
                            fillColor: '#ffffff',
                            fillOpacity: 1.0,
                            weight: 1.5
                        }}).addTo(map);

                        if (pt.exibir_nome) {{
                            marker.bindTooltip(pt.nome, {{
                                permanent: true,
                                direction: 'top',
                                className: 'custom-tooltip',
                                offset: [0, -5]
                            }});
                        }}
                    }});
                }}

                if (bounds.isValid()) {{
                    map.fitBounds(bounds, {{
                        padding: [40, 40],
                        maxZoom: 18
                    }});
                }} else if (m.poligono && m.poligono.length > 0) {{
                    map.fitBounds(m.poligono, {{
                        padding: [20, 20]
                    }});
                }}

                let tilesOk = 0;
                let tilesErro = 0;
                let concluido = false;
                googleSat.on('tileload', function() {{ tilesOk++; }});
                googleSat.on('tileerror', function() {{ tilesErro++; }});
                googleSat.on('load', function() {{
                    // 'load' dispara quando todos os tiles visíveis terminaram (com sucesso ou erro).
                    if (tilesOk === 0) {{
                        avisoMapa(m, "As imagens de satélite não carregaram (sem acesso à internet?). Não imprima o mapa em branco; recarregue a página.");
                        concluido = true;
                        return;
                    }}
                    concluido = true;
                    const loader = document.getElementById("loader_" + m.id);
                    if (loader) loader.style.display = "none";
                    if (tilesErro > 0) {{
                        avisoMapa(m, "Parte das imagens de satélite não carregou; confira o mapa antes de imprimir.");
                    }}
                }});

                setTimeout(function() {{
                    if (!concluido) {{
                        avisoMapa(m, "As imagens de satélite demoraram demais para carregar (sem acesso à internet?). Aguarde, recarregue a página e confira o mapa antes de imprimir.");
                    }}
                }}, TIMEOUT_TILES_MS);

            }} catch (e) {{
                console.error("Erro ao inicializar mapa " + m.id + ": ", e);
                avisoMapa(m, "Falha ao carregar o mapa. Não imprima esta página sem o croqui.");
            }}
        }});
    }});
</script>
    """
    return Html(js_code)


# ── Declaração de anuência para desmembramento ──────────────────────────────────────────

_RE_CNS = re.compile(r"^[0-9][0-9.\-\s]{0,19}$")


def _validar_cns(codigo_cns) -> str:
    """CNS é opcional; se informado, só dígitos (separadores '.', '-' e espaço são tolerados na digitação)."""
    texto = valor_preenchido(codigo_cns)
    if not texto:
        return ""
    if not _RE_CNS.match(texto):
        raise ErroDocumento("Código CNS inválido: informe apenas dígitos (ex.: 12345 ou 12.345-6).")
    return texto


def gerar_declaracao_anuencia_desmembramento_html(lev_id: int, matricula_id: int, codigo_cns: str = None, qtd_parcelas: int = 3) -> str:
    cns = _validar_cns(codigo_cns)
    qtd_parcelas_extenso = extenso_parcelas(qtd_parcelas)  # 2..20, senão ErroDocumento (422)

    dados = obter_dados_comuns(lev_id, matricula_id)

    qualificacoes = []
    generos = []
    for owner in dados["owners"]:
        qualif, info = qualificar_pessoa(_owner_texto(owner), rotulo_erro="O proprietário", destaque_docs=True)
        qualificacoes.append(qualif)
        generos.append(info["genero"])
        if info["casal"]:
            generos.append(info["genero_conjuge"])

    houve_casal = any(tem_conjuge(o) for o in dados["owners"])
    plural = len(qualificacoes) > 1 or houve_casal
    if qualificacoes:
        qualificacao_completa = Html("; e<br>".join(qualificacoes))
    else:
        qualificacao_completa = Html("_" * 50)
    gp = genero_plural(generos) if (plural and generos) else (generos[0] if generos else None)
    detentor = flex(gp, "detentores", "detentoras", "detentores(as)") if plural else flex(gp, "detentor", "detentora", "detentor(a)")
    pronome_inicial = "Nós" if plural else "Eu"

    nome_area = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
    codigo_incra = valor_preenchido(dados["prop"].get("codigo_ccir")) or valor_preenchido(dados["mat"].get("ccir")) or "_" * 20
    num_mat = _num_mat(dados["mat"])
    municipio_cartorio = _comarca(dados)
    uf_cartorio = _uf(dados)
    cns_str = f" (CNS: {esc(cns)})" if cns else ""

    texto_qualificacao_html = (
        f'{pronome_inicial}, {qualificacao_completa}, {detentor} do imóvel rural denominado <strong class="text-slate-900">{esc(nome_area)}</strong>, '
        f'Código SNCR/INCRA nº <strong class="text-slate-900">{esc(codigo_incra)}</strong>, registrado sob a Matrícula nº '
        f'<strong class="text-slate-900">{esc(num_mat)}</strong> no Cartório de Registro de Imóveis de '
        f'<strong class="text-slate-900">{esc(municipio_cartorio)}/{esc(uf_cartorio)}</strong>{cns_str},'
    )

    registro_prof = valor_preenchido(dados["lev"].get("registro_profissional")) or "_____"
    conselho_prof = valor_preenchido(dados["lev"].get("conselho_profissional")) or "CREA/CFTA"
    conselho_exibicao = f"{conselho_prof} sob o nº {registro_prof}"
    codigo_credenciado = valor_preenchido(dados["lev"].get("codigo_credenciado")) or "_____"
    codigo_sigef_original = valor_preenchido(dados["mat"].get("georreferenciamento")) or "_" * 36

    bloco_assinaturas = '<div class="mt-4 flex flex-row flex-wrap justify-center gap-x-4 gap-y-3 w-full">'
    mono = "text-[9.5px] text-slate-600 text-center font-medium mt-0.5 font-mono"
    for owner in dados["owners"]:
        cpf_f = valor_preenchido(formatar_cpf(owner.get("cpf_cnpj"))) or "_" * 14
        bloco_assinaturas += assinatura_div(owner.get("nome_completo"), f"CPF: {cpf_f}", legenda_cls=mono)
        if tem_conjuge(owner):
            conj_cpf_f = valor_preenchido(formatar_cpf(owner.get("cpf_conjuge"))) or "_" * 14
            bloco_assinaturas += assinatura_div(owner.get("nome_conjuge"), f"CPF: {conj_cpf_f}", legenda_cls=mono)
    bloco_assinaturas += "</div>"

    template = carregar_template("declaracao_anuencia_desmembramento.html")
    return renderizar_template(template, {
        "nome_lote": nome_area,
        "texto_qualificacao_html": Html(texto_qualificacao_html),
        "nome_profissional": _nome_prof(dados),
        "codigo_credenciado": codigo_credenciado,
        "conselho_exibicao": conselho_exibicao,
        "codigo_sigef_original": codigo_sigef_original,
        "qtd_parcelas_extenso": qtd_parcelas_extenso,
        "v_declaro_caps": "DECLARAMOS" if plural else "DECLARO",
        "v_estou_caps": "ESTAMOS DE ACORDO e AUTORIZAMOS EXPRESSAMENTE" if plural else "ESTOU DE ACORDO e AUTORIZO EXPRESSAMENTE",
        "v_declaro": "Declaramos" if plural else "Declaro",
        "v_assumo": "Assumimos" if plural else "Assumo",
        "municipio": _municipio(dados),
        "uf": _uf(dados),
        "data_extenso": obter_data_extenso(),
        "bloco_assinaturas": Html(bloco_assinaturas),
    })


# ── Requerimento de averbação de casamento ──────────────────────────────────────────────

def gerar_requerimento_averbacao_casamento_html(
    lev_id: int = None,
    matricula_id: int = None,
    cliente_id: int = None,
    params: dict = None
) -> str:
    """Gera o Requerimento de Averbação de Casamento perante o Cartório de Registro de Imóveis.
    Pode ser gerado com um levantamento ativo ou diretamente a partir de uma matrícula/propriedade cadastrada.

    Todo parâmetro de `params` alimenta o texto (data_celebracao, regime_bens, cartorio_civil, livro/folha/termo,
    matricula_certidao, pacto_antenupcial, alteracao_nome, numero_oficio, dados e documentos do cônjuge...).
    O que não for informado nem constar no cadastro vira linha de preenchimento: nunca é presumido.
    """
    if not matricula_id:
        raise ErroDocumento("O ID da matrícula é obrigatório para gerar o Requerimento de Averbação de Casamento.")

    params = params or {}
    dados = obter_dados_comuns(lev_id, matricula_id) if lev_id else obter_dados_matricula_sem_levantamento(matricula_id)
    owners = dados["owners"]
    if not owners:
        raise ErroDocumento("Nenhum proprietário/cliente encontrado para o imóvel.")

    # 1. Requerente: o cliente informado (deve pertencer ao imóvel) ou o único possível; ambíguo -> 422
    if cliente_id is not None:
        target_owner = next((o for o in owners if o.get("cliente_id") == cliente_id), None)
        if target_owner is None:
            raise ErroDocumento(f"O cliente {cliente_id} não é proprietário deste imóvel; escolha o requerente entre os proprietários.")
    elif len(owners) == 1:
        target_owner = owners[0]
    else:
        casados = [o for o in owners if tem_conjuge(o)]
        if len(casados) == 1:
            target_owner = casados[0]
        else:
            nomes = "; ".join(f"{o.get('nome_completo')} (cliente_id {o.get('cliente_id')})" for o in owners)
            raise ErroDocumento(
                "Há mais de um proprietário possível para o requerimento de averbação; informe cliente_id do requerente. "
                f"Proprietários: {nomes}."
            )

    # 2. Documentos adicionais / metadados do cliente e pessoa
    pessoa_id = target_owner.get("pessoa_id")
    cli_id = target_owner.get("cliente_id")

    orgao_rg_requerente = valor_preenchido(params.get("orgao_rg_requerente"))
    orgao_rg_conjuge = valor_preenchido(params.get("orgao_rg_conjuge"))
    certidao_matricula_db = None

    if pessoa_id:
        doc_rows = execute_query(
            "SELECT tipo_documento, numero, orgao_emissor, uf_emissor FROM cliente_documentos WHERE pessoa_id = ?",
            params=(pessoa_id,),
            fetch_all=True
        )
        for d in doc_rows:
            d_dict = dict(d)
            if d_dict.get("tipo_documento") == "RG" and not orgao_rg_requerente:
                oe = valor_preenchido(d_dict.get("orgao_emissor"))
                uf_e = valor_preenchido(d_dict.get("uf_emissor"))
                if oe or uf_e:
                    orgao_rg_requerente = f"{oe or '_____'}/{uf_e or '__'}"
            elif "CASAMENTO" in str(d_dict.get("tipo_documento", "")).upper():
                certidao_matricula_db = d_dict.get("numero")

    if cli_id and not certidao_matricula_db:
        meta_rows = execute_query(
            "SELECT chave, valor FROM cliente_metadados WHERE id_cliente = ?",
            params=(cli_id,),
            fetch_all=True
        )
        for m in meta_rows:
            m_dict = dict(m)
            if "casamento" in str(m_dict.get("chave", "")).lower():
                certidao_matricula_db = m_dict.get("valor")

    uf_txt = uf_exibicao(dados["prop"].get("uf"))
    municipio = _municipio(dados)
    orgao_rg_requerente = orgao_rg_requerente or "_____/__"
    orgao_rg_conjuge = orgao_rg_conjuge or "_____/__"

    # 3. Cabeçalho / Ofício do Cartório de Registro de Imóveis
    comarca_cri = _comarca(dados)
    circunscricao_cri = valor_preenchido(dados["mat"].get("cri_circunscricao"))
    numero_oficio = valor_preenchido(params.get("numero_oficio"))

    if not numero_oficio and circunscricao_cri:
        nums = re.findall(r'\d+', circunscricao_cri)
        if nums:
            numero_oficio = nums[0]

    if numero_oficio:
        cabecalho_oficial_cartorio = f"ILMO. SR. OFICIAL DO {numero_oficio}º OFICIAL DE REGISTRO DE IMÓVEIS DA COMARCA DE {comarca_cri}/{uf_txt}"
    else:
        cabecalho_oficial_cartorio = f"ILMO. SR. OFICIAL DO REGISTRO DE IMÓVEIS DA COMARCA DE {comarca_cri}/{uf_txt}"

    # 4. Dados do Requerente
    g_req = genero_normalizado(target_owner.get("genero"))
    nome_requerente = valor_preenchido(target_owner.get("nome_completo")) or "_" * 30
    nacionalidade_requerente = flexionar_nacionalidade(target_owner.get("nacionalidade"), g_req)
    profissao_requerente = valor_preenchido(target_owner.get("profissao")) or "_" * 20
    rg_requerente = formatar_rg(target_owner.get("rg_ie")) or "_" * 15
    cpf_requerente = formatar_cpf(target_owner.get("cpf_cnpj")) or "_" * 14

    end_parts = []
    if valor_preenchido(target_owner.get("endereco_completo")):
        end_parts.append(valor_preenchido(target_owner["endereco_completo"]))
    if valor_preenchido(target_owner.get("cep")):
        end_parts.append(f"CEP {valor_preenchido(target_owner['cep'])}")
    if valor_preenchido(target_owner.get("cidade")) and valor_preenchido(target_owner.get("estado")):
        end_parts.append(f"{valor_preenchido(target_owner['cidade'])}/{valor_preenchido(target_owner['estado'])}")
    endereco_completo_requerente = ", ".join(end_parts) if end_parts else "_" * 40
    telefone_requerente = valor_preenchido(target_owner.get("telefone")) or "(não informado)"
    email_requerente = valor_preenchido(target_owner.get("email")) or "(não informado)"

    # 5. Dados do Cônjuge (parâmetro > cadastro > lacuna)
    gc = genero_conjuge_efetivo(target_owner.get("genero_conjuge"), g_req)
    nome_conjuge = valor_preenchido(params.get("nome_conjuge")) or valor_preenchido(target_owner.get("nome_conjuge")) or "_" * 30
    nacionalidade_conjuge = flexionar_nacionalidade(
        valor_preenchido(params.get("nacionalidade_conjuge")) or target_owner.get("nacionalidade_conjuge"), gc
    )
    profissao_conjuge = valor_preenchido(params.get("profissao_conjuge")) or valor_preenchido(target_owner.get("profissao_conjuge")) or "_" * 20
    rg_conjuge = formatar_rg(valor_preenchido(params.get("rg_conjuge")) or target_owner.get("rg_conjuge")) or "_" * 15
    cpf_conjuge = formatar_cpf(valor_preenchido(params.get("cpf_conjuge")) or target_owner.get("cpf_conjuge")) or "_" * 14
    endereco_conjuge = valor_preenchido(params.get("endereco_conjuge")) or "no mesmo endereço acima indicado"

    # 6. Qualidade do Proprietário e Matrícula
    qualidade_proprietario = "coproprietário(a)" if len(owners) > 1 else "proprietário(a)"
    numero_matricula = _num_mat(dados["mat"])

    # 7. Dados do Casamento
    data_celebracao = formatar_data_br(params.get("data_celebracao"), "Data de celebração do casamento")

    regime_informado = formatar_regime_bens_extenso(params.get("regime_bens")) or formatar_regime_bens_extenso(target_owner.get("regime_bens"))
    regime_bens = regime_informado or "_" * 22

    cartorio_registro_civil = valor_preenchido(params.get("cartorio_civil")) or "Oficial de Registro Civil das Pessoas Naturais de " + "_" * 25

    # Assento de casamento
    livro = valor_preenchido(params.get("livro"))
    folha = valor_preenchido(params.get("folha"))
    termo = valor_preenchido(params.get("termo"))
    mat_certidao = valor_preenchido(params.get("matricula_certidao")) or valor_preenchido(certidao_matricula_db)

    if mat_certidao:
        dados_assento_casamento = f"Matrícula nº {mat_certidao}"
    elif livro or folha or termo:
        dados_assento_casamento = f"Livro nº {livro or '___'}, Folha nº {folha or '___'}, Termo nº {termo or '___'}"
    else:
        dados_assento_casamento = "Livro nº ____, Folha nº ____, Termo nº ____ (ou Matrícula nº ________________________________)"

    # Pacto antenupcial: só se afirma "não houve" para o regime legal INFORMADO; sem regime, lacuna
    pacto_param = valor_preenchido(params.get("pacto_antenupcial"))
    if pacto_param:
        pacto_antenupcial = pacto_param
    elif regime_informado and "parcial" in regime_informado.lower():
        pacto_antenupcial = "Não houve, adotado regime legal (Comunhão Parcial de Bens)"
    elif regime_informado:
        pacto_antenupcial = (
            "Lavrado pelo Tabelionato de Notas de " + "_" * 20 + ", Livro ____, Folha ____, registrado no Registro de Imóveis sob nº ______"
        )
    else:
        pacto_antenupcial = "_" * 30 + " (informar, se houver pacto antenupcial)"

    alteracao_nome = valor_preenchido(params.get("alteracao_nome")) or "_" * 30 + " (informar se houve alteração de nome por ocasião do casamento)"

    # 8. Local, Data e Assinaturas
    cidade_uf_emissao = f"{municipio}/{uf_txt}"

    ass = dict(container="min-w-[260px] flex-1 max-w-[320px]", linha="mt-6 mb-2",
               nome_cls="text-xs font-bold text-slate-900 text-center uppercase tracking-wide",
               legenda_cls="text-[9px] text-slate-400 text-center uppercase tracking-wider font-semibold")
    bloco_assinaturas = '<div class="mt-8 flex flex-row flex-wrap justify-around gap-x-8 gap-y-12 w-full">'
    bloco_assinaturas += assinatura_div(nome_requerente, "Requerente", linha_extra=f"CPF: {esc(cpf_requerente)}", **ass)
    bloco_assinaturas += assinatura_div(nome_conjuge, "Cônjuge", linha_extra=f"CPF: {esc(cpf_conjuge)}", **ass)
    bloco_assinaturas += "</div>"

    template = carregar_template("requerimento_averbacao_casamento.html")
    return renderizar_template(template, {
        "cabecalho_oficial_cartorio": cabecalho_oficial_cartorio,
        "nome_requerente": nome_requerente,
        "nacionalidade_requerente": nacionalidade_requerente,
        "profissao_requerente": profissao_requerente,
        "rg_requerente": rg_requerente,
        "orgao_uf_rg_requerente": orgao_rg_requerente,
        "cpf_requerente": cpf_requerente,
        "endereco_completo_requerente": endereco_completo_requerente,
        "telefone_requerente": telefone_requerente,
        "email_requerente": email_requerente,
        "nome_conjuge": nome_conjuge,
        "nacionalidade_conjuge": nacionalidade_conjuge,
        "profissao_conjuge": profissao_conjuge,
        "rg_conjuge": rg_conjuge,
        "orgao_uf_rg_conjuge": orgao_rg_conjuge,
        "cpf_conjuge": cpf_conjuge,
        "endereco_conjuge": endereco_conjuge,
        "qualidade_proprietario": qualidade_proprietario,
        "numero_matricula": numero_matricula,
        "data_celebracao": data_celebracao,
        "regime_bens": regime_bens,
        "cartorio_registro_civil": cartorio_registro_civil,
        "dados_assento_casamento": dados_assento_casamento,
        "pacto_antenupcial": pacto_antenupcial,
        "alteracao_nome": alteracao_nome,
        "cidade_uf_emissao": cidade_uf_emissao,
        "data_extenso": obter_data_extenso(),
        "bloco_assinaturas": Html(bloco_assinaturas),
    })
