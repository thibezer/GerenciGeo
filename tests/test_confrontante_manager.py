import unittest
import sqlite3
from database.models import create_tables
from services.gestores.confrontante_manager import resolver_confrontantes_planilha

class TestConfrontanteManager(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.cursor = self.conn.cursor()
        
        # Criar schema em memória
        self.cursor.execute("""
            CREATE TABLE IF NOT EXISTS levantamentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome_propriedade TEXT
            )
        """)
        self.cursor.execute("""
            CREATE TABLE IF NOT EXISTS pessoas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL
            )
        """)
        self.cursor.execute("""
            CREATE TABLE IF NOT EXISTS confrontantes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pessoa_id INTEGER NOT NULL,
                levantamento_id INTEGER NOT NULL,
                nome TEXT,
                matricula_imovel TEXT,
                cns_confrontante TEXT,
                FOREIGN KEY (pessoa_id) REFERENCES pessoas(id)
            )
        """)
        
        # Inserir levantamento de teste
        self.cursor.execute("INSERT INTO levantamentos (nome_propriedade) VALUES ('Fazenda Teste')")
        self.lev_id = self.cursor.lastrowid
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_resolver_confrontantes_planilha_cria_pessoa_e_confrontante(self):
        pontos_mock = [
            {
                "codigo_completo": "VRT-0001",
                "confrontante_descritivo": "Limita com a propriedade de JOAO DA SILVA",
                "matricula_confrontante": "1234",
                "cns_confrontante": "08.524-1"
            }
        ]
        
        # Executar a resolução que insere confrontante novo
        res = resolver_confrontantes_planilha(self.lev_id, pontos_mock, self.cursor)
        
        self.assertIn("VRT-0001", res)
        conf_id = res["VRT-0001"]
        self.assertIsNotNone(conf_id)
        
        # Verificar se inseriu na tabela confrontantes e pessoas
        self.cursor.execute("SELECT * FROM confrontantes WHERE id = ?", (conf_id,))
        conf_row = self.cursor.fetchone()
        self.assertIsNotNone(conf_row)
        self.assertIsNotNone(conf_row["pessoa_id"])
        
        self.cursor.execute("SELECT * FROM pessoas WHERE id = ?", (conf_row["pessoa_id"],))
        pessoa_row = self.cursor.fetchone()
        self.assertIsNotNone(pessoa_row)
        self.assertIn("JOAO DA SILVA", pessoa_row["nome"])

if __name__ == '__main__':
    unittest.main()
