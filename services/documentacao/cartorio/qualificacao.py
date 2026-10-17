"""Qualificação civil de pessoas nas peças de cartório (fonte única para requerimento, anuência,
desmembramento, ratificação e laudo de fronteira).

Regras:
- Gênero: `pessoas.genero` / `pessoas.genero_conjuge`. NULL/vazio = "não informado". Quando falta o do
  cônjuge, infere-se o OPOSTO do titular (só se o do titular é conhecido). Quando falta o do titular, a
  redação é neutra ("portador(a)"), nunca masculino presumido.
- Nada é inventado: dado ausente vira linha de preenchimento ("______"), nunca "do lar", "solteiro",
  "Comunhão Parcial" ou "None".
- Todo valor vindo do cadastro passa por `esc()`; o retorno é `Html` (já seguro).
"""
from services.documentacao.erros import ErroDocumento
from services.documentacao.cartorio.utils import (
    Html,
    esc,
    eh_cnpj,
    formatar_cpf,
    formatar_rg,
    formatar_regime_bens_extenso,
    norm_texto,
    valor_ou_lacuna,
    valor_preenchido,
)

LACUNA_REGIME = "_" * 22
LACUNA_ESTADO_CIVIL = "_" * 14


# ── Gênero ──────────────────────────────────────────────────────────────────────

def genero_normalizado(raw) -> str | None:
    """'M'/'F' ou None (não informado)."""
    g = norm_texto(raw)
    if g in ("m", "masculino", "homem"):
        return "M"
    if g in ("f", "feminino", "mulher"):
        return "F"
    return None


def oposto(g: str | None) -> str | None:
    return {"M": "F", "F": "M"}.get(g)


def flex(g: str | None, masc: str, fem: str, neutro: str) -> str:
    return {"M": masc, "F": fem}.get(g, neutro)


def genero_plural(generos: list) -> str | None:
    """Gênero de um grupo: 'F' só se todas forem F; 'M' (genérico) se todos conhecidos e algum M;
    None (neutro) se algum for desconhecido."""
    if not generos or any(g is None for g in generos):
        return None
    return "F" if all(g == "F" for g in generos) else "M"


def genero_conjuge_efetivo(genero_conjuge_raw, genero_titular: str | None) -> str | None:
    """Gênero real do cônjuge; se ausente, o oposto do titular (quando o titular é conhecido)."""
    return genero_normalizado(genero_conjuge_raw) or oposto(genero_titular)


# ── Estado civil ────────────────────────────────────────────────────────────────

def categoria_estado_civil(raw) -> str:
    """'solteiro' | 'casado' | 'uniao_estavel' | 'divorciado' | 'viuvo' | 'separado' | '' (vazio/desconhecido)."""
    n = norm_texto(raw)
    if not n:
        return ""
    if "uniao" in n or "estavel" in n:
        return "uniao_estavel"
    if "casad" in n:
        return "casado"
    if "solteir" in n:
        return "solteiro"
    if "divorc" in n:
        return "divorciado"
    if "viuv" in n:
        return "viuvo"
    if "separad" in n:
        return "separado"
    return ""


def rotulo_estado_civil(raw, genero: str | None) -> str:
    """Estado civil por extenso, flexionado pelo gênero. Vazio -> '' (o chamador decide a lacuna)."""
    cat = categoria_estado_civil(raw)
    if not cat:
        return valor_preenchido(raw)  # texto livre fora do padrão: mantém como está
    return {
        "solteiro": flex(genero, "solteiro", "solteira", "solteiro(a)"),
        "casado": flex(genero, "casado", "casada", "casado(a)"),
        "uniao_estavel": "convivente em união estável",
        "divorciado": flex(genero, "divorciado", "divorciada", "divorciado(a)"),
        "viuvo": flex(genero, "viúvo", "viúva", "viúvo(a)"),
        "separado": flex(genero, "separado judicialmente", "separada judicialmente", "separado(a) judicialmente"),
    }[cat]


def tem_conjuge(p: dict) -> bool:
    """Casado/união estável, ou estado civil em branco mas com cônjuge cadastrado."""
    cat = categoria_estado_civil(p.get("estado_civil"))
    if cat in ("casado", "uniao_estavel"):
        return True
    return cat == "" and bool(valor_preenchido(p.get("nome_conjuge")))


