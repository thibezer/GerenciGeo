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
define('DB_NAME', 'u941736878_gerencigeo');
define('DB_USER', 'u941736878_thiago_geo');
define('DB_PASS', 'G3renciGeo#2026$Db');
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
 * Criação idempotente de tabelas se não existirem
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
            FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE CASCADE,
            FOREIGN KEY (profissional_id) REFERENCES profissionais(id) ON DELETE SET NULL
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

        "CREATE TABLE IF NOT EXISTS propriedades (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(255) NOT NULL,
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

        "CREATE TABLE IF NOT EXISTS matriculas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            propriedade_id INT NOT NULL,
            numero VARCHAR(100) NOT NULL,
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
            nome VARCHAR(255) NOT NULL,
            propriedade_id INT NULL,
            cliente_id INT NULL,
            responsavel_tecnico VARCHAR(255),
            status VARCHAR(50) DEFAULT 'EM_ANDAMENTO',
            tipo_levantamento VARCHAR(50) DEFAULT 'GEORREFERENCIAMENTO',
            data_inicio DATE,
            fuso_utm INT DEFAULT 22,
            meridiano_central INT DEFAULT -51,
            codigo_compartilhamento VARCHAR(64) UNIQUE,
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
            data_conclusao TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS configuracoes (
            chave VARCHAR(100) PRIMARY KEY,
            valor TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    ];

    foreach ($queries as $sql) {
        try {
            $pdo->exec($sql);
        } catch (Exception $e) {
            // Silencia caso tabela já exista
        }
    }
    $checked = true;
}

/**
 * Cifra uma senha GOV com AES-256-CBC
 */
function encryptGovPassword(string $plain): string {
    if (str_starts_with($plain, 'ENC:G4G2:')) {
        return $plain;
    }
    $key = hash('sha256', APP_SECRET_KEY, true);
    $iv = openssl_random_pseudo_bytes(16);
    $ciphertext = openssl_encrypt($plain, 'aes-256-cbc', $key, 0, $iv);
    return 'ENC:G4G2:' . base64_encode($iv . $ciphertext);
}

/**
 * Decifra uma senha GOV
 */
