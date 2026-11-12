"""
atualizador.py — Verifica, baixa e aplica atualizações do GerenciGeo (git + build do frontend) sem terminal.
Usado pelas rotas /atualizacao e pelo aviso de "atualização disponível" da interface.
"""
import os
import subprocess
import sys
import threading
import time
from typing import Optional

from config import BASE_DIR, RUNNING_LOCAL, _is_test_environment

FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
_lock = threading.Lock()
_estado = {"etapa": "ocioso", "mensagem": ""}  # ocioso | baixando | compilando | pronto | erro


def habilitado() -> bool:
    """Só o app desktop local (clone git) se auto-atualiza; nuvem e testes ficam de fora."""
    return bool(RUNNING_LOCAL) and not _is_test_environment() and os.path.isdir(os.path.join(BASE_DIR, ".git"))


def _git(*args: str, timeout: int = 60) -> str:
    res = subprocess.run(
        ["git", *args], cwd=BASE_DIR, capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=timeout, creationflags=_NO_WINDOW,
    )
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout or "falha no git").strip())
    return res.stdout.strip()


def obter_estado() -> dict:
    return dict(_estado)


def verificar_atualizacao() -> dict:
    """Consulta o remoto e informa se há commits novos em origin/main."""
    if not habilitado():
        return {"habilitado": False, "disponivel": False}
    try:
        _git("fetch", "origin", "main", timeout=30)
        local = _git("rev-parse", "HEAD")
        remoto = _git("rev-parse", "origin/main")
        atras = int(_git("rev-list", "--count", "HEAD..origin/main") or 0)
        novidades = _git("log", "HEAD..origin/main", "--format=%s", "-n", "5").splitlines() if atras else []
        return {
            "habilitado": True, "disponivel": atras > 0, "commits_atras": atras,
            "novidades": novidades, "versao_atual": local[:7], "versao_nova": remoto[:7],
            "estado": obter_estado(),
        }
    except Exception as e:
        return {"habilitado": True, "disponivel": False, "erro": str(e), "estado": obter_estado()}


def _definir(etapa: str, mensagem: str = "") -> None:
    _estado["etapa"], _estado["mensagem"] = etapa, mensagem


def _npm(comando: str) -> None:
    res = subprocess.run(comando, cwd=FRONTEND_DIR, shell=True, capture_output=True, text=True,
                         encoding="utf-8", errors="replace", creationflags=_NO_WINDOW)
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout or f"falha em '{comando}'")[-600:])


def _executar() -> None:
    try:
        _definir("baixando", "Baixando a nova versão...")
        antes = _git("rev-parse", "HEAD")
        _git("pull", "--ff-only", "origin", "main", timeout=180)
        depois = _git("rev-parse", "HEAD")
        alterados = _git("diff", "--name-only", antes, depois).splitlines() if antes != depois else []

        dist = os.path.join(FRONTEND_DIR, "dist")
        precisa_build = (not os.path.isdir(dist) or not os.listdir(dist)
                         or any(a.startswith("frontend/") for a in alterados))
        if precisa_build:
            _definir("compilando", "Compilando a interface...")
            if not os.path.isdir(os.path.join(FRONTEND_DIR, "node_modules")) or "frontend/package.json" in alterados \
                    or "frontend/package-lock.json" in alterados:
                _npm("npm install")
            _npm("npm run build")
            cache = os.path.join(BASE_DIR, ".webview_cache")
            if os.path.isdir(cache):
                import shutil
                shutil.rmtree(cache, ignore_errors=True)
        _definir("pronto", "Atualização instalada. Reinicie para aplicar.")
    except Exception as e:
        _definir("erro", str(e))


def iniciar_atualizacao() -> dict:
    """Dispara o download/build em segundo plano; o progresso é lido por obter_estado()."""
    with _lock:
        if _estado["etapa"] in ("baixando", "compilando"):
            return obter_estado()
        _definir("baixando", "Iniciando...")
        threading.Thread(target=_executar, daemon=True).start()
    return obter_estado()


def reiniciar_aplicativo(python_exe: Optional[str] = None) -> None:
    """Abre uma nova instância (após o processo atual liberar a porta) e encerra esta."""
    exe = python_exe or sys.executable
    comando = f'ping -n 4 127.0.0.1 >nul & "{exe}" "{os.path.join(BASE_DIR, "main.py")}"'
    subprocess.Popen(
        ["cmd", "/c", comando], cwd=BASE_DIR, close_fds=True,
        creationflags=getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
    )

    def _sair():
        time.sleep(0.8)
        os._exit(0)

    threading.Thread(target=_sair, daemon=True).start()
