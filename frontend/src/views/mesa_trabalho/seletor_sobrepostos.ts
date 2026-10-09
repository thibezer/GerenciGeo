import { escapeHtml } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

/**
 * Seleção de vértices empilhados no mapa.
 *
 * Marcadores a poucos pixels um do outro ficam um sobre o outro e o clique sempre cai no de cima
 * (e o selecionado ainda sobe para o topo). Quando o clique atinge uma pilha:
 *  - cliques repetidos no mesmo lugar alternam entre os vértices da pilha;
 *  - uma lista flutuante mostra todos eles para escolher direto.
 */

// Distância em tela (px) entre centros de marcadores para considerá-los empilhados.
const RAIO_PILHA_PX = 6;
const ID_LISTA = 'seletor-sobrepostos-mapa';

let cliquePendente: ReturnType<typeof setTimeout> | null = null;
let fecharListaAtual: (() => void) | null = null;

/**
 * Um clique num marcador chega aqui mais de uma vez (callback do plotPontos e evento
 * 'ui-ponto-selecionado') e o ui-canvas-cad ainda remarca o marcador clicado como selecionado
 * depois dos callbacks. As chamadas são agrupadas e a seleção é aplicada no próximo tick.
 * A seleção anterior é lida já na primeira chamada: o evento global 'gerencigeo:ponto-selecionado'
 * troca ctx.selectedPontoIds pelo marcador clicado antes do tick, e o 1º clique pareceria um 2º.
 */
export function selecionarVerticeClicado(ctx: MesaTrabalhoContext, pontoId: number | string): void {
  if (cliquePendente) return;
  const selecaoAnterior = ctx.selectedPontoIds?.length === 1 ? String(ctx.selectedPontoIds[0]) : null;
  cliquePendente = setTimeout(() => {
    cliquePendente = null;
    processarClique(ctx, pontoId, selecaoAnterior);
  }, 0);
}

function processarClique(ctx: MesaTrabalhoContext, pontoId: number | string, selecaoAnterior: string | null): void {
  const pilha = obterPilha(ctx, pontoId);
  if (pilha.length < 2) {
    fecharLista();
    ctx.selectPontoFromTabela(Number(pontoId));
    return;
  }

  const ids = pilha.map(m => m.id);
  const idxAtual = selecaoAnterior != null ? ids.findIndex(id => String(id) === selecaoAnterior) : -1;
  const escolhido = idxAtual >= 0 ? ids[(idxAtual + 1) % ids.length] : Number(pontoId);

  ctx.triagemMap?.closePopup?.();
  aplicarSelecao(ctx, escolhido);
  abrirLista(ctx, pilha, escolhido);
}

// Raio (px) em volta do vértice selecionado em que um clique conta como "clicar nele de novo".
const RAIO_CLIQUE_SELECIONADO_PX = 10;

/**
 * Clicar de novo no vértice já selecionado não chega ao marcador: no mousedown o ui-canvas-cad
 * inicia a seleção por caixa (desliga o pointer-events dos panes) e, no mouseup, limpa a seleção
 * e redesenha o marcador, então o 'click' nem é disparado. Quando esse vértice faz parte de uma
 * pilha, o clique é interceptado na captura (antes do canvas) e vira "próximo da pilha".
 * Vértices fora de pilha mantêm o comportamento do canvas.
 */
export function instalarAlternanciaPilha(ctx: MesaTrabalhoContext, canvasEl: HTMLElement): void {
  let inicio: { x: number; y: number; selecionado: string } | null = null;
  let engolirClique = false;

  canvasEl.addEventListener('mousedown', (e: MouseEvent) => {
    inicio = null;
    if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (ctx.modoCliqueSequencialAtivo || ctx.selectedPontoIds?.length !== 1) return;
    const map = ctx.triagemMap;
    if (!map) return;

    const selecionado = String(ctx.selectedPontoIds[0]);
    const marker = (ctx.mapaController?.getMarkers?.() ?? [])
      .find((m: any) => !m.isVizinho && String(m.pontoId) === selecionado);
    if (!marker) return;

    const clique = map.mouseEventToContainerPoint(e);
    const centro = map.latLngToContainerPoint(marker.getLatLng());
    if (Math.hypot(clique.x - centro.x, clique.y - centro.y) > RAIO_CLIQUE_SELECIONADO_PX) return;
    if (obterPilha(ctx, selecionado).length < 2) return;

    e.stopPropagation();
    e.preventDefault();
    inicio = { x: e.clientX, y: e.clientY, selecionado };
  }, true);

  canvasEl.addEventListener('mouseup', (e: MouseEvent) => {
    if (!inicio) return;
    const { x, y, selecionado } = inicio;
    inicio = null;
    e.stopPropagation();
    engolirClique = true;
    setTimeout(() => { engolirClique = false; }, 300);
    if (Math.abs(e.clientX - x) > 4 || Math.abs(e.clientY - y) > 4) return;
    processarClique(ctx, selecionado, selecionado);
  }, true);

  canvasEl.addEventListener('click', (e: MouseEvent) => {
    if (!engolirClique) return;
    engolirClique = false;
    e.stopPropagation();
  }, true);
}

interface MarcadorPilha {
  id: number;
  x: number;
  y: number;
}