function decryptGovPassword(string $enc): string {
    if (!str_starts_with($enc, 'ENC:G4G2:')) {
        return $enc;
    }
    $raw = base64_decode(substr($enc, 9));
    $iv = substr($raw, 0, 16);
    $ciphertext = substr($raw, 16);
    $key = hash('sha256', APP_SECRET_KEY, true);
    return (string)openssl_decrypt($ciphertext, 'aes-256-cbc', $key, 0, $iv);
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

// 3. Determinação da Rota e Método HTTP
$method = $_SERVER['REQUEST_METHOD'];
$requestUri = $_SERVER['REQUEST_URI'];
$route = isset($_GET['__route']) ? $_GET['__route'] : parse_url($requestUri, PHP_URL_PATH);

// Normalização da rota (remove prefixos e slashes residuais)
$route = preg_replace('#^.*/api\.php#', '', $route);
$route = '/' . trim($route, '/');

// --- A. Endpoints Públicos / Legados de Hub Cloud ---

// 1. Healthcheck / Status
if ($route === '/' || $route === '/status' || (isset($_GET['action']) && $_GET['action'] === 'status')) {
    jsonResponse([
        'status' => 'online',
        'service' => 'GerenciGeo Cloud Hub (MySQL)',
        'version' => '2.0.0',
        'database' => 'MySQL Conectado',
        'timestamp' => time()
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
    $stmt = $pdo->query("SELECT * FROM pendencias WHERE status = 'PENDENTE' ORDER BY prazo ASC LIMIT 10");
    $alerts = [];
    while ($row = $stmt->fetch()) {
        $alerts[] = [
            'id' => $row['id'],
            'titulo' => $row['titulo'],
            'prioridade' => $row['prioridade'],
            'prazo' => $row['prazo']
        ];
    }
    jsonResponse(['alerts' => $alerts]);
}

// 4. Geometrias das Matrículas para o Mapa Geral
if ($route === '/dashboard/matriculas-geometrias' || (isset($_GET['action']) && $_GET['action'] === 'matriculas-geometrias')) {
    $pdo = getDb();
    $stmt = $pdo->query("SELECT p.id, p.nome_vertice, p.lat, p.lon, p.este, p.norte, p.matricula_id FROM pontos p WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL LIMIT 500");
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
            $stmtPts = $pdo->prepare("SELECT * FROM pontos WHERE levantamento_id = ? ORDER BY ordem_caminhamento ASC");
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

    // POST /clientes/{id}/revelar-senha (Auditoria e revelação)
    if ($method === 'POST' && $id && $subAction === 'revelar-senha') {
        $stmt = $pdo->prepare("SELECT senha_gov FROM clientes WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) jsonResponse(['error' => 'Cliente não encontrado.'], 404);

        $ip = $_SERVER['REMOTE_ADDR'] ?? 'desconhecido';
        $logStmt = $pdo->prepare("INSERT INTO cliente_acesso_logs (id_cliente, tipo_dado, acao, usuario, ip_origem) VALUES (?, 'senha_gov', 'REVELOU_SENHA', 'Operador Web', ?)");
        $logStmt->execute([$id, $ip]);

        $decrypted = decryptGovPassword($row['senha_gov'] ?? '');
        jsonResponse(['senha_gov' => $decrypted]);
    }

    // GET /clientes/{id}/documentos
    if ($method === 'GET' && $id && $subAction === 'documentos') {
        $stmt = $pdo->prepare("SELECT * FROM cliente_documentos WHERE cliente_id = ? ORDER BY id DESC");
        $stmt->execute([$id]);
        jsonResponse($stmt->fetchAll());
    }

    // GET /clientes
    if ($method === 'GET' && !$id) {
        $sql = "SELECT c.*, p.nome, p.cpf_cnpj, p.rg, p.genero, p.nacionalidade, p.profissao, 
                       p.estado_civil, p.regime_bens, p.endereco_completo, p.nome_conjuge, 
                       p.cpf_conjuge, p.rg_conjuge, p.genero_conjuge, p.nacionalidade_conjuge, p.profissao_conjuge,
                       (SELECT COUNT(*) FROM propriedade_proprietarios pp WHERE pp.cliente_id = c.id) as total_propriedades,
                       (SELECT COUNT(*) FROM cliente_documentos cd WHERE cd.cliente_id = c.id) as total_documentos
                FROM clientes c
                JOIN pessoas p ON c.pessoa_id = p.id
                ORDER BY p.nome ASC";
        $stmt = $pdo->query($sql);
        $clientes = [];
        while ($c = $stmt->fetch()) {
            $hasSenha = !empty($c['senha_gov']);
            $c['tem_senha_gov'] = $hasSenha;
            $c['senha_gov'] = $hasSenha ? '••••••••' : null;
            $clientes[] = $c;
        }
        jsonResponse($clientes);
    }

    // POST /clientes
    if ($method === 'POST' && !$id) {
        $input = getJsonInput();
        $nome = trim($input['nome'] ?? '');
        if (empty($nome)) jsonResponse(['error' => 'Nome do cliente é obrigatório.'], 400);

        $pdo->beginTransaction();
        try {
            $stmtP = $pdo->prepare("INSERT INTO pessoas (nome, cpf_cnpj, rg, genero, nacionalidade, profissao, estado_civil, regime_bens, endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge, genero_conjuge, nacionalidade_conjuge, profissao_conjuge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmtP->execute([
                $nome,
                $input['cpf_cnpj'] ?? null,
                $input['rg'] ?? null,
                $input['genero'] ?? 'M',
                $input['nacionalidade'] ?? 'brasileiro(a)',
                $input['profissao'] ?? null,
                $input['estado_civil'] ?? null,
                $input['regime_bens'] ?? null,
                $input['endereco_completo'] ?? null,
                $input['nome_conjuge'] ?? null,
                $input['cpf_conjuge'] ?? null,
                $input['rg_conjuge'] ?? null,
                $input['genero_conjuge'] ?? null,
                $input['nacionalidade_conjuge'] ?? null,
                $input['profissao_conjuge'] ?? null
            ]);
            $pessoaId = (int)$pdo->lastInsertId();

            $senhaCifrada = !empty($input['senha_gov']) ? encryptGovPassword($input['senha_gov']) : null;
            $stmtC = $pdo->prepare("INSERT INTO clientes (pessoa_id, profissional_id, data_nascimento_fundacao, email, telefone, cidade, estado, cep, sexo, senha_gov) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmtC->execute([
                $pessoaId,
                $input['profissional_id'] ?? null,
                $input['data_nascimento_fundacao'] ?? null,
                $input['email'] ?? null,
                $input['telefone'] ?? null,
                $input['cidade'] ?? null,
                $input['estado'] ?? null,
                $input['cep'] ?? null,
                $input['sexo'] ?? ($input['genero'] ?? 'M'),
                $senhaCifrada
            ]);
            $clienteId = (int)$pdo->lastInsertId();
            $pdo->commit();
            jsonResponse(['id' => $clienteId, 'message' => 'Cliente cadastrado com sucesso!'], 201);
        } catch (Exception $e) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Erro ao salvar cliente: ' . $e->getMessage()], 500);
        }
    }

    // PUT /clientes/{id}
    if ($method === 'PUT' && $id) {
        $input = getJsonInput();
        $stmtC = $pdo->prepare("SELECT pessoa_id FROM clientes WHERE id = ?");
        $stmtC->execute([$id]);
        $row = $stmtC->fetch();
        if (!$row) jsonResponse(['error' => 'Cliente não encontrado.'], 404);
        $pessoaId = $row['pessoa_id'];

        $pdo->beginTransaction();
        try {
            $stmtP = $pdo->prepare("UPDATE pessoas SET nome = COALESCE(?, nome), cpf_cnpj = COALESCE(?, cpf_cnpj), rg = COALESCE(?, rg), genero = COALESCE(?, genero), nacionalidade = COALESCE(?, nacionalidade), profissao = COALESCE(?, profissao), estado_civil = COALESCE(?, estado_civil), regime_bens = COALESCE(?, regime_bens), endereco_completo = COALESCE(?, endereco_completo), nome_conjuge = COALESCE(?, nome_conjuge), cpf_conjuge = COALESCE(?, cpf_conjuge) WHERE id = ?");
            $stmtP->execute([
                $input['nome'] ?? null,
                $input['cpf_cnpj'] ?? null,
                $input['rg'] ?? null,
                $input['genero'] ?? null,
                $input['nacionalidade'] ?? null,
                $input['profissao'] ?? null,
                $input['estado_civil'] ?? null,
                $input['regime_bens'] ?? null,
                $input['endereco_completo'] ?? null,
                $input['nome_conjuge'] ?? null,
                $input['cpf_conjuge'] ?? null,
                $pessoaId
            ]);

            $params = [
                $input['email'] ?? null,
                $input['telefone'] ?? null,
                $input['cidade'] ?? null,
                $input['estado'] ?? null,
                $input['cep'] ?? null,
                $id
            ];
            $sqlUp = "UPDATE clientes SET email = COALESCE(?, email), telefone = COALESCE(?, telefone), cidade = COALESCE(?, cidade), estado = COALESCE(?, estado), cep = COALESCE(?, cep)";
            if (!empty($input['senha_gov']) && $input['senha_gov'] !== '••••••••') {
                $sqlUp .= ", senha_gov = ?";
                array_splice($params, 5, 0, [encryptGovPassword($input['senha_gov'])]);
            }
            $sqlUp .= " WHERE id = ?";
            $pdo->prepare($sqlUp)->execute($params);

            $pdo->commit();
            jsonResponse(['id' => $id, 'message' => 'Cliente atualizado com sucesso!']);
        } catch (Exception $e) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Erro ao atualizar cliente: ' . $e->getMessage()], 500);
        }
    }

    // DELETE /clientes/{id}
    if ($method === 'DELETE' && $id) {
        $stmt = $pdo->prepare("DELETE FROM clientes WHERE id = ?");
        $stmt->execute([$id]);
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
        $stmt = $pdo->prepare("SELECT * FROM matriculas WHERE propriedade_id = ? ORDER BY id ASC");
        $stmt->execute([$propId]);
        jsonResponse($stmt->fetchAll());
    }

    // POST /propriedades/{id}/matriculas
    if ($method === 'POST' && $propId && $subResource === 'matriculas') {
        $input = getJsonInput();
        $numero = trim($input['numero'] ?? '');
        $area = (float)($input['area_registrada_ha'] ?? ($input['area_ha'] ?? 0));
        $stmt = $pdo->prepare("INSERT INTO matriculas (propriedade_id, numero, livro, folha, cartorio, area_ha, perimetro_m, ccir, itr, denominacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $propId,
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

    // GET /propriedades/{id}/proprietarios
    if ($method === 'GET' && $propId && in_array($subResource, ['proprietarios', 'clientes'])) {
        $stmt = $pdo->prepare("SELECT pp.*, p.nome, p.cpf_cnpj, c.telefone, c.email FROM propriedade_proprietarios pp JOIN clientes c ON pp.cliente_id = c.id JOIN pessoas p ON c.pessoa_id = p.id WHERE pp.propriedade_id = ?");
        $stmt->execute([$propId]);
        jsonResponse($stmt->fetchAll());
    }

    // POST /propriedades/{id}/proprietarios
    if ($method === 'POST' && $propId && in_array($subResource, ['proprietarios', 'clientes'])) {
        $input = getJsonInput();
        $cliId = (int)($input['cliente_id'] ?? 0);
        $prop = (float)($input['proporcao'] ?? 100);
        $stmt = $pdo->prepare("INSERT INTO propriedade_proprietarios (propriedade_id, cliente_id, proporcao) VALUES (?, ?, ?)");
        $stmt->execute([$propId, $cliId, $prop]);
        jsonResponse(['message' => 'Proprietário vinculado com sucesso!'], 201);
    }

    // DELETE /propriedades/{id}/proprietarios/{cliId}
    if ($method === 'DELETE' && $propId && in_array($subResource, ['proprietarios', 'clientes']) && $subId) {
        $stmt = $pdo->prepare("DELETE FROM propriedade_proprietarios WHERE propriedade_id = ? AND cliente_id = ?");
        $stmt->execute([$propId, $subId]);
        jsonResponse(['message' => 'Proprietário desvinculado!']);
    }

    // GET /propriedades
    if ($method === 'GET' && !$propId) {
        $sql = "SELECT p.*,
                       (SELECT COUNT(*) FROM matriculas m WHERE m.propriedade_id = p.id) as total_matriculas,
                       (SELECT COUNT(*) FROM propriedade_proprietarios pp WHERE pp.propriedade_id = p.id) as total_proprietarios
                FROM propriedades p ORDER BY p.nome ASC";
        $stmt = $pdo->query($sql);
        jsonResponse($stmt->fetchAll());
    }

    // POST /propriedades
    if ($method === 'POST' && !$propId) {
        $input = getJsonInput();
        $nome = trim($input['nome'] ?? '');
        if (empty($nome)) jsonResponse(['error' => 'Nome do imóvel é obrigatório.'], 400);

        $stmt = $pdo->prepare("INSERT INTO propriedades (nome, municipio, comarca, uf, area_total_ha) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([
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
        $stmt = $pdo->prepare("UPDATE propriedades SET nome = COALESCE(?, nome), municipio = COALESCE(?, municipio), comarca = COALESCE(?, comarca), uf = COALESCE(?, uf), area_total_ha = COALESCE(?, area_total_ha) WHERE id = ?");
        $stmt->execute([
            $input['nome'] ?? null,
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
        $stmt = $pdo->prepare("DELETE FROM propriedades WHERE id = ?");
        $stmt->execute([$propId]);
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
        $stmt = $pdo->prepare("UPDATE matriculas SET numero = COALESCE(?, numero), livro = COALESCE(?, livro), folha = COALESCE(?, folha), cartorio = COALESCE(?, cartorio), area_ha = COALESCE(?, area_ha), perimetro_m = COALESCE(?, perimetro_m), ccir = COALESCE(?, ccir), itr = COALESCE(?, itr), denominacao = COALESCE(?, denominacao) WHERE id = ?");
        $stmt->execute([
            $input['numero'] ?? null,
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
        $stmt = $pdo->prepare("DELETE FROM matriculas WHERE id = ?");
        $stmt->execute([$matId]);
        jsonResponse(['message' => 'Matrícula excluída com sucesso!']);
    }
}

// 4. ROTAS DE LEVANTAMENTOS
if (preg_match('#^/levantamentos(?:/([0-9]+))?(?:/([a-zA-Z0-9_-]+))?$#', $route, $matches)) {
    $levId = isset($matches[1]) && $matches[1] !== '' ? (int)$matches[1] : null;
    $action = isset($matches[2]) ? $matches[2] : null;

    // GET /levantamentos/{id}/pontos
    if ($method === 'GET' && $levId && $action === 'pontos') {
        $stmt = $pdo->prepare("SELECT * FROM pontos WHERE levantamento_id = ? ORDER BY ordem_caminhamento ASC, id ASC");
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
        $stmt = $pdo->prepare("SELECT m.* FROM matriculas m JOIN levantamento_matriculas lm ON m.id = lm.matricula_id WHERE lm.levantamento_id = ?");
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
        $sql = "SELECT l.*, prop.nome as propriedade_nome, p.nome as cliente_nome,
                       (SELECT COUNT(*) FROM pontos pt WHERE pt.levantamento_id = l.id) as total_pontos
                FROM levantamentos l
                LEFT JOIN propriedades prop ON l.propriedade_id = prop.id
                LEFT JOIN clientes c ON l.cliente_id = c.id
                LEFT JOIN pessoas p ON c.pessoa_id = p.id
                ORDER BY l.id DESC";
        $stmt = $pdo->query($sql);
        jsonResponse($stmt->fetchAll());
    }

    // GET /levantamentos/{id}
    if ($method === 'GET' && $levId && !$action) {
        $stmt = $pdo->prepare("SELECT * FROM levantamentos WHERE id = ?");
        $stmt->execute([$levId]);
        $lev = $stmt->fetch();
        if (!$lev) jsonResponse(['error' => 'Levantamento não encontrado.'], 404);
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
        $stmt = $pdo->prepare("DELETE FROM levantamentos WHERE id = ?");
        $stmt->execute([$levId]);
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
        $stmt = $pdo->prepare("DELETE FROM pendencias WHERE id = ?");
        $stmt->execute([$penId]);
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
        $stmt = $pdo->prepare("DELETE FROM profissionais WHERE id = ?");
        $stmt->execute([$profId]);
        jsonResponse(['message' => 'Profissional excluído!']);
    }
}

// 7. ROTA DE CARGA EM MASSA / MIGRAÇÃO INICIAL (Sync do PC para a Nuvem)
if ($route === '/sync/batch' && $method === 'POST') {
    $input = getJsonInput();
    if (!isset($input['data'])) {
        jsonResponse(['error' => 'Payload de sincronização inválido.'], 400);
    }

    $data = $input['data'];
    $pdo->exec("SET FOREIGN_KEY_CHECKS=0");
    $pdo->beginTransaction();
    try {
        // Pessoas
        if (!empty($data['pessoas'])) {
            $stmt = $pdo->prepare("INSERT INTO pessoas (id, nome, cpf_cnpj, rg, genero, nacionalidade, profissao, estado_civil, regime_bens, endereco_completo, nome_conjuge, cpf_conjuge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nome=VALUES(nome), cpf_cnpj=VALUES(cpf_cnpj), rg=VALUES(rg)");
            foreach ($data['pessoas'] as $r) {
                $stmt->execute([
                    $r['id'], $r['nome'], $r['cpf_cnpj'] ?? null, $r['rg'] ?? null, 
                    $r['genero'] ?? 'M', $r['nacionalidade'] ?? null, $r['profissao'] ?? null, 
                    $r['estado_civil'] ?? null, $r['regime_bens'] ?? null, $r['endereco_completo'] ?? null, 
                    $r['nome_conjuge'] ?? null, $r['cpf_conjuge'] ?? null
                ]);
            }
        }
        // Clientes
        if (!empty($data['clientes'])) {
            $stmt = $pdo->prepare("INSERT INTO clientes (id, pessoa_id, profissional_id, email, telefone, cidade, estado, cep, sexo, senha_gov) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE email=VALUES(email), telefone=VALUES(telefone), cidade=VALUES(cidade)");
            foreach ($data['clientes'] as $r) {
                $stmt->execute([
                    $r['id'], $r['pessoa_id'], $r['profissional_id'] ?? null,
                    $r['email'] ?? null, $r['telefone'] ?? null, $r['cidade'] ?? null,
                    $r['estado'] ?? null, $r['cep'] ?? null, $r['sexo'] ?? 'M',
                    !empty($r['senha_gov']) ? encryptGovPassword($r['senha_gov']) : null
                ]);
            }
        }
        // Propriedades
        if (!empty($data['propriedades'])) {
            $stmt = $pdo->prepare("INSERT INTO propriedades (id, nome, municipio, comarca, uf, area_total_ha) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nome=VALUES(nome), municipio=VALUES(municipio), area_total_ha=VALUES(area_total_ha)");
            foreach ($data['propriedades'] as $r) {
                $stmt->execute([
                    $r['id'], $r['nome'], $r['municipio'] ?? null, $r['comarca'] ?? null,
                    $r['uf'] ?? 'SP', (float)($r['area_total_ha'] ?? 0)
                ]);
            }
        }
        // Matrículas
        if (!empty($data['matriculas'])) {
            $stmt = $pdo->prepare("INSERT INTO matriculas (id, propriedade_id, numero, livro, folha, cartorio, area_ha, perimetro_m, ccir, itr, denominacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE numero=VALUES(numero), area_ha=VALUES(area_ha)");
            foreach ($data['matriculas'] as $r) {
                $stmt->execute([
                    $r['id'], $r['propriedade_id'], $r['numero'], $r['livro'] ?? null,
                    $r['folha'] ?? null, $r['cartorio'] ?? null, (float)($r['area_ha'] ?? 0),
                    (float)($r['perimetro_m'] ?? 0), $r['ccir'] ?? null, $r['itr'] ?? null,
                    $r['denominacao'] ?? null
                ]);
            }
        }
        // Levantamentos
        if (!empty($data['levantamentos'])) {
            $stmt = $pdo->prepare("INSERT INTO levantamentos (id, nome, propriedade_id, cliente_id, responsavel_tecnico, status, tipo_levantamento, fuso_utm, codigo_compartilhamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nome=VALUES(nome), status=VALUES(status)");
            foreach ($data['levantamentos'] as $r) {
                $stmt->execute([
                    $r['id'], $r['nome'], $r['propriedade_id'] ?? null, $r['cliente_id'] ?? null,
                    $r['responsavel_tecnico'] ?? null, $r['status'] ?? 'EM_ANDAMENTO',
                    $r['tipo_levantamento'] ?? 'GEORREFERENCIAMENTO', (int)($r['fuso_utm'] ?? 22),
                    $r['codigo_compartilhamento'] ?? null
                ]);
            }
        }
        // Pontos
        if (!empty($data['pontos'])) {
            $stmt = $pdo->prepare("INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, este, norte, altitude, ordem_caminhamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE lat=VALUES(lat), lon=VALUES(lon), este=VALUES(este), norte=VALUES(norte)");
            foreach ($data['pontos'] as $r) {
                $stmt->execute([
                    $r['id'], $r['levantamento_id'], $r['matricula_id'] ?? null,
                    $r['nome_vertice'], $r['tipo_ponto'] ?? 'M', $r['lat'] ?? null,
                    $r['lon'] ?? null, $r['este'] ?? null, $r['norte'] ?? null,
                    $r['altitude'] ?? null, (int)($r['ordem_caminhamento'] ?? 0)
                ]);
            }
        }
        // Segmentos
        if (!empty($data['segmentos'])) {
            $stmt = $pdo->prepare("INSERT INTO segmentos (id, levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, tipo_limite, tipo_limite_sigef, azimute, distancia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE azimute=VALUES(azimute), distancia=VALUES(distancia)");
            foreach ($data['segmentos'] as $r) {
                $stmt->execute([
                    $r['id'], $r['levantamento_id'], $r['matricula_id'] ?? null,
                    $r['ponto_inicio_id'], $r['ponto_fim_id'], $r['tipo_limite'] ?? 'Linha Seca',
                    $r['tipo_limite_sigef'] ?? 'LA1', $r['azimute'] ?? null, (float)($r['distancia'] ?? 0)
                ]);
            }
        }
        // Pendências
        if (!empty($data['pendencias'])) {
            $stmt = $pdo->prepare("INSERT INTO pendencias (id, titulo, descricao, prioridade, status, prazo) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), status=VALUES(status)");
            foreach ($data['pendencias'] as $r) {
                $stmt->execute([
                    $r['id'], $r['titulo'], $r['descricao'] ?? null,
                    $r['prioridade'] ?? 'MEDIA', $r['status'] ?? 'PENDENTE', $r['prazo'] ?? null
                ]);
            }
        }
        // Profissionais
        if (!empty($data['profissionais'])) {
            $stmt = $pdo->prepare("INSERT INTO profissionais (id, nome, registro, codigo_credenciado, cpf, conselho) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nome=VALUES(nome), registro=VALUES(registro)");
            foreach ($data['profissionais'] as $r) {
                $stmt->execute([
                    $r['id'], $r['nome'], $r['registro'] ?? null,
                    $r['codigo_credenciado'] ?? null, $r['cpf'] ?? null, $r['conselho'] ?? null
                ]);
            }
        }
        $pdo->commit();
        $pdo->exec("SET FOREIGN_KEY_CHECKS=1");
        jsonResponse(['message' => 'Dados sincronizados com o MySQL com sucesso!']);
    } catch (Exception $e) {
        $pdo->rollBack();
        $pdo->exec("SET FOREIGN_KEY_CHECKS=1");
        jsonResponse(['error' => 'Falha na sincronização em lote: ' . $e->getMessage()], 500);
    }
}

// Rota não encontrada
jsonResponse(['error' => 'Rota não encontrada: ' . $route], 404);
