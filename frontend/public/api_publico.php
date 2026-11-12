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

/** Campos que nunca vão para o link público. */
const PUB_CAMPOS_PRIVADOS = [
    'caminho_arquivo_pdf', 'arquivo_rinex', 'arquivo_resultado_ppp', 'arquivo_origem',
    'dados_vizinho_json', 'pasta_projeto', 'compartilhamento_pin_hash',
];

function pubLimpar(array $row): array
{
    foreach (PUB_CAMPOS_PRIVADOS as $c) {
        unset($row[$c]);
    }
    return $row;
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
        if (!hash_equals($hash, pubHashPin($codigo, $pin))) {
            return ['status' => 401, 'body' => ['error' => 'PIN incorreto.', 'motivo' => 'pin_incorreto']];
        }
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
        foreach ($stmt->fetchAll() as $r) {
            $r['ordem_caminhamento'] = ++$i;
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
    $out['segmentos'] = $stmt->fetchAll();

    return ['status' => 200, 'body' => $out];
}
