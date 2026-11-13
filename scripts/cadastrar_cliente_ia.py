"""
scripts/cadastrar_cliente_ia.py — Utilitário de automação para cadastro e atualização
de clientes via dados extraídos por IA (OCR / Visão Multimodal de documentos).

Pode ser invocado via linha de comando (CLI) passando JSON, arquivo ou via stdin:
    python scripts/cadastrar_cliente_ia.py --json '{"nome_completo": "Fulano", "cpf_cnpj": "12345678900"}'
    python scripts/cadastrar_cliente_ia.py --file dados_extraidos.json --image "caminho/print.png"
"""

import os
import sys
import json
import shutil
import hashlib
import logging
import argparse
import re
from datetime import datetime
from typing import Dict, Any, Optional, List, Union

# Adiciona raiz do projeto ao sys.path para garantir imports corretos
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from config import DB_PATH
from database.connection import DatabaseManager, execute_query
from services.gestores.cliente_manager import (
    cadastrar_cliente,
    atualizar_cliente,
    salvar_documento_cliente,
    ClienteManager,
    limpar_documento,
    validar_cpf_cnpj
)

logger = logging.getLogger("cadastrar_cliente_ia")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

_MESES_PT = {
    "janeiro": "01", "fevereiro": "02", "março": "03", "marco": "03",
    "abril": "04", "maio": "05", "junho": "06",
    "julho": "07", "agosto": "08", "setembro": "09",
    "outubro": "10", "novembro": "11", "dezembro": "12",
}


def normalizar_data(valor: Optional[str]) -> Optional[str]:
    """Converte datas em formatos variados (DD/MM/AAAA, DD de mês de AAAA) para ISO AAAA-MM-DD."""
    if not valor or not str(valor).strip():
        return None
    val = str(valor).strip()
    # Caso já seja AAAA-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}$", val):
        return val
    # Caso seja DD/MM/AAAA ou DD-MM-AAAA ou DD.MM.AAAA
    m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$", val)
    if m:
        dia, mes, ano = m.group(1).zfill(2), m.group(2).zfill(2), m.group(3)
        return f"{ano}-{mes}-{dia}"
    # Caso seja "15 de março de 1985"
    m_ext = re.match(r"^(\d{1,2})\s+de\s+([a-zA-ZçÇ]+)\s+de\s+(\d{4})$", val.lower())
    if m_ext:
        mes_num = _MESES_PT.get(m_ext.group(2))
        if mes_num:
            return f"{m_ext.group(3)}-{mes_num}-{m_ext.group(1).zfill(2)}"
    return val


def _normalizar_genero(valor: Any) -> Optional[str]:
    """Normaliza gênero/sexo para 'M' ou 'F', retornando None se ausente."""
    if valor is None or not str(valor).strip():
        return None
    s = str(valor).upper().strip()
    if s.startswith("F") or "FEMIN" in s or "MULHER" in s:
        return "F"
    if s.startswith("M") or "MASC" in s or "HOMEM" in s:
        return "M"
    return None


_PREPOSICOES_PT = {
    "da", "de", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos",
    "a", "o", "as", "os", "para", "por", "com"
}

_SIGLAS_PRESERVAR = {
    "LTDA", "ME", "EPP", "EIRELI", "S/A", "S.A.", "SA", "CIA",
    "CPF", "CNPJ", "RG", "CNH", "INCRA", "SIGEF", "BR", "PR", "SP",
    "SC", "RS", "MS", "MT", "MG", "RJ", "BA", "GO", "TO", "PA", "RO",
    "AC", "AM", "RR", "AP", "MA", "PI", "CE", "RN", "PB", "PE", "AL",
    "SE", "ES", "DF"
}


def _capitalizar_texto_ocr(valor: Any) -> Any:
    """Converte strings inteiramente em CAIXA ALTA (padrão OCR) para Title Case legível."""
    if not isinstance(valor, str):
        return valor
    texto = valor.strip()
    if not texto or not texto.isupper():
        return texto

    tokens = texto.split(" ")
    resultado = []
    for idx, tok in enumerate(tokens):
        if not tok:
            continue
        tok_limpo = tok.strip(",.;:-()/")
        if tok_limpo in _SIGLAS_PRESERVAR or re.match(r"^[IVXLCDM]+$", tok_limpo):
            resultado.append(tok)
        elif tok_limpo in ("S/N", "S.N."):
            resultado.append("s/n")
        elif idx > 0 and tok.lower() in _PREPOSICOES_PT:
            resultado.append(tok.lower())
        else:
            resultado.append(tok.capitalize())
    return " ".join(resultado)


