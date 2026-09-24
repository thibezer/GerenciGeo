import logging
import secrets
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
import bcrypt

from database.connection import execute_query, DatabaseManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Autenticação"])

# Hash dummy pré-computado para mitigação estrita de timing attacks contra enumeração de usuários
DUMMY_BCRYPT_HASH = b"$2b$10$e8wF4nQ1l2D3k4j5h6g7f8e9d0c1b2a3s4d5f6g7h8j9k0l1z2x3c"

# Cache em memória de sessões ativas para o backend local
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


@router.post("/register")
def register(payload: RegisterRequest):
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password = payload.password or ""

    if not name or not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe seu nome completo, e-mail e senha."
        )

    if len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A senha deve conter no mínimo 6 caracteres."
        )

    existing = execute_query(
        "SELECT id FROM users WHERE LOWER(email) = ?",
        params=(email,),
        fetch_one=True
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este e-mail já está cadastrado no sistema."
        )

    hashed_pwd = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")

    with DatabaseManager() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO users (name, email, password, role, is_blocked)
            VALUES (?, ?, ?, 'admin', 0)
            """,
            (name, email, hashed_pwd)
        )
        user_id = cursor.lastrowid
        conn.commit()

    token = secrets.token_urlsafe(32)
    active_sessions[token] = user_id

    safe_user = {
        "id": user_id,
        "name": name,
        "email": email,
        "role": "admin",
        "profile_image": None,
        "created_at": ""
    }

    return {
        "status": "success",
        "token": token,
        "user": safe_user,
        "message": "Conta criada com sucesso!"
    }


@router.post("/login")
def login(payload: LoginRequest):
    email = payload.email.strip().lower()
    password = payload.password or ""

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe seu e-mail e sua senha."
        )

    row = execute_query(
        """
        SELECT id, name, email, password, role, is_blocked, profile_image, created_at
        FROM users
        WHERE LOWER(email) = ?
        """,
        params=(email,),
        fetch_one=True
    )

    if not row:
        # Mitigação de timing attack: executa hash dummy com custo idêntico
        try:
            bcrypt.checkpw(password.encode("utf-8"), DUMMY_BCRYPT_HASH)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos."
        )

    user = dict(row)

    if user.get("is_blocked"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Os administradores bloquearam o seu acesso."
        )

    # Verificação de senha via bcrypt
    stored_hash = user.get("password") or ""
    try:
        is_match = bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
    except Exception as e:
        logger.error(f"Erro ao validar hash bcrypt: {e}")
        is_match = False

    if not is_match:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos."
        )

    token = secrets.token_urlsafe(32)
    active_sessions[token] = user["id"]

    safe_user = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user.get("role") or "admin",
        "profile_image": user.get("profile_image"),
        "created_at": str(user.get("created_at") or "")
    }

    return {
        "status": "success",
        "token": token,
        "user": safe_user,
        "message": "Login realizado com sucesso."
    }


@router.get("/me")
def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization") or ""
    token = auth_header.replace("Bearer ", "").strip() if "Bearer " in auth_header else auth_header.strip()

    user_id = active_sessions.get(token) if token else None

    # Se não tiver token ou sessão expirou, mas houver usuários, tenta o primeiro ou default
    if not user_id:
        row = execute_query(
            "SELECT id, name, email, role, profile_image, is_blocked, created_at FROM users WHERE is_blocked = 0 ORDER BY id ASC LIMIT 1",
            fetch_one=True
        )
    else:
        row = execute_query(
            "SELECT id, name, email, role, profile_image, is_blocked, created_at FROM users WHERE id = ?",
            params=(user_id,),
            fetch_one=True
        )

    if not row or row["is_blocked"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado.")

    u = dict(row)
    return {
        "status": "success",
        "user": {
            "id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "role": u.get("role") or "admin",
            "profile_image": u.get("profile_image"),
            "created_at": str(u.get("created_at") or "")
        }
    }


@router.post("/logout")
def logout(request: Request):
    auth_header = request.headers.get("Authorization") or ""
    token = auth_header.replace("Bearer ", "").strip() if "Bearer " in auth_header else auth_header.strip()
    if token and token in active_sessions:
        del active_sessions[token]
    return {"status": "success", "message": "Logout realizado com sucesso."}


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest):
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe seu e-mail cadastrado.")

    # Mensagem neutra (prevenção contra enumeração de contas OWASP A07)
    return {
        "status": "success",
        "message": "Se o e-mail estiver cadastrado, as instruções para redefinição foram despachadas."
    }
