#!/usr/bin/env python3
"""
scripts/diagnosticar_integridade_pontos.py — Auditoria (SOMENTE LEITURA) de inconsistências entre pontos e divisas.

Verifica, por levantamento:
  1. Pontos que não deveriam compor divisas (tipo B ou "ignorar no polígono") mas ainda aparecem em segmentos;
  2. Pontos cujo tipo gravado difere da letra do código SIGEF no nome (ex.: XRXR-P-0028 gravado como V);
  3. Camada de ciclo de vida divergente da regra do sistema (Perímetro / Campo / Vizinho / Homologado);
  4. Segmentos de divisa que apontam para pontos inexistentes, sem matrícula ou de outra matrícula.

Não altera o banco. Uso:
    python scripts/diagnosticar_integridade_pontos.py [caminho_db] [arquivo_saida.md]
"""

import os
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PADRAO = os.path.join(BASE_DIR, "gerencigeo.db")
SAIDA_PADRAO = os.path.join(BASE_DIR, "Arquivos .md", "AUDITORIA_INTEGRIDADE_PONTOS.md")

REGEX_SIGEF = re.compile(r"^(?:[A-Z0-9]{3,5}-)?(M|P|V)-\d+$", re.IGNORECASE)
NOMES_TIPO = {"M": "Marco", "P": "Ponto", "V": "Virtual", "B": "Base"}

# Mesma regra de atualizar_ponto_geodesico / atualizar_pontos_geodesicos_batch (levantamento_manager.py)
SQL_CAMADA_ESPERADA = """
    CASE WHEN p.ponto_vizinho = 1 THEN 'VIZINHO'
         WHEN p.origem_homologada = 1 THEN 'HOMOLOGADO'
         WHEN p.matricula_id IS NOT NULL AND COALESCE(p.ignorar_poligono, 0) = 0 AND p.tipo_ponto != 'B' THEN 'PERIMETRO'
         ELSE 'CAMPO' END
"""


