"""
services/gestores/historico_arquivos_service.py — Registro e verificação de arquivos enviados ao sistema/IA.

Permite identificar por hash SHA-256 (conteúdo exato) ou por nome se um arquivo já foi enviado
anteriormente para evitar retrabalho e envios duplicados.
"""

import hashlib
import logging
import os
from typing import Any, Dict, List, Optional

from database.connection import DatabaseManager, execute_query

logger = logging.getLogger(__name__)


def calcular_sha256_bytes(dados: bytes) -> str:
    """Calcula o hash SHA-256 em hexadecimal de um conteúdo binário em memória."""
    return hashlib.sha256(dados or b"").hexdigest()


def calcular_sha256_arquivo(caminho: str) -> Optional[str]:
    """Calcula o hash SHA-256 em blocos de um arquivo no disco."""
    if not caminho or not os.path.isfile(caminho):
        return None
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def _formatar_correspondencia(row: Any) -> Dict[str, Any]:
    r = dict(row)
    return {
        "id": r.get("id"),
        "sha256": r.get("sha256"),
        "nome_arquivo": r.get("nome_arquivo"),
        "extensao": r.get("extensao"),
        "tamanho_bytes": r.get("tamanho_bytes") or 0,
        "categoria": r.get("categoria"),
        "tipo_documento": r.get("tipo_documento"),
        "entidade_tipo": r.get("entidade_tipo"),
        "entidade_id": r.get("entidade_id"),
        "entidade_nome": r.get("entidade_nome"),
        "origem_envio": r.get("origem_envio"),
        "caminho_origem": r.get("caminho_origem"),
        "caminho_arquivado": r.get("caminho_arquivado"),
        "resumo_extracao": r.get("resumo_extracao"),
        "enviado_em": r.get("enviado_em"),
    }


