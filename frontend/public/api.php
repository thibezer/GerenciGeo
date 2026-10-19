<?php
/**
 * GerenciGeo Cloud Hub & REST API
 * Conecta o Frontend diretamente ao MySQL da Hostinger para funcionamento 100% autônomo na nuvem.
 */

declare(strict_types=1);

// 1. Headers CORS & Resposta Preflight
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-GerenciGeo-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// 2. Configurações de Conexão com o Banco de Dados MySQL
// Segredos: variável de ambiente > arquivo gerencigeo_config.php FORA da pasta pública (um nível acima, retorna um
// array) > padrão abaixo. A senha do banco não tem padrão: sem o arquivo ou a variável, a conexão falha.
$GLOBALS['gg_cfg'] = (static function (): array {
    $arquivo = dirname(__DIR__) . '/gerencigeo_config.php';
    if (is_file($arquivo)) {
        $cfg = include $arquivo;
        if (is_array($cfg)) return $cfg;
    }
    return [];
})();
function ggCfg(string $chave, string $padrao): string {
    $env = getenv($chave);
    if ($env !== false && $env !== '') return $env;
    $v = $GLOBALS['gg_cfg'][$chave] ?? '';
    return (is_string($v) && $v !== '') ? $v : $padrao;
}
define('DB_NAME', ggCfg('GERENCIGEO_DB_NAME', 'u941736878_gerencigeo'));
define('DB_USER', ggCfg('GERENCIGEO_DB_USER', 'u941736878_thiago_geo'));
define('DB_PASS', ggCfg('GERENCIGEO_DB_PASS', ''));
// Chave do formato antigo (AES-CBC). Continua existindo só para LER senhas GOV gravadas antes do AES-GCM.
define('APP_SECRET_KEY', 'G3renciGeo_Cloud_Secret_Key_2026_Salt!');

$storageDir = __DIR__ . '/dados_publicos';
if (!file_exists($storageDir)) {
    @mkdir($storageDir, 0755, true);
}

/**
 * Retorna uma instância PDO conectada ao MySQL
 */
