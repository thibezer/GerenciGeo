<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

$storageDir = __DIR__ . '/dados_publicos';
if (!file_exists($storageDir)) {
    @mkdir($storageDir, 0755, true);
}

// 1. Health check / Status da Cloud
if ($_SERVER['REQUEST_METHOD'] === 'GET' && (!isset($_GET['codigo']) && !isset($_GET['action']))) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'online',
        'service' => 'GerenciGeo Cloud Hub',
        'version' => '1.0.0',
        'timestamp' => time()
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action'])) {
    $action = $_GET['action'];

    if ($action === 'status') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'status' => 'online',
            'mode' => 'cloud_hub',
            'version' => '1.0.0'
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }

    if ($action === 'stats') {
        header('Content-Type: application/json; charset=utf-8');
        // No Hub Cloud, conta quantos levantamentos públicos existem armazenados
        $totalPublicos = 0;
        if (is_dir($storageDir)) {
            $files = glob($storageDir . '/*.json');
            $totalPublicos = $files ? count($files) : 0;
        }
        echo json_encode([
            'clientes' => 0,
            'propriedades' => 0,
            'profissionais' => 0,
            'levantamentos' => $totalPublicos
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'alerts') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['alerts' => []], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'matriculas-geometrias') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'proxy_sigef') {
        $targetUrl = isset($_GET['url']) ? trim($_GET['url']) : '';
        if (empty($targetUrl)) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Parâmetro url é obrigatório.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $parsed = parse_url($targetUrl);
        if (!$parsed || !isset($parsed['scheme']) || !isset($parsed['host'])) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'URL inválida.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Defesa anti-SSRF: apenas HTTPS e domínios governamentais homologados
        $scheme = strtolower($parsed['scheme']);
        $host = strtolower($parsed['host']);
        $allowedHosts = [
            'acervofundiario.incra.gov.br',
            'sigef.incra.gov.br',
            'servicodados.ibge.gov.br'
        ];

        if ($scheme !== 'https' || !in_array($host, $allowedHosts, true)) {
            http_response_code(403);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Destino não permitido pelo proxy de segurança.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $targetUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
        curl_setopt($ch, CURLOPT_USERAGENT, 'GerenciGeo Cloud Proxy/1.0');

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            http_response_code(502);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Falha na comunicação com o servidor de destino.', 'details' => $curlErr], JSON_UNESCAPED_UNICODE);
            exit;
        }

        http_response_code($httpCode ?: 200);
        header('Content-Type: ' . ($contentType ?: 'text/plain; charset=utf-8'));
        echo $response;
        exit;
    }

    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Ação não suportada.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// 2. Gravação de levantamento via POST (Publicação local para a nuvem)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    
    // Limite rígido anti-DoS de 5MB
    if (strlen($rawInput) > 5 * 1024 * 1024) {
        http_response_code(413);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Payload excede o limite máximo permitido de 5MB.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $data = json_decode($rawInput, true);
    if (isset($data['codigo']) && isset($data['payload'])) {
        $codigo = preg_replace('/[^a-zA-Z0-9]/', '', (string)$data['codigo']);
        if (strlen($codigo) >= 4 && strlen($codigo) <= 64) {
            $filePath = $storageDir . '/' . $codigo . '.json';
            $saved = file_put_contents($filePath, json_encode($data['payload'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            if ($saved !== false) {
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['sucesso' => true, 'mensagem' => 'Levantamento publicado na Hostinger com sucesso!'], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }
    }
    
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Payload inválido ou código ausente.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// 3. Leitura pública de levantamento
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $codigo = isset($_GET['codigo']) ? preg_replace('/[^a-zA-Z0-9]/', '', (string)$_GET['codigo']) : '';
    if (!empty($codigo)) {
        $filePath = $storageDir . '/' . $codigo . '.json';
        if (file_exists($filePath)) {
            header('Content-Type: application/json; charset=utf-8');
            readfile($filePath);
            exit;
        }
    }
    
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Levantamento não localizado ou código inválido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['error' => 'Método não suportado.'], JSON_UNESCAPED_UNICODE);

