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
        # Limpar dados de teste
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM cliente_historico_logs")
            cursor.execute("DELETE FROM cliente_metadados")
            cursor.execute("DELETE FROM propriedade_clientes")
            cursor.execute("DELETE FROM clientes")
            cursor.execute("DELETE FROM pessoas")
            cursor.execute("DELETE FROM matriculas")
            cursor.execute("DELETE FROM levantamentos")
            cursor.execute("DELETE FROM propriedades")
            cursor.execute("DELETE FROM profissionais")

            # Criar profissional
            cursor.execute("""
                INSERT INTO profissionais (id, nome, registro, codigo_credenciado)
                VALUES (1, 'Agrimensor Teste', 'CREA 12345', 'ABC1')
            """)
            # Criar propriedade
            cursor.execute("""
                INSERT INTO propriedades (id, nome_propriedade, municipio, uf, codigo_car, codigo_ccir)
                VALUES (1, 'Fazenda Modelo', 'Toledo', 'PR', 'CAR-123', 'CCIR-456')
            """)
            # Criar levantamento
            cursor.execute("""
                INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio, status)
                VALUES (1, 1, 1, '2026-08-01', 'EM_ANDAMENTO')
            """)
            # Criar matrícula
            cursor.execute("""
                INSERT INTO matriculas (id, propriedade_id, numero_matricula, ccir, itr, area_ha)
                VALUES (1, 1, '99999', 'CCIR-456', 'ITR-789', 150.0)
            """)
            conn.commit()

    def test_persistencia_data_nascimento_fundacao(self):
        """Valida se data_nascimento_fundacao é gravada no cadastro, retornada no get_clientes e atualizada."""
        cli_payload = {
            "nome_completo": "Carlos da Silva",
            "cpf_cnpj": "42857708300",
            "rg_ie": "12.345.678-9",
            "data_nascimento_fundacao": "1985-06-20",
            "estado_civil": "Casado(a)",
            "profissao": "Engenheiro",
            "nacionalidade": "Brasileiro(a)",
            "nome_conjuge": "Ana da Silva",
            "cpf_conjuge": "37299462001",
            "rg_conjuge": "98.765.432-1",
            "regime_bens": "Comunhão Parcial de Bens",
            "email": "carlos@teste.com",
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

        # Verifica via get_clientes()
        clientes = get_clientes()
        self.assertEqual(len(clientes), 1)
        cli = clientes[0]
        self.assertEqual(cli["id"], cliente_id)
        self.assertEqual(cli["data_nascimento_fundacao"], "1985-06-20")
        self.assertEqual(cli["nome_completo"], "Carlos da Silva")
        self.assertEqual(cli["senha_gov"], "SenhaSecretaGov123")

        # Atualiza a data de nascimento
        cli_payload["data_nascimento_fundacao"] = "1985-06-25"
        res_up = atualizar_cliente(cliente_id, cli_payload)
        self.assertNotIn("error", res_up)

        # Verifica novamente
        clientes_atualizados = get_clientes()
        self.assertEqual(clientes_atualizados[0]["data_nascimento_fundacao"], "1985-06-25")

    def test_dados_gerais_workspace_com_dados_civis_e_sem_senha_gov(self):
        """Valida se DADOS_GERAIS.json inclui todos os dados civis da pessoa e omite a senha_gov."""
        cli_payload = {
            "nome_completo": "Juliana Santos",
            "cpf_cnpj": "37299462001",
            "rg_ie": "11.222.333-4",
            "data_nascimento_fundacao": "1990-11-15",
            "estado_civil": "Casado(a)",
            "profissao": "Produtora Rural",
            "nacionalidade": "Brasileira",
            "nome_conjuge": "Marcos Santos",
            "cpf_conjuge": "42857708300",
            "rg_conjuge": "55.666.777-8",
            "regime_bens": "Comunhão Universal de Bens",
            "email": "juliana@teste.com",
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

        # Vincula cliente à propriedade
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao)
                VALUES (1, ?, 100.0)
            """, (cliente_id,))
            conn.commit()

        # Gera DADOS_GERAIS.json
        ExportacaoService.gerar_documento_cliente_workspace(1)

        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(1)
        caminho_json = folder / "Documentos" / "DADOS_GERAIS.json"
        self.assertTrue(caminho_json.exists(), f"Arquivo não encontrado: {caminho_json}")

        with open(caminho_json, "r", encoding="utf-8") as f:
            dados = json.load(f)

        self.assertIn("clientes", dados)
        self.assertEqual(len(dados["clientes"]), 1)
        cli_doc = dados["clientes"][0]

        # Verifica dados civis presentes
        self.assertEqual(cli_doc["nome_completo"], "Juliana Santos")
        self.assertEqual(cli_doc["cpf_cnpj"], "37299462001")
        self.assertEqual(cli_doc["rg_ie"], "11.222.333-4")
        self.assertEqual(cli_doc["estado_civil"], "Casado(a)")
        self.assertEqual(cli_doc["nome_conjuge"], "Marcos Santos")
        self.assertEqual(cli_doc["cpf_conjuge"], "42857708300")
        self.assertEqual(cli_doc["rg_conjuge"], "55.666.777-8")
        self.assertEqual(cli_doc["regime_bens"], "Comunhão Universal de Bens")
        self.assertEqual(cli_doc["data_nascimento_fundacao"], "1990-11-15")
        self.assertEqual(cli_doc["percentual_participacao"], 100.0)

        # Garante que a senha_gov NÃO está exposta no arquivo
        self.assertNotIn("senha_gov", cli_doc)

if __name__ == "__main__":
    unittest.main()
