"""
services/gestores/realtime_sync.py — Motor de Conexão e Sincronização em Tempo Real (GerenciGeo Realtime Sync Engine).
Mantém computadores e a Nuvem Hostinger conectados continuamente, enviando mutações locais
de forma debounced e puxando novidades remotas via heartbeat inteligente em segundo plano.
"""

import asyncio
import logging
import time
from datetime import datetime
from typing import Set, Optional, Dict, Any, List
from collections import deque
from fastapi import WebSocket, WebSocketDisconnect

from config import (
    REALTIME_SYNC_ENABLED,
    REALTIME_SYNC_INTERVAL_SEC,
    REALTIME_SYNC_DEBOUNCE_SEC
)
from services.gestores.nuvem_sync import (
    carregar_sessao,
    salvar_sessao,
    push_dados_nuvem,
    pull_dados_nuvem,
    checar_novidades_nuvem,
    sincronizar_tudo
)

logger = logging.getLogger(__name__)

# Estados da Máquina de Sincronização
STATUS_SYNCED = "SYNCED"                  # Sincronizado e conectado em tempo real
STATUS_SYNCING = "SYNCING"                # Transmitindo ou recebendo dados
STATUS_PENDING_PUSH = "PENDING_PUSH"      # Alterações locais detectadas aguardando debounce de envio
STATUS_OFFLINE = "OFFLINE"                # Nuvem inacessível ou sem internet (opera 100% local)
STATUS_UNAUTHENTICATED = "UNAUTHENTICATED" # Operador não efetuou login na Nuvem
STATUS_PAUSED = "PAUSED"                  # Sincronização automática pausada pelo usuário


