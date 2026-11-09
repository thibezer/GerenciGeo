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
import logging
import argparse
from datetime import datetime
from typing import Dict, Any, Optional

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


def normalizar_data(valor: Optional[str]) -> Optional[str]:
    """Converte datas em formatos variados (DD/MM/AAAA, DD-MM-AAAA) para o padrão ISO AAAA-MM-DD."""
    if not valor or not str(valor).strip():
        return None
    val = str(valor).strip()
    import re
    # Caso já seja AAAA-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}$", val):
        return val
    # Caso seja DD/MM/AAAA ou DD-MM-AAAA ou DD.MM.AAAA
    m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$", val)
    if m:
        dia, mes, ano = m.group(1).zfill(2), m.group(2).zfill(2), m.group(3)
        return f"{ano}-{mes}-{dia}"
    return val


def normalizar_dados_cliente(dados: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitiza e padroniza campos de clientes para garantir conformidade com o banco."""
    dados_limpos = dict(dados)

    # Nome completo
    nome = dados_limpos.get("nome_completo") or dados_limpos.get("nome")
    if nome:
        nome_str = str(nome).strip()
        # Se estiver tudo em maiúsculas ou minúsculas com mais de 1 palavra, pode preservar ou capitalizar
        dados_limpos["nome_completo"] = nome_str
        dados_limpos["nome"] = nome_str

    # CPF / CNPJ
    if "cpf_cnpj" in dados_limpos and dados_limpos["cpf_cnpj"]:
        dados_limpos["cpf_cnpj"] = limpar_documento(dados_limpos["cpf_cnpj"])
    if "cpf" in dados_limpos and dados_limpos["cpf"]:
        dados_limpos["cpf_cnpj"] = limpar_documento(dados_limpos["cpf"])

    # RG / Órgão / UF
    if dados_limpos.get("rg_ie") or dados_limpos.get("rg"):
        val_rg = str(dados_limpos.get("rg_ie") or dados_limpos.get("rg")).strip()
        dados_limpos["rg_ie"] = val_rg
    if dados_limpos.get("rg_orgao"):
        dados_limpos["rg_orgao"] = str(dados_limpos["rg_orgao"]).strip().upper()
    if dados_limpos.get("rg_uf"):
        dados_limpos["rg_uf"] = str(dados_limpos["rg_uf"]).strip().upper()

    # CNH
    if dados_limpos.get("cnh_categoria"):
        dados_limpos["cnh_categoria"] = str(dados_limpos["cnh_categoria"]).strip().upper()
    if dados_limpos.get("cnh_validade"):
        dados_limpos["cnh_validade"] = normalizar_data(dados_limpos["cnh_validade"])

    # Datas
    if dados_limpos.get("data_nascimento_fundacao"):
        dados_limpos["data_nascimento_fundacao"] = normalizar_data(dados_limpos["data_nascimento_fundacao"])
    elif dados_limpos.get("data_nascimento"):
        dados_limpos["data_nascimento_fundacao"] = normalizar_data(dados_limpos["data_nascimento"])

    if dados_limpos.get("data_casamento"):
        dados_limpos["data_casamento"] = normalizar_data(dados_limpos["data_casamento"])

    # Sexo / Gênero
    sexo = str(dados_limpos.get("sexo") or dados_limpos.get("genero") or "M").upper().strip()
    dados_limpos["sexo"] = "F" if sexo.startswith("F") or "FEMIN" in sexo else "M"

    # CPF Cônjuge
    if dados_limpos.get("cpf_conjuge"):
        dados_limpos["cpf_conjuge"] = limpar_documento(dados_limpos["cpf_conjuge"])

    # Estado Civil padronizado
    est_civil = str(dados_limpos.get("estado_civil") or "").strip().lower()
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
    elif est_civil:
        dados_limpos["estado_civil"] = est_civil.capitalize()

    # Nacionalidade padrão se ausente
    if not dados_limpos.get("nacionalidade"):
        dados_limpos["nacionalidade"] = "Brasileira"

    # Metadados de Filiação (se fornecidos)
    metadados = dados_limpos.get("metadados") or {}
    if dados_limpos.get("filiacao_mae"):
        metadados["filiacao_mae"] = str(dados_limpos["filiacao_mae"]).strip()
    if dados_limpos.get("filiacao_pai"):
        metadados["filiacao_pai"] = str(dados_limpos["filiacao_pai"]).strip()
    if dados_limpos.get("filiacao") and not dados_limpos.get("filiacao_mae"):
        metadados["filiacao"] = str(dados_limpos["filiacao"]).strip()
    dados_limpos["metadados"] = metadados

    return dados_limpos


def anexar_arquivo_documento(cliente_id: int, caminho_imagem: str, dados: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Copia a imagem/print para a pasta oficial de documentos do cliente e registra na base."""
    if not caminho_imagem or not os.path.exists(caminho_imagem):
        return None

    try:
        nome_arquivo = os.path.basename(caminho_imagem)
        ext = os.path.splitext(nome_arquivo)[1].lower() or ".png"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
        
        # Tipo de documento
        tipo_doc = dados.get("tipo_documento")
        if not tipo_doc:
            if dados.get("cnh_numero"):
                tipo_doc = "CNH"
            else:
                tipo_doc = "RG"

        numero_doc = (
            dados.get("rg_ie")
            or dados.get("cnh_numero")
            or dados.get("certidao_casamento_matricula")
            or dados.get("cpf_cnpj")
            or "DOCUMENTO"
        )

        # Destino
        destino_dir = os.path.join(BASE_DIR, "uploads", "documentos_clientes", str(cliente_id))
        os.makedirs(destino_dir, exist_ok=True)

        novo_nome = f"{tipo_doc}_{timestamp}{ext}"
        caminho_final = os.path.join(destino_dir, novo_nome)
        shutil.copy2(caminho_imagem, caminho_final)
        tamanho = os.path.getsize(caminho_final)

        doc_payload = {
            "tipo_documento": tipo_doc,
            "numero": numero_doc,
            "orgao_emissor": dados.get("rg_orgao") or dados.get("cnh_orgao_uf") or "SSP",
            "uf_emissor": dados.get("rg_uf") or "PR",
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
            return {"caminho": caminho_final, "arquivo": novo_nome, "aviso": res_doc["error"]}

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


def processar_cadastro_ia(dados_brutos: Dict[str, Any], caminho_imagem: Optional[str] = None) -> Dict[str, Any]:
    """
    Processa os dados extraídos de documento de identidade via IA e cadastra ou atualiza
    o cliente atomicamente no banco SQLite do GerenciGeo.
    """
    dados = normalizar_dados_cliente(dados_brutos)
    nome = dados.get("nome_completo")
    cpf_cnpj = dados.get("cpf_cnpj")

    # Validação do CPF/CNPJ se informado
    if cpf_cnpj and not validar_cpf_cnpj(cpf_cnpj):
        return {"sucesso": False, "erro": f"CPF/CNPJ inválido detectado: {cpf_cnpj}"}

    cliente_id = None
    pessoa_id = None
    acao = "CRIADO"
    campos_atualizados = []

    # 1. Verifica se já existe cliente cadastrado com esse CPF
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

    if not nome:
        return {"sucesso": False, "erro": "Nome completo não identificado no documento ou no cadastro existente."}

    # 2. Executa Cadastro Novo ou Atualização Enriquecida
    if acao == "ATUALIZADO" and cliente_id:
        res_update = atualizar_cliente(cliente_id, dados)
        if "error" in res_update:
            return {"sucesso": False, "erro": res_update["error"]}
        
        # Também atualiza campos específicos na tabela pessoas para dados recém-extraídos
        campos_update_pessoas = []
        valores_update_pessoas = []
        for campo_p in ["rg", "rg_orgao", "rg_uf", "cnh_numero", "cnh_categoria", "cnh_validade", "cnh_orgao_uf", "naturalidade", "estado_civil", "regime_bens", "nome_conjuge", "cpf_conjuge", "certidao_casamento_matricula", "data_casamento", "cartorio_casamento", "livro_casamento", "folha_casamento", "termo_casamento"]:
            val = dados.get(campo_p) or dados.get("rg_ie" if campo_p == "rg" else "")
            if val is not None and str(val).strip():
                campos_update_pessoas.append(f"{campo_p} = COALESCE(?, {campo_p})")
                valores_update_pessoas.append(str(val).strip())
                campos_atualizados.append(campo_p)
                
        if campos_update_pessoas:
            valores_update_pessoas.append(pessoa_id)
            sql_p = f"UPDATE pessoas SET {', '.join(campos_update_pessoas)} WHERE id = ?"
            execute_query(sql_p, params=tuple(valores_update_pessoas), commit=True)

    else:
        # Se for cliente novo (ou pessoa já existente sem registro em clientes)
        res_create = cadastrar_cliente(dados)
        if "error" in res_create:
            return {"sucesso": False, "erro": res_create["error"]}
        cliente_id = res_create.get("id")
        pessoa_id = res_create.get("pessoa_id")
        acao = "CRIADO"
        campos_atualizados = [k for k, v in dados.items() if v]

    # 3. Anexa documento se a imagem foi fornecida
    caminho_doc = caminho_imagem or dados.get("caminho_imagem") or dados.get("imagem_path")
    doc_info = None
    if caminho_doc:
        doc_info = anexar_arquivo_documento(cliente_id, caminho_doc, dados)

    # 4. Verificação de Pendência de Cônjuge para Georreferenciamento
    alerta_conjuge = None
    try:
        manager = ClienteManager()
        manager.verificar_dados_conjuge(cliente_id)
        
        est_civil = str(dados.get("estado_civil") or "").lower()
        if any(x in est_civil for x in ["casado", "uniao", "união"]):
            if not dados.get("cpf_conjuge") or not dados.get("nome_conjuge"):
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
        "campos_salvos": [c for c in dados.keys() if dados.get(c) is not None],
        "documento_anexo": doc_info,
        "alerta_conjuge": alerta_conjuge,
        "mensagem": msg
    }


def main():
    parser = argparse.ArgumentParser(description="Cadastro de Clientes via IA e OCR Multimodal - GerenciGeo")
    parser.add_argument("--json", type=str, help="Payload JSON contendo os dados extraídos do documento.")
    parser.add_argument("--file", type=str, help="Caminho para arquivo .json contendo os dados.")
    parser.add_argument("--image", type=str, help="Caminho do print/foto do documento para arquivamento.")

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

    resultado = processar_cadastro_ia(payload_dict, caminho_imagem=args.image)
    print(json.dumps(resultado, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
