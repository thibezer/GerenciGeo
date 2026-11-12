<?php
/**
 * api_publico.php — Levantamento compartilhado com o cliente (link público) na nuvem.
 *
 * Espelho de routes/levantamento/crud.py (get_levantamento_publico): mesma forma de resposta e mesmas regras
 * de acesso (revogação, validade, PIN). Mudou uma regra aqui? Mude no Python também.
 *
 * Nunca devolve CPF/RG/endereço nem caminhos de arquivos locais. Carregado só pela rota ?codigo= do api.php,
 * dentro de try/catch, para que um erro aqui não derrube o restante da API.
 */

declare(strict_types=1);

/** Hash do PIN: sha256(codigo:pin). Igual ao calculado pelo Python ao gerar o link. */
function pubHashPin(string $codigo, string $pin): string
{
    return hash('sha256', $codigo . ':' . $pin);
}

/** Campos que nunca vão para o link público (além de qualquer coluna caminho_*, arquivo_*, pasta_*, planilha_*). */
const PUB_CAMPOS_PRIVADOS = [
    'dados_vizinho_json', 'compartilhamento_pin_hash', 'cliente_id', 'profissional_id',
];

function pubLimpar(array $row): array
{
    foreach (array_keys($row) as $c) {
        if (in_array($c, PUB_CAMPOS_PRIVADOS, true) || preg_match('/^(caminho_|arquivo_|pasta_|planilha_)/', (string)$c)) {
            unset($row[$c]);
        }
    }
    return $row;
}

/** UTM (SIRGAS 2000 / GRS80, hemisfério sul) -> [lat, lon] em graus. Série de Krüger. */
function pubUtmParaLatLon(float $este, float $norte, int $fuso): array
{
    $a = 6378137.0;
    $f = 1 / 298.257222101;
    $k0 = 0.9996;
    $n = $f / (2 - $f);
    $A = $a / (1 + $n) * (1 + $n ** 2 / 4 + $n ** 4 / 64);
    $b = [
        1 => $n / 2 - 2 * $n ** 2 / 3 + 37 * $n ** 3 / 96 - $n ** 4 / 360,
        2 => $n ** 2 / 48 + $n ** 3 / 15 - 437 * $n ** 4 / 1440,
        3 => 17 * $n ** 3 / 480 - 37 * $n ** 4 / 840,
        4 => 4397 * $n ** 4 / 161280,
    ];
    $d = [
        1 => 2 * $n - 2 * $n ** 2 / 3 - 2 * $n ** 3 + 116 * $n ** 4 / 45,
        2 => 7 * $n ** 2 / 3 - 8 * $n ** 3 / 5 - 227 * $n ** 4 / 45,
        3 => 56 * $n ** 3 / 15 - 136 * $n ** 4 / 35,
        4 => 4279 * $n ** 4 / 630,
    ];
    $xi = ($norte - 10000000.0) / ($k0 * $A);
    $eta = ($este - 500000.0) / ($k0 * $A);
    $xiL = $xi;
    $etaL = $eta;
    for ($j = 1; $j <= 4; $j++) {
        $xiL -= $b[$j] * sin(2 * $j * $xi) * cosh(2 * $j * $eta);
        $etaL -= $b[$j] * cos(2 * $j * $xi) * sinh(2 * $j * $eta);
    }
    $chi = asin(sin($xiL) / cosh($etaL));
    $phi = $chi;
    for ($j = 1; $j <= 4; $j++) {
        $phi += $d[$j] * sin(2 * $j * $chi);
    }
    $lon0 = deg2rad($fuso * 6 - 183);
    $lam = $lon0 + atan2(sinh($etaL), cos($xiL));
    return [rad2deg($phi), rad2deg($lam)];
}

/**
 * Freio contra força bruta no PIN: 5 erros em 15 min por link+IP bloqueiam novas tentativas.
 * Contador em arquivo temporário (sem depender de tabela nova).
 */
const PUB_PIN_MAX_ERROS = 5;
const PUB_PIN_JANELA_S = 900;

function pubArquivoTentativas(string $codigo): string
{
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    return sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gg_pin_' . hash('sha256', $codigo . '|' . $ip) . '.json';
}

function pubPinBloqueado(string $codigo): bool
{
    $f = pubArquivoTentativas($codigo);
    $d = @json_decode((string)@file_get_contents($f), true);
    if (!is_array($d) || (int)($d['ate'] ?? 0) < time()) {
        return false;
    }
    return (int)($d['erros'] ?? 0) >= PUB_PIN_MAX_ERROS;
}

function pubPinRegistrarErro(string $codigo): void
{
    $f = pubArquivoTentativas($codigo);
    $d = @json_decode((string)@file_get_contents($f), true);
    $erros = (is_array($d) && (int)($d['ate'] ?? 0) >= time()) ? (int)($d['erros'] ?? 0) : 0;
    @file_put_contents($f, json_encode(['erros' => $erros + 1, 'ate' => time() + PUB_PIN_JANELA_S]), LOCK_EX);
}

function pubPinLimparErros(string $codigo): void
{
    @unlink(pubArquivoTentativas($codigo));
}

/**
 * @return array{status:int, body:array}
 */
