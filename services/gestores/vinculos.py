"""Verificações de pertencimento (anti-IDOR) entre pontos, confrontantes, matrículas e segmentos de um levantamento.

Todas recebem um cursor SQLite e devolvem bool/linha, sem depender de FastAPI, para serem usadas tanto pelas rotas
quanto pelos gestores. As rotas traduzem a falha em HTTP 404/422 (ver routes/deps.py).
"""

import os
from typing import Iterable, Optional


def ponto_pertence(cursor, ponto_id, levantamento_id: int) -> bool:
    if ponto_id is None:
        return False
    cursor.execute("SELECT 1 FROM pontos WHERE id = ? AND levantamento_id = ?", (ponto_id, levantamento_id))
    return cursor.fetchone() is not None


def confrontante_pertence(cursor, confrontante_id, levantamento_id: int) -> bool:
    if confrontante_id is None:
        return False
    cursor.execute("SELECT 1 FROM confrontantes WHERE id = ? AND levantamento_id = ?", (confrontante_id, levantamento_id))
    return cursor.fetchone() is not None


def segmento_pertence(cursor, segmento_id, levantamento_id: int) -> bool:
    if segmento_id is None:
        return False
    cursor.execute("SELECT 1 FROM segmentos WHERE id = ? AND levantamento_id = ?", (segmento_id, levantamento_id))
    return cursor.fetchone() is not None


def matricula_pertence(cursor, matricula_id, levantamento_id: int) -> bool:
    """A matrícula precisa ser da mesma propriedade do levantamento."""
    if matricula_id is None:
        return False
    cursor.execute(
        "SELECT 1 FROM matriculas m JOIN levantamentos l ON l.propriedade_id = m.propriedade_id "
        "WHERE m.id = ? AND l.id = ?",
        (matricula_id, levantamento_id),
    )
    return cursor.fetchone() is not None


def primeiro_invalido(cursor, ids: Iterable, levantamento_id: int, verificador) -> Optional[int]:
    """Primeiro id (não nulo) que não passa no `verificador`; None se todos pertencem."""
    for item in ids:
        if item is not None and not verificador(cursor, item, levantamento_id):
            return item
    return None


def caminho_dentro_de(caminho: Optional[str], *raizes: str) -> bool:
    """True se `caminho` (após resolver .., links e maiúsculas/minúsculas do Windows) está dentro de alguma raiz."""
    if not caminho or not any(raizes):
        return False
    try:
        alvo = os.path.normcase(os.path.realpath(caminho))
        for raiz in raizes:
            if not raiz:
                continue
            base = os.path.normcase(os.path.realpath(raiz))
            if alvo == base or os.path.commonpath([alvo, base]) == base:
                return True
    except (ValueError, OSError):
        return False
    return False
