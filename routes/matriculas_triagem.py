"""
routes/matriculas_triagem.py — Endpoints para triagem de matrículas na pasta de entrada da IA.
"""

import os
import subprocess
import sys
from typing import List, Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import MATRICULAS_INBOX_FOLDER
from services.gestores.triagem_matriculas_service import (
    atualizar_observacao_triagem,
    listar_triagem_entrada,
    remover_arquivo_triagem,
    resolver_caminho_seguro_inbox,
    salvar_arquivo_triagem,
)

router = APIRouter(tags=["Triagem de Matrículas"])


class ObservacaoTriagemPayload(BaseModel):
    tipo_vinculo: Optional[str] = None
    observacao: Optional[str] = None


@router.get("/matriculas-triagem/entrada")
def get_matriculas_triagem_entrada():
    try:
        return listar_triagem_entrada()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/matriculas-triagem/upload")
async def post_upload_matriculas_triagem(
    arquivos: List[UploadFile] = File(...),
    tipo_vinculo: str = Form("apenas_cadastrar"),
    observacao: str = Form(""),
):
    if not arquivos:
        raise HTTPException(status_code=400, detail="Nenhum arquivo enviado.")

    resultados = []
    erros = []
    for arq in arquivos:
        try:
            conteudo = await arq.read()
            res = salvar_arquivo_triagem(
                nome_original=arq.filename or "matricula.pdf",
                conteudo_bytes=conteudo,
                tipo_vinculo=tipo_vinculo,
                observacao=observacao,
            )
            resultados.append(res)
        except ValueError as ve:
            erros.append({"arquivo": arq.filename, "erro": str(ve)})
        except Exception as e:
            erros.append({"arquivo": arq.filename, "erro": str(e)})

    if not resultados and erros:
        raise HTTPException(status_code=400, detail=erros[0]["erro"])

    return {
        "sucesso": True,
        "enviados": len(resultados),
        "arquivos": resultados,
        "erros": erros,
    }


@router.put("/matriculas-triagem/entrada/{nome_arquivo}/observacao")
def put_observacao_triagem(nome_arquivo: str, payload: ObservacaoTriagemPayload):
    try:
        return atualizar_observacao_triagem(
            nome_arquivo=nome_arquivo,
            tipo_vinculo=payload.tipo_vinculo,
            observacao=payload.observacao,
        )
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/matriculas-triagem/entrada/{nome_arquivo}")
def delete_arquivo_triagem(nome_arquivo: str):
    try:
        return remover_arquivo_triagem(nome_arquivo)
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/matriculas-triagem/entrada/{nome_arquivo}/visualizar")
def visualizar_arquivo_triagem(nome_arquivo: str):
    try:
        caminho = resolver_caminho_seguro_inbox(nome_arquivo)
        if not os.path.isfile(caminho):
            raise HTTPException(status_code=404, detail="Arquivo não encontrado na pasta de entrada.")
        return FileResponse(caminho, filename=os.path.basename(caminho), content_disposition_type="inline")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.post("/matriculas-triagem/abrir-pasta")
def abrir_pasta_triagem():
    try:
        os.makedirs(MATRICULAS_INBOX_FOLDER, exist_ok=True)
        if sys.platform.startswith("win"):
            os.startfile(MATRICULAS_INBOX_FOLDER)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", MATRICULAS_INBOX_FOLDER])
        else:
            subprocess.Popen(["xdg-open", MATRICULAS_INBOX_FOLDER])
        return {"sucesso": True, "pasta": MATRICULAS_INBOX_FOLDER}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Não foi possível abrir a pasta: {e}")