def normalizar_dados_cliente(dados: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitiza e padroniza campos de clientes, omitindo valores vazios para preservar dados em updates."""
    # Remove chaves None ou strings vazias para não sobrescrever dados existentes em atualizações
    dados_limpos: Dict[str, Any] = {}
    for k, v in dados.items():
        if v is None:
            continue
        if isinstance(v, str) and not v.strip():
            continue
        dados_limpos[k] = v

    # Capitalização inteligente para campos em CAIXA ALTA vindos de OCR
    for campo_txt in (
        "nome_completo", "nome", "razao_social", "nome_fantasia",
        "nome_conjuge", "filiacao_mae", "filiacao_pai", "filiacao",
        "cidade", "bairro", "naturalidade", "endereco_completo",
        "cartorio_casamento", "profissao", "profissao_conjuge"
    ):
        if dados_limpos.get(campo_txt):
            dados_limpos[campo_txt] = _capitalizar_texto_ocr(dados_limpos[campo_txt])

    # Tipo de pessoa (PF / PJ)
    if dados_limpos.get("tipo_pessoa"):
        dados_limpos["tipo_pessoa"] = str(dados_limpos["tipo_pessoa"]).strip().upper()

    # Razão Social / Nome Fantasia (PJ)
    if dados_limpos.get("razao_social"):
        dados_limpos["razao_social"] = str(dados_limpos["razao_social"]).strip()
    if dados_limpos.get("nome_fantasia"):
        dados_limpos["nome_fantasia"] = str(dados_limpos["nome_fantasia"]).strip()

    # Nome completo (ou razão social como fallback para PJ)
    nome = dados_limpos.get("nome_completo") or dados_limpos.get("nome") or dados_limpos.get("razao_social")
    if nome:
        nome_str = str(nome).strip()
        dados_limpos["nome_completo"] = nome_str
        dados_limpos["nome"] = nome_str

    # CPF / CNPJ
    doc_raw = dados_limpos.get("cpf_cnpj") or dados_limpos.get("cnpj") or dados_limpos.get("cpf")
    if doc_raw:
        doc_limpo = limpar_documento(doc_raw)
        dados_limpos["cpf_cnpj"] = doc_limpo
        if len(doc_limpo) == 14 and not dados_limpos.get("tipo_pessoa"):
            dados_limpos["tipo_pessoa"] = "PJ"

    # RG / Órgão / UF
    if dados_limpos.get("rg_ie") or dados_limpos.get("rg"):
        val_rg = str(dados_limpos.get("rg_ie") or dados_limpos.get("rg")).strip()
        dados_limpos["rg_ie"] = val_rg
    if dados_limpos.get("rg_orgao"):
        dados_limpos["rg_orgao"] = str(dados_limpos["rg_orgao"]).strip().upper()
    if dados_limpos.get("rg_uf"):
        dados_limpos["rg_uf"] = str(dados_limpos["rg_uf"]).strip().upper()

    # CNH
    if dados_limpos.get("cnh_numero"):
        dados_limpos["cnh_numero"] = re.sub(r"\D", "", str(dados_limpos["cnh_numero"])) or str(dados_limpos["cnh_numero"]).strip()
    if dados_limpos.get("cnh_categoria"):
        dados_limpos["cnh_categoria"] = str(dados_limpos["cnh_categoria"]).strip().upper()
    if dados_limpos.get("cnh_validade"):
        dados_limpos["cnh_validade"] = normalizar_data(dados_limpos["cnh_validade"])
    if dados_limpos.get("cnh_orgao_uf"):
        dados_limpos["cnh_orgao_uf"] = str(dados_limpos["cnh_orgao_uf"]).strip().upper()

    # Datas
    if dados_limpos.get("data_nascimento_fundacao"):
        dados_limpos["data_nascimento_fundacao"] = normalizar_data(dados_limpos["data_nascimento_fundacao"])
    elif dados_limpos.get("data_nascimento"):
        dados_limpos["data_nascimento_fundacao"] = normalizar_data(dados_limpos["data_nascimento"])
    elif dados_limpos.get("data_abertura"):
        dados_limpos["data_nascimento_fundacao"] = normalizar_data(dados_limpos["data_abertura"])

    if dados_limpos.get("data_casamento"):
        dados_limpos["data_casamento"] = normalizar_data(dados_limpos["data_casamento"])

    # Sexo / Gênero (só define se informado no payload)
    sexo_norm = _normalizar_genero(dados_limpos.get("sexo") or dados_limpos.get("genero"))
    if sexo_norm:
        dados_limpos["sexo"] = sexo_norm
    else:
        dados_limpos.pop("sexo", None)

    # Dados do Cônjuge
    if dados_limpos.get("cpf_conjuge"):
        dados_limpos["cpf_conjuge"] = limpar_documento(dados_limpos["cpf_conjuge"])
    if dados_limpos.get("rg_orgao_conjuge"):
        dados_limpos["rg_orgao_conjuge"] = str(dados_limpos["rg_orgao_conjuge"]).strip().upper()
    if dados_limpos.get("rg_uf_conjuge"):
        dados_limpos["rg_uf_conjuge"] = str(dados_limpos["rg_uf_conjuge"]).strip().upper()
    gen_conj = _normalizar_genero(dados_limpos.get("genero_conjuge"))
    if gen_conj:
        dados_limpos["genero_conjuge"] = gen_conj
    else:
        dados_limpos.pop("genero_conjuge", None)

    # Endereço / UF / CEP
    if dados_limpos.get("estado"):
        dados_limpos["estado"] = str(dados_limpos["estado"]).strip().upper()
    if dados_limpos.get("cep"):
        cep_dig = re.sub(r"\D", "", str(dados_limpos["cep"]))
        if len(cep_dig) == 8:
            dados_limpos["cep"] = f"{cep_dig[:5]}-{cep_dig[5:]}"

    # Estado Civil padronizado
    if dados_limpos.get("estado_civil"):
        est_civil = str(dados_limpos["estado_civil"]).strip().lower()
        if "casad" in est_civil:
            dados_limpos["estado_civil"] = "Casado(a)"
        elif "solteir" in est_civil:
            dados_limpos["estado_civil"] = "Solteiro(a)"
        elif "divorci" in est_civil:
            dados_limpos["estado_civil"] = "Divorciado(a)"
        elif "viuv" in est_civil or "viúv" in est_civil:
            dados_limpos["estado_civil"] = "Viúvo(a)"
        elif "uni" in est_civil and "est" in est_civil:
            dados_limpos["estado_civil"] = "União Estável"
        else:
            dados_limpos["estado_civil"] = est_civil.capitalize()

    # Metadados de Filiação (só inclui 'metadados' se houver conteúdo real)
    metadados_in = dados_limpos.get("metadados")
    metadados = dict(metadados_in) if isinstance(metadados_in, dict) else {}
    if dados_limpos.get("filiacao_mae"):
        metadados["filiacao_mae"] = str(dados_limpos["filiacao_mae"]).strip()
    if dados_limpos.get("filiacao_pai"):
        metadados["filiacao_pai"] = str(dados_limpos["filiacao_pai"]).strip()
    if dados_limpos.get("filiacao") and not dados_limpos.get("filiacao_mae"):
        metadados["filiacao"] = str(dados_limpos["filiacao"]).strip()
    if metadados:
        dados_limpos["metadados"] = metadados
    else:
        dados_limpos.pop("metadados", None)

    return dados_limpos


def _inferir_tipo_documento(dados: Dict[str, Any]) -> str:
    """Infere o tipo de documento mais adequado a partir dos campos extraídos."""
    if dados.get("tipo_documento"):
        return str(dados["tipo_documento"]).strip().upper()
    if dados.get("cnh_numero"):
        return "CNH"
    if dados.get("certidao_casamento_matricula") or dados.get("cartorio_casamento") or dados.get("data_casamento"):
        return "CERTIDAO_CASAMENTO"
    cpf_cnpj = str(dados.get("cpf_cnpj") or "")
    if dados.get("tipo_pessoa") == "PJ" or dados.get("razao_social") or len(cpf_cnpj) == 14:
        return "CARTAO_CNPJ"
    if dados.get("endereco_completo") and not dados.get("rg_ie") and not dados.get("cnh_numero"):
        return "COMPROVANTE_RESIDENCIA"
    return "RG"


def _hash_arquivo(caminho: str) -> str:
    """Calcula SHA-256 de um arquivo em blocos para detectar anexos duplicados."""
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def anexar_arquivo_documento(cliente_id: int, caminho_imagem: str, dados: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Copia a imagem/PDF para a pasta oficial de documentos do cliente e registra na base."""
    if not caminho_imagem or not os.path.exists(caminho_imagem):
        return None

    try:
        nome_arquivo = os.path.basename(caminho_imagem)
        ext = os.path.splitext(nome_arquivo)[1].lower() or ".png"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]

        tipo_doc = _inferir_tipo_documento(dados)

        numero_doc = (
            dados.get("rg_ie")
            or dados.get("cnh_numero")
            or dados.get("certidao_casamento_matricula")
            or dados.get("cpf_cnpj")
            or dados.get("cep")
            or "DOCUMENTO"
        )

        # Destino
        destino_dir = os.path.join(BASE_DIR, "uploads", "documentos_clientes", str(cliente_id))
        os.makedirs(destino_dir, exist_ok=True)

        # Evita duplicação caso o mesmo arquivo já tenha sido anexado para este cliente
        hash_novo = _hash_arquivo(caminho_imagem)
        for arq_existente in os.listdir(destino_dir):
            caminho_ex = os.path.join(destino_dir, arq_existente)
            if os.path.isfile(caminho_ex) and _hash_arquivo(caminho_ex) == hash_novo:
                return {
                    "tipo": tipo_doc,
                    "numero": numero_doc,
                    "caminho": caminho_ex,
                    "arquivo": arq_existente,
                    "tamanho_bytes": os.path.getsize(caminho_ex),
                    "duplicado": True
                }

        novo_nome = f"{tipo_doc}_{timestamp}{ext}"
        caminho_final = os.path.join(destino_dir, novo_nome)
        shutil.copy2(caminho_imagem, caminho_final)
        tamanho = os.path.getsize(caminho_final)

        orgao_emissor = dados.get("rg_orgao") or dados.get("cnh_orgao_uf") or dados.get("cartorio_casamento")
        if not orgao_emissor and tipo_doc == "RG":
            orgao_emissor = "SSP"

        doc_payload = {
            "tipo_documento": tipo_doc,
            "numero": numero_doc,
            "orgao_emissor": orgao_emissor,
            "uf_emissor": dados.get("rg_uf") or dados.get("estado"),
            "categoria_cnh": dados.get("cnh_categoria"),
            "data_validade": dados.get("cnh_validade"),
            "observacoes": "Documento importado automaticamente via IA Assistente (Visão Multimodal).",
            "arquivo_path": caminho_final,
            "arquivo_nome": novo_nome,
            "tamanho_bytes": tamanho
        }

        res_doc = salvar_documento_cliente(cliente_id, doc_payload)
        if "error" in res_doc:
            logger.warning(f"Aviso ao registrar documento na tabela: {res_doc['error']}")
            return {"tipo": tipo_doc, "caminho": caminho_final, "arquivo": novo_nome, "aviso": res_doc["error"]}

        return {
            "tipo": tipo_doc,
            "numero": numero_doc,
            "caminho": caminho_final,
            "arquivo": novo_nome,
            "tamanho_bytes": tamanho
        }
    except Exception as e:
        logger.error(f"Erro ao anexar arquivo de documento: {e}")
        return None