class RealtimeSyncEngine:
    """
    Controlador autônomo de sincronização contínua entre computadores locais e o MySQL da Nuvem Hostinger.
    """

    def __init__(self):
        self._enabled: bool = REALTIME_SYNC_ENABLED
        self._check_interval: float = max(3.0, REALTIME_SYNC_INTERVAL_SEC)
        self._debounce_sec: float = max(1.0, REALTIME_SYNC_DEBOUNCE_SEC)

        self._running: bool = False
        self._worker_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

        self._status: str = STATUS_UNAUTHENTICATED
        self._pending_push: bool = False
        self._pending_push_time: Optional[float] = None
        self._pending_tables: Set[str] = set()

        self._active_websockets: Set[WebSocket] = set()
        self._backoff_sec: float = 4.0
        self._max_backoff: float = 30.0

        self._last_check_time: Optional[str] = None
        self._last_sync_time: Optional[str] = None
        self._recent_events: deque = deque(maxlen=40)
        self._last_error: Optional[str] = None

    @property
    def is_running(self) -> bool:
        return self._running and (self._worker_task is not None and not self._worker_task.done())

    @property
    def status(self) -> str:
        return self._status

    @property
    def enabled(self) -> bool:
        return self._enabled

    def registrar_evento(self, tipo: str, titulo: str, detalhe: str = "") -> None:
        """Armazena um evento na trilha de auditoria recente do motor."""
        evento = {
            "id": f"evt_{int(time.time() * 1000)}",
            "tipo": tipo,       # 'info', 'success', 'warning', 'error', 'push', 'pull'
            "titulo": titulo,
            "detalhe": detalhe,
            "hora": datetime.now().strftime("%H:%M:%S"),
            "timestamp": time.time()
        }
        self._recent_events.appendleft(evento)

    async def start(self) -> None:
        """Inicia a rotina em segundo plano do motor em tempo real."""
        if self._running:
            return

        self._running = True
        logger.info("Iniciando GerenciGeo Realtime Sync Engine...")
        self.registrar_evento("info", "Motor de tempo real ativado")
        self._worker_task = asyncio.create_task(self._worker_loop())

    async def stop(self) -> None:
        """Interrompe a rotina de sincronização de forma graciosa."""
        if not self._running:
            return

        self._running = False
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        self._worker_task = None
        logger.info("GerenciGeo Realtime Sync Engine pausado/finalizado.")
        self.registrar_evento("info", "Motor de tempo real encerrado")

    def set_enabled(self, enabled: bool) -> None:
        """Habilita ou desabilita a sincronização contínua."""
        self._enabled = enabled
        if not enabled:
            self._status = STATUS_PAUSED
            self.registrar_evento("warning", "Sincronização em tempo real pausada")
        else:
            self._status = STATUS_SYNCED
            self.registrar_evento("info", "Sincronização em tempo real reativada")
        asyncio.create_task(self._broadcast_status())

    def set_interval(self, seconds: float) -> None:
        """Altera a cadência do batimento cardíaco da checagem em nuvem."""
        self._check_interval = max(3.0, float(seconds))
        self.registrar_evento("info", f"Intervalo de verificação ajustado para {self._check_interval}s")

    def marcar_mutacao_local(self, tabela: Optional[str] = None) -> None:
        """
        Gatilho chamado imediatamente quando dados são inseridos, atualizados ou excluídos
        no SQLite local (ex: via rotas de clientes, levantamentos, pontos, propriedades).
        Inicia uma janela de debounce para empacotar mutações em lote e transmitir à Nuvem.
        """
        if not self._enabled:
            return

        self._pending_push = True
        self._pending_push_time = time.time()
        if tabela:
            self._pending_tables.add(tabela)

        self._status = STATUS_PENDING_PUSH
        tabelas_str = ", ".join(self._pending_tables) if self._pending_tables else "dados locais"
        self.registrar_evento("warning", "Alterações locais detectadas", f"Tabelas: {tabelas_str}")
        asyncio.create_task(self._broadcast_status())

    async def sincronizar_manual(self) -> Dict[str, Any]:
        """Dispara uma sincronização bidirecional forçada pelo usuário."""
        async with self._lock:
            self._status = STATUS_SYNCING
            await self._broadcast_status()
            self.registrar_evento("info", "Sincronização manual iniciada")

            try:
                res = await sincronizar_tudo()
                if res.get("sucesso"):
                    self._status = STATUS_SYNCED
                    self._last_sync_time = res.get("last_sync")
                    self._pending_push = False
                    self._pending_tables.clear()
                    self._last_error = None
                    self._backoff_sec = 4.0
                    self.registrar_evento("success", "Sincronização completa concluída", res.get("mensagem", ""))
                    await self._broadcast({
                        "type": "DATA_UPDATED",
                        "direction": "both",
                        "total_recebidos": res.get("pull", {}).get("total_recebidos", 0),
                        "total_enviados": res.get("push", {}).get("total_registros", 0),
                        "timestamp": datetime.now().isoformat()
                    })
                else:
                    self._status = STATUS_OFFLINE
                    self._last_error = res.get("mensagem")
                    self.registrar_evento("error", "Falha na sincronização", str(self._last_error))

                await self._broadcast_status()
                return res
            except Exception as e:
                self._status = STATUS_OFFLINE
                self._last_error = str(e)
                self.registrar_evento("error", "Erro crítico de conexão", str(e))
                await self._broadcast_status()
                return {"sucesso": False, "mensagem": f"Erro interno: {str(e)}"}

    async def _worker_loop(self) -> None:
        """Loop contínuo de verificação de batimentos cardíacos e transmissão."""
        logger.info("Loop contínuo do Realtime Sync Engine iniciado com sucesso.")
        
        while self._running:
            try:
                if not self._enabled:
                    await asyncio.sleep(2.0)
                    continue

                await self._processar_ciclo()
                await asyncio.sleep(self._check_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Exceção transitória no motor de sincronização em tempo real: {e}")
                self._status = STATUS_OFFLINE
                self._last_error = str(e)
                await self._broadcast_status()
                await asyncio.sleep(self._backoff_sec)
                self._backoff_sec = min(self._backoff_sec * 1.5, self._max_backoff)

    async def _processar_ciclo(self) -> None:
        """Executa um passo do ciclo de sincronização em tempo real."""
        sessao = carregar_sessao()
        token = sessao.get("token")
        if not token:
            if self._status != STATUS_UNAUTHENTICATED:
                self._status = STATUS_UNAUTHENTICATED
                await self._broadcast_status()
            return

        self._last_sync_time = sessao.get("last_sync")
        self._last_check_time = datetime.now().strftime("%H:%M:%S")

        # 1. Se há mutações locais pendentes de envio e a janela de debounce expirou
        if self._pending_push and self._pending_push_time:
            tempo_decorrido = time.time() - self._pending_push_time
            if tempo_decorrido >= self._debounce_sec:
                await self._executar_auto_push()
                return

        # 2. Checagem de novidades na nuvem (Heartbeat leve < 50ms)
        await self._executar_heartbeat_check()

    async def _executar_auto_push(self) -> None:
        """Envia alterações locais acumuladas para a Nuvem."""
        if self._lock.locked():
            return

        async with self._lock:
            self._status = STATUS_SYNCING
            await self._broadcast_status()
            
            tabelas_afetadas = list(self._pending_tables)
            res = await push_dados_nuvem()

            if res.get("sucesso"):
                self._pending_push = False
                self._pending_push_time = None
                self._pending_tables.clear()
                self._status = STATUS_SYNCED
                self._last_error = None
                self._backoff_sec = 4.0
                
                qtd = res.get("total_registros", 0)
                msg = f"{qtd} registros enviados" + (f" ({', '.join(tabelas_afetadas)})" if tabelas_afetadas else "")
                self.registrar_evento("push", "Upload em tempo real", msg)

                await self._broadcast({
                    "type": "SYNC_COMPLETED",
                    "direction": "push",
                    "total_enviados": qtd,
                    "timestamp": datetime.now().isoformat()
                })
            else:
                self._status = STATUS_OFFLINE
                self._last_error = res.get("mensagem")
                self.registrar_evento("error", "Erro ao subir dados para a Nuvem", str(self._last_error))

            await self._broadcast_status()

    async def _executar_heartbeat_check(self) -> None:
        """Consulta se há atualizações de outros computadores na nuvem."""
        if self._lock.locked():
            return

        check_res = await checar_novidades_nuvem()
        
        if not check_res.get("online"):
            if self._status != STATUS_OFFLINE:
                self._status = STATUS_OFFLINE
                self._last_error = check_res.get("erro") or check_res.get("mensagem") or "Nuvem indisponível"
                self.registrar_evento("warning", "Nuvem temporariamente offline", self._last_error or "")
                await self._broadcast_status()
            return

        if not check_res.get("autenticado"):
            self._status = STATUS_UNAUTHENTICATED
            await self._broadcast_status()
            return

        # Se há novidades publicadas por outro computador, puxa imediatamente
        if check_res.get("novidades"):
            logger.info("Novidades detectadas na Nuvem! Puxando dados em tempo real...")
            async with self._lock:
                self._status = STATUS_SYNCING
                await self._broadcast_status()

                pull_res = await pull_dados_nuvem()
                if pull_res.get("sucesso"):
                    self._status = STATUS_SYNCED
                    self._last_error = None
                    self._backoff_sec = 4.0
                    qtd = pull_res.get("total_recebidos", 0)
                    self.registrar_evento("pull", "Download em tempo real", f"{qtd} registros recebidos de outro computador")

                    await self._broadcast({
                        "type": "DATA_UPDATED",
                        "direction": "pull",
                        "total_recebidos": qtd,
                        "detalhes": pull_res.get("detalhes", {}),
                        "timestamp": datetime.now().isoformat()
                    })
                else:
                    self._status = STATUS_OFFLINE
                    self._last_error = pull_res.get("mensagem")
                    self.registrar_evento("error", "Falha ao baixar novidades da nuvem", str(self._last_error))

                await self._broadcast_status()
        else:
            # Nuvem online e sem novidades pendentes
            if self._status not in (STATUS_SYNCED, STATUS_PENDING_PUSH):
                self._status = STATUS_SYNCED
                self._last_error = None
                self._backoff_sec = 4.0
                await self._broadcast_status()

    def get_status_payload(self) -> Dict[str, Any]:
        """Retorna o estado consolidado para consumo por API REST ou WebSocket."""
        sessao = carregar_sessao()
        user = sessao.get("user")
        autenticado = bool(sessao.get("token"))

        status_atual = self._status
        if not autenticado:
            status_atual = STATUS_UNAUTHENTICATED
        elif not self._enabled:
            status_atual = STATUS_PAUSED

        return {
            "status": status_atual,
            "enabled": self._enabled,
            "running": self.is_running,
            "autenticado": autenticado,
            "user": user,
            "last_sync": sessao.get("last_sync") or self._last_sync_time,
            "last_check": self._last_check_time,
            "last_cloud_ts": sessao.get("last_cloud_ts"),
            "pending_push": self._pending_push,
            "pending_tables": list(self._pending_tables),
            "check_interval": self._check_interval,
            "last_error": self._last_error,
            "server_time": datetime.now().isoformat()
        }

    async def _broadcast_status(self) -> None:
        """Envia o payload de status atualizado a todos os WebSockets conectados."""
        payload = {
            "type": "STATUS_CHANGE",
            "data": self.get_status_payload()
        }
        await self._broadcast(payload)

    async def _broadcast(self, message: Dict[str, Any]) -> None:
        """Transmite uma mensagem JSON para todos os clientes conectados."""
        if not self._active_websockets:
            return

        mortos = []
        for ws in list(self._active_websockets):
            try:
                await ws.send_json(message)
            except Exception:
                mortos.append(ws)

        for ws in mortos:
            if ws in self._active_websockets:
                self._active_websockets.remove(ws)

    async def handle_websocket(self, websocket: WebSocket) -> None:
        """Gerencia o ciclo de vida da conexão WebSocket de uma aba/janela do frontend."""
        await websocket.accept()
        self._active_websockets.add(websocket)
        logger.info(f"Cliente WebSocket conectado à sincronização em tempo real (Total: {len(self._active_websockets)})")

        try:
            # 1. Envia estado inicial e histórico recente de eventos
            await websocket.send_json({
                "type": "INITIAL_STATE",
                "data": self.get_status_payload(),
                "recent_events": list(self._recent_events)
            })

            # 2. Escuta comandos recebidos da interface
            while True:
                msg = await websocket.receive_json()
                action = msg.get("action")

                if action == "sync_now":
                    res = await self.sincronizar_manual()
                    await websocket.send_json({"type": "SYNC_MANUAL_RESULT", "result": res})
                elif action == "toggle_enabled":
                    novo_estado = bool(msg.get("enabled", not self._enabled))
                    self.set_enabled(novo_estado)
                elif action == "ping":
                    await websocket.send_json({"type": "pong", "time": time.time()})

        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.debug(f"Exceção na conexão WebSocket de sincronização: {e}")
        finally:
            if websocket in self._active_websockets:
                self._active_websockets.remove(websocket)
            logger.info(f"Cliente WebSocket desconectado (Restantes: {len(self._active_websockets)})")


# Instância única global (Singleton)
realtime_sync_engine = RealtimeSyncEngine()
