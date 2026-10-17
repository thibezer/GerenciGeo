"""
routes/levantamento/contagem.py — Contagem de pontos por código/tipo e por projeto (levantamento)
"""
import logging
from fastapi import APIRouter, HTTPException

from services.gestores.contagem_pontos import obter_contagem_pontos

router = APIRouter(tags=["Contagem de Pontos"])


@router.get("/contagem-pontos")
def get_contagem_pontos():
    """Numeração usada por credenciado/tipo, distribuição por levantamento e próximo número livre."""
    try:
        return obter_contagem_pontos()
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao calcular contagem de pontos: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao calcular a contagem de pontos.")
