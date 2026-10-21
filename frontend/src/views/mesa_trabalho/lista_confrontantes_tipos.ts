import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import type { CamadaConfrontantes, TrechoMapa } from './camada_confrontantes';

export interface TrechoConfrontante {
  de: string;
  para: string;
  qtd_divisas: number;
  comprimento_m: number;
  tipo_limite: string | null;
}

export interface ResumoConfrontante {
  qtd_divisas: number;
  comprimento_m: number;
  trechos: TrechoConfrontante[];
}

export interface ConfrontanteResumo extends ResumoConfrontante {
  id: number;
  nome: string;
  matricula_imovel: string | null;
  lote?: string | null;
  cpf_cnpj: string | null;
  assinadas: number;
  /** Anuência dispensada (via/curso d'água público); `dispensa_inferida` = veio do nome, sem decisão explícita. */
  dispensada?: boolean;
  dispensa_inferida?: boolean;
  status_anuencia?: string;
  /** Posição do confrontante no perímetro (quando o backend informa). */
  ordem_perimetro?: number | null;
}

export interface ResumoConfrontantes {
  confrontantes: ConfrontanteResumo[];
  sem_confrontante: ResumoConfrontante;
  total_divisas: number;
  sequencia: TrechoMapa[];
}

export type EstadoConf = 'dispensada' | 'assinada' | 'incompleto' | 'pendente';
export type Filtro = 'todos' | 'pendentes' | 'sem_cpf' | 'assinadas' | 'dispensadas';
export type Ordem = 'az' | 'perimetro';

export const fmtMetros = (m: number) =>
  `${m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

export const pluralizar = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;

/** Prefixa "Lote" só quando o campo ainda não começa por isso ("Lote n° 5-A-13" já vem completo). */
export const rotuloLote = (lote: string | null | undefined): string => {
  const t = (lote ?? '').trim();
  if (!t) return '';
  return /^lote\b/i.test(t) ? t : `Lote ${t}`;
};

export const rotuloMatricula = (mat: string | null | undefined): string => {
  const t = (mat ?? '').trim();
  if (!t) return '';
  return /^mat(r[ií]cula)?\b/i.test(t) ? t : `Mat. ${t}`;
};

export const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const mesmoTexto = (a: string, b: string) =>
  semAcento(a).replace(/\s+/g, ' ').trim() === semAcento(b).replace(/\s+/g, ' ').trim();

export const estadoDe = (c: ConfrontanteResumo): EstadoConf => {
  if (c.dispensada) return 'dispensada';
  if (c.qtd_divisas > 0 && c.assinadas >= c.qtd_divisas) return 'assinada';
  if (!c.cpf_cnpj) return 'incompleto';
  return 'pendente';
};

export const CHIP_ESTADO: Record<EstadoConf, { texto: string; icone: string; cls: string }> = {
  incompleto: { texto: 'Cadastro incompleto', icone: 'alert-circle', cls: 'text-amber-200 bg-amber-500/10 border-amber-500/35' },
  pendente: { texto: 'Pendente de assinatura', icone: 'file-signature', cls: 'text-sky-200 bg-sky-500/10 border-sky-500/35' },
  assinada: { texto: 'Assinada', icone: 'check-circle-2', cls: 'text-emerald-200 bg-emerald-500/10 border-emerald-500/35' },
  dispensada: { texto: 'Dispensada', icone: 'landmark', cls: 'text-slate-200 bg-slate-500/10 border-slate-400/35' },
};

export const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'pendentes', rotulo: 'Pendentes' },
  { id: 'sem_cpf', rotulo: 'Sem CPF' },
  { id: 'assinadas', rotulo: 'Assinadas' },
  { id: 'dispensadas', rotulo: 'Dispensadas' },
];

export const CHAVE_ORDEM = 'gerencigeo_cartorio_conf_ordem';
export const CHAVE_FILTRO = 'gerencigeo_cartorio_conf_filtro';

export const lerPref = (chave: string): string | null => {
  try { return localStorage.getItem(chave); } catch { return null; }
};

export const gravarPref = (chave: string, valor: string) => {
  try { localStorage.setItem(chave, valor); } catch { /* storage indisponível */ }
};

export const CLS_BTN_BASE =
  'inline-flex items-center justify-center gap-1 px-2.5 min-h-[28px] text-[11px] font-bold rounded border transition-all active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-vibrant';
export const CLS_BTN_PRIM = `${CLS_BTN_BASE} border-mint-vibrant/50 bg-mint-vibrant/15 text-mint-vibrant hover:bg-mint-vibrant/25`;
export const CLS_BTN_SEC = `${CLS_BTN_BASE} border-white/15 text-white/80 hover:text-white hover:bg-white/10 hover:border-mint-vibrant/40`;
export const CLS_LINK =
  'text-[11px] text-white/70 hover:text-white underline underline-offset-2 min-h-[28px] inline-flex items-center px-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-vibrant';

export interface ListaConfrontantesDeps {
  ctx: MesaTrabalhoContext;
  signal: AbortSignal;
  camadaConf: CamadaConfrontantes;
  abrirEdicao: (id: number) => void;
  abrirNovo: () => void;
  preVisualizar: (id: number, gatilho: HTMLElement | null) => void;
  gerarAnuencia: (id: number, botao: HTMLElement | null) => void;
  gerarLote: (ids: number[], botao: HTMLElement | null) => void;
  filtrarTabelaPorConfrontante: (nome: string) => void;
  filtrarTabelaSemConfrontante: () => void;
  irParaTabelaVertices: () => void;
  aoCarregar: (resumo: ResumoConfrontantes | null) => void;
}

export interface ListaConfrontantes {
  carregar: (opts?: { silencioso?: boolean }) => Promise<void>;
  getResumo: () => ResumoConfrontantes | null;
  destruir: () => void;
}
