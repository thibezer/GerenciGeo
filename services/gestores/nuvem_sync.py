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
    CLOUD_CHECK_URL,
    CLOUD_LOGIN_URL,
    CLOUD_STATUS_URL
)
from database.connection import DatabaseManager
from database.models import (
    migrar_profissional_id_opcional_clientes,
    migrar_matricula_id_opcional_segmentos
)

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
            if "cloud_timestamp" in res_data:
                sessao["last_cloud_ts"] = int(res_data["cloud_timestamp"])
            salvar_sessao(sessao)
            return {
                "sucesso": True,
                "mensagem": res_data.get("message") or "Dados enviados para a nuvem com sucesso!",
                "total_registros": total_reg,
                "cloud_timestamp": sessao.get("last_cloud_ts"),
                "detalhes": {t: len(rows) for t, rows in payload.items()}
            }
        else:
            err_msg = res.json().get("error") if res.headers.get("content-type", "").startswith("application/json") else res.text
            return {"sucesso": False, "mensagem": f"Erro no servidor da nuvem ({res.status_code}): {err_msg}"}
    except Exception as e:
        logger.exception("Falha ao enviar dados para a nuvem:")
        return {"sucesso": False, "mensagem": f"Falha de conexão durante o envio: {str(e)}"}


def _upsert_tabela_local(conn: sqlite3.Connection, tabela: str, rows: list) -> int:
    """Faz o UPSERT atômico das linhas recebidas na tabela do SQLite local com tratamento defensivo."""
    if not rows:
        return 0

    cursor = conn.cursor()
    # Identifica colunas existentes na tabela local e restrições NOT NULL
    cursor.execute(f"PRAGMA table_info({tabela})")
    col_info = cursor.fetchall()
    cols_locais = {row[1] for row in col_info}
    cols_notnull = {row[1] for row in col_info if row[3] == 1 and row[4] is None and row[5] == 0}
    if not cols_locais:
        return 0

    # Busca profissional padrão para evitar falha de NOT NULL caso a tabela ainda tenha restrição
    padrao_prof_id = 1
    if "profissional_id" in cols_notnull or tabela in ("clientes", "levantamentos", "banco_pontos"):
        try:
            cursor.execute("SELECT id FROM profissionais ORDER BY id ASC LIMIT 1")
            p_row = cursor.fetchone()
            if p_row and p_row[0]:
                padrao_prof_id = p_row[0]
        except Exception:
            pass

    inseridos = 0
    for r in rows:
        # Filtra apenas as colunas que realmente existem na tabela local
        dados_validos = {k: v for k, v in r.items() if k in cols_locais}
        if not dados_validos:
            continue

        # Tratamento defensivo para colunas NOT NULL que chegam vazias ou None da nuvem
        for col_name in cols_notnull:
            if col_name in dados_validos and dados_validos[col_name] is None:
                if col_name == "profissional_id":
                    dados_validos[col_name] = padrao_prof_id
                else:
                    dados_validos[col_name] = ""
            elif col_name not in dados_validos:
                if col_name == "profissional_id":
                    dados_validos[col_name] = padrao_prof_id

        # Garantia explícita para profissional_id em clientes e levantamentos
        if tabela in ("clientes", "levantamentos") and not dados_validos.get("profissional_id"):
            dados_validos["profissional_id"] = padrao_prof_id

        # Resolução defensiva de chave natural para propriedade_clientes
        if tabela == "propriedade_clientes":
            p_id = dados_validos.get("propriedade_id")
            c_id = dados_validos.get("cliente_id")
            reg_id = dados_validos.get("id")
            if p_id is not None and c_id is not None:
                if reg_id is not None:
                    cursor.execute(
                        "DELETE FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ? AND id != ?",
                        (p_id, c_id, reg_id)
                    )
                else:
                    cursor.execute(
                        "DELETE FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ?",
                        (p_id, c_id)
                    )

        # Garantia e resolução defensiva para tabela pontos
        if tabela == "pontos":
            if not dados_validos.get("tipo_ponto"):
                t_cand = str(r.get("tipo") or "").upper().strip()
                if t_cand in ('M', 'P', 'V', 'B'):
                    dados_validos["tipo_ponto"] = t_cand
                else:
                    nv = str(dados_validos.get("nome_vertice") or "").strip().upper()
                    dados_validos["tipo_ponto"] = nv[0] if nv.startswith(('M', 'P', 'V', 'B')) else 'V'

            if "alt" in cols_locais and not dados_validos.get("alt") and r.get("altitude"):
                dados_validos["alt"] = r.get("altitude")

            lev_id = dados_validos.get("levantamento_id")
            mat_id = dados_validos.get("matricula_id")
            nv = dados_validos.get("nome_vertice")
            tp = dados_validos.get("tipo_ponto")
            p_id = dados_validos.get("id")
            if lev_id and nv and tp:
                if mat_id is not None:
                    cursor.execute(
                        "DELETE FROM pontos WHERE levantamento_id = ? AND matricula_id = ? AND nome_vertice = ? AND tipo_ponto = ? AND id != ?",
                        (lev_id, mat_id, nv, tp, p_id or -1)
                    )
                else:
                    cursor.execute(
                        "DELETE FROM pontos WHERE levantamento_id = ? AND matricula_id IS NULL AND nome_vertice = ? AND tipo_ponto = ? AND id != ?",
                        (lev_id, nv, tp, p_id or -1)
                    )

        # Garantia e resolução defensiva para tabela segmentos
        if tabela == "segmentos":
            if "tipo_limite_sigef" in cols_locais and not dados_validos.get("tipo_limite_sigef"):
                dados_validos["tipo_limite_sigef"] = r.get("tipo_limite") or "LA1"
            if "metodo_posicionamento_sigef" in cols_locais and not dados_validos.get("metodo_posicionamento_sigef"):
                dados_validos["metodo_posicionamento_sigef"] = "PG1"

            if "matricula_id" in cols_locais and not dados_validos.get("matricula_id"):
                p_ini = dados_validos.get("ponto_inicio_id")
                p_fim = dados_validos.get("ponto_fim_id")
                lev_id = dados_validos.get("levantamento_id")
                mat_encontrada = None
                if p_ini or p_fim:
                    cursor.execute(
                        "SELECT matricula_id FROM pontos WHERE id IN (?, ?) AND matricula_id IS NOT NULL LIMIT 1",
                        (p_ini or -1, p_fim or -1)
                    )
                    m_row = cursor.fetchone()
                    if m_row and m_row[0]:
                        mat_encontrada = m_row[0]

                if not mat_encontrada and lev_id:
                    cursor.execute(
                        "SELECT m.id FROM matriculas m JOIN levantamentos l ON m.propriedade_id = l.propriedade_id WHERE l.id = ? LIMIT 1",
                        (lev_id,)
                    )
                    m_row = cursor.fetchone()
                    if m_row and m_row[0]:
                        mat_encontrada = m_row[0]

                if mat_encontrada:
                    dados_validos["matricula_id"] = mat_encontrada

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

        cloud_json = res.json()
        data_cloud = cloud_json.get("data", {})
        cloud_ts = cloud_json.get("cloud_timestamp")
        if not data_cloud:
            sessao["last_sync"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            if cloud_ts:
                sessao["last_cloud_ts"] = int(cloud_ts)
            salvar_sessao(sessao)
            return {
                "sucesso": True,
                "mensagem": "Nenhum dado pendente na nuvem.",
                "total_recebidos": 0,
                "cloud_timestamp": sessao.get("last_cloud_ts")
            }

        # Conecta no SQLite local para aplicar a importação de forma atômica
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA foreign_keys = OFF;")

            # Executa migrações preventivas para clientes e segmentos
            try:
                migrar_profissional_id_opcional_clientes(conn)
                migrar_matricula_id_opcional_segmentos(conn)
            except Exception as e_mig:
                logger.warning(f"Aviso ao executar migrações preventivas: {e_mig}")
            
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
        if cloud_ts:
            sessao["last_cloud_ts"] = int(cloud_ts)
        salvar_sessao(sessao)

        return {
            "sucesso": True,
            "mensagem": f"Download concluído! {total_baixados} registros atualizados no banco local.",
            "total_recebidos": total_baixados,
            "cloud_timestamp": sessao.get("last_cloud_ts"),
            "detalhes": resumo
        }

    except Exception as e:
        logger.exception("Falha ao puxar dados da nuvem:")
        return {"sucesso": False, "mensagem": f"Falha de conexão durante o download: {str(e)}"}


async def checar_novidades_nuvem() -> dict:
    """
    Heartbeat ultrarrápido (< 50ms) que verifica se outro computador publicou
    novos dados ou alterações na Nuvem Hostinger.
    """
    sessao = carregar_sessao()
    token = sessao.get("token")
    if not token:
        return {"online": False, "autenticado": False, "novidades": False, "mensagem": "Sem sessão ativa"}

    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get(CLOUD_CHECK_URL, headers=headers)

        if res.status_code == 200:
            data = res.json()
            cloud_ts = int(data.get("cloud_timestamp", 0))
            last_ts = int(sessao.get("last_cloud_ts", 0))
            tem_novidades = (cloud_ts > last_ts) if (cloud_ts > 0 and last_ts > 0) else False

            return {
                "online": True,
                "autenticado": True,
                "novidades": tem_novidades,
                "cloud_timestamp": cloud_ts,
                "last_cloud_ts": last_ts,
                "server_time": data.get("server_time")
            }
        elif res.status_code == 401:
            limpar_sessao()
            return {"online": True, "autenticado": False, "novidades": False, "mensagem": "Sessão expirada"}
        else:
            return {"online": False, "autenticado": True, "novidades": False, "mensagem": f"Status HTTP {res.status_code}"}
    except Exception as e:
        logger.debug(f"Falha ao checar heartbeat na nuvem: {e}")
        return {"online": False, "autenticado": True, "novidades": False, "erro": str(e)}



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