function obterPilha(ctx: MesaTrabalhoContext, pontoId: number | string): MarcadorPilha[] {
  const map = ctx.triagemMap;
  const markers: any[] = ctx.mapaController?.getMarkers?.() ?? [];
  if (!map || markers.length === 0) return [];

  const doMapa = markers
    .filter(m => !m.isVizinho && m.pontoId != null && typeof m.getLatLng === 'function')
    .map(m => {
      const pt = map.latLngToContainerPoint(m.getLatLng());
      return { id: Number(m.pontoId), x: pt.x, y: pt.y };
    });

  const clicado = doMapa.find(m => String(m.id) === String(pontoId));
  if (!clicado) return [];

  const unicos = new Map<number, MarcadorPilha>();
  doMapa
    .filter(m => Math.hypot(m.x - clicado.x, m.y - clicado.y) <= RAIO_PILHA_PX)
    .forEach(m => unicos.set(m.id, m));
  return [...unicos.values()].sort((a, b) => a.id - b.id);
}

function aplicarSelecao(ctx: MesaTrabalhoContext, pontoId: number): void {
  ctx.selectPontoFromTabela(pontoId);
  // Leva o destaque (e o z-index de selecionado) do mapa para o vértice escolhido, sem mexer no zoom.
  if (ctx.mapaController && 'pontosSelecionados' in ctx.mapaController) {
    ctx.mapaController.pontosSelecionados = [pontoId];
  }
}

function descreverPonto(ctx: MesaTrabalhoContext, id: number): { nome: string; detalhe: string } {
  const p: any = (ctx.pontosList || []).find((x: any) => String(x.id) === String(id))
    ?? (ctx.bancoPontosList || []).find((x: any) => String(x.id) === String(id));
  if (!p) return { nome: `ID ${id}`, detalhe: '' };

  const nome = p.nome_vertice || p.codigo_completo || `ID ${id}`;
  const tipo = p.tipo_ponto || p.tipo || '';
  let matricula = 'Solto';
  if (p.matricula_id != null) {
    const m = (ctx.matriculasList || []).find((x: any) => String(x.id) === String(p.matricula_id));
    matricula = m?.numero_matricula ? `Mat. ${m.numero_matricula}` : `Mat. #${p.matricula_id}`;
  }
  const origem = p.arquivo_origem || p.planilha_origem || '';
  return { nome, detalhe: [tipo, matricula, origem].filter(Boolean).join(' · ') };
}

function abrirLista(ctx: MesaTrabalhoContext, pilha: MarcadorPilha[], selecionadoId: number): void {
  fecharLista();

  const canvasEl = document.getElementById('mapa-triagem');
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  const ancora = pilha[0];

  const lista = document.createElement('div');
  lista.id = ID_LISTA;
  lista.className = 'fixed w-72 bg-[#0e1b14] border border-mint-vibrant/25 rounded shadow-2xl py-1 z-[var(--geo-z-dropdown)] max-h-64 overflow-y-auto text-[11px]';

  const render = (atualId: number) => {
    lista.innerHTML = `
      <div class="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/45 border-b border-white/10">
        ${pilha.length} vértices neste ponto · clique de novo para alternar
      </div>
      ${pilha.map(m => {
        const { nome, detalhe } = descreverPonto(ctx, m.id);
        const ativo = String(m.id) === String(atualId);
        return `
          <button type="button" data-ponto-id="${m.id}"
            class="w-full text-left px-3 py-1.5 flex flex-col gap-0.5 hover:bg-white/[0.06] ${ativo ? 'bg-mint-vibrant/15 text-mint-vibrant' : 'text-white/85'}">
            <span class="font-semibold font-mono">${escapeHtml(nome)}</span>
            <span class="text-[10px] ${ativo ? 'text-mint-vibrant/70' : 'text-white/45'} truncate">${escapeHtml(detalhe)}</span>
          </button>`;
      }).join('')}
    `;
  };
  render(selecionadoId);

  lista.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-ponto-id]') as HTMLElement | null;
    if (!btn) return;
    const id = Number(btn.dataset.pontoId);
    aplicarSelecao(ctx, id);
    render(id);
  });

  document.body.appendChild(lista);

  // Posiciona ao lado do vértice, mantendo a lista dentro da janela.
  const largura = lista.offsetWidth;
  const altura = lista.offsetHeight;
  let left = rect.left + ancora.x + 14;
  let top = rect.top + ancora.y - 10;
  if (left + largura > window.innerWidth - 8) left = rect.left + ancora.x - largura - 14;
  if (top + altura > window.innerHeight - 8) top = window.innerHeight - altura - 8;
  lista.style.left = `${Math.max(8, left)}px`;
  lista.style.top = `${Math.max(8, top)}px`;

  const aoClicarFora = (e: MouseEvent) => {
    const alvo = e.target as Node;
    // Cliques no próprio mapa são tratados pelo fluxo do marcador (alternar ou fechar).
    if (lista.contains(alvo) || canvasEl.contains(alvo)) return;
    fecharLista();
  };
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key === 'Escape') fecharLista();
  };
  const aoMoverMapa = () => fecharLista();

  document.addEventListener('mousedown', aoClicarFora, true);
  document.addEventListener('keydown', aoTeclar);
  ctx.triagemMap?.on?.('movestart zoomstart click', aoMoverMapa);

  fecharListaAtual = () => {
    document.removeEventListener('mousedown', aoClicarFora, true);
    document.removeEventListener('keydown', aoTeclar);
    ctx.triagemMap?.off?.('movestart zoomstart click', aoMoverMapa);
    lista.remove();
  };
}

export function fecharLista(): void {
  if (fecharListaAtual) {
    const fechar = fecharListaAtual;
    fecharListaAtual = null;
    fechar();
  }
}
