"""
services/gestores/contagem_pontos.py — Contagem e organização dos pontos pelo padrão SIGEF.

Os vértices seguem o padrão `CODIGO-TIPO-NNNN` (ex.: XRXR-P-0042): código do credenciado,
tipo (M, P ou V) e um sequencial. Este módulo agrupa os pontos já gravados por código + tipo,
mostra quais números cada levantamento (projeto) está usando e calcula o próximo número livre.
"""
import re
from collections import defaultdict
from typing import Dict, Iterable, List, Tuple

from database.connection import execute_query

PADRAO_VERTICE = re.compile(r"^([A-Za-z0-9]{3,4})-([MPVmpv])-(\d{1,6})$")
TIPOS = ("M", "P", "V")

# Um número muito acima do resto da sequência (ex.: XRXR-V-9999 digitado como marcador) não pode
# empurrar o "próximo disponível" para o fim da numeração: é tratado como isolado e ignorado no cálculo.
SALTO_ISOLADO = 500


def interpretar_nome(nome) -> Tuple[str, str, int] | None:
    """Devolve (codigo, tipo, numero) se o nome segue o padrão SIGEF; senão None."""
    m = PADRAO_VERTICE.match((nome or "").strip())
    if not m:
        return None
    return m.group(1).upper(), m.group(2).upper(), int(m.group(3))


def comprimir_faixas(numeros: Iterable[int]) -> List[List[int]]:
    """[1,2,3,5,8,9] -> [[1,3],[5,5],[8,9]]"""
    ordenados = sorted(set(numeros))
    faixas: List[List[int]] = []
    for n in ordenados:
        if faixas and n == faixas[-1][1] + 1:
            faixas[-1][1] = n
        else:
            faixas.append([n, n])
    return faixas


def separar_isolados(numeros: Iterable[int]) -> Tuple[List[int], List[int]]:
    """Separa a sequência principal dos números isolados lá no topo. Retorna (principal, isolados)."""
    principal = sorted(set(numeros))
    isolados: List[int] = []
    while len(principal) > 1 and principal[-1] - principal[-2] > SALTO_ISOLADO:
        isolados.insert(0, principal.pop())
    return principal, isolados


def calcular_lacunas(principal: List[int]) -> List[List[int]]:
    """Faixas livres entre 1 e o maior número da sequência principal."""
    if not principal:
        return []
    usados = set(principal)
    lacunas: List[List[int]] = []
    for n in range(1, principal[-1]):
        if n in usados:
            continue
        if lacunas and n == lacunas[-1][1] + 1:
            lacunas[-1][1] = n
        else:
            lacunas.append([n, n])
    return lacunas


def formatar_nome(codigo: str, tipo: str, numero: int) -> str:
    return f"{codigo}-{tipo}-{numero:04d}"


def _resumir_tipo(codigo: str, tipo: str, usos: Dict[int, set], com_lacunas: bool = True) -> dict:
    """usos: numero -> conjunto de levantamento_id que usam esse número.
    Lacunas só fazem sentido para a numeração do próprio credenciado."""
    principal, isolados = separar_isolados(usos.keys())
    maximo = principal[-1] if principal else 0
    proximo = maximo + 1
    lacunas = calcular_lacunas(principal) if com_lacunas else []
    return {
        "tipo": tipo,
        "total": len(usos),
        "minimo": principal[0] if principal else None,
        "maximo": maximo or None,
        "isolados": isolados,
        "proximo": proximo,
        "proximo_nome": formatar_nome(codigo, tipo, proximo),
        "faixas": comprimir_faixas(principal),
        "lacunas": lacunas,
        "total_lacunas": sum(b - a + 1 for a, b in lacunas),
        "projetos": len({lev for levs in usos.values() for lev in levs}),
    }


def proximos_numeros_livres(codigo: str, nomes: Iterable[str]) -> Dict[str, int]:
    """Próximo número de cada tipo (M/P/V) do credenciado, considerando todos os nomes/códigos já usados.
    Mesma regra da contagem: números isolados no topo (ex.: 9999) não empurram a sequência."""
    codigo = str(codigo or "").upper()
    usados: Dict[str, Dict[int, set]] = defaultdict(dict)
    for nome in nomes:
        parsed = interpretar_nome(nome)
        if parsed and parsed[0] == codigo:
            usados[parsed[1]][parsed[2]] = set()
    return {t: _resumir_tipo(codigo, t, usados.get(t, {}), com_lacunas=False)["proximo"] for t in TIPOS}


