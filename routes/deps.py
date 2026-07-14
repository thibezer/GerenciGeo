"""
Dependências e funções auxiliares compartilhadas entre todos os roteadores.
"""
import logging
from fastapi import HTTPException, Request
from database.connection import execute_query


def registrar_tentativa_violacao(levantamento_id: int, rota: str, metodo: str):
    try:
        execute_query(
            "INSERT INTO logs_auditoria_seguranca (levantamento_id, rota, metodo) VALUES (?, ?, ?)",
            params=(levantamento_id, rota, metodo),
            commit=True
        )
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao registrar log de violação: {e}")


async def verificar_tranca_read_only(request: Request):
    """
    Middleware/Dependency do FastAPI.
    Analisa requisições de escrita e bloqueia se o levantamento estiver ARQUIVADO.
    """
    if request.method not in ["POST", "PUT", "DELETE"]:
        return

    if "/desarquivar" in request.url.path:
        return

    levantamento_id = None

    # 1. Tenta extrair levantamento_id ou lev_id do Path Params
    path_params = request.path_params
    if "id" in path_params and "levantamentos" in request.url.path:
        levantamento_id = path_params["id"]
    elif "lev_id" in path_params:
        levantamento_id = path_params["lev_id"]

    # 2. Se for rotas de pontos, segmentos, matriculas ou confrontantes sem levantamento_id direto no path:
    if not levantamento_id:
        path_str = request.url.path
        partes = path_str.split("/")

        # /pontos/{pid}
        if "/pontos/" in path_str and len(partes) >= 3:
            entidade_id = partes[-1]
            if entidade_id.isdigit():
                row = execute_query("SELECT levantamento_id FROM pontos WHERE id = ?", params=(int(entidade_id),), fetch_one=True)
                if row: levantamento_id = row["levantamento_id"]

        # /segmentos/{sid}
        elif "/segmentos/" in path_str and len(partes) >= 3:
            entidade_id = partes[-1]
            if entidade_id.isdigit():
                row = execute_query("SELECT levantamento_id FROM segmentos WHERE id = ?", params=(int(entidade_id),), fetch_one=True)
                if row: levantamento_id = row["levantamento_id"]

        # /confrontantes/{cid}
        elif "/confrontantes/" in path_str and len(partes) >= 3:
            entidade_id = partes[-1]
            if entidade_id.isdigit():
                row = execute_query("SELECT levantamento_id FROM confrontantes WHERE id = ?", params=(int(entidade_id),), fetch_one=True)
                if row: levantamento_id = row["levantamento_id"]

        # /matriculas/{mid}
        elif "/matriculas/" in path_str and len(partes) >= 3:
            entidade_id = partes[-1]
            if entidade_id.isdigit():
                row = execute_query("SELECT propriedade_id FROM matriculas WHERE id = ?", params=(int(entidade_id),), fetch_one=True)
                if row:
                    prop_id = row["propriedade_id"]
                    row_lev = execute_query("SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'ARQUIVADO'", params=(prop_id,), fetch_one=True)
                    if row_lev:
                        levantamento_id = row_lev["id"]

    if levantamento_id and str(levantamento_id).isdigit():
        try:
            row = execute_query("SELECT status FROM levantamentos WHERE id = ?", params=(int(levantamento_id),), fetch_one=True)
            if row and dict(row).get("status") == "ARQUIVADO":
                registrar_tentativa_violacao(int(levantamento_id), request.url.path, request.method)
                raise HTTPException(
                    status_code=403,
                    detail="Operação Bloqueada: O Levantamento correspondente está ARQUIVADO (Tranca de Segurança Read-Only ativa)."
                )
        except HTTPException:
            raise
        except Exception:
            pass


def verificar_levantamento_arquivado(levantamento_id: int):
    """Tranca de Segurança Read-Only (Módulo 7): Impede escrita/exclusão em projetos ARQUIVADOS"""
    row = execute_query("SELECT status FROM levantamentos WHERE id = ?", params=(levantamento_id,), fetch_one=True)
    if row and dict(row).get("status") == "ARQUIVADO":
        raise HTTPException(
            status_code=403,
            detail="Operação Bloqueada: O Levantamento correspondente está ARQUIVADO (Tranca de Segurança Read-Only ativa)."
        )


def verificar_propriedade_arquivada(prop_id: int):
    """Verifica se algum levantamento da propriedade está arquivado"""
    row = execute_query(
        "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'ARQUIVADO'",
        params=(prop_id,),
        fetch_one=True
    )
    if row:
        raise HTTPException(
            status_code=403,
            detail="Operação Bloqueada: Existe um levantamento ARQUIVADO vinculado a esta propriedade."
        )


def extrair_nome_confrontante_limpo(descritivo: str):
    """
    Extrai nome limpo do campo descritivo do confrontante (coluna L da planilha INCRA).
    Delegado para business/confrontante_manager.py
    """
    from services.gestores.confrontante_manager import extrair_nome_confrontante_limpo as extrair_negocio
    return extrair_negocio(descritivo)


def verificar_ambiente_local():
    """
    Verifica se a aplicação está rodando em ambiente local.
    Caso contrário, bloqueia operações pesadas de desktop na nuvem (Hostinger).
    """
    from config import RUNNING_LOCAL
    if not RUNNING_LOCAL:
        raise HTTPException(
            status_code=403,
            detail="Operação restrita ao Software Desktop Local."
        )

