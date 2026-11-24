import unittest
from fastapi.testclient import TestClient
import bcrypt

from api import app
from database.connection import DatabaseManager, execute_query

client = TestClient(app)


class TestAuth(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM users")
            hashed_pwd = bcrypt.hashpw("senha123".encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")
            cursor.execute(
                """
                INSERT INTO users (id, name, email, password, role, is_blocked)
                VALUES (1, 'Usuário Teste', 'teste@gerencigeo.com.br', ?, 'admin', 0)
                """,
                (hashed_pwd,)
            )
            # Insere um usuário bloqueado para teste
            cursor.execute(
                """
                INSERT INTO users (id, name, email, password, role, is_blocked)
                VALUES (2, 'Usuário Bloqueado', 'bloqueado@gerencigeo.com.br', ?, 'user', 1)
                """,
                (hashed_pwd,)
            )

    def test_login_sucesso(self):
        res = client.post("/auth/login", json={
            "email": "teste@gerencigeo.com.br",
            "password": "senha123",
            "remember_me": True
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("token", data)
        self.assertIn("user", data)
        self.assertEqual(data["user"]["email"], "teste@gerencigeo.com.br")
        self.assertEqual(data["user"]["name"], "Usuário Teste")
        self.assertNotIn("password", data["user"])
        self.assertNotIn("reset_password_token", data["user"])

    def test_login_senha_incorreta(self):
        res = client.post("/auth/login", json={
            "email": "teste@gerencigeo.com.br",
            "password": "senha_errada"
        })
        self.assertEqual(res.status_code, 401)
        self.assertIn("E-mail ou senha incorretos", res.json()["detail"])

    def test_login_usuario_inexistente(self):
        res = client.post("/auth/login", json={
            "email": "naoexiste@gerencigeo.com.br",
            "password": "qualquersenha"
        })
        self.assertEqual(res.status_code, 401)
        self.assertIn("E-mail ou senha incorretos", res.json()["detail"])

    def test_login_usuario_bloqueado(self):
        res = client.post("/auth/login", json={
            "email": "bloqueado@gerencigeo.com.br",
            "password": "senha123"
        })
        self.assertEqual(res.status_code, 403)
        self.assertIn("bloquearam o seu acesso", res.json()["detail"])

    def test_auth_me_e_logout(self):
        login_res = client.post("/auth/login", json={
            "email": "teste@gerencigeo.com.br",
            "password": "senha123"
        })
        token = login_res.json()["token"]

        me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.json()["user"]["email"], "teste@gerencigeo.com.br")

        logout_res = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(logout_res.status_code, 200)
        self.assertEqual(logout_res.json()["status"], "success")

    def test_forgot_password_resposta_neutra(self):
        res = client.post("/auth/forgot-password", json={
            "email": "qualquer@email.com"
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "success")

    def test_register_pendente_aprovacao(self):
        res = client.post("/auth/register", json={
            "name": "Novo Usuário",
            "email": "novo@gerencigeo.com.br",
            "password": "senha_segura_123"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertTrue(data["pending_approval"])
        self.assertIsNone(data["token"])
        self.assertEqual(data["user"]["role"], "user")
        self.assertEqual(data["user"]["is_blocked"], 1)

        # Login antes da aprovação deve ser bloqueado (403)
        login_res = client.post("/auth/login", json={
            "email": "novo@gerencigeo.com.br",
            "password": "senha_segura_123"
        })
        self.assertEqual(login_res.status_code, 403)

    def test_register_primeiro_usuario_vira_admin_ativo(self):
        with DatabaseManager() as conn:
            conn.execute("DELETE FROM users")
            conn.commit()
        res = client.post("/auth/register", json={
            "name": "Primeiro Admin",
            "email": "primeiro@gerencigeo.com.br",
            "password": "senha_segura_123"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data["pending_approval"])
        self.assertTrue(data["token"])
        self.assertEqual(data["user"]["role"], "admin")
        self.assertEqual(data["user"]["is_blocked"], 0)

    def test_controle_acessos_admin_e_seguranca(self):
        # Login como admin
        admin_login = client.post("/auth/login", json={
            "email": "teste@gerencigeo.com.br",
            "password": "senha123"
        })
        admin_token = admin_login.json()["token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Sem token -> 401
        self.assertEqual(client.get("/auth/users").status_code, 401)

        # Novo usuário se cadastra (entra bloqueado)
        reg = client.post("/auth/register", json={
            "name": "Operador Campo",
            "email": "campo@gerencigeo.com.br",
            "password": "senha_campo_123"
        }).json()
        novo_id = reg["user"]["id"]

        # Admin lista usuários
        lst = client.get("/auth/users", headers=admin_headers)
        self.assertEqual(lst.status_code, 200)
        self.assertTrue(any(u["id"] == novo_id and u["is_blocked"] == 1 for u in lst.json()["users"]))

        # Admin aprova usuário
        upd = client.put(f"/auth/users/{novo_id}", headers=admin_headers, json={"is_blocked": 0, "role": "moderator"})
        self.assertEqual(upd.status_code, 200)
        self.assertEqual(upd.json()["user"]["is_blocked"], 0)
        self.assertEqual(upd.json()["user"]["role"], "moderator")

        # Agora usuário aprovado consegue logar, mas NÃO pode acessar /auth/users (403)
        user_login = client.post("/auth/login", json={
            "email": "campo@gerencigeo.com.br",
            "password": "senha_campo_123"
        })
        self.assertEqual(user_login.status_code, 200)
        user_token = user_login.json()["token"]
        user_headers = {"Authorization": f"Bearer {user_token}"}
        self.assertEqual(client.get("/auth/users", headers=user_headers).status_code, 403)

        # Usuário comum consegue trocar a própria senha
        chg = client.post("/auth/change-password", headers=user_headers, json={
            "current_password": "senha_campo_123",
            "new_password": "nova_senha_campo"
        })
        self.assertEqual(chg.status_code, 200)

        # Admin bloqueia usuário -> sessão do usuário é revogada imediatamente
        blk = client.put(f"/auth/users/{novo_id}", headers=admin_headers, json={"is_blocked": 1})
        self.assertEqual(blk.status_code, 200)
        self.assertEqual(client.get("/auth/me", headers=user_headers).status_code, 401)

        # Admin não pode bloquear nem excluir a si mesmo
        self.assertEqual(client.put("/auth/users/1", headers=admin_headers, json={"is_blocked": 1}).status_code, 400)
        self.assertEqual(client.delete("/auth/users/1", headers=admin_headers).status_code, 400)

    def test_register_email_duplicado(self):
        res = client.post("/auth/register", json={
            "name": "Outro Nome",
            "email": "teste@gerencigeo.com.br",
            "password": "senha_segura_123"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("já está cadastrado", res.json()["detail"])

    def test_register_senha_curta(self):
        res = client.post("/auth/register", json={
            "name": "Nome Válido",
            "email": "curto@gerencigeo.com.br",
            "password": "123"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("no mínimo 6 caracteres", res.json()["detail"])

    def test_register_campos_obrigatorios(self):
        res = client.post("/auth/register", json={
            "name": "",
            "email": "semnome@gerencigeo.com.br",
            "password": "senha_segura_123"
        })
        self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()

