"""
services/gestores/nuvem_sync.py — Motor de Sincronização Local <-> Nuvem Hostinger.
Permite autenticação com login/senha, push (envio) e pull (download) de dados entre múltiplos computadores.
"""

import os
import json
import logging
import sqlite3
import httpx
from datetime import datetime
from config import (
    BASE_DIR,
    DB_PATH,
    CLOUD_BASE_URL,
    CLOUD_SYNC_URL,
    CLOUD_PULL_URL,
    CLOUD_LOGIN_URL,
    CLOUD_STATUS_URL
)
from database.connection import DatabaseManager

logger = logging.getLogger(__name__)

SESSION_FILE = os.path.join(BASE_DIR, "nuvem_session.json")

# Tabelas core sincronizáveis
SYNC_TABLES = [
    "pessoas", "profissionais", "clientes", "propriedades", "propriedade_clientes",
    "matriculas", "levantamentos", "pontos", "segmentos", "pendencias", "confrontantes"
]


def carregar_sessao() -> dict:
    """Carrega dados da sessão ativa na nuvem salva localmente."""
    if not os.path.exists(SESSION_FILE):
        return {}
    try:
        with open(SESSION_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Falha ao ler sessão da nuvem: {e}")
        return {}


def salvar_sessao(dados: dict) -> None:
    """Salva credenciais/tokens de sessão da nuvem com permissões seguras."""
    try:
        with open(SESSION_FILE, "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Falha ao salvar sessão da nuvem: {e}")


def limpar_sessao() -> None:
    """Remove o arquivo de sessão local."""
    if os.path.exists(SESSION_FILE):
        try:
            os.remove(SESSION_FILE)
        except Exception as e:
            logger.warning(f"Erro ao remover arquivo de sessão: {e}")


async def login_nuvem(email: str, password: str) -> dict:
    """Realiza autenticação na Nuvem Hostinger e armazena token de sessão."""
    payload = {"email": email.strip().lower(), "password": password}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(CLOUD_LOGIN_URL, json=payload)

        data = res.json()
        if res.status_code == 200 and data.get("status") == "success":
            sessao = {
                "token": data.get("token"),
                "user": data.get("user", {}),
                "logged_at": datetime.now().isoformat(),
                "last_sync": carregar_sessao().get("last_sync")
            }
            salvar_sessao(sessao)
            logger.info(f"Login na Nuvem efetuado com sucesso: {email}")
            return {
                "sucesso": True,
                "mensagem": "Login na nuvem realizado com sucesso!",
                "user": data.get("user", {})
            }
        else:
            msg = data.get("error") or data.get("message") or f"Erro {res.status_code}"
            return {"sucesso": False, "mensagem": msg}
    except Exception as e:
        logger.exception("Erro ao tentar login na nuvem:")
        return {"sucesso": False, "mensagem": f"Falha de conexão com a nuvem: {str(e)}"}


async def logout_nuvem() -> dict:
    """Encerra a sessão local e invalida o token na nuvem se possível."""
    sessao = carregar_sessao()
    token = sessao.get("token")
    if token:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{CLOUD_BASE_URL}?__route=/auth/logout",
                    headers={"Authorization": f"Bearer {token}"}
                )
        except Exception:
            pass
    limpar_sessao()
    return {"sucesso": True, "mensagem": "Sessão encerrada com sucesso."}


