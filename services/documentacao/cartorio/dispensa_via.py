"""Declaração e laudo técnico de dispensa de anuência de confrontante que é VIA PÚBLICA (estrada, rodovia).

Exigência do Registro de Imóveis: apresentar laudo técnico ou declaração solicitando a dispensa de anuência
da estrada confrontante, constando que foram respeitadas a faixa de domínio público e eventual área
`non aedificandi` (art. 440-AX, §3º, II, "b", do Provimento CNJ nº 195/2025), assinado digitalmente pelo
técnico responsável e pelos proprietários.

Os trechos de divisa com cada via vêm dos segmentos do levantamento (vértices, azimutes e distâncias), então
o texto sempre reflete o que foi realmente medido. Reaproveita o mesmo contexto dos demais documentos de
cartório (`obter_dados_comuns`) e o reconhecimento de via pública por nome (`parece_via_publica`).
"""

from services.documentacao.cartorio.data_fetcher import (
    gerar_tabela_divisas_html,
    obter_dados_comuns,
    obter_segmentos_detalhados_lote,
)
from services.documentacao.cartorio.laudos_imovel import (
    _area_total,
    _comarca,
    _conselho_exibicao,
    _lista_mats_str,
    _mats,
    _municipio,
    _nome_prof,
    _num_mat,
    _owner_texto,
    _trt_do_levantamento,
    _uf,
)
from services.documentacao.cartorio.qualificacao import (
    flex,
    genero_normalizado,
    grade_assinaturas,
    qualificar_pessoa,
    tem_conjuge,
)
from services.documentacao.cartorio.utils import (
    Html,
    calcular_distancia_sgl,
    carregar_template,
    esc,
    formatar_area_ha,
    formatar_cpf,
    formatar_numero_br,
    formatar_rg,
    obter_data_extenso,
    renderizar_template,
    valor_preenchido,
)
from services.documentacao.erros import ErroDocumento, NaoEncontrado
from services.gestores.anuencia_status import parece_via_publica
from database.connection import execute_query

LACUNA = "_" * 20

_ROMANOS = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII")

# Texto exigido pelo Registro de Imóveis (mantido literal: é o que o cartório confere).
TEXTO_FAIXA_DOMINIO = (
    "foram respeitadas a faixa de domínio público e eventual área <em>non aedificandi</em>, conforme o "
    "artigo 440-AX, §3º, II, \"b\", do Provimento nº 195, de 3/6/2025, do Código Nacional de Normas da "
    "Corregedoria Nacional de Justiça do Conselho Nacional de Justiça - Foro Extrajudicial"
)


def _medida_m(valor, campo: str) -> str:
    """'15', '15,5' ou '15.5' -> '15,50' (metros); vazio -> ''; inválido ou não positivo -> 422."""
    texto = valor_preenchido(valor)
    if not texto:
        return ""
    try:
        numero = float(texto.replace(",", "."))
    except ValueError:
        numero = 0.0
    if numero <= 0:
        raise ErroDocumento(f"{campo} deve ser um número positivo em metros (ex.: 15 ou 15,5).")
    return formatar_numero_br(numero, 2)


def _forte(texto) -> str:
    return f'<strong class="text-slate-900">{esc(texto)}</strong>'


def _lista_nomes(nomes: list[str]) -> str:
    """'A', 'A e B', 'A, B e C' (cada nome em destaque e entre aspas simples)."""
    itens = [_forte(f"'{n}'") for n in nomes]
    if len(itens) <= 1:
        return "".join(itens)
    return ", ".join(itens[:-1]) + " e " + itens[-1]


def _vias_do_levantamento(lev_id: int, mat_desenho_id: int, matricula_id: int, confrontante_id: int | None) -> list[dict]:
    """Confrontantes com divisa nesta matrícula que são vias públicas (ou apenas o `confrontante_id` pedido)."""
    rows = execute_query(
        """
        SELECT c.id, COALESCE(NULLIF(TRIM(c.nome), ''), p.nome) AS nome
        FROM confrontantes c
        LEFT JOIN pessoas p ON p.id = c.pessoa_id
        WHERE c.levantamento_id = ?
          AND EXISTS (SELECT 1 FROM segmentos s
                      WHERE s.confrontante_id = c.id AND s.levantamento_id = c.levantamento_id
                        AND s.matricula_id IN (?, ?))
        ORDER BY c.id
        """,
        params=(lev_id, mat_desenho_id, matricula_id), fetch_all=True,
    )
    vias = [dict(r) for r in rows if valor_preenchido(r["nome"])]
    if confrontante_id is not None:
        vias = [v for v in vias if v["id"] == confrontante_id]
        if not vias:
            raise NaoEncontrado(f"Confrontante ID {confrontante_id} não tem divisa nesta matrícula do levantamento.")
        return vias
    return [v for v in vias if parece_via_publica(v["nome"])]


