import logging

logger = logging.getLogger(__name__)

def create_tables(conn):
    """Executa os scripts DDL de criação inicial do banco respeitando a hierarquia de chaves estrangeiras"""
    scripts = [
        """
        CREATE TABLE IF NOT EXISTS profissionais (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            registro TEXT NOT NULL,          
            codigo_credenciado TEXT NOT NULL, 
            contador_m INTEGER DEFAULT 0,    
            contador_p INTEGER DEFAULT 0,    
            contador_v INTEGER DEFAULT 0,    
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
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
        """,
        """
        CREATE TABLE IF NOT EXISTS cliente_metadados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_cliente INTEGER NOT NULL,
            chave TEXT NOT NULL,
            valor TEXT,
            FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS cliente_historico_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_cliente INTEGER NOT NULL,
            campo_alterado TEXT NOT NULL,
            valor_antigo TEXT,
            valor_novo TEXT,
            data_alteracao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS propriedades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_propriedade TEXT NOT NULL,
            codigo_car TEXT,
            codigo_ccir TEXT,
            municipio TEXT NOT NULL,
            uf TEXT NOT NULL CHECK(length(uf) = 2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS propriedade_clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            propriedade_id INTEGER NOT NULL,
            cliente_id INTEGER NOT NULL,
            percentual_participacao REAL,    
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS matriculas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            propriedade_id INTEGER NOT NULL,
            numero_matricula TEXT NOT NULL,
            ccir TEXT,
            itr TEXT,
            area_ha REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS levantamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            propriedade_id INTEGER NOT NULL,
            profissional_id INTEGER NOT NULL,
            data_inicio DATE NOT NULL,
            pasta_projeto TEXT,
            status TEXT DEFAULT 'EM_ANDAMENTO' CHECK(status IN ('EM_ANDAMENTO', 'CONCLUIDO', 'ARQUIVADO')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
            FOREIGN KEY (profissional_id) REFERENCES profissionais(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS pontos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            levantamento_id INTEGER NOT NULL,
            matricula_id INTEGER NOT NULL,
            nome_vertice TEXT NOT NULL,       
            tipo_ponto TEXT NOT NULL CHECK(tipo_ponto IN ('M','P','V')),
            lat REAL,
            lon REAL,
            alt REAL,
            sigma_lat REAL,                   
            sigma_lon REAL,                
            sigma_alt REAL,                     
            ordem_caminhamento INTEGER,       
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            -- Rastreabilidade Geodésica Avançada (Manifesto v2.2.0)
            n_original REAL,
            e_original REAL,
            alt_original REAL,
            lat_corrigido REAL,
            lon_corrigido REAL,
            alt_corrigido REAL,
            sigma_n REAL,
            sigma_e REAL,
            sigma_z REAL,
            
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
            FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS confrontantes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            levantamento_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            cpf_cnpj TEXT,
            tipo_relacao TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS segmentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            levantamento_id INTEGER NOT NULL,
            matricula_id INTEGER NOT NULL,
            ponto_inicio_id INTEGER NOT NULL,
            ponto_fim_id INTEGER NOT NULL,
            confrontante_id INTEGER,
            tipo_limite_sigef TEXT NOT NULL,
            metodo_posicionamento_sigef TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
            FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE,
            FOREIGN KEY (ponto_inicio_id) REFERENCES pontos(id) ON DELETE CASCADE,
            FOREIGN KEY (ponto_fim_id) REFERENCES pontos(id) ON DELETE CASCADE,
            FOREIGN KEY (confrontante_id) REFERENCES confrontantes(id) ON DELETE SET NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS municipios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            uf TEXT NOT NULL,
            UNIQUE(nome, uf)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS historico_rinex (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            arquivo_nome TEXT NOT NULL,
            arquivo_tamanho INTEGER NOT NULL,
            arquivo_path TEXT NOT NULL,
            ponto_nome TEXT,
            data_inicio TIMESTAMP,
            data_fim TIMESTAMP,
            latitude REAL,
            longitude REAL,
            sucesso BOOLEAN NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS pendencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            descricao TEXT,
            status TEXT DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE', 'CONCLUIDO')),
            prioridade TEXT DEFAULT 'MEDIA' CHECK(prioridade IN ('ALTA', 'MEDIA', 'BAIXA')),
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    ]

    try:
        cursor = conn.cursor()
        for script in scripts:
            cursor.execute(script)
        logger.info("Tabelas SQLite verificadas/criadas com sucesso.")
        
        # Migração Automática Avançada (Manifesto v2.2.0)
        # Adiciona dinamicamente as colunas do "Antes e Depois" geodésico se elas não existirem no banco físico
        colunas_novas = [
            ("n_original", "REAL"),
            ("e_original", "REAL"),
            ("alt_original", "REAL"),
            ("lat_corrigido", "REAL"),
            ("lon_corrigido", "REAL"),
            ("alt_corrigido", "REAL"),
            ("sigma_n", "REAL"),
            ("sigma_e", "REAL"),
            ("sigma_z", "REAL"),
            ("arquivo_rinex", "TEXT"),
            ("arquivo_resultado_ppp", "TEXT")
        ]
        
        cursor.execute("PRAGMA table_info(pontos)")
        colunas_existentes = {row[1] for row in cursor.fetchall()}
        
        for col, tipo in colunas_novas:
            if col not in colunas_existentes:
                try:
                    cursor.execute(f"ALTER TABLE pontos ADD COLUMN {col} {tipo}")
                    logger.info(f"Coluna migrada com sucesso em pontos: {col}")
                except Exception as ex_mig:
                    logger.warning(f"Aviso de migração automática para coluna {col}: {ex_mig}")
        
        # Migração dinâmica para a tabela propriedades (codigo_ccir)
        colunas_propriedades = [
            ("codigo_ccir", "TEXT")
        ]
        cursor.execute("PRAGMA table_info(propriedades)")
        colunas_propriedades_existentes = {row[1] for row in cursor.fetchall()}
        for col, tipo in colunas_propriedades:
            if col not in colunas_propriedades_existentes:
                try:
                    cursor.execute(f"ALTER TABLE propriedades ADD COLUMN {col} {tipo}")
                    logger.info(f"Coluna migrada com sucesso em propriedades: {col}")
                except Exception as ex_mig:
                    logger.warning(f"Aviso de migração automática para coluna {col} em propriedades: {ex_mig}")
        
        conn.commit()
    except Exception as e:
        logger.error(f"Erro ao criar tabelas ou executar migrações: {e}")
        raise e
