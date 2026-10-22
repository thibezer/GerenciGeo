<?php
/**
 * api_contagem_pontos.php — Contagem de pontos pelo padrão SIGEF (CODIGO-TIPO-NNNN) para a nuvem.
 *
 * Espelho de services/gestores/contagem_pontos.py: qualquer mudança de regra deve ser feita nos DOIS.
 * Fica em arquivo próprio e é carregado apenas pela rota GET /contagem-pontos do api.php, dentro de
 * try/catch, para que um erro aqui nunca derrube o restante da API.
 */

declare(strict_types=1);

const CP_TIPOS = ['M', 'P', 'V'];

// Um número muito acima do resto da sequência (ex.: XRXR-V-9999 digitado como marcador) não pode empurrar
// o "próximo disponível" para o fim da numeração: é tratado como isolado e ignorado no cálculo.
const CP_SALTO_ISOLADO = 500;

/** Devolve [codigo, tipo, numero] se o nome segue o padrão SIGEF; senão null. */
function cpInterpretarNome($nome): ?array
{
    if (!preg_match('/^([A-Za-z0-9]{3,4})-([MPVmpv])-(\d{1,6})$/', trim((string)$nome), $m)) {
        return null;
    }
    return [strtoupper($m[1]), strtoupper($m[2]), (int)$m[3]];
}

/** [1,2,3,5,8,9] -> [[1,3],[5,5],[8,9]] */
function cpComprimirFaixas(array $numeros): array
{
    $ordenados = array_values(array_unique(array_map('intval', $numeros)));
    sort($ordenados);
    $faixas = [];
    foreach ($ordenados as $n) {
        $ultimo = count($faixas) - 1;
        if ($ultimo >= 0 && $n === $faixas[$ultimo][1] + 1) {
            $faixas[$ultimo][1] = $n;
        } else {
            $faixas[] = [$n, $n];
        }
    }
    return $faixas;
}

/** Separa a sequência principal dos números isolados lá no topo. Retorna [principal, isolados]. */
function cpSepararIsolados(array $numeros): array
{
    $principal = array_values(array_unique(array_map('intval', $numeros)));
    sort($principal);
    $isolados = [];
    while (count($principal) > 1 && $principal[count($principal) - 1] - $principal[count($principal) - 2] > CP_SALTO_ISOLADO) {
        array_unshift($isolados, array_pop($principal));
    }
    return [$principal, $isolados];
}

/** Faixas livres entre 1 e o maior número da sequência principal. */
function cpCalcularLacunas(array $principal): array
{
    if (count($principal) === 0) {
        return [];
    }
    $usados = array_flip($principal);
    $maximo = $principal[count($principal) - 1];
    $lacunas = [];
    for ($n = 1; $n < $maximo; $n++) {
        if (isset($usados[$n])) {
            continue;
        }
        $ultimo = count($lacunas) - 1;
        if ($ultimo >= 0 && $n === $lacunas[$ultimo][1] + 1) {
            $lacunas[$ultimo][1] = $n;
        } else {
            $lacunas[] = [$n, $n];
        }
    }
    return $lacunas;
}

function cpFormatarNome(string $codigo, string $tipo, int $numero): string
{
    return sprintf('%s-%s-%04d', $codigo, $tipo, $numero);
}

/**
 * $usos: numero => [levantamento_id => true]. Lacunas só fazem sentido para a numeração do próprio credenciado.
 */
function cpResumirTipo(string $codigo, string $tipo, array $usos, bool $comLacunas = true): array
{
    [$principal, $isolados] = cpSepararIsolados(array_keys($usos));
    $maximo = count($principal) > 0 ? $principal[count($principal) - 1] : 0;
    $proximo = $maximo + 1;
    $lacunas = $comLacunas ? cpCalcularLacunas($principal) : [];

    $totalLacunas = 0;
    foreach ($lacunas as $faixa) {
        $totalLacunas += $faixa[1] - $faixa[0] + 1;
    }

    $projetos = [];
    foreach ($usos as $levs) {
        foreach ($levs as $lev => $_) {
            $projetos[$lev] = true;
        }
    }

    return [
        'tipo' => $tipo,
        'total' => count($usos),
        'minimo' => count($principal) > 0 ? $principal[0] : null,
        'maximo' => $maximo > 0 ? $maximo : null,
        'isolados' => $isolados,
        'proximo' => $proximo,
        'proximo_nome' => cpFormatarNome($codigo, $tipo, $proximo),
        'faixas' => cpComprimirFaixas($principal),
        'lacunas' => $lacunas,
        'total_lacunas' => $totalLacunas,
        'projetos' => count($projetos),
    ];
}

/**
 * $pontos: [['nome_vertice' => ..., 'levantamento_id' => ...]]
 * $levantamentos: [id => ['propriedade', 'municipio', 'uf', 'status']]
 * $profissionais: [['nome', 'codigo_credenciado', 'contador_m', 'contador_p', 'contador_v']]
 */
