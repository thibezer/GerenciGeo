import sqlite3
import os

db_path = "gerencigeo.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Desativa foreign keys temporariamente para podermos recriar as tabelas sem quebrar constraints
cursor.execute("PRAGMA foreign_keys = OFF;")

tables_to_fix = [
    {
        "name": "propriedade_clientes",
        "create_sql": """
        CREATE TABLE propriedade_clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            propriedade_id INTEGER NOT NULL,
            cliente_id INTEGER NOT NULL,
            percentual_participacao REAL,    
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        );
        """,
        "cols": ["id", "propriedade_id", "cliente_id", "percentual_participacao", "created_at"]
    },
    {
        "name": "cliente_metadados",
        "create_sql": """
        CREATE TABLE cliente_metadados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_cliente INTEGER NOT NULL,
            chave TEXT NOT NULL,
            valor TEXT,
            FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE CASCADE
        );
        """,
        "cols": ["id", "id_cliente", "chave", "valor"]
    },
    {
        "name": "cliente_historico_logs",
        "create_sql": """
        CREATE TABLE cliente_historico_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_cliente INTEGER NOT NULL,
            campo_alterado TEXT NOT NULL,
            valor_antigo TEXT,
            valor_novo TEXT,
            data_alteracao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE CASCADE
        );
        """,
        "cols": ["id", "id_cliente", "campo_alterado", "valor_antigo", "valor_novo", "data_alteracao"]
    }
]

for table in tables_to_fix:
    name = table["name"]
    print(f"Corrigindo chaves estrangeiras da tabela: {name}...")
    
    # Verifica se a tabela atual existe
    cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{name}'")
    if not cursor.fetchone():
        print(f"Tabela {name} não existe. Criando tabela nova diretamente...")
        cursor.execute(table["create_sql"])
        continue

    # 1. Renomeia a tabela antiga
    cursor.execute(f"ALTER TABLE {name} RENAME TO {name}_old;")
    
    # 2. Cria a nova tabela com a foreign key correta
    cursor.execute(table["create_sql"])
    
    # 3. Copia os dados se existirem
    cols_str = ", ".join(table["cols"])
    try:
        cursor.execute(f"INSERT INTO {name} ({cols_str}) SELECT {cols_str} FROM {name}_old;")
        print(f"Dados da tabela {name} migrados com sucesso.")
    except Exception as e:
        print(f"Erro ou sem dados para migrar em {name}: {e}")
        
    # 4. Drop na tabela antiga
    cursor.execute(f"DROP TABLE {name}_old;")

# Reativa foreign keys
cursor.execute("PRAGMA foreign_keys = ON;")
conn.commit()
conn.close()
print("Correção das chaves estrangeiras concluída!")
