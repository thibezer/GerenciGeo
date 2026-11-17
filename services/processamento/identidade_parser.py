"""
services/processamento/identidade_parser.py — Parser inteligente de documentos de identidade (RG, CNH, Certidões) em PDF.
Utiliza PyMuPDF (fitz) e regex para extrair campos cadastrais estruturados.
"""

import re
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

def extrair_texto_pdf(file_bytes: bytes) -> str:
    """
    Extrai todo o conteúdo textual de um arquivo PDF fornecido em bytes via PyMuPDF.
    """
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        texto_completo = []
        for pagina in doc:
            texto_completo.append(pagina.get_text())
        doc.close()
        return "\n".join(texto_completo)
    except Exception as e:
        logger.warning(f"Erro ao extrair texto do PDF com PyMuPDF: {e}")
        return ""

def _normalizar_data(data_str: str) -> Optional[str]:
    """Converte DD/MM/AAAA para AAAA-MM-DD."""
    if not data_str:
        return None
    partes = re.split(r"[/.-]", data_str.strip())
    if len(partes) == 3:
        d, m, y = partes[0], partes[1], partes[2]
        if len(y) == 4 and len(d) <= 2 and len(m) <= 2:
            return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
        if len(d) == 4 and len(y) <= 2 and len(m) <= 2:
            return f"{d}-{m.zfill(2)}-{y.zfill(2)}"
    return data_str

