import { initIcons } from '../../../utils';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function renderizarCardsOrdenador(ctx: MesaTrabalhoContext): void {
  try {
    const container = document.getElementById('lista-reordenar-simplificada');
    if (!container) return;

    const todosPontos = ctx.obterPontosParaOrdenacao();
    const pontosMatCompleto = todosPontos.filter(p =>
      p &&
      p.ignorar_poligono !== 1 &&
      p.tipo_ponto !== 'B' &&
      p.tipo !== 'B' &&
      (!ctx.currentMatriculaId || String(p.matricula_id) === String(ctx.currentMatriculaId))
    );

    pontosMatCompleto.sort((a, b) => {
      const valA = a.ordem_caminhamento;
      const valB = b.ordem_caminhamento;
      const numA = Number(valA ?? 999999);
      const numB = Number(valB ?? 999999);
      return numA - numB;
    });

    const totalPontos = pontosMatCompleto.length;

    if (totalPontos === 0) {
      container.innerHTML = `<div class="text-white/20 p-8 text-center text-xs">Nenhum ponto de campo disponível.</div>`;
      return;
    }

    let pontosFiltrados = [...pontosMatCompleto];
    if (ctx.searchFilterOrdenadorValue && ctx.searchFilterOrdenadorValue.trim()) {
      const query = ctx.searchFilterOrdenadorValue.toLowerCase().trim();
      pontosFiltrados = pontosFiltrados.filter(p =>
        p && (
          (p.nome_vertice && p.nome_vertice.toLowerCase().includes(query)) ||
          (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(query)) ||
          (p.tipo && p.tipo.toLowerCase().includes(query))
        )
      );
    }

    if (pontosFiltrados.length === 0) {
      container.innerHTML = `<div class="text-white/20 p-8 text-center text-xs">Nenhum ponto encontrado com "${ctx.searchFilterOrdenadorValue}".</div>`;
      return;
    }

    container.innerHTML = pontosFiltrados.map((p) => {
      if (!p) return '';
      const ordemOriginal = pontosMatCompleto.findIndex(orig => orig && String(orig.id) === String(p.id)) + 1;
      const tipoP = p.tipo_ponto || p.tipo || 'P';

      const seqId = p.sequencia_travada_id;
      const isTravado = !!seqId;
      const cardBgClass = isTravado
        ? 'bg-amber-500/[0.04] border border-amber-500/30 text-amber-100/95 hover:border-amber-500/50 hover:bg-amber-500/[0.08]'
        : 'bg-white/[0.02] border border-white/5 text-white hover:border-mint-vibrant/25 hover:bg-white/[0.04]';

      const lockIconHtml = isTravado
        ? `<span class="inline-flex items-center gap-0.5 text-[8px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-bold uppercase tracking-wider shrink-0" title="Sequência travada: ${seqId}"><i data-lucide="lock" class="w-2.5 h-2.5"></i> ${seqId}</span>`
        : '';

      let matBadgeHtml = '';
      if (p.matricula_id) {
        const matObj = ctx.matriculasList?.find(m => String(m.id) === String(p.matricula_id));
        const matLabel = matObj?.numero_matricula ? `Mat. ${matObj.numero_matricula}` : `Mat. #${p.matricula_id}`;
        matBadgeHtml = `<span class="text-[8px] font-mono px-1 py-0.2 rounded bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 shrink-0" title="Pertence à ${matLabel}">${matLabel}</span>`;
      } else {
        matBadgeHtml = `<span class="text-[8px] font-mono px-1 py-0.2 rounded bg-white/5 text-white/30 border border-white/5 shrink-0" title="Ponto Avulso (Sem Matrícula Vinculada)">Avulso</span>`;
      }

      return `
        <div class="flex items-center justify-between py-0.5 px-1.5 rounded text-[11px] font-mono transition-all duration-150 linha-ponto-ordenador ${cardBgClass}"
             id="ordenador-item-${p.id}"
             draggable="true"
             data-ponto-id="${p.id}"
             data-ordem="${ordemOriginal}"
             data-idx="${pontosFiltrados.indexOf(p)}"
             data-sequencia-travada="${seqId || ''}">
          <div class="flex items-center gap-1.5 min-w-0 flex-1">
            <input type="checkbox"
                   class="chk-ponto-ordenador rounded border-white/10 bg-white/5 text-mint-vibrant focus:ring-mint-vibrant/20 w-3 h-3 cursor-pointer shrink-0"
                   data-ponto-id="${p.id}"
                   data-idx="${pontosFiltrados.indexOf(p)}" />
            <div class="cursor-grab text-white/20 hover:text-mint-vibrant transition-colors active:cursor-grabbing shrink-0 px-0.5" title="Arrastar para reordenar">
              <i data-lucide="grip-vertical" class="w-3 h-3"></i>
            </div>
            <input type="number"
                   class="input-ordem-manual w-9 text-[10px] text-center font-bold bg-white/5 border border-white/10 rounded focus:border-mint-vibrant focus:outline-none font-mono px-0.5 py-0 shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                   data-ponto-id="${p.id}"
                   value="${ordemOriginal}"
                   min="1"
                   max="${totalPontos}"
                   title="Digite a posição desejada" />
            <span class="font-bold truncate" title="${p.nome_vertice}">${p.nome_vertice}</span>
            <span class="text-[9px] text-white/30 shrink-0">(${tipoP})</span>
            ${matBadgeHtml}
            ${lockIconHtml}
          </div>
        </div>
      `;
    }).join('');

    initIcons();
  } catch (err: any) {
    console.error('Erro ao renderizar ordenador manual:', err);
    const container = document.getElementById('lista-reordenar-simplificada');
    if (container) {
      container.innerHTML = `
        <div class="text-red-400 p-4 text-center text-[11px] border border-red-500/20 bg-red-500/5 rounded-technical leading-relaxed">
          <span class="font-bold block mb-1">Erro na renderização:</span>
          ${err.message || err}<br>
          <span class="text-[9px] opacity-60 font-mono mt-1 block">${err.stack ? err.stack.split('\n')[0] : ''}</span>
        </div>
      `;
    }
  }
}
