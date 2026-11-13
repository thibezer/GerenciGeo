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

COLUNAS_MATRICULA = (*_ALIASES_MATRICULA.keys(), "area_ha", "area_sigef_ha")


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

    # Área exata vinda do SIGEF (opcional)
    if "area_sigef_ha" in enviados:
        val_sigef = enviados.get("area_sigef_ha")
        resolvidos["area_sigef_ha"] = float(val_sigef) if not _vazio(val_sigef) else None
    else:
        resolvidos["area_sigef_ha"] = atual.get("area_sigef_ha")

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


# ── Persistência e regras de CRUD de matrículas (extraídas de routes/levantamento/pontos.py) ──

class MatriculaErro(Exception):
    """Erro de regra de negócio de matrícula; `status` segue o código HTTP equivalente."""

    def __init__(self, status: int, mensagem: str):
        super().__init__(mensagem)
        self.status = status
        self.mensagem = mensagem


_MSG_ARQUIVADO = "Operação bloqueada: A matrícula pertence a um levantamento arquivado (Tranca Read-Only ativa)."
_MSG_PROP_ARQUIVADA = "Operação Bloqueada: Existe um levantamento ARQUIVADO vinculado a esta propriedade."
_CAMPOS_MONITORADOS = (
    ("numero_matricula", str), ("ccir", str), ("itr", str), ("area_ha", float),
    ("area_sigef_ha", float), ("valor_itr", float), ("denominacao", str), ("georreferenciamento", str),
    ("matricula_origem_desenho_id", int),
)


def _tem_levantamento_arquivado(propriedade_id: int) -> bool:
    rows = execute_query(
        "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'ARQUIVADO'",
        params=(propriedade_id,), fetch_all=True
    )
    return bool(rows)


def listar_levantamentos_ativos(propriedade_id: int) -> list[int]:
    """Ids dos levantamentos EM_ANDAMENTO da propriedade (cujos documentos precisam ser regenerados)."""
    rows = execute_query(
        "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'EM_ANDAMENTO'",
        params=(propriedade_id,), fetch_all=True
    )
    return [r["id"] for r in rows or []]


def listar_matriculas_do_levantamento(levantamento_id: int) -> list[dict]:
    rows = execute_query(
        """
        SELECT m.*
        FROM matriculas m
        JOIN propriedades p ON m.propriedade_id = p.id
        JOIN levantamentos l ON l.propriedade_id = p.id
        WHERE l.id = ?
        """,
        params=(levantamento_id,), fetch_all=True
    )
    return [dict(r) for r in rows or []]


def criar_matricula(levantamento_id: int, dados: dict) -> int:
    """Cria a matrícula na propriedade do levantamento. Retorna o `propriedade_id`."""
    row = execute_query("SELECT propriedade_id FROM levantamentos WHERE id = ?", params=(levantamento_id,), fetch_one=True)
    if not row:
        raise MatriculaErro(404, "Levantamento não encontrado")
    propriedade_id = row["propriedade_id"]

    campos = resolver_campos_matricula(dados)
    erro_vinculo = validar_origem_desenho(None, campos["matricula_origem_desenho_id"], propriedade_id)
    if erro_vinculo:
        raise MatriculaErro(400, erro_vinculo)
    colunas = ", ".join(COLUNAS_MATRICULA)
    marcadores = ", ".join("?" for _ in COLUNAS_MATRICULA)
    execute_query(
        f"INSERT INTO matriculas (propriedade_id, {colunas}) VALUES (?, {marcadores})",
        params=(propriedade_id, *(campos[c] for c in COLUNAS_MATRICULA)),
        commit=True
    )
    return propriedade_id


def _normalizar_para_historico(valor, tipo):
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return None
    return str(valor).strip() if tipo is str else tipo(valor)


