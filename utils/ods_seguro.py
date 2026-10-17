"""Leitura defensiva de planilhas ODS enviadas pelo usuário (ZIP + XML).

Protege contra:
- zip bomb (arquivo pequeno que expande para gigabytes): limites de tamanho do upload, do conteúdo descompactado
  e da razão de compressão, aplicados também durante a leitura (não só pelos cabeçalhos do ZIP, que podem mentir);
- XML malicioso (entidades expandidas / "billion laughs", entidades externas, DOCTYPE): o `content.xml` legítimo de
  um ODS não usa DTD, então qualquer DOCTYPE/ENTITY é rejeitado.
"""

import io
import re
import xml.etree.ElementTree as ET
import zipfile

try:  # defusedxml é a defesa principal; sem ele vale a checagem manual abaixo
    from defusedxml import ElementTree as _DefusedET
except Exception:  # pragma: no cover
    _DefusedET = None

LIMITE_UPLOAD_BYTES = 50 * 1024 * 1024        # arquivo enviado
LIMITE_DESCOMPACTADO_BYTES = 200 * 1024 * 1024  # soma dos arquivos dentro do ZIP e do content.xml
LIMITE_RAZAO_COMPRESSAO = 200                 # tamanho descompactado / compactado por entrada

_PADRAO_DTD = re.compile(rb"<!\s*(DOCTYPE|ENTITY)", re.IGNORECASE)


class ArquivoInseguroError(ValueError):
    """Upload rejeitado por segurança (tamanho, zip bomb ou XML com DTD/entidades)."""


def verificar_tamanho_upload(conteudo: bytes) -> None:
    if len(conteudo) > LIMITE_UPLOAD_BYTES:
        raise ArquivoInseguroError(
            f"Arquivo excede o limite de {LIMITE_UPLOAD_BYTES // (1024 * 1024)} MB."
        )


def ler_content_xml(conteudo: bytes) -> bytes:
    """Devolve o `content.xml` do ODS depois de validar tamanho, razão de compressão e leitura limitada."""
    verificar_tamanho_upload(conteudo)
    try:
        zf = zipfile.ZipFile(io.BytesIO(conteudo))
    except zipfile.BadZipFile as e:
        raise ArquivoInseguroError(f"Arquivo ODS inválido (ZIP corrompido): {e}")
    with zf:
        total = 0
        for info in zf.infolist():
            total += info.file_size
            if info.file_size > LIMITE_DESCOMPACTADO_BYTES or total > LIMITE_DESCOMPACTADO_BYTES:
                raise ArquivoInseguroError("Conteúdo descompactado do ODS excede o limite permitido.")
            if info.compress_size > 0 and info.file_size / info.compress_size > LIMITE_RAZAO_COMPRESSAO:
                raise ArquivoInseguroError("Razão de compressão suspeita no ODS (possível zip bomb).")
        if "content.xml" not in zf.namelist():
            raise ArquivoInseguroError("O ODS não possui content.xml.")
        # leitura com teto real: o cabeçalho do ZIP pode declarar um tamanho menor que o verdadeiro
        with zf.open("content.xml") as f:
            dados = f.read(LIMITE_DESCOMPACTADO_BYTES + 1)
        if len(dados) > LIMITE_DESCOMPACTADO_BYTES:
            raise ArquivoInseguroError("O content.xml do ODS excede o limite descompactado permitido.")
        return dados


def parse_xml_seguro(xml_bytes: bytes) -> ET.Element:
    """Parse de XML que rejeita DOCTYPE e entidades (expansão exponencial ou externas)."""
    if _PADRAO_DTD.search(xml_bytes[:200_000]) or _PADRAO_DTD.search(xml_bytes):
        raise ArquivoInseguroError("XML com DOCTYPE/entidades não é permitido.")
    try:
        if _DefusedET is not None:
            return _DefusedET.fromstring(xml_bytes, forbid_dtd=True, forbid_entities=True, forbid_external=True)
        return ET.fromstring(xml_bytes)
    except ArquivoInseguroError:
        raise
    except ET.ParseError as e:
        raise ArquivoInseguroError(f"XML do ODS inválido: {e}")
    except Exception as e:  # DefusedXmlException e afins
        raise ArquivoInseguroError(f"XML do ODS rejeitado por segurança: {e}")


def carregar_raiz_ods(conteudo: bytes) -> ET.Element:
    """Atalho: valida o ZIP e devolve a raiz do content.xml já parseada com segurança."""
    return parse_xml_seguro(ler_content_xml(conteudo))
