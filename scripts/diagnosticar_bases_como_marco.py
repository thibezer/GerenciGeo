#!/usr/bin/env python3
"""
scripts/diagnosticar_bases_como_marco.py — Auditoria (SOMENTE LEITURA) de pontos base gravados como Marco (M).

Contexto: até a separação M/B, o sistema tratava o tipo 'M' como "Base PPP". Bases de campo acabaram
gravadas como M (rota de correção manual com padrão 'M', parser que classifica nomes iniciados por "M",
seletor do painel que exibia B como M). Este script não altera o banco: apenas lista, por levantamento,
os pontos suspeitos e um retrato das coordenadas/vínculos atuais, para correção caso a caso.

Uso:
    python scripts/diagnosticar_bases_como_marco.py [caminho_db] [arquivo_saida.md]
"""

import json
import os
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PADRAO = os.path.join(BASE_DIR, "gerencigeo.db")
SAIDA_PADRAO = os.path.join(BASE_DIR, "Arquivos .md", "AUDITORIA_BASES_GRAVADAS_COMO_MARCO.md")

REGEX_SIGEF = re.compile(r"^([A-Z0-9]{3,5}-)?(M|P|V)-\d+$", re.IGNORECASE)
REGEX_NOME_BASE = re.compile(r"^B\d{6}(_\d+)?$", re.IGNORECASE)  # padrão de sessão de receptor: B051509
REGEX_BASE_TRANSLACAO = re.compile(r"Base\s+(\S+?)\.?$")


def conectar(caminho_db):
    con = sqlite3.connect(f"file:{caminho_db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def nomes_usados_como_base(con):
    """Nomes de vértices que o histórico registra como base (override manual, translação, vínculo tardio)."""
    usados = defaultdict(set)  # levantamento_id -> {nome}
    rows = con.execute(
        "SELECT levantamento_id, tipo_evento, descricao, dados_detalhados FROM historico_alteracoes_campo "
        "WHERE tipo_evento IN ('CORRECAO_MANUAL_OVERRIDE', 'CORRECAO_TRANSLACAO', 'VINCULO_BASE_TARDE')"
    ).fetchall()
    for r in rows:
        nome = None
        try:
            dados = json.loads(r["dados_detalhados"] or "{}")
            nome = (dados.get("dados_brutos_base") or {}).get("nome_base") or dados.get("base_nome")
        except (ValueError, TypeError):
            pass
        if not nome and r["tipo_evento"] == "CORRECAO_TRANSLACAO":
            m = REGEX_BASE_TRANSLACAO.search(r["descricao"] or "")
            nome = m.group(1) if m else None
        if nome:
            usados[r["levantamento_id"]].add(nome.upper())
    return usados


def coletar_marcos_suspeitos(con, usados_base):
    rows = con.execute(
        """
        SELECT p.*,
               (SELECT COUNT(*) FROM pontos r WHERE r.ponto_base_id = p.id) AS rovers_vinculados,
               (SELECT COUNT(*) FROM segmentos s WHERE s.ponto_inicio_id = p.id OR s.ponto_fim_id = p.id) AS segmentos
        FROM pontos p
        WHERE p.tipo_ponto = 'M' AND (p.ponto_vizinho IS NULL OR p.ponto_vizinho = 0)
        ORDER BY p.levantamento_id, p.nome_vertice
        """
    ).fetchall()

    suspeitos = []
    for r in rows:
        p = dict(r)
        nome = (p["nome_vertice"] or "").upper()
        sinais = []  # (peso, texto)
        if p["rovers_vinculados"]:
            sinais.append((3, f"é base de {p['rovers_vinculados']} rover(s) (ponto_base_id)"))
        if nome in usados_base.get(p["levantamento_id"], set()):
            sinais.append((3, "aparece como base no histórico de correções"))
        if "BASE" in nome or REGEX_NOME_BASE.match(nome):
            sinais.append((3, "nome com padrão de base"))
        if p.get("arquivo_rinex") or p.get("arquivo_resultado_ppp"):
            sinais.append((2, "possui RINEX/resultado PPP"))
        if p.get("ignorar_poligono") == 1:
            sinais.append((2, "marcado para ficar fora do polígono"))
        if not p["segmentos"]:
            sinais.append((1, "não compõe nenhuma divisa"))
        if not REGEX_SIGEF.match(nome):
            sinais.append((1, "nome fora do padrão SIGEF (tipo M atribuído pela letra inicial do nome)"))
        if not sinais:
            continue
        peso = sum(s[0] for s in sinais)
        p["nivel"] = "ALTA" if any(s[0] == 3 for s in sinais) else ("MÉDIA" if peso >= 3 else "BAIXA")
        p["sinais"] = [s[1] for s in sinais]
        suspeitos.append(p)
    return suspeitos


def coletar_bases_excluidas_como_marco(con):
    """Bases que já foram excluídas enquanto gravadas como M (somente informativo)."""
    rows = con.execute(
        "SELECT levantamento_id, timestamp, descricao, dados_detalhados FROM historico_alteracoes_campo "
        "WHERE tipo_evento = 'EXCLUSAO_PONTO' AND descricao LIKE '%Tipo ''M''%'"
    ).fetchall()
    resultado = []
    for r in rows:
        try:
            nome = (json.loads(r["dados_detalhados"] or "{}").get("nome_vertice") or "").upper()
        except (ValueError, TypeError):
            nome = ""
        if nome and ("BASE" in nome or REGEX_NOME_BASE.match(nome)):
            resultado.append({"levantamento_id": r["levantamento_id"], "timestamp": r["timestamp"], "nome": nome})
    return resultado


def coletar_vertices_gravados_como_base(con):
    """Problema inverso: pontos B com código SIGEF de vértice ou que compõem divisas (ficam fora do perímetro)."""
    rows = con.execute(
        """
        SELECT p.*,
               (SELECT COUNT(*) FROM pontos r WHERE r.ponto_base_id = p.id) AS rovers_vinculados,
               (SELECT COUNT(*) FROM segmentos s WHERE s.ponto_inicio_id = p.id OR s.ponto_fim_id = p.id) AS segmentos
        FROM pontos p
        WHERE p.tipo_ponto = 'B'
        ORDER BY p.levantamento_id, p.nome_vertice
        """
    ).fetchall()
    resultado = []
    for r in rows:
        p = dict(r)
        motivos = []
        m_sigef = REGEX_SIGEF.match((p["nome_vertice"] or "").upper())
        if m_sigef:
            # Vértices de vizinhos (homologados por outro credenciado) não têm base: o problema é só o tipo,
            # que a sincronização da nuvem deduzia pela 1ª letra do nome (ex.: "BJQ-..." → B).
            origem = "vizinho" if (p.get("ponto_vizinho") or p.get("confrontante_id")) else "vértice"
            motivos.append(f"{origem} com código SIGEF tipo {m_sigef.group(2).upper()} gravado como B (deveria ser {m_sigef.group(2).upper()})")
        elif p.get("ponto_vizinho"):
            continue
        if p["segmentos"]:
            motivos.append(f"compõe {p['segmentos']} segmento(s) de divisa")
        if motivos:
            p["motivos"] = motivos
            resultado.append(p)
    return resultado


def fmt(v, casas=8):
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.{casas}f}"
    return str(v)


