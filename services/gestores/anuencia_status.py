"""Fonte única do status de anuência dos confrontantes.

Duas estruturas guardam o andamento da anuência:
- `segmentos.anuencia_assinada` (por divisa): é o que o checkbox "Assinada" da aba Peças de Cartório grava;
- `anuencias_confrontantes.status_anuencia` (por levantamento + confrontante): é o que o upload do termo
  assinado grava e o que `status-cartorio` consulta.

Este módulo mantém as duas coerentes e calcula o status efetivo exibido na tela, no `status-cartorio`
e usado para decidir quem entra no lote de anuências.

Dispensa: vias e cursos d'água públicos (estrada, rodovia, rio...) não têm proprietário particular a
assinar. Enquanto ninguém decidir o contrário, o nome é usado para inferir `DISPENSADO`; uma linha
explícita em `anuencias_confrontantes` (inclusive `PENDENTE`, para "exigir anuência") sempre prevalece.
"""

import re
import unicodedata
from typing import Optional

STATUS_PENDENTE = "PENDENTE"
STATUS_GERADO = "GERADO"
STATUS_ASSINADO = "ASSINADO"
STATUS_DISPENSADO = "DISPENSADO"

_PADRAO_ENTE_PUBLICO = re.compile(
    r"^\s*(estrada|rodovia|ferrovia|caminho|via|rio|corrego|ribeirao|riacho|br|pr|sc|rs)\b[\s\-nº°.]*(\d*)",
)


_PREFIXO_DESCRITIVO = re.compile(r"^(limita(-se)?|confronta|divisa)\s*(com|:)?\s*(o|a|os|as)?\s+")


def _normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii")
    return sem_acento.lower().strip()


def parece_ente_publico(nome: Optional[str]) -> bool:
    """True se o nome indica via ou curso d'água públicos (ex.: 'Estrada Municipal', 'Rio Pirapó', 'BR-376')."""
    n = _PREFIXO_DESCRITIVO.sub("", _normalizar(nome or ""))  # "Limita com Estrada X" -> "estrada x"
    if not n:
        return False
    m = _PADRAO_ENTE_PUBLICO.match(n)
    if not m:
        return False
    prefixo = m.group(1)
    if prefixo in ("br", "pr", "sc", "rs"):
        return bool(m.group(2))  # só "BR-376", nunca uma palavra qualquer que comece com essas letras
    return True


def status_efetivo(status_registrado: Optional[str], nome: Optional[str], qtd_divisas: int, qtd_assinadas: int) -> str:
    """Status que vale para o confrontante, combinando registro, divisas marcadas e inferência por nome."""
    if status_registrado == STATUS_DISPENSADO:
        return STATUS_DISPENSADO
    if qtd_divisas > 0 and qtd_assinadas >= qtd_divisas:
        return STATUS_ASSINADO
    if status_registrado is None:
        return STATUS_DISPENSADO if parece_ente_publico(nome) else STATUS_PENDENTE
    if status_registrado == STATUS_ASSINADO and qtd_divisas > 0:
        # divisas desmarcadas depois do upload: não vale mais como "tudo assinado"
        return STATUS_PENDENTE
    return status_registrado


def _status_registrado(cursor, levantamento_id: int, confrontante_id: int) -> Optional[str]:
    cursor.execute(
        "SELECT status_anuencia FROM anuencias_confrontantes WHERE levantamento_id = ? AND confrontante_id = ?",
        (levantamento_id, confrontante_id),
    )
    row = cursor.fetchone()
    return row[0] if row else None


def _gravar_status(cursor, levantamento_id: int, confrontante_id: int, status: str, existe: bool) -> None:
    if existe:
        cursor.execute(
            "UPDATE anuencias_confrontantes SET status_anuencia = ?, data_atualizacao = CURRENT_TIMESTAMP "
            "WHERE levantamento_id = ? AND confrontante_id = ?",
            (status, levantamento_id, confrontante_id),
        )
    else:
        cursor.execute(
            "INSERT INTO anuencias_confrontantes (levantamento_id, confrontante_id, status_anuencia) VALUES (?, ?, ?)",
            (levantamento_id, confrontante_id, status),
        )


