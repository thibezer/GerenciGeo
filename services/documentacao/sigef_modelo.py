"""Preenchimento da Planilha Eletrônica SIGEF a partir de uma CÓPIA do modelo oficial (.ods).

O modelo traz macros, validações, listas suspensas e proteção de abas; por isso só o `content.xml` é
alterado (células de `identificacao` e das abas `perimetro_N`) e todo o resto do ZIP é copiado intacto.
"""

import copy
import re
import zipfile
from pathlib import Path
from typing import Optional

from lxml import etree as ET

MODELO_PADRAO = Path(__file__).resolve().parents[2] / "recursos" / "sigef" / "PLANILHA_SIGEF_MODELO.ods"

_NS_TABLE = "urn:oasis:names:tc:opendocument:xmlns:table:1.0"
_NS_OFFICE = "urn:oasis:names:tc:opendocument:xmlns:office:1.0"
_NS_TEXT = "urn:oasis:names:tc:opendocument:xmlns:text:1.0"
_NS_FORM = "urn:oasis:names:tc:opendocument:xmlns:form:1.0"
_NS_CALCEXT = "urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0"
_NS_XML = "http://www.w3.org/XML/1998/namespace"

T = "{%s}" % _NS_TABLE
O = "{%s}" % _NS_OFFICE
X = "{%s}" % _NS_TEXT
F = "{%s}" % _NS_FORM
C = "{%s}" % _NS_CALCEXT

# Linha (1-based) onde começa a tabela de vértices e colunas de `perimetro_N` (A..L)
_LINHA_PRIMEIRO_VERTICE = 12
_COLUNAS_VERTICE = 12


class ModeloSigefError(ValueError):
    """Modelo ausente ou com estrutura diferente da esperada."""


def _celulas(linha) -> list:
    return [c for c in linha if c.tag in (T + "table-cell", T + "covered-table-cell")]


def _obter_celula(linha, indice: int):
    """Devolve a célula de índice `indice`, desmembrando células repetidas (`number-columns-repeated`)."""
    pos = 0
    for c in _celulas(linha):
        rep = int(c.get(T + "number-columns-repeated", "1"))
        if indice < pos + rep:
            if rep > 1:
                antes = indice - pos
                depois = rep - antes - 1
                if antes:
                    c_antes = copy.deepcopy(c)
                    c_antes.set(T + "number-columns-repeated", str(antes)) if antes > 1 else c_antes.attrib.pop(T + "number-columns-repeated", None)
                    c.addprevious(c_antes)
                if depois:
                    c_depois = copy.deepcopy(c)
                    c_depois.set(T + "number-columns-repeated", str(depois)) if depois > 1 else c_depois.attrib.pop(T + "number-columns-repeated", None)
                    c.addnext(c_depois)
                c.attrib.pop(T + "number-columns-repeated", None)
            return c
        pos += rep
    raise ModeloSigefError(f"Célula de índice {indice} não encontrada na linha do modelo.")


def _definir_valor(celula, valor) -> None:
    """Grava texto (str), número ((float, texto)) ou vazio (None/'') preservando estilo e validação da célula."""
    for filho in list(celula):
        celula.remove(filho)
    for attr in (O + "value-type", O + "value", O + "string-value", C + "value-type", T + "formula"):
        celula.attrib.pop(attr, None)
    if valor is None or valor == "":
        return
    if isinstance(valor, tuple):
        numero, texto = valor
        celula.set(O + "value-type", "float")
        celula.set(O + "value", repr(float(numero)).rstrip("0").rstrip(".") if float(numero) != int(numero) else str(int(numero)))
        celula.set(C + "value-type", "float")
    else:
        texto = str(valor)
        celula.set(O + "value-type", "string")
        celula.set(C + "value-type", "string")
    p = ET.SubElement(celula, X + "p")
    p.text = texto


def _definir(linhas: list, linha_1based: int, coluna: int, valor) -> None:
    _definir_valor(_obter_celula(linhas[linha_1based - 1], coluna), valor)


