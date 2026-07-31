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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            endereco TEXT,
            nacionalidade TEXT DEFAULT 'brasileiro(a)',
            formacao TEXT,
            cpf TEXT,
            rg TEXT,
            conselho TEXT,
            endereco_residencial TEXT
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS pessoas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cpf_cnpj TEXT UNIQUE,
            rg TEXT,
            nacionalidade TEXT,
            profissao TEXT,
            estado_civil TEXT,
            regime_bens TEXT,
            endereco_completo TEXT,
            nome_conjuge TEXT,
            cpf_conjuge TEXT,
            rg_conjuge TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pessoa_id INTEGER NOT NULL,
            data_nascimento_fundacao DATE,
            email TEXT,
            telefone TEXT,
            cidade TEXT,
            estado TEXT,
            cep TEXT,
            sexo TEXT DEFAULT 'M',
            senha_gov TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE CASCADE
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
            caminho_arquivo_car TEXT,
            caminho_arquivo_ccir TEXT,
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
            cri_comarca TEXT,
            cri_circunscricao TEXT,
            livro_registro TEXT,
            folha_registro TEXT,
            valor_itr REAL,
            denominacao TEXT,
            georreferenciamento TEXT,
            caminho_arquivo_pdf TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS matricula_historico_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_matricula INTEGER NOT NULL,
            campo_alterado TEXT NOT NULL,
            valor_antigo TEXT,
            valor_novo TEXT,
            data_alteracao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_matricula) REFERENCES matriculas(id) ON DELETE CASCADE
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
            numero_trt TEXT,
            data_trt TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
            FOREIGN KEY (profissional_id) REFERENCES profissionais(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS pontos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            levantamento_id INTEGER NOT NULL,
            matricula_id INTEGER,
            nome_vertice TEXT NOT NULL,       
            nome_original TEXT,
            tipo_ponto TEXT NOT NULL CHECK(tipo_ponto IN ('M','P','V','B')),
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
            arquivo_rinex TEXT,
            arquivo_resultado_ppp TEXT,
            
            -- Múltiplas Bases, Estados de Rover e Ajuste de Caminhamento
            status_ponto TEXT DEFAULT 'BRUTO' CHECK(status_ponto IN ('BRUTO', 'CORRIGIDO')),
            ponto_base_id INTEGER,
            metodo_posicionamento TEXT DEFAULT 'PG1',
            arquivo_origem TEXT,
            status_correcao TEXT DEFAULT 'BRUTO' CHECK(status_correcao IN ('BRUTO', 'CORRIGIDO')),
            ignorar_poligono INTEGER DEFAULT 0 CHECK(ignorar_poligono IN (0, 1)),
            origem_homologada INTEGER DEFAULT 0,
            confrontante_id INTEGER,
            ponto_vizinho INTEGER DEFAULT 0 CHECK(ponto_vizinho IN (0, 1)),
            dados_vizinho_json TEXT,
            sequencia_travada_id TEXT,
            
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
            FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE SET NULL,
            FOREIGN KEY (ponto_base_id) REFERENCES pontos(id) ON DELETE SET NULL,
            FOREIGN KEY (confrontante_id) REFERENCES confrontantes(id) ON DELETE SET NULL,
            UNIQUE(levantamento_id, matricula_id, nome_vertice, tipo_ponto)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS confrontantes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pessoa_id INTEGER,
            levantamento_id INTEGER NOT NULL,
            nome TEXT,
            cpf_cnpj TEXT,
            tipo_relacao TEXT,
            rg TEXT,
            nacionalidade TEXT DEFAULT 'brasileiro(a)',
            profissao TEXT,
            estado_civil TEXT,
            regime_bens TEXT,
            endereco_completo TEXT,
            nome_conjuge TEXT,
            cpf_conjuge TEXT,
            rg_conjuge TEXT,
            matricula_imovel TEXT,
            cns_confrontante TEXT, -- ADICIONADO CONFORME PLANO v2.3
            caminho_matricula_pdf TEXT,
            nome_propriedade TEXT,
            codigo_incra_imovel TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL,
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
            origem_homologada INTEGER DEFAULT 0,
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
        """,
        """
        CREATE TABLE IF NOT EXISTS anuencias_confrontantes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            levantamento_id INTEGER NOT NULL,
            confrontante_id INTEGER NOT NULL,
            status_anuencia TEXT DEFAULT 'PENDENTE' CHECK(status_anuencia IN ('PENDENTE', 'GERADO', 'ASSINADO', 'DISPENSADO')),
            caminho_documento_assinado TEXT,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
            FOREIGN KEY (confrontante_id) REFERENCES confrontantes(id) ON DELETE CASCADE,
            UNIQUE(levantamento_id, confrontante_id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS historico_alteracoes_campo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            levantamento_id INTEGER NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            tipo_evento TEXT NOT NULL,
            descricao TEXT NOT NULL,
            dados_detalhados TEXT,
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS logs_auditoria_seguranca (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            levantamento_id INTEGER NOT NULL,
            rota TEXT NOT NULL,
            metodo TEXT NOT NULL,
            usuario TEXT DEFAULT 'Operador_Sistema',
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS banco_pontos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profissional_id INTEGER NOT NULL,
            levantamento_id INTEGER,
            matricula_id INTEGER,
            tipo_ponto TEXT NOT NULL CHECK(tipo_ponto IN ('M', 'P', 'V', 'B')),
            numero INTEGER NOT NULL,
            codigo_completo TEXT NOT NULL,
            norte REAL,
            este REAL,
            altitude REAL,
            lat REAL,
            lon REAL,
            sigma_n REAL,
            sigma_e REAL,
            sigma_z REAL,
            metodo_posicionamento TEXT,
            tipo_limite TEXT,
            cns_confrontante TEXT,
            matricula_confrontante TEXT,
            confrontante_descritivo TEXT,
            planilha_origem TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profissional_id) REFERENCES profissionais(id) ON DELETE CASCADE,
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE SET NULL,
            FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE,
            UNIQUE(levantamento_id, planilha_origem, codigo_completo)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS ccir_cadastros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_imovel TEXT NOT NULL,
            denominacao TEXT,
            codigo_municipio TEXT,
            municipio TEXT,
            uf TEXT,
            area_total REAL,
            titular TEXT,
            natureza_juridica TEXT,
            condicao_pessoa TEXT,
            percentual_detencao REAL,
            pais TEXT,
            arquivo_origem TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ccir_codigo ON ccir_cadastros(codigo_imovel);
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ccir_titular ON ccir_cadastros(titular);
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ccir_municipio ON ccir_cadastros(municipio);
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
            ("nome_original", "TEXT"),
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
            ("arquivo_resultado_ppp", "TEXT"),
            ("status_ponto", "TEXT DEFAULT 'BRUTO'"),
            ("ponto_base_id", "INTEGER"),
            ("metodo_posicionamento", "TEXT DEFAULT 'PG1'"),
            ("arquivo_origem", "TEXT"),
            ("status_correcao", "TEXT DEFAULT 'BRUTO'"),
            ("ignorar_poligono", "INTEGER DEFAULT 0"),
            ("origem_homologada", "INTEGER DEFAULT 0"),
            ("confrontante_id", "INTEGER"),
            ("ponto_vizinho", "INTEGER DEFAULT 0"),
            ("dados_vizinho_json", "TEXT"),
            ("sequencia_travada_id", "TEXT")
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
                    
        # Inicializa o nome_original para registros antigos que agora possuem a coluna nome_original
        try:
            cursor.execute("UPDATE pontos SET nome_original = nome_vertice WHERE nome_original IS NULL")
            logger.info("Valores de nome_original inicializados com sucesso na tabela pontos.")
        except Exception as ex_init:
            logger.warning(f"Erro ao inicializar nome_original na tabela pontos: {ex_init}")

        # Cria o trigger que garante nome_original = nome_vertice no insert
        try:
            cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS trg_pontos_nome_original 
            AFTER INSERT ON pontos 
            FOR EACH ROW 
            WHEN NEW.nome_original IS NULL
            BEGIN
                UPDATE pontos SET nome_original = NEW.nome_vertice WHERE id = NEW.id;
            END;
            """)
            logger.info("Trigger trg_pontos_nome_original verificado/criado com sucesso.")
        except Exception as ex_trg:
            logger.warning(f"Erro ao criar trigger trg_pontos_nome_original: {ex_trg}")
        
        # Migração dinâmica para a tabela propriedades (codigo_ccir)
        colunas_propriedades = [
            ("codigo_ccir", "TEXT"),
            ("caminho_arquivo_car", "TEXT"),
            ("caminho_arquivo_ccir", "TEXT")
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
        # Migração dinâmica para a tabela profissionais
        colunas_profissionais = [
            ("endereco", "TEXT"),
            ("nacionalidade", "TEXT DEFAULT 'brasileiro(a)'"),
            ("formacao", "TEXT"),
            ("cpf", "TEXT"),
            ("rg", "TEXT"),
            ("conselho", "TEXT"),
            ("endereco_residencial", "TEXT")
        ]
        cursor.execute("PRAGMA table_info(profissionais)")
        colunas_profissionais_existentes = {row[1] for row in cursor.fetchall()}
        for col, tipo in colunas_profissionais:
            if col not in colunas_profissionais_existentes:
                try:
                    cursor.execute(f"ALTER TABLE profissionais ADD COLUMN {col} {tipo}")
                    logger.info(f"Coluna migrada com sucesso em profissionais: {col}")
                except Exception as ex_mig:
                    logger.warning(f"Aviso de migração automática para coluna {col} em profissionais: {ex_mig}")

        # Migração dinâmica para a tabela levantamentos
        colunas_levantamentos = [
            ("numero_trt", "TEXT"),
            ("data_trt", "TEXT")
        ]
        cursor.execute("PRAGMA table_info(levantamentos)")
        colunas_levantamentos_existentes = {row[1] for row in cursor.fetchall()}
        for col, tipo in colunas_levantamentos:
            if col not in colunas_levantamentos_existentes:
                try:
                    cursor.execute(f"ALTER TABLE levantamentos ADD COLUMN {col} {tipo}")
                    logger.info(f"Coluna migrada com sucesso em levantamentos: {col}")
                except Exception as ex_mig:
                    logger.warning(f"Aviso de migração automática para coluna {col} em levantamentos: {ex_mig}")

        # Migração dinâmica para a tabela clientes
        colunas_clientes = [
            ("senha_gov", "TEXT")
        ]
        cursor.execute("PRAGMA table_info(clientes)")
        colunas_clientes_existentes = {row[1] for row in cursor.fetchall()}
        for col, tipo in colunas_clientes:
            if col not in colunas_clientes_existentes:
                try:
                    cursor.execute(f"ALTER TABLE clientes ADD COLUMN {col} {tipo}")
                    logger.info(f"Coluna migrada com sucesso em clientes: {col}")
                except Exception as ex_mig:
                    logger.warning(f"Aviso de migração automática para coluna {col} em clientes: {ex_mig}")

        # Migração dinâmica para a tabela confrontantes

        colunas_confrontantes = [
            # Colunas adicionadas ao esquema v2 (bancos legados não as têm → migração automática)
            ("nome", "TEXT"),
            ("cpf_cnpj", "TEXT"),
            ("pessoa_id", "INTEGER"),
            ("rg", "TEXT"),
            ("nacionalidade", "TEXT DEFAULT 'brasileiro(a)'"),
            ("profissao", "TEXT"),
            ("estado_civil", "TEXT"),
            ("regime_bens", "TEXT"),
            ("endereco_completo", "TEXT"),
            ("nome_conjuge", "TEXT"),
            ("cpf_conjuge", "TEXT"),
            ("rg_conjuge", "TEXT"),
            ("matricula_imovel", "TEXT"),
            ("cns_confrontante", "TEXT"),
            ("caminho_matricula_pdf", "TEXT"),
            ("nome_propriedade", "TEXT"),
            ("codigo_incra_imovel", "TEXT")
        ]
        cursor.execute("PRAGMA table_info(confrontantes)")
        colunas_confrontantes_existentes = {row[1] for row in cursor.fetchall()}
        for col, tipo in colunas_confrontantes:
            if col not in colunas_confrontantes_existentes:
                try:
                    cursor.execute(f"ALTER TABLE confrontantes ADD COLUMN {col} {tipo}")
                    logger.info(f"Coluna migrada com sucesso em confrontantes: {col}")
                except Exception as ex_mig:
                    logger.warning(f"Aviso de migração automática para coluna {col} em confrontantes: {ex_mig}")

        # Migração dinâmica para a tabela matriculas
        colunas_matriculas = [
            ("cri_comarca", "TEXT"),
            ("cri_circunscricao", "TEXT"),
            ("livro_registro", "TEXT"),
            ("folha_registro", "TEXT"),
            ("valor_itr", "REAL"),
            ("denominacao", "TEXT"),
            ("georreferenciamento", "TEXT"),
            ("caminho_arquivo_pdf", "TEXT")
        ]
        cursor.execute("PRAGMA table_info(matriculas)")
        colunas_matriculas_existentes = {row[1] for row in cursor.fetchall()}
        for col, tipo in colunas_matriculas:
            if col not in colunas_matriculas_existentes:
                try:
                    cursor.execute(f"ALTER TABLE matriculas ADD COLUMN {col} {tipo}")
                    logger.info(f"Coluna migrada com sucesso em matriculas: {col}")
                except Exception as ex_mig:
                    logger.warning(f"Aviso de migração automática para coluna {col} em matriculas: {ex_mig}")
        
        # Migração dinâmica para a tabela clientes
        colunas_clientes = [
            ("sexo", "TEXT DEFAULT 'M'")
        ]
        cursor.execute("PRAGMA table_info(clientes)")
        colunas_clientes_existentes = {row[1] for row in cursor.fetchall()}
        for col, tipo in colunas_clientes:
            if col not in colunas_clientes_existentes:
                try:
                    cursor.execute(f"ALTER TABLE clientes ADD COLUMN {col} {tipo}")
                    logger.info(f"Coluna migrada com sucesso em clientes: {col}")
                except Exception as ex_mig:
                    logger.warning(f"Aviso de migração automática para coluna {col} em clientes: {ex_mig}")
        
        # Migração dinâmica para a tabela banco_pontos
        colunas_banco_pontos = [
            ("norte", "REAL"),
            ("este", "REAL"),
            ("altitude", "REAL"),
            ("lat", "REAL"),
            ("lon", "REAL"),
            ("sigma_n", "REAL"),
            ("sigma_e", "REAL"),
            ("sigma_z", "REAL"),
            ("metodo_posicionamento", "TEXT"),
            ("tipo_limite", "TEXT"),
            ("cns_confrontante", "TEXT"),
            ("matricula_confrontante", "TEXT"),
            ("confrontante_descritivo", "TEXT"),
            ("matricula_id", "INTEGER"),
            ("planilha_origem", "TEXT")
        ]
        cursor.execute("PRAGMA table_info(banco_pontos)")
        colunas_banco_pontos_existentes = {row[1] for row in cursor.fetchall()}
        for col, tipo in colunas_banco_pontos:
            if col not in colunas_banco_pontos_existentes:
                try:
                    cursor.execute(f"ALTER TABLE banco_pontos ADD COLUMN {col} {tipo}")
                    logger.info(f"Coluna migrada com sucesso em banco_pontos: {col}")
                except Exception as ex_mig:
                    logger.warning(f"Aviso de migração automática para coluna {col} em banco_pontos: {ex_mig}")

        # Migração dinâmica para a tabela segmentos
        colunas_segmentos = [
            ("origem_homologada", "INTEGER DEFAULT 0")
        ]
        cursor.execute("PRAGMA table_info(segmentos)")
        colunas_segmentos_existentes = {row[1] for row in cursor.fetchall()}
        for col, tipo in colunas_segmentos:
            if col not in colunas_segmentos_existentes:
                try:
                    cursor.execute(f"ALTER TABLE segmentos ADD COLUMN {col} {tipo}")
                    logger.info(f"Coluna migrada com sucesso em segmentos: {col}")
                except Exception as ex_mig:
                    logger.warning(f"Aviso de migração automática para coluna {col} em segmentos: {ex_mig}")

        conn.commit()
        # Executa migração de restrição única composto em pontos se necessário
        migrar_restricao_unicidade_pontos(conn)
        # Executa migração de suporte ao status ARQUIVADO na tabela levantamentos se necessário
        migrar_status_arquivado_levantamentos(conn)
        # Executa migração de unicidade de banco_pontos por planilha se necessário
        migrar_restricao_unicidade_banco_pontos(conn)
        # BUGFIX: remove NOT NULL de pessoas.cpf_cnpj (confrontantes sem CPF/CNPJ
        # conhecido não conseguiam ser cadastrados — todo INSERT em pessoas falhava
        # com "NOT NULL constraint failed: pessoas.cpf_cnpj")
        migrar_cpf_cnpj_opcional_pessoas(conn)
    except Exception as e:
        logger.error(f"Erro ao criar tabelas ou executar migrações: {e}")
        raise e

def migrar_cpf_cnpj_opcional_pessoas(conn):
    """
    BUGFIX: a tabela 'pessoas' foi criada com 'cpf_cnpj TEXT UNIQUE NOT NULL'.
    Isso torna impossível cadastrar um confrontante sem CPF/CNPJ conhecido —
    o INSERT INTO pessoas falha com 'NOT NULL constraint failed: pessoas.cpf_cnpj'
    sempre que o formulário rápido de confrontantes (nome/matrícula/CNS) é usado
    sem informar CPF. Esta migração recria a tabela sem o NOT NULL, preservando
    todos os dados e o índice UNIQUE (SQLite permite múltiplos valores NULL em
    colunas UNIQUE sem conflito).
    """
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(pessoas)")
    colunas = cursor.fetchall()
    cpf_cnpj_not_null = False
    for col in colunas:
        # col: (cid, name, type, notnull, dflt_value, pk)
        if col[1] == "cpf_cnpj" and col[3] == 1:
            cpf_cnpj_not_null = True
            break

    if not cpf_cnpj_not_null:
        return  # já migrado ou banco novo criado sem essa restrição

    try:
        cursor.execute("BEGIN TRANSACTION;")
        cursor.execute("""
            CREATE TABLE pessoas_backup (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                cpf_cnpj TEXT UNIQUE,
                rg TEXT,
                nacionalidade TEXT,
                profissao TEXT,
                estado_civil TEXT,
                regime_bens TEXT,
                endereco_completo TEXT,
                nome_conjuge TEXT,
                cpf_conjuge TEXT,
                rg_conjuge TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cursor.execute("""
            INSERT INTO pessoas_backup (
                id, nome, cpf_cnpj, rg, nacionalidade, profissao, estado_civil,
                regime_bens, endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge, created_at
            )
            SELECT id, nome, cpf_cnpj, rg, nacionalidade, profissao, estado_civil,
                   regime_bens, endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge, created_at
            FROM pessoas;
        """)
        cursor.execute("DROP TABLE pessoas;")
        cursor.execute("ALTER TABLE pessoas_backup RENAME TO pessoas;")
        cursor.execute("COMMIT;")
        logger.info("[MIGRAÇÃO] Tabela 'pessoas' migrada com sucesso (cpf_cnpj agora é opcional).")
    except Exception as e:
        try:
            cursor.execute("ROLLBACK;")
        except Exception:
            pass
        logger.warning(f"Aviso de migração automática para pessoas.cpf_cnpj: {e}")

def migrar_restricao_unicidade_pontos(conn):
    """Garante a inserção da restrição UNIQUE composto na tabela pontos de forma segura e remove NOT NULL de matricula_id"""
    cursor = conn.cursor()
    
    # 1. Verifica se a coluna matricula_id é NOT NULL
    cursor.execute("PRAGMA table_info(pontos)")
    colunas = cursor.fetchall()
    matricula_is_not_null = False
    for col in colunas:
        if col[1] == 'matricula_id' and col[3] == 1:  # col[3] é notnull (1 se for NOT NULL)
            matricula_is_not_null = True
            break
            
    # 2. Verifica se já existe o índice composto de unicidade
    cursor.execute("PRAGMA index_list(pontos)")
    indexes = cursor.fetchall()
    
    indice_composto_presente = False
    for idx in indexes:
        idx_name = idx[1]
        cursor.execute(f"PRAGMA index_info({idx_name})")
        columns = {col[2] for col in cursor.fetchall()}
        if {'levantamento_id', 'matricula_id', 'nome_vertice', 'tipo_ponto'}.issubset(columns):
            indice_composto_presente = True
            break
            
    # Se ainda estiver como NOT NULL ou sem o índice composto, executa a migração
    if matricula_is_not_null or not indice_composto_presente:
        logger.info("[MIGRAÇÃO] Iniciando migração da tabela 'pontos' (removendo restrição NOT NULL de matricula_id e garantindo índice composto UNIQUE)...")
        try:
            cursor.execute("PRAGMA foreign_keys = OFF;")
            cursor.execute("BEGIN TRANSACTION;")
            
            # 1. Cria tabela temporária com a estrutura correta permitindo matricula_id nula
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS pontos_backup (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                levantamento_id INTEGER NOT NULL,
                matricula_id INTEGER,
                nome_vertice TEXT NOT NULL,       
                nome_original TEXT,
                tipo_ponto TEXT NOT NULL CHECK(tipo_ponto IN ('M','P','V','B')),
                lat REAL,
                lon REAL,
                alt REAL,
                sigma_lat REAL,                   
                sigma_lon REAL,                
                sigma_alt REAL,                     
                ordem_caminhamento INTEGER,       
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                n_original REAL,
                e_original REAL,
                alt_original REAL,
                lat_corrigido REAL,
                lon_corrigido REAL,
                alt_corrigido REAL,
                sigma_n REAL,
                sigma_e REAL,
                sigma_z REAL,
                arquivo_rinex TEXT,
                arquivo_resultado_ppp TEXT,
                status_ponto TEXT DEFAULT 'BRUTO' CHECK(status_ponto IN ('BRUTO', 'CORRIGIDO')),
                ponto_base_id INTEGER,
                metodo_posicionamento TEXT DEFAULT 'PG1',
                arquivo_origem TEXT,
                status_correcao TEXT DEFAULT 'BRUTO' CHECK(status_correcao IN ('BRUTO', 'CORRIGIDO')),
                ignorar_poligono INTEGER DEFAULT 0 CHECK(ignorar_poligono IN (0, 1)),
                origem_homologada INTEGER DEFAULT 0,
                confrontante_id INTEGER,
                ponto_vizinho INTEGER DEFAULT 0 CHECK(ponto_vizinho IN (0, 1)),
                dados_vizinho_json TEXT,
                sequencia_travada_id TEXT,
                FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
                FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE SET NULL,
                FOREIGN KEY (ponto_base_id) REFERENCES pontos(id) ON DELETE SET NULL,
                FOREIGN KEY (confrontante_id) REFERENCES confrontantes(id) ON DELETE SET NULL,
                UNIQUE(levantamento_id, matricula_id, nome_vertice, tipo_ponto)
            );
            """)
            
            # 2. Copia os dados existentes resolvendo potenciais conflitos via INSERT OR IGNORE
            cursor.execute("""
            INSERT OR IGNORE INTO pontos_backup (
                id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, 
                sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, created_at,
                n_original, e_original, alt_original, lat_corrigido, lon_corrigido, alt_corrigido,
                sigma_n, sigma_e, sigma_z, arquivo_rinex, arquivo_resultado_ppp, status_ponto, ponto_base_id, metodo_posicionamento,
                arquivo_origem, status_correcao, ignorar_poligono, origem_homologada, confrontante_id, ponto_vizinho, dados_vizinho_json, sequencia_travada_id
            )
            SELECT id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, 
                   sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, created_at,
                   n_original, e_original, alt_original, lat_corrigido, lon_corrigido, alt_corrigido,
                   sigma_n, sigma_e, sigma_z, arquivo_rinex, arquivo_resultado_ppp, status_ponto, ponto_base_id, metodo_posicionamento,
                   arquivo_origem, status_correcao, ignorar_poligono,
                   (CASE WHEN colunas_existentes_original.contem_orig = 1 THEN origem_homologada ELSE 0 END),
                   (CASE WHEN colunas_existentes_original.contem_conf = 1 THEN confrontante_id ELSE NULL END),
                   (CASE WHEN colunas_existentes_original.contem_viz = 1 THEN ponto_vizinho ELSE 0 END),
                   (CASE WHEN colunas_existentes_original.contem_json = 1 THEN dados_vizinho_json ELSE NULL END),
                   (CASE WHEN colunas_existentes_original.contem_seq = 1 THEN sequencia_travada_id ELSE NULL END)
            FROM (
               SELECT p.*, 
                      (SELECT 1 FROM pragma_table_info('pontos') WHERE name='origem_homologada') as contem_orig,
                      (SELECT 1 FROM pragma_table_info('pontos') WHERE name='confrontante_id') as contem_conf,
                      (SELECT 1 FROM pragma_table_info('pontos') WHERE name='ponto_vizinho') as contem_viz,
                      (SELECT 1 FROM pragma_table_info('pontos') WHERE name='dados_vizinho_json') as contem_json,
                      (SELECT 1 FROM pragma_table_info('pontos') WHERE name='sequencia_travada_id') as contem_seq
               FROM pontos p
            ) as colunas_existentes_original;
            """)
            
            # 3. Elimina a tabela antiga
            cursor.execute("DROP TABLE pontos;")
            
            # 4. Renomeia a tabela nova
            cursor.execute("ALTER TABLE pontos_backup RENAME TO pontos;")
            
            cursor.execute("COMMIT;")
            logger.info("[MIGRAÇÃO] Tabela 'pontos' migrada com sucesso (matricula_id agora é opcional).")
        except Exception as e:
            try:
                cursor.execute("ROLLBACK;")
            except Exception:
                pass
            logger.error(f"[MIGRAÇÃO] Falha crítica ao migrar tabela pontos: {e}")
            raise e
        finally:
            try:
                cursor.execute("PRAGMA foreign_keys = ON;")
            except Exception:
                pass

def migrar_status_arquivado_levantamentos(conn):
    """Garante que a constraint CHECK da tabela levantamentos inclua 'ARQUIVADO'"""
    cursor = conn.cursor()
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='levantamentos'")
    row = cursor.fetchone()
    if not row:
        return
    
    sql = row[0]
    # Se não contiver 'ARQUIVADO' na constraint CHECK, precisamos migrar
    if "ARQUIVADO" not in sql:
        logger.info("[MIGRAÇÃO] Iniciando migração da tabela 'levantamentos' para suportar status 'ARQUIVADO'...")
        try:
            cursor.execute("PRAGMA foreign_keys = OFF;")
            cursor.execute("BEGIN TRANSACTION;")
            
            # 1. Cria tabela temporária
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS levantamentos_backup (
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
            """)
            
            # 2. Copia os dados
            cursor.execute("""
            INSERT INTO levantamentos_backup (id, propriedade_id, profissional_id, data_inicio, pasta_projeto, status, created_at)
            SELECT id, propriedade_id, profissional_id, data_inicio, pasta_projeto, status, created_at
            FROM levantamentos;
            """)
            
            # 3. Elimina a tabela antiga
            cursor.execute("DROP TABLE levantamentos;")
            
            # 4. Renomeia a tabela nova
            cursor.execute("ALTER TABLE levantamentos_backup RENAME TO levantamentos;")
            
            cursor.execute("COMMIT;")
            logger.info("[MIGRAÇÃO] Tabela 'levantamentos' migrada com sucesso (suporte a status 'ARQUIVADO' ativado).")
        except Exception as e:
            try:
                cursor.execute("ROLLBACK;")
            except Exception:
                pass
            logger.error(f"[MIGRAÇÃO] Falha crítica ao migrar tabela levantamentos: {e}")
            raise e
        finally:
            try:
                cursor.execute("PRAGMA foreign_keys = ON;")
            except Exception:
                pass

def migrar_restricao_unicidade_banco_pontos(conn):
    """Garante a migração da tabela banco_pontos para usar UNIQUE(levantamento_id, planilha_origem, codigo_completo) em vez de UNIQUE(codigo_completo)"""
    cursor = conn.cursor()
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='banco_pontos'")
    row = cursor.fetchone()
    if not row:
        return
        
    sql = row[0]
    # Se contiver 'codigo_completo TEXT UNIQUE' ou não contiver a restrição composta de planilha_origem
    if "codigo_completo TEXT UNIQUE" in sql or "UNIQUE(levantamento_id, planilha_origem, codigo_completo)" not in sql:
        logger.info("[MIGRAÇÃO] Iniciando migração da tabela 'banco_pontos' para suportar unicidade composta por planilha...")
        try:
            cursor.execute("PRAGMA foreign_keys = OFF;")
            cursor.execute("BEGIN TRANSACTION;")
            
            # 1. Cria tabela temporária com a estrutura correta e sem a restrição UNIQUE global no codigo_completo
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS banco_pontos_backup (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profissional_id INTEGER NOT NULL,
                levantamento_id INTEGER,
                matricula_id INTEGER,
                tipo_ponto TEXT NOT NULL CHECK(tipo_ponto IN ('M', 'P', 'V', 'B')),
                numero INTEGER NOT NULL,
                codigo_completo TEXT NOT NULL,
                norte REAL,
                este REAL,
                altitude REAL,
                lat REAL,
                lon REAL,
                sigma_n REAL,
                sigma_e REAL,
                sigma_z REAL,
                metodo_posicionamento TEXT,
                tipo_limite TEXT,
                cns_confrontante TEXT,
                matricula_confrontante TEXT,
                confrontante_descritivo TEXT,
                planilha_origem TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (profissional_id) REFERENCES profissionais(id) ON DELETE CASCADE,
                FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE SET NULL,
                FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE,
                UNIQUE(levantamento_id, planilha_origem, codigo_completo)
            );
            """)
            
            # 2. Copia os dados existentes resolvendo potenciais conflitos
            cursor.execute("""
            INSERT OR IGNORE INTO banco_pontos_backup (
                id, profissional_id, levantamento_id, matricula_id, tipo_ponto, numero, codigo_completo,
                norte, este, altitude, lat, lon, sigma_n, sigma_e, sigma_z,
                metodo_posicionamento, tipo_limite, cns_confrontante, matricula_confrontante, confrontante_descritivo,
                planilha_origem, created_at
            )
            SELECT id, profissional_id, levantamento_id, matricula_id, tipo_ponto, numero, codigo_completo,
                   norte, este, altitude, lat, lon, sigma_n, sigma_e, sigma_z,
                   metodo_posicionamento, tipo_limite, cns_confrontante, matricula_confrontante, confrontante_descritivo,
                   planilha_origem, created_at
            FROM banco_pontos;
            """)
            
            # 3. Elimina a tabela antiga
            cursor.execute("DROP TABLE banco_pontos;")
            
            # 4. Renomeia a tabela nova
            cursor.execute("ALTER TABLE banco_pontos_backup RENAME TO banco_pontos;")
            
            cursor.execute("COMMIT;")
            logger.info("[MIGRAÇÃO] Tabela 'banco_pontos' migrada com sucesso para unicidade composta por planilha.")
        except Exception as e:
            try:
                cursor.execute("ROLLBACK;")
            except Exception:
                pass
            logger.error(f"[MIGRAÇÃO] Falha crítica ao migrar tabela banco_pontos: {e}")
            raise e
        finally:
            try:
                cursor.execute("PRAGMA foreign_keys = ON;")
            except Exception:
                pass