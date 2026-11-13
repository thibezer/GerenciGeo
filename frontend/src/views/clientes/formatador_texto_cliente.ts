const CONECTIVOS_PT = new Set([
  'a', 'as', 'o', 'os',
  'da', 'das', 'de', 'do', 'dos',
  'e', 'em', 'na', 'nas', 'no', 'nos',
  'com', 'para', 'por'
]);

const SIGLAS_PRESERVADAS = new Set([
  'ltda', 's/a', 's.a', 's.a.', 'me', 'epp', 'eireli', 'mei', 'cia',
  'ssp', 'sesp', 'detran', 'incra', 'car', 'iipr',
  'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii'
]);

const UFS_BRASIL = new Set([
  'ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go',
  'ma', 'mg', 'ms', 'mt', 'pa', 'pb', 'pe', 'pi', 'pr',
  'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to'
]);

const capitalizarSimples = (palavra: string): string => {
  if (!palavra) return '';
  return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
};

const formatarToken = (token: string, indice: number, aposSeparadorLocal: boolean): string => {
  const lower = token.toLowerCase();

  if (SIGLAS_PRESERVADAS.has(lower)) {
    return token.toUpperCase();
  }

  if (aposSeparadorLocal && UFS_BRASIL.has(lower)) {
    return token.toUpperCase();
  }

  if (token.includes('/')) {
    return token
      .split('/')
      .map((parte, subIdx) => formatarToken(parte, indice + subIdx, subIdx > 0))
      .join('/');
  }

  if (token.includes("'")) {
    const [antes, ...resto] = token.split("'");
    const antesLower = antes.toLowerCase();
    const prefixo = indice > 0 && antesLower === 'd' ? 'd' : capitalizarSimples(antes);
    const sufixo = resto.map(p => capitalizarSimples(p)).join("'");
    return `${prefixo}'${sufixo}`;
  }

  if (indice > 0 && CONECTIVOS_PT.has(lower)) {
    return lower;
  }

  return capitalizarSimples(token);
};

/**
 * Formata nomes próprios, endereços, cidades e profissões em Title Case (pt-BR),
 * preservando conectivos em minúscula ("da", "de", "do", "das", "dos", "e")
 * e siglas/UFs em maiúscula ("LTDA", "S/A", "PR", "DETRAN/PR").
 */
export const formatarTitleCasePtBr = (texto?: string | null): string => {
  const limpo = (texto || '').trim().replace(/\s+/g, ' ');
  if (!limpo) return '';

  const tokens = limpo.split(' ');
  return tokens
    .map((token, idx) => {
      if (token === '-' || token === '–' || token === '&') return token;
      const prev = idx > 0 ? tokens[idx - 1] : '';
      const aposSeparadorLocal = prev === '-' || prev === '–';
      return formatarToken(token, idx, aposSeparadorLocal);
    })
    .join(' ');
};

/**
 * Converte siglas e órgãos expedidores (RG, UF, CNH) para maiúsculas.
 */
export const formatarSiglaMaiuscula = (texto?: string | null): string =>
  (texto || '').trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * Normaliza e-mail para minúsculas sem espaços nas extremidades.
 */
export const formatarEmailCliente = (texto?: string | null): string =>
  (texto || '').trim().toLowerCase();

type FormatadorFn = (texto?: string | null) => string;

const GRUPOS_FORMATACAO: Array<{ campos: string[]; formatar: FormatadorFn }> = [
  {
    campos: [
      'nome_completo',
      'razao_social',
      'nome_fantasia',
      'profissao',
      'naturalidade',
      'nome_conjuge',
      'profissao_conjuge',
      'cartorio_casamento',
      'endereco_sem_numero',
      'bairro',
      'cidade'
    ],
    formatar: formatarTitleCasePtBr
  },
  {
    campos: [
      'rg_orgao',
      'rg_uf',
      'rg_orgao_conjuge',
      'rg_uf_conjuge',
      'cnh_categoria',
      'cnh_orgao_uf'
    ],
    formatar: formatarSiglaMaiuscula
  },
  {
    campos: ['email'],
    formatar: formatarEmailCliente
  }
];

const MAPA_FORMATADORES = new Map<string, FormatadorFn>(
  GRUPOS_FORMATACAO.flatMap(grupo => grupo.campos.map(campo => [campo, grupo.formatar] as const))
);

/**
 * Anexa formatadores automáticos ao sair do campo (`focusout`) no formulário de cliente.
 * Campos sensíveis como `senha_gov`, documentos numéricos e `nacionalidade` não são alterados aqui.
 */
export const vincularFormatadoresFormularioCliente = (form: HTMLFormElement): void => {
  for (const [campo, formatar] of MAPA_FORMATADORES.entries()) {
    const el = form.querySelector<HTMLInputElement>(`[name="${campo}"]`);
    if (!el) continue;

    el.addEventListener('focusout', () => {
      const atual = el.value || '';
      const formatado = formatar(atual);
      if (formatado !== atual) {
        el.value = formatado;
        if ('setAttribute' in el) el.setAttribute('value', formatado);
      }
    });
  }
};

/**
 * Aplica as mesmas regras de formatação aos dados brutos do formulário antes do envio.
 */
export const aplicarFormatacaoCamposTexto = (rawPayload: Record<string, string>): Record<string, string> => {
  const resultado = { ...rawPayload };
  for (const [campo, formatar] of MAPA_FORMATADORES.entries()) {
    if (campo in resultado && typeof resultado[campo] === 'string') {
      resultado[campo] = formatar(resultado[campo]);
    }
  }
  return resultado;
};
