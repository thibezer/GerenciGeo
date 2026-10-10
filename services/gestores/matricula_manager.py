"""
Regras de domínio para os campos editáveis de uma matrícula.
"""
from database.connection import execute_query

# Coluna gravada -> chaves aceitas no payload, em ordem de prioridade
_ALIASES_MATRICULA = {
    "numero_matricula": ("numero_matricula",),
    "ccir": ("codigo_ccir", "ccir"),
    "itr": ("codigo_itr", "itr"),
    "denominacao": ("denominacao_gleba", "denominacao"),
    "valor_itr": ("valor_itr",),
    "georreferenciamento": ("georreferenciamento",),
    "matricula_origem_desenho_id": ("matricula_origem_desenho_id",),
}

COLUNAS_MATRICULA = (*_ALIASES_MATRICULA.keys(), "area_ha")


def _vazio(valor) -> bool:
    return valor is None or (isinstance(valor, str) and not valor.strip())


def _limpar(valor):
    if isinstance(valor, str):
        valor = valor.strip()
        return valor or None
    return valor


def resolver_campos_matricula(enviados: dict, atual: dict | None = None) -> dict:
    """
    Converte o payload de matrícula (com aliases) nos valores das colunas.
    Com `atual`, faz atualização parcial: colunas cujas chaves não vieram no payload
    mantêm o valor gravado. Sem `atual` (criação), colunas ausentes ficam nulas.
    """
    atual = atual or {}
    resolvidos = {}

    for coluna, chaves in _ALIASES_MATRICULA.items():
        presentes = [enviados[k] for k in chaves if k in enviados]
        if not presentes:
            resolvidos[coluna] = atual.get(coluna)
            continue
        preenchido = next((v for v in presentes if not _vazio(v)), None)
        resolvidos[coluna] = _limpar(preenchido)

    # Área: a área registrada (> 0) tem prioridade sobre area_ha
    area_registrada = enviados.get("area_registrada_ha")
    if area_registrada is not None and area_registrada > 0:
        resolvidos["area_ha"] = area_registrada
    elif "area_ha" in enviados or "area_registrada_ha" in enviados:
        resolvidos["area_ha"] = enviados.get("area_ha") or 0.0
    else:
        resolvidos["area_ha"] = atual.get("area_ha")

    return resolvidos


def listar_matriculas_derivadas(matricula_id: int) -> list[dict]:
    """Matrículas que usam o desenho (perímetro) da matrícula informada."""
    rows = execute_query(
        "SELECT id, numero_matricula FROM matriculas WHERE matricula_origem_desenho_id = ? AND id != ? ORDER BY numero_matricula",
        params=(matricula_id, matricula_id),
        fetch_all=True
    )
    return [dict(r) for r in rows] if rows else []


def validar_origem_desenho(matricula_id: int | None, origem_id, propriedade_id: int | None = None) -> str | None:
    """
    Valida o vínculo de desenho compartilhado (gleba unificada). O desenho é resolvido em um
    único nível em todo o sistema, então a origem precisa ser uma matrícula principal da mesma
    propriedade e a matrícula vinculada não pode ser origem de outras.
    Na criação, `matricula_id` é None e `propriedade_id` indica a propriedade da nova matrícula.
    Retorna a mensagem de erro, ou None se o vínculo é válido.
    """
    if origem_id is None or (matricula_id is not None and origem_id == matricula_id):
        return None

    if matricula_id is not None:
        atual = execute_query("SELECT id, propriedade_id FROM matriculas WHERE id = ?", params=(matricula_id,), fetch_one=True)
        if not atual:
            return "Matrícula não encontrada."
        propriedade_id = atual["propriedade_id"]
    origem = execute_query(
        "SELECT id, propriedade_id, numero_matricula, matricula_origem_desenho_id FROM matriculas WHERE id = ?",
        params=(origem_id,), fetch_one=True
    )
    if not origem:
        return "Matrícula de origem do desenho não encontrada."
    if origem["propriedade_id"] != propriedade_id:
        return "A matrícula de origem do desenho deve pertencer à mesma propriedade."
    if origem["matricula_origem_desenho_id"] and origem["matricula_origem_desenho_id"] != origem["id"]:
        return (f"A matrícula {origem['numero_matricula']} já usa o desenho de outra matrícula. "
                "Vincule à matrícula principal do desenho.")
    derivadas = listar_matriculas_derivadas(matricula_id) if matricula_id is not None else []
    if derivadas:
        numeros = ", ".join(str(d["numero_matricula"]) for d in derivadas)
        return f"Esta matrícula é origem do desenho de outra(s) matrícula(s) ({numeros}). Desvincule-as antes."
    return None
