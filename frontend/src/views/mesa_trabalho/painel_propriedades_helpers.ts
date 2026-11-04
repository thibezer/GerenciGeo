/**
 * ============================================================================
 * HELPER DE SUPORTE AO PAINEL DE PROPRIEDADES (SRP & GEODESIA)
 * ============================================================================
 * Módulo responsável por:
 * 1. Sanitização e conversão segura de coordenadas e sigmas (GEO-01).
 * 2. Formatação defensiva de erros e tratamento de API (SEC-03).
 * 3. Renderização de templates HTML (SRP - Visualização isolada).
 * ============================================================================
 */

import { escapeHtml } from '../../utils';

export interface Ponto {
  id: number;
  nome_vertice?: string;
  ponto_nome?: string;
  arquivo_nome?: string;
  tipo_ponto?: string;
  tipo?: string;
  status_correcao?: string;
  status_ponto?: string;
  lat?: number | null;
  lon?: number | null;
  e_original?: number | null;
  n_original?: number | null;
  alt?: number | null;
  alt_original?: number | null;
  lat_corrigido?: number | null;
  lon_corrigido?: number | null;
  e_corrigido?: number | null;
  n_corrigido?: number | null;
  alt_corrigido?: number | null;
  sigma_e?: number | null;
  sigma_n?: number | null;
  sigma_z?: number | null;
  sigma_alt?: number | null;
  sigma_lat?: number | null;
  sigma_lon?: number | null;
  ponto_vizinho?: number;
  confrontante_id?: number | null;
  ponto_base_id?: number | null;
  matricula_id?: number | null;
  arquivo_origem?: string;
  ignorar_poligono?: number;
  fuso?: string;
  camada_ciclo_vida?: 'CAMPO' | 'PERIMETRO' | 'HOMOLOGADO' | 'VIZINHO' | string;
  delta_n?: number | null;
  delta_e?: number | null;
  delta_h?: number | null;
  delta_3d?: number | null;
  codigo_sigef?: string | null;
  ponto_origem_id?: number | null;
  fuso_utm?: number | null;
  hemisferio?: string | null;
  origem_homologada?: number;
  is_homologado_sigef?: boolean;
  tipo_limite_sigef?: string;
  tipo_limite?: string;
  metodo_posicionamento?: string;
  confrontante_descritivo?: string;
  matricula_confrontante?: string;
  cns_confrontante?: string;
  confrontante_nome?: string;
  confrontante_matricula?: string;
  confrontante_cartorio?: string;
}

export interface Segmento {
  id: number;
  matricula_id: number;
  ponto_inicio_id: number;
  ponto_fim_id: number;
  confrontante_id?: number | null;
  tipo_limite_sigef?: string;
  metodo_posicionamento_sigef?: string;
}

export interface Confrontante {
  id: number;
  nome?: string;
  matricula_imovel?: string;
  cns_confrontante?: string;
  tipo_relacao?: string;
}

export interface MetodoSIGEF {
  codigo: string;
  nome: string;
  aplicacao: string;
}

export interface LimiteSIGEF {
  codigo: string;
  nome: string;
}