def _trechos_e_extensao(segs: list[dict]) -> tuple[str, float]:
    """('P1 a P4; P9 a P11', extensão em metros): sequências contínuas de vértices e soma das distâncias SGL."""
    corridas: list[list[str]] = []
    total = 0.0
    for s in segs:
        if corridas and corridas[-1][-1] == s["ini_nome"]:
            corridas[-1].append(s["fim_nome"])
        else:
            corridas.append([s["ini_nome"], s["fim_nome"]])
        if None not in (s["ini_lat"], s["ini_lon"], s["fim_lat"], s["fim_lon"]):
            total += calcular_distancia_sgl(s["ini_lat"], s["ini_lon"], s["fim_lat"], s["fim_lon"], s.get("ini_alt"), s.get("fim_alt"))
    trechos = "; ".join(f"{c[0]} a {c[-1]}" for c in corridas)
    return trechos, total


def _linha_medidas(faixa_dominio: str, faixa_nao_edif: str) -> str:
    itens = []
    if faixa_dominio:
        itens.append(f"faixa de domínio: {_forte(faixa_dominio + ' m')}")
    if faixa_nao_edif:
        itens.append(f"área <em>non aedificandi</em>: {_forte(faixa_nao_edif + ' m')}")
    return (" " + "; ".join(itens) + ".") if itens else ""


def _secao_vias(vias: list[dict], segs_por_via: dict[int, list[dict]], mat_desenho_id: int, medidas: str = "") -> str:
    blocos = []
    for i, v in enumerate(vias, start=1):
        segs = segs_por_via[v["id"]]
        trechos, extensao = _trechos_e_extensao(segs)
        ext_txt = f"{formatar_numero_br(extensao, 2)} m" if extensao else "-"
        blocos.append(f"""
        <div class="break-inside-avoid mb-3">
            <p class="font-semibold text-slate-800 mb-1">4.{i} {_forte(v["nome"])} <span class="font-normal text-slate-500">— via pública (bem de uso comum do povo)</span></p>
            <p class="text-[11px] text-slate-600">Trecho(s) da divisa com o imóvel: vértices {esc(trechos)}; extensão lindeira: <strong class="font-mono">{esc(ext_txt)}</strong>.{medidas}</p>
            {gerar_tabela_divisas_html(mat_desenho_id, v["id"], segs)}
        </div>""")
    return "".join(blocos)


def _qualificacao_rt(dados: dict) -> str:
    lev = dados["lev"]
    cpf = formatar_cpf(lev.get("cpf_profissional")) or LACUNA
    rg = valor_preenchido(lev.get("rg_profissional"))
    trecho_rg = f", portador da Carteira de Identidade RG nº {_forte(formatar_rg(rg))}" if rg else ""
    nac = valor_preenchido(lev.get("nacionalidade_profissional")) or "brasileiro(a)"
    formacao = valor_preenchido(lev.get("formacao_profissional")) or "Responsável Técnico"
    end = valor_preenchido(lev.get("endereco_profissional")) or LACUNA
    credencial = valor_preenchido(lev.get("codigo_credenciado"))
    trecho_cred = f", credenciado no INCRA sob o código {_forte(credencial)}" if credencial else ""
    return (
        f"{_forte(_nome_prof(dados))}, {esc(nac)}, {esc(formacao)}, inscrito no CPF nº {_forte(cpf)}{trecho_rg}, "
        f"registrado no conselho profissional {_forte(_conselho_exibicao(dados))}{trecho_cred}, "
        f"com endereço profissional em {esc(end)}"
    )