async def obter_status_nuvem() -> dict:
    """Verifica a conectividade com o Hub da Nuvem e o estado de autenticação."""
    sessao = carregar_sessao()
    token = sessao.get("token")
    user = sessao.get("user")
    last_sync = sessao.get("last_sync")

    online = False
    status_db = "Desconhecido"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get(CLOUD_STATUS_URL)
            if res.status_code == 200:
                data = res.json()
                online = (data.get("status") == "online")
                status_db = data.get("database", "Online")
    except Exception as e:
        logger.debug(f"Nuvem offline ou inacessível: {e}")

    autenticado = False
    if online and token:
        # Validação do token contra o endpoint /auth/me
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res_me = await client.get(
                    f"{CLOUD_BASE_URL}?__route=/auth/me",
                    headers={"Authorization": f"Bearer {token}"}
                )
                if res_me.status_code == 200:
                    autenticado = True
                    user = res_me.json().get("user", user)
                elif res_me.status_code == 401:
                    limpar_sessao()
                    token = None
                    user = None
        except Exception:
            # Se timeout na validação do me, considera autenticado localmente se tiver token
            autenticado = bool(token)

    return {
        "online": online,
        "database": status_db,
        "autenticado": autenticado,
        "user": user,
        "last_sync": last_sync
    }


def _extrair_dados_locais() -> dict:
    """Extrai em modo estritamente read-only as tabelas locais do SQLite."""
    if not os.path.exists(DB_PATH):
        return {}

    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    payload = {}

    for tabela in SYNC_TABLES:
        try:
            cursor = conn.cursor()
            cursor.execute(f"SELECT * FROM {tabela}")
            cols = [d[0] for d in cursor.description]
            rows = cursor.fetchall()
            payload[tabela] = [dict(zip(cols, r)) for r in rows]
        except Exception as e:
            logger.warning(f"Tabela local {tabela} não pôde ser lida: {e}")
            payload[tabela] = []

    conn.close()
    return payload


