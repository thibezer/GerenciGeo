import unittest
from fastapi.testclient import TestClient
from api import app
from database.connection import DatabaseManager
from database.models import create_tables

class TestConfrontantesQualificacao(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        with DatabaseManager() as conn:
            create_tables(conn)
            cursor = conn.cursor()

            # Limpar registros de teste
            cursor.execute("DELETE FROM pessoas WHERE cpf_cnpj IN ('99112233445', '88112233445', '77112233445', '00011122233', '55112233445')")

            # 1. Profissional
            cursor.execute("""
                INSERT INTO profissionais (nome, registro, codigo_credenciado)
                VALUES ('Dr. Geodésico', '12345/PR', 'XYZW')
            """)
            cls.prof_id = cursor.lastrowid

            # 2. Propriedade
            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, municipio, uf)
                VALUES ('Fazenda das Flores', 'Cascavel', 'PR')
            """)
            cls.prop_id = cursor.lastrowid

            # 3. Levantamento
            cursor.execute("""
                INSERT INTO levantamentos (propriedade_id, profissional_id, status, data_inicio)
                VALUES (?, ?, 'EM_ANDAMENTO', '2026-03-01')
            """, (cls.prop_id, cls.prof_id))
            cls.lev_id = cursor.lastrowid
            conn.commit()

    def test_ciclo_completo_qualificacao_confrontante(self):
        # 1. Cadastrar confrontante via POST
        payload_novo = {
            "nome": "Sebastião da Silva",
            "cpf_cnpj": "991.122.334-45",
            "genero": "M",
            "rg": "12.345.678-PR",
            "nacionalidade": "brasileiro(a)",
            "profissao": "produtor rural",
            "estado_civil": "casado",
            "regime_bens": "comunhao_universal",
            "endereco_completo": "Linha 3, Km 12 - Interior",
            "nome_conjuge": "Maria das Dores Silva",
            "cpf_conjuge": "881.122.334-45",
            "rg_conjuge": "23.456.789-PR",
            "genero_conjuge": "F",
            "nacionalidade_conjuge": "brasileiro(a)",
            "profissao_conjuge": "do lar",
            "matricula_imovel": "Matrícula 12.345",
            "tipo_relacao": "vizinho"
        }

        res_post = self.client.post(f"/levantamentos/{self.lev_id}/confrontantes", json=payload_novo)
        self.assertEqual(res_post.status_code, 200, f"Erro ao criar confrontante: {res_post.text}")
        data_post = res_post.json()
        cid = data_post.get("id") or data_post.get("confrontante_id")
        self.assertIsNotNone(cid)

        # 2. Listar confrontantes e validar retorno enriquecido com cônjuge e gênero
        res_list = self.client.get(f"/levantamentos/{self.lev_id}/confrontantes")
        self.assertEqual(res_list.status_code, 200)
        confs = res_list.json()
        conf_criado = next((c for c in confs if c["id"] == cid), None)
        self.assertIsNotNone(conf_criado)
        self.assertEqual(conf_criado["nome"], "Sebastião da Silva")
        self.assertEqual(conf_criado["genero"], "M")
        self.assertEqual(conf_criado["genero_conjuge"], "F")
        self.assertEqual(conf_criado["nome_conjuge"], "Maria das Dores Silva")
        self.assertEqual(conf_criado["profissao_conjuge"], "do lar")

        # 3. Buscar por CPF e verificar auto-fill
        res_cpf = self.client.get("/confrontantes/buscar-por-cpf?cpf=99112233445")
        self.assertEqual(res_cpf.status_code, 200)
        data_cpf = res_cpf.json()
        self.assertEqual(data_cpf["nome"], "Sebastião da Silva")
        self.assertEqual(data_cpf["rg"], "12.345.678-PR")
        self.assertEqual(data_cpf["nome_conjuge"], "Maria das Dores Silva")

        # 4. Atualizar confrontante via PUT
        payload_update = dict(payload_novo)
        payload_update["profissao"] = "empresário rural"
        payload_update["profissao_conjuge"] = "professora"
        payload_update["matricula_imovel"] = "Matrícula 99.999"

        res_put = self.client.put(f"/confrontantes/{cid}", json=payload_update)
        self.assertEqual(res_put.status_code, 200, f"Erro ao atualizar confrontante: {res_put.text}")

        # Validar persistência da atualização
        res_list2 = self.client.get(f"/levantamentos/{self.lev_id}/confrontantes")
        conf_atualizado = next((c for c in res_list2.json() if c["id"] == cid), None)
        self.assertIsNotNone(conf_atualizado)
        self.assertEqual(conf_atualizado["profissao"], "empresário rural")
        self.assertEqual(conf_atualizado["profissao_conjuge"], "professora")
        self.assertEqual(conf_atualizado["matricula_imovel"], "Matrícula 99.999")

    def test_atualizar_confrontante_para_cpf_existente_sem_conflito_unique(self):
        # Cria uma pessoa existente previamente
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM pessoas WHERE cpf_cnpj = '77112233445'")
            cursor.execute("""
                INSERT INTO pessoas (nome, cpf_cnpj, rg, genero, profissao)
                VALUES ('Pessoa Previa', '77112233445', '777-PR', 'M', 'Engenheiro')
            """)
            pessoa_previa_id = cursor.lastrowid
            conn.commit()

        # Cria um confrontante avulso com outro CPF
        payload_avulso = {
            "nome": "Confrontante Avulso",
            "cpf_cnpj": "000.111.222-33",
            "genero": "M"
        }
        res_post = self.client.post(f"/levantamentos/{self.lev_id}/confrontantes", json=payload_avulso)
        self.assertEqual(res_post.status_code, 200)
        cid = res_post.json().get("id") or res_post.json().get("confrontante_id")

        # Tenta atualizar o confrontante para o CPF da 'Pessoa Previa' (que causava crash UNIQUE antes do fix)
        payload_update = {
            "nome": "Pessoa Previa Atualizada",
            "cpf_cnpj": "771.122.334-45",
            "rg": "777-PR",
            "genero": "M",
            "profissao": "Engenheiro Agrônomo"
        }
        res_put = self.client.put(f"/confrontantes/{cid}", json=payload_update)
        self.assertEqual(res_put.status_code, 200, f"Falha ao vincular a CPF já existente: {res_put.text}")
        data_put = res_put.json()
        self.assertEqual(data_put["pessoa_id"], pessoa_previa_id)

    def test_confrontante_sem_pessoa_id_ao_atualizar(self):
        # Inserir diretamente um confrontante com pessoa_id = NULL
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO confrontantes (levantamento_id, nome, cpf_cnpj)
                VALUES (?, 'Legado Sem Pessoa', '55112233445')
            """, (self.lev_id,))
            cid_legado = cursor.lastrowid
            conn.commit()

        # GET deve funcionar perfeitamente com LEFT JOIN
        res_get = self.client.get(f"/levantamentos/{self.lev_id}/confrontantes")
        self.assertEqual(res_get.status_code, 200)
        conf_legado = next((c for c in res_get.json() if c["id"] == cid_legado), None)
        self.assertIsNotNone(conf_legado)
        self.assertEqual(conf_legado["nome"], "Legado Sem Pessoa")

        # PUT deve criar pessoa e vincular pessoa_id
        payload_legado = {
            "nome": "Legado Agora Vinculado",
            "cpf_cnpj": "551.122.334-45",
            "genero": "F",
            "profissao": "Arquiteta"
        }
        res_put = self.client.put(f"/confrontantes/{cid_legado}", json=payload_legado)
        self.assertEqual(res_put.status_code, 200)
        self.assertIsNotNone(res_put.json().get("pessoa_id"))

if __name__ == '__main__':
    unittest.main()
