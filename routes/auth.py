import hashlib
import logging
import secrets
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
import bcrypt

from database.connection import execute_query, DatabaseManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Autenticação"])

# Hash dummy pré-computado para mitigação estrita de timing attacks contra enumeração de usuários
DUMMY_BCRYPT_HASH = b"$2b$10$e8wF4nQ1l2D3k4j5h6g7f8e9d0c1b2a3s4d5f6g7h8j9k0l1z2x3c"

VALID_ROLES = {"admin", "moderator", "user"}

# Cache em memória de sessões ativas (complementado pela tabela persistente user_tokens)
# token -> user_id
active_sessions: dict[str, int] = {}


class LoginRequest(BaseModel):
    email: str
    password: str
    remember_me: Optional[bool] = False


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AdminCreateUserRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "user"
    is_blocked: int = 0


class AdminUpdateUserRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_blocked: Optional[int] = None


class AdminResetPasswordRequest(BaseModel):
    new_password: str


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _emitir_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    active_sessions[token] = user_id
    token_hash = _hash_token(token)
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO user_tokens (user_id, token_hash) VALUES (?, ?)",
                (user_id, token_hash),
            )
            # Mantém no máximo os 20 tokens mais recentes por usuário
            cursor.execute(
                """
                DELETE FROM user_tokens
                WHERE user_id = ?
                  AND id NOT IN (
                      SELECT id FROM user_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 20
                  )
                """,
                (user_id, user_id),
            )
            conn.commit()
    except Exception as e:
        logger.warning(f"Não foi possível persistir token em user_tokens: {e}")
    return token


def _revogar_tokens_usuario(user_id: int) -> None:
    for tk, uid in list(active_sessions.items()):
        if uid == user_id:
            active_sessions.pop(tk, None)
    try:
        execute_query("DELETE FROM user_tokens WHERE user_id = ?", params=(user_id,), commit=True)
    except Exception as e:
        logger.warning(f"Não foi possível revogar tokens de user_id={user_id}: {e}")


def _revogar_token(token: str) -> None:
    if not token:
        return
    active_sessions.pop(token, None)
    try:
        execute_query("DELETE FROM user_tokens WHERE token_hash = ?", params=(_hash_token(token),), commit=True)
    except Exception as e:
        logger.warning(f"Não foi possível revogar token específico: {e}")


def get_token_from_request(request: Request) -> str:
    auth_header = request.headers.get("Authorization") or ""
    if "Bearer " in auth_header:
        return auth_header.replace("Bearer ", "").strip()
    return auth_header.strip()


def resolver_usuario_por_token(token: str) -> Optional[dict]:
    if not token:
        return None
    user_id = active_sessions.get(token)
    if user_id:
        row = execute_query(
            "SELECT id, name, email, role, profile_image, is_blocked, created_at FROM users WHERE id = ?",
            params=(user_id,),
            fetch_one=True,
        )
        if row and not row["is_blocked"]:
            return dict(row)
        return None

    try:
        row = execute_query(
            """
            SELECT u.id, u.name, u.email, u.role, u.profile_image, u.is_blocked, u.created_at
            FROM user_tokens t
            JOIN users u ON u.id = t.user_id
            WHERE t.token_hash = ? AND u.is_blocked = 0
            LIMIT 1
            """,
            params=(_hash_token(token),),
            fetch_one=True,
        )
        if row:
            u = dict(row)
            active_sessions[token] = u["id"]
            return u
    except Exception as e:
        logger.warning(f"Falha ao consultar user_tokens: {e}")
    return None


def require_auth_user(request: Request) -> dict:
    token = get_token_from_request(request)
    user = resolver_usuario_por_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão expirada ou não autenticada. Faça login novamente.",
        )
    return user


def require_admin_user(request: Request) -> dict:
    user = require_auth_user(request)
    if (user.get("role") or "").lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado: operação restrita a administradores.",
        )
    return user