def _secao_imovel(dados: dict, mats: list) -> str:
    municipio_uf = f"{_municipio(dados)}/{_uf(dados)}"
    comarca = _comarca(dados)
    if len(mats) > 1:
        lista = _lista_mats_str(dados, mats)
        rotulo = dados.get("rotulo_matricula") or "Matrículas nºs"
        return (
            f"Imóveis rurais contíguos que formam a gleba denominada {_forte(dados['prop']['nome_propriedade'])}, "
            f"objeto das {esc(rotulo)} {_forte(lista)} do Serviço de Registro de Imóveis da Comarca de {_forte(comarca)}, "
            f"situados no município de {_forte(municipio_uf)}, com área registrada total de "
            f"{_forte(formatar_area_ha(_area_total(mats)) + ' ha')}."
        )
    mat = dados["mat"]
    nome_lote = mat.get("denominacao") or dados["prop"]["nome_propriedade"]
    sigef = valor_preenchido(mat.get("georreferenciamento"))
    trecho_sigef = f", certificado no SIGEF/INCRA sob o código {_forte(sigef)}" if sigef else ""
    return (
        f"Imóvel rural denominado {_forte(nome_lote)}, objeto da Matrícula nº {_forte(_num_mat(mat))} do Serviço de "
        f"Registro de Imóveis da Comarca de {_forte(comarca)}, situado no município de {_forte(municipio_uf)}, "
        f"com área de {_forte(formatar_area_ha(mat.get('area_ha')) + ' ha')}{trecho_sigef}."
    )


def _medidas_texto(faixa_dominio: str, faixa_nao_edif: str) -> str:
    """Complemento com as larguras informadas (', sendo a faixa de domínio de X m e a área non aedificandi de Y m')."""
    partes = []
    if faixa_dominio:
        partes.append(f"a faixa de domínio de {_forte(faixa_dominio + ' m')}")
    if faixa_nao_edif:
        partes.append(f"a área <em>non aedificandi</em> de {_forte(faixa_nao_edif + ' m')}")
    return f", sendo {' e '.join(partes)}, medidas a partir do eixo/limite da via conforme a legislação do ente competente" if partes else ""


def _declaracoes(plural: bool, trt: str, data_trt: str, faixa_dominio: str = "", faixa_nao_edif: str = "") -> str:
    via = "as vias públicas identificadas" if plural else "a via pública identificada"
    via_curta = "as vias" if plural else "a via"
    itens = [
        f"{via} na Seção 4 {'são bens' if plural else 'é bem'} de uso comum do povo (art. 99, I, do Código Civil), "
        "de titularidade do ente público competente, sem proprietário ou possuidor particular a quem se possa colher anuência;",
        f"{TEXTO_FAIXA_DOMINIO}{_medidas_texto(faixa_dominio, faixa_nao_edif)};",
        f"o perímetro levantado na divisa com {via_curta} não avança sobre a faixa de domínio público, conforme os vértices, "
        f"azimutes e distâncias da Seção 4, extraídos do levantamento georreferenciado executado sob a TRT/ART nº {_forte(trt)}, "
        f"registrada em {_forte(data_trt)};",
        "os proprietários assumem integral responsabilidade civil, administrativa e criminal pelas informações prestadas, "
        "e o responsável técnico, a responsabilidade técnica pela fidelidade dos dados geodésicos apresentados.",
    ]
    linhas = [
        f'<div class="flex items-start gap-2"><span class="font-bold text-slate-800 leading-none">{_ROMANOS[i]} -</span>'
        f"<span>{texto}</span></div>"
        for i, texto in enumerate(itens)
    ]
    return "".join(linhas)


