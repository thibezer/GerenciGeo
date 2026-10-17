<?php
/**
 * Roda as funções de cifra/validação de documentos de frontend/public/api.php sem subir o servidor.
 * Uso: php harness_api.php [selftest|cifrar <texto>|decifrar <valor>|legadoCbc <texto>] (chave em GERENCIGEO_SECRET_KEY).
 * Exercitado por tests/test_api_php_crypto.py, que pula o teste se não houver PHP instalado.
 */
declare(strict_types=1);
$src = file_get_contents(__DIR__ . '/../../frontend/public/api.php');
function trecho(string $src, string $ini, string $fim): string {
    $a = strpos($src, $ini); $b = strpos($src, $fim, $a);
    if ($a === false || $b === false) { fwrite(STDERR, "trecho não achado: $ini\n"); exit(2); }
    return substr($src, $a, $b - $a);
}
define('APP_SECRET_KEY', 'G3renciGeo_Cloud_Secret_Key_2026_Salt!');
$GLOBALS['gg_cfg'] = [];
eval(trecho($src, 'function ggCfg', 'define(\'DB_NAME\''));
eval(trecho($src, 'const GOV_PREFIXO_ATUAL', 'function registrarHistoricoCliente'));
eval(trecho($src, "function emptyToNull", "
}
") . "
}
");

$ok = 0; $falhas = 0;
function check(string $nome, $esperado, $obtido): void {
    global $ok, $falhas;
    if ($esperado === $obtido) { $ok++; echo "ok   $nome\n"; }
    else { $falhas++; echo "FAIL $nome\n  esperado: " . var_export($esperado, true) . "\n  obtido:   " . var_export($obtido, true) . "\n"; }
}

$modo = $argv[1] ?? 'selftest';
if ($modo === 'decifrar') {            // decifrar <valor>   (chave via ambiente)
    echo decryptGovPassword($argv[2]);
    exit(0);
}
if ($modo === 'cifrar') {              // cifrar <texto>
    echo encryptGovPassword($argv[2]);
    exit(0);
}
if ($modo === 'legadoCbc') {           // gera blob no formato antigo da nuvem (AES-CBC)
    $key = hash('sha256', APP_SECRET_KEY, true);
    $iv = openssl_random_pseudo_bytes(16);
    $ct = openssl_encrypt($argv[2], 'aes-256-cbc', $key, 0, $iv);
    echo 'ENC:G4G2:' . base64_encode($iv . $ct);
    exit(0);
}

putenv('GERENCIGEO_SECRET_KEY=chave-de-teste-interop');
check('vetor do Python decifra no PHP', 'Senha#Gov2026',
    decryptGovPassword('ENC:G4G3:AAECAwQFBgcICQoLeAkG74eWx1hiQvHNydJcW_SJrbHhqYduypVUNdw='));
$c1 = encryptGovPassword('açaí•ção 123');
check('prefixo atual', true, str_starts_with($c1, 'ENC:G4G3:'));
check('ida e volta', 'açaí•ção 123', decryptGovPassword($c1));
check('nonce aleatório', true, encryptGovPassword('x') !== encryptGovPassword('x'));
check('já cifrado não recifra', $c1, encryptGovPassword($c1));
check('texto puro legado passa', 'abc', decryptGovPassword('abc'));
$adulterado = substr($c1, 0, -6) . 'AAAAAA';
check('adulteração detectada', '', decryptGovPassword($adulterado));
putenv('GERENCIGEO_SECRET_KEY=outra-chave');
check('chave errada não decifra', '', decryptGovPassword($c1));
putenv('GERENCIGEO_SECRET_KEY');

// validação de documentos
check('cpf válido', true, validarCpfCnpj('529.982.247-25'));
check('cpf inválido', false, validarCpfCnpj('529.982.247-26'));
check('cpf repetido', false, validarCpfCnpj('111.111.111-11'));
check('cnpj numérico', true, validarCpfCnpj('11.222.333/0001-81'));
check('cnpj numérico errado', false, validarCpfCnpj('11.222.333/0001-82'));
check('cnpj alfanumérico oficial', true, validarCpfCnpj('12.ABC.345/01DE-35'));
check('cnpj alfanumérico minúsculo', true, validarCpfCnpj('12abc34501de35'));
check('cnpj alfanumérico errado', false, validarCpfCnpj('12.ABC.345/01DE-36'));
check('vazio é válido', true, validarCpfCnpj(null));
check('normaliza alfanumérico', '12ABC34501DE35', limparDocumentoCliente('12.abc.345/01de-35'));
check('normaliza cnpj numérico', '11222333000181', limparDocumentoCliente('11.222.333/0001-81'));
check('normaliza vazio', null, limparDocumentoCliente('  '));
check('representante vazio', null, normalizarCampoCliente('representante_legal_id', ''));
check('representante int', 7, normalizarCampoCliente('representante_legal_id', '7'));
check('cpf cônjuge só dígitos', '52998224725', normalizarCampoCliente('cpf_conjuge', '529.982.247-25'));
check('histórico normaliza cpf', '52998224725', textoParaHistorico('cpf_cnpj', '529.982.247-25'));
echo "\n$ok ok, $falhas falhas\n";
exit($falhas ? 1 : 0);
