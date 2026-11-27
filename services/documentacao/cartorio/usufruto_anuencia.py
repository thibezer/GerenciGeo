"""Módulo anexo e isolado para Declaração de Reconhecimento de Limites (DRL)
em imóveis confrontantes com reserva de usufruto e doação da nua propriedade.

Mantém-se desacoplado do fluxo principal (`anuencias.py`) até a integração final,
reaproveitando os utilitários de qualificação civil, tabela SGL/GMS e anexo gráfico.
"""
import logging
import re

from database.connection import DatabaseManager, execute_query
from services.documentacao.cartorio.anuencias import (
    _prefetch_confrontantes,
    _rotulo_lote,
    _termos_declarantes,
    extrair_corpo_declaracao,
    gerar_anexo_grafico_html,
)
from services.documentacao.cartorio.data_fetcher import (
    gerar_tabela_divisas_html,
    obter_dados_comuns,
)
from services.documentacao.cartorio.laudos_imovel import gerar_js_inicializacao_mapas
from services.documentacao.cartorio.qualificacao import (
    descrever_proprietarios_curto,
    flex,
    genero_normalizado,
    genero_plural,
    grade_assinaturas,
    legenda_conjuge_requerente,
    legenda_requerente,
    qualificar_pessoa,
    tem_conjuge,
)
from services.documentacao.cartorio.utils import (
    Html,
    LACUNA_TRT,
    apenas_digitos,
    carregar_template,
    esc,
    norm_texto,
    obter_data_extenso,
    renderizar_template,
    uf_exibicao,
    valor_preenchido,
)
from services.documentacao.erros import ErroDocumento, NaoEncontrado
from utils.validadores import sql_doc_normalizado

logger = logging.getLogger(__name__)

PAPEIS_VALIDOS = (
    "USUFRUTUARIO",
    "DONATARIO",
    "NU_PROPRIETARIO",
    "COPROPRIETARIO",
    "PROPRIETARIO",
    "POSSUIDOR",
)

_SINONIMOS_PAPEL = {
    "usufrutuario": "USUFRUTUARIO",
    "usufrutuaria": "USUFRUTUARIO",
    "donatario": "DONATARIO",
    "donataria": "DONATARIO",
    "nu proprietario": "NU_PROPRIETARIO",
    "nu proprietaria": "NU_PROPRIETARIO",
    "nu-proprietario": "NU_PROPRIETARIO",
    "nu-proprietaria": "NU_PROPRIETARIO",
    "coproprietario": "COPROPRIETARIO",
    "coproprietaria": "COPROPRIETARIO",
    "condomino": "COPROPRIETARIO",
    "proprietario": "PROPRIETARIO",
    "proprietaria": "PROPRIETARIO",
    "possuidor": "POSSUIDOR",
    "possuidora": "POSSUIDOR",
}


_ROTULO_ERRO_PAPEL = {
    "USUFRUTUARIO": "usufrutuário",
    "DONATARIO": "donatário",
    "NU_PROPRIETARIO": "nu-proprietário",
    "COPROPRIETARIO": "coproprietário",
    "PROPRIETARIO": "proprietário",
    "POSSUIDOR": "possuidor",
}


def normalizar_papel(papel: str | None) -> str:
    """Normaliza e valida o papel jurídico do envolvido na matrícula confrontante."""
    bruto = valor_preenchido(papel)
    if not bruto:
        return "DONATARIO"
    chave = bruto.upper().strip()
    if chave in PAPEIS_VALIDOS:
        return chave
    norm = norm_texto(bruto)
    if norm in _SINONIMOS_PAPEL:
        return _SINONIMOS_PAPEL[norm]
    raise ErroDocumento(
        f"Papel jurídico inválido '{bruto}'. Valores aceitos: {', '.join(PAPEIS_VALIDOS)}."
    )


def listar_envolvidos_usufruto(confrontante_id: int) -> list[dict]:
    """Lista os envolvidos (usufrutuários, donatários/nu-proprietários) vinculados ao confrontante."""
    rows = execute_query(
        """
        SELECT *
        FROM confrontante_envolvidos_usufruto
        WHERE confrontante_id = ?
        ORDER BY ordem ASC, id ASC
        """,
        params=(confrontante_id,),
        fetch_all=True,
    )
    return [dict(r) for r in (rows or [])]


