import unittest
import uuid
import math
from database.connection import execute_query, DatabaseManager
from services.gestores.levantamento_manager import atualizar_ponto_geodesico
from services.parsers.txt_parser import TxtGeodesicParser

class TestPropagacaoBaseBloco(unittest.TestCase):

    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Engenheiro Teste', 'CREA 1234', 'ABC')")
            self.prof_id = cursor.lastrowid

            cursor.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Teste Prop', 'Maringá', 'PR')")
            self.prop_id = cursor.lastrowid

            cursor.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '99999', 50.0)", (self.prop_id,))
            self.mat_id = cursor.lastrowid

            cursor.execute("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-01-01', 'EM_ANDAMENTO')", (self.prop_id, self.prof_id))
            self.lev_id = cursor.lastrowid
            conn.commit()

    def test_propagacao_base_tipo_b_para_rovers_mesmo_arquivo(self):
        # 1. Insere base 'B0101' tipo B e 2 rovers sem vínculo explícito de ponto_base_id mas com mesmo arquivo_origem
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            # Base UTM original
            cursor.execute("""
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, e_original, n_original, alt_original, lat, lon, alt, status_ponto, arquivo_origem)
                VALUES (?, ?, 'B0101', 'B', 244238.2521, 7351557.4404, 324.9632, -23.927204, -53.512635, 324.9632, 'CORRIGIDO', 'teste_caderneta.txt')
            """, (self.lev_id, self.mat_id))
            base_id = cursor.lastrowid

            # Rover 1
            cursor.execute("""
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, e_original, n_original, alt_original, lat, lon, alt, status_ponto, arquivo_origem)
                VALUES (?, ?, 'pt0', 'P', 244156.0117, 7351537.0072, 331.9784, -23.927375, -53.513446, 331.9784, 'BRUTO', 'teste_caderneta.txt')
            """, (self.lev_id, self.mat_id))
            rov1_id = cursor.lastrowid

            # Rover 2
            cursor.execute("""
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, e_original, n_original, alt_original, lat, lon, alt, status_ponto, arquivo_origem)
                VALUES (?, ?, 'estrada1', 'P', 244152.8015, 7351532.3877, 331.8424, -23.927417, -53.513478, 331.8424, 'BRUTO', 'teste_caderneta.txt')
            """, (self.lev_id, self.mat_id))
            rov2_id = cursor.lastrowid
            conn.commit()

        # 2. Atualiza coordenadas UTM da base via atualizar_ponto_geodesico (simulando edição no painel)
        # Delta: N + 0.6236m, E + 0.1769m
        res = atualizar_ponto_geodesico(base_id, {
            "n_corrigido": 7351558.064,
            "e_corrigido": 244238.429,
            "status_ponto": "CORRIGIDO"
        })
        self.assertTrue(res.get("success"), f"Falha ao atualizar ponto base: {res}")

        # 3. Verifica se a base teve lat/lon recalculados e deltas gravados
        base_atualizada = execute_query("SELECT * FROM pontos WHERE id = ?", params=(base_id,), fetch_one=True)
        self.assertAlmostEqual(base_atualizada["delta_n"], 623.6, places=1)
        self.assertAlmostEqual(base_atualizada["delta_e"], 176.9, places=1)

        # 4. Verifica se os rovers foram vinculados e tiveram suas coordenadas transladadas
        rov1 = execute_query("SELECT * FROM pontos WHERE id = ?", params=(rov1_id,), fetch_one=True)
        self.assertEqual(rov1["ponto_base_id"], base_id, "Rover 1 deveria ter sido vinculado à base")
        self.assertEqual(rov1["status_ponto"], "CORRIGIDO")
        self.assertIsNotNone(rov1["n_corrigido"])
        self.assertIsNotNone(rov1["e_corrigido"])
        self.assertAlmostEqual(rov1["delta_n"], 623.6, delta=5.0)
        self.assertAlmostEqual(rov1["delta_e"], 176.9, delta=5.0)

        rov2 = execute_query("SELECT * FROM pontos WHERE id = ?", params=(rov2_id,), fetch_one=True)
        self.assertEqual(rov2["ponto_base_id"], base_id, "Rover 2 deveria ter sido vinculado à base")
        self.assertEqual(rov2["status_ponto"], "CORRIGIDO")
        self.assertAlmostEqual(rov2["delta_n"], 623.6, delta=5.0)
        self.assertAlmostEqual(rov2["delta_e"], 176.9, delta=5.0)

    def test_parser_vincula_base_interna_automaticamente(self):
        # Caderneta com 1 base e 2 rovers
        linhas = [
            "B099999,7351557.4404,244238.2521,324.9632,0.0,0.0,0.0\n",
            "ptA,7351537.0072,244156.0117,331.9784,0.005,0.005,0.011\n",
            "ptB,7351532.3877,244152.8015,331.8424,0.004,0.004,0.010\n"
        ]
        parser = TxtGeodesicParser(self.lev_id, matricula_id=self.mat_id)
        # Importa via método ler_arquivo + persistir_no_banco
        import tempfile, os
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as tf:
            tf.writelines(linhas)
            tmp_path = tf.name

        try:
            pts = parser.processar_arquivo(tmp_path)
            ids = parser.persistir_no_banco(pts)
            self.assertEqual(len(ids), 3)

            base_pt = execute_query("SELECT * FROM pontos WHERE id = ?", params=(ids[0],), fetch_one=True)
            self.assertEqual(base_pt["tipo_ponto"], "B")

            for rover_id in ids[1:]:
                r_pt = execute_query("SELECT * FROM pontos WHERE id = ?", params=(rover_id,), fetch_one=True)
                self.assertEqual(r_pt["ponto_base_id"], ids[0], f"Rover {r_pt['nome_vertice']} deveria apontar para base interna {ids[0]}")
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

if __name__ == '__main__':
    unittest.main()