def flexionar_nacionalidade(raw, genero: str | None) -> str:
    n = valor_preenchido(raw) or "brasileiro(a)"
    if norm_texto(n) in ("brasileiro", "brasileira", "brasileiro(a)", "brasileiro/a", "brasileiro (a)"):
        return flex(genero, "brasileiro", "brasileira", "brasileiro(a)")
    return n


# ── Pessoa: normalização ────────────────────────────────────────────────────────

def normalizar_pessoa(d: dict) -> dict:
    """Aceita linhas de `pessoas`/`confrontantes`/proprietários (nome|nome_completo, rg|rg_ie) e padroniza chaves."""
    return {
        "nome": d.get("nome") or d.get("nome_completo"),
        "cpf_cnpj": d.get("cpf_cnpj"),
        "rg": d.get("rg") or d.get("rg_ie"),
        "genero": d.get("genero"),
        "nacionalidade": d.get("nacionalidade"),
        "profissao": d.get("profissao"),
        "estado_civil": d.get("estado_civil"),
        "regime_bens": d.get("regime_bens"),
        "endereco_completo": d.get("endereco_completo"),
        "nome_conjuge": d.get("nome_conjuge"),
        "cpf_conjuge": d.get("cpf_conjuge"),
        "rg_conjuge": d.get("rg_conjuge"),
        "genero_conjuge": d.get("genero_conjuge"),
        "nacionalidade_conjuge": d.get("nacionalidade_conjuge"),
        "profissao_conjuge": d.get("profissao_conjuge"),
    }


def _strong(texto_escapado: str) -> str:
    return f'<strong class="text-slate-900">{texto_escapado}</strong>'


def rotulo_doc(nome_escapado: str) -> str:
    """Nome em destaque para identificar de quem é o documento (no lugar de "este"/"aquele")."""
    return _strong(nome_escapado)


def _clausula_docs(ref: str, g: str | None, rg: str, cpf: str) -> str:
    portador = flex(g, "portador", "portadora", "portador(a)")
    inscrito = flex(g, "inscrito", "inscrita", "inscrito(a)")
    return f"{ref} {portador} da cédula de identidade RG nº {rg} e {inscrito} no CPF sob o nº {cpf}"