def _upsert_pessoa_envolvido(cursor, env: dict) -> int | None:
    """Vincula ou cria/atualiza pessoa em `pessoas` quando houver CPF/CNPJ válido."""
    cpf_norm = valor_preenchido(env.get("cpf_cnpj")) or None
    cpf_limpo = apenas_digitos(cpf_norm)
    if not cpf_limpo:
        return env.get("pessoa_id")

    nome = valor_preenchido(env.get("nome"))
    cursor.execute(
        f"SELECT id FROM pessoas WHERE {sql_doc_normalizado('cpf_cnpj')} = ?",
        (cpf_limpo,),
    )
    row = cursor.fetchone()
    if row:
        pessoa_id = row[0]
        cursor.execute(
            """
            UPDATE pessoas
            SET nome = ?, rg = COALESCE(?, rg), rg_orgao = COALESCE(?, rg_orgao), rg_uf = COALESCE(?, rg_uf),
                genero = ?, nacionalidade = ?, profissao = COALESCE(?, profissao), estado_civil = ?, regime_bens = ?,
                endereco_completo = COALESCE(?, endereco_completo), nome_conjuge = ?, cpf_conjuge = ?, rg_conjuge = COALESCE(?, rg_conjuge),
                rg_orgao_conjuge = COALESCE(?, rg_orgao_conjuge), rg_uf_conjuge = COALESCE(?, rg_uf_conjuge),
                genero_conjuge = ?, nacionalidade_conjuge = ?, profissao_conjuge = COALESCE(?, profissao_conjuge)
            WHERE id = ?
            """,
            (
                nome,
                valor_preenchido(env.get("rg")) or None,
                valor_preenchido(env.get("rg_orgao")) or None,
                valor_preenchido(env.get("rg_uf")) or None,
                genero_normalizado(env.get("genero")) or "M",
                valor_preenchido(env.get("nacionalidade")) or "brasileiro(a)",
                valor_preenchido(env.get("profissao")) or None,
                valor_preenchido(env.get("estado_civil")) or None,
                valor_preenchido(env.get("regime_bens")) or None,
                valor_preenchido(env.get("endereco_completo")) or None,
                valor_preenchido(env.get("nome_conjuge")) or None,
                valor_preenchido(env.get("cpf_conjuge")) or None,
                valor_preenchido(env.get("rg_conjuge")) or None,
                valor_preenchido(env.get("rg_orgao_conjuge")) or None,
                valor_preenchido(env.get("rg_uf_conjuge")) or None,
                genero_normalizado(env.get("genero_conjuge")) or "F",
                valor_preenchido(env.get("nacionalidade_conjuge")) or "brasileiro(a)",
                valor_preenchido(env.get("profissao_conjuge")) or None,
                pessoa_id,
            ),
        )
        return pessoa_id

    cursor.execute(
        """
        INSERT INTO pessoas (
            nome, cpf_cnpj, rg, rg_orgao, rg_uf, genero, nacionalidade, profissao, estado_civil,
            regime_bens, endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge,
            rg_orgao_conjuge, rg_uf_conjuge, genero_conjuge, nacionalidade_conjuge, profissao_conjuge
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            nome,
            cpf_norm,
            valor_preenchido(env.get("rg")) or None,
            valor_preenchido(env.get("rg_orgao")) or None,
            valor_preenchido(env.get("rg_uf")) or None,
            genero_normalizado(env.get("genero")) or "M",
            valor_preenchido(env.get("nacionalidade")) or "brasileiro(a)",
            valor_preenchido(env.get("profissao")) or None,
            valor_preenchido(env.get("estado_civil")) or None,
            valor_preenchido(env.get("regime_bens")) or None,
            valor_preenchido(env.get("endereco_completo")) or None,
            valor_preenchido(env.get("nome_conjuge")) or None,
            valor_preenchido(env.get("cpf_conjuge")) or None,
            valor_preenchido(env.get("rg_conjuge")) or None,
            valor_preenchido(env.get("rg_orgao_conjuge")) or None,
            valor_preenchido(env.get("rg_uf_conjuge")) or None,
            genero_normalizado(env.get("genero_conjuge")) or "F",
            valor_preenchido(env.get("nacionalidade_conjuge")) or "brasileiro(a)",
            valor_preenchido(env.get("profissao_conjuge")) or None,
        ),
    )
    return cursor.lastrowid


def salvar_envolvidos_usufruto_transacao(cursor, confrontante_id: int, envolvidos: list[dict]) -> list[int]:
    """Substitui os envolvidos de usufruto de um confrontante dentro de uma transação aberta."""
    cursor.execute("DELETE FROM confrontante_envolvidos_usufruto WHERE confrontante_id = ?", (confrontante_id,))
    ids_criados: list[int] = []
    for idx, env in enumerate(envolvidos or []):
        nome = valor_preenchido(env.get("nome"))
        if not nome:
            continue
        papel = normalizar_papel(env.get("papel"))
        pessoa_id = _upsert_pessoa_envolvido(cursor, env)
        assina = 0 if env.get("assina") in (0, False) else 1
        conjuge_assina = 0 if env.get("conjuge_assina") in (0, False) else 1
        ordem = int(env.get("ordem")) if env.get("ordem") is not None else idx

        cursor.execute(
            """
            INSERT INTO confrontante_envolvidos_usufruto (
                confrontante_id, pessoa_id, papel, nome, cpf_cnpj, rg, rg_orgao, rg_uf,
                genero, nacionalidade, profissao, estado_civil, regime_bens, endereco_completo,
                nome_conjuge, cpf_conjuge, rg_conjuge, rg_orgao_conjuge, rg_uf_conjuge,
                genero_conjuge, nacionalidade_conjuge, profissao_conjuge,
                assina, conjuge_assina, ordem, observacao
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                confrontante_id,
                pessoa_id,
                papel,
                nome,
                valor_preenchido(env.get("cpf_cnpj")) or None,
                valor_preenchido(env.get("rg")) or None,
                valor_preenchido(env.get("rg_orgao")) or None,
                valor_preenchido(env.get("rg_uf")) or None,
                genero_normalizado(env.get("genero")) or "M",
                valor_preenchido(env.get("nacionalidade")) or "brasileiro(a)",
                valor_preenchido(env.get("profissao")) or None,
                valor_preenchido(env.get("estado_civil")) or None,
                valor_preenchido(env.get("regime_bens")) or None,
                valor_preenchido(env.get("endereco_completo")) or None,
                valor_preenchido(env.get("nome_conjuge")) or None,
                valor_preenchido(env.get("cpf_conjuge")) or None,
                valor_preenchido(env.get("rg_conjuge")) or None,
                valor_preenchido(env.get("rg_orgao_conjuge")) or None,
                valor_preenchido(env.get("rg_uf_conjuge")) or None,
                genero_normalizado(env.get("genero_conjuge")) or "F",
                valor_preenchido(env.get("nacionalidade_conjuge")) or "brasileiro(a)",
                valor_preenchido(env.get("profissao_conjuge")) or None,
                assina,
                conjuge_assina,
                ordem,
                valor_preenchido(env.get("observacao")) or None,
            ),
        )
        ids_criados.append(cursor.lastrowid)
    return ids_criados