def gerar_relatorio(con, caminho_db):
    levs = {
        r["id"]: dict(r)
        for r in con.execute(
            "SELECT l.id, l.status, pr.nome_propriedade FROM levantamentos l "
            "LEFT JOIN propriedades pr ON pr.id = l.propriedade_id"
        ).fetchall()
    }
    usados_base = nomes_usados_como_base(con)
    marcos = coletar_marcos_suspeitos(con, usados_base)
    excluidas = coletar_bases_excluidas_como_marco(con)
    inversos = coletar_vertices_gravados_como_base(con)

    def titulo_lev(lid):
        l = levs.get(lid, {})
        return f"Levantamento {lid} — {l.get('nome_propriedade') or '?'} ({l.get('status') or '?'})"

    linhas = [
        "# Auditoria: bases gravadas como Marco (M)",
        "",
        f"Gerado em {datetime.now():%Y-%m-%d %H:%M} a partir de `{os.path.basename(caminho_db)}` "
        "por `scripts/diagnosticar_bases_como_marco.py` (somente leitura; nenhum dado foi alterado).",
        "",
        "## Como corrigir sem perder correções",
        "",
        "1. Antes de mexer, confira o retrato das coordenadas abaixo (é o estado atual de cada ponto).",
        "2. Se o ponto **é base**: no painel de propriedades, troque **apenas o tipo** de `Marco [M]` para "
        "`Base [B]`. Não reenvie N/E/H: trocar o tipo não altera coordenadas nem os rovers vinculados.",
        "3. Se o ponto **é marco de divisa de verdade**: não faça nada (o sistema agora o trata como vértice).",
        "4. Depois de cada troca, confira se a contagem de rovers vinculados e as coordenadas continuam iguais.",
        "",
        "Enquanto um ponto M ainda tiver rovers vinculados, o sistema continua tratando-o como base "
        "(compatibilidade), então nada quebra até a correção. A Triagem Inteligente também mostra esses casos.",
        "",
        "Nível: **ALTA** = é usado como base (rovers, histórico ou nome); **MÉDIA** = RINEX/fora do polígono; "
        "**BAIXA** = só o nome fora do padrão SIGEF e/ou fora das divisas (provável marco legítimo, conferir).",
        "",
    ]

    por_lev = defaultdict(list)
    for p in marcos:
        por_lev[p["levantamento_id"]].append(p)

    linhas.append("## Resumo por projeto")
    linhas.append("")
    if not por_lev:
        linhas.append("Nenhum ponto M suspeito encontrado.")
    else:
        linhas.append("| Levantamento | Propriedade | Status | ALTA | MÉDIA | BAIXA | Corrigido? |")
        linhas.append("|---|---|---|---|---|---|---|")
        for lid in sorted(por_lev):
            itens = por_lev[lid]
            cont = {n: sum(1 for p in itens if p["nivel"] == n) for n in ("ALTA", "MÉDIA", "BAIXA")}
            l = levs.get(lid, {})
            linhas.append(
                f"| {lid} | {l.get('nome_propriedade') or '?'} | {l.get('status') or '?'} | "
                f"{cont['ALTA']} | {cont['MÉDIA']} | {cont['BAIXA']} | [ ] |"
            )
    linhas.append("")

    linhas.append("## Pontos M suspeitos (detalhe)")
    for lid in sorted(por_lev):
        linhas.append("")
        linhas.append(f"### {titulo_lev(lid)}")
        linhas.append("")
        for p in sorted(por_lev[lid], key=lambda x: ("ALTA", "MÉDIA", "BAIXA").index(x["nivel"])):
            linhas.append(f"- [ ] **{p['nome_vertice']}** (id {p['id']}) — suspeita **{p['nivel']}**")
            linhas.append(f"  - Sinais: {'; '.join(p['sinais'])}")
            linhas.append(
                f"  - Retrato atual: status `{p['status_ponto']}`, lat {fmt(p['lat'])}, lon {fmt(p['lon'])}, "
                f"alt {fmt(p['alt'], 3)}, lat_corr {fmt(p.get('lat_corrigido'))}, lon_corr {fmt(p.get('lon_corrigido'))}, "
                f"alt_corr {fmt(p.get('alt_corrigido'), 3)}"
            )
            linhas.append(
                f"  - Campo bruto: E {fmt(p.get('e_original'), 3)}, N {fmt(p.get('n_original'), 3)}, "
                f"H {fmt(p.get('alt_original'), 3)} — arquivo `{p.get('arquivo_origem') or '—'}`, "
                f"matrícula {fmt(p['matricula_id'])}, ponto_base_id {fmt(p['ponto_base_id'])}, "
                f"rovers vinculados {p['rovers_vinculados']}"
            )

    linhas.append("")
    linhas.append("## Bases já excluídas enquanto estavam como M (informativo)")
    linhas.append("")
    if not excluidas:
        linhas.append("Nenhuma.")
    for e in excluidas:
        linhas.append(f"- Levantamento {e['levantamento_id']}: `{e['nome']}` excluída em {e['timestamp']}")

    linhas.append("")
    linhas.append("## Problema inverso: vértices gravados como Base (B)")
    linhas.append("")
    linhas.append(
        "Pontos B ficam fora do perímetro e aparecem nos filtros de Bases. Os pontos abaixo têm código SIGEF de "
        "vértice (inclusive de vizinhos, que não têm base própria) ou compõem divisas, mas estão gravados como B. "
        "Trocar só o tipo para o indicado não altera coordenadas."
    )
    linhas.append("")
    if not inversos:
        linhas.append("Nenhum.")
    inv_lev = defaultdict(list)
    for p in inversos:
        inv_lev[p["levantamento_id"]].append(p)
    for lid in sorted(inv_lev):
        linhas.append(f"### {titulo_lev(lid)}")
        linhas.append("")
        for p in inv_lev[lid]:
            linhas.append(
                f"- [ ] **{p['nome_vertice']}** (id {p['id']}): {'; '.join(p['motivos'])} — status "
                f"`{p['status_ponto']}`, lat {fmt(p['lat'])}, lon {fmt(p['lon'])}, rovers vinculados {p['rovers_vinculados']}"
            )
        linhas.append("")

    return "\n".join(linhas) + "\n", por_lev, inversos


def main():
    caminho_db = sys.argv[1] if len(sys.argv) > 1 else DB_PADRAO
    saida = sys.argv[2] if len(sys.argv) > 2 else SAIDA_PADRAO
    if not os.path.exists(caminho_db):
        print(f"[auditoria] Banco não encontrado: {caminho_db}")
        sys.exit(1)
    con = conectar(caminho_db)
    try:
        texto, por_lev, inversos = gerar_relatorio(con, caminho_db)
    finally:
        con.close()
    with open(saida, "w", encoding="utf-8") as f:
        f.write(texto)
    total = sum(len(v) for v in por_lev.values())
    print(f"[auditoria] {total} ponto(s) M suspeito(s) em {len(por_lev)} levantamento(s); "
          f"{len(inversos)} vértice(s) gravado(s) como B. Relatório: {saida}")


if __name__ == "__main__":
    main()
