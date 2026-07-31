<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

$storageDir = __DIR__ . '/dados_publicos';
if (!file_exists($storageDir)) {
    @mkdir($storageDir, 0755, true);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);
    
    if (isset($data['codigo']) && isset($data['payload'])) {
        $codigo = preg_replace('/[^a-zA-Z0-9]/', '', $data['codigo']);
        if (strlen($codigo) > 0) {
            $filePath = $storageDir . '/' . $codigo . '.json';
            file_put_contents($filePath, json_encode($data['payload'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            header('Content-Type: application/json');
            echo json_encode(['sucesso' => true, 'mensagem' => 'Levantamento publicado na Hostinger com sucesso!']);
            exit;
        }
    }
    
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Payload inválido ou código ausente.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $codigo = isset($_GET['codigo']) ? preg_replace('/[^a-zA-Z0-9]/', '', $_GET['codigo']) : '';
    if (!empty($codigo)) {
        $filePath = $storageDir . '/' . $codigo . '.json';
        if (file_exists($filePath)) {
            header('Content-Type: application/json; charset=utf-8');
            readfile($filePath);
            exit;
        }
    }
    
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Levantamento não localizado ou código inválido.']);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Método não suportado.']);