function cpCalcularContagem(array $pontos, array $levantamentos, array $profissionais): array
{
    // Atenção: chaves de array numéricas ("1234") viram int no PHP; por isso todo código é convertido com (string).
    $meus = [];
    foreach ($profissionais as $p) {
        $codigo = (string)($p['codigo_credenciado'] ?? '');
        if ($codigo === '') {
            continue;
        }
        $meus[strtoupper($codigo)] = $p;
    }

    // codigo => tipo => numero => [levantamento_id => true]
    $usos = [];
    // levantamento => codigo => tipo => [numero => true]
    $porProjeto = [];
    $foraDoPadrao = [];
    $totalPorProjeto = [];

    foreach ($pontos as $p) {
        $lev = (int)$p['levantamento_id'];
        $totalPorProjeto[$lev] = ($totalPorProjeto[$lev] ?? 0) + 1;
        $parsed = cpInterpretarNome($p['nome_vertice'] ?? '');
        if ($parsed === null) {
            $foraDoPadrao[$lev] = ($foraDoPadrao[$lev] ?? 0) + 1;
            continue;
        }
        [$codigo, $tipo, $numero] = $parsed;
        $usos[$codigo][$tipo][$numero][$lev] = true;
        $porProjeto[$lev][$codigo][$tipo][$numero] = true;
    }

    // Os códigos do próprio profissional primeiro; depois ordem alfabética (igual ao Python)
    $ordenarCodigos = function (array $codigos) use ($meus): array {
        $lista = array_map('strval', $codigos);
        usort($lista, function (string $a, string $b) use ($meus): int {
            $ma = isset($meus[$a]) ? 0 : 1;
            $mb = isset($meus[$b]) ? 0 : 1;
            return ($ma <=> $mb) !== 0 ? ($ma <=> $mb) : strcmp($a, $b);
        });
        return $lista;
    };

    $codigos = [];
    $conflitos = [];
    foreach ($ordenarCodigos(array_keys($usos)) as $codigo) {
        $prof = $meus[$codigo] ?? null;
        $tipos = [];
        foreach (CP_TIPOS as $tipo) {
            if (!isset($usos[$codigo][$tipo]) && $prof === null) {
                continue;
            }
            $mapa = $usos[$codigo][$tipo] ?? [];
            $resumo = cpResumirTipo($codigo, $tipo, $mapa, $prof !== null);
            if ($prof !== null) {
                $contador = (int)($prof['contador_' . strtolower($tipo)] ?? 0);
                $resumo['contador_cadastrado'] = $contador;
                $resumo['divergencia_contador'] = $contador !== (int)($resumo['maximo'] ?? 0);
                foreach ($mapa as $numero => $levs) {
                    if (count($levs) > 1) {
                        $ids = array_map('intval', array_keys($levs));
                        sort($ids);
                        $conflitos[] = [
                            'nome' => cpFormatarNome($codigo, $tipo, (int)$numero),
                            'levantamentos' => $ids,
                        ];
                    }
                }
            }
            $tipos[$tipo] = $resumo;
        }
        $codigos[] = [
            'codigo' => $codigo,
            'meu' => $prof !== null,
            'profissional' => $prof !== null ? ($prof['nome'] ?? null) : null,
            'tipos' => $tipos,
        ];
    }

    // Credenciados cadastrados que ainda não têm nenhum ponto: o próximo é o 0001 (inseridos no início)
    foreach ($meus as $chave => $prof) {
        $codigo = (string)$chave;
        if (isset($usos[$codigo])) {
            continue;
        }
        $vazios = [];
        foreach (CP_TIPOS as $t) {
            $contador = (int)($prof['contador_' . strtolower($t)] ?? 0);
            $vazios[$t] = cpResumirTipo($codigo, $t, []) + [
                'contador_cadastrado' => $contador,
                'divergencia_contador' => $contador !== 0,
            ];
        }
        array_unshift($codigos, [
            'codigo' => $codigo,
            'meu' => true,
            'profissional' => $prof['nome'] ?? null,
            'tipos' => $vazios,
        ]);
    }

    $projetos = [];
    foreach ($levantamentos as $levId => $info) {
        $levId = (int)$levId;
        if (!isset($totalPorProjeto[$levId])) {
            continue;
        }
        $itens = [];
        foreach ($ordenarCodigos(array_keys($porProjeto[$levId] ?? [])) as $codigo) {
            foreach (CP_TIPOS as $tipo) {
                $nums = $porProjeto[$levId][$codigo][$tipo] ?? null;
                if (!empty($nums)) {
                    $itens[] = [
                        'codigo' => $codigo,
                        'tipo' => $tipo,
                        'meu' => isset($meus[$codigo]),
                        'quantidade' => count($nums),
                        'faixas' => cpComprimirFaixas(array_keys($nums)),
                    ];
                }
            }
        }
        $projetos[] = [
            'levantamento_id' => $levId,
            'propriedade' => $info['propriedade'] ?? null,
            'municipio' => $info['municipio'] ?? null,
            'uf' => $info['uf'] ?? null,
            'status' => $info['status'] ?? null,
            'total_pontos' => $totalPorProjeto[$levId],
            'fora_do_padrao' => $foraDoPadrao[$levId] ?? 0,
            'itens' => $itens,
        ];
    }
    usort($projetos, fn(array $a, array $b): int => $b['levantamento_id'] <=> $a['levantamento_id']);
    usort($conflitos, fn(array $a, array $b): int => strcmp($a['nome'], $b['nome']));

    return ['codigos' => $codigos, 'projetos' => $projetos, 'conflitos' => $conflitos];
}

function obterContagemPontos(PDO $pdo): array
{
    $pontos = $pdo->query('SELECT nome_vertice, levantamento_id FROM pontos')->fetchAll();

    $levantamentos = [];
    $stmt = $pdo->query(
        'SELECT l.id, l.status, p.nome_propriedade, p.municipio, p.uf
           FROM levantamentos l JOIN propriedades p ON p.id = l.propriedade_id'
    );
    foreach ($stmt->fetchAll() as $r) {
        $levantamentos[(int)$r['id']] = [
            'propriedade' => $r['nome_propriedade'],
            'municipio' => $r['municipio'],
            'uf' => $r['uf'],
            'status' => $r['status'],
        ];
    }

    $profissionais = $pdo->query(
        'SELECT nome, codigo_credenciado, contador_m, contador_p, contador_v FROM profissionais'
    )->fetchAll();

    return cpCalcularContagem($pontos, $levantamentos, $profissionais);
}
