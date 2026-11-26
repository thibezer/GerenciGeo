"""
services/gestores/triagem_matriculas_service.py — Gestão da fila de triagem de matrículas (Matriculas_Entrada).

Permite listar, enviar, visualizar, anotar observações (proprietário, confrontante ou apenas cadastrar)
e remover arquivos da pasta de entrada usada pela skill `cadastrar-matricula`.
"""

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from config import MATRICULAS_INBOX_FOLDER
from services.gestores.historico_arquivos_service import verificar_arquivo_enviado

EXTENSOES_PERMITIDAS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}
TIPOS_VINCULO_VALIDOS = {"apenas_cadastrar", "proprietario", "confrontante"}
METADATA_FILENAME = ".triagem_metadata.json"


def _resolver_pasta(pasta: Optional[str] = None) -> str:
    alvo = pasta or MATRICULAS_INBOX_FOLDER
    os.makedirs(alvo, exist_ok=True)
    return os.path.abspath(alvo)


def _caminho_metadata(pasta: Optional[str] = None) -> str:
    return os.path.join(_resolver_pasta(pasta), METADATA_FILENAME)


def normalizar_tipo_vinculo(valor: Optional[str]) -> str:
    v = (valor or "").strip().lower()
    if v in TIPOS_VINCULO_VALIDOS:
        return v
    return "apenas_cadastrar"


def ler_metadata_triagem(pasta: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    caminho = _caminho_metadata(pasta)
    if not os.path.isfile(caminho):
        return {}
    try:
        with open(caminho, "r", encoding="utf-8") as f:
            dados = json.load(f)
        if isinstance(dados, dict):
            return dados
    except Exception:
        pass
    return {}


def salvar_metadata_triagem(dados: Dict[str, Dict[str, Any]], pasta: Optional[str] = None) -> None:
    caminho = _caminho_metadata(pasta)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=2, ensure_ascii=False)


def remover_metadata_arquivo(nome_arquivo: str, pasta: Optional[str] = None) -> None:
    meta = ler_metadata_triagem(pasta)
    if nome_arquivo in meta:
        del meta[nome_arquivo]
        salvar_metadata_triagem(meta, pasta)


def sanitizar_nome_arquivo(nome_original: str) -> str:
    base = os.path.basename((nome_original or "").strip())
    if not base:
        base = f"matricula_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    stem, ext = os.path.splitext(base)
    stem_limpo = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", stem).strip(" .")
    if not stem_limpo:
        stem_limpo = f"matricula_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    ext_limpo = ext.lower()
    if ext_limpo not in EXTENSOES_PERMITIDAS:
        raise ValueError(
            f"Extensão '{ext_limpo or '(sem extensão)'}' não suportada. Use PDF ou imagem (PNG, JPG, WEBP, TIF)."
        )
    return f"{stem_limpo}{ext_limpo}"


def resolver_caminho_seguro_inbox(nome_arquivo: str, pasta: Optional[str] = None) -> str:
    pasta_abs = _resolver_pasta(pasta)
    nome_limpo = os.path.basename((nome_arquivo or "").strip())
    if not nome_limpo or nome_limpo in (".", "..", METADATA_FILENAME):
        raise ValueError("Nome de arquivo inválido.")
    caminho = os.path.abspath(os.path.join(pasta_abs, nome_limpo))
    if os.path.dirname(caminho) != pasta_abs:
        raise ValueError("Caminho fora da pasta de entrada não permitido.")
    return caminho


def listar_triagem_entrada(
    pasta: Optional[str] = None,
    verificar_historico: bool = True,
) -> Dict[str, Any]:
    pasta_abs = _resolver_pasta(pasta)
    meta = ler_metadata_triagem(pasta_abs)
    arquivos: List[Dict[str, Any]] = []

    for nome in sorted(os.listdir(pasta_abs)):
        if nome == METADATA_FILENAME:
            continue
        caminho = os.path.join(pasta_abs, nome)
        ext = os.path.splitext(nome)[1].lower()
        if not (os.path.isfile(caminho) and ext in EXTENSOES_PERMITIDAS):
            continue

        stat = os.stat(caminho)
        info_meta = meta.get(nome, {}) if isinstance(meta.get(nome), dict) else {}

        ja_enviado = False
        mesmo_nome = False
        correspondencias: List[Dict[str, Any]] = []
        if verificar_historico:
            try:
                verif = verificar_arquivo_enviado(
                    caminho=caminho,
                    nome_arquivo=nome,
                    tamanho_bytes=stat.st_size,
                )
                ja_enviado = bool(verif.get("ja_enviado"))
                mesmo_nome = bool(verif.get("mesmo_nome"))
                correspondencias = (
                    verif.get("correspondencias_hash") or verif.get("correspondencias_nome") or []
                )
            except Exception:
                pass

        arquivos.append({
            "nome": nome,
            "caminho": caminho,
            "extensao": ext,
            "tamanho_bytes": stat.st_size,
            "modificado_em": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
            "tipo_vinculo": normalizar_tipo_vinculo(info_meta.get("tipo_vinculo")),
            "observacao": str(info_meta.get("observacao") or ""),
            "enviado_em": info_meta.get("enviado_em") or datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
            "ja_enviado": ja_enviado,
            "mesmo_nome": mesmo_nome,
            "correspondencias_anteriores": correspondencias,
        })

    return {
        "sucesso": True,
        "pasta_entrada": pasta_abs,
        "total": len(arquivos),
        "arquivos": arquivos,
    }