def _filtrar_enriquecimento(cliente_id: int, dados: Dict[str, Any], sobrescrever: bool) -> Dict[str, Any]:
    """
    Em atualizações, preserva dados pré-existentes válidos no banco quando sobrescrever=False,
    e faz merge de metadados para não apagar chaves já gravadas.
    """
    dados_filtrados = dict(dados)

    # Merge de metadados existentes
    if "metadados" in dados_filtrados and isinstance(dados_filtrados["metadados"], dict):
        rows_meta = execute_query(
            "SELECT chave, valor FROM cliente_metadados WHERE id_cliente = ?",
            params=(cliente_id,),
            fetch_all=True
        ) or []
        meta_atual = {r["chave"]: r["valor"] for r in rows_meta}
        for k, v in dados_filtrados["metadados"].items():
            if sobrescrever or not meta_atual.get(k):
                meta_atual[k] = v
        dados_filtrados["metadados"] = meta_atual

    if sobrescrever:
        return dados_filtrados

    row_atual = execute_query("""
        SELECT p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie, p.genero as sexo,
               p.nacionalidade, p.profissao, p.estado_civil, p.regime_bens,
               p.endereco_completo, p.endereco_sem_numero, p.numero_endereco, p.bairro,
               p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge, p.genero_conjuge,
               p.nacionalidade_conjuge, p.profissao_conjuge, p.rg_orgao_conjuge, p.rg_uf_conjuge,
               p.data_casamento, p.cartorio_casamento, p.livro_casamento, p.folha_casamento, p.termo_casamento,
               p.tipo_pessoa, p.razao_social, p.nome_fantasia, p.inscricao_estadual, p.inscricao_municipal,
               p.cnh_numero, p.cnh_categoria, p.cnh_validade, p.cnh_orgao_uf,
               p.rg_orgao, p.rg_uf, p.naturalidade, p.certidao_casamento_matricula,
               c.data_nascimento_fundacao, c.email, c.telefone, c.cidade, c.estado, c.cep
        FROM clientes c
        JOIN pessoas p ON c.pessoa_id = p.id
        WHERE c.id = ?
    """, params=(cliente_id,), fetch_one=True)

    if not row_atual:
        return dados_filtrados

    atual = dict(row_atual)
    resultado = {}
    for k, v in dados_filtrados.items():
        if k in ("metadados", "cpf_cnpj", "tipo_documento", "caminho_imagem", "imagem_path", "caminhos_imagens"):
            resultado[k] = v
            continue
        if k == "nome":
            continue
        valor_atual = atual.get(k)
        # Só preenche se o campo atual no banco estiver vazio/nulo
        if valor_atual is None or (isinstance(valor_atual, str) and not valor_atual.strip()):
            resultado[k] = v

    # Garante nome_completo válido exigido por atualizar_cliente
    if "nome_completo" not in resultado and atual.get("nome_completo"):
        resultado["nome_completo"] = atual["nome_completo"]

    return resultado


