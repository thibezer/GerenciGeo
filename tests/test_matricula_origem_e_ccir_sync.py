"""
Regressão: integridade do vínculo de desenho compartilhado entre matrículas e
sincronização da pasta Banco_CCIR (fuso horário e reimportação atômica).
"""
import os
import time
import unittest
from fastapi.testclient import TestClient
from api import app
from config import EXPORT_BASE_FOLDER
from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from services.parsers.ccir_parser import sincronizar_pasta_ccir


def _uma(sql, params=()):
    row = execute_query(sql, params=params, fetch_one=True)
    return dict(row) if row else None


class TestMatriculaOrigemDesenho(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)

    def setUp(self):
        self.client = TestClient(app)
        self.props = []

    def tearDown(self):
        for pid in self.props:
            execute_query("DELETE FROM propriedades WHERE id = ?", params=(pid,), commit=True)

    def _prop(self):
        res = self.client.post("/propriedades", json={"nome_propriedade": "Fazenda Desenho", "municipio": "Umuarama", "uf": "PR"})
        self.props.append(res.json()["id"])
        return self.props[-1]

    def _mat(self, pid, numero, **extra):
        res = self.client.post(f"/propriedades/{pid}/matriculas", json={"numero_matricula": numero, "area_ha": 1, "denominacao": "G", **extra})
        return res, _uma("SELECT * FROM matriculas WHERE propriedade_id = ? AND numero_matricula = ?", (pid, numero))

    def _vincular(self, mid, origem_id):
        return self.client.post(f"/matriculas/{mid}/vincular-desenho", json={"matricula_origem_desenho_id": origem_id})

    def test_excluir_matricula_origem_e_bloqueado(self):
        pid = self._prop()
        _, a = self._mat(pid, "A")
        _, b = self._mat(pid, "B")
        self.assertEqual(self._vincular(b["id"], a["id"]).status_code, 200)

        res = self.client.delete(f"/matriculas/{a['id']}")
        self.assertEqual(res.status_code, 409)
        self.assertIn("B", res.json()["detail"])
        self.assertIsNotNone(_uma("SELECT id FROM matriculas WHERE id = ?", (a["id"],)))

        # Após desvincular, a exclusão é permitida
        self.assertEqual(self._vincular(b["id"], None).status_code, 200)
        self.assertEqual(self.client.delete(f"/matriculas/{a['id']}").status_code, 200)

    def test_excluir_matricula_derivada_e_permitido(self):
        pid = self._prop()
        _, a = self._mat(pid, "A")
        _, b = self._mat(pid, "B")
        self._vincular(b["id"], a["id"])
        self.assertEqual(self.client.delete(f"/matriculas/{b['id']}").status_code, 200)

    def test_vinculo_com_matricula_de_outra_propriedade_e_rejeitado(self):
        _, a = self._mat(self._prop(), "A")
        pid2 = self._prop()
        _, b = self._mat(pid2, "B")
        self.assertEqual(self._vincular(b["id"], a["id"]).status_code, 400)
        res, _ = self._mat(pid2, "C", matricula_origem_desenho_id=a["id"])
        self.assertEqual(res.status_code, 400)
        self.assertIsNone(_uma("SELECT id FROM matriculas WHERE propriedade_id = ? AND numero_matricula = 'C'", (pid2,)))

    def test_vinculo_encadeado_e_rejeitado(self):
        pid = self._prop()
        _, a = self._mat(pid, "A")
        _, b = self._mat(pid, "B")
        _, c = self._mat(pid, "C")
        self._vincular(b["id"], a["id"])
        # C -> B, sendo B derivada de A
        res = self._vincular(c["id"], b["id"])
        self.assertEqual(res.status_code, 400)
        self.assertIn("principal", res.json()["detail"])
        # A (origem de B) não pode passar a derivar de C; o mesmo vale pelo PUT
        self.assertEqual(self._vincular(a["id"], c["id"]).status_code, 400)
        self.assertEqual(self.client.put(f"/matriculas/{a['id']}", json={"numero_matricula": "A", "matricula_origem_desenho_id": c["id"]}).status_code, 400)
        self.assertIsNone(_uma("SELECT matricula_origem_desenho_id FROM matriculas WHERE id = ?", (a["id"],))["matricula_origem_desenho_id"])

    def test_vinculo_com_matricula_inexistente(self):
        pid = self._prop()
        _, a = self._mat(pid, "A")
        self.assertEqual(self._vincular(a["id"], 99999999).status_code, 400)
        self.assertEqual(self._vincular(99999999, a["id"]).status_code, 404)
        self.assertEqual(self._vincular(a["id"], "abc").status_code, 400)

    def test_migracao_limpa_vinculos_orfaos(self):
        pid = self._prop()
        _, a = self._mat(pid, "A")
        _, b = self._mat(pid, "B")
        execute_query("UPDATE matriculas SET matricula_origem_desenho_id = 99999999 WHERE id = ?", params=(a["id"],), commit=True)
        execute_query("UPDATE matriculas SET matricula_origem_desenho_id = id WHERE id = ?", params=(b["id"],), commit=True)
        with DatabaseManager() as conn:
            create_tables(conn)
        self.assertIsNone(_uma("SELECT matricula_origem_desenho_id FROM matriculas WHERE id = ?", (a["id"],))["matricula_origem_desenho_id"])
        self.assertIsNone(_uma("SELECT matricula_origem_desenho_id FROM matriculas WHERE id = ?", (b["id"],))["matricula_origem_desenho_id"])


