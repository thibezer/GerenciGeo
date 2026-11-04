import { API_BASE } from '../../config';
import { showToast, escapeHtml } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

/** Vértice virtual criado como rascunho: fora do polígono até ser inserido no perímetro. */
export const ehVerticeVirtualRascunho = (p: any): boolean =>
  Boolean(p) && p.tipo_ponto === 'V' && Number(p.ignorar_poligono) === 1 && p.camada_ciclo_vida === 'CAMPO';

const lerJson = async (res: Response): Promise<any> => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};

/**
 * Pergunta em que posição do perímetro os rascunhos entram.
 * Resolve com o id do ponto "âncora" (`null` = no final do perímetro) ou `undefined` se cancelado.
 */
const escolherPosicao = (perimetro: any[], quantidade: number): Promise<number | null | undefined> =>
  new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 flex items-center justify-center bg-black/70 z-[999999]';
    const opcoes = perimetro
      .map(p => `<option value="${p.id}" class="bg-[#111113]">Após ${escapeHtml(String(p.nome_vertice || `P${p.id}`))} (ordem ${Number(p.ordem_caminhamento) || '-'})</option>`)
      .join('');
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" aria-label="Inserir no perímetro" class="w-full max-w-md mx-4 bg-[#111113] border border-white/10 rounded-technical shadow-2xl text-white p-6">
        <h3 class="text-base font-bold">Inserir no perímetro</h3>
        <p class="text-[12px] text-white/50 mt-1">
          ${quantidade} vértice${quantidade > 1 ? 's' : ''} virtua${quantidade > 1 ? 'is' : 'l'} em rascunho entrará${quantidade > 1 ? 'ão' : ''} no polígono, na ordem de criação, na posição escolhida.
        </p>
        <label for="sel-posicao-perimetro" class="block text-[11px] text-white/50 mt-4 mb-1">Posição</label>
        <select id="sel-posicao-perimetro" class="w-full bg-white/5 border border-white/10 rounded-md px-2 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500">
          <option value="" class="bg-[#111113]">No final do perímetro</option>
          ${opcoes}
        </select>
        <div class="flex justify-end gap-2 mt-6">
          <button id="btn-promover-cancelar" type="button" class="px-4 py-2 rounded-md text-white/60 hover:text-white hover:bg-white/5 text-xs font-semibold">Cancelar</button>
          <button id="btn-promover-confirmar" type="button" class="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold">Inserir</button>
        </div>
      </div>
    `;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') encerrar(undefined);
    };
    const encerrar = (valor: number | null | undefined) => {
      window.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(valor);
    };
    overlay.querySelector('#btn-promover-cancelar')?.addEventListener('click', () => encerrar(undefined));
    overlay.querySelector('#btn-promover-confirmar')?.addEventListener('click', () => {
      const valor = (overlay.querySelector('#sel-posicao-perimetro') as HTMLSelectElement).value;
      encerrar(valor ? Number(valor) : null);
    });
    window.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  });

/** Insere os vértices virtuais em rascunho selecionados no perímetro da matrícula ativa. */
export async function promoverVerticesVirtuais(ctx: MesaTrabalhoContext): Promise<void> {
  const levId = ctx.currentLevId;
  const matId = ctx.currentMatriculaId;
  if (!levId || !matId) {
    showToast('Selecione um levantamento e uma matrícula ativos.', 'info');
    return;
  }

  const todos: any[] = ctx.pontosList || [];
  const selecionados = todos
    .filter(p => ctx.selectedPontoIds.map(Number).includes(Number(p.id)) && String(p.matricula_id) === String(matId));
  const rascunhos = selecionados.filter(ehVerticeVirtualRascunho).sort((a, b) => Number(a.id) - Number(b.id));

  if (rascunhos.length === 0) {
    showToast('Selecione vértices virtuais em rascunho (linha tracejada, fora do polígono) para inserir no perímetro.', 'info');
    return;
  }
  if (rascunhos.length < selecionados.length) {
    showToast('Só os vértices virtuais em rascunho serão inseridos; os demais selecionados foram ignorados.', 'info');
  }

  const perimetro = todos
    .filter(p => String(p.matricula_id) === String(matId) && Number(p.ignorar_poligono) !== 1 && p.tipo_ponto !== 'B' && Number(p.ordem_caminhamento) > 0)
    .sort((a, b) => Number(a.ordem_caminhamento) - Number(b.ordem_caminhamento));

  const ancora = await escolherPosicao(perimetro, rascunhos.length);
  if (ancora === undefined) return;

  try {
    const res = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/vertices-virtuais/promover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ponto_ids: rascunhos.map(p => Number(p.id)), apos_ponto_id: ancora }),
    });
    const data = await lerJson(res);
    if (!res.ok) {
      throw new Error(typeof data.detail === 'string' ? data.detail : 'Erro ao inserir vértices virtuais no perímetro.');
    }
    showToast(data.mensagem || 'Vértices virtuais inseridos no perímetro.', 'success');
  } catch (err: any) {
    showToast(err?.message || 'Erro ao inserir vértices virtuais no perímetro.', 'error');
    return;
  }

  ctx.selectedPontoIds = [];
  try {
    if (typeof ctx.loadLevantamentoDetails === 'function') await ctx.loadLevantamentoDetails();
  } catch {
    showToast('Vértices inseridos, mas não foi possível atualizar a tela. Recarregue o levantamento.', 'info');
  }
}