def sincronizar_assinatura(cursor, levantamento_id: int, confrontante_id: int) -> str:
    """Reflete o estado das divisas (checkbox) em `anuencias_confrontantes`. Devolve o status gravado."""
    cursor.execute(
        "SELECT COUNT(*), COALESCE(SUM(CASE WHEN anuencia_assinada = 1 THEN 1 ELSE 0 END), 0) "
        "FROM segmentos WHERE levantamento_id = ? AND confrontante_id = ?",
        (levantamento_id, confrontante_id),
    )
    total, assinadas = cursor.fetchone()
    atual = _status_registrado(cursor, levantamento_id, confrontante_id)
    if atual == STATUS_DISPENSADO:
        return atual
    todas = total > 0 and assinadas >= total
    if todas:
        _gravar_status(cursor, levantamento_id, confrontante_id, STATUS_ASSINADO, atual is not None)
        return STATUS_ASSINADO
    if atual == STATUS_ASSINADO:
        _gravar_status(cursor, levantamento_id, confrontante_id, STATUS_PENDENTE, True)
        return STATUS_PENDENTE
    return atual or STATUS_PENDENTE


def registrar_termo_assinado(cursor, levantamento_id: int, confrontante_id: int, caminho: str) -> None:
    """Upload do termo digitalizado: grava o status e marca todas as divisas do confrontante como assinadas."""
    existe = _status_registrado(cursor, levantamento_id, confrontante_id) is not None
    if existe:
        cursor.execute(
            "UPDATE anuencias_confrontantes SET status_anuencia = 'ASSINADO', caminho_documento_assinado = ?, "
            "data_atualizacao = CURRENT_TIMESTAMP WHERE levantamento_id = ? AND confrontante_id = ?",
            (caminho, levantamento_id, confrontante_id),
        )
    else:
        cursor.execute(
            "INSERT INTO anuencias_confrontantes (levantamento_id, confrontante_id, status_anuencia, caminho_documento_assinado) "
            "VALUES (?, ?, 'ASSINADO', ?)",
            (levantamento_id, confrontante_id, caminho),
        )
    cursor.execute(
        "UPDATE segmentos SET anuencia_assinada = 1 WHERE levantamento_id = ? AND confrontante_id = ?",
        (levantamento_id, confrontante_id),
    )


def definir_dispensa(cursor, levantamento_id: int, confrontante_id: int, dispensada: bool) -> str:
    """Dispensa a anuência (ente público) ou volta a exigi-la. Sempre grava linha explícita (prevalece sobre a inferência)."""
    atual = _status_registrado(cursor, levantamento_id, confrontante_id)
    novo = STATUS_DISPENSADO if dispensada else STATUS_PENDENTE
    _gravar_status(cursor, levantamento_id, confrontante_id, novo, atual is not None)
    if not dispensada:
        # reexigir: recalcula a partir das divisas (pode já estar tudo assinado)
        return sincronizar_assinatura(cursor, levantamento_id, confrontante_id)
    return novo


def mapa_status_registrado(cursor, levantamento_id: int) -> dict:
    cursor.execute(
        "SELECT confrontante_id, status_anuencia FROM anuencias_confrontantes WHERE levantamento_id = ?",
        (levantamento_id,),
    )
    return {row[0]: row[1] for row in cursor.fetchall()}


def filtrar_exigem_anuencia(cursor, levantamento_id: int, confrontantes_ids: list) -> list:
    """Remove da lista os confrontantes com anuência dispensada (vias/cursos d'água públicos), mantendo a ordem."""
    if not confrontantes_ids:
        return []
    registrados = mapa_status_registrado(cursor, levantamento_id)
    mantidos = []
    for cid in confrontantes_ids:
        cursor.execute(
            "SELECT COALESCE(NULLIF(TRIM(c.nome), ''), p.nome, ''), "
            "(SELECT COUNT(*) FROM segmentos s WHERE s.confrontante_id = c.id AND s.levantamento_id = ?), "
            "(SELECT COUNT(*) FROM segmentos s WHERE s.confrontante_id = c.id AND s.levantamento_id = ? AND s.anuencia_assinada = 1) "
            "FROM confrontantes c LEFT JOIN pessoas p ON p.id = c.pessoa_id WHERE c.id = ?",
            (levantamento_id, levantamento_id, cid),
        )
        row = cursor.fetchone()
        if row is None:
            mantidos.append(cid)  # id desconhecido: deixa o gerador individual reportar o erro
            continue
        if status_efetivo(registrados.get(cid), row[0], row[1], row[2]) != STATUS_DISPENSADO:
            mantidos.append(cid)
    return mantidos