def atualizar_matricula(mid: int, dados: dict) -> int:
    """Atualização parcial com histórico de alterações. Retorna o `propriedade_id`."""
    from database.connection import DatabaseManager

    antigo = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
    if not antigo:
        raise MatriculaErro(404, "Matrícula não encontrada")
    propriedade_id = antigo["propriedade_id"]
    if _tem_levantamento_arquivado(propriedade_id):
        raise MatriculaErro(403, _MSG_ARQUIVADO)

    # Campos ausentes do payload mantêm o valor gravado (o vínculo de desenho não se perde ao editar)
    campos = resolver_campos_matricula(dados, dict(antigo))
    if campos["matricula_origem_desenho_id"] == mid:
        campos["matricula_origem_desenho_id"] = None
    if campos["matricula_origem_desenho_id"] != antigo["matricula_origem_desenho_id"]:
        erro_vinculo = validar_origem_desenho(mid, campos["matricula_origem_desenho_id"])
        if erro_vinculo:
            raise MatriculaErro(400, erro_vinculo)

    colunas = ", ".join(f"{c} = ?" for c in COLUNAS_MATRICULA)
    execute_query(
        f"UPDATE matriculas SET {colunas} WHERE id = ?",
        params=(*(campos[c] for c in COLUNAS_MATRICULA), mid),
        commit=True
    )

    logs = []
    for campo, tipo in _CAMPOS_MONITORADOS:
        antes = _normalizar_para_historico(antigo[campo], tipo)
        depois = _normalizar_para_historico(campos[campo], tipo)
        if antes != depois:
            logs.append((
                mid, campo,
                str(antigo[campo]) if antes is not None else None,
                str(campos[campo]) if depois is not None else None,
            ))
    if logs:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.executemany(
                "INSERT INTO matricula_historico_logs (id_matricula, campo_alterado, valor_antigo, valor_novo) VALUES (?, ?, ?, ?)",
                logs
            )
            conn.commit()
    return propriedade_id


def vincular_desenho(mid: int, origem_id) -> tuple[int, int | None]:
    """Vincula/desvincula o desenho compartilhado. Retorna (propriedade_id, origem_id efetiva)."""
    row = execute_query("SELECT propriedade_id FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
    if not row:
        raise MatriculaErro(404, "Matrícula não encontrada")
    if _tem_levantamento_arquivado(row["propriedade_id"]):
        raise MatriculaErro(403, _MSG_PROP_ARQUIVADA)

    if origem_id is not None:
        try:
            origem_id = int(origem_id)
        except (TypeError, ValueError):
            raise MatriculaErro(400, "Matrícula de origem do desenho inválida.")
        if origem_id == mid:
            origem_id = None  # Apontar para si mesma equivale a desvincular
    erro_vinculo = validar_origem_desenho(mid, origem_id)
    if erro_vinculo:
        raise MatriculaErro(400, erro_vinculo)
    execute_query("UPDATE matriculas SET matricula_origem_desenho_id = ? WHERE id = ?", params=(origem_id, mid), commit=True)
    return row["propriedade_id"], origem_id


def excluir_matricula(mid: int) -> int | None:
    """Exclui a matrícula. Retorna o `propriedade_id`, ou None se ela não existia."""
    row = execute_query("SELECT propriedade_id FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
    if not row:
        return None
    propriedade_id = row["propriedade_id"]
    if _tem_levantamento_arquivado(propriedade_id):
        raise MatriculaErro(403, _MSG_ARQUIVADO)

    # Matrículas que usam este desenho ficariam apontando para uma matrícula inexistente
    derivadas = listar_matriculas_derivadas(mid)
    if derivadas:
        numeros = ", ".join(str(d["numero_matricula"]) for d in derivadas)
        raise MatriculaErro(
            409,
            f"Não é possível excluir: esta matrícula é origem do desenho de outra(s) matrícula(s) ({numeros}). Desvincule-as antes."
        )
    execute_query("DELETE FROM matriculas WHERE id = ?", params=(mid,), commit=True)
    return propriedade_id


def obter_propriedade_e_numero(mid: int) -> dict | None:
    row = execute_query("SELECT propriedade_id, numero_matricula FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
    return dict(row) if row else None


def obter_caminho_pdf(mid: int) -> str | None:
    row = execute_query("SELECT caminho_arquivo_pdf FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
    return row["caminho_arquivo_pdf"] if row and row["caminho_arquivo_pdf"] else None


def definir_caminho_pdf(mid: int, caminho: str | None) -> None:
    execute_query("UPDATE matriculas SET caminho_arquivo_pdf = ? WHERE id = ?", params=(caminho, mid), commit=True)


def listar_historico(mid: int) -> list[dict]:
    rows = execute_query(
        "SELECT campo_alterado, valor_antigo, valor_novo, data_alteracao FROM matricula_historico_logs WHERE id_matricula = ? ORDER BY data_alteracao DESC",
        params=(mid,), fetch_all=True
    )
    return [dict(r) for r in rows or []]
