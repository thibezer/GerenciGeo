import unittest
import uuid
import tempfile
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager, execute_query

client = TestClient(app)


class TestSeparacaoMarcoBase(unittest.TestCase):
    """'M' é marco de divisa (vértice do perímetro); base de campo é 'B'."""

    def setUp(self):
        self.pasta = tempfile.TemporaryDirectory()
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Eng Marco Base', 'CREA 7711', 'MBT')")
            self.prof_id = cursor.lastrowid
            cpf_teste = f"77{uuid.uuid4().int % 1000000000:09d}"
            cursor.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES ('Proprietário Marco', ?)", (cpf_teste,))
            self.pessoa_id = cursor.lastrowid
            cursor.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Marco Base', 'Umuarama', 'PR')")
            self.prop_id = cursor.lastrowid
            cursor.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status, pasta_projeto) VALUES (?, ?, '2026-10-01', 'EM_ANDAMENTO', ?)",
                (self.prop_id, self.prof_id, self.pasta.name)
            )
            self.lev_id = cursor.lastrowid
            conn.commit()

    def tearDown(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM pontos WHERE levantamento_id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM historico_alteracoes_campo WHERE levantamento_id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM levantamentos WHERE id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM propriedades WHERE id = ?", (self.prop_id,))
            cursor.execute("DELETE FROM pessoas WHERE id = ?", (self.pessoa_id,))
            cursor.execute("DELETE FROM profissionais WHERE id = ?", (self.prof_id,))
            conn.commit()
        self.pasta.cleanup()

    def _inserir_ponto(self, nome, tipo, e, n, ponto_base_id=None, arquivo_origem=None, status="BRUTO"):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO pontos (
                    levantamento_id, nome_vertice, tipo_ponto, lat, lon, alt,
                    n_original, e_original, alt_original, status_ponto, ponto_base_id, arquivo_origem
                ) VALUES (?, ?, ?, -23.58, -53.47, 300.0, ?, ?, 300.0, ?, ?, ?)
                """,
                (self.lev_id, nome, tipo, n, e, status, ponto_base_id, arquivo_origem)
            )
            conn.commit()
            return cursor.lastrowid

    def test_marco_com_arquivo_origem_nao_corrige_lote_como_base(self):
        marco_id = self._inserir_ponto("XYZ-M-0001", "M", 247334.801, 7389419.008, arquivo_origem="lote_rtk.txt")
        rover_id = self._inserir_ponto("XYZ-P-0001", "P", 247340.0, 7389420.0, arquivo_origem="lote_rtk.txt")

        resp = client.patch(f"/pontos/{marco_id}", json={
            "n_corrigido": 7389419.500, "e_corrigido": 247335.300, "alt_corrigido": 301.0
        })
        self.assertEqual(resp.status_code, 200, resp.text)

        rover = execute_query("SELECT status_ponto, ponto_base_id FROM pontos WHERE id = ?", params=(rover_id,), fetch_one=True)
        self.assertEqual(rover["status_ponto"], "BRUTO", "Corrigir um marco não pode transladar o lote inteiro")
        self.assertIsNone(rover["ponto_base_id"])
        marco = execute_query("SELECT tipo_ponto FROM pontos WHERE id = ?", params=(marco_id,), fetch_one=True)
        self.assertEqual(marco["tipo_ponto"], "M")

    def test_mudar_para_marco_preserva_vinculo_com_base(self):
        base_id = self._inserir_ponto("B051509", "B", 247810.762, 7389903.616, status="CORRIGIDO")
        ponto_id = self._inserir_ponto("XYZ-P-0002", "P", 247800.0, 7389900.0, ponto_base_id=base_id)

        resp = client.patch(f"/pontos/{ponto_id}", json={"tipo_ponto": "M"})
        self.assertEqual(resp.status_code, 200, resp.text)

        ponto = execute_query("SELECT tipo_ponto, ponto_base_id FROM pontos WHERE id = ?", params=(ponto_id,), fetch_one=True)
        self.assertEqual(ponto["tipo_ponto"], "M")
        self.assertEqual(ponto["ponto_base_id"], base_id, "Marco é medido a partir da base: o vínculo deve ser mantido")

    def test_mudar_para_base_limpa_vinculo_proprio(self):
        base_id = self._inserir_ponto("B051509", "B", 247810.762, 7389903.616, status="CORRIGIDO")
        ponto_id = self._inserir_ponto("mbase", "M", 247800.0, 7389900.0, ponto_base_id=base_id)

        resp = client.patch(f"/pontos/{ponto_id}", json={"tipo_ponto": "B"})
        self.assertEqual(resp.status_code, 200, resp.text)

        ponto = execute_query("SELECT tipo_ponto, ponto_base_id, lat, lon FROM pontos WHERE id = ?", params=(ponto_id,), fetch_one=True)
        self.assertEqual(ponto["tipo_ponto"], "B")
        self.assertIsNone(ponto["ponto_base_id"])
        self.assertAlmostEqual(ponto["lat"], -23.58, places=6, msg="Trocar só o tipo não pode alterar coordenadas")
        self.assertAlmostEqual(ponto["lon"], -53.47, places=6)

    def _criar_matricula_com_quadrado(self):
        """Matrícula com 4 vértices P em quadrado e divisas geradas; retorna (mat_id, [ids])."""
        from services.processamento.geoprocessamento import reordenar_perimetro_matricula
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '9901', 10.0)", (self.prop_id,))
            mat_id = cursor.lastrowid
            ids = []
            for i, (lat, lon) in enumerate([(-23.580, -53.470), (-23.580, -53.469), (-23.581, -53.469), (-23.581, -53.470)], start=1):
                cursor.execute(
                    "INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, camada_ciclo_vida) "
                    "VALUES (?, ?, ?, 'P', ?, ?, 300.0, ?, 'PERIMETRO')",
                    (self.lev_id, mat_id, f"XYZ-P-01{i}", lat, lon, i)
                )
                ids.append(cursor.lastrowid)
            conn.commit()
        self.assertTrue(reordenar_perimetro_matricula(self.lev_id, mat_id)["sucesso"])
        return mat_id, ids

    def _pontos_nas_divisas(self, mat_id):
        rows = execute_query("SELECT ponto_inicio_id, ponto_fim_id FROM segmentos WHERE matricula_id = ?", params=(mat_id,), fetch_all=True)
        return {r["ponto_inicio_id"] for r in rows} | {r["ponto_fim_id"] for r in rows}

    def _limpar_matricula(self, mat_id):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM segmentos WHERE matricula_id = ?", (mat_id,))
            cursor.execute("DELETE FROM pontos WHERE matricula_id = ?", (mat_id,))
            cursor.execute("DELETE FROM matriculas WHERE id = ?", (mat_id,))
            conn.commit()

    def test_virar_base_tira_o_ponto_das_divisas(self):
        mat_id, ids = self._criar_matricula_com_quadrado()
        self.addCleanup(self._limpar_matricula, mat_id)
        self.assertIn(ids[0], self._pontos_nas_divisas(mat_id))

        resp = client.patch(f"/pontos/{ids[0]}", json={"tipo_ponto": "B"})
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertNotIn(ids[0], self._pontos_nas_divisas(mat_id), "Base não pode continuar compondo divisa")

        resp = client.patch(f"/pontos/{ids[0]}", json={"tipo_ponto": "P"})
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertIn(ids[0], self._pontos_nas_divisas(mat_id), "Voltar a ser vértice deve recolocá-lo nas divisas")

    def test_lote_virar_base_limpa_vinculo_camada_e_divisas(self):
        mat_id, ids = self._criar_matricula_com_quadrado()
        self.addCleanup(self._limpar_matricula, mat_id)
        base_id = self._inserir_ponto("B051509", "B", 247810.762, 7389903.616, status="CORRIGIDO")
        execute_query("UPDATE pontos SET ponto_base_id = ? WHERE id = ?", params=(base_id, ids[1]), commit=True)

        resp = client.put(f"/levantamentos/{self.lev_id}/pontos/batch", json={"pontos": [{"id": ids[1], "tipo_ponto": "B"}]})
        self.assertEqual(resp.status_code, 200, resp.text)

        pt = execute_query("SELECT tipo_ponto, ponto_base_id, camada_ciclo_vida FROM pontos WHERE id = ?", params=(ids[1],), fetch_one=True)
        self.assertEqual(pt["tipo_ponto"], "B")
        self.assertIsNone(pt["ponto_base_id"])
        self.assertEqual(pt["camada_ciclo_vida"], "CAMPO")
        self.assertNotIn(ids[1], self._pontos_nas_divisas(mat_id))

    def test_lote_mover_para_matricula_atualiza_camada_e_respeita_tipo_real(self):
        mat_id, _ids = self._criar_matricula_com_quadrado()
        self.addCleanup(self._limpar_matricula, mat_id)
        # Mesmo nome de um vértice P da matrícula, mas tipo V: não é conflito de unicidade
        avulso_id = self._inserir_ponto("XYZ-P-011", "V", 247000.0, 7389000.0)
        execute_query("UPDATE pontos SET lat = -23.5805, lon = -53.4695, camada_ciclo_vida = 'CAMPO' WHERE id = ?", params=(avulso_id,), commit=True)

        resp = client.put(f"/levantamentos/{self.lev_id}/pontos/batch", json={"pontos": [{"id": avulso_id, "matricula_id": mat_id}]})
        self.assertEqual(resp.status_code, 200, resp.text)
        pt = execute_query("SELECT matricula_id, camada_ciclo_vida FROM pontos WHERE id = ?", params=(avulso_id,), fetch_one=True)
        self.assertEqual(pt["matricula_id"], mat_id)
        self.assertEqual(pt["camada_ciclo_vida"], "PERIMETRO")

    def test_sugestao_de_codigo_nao_repete_codigo_ja_dado(self):
        self._inserir_ponto("MBT-P-0007", "P", 247000.0, 7389000.0)
        self._inserir_ponto("MBT-M-0002", "M", 247001.0, 7389001.0)
        alvo = self._inserir_ponto("pt_sem_codigo", "P", 247002.0, 7389002.0)

        sug = client.get(f"/levantamentos/{self.lev_id}/pontos-sugeridos").json()["sugestoes"]
        self.assertEqual(sug["P"]["codigo_sugerido"], "MBT-P-0008")
        self.assertEqual(sug["M"]["codigo_sugerido"], "MBT-M-0003")

        resp = client.patch(f"/pontos/{alvo}", json={"codigo_sigef": "MBT-P-0008"})
        self.assertEqual(resp.status_code, 200, resp.text)
        sug = client.get(f"/levantamentos/{self.lev_id}/pontos-sugeridos").json()["sugestoes"]
        self.assertEqual(sug["P"]["codigo_sugerido"], "MBT-P-0009", "Código dado pelo painel tem de contar como usado")

    def test_triagem_sinaliza_marco_usado_como_base(self):
        from services.processamento.triagem_inteligente import gerar_alertas_integridade

        base_legada = self._inserir_ponto("mcbase", "M", 247810.762, 7389903.616, status="CORRIGIDO")
        self._inserir_ponto("XYZ-P-0003", "P", 247800.0, 7389900.0, ponto_base_id=base_legada)
        self._inserir_ponto("XYZ-M-0009", "M", 247700.0, 7389800.0)

        alertas = [
            a for a in gerar_alertas_integridade()
            if "Gravada(s) como Marco" in a["titulo"] and a["acao"]["levantamento_id"] == self.lev_id
        ]
        self.assertEqual(len(alertas), 1)
        self.assertTrue(alertas[0]["titulo"].startswith("1 "), "Só o marco usado como base deve ser sinalizado")


if __name__ == "__main__":
    unittest.main()