def calcular_contagem(pontos: List[dict], levantamentos: Dict[int, dict], profissionais: List[dict]) -> dict:
    """
    pontos: [{nome_vertice, levantamento_id}]
    levantamentos: {id: {propriedade, municipio, uf, status}}
    profissionais: [{nome, codigo_credenciado, contador_m, contador_p, contador_v}]
    """
    meus = {str(p["codigo_credenciado"]).upper(): p for p in profissionais if p.get("codigo_credenciado")}

    # codigo -> tipo -> numero -> {levantamento_id}
    usos: Dict[str, Dict[str, Dict[int, set]]] = defaultdict(lambda: defaultdict(lambda: defaultdict(set)))
    # levantamento -> codigo -> tipo -> {numero}
    por_projeto: Dict[int, Dict[str, Dict[str, set]]] = defaultdict(lambda: defaultdict(lambda: defaultdict(set)))
    fora_do_padrao: Dict[int, int] = defaultdict(int)
    total_por_projeto: Dict[int, int] = defaultdict(int)

    for p in pontos:
        lev = p["levantamento_id"]
        total_por_projeto[lev] += 1
        parsed = interpretar_nome(p["nome_vertice"])
        if not parsed:
            fora_do_padrao[lev] += 1
            continue
        codigo, tipo, numero = parsed
        usos[codigo][tipo][numero].add(lev)
        por_projeto[lev][codigo][tipo].add(numero)

    codigos = []
    conflitos = []
    for codigo in sorted(usos, key=lambda c: (c not in meus, c)):
        prof = meus.get(codigo)
        tipos = {}
        for tipo in TIPOS:
            if tipo not in usos[codigo] and not prof:
                continue
            resumo = _resumir_tipo(codigo, tipo, usos[codigo].get(tipo, {}), com_lacunas=bool(prof))
            if prof:
                contador = int(prof.get(f"contador_{tipo.lower()}") or 0)
                resumo["contador_cadastrado"] = contador
                resumo["divergencia_contador"] = contador != (resumo["maximo"] or 0)
                for numero, levs in usos[codigo].get(tipo, {}).items():
                    if len(levs) > 1:
                        conflitos.append({
                            "nome": formatar_nome(codigo, tipo, numero),
                            "levantamentos": sorted(levs),
                        })
            tipos[tipo] = resumo
        codigos.append({
            "codigo": codigo,
            "meu": bool(prof),
            "profissional": prof["nome"] if prof else None,
            "tipos": tipos,
        })

    # Credenciados cadastrados que ainda não têm nenhum ponto: o próximo é o 0001
    for codigo, prof in meus.items():
        if codigo in usos:
            continue
        codigos.insert(0, {
            "codigo": codigo,
            "meu": True,
            "profissional": prof["nome"],
            "tipos": {t: {**_resumir_tipo(codigo, t, {}),
                          "contador_cadastrado": int(prof.get(f"contador_{t.lower()}") or 0),
                          "divergencia_contador": int(prof.get(f"contador_{t.lower()}") or 0) != 0}
                      for t in TIPOS},
        })

    projetos = []
    for lev_id, info in levantamentos.items():
        if lev_id not in total_por_projeto:
            continue
        itens = []
        for codigo in sorted(por_projeto[lev_id], key=lambda c: (c not in meus, c)):
            for tipo in TIPOS:
                nums = por_projeto[lev_id][codigo].get(tipo)
                if nums:
                    itens.append({
                        "codigo": codigo,
                        "tipo": tipo,
                        "meu": codigo in meus,
                        "quantidade": len(nums),
                        "faixas": comprimir_faixas(nums),
                    })
        projetos.append({
            "levantamento_id": lev_id,
            "propriedade": info.get("propriedade"),
            "municipio": info.get("municipio"),
            "uf": info.get("uf"),
            "status": info.get("status"),
            "total_pontos": total_por_projeto[lev_id],
            "fora_do_padrao": fora_do_padrao[lev_id],
            "itens": itens,
        })
    projetos.sort(key=lambda p: p["levantamento_id"], reverse=True)

    conflitos.sort(key=lambda c: c["nome"])
    return {"codigos": codigos, "projetos": projetos, "conflitos": conflitos}


def obter_contagem_pontos() -> dict:
    pontos = [dict(r) for r in execute_query(
        "SELECT nome_vertice, levantamento_id FROM pontos", fetch_all=True)]
    levantamentos = {
        r["id"]: {
            "propriedade": r["nome_propriedade"],
            "municipio": r["municipio"],
            "uf": r["uf"],
            "status": r["status"],
        }
        for r in execute_query(
            """SELECT l.id, l.status, p.nome_propriedade, p.municipio, p.uf
               FROM levantamentos l JOIN propriedades p ON p.id = l.propriedade_id""",
            fetch_all=True)
    }
    profissionais = [dict(r) for r in execute_query(
        "SELECT nome, codigo_credenciado, contador_m, contador_p, contador_v FROM profissionais",
        fetch_all=True)]
    return calcular_contagem(pontos, levantamentos, profissionais)
