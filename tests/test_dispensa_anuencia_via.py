import unittest

from database.connection import DatabaseManager
from database.models import create_tables
from services.documentacao.cartorio_generator import CartorioReportGenerator
from services.documentacao.erros import ErroDocumento
from services.gestores.anuencia_status import parece_via_publica


class TestParecerViaPublica(unittest.TestCase):
    def test_reconhece_vias_e_ignora_rios_e_pessoas(self):
        for nome in ("Estrada Municipal Yara", "Limita com Estrada Rural", "Rodovia PR-317", "BR-376", "Caminho de Servidão"):
            self.assertTrue(parece_via_publica(nome), nome)
        for nome in ("Rio Pirapó", "Córrego Azul", "Ferrovia Sul", "José Confrontante", "Brasilino Souza", None, ""):
            self.assertFalse(parece_via_publica(nome), nome)


class TestDeclaracaoDispensaVia(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)
            cur = conn.cursor()
            # Banco de teste persiste entre execuções: remove resíduos deste teste antes de recriar
            cur.execute("DELETE FROM segmentos WHERE levantamento_id IN (SELECT id FROM levantamentos WHERE propriedade_id IN (SELECT id FROM propriedades WHERE nome_propriedade = 'Sítio Yara'))")
            cur.execute("DELETE FROM confrontantes WHERE levantamento_id IN (SELECT id FROM levantamentos WHERE propriedade_id IN (SELECT id FROM propriedades WHERE nome_propriedade = 'Sítio Yara'))")
            cur.execute("DELETE FROM pontos WHERE levantamento_id IN (SELECT id FROM levantamentos WHERE propriedade_id IN (SELECT id FROM propriedades WHERE nome_propriedade = 'Sítio Yara'))")
            cur.execute("DELETE FROM levantamentos WHERE propriedade_id IN (SELECT id FROM propriedades WHERE nome_propriedade = 'Sítio Yara')")
            cur.execute("DELETE FROM matriculas WHERE propriedade_id IN (SELECT id FROM propriedades WHERE nome_propriedade = 'Sítio Yara')")
            cur.execute("DELETE FROM propriedade_clientes WHERE propriedade_id IN (SELECT id FROM propriedades WHERE nome_propriedade = 'Sítio Yara')")
            cur.execute("DELETE FROM propriedades WHERE nome_propriedade = 'Sítio Yara'")
            cur.execute("DELETE FROM clientes WHERE pessoa_id IN (SELECT id FROM pessoas WHERE cpf_cnpj = '52998224725')")
            cur.execute("DELETE FROM pessoas WHERE cpf_cnpj = '52998224725'")
            cur.execute("DELETE FROM profissionais WHERE nome = 'Thiago Técnico'")
            cur.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado, formacao, conselho, cpf) "
                        "VALUES ('Thiago Técnico', '98765/D', 'XYZ', 'Engenheiro Agrimensor', 'CREA-PR', '11144477735')")
            prof = cur.lastrowid
            cur.execute("INSERT INTO pessoas (nome, cpf_cnpj, rg, nacionalidade, profissao, estado_civil, endereco_completo) "
                        "VALUES ('Ana Dispensa Proprietária', '52998224725', '1234567', 'brasileira', 'agricultora', 'solteira', 'Rua A, 1')")
            pessoa = cur.lastrowid
            cur.execute("INSERT INTO clientes (pessoa_id, profissional_id, sexo) VALUES (?, ?, 'F')", (pessoa, prof))
            cliente = cur.lastrowid
            cur.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf, codigo_ccir) VALUES ('Sítio Yara', 'Cascavel', 'PR', '1')")
            cls.prop_id = cur.lastrowid
            cur.execute("INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (?, ?, 100)", (cls.prop_id, cliente))
            cur.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, denominacao, georreferenciamento, cri_comarca, area_ha) "
                        "VALUES (?, '777', 'Gleba Yara', 'aaaa-bbbb', 'Cascavel', 10.5)", (cls.prop_id,))
            cls.mat_id = cur.lastrowid
            cur.execute("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, numero_trt, data_trt) "
                        "VALUES (?, ?, '2026-01-01', 'BR20260000001', '2026-02-03')", (cls.prop_id, prof))
            cls.lev_id = cur.lastrowid

            pts = []
            for i, (lat, lon) in enumerate([(-24.10, -53.10), (-24.11, -53.10), (-24.12, -53.11), (-24.13, -53.12)], start=1):
                cur.execute("INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, lat, lon, tipo_ponto, ordem_caminhamento) "
                            "VALUES (?, ?, ?, ?, ?, 'P', ?)", (cls.lev_id, cls.mat_id, f"P{i}", lat, lon, i))
                pts.append(cur.lastrowid)
            cur.execute("INSERT INTO confrontantes (levantamento_id, nome) VALUES (?, 'Estrada Municipal Yara')", (cls.lev_id,))
            cls.estrada_id = cur.lastrowid
            cur.execute("INSERT INTO confrontantes (levantamento_id, nome) VALUES (?, 'Rio Pirapó')", (cls.lev_id,))
            cls.rio_id = cur.lastrowid
            for ini, fim, conf in ((pts[0], pts[1], cls.estrada_id), (pts[1], pts[2], cls.estrada_id), (pts[2], pts[3], cls.rio_id)):
                cur.execute("INSERT INTO segmentos (levantamento_id, matricula_id, confrontante_id, ponto_inicio_id, ponto_fim_id, "
                            "tipo_limite_sigef, metodo_posicionamento_sigef) VALUES (?, ?, ?, ?, ?, 'LA', 'PG1')",
                            (cls.lev_id, cls.mat_id, conf, ini, fim))
            conn.commit()

    def test_documento_traz_exigencias_do_cartorio(self):
        html = CartorioReportGenerator.gerar_declaracao_dispensa_via_html(self.lev_id, self.mat_id)
        self.assertIn("DISPENSA DE ANUÊNCIA", html)
        self.assertIn("Estrada Municipal Yara", html)
        self.assertNotIn("Rio Pirapó", html)  # rio não é via: fica fora do documento
        self.assertIn("faixa de domínio público", html)
        self.assertIn("non aedificandi", html)
        self.assertIn('440-AX, §3º, II, "b"', html)
        self.assertIn("divisa com a via não avança", html)
        self.assertIn("Provimento nº 195, de 3/6/2025", html)
        self.assertIn("Foro Extrajudicial", html)
        self.assertIn("P1 a P3", html)  # trecho contínuo de vértices da estrada
        self.assertIn("BR20260000001", html)  # TRT salva no levantamento
        self.assertIn("Matrícula nº", html)
        self.assertIn("777", html)
        self.assertIn("Ana Dispensa Proprietária", html)
        self.assertIn("Thiago Técnico", html)
        self.assertIn("assinatura digital", html)
        self.assertNotIn("{", html.split("<body", 1)[-1].split("<script", 1)[0].replace("{{", ""), "placeholder sem preencher")

    def test_larguras_opcionais_entram_no_texto(self):
        html = CartorioReportGenerator.gerar_declaracao_dispensa_via_html(
            self.lev_id, self.mat_id, faixa_dominio_m="15", faixa_nao_edificante_m="7,5")
        self.assertIn("15,00 m", html)
        self.assertIn("7,50 m", html)
        sem = CartorioReportGenerator.gerar_declaracao_dispensa_via_html(self.lev_id, self.mat_id)
        self.assertNotIn("medidas a partir do eixo", sem)

    def test_largura_invalida_gera_erro(self):
        with self.assertRaises(ErroDocumento):
            CartorioReportGenerator.gerar_declaracao_dispensa_via_html(self.lev_id, self.mat_id, faixa_dominio_m="abc")

    def test_sem_estrada_gera_erro_claro(self):
        with DatabaseManager() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio) "
                        "SELECT propriedade_id, profissional_id, '2026-05-05' FROM levantamentos WHERE id = ?", (self.lev_id,))
            lev_sem = cur.lastrowid
            conn.commit()
        with self.assertRaises(ErroDocumento) as ctx:
            CartorioReportGenerator.gerar_declaracao_dispensa_via_html(lev_sem, self.mat_id)
        self.assertIn("estrada", str(ctx.exception).lower())

    def test_confrontante_explicito_restringe_a_via(self):
        html = CartorioReportGenerator.gerar_declaracao_dispensa_via_html(self.lev_id, self.mat_id, confrontante_id=self.estrada_id)
        self.assertIn("Estrada Municipal Yara", html)


if __name__ == "__main__":
    unittest.main()