def verificar_arquivo_enviado(
    caminho: Optional[str] = None,
    sha256: Optional[str] = None,
    nome_arquivo: Optional[str] = None,
    tamanho_bytes: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Verifica se o arquivo já consta em `arquivos_enviados_ia`.
    Prioriza a comparação exata por SHA-256; também sinaliza quando há outro arquivo com o mesmo nome.
    """
    nome_efetivo = (nome_arquivo or (os.path.basename(caminho) if caminho else "") or "").strip()
    sha_efetivo = (sha256 or "").strip().lower() or None
    tam_efetivo = tamanho_bytes

    if caminho and os.path.isfile(caminho):
        if not sha_efetivo:
            sha_efetivo = calcular_sha256_arquivo(caminho)
        if tam_efetivo is None:
            tam_efetivo = os.path.getsize(caminho)

    correspondencias_hash: List[Dict[str, Any]] = []
    correspondencias_nome: List[Dict[str, Any]] = []

    if sha_efetivo:
        rows_hash = execute_query(
            """
            SELECT * FROM arquivos_enviados_ia
            WHERE LOWER(sha256) = LOWER(?)
            ORDER BY enviado_em DESC, id DESC
            """,
            params=(sha_efetivo,),
            fetch_all=True,
        ) or []
        correspondencias_hash = [_formatar_correspondencia(r) for r in rows_hash]

    if nome_efetivo:
        rows_nome = execute_query(
            """
            SELECT * FROM arquivos_enviados_ia
            WHERE LOWER(TRIM(nome_arquivo)) = LOWER(TRIM(?))
            ORDER BY enviado_em DESC, id DESC
            """,
            params=(nome_efetivo,),
            fetch_all=True,
        ) or []
        ids_hash = {c["id"] for c in correspondencias_hash}
        correspondencias_nome = [
            _formatar_correspondencia(r) for r in rows_nome if r["id"] not in ids_hash
        ]

    return {
        "ja_enviado": len(correspondencias_hash) > 0,
        "mesmo_nome": len(correspondencias_nome) > 0 and len(correspondencias_hash) == 0,
        "sha256": sha_efetivo,
        "nome_arquivo": nome_efetivo,
        "tamanho_bytes": tam_efetivo,
        "correspondencias_hash": correspondencias_hash,
        "correspondencias_nome": correspondencias_nome,
    }


def verificar_lote_arquivos(itens: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Verifica uma lista de descritores `{sha256, nome_arquivo, tamanho_bytes, caminho}`."""
    resultados: List[Dict[str, Any]] = []
    for item in itens or []:
        if not isinstance(item, dict):
            continue
        res = verificar_arquivo_enviado(
            caminho=item.get("caminho"),
            sha256=item.get("sha256"),
            nome_arquivo=item.get("nome_arquivo"),
            tamanho_bytes=item.get("tamanho_bytes"),
        )
        resultados.append(res)
    return resultados


def registrar_arquivo_enviado(
    nome_arquivo: str,
    sha256: Optional[str] = None,
    caminho: Optional[str] = None,
    tamanho_bytes: Optional[int] = None,
    categoria: str = "OUTRO",
    tipo_documento: Optional[str] = None,
    entidade_tipo: Optional[str] = None,
    entidade_id: Optional[int] = None,
    entidade_nome: Optional[str] = None,
    origem_envio: str = "IA_CHAT",
    caminho_origem: Optional[str] = None,
    caminho_arquivado: Optional[str] = None,
    resumo_extracao: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Registra um arquivo processado/enviado ao sistema.
    Se o mesmo `sha256` já existir para a mesma `(entidade_tipo, entidade_id)`, atualiza
    o carimbo e os metadados em vez de criar linhas duplicadas.
    """
    nome_limpo = os.path.basename(nome_arquivo or "").strip() or (
        os.path.basename(caminho) if caminho else "arquivo"
    )
    ext = os.path.splitext(nome_limpo)[1].lower()
    sha_final = (sha256 or "").strip().lower()
    if not sha_final and caminho and os.path.isfile(caminho):
        sha_final = calcular_sha256_arquivo(caminho) or ""
    if not sha_final:
        sha_final = calcular_sha256_bytes(nome_limpo.encode("utf-8"))

    tam_final = tamanho_bytes
    if tam_final is None:
        if caminho and os.path.isfile(caminho):
            tam_final = os.path.getsize(caminho)
        elif caminho_arquivado and os.path.isfile(caminho_arquivado):
            tam_final = os.path.getsize(caminho_arquivado)
        else:
            tam_final = 0

    categoria_norm = (categoria or "OUTRO").strip().upper()
    tipo_doc_norm = (tipo_documento or "").strip().upper() or None
    ent_tipo_norm = (entidade_tipo or "").strip().lower() or None

    # Consulta se esse mesmo hash já havia sido registrado antes (para alertar em outra ou mesma entidade)
    anteriores_rows = execute_query(
        """
        SELECT * FROM arquivos_enviados_ia
        WHERE LOWER(sha256) = LOWER(?)
        ORDER BY enviado_em DESC, id DESC
        """,
        params=(sha_final,),
        fetch_all=True,
    ) or []
    anteriores = [_formatar_correspondencia(r) for r in anteriores_rows]

    mesma_entidade = None
    for ant in anteriores:
        if ant.get("entidade_tipo") == ent_tipo_norm and ant.get("entidade_id") == entidade_id:
            mesma_entidade = ant
            break

    with DatabaseManager() as conn:
        cursor = conn.cursor()
        if mesma_entidade:
            cursor.execute(
                """
                UPDATE arquivos_enviados_ia
                SET nome_arquivo = COALESCE(NULLIF(?, ''), nome_arquivo),
                    extensao = COALESCE(NULLIF(?, ''), extensao),
                    tamanho_bytes = CASE WHEN ? > 0 THEN ? ELSE tamanho_bytes END,
                    categoria = ?,
                    tipo_documento = COALESCE(?, tipo_documento),
                    entidade_nome = COALESCE(?, entidade_nome),
                    origem_envio = COALESCE(?, origem_envio),
                    caminho_origem = COALESCE(?, caminho_origem),
                    caminho_arquivado = COALESCE(?, caminho_arquivado),
                    resumo_extracao = COALESCE(?, resumo_extracao),
                    enviado_em = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    nome_limpo,
                    ext,
                    tam_final,
                    tam_final,
                    categoria_norm,
                    tipo_doc_norm,
                    entidade_nome,
                    origem_envio,
                    caminho_origem or caminho,
                    caminho_arquivado,
                    resumo_extracao,
                    mesma_entidade["id"],
                ),
            )
            reg_id = mesma_entidade["id"]
        else:
            cursor.execute(
                """
                INSERT INTO arquivos_enviados_ia (
                    sha256, nome_arquivo, extensao, tamanho_bytes,
                    categoria, tipo_documento, entidade_tipo, entidade_id, entidade_nome,
                    origem_envio, caminho_origem, caminho_arquivado, resumo_extracao
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sha_final,
                    nome_limpo,
                    ext,
                    tam_final,
                    categoria_norm,
                    tipo_doc_norm,
                    ent_tipo_norm,
                    entidade_id,
                    entidade_nome,
                    origem_envio,
                    caminho_origem or caminho,
                    caminho_arquivado,
                    resumo_extracao,
                ),
            )
            reg_id = cursor.lastrowid
        conn.commit()

    return {
        "id": reg_id,
        "sha256": sha_final,
        "nome_arquivo": nome_limpo,
        "ja_existia_antes": len(anteriores) > 0,
        "duplicado_mesma_entidade": mesma_entidade is not None,
        "correspondencias_anteriores": anteriores,
    }


def listar_arquivos_enviados(
    busca: Optional[str] = None,
    categoria: Optional[str] = None,
    limite: int = 200,
) -> List[Dict[str, Any]]:
    """Lista os arquivos enviados com filtros opcionais de categoria e termo de busca."""
    condicoes: List[str] = []
    params: List[Any] = []

    if categoria and categoria.strip().upper() not in ("", "TODOS", "TODAS"):
        condicoes.append("UPPER(categoria) = ?")
        params.append(categoria.strip().upper())

    if busca and busca.strip():
        like = f"%{busca.strip()}%"
        condicoes.append(
            "(nome_arquivo LIKE ? OR COALESCE(entidade_nome, '') LIKE ? "
            "OR COALESCE(tipo_documento, '') LIKE ? OR sha256 LIKE ? "
            "OR COALESCE(resumo_extracao, '') LIKE ?)"
        )
        params.extend([like, like, like, like, like])

    where_sql = f"WHERE {' AND '.join(condicoes)}" if condicoes else ""
    limite_seguro = max(1, min(int(limite or 200), 1000))
    params.append(limite_seguro)

    rows = execute_query(
        f"""
        SELECT * FROM arquivos_enviados_ia
        {where_sql}
        ORDER BY enviado_em DESC, id DESC
        LIMIT ?
        """,
        params=tuple(params),
        fetch_all=True,
    ) or []

    return [_formatar_correspondencia(r) for r in rows]


def excluir_arquivo_enviado(registro_id: int) -> bool:
    """Remove um registro do histórico de arquivos enviados."""
    row = execute_query(
        "SELECT id FROM arquivos_enviados_ia WHERE id = ?",
        params=(registro_id,),
        fetch_one=True,
    )
    if not row:
        return False
    execute_query("DELETE FROM arquivos_enviados_ia WHERE id = ?", params=(registro_id,), commit=True)
    return True
