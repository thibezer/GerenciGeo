import type { TrechoMapa } from './camada_confrontantes';
import {
  type ConfrontanteResumo,
  type ResumoConfrontantes,
  type Filtro,
  type Ordem,
  semAcento,
  estadoDe,
  pluralizar
} from './lista_confrontantes_tipos';

export function calcularOrdemPerimetro(
  confrontantes: ConfrontanteResumo[],
  sequencia: TrechoMapa[]
): Map<number, number> {
  const mapa = new Map<number, number>();
  confrontantes.forEach(c => {
    if (typeof c.ordem_perimetro === 'number') mapa.set(c.id, c.ordem_perimetro);
  });
  if (mapa.size < confrontantes.length) {
    mapa.clear();
    let i = 0;
    sequencia.forEach(t => {
      if (t.confrontante_id !== null && !mapa.has(t.confrontante_id)) mapa.set(t.confrontante_id, i++);
    });
  }
  return mapa;
}

export function passaFiltro(c: ConfrontanteResumo, filtro: Filtro): boolean {
  const est = estadoDe(c);
  switch (filtro) {
    case 'pendentes': return est === 'pendente' || est === 'incompleto';
    case 'sem_cpf': return !c.cpf_cnpj && !c.dispensada;
    case 'assinadas': return est === 'assinada';
    case 'dispensadas': return est === 'dispensada';
    default: return true;
  }
}

export function passaBusca(c: ConfrontanteResumo, busca: string): boolean {
  const termo = semAcento(busca.trim());
  if (!termo) return true;
  return semAcento(`${c.nome} ${c.lote || ''} ${c.matricula_imovel || ''}`).includes(termo);
}

export function filtrarEOrdenarConfrontantes(
  confrontantes: ConfrontanteResumo[],
  filtro: Filtro,
  busca: string,
  ordem: Ordem,
  sequencia: TrechoMapa[]
): ConfrontanteResumo[] {
  const itens = confrontantes.filter(c => passaFiltro(c, filtro) && passaBusca(c, busca));
  if (ordem === 'perimetro') {
    const pos = calcularOrdemPerimetro(confrontantes, sequencia);
    itens.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9) || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  } else {
    itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }
  return itens;
}

export function atualizarBarraUI(
  barra: HTMLElement,
  resumo: ResumoConfrontantes | null,
  filtro: Filtro,
  modoSelecao: boolean,
  selecionados: Set<number>,
  estado: string
): void {
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

  const ex = todos.filter(c => !c.dispensada);
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
}

export function atualizarBadgeUI(
  badge: HTMLElement | null,
  resumo: ResumoConfrontantes | null,
  estado: string
): void {
  if (!badge) return;
  const todos = resumo?.confrontantes || [];
  const base = 'bg-white/5 border-white/10 text-white/70';
  const verde = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
  let texto = '—';
  let completa = false;
  if (estado === 'carregando') texto = 'Carregando…';
  else if (estado === 'erro') texto = 'Erro ao carregar';
  else if (resumo && todos.length > 0) {
    const ex = todos.filter(c => !c.dispensada);
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
}

export function atualizarBotaoLoteUI(
  btnLote: HTMLButtonElement | null,
  resumo: ResumoConfrontantes | null,
  modoSelecao: boolean,
  selecionados: Set<number>,
  estado: string,
  rotuloOriginal: string
): void {
  if (!btnLote) return;
  const todos = resumo?.confrontantes || [];
  const ex = todos.filter(c => !c.dispensada);
  const rotulo = btnLote.querySelector('span');
  let texto = rotuloOriginal;
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
}
