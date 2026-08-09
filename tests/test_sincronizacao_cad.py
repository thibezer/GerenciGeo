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

    def test_sincronizacao_payload_real_com_confrontantes_e_blocos(self):
        payload_real = (
            "ACAO=NOVO;BLOCO=BL-MEMOVEV3;X=246577.0858;Y=7402037.2450;Z=0.0000;ATRIB(ID:XRXR-V-0112,TIPO:V,SIGMA:0.03,METPOS:PA2,TIPLIM:,CNS:,MATR:,CONFRO:0.020)\n"
            "ACAO=NOVO;BLOCO=BL-MEMOVEV3;X=245609.1499;Y=7401984.1704;Z=0.0000;ATRIB(ID:XRXR-V-0134,TIPO:V,SIGMA:0.01,METPOS:PA2,TIPLIM:LN1,CNS:08.726-2,MATR:1101,CONFRO:Lote rural n°74-A)\n"
            "ACAO=NOVO;BLOCO=BL-MEMOVEM3;X=245842.8530;Y=7402047.0490;Z=0.0000;ATRIB(ID:CQI-M-3754,TIPO:V,SIGMA:0.000,METPOS:PG2,TIPLIM:LN1,CNS:\t08.726-2,MATR:12840,CONFRO:Unificação dos lotes nº. 76 e 77, 78/A, 78/B e 78/C, estes da subdivisão do lote nº. 78, todos da Gleba nº. 11, do Núcleo Serra)\n"
            "ACAO=NOVO;BLOCO=BL-MEMOVEP3;X=245696.0206;Y=7402000.6630;Z=0.0000;ATRIB(ID:XRXR-P-0181,TIPO:V,SIGMA:0.02402580,METPOS:PA1,TIPLIM:LN1,CNS:08.726-2,MATR:1101,CONFRO:Lote rural n°74-A)"
        )

        payload = PayloadSincronizarCAD(payload_cad=payload_real, matricula_id=self.mat_id)
        res = sincronizar_cad_clipboard(self.lev_id, payload)

        self.assertTrue(res.get("sucesso"))
        self.assertEqual(res.get("inseridos"), 4)

        # CQI-M-3754 deve ser inferido como 'M' pelo bloco BL-MEMOVEM3 / ID
        p_m = execute_query("SELECT * FROM pontos WHERE levantamento_id = ? AND nome_vertice = 'CQI-M-3754'", params=(self.lev_id,), fetch_one=True)
        self.assertIsNotNone(p_m)
        self.assertEqual(p_m["tipo_ponto"], "M")
        self.assertEqual(p_m["metodo_posicionamento"], "PG2")

        # XRXR-P-0181 deve ser inferido como 'P'
        p_p = execute_query("SELECT * FROM pontos WHERE levantamento_id = ? AND nome_vertice = 'XRXR-P-0181'", params=(self.lev_id,), fetch_one=True)
        self.assertIsNotNone(p_p)
        self.assertEqual(p_p["tipo_ponto"], "P")
        self.assertAlmostEqual(p_p["sigma_lat"], 0.02402580, places=6)

        # XRXR-V-0112 deve ser 'V'
        p_v = execute_query("SELECT * FROM pontos WHERE levantamento_id = ? AND nome_vertice = 'XRXR-V-0112'", params=(self.lev_id,), fetch_one=True)
        self.assertIsNotNone(p_v)
        self.assertEqual(p_v["tipo_ponto"], "V")
        self.assertEqual(p_v["metodo_posicionamento"], "PA2")

    def test_sincronizacao_com_polilinha_e_pontos_suporte_e_confrontantes(self):
        # Cria matrícula específica para o teste
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO matriculas (propriedade_id, numero_matricula) VALUES (?, 'MATR-POLY-1')", (self.prop_id,))
            mat_poly_id = cursor.lastrowid
            conn.commit()

        # 3 pontos no perímetro (POLIGONO=1 com ORDEM 1, 2, 3) e 1 ponto de suporte fora (POLIGONO=0)
        payload_polilinha = (
            "ACAO=NOVO;BLOCO=BL-MEMOVEM3;X=245000.0000;Y=7400000.0000;Z=100.0000;POLIGONO=1;ORDEM=1;ATRIB(ID:P1,TIPO:M,SIGMA:0.010,METPOS:PG1,TIPLIM:LN1,CNS:08.123-4,MATR:5555,CONFRO:Fazenda Vizinha Norte)\n"
            "ACAO=NOVO;BLOCO=BL-MEMOVEP3;X=245500.0000;Y=7400000.0000;Z=100.0000;POLIGONO=1;ORDEM=2;ATRIB(ID:P2,TIPO:P,SIGMA:0.010,METPOS:PA1,TIPLIM:LA3,CNS:,MATR:,CONFRO:Estrada Municipal)\n"
            "ACAO=NOVO;BLOCO=BL-MEMOVEV3;X=245500.0000;Y=7399500.0000;Z=100.0000;POLIGONO=1;ORDEM=3;ATRIB(ID:P3,TIPO:V,SIGMA:0.010,METPOS:PA2,TIPLIM:LN1,CNS:08.123-4,MATR:5555,CONFRO:Fazenda Vizinha Norte)\n"
            "ACAO=NOVO;BLOCO=BL-MEMOVEP3;X=245200.0000;Y=7399800.0000;Z=100.0000;POLIGONO=0;ORDEM=0;ATRIB(ID:SUP-01,TIPO:P,SIGMA:0.020,METPOS:PG1,TIPLIM:,CNS:,MATR:,CONFRO:)"
        )

        payload = PayloadSincronizarCAD(payload_cad=payload_polilinha, matricula_id=mat_poly_id, reconstruir_poligonal=True)
        res = sincronizar_cad_clipboard(self.lev_id, payload)

        self.assertTrue(res.get("sucesso"))
        self.assertEqual(res.get("inseridos"), 4)
        self.assertGreaterEqual(res.get("confrontantes_criados", 0), 2)
        self.assertGreaterEqual(res.get("segmentos_gerados", 0), 3)

        # Verifica que P1, P2, P3 estão no polígono (ignorar_poligono = 0)
        p1 = execute_query("SELECT * FROM pontos WHERE levantamento_id = ? AND nome_vertice = 'P1'", params=(self.lev_id,), fetch_one=True)
        self.assertEqual(p1["ignorar_poligono"], 0)
        self.assertEqual(p1["ordem_caminhamento"], 1)
        self.assertIsNotNone(p1["confrontante_id"])

        # Verifica que SUP-01 está fora do polígono (ignorar_poligono = 1)
        p_sup = execute_query("SELECT * FROM pontos WHERE levantamento_id = ? AND nome_vertice = 'SUP-01'", params=(self.lev_id,), fetch_one=True)
        self.assertEqual(p_sup["ignorar_poligono"], 1)

        # Verifica criação do confrontante no banco
        conf = execute_query("SELECT * FROM confrontantes WHERE levantamento_id = ? AND nome = 'Fazenda Vizinha Norte'", params=(self.lev_id,), fetch_one=True)
        self.assertIsNotNone(conf)
        self.assertEqual(conf["matricula_imovel"], "5555")
        self.assertEqual(conf["cns_confrontante"], "08.123-4")

if __name__ == '__main__':
    unittest.main()
