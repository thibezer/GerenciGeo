"""
scripts/cadastrar_matricula_ia.py — Utilitário de automação para cadastro e atualização
de propriedades e matrículas imobiliárias rurais via IA (OCR Multimodal de Certidões de Matrícula).

Invocado via linha de comando (CLI) passando JSON, arquivo ou via stdin:
    python scripts/cadastrar_matricula_ia.py --json '{...}' --pdf 'caminho/matricula.pdf'
"""

import os
import sys
import re
import json
import shutil
import logging
import argparse
from datetime import datetime
from typing import Dict, Any, Optional, List

# Adiciona raiz do projeto ao sys.path para garantir imports corretos
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from config import DB_PATH, EXPORT_BASE_FOLDER
from database.connection import DatabaseManager, execute_query
from services.gestores.cliente_manager import limpar_documento, vincular_cliente_propriedade
from services.gestores.matricula_manager import resolver_campos_matricula, COLUNAS_MATRICULA

logger = logging.getLogger("cadastrar_matricula_ia")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def limpar_numero_matricula(num: Any) -> str:
    """Padroniza o número da matrícula preservando o formato oficial legível."""
    if not num:
        return ""
    s = str(num).strip()
    return s


def converter_area_para_hectares(dados: Dict[str, Any], uf: str = "PR") -> Optional[float]:
    """
    Calcula e normaliza a área em hectares a partir de diferentes unidades:
    - Se informado em hectares (ha), usa diretamente.
    - Se informado em metros quadrados (m²), converte dividindo por 10.000.
    - Se informado em alqueires, aplica o multiplicador regional:
      * Paulista (PR, SP, MS): 1 alqueire = 2,42 ha = 24.200 m²
      * Mineiro / Goiano / Norte: 1 alqueire = 4,84 ha = 48.400 m²
      * Baiano: 1 alqueire = 9,68 ha
    """
    if dados.get("area_ha") is not None and float(dados.get("area_ha")) > 0:
        return round(float(dados["area_ha"]), 4)

    if dados.get("area_m2") is not None and float(dados.get("area_m2")) > 0:
        return round(float(dados["area_m2"]) / 10000.0, 4)

    area_alq = dados.get("area_alqueires")
    if area_alq is not None and float(area_alq) > 0:
        tipo_alq = str(dados.get("tipo_alqueire") or "").lower()
        uf_upper = str(uf or "").upper()
        
        if "mineir" in tipo_alq or "goian" in tipo_alq or "norte" in tipo_alq:
            fator = 4.84
        elif "baian" in tipo_alq:
            fator = 9.68
        else:
            # Padrão Paraná / São Paulo / Sul
            fator = 2.42
            
        return round(float(area_alq) * fator, 4)

    return None


def anexar_arquivo_matricula(matricula_id: int, propriedade_id: int, caminho_pdf: str, num_matricula: str) -> Optional[str]:
    """Copia o PDF da matrícula para o diretório oficial e atualiza o caminho no banco."""
    if not caminho_pdf or not os.path.exists(caminho_pdf):
        return None

    try:
        dest_dir = os.path.join(BASE_DIR, "uploads", "documentos_matriculas", str(matricula_id))
        os.makedirs(dest_dir, exist_ok=True)

        num_limpo = re.sub(r'[^0-9A-Za-z]', '_', str(num_matricula))
        nome_final = f"Matricula_{num_limpo}.pdf"
        caminho_final = os.path.join(dest_dir, nome_final)

        shutil.copy2(caminho_pdf, caminho_final)

        execute_query(
            "UPDATE matriculas SET caminho_arquivo_pdf = ? WHERE id = ?",
            params=(caminho_final, matricula_id),
            commit=True
        )
        return caminho_final
    except Exception as e:
        logger.error(f"Erro ao anexar PDF da matrícula {matricula_id}: {e}")
        return None