def qualificar_pessoa(
    d: dict,
    *,
    rotulo_erro: str = "A pessoa",
    regime_obrigatorio: bool = False,
    destaque_docs: bool = False,
    domicilio_padrao=None,
) -> tuple[Html, dict]:
    """Qualificação civil completa (pessoa física, casal ou pessoa jurídica).

    Devolve (html_seguro, info) com info = {"pj", "casal", "uniao", "genero", "genero_conjuge", "nome_conjuge"}.
    `regime_obrigatorio`: casado/união estável sem regime de bens -> ErroDocumento (422) em vez de lacuna.
    """
    p = normalizar_pessoa(d)
    nome = valor_ou_lacuna(p["nome"], 35)
    nome_s = _strong(nome)
    destaque = (lambda x: _strong(x)) if destaque_docs else (lambda x: x)

    cpf = destaque(valor_ou_lacuna(formatar_cpf(p["cpf_cnpj"]), 18))
    rg = destaque(valor_ou_lacuna(formatar_rg(p["rg"]), 15))
    dom = destaque(valor_ou_lacuna(valor_preenchido(p["endereco_completo"]) or valor_preenchido(domicilio_padrao), 50))

    # Pessoa jurídica (CNPJ): sem RG, estado civil ou cônjuge.
    if eh_cnpj(p["cpf_cnpj"]):
        texto = (
            f"{nome_s}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {cpf}, com sede em {dom}, "
            f"neste ato representada por {'_' * 35}, {'_' * 25} (nome e qualificação do representante legal)"
        )
        info = {"pj": True, "casal": False, "uniao": False, "genero": "F", "genero_conjuge": None, "nome_conjuge": ""}
        return Html(texto), info

    g = genero_normalizado(p["genero"])
    nac = esc(flexionar_nacionalidade(p["nacionalidade"], g))
    prof = valor_ou_lacuna(p["profissao"], 20)
    cat = categoria_estado_civil(p["estado_civil"])

    if not tem_conjuge(p):
        est = esc(rotulo_estado_civil(p["estado_civil"], g)) or LACUNA_ESTADO_CIVIL
        if not est:
            est = LACUNA_ESTADO_CIVIL
        residente = flex(g, "residente e domiciliado", "residente e domiciliada", "residente e domiciliado(a)")
        inscrito = flex(g, "inscrito", "inscrita", "inscrito(a)")
        portador = flex(g, "portador", "portadora", "portador(a)")
        texto = (
            f"{nome_s}, {nac}, {prof}, {est}, {residente} em {dom}, "
            f"{inscrito} no CPF/MF sob o nº {cpf} e {portador} da cédula de identidade RG nº {rg}"
        )
        info = {"pj": False, "casal": False, "uniao": False, "genero": g, "genero_conjuge": None, "nome_conjuge": ""}
        return Html(texto), info

    # Casal (casamento ou união estável)
    uniao = cat == "uniao_estavel"
    regime = formatar_regime_bens_extenso(p["regime_bens"])
    if not regime:
        if regime_obrigatorio and cat in ("casado", "uniao_estavel"):
            raise ErroDocumento(
                f"{rotulo_erro} '{valor_preenchido(p['nome']) or '(sem nome)'}' está qualificado(a) como casado(a) ou em união estável, "
                "mas o regime de bens não foi informado. Edite e atualize a qualificação no cadastro."
            )
        regime_txt = LACUNA_REGIME
    else:
        regime_txt = esc(regime)

    gc = genero_conjuge_efetivo(p["genero_conjuge"], g)
    nome_c_raw = valor_preenchido(p["nome_conjuge"])
    nome_c = valor_ou_lacuna(nome_c_raw, 35)
    nome_c_s = _strong(nome_c)
    nac_c = esc(flexionar_nacionalidade(p["nacionalidade_conjuge"], gc))
    prof_c = valor_ou_lacuna(p["profissao_conjuge"], 25)
    rg_c = destaque(valor_ou_lacuna(formatar_rg(p["rg_conjuge"]), 15))
    cpf_c = destaque(valor_ou_lacuna(formatar_cpf(p["cpf_conjuge"]), 18))

    if uniao:
        rel = flex(gc, "seu companheiro", "sua companheira", "seu(sua) companheiro(a)")
        vinculo = f"que convivem em união estável sob o regime de {regime_txt}"
    else:
        rel = flex(gc, "seu esposo", "sua esposa", "seu(sua) cônjuge")
        casados = flex(genero_plural([g, gc]), "casados", "casadas", "casados(as)")
        vinculo = f"{casados} sob o regime de {regime_txt}"

    # "ele/ela" só quando os gêneros são conhecidos e distintos; senão, o nome identifica de quem é cada documento.
    if g and gc and g != gc:
        ref_t = "ele" if g == "M" else "ela"
        ref_c = "ele" if gc == "M" else "ela"
    else:
        ref_t, ref_c = rotulo_doc(nome), rotulo_doc(nome_c)

    gp = genero_plural([g, gc])
    ambos = flex(gp, "ambos residentes e domiciliados", "ambas residentes e domiciliadas", "ambos(as) residentes e domiciliados(as)")

    texto = (
        f"{nome_s}, {nac}, {prof}, e {rel}, {nome_c_s}, {nac_c}, {prof_c}, {vinculo}, "
        f"{_clausula_docs(ref_t, g, rg, cpf)}, {_clausula_docs(ref_c, gc, rg_c, cpf_c)}, "
        f"{ambos} em {dom}"
    )
    info = {"pj": False, "casal": True, "uniao": uniao, "genero": g, "genero_conjuge": gc, "nome_conjuge": nome_c_raw}
    return Html(texto), info


# ── Proprietários (requerentes) ─────────────────────────────────────────────────

def legenda_requerente(g: str | None) -> str:
    return flex(g, "Proprietário Requerente", "Proprietária Requerente", "Proprietário(a) Requerente")