function getDb(): PDO {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $hosts = ['localhost', '127.0.0.1', 'srv1180.hstgr.io'];
    $lastError = null;

    foreach ($hosts as $host) {
        try {
            $dsn = "mysql:host={$host};port=3306;dbname=" . DB_NAME . ";charset=utf8mb4";
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
            ensureSchema($pdo);
            return $pdo;
        } catch (PDOException $e) {
            $lastError = $e;
        }
    }

    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'Falha ao conectar com o banco de dados MySQL na Hostinger.',
        'details' => $lastError ? $lastError->getMessage() : 'Host inacessível'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Adiciona uma coluna com segurança se não existir
 */
function addColumnSafe(PDO $pdo, string $table, string $column, string $typeDef): void {
    try {
        $pdo->exec("ALTER TABLE `{$table}` ADD `{$column}` {$typeDef}");
    } catch (Exception $e) {
        // Já existe ou erro tolerável
    }
}

/**
 * Criação e migração idempotente de tabelas
 */
function ensureSchema(PDO $pdo): void {
    static $checked = false;
    if ($checked) return;

    $queries = [
        "CREATE TABLE IF NOT EXISTS pessoas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(255) NOT NULL,
            cpf_cnpj VARCHAR(32) UNIQUE,
            rg VARCHAR(32),
            genero VARCHAR(10) DEFAULT 'M',
            nacionalidade VARCHAR(100),
            profissao VARCHAR(150),
            estado_civil VARCHAR(50),
            regime_bens VARCHAR(100),
            endereco_completo TEXT,
            nome_conjuge VARCHAR(255),
            cpf_conjuge VARCHAR(32),
            rg_conjuge VARCHAR(32),
            genero_conjuge VARCHAR(10),
            nacionalidade_conjuge VARCHAR(100),
            profissao_conjuge VARCHAR(150),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS profissionais (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(255) NOT NULL,
            registro VARCHAR(100),
            codigo_credenciado VARCHAR(100),
            contador_m INT DEFAULT 0,
            contador_p INT DEFAULT 0,
            contador_v INT DEFAULT 0,
            endereco TEXT,
            nacionalidade VARCHAR(100) DEFAULT 'brasileiro(a)',
            formacao VARCHAR(150),
            cpf VARCHAR(32),
            rg VARCHAR(32),
            conselho VARCHAR(50),
            endereco_residencial TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS clientes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            pessoa_id INT NOT NULL,
            profissional_id INT NULL,
            data_nascimento_fundacao DATE NULL,
            email VARCHAR(150),
            telefone VARCHAR(50),
            cidade VARCHAR(100),
            estado VARCHAR(50),
            cep VARCHAR(20),
            sexo VARCHAR(10) DEFAULT 'M',
            senha_gov VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS cliente_documentos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            cliente_id INT NOT NULL,
            tipo_documento VARCHAR(50) NOT NULL,
            numero_documento VARCHAR(100),
            orgao_emissor VARCHAR(50),
            data_emissao DATE,
            data_validade DATE,
            caminho_arquivo VARCHAR(255),
            nome_arquivo_original VARCHAR(255),
            tamanho_bytes INT,
            mime_type VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS cliente_acesso_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_cliente INT NOT NULL,
            tipo_dado VARCHAR(50) NOT NULL,
            acao VARCHAR(100) NOT NULL,
            usuario VARCHAR(100) DEFAULT 'Operador Cloud',
            ip_origem VARCHAR(50),
            data_acesso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS cliente_historico_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_cliente INT NOT NULL,
            campo_alterado VARCHAR(100) NOT NULL,
            valor_antigo TEXT NULL,
            valor_novo TEXT NULL,
            data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS cliente_exclusoes_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            cliente_id INT NOT NULL,
            nome VARCHAR(255) NULL,
            documento_mascarado VARCHAR(32) NULL,
            usuario VARCHAR(100) NULL,
            qtd_acessos_sensiveis INT DEFAULT 0,
            qtd_propriedades_desvinculadas INT DEFAULT 0,
            data_exclusao DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS propriedades (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(255) NULL,
            nome_propriedade VARCHAR(255) NULL,
            codigo_car VARCHAR(100),
            codigo_ccir VARCHAR(100),
            municipio VARCHAR(100),
            comarca VARCHAR(100),
            uf VARCHAR(10) DEFAULT 'SP',
            area_total_ha DECIMAL(12,4) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS propriedade_proprietarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            propriedade_id INT NOT NULL,
            cliente_id INT NOT NULL,
            proporcao DECIMAL(5,2) DEFAULT 100,
            FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS propriedade_clientes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            propriedade_id INT NOT NULL,
            cliente_id INT NOT NULL,
            percentual_participacao DECIMAL(5,2) DEFAULT 100
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS matriculas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            propriedade_id INT NOT NULL,
            numero VARCHAR(100) NULL,
            numero_matricula VARCHAR(100) NULL,
            livro VARCHAR(50),
            folha VARCHAR(50),
            cartorio VARCHAR(255),
            area_ha DECIMAL(12,4) DEFAULT 0,
            perimetro_m DECIMAL(12,4) DEFAULT 0,
            ccir VARCHAR(50),
            itr VARCHAR(50),
            denominacao VARCHAR(255),
            data_registro DATE,
            caminho_pdf VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS matricula_historico (
            id INT AUTO_INCREMENT PRIMARY KEY,
            matricula_id INT NOT NULL,
            ato VARCHAR(50) NOT NULL,
            data_ato DATE,
            descricao TEXT,
            proprietarios_envolvidos TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS levantamentos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(255) NULL,
            propriedade_id INT NULL,
            profissional_id INT NULL,
            cliente_id INT NULL,
            responsavel_tecnico VARCHAR(255),
            status VARCHAR(50) DEFAULT 'EM_ANDAMENTO',
            tipo_levantamento VARCHAR(50) DEFAULT 'GEORREFERENCIAMENTO',
            data_inicio DATE,
            fuso_utm INT DEFAULT 22,
            meridiano_central INT DEFAULT -51,
            codigo_compartilhamento VARCHAR(64) UNIQUE,
            pasta_projeto TEXT,
            numero_trt VARCHAR(100),
            data_trt VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS levantamento_matriculas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            levantamento_id INT NOT NULL,
            matricula_id INT NOT NULL,
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
            FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS pontos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            levantamento_id INT NOT NULL,
            matricula_id INT NULL,
            nome_vertice VARCHAR(50) NOT NULL,
            tipo_ponto VARCHAR(10) DEFAULT 'M',
            lat DOUBLE NULL,
            lon DOUBLE NULL,
            este DOUBLE NULL,
            norte DOUBLE NULL,
            altitude DOUBLE NULL,
            alt DOUBLE NULL,
            sigma_x DOUBLE DEFAULT 0,
            sigma_y DOUBLE DEFAULT 0,
            sigma_z DOUBLE DEFAULT 0,
            status_ponto VARCHAR(50) DEFAULT 'CORRIGIDO',
            status_correcao VARCHAR(50) DEFAULT 'CORRIGIDO',
            ordem_caminhamento INT DEFAULT 0,
            origem_homologada INT DEFAULT 0,
            arquivo_origem VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS segmentos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            levantamento_id INT NOT NULL,
            matricula_id INT NULL,
            ponto_inicio_id INT NOT NULL,
            ponto_fim_id INT NOT NULL,
            tipo_limite VARCHAR(50) DEFAULT 'Linha Seca',
            tipo_limite_sigef VARCHAR(50) DEFAULT 'LA1',
            confrontante_id INT NULL,
            confrontante_nome VARCHAR(255),
            azimute VARCHAR(50),
            distancia DOUBLE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS confrontantes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            levantamento_id INT NOT NULL,
            pessoa_id INT NOT NULL,
            tipo_limite VARCHAR(100),
            descricao_imovel VARCHAR(255),
            cns_cartorio VARCHAR(50),
            matricula_confrontante VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
            FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS confrontante_coproprietarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            confrontante_id INT NOT NULL,
            pessoa_id INT NULL,
            nome VARCHAR(255) NOT NULL,
            cpf_cnpj VARCHAR(32) NULL,
            rg VARCHAR(32) NULL,
            genero VARCHAR(10) DEFAULT 'M',
            nacionalidade VARCHAR(100) DEFAULT 'brasileiro(a)',
            profissao VARCHAR(150) NULL,
            estado_civil VARCHAR(50) NULL,
            regime_bens VARCHAR(100) NULL,
            endereco_completo TEXT NULL,
            nome_conjuge VARCHAR(255) NULL,
            cpf_conjuge VARCHAR(32) NULL,
            rg_conjuge VARCHAR(32) NULL,
            genero_conjuge VARCHAR(10) DEFAULT 'F',
            nacionalidade_conjuge VARCHAR(100) DEFAULT 'brasileiro(a)',
            profissao_conjuge VARCHAR(150) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (confrontante_id) REFERENCES confrontantes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS pendencias (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo VARCHAR(255) NOT NULL,
            descricao TEXT,
            prioridade VARCHAR(20) DEFAULT 'MEDIA',
            status VARCHAR(20) DEFAULT 'PENDENTE',
            prazo DATE,
            cliente_id INT NULL,
            propriedade_id INT NULL,
            levantamento_id INT NULL,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_conclusao TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS configuracoes (
            chave VARCHAR(100) PRIMARY KEY,
            valor TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role ENUM('admin', 'moderator', 'user') DEFAULT 'admin',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reset_password_token VARCHAR(255) NULL,
            reset_password_expires DATETIME NULL,
            is_blocked TINYINT(1) DEFAULT 0,
            profile_image VARCHAR(255) NULL,
            cep VARCHAR(10) NULL,
            logradouro VARCHAR(255) NULL,
            numero VARCHAR(30) NULL,
            complemento VARCHAR(100) NULL,
            bairro VARCHAR(100) NULL,
            cidade VARCHAR(100) NULL,
            estado VARCHAR(10) NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS registros_excluidos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tabela VARCHAR(50) NOT NULL,
            registro_id INT NOT NULL,
            excluido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_reg_exc (tabela, registro_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    ];

    foreach ($queries as $sql) {
        try { $pdo->exec($sql); } catch (Exception $e) {}
    }

    try {
        $countUsers = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        if ($countUsers === 0) {
            $initialHash = password_hash('admin123', PASSWORD_BCRYPT);
            $stmt = $pdo->prepare("INSERT INTO users (name, email, password, role, is_blocked) VALUES (?, ?, ?, 'admin', 0)");
            $stmt->execute(['Administrador', 'admin@gerencigeo.com.br', $initialHash]);
        }
    } catch (Exception $e) {}

    // Deduplicação preventiva em tabelas de vínculos
    try {
        $pdo->exec("DELETE p1 FROM propriedade_proprietarios p1 INNER JOIN propriedade_proprietarios p2 WHERE p1.id < p2.id AND p1.propriedade_id = p2.propriedade_id AND p1.cliente_id = p2.cliente_id");
        $pdo->exec("DELETE p1 FROM propriedade_clientes p1 INNER JOIN propriedade_clientes p2 WHERE p1.id < p2.id AND p1.propriedade_id = p2.propriedade_id AND p1.cliente_id = p2.cliente_id");
    } catch (Exception $eClean) {}

    // Garante colunas de compatibilidade se tabelas antigas existiam no MySQL
    addColumnSafe($pdo, 'propriedades', 'nome', 'VARCHAR(255) NULL');
    addColumnSafe($pdo, 'propriedades', 'nome_propriedade', 'VARCHAR(255) NULL');
    addColumnSafe($pdo, 'propriedades', 'municipio', 'VARCHAR(100) NULL');
    addColumnSafe($pdo, 'propriedades', 'comarca', 'VARCHAR(100) NULL');
    addColumnSafe($pdo, 'propriedades', 'uf', 'VARCHAR(10) DEFAULT "SP"');
    addColumnSafe($pdo, 'propriedades', 'area_total_ha', 'DECIMAL(12,4) DEFAULT 0');

    addColumnSafe($pdo, 'matriculas', 'numero', 'VARCHAR(100) NULL');
    addColumnSafe($pdo, 'matriculas', 'numero_matricula', 'VARCHAR(100) NULL');
    addColumnSafe($pdo, 'matriculas', 'area_ha', 'DECIMAL(12,4) DEFAULT 0');
    addColumnSafe($pdo, 'matriculas', 'perimetro_m', 'DECIMAL(12,4) DEFAULT 0');
    addColumnSafe($pdo, 'matriculas', 'ccir', 'VARCHAR(50) NULL');
    addColumnSafe($pdo, 'matriculas', 'itr', 'VARCHAR(50) NULL');
    addColumnSafe($pdo, 'matriculas', 'denominacao', 'VARCHAR(255) NULL');

    addColumnSafe($pdo, 'levantamentos', 'nome', 'VARCHAR(255) NULL');
    addColumnSafe($pdo, 'levantamentos', 'cliente_id', 'INT NULL');
    addColumnSafe($pdo, 'levantamentos', 'responsavel_tecnico', 'VARCHAR(255) NULL');
    addColumnSafe($pdo, 'levantamentos', 'tipo_levantamento', 'VARCHAR(50) DEFAULT "GEORREFERENCIAMENTO"');
    addColumnSafe($pdo, 'levantamentos', 'fuso_utm', 'INT DEFAULT 22');
    addColumnSafe($pdo, 'levantamentos', 'meridiano_central', 'INT DEFAULT -51');
    addColumnSafe($pdo, 'levantamentos', 'pasta_projeto', 'TEXT NULL');
    addColumnSafe($pdo, 'levantamentos', 'numero_trt', 'VARCHAR(100) NULL');
    addColumnSafe($pdo, 'levantamentos', 'data_trt', 'VARCHAR(50) NULL');

    addColumnSafe($pdo, 'pontos', 'alt', 'DOUBLE NULL');
    addColumnSafe($pdo, 'pontos', 'altitude', 'DOUBLE NULL');
    addColumnSafe($pdo, 'pontos', 'este', 'DOUBLE NULL');
    addColumnSafe($pdo, 'pontos', 'norte', 'DOUBLE NULL');
    addColumnSafe($pdo, 'pontos', 'lat_corrigido', 'DOUBLE NULL');
    addColumnSafe($pdo, 'pontos', 'lon_corrigido', 'DOUBLE NULL');
    addColumnSafe($pdo, 'pontos', 'alt_corrigido', 'DOUBLE NULL');
    addColumnSafe($pdo, 'pontos', 'e_original', 'DOUBLE NULL');
    addColumnSafe($pdo, 'pontos', 'n_original', 'DOUBLE NULL');

    addColumnSafe($pdo, 'pendencias', 'data_criacao', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    addColumnSafe($pdo, 'pessoas', 'tipo_pessoa', "VARCHAR(10) DEFAULT 'PF'");
    addColumnSafe($pdo, 'pessoas', 'razao_social', "VARCHAR(255) NULL");
    addColumnSafe($pdo, 'pessoas', 'nome_fantasia', "VARCHAR(255) NULL");
    addColumnSafe($pdo, 'pessoas', 'inscricao_estadual', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'pessoas', 'inscricao_municipal', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'pessoas', 'representante_legal_id', "INT NULL");
    addColumnSafe($pdo, 'pessoas', 'cnh_numero', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'pessoas', 'cnh_categoria', "VARCHAR(10) NULL");
    addColumnSafe($pdo, 'pessoas', 'cnh_validade', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'pessoas', 'cnh_orgao_uf', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'pessoas', 'rg_orgao', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'pessoas', 'rg_uf', "VARCHAR(10) NULL");
    addColumnSafe($pdo, 'pessoas', 'naturalidade', "VARCHAR(100) NULL");
    addColumnSafe($pdo, 'pessoas', 'certidao_casamento_matricula', "VARCHAR(100) NULL");
    addColumnSafe($pdo, 'pessoas', 'rg_orgao_conjuge', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'pessoas', 'rg_uf_conjuge', "VARCHAR(10) NULL");
    addColumnSafe($pdo, 'pessoas', 'data_casamento', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'pessoas', 'cartorio_casamento', "VARCHAR(255) NULL");
    addColumnSafe($pdo, 'pessoas', 'livro_casamento', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'pessoas', 'folha_casamento', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'pessoas', 'termo_casamento', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'pessoas', 'bairro', "VARCHAR(100) NULL");
    addColumnSafe($pdo, 'pessoas', 'endereco_sem_numero', "VARCHAR(10) NULL");
    addColumnSafe($pdo, 'pessoas', 'numero_endereco', "VARCHAR(50) NULL");
    addColumnSafe($pdo, 'clientes', 'metadados', "LONGTEXT NULL");
    // endereco_sem_numero nasceu como VARCHAR(10): cortava (ou recusava) qualquer logradouro real
    try {
        $pdo->exec("ALTER TABLE pessoas MODIFY endereco_sem_numero VARCHAR(255) NULL");
    } catch (Exception $e) {}
    addColumnSafe($pdo, 'confrontantes', 'coproprietarios_json', "LONGTEXT NULL");
    addColumnSafe($pdo, 'users', 'api_token', 'VARCHAR(255) NULL');
    addColumnSafe($pdo, 'users', 'token_created_at', 'DATETIME NULL');

    // Limpeza de campos UNIQUE com string vazia para NULL (evita erro 1062 no MySQL)
    try {
        $pdo->exec("UPDATE pessoas SET cpf_cnpj = NULL WHERE cpf_cnpj = '' OR TRIM(cpf_cnpj) = ''");
    } catch (Exception $e) {}
    try {
        $pdo->exec("UPDATE levantamentos SET codigo_compartilhamento = NULL WHERE codigo_compartilhamento = '' OR TRIM(codigo_compartilhamento) = ''");
    } catch (Exception $e) {}

    ensureSyncSchema($pdo);

    $checked = true;
}

/**
 * Tabelas do MySQL que participam da sincronização com os PCs (no SQLite, propriedade_proprietarios = propriedade_clientes).
 */
const SYNC_TABELAS_MYSQL = [
    'pessoas', 'profissionais', 'clientes', 'propriedades', 'propriedade_proprietarios',
    'matriculas', 'levantamentos', 'pontos', 'segmentos', 'pendencias', 'confrontantes',
    'banco_pontos', 'anuencias_confrontantes'
];

/**
 * Prepara o MySQL para o merge por registro (updated_at) e para as tabelas extras da sincronização.
 * Idempotente e executada uma única vez (flag 'schema_sync_v3' em configuracoes).
 * Triggers: carimbam updated_at (UTC, ms) em edições feitas direto na nuvem; o /sync/batch define @gg_sync
 * para que os triggers não sobrescrevam o carimbo vindo do PC.
 */
function ensureSyncSchema(PDO $pdo): string {
    try {
        $st = $pdo->prepare("SELECT valor FROM configuracoes WHERE chave = 'schema_sync_v3' LIMIT 1");
        $st->execute();
        $flag = $st->fetchColumn();
        if ($flag) return (string)$flag;
    } catch (Exception $e) {
        return 'indisponivel';
    }

    $ddl = [
        "CREATE TABLE IF NOT EXISTS user_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token_hash CHAR(64) NOT NULL,
            created_at DATETIME NOT NULL,
            UNIQUE KEY uq_user_tokens_hash (token_hash),
            INDEX idx_user_tokens_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS banco_pontos (
            id INT PRIMARY KEY,
            profissional_id INT NULL,
            levantamento_id INT NULL,
            matricula_id INT NULL,
            tipo_ponto VARCHAR(10) NULL,
            numero INT NULL,
            codigo_completo VARCHAR(100) NULL,
            norte DOUBLE NULL,
            este DOUBLE NULL,
            altitude DOUBLE NULL,
            lat DOUBLE NULL,
            lon DOUBLE NULL,
            sigma_n DOUBLE NULL,
            sigma_e DOUBLE NULL,
            sigma_z DOUBLE NULL,
            metodo_posicionamento VARCHAR(50) NULL,
            tipo_limite VARCHAR(50) NULL,
            cns_confrontante VARCHAR(50) NULL,
            matricula_confrontante VARCHAR(100) NULL,
            confrontante_descritivo TEXT NULL,
            planilha_origem VARCHAR(255) NULL,
            created_at TIMESTAMP NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS anuencias_confrontantes (
            id INT PRIMARY KEY,
            levantamento_id INT NULL,
            confrontante_id INT NULL,
            status_anuencia VARCHAR(50) NULL,
            caminho_documento_assinado TEXT NULL,
            data_atualizacao TIMESTAMP NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    ];
    foreach ($ddl as $sql) {
        try { $pdo->exec($sql); } catch (Exception $e) {}
    }
    $resultado = 'ok';
    foreach (SYNC_TABELAS_MYSQL as $t) {
        addColumnSafe($pdo, $t, 'updated_at', 'DATETIME(3) NULL');
        foreach ([
            "trg_sync_{$t}_bi" => "CREATE TRIGGER `trg_sync_{$t}_bi` BEFORE INSERT ON `{$t}` FOR EACH ROW SET NEW.updated_at = IFNULL(NEW.updated_at, UTC_TIMESTAMP(3))",
            "trg_sync_{$t}_bu" => "CREATE TRIGGER `trg_sync_{$t}_bu` BEFORE UPDATE ON `{$t}` FOR EACH ROW SET NEW.updated_at = IF(@gg_sync IS NULL AND (NEW.updated_at <=> OLD.updated_at), UTC_TIMESTAMP(3), NEW.updated_at)",
        ] as $nome => $sqlTrg) {
            try {
                $q = $pdo->prepare("SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?");
                $q->execute([$nome]);
                if ((int)$q->fetchColumn() === 0) {
                    $pdo->exec($sqlTrg);
                }
            } catch (Exception $e) {
                $resultado = 'sem_triggers';
            }
        }
    }

    try {
        $pdo->prepare("INSERT INTO configuracoes (chave, valor) VALUES ('schema_sync_v3', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)")->execute([$resultado]);
    } catch (Exception $e) {}
    return $resultado;
}

/**
 * Registra uma lápide (exclusão) de forma idempotente. Os PCs chamam a tabela de vínculos
 * de propriedade_clientes; no MySQL ela é propriedade_proprietarios.
 */
function registrarLapide(PDO $pdo, string $tabela, int $id, ?string $quando = null): void {
    if ($tabela === 'propriedade_proprietarios') $tabela = 'propriedade_clientes';
    $quando = ($quando && strtotime($quando)) ? date('Y-m-d H:i:s', strtotime($quando)) : date('Y-m-d H:i:s');
    try {
        $pdo->prepare(
            "INSERT INTO registros_excluidos (tabela, registro_id, excluido_em)
             SELECT ?, ?, ? FROM DUAL
             WHERE NOT EXISTS (SELECT 1 FROM registros_excluidos WHERE tabela = ? AND registro_id = ?)"
        )->execute([$tabela, $id, $quando, $tabela, $id]);
    } catch (Exception $e) {}
}

/**
 * Exclui um registro (e seus dependentes) gerando lápides para que os PCs removam o mesmo dado.
 */
function excluirComLapide(PDO $pdo, string $tabela, int $id): void {
    static $filhos = [
        'propriedades'  => [['matriculas', 'propriedade_id'], ['levantamentos', 'propriedade_id'], ['propriedade_proprietarios', 'propriedade_id']],
        'levantamentos' => [['pontos', 'levantamento_id'], ['segmentos', 'levantamento_id'], ['confrontantes', 'levantamento_id'], ['anuencias_confrontantes', 'levantamento_id']],
    ];
    foreach ($filhos[$tabela] ?? [] as [$tf, $col]) {
        try {
            $st = $pdo->prepare("SELECT id FROM `{$tf}` WHERE `{$col}` = ?");
            $st->execute([$id]);
            foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $fid) {
                excluirComLapide($pdo, $tf, (int)$fid);
            }
        } catch (Exception $e) {}
    }
    $pdo->prepare("DELETE FROM `{$tabela}` WHERE id = ?")->execute([$id]);
    registrarLapide($pdo, $tabela, $id);
}

/**
 * Lápides para todas as linhas de $tabela com $coluna = $valor (antes de um DELETE em massa).
 */
function lapidarPorColuna(PDO $pdo, string $tabela, string $coluna, int $valor): void {
    try {
        $st = $pdo->prepare("SELECT id FROM `{$tabela}` WHERE `{$coluna}` = ?");
        $st->execute([$valor]);
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $rid) {
            registrarLapide($pdo, $tabela, (int)$rid);
        }
    } catch (Exception $e) {}
}

const GOV_PREFIXO_ATUAL = 'ENC:G4G3:';   // AES-256-GCM; mesmo layout de services/seguranca/crypto_service.py
const GOV_PREFIXO_LEGADO = 'ENC:G4G2:';  // antigo: AES-CBC (nuvem) ou CTR+HMAC (PC); só leitura
const GOV_AAD = 'gerencigeo:senha_gov';

/**
 * Chave atual. Para PC e nuvem lerem as senhas um do outro, GERENCIGEO_SECRET_KEY precisa ser a mesma nos dois.
 * Sem ela, usa a chave antiga da nuvem (comportamento anterior).
 */
function govChave(): string {
    return hash('sha256', ggCfg('GERENCIGEO_SECRET_KEY', APP_SECRET_KEY), true);
}

/** Chave do formato antigo da nuvem (AES-CBC), sempre derivada da constante. */
function govChaveLegada(): string {
    return hash('sha256', APP_SECRET_KEY, true);
}

function govEstaCifrada(string $valor): bool {
    return str_starts_with($valor, GOV_PREFIXO_ATUAL) || str_starts_with($valor, GOV_PREFIXO_LEGADO);
}

/**
 * Cifra uma senha GOV com AES-256-GCM: ENC:G4G3: + urlsafe_b64(iv[12] || ciphertext || tag[16]).
 * Valor já cifrado (qualquer formato) volta como está.
 */
function encryptGovPassword(string $plain): string {
    if (govEstaCifrada($plain)) {
        return $plain;
    }
    $iv = random_bytes(12);
    $tag = '';
    $ct = openssl_encrypt($plain, 'aes-256-gcm', govChave(), OPENSSL_RAW_DATA, $iv, $tag, GOV_AAD, 16);
    if ($ct === false || strlen($tag) !== 16) {
        throw new RuntimeException('Falha ao cifrar a senha GOV.');
    }
    return GOV_PREFIXO_ATUAL . strtr(base64_encode($iv . $ct . $tag), '+/', '-_');
}

/**
 * Lê o formato antigo do PC (CTR sobre HMAC-SHA256 + MAC), autenticado: devolve null se o MAC não confere.
 */
function govDecifrarLegadoPc(string $enc, string $chave): ?string {
    $raw = base64_decode(strtr(substr($enc, strlen(GOV_PREFIXO_LEGADO)), '-_', '+/'), true);
    if ($raw === false || strlen($raw) < 48) return null;
    $nonce = substr($raw, 0, 16);
    $mac = substr($raw, -32);
    $cifra = substr($raw, 16, -32);
    if (!hash_equals(hash_hmac('sha256', $nonce . $cifra, $chave, true), $mac)) return null;
    $fluxo = '';
    for ($i = 0; strlen($fluxo) < strlen($cifra); $i++) {
        $fluxo .= hash_hmac('sha256', $nonce . pack('N', $i), $chave, true);
    }
    return $cifra ^ substr($fluxo, 0, strlen($cifra));
}

/**
 * Decifra uma senha GOV (AES-GCM atual, legado do PC, legado AES-CBC da nuvem ou texto puro antigo).
 * Devolve '' quando não consegue decifrar (chave diferente, dado adulterado).
 */
function decryptGovPassword(string $enc): string {
    if (str_starts_with($enc, GOV_PREFIXO_ATUAL)) {
        $raw = base64_decode(strtr(substr($enc, strlen(GOV_PREFIXO_ATUAL)), '-_', '+/'), true);
        if ($raw === false || strlen($raw) < 28) return '';
        $iv = substr($raw, 0, 12);
        $tag = substr($raw, -16);
        $ct = substr($raw, 12, -16);
        $plain = openssl_decrypt($ct, 'aes-256-gcm', govChave(), OPENSSL_RAW_DATA, $iv, $tag, GOV_AAD);
        return $plain === false ? '' : $plain;
    }
    if (str_starts_with($enc, GOV_PREFIXO_LEGADO)) {
        // 1) formato do PC: o HMAC confirma sem ambiguidade
        foreach ([govChave(), govChaveLegada()] as $chave) {
            $plano = govDecifrarLegadoPc($enc, $chave);
            if ($plano !== null) return $plano;
        }
        // 2) formato antigo da nuvem (AES-CBC; o "ciphertext" é um texto base64)
        $raw = base64_decode(substr($enc, strlen(GOV_PREFIXO_LEGADO)), true);
        if ($raw === false || strlen($raw) <= 16) return '';
        $plain = openssl_decrypt(substr($raw, 16), 'aes-256-cbc', govChaveLegada(), 0, substr($raw, 0, 16));
        return $plain === false ? '' : $plain;
    }
    return $enc; // texto puro de bases muito antigas
}

/** Converte qualquer formato para o atual; se não der para decifrar, devolve o valor intacto (nada se perde). */
function govNormalizarParaAtual(string $valor): string {
    if (str_starts_with($valor, GOV_PREFIXO_ATUAL)) return $valor;
    $plano = decryptGovPassword($valor);
    if ($plano === '') return $valor;
    return encryptGovPassword($plano);
}

/**
 * CPF/CNPJ para gravação: só dígitos, exceto o CNPJ alfanumérico (14 caracteres [0-9A-Z] com letras).
 */
function limparDocumentoCliente($doc): ?string {
    if ($doc === null || trim((string)$doc) === '') return null;
    $bruto = strtoupper((string)preg_replace('/[^0-9A-Za-z]/', '', (string)$doc));
    if (strlen($bruto) === 14 && preg_match('/[A-Z]/', $bruto)) return $bruto;
    return (string)preg_replace('/\D/', '', (string)$doc);
}

/** Dígito verificador do CNPJ (numérico ou alfanumérico: valor do caractere = ord(c) - 48). */
function digitoCnpj(string $base): int {
    $pesos = strlen($base) === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    $soma = 0;
    for ($i = 0; $i < strlen($base); $i++) {
        $soma += (ord($base[$i]) - 48) * $pesos[$i];
    }
    $resto = $soma % 11;
    return $resto < 2 ? 0 : 11 - $resto;
}

/** Valida CPF ou CNPJ (inclusive o alfanumérico). Vazio é válido (campo opcional). */
function validarCpfCnpj(?string $doc): bool {
    if ($doc === null || $doc === '') return true;
    $d = limparDocumentoCliente($doc) ?? '';
    if (strlen($d) === 11 && ctype_digit($d)) {
        if (preg_match('/^(\d)\1{10}$/', $d)) return false;
        for ($t = 9; $t < 11; $t++) {
            $soma = 0;
            for ($c = 0; $c < $t; $c++) {
                $soma += (int)$d[$c] * (($t + 1) - $c);
            }
            if ((($soma * 10) % 11) % 10 !== (int)$d[$t]) return false;
        }
        return true;
    }
    if (strlen($d) === 14 && preg_match('/^[0-9A-Z]{12}\d{2}$/', $d)) {
        if (preg_match('/^(.)\1{13}$/', $d)) return false;
        return digitoCnpj(substr($d, 0, 12)) === (int)$d[12] && digitoCnpj(substr($d, 0, 13)) === (int)$d[13];
    }
    return false;
}

/** Colunas de pessoas editáveis pelo cadastro: coluna => chaves aceitas no JSON (a primeira nomeia o histórico). */
function camposPessoaCliente(): array {
    $mesmoNome = [
        'nacionalidade', 'profissao', 'estado_civil', 'regime_bens', 'endereco_completo', 'nome_conjuge', 'cpf_conjuge',
        'rg_conjuge', 'genero_conjuge', 'nacionalidade_conjuge', 'profissao_conjuge', 'tipo_pessoa', 'razao_social',
        'nome_fantasia', 'inscricao_estadual', 'inscricao_municipal', 'representante_legal_id', 'cnh_numero',
        'cnh_categoria', 'cnh_validade', 'cnh_orgao_uf', 'rg_orgao', 'rg_uf', 'naturalidade',
        'certidao_casamento_matricula', 'rg_orgao_conjuge', 'rg_uf_conjuge', 'data_casamento', 'cartorio_casamento',
        'livro_casamento', 'folha_casamento', 'termo_casamento', 'bairro', 'endereco_sem_numero', 'numero_endereco',
    ];
    $campos = ['cpf_cnpj' => ['cpf_cnpj'], 'rg' => ['rg_ie', 'rg'], 'genero' => ['sexo', 'genero']];
    foreach ($mesmoNome as $coluna) {
        $campos[$coluna] = [$coluna];
    }
    return $campos;
}

/** Colunas de clientes editáveis pelo cadastro (mesma convenção de camposPessoaCliente). */
function camposClienteCliente(): array {
    return [
        'email' => ['email'], 'telefone' => ['telefone'], 'cidade' => ['cidade'], 'estado' => ['estado'],
        'cep' => ['cep'], 'data_nascimento_fundacao' => ['data_nascimento_fundacao'], 'sexo' => ['sexo', 'genero'],
    ];
}

/** Valor do JSON pronto para gravar: vazio vira NULL; documentos são normalizados. */
function normalizarCampoCliente(string $coluna, $valor) {
    if ($coluna === 'cpf_cnpj') return limparDocumentoCliente($valor);
    if ($coluna === 'cpf_conjuge') {
        $digitos = preg_replace('/\D/', '', (string)($valor ?? ''));
        return $digitos === '' ? null : $digitos;
    }
    if ($coluna === 'representante_legal_id') {
        return ($valor === null || $valor === '' || (int)$valor === 0) ? null : (int)$valor;
    }
    return emptyToNull($valor);
}

/** Texto comparável para o histórico (documentos só com os caracteres significativos). */
function textoParaHistorico(string $coluna, $valor): string {
    if ($valor === null) return '';
    if ($coluna === 'cpf_cnpj' || $coluna === 'cpf_conjuge') {
        return (string)limparDocumentoCliente($valor);
    }
    return (string)$valor;
}

function registrarHistoricoCliente(PDO $pdo, int $clienteId, string $campo, ?string $antigo, ?string $novo): void {
    $pdo->prepare("INSERT INTO cliente_historico_logs (id_cliente, campo_alterado, valor_antigo, valor_novo, data_alteracao) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())")
        ->execute([$clienteId, $campo, $antigo, $novo]);
}

function registrarAcessoCliente(PDO $pdo, int $clienteId, string $tipo, string $acao, string $usuario): void {
    $pdo->prepare("INSERT INTO cliente_acesso_logs (id_cliente, tipo_dado, acao, usuario, ip_origem, data_acesso) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())")
        ->execute([$clienteId, $tipo, $acao, $usuario, $_SERVER['REMOTE_ADDR'] ?? 'desconhecido']);
}

/**
 * Exclui o cliente dentro da transação aberta pelo chamador. Retorna [erro|null, status].
 * A pessoa só é removida se não tiver outro papel (outro cliente ou confrontante). A exclusão fica em
 * cliente_exclusoes_log, que não é apagada junto com a trilha de acessos do cliente.
 */
function excluirClienteCompleto(PDO $pdo, int $cid, string $usuario): array {
    $st = $pdo->prepare("SELECT pessoa_id FROM clientes WHERE id = ?");
    $st->execute([$cid]);
    $pId = $st->fetchColumn();
    if ($pId === false) return ['Cliente não encontrado.', 404];

    $levantamentos = 0;
    $propriedades = 0;
    foreach (['propriedade_proprietarios', 'propriedade_clientes'] as $tabela) {
        try {
            $q = $pdo->prepare("SELECT COUNT(*) FROM {$tabela} pp JOIN levantamentos l ON pp.propriedade_id = l.propriedade_id WHERE pp.cliente_id = ?");
            $q->execute([$cid]);
            $levantamentos += (int)$q->fetchColumn();
            $q = $pdo->prepare("SELECT COUNT(*) FROM {$tabela} WHERE cliente_id = ?");
            $q->execute([$cid]);
            $propriedades = max($propriedades, (int)$q->fetchColumn());
        } catch (Exception $e) {}
    }
    if ($levantamentos > 0) return ['Não é possível excluir cliente com levantamentos vinculados.', 409];

    $nome = null;
    $docMascarado = null;
    if ($pId) {
        $q = $pdo->prepare("SELECT nome, cpf_cnpj FROM pessoas WHERE id = ?");
        $q->execute([$pId]);
        $ficha = $q->fetch();
        if ($ficha) {
            $nome = $ficha['nome'];
            $limpo = limparDocumentoCliente($ficha['cpf_cnpj']);
            $docMascarado = $limpo ? substr($limpo, 0, 3) . '***' . substr($limpo, -2) : null;
        }
    }
    $q = $pdo->prepare("SELECT COUNT(*) FROM cliente_acesso_logs WHERE id_cliente = ?");
    $q->execute([$cid]);
    $acessos = (int)$q->fetchColumn();
    $pdo->prepare("INSERT INTO cliente_exclusoes_log (cliente_id, nome, documento_mascarado, usuario, qtd_acessos_sensiveis, qtd_propriedades_desvinculadas, data_exclusao) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())")
        ->execute([$cid, $nome, $docMascarado, $usuario, $acessos, $propriedades]);

    $pdo->prepare("DELETE FROM cliente_documentos WHERE cliente_id = ?")->execute([$cid]);
    $pdo->prepare("DELETE FROM cliente_acesso_logs WHERE id_cliente = ?")->execute([$cid]);
    $pdo->prepare("DELETE FROM cliente_historico_logs WHERE id_cliente = ?")->execute([$cid]);
    lapidarPorColuna($pdo, 'propriedade_proprietarios', 'cliente_id', $cid);
    $pdo->prepare("DELETE FROM propriedade_proprietarios WHERE cliente_id = ?")->execute([$cid]);
    $pdo->prepare("DELETE FROM propriedade_clientes WHERE cliente_id = ?")->execute([$cid]);
    $pdo->prepare("DELETE FROM clientes WHERE id = ?")->execute([$cid]);
    $pdo->prepare("INSERT INTO registros_excluidos (tabela, registro_id) VALUES ('clientes', ?)")->execute([$cid]);

    if ($pId) {
        $q = $pdo->prepare("SELECT COUNT(*) FROM clientes WHERE pessoa_id = ?");
        $q->execute([$pId]);
        $outroCliente = (int)$q->fetchColumn() > 0;
        $confrontante = false;
        try {
            $q = $pdo->prepare("SELECT COUNT(*) FROM confrontantes WHERE pessoa_id = ?");
            $q->execute([$pId]);
            $confrontante = (int)$q->fetchColumn() > 0;
        } catch (Exception $e) {}
        if (!$outroCliente && !$confrontante) {
            // representante_legal_id não tem FK: sem isso a PJ ficaria apontando para uma pessoa que não existe
            $pdo->prepare("UPDATE pessoas SET representante_legal_id = NULL WHERE representante_legal_id = ?")->execute([$pId]);
            $pdo->prepare("DELETE FROM pessoas WHERE id = ?")->execute([$pId]);
            $pdo->prepare("INSERT INTO registros_excluidos (tabela, registro_id) VALUES ('pessoas', ?)")->execute([$pId]);
        }
    }
    return [null, 200];
}

/**
 * Retorna JSON e finaliza a execução
 */
function jsonResponse(mixed $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/**
 * Lê o corpo JSON da requisição
 */
function getJsonInput(): array {
    $raw = file_get_contents('php://input');
    if (empty($raw)) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Converte string vazia ou apenas espaços em null
 */
function emptyToNull($val) {
    if ($val === null) return null;
    if (is_string($val)) {
        $t = trim($val);
        return $t === '' ? null : $t;
    }
    return $val;
}

/**
 * Obtém o usuário atualmente autenticado a partir do token
 */
function lerTokenRequisicao(): ?string {
    $token = null;
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$authHeader && function_exists('getallheaders')) {
        $h = getallheaders();
        $authHeader = $h['Authorization'] ?? ($h['authorization'] ?? '');
    }
    if ($authHeader && preg_match('/Bearer\s+(\S+)/i', $authHeader, $m)) {
        $token = $m[1];
    } elseif (!empty($_SERVER['HTTP_X_AUTH_TOKEN'])) {
        $token = trim($_SERVER['HTTP_X_AUTH_TOKEN']);
    } elseif (!empty($_GET['token'])) {
        $token = trim($_GET['token']);
    }

    return $token ?: null;
}

/**
 * Emite um token por dispositivo (armazenado como hash SHA-256). Logar em um computador não derruba
 * a sessão dos outros. Mantém no máximo 20 tokens por usuário e descarta os com mais de 180 dias.
 */
function emitirToken(PDO $pdo, int $userId): string {
    $token = bin2hex(random_bytes(32));
    try {
        $pdo->prepare("INSERT INTO user_tokens (user_id, token_hash, created_at) VALUES (?, ?, NOW())")
            ->execute([$userId, hash('sha256', $token)]);
        $pdo->prepare("DELETE FROM user_tokens WHERE user_id = ? AND created_at < (NOW() - INTERVAL 180 DAY)")->execute([$userId]);
        $pdo->prepare(
            "DELETE FROM user_tokens WHERE user_id = ? AND id NOT IN (
                SELECT id FROM (SELECT id FROM user_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 20) t
            )"
        )->execute([$userId, $userId]);
    } catch (Exception $e) {
        // Fallback legado (um token por usuário) se a tabela de tokens não estiver disponível
        try {
            $pdo->prepare("UPDATE users SET api_token = ?, token_created_at = NOW() WHERE id = ?")->execute([$token, $userId]);
        } catch (Exception $e2) {}
    }
    return $token;
}

function getAuthenticatedUser(PDO $pdo): ?array {
    $token = lerTokenRequisicao();
    if (!$token) {
        return null;
    }

    $cols = "u.id, u.name, u.email, u.role, u.is_blocked, u.profile_image, u.created_at";
    try {
        $stmt = $pdo->prepare("SELECT {$cols} FROM user_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND u.is_blocked = 0 LIMIT 1");
        $stmt->execute([hash('sha256', $token)]);
        $user = $stmt->fetch();
        if ($user) return $user;
    } catch (Exception $e) {}

    // Sessões antigas (token único em users.api_token) continuam válidas até o próximo login
    $stmt = $pdo->prepare("SELECT id, name, email, role, is_blocked, profile_image, created_at FROM users WHERE api_token = ? AND is_blocked = 0 LIMIT 1");
    $stmt->execute([$token]);
    $user = $stmt->fetch();
    return $user ?: null;
}

/**
 * Garante que a requisição está autenticada, retornando os dados do usuário ou encerrando com 401
 */
function requireAuth(PDO $pdo): array {
    $user = getAuthenticatedUser($pdo);
    if (!$user) {
        jsonResponse(['error' => 'Acesso negado: faça login ou forneça um token de autenticação válido.'], 401);
    }
    return $user;
}

/**
 * Atualiza o timestamp global de mutações para que outros computadores detectem alterações em tempo real
 */
function touchCloudSyncTimestamp(PDO $pdo): int {
    $ts = time();
    try {
        $stmt = $pdo->prepare("INSERT INTO configuracoes (chave, valor) VALUES ('cloud_last_sync_ts', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)");
        $stmt->execute([(string)$ts]);
    } catch (Exception $e) {}
    return $ts;
}


// 3. Determinação da Rota e Método HTTP
$method = $_SERVER['REQUEST_METHOD'];
$requestUri = $_SERVER['REQUEST_URI'];
$route = isset($_GET['__route']) ? $_GET['__route'] : parse_url($requestUri, PHP_URL_PATH);

// Normalização da rota (remove prefixos e slashes residuais)
$route = preg_replace('#^.*/api\.php#', '', $route);
$route = '/' . trim($route, '/');

// --- A. Endpoints Públicos / Legados de Hub Cloud ---

// 1. Healthcheck / Status
if ((($route === '/' || $route === '') && empty($_GET['action'])) || $route === '/status' || (isset($_GET['action']) && $_GET['action'] === 'status')) {
    jsonResponse([
        'status' => 'online',
        'service' => 'GerenciGeo Cloud Hub (MySQL)',
        'version' => '2.0.0',
        'database' => 'MySQL Conectado',
        // diagnóstico sem segredos: indica se o gerencigeo_config.php (fora da pasta pública) foi encontrado
        'config_externa' => !empty($GLOBALS['gg_cfg']),
        'chave_compartilhada_definida' => ggCfg('GERENCIGEO_SECRET_KEY', '') !== '',
        'sync_schema' => (function () {
            try { return ensureSyncSchema(getDb()); } catch (Throwable $e) { return 'erro'; }
        })(),
        'timestamp' => time()
    ]);
}

// 1.1 Autenticação e Controle de Sessão
if ($route === '/auth/register' || (isset($_GET['action']) && $_GET['action'] === 'register')) {
    if ($method !== 'POST') {
        jsonResponse(['error' => 'Método não permitido.'], 405);
    }
    $input = getJsonInput();
    $name = trim((string)($input['name'] ?? ''));
    $email = trim(strtolower((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');

    if (empty($name) || empty($email) || empty($password)) {
        jsonResponse(['error' => 'Informe seu nome completo, e-mail e senha.'], 400);
    }

    if (strlen($password) < 6) {
        jsonResponse(['error' => 'A senha deve conter no mínimo 6 caracteres.'], 400);
    }

    $pdo = getDb();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        jsonResponse(['error' => 'Este e-mail já está cadastrado no sistema.'], 400);
    }

    $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("INSERT INTO users (name, email, password, role, is_blocked) VALUES (?, ?, ?, 'admin', 0)");
    $stmt->execute([$name, $email, $hashedPassword]);
    $userId = (int)$pdo->lastInsertId();

    $token = emitirToken($pdo, $userId);

    jsonResponse([
        'status' => 'success',
        'token' => $token,
        'user' => [
            'id' => $userId,
            'name' => $name,
            'email' => $email,
            'role' => 'admin',
            'profile_image' => null,
            'created_at' => date('Y-m-d H:i:s')
        ],
        'message' => 'Conta criada com sucesso!'
    ]);
}

if ($route === '/auth/login' || (isset($_GET['action']) && $_GET['action'] === 'login')) {
    if ($method !== 'POST') {
        jsonResponse(['error' => 'Método não permitido.'], 405);
    }
    $input = getJsonInput();
    $email = trim(strtolower((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');

    if (empty($email) || empty($password)) {
        jsonResponse(['error' => 'Informe seu e-mail e sua senha.'], 400);
    }

    $pdo = getDb();
    $stmt = $pdo->prepare("SELECT id, name, email, password, role, is_blocked, profile_image, created_at FROM users WHERE LOWER(email) = ? LIMIT 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    // Mitigação de timing attack
    $dummyHash = '$2y$10$e8wF4nQ1l2D3k4j5h6g7f8e9d0c1b2a3s4d5f6g7h8j9k0l1z2x3c';
    if (!$user) {
        password_verify($password, $dummyHash);
        jsonResponse(['error' => 'E-mail ou senha incorretos.'], 401);
    }

    if (!empty($user['is_blocked'])) {
        jsonResponse(['error' => 'Os administradores bloquearam o seu acesso.'], 403);
    }

    if (!password_verify($password, $user['password'])) {
        jsonResponse(['error' => 'E-mail ou senha incorretos.'], 401);
    }

    $token = emitirToken($pdo, (int)$user['id']);

    jsonResponse([
        'status' => 'success',
        'token' => $token,
        'user' => [
            'id' => (int)$user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'] ?? 'admin',
            'profile_image' => $user['profile_image'] ?? null,
            'created_at' => $user['created_at'] ?? null
        ],
        'message' => 'Login realizado com sucesso.'
    ]);
}

if ($route === '/auth/logout' || (isset($_GET['action']) && $_GET['action'] === 'logout')) {
    $pdo = getDb();
    $user = getAuthenticatedUser($pdo);
    if ($user) {
        $tk = lerTokenRequisicao();
        try {
            // Encerra apenas a sessão deste computador; os demais continuam conectados
            $pdo->prepare("DELETE FROM user_tokens WHERE token_hash = ?")->execute([hash('sha256', (string)$tk)]);
            $pdo->prepare("UPDATE users SET api_token = NULL WHERE id = ? AND api_token = ?")->execute([$user['id'], $tk]);
        } catch (Exception $e) {}
    }
    jsonResponse(['status' => 'success', 'message' => 'Logout realizado com sucesso.']);
}

if ($route === '/auth/me' || (isset($_GET['action']) && $_GET['action'] === 'me')) {
    $pdo = getDb();
    $user = requireAuth($pdo);
    jsonResponse([
        'status' => 'success',
        'user' => [
            'id' => (int)$user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'] ?? 'admin',
            'profile_image' => $user['profile_image'] ?? null,
            'created_at' => $user['created_at'] ?? null
        ]
    ]);
}

// 2. Estatísticas do Dashboard
if ($route === '/stats' || (isset($_GET['action']) && $_GET['action'] === 'stats')) {
    $pdo = getDb();
    $totalClientes = (int)$pdo->query("SELECT COUNT(*) FROM clientes")->fetchColumn();
    $totalProps = (int)$pdo->query("SELECT COUNT(*) FROM propriedades")->fetchColumn();
    $totalProf = (int)$pdo->query("SELECT COUNT(*) FROM profissionais")->fetchColumn();
    $totalLevs = (int)$pdo->query("SELECT COUNT(*) FROM levantamentos")->fetchColumn();

    jsonResponse([
        'clientes' => $totalClientes,
        'propriedades' => $totalProps,
        'profissionais' => $totalProf,
        'levantamentos' => $totalLevs
    ]);
}

// 3. Alertas do Dashboard
if ($route === '/dashboard/alerts' || (isset($_GET['action']) && $_GET['action'] === 'alerts')) {
    $pdo = getDb();
    $stmt = $pdo->query("SELECT * FROM pendencias WHERE status = 'PENDENTE' ORDER BY CASE prioridade WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END ASC, prazo ASC, id DESC LIMIT 10");
    $alerts = [];
    while ($row = $stmt->fetch()) {
        $prioridade = $row['prioridade'] ?? 'MEDIA';
        $alerts[] = [
            'id' => $row['id'],
            'tipo' => 'MANUAL',
            'prioridade' => $prioridade,
            'titulo' => $row['titulo'],
            'mensagem' => $row['descricao'] ?? ($row['prazo'] ? "Prazo: " . $row['prazo'] : "Tarefa ({$prioridade})"),
            'prazo' => $row['prazo'] ?? null,
            'icone' => 'check-square',
            'acao' => [
                'tipo' => 'concluir',
                'id' => $row['id'],
                'rotulo' => 'Concluir'
            ]
        ];
    }
    jsonResponse(['alerts' => $alerts]);
}

// 4. Geometrias das Matrículas para o Mapa Geral
if ($route === '/dashboard/matriculas-geometrias' || (isset($_GET['action']) && $_GET['action'] === 'matriculas-geometrias')) {
    $pdo = getDb();
    $stmt = $pdo->query("SELECT p.id, p.nome_vertice, COALESCE(p.lat, p.lat_corrigido) as lat, COALESCE(p.lon, p.lon_corrigido) as lon, COALESCE(p.este, p.e_original) as este, COALESCE(p.norte, p.n_original) as norte, p.matricula_id FROM pontos p WHERE (p.lat IS NOT NULL OR p.lat_corrigido IS NOT NULL) LIMIT 500");
    jsonResponse($stmt->fetchAll());
}

// 5. Proxy SIGEF / INCRA Seguro
if (isset($_GET['action']) && $_GET['action'] === 'proxy_sigef') {
    $targetUrl = isset($_GET['url']) ? trim($_GET['url']) : '';
    if (empty($targetUrl)) {
        jsonResponse(['error' => 'Parâmetro url é obrigatório.'], 400);
    }
    $parsed = parse_url($targetUrl);
    if (!$parsed || !isset($parsed['scheme']) || !isset($parsed['host'])) {
        jsonResponse(['error' => 'URL inválida.'], 400);
    }
    $scheme = strtolower($parsed['scheme']);
    $host = strtolower($parsed['host']);
    $allowedHosts = [
        'acervofundiario.incra.gov.br',
        'sigef.incra.gov.br',
        'servicodados.ibge.gov.br'
    ];
    if ($scheme !== 'https' || !in_array($host, $allowedHosts, true)) {
        jsonResponse(['error' => 'Destino não permitido pelo proxy de segurança.'], 403);
    }
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $targetUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    curl_setopt($ch, CURLOPT_USERAGENT, 'GerenciGeo Cloud Proxy/2.0');
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);

    http_response_code($httpCode ?: 200);
    header('Content-Type: ' . ($contentType ?: 'text/plain; charset=utf-8'));
    echo $response;
    exit;
}

// 6. Leitura e Gravação de Levantamento Compartilhado Público (por código)
if (isset($_GET['codigo']) && $method === 'GET') {
    $codigo = preg_replace('/[^a-zA-Z0-9]/', '', (string)$_GET['codigo']);
    if (!empty($codigo)) {
        $pdo = getDb();
        $stmt = $pdo->prepare("SELECT * FROM levantamentos WHERE codigo_compartilhamento = ?");
        $stmt->execute([$codigo]);
        $lev = $stmt->fetch();
        if ($lev) {
            $stmtPts = $pdo->prepare("SELECT *, COALESCE(lat, lat_corrigido) as lat, COALESCE(lon, lon_corrigido) as lon, COALESCE(alt, altitude) as alt FROM pontos WHERE levantamento_id = ? ORDER BY ordem_caminhamento ASC");
            $stmtPts->execute([$lev['id']]);
            $pontos = $stmtPts->fetchAll();

            $stmtSegs = $pdo->prepare("SELECT * FROM segmentos WHERE levantamento_id = ?");
            $stmtSegs->execute([$lev['id']]);
            $segmentos = $stmtSegs->fetchAll();

            jsonResponse([
                'levantamento' => $lev,
                'pontos' => $pontos,
                'segmentos' => $segmentos
            ]);
        }
        $filePath = $storageDir . '/' . $codigo . '.json';
        if (file_exists($filePath)) {
            header('Content-Type: application/json; charset=utf-8');
            readfile($filePath);
            exit;
        }
    }
    jsonResponse(['error' => 'Levantamento não localizado ou código inválido.'], 404);
}

// --- B. Endpoints REST Administrativos (Clientes, Propriedades, Levantamentos) ---

$pdo = getDb();

// 1. ROTAS DE CLIENTES
if (preg_match('#^/clientes(?:/([0-9]+))?(?:/([a-zA-Z0-9_-]+))?$#', $route, $matches)) {
    $id = isset($matches[1]) && $matches[1] !== '' ? (int)$matches[1] : null;
    $subAction = isset($matches[2]) ? $matches[2] : null;

    // Cadastro de clientes (CPF/CNPJ, contatos, senha GOV): nada sem login
    $authUser = requireAuth($pdo);
    $usuarioAuditoria = (string)($authUser['name'] ?? ($authUser['email'] ?? 'Operador Web'));

    // POST /clientes/{id}/revelar-senha (Auditoria e revelação)
    if ($method === 'POST' && $id && $subAction === 'revelar-senha') {
        $stmt = $pdo->prepare("SELECT senha_gov FROM clientes WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) jsonResponse(['error' => 'Cliente não encontrado.'], 404);
        if (empty($row['senha_gov'])) jsonResponse(['senha_gov' => null, 'message' => 'Nenhuma senha cadastrada.']);

        $decrypted = decryptGovPassword((string)$row['senha_gov']);
        if ($decrypted === '') {
            jsonResponse(['error' => 'Não foi possível decifrar a senha GOV (chave de criptografia diferente da usada ao gravar).'], 409);
        }
        registrarAcessoCliente($pdo, $id, 'SENHA_GOV', 'REVELACAO_VISUAL', $usuarioAuditoria);
        jsonResponse(['senha_gov' => $decrypted]);
    }

    // GET /clientes/{id}/historico (alterações cadastrais)
    if ($method === 'GET' && $id && $subAction === 'historico') {
        $stmt = $pdo->prepare("SELECT campo_alterado, valor_antigo, valor_novo, data_alteracao FROM cliente_historico_logs WHERE id_cliente = ? ORDER BY data_alteracao DESC, id DESC");
        $stmt->execute([$id]);
        jsonResponse($stmt->fetchAll());
    }

    // GET /clientes/{id}/acessos (trilha de acessos a dados sensíveis)
    if ($method === 'GET' && $id && $subAction === 'acessos') {
        $stmt = $pdo->prepare("SELECT id, tipo_dado, acao, usuario, ip_origem, data_acesso FROM cliente_acesso_logs WHERE id_cliente = ? ORDER BY data_acesso DESC, id DESC");
        $stmt->execute([$id]);
        jsonResponse($stmt->fetchAll());
    }

    // GET /clientes/{id}/documentos
    if ($method === 'GET' && $id && $subAction === 'documentos') {
        $stmt = $pdo->prepare("SELECT * FROM cliente_documentos WHERE cliente_id = ? ORDER BY id DESC");
        $stmt->execute([$id]);
        jsonResponse($stmt->fetchAll());
    }

    // GET /clientes/{id} (Detalhes de um cliente)
    if ($method === 'GET' && $id && !$subAction) {
        $sql = "SELECT c.*, 
                       p.nome as nome_completo,
                       p.nome,
                       p.cpf_cnpj,
                       p.rg,
                       p.rg as rg_ie,
                       p.genero,
                       p.nacionalidade,
                       p.profissao, 
                       p.estado_civil,
                       p.regime_bens,
                       p.endereco_completo,
                       p.endereco_sem_numero,
                       p.numero_endereco,
                       p.bairro,
                       p.nome_conjuge, 
                       p.cpf_conjuge,
                       p.rg_conjuge,
                       p.genero_conjuge,
                       p.nacionalidade_conjuge,
                       p.profissao_conjuge,
                       p.rg_orgao_conjuge,
                       p.rg_uf_conjuge,
                       p.data_casamento,
                       p.cartorio_casamento,
                       p.livro_casamento,
                       p.folha_casamento,
                       p.termo_casamento,
                       p.tipo_pessoa,
                       p.razao_social,
                       p.nome_fantasia,
                       p.inscricao_estadual,
                       p.inscricao_municipal,
                       p.representante_legal_id,
                       rep.nome as representante_legal_nome,
                       p.cnh_numero,
                       p.cnh_categoria,
                       p.cnh_validade,
                       p.cnh_orgao_uf,
                       p.rg_orgao,
                       p.rg_uf,
                       p.naturalidade,
                       p.certidao_casamento_matricula,
                       COALESCE((SELECT COUNT(*) FROM propriedade_clientes pc WHERE pc.cliente_id = c.id), 
                                (SELECT COUNT(*) FROM propriedade_proprietarios pp WHERE pp.cliente_id = c.id), 0) as total_propriedades,
                       (SELECT COUNT(*) FROM cliente_documentos cd WHERE cd.cliente_id = c.id) as total_documentos,
                       (SELECT COUNT(*) FROM propriedade_clientes pc JOIN levantamentos l ON pc.propriedade_id = l.propriedade_id WHERE pc.cliente_id = c.id) as total_levantamentos
                FROM clientes c
                JOIN pessoas p ON c.pessoa_id = p.id
                LEFT JOIN pessoas rep ON p.representante_legal_id = rep.id
                WHERE c.id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$id]);
        $c = $stmt->fetch();
        if (!$c) jsonResponse(['error' => 'Cliente não encontrado.'], 404);
        $hasSenha = !empty($c['senha_gov']);
        $c['tem_senha_gov'] = $hasSenha;
        $c['senha_gov'] = $hasSenha ? '••••••••' : null;
        if (empty($c['nome_completo']) && !empty($c['nome'])) {
            $c['nome_completo'] = $c['nome'];
        }
        if (empty($c['nome']) && !empty($c['nome_completo'])) {
            $c['nome'] = $c['nome_completo'];
        }

        // Buscar propriedades vinculadas do cliente
        $stmtP = $pdo->prepare("SELECT p.id, COALESCE(p.nome_propriedade, p.nome) as nome_propriedade, p.municipio, COALESCE(pc.percentual_participacao, 100) as percentual_participacao
                                FROM propriedade_clientes pc
                                JOIN propriedades p ON pc.propriedade_id = p.id
                                WHERE pc.cliente_id = ?");
        $stmtP->execute([$id]);
        $c['propriedades'] = $stmtP->fetchAll();

        // Buscar documentos do cliente
        $stmtD = $pdo->prepare("SELECT * FROM cliente_documentos WHERE cliente_id = ? ORDER BY id DESC");
        $stmtD->execute([$id]);
        $c['documentos'] = $stmtD->fetchAll();

        jsonResponse($c);
    }

    // GET /clientes (Lista completa)
    if ($method === 'GET' && !$id) {
        $sql = "SELECT c.*, 
                       p.nome as nome_completo,
                       p.nome,
                       p.cpf_cnpj,
                       p.rg,
                       p.rg as rg_ie,
                       p.genero,
                       p.nacionalidade,
                       p.profissao, 
                       p.estado_civil,
                       p.regime_bens,
                       p.endereco_completo,
                       p.endereco_sem_numero,
                       p.numero_endereco,
                       p.bairro,
                       p.nome_conjuge, 
                       p.cpf_conjuge,
                       p.rg_conjuge,
                       p.genero_conjuge,
                       p.nacionalidade_conjuge,
                       p.profissao_conjuge,
                       p.rg_orgao_conjuge,
                       p.rg_uf_conjuge,
                       p.data_casamento,
                       p.cartorio_casamento,
                       p.livro_casamento,
                       p.folha_casamento,
                       p.termo_casamento,
                       p.tipo_pessoa,
                       p.razao_social,
                       p.nome_fantasia,
                       p.inscricao_estadual,
                       p.inscricao_municipal,
                       p.representante_legal_id,
                       rep.nome as representante_legal_nome,
                       p.cnh_numero,
                       p.cnh_categoria,
                       p.cnh_validade,
                       p.cnh_orgao_uf,
                       p.rg_orgao,
                       p.rg_uf,
                       p.naturalidade,
                       p.certidao_casamento_matricula,
                       COALESCE((SELECT COUNT(*) FROM propriedade_clientes pc WHERE pc.cliente_id = c.id), 
                                (SELECT COUNT(*) FROM propriedade_proprietarios pp WHERE pp.cliente_id = c.id), 0) as total_propriedades,
                       (SELECT COUNT(*) FROM cliente_documentos cd WHERE cd.cliente_id = c.id) as total_documentos,
                       (SELECT COUNT(*) FROM propriedade_clientes pc JOIN levantamentos l ON pc.propriedade_id = l.propriedade_id WHERE pc.cliente_id = c.id) as total_levantamentos
                FROM clientes c
                JOIN pessoas p ON c.pessoa_id = p.id
                LEFT JOIN pessoas rep ON p.representante_legal_id = rep.id
                ORDER BY p.nome ASC";
        $stmt = $pdo->query($sql);
        $clientes = [];
        while ($c = $stmt->fetch()) {
            $hasSenha = !empty($c['senha_gov']);
            $c['tem_senha_gov'] = $hasSenha;
            $c['senha_gov'] = $hasSenha ? '••••••••' : null;
            if (empty($c['nome_completo']) && !empty($c['nome'])) {
                $c['nome_completo'] = $c['nome'];
            }
            if (empty($c['nome']) && !empty($c['nome_completo'])) {
                $c['nome'] = $c['nome_completo'];
            }
            $clientes[] = $c;
        }
        jsonResponse($clientes);
    }

    // POST /clientes/excluir-lote
    if ($method === 'POST' && $subAction === 'excluir-lote') {
        $input = getJsonInput();
        $ids = is_array($input['cliente_ids'] ?? null) ? $input['cliente_ids'] : [];
        $sucessos = 0;
        $erros = [];
        $pdo->beginTransaction();
        try {
            foreach ($ids as $cid) {
                $cid = (int)$cid;
                if (!$cid) continue;
                [$erro] = excluirClienteCompleto($pdo, $cid, $usuarioAuditoria);
                if ($erro !== null) {
                    $erros[] = "Cliente ID {$cid}: {$erro}";
                    continue;
                }
                $sucessos++;
            }
            $pdo->commit();
            touchCloudSyncTimestamp($pdo);
            jsonResponse([
                'sucessos' => $sucessos,
                'erros' => $erros,
                'total_processado' => count($ids),
                'message' => "{$sucessos} cliente(s) excluído(s) com sucesso!"
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Erro ao excluir clientes em lote: ' . $e->getMessage()], 500);
        }
    }

    // POST /clientes
    if ($method === 'POST' && !$id) {
        $input = getJsonInput();
        $nome = trim((string)($input['nome_completo'] ?? $input['nome'] ?? $input['razao_social'] ?? ''));
        if (empty($nome)) jsonResponse(['error' => 'Nome do cliente é obrigatório.'], 400);

        $docNormalizado = limparDocumentoCliente($input['cpf_cnpj'] ?? null);
        if (!validarCpfCnpj($docNormalizado)) jsonResponse(['error' => 'CPF/CNPJ inválido'], 400);
        $pessoaExistenteId = null;
        if ($docNormalizado !== null) {
            $stDoc = $pdo->prepare("SELECT id FROM pessoas WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '') = ? LIMIT 1");
            $stDoc->execute([$docNormalizado]);
            $achada = $stDoc->fetchColumn();
            if ($achada) {
                $stJaCliente = $pdo->prepare("SELECT COUNT(*) FROM clientes WHERE pessoa_id = ?");
                $stJaCliente->execute([(int)$achada]);
                if ((int)$stJaCliente->fetchColumn() > 0) jsonResponse(['error' => 'CPF/CNPJ já cadastrado'], 400);
                $pessoaExistenteId = (int)$achada; // pessoa que já existia só como confrontante
            }
        }

        $pdo->beginTransaction();
        try {
            $tipoPessoa = $input['tipo_pessoa'] ?? 'PF';
            $razaoSocial = $tipoPessoa === 'PJ' ? ($input['razao_social'] ?? $nome) : ($input['razao_social'] ?? null);

            if ($pessoaExistenteId !== null) {
                $pessoaId = $pessoaExistenteId;
            } else {
            $stmtP = $pdo->prepare("INSERT INTO pessoas (
                nome, cpf_cnpj, rg, genero, nacionalidade, profissao, estado_civil, regime_bens, endereco_completo,
                nome_conjuge, cpf_conjuge, rg_conjuge, genero_conjuge, nacionalidade_conjuge, profissao_conjuge,
                tipo_pessoa, razao_social, nome_fantasia, inscricao_estadual, inscricao_municipal, representante_legal_id,
                cnh_numero, cnh_categoria, cnh_validade, cnh_orgao_uf, rg_orgao, rg_uf, naturalidade, certidao_casamento_matricula,
                rg_orgao_conjuge, rg_uf_conjuge, data_casamento, cartorio_casamento, livro_casamento, folha_casamento, termo_casamento,
                bairro, endereco_sem_numero, numero_endereco
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?
            )");
            $stmtP->execute([
                $nome,
                $docNormalizado,
                emptyToNull($input['rg'] ?? $input['rg_ie'] ?? null),
                emptyToNull($input['genero'] ?? $input['sexo'] ?? 'M'),
                emptyToNull($input['nacionalidade'] ?? null),
                emptyToNull($input['profissao'] ?? null),
                emptyToNull($input['estado_civil'] ?? null),
                emptyToNull($input['regime_bens'] ?? null),
                emptyToNull($input['endereco_completo'] ?? null),
                emptyToNull($input['nome_conjuge'] ?? null),
                normalizarCampoCliente('cpf_conjuge', $input['cpf_conjuge'] ?? null),
                emptyToNull($input['rg_conjuge'] ?? null),
                emptyToNull($input['genero_conjuge'] ?? null),
                emptyToNull($input['nacionalidade_conjuge'] ?? null),
                emptyToNull($input['profissao_conjuge'] ?? null),
                emptyToNull($tipoPessoa),
                emptyToNull($razaoSocial),
                emptyToNull($input['nome_fantasia'] ?? null),
                emptyToNull($input['inscricao_estadual'] ?? null),
                emptyToNull($input['inscricao_municipal'] ?? null),
                !empty($input['representante_legal_id']) ? (int)$input['representante_legal_id'] : null,
                emptyToNull($input['cnh_numero'] ?? null),
                emptyToNull($input['cnh_categoria'] ?? null),
                emptyToNull($input['cnh_validade'] ?? null),
                emptyToNull($input['cnh_orgao_uf'] ?? null),
                emptyToNull($input['rg_orgao'] ?? null),
                emptyToNull($input['rg_uf'] ?? null),
                emptyToNull($input['naturalidade'] ?? null),
                emptyToNull($input['certidao_casamento_matricula'] ?? null),
                emptyToNull($input['rg_orgao_conjuge'] ?? null),
                emptyToNull($input['rg_uf_conjuge'] ?? null),
                emptyToNull($input['data_casamento'] ?? null),
                emptyToNull($input['cartorio_casamento'] ?? null),
                emptyToNull($input['livro_casamento'] ?? null),
                emptyToNull($input['folha_casamento'] ?? null),
                emptyToNull($input['termo_casamento'] ?? null),
                emptyToNull($input['bairro'] ?? null),
                emptyToNull($input['endereco_sem_numero'] ?? null),
                emptyToNull($input['numero_endereco'] ?? null)
            ]);
            $pessoaId = (int)$pdo->lastInsertId();
            }

            $senhaBruta = trim((string)($input['senha_gov'] ?? ''));
            $senhaCifrada = ($senhaBruta !== '' && $senhaBruta !== '••••••••') ? encryptGovPassword($senhaBruta) : null;
            $stmtC = $pdo->prepare("INSERT INTO clientes (pessoa_id, profissional_id, data_nascimento_fundacao, email, telefone, cidade, estado, cep, sexo, senha_gov, metadados) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmtC->execute([
                $pessoaId,
                !empty($input['profissional_id']) ? (int)$input['profissional_id'] : null,
                emptyToNull($input['data_nascimento_fundacao'] ?? null),
                emptyToNull($input['email'] ?? null),
                emptyToNull($input['telefone'] ?? null),
                emptyToNull($input['cidade'] ?? null),
                emptyToNull($input['estado'] ?? null),
                emptyToNull($input['cep'] ?? null),
                emptyToNull($input['sexo'] ?? ($input['genero'] ?? 'M')),
                $senhaCifrada,
                !empty($input['metadados']) ? (is_string($input['metadados']) ? $input['metadados'] : json_encode($input['metadados'], JSON_UNESCAPED_UNICODE)) : null
            ]);
            $clienteId = (int)$pdo->lastInsertId();
            touchCloudSyncTimestamp($pdo);
            $pdo->commit();
            jsonResponse(['id' => $clienteId, 'message' => 'Cliente cadastrado com sucesso!'], 201);
        } catch (Exception $e) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Erro ao salvar cliente: ' . $e->getMessage()], 500);
        }
    }

    // PUT /clientes/{id}
    // Atualização parcial: chave ausente do JSON = mantém; chave presente (inclusive null/"") = grava, e a
    // mudança entra em cliente_historico_logs. Senha GOV: "" remove, a máscara "••••••••" mantém.
    if ($method === 'PUT' && $id) {
        $input = getJsonInput();
        $stmtC = $pdo->prepare("SELECT * FROM clientes WHERE id = ?");
        $stmtC->execute([$id]);
        $cliAtual = $stmtC->fetch();
        if (!$cliAtual) jsonResponse(['error' => 'Cliente não encontrado.'], 404);
        $pessoaId = (int)$cliAtual['pessoa_id'];
        $stmtPe = $pdo->prepare("SELECT * FROM pessoas WHERE id = ?");
        $stmtPe->execute([$pessoaId]);
        $pesAtual = $stmtPe->fetch() ?: [];

        // Um nome só pode ser trocado por outro nome (a coluna é NOT NULL)
        $nome = trim((string)($input['nome_completo'] ?? $input['nome'] ?? $input['razao_social'] ?? ''));

        // Monta os SET a partir das colunas permitidas (nomes de coluna vêm das listas fixas, nunca do JSON)
        $setP = [];
        $parP = [];
        $mudancas = [];
        if ($nome !== '' && (string)($pesAtual['nome'] ?? '') !== $nome) {
            $setP[] = '`nome` = ?';
            $parP[] = $nome;
            $mudancas[] = ['nome_completo', (string)($pesAtual['nome'] ?? ''), $nome];
        }
        foreach (camposPessoaCliente() as $coluna => $chaves) {
            $chave = null;
            foreach ($chaves as $k) {
                if (array_key_exists($k, $input)) { $chave = $k; break; }
            }
            if ($chave === null) continue;
            $novo = normalizarCampoCliente($coluna, $input[$chave]);
            $antes = textoParaHistorico($coluna, $pesAtual[$coluna] ?? null);
            $depois = textoParaHistorico($coluna, $novo);
            if ($coluna === 'cpf_cnpj' && !validarCpfCnpj($novo)) jsonResponse(['error' => 'CPF/CNPJ inválido'], 400);
            if ($antes === $depois) continue;
            $setP[] = "`{$coluna}` = ?";
            $parP[] = $novo;
            $mudancas[] = [$chaves[0], $antes, $depois];
        }

        $setC = [];
        $parC = [];
        foreach (camposClienteCliente() as $coluna => $chaves) {
            $chave = null;
            foreach ($chaves as $k) {
                if (array_key_exists($k, $input)) { $chave = $k; break; }
            }
            if ($chave === null) continue;
            $novo = normalizarCampoCliente($coluna, $input[$chave]);
            $antes = textoParaHistorico($coluna, $cliAtual[$coluna] ?? null);
            $depois = textoParaHistorico($coluna, $novo);
            if ($antes === $depois) continue;
            $setC[] = "`{$coluna}` = ?";
            $parC[] = $novo;
            // sexo já entra no histórico pela coluna genero de pessoas
            if ($coluna !== 'sexo') $mudancas[] = [$chaves[0], $antes, $depois];
        }

        if (array_key_exists('metadados', $input)) {
            $meta = $input['metadados'];
            $setC[] = '`metadados` = ?';
            $parC[] = empty($meta) ? null : (is_string($meta) ? $meta : json_encode($meta, JSON_UNESCAPED_UNICODE));
        }

        $mudancaSenha = null;
        $senhaEnviada = $input['senha_gov'] ?? null;
        if (array_key_exists('senha_gov', $input) && $senhaEnviada !== null && $senhaEnviada !== '••••••••') {
            $senhaEnviada = trim((string)$senhaEnviada);
            $tinhaSenha = !empty($cliAtual['senha_gov']);
            if ($senhaEnviada === '') {
                if ($tinhaSenha) {
                    $setC[] = '`senha_gov` = NULL';
                    $mudancaSenha = ['[CONFIDENCIAL]', '[REMOVIDA]'];
                }
            } else {
                $setC[] = '`senha_gov` = ?';
                $parC[] = encryptGovPassword($senhaEnviada);
                $mudancaSenha = [$tinhaSenha ? '[CONFIDENCIAL]' : '[VAZIO]', '[ALTERADA]'];
            }
        }

        // Duplicidade: o documento novo não pode ser de outro cliente nem de outra pessoa (ex.: confrontante)
        $novoDoc = array_key_exists('cpf_cnpj', $input) ? limparDocumentoCliente($input['cpf_cnpj']) : null;
        if ($novoDoc !== null) {
            $stDup = $pdo->prepare("SELECT id FROM pessoas WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '') = ? AND id <> ? LIMIT 1");
            $stDup->execute([$novoDoc, $pessoaId]);
            $outraPessoa = $stDup->fetchColumn();
            if ($outraPessoa) {
                $stCli = $pdo->prepare("SELECT COUNT(*) FROM clientes WHERE pessoa_id = ?");
                $stCli->execute([(int)$outraPessoa]);
                $msg = (int)$stCli->fetchColumn() > 0
                    ? 'CPF/CNPJ já cadastrado para outro cliente'
                    : 'CPF/CNPJ já cadastrado para outra pessoa (por exemplo, um confrontante)';
                jsonResponse(['error' => $msg], 400);
            }
        }

        $pdo->beginTransaction();
        try {
            if ($setP) {
                $pdo->prepare('UPDATE pessoas SET ' . implode(', ', $setP) . ' WHERE id = ?')->execute(array_merge($parP, [$pessoaId]));
            }
            if ($setC) {
                $pdo->prepare('UPDATE clientes SET ' . implode(', ', $setC) . ' WHERE id = ?')->execute(array_merge($parC, [$id]));
            }
            foreach ($mudancas as [$campo, $antes, $depois]) {
                registrarHistoricoCliente($pdo, $id, $campo, $antes, $depois);
            }
            if ($mudancaSenha !== null) {
                registrarHistoricoCliente($pdo, $id, 'senha_gov', $mudancaSenha[0], $mudancaSenha[1]);
            }

            touchCloudSyncTimestamp($pdo);
            $pdo->commit();
            jsonResponse(['id' => $id, 'message' => 'Cliente atualizado com sucesso!']);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            jsonResponse(['error' => 'Erro ao atualizar cliente: ' . $e->getMessage()], 500);
        }
    }

    // DELETE /clientes/{id}
    if ($method === 'DELETE' && $id) {
        $pdo->beginTransaction();
        try {
            [$erro, $status] = excluirClienteCompleto($pdo, $id, $usuarioAuditoria);
            if ($erro !== null) {
                $pdo->rollBack();
                jsonResponse(['error' => $erro], $status);
            }
            $pdo->commit();
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            jsonResponse(['error' => 'Erro ao excluir cliente: ' . $e->getMessage()], 500);
        }
        touchCloudSyncTimestamp($pdo);
        jsonResponse(['message' => 'Cliente excluído com sucesso!']);
    }
}

// 2. ROTAS DE PROPRIEDADES
if (preg_match('#^/propriedades(?:/([0-9]+))?(?:/([a-zA-Z0-9_-]+)(?:/([0-9]+))?)?$#', $route, $matches)) {
    $propId = isset($matches[1]) && $matches[1] !== '' ? (int)$matches[1] : null;
    $subResource = isset($matches[2]) ? $matches[2] : null;
    $subId = isset($matches[3]) && $matches[3] !== '' ? (int)$matches[3] : null;

    // GET /propriedades/{id}/matriculas
    if ($method === 'GET' && $propId && $subResource === 'matriculas') {
        $stmt = $pdo->prepare("SELECT *, COALESCE(numero, numero_matricula) as numero, COALESCE(numero_matricula, numero) as numero_matricula FROM matriculas WHERE propriedade_id = ? ORDER BY id ASC");
        $stmt->execute([$propId]);
        jsonResponse($stmt->fetchAll());
    }

    // POST /propriedades/{id}/matriculas
    if ($method === 'POST' && $propId && $subResource === 'matriculas') {
        $input = getJsonInput();
        $numero = trim($input['numero'] ?? ($input['numero_matricula'] ?? ''));
        $area = (float)($input['area_registrada_ha'] ?? ($input['area_ha'] ?? 0));
        $stmt = $pdo->prepare("INSERT INTO matriculas (propriedade_id, numero, numero_matricula, livro, folha, cartorio, area_ha, perimetro_m, ccir, itr, denominacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $propId,
            $numero,
            $numero,
            $input['livro'] ?? null,
            $input['folha'] ?? null,
            $input['cartorio'] ?? null,
            $area,
            (float)($input['perimetro_m'] ?? 0),
            $input['codigo_ccir'] ?? ($input['ccir'] ?? null),
            $input['codigo_itr'] ?? ($input['itr'] ?? null),
            $input['denominacao_gleba'] ?? ($input['denominacao'] ?? null)
        ]);
        jsonResponse(['id' => (int)$pdo->lastInsertId(), 'message' => 'Matrícula criada com sucesso!'], 201);
    }

    // GET /propriedades/{id}/proprietarios (ou /clientes)
    if ($method === 'GET' && $propId && in_array($subResource, ['proprietarios', 'clientes'])) {
        $stmt = $pdo->prepare("SELECT c.id, p.nome as nome_completo, p.nome, p.cpf_cnpj, 
                                      COALESCE(pp.proporcao, 100) as percentual_participacao,
                                      COALESCE(pp.proporcao, 100) as proporcao,
                                      c.telefone, c.email, pp.id as vinculo_id
                               FROM propriedade_proprietarios pp 
                               JOIN clientes c ON pp.cliente_id = c.id 
                               JOIN pessoas p ON c.pessoa_id = p.id 
                               WHERE pp.propriedade_id = ?
                               ORDER BY pp.id ASC");
        $stmt->execute([$propId]);
        $rows = $stmt->fetchAll();
        $unicos = [];
        foreach ($rows as $r) {
            $cid = (int)$r['id'];
            $unicos[$cid] = $r;
        }
        jsonResponse(array_values($unicos));
    }

    // POST /propriedades/{id}/proprietarios (ou /clientes)
    if ($method === 'POST' && $propId && in_array($subResource, ['proprietarios', 'clientes'])) {
        $input = getJsonInput();
        $cliId = (int)($input['cliente_id'] ?? 0);
        $prop = (float)($input['percentual_participacao'] ?? ($input['proporcao'] ?? 100));
        if ($cliId <= 0) {
            jsonResponse(['error' => 'Cliente inválido.'], 400);
        }

        // Validação da soma de participações não exceder 100%
        $stSoma = $pdo->prepare("SELECT SUM(proporcao) as soma FROM propriedade_proprietarios WHERE propriedade_id = ? AND cliente_id != ?");
        $stSoma->execute([$propId, $cliId]);
        $somaOutros = (float)($stSoma->fetchColumn() ?: 0);
        if (round($somaOutros + $prop, 4) > 100.0001) {
            $restante = max(0.0, round(100.0 - $somaOutros, 2));
            jsonResponse(['error' => "Participação inválida. A soma não pode exceder 100%. Restante disponível: {$restante}%"], 400);
        }

        // Idempotência / Unicidade: atualiza se já existir ou insere se novo
        $stCheck = $pdo->prepare("SELECT id FROM propriedade_proprietarios WHERE propriedade_id = ? AND cliente_id = ? LIMIT 1");
        $stCheck->execute([$propId, $cliId]);
        $existenteId = $stCheck->fetchColumn();

        if ($existenteId) {
            $stmt = $pdo->prepare("UPDATE propriedade_proprietarios SET proporcao = ? WHERE id = ?");
            $stmt->execute([$prop, $existenteId]);
            $pdo->prepare("DELETE FROM propriedade_proprietarios WHERE propriedade_id = ? AND cliente_id = ? AND id != ?")->execute([$propId, $cliId, $existenteId]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO propriedade_proprietarios (propriedade_id, cliente_id, proporcao) VALUES (?, ?, ?)");
            $stmt->execute([$propId, $cliId, $prop]);
        }

        // Mantém sincronizada também a tabela espelho propriedade_clientes
        try {
            $stCheckPc = $pdo->prepare("SELECT id FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ? LIMIT 1");
            $stCheckPc->execute([$propId, $cliId]);
            $existPcId = $stCheckPc->fetchColumn();
            if ($existPcId) {
                $pdo->prepare("UPDATE propriedade_clientes SET percentual_participacao = ? WHERE id = ?")->execute([$prop, $existPcId]);
                $pdo->prepare("DELETE FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ? AND id != ?")->execute([$propId, $cliId, $existPcId]);
            } else {
                $pdo->prepare("INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (?, ?, ?)")->execute([$propId, $cliId, $prop]);
            }
        } catch (Exception $ePc) {}

        touchCloudSyncTimestamp($pdo);
        jsonResponse(['message' => 'Proprietário vinculado com sucesso!'], 201);
    }

    // DELETE /propriedades/{id}/proprietarios/{cliId} (ou /clientes/{cliId})
    if ($method === 'DELETE' && $propId && in_array($subResource, ['proprietarios', 'clientes']) && $subId) {
        $stLap = $pdo->prepare("SELECT id FROM propriedade_proprietarios WHERE propriedade_id = ? AND cliente_id = ?");
        $stLap->execute([$propId, $subId]);
        foreach ($stLap->fetchAll(PDO::FETCH_COLUMN) as $lapId) {
            registrarLapide($pdo, 'propriedade_proprietarios', (int)$lapId);
        }
        $stmt = $pdo->prepare("DELETE FROM propriedade_proprietarios WHERE propriedade_id = ? AND cliente_id = ?");
        $stmt->execute([$propId, $subId]);

        try {
            $stLapPc = $pdo->prepare("SELECT id FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ?");
            $stLapPc->execute([$propId, $subId]);
            foreach ($stLapPc->fetchAll(PDO::FETCH_COLUMN) as $lapPcId) {
                registrarLapide($pdo, 'propriedade_clientes', (int)$lapPcId);
            }
            $pdo->prepare("DELETE FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ?")->execute([$propId, $subId]);
        } catch (Exception $ePc) {}

        touchCloudSyncTimestamp($pdo);
        jsonResponse(['message' => 'Proprietário desvinculado!']);
    }

    // GET /propriedades/{id}
    if ($method === 'GET' && $propId && !$subResource) {
        $stmt = $pdo->prepare("SELECT p.*, COALESCE(p.nome, p.nome_propriedade) as nome, COALESCE(p.nome_propriedade, p.nome) as nome_propriedade,
                                      (SELECT COUNT(*) FROM matriculas m WHERE m.propriedade_id = p.id) as total_matriculas,
                                      (SELECT COUNT(*) FROM levantamentos l WHERE l.propriedade_id = p.id) as total_levantamentos
                               FROM propriedades p WHERE p.id = ?");
        $stmt->execute([$propId]);
        $prop = $stmt->fetch();
        if (!$prop) {
            jsonResponse(['error' => 'Propriedade não encontrada.'], 404);
        }

        $stCli = $pdo->prepare("SELECT c.id, p.nome as nome_completo, p.cpf_cnpj, COALESCE(pp.proporcao, 100) as percentual_participacao
                                FROM propriedade_proprietarios pp
                                JOIN clientes c ON pp.cliente_id = c.id
                                JOIN pessoas p ON c.pessoa_id = p.id
                                WHERE pp.propriedade_id = ?
                                ORDER BY pp.id ASC");
        $stCli->execute([$propId]);
        $cliRows = $stCli->fetchAll();
        $clientesUnicos = [];
        $totalPart = 0.0;
        foreach ($cliRows as $cr) {
            $cid = (int)$cr['id'];
            if (!isset($clientesUnicos[$cid])) {
                $clientesUnicos[$cid] = [
                    'id' => $cid,
                    'nome_completo' => $cr['nome_completo'] ?? '',
                    'cpf_cnpj' => $cr['cpf_cnpj'] ?? '',
                    'percentual_participacao' => (float)$cr['percentual_participacao']
                ];
                $totalPart += (float)$cr['percentual_participacao'];
            }
        }
        $prop['clientes'] = array_values($clientesUnicos);
        $prop['total_proprietarios'] = count($prop['clientes']);
        $prop['total_participacao'] = round($totalPart, 2);
        $prop['composicao_completa'] = abs(round($totalPart, 4) - 100.0) <= 0.01;
        jsonResponse($prop);
    }

    // GET /propriedades
    if ($method === 'GET' && !$propId) {
        $sql = "SELECT p.*, COALESCE(p.nome, p.nome_propriedade) as nome, COALESCE(p.nome_propriedade, p.nome) as nome_propriedade,
                       (SELECT COUNT(*) FROM matriculas m WHERE m.propriedade_id = p.id) as total_matriculas,
                       (SELECT COUNT(*) FROM levantamentos l WHERE l.propriedade_id = p.id) as total_levantamentos
                FROM propriedades p ORDER BY p.id DESC";
        $stmt = $pdo->query($sql);
        $propriedades = $stmt->fetchAll();

        if (empty($propriedades)) {
            jsonResponse([]);
        }

        $pIds = array_column($propriedades, 'id');
        $inClause = implode(',', array_fill(0, count($pIds), '?'));
        $sqlCli = "SELECT pp.propriedade_id, c.id, p.nome as nome_completo, p.cpf_cnpj, 
                          COALESCE(pp.proporcao, 100) as percentual_participacao
                   FROM propriedade_proprietarios pp
                   JOIN clientes c ON pp.cliente_id = c.id
                   JOIN pessoas p ON c.pessoa_id = p.id
                   WHERE pp.propriedade_id IN ({$inClause})
                   ORDER BY pp.id ASC";
        $stCli = $pdo->prepare($sqlCli);
        $stCli->execute($pIds);
        $allCli = $stCli->fetchAll();

        $clientesPorProp = [];
        foreach ($allCli as $cliRow) {
            $pid = (int)$cliRow['propriedade_id'];
            $cid = (int)$cliRow['id'];
            if (!isset($clientesPorProp[$pid])) {
                $clientesPorProp[$pid] = [];
            }
            $jaExiste = false;
            foreach ($clientesPorProp[$pid] as &$itemExistente) {
                if ($itemExistente['id'] === $cid) {
                    $itemExistente['percentual_participacao'] = (float)$cliRow['percentual_participacao'];
                    $jaExiste = true;
                    break;
                }
            }
            if (!$jaExiste) {
                $clientesPorProp[$pid][] = [
                    'id' => $cid,
                    'nome_completo' => $cliRow['nome_completo'] ?? '',
                    'cpf_cnpj' => $cliRow['cpf_cnpj'] ?? '',
                    'percentual_participacao' => (float)$cliRow['percentual_participacao']
                ];
            }
        }

        foreach ($propriedades as &$prop) {
            $pid = (int)$prop['id'];
            $cliList = $clientesPorProp[$pid] ?? [];
            $prop['clientes'] = $cliList;
            $prop['total_proprietarios'] = count($cliList);
            $totalPart = 0.0;
            foreach ($cliList as $cl) {
                $totalPart += (float)($cl['percentual_participacao'] ?? 0);
            }
            $prop['total_participacao'] = round($totalPart, 2);
            $prop['composicao_completa'] = abs(round($totalPart, 4) - 100.0) <= 0.01;
        }
        unset($prop);

        jsonResponse($propriedades);
    }

    // POST /propriedades
    if ($method === 'POST' && !$propId) {
        $input = getJsonInput();
        $nome = trim($input['nome'] ?? ($input['nome_propriedade'] ?? ''));
        if (empty($nome)) jsonResponse(['error' => 'Nome do imóvel é obrigatório.'], 400);

        $stmt = $pdo->prepare("INSERT INTO propriedades (nome, nome_propriedade, municipio, comarca, uf, area_total_ha) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $nome,
            $nome,
            $input['municipio'] ?? null,
            $input['comarca'] ?? null,
            $input['uf'] ?? 'SP',
            (float)($input['area_total_ha'] ?? 0)
        ]);
        jsonResponse(['id' => (int)$pdo->lastInsertId(), 'message' => 'Propriedade criada com sucesso!'], 201);
    }

    // PUT /propriedades/{id}
    if ($method === 'PUT' && $propId) {
        $input = getJsonInput();
        $nome = $input['nome'] ?? ($input['nome_propriedade'] ?? null);
        $stmt = $pdo->prepare("UPDATE propriedades SET nome = COALESCE(?, nome), nome_propriedade = COALESCE(?, nome_propriedade), municipio = COALESCE(?, municipio), comarca = COALESCE(?, comarca), uf = COALESCE(?, uf), area_total_ha = COALESCE(?, area_total_ha) WHERE id = ?");
        $stmt->execute([
            $nome,
            $nome,
            $input['municipio'] ?? null,
            $input['comarca'] ?? null,
            $input['uf'] ?? null,
            isset($input['area_total_ha']) ? (float)$input['area_total_ha'] : null,
            $propId
        ]);
        jsonResponse(['id' => $propId, 'message' => 'Propriedade atualizada com sucesso!']);
    }

    // DELETE /propriedades/{id}
    if ($method === 'DELETE' && $propId && !$subResource) {
        excluirComLapide($pdo, 'propriedades', (int)$propId);
        touchCloudSyncTimestamp($pdo);
        jsonResponse(['message' => 'Propriedade excluída com sucesso!']);
    }
}

// 3. ROTAS DE MATRÍCULAS
if (preg_match('#^/matriculas/([0-9]+)(?:/([a-zA-Z0-9_-]+))?$#', $route, $matches)) {
    $matId = (int)$matches[1];
    $action = isset($matches[2]) ? $matches[2] : null;

    if ($method === 'GET' && $action === 'historico') {
        $stmt = $pdo->prepare("SELECT * FROM matricula_historico WHERE matricula_id = ? ORDER BY data_ato DESC, id DESC");
        $stmt->execute([$matId]);
        jsonResponse($stmt->fetchAll());
    }

    if ($method === 'PUT' && !$action) {
        $input = getJsonInput();
        $num = $input['numero'] ?? ($input['numero_matricula'] ?? null);
        $stmt = $pdo->prepare("UPDATE matriculas SET numero = COALESCE(?, numero), numero_matricula = COALESCE(?, numero_matricula), livro = COALESCE(?, livro), folha = COALESCE(?, folha), cartorio = COALESCE(?, cartorio), area_ha = COALESCE(?, area_ha), perimetro_m = COALESCE(?, perimetro_m), ccir = COALESCE(?, ccir), itr = COALESCE(?, itr), denominacao = COALESCE(?, denominacao) WHERE id = ?");
        $stmt->execute([
            $num,
            $num,
            $input['livro'] ?? null,
            $input['folha'] ?? null,
            $input['cartorio'] ?? null,
            isset($input['area_ha']) ? (float)$input['area_ha'] : (isset($input['area_registrada_ha']) ? (float)$input['area_registrada_ha'] : null),
            isset($input['perimetro_m']) ? (float)$input['perimetro_m'] : null,
            $input['ccir'] ?? ($input['codigo_ccir'] ?? null),
            $input['itr'] ?? ($input['codigo_itr'] ?? null),
            $input['denominacao'] ?? ($input['denominacao_gleba'] ?? null),
            $matId
        ]);
        jsonResponse(['id' => $matId, 'message' => 'Matrícula atualizada!']);
    }

    if ($method === 'DELETE' && !$action) {
        excluirComLapide($pdo, 'matriculas', (int)$matId);
        touchCloudSyncTimestamp($pdo);
        jsonResponse(['message' => 'Matrícula excluída com sucesso!']);
    }
}

// 4. ROTAS DE LEVANTAMENTOS
if (preg_match('#^/levantamentos(?:/([0-9]+))?(?:/([a-zA-Z0-9_-]+))?$#', $route, $matches)) {
    $levId = isset($matches[1]) && $matches[1] !== '' ? (int)$matches[1] : null;
    $action = isset($matches[2]) ? $matches[2] : null;

    // GET /levantamentos/{id}/pontos
    if ($method === 'GET' && $levId && $action === 'pontos') {
        $stmt = $pdo->prepare("SELECT *, COALESCE(lat, lat_corrigido) as lat, COALESCE(lon, lon_corrigido) as lon, COALESCE(alt, altitude) as alt, COALESCE(este, e_original) as este, COALESCE(norte, n_original) as norte FROM pontos WHERE levantamento_id = ? ORDER BY ordem_caminhamento ASC, id ASC");
        $stmt->execute([$levId]);
        jsonResponse($stmt->fetchAll());
    }

    // GET /levantamentos/{id}/segmentos
    if ($method === 'GET' && $levId && $action === 'segmentos') {
        $stmt = $pdo->prepare("SELECT * FROM segmentos WHERE levantamento_id = ? ORDER BY id ASC");
        $stmt->execute([$levId]);
        jsonResponse($stmt->fetchAll());
    }

    // GET /levantamentos/{id}/confrontantes
    if ($method === 'GET' && $levId && $action === 'confrontantes') {
        $stmt = $pdo->prepare("SELECT c.*, p.nome as pessoa_nome, p.cpf_cnpj FROM confrontantes c JOIN pessoas p ON c.pessoa_id = p.id WHERE c.levantamento_id = ?");
        $stmt->execute([$levId]);
        jsonResponse($stmt->fetchAll());
    }

    // GET /levantamentos/{id}/matriculas
    if ($method === 'GET' && $levId && $action === 'matriculas') {
        $stmt = $pdo->prepare("SELECT m.*, COALESCE(m.numero, m.numero_matricula) as numero FROM matriculas m JOIN levantamento_matriculas lm ON m.id = lm.matricula_id WHERE lm.levantamento_id = ?");
        $stmt->execute([$levId]);
        jsonResponse($stmt->fetchAll());
    }

    // POST /levantamentos/{id}/compartilhar
    if ($method === 'POST' && $levId && $action === 'compartilhar') {
        $codigo = substr(bin2hex(random_bytes(6)), 0, 8);
        $stmt = $pdo->prepare("UPDATE levantamentos SET codigo_compartilhamento = ? WHERE id = ?");
        $stmt->execute([$codigo, $levId]);
        jsonResponse(['codigo' => $codigo, 'message' => 'Link gerado na nuvem!']);
    }

    // GET /levantamentos
    if ($method === 'GET' && !$levId) {
        $sql = "SELECT l.*, COALESCE(l.nome, prop.nome_propriedade, prop.nome, CONCAT('Levantamento #', l.id)) as nome,
                       COALESCE(prop.nome, prop.nome_propriedade) as propriedade_nome,
                       (SELECT p2.nome FROM propriedade_proprietarios pp2 JOIN clientes c2 ON pp2.cliente_id = c2.id JOIN pessoas p2 ON c2.pessoa_id = p2.id WHERE pp2.propriedade_id = l.propriedade_id LIMIT 1) as cliente_nome,
                       (SELECT COUNT(*) FROM pontos pt WHERE pt.levantamento_id = l.id) as total_pontos
                FROM levantamentos l
                LEFT JOIN propriedades prop ON l.propriedade_id = prop.id
                ORDER BY l.id DESC";
        $stmt = $pdo->query($sql);
        jsonResponse($stmt->fetchAll());
    }

    // GET /levantamentos/{id}
    if ($method === 'GET' && $levId && !$action) {
        $stmt = $pdo->prepare("SELECT l.*, 
                                      COALESCE(l.nome, CONCAT('Levantamento #', l.id)) as nome,
                                      prop.nome_propriedade, prop.codigo_car, prop.codigo_ccir, prop.municipio, prop.uf,
                                      (SELECT COUNT(*) FROM pontos pt WHERE pt.levantamento_id = l.id) as total_pontos,
                                      (SELECT COUNT(*) FROM segmentos s WHERE s.levantamento_id = l.id) as total_segmentos
                               FROM levantamentos l
                               LEFT JOIN propriedades prop ON l.propriedade_id = prop.id
                               WHERE l.id = ?");
        $stmt->execute([$levId]);
        $lev = $stmt->fetch();
        if (!$lev) jsonResponse(['error' => 'Levantamento não encontrado.'], 404);

        $clients = [];
        if (!empty($lev['propriedade_id'])) {
            $stCli = $pdo->prepare("SELECT c.id, p.nome as nome_completo, p.cpf_cnpj, COALESCE(pp.proporcao, 100) as percentual_participacao
                                    FROM propriedade_proprietarios pp
                                    JOIN clientes c ON pp.cliente_id = c.id
                                    JOIN pessoas p ON c.pessoa_id = p.id
                                    WHERE pp.propriedade_id = ?
                                    ORDER BY pp.id ASC");
            $stCli->execute([$lev['propriedade_id']]);
            $rows = $stCli->fetchAll();
            $unicos = [];
            foreach ($rows as $r) {
                $cid = (int)$r['id'];
                if (!isset($unicos[$cid])) {
                    $unicos[$cid] = $r;
                }
            }
            $clients = array_values($unicos);
        }
        $lev['clientes'] = $clients;
        jsonResponse($lev);
    }

    // POST /levantamentos
    if ($method === 'POST' && !$levId) {
        $input = getJsonInput();
        $nome = trim($input['nome'] ?? 'Novo Levantamento');
        $stmt = $pdo->prepare("INSERT INTO levantamentos (nome, propriedade_id, cliente_id, responsavel_tecnico, status, tipo_levantamento, data_inicio, fuso_utm, meridiano_central) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $nome,
            $input['propriedade_id'] ?? null,
            $input['cliente_id'] ?? null,
            $input['responsavel_tecnico'] ?? null,
            $input['status'] ?? 'EM_ANDAMENTO',
            $input['tipo_levantamento'] ?? 'GEORREFERENCIAMENTO',
            $input['data_inicio'] ?? date('Y-m-d'),
            (int)($input['fuso_utm'] ?? 22),
            (int)($input['meridiano_central'] ?? -51)
        ]);
        jsonResponse(['id' => (int)$pdo->lastInsertId(), 'message' => 'Levantamento criado com sucesso!'], 201);
    }

    // DELETE /levantamentos/{id}
    if ($method === 'DELETE' && $levId && !$action) {
        excluirComLapide($pdo, 'levantamentos', (int)$levId);
        touchCloudSyncTimestamp($pdo);
        jsonResponse(['message' => 'Levantamento excluído com sucesso!']);
    }
}

// 5. ROTAS DE PENDÊNCIAS
if (preg_match('#^/pendencias(?:/([0-9]+))?(?:/([a-zA-Z0-9_-]+))?$#', $route, $matches)) {
    $penId = isset($matches[1]) && $matches[1] !== '' ? (int)$matches[1] : null;
    $action = isset($matches[2]) ? $matches[2] : null;

    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT * FROM pendencias ORDER BY status ASC, prazo ASC, id DESC");
        jsonResponse($stmt->fetchAll());
    }

    if ($method === 'POST' && !$penId) {
        $input = getJsonInput();
        $stmt = $pdo->prepare("INSERT INTO pendencias (titulo, descricao, prioridade, status, prazo, cliente_id, propriedade_id, levantamento_id) VALUES (?, ?, ?, 'PENDENTE', ?, ?, ?, ?)");
        $stmt->execute([
            $input['titulo'] ?? 'Nova Pendência',
            $input['descricao'] ?? null,
            $input['prioridade'] ?? 'MEDIA',
            $input['prazo'] ?? null,
            $input['cliente_id'] ?? null,
            $input['propriedade_id'] ?? null,
            $input['levantamento_id'] ?? null
        ]);
        jsonResponse(['id' => (int)$pdo->lastInsertId(), 'message' => 'Pendência criada!'], 201);
    }

    if ($method === 'POST' && $penId && $action === 'concluir') {
        $stmt = $pdo->prepare("UPDATE pendencias SET status = 'CONCLUIDO', data_conclusao = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$penId]);
        jsonResponse(['message' => 'Pendência concluída!']);
    }

    if ($method === 'DELETE' && $penId) {
        excluirComLapide($pdo, 'pendencias', (int)$penId);
        touchCloudSyncTimestamp($pdo);
        jsonResponse(['message' => 'Pendência excluída!']);
    }
}

// 6. ROTAS DE PROFISSIONAIS
if (preg_match('#^/profissionais(?:/([0-9]+))?$#', $route, $matches)) {
    $profId = isset($matches[1]) && $matches[1] !== '' ? (int)$matches[1] : null;

    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT * FROM profissionais ORDER BY nome ASC");
        jsonResponse($stmt->fetchAll());
    }

    if ($method === 'POST' && !$profId) {
        $input = getJsonInput();
        $stmt = $pdo->prepare("INSERT INTO profissionais (nome, registro, codigo_credenciado, endereco, cpf, rg, conselho) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $input['nome'] ?? 'Novo Profissional',
            $input['registro'] ?? null,
            $input['codigo_credenciado'] ?? null,
            $input['endereco'] ?? null,
            $input['cpf'] ?? null,
            $input['rg'] ?? null,
            $input['conselho'] ?? null
        ]);
        jsonResponse(['id' => (int)$pdo->lastInsertId(), 'message' => 'Profissional cadastrado!'], 201);
    }

    if ($method === 'DELETE' && $profId) {
        excluirComLapide($pdo, 'profissionais', (int)$profId);
        touchCloudSyncTimestamp($pdo);
        jsonResponse(['message' => 'Profissional excluído!']);
    }
}

/**
 * Sincroniza dinamicamente linhas de uma tabela filtrando estritamente pelas colunas que existem no MySQL
 */
function syncTableRows(PDO $pdo, string $table, array $rows): void {
    if (empty($rows)) return;

    // Nunca ressuscita registros excluídos (lápides em registros_excluidos): um PC desatualizado
    // reenviando uma linha já apagada em outro computador seria devolvida à nuvem.
    // No SQLite a tabela de vínculos se chama propriedade_clientes; no MySQL, propriedade_proprietarios.
    $nomesTabela = [$table];
    if ($table === 'propriedade_proprietarios') $nomesTabela[] = 'propriedade_clientes';
    try {
        $in = implode(',', array_fill(0, count($nomesTabela), '?'));
        $stT = $pdo->prepare("SELECT DISTINCT registro_id FROM registros_excluidos WHERE tabela IN ({$in})");
        $stT->execute($nomesTabela);
        $lapides = array_flip(array_map('intval', $stT->fetchAll(PDO::FETCH_COLUMN)));
        if (!empty($lapides)) {
            $rows = array_values(array_filter($rows, fn($r) => !isset($r['id']) || !isset($lapides[(int)$r['id']])));
            if (empty($rows)) return;
        }
    } catch (Exception $e) {}

    $colsStmt = $pdo->query("SHOW COLUMNS FROM `{$table}`");
    $existing = [];
    while ($c = $colsStmt->fetch()) {
        $existing[$c['Field']] = true;
    }

    foreach ($rows as $r) {
        $valid = [];
        foreach ($r as $k => $v) {
            if (isset($existing[$k])) {
                $valid[$k] = $v;
            }
        }
        if (empty($valid)) continue;

        $fields = array_keys($valid);
        $placeholders = array_fill(0, count($fields), '?');
        $updates = [];
        // Merge por registro (o último a editar vence): com updated_at disponível, a linha existente só é
        // sobrescrita se a recebida for mais nova (ou se a existente não tiver carimbo). O updated_at é
        // atribuído por último porque o MySQL avalia as atribuições da esquerda para a direita.
        $comMerge = isset($existing['updated_at']) && array_key_exists('updated_at', $valid);
        $cond = "(`updated_at` IS NULL OR VALUES(`updated_at`) > `updated_at`)";
        foreach ($fields as $f) {
            if ($f === 'id' || ($comMerge && $f === 'updated_at')) continue;
            $updates[] = $comMerge
                ? "`{$f}` = IF({$cond}, VALUES(`{$f}`), `{$f}`)"
                : "`{$f}` = VALUES(`{$f}`)";
        }
        if ($comMerge) {
            $updates[] = "`updated_at` = IF({$cond}, VALUES(`updated_at`), `updated_at`)";
        }
        $sql = "INSERT INTO `{$table}` (`" . implode("`, `", $fields) . "`) VALUES (" . implode(", ", $placeholders) . ")";
        if (!empty($updates)) {
            $sql .= " ON DUPLICATE KEY UPDATE " . implode(", ", $updates);
        }
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute(array_values($valid));
        } catch (PDOException $e) {
            // Uma linha inválida (UNIQUE/tipo) não pode impedir o salvamento de todas as outras
            $GLOBALS['sync_ignorados'][] = "{$table}#" . ($valid['id'] ?? '?') . ': ' . $e->getMessage();
        }
    }
}

// 7. ROTA DE CARGA EM MASSA / MIGRAÇÃO INICIAL (Sync do PC para a Nuvem)
if ($route === '/sync/batch' && $method === 'POST') {
    $pdo = getDb();
    $authUser = requireAuth($pdo);
    $input = getJsonInput();
    if (!isset($input['data'])) {
        jsonResponse(['error' => 'Payload de sincronização inválido.'], 400);
    }

    $data = $input['data'];
    $GLOBALS['sync_ignorados'] = [];
    $pdo->exec("SET FOREIGN_KEY_CHECKS=0");
    $pdo->exec("SET @gg_sync = 1"); // triggers de updated_at não sobrescrevem o carimbo vindo do PC
    $pdo->beginTransaction();
    try {
        if (!empty($data['pessoas'])) {
            syncTableRows($pdo, 'pessoas', $data['pessoas']);
        }
        if (!empty($data['profissionais'])) {
            syncTableRows($pdo, 'profissionais', $data['profissionais']);
        }
        if (!empty($data['clientes'])) {
            foreach ($data['clientes'] as &$c) {
                if (!empty($c['senha_gov'])) {
                    $c['senha_gov'] = encryptGovPassword($c['senha_gov']);
                }
            }
            unset($c);
            syncTableRows($pdo, 'clientes', $data['clientes']);
        }
        if (!empty($data['propriedades'])) {
            foreach ($data['propriedades'] as &$p) {
                $nome = $p['nome_propriedade'] ?? ($p['nome'] ?? 'Sem Nome');
                $p['nome'] = $nome;
                $p['nome_propriedade'] = $nome;
            }
            unset($p);
            syncTableRows($pdo, 'propriedades', $data['propriedades']);
        }
        if (!empty($data['propriedade_clientes'])) {
            foreach ($data['propriedade_clientes'] as &$pc) {
                if (isset($pc['percentual_participacao'])) {
                    $pc['proporcao'] = $pc['percentual_participacao'];
                }
            }
            unset($pc);
            syncTableRows($pdo, 'propriedade_proprietarios', $data['propriedade_clientes']);
        }
        if (!empty($data['matriculas'])) {
            foreach ($data['matriculas'] as &$m) {
                $num = $m['numero_matricula'] ?? ($m['numero'] ?? 'S/N');
                $m['numero'] = $num;
                $m['numero_matricula'] = $num;
            }
            unset($m);
            syncTableRows($pdo, 'matriculas', $data['matriculas']);
        }
        if (!empty($data['levantamentos'])) {
            foreach ($data['levantamentos'] as &$l) {
                $l['nome'] = $l['nome'] ?? ('Levantamento #' . $l['id']);
            }
            unset($l);
            syncTableRows($pdo, 'levantamentos', $data['levantamentos']);
        }
        if (!empty($data['pontos'])) {
            foreach ($data['pontos'] as &$pt) {
                $lat = $pt['lat_corrigido'] ?? ($pt['lat'] ?? null);
                $lon = $pt['lon_corrigido'] ?? ($pt['lon'] ?? null);
                $alt = $pt['alt_corrigido'] ?? ($pt['alt'] ?? null);
                $este = $pt['e_original'] ?? ($pt['este'] ?? null);
                $norte = $pt['n_original'] ?? ($pt['norte'] ?? null);
                $pt['lat'] = $lat;
                $pt['lon'] = $lon;
                $pt['alt'] = $alt;
                $pt['altitude'] = $alt;
                $pt['este'] = $este;
                $pt['norte'] = $norte;
            }
            unset($pt);
            syncTableRows($pdo, 'pontos', $data['pontos']);
        }
        if (!empty($data['segmentos'])) {
            syncTableRows($pdo, 'segmentos', $data['segmentos']);
        }
        if (!empty($data['pendencias'])) {
            syncTableRows($pdo, 'pendencias', $data['pendencias']);
        }
        if (!empty($data['confrontantes'])) {
            syncTableRows($pdo, 'confrontantes', $data['confrontantes']);
        }
        foreach (['banco_pontos', 'anuencias_confrontantes'] as $tExtra) {
            if (!empty($data[$tExtra])) {
                syncTableRows($pdo, $tExtra, $data[$tExtra]);
            }
        }

        // Aplica exclusões (lápides) vindas do PC. Só tabelas sincronizáveis; o PC chama o vínculo
        // de propriedade_clientes e a nuvem guarda em propriedade_proprietarios (apaga nas duas por segurança).
        if (!empty($input['exclusoes'])) {
            foreach ($input['exclusoes'] as $exc) {
                $t = preg_replace('/[^a-zA-Z0-9_]/', '', (string)($exc['tabela'] ?? ''));
                $rid = (int)($exc['registro_id'] ?? 0);
                $alvos = ($t === 'propriedade_clientes' || $t === 'propriedade_proprietarios')
                    ? ['propriedade_proprietarios', 'propriedade_clientes']
                    : [$t];
                if (!$rid || !in_array($alvos[0], SYNC_TABELAS_MYSQL, true)) continue;
                try {
                    foreach ($alvos as $alvo) {
                        try { $pdo->prepare("DELETE FROM `{$alvo}` WHERE id = ?")->execute([$rid]); } catch (Exception $e) {}
                    }
                    registrarLapide($pdo, $t, $rid, isset($exc['excluido_em']) ? (string)$exc['excluido_em'] : null);
                } catch (Exception $e) {}
            }
        }

        $nowTs = touchCloudSyncTimestamp($pdo);

        $pdo->commit();
        $pdo->exec("SET FOREIGN_KEY_CHECKS=1");
        jsonResponse([
            'status' => 'success',
            'usuario' => $authUser['email'],
            'cloud_timestamp' => $nowTs,
            'ignorados' => count($GLOBALS['sync_ignorados']),
            'ignorados_detalhe' => array_slice($GLOBALS['sync_ignorados'], 0, 20),
            'message' => 'Todos os dados foram sincronizados com o MySQL com sucesso!'
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        $pdo->exec("SET FOREIGN_KEY_CHECKS=1");
        jsonResponse(['error' => 'Falha na sincronização em lote: ' . $e->getMessage()], 500);
    }
}

// 7.1 ROTA DE CHECAGEM RÁPIDA DE ALTERAÇÕES EM TEMPO REAL (Heartbeat de Sincronização)
if (($route === '/sync/check' || (isset($_GET['action']) && $_GET['action'] === 'sync_check')) && $method === 'GET') {
    $pdo = getDb();
    $authUser = requireAuth($pdo);

    $cloudTs = 0;
    try {
        $st = $pdo->prepare("SELECT valor FROM configuracoes WHERE chave = 'cloud_last_sync_ts' LIMIT 1");
        $st->execute();
        $val = $st->fetchColumn();
        if ($val) $cloudTs = (int)$val;
    } catch (Exception $e) {}

    jsonResponse([
        'status' => 'success',
        'cloud_timestamp' => $cloudTs,
        'server_time' => time(),
        'usuario' => $authUser['email']
    ]);
}

// 8. ROTA DE DOWNLOAD / PULL DE DADOS (Sync da Nuvem para o PC Local)
if ($route === '/sync/pull' && $method === 'GET') {
    $pdo = getDb();
    $authUser = requireAuth($pdo);

    $tables = [
        'pessoas', 'profissionais', 'clientes', 'propriedades', 'propriedade_proprietarios',
        'matriculas', 'levantamentos', 'pontos', 'segmentos', 'pendencias', 'confrontantes',
        'banco_pontos', 'anuencias_confrontantes'
    ];

    $payload = [];
    foreach ($tables as $t) {
        try {
            $stmt = $pdo->query("SELECT * FROM `{$t}`");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if ($t === 'clientes') {
                foreach ($rows as &$c) {
                    if (!empty($c['senha_gov'])) {
                        // Segue cifrada (nunca em texto puro pela rede); formatos antigos são convertidos ao atual
                        $c['senha_gov'] = govNormalizarParaAtual((string)$c['senha_gov']);
                    }
                }
                unset($c);
            }
            $payload[$t] = $rows;
        } catch (Exception $e) {
            $payload[$t] = [];
        }
    }

    $cloudTs = time();
    try {
        $st = $pdo->prepare("SELECT valor FROM configuracoes WHERE chave = 'cloud_last_sync_ts' LIMIT 1");
        $st->execute();
        $val = $st->fetchColumn();
        if ($val) $cloudTs = (int)$val;
    } catch (Exception $e) {}

    // Lápides incrementais: o cliente informa o último id de exclusão que já aplicou
    // (exclusoes_desde) e recebe todas as posteriores, sem limite. Primeiro pull = desde 0 = todas.
    $exclusoesDesde = max(0, (int)($_GET['exclusoes_desde'] ?? 0));
    $exclusoesCloud = [];
    $exclusoesMaxId = $exclusoesDesde;
    try {
        $stExc = $pdo->prepare("SELECT id, tabela, registro_id, excluido_em FROM registros_excluidos WHERE id > ? ORDER BY id ASC");
        $stExc->execute([$exclusoesDesde]);
        $exclusoesCloud = $stExc->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($exclusoesCloud)) {
            $exclusoesMaxId = (int)end($exclusoesCloud)['id'];
        }
    } catch (Exception $e) {}

    jsonResponse([
        'status' => 'success',
        'timestamp' => time(),
        'cloud_timestamp' => $cloudTs,
        'usuario' => $authUser['email'],
        'data' => $payload,
        'exclusoes' => $exclusoesCloud,
        'exclusoes_max_id' => $exclusoesMaxId
    ]);
}

// Rota não encontrada
jsonResponse(['error' => 'Rota não encontrada: ' . $route], 404);

