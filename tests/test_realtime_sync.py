"""
tests/test_realtime_sync.py — Testes unitários do RealtimeSyncEngine e endpoints de tempo real.
"""

import unittest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from api import app
from services.gestores.realtime_sync import (
    RealtimeSyncEngine,
    STATUS_SYNCED,
    STATUS_SYNCING,
    STATUS_PENDING_PUSH,
    STATUS_OFFLINE,
    STATUS_UNAUTHENTICATED,
    STATUS_PAUSED
)
from services.gestores.nuvem_sync import limpar_sessao, salvar_sessao


class TestRealtimeSyncEngine(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        limpar_sessao()
        self.client = TestClient(app)
        self.engine = RealtimeSyncEngine()
        self.engine._debounce_sec = 0.05  # Rápido para testes
        self.engine._check_interval = 0.1

    def tearDown(self):
        limpar_sessao()

    async def test_initial_unauthenticated_state(self):
        """Valida que sem sessão ativa o status é UNAUTHENTICATED"""
        status_payload = self.engine.get_status_payload()
        self.assertEqual(status_payload["status"], STATUS_UNAUTHENTICATED)
        self.assertFalse(status_payload["autenticado"])

    async def test_mutation_detection_and_debounce(self):
        """Valida que marcar_mutacao_local coloca o motor em PENDING_PUSH"""
        self.engine.marcar_mutacao_local("clientes")
        self.assertTrue(self.engine._pending_push)
        self.assertIn("clientes", self.engine._pending_tables)
        self.assertEqual(self.engine.status, STATUS_PENDING_PUSH)

    async def test_auto_push_execution(self):
        """Valida que após o debounce o auto-push envia os dados com sucesso"""
        salvar_sessao({"token": "fake-jwt", "user": {"email": "test@gerencigeo.com"}})
        self.engine.marcar_mutacao_local("propriedades")

        with patch("services.gestores.realtime_sync.push_dados_nuvem", new_callable=AsyncMock) as mock_push, \
             patch("services.gestores.realtime_sync.checar_novidades_nuvem", new_callable=AsyncMock) as mock_check, \
             patch("services.gestores.realtime_sync.pull_dados_nuvem", new_callable=AsyncMock) as mock_pull:
            mock_check.return_value = {"online": True, "autenticado": True, "novidades": False}
            mock_push.return_value = {
                "sucesso": True,
                "total_registros": 4,
                "mensagem": "OK"
            }
            await self.engine._executar_auto_push()

            mock_pull.assert_not_called()
            self.assertFalse(self.engine._pending_push)
            self.assertEqual(len(self.engine._pending_tables), 0)
            self.assertEqual(self.engine.status, STATUS_SYNCED)
            self.assertEqual(len(self.engine._recent_events), 2)  # mutacao + push

    async def test_auto_push_pulls_first_when_cloud_has_news(self):
        """Pull-before-push: com novidades na nuvem, o pull roda antes do push"""
        salvar_sessao({"token": "fake-jwt", "user": {"email": "test@gerencigeo.com"}})
        self.engine.marcar_mutacao_local("pontos")
        ordem = []

        async def fake_pull():
            ordem.append("pull")
            return {"sucesso": True, "total_recebidos": 3, "detalhes": {}}

        async def fake_push():
            ordem.append("push")
            return {"sucesso": True, "total_registros": 1}

        with patch("services.gestores.realtime_sync.checar_novidades_nuvem", new_callable=AsyncMock) as mock_check, \
             patch("services.gestores.realtime_sync.pull_dados_nuvem", side_effect=fake_pull), \
             patch("services.gestores.realtime_sync.push_dados_nuvem", side_effect=fake_push):
            mock_check.return_value = {"online": True, "autenticado": True, "novidades": True}
            await self.engine._executar_auto_push()

        self.assertEqual(ordem, ["pull", "push"])
        self.assertFalse(self.engine._pending_push)
        self.assertEqual(self.engine.status, STATUS_SYNCED)

    async def test_auto_push_aborted_when_pull_fails(self):
        """Se o pull prévio falhar, o push não roda e a mutação continua pendente"""
        salvar_sessao({"token": "fake-jwt", "user": {"email": "test@gerencigeo.com"}})
        self.engine.marcar_mutacao_local("pontos")

        with patch("services.gestores.realtime_sync.checar_novidades_nuvem", new_callable=AsyncMock) as mock_check, \
             patch("services.gestores.realtime_sync.pull_dados_nuvem", new_callable=AsyncMock) as mock_pull, \
             patch("services.gestores.realtime_sync.push_dados_nuvem", new_callable=AsyncMock) as mock_push:
            mock_check.return_value = {"online": True, "autenticado": True, "novidades": True}
            mock_pull.return_value = {"sucesso": False, "mensagem": "timeout"}
            await self.engine._executar_auto_push()

            mock_push.assert_not_called()

        self.assertTrue(self.engine._pending_push)
        self.assertEqual(self.engine.status, STATUS_OFFLINE)
        self.assertEqual(self.engine._last_error, "timeout")

    async def test_heartbeat_detection_and_auto_pull(self):
        """Valida que quando checar_novidades_nuvem indica novidades o auto-pull é disparado"""
        salvar_sessao({"token": "fake-jwt", "user": {"email": "test@gerencigeo.com"}, "last_cloud_ts": 100})
        
        with patch("services.gestores.realtime_sync.checar_novidades_nuvem", new_callable=AsyncMock) as mock_check, \
             patch("services.gestores.realtime_sync.pull_dados_nuvem", new_callable=AsyncMock) as mock_pull:
            
            mock_check.return_value = {
                "online": True,
                "autenticado": True,
                "novidades": True,
                "cloud_timestamp": 200,
                "last_cloud_ts": 100
            }
            mock_pull.return_value = {
                "sucesso": True,
                "total_recebidos": 5,
                "detalhes": {"clientes": 5}
            }

            await self.engine._executar_heartbeat_check()

            mock_pull.assert_called_once()
            self.assertEqual(self.engine.status, STATUS_SYNCED)

    async def test_network_offline_handling(self):
        """Valida que se a nuvem estiver inacessível o motor vai para OFFLINE sem quebrar"""
        salvar_sessao({"token": "fake-jwt", "user": {"email": "test@gerencigeo.com"}})

        with patch("services.gestores.realtime_sync.checar_novidades_nuvem", new_callable=AsyncMock) as mock_check:
            mock_check.return_value = {
                "online": False,
                "autenticado": True,
                "novidades": False,
                "erro": "Connection refused"
            }

            await self.engine._executar_heartbeat_check()
            self.assertEqual(self.engine.status, STATUS_OFFLINE)

    def test_routes_realtime_status_and_toggle(self):
        """Valida os endpoints REST /nuvem/realtime/status e /nuvem/realtime/toggle"""
        res = self.client.get("/nuvem/realtime/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("status", data)
        self.assertIn("enabled", data)

        res_toggle = self.client.post("/nuvem/realtime/toggle", json={"enabled": False})
        self.assertEqual(res_toggle.status_code, 200)
        self.assertFalse(res_toggle.json()["enabled"])

        # Restaura
        self.client.post("/nuvem/realtime/toggle", json={"enabled": True})


if __name__ == "__main__":
    unittest.main()
