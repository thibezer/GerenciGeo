/**
 * Validadores e normalizadores de documentos e qualificação civil usados na aba "Peças de Cartório".
 * A regra de CPF/CNPJ espelha utils/validadores.py do backend: vazio é aceito; preenchido precisa ter
 * tamanho correto, não ser sequência repetida e ter os dígitos verificadores certos.
 */

export const somenteDigitos = (valor: string | null | undefined): string => (valor ?? '').replace(/\D/g, '');

export function formatarCpfCnpjDinamico(value: string): string {
  const apenasNumeros = somenteDigitos(value).slice(0, 14);

  if (apenasNumeros.length <= 11) {
    // Formato CPF: 999.999.999-99
    return apenasNumeros
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  // Formato CNPJ: 99.999.999/9999-99
  return apenasNumeros
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function cpfValido(valor: string | null | undefined): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || cpf === cpf[0].repeat(11)) return false;
  for (const i of [9, 10]) {
    let soma = 0;
    for (let n = 0; n < i; n++) soma += Number(cpf[n]) * (i + 1 - n);
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(cpf[i])) return false;
  }
  return true;
}

export function cnpjValido(valor: string | null | undefined): boolean {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || cnpj === cnpj[0].repeat(14)) return false;
  const digito = (base: string): number => {
    let soma = 0;
    const invertida = base.split('').reverse();
    invertida.forEach((car, pos) => { soma += Number(car) * (2 + (pos % 8)); });
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(cnpj.slice(0, 12));
  const d2 = digito(cnpj.slice(0, 12) + String(d1));
  return cnpj.slice(12) === `${d1}${d2}`;
}

/** Devolve a mensagem de erro de um CPF/CNPJ preenchido, ou null se estiver vazio ou válido. */
export function erroCpfCnpj(valor: string | null | undefined, rotulo = 'CPF/CNPJ'): string | null {
  const texto = (valor ?? '').trim();
  if (!texto) return null;
  const digitos = somenteDigitos(texto);
  if (digitos.length === 0) return `${rotulo} inválido.`;
  if (digitos.length === 11) return cpfValido(digitos) ? null : `${rotulo} inválido: confira os dígitos do CPF.`;
  if (digitos.length === 14) return cnpjValido(digitos) ? null : `${rotulo} inválido: confira os dígitos do CNPJ.`;
  return `${rotulo} incompleto: o CPF tem 11 dígitos e o CNPJ, 14.`;
}

/** Erro de um CPF (apenas 11 dígitos; usado para o cônjuge). Vazio é aceito. */
export function erroCpf(valor: string | null | undefined, rotulo = 'CPF'): string | null {
  const texto = (valor ?? '').trim();
  if (!texto) return null;
  const digitos = somenteDigitos(texto);
  if (digitos.length !== 11) return `${rotulo} incompleto: o CPF tem 11 dígitos.`;
  return cpfValido(digitos) ? null : `${rotulo} inválido: confira os dígitos.`;
}

export const ehCnpj = (valor: string | null | undefined): boolean => somenteDigitos(valor).length > 11;

// ── Estado civil e regime de bens ───────────────────────────────────────────────────────────────────────

/**
 * Converte as variantes conhecidas para o código canônico. Vazio devolve '' (não informado) e um valor
 * desconhecido é devolvido como veio (legado): não vira "solteiro" nem é regravado como outra coisa.
 */
export function normalizarEstadoCivil(val: string | null | undefined): string {
  const bruto = (val ?? '').trim();
  if (!bruto) return '';
  const v = bruto.toLowerCase();
  if (v.includes('casad')) return 'casado';
  if (v.includes('estav') || v.includes('estáv') || v.includes('uniao') || v.includes('união')) return 'uniao_estavel';
  if (v.includes('divorc') || v.includes('divorç')) return 'divorciado';
  if (v.includes('viuv') || v.includes('viúv')) return 'viuvo';
  if (v.includes('solteir')) return 'solteiro';
  return bruto;
}

export function normalizarRegimeBens(val: string | null | undefined): string {
  const bruto = (val ?? '').trim();
  if (!bruto) return '';
  const v = bruto.toLowerCase();
  if (v.includes('parcial')) return 'comunhao_parcial';
  if (v.includes('universal')) return 'comunhao_universal';
  if (v.includes('separac') || v.includes('separaç')) return 'separacao_total';
  if (v.includes('aquestos') || v.includes('participacao') || v.includes('participação')) return 'participacao_final';
  return bruto;
}

/** Casado ou em união estável: exige cônjuge/companheiro(a) e regime de bens. */
export function estadoCivilExigeConjuge(val: string | null | undefined): boolean {
  const v = normalizarEstadoCivil(val);
  return v === 'casado' || v === 'uniao_estavel';
}

export const ESTADOS_CIVIS_PADRAO: [string, string][] = [
  ['solteiro', 'Solteiro(a)'],
  ['casado', 'Casado(a)'],
  ['uniao_estavel', 'União Estável'],
  ['divorciado', 'Divorciado(a)'],
  ['viuvo', 'Viúvo(a)'],
];

export const REGIMES_PADRAO: [string, string][] = [
  ['comunhao_parcial', 'Comunhão Parcial'],
  ['comunhao_universal', 'Comunhão Universal'],
  ['separacao_total', 'Separação Total'],
  ['participacao_final', 'Participação Final nos Aquestos'],
];

export const generoOposto = (g: string | null | undefined): string => (g === 'M' ? 'F' : g === 'F' ? 'M' : '');