def salvar_envolvidos_usufruto(confrontante_id: int, envolvidos: list[dict]) -> list[dict]:
    """Persiste a lista completa de envolvidos (usufrutuários e donatários) para o confrontante."""
    row = execute_query("SELECT id FROM confrontantes WHERE id = ?", params=(confrontante_id,), fetch_one=True)
    if not row:
        raise NaoEncontrado(f"Confrontante ID {confrontante_id} não encontrado.")
    with DatabaseManager() as conn:
        cursor = conn.cursor()
        salvar_envolvidos_usufruto_transacao(cursor, confrontante_id, envolvidos)
        conn.commit()
    return listar_envolvidos_usufruto(confrontante_id)


def _rotulo_papel_qualificacao(papel: str, genero: str | None) -> str:
    if papel == "USUFRUTUARIO":
        return flex(genero, "usufrutuário", "usufrutuária", "usufrutuário(a)")
    if papel == "DONATARIO":
        return flex(
            genero,
            "donatário (nu-proprietário)",
            "donatária (nu-proprietária)",
            "donatário(a) (nu-proprietário(a))",
        )
    if papel == "NU_PROPRIETARIO":
        return flex(genero, "nu-proprietário", "nu-proprietária", "nu-proprietário(a)")
    if papel == "COPROPRIETARIO":
        return flex(genero, "coproprietário", "coproprietária", "coproprietário(a)")
    if papel == "PROPRIETARIO":
        return flex(genero, "proprietário", "proprietária", "proprietário(a)")
    return flex(genero, "possuidor", "possuidora", "possuidor(a)")