def processar_cadastro_ia(
    dados_brutos: Dict[str, Any],
    caminho_imagem: Optional[Union[str, List[str]]] = None,
    sobrescrever: bool = False,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Processa os dados extraídos de documento de identidade via IA e cadastra ou atualiza
    o cliente atomicamente no banco SQLite do GerenciGeo.
    """
    sobrescrever = bool(sobrescrever or dados_brutos.get("sobrescrever"))
    dry_run = bool(dry_run or dados_brutos.get("dry_run"))
    dados = normalizar_dados_cliente(dados_brutos)
    nome = dados.get("nome_completo")
    cpf_cnpj = dados.get("cpf_cnpj")

    # Validação do CPF/CNPJ se informado
    if cpf_cnpj and not validar_cpf_cnpj(cpf_cnpj):
        return {"sucesso": False, "erro": f"CPF/CNPJ inválido detectado: {cpf_cnpj}"}

    # Vínculo automático de Representante Legal para PJ via CPF
    rep_cpf = dados.pop("representante_legal_cpf", None)
    if rep_cpf and not dados.get("representante_legal_id"):
        rep_cpf_limpo = limpar_documento(rep_cpf)
        if rep_cpf_limpo:
            row_rep = execute_query(
                "SELECT id FROM pessoas WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '') = ?",
                params=(rep_cpf_limpo,),
                fetch_one=True
            )
            if row_rep:
                dados["representante_legal_id"] = row_rep["id"]

    cliente_id = None
    pessoa_id = None
    acao = "CRIADO"
    campos_atualizados = []

    # 1. Verifica se já existe cliente cadastrado com esse CPF/CNPJ (ou por nome exato se sem CPF)
    if cpf_cnpj:
        row_cli = execute_query("""
            SELECT c.id as cliente_id, p.id as pessoa_id, p.nome, p.cpf_cnpj
            FROM pessoas p
            JOIN clientes c ON c.pessoa_id = p.id
            WHERE REPLACE(REPLACE(REPLACE(p.cpf_cnpj, '.', ''), '-', ''), '/', '') = ?
        """, params=(cpf_cnpj,), fetch_one=True)

        if row_cli:
            cliente_id = row_cli["cliente_id"]
            pessoa_id = row_cli["pessoa_id"]
            if not nome:
                nome = row_cli["nome"]
                dados["nome_completo"] = nome
                dados["nome"] = nome
            acao = "ATUALIZADO"
    elif nome:
        matches = execute_query("""
            SELECT c.id as cliente_id, p.id as pessoa_id, p.nome, p.cpf_cnpj
            FROM pessoas p
            JOIN clientes c ON c.pessoa_id = p.id
            WHERE LOWER(TRIM(p.nome)) = LOWER(TRIM(?))
        """, params=(nome,), fetch_all=True) or []

        if len(matches) == 1:
            row_cli = matches[0]
            cliente_id = row_cli["cliente_id"]
            pessoa_id = row_cli["pessoa_id"]
            cpf_cnpj = row_cli["cpf_cnpj"]
            if cpf_cnpj:
                dados["cpf_cnpj"] = cpf_cnpj
            acao = "ATUALIZADO"
        elif len(matches) > 1:
            return {
                "sucesso": False,
                "erro": "Múltiplos clientes encontrados com esse nome. Informe o CPF/CNPJ para identificar corretamente.",
                "candidatos": [
                    {"cliente_id": m["cliente_id"], "nome": m["nome"], "cpf_cnpj": m["cpf_cnpj"]}
                    for m in matches
                ]
            }
        else:
            return {
                "sucesso": False,
                "erro": "CPF/CNPJ é obrigatório para cadastrar um novo cliente (nenhum cliente existente encontrado com esse nome)."
            }

    if not nome:
        return {"sucesso": False, "erro": "Nome completo não identificado no documento ou no cadastro existente."}

    # 2. Prepara payload final e executa (ou simula em dry_run)
    if acao == "ATUALIZADO" and cliente_id:
        dados_update = _filtrar_enriquecimento(cliente_id, dados, sobrescrever=sobrescrever)
        campos_atualizados = [k for k in dados_update.keys() if k not in ("nome_completo", "cpf_cnpj")]
        nome = dados_update.get("nome_completo") or nome
        if dry_run:
            return {
                "sucesso": True,
                "dry_run": True,
                "acao": "ATUALIZADO",
                "cliente_id": cliente_id,
                "pessoa_id": pessoa_id,
                "nome": nome,
                "cpf_cnpj": cpf_cnpj,
                "campos_salvos": campos_atualizados,
                "dados_preparados": dados_update,
                "mensagem": f"[DRY-RUN] Cliente '{nome}' (ID: {cliente_id}) seria atualizado."
            }
        res_update = atualizar_cliente(cliente_id, dados_update)
        if "error" in res_update:
            return {"sucesso": False, "erro": res_update["error"]}
    else:
        # Nacionalidade padrão em novos cadastros PF
        if dados.get("tipo_pessoa") != "PJ" and not dados.get("nacionalidade"):
            dados["nacionalidade"] = "Brasileira"
        campos_atualizados = [k for k, v in dados.items() if v is not None]
        if dry_run:
            return {
                "sucesso": True,
                "dry_run": True,
                "acao": "CRIADO",
                "cliente_id": None,
                "pessoa_id": None,
                "nome": nome,
                "cpf_cnpj": cpf_cnpj,
                "campos_salvos": campos_atualizados,
                "dados_preparados": dados,
                "mensagem": f"[DRY-RUN] Novo cliente '{nome}' seria cadastrado."
            }
        res_create = cadastrar_cliente(dados)
        if "error" in res_create:
            return {"sucesso": False, "erro": res_create["error"]}
        cliente_id = res_create.get("id")
        pessoa_id = res_create.get("pessoa_id")
        acao = "CRIADO"

    # 3. Anexa documento(s) se imagem(ns)/PDF(s) fornecidos
    caminhos_lista: List[str] = []
    if isinstance(caminho_imagem, list):
        caminhos_lista.extend([c for c in caminho_imagem if c])
    elif isinstance(caminho_imagem, str) and caminho_imagem:
        caminhos_lista.append(caminho_imagem)

    for extra_key in ("caminho_imagem", "imagem_path"):
        if dados.get(extra_key):
            caminhos_lista.append(dados[extra_key])
    if isinstance(dados.get("caminhos_imagens"), list):
        caminhos_lista.extend([c for c in dados["caminhos_imagens"] if c])

    docs_anexos = []
    for c_doc in dict.fromkeys(caminhos_lista):
        info = anexar_arquivo_documento(cliente_id, c_doc, dados)
        if info:
            docs_anexos.append(info)
    doc_info = docs_anexos[0] if docs_anexos else None

    # 4. Verificação de Pendência de Cônjuge para Georreferenciamento
    alerta_conjuge = None
    try:
        manager = ClienteManager()
        manager.verificar_dados_conjuge(cliente_id)

        row_conj = execute_query(
            "SELECT p.estado_civil, p.nome_conjuge, p.cpf_conjuge FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE c.id = ?",
            params=(cliente_id,),
            fetch_one=True
        )
        est_civil = str((row_conj["estado_civil"] if row_conj else None) or dados.get("estado_civil") or "").lower()
        nome_conj = (row_conj["nome_conjuge"] if row_conj else None) or dados.get("nome_conjuge")
        cpf_conj = (row_conj["cpf_conjuge"] if row_conj else None) or dados.get("cpf_conjuge")
        if any(x in est_civil for x in ["casado", "uniao", "união"]):
            if not cpf_conj or not nome_conj:
                alerta_conjuge = (
                    "⚠️ Cliente qualificado como casado(a) / união estável, mas dados do cônjuge "
                    "(Nome e CPF) estão incompletos. Uma pendência técnica de georreferenciamento foi aberta."
                )
    except Exception as ex_conj:
        logger.warning(f"Aviso ao verificar dados de cônjuge: {ex_conj}")

    # Retorno estruturado
    msg = (
        f"Cliente '{nome}' cadastrado com sucesso (ID: {cliente_id})."
        if acao == "CRIADO"
        else f"Cadastro do cliente '{nome}' atualizado e enriquecido com sucesso (ID: {cliente_id})."
    )

    return {
        "sucesso": True,
        "acao": acao,
        "cliente_id": cliente_id,
        "pessoa_id": pessoa_id,
        "nome": nome,
        "cpf_cnpj": cpf_cnpj,
        "campos_salvos": campos_atualizados,
        "documento_anexo": doc_info,
        "documentos_anexos": docs_anexos,
        "alerta_conjuge": alerta_conjuge,
        "mensagem": msg
    }


def main():
    parser = argparse.ArgumentParser(description="Cadastro de Clientes via IA e OCR Multimodal - GerenciGeo")
    parser.add_argument("--json", type=str, help="Payload JSON contendo os dados extraídos do documento.")
    parser.add_argument("--file", type=str, help="Caminho para arquivo .json contendo os dados.")
    parser.add_argument("--image", action="append", help="Caminho do print/foto/PDF do documento (pode ser repetido para múltiplos anexos).")
    parser.add_argument("--sobrescrever", action="store_true", help="Permite sobrescrever campos já preenchidos em clientes existentes.")
    parser.add_argument("--dry-run", action="store_true", help="Simula a operação e exibe os dados preparados sem gravar no banco.")

    args = parser.parse_args()

    payload_dict = None
    if args.json:
        try:
            payload_dict = json.loads(args.json)
        except Exception as e:
            print(json.dumps({"sucesso": False, "erro": f"JSON inválido fornecido via --json: {e}"}, ensure_ascii=False))
            sys.exit(1)
    elif args.file:
        try:
            with open(args.file, "r", encoding="utf-8") as f:
                payload_dict = json.load(f)
        except Exception as e:
            print(json.dumps({"sucesso": False, "erro": f"Erro ao ler arquivo {args.file}: {e}"}, ensure_ascii=False))
            sys.exit(1)
    elif not sys.stdin.isatty():
        try:
            stdin_data = sys.stdin.read().strip()
            if stdin_data:
                payload_dict = json.loads(stdin_data)
        except Exception as e:
            print(json.dumps({"sucesso": False, "erro": f"Erro ao decodificar JSON do stdin: {e}"}, ensure_ascii=False))
            sys.exit(1)

    if not payload_dict:
        print(json.dumps({
            "sucesso": False,
            "erro": "Nenhum dado fornecido. Use --json, --file ou envie JSON via stdin."
        }, ensure_ascii=False))
        sys.exit(1)

    resultado = processar_cadastro_ia(
        payload_dict,
        caminho_imagem=args.image,
        sobrescrever=args.sobrescrever,
        dry_run=args.dry_run
    )
    print(json.dumps(resultado, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