def parse_identidade_pdf(file_bytes: bytes, filename: str = "") -> Dict[str, Any]:
    """
    Analisa o arquivo PDF, detecta se é RG, CNH ou documento civil, e extrai campos estruturados.
    """
    texto = extrair_texto_pdf(file_bytes)
    linhas = [l.strip() for l in texto.splitlines() if l.strip()]
    texto_unificado = " ".join(linhas)

    dados: Dict[str, Any] = {
        "tipo_identificado": "DOCUMENTO",
        "is_cin": False,
        "nome_completo": None,
        "cpf": None,
        "rg_numero": None,
        "rg_orgao": None,
        "rg_uf": None,
        "cnh_numero": None,
        "cnh_categoria": None,
        "cnh_validade": None,
        "cnh_orgao_uf": None,
        "data_nascimento": None,
        "naturalidade": None,
        "nacionalidade": None,
        "filiacao": None,
        "texto_bruto": texto[:2000] # Limite para auditoria
    }

    # 1. Detecção de CIN (Carteira de Identidade Nacional) e CNH (Carteira Nacional de Habilitação)
    is_cin = bool(
        re.search(r"CARTEIRA\s+DE\s+IDENTIDADE\s+NACIONAL|\bCIN\b", texto, re.IGNORECASE)
    )
    is_cnh = not is_cin and bool(
        re.search(r"HABILITA[CÇ][AÃ]O|CARTEIRA\s+NACIONAL\s+DE\s+HABILITA|DETRAN|DENATRAN|RENACH|CAT\.?\s*HAB", texto, re.IGNORECASE)
    )

    # 2. Extração de CPF
    cpf_match = re.search(r"\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b", texto)
    if cpf_match:
        dados["cpf"] = cpf_match.group(1).replace(".", "").replace("-", "")

    # 3. Extração de CNH (Número de Registro, Categoria, Validade)
    if is_cnh:
        dados["tipo_identificado"] = "CNH"
        
        # Número de registro CNH (geralmente 11 dígitos)
        num_cnh = re.search(r"(?:N[º°\.\s]*REGISTRO|REGISTRO|CNH)\s*[:\.\-]?\s*(\d{9,11})", texto, re.IGNORECASE)
        if num_cnh:
            dados["cnh_numero"] = num_cnh.group(1)
        elif not dados["cnh_numero"]:
            # Procura sequência isolada de 11 dígitos que não seja CPF
            nums = re.findall(r"\b\d{11}\b", texto)
            for n in nums:
                if n != dados["cpf"]:
                    dados["cnh_numero"] = n
                    break

        # Categoria CNH
        cat_match = re.search(r"(?:CAT(?:EGORIA|\.?\s*HAB\.?)?)\s*[:\.\-]?\s*([A-E]{1,2})\b", texto, re.IGNORECASE)
        if cat_match:
            dados["cnh_categoria"] = cat_match.group(1).upper()

        # Validade CNH
        val_match = re.search(r"(?:VALIDADE|VAL\.?)\s*[:\.\-]?\s*(\d{2}/\d{2}/\d{4})", texto, re.IGNORECASE)
        if val_match:
            dados["cnh_validade"] = _normalizar_data(val_match.group(1))

        # Órgão Emissor DETRAN
        orgao_detran = re.search(r"(DETRAN(?:[-/][A-Z]{2})?)", texto, re.IGNORECASE)
        if orgao_detran:
            dados["cnh_orgao_uf"] = orgao_detran.group(1).upper()

    # 4. Extração de RG / CIN (na CIN o número de registro nacional é o próprio CPF)
    if is_cin:
        dados["is_cin"] = True
        dados["tipo_identificado"] = "RG"
        if dados["cpf"] and len(dados["cpf"]) == 11:
            c = dados["cpf"]
            dados["rg_numero"] = f"{c[:3]}.{c[3:6]}.{c[6:9]}-{c[9:]}"

    rg_match = re.search(r"(?:REGISTRO\s+GERAL|DOC(?:UMENTO)?\.?\s+IDENTIDADE|\bIDENTIDADE\b|\bR\.?G\.?)\s*[:\.\-]?\s*([0-9][0-9A-Za-z\.\-]{4,15})", texto, re.IGNORECASE)
    if rg_match:
        val_rg = rg_match.group(1).strip().replace(" ", "")
        rg_digitos = re.sub(r"\D", "", val_rg)
        if is_cin or rg_digitos != dados["cpf"]:
            dados["rg_numero"] = val_rg
            if not is_cnh:
                dados["tipo_identificado"] = "RG"

    # Órgão expedidor e UF do RG/CIN (ex: SSP/PR, SESP/PR, IIPR/PR, IGP/SC, PC/SP, DETRAN/RJ)
    orgao_direto = re.search(r"\b(SESP|SSP|IIPR|IGP|ITEP|IFP|POLITEC|SEJUSP|SDS|PC|IIEP|DIC)\s*[-/]\s*([A-Z]{2})\b", texto, re.IGNORECASE)
    if orgao_direto:
        dados["rg_orgao"] = orgao_direto.group(1).upper()
        dados["rg_uf"] = orgao_direto.group(2).upper()
    else:
        orgao_match = re.search(r"(?:[OÓ]RG[AÃ]O\s*(?:EXPEDIDOR|EMISSOR)?)\s*[:\.\-/]?\s*([A-Z]{2,8}(?:\s*[-/]\s*[A-Z]{2})?)", texto, re.IGNORECASE)
        if orgao_match:
            orgao_txt = re.sub(r"\s+", "", orgao_match.group(1).upper())
            if "/" in orgao_txt or "-" in orgao_txt:
                parts = re.split(r"[-/]", orgao_txt, maxsplit=1)
                dados["rg_orgao"] = parts[0]
                dados["rg_uf"] = parts[1]
            else:
                dados["rg_orgao"] = orgao_txt
        else:
            sigla_orgao = re.search(r"\b(IIPR|SESP|SSP|IGP|ITEP|IFP|POLITEC|SEJUSP|SDS|IIEP|DIC)\b", texto, re.IGNORECASE)
            if sigla_orgao:
                dados["rg_orgao"] = sigla_orgao.group(1).upper()

    if not dados["rg_uf"]:
        uf_match = re.search(r"\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b", texto)
        if uf_match:
            dados["rg_uf"] = uf_match.group(1)
            if not dados["rg_orgao"] and not is_cin:
                dados["rg_orgao"] = "SSP"

    # 5. Extração de Data de Nascimento
    nasc_match = re.search(r"(?:DATA\s+(?:DE\s+)?NASCIMENTO|NASCIMENTO|NASC\.?|D\.N\.)\s*[:\.\-]?\s*(\d{2}/\d{2}/\d{4})", texto, re.IGNORECASE)
    if nasc_match:
        dados["data_nascimento"] = _normalizar_data(nasc_match.group(1))

    # 6. Extração de Naturalidade
    nat_match = re.search(r"(?:NATURALIDADE|NAT\.?)\s*[:\.\-]?\s*([A-Za-zÀ-ÿ\s]+(?:\s*[-/]\s*[A-Z]{2})?)", texto, re.IGNORECASE)
    if nat_match:
        val_nat = nat_match.group(1).strip()
        # Limita caracteres espúrios
        if len(val_nat) < 40 and not any(x in val_nat.lower() for x in ["doc", "nasc", "filiacao", "cpf", "val"]):
            dados["naturalidade"] = val_nat

    # 7. Extração de Nacionalidade
    nac_match = re.search(r"(?:NACIONALIDADE|NAC\.?)\s*[:\.\-]?\s*(BRASILEIR[OA]|ESTRANGEIR[OA]|[A-Za-zÀ-ÿ]+)", texto, re.IGNORECASE)
    if nac_match:
        dados["nacionalidade"] = nac_match.group(1).capitalize()

    return dados
