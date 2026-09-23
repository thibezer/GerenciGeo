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


if __name__ == "__main__":
    unittest.main()
