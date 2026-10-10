"""
Regras de domínio para os campos editáveis de uma matrícula.
"""

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
