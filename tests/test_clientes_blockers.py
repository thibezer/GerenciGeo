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

if __name__ == "__main__":
    unittest.main()