def _serialize_user(user: dict, extra: Optional[dict] = None) -> dict:
    data = {
        "id": int(user["id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user.get("role") or "user",
        "is_blocked": int(user.get("is_blocked") or 0),
        "profile_image": user.get("profile_image"),
        "created_at": str(user.get("created_at") or ""),
    }
    if extra:
        data.update(extra)
    return data


@router.post("/register")
def register(payload: RegisterRequest):
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password = payload.password or ""

    if not name or not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe seu nome completo, e-mail e senha.",
        )

    if len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A senha deve conter no mínimo 6 caracteres.",
        )

    existing = execute_query(
        "SELECT id FROM users WHERE LOWER(email) = ?",
        params=(email,),
        fetch_one=True,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este e-mail já está cadastrado no sistema.",
        )

    count_row = execute_query("SELECT COUNT(*) AS total FROM users", fetch_one=True)
    is_first_user = (count_row["total"] if count_row else 0) == 0

    assigned_role = "admin" if is_first_user else "user"
    assigned_blocked = 0 if is_first_user else 1

    hashed_pwd = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")

    with DatabaseManager() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO users (name, email, password, role, is_blocked)
            VALUES (?, ?, ?, ?, ?)
            """,
            (name, email, hashed_pwd, assigned_role, assigned_blocked),
        )
        user_id = cursor.lastrowid
        conn.commit()

    safe_user = {
        "id": user_id,
        "name": name,
        "email": email,
        "role": assigned_role,
        "is_blocked": assigned_blocked,
        "profile_image": None,
        "created_at": "",
    }

    if is_first_user:
        token = _emitir_token(user_id)
        return {
            "status": "success",
            "pending_approval": False,
            "token": token,
            "user": safe_user,
            "message": "Conta administradora criada com sucesso!",
        }

    return {
        "status": "success",
        "pending_approval": True,
        "token": None,
        "user": safe_user,
        "message": "Cadastro realizado! Sua conta está bloqueada aguardando aprovação de um administrador.",
    }


@router.post("/login")
def login(payload: LoginRequest):
    email = payload.email.strip().lower()
    password = payload.password or ""

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe seu e-mail e sua senha.",
        )

    row = execute_query(
        """
        SELECT id, name, email, password, role, is_blocked, profile_image, created_at
        FROM users
        WHERE LOWER(email) = ?
        """,
        params=(email,),
        fetch_one=True,
    )

    if not row:
        try:
            bcrypt.checkpw(password.encode("utf-8"), DUMMY_BCRYPT_HASH)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos.",
        )

    user = dict(row)

    if user.get("is_blocked"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Os administradores bloquearam o seu acesso ou sua conta aguarda aprovação.",
        )

    stored_hash = user.get("password") or ""
    try:
        is_match = bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
    except Exception as e:
        logger.error(f"Erro ao validar hash bcrypt: {e}")
        is_match = False

    if not is_match:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos.",
        )

    token = _emitir_token(user["id"])
    return {
        "status": "success",
        "token": token,
        "user": _serialize_user(user),
        "message": "Login realizado com sucesso.",
    }


@router.get("/me")
def get_current_user(request: Request):
    user = require_auth_user(request)
    return {
        "status": "success",
        "user": _serialize_user(user),
    }


@router.post("/logout")
def logout(request: Request):
    token = get_token_from_request(request)
    _revogar_token(token)
    return {"status": "success", "message": "Logout realizado com sucesso."}


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest):
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe seu e-mail cadastrado.")

    # Mensagem neutra (prevenção contra enumeração de contas OWASP A07)
    return {
        "status": "success",
        "message": "Se o e-mail estiver cadastrado, solicite a redefinição de senha ao administrador do sistema.",
    }


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, request: Request):
    user = require_auth_user(request)
    current_pwd = payload.current_password or ""
    new_pwd = payload.new_password or ""

    if not current_pwd or not new_pwd:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe a senha atual e a nova senha.",
        )
    if len(new_pwd) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A nova senha deve conter no mínimo 6 caracteres.",
        )

    row = execute_query("SELECT password FROM users WHERE id = ?", params=(user["id"],), fetch_one=True)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")

    stored_hash = row["password"] or ""
    if not bcrypt.checkpw(current_pwd.encode("utf-8"), stored_hash.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Senha atual incorreta.",
        )

    new_hash = bcrypt.hashpw(new_pwd.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")
    execute_query("UPDATE users SET password = ? WHERE id = ?", params=(new_hash, user["id"]), commit=True)

    return {"status": "success", "message": "Senha alterada com sucesso."}


# ==============================================================================
# GERENCIAMENTO DE CONTAS E CONTROLE DE ACESSOS (RESTRITO A ADMINISTRADORES)
# ==============================================================================


@router.get("/users")
def admin_list_users(request: Request):
    require_admin_user(request)
    rows = execute_query(
        """
        SELECT u.id, u.name, u.email, u.role, u.is_blocked, u.profile_image, u.created_at,
               (SELECT COUNT(*) FROM user_tokens t WHERE t.user_id = u.id) AS active_sessions_count
        FROM users u
        ORDER BY u.is_blocked DESC, CASE u.role WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END ASC, u.id ASC
        """,
        fetch_all=True,
    )
    users = [_serialize_user(dict(r), {"active_sessions_count": int(r["active_sessions_count"] or 0)}) for r in (rows or [])]
    return {"status": "success", "users": users}


@router.post("/users")
def admin_create_user(payload: AdminCreateUserRequest, request: Request):
    require_admin_user(request)
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password = payload.password or ""
    role = (payload.role or "user").strip().lower()
    is_blocked = 1 if payload.is_blocked else 0

    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="Informe nome, e-mail e senha.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve conter no mínimo 6 caracteres.")
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Perfil inválido. Use admin, moderator ou user.")

    existing = execute_query("SELECT id FROM users WHERE LOWER(email) = ?", params=(email,), fetch_one=True)
    if existing:
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado no sistema.")

    hashed_pwd = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")
    with DatabaseManager() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (name, email, password, role, is_blocked) VALUES (?, ?, ?, ?, ?)",
            (name, email, hashed_pwd, role, is_blocked),
        )
        new_id = cursor.lastrowid
        conn.commit()

    row = execute_query(
        "SELECT id, name, email, role, is_blocked, profile_image, created_at FROM users WHERE id = ?",
        params=(new_id,),
        fetch_one=True,
    )
    return {
        "status": "success",
        "user": _serialize_user(dict(row), {"active_sessions_count": 0}),
        "message": "Usuário criado com sucesso.",
    }


@router.put("/users/{user_id}")
def admin_update_user(user_id: int, payload: AdminUpdateUserRequest, request: Request):
    admin = require_admin_user(request)
    target = execute_query(
        "SELECT id, name, email, role, is_blocked, profile_image, created_at FROM users WHERE id = ?",
        params=(user_id,),
        fetch_one=True,
    )
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    target_dict = dict(target)
    new_name = payload.name.strip() if payload.name is not None else target_dict["name"]
    new_email = payload.email.strip().lower() if payload.email is not None else target_dict["email"]
    new_role = (payload.role or target_dict["role"]).strip().lower() if payload.role is not None else target_dict["role"]
    new_blocked = (1 if payload.is_blocked else 0) if payload.is_blocked is not None else int(target_dict["is_blocked"] or 0)

    if not new_name or not new_email:
        raise HTTPException(status_code=400, detail="Nome e e-mail são obrigatórios.")
    if new_role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Perfil inválido. Use admin, moderator ou user.")

    if user_id == admin["id"]:
        if new_blocked == 1:
            raise HTTPException(status_code=400, detail="Você não pode bloquear sua própria conta.")
        if new_role != "admin":
            raise HTTPException(status_code=400, detail="Você não pode remover seu próprio perfil de administrador.")

    dup = execute_query(
        "SELECT id FROM users WHERE LOWER(email) = ? AND id != ?",
        params=(new_email, user_id),
        fetch_one=True,
    )
    if dup:
        raise HTTPException(status_code=400, detail="Já existe outro usuário com este e-mail.")

    execute_query(
        "UPDATE users SET name = ?, email = ?, role = ?, is_blocked = ? WHERE id = ?",
        params=(new_name, new_email, new_role, new_blocked, user_id),
        commit=True,
    )

    if new_blocked == 1:
        _revogar_tokens_usuario(user_id)

    updated = execute_query(
        """
        SELECT u.id, u.name, u.email, u.role, u.is_blocked, u.profile_image, u.created_at,
               (SELECT COUNT(*) FROM user_tokens t WHERE t.user_id = u.id) AS active_sessions_count
        FROM users u WHERE u.id = ?
        """,
        params=(user_id,),
        fetch_one=True,
    )
    return {
        "status": "success",
        "user": _serialize_user(dict(updated), {"active_sessions_count": int(updated["active_sessions_count"] or 0)}),
        "message": "Dados do usuário atualizados com sucesso.",
    }


@router.post("/users/{user_id}/reset-password")
def admin_reset_password(user_id: int, payload: AdminResetPasswordRequest, request: Request):
    require_admin_user(request)
    new_pwd = payload.new_password or ""
    if len(new_pwd) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve conter no mínimo 6 caracteres.")

    target = execute_query("SELECT id FROM users WHERE id = ?", params=(user_id,), fetch_one=True)
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    hashed_pwd = bcrypt.hashpw(new_pwd.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")
    execute_query("UPDATE users SET password = ? WHERE id = ?", params=(hashed_pwd, user_id), commit=True)
    _revogar_tokens_usuario(user_id)

    return {"status": "success", "message": "Senha redefinida e sessões anteriores encerradas."}


@router.post("/users/{user_id}/revoke-sessions")
def admin_revoke_sessions(user_id: int, request: Request):
    require_admin_user(request)
    target = execute_query("SELECT id FROM users WHERE id = ?", params=(user_id,), fetch_one=True)
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    _revogar_tokens_usuario(user_id)
    return {"status": "success", "message": "Todas as sessões deste usuário foram encerradas."}


@router.delete("/users/{user_id}")
def admin_delete_user(user_id: int, request: Request):
    admin = require_admin_user(request)
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Você não pode excluir sua própria conta.")

    target = execute_query("SELECT id FROM users WHERE id = ?", params=(user_id,), fetch_one=True)
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    _revogar_tokens_usuario(user_id)
    execute_query("DELETE FROM users WHERE id = ?", params=(user_id,), commit=True)
    return {"status": "success", "message": "Usuário excluído com sucesso."}
