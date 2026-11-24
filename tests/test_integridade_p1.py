import unittest
from fastapi.testclient import TestClient

from api import app
from database.connection import DatabaseManager, execute_query
from services.gestores.cliente_manager import cadastrar_cliente, excluir_cliente


class TestIntegridadeP1(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        with DatabaseManager() as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES (?, ?, ?)",
                ("Engenheiro P1", "CREA-PR 11223", "P1CD"),
            )
            self.prof_id = cur.lastrowid

            cur.execute(
                "INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES (?, ?, ?)",
                ("Fazenda P1 Ativa", "Douradina", "PR"),
            )
            self.prop_ativa_id = cur.lastrowid

            cur.execute(
                "INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES (?, ?, ?)",
                ("Fazenda P1 Arquivada", "Douradina", "PR"),
            )
            self.prop_arq_id = cur.lastrowid

            cur.execute(
                "INSERT INTO matriculas (propriedade_id, numero_matricula) VALUES (?, ?)",
                (self.prop_ativa_id, "M-P1-ATIVA"),
            )
            self.mat_ativa_id = cur.lastrowid

            cur.execute(
                "INSERT INTO matriculas (propriedade_id, numero_matricula) VALUES (?, ?)",
                (self.prop_arq_id, "M-P1-ARQ"),
            )
            self.mat_arq_id = cur.lastrowid

            cur.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-11-24', 'EM_ANDAMENTO')",
                (self.prop_ativa_id, self.prof_id),
            )
            self.lev_ativo_id = cur.lastrowid

            cur.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-11-24', 'ARQUIVADO')",
                (self.prop_arq_id, self.prof_id),
            )
            self.lev_arq_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento)
                VALUES (?, ?, 'M-P1-01', 'M', -23.38, -53.29, 350.0, 1)
                """,
                (self.lev_ativo_id, self.mat_ativa_id),
            )
            self.pt_ativo_1 = cur.lastrowid

            cur.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento)
                VALUES (?, ?, 'M-P1-02', 'M', -23.39, -53.29, 351.0, 2)
                """,
                (self.lev_ativo_id, self.mat_ativa_id),
            )
            self.pt_ativo_2 = cur.lastrowid

            cur.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento)
                VALUES (?, ?, 'M-ARQ-01', 'M', -23.38, -53.29, 350.0, 1)
                """,
                (self.lev_arq_id, self.mat_arq_id),
            )
            self.pt_arq_1 = cur.lastrowid

            conn.commit()

        self.pessoas_extra = []
        self.clientes_extra = []
        self.confs_extra = []

    def tearDown(self):
        with DatabaseManager() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM logs_auditoria_seguranca WHERE levantamento_id IN (?, ?)", (self.lev_ativo_id, self.lev_arq_id))
            cur.execute("DELETE FROM segmentos WHERE levantamento_id IN (?, ?)", (self.lev_ativo_id, self.lev_arq_id))
            cur.execute("DELETE FROM banco_pontos WHERE levantamento_id IN (?, ?)", (self.lev_ativo_id, self.lev_arq_id))
            cur.execute("DELETE FROM pontos WHERE levantamento_id IN (?, ?)", (self.lev_ativo_id, self.lev_arq_id))
            cur.execute("DELETE FROM confrontante_coproprietarios WHERE confrontante_id IN (SELECT id FROM confrontantes WHERE levantamento_id IN (?, ?))", (self.lev_ativo_id, self.lev_arq_id))
            cur.execute("DELETE FROM confrontante_envolvidos_usufruto WHERE confrontante_id IN (SELECT id FROM confrontantes WHERE levantamento_id IN (?, ?))", (self.lev_ativo_id, self.lev_arq_id))
            cur.execute("DELETE FROM confrontantes WHERE levantamento_id IN (?, ?)", (self.lev_ativo_id, self.lev_arq_id))
            cur.execute("DELETE FROM levantamentos WHERE id IN (?, ?)", (self.lev_ativo_id, self.lev_arq_id))
            cur.execute("DELETE FROM matriculas WHERE id IN (?, ?)", (self.mat_ativa_id, self.mat_arq_id))
            cur.execute("DELETE FROM propriedades WHERE id IN (?, ?)", (self.prop_ativa_id, self.prop_arq_id))
            for cid in self.clientes_extra:
                cur.execute("DELETE FROM clientes WHERE id = ?", (cid,))
            for pid in self.pessoas_extra:
                cur.execute("DELETE FROM pessoas WHERE id = ?", (pid,))
            cur.execute("DELETE FROM profissionais WHERE id = ?", (self.prof_id,))
            conn.commit()

    def test_patch_em_ponto_arquivado_bloqueado_e_auditado(self):
        res = self.client.patch(f"/pontos/{self.pt_arq_1}", json={"nome_vertice": "HACK"})
        self.assertEqual(res.status_code, 403)
        log = execute_query(
            "SELECT metodo, rota FROM logs_auditoria_seguranca WHERE levantamento_id = ? AND metodo = 'PATCH'",
            params=(self.lev_arq_id,),
            fetch_one=True,
        )
        self.assertIsNotNone(log)
        self.assertEqual(log["metodo"], "PATCH")

    def test_criar_levantamento_em_propriedade_arquivada_bloqueado(self):
        res = self.client.post(
            "/levantamentos",
            json={
                "propriedade_id": self.prop_arq_id,
                "profissional_id": self.prof_id,
                "data_inicio": "2026-11-24",
            },
        )
        self.assertEqual(res.status_code, 403)

    def test_trocar_propriedade_de_levantamento_com_pontos_bloqueado(self):
        res = self.client.put(
            f"/levantamentos/{self.lev_ativo_id}",
            json={
                "propriedade_id": self.prop_arq_id,
                "profissional_id": self.prof_id,
                "data_inicio": "2026-11-24",
                "status": "EM_ANDAMENTO",
            },
        )
        # Pode ser 403 (prop destino arquivada) ou 409 (pontos vinculados).
        # Testamos especificamente contra uma propriedade ativa limpa para validar 409:
        with DatabaseManager() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Prop Destino Livre', 'Douradina', 'PR')")
            prop_livre_id = cur.lastrowid
            conn.commit()
        try:
            self.assertEqual(res.status_code, 403)
            res_409 = self.client.put(
                f"/levantamentos/{self.lev_ativo_id}",
                json={
                    "propriedade_id": prop_livre_id,
                    "profissional_id": self.prof_id,
                    "data_inicio": "2026-11-24",
                    "status": "EM_ANDAMENTO",
                },
            )
            self.assertEqual(res_409.status_code, 409)
        finally:
            execute_query("DELETE FROM propriedades WHERE id = ?", params=(prop_livre_id,), commit=True)

    def test_excluir_matricula_com_pontos_bloqueado_409(self):
        res = self.client.delete(f"/matriculas/{self.mat_ativa_id}")
        self.assertEqual(res.status_code, 409)
        mat = execute_query("SELECT id FROM matriculas WHERE id = ?", params=(self.mat_ativa_id,), fetch_one=True)
        self.assertIsNotNone(mat)

    def test_deletar_planilha_homologada_preserva_segmentos_de_campo(self):
        with DatabaseManager() as conn:
            cur = conn.cursor()
            # Segmento de campo (origem_homologada = 0)
            cur.execute(
                """
                INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, origem_homologada)
                VALUES (?, ?, ?, ?, 0)
                """,
                (self.lev_ativo_id, self.mat_ativa_id, self.pt_ativo_1, self.pt_ativo_2),
            )
            seg_campo_id = cur.lastrowid

            # Pontos e segmento homologados (origem_homologada = 1)
            cur.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, arquivo_origem, origem_homologada)
                VALUES (?, ?, 'HOM-01', 'M', -23.38, -53.29, 350.0, 1, 'planilha_p1.ods', 1)
                """,
                (self.lev_ativo_id, self.mat_ativa_id),
            )
            p_hom_1 = cur.lastrowid
            cur.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, arquivo_origem, origem_homologada)
                VALUES (?, ?, 'HOM-02', 'M', -23.39, -53.29, 351.0, 2, 'planilha_p1.ods', 1)
                """,
                (self.lev_ativo_id, self.mat_ativa_id),
            )
            p_hom_2 = cur.lastrowid
            cur.execute(
                """
                INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, origem_homologada)
                VALUES (?, ?, ?, ?, 1)
                """,
                (self.lev_ativo_id, self.mat_ativa_id, p_hom_1, p_hom_2),
            )
            seg_hom_id = cur.lastrowid
            conn.commit()

        res = self.client.delete(
            f"/levantamentos/{self.lev_ativo_id}/planilhas-homologadas",
            params={"planilha_origem": "planilha_p1.ods"},
        )
        self.assertEqual(res.status_code, 200)

        # Segmento homologado foi removido, segmento de campo foi preservado!
        self.assertIsNone(execute_query("SELECT id FROM segmentos WHERE id = ?", params=(seg_hom_id,), fetch_one=True))
        self.assertIsNotNone(execute_query("SELECT id FROM segmentos WHERE id = ?", params=(seg_campo_id,), fetch_one=True))

    def test_delete_confrontante_nao_apaga_pessoa_em_coproprietarios(self):
        with DatabaseManager() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO pessoas (nome) VALUES ('Pessoa Coproprietaria P1')")
            p_coprop = cur.lastrowid
            self.pessoas_extra.append(p_coprop)

            cur.execute("INSERT INTO pessoas (nome) VALUES ('Titular Outro Conf P1')")
            p_titular2 = cur.lastrowid
            self.pessoas_extra.append(p_titular2)

            cur.execute("INSERT INTO confrontantes (pessoa_id, levantamento_id, nome) VALUES (?, ?, 'Conf A')", (p_coprop, self.lev_ativo_id))
            conf_a = cur.lastrowid
            cur.execute("INSERT INTO confrontantes (pessoa_id, levantamento_id, nome) VALUES (?, ?, 'Conf B')", (p_titular2, self.lev_ativo_id))
            conf_b = cur.lastrowid

            cur.execute(
                "INSERT INTO confrontante_coproprietarios (confrontante_id, pessoa_id, nome) VALUES (?, ?, 'Pessoa Coproprietaria P1')",
                (conf_b, p_coprop),
            )
            conn.commit()

        res = self.client.delete(f"/confrontantes/{conf_a}")
        self.assertEqual(res.status_code, 200)

        # A pessoa ainda é coproprietária em conf_b, então NÃO pode ter sido apagada!
        pessoa = execute_query("SELECT id FROM pessoas WHERE id = ?", params=(p_coprop,), fetch_one=True)
        self.assertIsNotNone(pessoa)

    def test_excluir_cliente_nao_apaga_pessoa_em_usufruto_e_sem_profissional_hardcoded(self):
        # 1. Cadastra cliente sem profissional_id (não deve depender de profissional id=1)
        res_cli = cadastrar_cliente({"nome_completo": "Cliente Usufrutuario P1"})
        cli_id = res_cli["id"] if isinstance(res_cli, dict) else res_cli
        self.clientes_extra.append(cli_id)

        cli_row = execute_query("SELECT pessoa_id, profissional_id FROM clientes WHERE id = ?", params=(cli_id,), fetch_one=True)
        self.assertIsNone(cli_row["profissional_id"])
        pessoa_id = cli_row["pessoa_id"]
        self.pessoas_extra.append(pessoa_id)

        with DatabaseManager() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO pessoas (nome) VALUES ('Titular Usufruto P1')")
            p_tit = cur.lastrowid
            self.pessoas_extra.append(p_tit)
            cur.execute("INSERT INTO confrontantes (pessoa_id, levantamento_id, nome) VALUES (?, ?, 'Conf Usufruto')", (p_tit, self.lev_ativo_id))
            conf_id = cur.lastrowid
            cur.execute(
                "INSERT INTO confrontante_envolvidos_usufruto (confrontante_id, pessoa_id, papel, nome) VALUES (?, ?, 'USUFRUTUARIO', 'Cliente Usufrutuario P1')",
                (conf_id, pessoa_id),
            )
            conn.commit()

        excluir_cliente(cli_id)

        # Cliente removido, mas pessoa preservada por estar em confrontante_envolvidos_usufruto
        self.assertIsNone(execute_query("SELECT id FROM clientes WHERE id = ?", params=(cli_id,), fetch_one=True))
        self.assertIsNotNone(execute_query("SELECT id FROM pessoas WHERE id = ?", params=(pessoa_id,), fetch_one=True))

        # E apenas 1 lápide gravada pelo trigger (sem duplicação)
        lapides = execute_query(
            "SELECT COUNT(*) AS c FROM registros_excluidos WHERE tabela = 'clientes' AND registro_id = ?",
            params=(cli_id,),
            fetch_one=True,
        )["c"]
        self.assertEqual(lapides, 1)


if __name__ == "__main__":
    unittest.main()