def _legenda_assinatura_envolvido(
    papel: str,
    genero: str | None,
    *,
    eh_conjuge: bool = False,
    genero_conjuge: str | None = None,
    casal_co_usufrutuario: bool = False,
) -> str:
    if eh_conjuge:
        if papel == "USUFRUTUARIO" and casal_co_usufrutuario:
            return flex(genero_conjuge, "Usufrutuário Anuente", "Usufrutuária Anuente", "Usufrutuário(a) Anuente")
        if papel == "USUFRUTUARIO":
            return flex(genero, "Cônjuge do Usufrutuário Anuente", "Cônjuge da Usufrutuária Anuente", "Cônjuge do(a) Usufrutuário(a) Anuente")
        if papel == "DONATARIO":
            return flex(genero, "Cônjuge do Donatário Anuente", "Cônjuge da Donatária Anuente", "Cônjuge do(a) Donatário(a) Anuente")
        if papel == "NU_PROPRIETARIO":
            return flex(genero, "Cônjuge do Nu-proprietário Anuente", "Cônjuge da Nu-proprietária Anuente", "Cônjuge do(a) Nu-proprietário(a) Anuente")
        return "Cônjuge Anuente"

    if papel == "USUFRUTUARIO":
        return flex(genero, "Usufrutuário Anuente", "Usufrutuária Anuente", "Usufrutuário(a) Anuente")
    if papel == "DONATARIO":
        return flex(
            genero,
            "Donatário (Nu-proprietário) Anuente",
            "Donatária (Nu-proprietária) Anuente",
            "Donatário(a) (Nu-proprietário(a)) Anuente",
        )
    if papel == "NU_PROPRIETARIO":
        return flex(genero, "Nu-proprietário Anuente", "Nu-proprietária Anuente", "Nu-proprietário(a) Anuente")
    if papel == "COPROPRIETARIO":
        return "Coproprietário(a) Anuente"
    if papel == "PROPRIETARIO":
        return flex(genero, "Proprietário Anuente", "Proprietária Anuente", "Proprietário(a) Anuente")
    return flex(genero, "Possuidor Anuente", "Possuidora Anuente", "Possuidor(a) Anuente")


def _conjuge_assina_envolvido(env: dict) -> bool:
    """Respeita explicitamente `conjuge_assina` (inclusive em comunhão parcial com cláusula de incomunicabilidade)."""
    if env.get("conjuge_assina") in (0, False):
        return False
    return tem_conjuge(env) and bool(valor_preenchido(env.get("nome_conjuge")))


def _resumo_qualidade_juridica(papeis_ativos: set[str], genero_grupo: str | None, plural: bool) -> str:
    """Qualidade jurídica de todos os papéis presentes ("usufrutuários, donatários (nu-proprietários) e proprietário")."""
    termos: list[tuple[str, str, str, str]] = []  # (masc, fem, indefinido, plural fixo quando há mais de um papel)
    if "USUFRUTUARIO" in papeis_ativos:
        termos.append(("usufrutuário", "usufrutuária", "usufrutuário(a)", "usufrutuários"))
    if "DONATARIO" in papeis_ativos:
        termos.append((
            "donatário (nu-proprietário)", "donatária (nu-proprietária)",
            "donatário(a) (nu-proprietário(a))", "donatários (nu-proprietários)",
        ))
    elif "NU_PROPRIETARIO" in papeis_ativos:
        termos.append(("nu-proprietário", "nu-proprietária", "nu-proprietário(a)", "nu-proprietários"))
    if "PROPRIETARIO" in papeis_ativos:
        termos.append(("proprietário", "proprietária", "proprietário(a)", "proprietários"))
    if "COPROPRIETARIO" in papeis_ativos:
        termos.append(("coproprietário", "coproprietária", "coproprietário(a)", "coproprietários"))
    if "POSSUIDOR" in papeis_ativos:
        termos.append(("possuidor", "possuidora", "possuidor(a)", "possuidores"))
    if not termos:
        termos.append(("proprietário", "proprietária", "proprietário(a)", "proprietários"))

    if len(termos) > 1:
        partes = [t[3] for t in termos]  # vários papéis: plural fixo, sem flexão de gênero
    elif plural:
        m, f, i, pl = termos[0]
        # plural flexionado só onde o gênero muda a forma (usufrutuários/proprietários/possuidores)
        partes = [flex(genero_grupo, pl, pl[:-2] + "as" if pl.endswith("os") else pl, pl[:-2] + "os(as)" if pl.endswith("os") else pl)]
    else:
        m, f, i, _ = termos[0]
        partes = [flex(genero_grupo, m, f, i)]
    if len(partes) == 1:
        return partes[0]
    return ", ".join(partes[:-1]) + " e " + partes[-1]