def legenda_conjuge_requerente(p: dict, g: str | None) -> str:
    """'Esposa do Proprietário Requerente', 'Esposo da Proprietária Requerente', 'Companheiro(a) ...' conforme o gênero real."""
    gc = genero_conjuge_efetivo(p.get("genero_conjuge"), g)
    uniao = categoria_estado_civil(p.get("estado_civil")) == "uniao_estavel"
    if uniao:
        parente = flex(gc, "Companheiro", "Companheira", "Companheiro(a)")
    else:
        parente = flex(gc, "Esposo", "Esposa", "Cônjuge")
    do_req = flex(g, "do Proprietário Requerente", "da Proprietária Requerente", "do(a) Proprietário(a) Requerente")
    return f"{parente} {do_req}"


def descrever_proprietarios_curto(owners: list) -> Html:
    """'A casada com B e C' (para o texto 'de propriedade de ...'); gênero real, neutro se desconhecido."""
    partes = []
    for o in owners:
        nome = esc(o.get("nome_completo") or o.get("nome"))
        g = genero_normalizado(o.get("genero"))
        if tem_conjuge(o) and valor_preenchido(o.get("nome_conjuge")):
            if categoria_estado_civil(o.get("estado_civil")) == "uniao_estavel":
                termo = "convivente em união estável com"
            else:
                termo = flex(g, "casado com", "casada com", "casado(a) com")
            partes.append(f"{nome} {termo} {esc(o.get('nome_conjuge'))}")
        else:
            partes.append(nome)
    return Html(" e ".join(partes))


def assinatura_div(
    nome,
    legenda,
    *,
    container: str = "min-w-[170px] flex-1 max-w-[250px]",
    linha: str = "mt-3 mb-1",
    nome_cls: str = "text-[11px] font-bold text-slate-900 text-center uppercase tracking-wide leading-tight",
    legenda_cls: str = "text-[9px] text-slate-500 text-center font-medium mt-0.5",
    linha_extra: str = "",
) -> str:
    """Bloco de assinatura (linha + nome + legenda), tudo escapado. Nome vazio vira linha de preenchimento."""
    nome_s = valor_ou_lacuna(nome, 32)
    extra = f'\n            <div class="text-[9.5px] text-slate-600 text-center font-medium mt-0.5 font-mono">{linha_extra}</div>' if linha_extra else ""
    return f"""
        <div class="flex flex-col items-center {container}">
            <div class="w-full border-t border-slate-400 {linha}"></div>
            <div class="{nome_cls}">{nome_s}</div>{extra}
            <div class="{legenda_cls}">{esc(legenda)}</div>
        </div>
        """


def qualificacao_resumida(d: dict) -> Html:
    """'NOME, inscrito(a) no CPF nº X e portador(a) do RG nº Y' (declarações curtas). PJ: só o CNPJ."""
    p = normalizar_pessoa(d)
    nome_s = _strong(valor_ou_lacuna(p["nome"], 35))
    cpf = valor_ou_lacuna(formatar_cpf(p["cpf_cnpj"]), 18)
    if eh_cnpj(p["cpf_cnpj"]):
        return Html(f"{nome_s}, pessoa jurídica inscrita no CNPJ nº {cpf}")
    g = genero_normalizado(p["genero"])
    rg = valor_ou_lacuna(formatar_rg(p["rg"]), 15)
    return Html(
        f"{nome_s}, {flex(g, 'inscrito', 'inscrita', 'inscrito(a)')} no CPF nº {cpf} "
        f"e {flex(g, 'portador', 'portadora', 'portador(a)')} do RG nº {rg}"
    )


def domicilio_do_proprietario(owner: dict) -> str:
    """Endereço do cadastro + 'cidade-UF' do cliente, sem inventar nada quando faltar."""
    partes = []
    end = valor_preenchido(owner.get("endereco_completo"))
    if end:
        partes.append(end)
    cidade, estado = valor_preenchido(owner.get("cidade")), valor_preenchido(owner.get("estado"))
    if cidade and estado:
        partes.append(f"{cidade}-{estado}")
    return ", ".join(partes)