def _linhas_expandidas(tabela, ate: int) -> list:
    """Lista de linhas 1..`ate` desmembrando `number-rows-repeated` (apenas na área de cabeçalho)."""
    resultado = []
    for linha in tabela.findall(T + "table-row"):
        rep = int(linha.get(T + "number-rows-repeated", "1"))
        if rep > 1 and len(resultado) + 1 <= ate:
            raise ModeloSigefError("Linha repetida inesperada no cabeçalho do modelo.")
        resultado.append(linha)
        if len(resultado) >= ate:
            break
    return resultado


def _selecionar_opcao(tabela, nome_lista: str, rotulo: str) -> None:
    """Sincroniza a opção marcada da lista suspensa com o valor gravado na célula."""
    for lb in tabela.iter(F + "listbox"):
        if lb.get(F + "name") != nome_lista:
            continue
        for opt in lb.findall(F + "option"):
            marcado = (opt.get(F + "label") or "").strip() == rotulo.strip()
            for attr in (F + "selected", F + "current-selected"):
                if marcado:
                    opt.set(attr, "true")
                else:
                    opt.attrib.pop(attr, None)


def _num_ou_texto(valor: str):
    """Código só com dígitos e sem zero à esquerda vira número (como no modelo); senão, texto."""
    v = (valor or "").strip()
    if v.isdigit() and not v.startswith("0"):
        return (float(v), v)
    return v


def _formatar_documento(doc: str, juridica: bool) -> str:
    d = re.sub(r"\D", "", doc or "")
    if not juridica and len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    if juridica and len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    return d


def _preencher_identificacao(tabela, ident: dict) -> None:
    linhas = _linhas_expandidas(tabela, 17)
    juridica = bool(ident.get("juridica"))
    _definir(linhas, 5, 1, "Jurídica" if juridica else "Física")
    _selecionar_opcao(tabela, "lstTipoPessoa", "Jurídica" if juridica else "Física")
    _definir(linhas, 6, 1, ident.get("nome", ""))
    _definir(linhas, 7, 0, "CNPJ:" if juridica else "CPF:")
    _definir(linhas, 7, 1, _formatar_documento(ident.get("documento", ""), juridica))
    _definir(linhas, 10, 1, ident.get("denominacao", ""))
    _definir(linhas, 13, 1, _num_ou_texto(re.sub(r"[.\-\s]", "", ident.get("sncr", "") or "")))
    _definir(linhas, 14, 1, _num_ou_texto(re.sub(r"[.\-\s]", "", ident.get("cns", "") or "")))
    _definir(linhas, 15, 1, _num_ou_texto(ident.get("matricula", "")))
    municipio = ident.get("municipio_uf", "")
    _definir(linhas, 17, 0, municipio)
    _definir(linhas, 17, 1, municipio)


def _preencher_perimetro(tabela, parte: dict) -> None:
    linhas_tpl = tabela.findall(T + "table-row")
    cab = _linhas_expandidas(tabela, 11)
    _definir(cab, 3, 1, parte.get("denominacao", ""))
    _definir(cab, 4, 1, parte.get("parcela", "001"))
    _definir(cab, 5, 1, "Externo")
    _definir(cab, 9, 3, str(parte["meridiano_central"]))
    _definir(cab, 9, 5, parte.get("hemisferio", "Sul"))
    _selecionar_opcao(tabela, "lstMeridianos", str(parte["meridiano_central"]))
    _selecionar_opcao(tabela, "lstHemisferio", parte.get("hemisferio", "Sul"))
    _selecionar_opcao(tabela, "lstTypeCoord", "UTM")
    _selecionar_opcao(tabela, "lstTypeSide", "Externo")

    # Blocos de linhas de dados do modelo (n repetições cada): 5 + 4 + restante da planilha
    blocos = linhas_tpl[_LINHA_PRIMEIRO_VERTICE - 1:_LINHA_PRIMEIRO_VERTICE + 2]
    if len(blocos) < 3 or any(T + "number-rows-repeated" not in b.attrib for b in blocos):
        raise ModeloSigefError("Estrutura das linhas de vértice do modelo SIGEF diferente da esperada.")
    ancora = blocos[0].getprevious()
    contagens = [int(b.get(T + "number-rows-repeated")) for b in blocos]
    vertices = parte["vertices"]
    if len(vertices) > sum(contagens):
        raise ModeloSigefError("Quantidade de vértices excede a capacidade da planilha.")
    for b in blocos:
        b.getparent().remove(b)

    novas = []
    restante = list(vertices)
    for modelo, total in zip(blocos, contagens):
        usados = min(len(restante), total)
        for _ in range(usados):
            v = restante.pop(0)
            linha = copy.deepcopy(modelo)
            linha.attrib.pop(T + "number-rows-repeated", None)
            for col, valor in enumerate(v[:_COLUNAS_VERTICE]):
                _definir_valor(_obter_celula(linha, col), valor)
            novas.append(linha)
        if usados < total:
            sobra = copy.deepcopy(modelo)
            sobra.set(T + "number-rows-repeated", str(total - usados))
            novas.append(sobra)
    for linha in novas:
        ancora.addnext(linha)
        ancora = linha


