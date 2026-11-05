"""
tests/test_limpar_dados_levantamento.py
Testes unitários e de integração para a funcionalidade de limpar/zerar dados de um levantamento.
"""

import unittest
import uuid
from pathlib import Path
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager, execute_query
from services.gestores.workspace_manager import WorkspaceManager

client = TestClient(app)


class TestLimparDadosLevantamento(unittest.TestCase):

    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()

            # 1. Profissional e Pessoa
            cursor.execute(
                "INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Geodésico Teste', 'CREA 9999', 'XYZ')"
            )
            self.prof_id = cursor.lastrowid

            cpf_teste = f"88{uuid.uuid4().int % 1000000000:09d}"
            cursor.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES ('Cliente Limpeza', ?)", (cpf_teste,))
            self.pessoa_id = cursor.lastrowid

            # 2. Propriedade e Matrícula
            cursor.execute(
                "INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Teste Limpeza', 'Maracaju', 'MS')"
            )
            self.prop_id = cursor.lastrowid

            cursor.execute(
                "INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '12345', 100.0)",
                (self.prop_id,)
            )
            self.mat_id = cursor.lastrowid

            # 3. Levantamento
            cursor.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-05-10', 'EM_ANDAMENTO')",
                (self.prop_id, self.prof_id)
            )
            self.lev_id = cursor.lastrowid

            # 4. Inserir Base e Rover
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, e_corrigido, n_corrigido, alt_corrigido)
                VALUES (?, ?, 'M-01', 'M', 500000.0, 7000000.0, 450.0)
                """,
                (self.lev_id, self.mat_id)
            )
            self.base_id = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, e_corrigido, n_corrigido, alt_corrigido, ponto_base_id)
                VALUES (?, ?, 'P-01', 'P', 500100.0, 7000100.0, 452.0, ?)
                """,
                (self.lev_id, self.mat_id, self.base_id)
            )
            self.rover_id = cursor.lastrowid

            # 5. Confrontante e Coproprietário
            cursor.execute(
                "INSERT INTO confrontantes (levantamento_id, nome, cpf_cnpj) VALUES (?, 'Vizinho Norte', '11122233344')",
                (self.lev_id,)
            )
            self.conf_id = cursor.lastrowid

            cursor.execute(
                "INSERT INTO confrontante_coproprietarios (confrontante_id, nome) VALUES (?, 'Coproprietario Vizinho')",
                (self.conf_id,)
            )

            # 6. Segmento perimetral
            cursor.execute(
                """
                INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef)
                VALUES (?, ?, ?, ?, ?, 'LA1', 'PG1')
                """,
                (self.lev_id, self.mat_id, self.base_id, self.rover_id, self.conf_id)
            )

            # 7. Anuência
            cursor.execute(
                "INSERT INTO anuencias_confrontantes (levantamento_id, confrontante_id, status_anuencia) VALUES (?, ?, 'PENDENTE')",
                (self.lev_id, self.conf_id)
            )

            # 8. Banco Pontos e Alterações SIGEF
            cursor.execute(
                """
                INSERT INTO banco_pontos (profissional_id, levantamento_id, matricula_id, tipo_ponto, numero, codigo_completo, norte, este, altitude, planilha_origem)
                VALUES (?, ?, ?, 'M', 1, 'XYZ-M-0001', 7000000.0, 500000.0, 450.0, 'planilha_teste.ods')
                """,
                (self.prof_id, self.lev_id, self.mat_id)
            )

            cursor.execute(
                """
                INSERT INTO alteracoes_sigef (levantamento_id, planilha_origem, codigo_completo, campo, valor_original, valor_novo)
                VALUES (?, 'planilha_teste.ods', 'XYZ-M-0001', 'cns', '123', '456')
                """,
                (self.lev_id,)
            )

            conn.commit()

        # Cria workspace e arquivo de teste
        wm = WorkspaceManager()
        self.pasta = wm.create_workspace(self.lev_id)
        execute_query("UPDATE levantamentos SET pasta_projeto = ? WHERE id = ?", params=(self.pasta, self.lev_id), commit=True)
        dummy_file = Path(self.pasta) / "Brutos" / "teste_campo.txt"
        dummy_file.write_text("dados brutos de teste", encoding="utf-8")

    def test_limpar_dados_sucesso(self):
        """Verifica se todos os pontos, segmentos, confrontantes e dados do levantamento são apagados, mantendo o container."""
        res = client.post(f"/levantamentos/{self.lev_id}/limpar-dados")
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data.get("success"))

        # O levantamento em si ainda deve existir
        lev = execute_query("SELECT id, status FROM levantamentos WHERE id = ?", params=(self.lev_id,), fetch_one=True)
        self.assertIsNotNone(lev)
        self.assertEqual(lev["status"], "EM_ANDAMENTO")

        # Tabelas vinculadas devem estar vazias para este levantamento
        pts = execute_query("SELECT count(*) as total FROM pontos WHERE levantamento_id = ?", params=(self.lev_id,), fetch_one=True)
        self.assertEqual(pts["total"], 0)

        segs = execute_query("SELECT count(*) as total FROM segmentos WHERE levantamento_id = ?", params=(self.lev_id,), fetch_one=True)
        self.assertEqual(segs["total"], 0)

        confs = execute_query("SELECT count(*) as total FROM confrontantes WHERE levantamento_id = ?", params=(self.lev_id,), fetch_one=True)
        self.assertEqual(confs["total"], 0)

        coprops = execute_query(
            "SELECT count(*) as total FROM confrontante_coproprietarios WHERE confrontante_id = ?",
            params=(self.conf_id,),
            fetch_one=True
        )
        self.assertEqual(coprops["total"], 0)

        anuencias = execute_query("SELECT count(*) as total FROM anuencias_confrontantes WHERE levantamento_id = ?", params=(self.lev_id,), fetch_one=True)
        self.assertEqual(anuencias["total"], 0)

        bp = execute_query("SELECT count(*) as total FROM banco_pontos WHERE levantamento_id = ?", params=(self.lev_id,), fetch_one=True)
        self.assertEqual(bp["total"], 0)

        alt_sigef = execute_query("SELECT count(*) as total FROM alteracoes_sigef WHERE levantamento_id = ?", params=(self.lev_id,), fetch_one=True)
        self.assertEqual(alt_sigef["total"], 0)

        # O arquivo de teste em Brutos deve ter sido limpo
        dummy_file = Path(self.pasta) / "Brutos" / "teste_campo.txt"
        self.assertFalse(dummy_file.exists())

        # Subpastas padrão do workspace devem continuar existindo após recriação
        self.assertTrue((Path(self.pasta) / "Brutos").exists())
        self.assertTrue((Path(self.pasta) / "Processados").exists())

    def test_limpar_dados_bloqueado_se_arquivado(self):
        """Verifica se projetos em status ARQUIVADO respeitam a tranca read-only e retornam HTTP 403."""
        execute_query("UPDATE levantamentos SET status = 'ARQUIVADO' WHERE id = ?", params=(self.lev_id,), commit=True)

        res = client.post(f"/levantamentos/{self.lev_id}/limpar-dados")
        self.assertEqual(res.status_code, 403)

        # Os pontos não devem ter sido apagados
        pts = execute_query("SELECT count(*) as total FROM pontos WHERE levantamento_id = ?", params=(self.lev_id,), fetch_one=True)
        self.assertGreater(pts["total"], 0)

    def test_limpar_dados_levantamento_inexistente(self):
        """Verifica se retorna 404 para ID inexistente."""
        res = client.post("/levantamentos/9999999/limpar-dados")
        self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
