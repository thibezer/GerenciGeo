"""
services/processamento/pdf_limpeza.py — Remoção de marca d'água e restrições de PDFs de certidões de matrícula.

Pipeline baseado no fluxo Ghostscript + PyMuPDF:
1. Remove restrições/criptografia vazia via pikepdf (se disponível) ou PyMuPDF.
2. Achata camadas e anotações via Ghostscript (`-sDEVICE=pdfwrite -dPDFSETTINGS=/prepress`).
3. Reconstrói o PDF extraindo a imagem principal de cada página (eliminando textos/marcas d'água
   sobrepostas em camadas vetoriais ou de anotação), com fallback para rasterização a 300 DPI.
"""

import glob
import logging
import os
import shutil
import subprocess
import tempfile
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

try:
    import pymupdf as fitz  # type: ignore
except ImportError:
    try:
        import fitz  # type: ignore
    except ImportError:
        fitz = None  # type: ignore

try:
    import pikepdf  # type: ignore
except ImportError:
    pikepdf = None


def localizar_ghostscript() -> Optional[str]:
    """Localiza o executável do Ghostscript no PATH ou nas pastas padrão do Windows."""
    gs_cmd = "gswin64c" if os.name == "nt" else "gs"
    encontrado = shutil.which(gs_cmd)
    if encontrado:
        return encontrado

    if os.name == "nt":
        for cmd_alt in ("gswin64c.exe", "gswin32c", "gswin32c.exe"):
            alt = shutil.which(cmd_alt)
            if alt:
                return alt

        padroes = [
            r"C:\Program Files\gs\gs*\bin\gswin64c.exe",
            r"C:\Program Files (x86)\gs\gs*\bin\gswin32c.exe",
        ]
        for padrao in padroes:
            candidatos = glob.glob(padrao)
            if candidatos:
                return sorted(candidatos)[-1]

    return None


def remover_restricoes_pdf(pdf_path: str) -> bool:
    """Remove bloqueios de cópia/edição do PDF mantendo o conteúdo original."""
    if pikepdf is not None:
        try:
            with pikepdf.open(pdf_path, allow_overwriting_input=True) as pdf:
                pdf.save(pdf_path)
            return True
        except Exception as e:
            logger.debug(f"pikepdf não conseguiu desbloquear {pdf_path}, tentando PyMuPDF: {e}")

    if fitz is None:
        return False

    doc = None
    temp_dest = pdf_path + ".unlocked.pdf"
    try:
        doc = fitz.open(pdf_path)
        if doc.is_encrypted:
            doc.authenticate("")
        doc.save(temp_dest, encryption=fitz.PDF_ENCRYPT_NONE)
        doc.close()
        doc = None
        if os.path.exists(temp_dest):
            shutil.move(temp_dest, pdf_path)
        return True
    except Exception as e:
        logger.debug(f"PyMuPDF não removeu restrições de {pdf_path}: {e}")
        return False
    finally:
        if doc is not None:
            try:
                doc.close()
            except Exception:
                pass
        if os.path.exists(temp_dest):
            try:
                os.remove(temp_dest)
            except Exception:
                pass


def achatar_pdf_ghostscript(pdf_path: str, output_path: str) -> bool:
    """Achata camadas/formulários/anotações via Ghostscript para isolar a imagem da matrícula."""
    gs_cmd = localizar_ghostscript()
    if not gs_cmd:
        logger.warning("Ghostscript não encontrado no sistema; prosseguindo sem achatamento GS.")
        return False

    gs_command = [
        gs_cmd,
        "-dNOPAUSE",
        "-dBATCH",
        "-sDEVICE=pdfwrite",
        "-dPDFSETTINGS=/prepress",
        f"-sOutputFile={output_path}",
        pdf_path,
    ]
    run_kwargs: Dict[str, Any] = {"check": True, "capture_output": True}
    if os.name == "nt" and hasattr(subprocess, "CREATE_NO_WINDOW"):
        run_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

    try:
        subprocess.run(gs_command, **run_kwargs)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 0
    except Exception as e:
        logger.warning(f"Ghostscript falhou ao achatar PDF: {e}")
        return False


