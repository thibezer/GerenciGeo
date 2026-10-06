import unittest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from api import app
from services.gestores.nuvem_sync import (
    checar_novidades_nuvem,
    pull_dados_nuvem,
    carregar_sessao,
    _extrair_exclusoes_locais,
    push_dados_nuvem,
    _upsert_tabela_local,
    _extrair_dados_locais,
    salvar_sessao,
    limpar_sessao
)
from database.connection import DatabaseManager

class TestNuvemSync(unittest.TestCase):
    def setUp(self):
        limpar_sessao()
        self.client = TestClient(app)

    def tearDown(self):
        limpar_sessao()

    def test_status_endpoint(self):
        """Valida que o endpoint GET /nuvem/status retorna o contrato correto"""
        with patch("routes.nuvem.obter_status_nuvem", new_callable=AsyncMock) as mock_status:
            mock_status.return_value = {
                "online": True,
                "database": "MySQL Conectado",
                "autenticado": True,
                "user": {"email": "admin@gerencigeo.com.br"},
                "last_sync": "25/09/2026 11:00:00"
            }

            res = self.client.get("/nuvem/status")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertIn("online", data)
            self.assertIn("autenticado", data)
            self.assertTrue(data["online"])

    def test_upsert_tabela_local(self):
        """Valida inserção e atualização atômica de registros no SQLite local"""
        with DatabaseManager() as conn:
            # O DELETE de limpeza abaixo gera lápide (trigger); remove restos de execuções anteriores
            conn.execute("DELETE FROM registros_excluidos WHERE tabela = 'pessoas' AND registro_id = 9999")
            conn.commit()
            # Insere pessoa de teste
            rows = [
                {"id": 9999, "nome": "Cliente Nuvem", "cpf_cnpj": "11122233344"}
            ]
            qtd = _upsert_tabela_local(conn, "pessoas", rows)
            self.assertEqual(qtd, 1)

            # Atualiza a mesma pessoa
            rows_update = [
                {"id": 9999, "nome": "Cliente Nuvem Atualizado", "cpf_cnpj": "11122233344"}
            ]
            qtd_up = _upsert_tabela_local(conn, "pessoas", rows_update)
            self.assertEqual(qtd_up, 1)

            # Verifica se o nome foi atualizado
            cursor = conn.cursor()
            cursor.execute("SELECT nome FROM pessoas WHERE id = 9999")
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "Cliente Nuvem Atualizado")

            # Limpeza
            cursor.execute("DELETE FROM pessoas WHERE id = 9999")
            cursor.execute("DELETE FROM registros_excluidos WHERE tabela = 'pessoas' AND registro_id = 9999")
            conn.commit()

    def test_extrair_dados_locais(self):
        """Valida que a extração local lê as tabelas com sucesso em modo leitura"""
        dados = _extrair_dados_locais()
        self.assertIsInstance(dados, dict)
        self.assertIn("pessoas", dados)
        self.assertIn("clientes", dados)
        self.assertIn("propriedades", dados)
        self.assertIn("matriculas", dados)

class TestChecarNovidades(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        limpar_sessao()

    def tearDown(self):
        limpar_sessao()

    async def _checar(self, last_cloud_ts, cloud_ts):
        sessao = {"token": "fake-jwt"}
        if last_cloud_ts is not None:
            sessao["last_cloud_ts"] = last_cloud_ts
        salvar_sessao(sessao)

        resp = MagicMock(status_code=200)
        resp.json.return_value = {"cloud_timestamp": cloud_ts, "server_time": 1}
        client = MagicMock()
        client.get = AsyncMock(return_value=resp)
        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=client)
        cm.__aexit__ = AsyncMock(return_value=False)
        with patch("services.gestores.nuvem_sync.httpx.AsyncClient", return_value=cm):
            return await checar_novidades_nuvem()

    async def test_primeiro_pull_quando_nunca_sincronizou(self):
        """last_cloud_ts ausente + nuvem com dados => novidades (pull inicial)"""
        res = await self._checar(None, 500)
        self.assertTrue(res["novidades"])

    async def test_nuvem_vazia_sem_sessao_previa(self):
        """Nuvem sem timestamp e nada baixado => sem novidades"""
        res = await self._checar(None, 0)
        self.assertFalse(res["novidades"])

    async def test_nuvem_mais_nova(self):
        res = await self._checar(100, 200)
        self.assertTrue(res["novidades"])

    async def test_nuvem_igual(self):
        res = await self._checar(200, 200)
        self.assertFalse(res["novidades"])