export const METODOS_SIGEF: MetodoSIGEF[] = [
  { codigo: 'PG1', nome: 'Relativo estático', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG2', nome: 'Relativo estático-rápido', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG3', nome: 'Relativo semicinemático', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG4', nome: 'Relativo cinemático', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG5', nome: 'Relativo a partir de códigos', aplicacao: 'Limite Natural' },
  { codigo: 'PG6', nome: 'RTK convencional / RTPPP', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG7', nome: 'RTK em rede', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG8', nome: 'Differential GPS (DGPS)', aplicacao: 'Limite Natural' },
  { codigo: 'PG9', nome: 'Posicionamento por Ponto Preciso', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT1', nome: 'Poligonação', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT2', nome: 'Triangulação', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT3', nome: 'Trilateração', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT4', nome: 'Triangulateração', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT5', nome: 'Irradiação', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT6', nome: 'Interseção linear', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT7', nome: 'Interseção angular', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT8', nome: 'Alinhamento', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT9', nome: 'Estação Livre', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PA1', nome: 'Paralela', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PA2', nome: 'Interseção de Retas', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PA3', nome: 'Projeção Técnica', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PS1', nome: 'Aerofotogrametria', aplicacao: 'Limite Artificial, Natural ou Inacessível' },
  { codigo: 'PS2', nome: 'Radar aerotransportado', aplicacao: 'Limite Artificial, Natural ou Inacessível' },
  { codigo: 'PS3', nome: 'Laser scanner aerotransportado', aplicacao: 'Limite Artificial, Natural ou Inacessível' },
  { codigo: 'PS4', nome: 'Sensores orbitais', aplicacao: 'Limite Artificial, Natural ou Inacessível' },
  { codigo: 'PB1', nome: 'Base cartográfica com precisão conhecida', aplicacao: 'Limite Artificial, Natural ou Inacessível' },
  { codigo: 'PB2', nome: 'Base cartográfica sem precisão conhecida', aplicacao: 'Limite Artificial, Natural ou Inacessível' }
];

export const LIMITES_SIGEF: LimiteSIGEF[] = [
  { codigo: 'LA1', nome: 'Cerca' },
  { codigo: 'LA2', nome: 'Muro' },
  { codigo: 'LA3', nome: 'Estrada' },
  { codigo: 'LA4', nome: 'Vala' },
  { codigo: 'LA5', nome: 'Canal' },
  { codigo: 'LA6', nome: 'Linha ideal' },
  { codigo: 'LA7', nome: 'Limite artificial não tipificado' },
  { codigo: 'LN1', nome: 'Corpo d’água ou curso d’água' },
  { codigo: 'LN2', nome: 'Linha de cumeada' },
  { codigo: 'LN3', nome: 'Grota' },
  { codigo: 'LN4', nome: 'Crista de encosta' },
  { codigo: 'LN5', nome: 'Pé de encosta' },
  { codigo: 'LN6', nome: 'Limite natural não tipificado' }
];

/**
 * Converte com segurança um valor para number ou null sem corromper valores ausentes em 0.0 (GEO-01).
 * Suporta formatos numéricos brasileiros (vírgula decimal) e internacionais.
 */
export function parseNumberOrNull(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') return Number.isNaN(val) ? null : val;
  if (typeof val === 'string') {
    let s = val.trim();
    if (!s) return null;
    // Remove espaços internos entre dígitos (ex: "744 213.541" ou "744 213,541")
    s = s.replace(/(\d)\s+(\d)/g, '$1$2');
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        // Formato BR: "744.213,541" -> "744213.541"
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // Formato US com vírgula de milhar: "744,213.541" -> "744213.541"
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const num = Number(s);
    return Number.isNaN(num) ? null : num;
  }
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
}

export interface CoordenadasExtraidas {
  tipo: 'utm' | 'geo';
  e?: number;
  n?: number;
  h?: number;
  lat?: number;
  lon?: number;
}

/**
 * Analisa e extrai coordenadas a partir de texto colado (clipboard),
 * suportando pares UTM (Este/Norte/Alt), coordenadas geodésicas (Lat/Lon/Alt),
 * com ou sem rótulos explícitos (E, N, Lat, Lon) e com vírgula ou ponto decimal.
 */
export function extrairCoordenadasTexto(texto: string): CoordenadasExtraidas | null {
  if (!texto || typeof texto !== 'string') return null;
  const raw = texto.trim();
  if (!raw) return null;

  // 1. Regex com rótulos explícitos de UTM (E/Este/X e N/Norte/Y e Alt/H/Z)
  const padraoE = /(?:^|[\s,;|])(?:E|X|ESTE|LESTE)\s*[:=]?\s*([+-]?\d+(?:[.,]\d+)?)/i;
  const padraoN = /(?:^|[\s,;|])(?:N|Y|NORTE)\s*[:=]?\s*([+-]?\d+(?:[.,]\d+)?)/i;
  const padraoH = /(?:^|[\s,;|])(?:H|Z|ALT|ALTITUDE|COTA)\s*[:=]?\s*([+-]?\d+(?:[.,]\d+)?)/i;

  const matchE = raw.match(padraoE);
  const matchN = raw.match(padraoN);
  const matchH = raw.match(padraoH);

  if (matchE && matchN) {
    const e = parseNumberOrNull(matchE[1]);
    const n = parseNumberOrNull(matchN[1]);
    const h = matchH ? parseNumberOrNull(matchH[1]) : undefined;
    if (e != null && n != null) {
      return { tipo: 'utm', e, n, h: h ?? undefined };
    }
  }

  // 2. Regex com rótulos explícitos de Geodésicas (Lat e Lon)
  const padraoLat = /(?:^|[\s,;|])(?:LAT|LATITUDE)\s*[:=]?\s*([+-]?\d+(?:[.,]\d+)?)/i;
  const padraoLon = /(?:^|[\s,;|])(?:LON|LONG|LONGITUDE)\s*[:=]?\s*([+-]?\d+(?:[.,]\d+)?)/i;

  const matchLat = raw.match(padraoLat);
  const matchLon = raw.match(padraoLon);

  if (matchLat && matchLon) {
    const lat = parseNumberOrNull(matchLat[1]);
    const lon = parseNumberOrNull(matchLon[1]);
    const h = matchH ? parseNumberOrNull(matchH[1]) : undefined;
    if (lat != null && lon != null) {
      return { tipo: 'geo', lat, lon, h: h ?? undefined };
    }
  }

  // 3. Suporte a pares ou trios de números sem rótulo
  let tokens: string[] = [];
  if (raw.includes(';') || raw.includes('|')) {
    tokens = raw.split(/[;|]+/).map(s => s.trim()).filter(Boolean);
  } else if (raw.includes('\t') || raw.includes('\n')) {
    tokens = raw.split(/[\t\n]+/).map(s => s.trim()).filter(Boolean);
  } else if (raw.includes(',') && !raw.match(/\d,\d/)) {
    // Vírgula atuando apenas como separador entre coordenadas (ex: 744213.541, 7351234.982)
    tokens = raw.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    // Espaços ou separadores gerais
    tokens = raw.split(/\s+/).map(s => s.trim()).filter(Boolean);
  }

  if (tokens.length >= 2) {
    const nums = tokens.map(parseNumberOrNull).filter((n): n is number => n !== null);
    if (nums.length >= 2) {
      const [n1, n2, n3] = nums;
      // Checa se é UTM (Este ~ 100k..950k, Norte ~ 1M..10M)
      if ((n1 >= 100000 && n1 <= 950000 && n2 >= 1000000 && n2 <= 10000000) ||
          (n2 >= 100000 && n2 <= 950000 && n1 >= 1000000 && n1 <= 10000000)) {
        const e = (n1 >= 100000 && n1 <= 950000) ? n1 : n2;
        const n = (e === n1) ? n2 : n1;
        const h = (n3 !== undefined && Math.abs(n3) < 10000) ? n3 : undefined;
        return { tipo: 'utm', e, n, h };
      }

      // Checa se é Geodésica (Lat -90..90, Lon -180..180)
      if (Math.abs(n1) <= 90 && Math.abs(n2) <= 180) {
        let lat = n1;
        let lon = n2;
        if (n2 >= -35 && n2 <= 6 && n1 >= -75 && n1 <= -30) {
          lat = n2;
          lon = n1;
        }
        const h = (n3 !== undefined && Math.abs(n3) < 10000) ? n3 : undefined;
        return { tipo: 'geo', lat, lon, h };
      }
    }
  }

  return null;
}

/**
 * Converte com segurança para number com fallback padrão configurável.
 */
export function parseNumberDefault(val: unknown, fallback = 0): number {
  const parsed = parseNumberOrNull(val);
  return parsed ?? fallback;
}

/**
 * Formata um número com número fixo de casas decimais ou exibe um traço se for nulo.
 */
export function formatCoordinate(val: unknown, decimals: number): string {
  const num = parseNumberOrNull(val);
  return num !== null ? num.toFixed(decimals) : '-';
}

/**
 * Trata exceções da API evitando que vazem detalhes de infraestrutura SQLite ou dados internos (SEC-03).
 */
export function tratarErroAPI(err: unknown, mensagemPadrao: string): string {
  if (err instanceof Error) {
    if (err.message.includes('sqlite3') || err.message.includes('operational error') || err.message.includes('Internal Server Error')) {
      return mensagemPadrao;
    }
    return err.message;
  }
  return mensagemPadrao;
}

/**
 * Gera a tabela HTML para a modal de Métodos SIGEF.
 */
export function renderModalMetodosHTML(): string {
  return `
    <div class="max-h-[60vh] overflow-y-auto mt-2">
      <table class="w-full text-[10px] text-left border-collapse">
        <thead class="sticky top-0 bg-[#111113] border-b border-white/10 text-white/60">
          <tr>
            <th class="py-1 px-2">Código</th>
            <th class="py-1 px-2">Método</th>
            <th class="py-1 px-2">Aplicação</th>
          </tr>
        </thead>
        <tbody class="text-white/80">
          ${METODOS_SIGEF.map(m => `
            <tr class="border-b border-white/5 hover:bg-white/5">
              <td class="py-1.5 px-2 font-mono text-mint-vibrant">${escapeHtml(m.codigo)}</td>
              <td class="py-1.5 px-2">${escapeHtml(m.nome)}</td>
              <td class="py-1.5 px-2">${escapeHtml(m.aplicacao)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Gera a tabela HTML para a modal de Tipos de Limite SIGEF.
 */
export function renderModalLimitesHTML(): string {
  return `
    <div class="max-h-[60vh] overflow-y-auto mt-2">
      <table class="w-full text-[10px] text-left border-collapse">
        <thead class="sticky top-0 bg-[#111113] border-b border-white/10 text-white/60">
          <tr>
            <th class="py-1 px-2">Código</th>
            <th class="py-1 px-2">Tipo de Limite</th>
          </tr>
        </thead>
        <tbody class="text-white/80">
          ${LIMITES_SIGEF.map(l => `
            <tr class="border-b border-white/5 hover:bg-white/5">
              <td class="py-1.5 px-2 font-mono text-purple-400">${escapeHtml(l.codigo)}</td>
              <td class="py-1.5 px-2">${escapeHtml(l.nome)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
