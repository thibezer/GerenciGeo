import unittest
import json
from database.connection import DatabaseManager, execute_query
from routes.levantamento.pontos import sincronizar_cad_clipboard, PayloadSincronizarCAD

class TestSincronizacaoCAD(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            # Garante a criação de um levantamento de teste e matrícula de teste
            cursor.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Engenheiro Teste', 'CREA 123', 'CRED99')")
            self.prof_id = cursor.lastrowid

            cursor.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Teste CAD', 'Palotina', 'PR')")
            self.prop_id = cursor.lastrowid
            
            cursor.execute("INSERT INTO levantamentos (propriedade_id, profissional_id, status, data_inicio) VALUES (?, ?, 'EM_ANDAMENTO', '2026-08-07')", (self.prop_id, self.prof_id))
            self.lev_id = cursor.lastrowid
            
            cursor.execute("INSERT INTO matriculas (propriedade_id, numero_matricula) VALUES (?, 'MATR-999')", (self.prop_id,))
            self.mat_id = cursor.lastrowid
            
            # Ponto existente
            cursor.execute(
                """
                INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, status_ponto, ordem_caminhamento)
                VALUES (?, ?, 'V-01', 'P', -24.0, -54.0, 200.0, 'BRUTO', 1)
                """,
                (self.lev_id, self.mat_id)
            )
            self.ponto_id = cursor.lastrowid
            conn.commit()

    def tearDown(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM pontos WHERE levantamento_id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM matriculas WHERE id = ?", (self.mat_id,))
            cursor.execute("DELETE FROM levantamentos WHERE id = ?", (self.lev_id,))
            cursor.execute("DELETE FROM propriedades WHERE id = ?", (self.prop_id,))
            cursor.execute("DELETE FROM profissionais WHERE id = ?", (self.prof_id,))
            conn.commit()

    def test_sincronizacao_upsert_existente_e_novo(self):
        # Payload com V-01 (existente, atualiza) e V-02 (novo vértice virtual)
        payload_str = (
            "ACAO=NOVO;BLOCO=BL-MEMOVEV3;X=601550.0000;Y=7345000.0000;Z=250.0000;ATRIB(ID:V-01,TIPO:V,SIGMA:0.010,METPOS:LA1,TIPLIM:AL1,CNS:123,MATR:999,CONFRO:Joao da Silva)\n"
            "ACAO=NOVO;BLOCO=BL-MEMOVEV3;X=601600.0000;Y=7345100.0000;Z=255.0000;ATRIB(ID:V-02,TIPO:V,SIGMA:0.000,METPOS:LA2,TIPLIM:AL2,CNS:123,MATR:999,CONFRO:Pedro Santos)"
        )
        
        payload = PayloadSincronizarCAD(payload_cad=payload_str, matricula_id=self.mat_id)
        res = sincronizar_cad_clipboard(self.lev_id, payload)
        
        self.assertTrue(res.get("sucesso"))
        self.assertEqual(res.get("atualizados"), 1)
        self.assertEqual(res.get("inseridos"), 1)

        # Verifica se V-01 foi atualizado para CORRIGIDO e tipo V
        p1 = execute_query("SELECT * FROM pontos WHERE levantamento_id = ? AND nome_vertice = 'V-01'", params=(self.lev_id,), fetch_one=True)
        self.assertIsNotNone(p1)
        self.assertEqual(p1["tipo_ponto"], "V")
        self.assertEqual(p1["status_ponto"], "CORRIGIDO")
        self.assertEqual(p1["alt"], 250.0)

        # Verifica se V-02 foi inserido
        p2 = execute_query("SELECT * FROM pontos WHERE levantamento_id = ? AND nome_vertice = 'V-02'", params=(self.lev_id,), fetch_one=True)
        self.assertIsNotNone(p2)
        self.assertEqual(p2["tipo_ponto"], "V")
        self.assertEqual(p2["status_ponto"], "CORRIGIDO")

if __name__ == '__main__':
    unittest.main()
