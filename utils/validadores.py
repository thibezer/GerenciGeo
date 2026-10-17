"""Validação e normalização de documentos (CPF/CNPJ) e utilitários de texto compartilhados.

Regras:
- valor vazio/None é sempre aceito (campo opcional); só valores preenchidos são validados;
- a validação confere tamanho, sequências repetidas e os dígitos verificadores.
"""

import re
import unicodedata
from typing import Optional

# Expressão SQL que remove a pontuação de um documento guardado como texto (CPF/CNPJ formatado ou não).
# Usada nas consultas e na criação do índice por expressão, para que o SQLite use o índice.
SQL_DOC_NORMALIZADO = "REPLACE(REPLACE(REPLACE(REPLACE({col}, '.', ''), '-', ''), '/', ''), ' ', '')"


def sql_doc_normalizado(coluna: str = "cpf_cnpj") -> str:
    """Fragmento SQL que devolve só os dígitos (sem . - / espaço) de `coluna`."""
    return SQL_DOC_NORMALIZADO.format(col=coluna)


def normalizar_documento(valor) -> str:
    """Só os dígitos do documento ('' para vazio/None)."""
    return re.sub(r"\D", "", str(valor)) if valor is not None else ""


def validar_cpf(valor) -> bool:
    """True se `valor` (com ou sem máscara) é um CPF com dígitos verificadores corretos. Vazio => False."""
    cpf = normalizar_documento(valor)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for i in (9, 10):
        soma = sum(int(cpf[n]) * ((i + 1) - n) for n in range(i))
        digito = ((soma * 10) % 11) % 10
        if digito != int(cpf[i]):
            return False
    return True


def validar_cnpj(valor) -> bool:
    """True se `valor` é um CNPJ numérico com dígitos verificadores corretos. Vazio => False."""
    cnpj = normalizar_documento(valor)
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False

    def digito(base: str) -> int:
        # Da direita para a esquerda os pesos oficiais são 2,3,4,...,9,2,3,...
        soma = sum(int(car) * (2 + pos % 8) for pos, car in enumerate(reversed(base)))
        resto = soma % 11
        return 0 if resto < 2 else 11 - resto

    d1 = digito(cnpj[:12])
    d2 = digito(cnpj[:12] + str(d1))
    return cnpj[12:] == f"{d1}{d2}"


def documento_valido(valor) -> bool:
    """CPF (11 dígitos) ou CNPJ (14 dígitos) válido. Vazio => True (campo opcional)."""
    doc = normalizar_documento(valor)
    if not doc:
        return str(valor or "").strip() == ""
    if len(doc) == 11:
        return validar_cpf(doc)
    if len(doc) == 14:
        return validar_cnpj(doc)
    return False


def cpf_opcional_valido(valor) -> bool:
    """CPF válido; vazio => True (usado para o CPF do cônjuge)."""
    if valor is None or str(valor).strip() == "":
        return True
    return validar_cpf(valor)


def normalizar_nome(texto: Optional[str]) -> str:
    """Nome comparável: sem acentos (inclusive não-ASCII), caixa alta e espaços colapsados.
    O LOWER() do SQLite só trata ASCII, então a comparação de nomes deve ser feita em Python com esta função."""
    if not texto:
        return ""
    sem_acento = "".join(c for c in unicodedata.normalize("NFKD", str(texto)) if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sem_acento.strip().upper())


# ── Domínios SIGEF ──────────────────────────────────────────────────────────────

_RE_TIPO_LIMITE = re.compile(r"^(LA[1-7]|LN[1-6]|LI[1-9])$")
_RE_METODO = re.compile(r"^(P[GTA][1-9]|PS[1-4]|PB[1-2]|MC[1-9])$")


def normalizar_tipo_limite(valor) -> Optional[str]:
    """Código SIGEF do limite (LA1-LA7 artificial, LN1-LN6 natural, LI1-LI9 inacessível). Vazio => None;
    inválido => ValueError."""
    if valor is None or str(valor).strip() == "":
        return None
    codigo = str(valor).strip().upper()
    if not _RE_TIPO_LIMITE.match(codigo):
        raise ValueError(f"tipo_limite_sigef inválido: '{valor}'. Use LA1-LA7, LN1-LN6 ou LI1-LI9.")
    return codigo


def normalizar_metodo_posicionamento(valor) -> Optional[str]:
    """Código SIGEF do método de posicionamento (PG1-9, PT1-9, PA1-9, PS1-4, PB1-2; MC1 é o padrão interno de
    divisa sem GNSS). Vazio => None; inválido => ValueError."""
    if valor is None or str(valor).strip() == "":
        return None
    codigo = str(valor).strip().upper()
    if not _RE_METODO.match(codigo):
        raise ValueError(f"metodo_posicionamento_sigef inválido: '{valor}'. Use PG1-9, PT1-9, PA1-9, PS1-4 ou PB1-2.")
    return codigo


def normalizar_genero(valor) -> Optional[str]:
    """'M' ou 'F'; vazio/None => None (não informado); outro valor => ValueError."""
    if valor is None or str(valor).strip() == "":
        return None
    g = str(valor).strip().upper()
    if g not in ("M", "F"):
        raise ValueError("genero deve ser 'M', 'F' ou vazio (não informado).")
    return g
