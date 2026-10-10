"""
Regressão: edições parciais de clientes, propriedades e matrículas não podem apagar
campos que não vieram no payload, e propriedades com levantamentos não podem ser excluídas.
"""
import unittest
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager, execute_query
from database.models import create_tables


def _uma(sql, params=()):
    row = execute_query(sql, params=params, fetch_one=True)
    return dict(row) if row else None


class TestAtualizacaoParcialCadastros(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)

    def setUp(self):
        self.client = TestClient(app)
        self.cliente_id = None
        self.prop_id = None
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM clientes WHERE pessoa_id IN (SELECT id FROM pessoas WHERE cpf_cnpj = '52998224725')")
            cursor.execute("DELETE FROM pessoas WHERE cpf_cnpj = '52998224725'")
            cursor.execute("""
                INSERT INTO profissionais (nome, registro, codigo_credenciado)
                VALUES ('Agrimensor Parcial', 'CREA 1', 'PARC')
            """)
            self.prof_id = cursor.lastrowid
            conn.commit()

    def tearDown(self):
        if self.prop_id:
            execute_query("DELETE FROM levantamentos WHERE propriedade_id = ?", params=(self.prop_id,), commit=True)
            execute_query("DELETE FROM propriedades WHERE id = ?", params=(self.prop_id,), commit=True)
        if self.cliente_id:
            self.client.delete(f"/clientes/{self.cliente_id}")
        execute_query("DELETE FROM profissionais WHERE id = ?", params=(self.prof_id,), commit=True)

    def _criar_cliente_casado(self):
        res = self.client.post("/clientes", json={
            "nome_completo": "Cliente Parcial", "cpf_cnpj": "529.982.247-25", "estado_civil": "Casado",
            "nome_conjuge": "Conjuge Parcial", "cpf_conjuge": "11144477735",
            "data_casamento": "2010-01-01", "cartorio_casamento": "CRI Umuarama", "livro_casamento": "B-1",
            "folha_casamento": "10", "termo_casamento": "123", "bairro": "Centro",
            "endereco_sem_numero": "Rua A", "numero_endereco": "10", "sexo": "F",
            "metadados": {"origem": "teste"}
        })
        self.assertEqual(res.status_code, 200, res.text)
        self.cliente_id = res.json()["id"]
        return self.cliente_id

    def _criar_propriedade(self):
        res = self.client.post("/propriedades", json={"nome_propriedade": "Fazenda Parcial", "municipio": "Umuarama", "uf": "PR"})
        self.assertEqual(res.status_code, 200, res.text)
        self.prop_id = res.json()["id"]
        return self.prop_id

    # ── Clientes ─────────────────────────────────────────────────────────────

    def test_metadado_nao_apaga_dados_de_casamento_e_endereco(self):
        cid = self._criar_cliente_casado()
        res = self.client.put(f"/clientes/{cid}", json={"nome_completo": "Cliente Parcial", "metadados": {"origem": "teste", "nova": "x"}})
        self.assertEqual(res.status_code, 200, res.text)

        cli = self.client.get(f"/clientes/{cid}").json()
        self.assertEqual(cli["metadados"], {"origem": "teste", "nova": "x"})
        for campo, esperado in {
            "data_casamento": "2010-01-01", "cartorio_casamento": "CRI Umuarama", "livro_casamento": "B-1",
            "folha_casamento": "10", "termo_casamento": "123", "bairro": "Centro",
            "endereco_sem_numero": "Rua A", "numero_endereco": "10", "sexo": "F",
            "nome_conjuge": "Conjuge Parcial", "cpf_cnpj": "52998224725", "estado_civil": "Casado",
        }.items():
            self.assertEqual(cli[campo], esperado, campo)

    def test_atualizacao_sem_metadados_preserva_metadados(self):
        cid = self._criar_cliente_casado()
        self.client.put(f"/clientes/{cid}", json={"telefone": "44999990000"})
        cli = self.client.get(f"/clientes/{cid}").json()
        self.assertEqual(cli["telefone"], "44999990000")
        self.assertEqual(cli["metadados"], {"origem": "teste"})
        self.assertEqual(cli["data_casamento"], "2010-01-01")

    def test_campo_enviado_como_nulo_e_limpo(self):
        cid = self._criar_cliente_casado()
        self.client.put(f"/clientes/{cid}", json={"bairro": None})
        self.assertIsNone(self.client.get(f"/clientes/{cid}").json()["bairro"])

    def test_salvar_sem_mudanca_nao_gera_historico_espurio(self):
        cid = self._criar_cliente_casado()
        self.client.put(f"/clientes/{cid}", json={
            "nome": "Cliente Parcial", "nome_completo": "Cliente Parcial",
            "cpf_cnpj": "529.982.247-25", "cpf_conjuge": "111.444.777-35"
        })
        historico = self.client.get(f"/clientes/{cid}/historico").json()
        self.assertEqual(historico, [])

    def test_nome_vazio_e_rejeitado(self):
        cid = self._criar_cliente_casado()
        res = self.client.put(f"/clientes/{cid}", json={"nome_completo": ""})
        self.assertEqual(res.status_code, 400)

    # ── Propriedades ─────────────────────────────────────────────────────────

    def test_editar_propriedade_preserva_anexos(self):
        pid = self._criar_propriedade()
        execute_query("UPDATE propriedades SET caminho_arquivo_car = 'C:/x/CAR.pdf', caminho_arquivo_ccir = 'C:/x/CCIR.pdf' WHERE id = ?", params=(pid,), commit=True)
        res = self.client.put(f"/propriedades/{pid}", json={
            "nome_propriedade": "Fazenda Parcial 2", "codigo_car": "", "codigo_ccir": "", "municipio": "Umuarama", "uf": "pr"
        })
        self.assertEqual(res.status_code, 200, res.text)
        prop = _uma("SELECT * FROM propriedades WHERE id = ?", (pid,))
        self.assertEqual(prop["nome_propriedade"], "Fazenda Parcial 2")
        self.assertEqual(prop["uf"], "PR")
        self.assertEqual(prop["caminho_arquivo_car"], "C:/x/CAR.pdf")
        self.assertEqual(prop["caminho_arquivo_ccir"], "C:/x/CCIR.pdf")

    def test_put_propriedade_ignora_caminho_de_arquivo_enviado(self):
        pid = self._criar_propriedade()
        self.client.put(f"/propriedades/{pid}", json={"caminho_arquivo_car": "C:/Windows/win.ini"})
        self.assertIsNone(_uma("SELECT caminho_arquivo_car FROM propriedades WHERE id = ?", (pid,))["caminho_arquivo_car"])

    def test_put_propriedade_parcial_e_validacoes(self):
        pid = self._criar_propriedade()
        self.assertEqual(self.client.put(f"/propriedades/{pid}", json={"codigo_car": "PR-123"}).status_code, 200)
        prop = _uma("SELECT * FROM propriedades WHERE id = ?", (pid,))
        self.assertEqual((prop["codigo_car"], prop["nome_propriedade"], prop["municipio"]), ("PR-123", "Fazenda Parcial", "Umuarama"))
        self.assertEqual(self.client.put(f"/propriedades/{pid}", json={"uf": "PRX"}).status_code, 400)
        self.assertEqual(self.client.put(f"/propriedades/{pid}", json={"nome_propriedade": " "}).status_code, 400)
        self.assertEqual(self.client.put("/propriedades/99999999", json={"codigo_car": "x"}).status_code, 404)

    def test_excluir_propriedade_com_levantamento_e_bloqueado(self):
        pid = self._criar_propriedade()
        execute_query("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio) VALUES (?, ?, '2026-01-01')", params=(pid, self.prof_id), commit=True)
        res = self.client.delete(f"/propriedades/{pid}")
        self.assertEqual(res.status_code, 409)
        self.assertIn("levantamento", res.json()["detail"])
        self.assertEqual(_uma("SELECT count(*) n FROM levantamentos WHERE propriedade_id = ?", (pid,))["n"], 1)

    def test_excluir_propriedade_sem_levantamento(self):
        pid = self._criar_propriedade()
        self.assertEqual(self.client.delete(f"/propriedades/{pid}").status_code, 200)
        self.assertIsNone(_uma("SELECT id FROM propriedades WHERE id = ?", (pid,)))
        self.prop_id = None

    # ── Matrículas ───────────────────────────────────────────────────────────

    def _criar_matricula(self, pid, numero, **extra):
        res = self.client.post(f"/propriedades/{pid}/matriculas", json={"numero_matricula": numero, "area_ha": 10, "denominacao": "Gleba", **extra})
        self.assertEqual(res.status_code, 200, res.text)
        return _uma("SELECT * FROM matriculas WHERE propriedade_id = ? AND numero_matricula = ?", (pid, numero))

    def test_ccir_da_matricula_e_gravado_na_criacao_e_edicao(self):
        pid = self._criar_propriedade()
        mat = self._criar_matricula(pid, "100", ccir="951.123.456.789-0")
        self.assertEqual(mat["ccir"], "951.123.456.789-0")

        self.client.put(f"/matriculas/{mat['id']}", json={"numero_matricula": "100", "codigo_ccir": "951.000.000.000-1"})
        self.assertEqual(_uma("SELECT ccir FROM matriculas WHERE id = ?", (mat["id"],))["ccir"], "951.000.000.000-1")
        historico = self.client.get(f"/matriculas/{mat['id']}/historico").json()
        self.assertIn("ccir", [h["campo_alterado"] for h in historico])

    def test_ccir_na_criacao_pela_rota_do_levantamento(self):
        pid = self._criar_propriedade()
        lev_id = execute_query("INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio) VALUES (?, ?, '2026-01-01')", params=(pid, self.prof_id), commit=True)
        res = self.client.post(f"/levantamentos/{lev_id}/matriculas", json={"numero_matricula": "300", "codigo_ccir": "951.222.333.444-5", "area_ha": 3})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(_uma("SELECT ccir FROM matriculas WHERE propriedade_id = ? AND numero_matricula = '300'", (pid,))["ccir"], "951.222.333.444-5")

    def test_editar_matricula_preserva_desenho_compartilhado(self):
        pid = self._criar_propriedade()
        origem = self._criar_matricula(pid, "100")
        derivada = self._criar_matricula(pid, "101")
        self.client.post(f"/matriculas/{derivada['id']}/vincular-desenho", json={"matricula_origem_desenho_id": origem["id"]})

        # Payload do formulário da tela de Propriedades (não envia matricula_origem_desenho_id)
        res = self.client.put(f"/matriculas/{derivada['id']}", json={
            "numero_matricula": "101", "ccir": "", "itr": "", "area_ha": 5.5, "valor_itr": None,
            "denominacao": "Gleba B", "georreferenciamento": ""
        })
        self.assertEqual(res.status_code, 200, res.text)
        mat = _uma("SELECT * FROM matriculas WHERE id = ?", (derivada["id"],))
        self.assertEqual(mat["matricula_origem_desenho_id"], origem["id"])
        self.assertEqual(mat["area_ha"], 5.5)
        self.assertEqual(mat["denominacao"], "Gleba B")

        # Desvincular explicitamente continua possível
        self.client.put(f"/matriculas/{derivada['id']}", json={"numero_matricula": "101", "matricula_origem_desenho_id": None})
        self.assertIsNone(_uma("SELECT matricula_origem_desenho_id FROM matriculas WHERE id = ?", (derivada["id"],))["matricula_origem_desenho_id"])

    def test_editar_matricula_parcial_preserva_area_e_demais_campos(self):
        pid = self._criar_propriedade()
        mat = self._criar_matricula(pid, "200", itr="1234567-8", valor_itr=150.5, georreferenciamento="abc")
        self.client.put(f"/matriculas/{mat['id']}", json={"numero_matricula": "200-A"})
        atual = _uma("SELECT * FROM matriculas WHERE id = ?", (mat["id"],))
        self.assertEqual(atual["numero_matricula"], "200-A")
        self.assertEqual((atual["area_ha"], atual["itr"], atual["valor_itr"], atual["georreferenciamento"], atual["denominacao"]),
                         (10.0, "1234567-8", 150.5, "abc", "Gleba"))
        historico = self.client.get(f"/matriculas/{mat['id']}/historico").json()
        self.assertEqual([h["campo_alterado"] for h in historico], ["numero_matricula"])


if __name__ == "__main__":
    unittest.main()