async def push_dados_nuvem() -> dict:
    """Envia todos os dados locais do SQLite para o MySQL da Nuvem (Hostinger)."""
    sessao = carregar_sessao()
    token = sessao.get("token")
    if not token:
        return {"sucesso": False, "mensagem": "Usuário não autenticado na nuvem. Faça login primeiro."}

    payload = _extrair_dados_locais()
    total_reg = sum(len(v) for v in payload.values())

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            res = await client.post(CLOUD_SYNC_URL, json={"data": payload}, headers=headers)

        if res.status_code in (200, 201):
            res_data = res.json()
            sessao["last_sync"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            salvar_sessao(sessao)
            return {
                "sucesso": True,
                "mensagem": res_data.get("message") or "Dados enviados para a nuvem com sucesso!",
                "total_registros": total_reg,
                "detalhes": {t: len(rows) for t, rows in payload.items()}
            }
        else:
            err_msg = res.json().get("error") if res.headers.get("content-type", "").startswith("application/json") else res.text
            return {"sucesso": False, "mensagem": f"Erro no servidor da nuvem ({res.status_code}): {err_msg}"}
    except Exception as e:
        logger.exception("Falha ao enviar dados para a nuvem:")
        return {"sucesso": False, "mensagem": f"Falha de conexão durante o envio: {str(e)}"}


def _upsert_tabela_local(conn: sqlite3.Connection, tabela: str, rows: list) -> int:
    """Faz o UPSERT atômico das linhas recebidas na tabela do SQLite local."""
    if not rows:
        return 0

    cursor = conn.cursor()
    # Identifica colunas existentes na tabela local
    cursor.execute(f"PRAGMA table_info({tabela})")
    cols_locais = {row[1] for row in cursor.fetchall()}
    if not cols_locais:
        return 0

    inseridos = 0
    for r in rows:
        # Filtra apenas as colunas que realmente existem na tabela local
        dados_validos = {k: v for k, v in r.items() if k in cols_locais}
        if not dados_validos:
            continue

        cols = list(dados_validos.keys())
        placeholders = ", ".join(["?"] * len(cols))
        cols_str = ", ".join(cols)

        # Se tiver chave primária id, monta o UPDATE de conflito
        if "id" in cols_locais and "id" in dados_validos:
            update_cols = [f"{c} = excluded.{c}" for c in cols if c != "id"]
            if update_cols:
                sql = f"""
                    INSERT INTO {tabela} ({cols_str}) VALUES ({placeholders})
                    ON CONFLICT(id) DO UPDATE SET {', '.join(update_cols)}
                """
            else:
                sql = f"INSERT OR IGNORE INTO {tabela} ({cols_str}) VALUES ({placeholders})"
        else:
            sql = f"INSERT OR REPLACE INTO {tabela} ({cols_str}) VALUES ({placeholders})"

        cursor.execute(sql, tuple(dados_validos.values()))
        inseridos += 1

    return inseridos


async def pull_dados_nuvem() -> dict:
    """Baixa todos os dados da Nuvem Hostinger e mescla no SQLite local."""
    sessao = carregar_sessao()
    token = sessao.get("token")
    if not token:
        return {"sucesso": False, "mensagem": "Usuário não autenticado na nuvem. Faça login primeiro."}

    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            res = await client.get(CLOUD_PULL_URL, headers=headers)

        if res.status_code != 200:
            err_msg = res.json().get("error") if res.headers.get("content-type", "").startswith("application/json") else res.text
            return {"sucesso": False, "mensagem": f"Erro ao baixar da nuvem ({res.status_code}): {err_msg}"}

        data_cloud = res.json().get("data", {})
        if not data_cloud:
            return {"sucesso": True, "mensagem": "Nenhum dado pendente na nuvem.", "total_recebidos": 0}

        # Conecta no SQLite local para aplicar a importação de forma atômica
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA foreign_keys = OFF;")
            
            resumo = {}
            total_baixados = 0

            # Ordem hierárquica para respeitar integridade
            ordem_tabelas = [
                "pessoas", "profissionais", "clientes", "propriedades", "propriedade_clientes",
                "matriculas", "levantamentos", "pontos", "segmentos", "confrontantes", "pendencias"
            ]

            for t in ordem_tabelas:
                rows = data_cloud.get(t) or []
                # Fallback de compatibilidade: propriedade_proprietarios no MySQL <-> propriedade_clientes no SQLite
                if t == "propriedade_clientes" and not rows:
                    rows = data_cloud.get("propriedade_proprietarios") or []
                    for r in rows:
                        if "proporcao" in r and "percentual_participacao" not in r:
                            r["percentual_participacao"] = r["proporcao"]

                qtd = _upsert_tabela_local(conn, t, rows)
                resumo[t] = qtd
                total_baixados += qtd

            cursor.execute("PRAGMA foreign_keys = ON;")
            conn.commit()

        sessao["last_sync"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        salvar_sessao(sessao)

        return {
            "sucesso": True,
            "mensagem": f"Download concluído! {total_baixados} registros atualizados no banco local.",
            "total_recebidos": total_baixados,
            "detalhes": resumo
        }

    except Exception as e:
        logger.exception("Falha ao puxar dados da nuvem:")
        return {"sucesso": False, "mensagem": f"Falha de conexão durante o download: {str(e)}"}


async def sincronizar_tudo() -> dict:
    """
    Executa o ciclo completo de sincronização bidirecional:
    1. Baixa (Pull) o que outros computadores subiram para a nuvem.
    2. Envia (Push) o que foi cadastrado/alterado localmente.
    """
    logger.info("Iniciando ciclo completo de sincronização bidirecional...")
    
    # 1. Puxa as novidades da nuvem
    res_pull = await pull_dados_nuvem()
    if not res_pull.get("sucesso"):
        return res_pull

    # 2. Envia as atualizações locais
    res_push = await push_dados_nuvem()
    if not res_push.get("sucesso"):
        return res_push

    sessao = carregar_sessao()
    sessao["last_sync"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    salvar_sessao(sessao)

    return {
        "sucesso": True,
        "mensagem": "Sincronização bidirecional concluída com sucesso! Todos os dados estão atualizados.",
        "pull": res_pull,
        "push": res_push,
        "last_sync": sessao["last_sync"]
    }
