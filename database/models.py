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
            sexo TEXT DEFAULT 'M',
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
            matricula_id INTEGER,
            nome_vertice TEXT NOT NULL,       
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
            
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
            FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE SET NULL,
            FOREIGN KEY (ponto_base_id) REFERENCES pontos(id) ON DELETE SET NULL,
            UNIQUE(levantamento_id, matricula_id, nome_vertice, tipo_ponto)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS confrontantes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            levantamento_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
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
            tipo_ponto TEXT NOT NULL CHECK(tipo_ponto IN ('M', 'P', 'V')),
            numero INTEGER NOT NULL,
            codigo_completo TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profissional_id) REFERENCES profissionais(id) ON DELETE CASCADE,
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE SET NULL
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
            ("arquivo_resultado_ppp", "TEXT"),
            ("status_ponto", "TEXT DEFAULT 'BRUTO'"),
            ("ponto_base_id", "INTEGER"),
            ("metodo_posicionamento", "TEXT DEFAULT 'PG1'"),
            ("arquivo_origem", "TEXT"),
            ("status_correcao", "TEXT DEFAULT 'BRUTO'"),
            ("ignorar_poligono", "INTEGER DEFAULT 0")
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

        # Migração dinâmica para a tabela confrontantes

        colunas_confrontantes = [
            ("rg", "TEXT"),
            ("nacionalidade", "TEXT DEFAULT 'brasileiro(a)'"),
            ("profissao", "TEXT"),
            ("estado_civil", "TEXT"),
            ("regime_bens", "TEXT"),
            ("endereco_completo", "TEXT"),
            ("nome_conjuge", "TEXT"),
            ("cpf_conjuge", "TEXT"),
            ("rg_conjuge", "TEXT")
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
            ("georreferenciamento", "TEXT")
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
        
        conn.commit()
        # Executa migração de restrição única composto em pontos se necessário
        migrar_restricao_unicidade_pontos(conn)
        # Executa migração de suporte ao status ARQUIVADO na tabela levantamentos se necessário
        migrar_status_arquivado_levantamentos(conn)
    except Exception as e:
        logger.error(f"Erro ao criar tabelas ou executar migrações: {e}")
        raise e

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
                FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
                FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE SET NULL,
                FOREIGN KEY (ponto_base_id) REFERENCES pontos(id) ON DELETE SET NULL,
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
                arquivo_origem, status_correcao, ignorar_poligono
            )
            SELECT id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, 
                   sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, created_at,
                   n_original, e_original, alt_original, lat_corrigido, lon_corrigido, alt_corrigido,
                   sigma_n, sigma_e, sigma_z, arquivo_rinex, arquivo_resultado_ppp, status_ponto, ponto_base_id,
                   metodo_posicionamento, arquivo_origem, status_correcao, ignorar_poligono
            FROM pontos;
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