function obterLevantamentoPublico(PDO $pdo, string $codigo, string $pin): array
{
    $stmt = $pdo->prepare(
        "SELECT l.*, COALESCE(prop.nome_propriedade, prop.nome) AS nome_propriedade,
                prop.codigo_car, prop.codigo_ccir, prop.municipio, prop.uf
           FROM levantamentos l
           LEFT JOIN propriedades prop ON prop.id = l.propriedade_id
          WHERE l.codigo_compartilhamento = ?"
    );
    $stmt->execute([$codigo]);
    $lev = $stmt->fetch();
    if (!$lev) {
        return ['status' => 404, 'body' => ['error' => 'Link inválido ou revogado.', 'motivo' => 'invalido']];
    }

    $expira = trim((string)($lev['compartilhamento_expira_em'] ?? ''));
    if ($expira !== '' && strtotime($expira) !== false && strtotime($expira) < time()) {
        return ['status' => 410, 'body' => ['error' => 'Este link expirou. Solicite um novo ao responsável técnico.', 'motivo' => 'expirado']];
    }

    $hash = (string)($lev['compartilhamento_pin_hash'] ?? '');
    if ($hash !== '') {
        if ($pin === '') {
            return ['status' => 401, 'body' => ['error' => 'Este link é protegido por PIN.', 'motivo' => 'pin_requerido']];
        }
        if (pubPinBloqueado($codigo)) {
            return ['status' => 429, 'body' => ['error' => 'Muitas tentativas com PIN incorreto. Aguarde 15 minutos e tente novamente.', 'motivo' => 'muitas_tentativas']];
        }
        if (!hash_equals($hash, pubHashPin($codigo, $pin))) {
            pubPinRegistrarErro($codigo);
            return ['status' => 401, 'body' => ['error' => 'PIN incorreto.', 'motivo' => 'pin_incorreto']];
        }
        pubPinLimparErros($codigo);
    }

    $levId = (int)$lev['id'];
    $propId = (int)($lev['propriedade_id'] ?? 0);
    $out = pubLimpar($lev);

    // Proprietários: só o nome e o percentual
    $stmt = $pdo->prepare(
        "SELECT pe.nome AS nome_completo, pp.proporcao AS percentual_participacao
           FROM propriedade_proprietarios pp
           JOIN clientes c ON c.id = pp.cliente_id
           JOIN pessoas pe ON pe.id = c.pessoa_id
          WHERE pp.propriedade_id = ?"
    );
    $stmt->execute([$propId]);
    $out['clientes'] = $stmt->fetchAll();

    $stmt = $pdo->prepare("SELECT * FROM matriculas WHERE propriedade_id = ?");
    $stmt->execute([$propId]);
    $out['matriculas'] = array_map('pubLimpar', $stmt->fetchAll());

    // Pontos: planilha de cartório (banco_pontos) tem prioridade, como no Python
    $pontos = [];
    try {
        $stmt = $pdo->prepare(
            "SELECT id, tipo_ponto AS tipo, codigo_completo AS nome_vertice, norte, este, altitude, lat, lon,
                    confrontante_descritivo AS nome_confrontante, matricula_id
               FROM banco_pontos WHERE levantamento_id = ? ORDER BY id ASC"
        );
        $stmt->execute([$levId]);
        $i = 0;
        $fuso = (int)($lev['fuso_utm'] ?? 22) ?: 22;
        foreach ($stmt->fetchAll() as $r) {
            $r['ordem_caminhamento'] = ++$i;
            $semGeo = empty($r['lat']) || empty($r['lon']);
            if ($semGeo && !empty($r['norte']) && !empty($r['este'])) {
                [$r['lat'], $r['lon']] = pubUtmParaLatLon((float)$r['este'], (float)$r['norte'], $fuso);
            }
            $pontos[] = $r;
        }
    } catch (Throwable $e) {
        $pontos = [];
    }

    if (!$pontos) {
        $stmt = $pdo->prepare(
            "SELECT * FROM pontos
              WHERE levantamento_id = ?
                AND (ponto_vizinho IS NULL OR ponto_vizinho = 0)
                AND (ignorar_poligono IS NULL OR ignorar_poligono = 0)
              ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC"
        );
        $stmt->execute([$levId]);
        foreach ($stmt->fetchAll() as $r) {
            $r = pubLimpar($r);
            $r['tipo'] = $r['tipo_ponto'] ?? ($r['tipo'] ?? null);
            // O cliente vê o nome oficial do SIGEF (ex.: XRXR-V-0176), não o apelido de campo (ex.: V-06)
            if (!empty($r['codigo_sigef'])) {
                $r['nome_vertice'] = $r['codigo_sigef'];
            }
            if (($r['lat'] === null || $r['lon'] === null) && isset($r['lat_corrigido'], $r['lon_corrigido'])) {
                $r['lat'] = $r['lat_corrigido'];
                $r['lon'] = $r['lon_corrigido'];
            }
            if (($r['altitude'] ?? null) === null && isset($r['alt'])) {
                $r['altitude'] = $r['alt'];
            }
            $pontos[] = $r;
        }
    }
    $out['pontos'] = $pontos;

    $stmt = $pdo->prepare("SELECT * FROM segmentos WHERE levantamento_id = ?");
    $stmt->execute([$levId]);
    $out['segmentos'] = array_map('pubLimpar', $stmt->fetchAll());

    return ['status' => 200, 'body' => $out];
}
