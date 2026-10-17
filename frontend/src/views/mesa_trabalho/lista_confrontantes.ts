import { API_BASE } from '../../config';
import { escapeHtml, initIcons, showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import type { CamadaConfrontantes, TrechoMapa } from './camada_confrontantes';
import { confirmar } from './dialogos_cartorio';
import { extrairDetalhe } from './emissao_pecas';

export interface TrechoConfrontante { de: string; para: string; qtd_divisas: number; comprimento_m: number; tipo_limite: string | null }
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

// ── Helpers de texto ────────────────────────────────────────────────────────────────────────────────────

export const fmtMetros = (m: number) => `${m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

export const pluralizar = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

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

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mesmoTexto = (a: string, b: string) => semAcento(a).replace(/\s+/g, ' ').trim() === semAcento(b).replace(/\s+/g, ' ').trim();

type EstadoConf = 'dispensada' | 'assinada' | 'incompleto' | 'pendente';
type Filtro = 'todos' | 'pendentes' | 'sem_cpf' | 'assinadas' | 'dispensadas';
type Ordem = 'az' | 'perimetro';

const estadoDe = (c: ConfrontanteResumo): EstadoConf => {
  if (c.dispensada) return 'dispensada';
  if (c.qtd_divisas > 0 && c.assinadas >= c.qtd_divisas) return 'assinada';
  if (!c.cpf_cnpj) return 'incompleto';
  return 'pendente';
};

const CHIP_ESTADO: Record<EstadoConf, { texto: string; icone: string; cls: string }> = {
  incompleto: { texto: 'Cadastro incompleto', icone: 'alert-circle', cls: 'text-amber-200 bg-amber-500/10 border-amber-500/35' },
  pendente: { texto: 'Pendente de assinatura', icone: 'file-signature', cls: 'text-sky-200 bg-sky-500/10 border-sky-500/35' },
  assinada: { texto: 'Assinada', icone: 'check-circle-2', cls: 'text-emerald-200 bg-emerald-500/10 border-emerald-500/35' },
  dispensada: { texto: 'Dispensada', icone: 'landmark', cls: 'text-slate-200 bg-slate-500/10 border-slate-400/35' },
};

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'pendentes', rotulo: 'Pendentes' },
  { id: 'sem_cpf', rotulo: 'Sem CPF' },
  { id: 'assinadas', rotulo: 'Assinadas' },
  { id: 'dispensadas', rotulo: 'Dispensadas' },
];

const CHAVE_ORDEM = 'gerencigeo_cartorio_conf_ordem';
const CHAVE_FILTRO = 'gerencigeo_cartorio_conf_filtro';
const lerPref = (chave: string): string | null => { try { return localStorage.getItem(chave); } catch { return null; } };
const gravarPref = (chave: string, valor: string) => { try { localStorage.setItem(chave, valor); } catch { /* storage indisponível */ } };

const CLS_BTN_BASE = 'inline-flex items-center justify-center gap-1 px-2.5 min-h-[28px] text-[11px] font-bold rounded border transition-all active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-vibrant';
const CLS_BTN_PRIM = `${CLS_BTN_BASE} border-mint-vibrant/50 bg-mint-vibrant/15 text-mint-vibrant hover:bg-mint-vibrant/25`;
const CLS_BTN_SEC = `${CLS_BTN_BASE} border-white/15 text-white/80 hover:text-white hover:bg-white/10 hover:border-mint-vibrant/40`;
const CLS_LINK = 'text-[11px] text-white/70 hover:text-white underline underline-offset-2 min-h-[28px] inline-flex items-center px-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-vibrant';

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
  /** Chamado após cada carga bem-sucedida (para atualizar a camada do mapa). */
  aoCarregar: (resumo: ResumoConfrontantes | null) => void;
}

export interface ListaConfrontantes {
  carregar: (opts?: { silencioso?: boolean }) => Promise<void>;
  getResumo: () => ResumoConfrontantes | null;
  destruir: () => void;
}

export function criarListaConfrontantes(deps: ListaConfrontantesDeps): ListaConfrontantes | null {
  const { ctx, signal, camadaConf } = deps;
  const lista = document.getElementById('lista-resumo-confrontantes');
  const badge = document.getElementById('badge-resumo-anuencias');
  const btnLote = document.getElementById('btn-anuencia-lote') as HTMLButtonElement | null;
  if (!lista) return null;

  // O rolamento aninhado some: a barra com o contador fica sticky no topo da lista e a página inteira rola
  lista.classList.remove('max-h-[360px]', 'overflow-auto', 'pr-1');
  lista.style.maxHeight = 'none';
  lista.style.overflow = 'visible';
  // Os cartões usam a grade própria do corpo; o contêiner vira bloco
  lista.style.display = 'block';

  const rotuloLoteOriginal = btnLote?.querySelector('span')?.textContent?.trim() || btnLote?.textContent?.trim() || 'Gerar todas as anuências';

  let resumo: ResumoConfrontantes | null = null;
  let resumoLev: number | null = null;
  let resumoMat: number | null = null;
  let estado: 'carregando' | 'erro' | 'vazio' | 'dados' = 'vazio';
  let mensagemErro = '';
  let reqSeq = 0;
  const expandidos = new Set<number>();
  const ocupados = new Set<number>();
  const selecionados = new Set<number>();
  let modoSelecao = false;
  let busca = '';
  let filtro: Filtro = (FILTROS.some(f => f.id === lerPref(CHAVE_FILTRO)) ? lerPref(CHAVE_FILTRO) : 'todos') as Filtro;
  let ordem: Ordem = lerPref(CHAVE_ORDEM) === 'perimetro' ? 'perimetro' : 'az';
  let destacado: number | null = null;
  let timerBusca: ReturnType<typeof setTimeout> | null = null;

  // ── Estrutura fixa: barra (sticky) + corpo ──────────────────────────────────────────────────────────
  lista.innerHTML = `
    <div data-conf-barra class="sticky top-0 z-10 bg-[#0c1510] border-b border-white/5 pb-2 mb-2 space-y-2 hidden">
      <div class="flex items-center gap-2 flex-wrap">
        <div class="relative flex-1 min-w-[160px]">
          <i data-lucide="search" aria-hidden="true" class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/60 pointer-events-none"></i>
          <input type="search" data-conf-busca autocomplete="off" aria-label="Buscar confrontante por nome, lote ou matrícula"
                 placeholder="Buscar nome, lote ou matrícula"
                 class="w-full pl-7 pr-2 min-h-[28px] py-1 text-[12px] bg-white/5 border border-white/15 rounded text-white placeholder-white/50 focus:outline-none focus:border-mint-vibrant" />
        </div>
        <label class="sr-only" for="sel-conf-ordem">Ordem da lista</label>
        <select id="sel-conf-ordem" data-conf-ordem class="min-h-[28px] py-1 px-2 text-[12px] bg-white/5 border border-white/15 rounded text-white focus:outline-none focus:border-mint-vibrant">
          <option value="az" class="bg-[#0c1510]">A–Z</option>
          <option value="perimetro" class="bg-[#0c1510]">Ordem do perímetro</option>
        </select>
        <button type="button" data-acao="alternar-selecao" aria-pressed="false" title="Escolher quais anuências entram no lote" class="${CLS_BTN_SEC}">Selecionar para lote</button>
      </div>
      <div class="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar confrontantes">
        ${FILTROS.map(f => `<button type="button" data-filtro="${f.id}" aria-pressed="false" class="chip-filtro-conf inline-flex items-center gap-1 px-2.5 min-h-[28px] text-[11px] font-semibold rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/10 transition-colors">${f.rotulo} <span data-conf-cont="${f.id}" class="font-mono text-white/60"></span></button>`).join('')}
      </div>
      <div data-conf-selecao class="hidden flex items-center gap-1.5 flex-wrap bg-white/[0.03] border border-white/10 rounded px-2 py-1.5">
        <span data-conf-sel-texto class="text-[11px] text-white/70 mr-1"></span>
        <button type="button" data-acao="sel-todos" class="${CLS_LINK}">Todos</button>
        <button type="button" data-acao="sel-pendentes" class="${CLS_LINK}">Só pendentes</button>
        <button type="button" data-acao="sel-sem-dispensadas" class="${CLS_LINK}">Excluir dispensadas</button>
        <button type="button" data-acao="sel-limpar" class="${CLS_LINK}">Limpar</button>
      </div>
      <div class="flex items-center gap-2" data-conf-progresso-caixa>
        <div class="flex-1 h-1.5 rounded bg-white/10 overflow-hidden" aria-hidden="true"><div data-conf-progresso-barra class="h-full w-0 bg-amber-400 transition-all duration-300"></div></div>
        <span data-conf-progresso-texto class="text-[11px] text-white/70 whitespace-nowrap"></span>
      </div>
    </div>
    <div data-conf-corpo role="list" aria-label="Confrontantes da matrícula" aria-busy="false"
         style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px;align-items:start"></div>`;
  initIcons();

  const barra = lista.querySelector('[data-conf-barra]') as HTMLElement;
  const corpo = lista.querySelector('[data-conf-corpo]') as HTMLElement;
  const inputBusca = lista.querySelector('[data-conf-busca]') as HTMLInputElement;
  const selOrdem = lista.querySelector('[data-conf-ordem]') as HTMLSelectElement;
  selOrdem.value = ordem;

  if (badge) {
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    badge.classList.remove('text-white/50');
    badge.classList.add('text-white/70');
  }

  // ── Dados derivados ─────────────────────────────────────────────────────────────────────────────────
  const ordemPerimetroDe = (): Map<number, number> => {
    const mapa = new Map<number, number>();
    (resumo?.confrontantes || []).forEach(c => {
      if (typeof c.ordem_perimetro === 'number') mapa.set(c.id, c.ordem_perimetro);
    });
    if (mapa.size < (resumo?.confrontantes.length || 0)) {
      // Sem `ordem_perimetro` do backend: usa a primeira aparição na sequência do perímetro
      mapa.clear();
      let i = 0;
      (resumo?.sequencia || []).forEach(t => {
        if (t.confrontante_id !== null && !mapa.has(t.confrontante_id)) mapa.set(t.confrontante_id, i++);
      });
    }
    return mapa;
  };

  const passaFiltro = (c: ConfrontanteResumo): boolean => {
    const est = estadoDe(c);
    switch (filtro) {
      case 'pendentes': return est === 'pendente' || est === 'incompleto';
      case 'sem_cpf': return !c.cpf_cnpj && !c.dispensada;
      case 'assinadas': return est === 'assinada';
      case 'dispensadas': return est === 'dispensada';
      default: return true;
    }
  };

  const passaBusca = (c: ConfrontanteResumo): boolean => {
    const termo = semAcento(busca.trim());
    if (!termo) return true;
    return semAcento(`${c.nome} ${c.lote || ''} ${c.matricula_imovel || ''}`).includes(termo);
  };

  const visiveis = (): ConfrontanteResumo[] => {
    const itens = (resumo?.confrontantes || []).filter(c => passaFiltro(c) && passaBusca(c));
    if (ordem === 'perimetro') {
      const pos = ordemPerimetroDe();
      itens.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9) || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }));
    } else {
      itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }));
    }
    return itens;
  };

  const exigidos = () => (resumo?.confrontantes || []).filter(c => !c.dispensada);

  // ── Renderização ────────────────────────────────────────────────────────────────────────────────────
  const htmlCard = (c: ConfrontanteResumo): string => {
    const est = estadoDe(c);
    const chip = CHIP_ESTADO[est];
    const aberto = expandidos.has(c.id);
    const nome = escapeHtml(c.nome);
    const parcial = !c.dispensada && c.assinadas > 0 && c.assinadas < c.qtd_divisas;
    const completo = est === 'assinada';
    const ocupado = ocupados.has(c.id);

    const lote = rotuloLote(c.lote);
    const loteTxt = lote && !mesmoTexto(lote, c.nome) ? escapeHtml(lote) : '';
    const matTxt = c.matricula_imovel && !mesmoTexto(c.matricula_imovel, c.nome) ? escapeHtml(rotuloMatricula(c.matricula_imovel)) : '';
    const partesSub = [
      loteTxt,
      matTxt,
      pluralizar(c.qtd_divisas, 'divisa', 'divisas'),
      fmtMetros(c.comprimento_m),
      est === 'incompleto'
        ? `<button type="button" class="link-conf-completar ${CLS_LINK} !px-0 text-amber-300 hover:text-amber-200" data-id="${c.id}" aria-label="Completar cadastro de ${nome}: falta CPF/CNPJ" title="Completar qualificação (sem CPF/CNPJ)">sem CPF/CNPJ</button>`
        : '',
    ].filter(Boolean);

    const checkLote = modoSelecao
      ? `<label class="mt-0.5 inline-flex items-center justify-center w-7 h-7 shrink-0 cursor-pointer" title="Incluir no lote">
           <input type="checkbox" class="chk-conf-lote accent-emerald-400 w-4 h-4" data-id="${c.id}" aria-label="Incluir ${nome} no lote" ${selecionados.has(c.id) ? 'checked' : ''} />
         </label>`
      : '';

    const blocoAssinatura = c.dispensada
      ? `<span class="text-[11px] text-slate-300" title="${c.dispensa_inferida ? 'Dispensada automaticamente pelo nome (via ou curso de água público). Clique em Exigir se este confrontante for particular.' : 'Anuência dispensada (ente público).'}">${c.dispensa_inferida ? 'Ente público (pelo nome)' : 'Ente público'}</span>
         <button type="button" class="btn-conf-exigir ${CLS_LINK}" data-id="${c.id}" ${ocupado ? 'disabled' : ''} aria-label="Voltar a exigir a anuência de ${nome}" title="Voltar a exigir a anuência deste confrontante">Exigir</button>`
      : `<label class="inline-flex items-center gap-1.5 min-h-[28px] text-[11px] ${completo ? 'text-emerald-300' : 'text-white/70'} cursor-pointer select-none" title="Anuência assinada (todas as divisas deste confrontante)">
           <input type="checkbox" class="chk-conf-assinada accent-emerald-400 w-4 h-4" data-id="${c.id}" ${parcial ? 'data-parcial="1"' : ''} ${completo ? 'checked' : ''} ${ocupado ? 'disabled' : ''}
                  aria-label="Anuência assinada de ${nome}${parcial ? ` (${c.assinadas} de ${c.qtd_divisas} divisas)` : ''}" />
           <span>${parcial ? `${c.assinadas}/${c.qtd_divisas} divisas` : 'Assinada'}</span>
         </label>
         <button type="button" class="btn-conf-dispensar ${CLS_LINK}" data-id="${c.id}" ${ocupado ? 'disabled' : ''} aria-label="Dispensar a anuência de ${nome}" title="Ente público (estrada, rio, ferrovia): dispensa a anuência e tira da contagem">Dispensar</button>`;

    const btnEditar = (primario: boolean) => primario
      ? `<button type="button" class="btn-conf-editar ${CLS_BTN_PRIM}" data-id="${c.id}" aria-label="Completar cadastro de ${nome}" title="Completar a qualificação (CPF/CNPJ, RG, cônjuge, matrícula...)"><i data-lucide="edit-3" class="w-3 h-3"></i>Completar cadastro</button>`
      : `<button type="button" class="btn-conf-editar ${CLS_BTN_SEC}" data-id="${c.id}" aria-label="Editar ${nome}" title="Editar qualificação completa do confrontante (CPF, RG, cônjuge, matrícula...)"><i data-lucide="edit-3" class="w-3 h-3 text-mint-vibrant"></i>Editar</button>`;
    const btnTrecho = `<button type="button" class="btn-conf-ver ${CLS_BTN_SEC}" data-id="${c.id}" aria-label="Pré-visualizar divisa de ${nome}" title="Pré-visualizar divisa"><i data-lucide="eye" class="w-3 h-3"></i>Divisa</button>`;
    const btnGerar = (primario: boolean) => `<button type="button" class="btn-conf-gerar ${primario ? CLS_BTN_PRIM : CLS_BTN_SEC}" data-id="${c.id}" aria-label="Gerar anuência de ${nome}" title="${est === 'incompleto' ? 'Gerar anuência (cadastro incompleto)' : 'Gerar anuência'}"><i data-lucide="file-down" class="w-3 h-3"></i>${primario ? 'Gerar anuência' : 'Gerar'}</button>`;

    let acoes: string;
    if (est === 'incompleto') acoes = `${btnEditar(true)}${btnTrecho}${btnGerar(false)}`;
    else if (est === 'pendente') acoes = `${btnGerar(true)}${btnEditar(false)}${btnTrecho}`;
    else if (est === 'assinada') acoes = `${btnEditar(false)}${btnTrecho}${btnGerar(false)}`;
    else acoes = `${btnEditar(false)}${btnTrecho}`;

    const trechos = c.trechos.map(t => `
      <div class="flex items-center justify-between gap-2 text-[11px] font-mono text-white/70 pt-1">
        <span class="truncate">${escapeHtml(t.de)} ➔ ${escapeHtml(t.para)}</span>
        <span class="shrink-0 text-white/60">${pluralizar(t.qtd_divisas, 'divisa', 'divisas')} · ${fmtMetros(t.comprimento_m)}${t.tipo_limite ? ` · ${escapeHtml(t.tipo_limite)}` : ''}</span>
      </div>`).join('');

    return `
      <div role="listitem" class="bg-white/[0.025] border border-white/[0.09] rounded-lg" data-conf-id="${c.id}">
        <div class="px-2.5 pt-2 pb-2 space-y-1.5">
          <div class="flex items-start gap-1.5">
            ${checkLote}
            <button type="button" class="btn-conf-expandir inline-flex items-center justify-center w-7 h-7 shrink-0 rounded text-white/70 hover:text-white hover:bg-white/10"
                    data-id="${c.id}" aria-expanded="${aberto}" aria-controls="conf-trechos-${c.id}"
                    aria-label="${aberto ? 'Ocultar' : 'Mostrar'} trechos de ${nome}" title="${aberto ? 'Ocultar trechos' : 'Mostrar trechos'}">
              <i data-lucide="${aberto ? 'chevron-down' : 'chevron-right'}" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" class="btn-conf-focar group min-w-0 flex-1 text-left rounded px-1 py-1 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-vibrant"
                    data-id="${c.id}" aria-pressed="${destacado === c.id}" aria-label="Enquadrar ${nome} no mapa" title="Enquadrar no mapa">
              <span class="flex items-start gap-1.5 text-[13px] font-semibold leading-snug">
                <i data-lucide="map-pin" class="w-3.5 h-3.5 mt-0.5 shrink-0 text-mint-vibrant/80 group-hover:text-mint-vibrant"></i>
                <span class="break-words underline-offset-2 group-hover:underline">${nome}</span>
              </span>
            </button>
          </div>
          <div class="pl-9 text-[11px] text-white/60 leading-snug flex flex-wrap items-center gap-x-1.5">${partesSub.map((p, i) => (i > 0 ? `<span aria-hidden="true">·</span>` : '') + `<span>${p}</span>`).join('')}</div>
          <div class="pl-9 flex items-center gap-2 flex-wrap">
            <span class="inline-flex items-center gap-1 px-2 min-h-[22px] text-[11px] font-semibold rounded-full border ${chip.cls}"><i data-lucide="${chip.icone}" class="w-3 h-3"></i>${chip.texto}</span>
            ${blocoAssinatura}
          </div>
          <div class="pl-9 flex items-center gap-1.5 flex-wrap">${acoes}</div>
        </div>
        <div id="conf-trechos-${c.id}" class="px-3 pb-2.5 pt-0.5 space-y-1 border-t border-white/5" ${aberto ? '' : 'hidden'}>
          ${aberto ? `${trechos}<button type="button" class="btn-conf-filtrar ${CLS_LINK} text-mint-vibrant/90 hover:text-mint-vibrant" data-id="${c.id}">Filtrar a tabela por este confrontante</button>` : ''}
        </div>
      </div>`;
  };

  const htmlSemConfrontante = (): string => {
    const sem = resumo?.sem_confrontante;
    if (!sem || sem.qtd_divisas <= 0) return '';
    return `
      <div class="col-span-all flex items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2" style="grid-column:1/-1" role="listitem">
        <div class="text-[11px] text-amber-200"><strong>${pluralizar(sem.qtd_divisas, 'divisa', 'divisas')}</strong> sem confrontante · ${fmtMetros(sem.comprimento_m)}</div>
        <button type="button" class="btn-conf-filtrar-sem ${CLS_LINK} text-amber-300 hover:text-amber-100 font-bold">Ver na tabela</button>
      </div>`;
  };

  const caixaEstado = (conteudo: string) => `<div class="text-center py-5 px-2 space-y-3" style="grid-column:1/-1">${conteudo}</div>`;

  const atualizarBarra = () => {
    const todos = resumo?.confrontantes || [];
    const mostrarBarra = estado === 'dados' && todos.length > 0;
    barra.classList.toggle('hidden', !mostrarBarra);
    if (!mostrarBarra) return;

    const contar: Record<Filtro, number> = {
      todos: todos.length,
      pendentes: todos.filter(c => ['pendente', 'incompleto'].includes(estadoDe(c))).length,
      sem_cpf: todos.filter(c => !c.cpf_cnpj && !c.dispensada).length,
      assinadas: todos.filter(c => estadoDe(c) === 'assinada').length,
      dispensadas: todos.filter(c => c.dispensada).length,
    };
    barra.querySelectorAll<HTMLElement>('[data-filtro]').forEach(chip => {
      const id = chip.dataset.filtro as Filtro;
      const ativo = id === filtro;
      chip.setAttribute('aria-pressed', String(ativo));
      chip.classList.toggle('bg-mint-vibrant/15', ativo);
      chip.classList.toggle('border-mint-vibrant/50', ativo);
      chip.classList.toggle('text-mint-vibrant', ativo);
      const cont = chip.querySelector<HTMLElement>(`[data-conf-cont="${id}"]`);
      if (cont) cont.textContent = String(contar[id]);
    });

    const ex = exigidos();
    const assinados = ex.filter(c => estadoDe(c) === 'assinada').length;
    const pct = ex.length ? Math.round((assinados / ex.length) * 100) : 0;
    const barraProg = barra.querySelector<HTMLElement>('[data-conf-progresso-barra]');
    const txtProg = barra.querySelector<HTMLElement>('[data-conf-progresso-texto]');
    const completa = ex.length > 0 && assinados === ex.length;
    if (barraProg) {
      barraProg.style.width = `${pct}%`;
      barraProg.classList.toggle('bg-emerald-400', completa);
      barraProg.classList.toggle('bg-amber-400', !completa);
    }
    if (txtProg) txtProg.textContent = ex.length ? `${assinados}/${ex.length} assinadas` : 'Nenhuma anuência exigida';

    const boxSel = barra.querySelector<HTMLElement>('[data-conf-selecao]');
    boxSel?.classList.toggle('hidden', !modoSelecao);
    const txtSel = barra.querySelector<HTMLElement>('[data-conf-sel-texto]');
    if (txtSel) txtSel.textContent = `${selecionados.size} de ${todos.length} no lote`;
    const btnSel = barra.querySelector<HTMLElement>('[data-acao="alternar-selecao"]');
    if (btnSel) {
      btnSel.setAttribute('aria-pressed', String(modoSelecao));
      btnSel.textContent = modoSelecao ? 'Sair da seleção' : 'Selecionar para lote';
    }
  };

  const atualizarBadge = () => {
    if (!badge) return;
    const todos = resumo?.confrontantes || [];
    const base = 'bg-white/5 border-white/10 text-white/70';
    const verde = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
    let texto = '—';
    let completa = false;
    if (estado === 'carregando') texto = 'Carregando…';
    else if (estado === 'erro') texto = 'Erro ao carregar';
    else if (resumo && todos.length > 0) {
      const ex = exigidos();
      const assinados = ex.filter(c => estadoDe(c) === 'assinada').length;
      const disp = todos.length - ex.length;
      completa = ex.length > 0 && assinados === ex.length;
      texto = ex.length
        ? `${assinados}/${ex.length} ${ex.length === 1 ? 'anuência assinada' : 'anuências assinadas'}`
        : 'Nenhuma anuência exigida';
      if (disp) texto += ` · ${pluralizar(disp, 'dispensada', 'dispensadas')}`;
    }
    badge.innerText = texto;
    verde.split(' ').forEach(c => badge.classList.toggle(c, completa));
    base.split(' ').forEach(c => badge.classList.toggle(c, !completa));
    badge.setAttribute('title', completa ? 'Todas as anuências exigidas foram assinadas' : '');
  };

  const atualizarBotaoLote = () => {
    if (!btnLote) return;
    const ex = exigidos();
    const rotulo = btnLote.querySelector('span');
    let texto = rotuloLoteOriginal;
    let desabilitado = estado !== 'dados' || ex.length === 0;
    let titulo = 'Gera as anuências dos confrontantes exigidos em um único documento';
    if (estado === 'dados' && modoSelecao) {
      texto = `Gerar anuências selecionadas (${selecionados.size})`;
      desabilitado = selecionados.size === 0;
      titulo = selecionados.size === 0 ? 'Marque ao menos um confrontante para gerar o lote' : 'Gera apenas as anuências marcadas';
    } else if (estado === 'dados' && ex.length === 0) {
      titulo = 'Não há confrontante com anuência exigida nesta matrícula';
    } else if (estado !== 'dados') {
      titulo = 'Aguardando a lista de confrontantes';
    }
    if (rotulo) rotulo.textContent = texto;
    btnLote.disabled = desabilitado;
    btnLote.setAttribute('aria-disabled', String(desabilitado));
    btnLote.classList.toggle('opacity-50', desabilitado);
    btnLote.classList.toggle('cursor-not-allowed', desabilitado);
    btnLote.title = titulo;
  };

  const renderizarCorpo = () => {
    // Guarda o foco para restaurá-lo depois de reescrever o HTML (teclado não pode perder o lugar)
    const ativo = document.activeElement as HTMLElement | null;
    let chaveFoco: { id: string; classe: string } | null = null;
    if (ativo && corpo.contains(ativo)) {
      const card = ativo.closest<HTMLElement>('[data-conf-id]');
      const classe = Array.from(ativo.classList).find(c => /^(btn-conf-|chk-conf-|link-conf-)/.test(c));
      if (card?.dataset.confId && classe) chaveFoco = { id: card.dataset.confId, classe };
    }

    corpo.setAttribute('aria-busy', String(estado === 'carregando'));
    if (estado === 'carregando') {
      corpo.innerHTML = [1, 2, 3].map(() => `
        <div class="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 space-y-2 animate-pulse" aria-hidden="true">
          <div class="h-3 w-2/3 rounded bg-white/10"></div><div class="h-2.5 w-1/2 rounded bg-white/5"></div><div class="h-6 w-1/3 rounded bg-white/5"></div>
        </div>`).join('') + `<span class="sr-only" role="status">Carregando confrontantes…</span>`;
    } else if (estado === 'erro') {
      corpo.innerHTML = caixaEstado(`
        <p class="text-[12px] text-rose-300" role="alert">${escapeHtml(mensagemErro || 'Não foi possível carregar os confrontantes. Tente novamente.')}</p>
        <button type="button" data-acao="recarregar" class="${CLS_BTN_PRIM}"><i data-lucide="refresh-cw" class="w-3 h-3"></i>Tentar novamente</button>`);
    } else if (!resumo || (resumo.confrontantes.length === 0 && resumo.sem_confrontante.qtd_divisas === 0)) {
      const semMat = !ctx.currentMatriculaId;
      corpo.innerHTML = caixaEstado(semMat
        ? `<p class="text-[12px] text-white/60 italic">Selecione uma matrícula para ver os confrontantes.</p>`
        : `<p class="text-[12px] text-white/60 italic">Nenhum confrontante vinculado às divisas desta matrícula.</p>
           <div class="flex items-center justify-center gap-2 flex-wrap">
             <button type="button" data-acao="cadastrar" class="${CLS_BTN_PRIM}"><i data-lucide="user-plus" class="w-3 h-3"></i>Cadastrar confrontante</button>
             <button type="button" data-acao="atribuir" class="${CLS_BTN_SEC}">Atribuir na tabela de vértices</button>
           </div>`);
    } else {
      const itens = visiveis();
      const alerta = htmlSemConfrontante();
      if (itens.length === 0) {
        corpo.innerHTML = alerta + (resumo.confrontantes.length === 0
          ? caixaEstado(`<p class="text-[12px] text-white/60 italic">Nenhum confrontante cadastrado ainda para estas divisas.</p>
              <button type="button" data-acao="cadastrar" class="${CLS_BTN_PRIM}"><i data-lucide="user-plus" class="w-3 h-3"></i>Cadastrar confrontante</button>`)
          : caixaEstado(`<p class="text-[12px] text-white/60 italic">Nenhum confrontante corresponde ao filtro.</p>
              <button type="button" data-acao="limpar-filtros" class="${CLS_BTN_SEC}">Limpar busca e filtros</button>`));
      } else {
        corpo.innerHTML = alerta + itens.map(htmlCard).join('');
      }
    }

    initIcons();
    corpo.querySelectorAll<HTMLInputElement>('input[data-parcial="1"]').forEach(i => { i.indeterminate = true; });
    atualizarBarra();
    atualizarBadge();
    atualizarBotaoLote();

    if (chaveFoco) {
      const alvo = corpo.querySelector<HTMLElement>(`[data-conf-id="${chaveFoco.id}"] .${chaveFoco.classe}`);
      if (alvo && !(alvo as HTMLButtonElement).disabled) alvo.focus();
    }
  };

  // ── Carga ───────────────────────────────────────────────────────────────────────────────────────────
  async function carregar(opts?: { silencioso?: boolean }) {
    const lev = ctx.currentLevId;
    const mat = ctx.currentMatriculaId;
    const meuSeq = ++reqSeq;

    if (!lev || !mat) {
      resumo = null; resumoLev = null; resumoMat = null;
      estado = 'vazio';
      renderizarCorpo();
      deps.aoCarregar(null);
      return;
    }

    const mesmoContexto = !!resumo && resumoLev === lev && resumoMat === mat;
    const silencioso = !!opts?.silencioso || mesmoContexto;
    if (!silencioso) {
      estado = 'carregando';
      renderizarCorpo();
    }

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${lev}/matriculas/${mat}/resumo-confrontantes`, { signal });
      if (meuSeq !== reqSeq || lev !== ctx.currentLevId || mat !== ctx.currentMatriculaId) return;   // resposta obsoleta
      if (!res.ok) throw new Error(await extrairDetalhe(res, 'Não foi possível carregar os confrontantes.'));
      resumo = await res.json();
      if (meuSeq !== reqSeq) return;
      resumoLev = lev; resumoMat = mat;
      estado = 'dados';
      if (destacado !== null && !resumo!.confrontantes.some(c => c.id === destacado)) destacado = null;
      const idsValidos = new Set(resumo!.confrontantes.map(c => c.id));
      [...selecionados].forEach(id => { if (!idsValidos.has(id)) selecionados.delete(id); });
    } catch (err: any) {
      if (err?.name === 'AbortError' || meuSeq !== reqSeq) return;
      console.error('Erro ao carregar resumo de confrontantes:', err);
      if (resumo && silencioso) {
        // Mantém a lista anterior em vez de apagá-la
        showToast('Não foi possível atualizar a lista de confrontantes; exibindo os dados anteriores.', 'error');
        return;
      }
      resumo = null;
      estado = 'erro';
      mensagemErro = err?.message || 'Não foi possível carregar os confrontantes. Tente novamente.';
    }
    renderizarCorpo();
    deps.aoCarregar(resumo);
  }

  // ── Ações ───────────────────────────────────────────────────────────────────────────────────────────
  const definirDispensa = async (id: number, dispensada: boolean) => {
    if (ocupados.has(id)) return;
    const lev = ctx.currentLevId;
    ocupados.add(id);
    renderizarCorpo();
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${lev}/confrontantes/${id}/dispensa-anuencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispensada }),
        signal,
      });
      if (!res.ok) throw new Error(await extrairDetalhe(res, 'Não foi possível alterar a dispensa da anuência.'));
      showToast(dispensada ? 'Anuência dispensada.' : 'Anuência voltou a ser exigida.', 'success', 2000);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      showToast(escapeHtml(err?.message || 'Não foi possível alterar a dispensa da anuência.'), 'error');
    } finally {
      ocupados.delete(id);
    }
    await carregar({ silencioso: true });
    renderizarCorpo();
  };

  const alterarAssinada = async (el: HTMLInputElement) => {
    const id = Number(el.dataset.id);
    const marcar = el.checked;
    if (ocupados.has(id)) { el.checked = !marcar; return; }
    const conf = resumo?.confrontantes.find(c => c.id === id);
    if (!conf) return;

    if (!marcar && conf.assinadas > 0) {
      const ok = await confirmar(
        'Desmarcar anuência assinada?',
        `A anuência de <strong>${escapeHtml(conf.nome)}</strong> deixará de constar como assinada. Você poderá marcá-la novamente depois.`,
        'Desmarcar'
      );
      if (!ok) { el.checked = true; return; }
    }

    const lev = ctx.currentLevId;
    const mat = ctx.currentMatriculaId;
    ocupados.add(id);
    el.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${lev}/matriculas/${mat}/confrontantes/${id}/anuencia-assinada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assinada: marcar }),
        signal,
      });
      if (!res.ok) throw new Error(await extrairDetalhe(res, 'Não foi possível salvar o status da anuência.'));
      conf.assinadas = marcar ? conf.qtd_divisas : 0;
      showToast(marcar ? `Anuência de ${escapeHtml(conf.nome)} marcada como assinada.` : `Anuência de ${escapeHtml(conf.nome)} desmarcada.`, 'success', 2000);
    } catch (err: any) {
      ocupados.delete(id);
      if (err?.name === 'AbortError') return;
      el.checked = !marcar;
      el.disabled = false;
      showToast(escapeHtml(err?.message || 'Não foi possível salvar o status da anuência.'), 'error');
      renderizarCorpo();
      return;
    }
    ocupados.delete(id);
    renderizarCorpo();
    await carregar({ silencioso: true });
  };

  const enquadrarNoMapa = (id: number) => {
    camadaConf.focar(id);
    const camada = camadaConf as unknown as { destacar?: (id: number | null) => void };
    if (typeof camada.destacar === 'function') {
      destacado = destacado === id ? null : id;
      camada.destacar(destacado);
      corpo.querySelectorAll<HTMLElement>('.btn-conf-focar').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.id) === destacado)));
    }
  };

  const selecionar = (ids: number[]) => {
    selecionados.clear();
    ids.forEach(id => selecionados.add(id));
    renderizarCorpo();
  };

  const alternarSelecao = () => {
    modoSelecao = !modoSelecao;
    if (modoSelecao) {
      selecionados.clear();
      exigidos().forEach(c => selecionados.add(c.id));
    }
    renderizarCorpo();
  };

  const limparFiltros = () => {
    busca = ''; inputBusca.value = '';
    filtro = 'todos';
    gravarPref(CHAVE_FILTRO, filtro);
    renderizarCorpo();
  };

  // ── Eventos (delegados; vinculados uma única vez) ───────────────────────────────────────────────────
  lista.addEventListener('click', (e) => {
    const alvo = e.target as HTMLElement;

    const chip = alvo.closest<HTMLElement>('[data-filtro]');
    if (chip) {
      filtro = chip.dataset.filtro as Filtro;
      gravarPref(CHAVE_FILTRO, filtro);
      renderizarCorpo();
      return;
    }

    const btn = alvo.closest<HTMLButtonElement>('button');
    if (!btn || btn.disabled) return;
    const acao = btn.dataset.acao;
    if (acao) {
      switch (acao) {
        case 'alternar-selecao': alternarSelecao(); break;
        case 'sel-todos': selecionar((resumo?.confrontantes || []).map(c => c.id)); break;
        case 'sel-pendentes': selecionar((resumo?.confrontantes || []).filter(c => ['pendente', 'incompleto'].includes(estadoDe(c))).map(c => c.id)); break;
        case 'sel-sem-dispensadas': selecionar(exigidos().filter(c => selecionados.has(c.id)).map(c => c.id)); break;
        case 'sel-limpar': selecionar([]); break;
        case 'recarregar': void carregar(); break;
        case 'cadastrar': deps.abrirNovo(); break;
        case 'atribuir': deps.irParaTabelaVertices(); break;
        case 'limpar-filtros': limparFiltros(); break;
      }
      return;
    }

    const id = Number(btn.dataset.id);
    if (btn.classList.contains('btn-conf-expandir')) {
      if (expandidos.has(id)) expandidos.delete(id); else expandidos.add(id);
      renderizarCorpo();
    } else if (btn.classList.contains('btn-conf-focar')) {
      enquadrarNoMapa(id);
    } else if (btn.classList.contains('btn-conf-editar') || btn.classList.contains('link-conf-completar')) {
      deps.abrirEdicao(id);
    } else if (btn.classList.contains('btn-conf-ver')) {
      deps.preVisualizar(id, btn);
    } else if (btn.classList.contains('btn-conf-gerar')) {
      deps.gerarAnuencia(id, btn);
    } else if (btn.classList.contains('btn-conf-dispensar') || btn.classList.contains('btn-conf-exigir')) {
      void definirDispensa(id, btn.classList.contains('btn-conf-dispensar'));
    } else if (btn.classList.contains('btn-conf-filtrar')) {
      const conf = resumo?.confrontantes.find(c => c.id === id);
      if (conf) deps.filtrarTabelaPorConfrontante(conf.nome);
    } else if (btn.classList.contains('btn-conf-filtrar-sem')) {
      deps.filtrarTabelaSemConfrontante();
    }
  }, { signal });

  lista.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.classList.contains('chk-conf-assinada')) {
      void alterarAssinada(el);
    } else if (el.classList.contains('chk-conf-lote')) {
      const id = Number(el.dataset.id);
      if (el.checked) selecionados.add(id); else selecionados.delete(id);
      atualizarBarra();
      atualizarBotaoLote();
    } else if ((e.target as EventTarget) === selOrdem) {
      ordem = selOrdem.value === 'perimetro' ? 'perimetro' : 'az';
      gravarPref(CHAVE_ORDEM, ordem);
      renderizarCorpo();
    }
  }, { signal });

  lista.addEventListener('input', (e) => {
    if (e.target !== inputBusca) return;
    if (timerBusca) clearTimeout(timerBusca);
    timerBusca = setTimeout(() => { busca = inputBusca.value; renderizarCorpo(); }, 150);
  }, { signal });

  btnLote?.addEventListener('click', () => {
    if (btnLote.disabled) return;
    const ids = modoSelecao ? [...selecionados] : exigidos().map(c => c.id);
    if (ids.length === 0) {
      showToast('Não há confrontante com anuência exigida para gerar.', 'info');
      return;
    }
    deps.gerarLote(ids, btnLote);
  }, { signal });

  renderizarCorpo();

  return {
    carregar,
    getResumo: () => resumo,
    destruir: () => {
      if (timerBusca) clearTimeout(timerBusca);
      reqSeq++;
    },
  };
}