def gerar_declaracao_dispensa_via_html(
    lev_id: int, matricula_id: int, numero_trt: str = None, data_trt: str = "", confrontante_id: int | None = None,
    faixa_dominio_m: str = "", faixa_nao_edificante_m: str = "",
) -> str:
    dados = obter_dados_comuns(lev_id, matricula_id)
    if not dados["owners"]:
        raise ErroDocumento("Não há proprietários vinculados a esta propriedade. Cadastre o proprietário primeiro.")

    faixa_dominio = _medida_m(faixa_dominio_m, "A largura da faixa de domínio")
    faixa_nao_edif = _medida_m(faixa_nao_edificante_m, "A largura da área non aedificandi")
    final_trt, data_trt_f = _trt_do_levantamento(dados, numero_trt, data_trt)
    mat_desenho_id = dados.get("matricula_desenho_id") or matricula_id

    vias = _vias_do_levantamento(lev_id, mat_desenho_id, matricula_id, confrontante_id)
    segs_por_via = obter_segmentos_detalhados_lote(mat_desenho_id, [v["id"] for v in vias], matricula_extra_id=matricula_id)
    vias = [v for v in vias if segs_por_via.get(v["id"])]
    if not vias:
        raise ErroDocumento(
            "Nenhuma divisa com estrada/rodovia encontrada nesta matrícula. Vincule a via como confrontante das divisas "
            "(nome começando por 'Estrada', 'Rodovia' ou 'BR-xxx') antes de emitir a dispensa de anuência."
        )

    plural = len(vias) > 1
    nomes_vias = [v["nome"] for v in vias]
    mats = _mats(dados)
    comarca = _comarca(dados)
    lista_mats = _lista_mats_str(dados, mats)
    rotulo_mat = (dados.get("rotulo_matricula") or "Matrícula nº") if len(mats) > 1 else "Matrícula nº"

    qualificacoes = [qualificar_pessoa(_owner_texto(o), rotulo_erro="O proprietário")[0] for o in dados["owners"]]

    grupos_ass: list[list[dict]] = [[{
        "nome": _nome_prof(dados),
        "legenda": "Responsável Técnico - assinatura digital",
        "linha_extra": esc(_conselho_exibicao(dados)),
    }]]
    for owner in dados["owners"]:
        g = genero_normalizado(owner.get("genero"))
        grupo = [{"nome": owner.get("nome_completo"), "legenda": flex(g, "Proprietário", "Proprietária", "Proprietário(a)") + " - assinatura digital"}]
        if tem_conjuge(owner):
            grupo.append({"nome": owner.get("nome_conjuge"), "legenda": "Cônjuge - assinatura digital"})
        grupos_ass.append(grupo)

    abertura = (
        f"O responsável técnico e os proprietários abaixo qualificados vêm, perante o Serviço de Registro de Imóveis da "
        f"Comarca de {_forte(comarca)}, apresentar a presente declaração e laudo técnico para solicitar a "
        f"<strong>DISPENSA DE ANUÊNCIA</strong> {'dos confrontantes' if plural else 'do confrontante'} "
        f"{_lista_nomes(nomes_vias)}, relativamente ao imóvel descrito na Seção 3."
    )
    requerimento = (
        f"Pelo exposto, requerem seja <strong>DISPENSADA a anuência</strong> {'dos confrontantes' if plural else 'do confrontante'} "
        f"{_lista_nomes(nomes_vias)}, por {'se tratar de vias públicas' if plural else 'tratar-se de via pública'}, "
        f"cujas faixa de domínio e área <em>non aedificandi</em> foram respeitadas, no procedimento relativo à "
        f"{esc(rotulo_mat)} {_forte(lista_mats)}."
    )

    avisos = []
    if not valor_preenchido(dados["lev"].get("registro_profissional")):
        avisos.append("o registro profissional do responsável técnico não está preenchido")
    sem_cpf = [o.get("nome_completo") or "Proprietário" for o in dados["owners"] if not valor_preenchido(o.get("cpf_cnpj"))]
    if sem_cpf:
        avisos.append(f"proprietário(s) sem CPF/CNPJ cadastrado: {', '.join(sem_cpf)}")
    aviso_html = ""
    if avisos:
        aviso_html = (
            '<div class="no-print print:hidden w-full max-w-[21cm] mb-4 p-3 rounded-lg border border-amber-300 bg-amber-50 '
            f'text-amber-900 text-[11px] leading-snug"><strong>Atenção (não impresso):</strong> {esc("; ".join(avisos))}. '
            "Complete o cadastro antes de assinar digitalmente.</div>"
        )

    template = carregar_template("declaracao_dispensa_anuencia_via.html")
    return renderizar_template(template, {
        "aviso_html": Html(aviso_html),
        "nome_lote": dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"],
        "rotulo_vias": " · ".join(nomes_vias),
        "abertura_html": Html(abertura),
        "secao_rt_html": Html(_qualificacao_rt(dados) + "."),
        "secao_proprietarios_html": Html(";<br>".join(qualificacoes) + "."),
        "secao_imovel_html": Html(_secao_imovel(dados, mats)),
        "titulo_secao_vias": "Vias Públicas Confrontantes" if plural else "Via Pública Confrontante",
        "intro_vias_html": Html(
            f"O imóvel confronta com {'as vias públicas' if plural else 'a via pública'} a seguir, nos trechos "
            "descritos pelos vértices, azimutes e distâncias do levantamento georreferenciado:"
        ),
        "secao_vias_html": Html(_secao_vias(vias, segs_por_via, mat_desenho_id, _linha_medidas(faixa_dominio, faixa_nao_edif))),
        "declaracoes_html": Html(_declaracoes(plural, final_trt, data_trt_f, faixa_dominio, faixa_nao_edif)),
        "requerimento_html": Html(requerimento),
        "municipio": _municipio(dados),
        "uf": _uf(dados),
        "data_extenso": obter_data_extenso(),
        "bloco_assinaturas": Html(grade_assinaturas(grupos_ass, margem_topo="mt-2")),
    })