def salvar_arquivo_triagem(
    nome_original: str,
    conteudo_bytes: bytes,
    tipo_vinculo: str = "apenas_cadastrar",
    observacao: str = "",
    pasta: Optional[str] = None,
) -> Dict[str, Any]:
    if not conteudo_bytes:
        raise ValueError("Arquivo vazio não pode ser enviado para a triagem.")

    pasta_abs = _resolver_pasta(pasta)
    nome_base = sanitizar_nome_arquivo(nome_original)
    stem, ext = os.path.splitext(nome_base)

    nome_final = nome_base
    caminho_final = os.path.join(pasta_abs, nome_final)
    contador = 1
    while os.path.exists(caminho_final):
        nome_final = f"{stem}_{contador}{ext}"
        caminho_final = os.path.join(pasta_abs, nome_final)
        contador += 1

    with open(caminho_final, "wb") as f:
        f.write(conteudo_bytes)

    agora = datetime.now().isoformat(timespec="seconds")
    tipo_norm = normalizar_tipo_vinculo(tipo_vinculo)
    obs_limpa = (observacao or "").strip()

    meta = ler_metadata_triagem(pasta_abs)
    meta[nome_final] = {
        "tipo_vinculo": tipo_norm,
        "observacao": obs_limpa,
        "enviado_em": agora,
        "nome_original": os.path.basename(nome_original or nome_final),
    }
    salvar_metadata_triagem(meta, pasta_abs)

    verif = {}
    try:
        verif = verificar_arquivo_enviado(
            caminho=caminho_final,
            nome_arquivo=nome_final,
            tamanho_bytes=len(conteudo_bytes),
        )
    except Exception:
        pass

    return {
        "sucesso": True,
        "nome": nome_final,
        "caminho": caminho_final,
        "extensao": ext,
        "tamanho_bytes": len(conteudo_bytes),
        "tipo_vinculo": tipo_norm,
        "observacao": obs_limpa,
        "enviado_em": agora,
        "ja_enviado": bool(verif.get("ja_enviado")),
        "mesmo_nome": bool(verif.get("mesmo_nome")),
        "correspondencias_anteriores": (
            verif.get("correspondencias_hash") or verif.get("correspondencias_nome") or []
        ),
    }


def atualizar_observacao_triagem(
    nome_arquivo: str,
    tipo_vinculo: Optional[str] = None,
    observacao: Optional[str] = None,
    pasta: Optional[str] = None,
) -> Dict[str, Any]:
    pasta_abs = _resolver_pasta(pasta)
    caminho = resolver_caminho_seguro_inbox(nome_arquivo, pasta_abs)
    if not os.path.isfile(caminho):
        raise FileNotFoundError(f"Arquivo '{nome_arquivo}' não encontrado na pasta de entrada.")

    nome_real = os.path.basename(caminho)
    meta = ler_metadata_triagem(pasta_abs)
    atual = meta.get(nome_real, {}) if isinstance(meta.get(nome_real), dict) else {}

    if tipo_vinculo is not None:
        atual["tipo_vinculo"] = normalizar_tipo_vinculo(tipo_vinculo)
    elif "tipo_vinculo" not in atual:
        atual["tipo_vinculo"] = "apenas_cadastrar"

    if observacao is not None:
        atual["observacao"] = observacao.strip()
    elif "observacao" not in atual:
        atual["observacao"] = ""

    atual["atualizado_em"] = datetime.now().isoformat(timespec="seconds")
    meta[nome_real] = atual
    salvar_metadata_triagem(meta, pasta_abs)

    return {
        "sucesso": True,
        "nome": nome_real,
        "tipo_vinculo": atual["tipo_vinculo"],
        "observacao": atual["observacao"],
    }


def remover_arquivo_triagem(nome_arquivo: str, pasta: Optional[str] = None) -> Dict[str, Any]:
    pasta_abs = _resolver_pasta(pasta)
    caminho = resolver_caminho_seguro_inbox(nome_arquivo, pasta_abs)
    if not os.path.isfile(caminho):
        raise FileNotFoundError(f"Arquivo '{nome_arquivo}' não encontrado na pasta de entrada.")

    nome_real = os.path.basename(caminho)
    os.remove(caminho)
    remover_metadata_arquivo(nome_real, pasta_abs)
    return {
        "sucesso": True,
        "nome": nome_real,
        "mensagem": f"Arquivo '{nome_real}' removido da fila de triagem.",
    }