class TestSincronizacaoCcir(unittest.TestCase):
    ARQUIVO = "teste_regressao_sync_ccir.csv"
    CABECALHO = "CÓDIGO DO IMÓVEL;DENOMINAÇÃO DO IMÓVEL;MUNICÍPIO;UF;ÁREA TOTAL;TITULAR;PERCENTUAL DE DETENÇÃO\n"

    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)

    def setUp(self):
        self.pasta = os.path.join(EXPORT_BASE_FOLDER, "Banco_CCIR")
        os.makedirs(self.pasta, exist_ok=True)
        self.caminho = os.path.join(self.pasta, self.ARQUIVO)
        execute_query("DELETE FROM ccir_cadastros WHERE arquivo_origem = ?", params=(self.ARQUIVO,), commit=True)

    def tearDown(self):
        if os.path.exists(self.caminho):
            os.remove(self.caminho)
        execute_query("DELETE FROM ccir_cadastros WHERE arquivo_origem = ?", params=(self.ARQUIVO,), commit=True)

    def _escrever(self, conteudo):
        with open(self.caminho, "w", encoding="utf-8") as f:
            f.write(conteudo)
        # Modificação logo após a importação anterior (dentro da janela do fuso horário)
        agora = time.time() + 5
        os.utime(self.caminho, (agora, agora))

    def _titulares(self):
        rows = execute_query("SELECT titular FROM ccir_cadastros WHERE arquivo_origem = ? ORDER BY titular", params=(self.ARQUIVO,), fetch_all=True)
        return [r["titular"] for r in rows]

    def test_planilha_alterada_logo_apos_importacao_e_reimportada(self):
        self._escrever(self.CABECALHO + "9511;FAZ A;UMUARAMA;PR;10,5;JOAO;100\n")
        sincronizar_pasta_ccir()
        self.assertEqual(self._titulares(), ["JOAO"])

        self._escrever(self.CABECALHO + "9511;FAZ A;UMUARAMA;PR;10,5;JOAO;50\n9511;FAZ A;UMUARAMA;PR;10,5;MARIA;50\n")
        logs = sincronizar_pasta_ccir()
        self.assertEqual(self._titulares(), ["JOAO", "MARIA"], logs)

    def test_planilha_invalida_mantem_dados_anteriores(self):
        self._escrever(self.CABECALHO + "9511;FAZ A;UMUARAMA;PR;10,5;JOAO;100\n")
        sincronizar_pasta_ccir()

        # Sem a coluna obrigatória TITULAR: a leitura falha
        self._escrever("CÓDIGO DO IMÓVEL;MUNICÍPIO\n9511;UMUARAMA\n")
        logs = sincronizar_pasta_ccir()
        self.assertEqual(self._titulares(), ["JOAO"])
        self.assertTrue(any("mantidos" in l for l in logs), logs)

    def test_planilha_sem_registros_mantem_dados_anteriores(self):
        self._escrever(self.CABECALHO + "9511;FAZ A;UMUARAMA;PR;10,5;JOAO;100\n")
        sincronizar_pasta_ccir()
        self._escrever(self.CABECALHO)
        sincronizar_pasta_ccir()
        self.assertEqual(self._titulares(), ["JOAO"])

    def test_planilha_removida_da_pasta_sai_do_banco(self):
        self._escrever(self.CABECALHO + "9511;FAZ A;UMUARAMA;PR;10,5;JOAO;100\n")
        sincronizar_pasta_ccir()
        os.remove(self.caminho)
        sincronizar_pasta_ccir()
        self.assertEqual(self._titulares(), [])


if __name__ == "__main__":
    unittest.main()
