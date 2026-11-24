import asyncio
import re
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from database.connection import DatabaseManager, execute_query
from database.models import TABELAS_SINCRONIZAVEIS, migrar_sincronizacao_updated_at_e_lapides
from services.gestores.nuvem_sync import SYNC_TABLES, pull_dados_nuvem


class TestSyncParidadeP2(unittest.TestCase):
    def setUp(self):
        self.api_php_path = Path("frontend/public/api.php")
        self.api_php = self.api_php_path.read_text(encoding="utf-8")

    def test_tabelas_sincronizaveis_em_paridade_com_api_php(self):
        self.assertIn("arquivos_enviados_ia", TABELAS_SINCRONIZAVEIS)
        self.assertIn("confrontante_envolvidos_usufruto", TABELAS_SINCRONIZAVEIS)
        self.assertEqual(set(SYNC_TABLES), set(TABELAS_SINCRONIZAVEIS))

        m = re.search(r"const\s+SYNC_TABELAS_MYSQL\s*=\s*\[(.*?)\];", self.api_php, re.S)
        self.assertIsNotNone(m, "SYNC_TABELAS_MYSQL não encontrada em api.php")
        php_tables = set(re.findall(r"'([a-z0-9_]+)'", m.group(1)))

        expected_php = set(TABELAS_SINCRONIZAVEIS) - {"propriedade_clientes"} | {"propriedade_proprietarios"}
        self.assertEqual(php_tables, expected_php)

    def test_sqlite_triggers_para_usufruto_e_arquivos_ia(self):
        with DatabaseManager() as conn:
            migrar_sincronizacao_updated_at_e_lapides(conn)
            cur = conn.cursor()
            for tabela in ("confrontante_envolvidos_usufruto", "arquivos_enviados_ia"):
                cur.execute(f"PRAGMA table_info({tabela})")
                cols = {r[1] for r in cur.fetchall()}
                self.assertIn("updated_at", cols)

                cur.execute(
                    "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN (?, ?, ?)",
                    (f"trg_sync_{tabela}_ai", f"trg_sync_{tabela}_au", f"trg_sync_{tabela}_ad"),
                )
                trgs = {r[0] for r in cur.fetchall()}
                self.assertEqual(len(trgs), 3, f"Faltam triggers de sync para {tabela}: {trgs}")

    def test_pull_recebe_arquivos_enviados_ia_e_usufruto(self):
        # Valida que pull_dados_nuvem persiste arquivos_enviados_ia e confrontante_envolvidos_usufruto
        fake_cloud = {
            "data": {
                "arquivos_enviados_ia": [
                    {
                        "id": 990001,
                        "nome_arquivo": "rg_sync_p2.pdf",
                        "sha256": "p2hash_sync_test_0001",
                        "tamanho_bytes": 1234,
                        "categoria": "CLIENTE",
                        "updated_at": "2026-11-24 20:00:00.000",
                    }
                ],
                "confrontante_envolvidos_usufruto": [
                    {
                        "id": 990002,
                        "confrontante_id": 999999,
                        "papel": "USUFRUTUARIO",
                        "nome": "Usufrutuario Sync P2",
                        "updated_at": "2026-11-24 20:00:00.000",
                    }
                ],
            },
            "exclusoes": [],
            "cloud_timestamp": 1795550000,
        }

        class FakeResp:
            status_code = 200
            def json(self):
                return fake_cloud

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                return False
            async def get(self, *args, **kwargs):
                return FakeResp()

        try:
            with patch("services.gestores.nuvem_sync.carregar_sessao", return_value={"token": "tok"}), \
                 patch("services.gestores.nuvem_sync.salvar_sessao"), \
                 patch("services.gestores.nuvem_sync.httpx.AsyncClient", FakeAsyncClient):
                res = asyncio.run(pull_dados_nuvem())

            self.assertTrue(res["sucesso"])
            self.assertEqual(res["detalhes"].get("arquivos_enviados_ia"), 1)
            self.assertEqual(res["detalhes"].get("confrontante_envolvidos_usufruto"), 1)

            row_arq = execute_query("SELECT nome_arquivo FROM arquivos_enviados_ia WHERE id = 990001", fetch_one=True)
            self.assertIsNotNone(row_arq)
            self.assertEqual(row_arq["nome_arquivo"], "rg_sync_p2.pdf")

            row_usu = execute_query("SELECT nome FROM confrontante_envolvidos_usufruto WHERE id = 990002", fetch_one=True)
            self.assertIsNotNone(row_usu)
            self.assertEqual(row_usu["nome"], "Usufrutuario Sync P2")
        finally:
            execute_query("DELETE FROM arquivos_enviados_ia WHERE id = 990001", commit=True)
            execute_query("DELETE FROM confrontante_envolvidos_usufruto WHERE id = 990002", commit=True)
            execute_query(
                "DELETE FROM registros_excluidos WHERE (tabela = 'arquivos_enviados_ia' AND registro_id = 990001) "
                "OR (tabela = 'confrontante_envolvidos_usufruto' AND registro_id = 990002)",
                commit=True,
            )

    def test_api_php_regras_paridade_p2(self):
        # 1. Flag atualizada para schema_sync_v6
        self.assertIn("schema_sync_v6", self.api_php)
        # 2. /sync/pull usa SYNC_TABELAS_MYSQL
        self.assertIn("$tables = SYNC_TABELAS_MYSQL;", self.api_php)
        # 3. /sync/batch não sobrescreve lat/lon brutos
        self.assertNotIn("$pt['lat'] = $lat;", self.api_php)
        self.assertNotIn("$pt['lon'] = $lon;", self.api_php)
        # 4. GET /levantamentos/{id}/matriculas não usa mais tabela fantasma levantamento_matriculas
        self.assertNotIn("JOIN levantamento_matriculas", self.api_php)
        # 5. GET /clientes não usa mais COALESCE(COUNT(*), COUNT(*))
        self.assertNotIn("COALESCE((SELECT COUNT(*) FROM propriedade_clientes", self.api_php)


if __name__ == "__main__":
    unittest.main()