def montar_qualificacao_e_assinaturas_usufruto(
    envolvidos: list[dict],
    owners: list[dict],
    *,
    domicilio_padrao: str | None = None,
) -> dict:
    """Qualifica usufrutuários e donatários (nu-proprietários) com seus cônjuges e monta o bloco de assinaturas."""
    ativos = [e for e in (envolvidos or []) if e.get("assina") not in (0, False) and valor_preenchido(e.get("nome"))]
    if not ativos:
        raise ErroDocumento("Nenhum envolvido (usufrutuário ou donatário) ativo para assinar a declaração.")

    # Ordena usufrutuários antes dos donatários/nu-proprietários preservando a ordem relativa
    prioridade = {"USUFRUTUARIO": 0, "PROPRIETARIO": 1, "DONATARIO": 2, "NU_PROPRIETARIO": 3, "COPROPRIETARIO": 4, "POSSUIDOR": 5}
    ordenados = sorted(ativos, key=lambda e: (prioridade.get(normalizar_papel(e.get("papel")), 9), e.get("ordem") or 0))

    qualificacoes: list[str] = []
    infos: list[tuple[dict, dict, str]] = []
    generos: list[str | None] = []
    papeis_ativos: set[str] = set()

    for env in ordenados:
        papel = normalizar_papel(env.get("papel"))
        papeis_ativos.add(papel)
        conjuge_assina = _conjuge_assina_envolvido(env)
        sem_conjuge = not conjuge_assina and not valor_preenchido(env.get("nome_conjuge"))
        rotulo_err = f"O {_ROTULO_ERRO_PAPEL.get(papel, 'envolvido')}"

        qualif_html, info = qualificar_pessoa(
            env,
            rotulo_erro=rotulo_err,
            regime_obrigatorio=True,
            domicilio_padrao=domicilio_padrao,
            sem_conjuge=sem_conjuge,
        )
        info["conjuge_assina"] = conjuge_assina
        if info["casal"] and conjuge_assina:
            rotulo_ind = (
                "usufrutuários"
                if papel == "USUFRUTUARIO" and env.get("casal_co_usufrutuario", True)
                else _rotulo_papel_qualificacao(papel, info["genero"])
            )
        else:
            rotulo_ind = _rotulo_papel_qualificacao(papel, info["genero"])

        qualificacoes.append(f"{qualif_html}, na qualidade de <strong>{esc(rotulo_ind)}</strong>")
        infos.append((env, info, papel))

        generos.append(info["genero"])
        if info["casal"] and conjuge_assina:
            generos.append(info["genero_conjuge"])

    if len(qualificacoes) > 1:
        qualificacao_html = Html("; ".join(qualificacoes[:-1]) + f"; e {qualificacoes[-1]}")
    else:
        qualificacao_html = Html(qualificacoes[0])

    plural = len(infos) > 1 or any(info["casal"] and info.get("conjuge_assina") for _, info, _ in infos)
    genero_grupo = genero_plural(generos) if plural else infos[0][1]["genero"]
    termos = _termos_declarantes(plural, genero_grupo)
    qualidade_resumo = _resumo_qualidade_juridica(papeis_ativos, genero_grupo, plural)

    grupos_ass: list[list[dict]] = []
    for owner in owners or []:
        g_owner = genero_normalizado(owner.get("genero"))
        grupo = [{"nome": owner.get("nome_completo"), "legenda": legenda_requerente(g_owner)}]
        if tem_conjuge(owner):
            grupo.append({"nome": owner.get("nome_conjuge"), "legenda": legenda_conjuge_requerente(owner, g_owner)})
        grupos_ass.append(grupo)

    for env, info, papel in infos:
        casal_usufr = papel == "USUFRUTUARIO" and env.get("casal_co_usufrutuario", True)
        grupo = [
            {
                "nome": env.get("nome"),
                "legenda": _legenda_assinatura_envolvido(papel, info["genero"]),
            }
        ]
        if info["casal"] and info.get("conjuge_assina"):
            grupo.append(
                {
                    "nome": info["nome_conjuge"],
                    "legenda": _legenda_assinatura_envolvido(
                        papel,
                        info["genero"],
                        eh_conjuge=True,
                        genero_conjuge=info["genero_conjuge"],
                        casal_co_usufrutuario=casal_usufr,
                    ),
                }
            )
        grupos_ass.append(grupo)

    bloco_assinaturas_html = Html(grade_assinaturas(grupos_ass, margem_topo="mt-3"))
    return {
        "qualificacao_html": qualificacao_html,
        "qualidade_resumo": qualidade_resumo,
        "grupos_assinaturas": grupos_ass,
        "bloco_assinaturas_html": bloco_assinaturas_html,
        "termos": termos,
    }