class TestLapidesIncrementais(unittest.IsolatedAsyncioTestCase):
    """Lápides (registros_excluidos): pull incremental, sem duplicar e com data."""

    PESSOA_ID = 987001

    def setUp(self):
        limpar_sessao()
        self._limpar_banco()

    def tearDown(self):
        limpar_sessao()
        self._limpar_banco()

    def _limpar_banco(self):
        with DatabaseManager() as conn:
            conn.execute("DELETE FROM pessoas WHERE id = ?", (self.PESSOA_ID,))
            conn.execute("DELETE FROM registros_excluidos WHERE registro_id = ?", (self.PESSOA_ID,))
            conn.commit()

    async def _pull(self, cloud_json):
        resp = MagicMock(status_code=200, headers={"content-type": "application/json"})
        resp.json.return_value = cloud_json
        client = MagicMock()
        client.get = AsyncMock(return_value=resp)
        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=client)
        cm.__aexit__ = AsyncMock(return_value=False)
        with patch("services.gestores.nuvem_sync.httpx.AsyncClient", return_value=cm):
            res = await pull_dados_nuvem()
        return res, client.get

    def _contar_lapides(self):
        with DatabaseManager() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM registros_excluidos WHERE tabela = 'pessoas' AND registro_id = ?",
                (self.PESSOA_ID,)
            ).fetchone()[0]

    async def test_pull_envia_cursor_e_avanca_apos_aplicar(self):
        salvar_sessao({"token": "fake-jwt", "last_exclusao_id": 40})
        cloud = {
            "data": {"pessoas": []}, "cloud_timestamp": 10,
            "exclusoes": [{"id": 41, "tabela": "pessoas", "registro_id": self.PESSOA_ID, "excluido_em": "2026-10-01 08:00:00"}],
            "exclusoes_max_id": 41,
        }
        res, mock_get = await self._pull(cloud)

        self.assertTrue(res["sucesso"])
        self.assertIn("exclusoes_desde=40", mock_get.call_args.args[0])
        self.assertEqual(carregar_sessao()["last_exclusao_id"], 41)
        self.assertEqual(self._contar_lapides(), 1)

    async def test_pull_repetido_nao_duplica_lapide(self):
        salvar_sessao({"token": "fake-jwt"})
        cloud = {
            "data": {"pessoas": []}, "cloud_timestamp": 10,
            "exclusoes": [{"id": 1, "tabela": "pessoas", "registro_id": self.PESSOA_ID}],
            "exclusoes_max_id": 1,
        }
        await self._pull(cloud)
        await self._pull(cloud)
        self.assertEqual(self._contar_lapides(), 1)

    async def test_lapide_remota_remove_registro_e_bloqueia_ressurreicao(self):
        with DatabaseManager() as conn:
            conn.execute("INSERT INTO pessoas (id, nome) VALUES (?, 'Para Excluir')", (self.PESSOA_ID,))
            conn.commit()
        salvar_sessao({"token": "fake-jwt"})
        cloud = {
            "data": {"pessoas": [{"id": self.PESSOA_ID, "nome": "Ressuscitada"}]}, "cloud_timestamp": 10,
            "exclusoes": [{"id": 5, "tabela": "pessoas", "registro_id": self.PESSOA_ID}],
            "exclusoes_max_id": 5,
        }
        await self._pull(cloud)
        with DatabaseManager() as conn:
            existe = conn.execute("SELECT COUNT(*) FROM pessoas WHERE id = ?", (self.PESSOA_ID,)).fetchone()[0]
        self.assertEqual(existe, 0)

    async def test_cursor_nao_avanca_sem_exclusoes_max_id(self):
        """Servidor antigo (sem exclusoes_max_id) não deve zerar/alterar o cursor"""
        salvar_sessao({"token": "fake-jwt", "last_exclusao_id": 7})
        await self._pull({"data": {"pessoas": []}, "cloud_timestamp": 10, "exclusoes": []})
        self.assertEqual(carregar_sessao()["last_exclusao_id"], 7)

    def test_extrair_exclusoes_deduplica_e_envia_data(self):
        with DatabaseManager() as conn:
            for _ in range(3):
                conn.execute(
                    "INSERT INTO registros_excluidos (tabela, registro_id, excluido_em) VALUES ('pessoas', ?, '2026-10-01 08:00:00')",
                    (self.PESSOA_ID,)
                )
            conn.commit()
        mias = [e for e in _extrair_exclusoes_locais() if e["registro_id"] == self.PESSOA_ID]
        self.assertEqual(len(mias), 1)
        self.assertEqual(mias[0]["excluido_em"], "2026-10-01 08:00:00")