def conectar(caminho_db):
    con = sqlite3.connect(f"file:{caminho_db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def q(con, sql, *params):
    return [dict(r) for r in con.execute(sql, params).fetchall()]


def fmt(v):
    return "—" if v is None or v == "" else str(v)


def tabela(cabecalho, linhas):
    out = ["| " + " | ".join(cabecalho) + " |", "|" + "---|" * len(cabecalho)]
    for l in linhas:
        out.append("| " + " | ".join(fmt(c).replace("|", "/") for c in l) + " |")
    return out


def coletar(con):
    levs = {r["id"]: r for r in q(con, """
        SELECT l.id, l.status, pr.nome_propriedade FROM levantamentos l
        LEFT JOIN propriedades pr ON pr.id = l.propriedade_id""")}
    mats = {r["id"]: r["numero_matricula"] for r in q(con, "SELECT id, numero_matricula FROM matriculas")}

    # 1. Pontos fora do perímetro que ainda compõem divisas
    item1 = q(con, """
        SELECT p.levantamento_id lev, p.id, p.nome_vertice, p.tipo_ponto, p.ignorar_poligono ign, p.matricula_id mat,
               s.id seg_id, s.matricula_id seg_mat, pi.nome_vertice ini, pf.nome_vertice fim,
               COALESCE(c.nome, pe.nome) confrontante, s.anuencia_assinada anuencia
        FROM pontos p
        JOIN segmentos s ON s.ponto_inicio_id = p.id OR s.ponto_fim_id = p.id
        LEFT JOIN pontos pi ON pi.id = s.ponto_inicio_id
        LEFT JOIN pontos pf ON pf.id = s.ponto_fim_id
        LEFT JOIN confrontantes c ON c.id = s.confrontante_id
        LEFT JOIN pessoas pe ON pe.id = c.pessoa_id
        WHERE p.tipo_ponto = 'B' OR p.ignorar_poligono = 1
        ORDER BY p.levantamento_id, p.matricula_id, p.nome_vertice, s.id""")

    # 2. Tipo gravado diferente da letra do código SIGEF
    item2 = []
    for r in q(con, """
        SELECT p.levantamento_id lev, p.id, p.nome_vertice, p.tipo_ponto, p.matricula_id mat, p.ponto_vizinho viz,
               p.origem_homologada homolog, p.arquivo_origem, substr(p.created_at, 1, 10) criado
        FROM pontos p ORDER BY p.levantamento_id, p.nome_vertice"""):
        m = REGEX_SIGEF.match((r["nome_vertice"] or "").strip())
        if m and m.group(1).upper() != r["tipo_ponto"]:
            r["tipo_codigo"] = m.group(1).upper()
            item2.append(r)

    # 3. Camada divergente
    item3 = q(con, f"""
        SELECT p.levantamento_id lev, p.id, p.nome_vertice, p.tipo_ponto, p.matricula_id mat, p.ignorar_poligono ign,
               p.ponto_vizinho viz, p.camada_ciclo_vida atual, {SQL_CAMADA_ESPERADA} esperada
        FROM pontos p
        WHERE p.camada_ciclo_vida IS NOT {SQL_CAMADA_ESPERADA}
        ORDER BY p.levantamento_id, esperada, p.nome_vertice""")

    # 4. Segmentos apontando para pontos inexistentes / sem matrícula / de outra matrícula
    item4 = q(con, """
        SELECT s.levantamento_id lev, s.matricula_id mat, s.id seg_id,
               s.ponto_inicio_id ini_id, a.nome_vertice ini, a.matricula_id ini_mat,
               s.ponto_fim_id fim_id, b.nome_vertice fim, b.matricula_id fim_mat,
               CASE WHEN a.id IS NULL OR b.id IS NULL THEN 'ponto excluído'
                    WHEN a.matricula_id IS NULL OR b.matricula_id IS NULL THEN 'ponto sem matrícula'
                    ELSE 'ponto de outra matrícula' END causa
        FROM segmentos s
        LEFT JOIN pontos a ON a.id = s.ponto_inicio_id
        LEFT JOIN pontos b ON b.id = s.ponto_fim_id
        WHERE a.id IS NULL OR b.id IS NULL OR a.matricula_id IS NOT s.matricula_id OR b.matricula_id IS NOT s.matricula_id
        ORDER BY s.levantamento_id, s.matricula_id, s.id""")
    resumo4 = {r["lev"]: r for r in q(con, """
        SELECT l.id lev,
               (SELECT COUNT(*) FROM pontos p WHERE p.levantamento_id = l.id) pontos,
               (SELECT COUNT(*) FROM pontos p WHERE p.levantamento_id = l.id AND p.matricula_id IS NOT NULL) com_matricula,
               (SELECT COUNT(*) FROM segmentos s WHERE s.levantamento_id = l.id) segmentos
        FROM levantamentos l""")}
    return levs, mats, item1, item2, item3, item4, resumo4


def gerar_relatorio(con, caminho_db):
    levs, mats, item1, item2, item3, item4, resumo4 = coletar(con)

    def titulo_lev(lid):
        l = levs.get(lid) or {}
        return f"Levantamento {lid} — {l.get('nome_propriedade') or '?'} ({l.get('status') or '?'})"

    def mat(mid):
        return f"{mats.get(mid, '?')} (id {mid})" if mid else "sem matrícula"

    def agrupar(itens):
        g = defaultdict(list)
        for i in itens:
            g[i["lev"]].append(i)
        return g

    L = [
        "# Auditoria: integridade de pontos e divisas",
        "",
        f"Gerado em {datetime.now():%Y-%m-%d %H:%M} a partir de `{os.path.basename(caminho_db)}` por "
        "`scripts/diagnosticar_integridade_pontos.py` (somente leitura; nenhum dado foi alterado).",
        "",
        "## Resumo",
        "",
    ]
    resumo = [
        ("1. Pontos fora do perímetro ainda em divisas", len({i["id"] for i in item1}), agrupar(item1)),
        ("2. Tipo diferente do código SIGEF", len(item2), agrupar(item2)),
        ("3. Camada divergente", len(item3), agrupar(item3)),
        ("4. Divisas com ponto inválido", len(item4), agrupar(item4)),
    ]
    L += tabela(["Item", "Total", "Levantamentos"],
                [(nome, total, ", ".join(f"{lid} ({len(g[lid])})" for lid in sorted(g)) or "—") for nome, total, g in resumo])

    # ── Item 1 ──
    L += ["", "## 1. Pontos fora do perímetro que ainda compõem divisas", "",
          "**O que é:** pontos tipo B (base) ou marcados \"ignorar no polígono\" não entram no perímetro, mas ainda são "
          "início/fim de segmentos de divisa. O cálculo de área, o memorial e o mapa ficam diferentes do que a tabela mostra.",
          "",
          "**Causa:** até esta correção, trocar o tipo para/de B não refazia as divisas (já corrigido; vale para trocas novas). "
          "Os pontos ignorados abaixo indicam que as divisas também não foram refeitas depois de marcar \"ignorar\".",
          "",
          "**Como conferir:** abra a matrícula na Mesa de Trabalho e veja se a linha do perímetro passa pelo ponto.",
          "",
          "**Como corrigir:** use \"Reordenar perímetro\" na matrícula (preserva confrontante, limite e anuência). "
          "Se o ponto deveria compor a divisa, troque o tipo/desmarque \"ignorar\" antes.", ""]
    for lid, itens in sorted(agrupar(item1).items()):
        L += [f"### {titulo_lev(lid)}", ""]
        L += tabela(["Ponto (id)", "Tipo", "Ignorar", "Matrícula do ponto", "Segmento", "Matrícula do segmento", "Trecho", "Confrontante", "Anuência"],
                    [(f"{i['nome_vertice']} ({i['id']})", i["tipo_ponto"], "sim" if i["ign"] == 1 else "não", mat(i["mat"]),
                      i["seg_id"], mat(i["seg_mat"]), f"{i['ini']} → {i['fim']}", i["confrontante"], "sim" if i["anuencia"] else "não")
                     for i in itens])
        L.append("")

    # ── Item 2 ──
    L += ["## 2. Tipo gravado diferente da letra do código SIGEF", "",
          "**O que é:** o nome do vértice segue o padrão SIGEF (`CÓDIGO-TIPO-NÚMERO`), mas o `tipo_ponto` gravado é outro "
          "(ex.: `XRXR-P-0028` gravado como V).",
          "",
          "**Impacto:** a planilha SIGEF e a Contagem de Pontos usam o **nome**, então seguem a letra do código. Já o filtro "
          "de Marcos, a sugestão de código do painel, a auditoria/triagem de marcos e as cores do mapa usam o **tipo gravado**.",
          "",
          "**Causa:** ainda não identificada. A importação de homologação (ODS) grava o tipo pela letra do código, e o histórico "
          "não registra a troca para V. A coluna \"Origem\" e \"Criado\" ajudam a achar o fluxo.",
          "",
          "**Como conferir:** decida qual está certo para cada caso — a letra do código ou o tipo gravado. Se for o código, "
          "troque o tipo (linha \"Tipo do Ponto\" no painel, ou em lote selecionando vários).", ""]
    for lid, itens in sorted(agrupar(item2).items()):
        cont = defaultdict(int)
        for i in itens:
            cont[f"{i['tipo_codigo']}→{i['tipo_ponto']}"] += 1
        L += [f"### {titulo_lev(lid)}", "",
              "Resumo: " + ", ".join(f"código {k.split('→')[0]} gravado como {k.split('→')[1]}: {v}" for k, v in sorted(cont.items())), ""]
        L += tabela(["Ponto (id)", "Código diz", "Gravado", "Matrícula", "Vizinho", "Homologado", "Origem", "Criado"],
                    [(f"{i['nome_vertice']} ({i['id']})", f"{i['tipo_codigo']} ({NOMES_TIPO[i['tipo_codigo']]})",
                      f"{i['tipo_ponto']} ({NOMES_TIPO.get(i['tipo_ponto'], '?')})", mat(i["mat"]),
                      "sim" if i["viz"] == 1 else "não", "sim" if i["homolog"] == 1 else "não", i["arquivo_origem"], i["criado"])
                     for i in itens])
        L.append("")

    # ── Item 3 ──
    L += ["## 3. Camada de ciclo de vida divergente", "",
          "**O que é:** a camada (Perímetro / Campo / Vizinho / Homologado) não bate com a regra do sistema: "
          "vizinho → VIZINHO; homologado → HOMOLOGADO; com matrícula, não ignorado e não base → PERIMETRO; senão CAMPO.",
          "",
          "**Impacto:** filtros por camada mostram o ponto no grupo errado. Não altera coordenadas nem divisas.",
          "",
          "**Causa:** a edição em lote (troca de matrícula/tipo) não recalculava a camada (já corrigido); cópias de vizinho "
          "ficaram com a camada do campo.",
          "",
          "**Como conferir:** filtre pela camada na Mesa de Trabalho. Qualquer edição do ponto (individual ou em lote) já recalcula.", ""]
    for lid, itens in sorted(agrupar(item3).items()):
        L += [f"### {titulo_lev(lid)}", ""]
        L += tabela(["Ponto (id)", "Tipo", "Matrícula", "Ignorar", "Vizinho", "Camada atual", "Camada esperada"],
                    [(f"{i['nome_vertice']} ({i['id']})", i["tipo_ponto"], mat(i["mat"]), "sim" if i["ign"] == 1 else "não",
                      "sim" if i["viz"] == 1 else "não", i["atual"], i["esperada"]) for i in itens])
        L.append("")

    # ── Item 4 ──
    L += ["## 4. Divisas que apontam para pontos inválidos", "",
          "**O que é:** segmentos de divisa de uma matrícula cujo ponto de início/fim foi excluído, não tem matrícula "
          "ou pertence a outra matrícula.",
          "",
          "**Impacto:** documentos e mapas que leem as divisas podem incluir trechos com pontos que a matrícula não tem.",
          "",
          "**Causa provável:** os pontos foram desvinculados da matrícula (ou excluídos) sem que as divisas antigas fossem "
          "removidas. Nos levantamentos abaixo, veja quantos pontos ainda têm matrícula.",
          "",
          "**Como conferir:** abra a matrícula e confira se o perímetro desenhado usa esses pontos. Para corrigir, vincule os "
          "pontos à matrícula e use \"Reordenar perímetro\" (refaz as divisas com os pontos da matrícula).", ""]
    for lid, itens in sorted(agrupar(item4).items()):
        r = resumo4.get(lid, {})
        cont = defaultdict(int)
        for i in itens:
            cont[(i["mat"], i["causa"])] += 1
        L += [f"### {titulo_lev(lid)}", "",
              f"Pontos no levantamento: {r.get('pontos')} (com matrícula: {r.get('com_matricula')}); segmentos: {r.get('segmentos')}.", ""]
        L += tabela(["Matrícula do segmento", "Causa", "Segmentos"], [(mat(m), c, n) for (m, c), n in sorted(cont.items(), key=lambda x: (x[0][0] or 0, x[0][1]))])
        L += ["", "<details><summary>Segmentos</summary>", ""]
        L += tabela(["Segmento", "Matrícula", "Início (id) / matrícula", "Fim (id) / matrícula", "Causa"],
                    [(i["seg_id"], mat(i["mat"]), f"{fmt(i['ini'])} ({i['ini_id']}) / {mat(i['ini_mat']) if i['ini'] else '—'}",
                      f"{fmt(i['fim'])} ({i['fim_id']}) / {mat(i['fim_mat']) if i['fim'] else '—'}", i["causa"]) for i in itens])
        L += ["", "</details>", ""]

    return "\n".join(L) + "\n", resumo


def main():
    caminho_db = sys.argv[1] if len(sys.argv) > 1 else DB_PADRAO
    saida = sys.argv[2] if len(sys.argv) > 2 else SAIDA_PADRAO
    if not os.path.exists(caminho_db):
        print(f"[integridade] Banco não encontrado: {caminho_db}")
        sys.exit(1)
    con = conectar(caminho_db)
    try:
        texto, resumo = gerar_relatorio(con, caminho_db)
    finally:
        con.close()
    with open(saida, "w", encoding="utf-8") as f:
        f.write(texto)
    for nome, total, _ in resumo:
        print(f"[integridade] {nome}: {total}")
    print(f"[integridade] Relatório: {saida}")


if __name__ == "__main__":
    main()