def _renomear_controles(tabela, proximo_id: int) -> int:
    """Dá IDs únicos aos controles de formulário de uma aba clonada. Devolve o próximo ID livre."""
    for el in tabela.iter():
        xml_id = el.get("{%s}id" % _NS_XML)
        if xml_id and xml_id.startswith("control"):
            novo = f"control{proximo_id}"
            proximo_id += 1
            el.set("{%s}id" % _NS_XML, novo)
            if el.get(F + "id"):
                el.set(F + "id", novo)
    return proximo_id


def preencher_modelo_sigef(destino: str, ident: dict, partes: list, modelo: Optional[Path] = None) -> None:
    """
    Copia o modelo SIGEF para `destino` preenchendo `identificacao` e uma aba `perimetro_N` por parte.
    `partes`: lista de dicts {denominacao, parcela, meridiano_central, hemisferio, vertices}, onde cada
    vértice é uma lista de 12 valores na ordem das colunas A..L da planilha.
    """
    modelo = Path(modelo or MODELO_PADRAO)
    if not modelo.exists():
        raise ModeloSigefError(f"Modelo da planilha SIGEF não encontrado em {modelo}.")
    if not partes:
        raise ModeloSigefError("Nenhum perímetro para exportar.")

    with zipfile.ZipFile(modelo) as zin:
        raiz = ET.fromstring(zin.read("content.xml"))
        tabelas = {t.get(T + "name"): t for t in raiz.iter(T + "table")}
        for nome in ("identificacao", "perimetro_1"):
            if nome not in tabelas:
                raise ModeloSigefError(f"O modelo não possui a aba '{nome}'.")

        # Clones do perímetro (antes de preencher), com IDs de controle únicos
        base = tabelas["perimetro_1"]
        ids = [int(m.group(1)) for m in re.finditer(r'xml:id="control(\d+)"', ET.tostring(raiz).decode("utf-8"))]
        proximo = max(ids, default=0) + 1
        clones = []
        for n in range(2, len(partes) + 1):
            clone = copy.deepcopy(base)
            clone.set(T + "name", f"perimetro_{n}")
            proximo = _renomear_controles(clone, proximo)
            clones.append(clone)
        ancora = base
        for clone in clones:
            ancora.addnext(clone)
            ancora = clone

        _preencher_identificacao(tabelas["identificacao"], ident)
        for tabela, parte in zip([base] + clones, partes):
            _preencher_perimetro(tabela, parte)

        conteudo = ET.tostring(raiz, xml_declaration=True, encoding="UTF-8", standalone=True)
        with zipfile.ZipFile(destino, "w") as zout:
            for info in zin.infolist():
                dados = conteudo if info.filename == "content.xml" else zin.read(info.filename)
                comp = zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED
                zout.writestr(zipfile.ZipInfo(info.filename, info.date_time), dados, compress_type=comp)
