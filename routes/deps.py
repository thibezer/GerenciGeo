"""
Dependências e funções auxiliares compartilhadas entre todos os roteadores.
"""
import logging
from fastapi import HTTPException
from starlette.requests import HTTPConnection
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


def usuario_da_requisicao(request) -> str:
    """
    Nome do usuário logado para a trilha de auditoria. Usa o token Bearer da sessão quando o front o envia;
    sem sessão válida, cai no operador local genérico.
    """
    try:
        from routes.auth import active_sessions
        cabecalho = request.headers.get("Authorization") or ""
        token = cabecalho.replace("Bearer ", "").strip() if "Bearer " in cabecalho else cabecalho.strip()
        user_id = active_sessions.get(token) if token else None
        if user_id:
            row = execute_query("SELECT name, email FROM users WHERE id = ?", params=(user_id,), fetch_one=True)
            if row:
                return (row["name"] or row["email"] or "Operador Local")
    except Exception as e:
        logging.getLogger(__name__).warning(f"Não foi possível resolver o usuário da requisição: {e}")
    return "Operador Local"


async def verificar_tranca_read_only(request: HTTPConnection):
    """
    Middleware/Dependency do FastAPI.
    Analisa requisições de escrita e bloqueia se o levantamento estiver ARQUIVADO.
    """
    # Dependência global: também é resolvida em rotas WebSocket (que não têm método HTTP)
    if request.scope.get("type") != "http" or request.scope.get("method") not in ["POST", "PUT", "DELETE"]:
        return

    # Desarquivar e gerar link público de leitura são permitidos em levantamentos arquivados
    if "/desarquivar" in request.url.path or request.url.path.endswith("/compartilhar"):
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
                registrar_tentativa_violacao(int(levantamento_id), request.url.path, request.scope["method"])
                raise HTTPException(
                    status_code=403,
                    detail="Operação Bloqueada: O Levantamento correspondente está ARQUIVADO (Tranca de Segurança Read-Only ativa)."
                )
        except HTTPException:
            raise
        except Exception as e:
            # Loga o erro mas NÃO engole: falha na verificação deve ser tratada
            # de forma conservadora para não deixar escrita indevida passar.
            logging.getLogger(__name__).error(
                f"Erro crítico ao verificar tranca read-only para levantamento_id={levantamento_id}: {e}",
                exc_info=True
            )


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
    Delegado para services/gestores/confrontante_manager.py
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



# ── Validações compartilhadas das rotas de cartório ────────────────────────────

def exigir_documento_valido(valor, campo: str, somente_cpf: bool = False) -> None:
    """422 com o nome do campo se `valor` estiver preenchido e não for CPF/CNPJ válido. Vazio é permitido."""
    from utils.validadores import documento_valido, cpf_opcional_valido
    if valor is None or str(valor).strip() == "":
        return
    ok = cpf_opcional_valido(valor) if somente_cpf else documento_valido(valor)
    if not ok:
        esperado = "CPF" if somente_cpf else "CPF ou CNPJ"
        raise HTTPException(
            status_code=422,
            detail=f"{campo} inválido: informe um {esperado} válido (dígitos verificadores conferem) ou deixe o campo vazio."
        )


def exigir_vinculos_do_levantamento(cursor, levantamento_id: int, *, matricula_id=None, pontos=(), confrontante_id=None,
                                    status_code: int = 422) -> None:
    """Garante que ponto(s), confrontante e matrícula informados pertencem ao levantamento (e sua propriedade).
    Impede que um segmento/vértice referencie dados de outro levantamento (IDOR)."""
    from services.gestores import vinculos
    ruim = vinculos.primeiro_invalido(cursor, pontos, levantamento_id, vinculos.ponto_pertence)
    if ruim is not None:
        raise HTTPException(status_code=status_code, detail=f"O ponto {ruim} não pertence a este levantamento.")
    if confrontante_id is not None and not vinculos.confrontante_pertence(cursor, confrontante_id, levantamento_id):
        raise HTTPException(status_code=status_code, detail=f"O confrontante {confrontante_id} não pertence a este levantamento.")
    if matricula_id is not None and not vinculos.matricula_pertence(cursor, matricula_id, levantamento_id):
        raise HTTPException(status_code=status_code, detail=f"A matrícula {matricula_id} não pertence à propriedade deste levantamento.")


async def ler_upload_limitado(file, limite: int = None) -> bytes:
    """Lê o upload com teto de tamanho (413 se exceder), sem carregar arquivos gigantes inteiros na memória."""
    from utils.ods_seguro import LIMITE_UPLOAD_BYTES
    limite = limite or LIMITE_UPLOAD_BYTES
    dados = await file.read(limite + 1)
    if len(dados) > limite:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo excede o limite de {limite // (1024 * 1024)} MB."
        )
    return dados
