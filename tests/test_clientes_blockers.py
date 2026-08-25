import os
import json
import sqlite3
import unittest
from pathlib import Path
from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from services.gestores.levantamento_manager import cadastrar_cliente, atualizar_cliente
from services.gestores.workspace_manager import WorkspaceManager
from services.documentacao.exportacao_service import ExportacaoService
from routes.clientes import get_clientes

class TestClientesBlockers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with DatabaseManager() as conn:
            create_tables(conn)

    def setUp(self):
        self.created_cliente_ids = []
        self.created_prop_ids = []
        self.created_prof_ids = []
        self.created_lev_ids = []

        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM pessoas WHERE cpf_cnpj IN ('78612659191', '90378697501', '39601739114', '58943780010')")
            
            # Criar profissional isolado
            cursor.execute("""
                INSERT INTO profissionais (nome, registro, codigo_credenciado)
                VALUES ('Agrimensor Teste Unitario', 'CREA 99999', 'TEST1')
            """)
            self.prof_id = cursor.lastrowid
            self.created_prof_ids.append(self.prof_id)

            # Criar propriedade isolada
            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, municipio, uf, codigo_car, codigo_ccir)
                VALUES ('Fazenda Modelo Teste Unitario', 'Toledo', 'PR', 'CAR-123', 'CCIR-456')
            """)
            self.prop_id = cursor.lastrowid
            self.created_prop_ids.append(self.prop_id)

            # Criar levantamento isolado
            cursor.execute("""
                INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status)
                VALUES (?, ?, '2026-08-01', 'EM_ANDAMENTO')
            """, (self.prop_id, self.prof_id))
            self.lev_id = cursor.lastrowid
            self.created_lev_ids.append(self.lev_id)

            # Criar matrícula isolada
            cursor.execute("""
                INSERT INTO matriculas (propriedade_id, numero_matricula, ccir, itr, area_ha)
                VALUES (?, '99999-TEST', 'CCIR-456', 'ITR-789', 150.0)
            """, (self.prop_id,))
            self.mat_id = cursor.lastrowid
            conn.commit()

    def tearDown(self):
        # Limpar apenas os registros criados por este teste isoladamente
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            for cid in self.created_cliente_ids:
                cursor.execute("SELECT pessoa_id FROM clientes WHERE id = ?", (cid,))
                row = cursor.fetchone()
                cursor.execute("DELETE FROM cliente_historico_logs WHERE id_cliente = ?", (cid,))
                cursor.execute("DELETE FROM cliente_metadados WHERE id_cliente = ?", (cid,))
                cursor.execute("DELETE FROM propriedade_clientes WHERE cliente_id = ?", (cid,))
                cursor.execute("DELETE FROM clientes WHERE id = ?", (cid,))
                if row and row[0]:
                    cursor.execute("DELETE FROM pessoas WHERE id = ?", (row[0],))
            for lid in self.created_lev_ids:
                cursor.execute("DELETE FROM levantamentos WHERE id = ?", (lid,))
            for pid in self.created_prop_ids:
                cursor.execute("DELETE FROM matriculas WHERE propriedade_id = ?", (pid,))
                cursor.execute("DELETE FROM propriedades WHERE id = ?", (pid,))
            for prof_id in self.created_prof_ids:
                cursor.execute("DELETE FROM profissionais WHERE id = ?", (prof_id,))
            cursor.execute("DELETE FROM pessoas WHERE cpf_cnpj IN ('78612659191', '90378697501', '39601739114', '58943780010')")
            conn.commit()

    def test_persistencia_data_nascimento_fundacao(self):
        """Valida se data_nascimento_fundacao é gravada no cadastro, retornada no get_clientes e atualizada."""
        cli_payload = {
            "nome_completo": "Carlos Teste Unitario",
            "cpf_cnpj": "78612659191",
            "rg_ie": "12.345.678-9",
            "data_nascimento_fundacao": "1985-06-20",
            "estado_civil": "Casado(a)",
            "profissao": "Engenheiro",
            "nacionalidade": "Brasileiro(a)",
            "nome_conjuge": "Ana Teste",
            "cpf_conjuge": "90378697501",
            "rg_conjuge": "98.765.432-1",
            "regime_bens": "Comunhão Parcial de Bens",
            "email": "carlos_teste@teste.com",
            "telefone": "(45) 99999-8888",
            "endereco_completo": "Rua das Palmeiras, 500",
            "cidade": "Toledo",
            "estado": "PR",
            "cep": "85900-000",
            "sexo": "M",
            "senha_gov": "SenhaSecretaGov123",
            "metadados": {"origem": "indicacao"}
        }

        res_cad = cadastrar_cliente(cli_payload)
        self.assertNotIn("error", res_cad)
        cliente_id = res_cad["id"]
        self.created_cliente_ids.append(cliente_id)

        # Verifica via get_clientes()
        clientes = get_clientes()
        cli = next((c for c in clientes if c["id"] == cliente_id), None)
        self.assertIsNotNone(cli)
        self.assertEqual(cli["data_nascimento_fundacao"], "1985-06-20")
        self.assertEqual(cli["nome_completo"], "Carlos Teste Unitario")
        self.assertEqual(cli["senha_gov"], "SenhaSecretaGov123")

        # Atualiza a data de nascimento
        cli_payload["data_nascimento_fundacao"] = "1985-06-25"
        res_up = atualizar_cliente(cliente_id, cli_payload)
        self.assertNotIn("error", res_up)

        # Verifica novamente
        clientes_atualizados = get_clientes()
        cli_up = next((c for c in clientes_atualizados if c["id"] == cliente_id), None)
        self.assertEqual(cli_up["data_nascimento_fundacao"], "1985-06-25")

    def test_dados_gerais_workspace_com_dados_civis_e_sem_senha_gov(self):
        """Valida se DADOS_GERAIS.json inclui todos os dados civis da pessoa e omite a senha_gov."""
        cli_payload = {
            "nome_completo": "Juliana Teste Unidade",
            "cpf_cnpj": "39601739114",
            "rg_ie": "11.222.333-4",
            "data_nascimento_fundacao": "1990-11-15",
            "estado_civil": "Casado(a)",
            "profissao": "Produtora Rural",
            "nacionalidade": "Brasileira",
            "nome_conjuge": "Marcos Teste",
            "cpf_conjuge": "58943780010",
            "rg_conjuge": "55.666.777-8",
            "regime_bens": "Comunhão Universal de Bens",
            "email": "juliana_teste@teste.com",
            "telefone": "(45) 98888-7777",
            "endereco_completo": "Linha São João, Km 5",
            "cidade": "Toledo",
            "estado": "PR",
            "cep": "85900-000",
            "sexo": "F",
            "senha_gov": "MinhaSenhaSuperSecretaGov999",
            "metadados": {"contato_preferencial": "WhatsApp"}
        }

        res_cad = cadastrar_cliente(cli_payload)
        self.assertNotIn("error", res_cad)
        cliente_id = res_cad["id"]
        self.created_cliente_ids.append(cliente_id)

        # Vincula cliente à propriedade de teste
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao)
                VALUES (?, ?, 100.0)
            """, (self.prop_id, cliente_id))
            conn.commit()

        # Gera DADOS_GERAIS.json
        ExportacaoService.gerar_documento_cliente_workspace(self.lev_id)

        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(self.lev_id)
        caminho_json = folder / "Documentos" / "DADOS_GERAIS.json"
        self.assertTrue(caminho_json.exists(), f"Arquivo não encontrado: {caminho_json}")

        with open(caminho_json, "r", encoding="utf-8") as f:
            dados = json.load(f)

        self.assertIn("clientes", dados)
        cli_doc = next((c for c in dados["clientes"] if c["id"] == cliente_id), None)
        self.assertIsNotNone(cli_doc)

        # Verifica dados civis presentes
        self.assertEqual(cli_doc["nome_completo"], "Juliana Teste Unidade")
        self.assertEqual(cli_doc["cpf_cnpj"], "39601739114")
        self.assertEqual(cli_doc["rg_ie"], "11.222.333-4")
        self.assertEqual(cli_doc["estado_civil"], "Casado(a)")
        self.assertEqual(cli_doc["nome_conjuge"], "Marcos Teste")
        self.assertEqual(cli_doc["cpf_conjuge"], "58943780010")
        self.assertEqual(cli_doc["rg_conjuge"], "55.666.777-8")
        self.assertEqual(cli_doc["regime_bens"], "Comunhão Universal de Bens")
        self.assertEqual(cli_doc["data_nascimento_fundacao"], "1990-11-15")
        self.assertEqual(cli_doc["percentual_participacao"], 100.0)

        # Garante que a senha_gov NÃO está exposta no arquivo
        self.assertNotIn("senha_gov", cli_doc)

    def test_pendencias_ciclo_completo(self):
        """Valida criação, atualização, conclusão e exclusão de pendências via rotas da API"""
        from fastapi.testclient import TestClient
        from api import app

        client = TestClient(app)
        
        # 1. Criar pendência
        resp_post = client.post("/pendencias", json={
            "titulo": "Auditoria de Limites",
            "descricao": "Conferir memorial descritivo",
            "prioridade": "ALTA"
        })
        self.assertEqual(resp_post.status_code, 200)

        # 2. Listar pendências
        resp_get = client.get("/pendencias")
        self.assertEqual(resp_get.status_code, 200)
        items = resp_get.json()
        item = next((p for p in items if p["titulo"] == "Auditoria de Limites"), None)
        self.assertIsNotNone(item)
        item_id = item["id"]

        # 3. Concluir pendência
        resp_concluir = client.post(f"/pendencias/{item_id}/concluir")
        self.assertEqual(resp_concluir.status_code, 200)

        # 4. Excluir pendência
        resp_del = client.delete(f"/pendencias/{item_id}")
        self.assertEqual(resp_del.status_code, 200)

        # 5. Validar que foi removido
        resp_after = client.get("/pendencias")
        items_after = resp_after.json()
        self.assertIsNone(next((p for p in items_after if p["id"] == item_id), None))

    def test_exclusao_cirurgica_cliente_sem_afetar_outras_pessoas(self):
        """Valida que a exclusão de um cliente remove apenas suas dependências e pessoa órfã, sem afetar terceiros."""
        from fastapi.testclient import TestClient
        from api import app

        client = TestClient(app)

        # 1. Cria uma terceira pessoa (ex: confrontante independente)
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO pessoas (nome, cpf_cnpj) VALUES ('Confrontante Independente', '99988877700')")
            pessoa_terceira_id = cursor.lastrowid
            conn.commit()

        # 2. Cadastra um cliente
        cli_payload = {
            "nome_completo": "Cliente Para Exclusao",
            "cpf_cnpj": "78612659191",
            "email": "exclusao@teste.com"
        }
        res_cad = cadastrar_cliente(cli_payload)
        self.assertNotIn("error", res_cad)
        cliente_id = res_cad["id"]

        # 3. Exclui o cliente via API
        resp = client.delete(f"/clientes/{cliente_id}")
        self.assertEqual(resp.status_code, 200)

        # 4. Garante que o cliente foi excluído
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM clientes WHERE id = ?", (cliente_id,))
            self.assertIsNone(cursor.fetchone())

            # Garante que a pessoa daquele cliente foi limpa cirurgicamente
            cursor.execute("SELECT id FROM pessoas WHERE cpf_cnpj = '78612659191'")
            self.assertIsNone(cursor.fetchone())

            # Garante que a terceira pessoa continua intacta no banco
            cursor.execute("SELECT id FROM pessoas WHERE id = ?", (pessoa_terceira_id,))
            self.assertIsNotNone(cursor.fetchone())

            # Limpeza
            cursor.execute("DELETE FROM pessoas WHERE id = ?", (pessoa_terceira_id,))
            conn.commit()

    def test_exclusao_em_lote_atomica_api(self):
        """Valida o endpoint POST /clientes/excluir-lote executando exclusão atômica de múltiplos clientes."""
        from fastapi.testclient import TestClient
        from api import app

        client = TestClient(app)

        res1 = cadastrar_cliente({"nome_completo": "Cliente Lote 1", "cpf_cnpj": "78612659191"})
        res2 = cadastrar_cliente({"nome_completo": "Cliente Lote 2", "cpf_cnpj": "90378697501"})
        self.assertNotIn("error", res1)
        self.assertNotIn("error", res2)
        c1_id = res1["id"]
        c2_id = res2["id"]

        resp = client.post("/clientes/excluir-lote", json={"cliente_ids": [c1_id, c2_id]})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["sucessos"], 2)
        self.assertEqual(len(data["erros"]), 0)

        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM clientes WHERE id IN (?, ?)", (c1_id, c2_id))
            self.assertEqual(len(cursor.fetchall()), 0)

    def test_bloqueio_exclusao_cliente_com_levantamento_ativo(self):
        """Valida que cliente com levantamento vinculado tem sua exclusão bloqueada com HTTP 409."""
        from fastapi.testclient import TestClient
        from api import app

        client = TestClient(app)

        res = cadastrar_cliente({"nome_completo": "Cliente Com Projeto", "cpf_cnpj": "39601739114"})
        self.assertNotIn("error", res)
        c_id = res["id"]
        self.created_cliente_ids.append(c_id)

        # Vincula à propriedade que tem levantamento
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (?, ?, 100.0)", (self.prop_id, c_id))
            conn.commit()

        resp = client.delete(f"/clientes/{c_id}")
        self.assertEqual(resp.status_code, 409)
        self.assertIn("Não é possível excluir cliente com levantamentos vinculados", resp.json()["detail"])

    def test_exclusao_lote_mista_com_parcial_sucesso_e_erros(self):
        """Valida que exclusão em lote mista deleta os elegíveis e reporta os que possuem levantamentos vinculados."""
        from fastapi.testclient import TestClient
        from api import app

        client = TestClient(app)

        # 1. Cliente livre
        res_livre = cadastrar_cliente({"nome_completo": "Cliente Livre Lote", "cpf_cnpj": "78612659191"})
        self.assertNotIn("error", res_livre)
        c_livre_id = res_livre["id"]

        # 2. Cliente com levantamento
        res_bloqueado = cadastrar_cliente({"nome_completo": "Cliente Bloqueado Lote", "cpf_cnpj": "90378697501"})
        self.assertNotIn("error", res_bloqueado)
        c_bloq_id = res_bloqueado["id"]
        self.created_cliente_ids.append(c_bloq_id)

        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (?, ?, 100.0)", (self.prop_id, c_bloq_id))
            conn.commit()

        # 3. Executa lote com livre, bloqueado e ID inexistente (99999)
        resp = client.post("/clientes/excluir-lote", json={"cliente_ids": [c_livre_id, c_bloq_id, 99999]})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["sucessos"], 1)
        self.assertEqual(len(data["erros"]), 2)
        self.assertEqual(data["total_processado"], 3)

        # 4. Verifica banco
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            # Livre foi excluído
            cursor.execute("SELECT id FROM clientes WHERE id = ?", (c_livre_id,))
            self.assertIsNone(cursor.fetchone())
            # Bloqueado continua intacto
            cursor.execute("SELECT id FROM clientes WHERE id = ?", (c_bloq_id,))
            self.assertIsNotNone(cursor.fetchone())

    def test_verificacao_automatica_pendencia_conjuge_cliente_casado(self):
        """Valida que ao cadastrar cliente casado sem dados de cônjuge, o sistema gera pendência automática."""
        cli_payload = {
            "nome_completo": "Roberto Casado Sem Conjuge",
            "cpf_cnpj": "78612659191",
            "estado_civil": "Casado(a)"
        }
        res_cad = cadastrar_cliente(cli_payload)
        self.assertNotIn("error", res_cad)
        cid = res_cad["id"]
        self.created_cliente_ids.append(cid)

        # Verifica na tabela pendencias
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, titulo, prioridade FROM pendencias WHERE titulo LIKE '%Roberto Casado Sem Conjuge%'")
            pend = cursor.fetchone()
            self.assertIsNotNone(pend)
            self.assertEqual(pend["prioridade"], "ALTA")
            # Limpa pendência de teste
            cursor.execute("DELETE FROM pendencias WHERE id = ?", (pend["id"],))
            conn.commit()

    def test_auditoria_historico_logs_em_edicao_cliente(self):
        """Valida se a edição de campos gera histórico detalhado na tabela cliente_historico_logs."""
        cli_payload = {
            "nome_completo": "Marcos Auditoria",
            "cpf_cnpj": "78612659191",
            "email": "antigo@teste.com",
            "telefone": "(45) 91111-1111",
            "profissao": "Empresário"
        }
        res_cad = cadastrar_cliente(cli_payload)
        self.assertNotIn("error", res_cad)
        cid = res_cad["id"]
        self.created_cliente_ids.append(cid)

        # Atualiza campos
        cli_payload["email"] = "novo@teste.com"
        cli_payload["telefone"] = "(45) 92222-2222"
        cli_payload["profissao"] = "Produtor Rural"
        res_up = atualizar_cliente(cid, cli_payload)
        self.assertNotIn("error", res_up)

        # Consulta logs de histórico
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT campo_alterado, valor_antigo, valor_novo FROM cliente_historico_logs WHERE id_cliente = ? ORDER BY id ASC", (cid,))
            logs = cursor.fetchall()
            self.assertGreaterEqual(len(logs), 3)
            campos = {l["campo_alterado"]: (l["valor_antigo"], l["valor_novo"]) for l in logs}
            self.assertEqual(campos["email"], ("antigo@teste.com", "novo@teste.com"))
            self.assertEqual(campos["telefone"], ("(45) 91111-1111", "(45) 92222-2222"))
            self.assertEqual(campos["profissao"], ("Empresário", "Produtor Rural"))

    def test_bloqueio_duplicacao_cpf_cnpj(self):
        """Valida que o cadastro com CPF/CNPJ duplicado é rejeitado."""
        res1 = cadastrar_cliente({"nome_completo": "Cliente Original", "cpf_cnpj": "78612659191"})
        self.assertNotIn("error", res1)
        self.created_cliente_ids.append(res1["id"])

        res2 = cadastrar_cliente({"nome_completo": "Cliente Clonado", "cpf_cnpj": "78612659191"})
        self.assertIn("error", res2)
        self.assertIn("CPF/CNPJ já cadastrado", res2["error"])

if __name__ == "__main__":
    unittest.main()