def gerar_anexo_usufruto_drl_html(
    lev_id: int,
    matricula_id: int,
    confrontante_id: int,
    envolvidos: list[dict] | None = None,
    apenas_corpo: bool = False,
    dados_comuns: dict | None = None,
    retornar_map_data: bool = False,
    *,
    precarregado: dict | None = None,
    contexto_mapa: dict | None = None,
) -> str | tuple[str, dict]:
    """Gera a DRL completa contemplando usufrutuários e donatários (nu-proprietários).

    Aceita os mesmos parâmetros de montagem da anuência comum (corpo/lote, dados e mapa pré-carregados),
    pois a anuência comum delega para cá quando o confrontante tem envolvidos de usufruto.
    """
    dados = dados_comuns if dados_comuns is not None else obter_dados_comuns(lev_id, matricula_id)
    mat_desenho_id = dados.get("matricula_desenho_id") or matricula_id
    if precarregado is None:
        precarregado = _prefetch_confrontantes(lev_id, mat_desenho_id, [confrontante_id], matricula_id=matricula_id)
    pre = precarregado.get(confrontante_id)
    if not pre or not pre.get("conf"):
        raise NaoEncontrado(f"Confrontante ID {confrontante_id} não encontrado para este levantamento.")
    conf = pre["conf"]

    lista_env = envolvidos if envolvidos is not None else listar_envolvidos_usufruto(confrontante_id)
    if not lista_env:
        raise ErroDocumento(
            f"Nenhum envolvido de usufruto/doação cadastrado para o confrontante ID {confrontante_id}."
        )

    montagem = montar_qualificacao_e_assinaturas_usufruto(
        lista_env,
        dados["owners"],
        domicilio_padrao=conf.get("endereco_completo"),
    )

    nome_lote = (
        (dados["prop"].get("nome_propriedade") or dados["mat"].get("denominacao"))
        if dados.get("is_unificada")
        else (dados["mat"].get("denominacao") or dados["prop"].get("nome_propriedade"))
    )
    comarca = str(dados["mat"].get("cri_comarca") or dados["prop"]["municipio"] or "").upper()
    proprietarios_html = descrever_proprietarios_curto(dados["owners"]) if dados["owners"] else Html("_" * 30)

    num_matricula_exibicao = dados.get("numeros_matricula_str") or str(dados["mat"].get("numero_matricula") or "")
    rotulo_matricula = dados.get("rotulo_matricula") or "Matrícula nº"
    plural_matriculas = "nºs" in rotulo_matricula
    objeto_matricula_html = Html(
        f"{'objeto das' if plural_matriculas else 'objeto da'} <strong>{esc(rotulo_matricula)} {esc(num_matricula_exibicao)}</strong>"
    )

    c_nome_raw = valor_preenchido(conf.get("nome"))
    c_nome_exib = c_nome_raw or valor_preenchido(lista_env[0].get("nome")) or "_" * 35
    c_matricula_raw = valor_preenchido(conf.get("matricula_imovel"))
    c_lote_raw = valor_preenchido(conf.get("lote"))
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

    tabela_divisas_html = gerar_tabela_divisas_html(mat_desenho_id, confrontante_id, segmentos=pre["segs"])
    mapa_divisa_leaflet, map_data = gerar_anexo_grafico_html(
        lev_id,
        mat_desenho_id,
        confrontante_id,
        c_nome_exib,
        rotulo_confrontante_croqui,
        rotulo_matricula=rotulo_matricula,
        num_matricula=num_matricula_exibicao,
        contexto=contexto_mapa,
        segmentos=pre["segs"],
    )
    script_inicializacao_mapas = gerar_js_inicializacao_mapas([map_data]) if map_data else ""

    html_content = carregar_template("declaracao_anuencia.html")
    # Substitui a frase fixa de condomínio/possuidores pela qualidade real (usufrutuários e donatários)
    padrao_clausula = re.compile(
        r"na qualidade de \{suf_proprietario\} e/ou \{suf_possuidor\} \{suf_legitimo\} da área\s+confrontante \{imovel_confrontante\}, e assumindo integralmente\s+as responsabilidades da declaração a seguir \(inclusive na condição de representante legal dos demais\s+condôminos, se houver, em estrita conformidade com o <strong>parágrafo 10º do artigo 213 da Lei\s+Federal nº 6\.015 de 1973</strong>\)",
        re.DOTALL,
    )
    nova_clausula = (
        f"na qualidade de <strong>{esc(montagem['qualidade_resumo'])}</strong> da área confrontante "
        "{imovel_confrontante}, assumindo integralmente as responsabilidades da declaração a seguir, "
        "em estrita conformidade com o <strong>artigo 213 da Lei Federal nº 6.015 de 1973</strong>"
    )
    html_content, trocas = padrao_clausula.subn(nova_clausula, html_content, count=1)
    if not trocas:
        logger.warning(
            "DRL de usufruto: a cláusula de condomínio do template declaracao_anuencia.html mudou; "
            "a qualidade jurídica (usufrutuários/donatários) NÃO foi aplicada no texto. Atualize o padrão."
        )

    titulo_aba = (
        f"DRL {c_matricula_raw} - {num_matricula_exibicao} - {c_nome_exib}"
        if c_matricula_raw
        else f"DRL {num_matricula_exibicao} - {c_nome_exib}"
    )

    valores = {
        "titulo_aba": titulo_aba,
        "c_nome": c_nome_exib,
        "municipio": dados["prop"].get("municipio") or "_____",
        "uf": uf_exibicao(dados["prop"].get("uf")),
        "data_extenso": obter_data_extenso(),
        "qualificacao_confrontante": montagem["qualificacao_html"],
        "c_matricula": c_matricula_raw,
        "c_lote": c_lote,
        "imovel_confrontante": Html(imovel_confrontante_desc),
        "nome_lote": nome_lote or "_" * 25,
        "proprietarios_str": proprietarios_html,
        "numero_matricula": num_matricula_exibicao,
        "rotulo_matricula": rotulo_matricula,
        "objeto_matricula_html": objeto_matricula_html,
        "clausula_unificacao": Html(dados.get("clausula_unificacao_html") or ""),
        "comarca": comarca,
        "tabela_divisas_html": tabela_divisas_html,
        "mapa_divisa_leaflet": mapa_divisa_leaflet,
        "script_inicializacao_mapas": Html(script_inicializacao_mapas),
        "bloco_assinaturas": montagem["bloco_assinaturas_html"],
        "nome_profissional": valor_preenchido(dados["lev"].get("nome_profissional")) or "_" * 30,
        "conselho_profissional": valor_preenchido(dados["lev"].get("conselho_profissional")) or "CFTA",
        "registro_profissional": valor_preenchido(dados["lev"].get("registro_profissional")) or "_" * 15,
        "credencial_incra": valor_preenchido(dados["lev"].get("codigo_credenciado")) or "_" * 15,
        "final_trt": valor_preenchido(dados["lev"].get("lev_numero_trt")) or LACUNA_TRT,
        **montagem["termos"],
    }
    html_final = renderizar_template(html_content, valores)
    res_html = extrair_corpo_declaracao(html_final) if apenas_corpo else html_final
    if retornar_map_data:
        return res_html, map_data
    return res_html
