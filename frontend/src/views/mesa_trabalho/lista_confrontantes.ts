import { escapeHtml, initIcons, showToast } from '../../utils';
import { confirmar } from './dialogos_cartorio';
import {
  type ResumoConfrontantes,
  type Filtro,
  type Ordem,
  type ListaConfrontantesDeps,
  type ListaConfrontantes,
  FILTROS,
  CHAVE_ORDEM,
  CHAVE_FILTRO,
  lerPref,
  gravarPref,
  estadoDe,
  CLS_BTN_SEC,
  CLS_LINK,
  CLS_BTN_PRIM
} from './lista_confrontantes_tipos';
import {
  htmlCard,
  htmlSemConfrontante,
  caixaEstado
} from './lista_confrontantes_cards';
import {
  filtrarEOrdenarConfrontantes,
  atualizarBarraUI,
  atualizarBadgeUI,
  atualizarBotaoLoteUI
} from './lista_confrontantes_filtros';
import {
  buscarResumoConfrontantes,
  despacharDispensaAnuencia,
  despacharAssinaturaAnuencia
} from './lista_confrontantes_servico';

export * from './lista_confrontantes_tipos';
export * from './lista_confrontantes_cards';
export * from './lista_confrontantes_filtros';
export * from './lista_confrontantes_servico';

export function criarListaConfrontantes(deps: ListaConfrontantesDeps): ListaConfrontantes | null {
  const { ctx, signal, camadaConf } = deps;
  const lista = document.getElementById('lista-resumo-confrontantes');
  const badge = document.getElementById('badge-resumo-anuencias');
  const btnLote = document.getElementById('btn-anuencia-lote') as HTMLButtonElement | null;
  if (!lista) return null;

  lista.classList.remove('max-h-[360px]', 'overflow-auto', 'pr-1');
  lista.style.maxHeight = 'none';
  lista.style.overflow = 'visible';
  lista.style.display = 'block';

  const rotuloLoteOriginal =
    btnLote?.querySelector('span')?.textContent?.trim() || btnLote?.textContent?.trim() || 'Gerar todas as anuências';

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

  const visiveis = () =>
    filtrarEOrdenarConfrontantes(resumo?.confrontantes || [], filtro, busca, ordem, resumo?.sequencia || []);

  const exigidos = () => (resumo?.confrontantes || []).filter(c => !c.dispensada);

  const sincronizarIndicadores = () => {
    atualizarBarraUI(barra, resumo, filtro, modoSelecao, selecionados, estado);
    atualizarBadgeUI(badge, resumo, estado);
    atualizarBotaoLoteUI(btnLote, resumo, modoSelecao, selecionados, estado, rotuloLoteOriginal);
  };

  const renderizarCorpo = () => {
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
      const alerta = htmlSemConfrontante(resumo.sem_confrontante);
      if (itens.length === 0) {
        corpo.innerHTML = alerta + (resumo.confrontantes.length === 0
          ? caixaEstado(`<p class="text-[12px] text-white/60 italic">Nenhum confrontante cadastrado ainda para estas divisas.</p>
              <button type="button" data-acao="cadastrar" class="${CLS_BTN_PRIM}"><i data-lucide="user-plus" class="w-3 h-3"></i>Cadastrar confrontante</button>`)
          : caixaEstado(`<p class="text-[12px] text-white/60 italic">Nenhum confrontante corresponde ao filtro.</p>
              <button type="button" data-acao="limpar-filtros" class="${CLS_BTN_SEC}">Limpar busca e filtros</button>`));
      } else {
        corpo.innerHTML = alerta + itens.map(c => htmlCard(c, expandidos, ocupados, modoSelecao, selecionados, destacado)).join('');
      }
    }

    initIcons();
    corpo.querySelectorAll<HTMLInputElement>('input[data-parcial="1"]').forEach(i => { i.indeterminate = true; });
    sincronizarIndicadores();

    if (chaveFoco) {
      const alvo = corpo.querySelector<HTMLElement>(`[data-conf-id="${chaveFoco.id}"] .${chaveFoco.classe}`);
      if (alvo && !(alvo as HTMLButtonElement).disabled) alvo.focus();
    }
  };

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
      const dados = await buscarResumoConfrontantes(lev, mat, signal);
      if (meuSeq !== reqSeq || lev !== ctx.currentLevId || mat !== ctx.currentMatriculaId) return;
      resumo = dados;
      resumoLev = lev; resumoMat = mat;
      estado = 'dados';
      if (destacado !== null && !resumo.confrontantes.some(c => c.id === destacado)) destacado = null;
      const idsValidos = new Set(resumo.confrontantes.map(c => c.id));
      [...selecionados].forEach(id => { if (!idsValidos.has(id)) selecionados.delete(id); });
    } catch (err: any) {
      if (err?.name === 'AbortError' || meuSeq !== reqSeq) return;
      console.error('Erro ao carregar resumo de confrontantes:', err);
      if (resumo && silencioso) {
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

  const definirDispensa = async (id: number, dispensada: boolean) => {
    if (ocupados.has(id)) return;
    const lev = ctx.currentLevId;
    if (!lev) return;
    ocupados.add(id);
    renderizarCorpo();
    try {
      await despacharDispensaAnuencia(lev, id, dispensada, signal);
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
    if (!lev || !mat) return;
    ocupados.add(id);
    el.disabled = true;
    try {
      await despacharAssinaturaAnuencia(lev, mat, id, conf.nome, marcar, signal);
      conf.assinadas = marcar ? conf.qtd_divisas : 0;
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
      sincronizarIndicadores();
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