class TestMergePorRegistroEGatilhos(unittest.IsolatedAsyncioTestCase):
    """updated_at (último a editar vence), lápides por trigger e envio de lápides."""

    IDS = (987101, 987102, 987103)

    def setUp(self):
        limpar_sessao()
        self._limpar()

    def tearDown(self):
        limpar_sessao()
        self._limpar()

    def _limpar(self):
        with DatabaseManager() as conn:
            conn.execute("DELETE FROM pessoas WHERE cpf_cnpj IN ('00099900011', '00099900022')")
            for i in self.IDS:
                conn.execute("DELETE FROM pessoas WHERE id = ?", (i,))
            conn.execute("DELETE FROM registros_excluidos WHERE registro_id IN (?,?,?)", self.IDS)
            conn.commit()

    def _q(self, sql, params=()):
        with DatabaseManager() as conn:
            rows = conn.execute(sql, params).fetchall()
            conn.commit()
            return [tuple(r) for r in rows]

    # --- triggers locais
    def test_insert_e_update_carimbam_updated_at(self):
        i = self.IDS[0]
        self._q("INSERT INTO pessoas (id, nome) VALUES (?, 'A')", (i,))
        ts1 = self._q("SELECT updated_at FROM pessoas WHERE id = ?", (i,))[0][0]
        self.assertIsNotNone(ts1)
        self._q("UPDATE pessoas SET nome = 'B' WHERE id = ?", (i,))
        ts2 = self._q("SELECT updated_at FROM pessoas WHERE id = ?", (i,))[0][0]
        self.assertGreaterEqual(ts2, ts1)

    def test_updated_at_explicito_e_preservado(self):
        i = self.IDS[0]
        self._q("INSERT INTO pessoas (id, nome) VALUES (?, 'A')", (i,))
        self._q("UPDATE pessoas SET nome = 'B', updated_at = '2031-01-01 00:00:00.000' WHERE id = ?", (i,))
        self.assertEqual(self._q("SELECT updated_at FROM pessoas WHERE id = ?", (i,))[0][0], "2031-01-01 00:00:00.000")

    def test_delete_gera_lapide_e_reinsercao_remove(self):
        i = self.IDS[0]
        self._q("INSERT INTO pessoas (id, nome) VALUES (?, 'A')", (i,))
        self._q("DELETE FROM pessoas WHERE id = ?", (i,))
        lap = self._q("SELECT enviado_nuvem FROM registros_excluidos WHERE tabela='pessoas' AND registro_id = ?", (i,))
        self.assertEqual(lap, [(0,)])
        self._q("INSERT INTO pessoas (id, nome) VALUES (?, 'A de novo')", (i,))
        self.assertEqual(self._q("SELECT COUNT(*) FROM registros_excluidos WHERE tabela='pessoas' AND registro_id = ?", (i,)), [(0,)])

    # --- merge no pull
    def _upsert(self, rows):
        with DatabaseManager() as conn:
            qtd = _upsert_tabela_local(conn, "pessoas", rows)
            conn.commit()
            return qtd

    def test_pull_so_aplica_linha_da_nuvem_se_mais_nova(self):
        i = self.IDS[0]
        self._q("INSERT INTO pessoas (id, nome) VALUES (?, 'Local')", (i,))
        self._q("UPDATE pessoas SET updated_at = '2026-06-01 10:00:00.000' WHERE id = ?", (i,))

        antiga = self._upsert([{"id": i, "nome": "Nuvem antiga", "updated_at": "2026-05-01 10:00:00.000"}])
        self.assertEqual(antiga, 0)
        self.assertEqual(self._q("SELECT nome FROM pessoas WHERE id = ?", (i,)), [("Local",)])

        igual = self._upsert([{"id": i, "nome": "Nuvem igual", "updated_at": "2026-06-01 10:00:00.000"}])
        self.assertEqual(igual, 0)

        nova = self._upsert([{"id": i, "nome": "Nuvem nova", "updated_at": "2026-07-01 10:00:00.000"}])
        self.assertEqual(nova, 1)
        self.assertEqual(
            self._q("SELECT nome, updated_at FROM pessoas WHERE id = ?", (i,)),
            [("Nuvem nova", "2026-07-01 10:00:00.000")]
        )

    def test_pull_de_servidor_antigo_sem_updated_at_mantem_comportamento_legado(self):
        i = self.IDS[0]
        self._q("INSERT INTO pessoas (id, nome) VALUES (?, 'Local')", (i,))
        self._upsert([{"id": i, "nome": "Servidor antigo"}])
        self.assertEqual(self._q("SELECT nome FROM pessoas WHERE id = ?", (i,)), [("Servidor antigo",)])

    def test_linha_invalida_nao_derruba_o_pull(self):
        a, b, c = self.IDS
        self._q("INSERT INTO pessoas (id, nome, cpf_cnpj) VALUES (?, 'Existente', '00099900011')", (a,))
        # b viola UNIQUE(cpf_cnpj) de outra linha; c é válida e deve ser aplicada mesmo assim
        qtd = self._upsert([
            {"id": b, "nome": "Conflitante", "cpf_cnpj": "00099900011"},
            {"id": c, "nome": "Boa", "cpf_cnpj": "00099900022"},
        ])
        self.assertEqual(qtd, 1)
        self.assertEqual(self._q("SELECT COUNT(*) FROM pessoas WHERE id = ?", (c,)), [(1,)])
        self.assertEqual(self._q("SELECT COUNT(*) FROM pessoas WHERE id = ?", (b,)), [(0,)])

    # --- lápides: só envia o que ainda não foi confirmado
    async def test_push_marca_lapides_como_enviadas(self):
        i = self.IDS[0]
        self._q("INSERT INTO pessoas (id, nome) VALUES (?, 'A')", (i,))
        self._q("DELETE FROM pessoas WHERE id = ?", (i,))
        self.assertTrue(any(e["registro_id"] == i for e in _extrair_exclusoes_locais()))
        salvar_sessao({"token": "fake-jwt"})

        resp = MagicMock(status_code=200, headers={"content-type": "application/json"})
        resp.json.return_value = {"status": "success", "cloud_timestamp": 123}
        client = MagicMock()
        client.post = AsyncMock(return_value=resp)
        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=client)
        cm.__aexit__ = AsyncMock(return_value=False)
        with patch("services.gestores.nuvem_sync.httpx.AsyncClient", return_value=cm):
            res = await push_dados_nuvem()

        self.assertTrue(res["sucesso"])
        enviado = client.post.call_args.kwargs["json"]["exclusoes"]
        self.assertTrue(any(e["registro_id"] == i for e in enviado))
        self.assertTrue(all("local_ids" not in e for e in enviado))
        self.assertFalse(any(e["registro_id"] == i for e in _extrair_exclusoes_locais()))

    async def test_push_com_falha_mantem_lapides_pendentes(self):
        i = self.IDS[0]
        self._q("INSERT INTO pessoas (id, nome) VALUES (?, 'A')", (i,))
        self._q("DELETE FROM pessoas WHERE id = ?", (i,))
        salvar_sessao({"token": "fake-jwt"})

        resp = MagicMock(status_code=500, headers={"content-type": "application/json"})
        resp.json.return_value = {"error": "boom"}
        client = MagicMock()
        client.post = AsyncMock(return_value=resp)
        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=client)
        cm.__aexit__ = AsyncMock(return_value=False)
        with patch("services.gestores.nuvem_sync.httpx.AsyncClient", return_value=cm):
            res = await push_dados_nuvem()

        self.assertFalse(res["sucesso"])
        self.assertTrue(any(e["registro_id"] == i for e in _extrair_exclusoes_locais()))


if __name__ == "__main__":
    unittest.main()