def reconstruir_pdf_limpo(source_path: str, output_path: str) -> bool:
    """
    Reconstrói o PDF página a página priorizando a maior imagem embutida (folha escaneada
    sem a marca d'água sobreposta) e usando rasterização 300 DPI quando não há imagem.
    """
    if fitz is None:
        logger.error("PyMuPDF (fitz) não está instalado para reconstrução de PDF.")
        return False

    doc_origem = None
    novo_pdf = None
    try:
        doc_origem = fitz.open(source_path)
        if len(doc_origem) == 0:
            return False

        novo_pdf = fitz.open()
        for page in doc_origem:
            images = page.get_images(full=True)
            if images:
                images.sort(key=lambda x: x[2] * x[3], reverse=True)
                xref = images[0][0]
                pix = fitz.Pixmap(doc_origem, xref)
                if pix.colorspace and (pix.colorspace.n - pix.alpha > 3 or pix.alpha):
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                elif not pix.colorspace:
                    pix = page.get_pixmap(dpi=300, alpha=False)
            else:
                pix = page.get_pixmap(dpi=300, alpha=False)

            new_page = novo_pdf.new_page(width=pix.width, height=pix.height)
            new_page.insert_image(new_page.rect, pixmap=pix)
            pix = None

        novo_pdf.save(output_path)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 0
    except Exception as e:
        logger.error(f"Falha ao reconstruir PDF limpo: {e}")
        return False
    finally:
        if novo_pdf is not None:
            try:
                novo_pdf.close()
            except Exception:
                pass
        if doc_origem is not None:
            try:
                doc_origem.close()
            except Exception:
                pass


def gerar_pdf_sem_marca(pdf_origem: str, pdf_destino: str) -> Dict[str, Any]:
    """
    Gera uma cópia limpa (sem marca d'água) de `pdf_origem` em `pdf_destino`,
    preservando intacto o arquivo original.
    """
    if not pdf_origem or not os.path.exists(pdf_origem):
        return {
            "sucesso": False,
            "caminho_limpo": None,
            "metodo": None,
            "ghostscript_disponivel": bool(localizar_ghostscript()),
            "erro": "Arquivo PDF de origem não encontrado.",
        }

    if fitz is None:
        return {
            "sucesso": False,
            "caminho_limpo": None,
            "metodo": None,
            "ghostscript_disponivel": bool(localizar_ghostscript()),
            "erro": "PyMuPDF (fitz) não está instalado no ambiente Python.",
        }

    gs_disponivel = bool(localizar_ghostscript())
    os.makedirs(os.path.dirname(os.path.abspath(pdf_destino)), exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="gg_pdf_limpo_") as temp_dir:
        caminho_trabalho = os.path.join(temp_dir, "entrada.pdf")
        caminho_achatado = os.path.join(temp_dir, "temp_achatado.pdf")
        caminho_final_tmp = os.path.join(temp_dir, "final_limpo.pdf")

        shutil.copy2(pdf_origem, caminho_trabalho)
        remover_restricoes_pdf(caminho_trabalho)

        fonte_reconstrucao = caminho_trabalho
        metodo = "pymupdf_fallback"
        if gs_disponivel and achatar_pdf_ghostscript(caminho_trabalho, caminho_achatado):
            fonte_reconstrucao = caminho_achatado
            metodo = "ghostscript_pymupdf"

        if not reconstruir_pdf_limpo(fonte_reconstrucao, caminho_final_tmp):
            return {
                "sucesso": False,
                "caminho_limpo": None,
                "metodo": metodo,
                "ghostscript_disponivel": gs_disponivel,
                "erro": "Não foi possível reconstruir o PDF sem marca d'água.",
            }

        shutil.copy2(caminho_final_tmp, pdf_destino)

    return {
        "sucesso": True,
        "caminho_limpo": pdf_destino,
        "metodo": metodo,
        "ghostscript_disponivel": gs_disponivel,
        "erro": None,
    }
