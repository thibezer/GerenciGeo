import unittest
import uuid
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager, execute_query

client = TestClient(app)

class TestIgnorarPoligono(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Engenheiro Poligono', 'CREA 9999', 'POL')")
            self.prof_id = cursor.lastrowid

            cpf_teste = f"88{uuid.uuid4().int % 1000000000:09d}"
            cursor.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES ('Proprietário Poligono', ?)", (cpf_teste,))
            self.pessoa_id = cursor.lastrowid

            cursor.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Poligono Teste', 'Goiânia', 'GO')")
            self.prop_id = cursor.lastrowid

            cursor.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '777', 100.0)", (self.prop_id,))
            self.matricula_id = cursor.lastrowid

            cursor.execute("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-01-01', 'EM_ANDAMENTO')", (self.prop_id, self.prof_id))
            self.lev_id = cursor.lastrowid

            # Cria 4 pontos formando um quadrado simples
            # V1: (-16.0, -49.0), V2: (-16.0, -48.9), V3: (-16.1, -48.9), V4: (-16.1, -49.0)
            coords = [
                ('V1', -16.0, -49.0, 1),
                ('V2', -16.0, -48.9, 2),
                ('V3', -16.1, -48.9, 3),
                ('V4', -16.1, -49.0, 4)
            ]
            self.ponto_ids = []
            for nome, lat, lon, ord_val in coords:
                cursor.execute(
                    """
                    INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, ignorar_poligono)
                    VALUES (?, ?, ?, 'M', ?, ?, 800.0, ?, 0)
                    """,
                    (self.lev_id, self.matricula_id, nome, lat, lon, ord_val)
                )
                self.ponto_ids.append(cursor.lastrowid)

            # Gera segmentos iniciais
            for i in range(4):
                p_ini = self.ponto_ids[i]
                p_fim = self.ponto_ids[(i + 1) % 4]
                cursor.execute(
                    """
                    INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, tipo_limite_sigef, metodo_posicionamento_sigef)
                    VALUES (?, ?, ?, ?, 'LA1', 'PG1')
                    """,
                    (self.lev_id, self.matricula_id, p_ini, p_fim)
                )

            conn.commit()

    def tearDown(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM segmentos WHERE levantamento_id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM pontos WHERE levantamento_id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM matriculas WHERE propriedade_id = ?", (self.prop_id,))
            cursor.execute("DELETE FROM levantamentos WHERE id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM propriedades WHERE id = ?", (self.prop_id,))
            cursor.execute("DELETE FROM pessoas WHERE id = ?", (self.pessoa_id,))
            cursor.execute("DELETE FROM profissionais WHERE id = ?", (self.prof_id,))
            conn.commit()

    def test_patch_ponto_ignorar_poligono_regenera_divisas(self):
        """Testa que tirar um ponto do polígono via PATCH individual regenera as divisas sem o ponto tirado"""
        ponto_remover_id = self.ponto_ids[3] # V4

        resp = client.patch(f"/pontos/{ponto_remover_id}", json={"ignorar_poligono": 1})
        self.assertEqual(resp.status_code, 200, resp.text)

        # 1. Verifica se ponto ficou marcado como ignorar_poligono = 1
        p_row = execute_query("SELECT ignorar_poligono FROM pontos WHERE id = ?", params=(ponto_remover_id,), fetch_one=True)
        self.assertEqual(p_row["ignorar_poligono"], 1)

        # 2. Verifica se as divisas agora só conectam os 3 pontos restantes (V1, V2, V3)
        segs = execute_query("SELECT ponto_inicio_id, ponto_fim_id FROM segmentos WHERE matricula_id = ?", params=(self.matricula_id,), fetch_all=True)
        self.assertEqual(len(segs), 3)

        # Garante que nenhum segmento se conecta ao ponto_remover_id
        for s in segs:
            self.assertNotEqual(s["ponto_inicio_id"], ponto_remover_id)
            self.assertNotEqual(s["ponto_fim_id"], ponto_remover_id)

    def test_batch_update_ignorar_poligono_regenera_divisas(self):
        """Testa que alternar a participação no polígono via endpoint Batch regenera as divisas corretamente"""
        ponto_remover_id = self.ponto_ids[2] # V3

        resp = client.put(
            f"/levantamentos/{self.lev_id}/pontos/batch",
            json={
                "pontos": [
                    {"id": ponto_remover_id, "ignorar_poligono": 1}
                ]
            }
        )
        self.assertEqual(resp.status_code, 200, resp.text)

        # Verifica se as divisas agora têm 3 segmentos sem o V3
        segs = execute_query("SELECT ponto_inicio_id, ponto_fim_id FROM segmentos WHERE matricula_id = ?", params=(self.matricula_id,), fetch_all=True)
        self.assertEqual(len(segs), 3)
        for s in segs:
            self.assertNotEqual(s["ponto_inicio_id"], ponto_remover_id)
            self.assertNotEqual(s["ponto_fim_id"], ponto_remover_id)

    def test_reincluir_ponto_no_poligono(self):
        """Testa que reincluir o ponto no polígono (ignorar_poligono=0) reconstrói as divisas incluindo o ponto"""
        ponto_id = self.ponto_ids[3]

        # Tira do polígono
        client.patch(f"/pontos/{ponto_id}", json={"ignorar_poligono": 1})
        segs_apos_tirar = execute_query("SELECT COUNT(*) as n FROM segmentos WHERE matricula_id = ?", params=(self.matricula_id,), fetch_one=True)
        self.assertEqual(segs_apos_tirar["n"], 3)

        # Recoloca no polígono
        resp = client.patch(f"/pontos/{ponto_id}", json={"ignorar_poligono": 0})
        self.assertEqual(resp.status_code, 200, resp.text)

        segs_apos_recolocar = execute_query("SELECT ponto_inicio_id, ponto_fim_id FROM segmentos WHERE matricula_id = ?", params=(self.matricula_id,), fetch_all=True)
        self.assertEqual(len(segs_apos_recolocar), 4)

        # Confirma que ponto_id está presente nos novos segmentos
        todos_pontos_nos_segs = set([s["ponto_inicio_id"] for s in segs_apos_recolocar] + [s["ponto_fim_id"] for s in segs_apos_recolocar])
        self.assertIn(ponto_id, todos_pontos_nos_segs)

if __name__ == '__main__':
    unittest.main()
