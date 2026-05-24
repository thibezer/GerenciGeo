import sqlite3
import os

db_path = "gerencigeo.db"

def migrate():
    if not os.path.exists(db_path):
        print("Banco não encontrado.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Lista de tabelas para garantir que existam
    tables_to_recreate = ["clientes", "cliente_metadados", "cliente_historico_logs"]
    
    # Para simplificar e garantir a nova estrutura, vamos renomear a antiga e criar a nova
    # Se houver dados, tentamos migrar o básico.
    
    print("Iniciando migração da tabela clientes...")
    
    try:
        # 1. Renomear tabela antiga
        cursor.execute("ALTER TABLE clientes RENAME TO clientes_old;")
    except sqlite3.OperationalError:
        print("Tabela clientes não existe ou já foi renomeada.")
        # Se não existe, não fazemos nada aqui, a criação normal cuidará disso
    
    # 2. Criar tabelas com a estrutura nova
    # (Copiado de models.py)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_completo TEXT NOT NULL,              
            cpf_cnpj TEXT UNIQUE NOT NULL,
            rg_ie TEXT,
            data_nascimento_fundacao DATE,
            estado_civil TEXT,               
            profissao TEXT,
            nacionalidade TEXT,
            nome_conjuge TEXT,
            cpf_conjuge TEXT,
            rg_conjuge TEXT,
            regime_bens TEXT,
            email TEXT,
            telefone TEXT,
            endereco_completo TEXT,
            cidade TEXT,
            estado TEXT,
            cep TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cliente_metadados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_cliente INTEGER NOT NULL,
            chave TEXT NOT NULL,
            valor TEXT,
            FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE CASCADE
        );
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cliente_historico_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_cliente INTEGER NOT NULL,
            campo_alterado TEXT NOT NULL,
            valor_antigo TEXT,
            valor_novo TEXT,
            data_alteracao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE CASCADE
        );
    """)
    
    # 3. Migrar dados se possível
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='clientes_old'")
        if cursor.fetchone():
            cursor.execute("SELECT id, nome, cpf_cnpj, estado_civil, profissao, nome_conjuge, cpf_conjuge, regime_bens, municipio, uf, contato, created_at FROM clientes_old")
            old_rows = cursor.fetchall()
            for row in old_rows:
                # Mapeamento básico
                # municipio -> cidade
                # uf -> estado
                # contato -> telefone (ou email)
                cursor.execute("""
                    INSERT INTO clientes (id, nome_completo, cpf_cnpj, estado_civil, profissao, nome_conjuge, cpf_conjuge, regime_bens, cidade, estado, telefone, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11]))
            print(f"Migrados {len(old_rows)} registros de clientes.")
            cursor.execute("DROP TABLE clientes_old;")
        else:
            print("Sem dados antigos para migrar (tabela clientes_old não encontrada).")
    except Exception as e:
        print(f"Erro durante a migração de dados antigos: {e}")

    conn.commit()
    conn.close()
    print("Migração concluída com sucesso.")

if __name__ == "__main__":
    migrate()