def processar_matricula_ia(dados_brutos: Dict[str, Any], caminho_pdf: Optional[str] = None) -> Dict[str, Any]:
    """
    Processa dados extraídos de certidão de matrícula via IA, localizando ou criando a
    propriedade correspondente, cadastrando/atualizando a matrícula e associando os proprietários.
    """
    dados = dict(dados_brutos)
    num_matricula = limpar_numero_matricula(dados.get("numero_matricula") or dados.get("matricula"))
    if not num_matricula:
        return {"sucesso": False, "erro": "Número da matrícula não identificado."}

    municipio = (dados.get("municipio") or dados.get("cri_comarca") or dados.get("comarca") or "").strip()
    uf = (dados.get("uf") or "PR").strip().upper()[:2]
    if not municipio:
        municipio = "Não Informado"

    # CCIR / CAR / ITR
    codigo_ccir = dados.get("codigo_ccir") or dados.get("ccir")
    if codigo_ccir:
        codigo_ccir = str(codigo_ccir).strip()
    codigo_car = dados.get("codigo_car") or dados.get("car")
    if codigo_car:
        codigo_car = str(codigo_car).strip()
    codigo_itr = dados.get("codigo_itr") or dados.get("itr") or dados.get("nirf")
    if codigo_itr:
        codigo_itr = str(codigo_itr).strip()

    # Denominação do imóvel
    denominacao = dados.get("denominacao") or dados.get("nome_imovel") or dados.get("denominacao_gleba") or f"Matrícula {num_matricula}"
    nome_propriedade = dados.get("nome_propriedade") or denominacao

    # Cálculo da Área em Hectares
    area_ha = converter_area_para_hectares(dados, uf)

    # 1. Localização ou Criação da Propriedade
    propriedade_id = dados.get("propriedade_id")
    acao_propriedade = "EXISTENTE"

    if not propriedade_id:
        # Busca por CCIR se presente
        if codigo_ccir:
            ccir_limpo = re.sub(r'\D', '', codigo_ccir)
            if ccir_limpo:
                row_p = execute_query(
                    "SELECT id, nome_propriedade, municipio FROM propriedades WHERE REPLACE(REPLACE(REPLACE(codigo_ccir, '.', ''), '-', ''), '/', '') LIKE ?",
                    params=(f"%{ccir_limpo[:9]}%",),
                    fetch_one=True
                )
                if row_p:
                    propriedade_id = row_p["id"]

        # Busca por matrícula já existente com o mesmo número
        if not propriedade_id:
            num_busca = re.sub(r'\D', '', num_matricula)
            row_m = execute_query(
                """SELECT p.id FROM propriedades p 
                   JOIN matriculas m ON m.propriedade_id = p.id 
                   WHERE REPLACE(REPLACE(m.numero_matricula, '.', ''), '-', '') = ?""",
                params=(num_busca,),
                fetch_one=True
            )
            if row_m:
                propriedade_id = row_m["id"]

        # Se ainda não encontrada, busca pelo nome exato no mesmo município
        if not propriedade_id:
            row_nome = execute_query(
                "SELECT id FROM propriedades WHERE LOWER(nome_propriedade) = LOWER(?) AND LOWER(municipio) = LOWER(?)",
                params=(nome_propriedade, municipio),
                fetch_one=True
            )
            if row_nome:
                propriedade_id = row_nome["id"]

        # Se não existe, cria a propriedade
        if not propriedade_id:
            with DatabaseManager() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO propriedades (nome_propriedade, codigo_car, codigo_ccir, municipio, uf)
                    VALUES (?, ?, ?, ?, ?)
                """, (nome_propriedade, codigo_car, codigo_ccir, municipio, uf))
                propriedade_id = cursor.lastrowid
                conn.commit()
            acao_propriedade = "CRIADA"
        else:
            # Atualiza dados ausentes na propriedade encontrada (enriquecimento)
            campos_up_p = []
            vals_up_p = []
            if codigo_ccir:
                campos_up_p.append("codigo_ccir = COALESCE(NULLIF(codigo_ccir, ''), ?)")
                vals_up_p.append(codigo_ccir)
            if codigo_car:
                campos_up_p.append("codigo_car = COALESCE(NULLIF(codigo_car, ''), ?)")
                vals_up_p.append(codigo_car)
            if campos_up_p:
                vals_up_p.append(propriedade_id)
                execute_query(f"UPDATE propriedades SET {', '.join(campos_up_p)} WHERE id = ?", params=tuple(vals_up_p), commit=True)
                acao_propriedade = "ATUALIZADA"

    # 2. Localização ou Criação da Matrícula
    matricula_id = None
    acao_matricula = "CRIADA"
    num_busca = re.sub(r'\D', '', num_matricula)
    
    row_mat = execute_query(
        "SELECT id, area_ha, caminho_arquivo_pdf FROM matriculas WHERE propriedade_id = ? AND REPLACE(REPLACE(numero_matricula, '.', ''), '-', '') = ?",
        params=(propriedade_id, num_busca),
        fetch_one=True
    )

    cri_comarca = dados.get("cri_comarca") or dados.get("comarca") or municipio
    cri_circ = dados.get("cri_circunscricao") or dados.get("cartorio") or f"Registro de Imóveis de {cri_comarca} - {uf}"
    livro = dados.get("livro_registro") or dados.get("livro") or "2"
    folha = dados.get("folha_registro") or dados.get("folha") or dados.get("ficha")
    memorial_georref = dados.get("georreferenciamento") or dados.get("memorial_descritivo") or dados.get("divisas_confrontacoes")

    if row_mat:
        matricula_id = row_mat["id"]
        acao_matricula = "ATUALIZADA"
        
        # Atualiza a matrícula mantendo área registrada se existente
        sql_up_m = """
            UPDATE matriculas 
            SET
                cri_comarca = COALESCE(?, cri_comarca),
                cri_circunscricao = COALESCE(?, cri_circunscricao),
                livro_registro = COALESCE(?, livro_registro),
                folha_registro = COALESCE(?, folha_registro),
                ccir = COALESCE(?, ccir),
                itr = COALESCE(?, itr),
                denominacao = COALESCE(?, denominacao),
                georreferenciamento = COALESCE(?, georreferenciamento),
                area_ha = COALESCE(?, area_ha)
            WHERE id = ?
        """
        execute_query(sql_up_m, params=(
            cri_comarca, cri_circ, livro, folha, codigo_ccir, codigo_itr,
            denominacao, memorial_georref, area_ha, matricula_id
        ), commit=True)
    else:
        # Insere nova matrícula
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO matriculas (
                    propriedade_id, numero_matricula, cri_comarca, cri_circunscricao, livro_registro,
                    folha_registro, ccir, itr, denominacao, georreferenciamento, area_ha
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                propriedade_id, num_matricula, cri_comarca, cri_circ, livro,
                folha, codigo_ccir, codigo_itr, denominacao, memorial_georref, area_ha
            ))
            matricula_id = cursor.lastrowid
            conn.commit()

    # 3. Anexa o PDF da matrícula se fornecido
    caminho_doc = caminho_pdf or dados.get("caminho_arquivo_pdf") or dados.get("arquivo_pdf")
    pdf_salvo = None
    if caminho_doc:
        pdf_salvo = anexar_arquivo_matricula(matricula_id, propriedade_id, caminho_doc, num_matricula)

    # 4. Vínculo Inteligente com Proprietários (Clientes)
    proprietarios_input = dados.get("proprietarios") or []
    proprietarios_vinculados = []
    
    # Se só veio um proprietário isolado nas chaves
    if not proprietarios_input and (dados.get("proprietario_nome") or dados.get("proprietario_cpf")):
        proprietarios_input.append({
            "nome": dados.get("proprietario_nome"),
            "cpf": dados.get("proprietario_cpf"),
            "percentual": dados.get("proprietario_percentual", 100.0)
        })

    for prop in proprietarios_input:
        nome_prop = prop.get("nome") or prop.get("nome_completo")
        cpf_prop = limpar_documento(prop.get("cpf") or prop.get("cpf_cnpj"))
        part_prop = float(prop.get("percentual") or 0.0)

        cliente_id = None
        if cpf_prop:
            row_c = execute_query(
                "SELECT c.id FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE REPLACE(REPLACE(REPLACE(p.cpf_cnpj, '.', ''), '-', ''), '/', '') = ?",
                params=(cpf_prop,),
                fetch_one=True
            )
            if row_c:
                cliente_id = row_c["id"]

        if not cliente_id and nome_prop:
            row_cn = execute_query(
                "SELECT c.id FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE LOWER(p.nome) = LOWER(?)",
                params=(nome_prop.strip(),),
                fetch_one=True
            )
            if row_cn:
                cliente_id = row_cn["id"]

        if cliente_id:
            # Vincula ou atualiza percentual do cliente à propriedade
            vincular_cliente_propriedade(propriedade_id, cliente_id, part_prop)
            proprietarios_vinculados.append({
                "cliente_id": cliente_id,
                "nome": nome_prop,
                "cpf": cpf_prop,
                "percentual": part_prop,
                "status": "VINCULADO"
            })
        else:
            proprietarios_vinculados.append({
                "cliente_id": None,
                "nome": nome_prop,
                "cpf": cpf_prop,
                "percentual": part_prop,
                "status": "CLIENTE_NAO_ENCONTRADO_SUGERIR_CADASTRO"
            })

    return {
        "sucesso": True,
        "propriedade_id": propriedade_id,
        "matricula_id": matricula_id,
        "numero_matricula": num_matricula,
        "nome_propriedade": nome_propriedade,
        "comarca": cri_comarca,
        "uf": uf,
        "area_registrada_ha": area_ha,
        "codigo_ccir": codigo_ccir,
        "codigo_itr": codigo_itr,
        "acao_propriedade": acao_propriedade,
        "acao_matricula": acao_matricula,
        "proprietarios": proprietarios_vinculados,
        "arquivo_pdf_salvo": pdf_salvo,
        "memorial_descritivo_extraido": bool(memorial_georref),
        "mensagem": f"Matrícula nº {num_matricula} ({acao_matricula}) processada com sucesso na Propriedade ID {propriedade_id} ({acao_propriedade})."
    }


def main():
    parser = argparse.ArgumentParser(description="Lançamento e Extração de Matrículas e Propriedades via IA - GerenciGeo")
    parser.add_argument("--json", type=str, help="Payload JSON com dados da matrícula.")
    parser.add_argument("--file", type=str, help="Arquivo .json com os dados.")
    parser.add_argument("--pdf", type=str, help="Caminho do arquivo PDF da certidão de matrícula.")

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

    resultado = processar_matricula_ia(payload_dict, caminho_pdf=args.pdf)
    print(json.dumps(resultado, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
