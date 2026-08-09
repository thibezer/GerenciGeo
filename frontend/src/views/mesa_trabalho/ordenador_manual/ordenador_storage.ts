import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function setupOrdenadorStorage(ctx: MesaTrabalhoContext) {
  ctx.salvarRascunhoLocal = () => {
    if (!ctx.currentLevId) return;
    const todosPontos = ctx.obterPontosParaOrdenacao();
    const pontosMat = todosPontos.filter(p =>
      p &&
      p.ignorar_poligono !== 1 &&
      p.tipo_ponto !== 'B' &&
      p.tipo !== 'B' &&
      (!ctx.currentMatriculaId || String(p.matricula_id) === String(ctx.currentMatriculaId))
    );
    pontosMat.sort((a, b) => (a.ordem_caminhamento ?? 999999) - (b.ordem_caminhamento ?? 999999));

    const prefix = ctx.currentMatriculaId ? `mat_${ctx.currentMatriculaId}` : 'avulsos';
    const draft = pontosMat.map(p => ({
      id: p.id,
      ordem: p.ordem_caminhamento
    }));

    localStorage.setItem(`rascunho_ordem_lev_${ctx.currentLevId}_${prefix}`, JSON.stringify(draft));
  };

  ctx.verificarRascunhoLocal = () => {
    if (!ctx.currentLevId) return;
    const prefix = ctx.currentMatriculaId ? `mat_${ctx.currentMatriculaId}` : 'avulsos';
    const key = `rascunho_ordem_lev_${ctx.currentLevId}_${prefix}`;
    const draftStr = localStorage.getItem(key);

    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        if (draft && draft.length > 0) {
          const container = document.getElementById('lista-reordenar-simplificada');
          if (container && container.parentNode) {
            const banner = document.createElement('div');
            banner.className = 'bg-[var(--geo-bg-surface)] border-[0.5px] border-[var(--geo-border-default)] p-4 rounded-[var(--geo-radius-panel)] mb-3 flex flex-col gap-2 shadow-lg';
            banner.innerHTML = `
              <div class="text-[11px] text-[var(--geo-text-primary)] font-medium">Detectamos um rascunho de ordenação não salvo. Deseja restaurar?</div>
              <div class="flex gap-2 justify-end">
                <button id="btn-draft-reject" class="px-3 py-1 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded text-[10px] transition-colors border border-white/10">Ignorar</button>
                <button id="btn-draft-accept" class="px-3 py-1 bg-mint-vibrant/20 hover:bg-mint-vibrant/30 text-mint-vibrant rounded text-[10px] font-bold transition-colors border border-mint-vibrant/40">Restaurar Progresso</button>
              </div>
            `;

            container.parentNode.insertBefore(banner, container);

            document.getElementById('btn-draft-accept')!.onclick = () => {
              draft.forEach((d: any) => {
                const pt = ctx.pontosList.find(p => p.id === d.id);
                if (pt) {
                  pt.ordem_caminhamento = d.ordem;
                }
              });
              ctx.renderListaReordenarSimplificada();
              ctx.atualizarPolilinhaMapaTemp();
              banner.remove();
            };

            document.getElementById('btn-draft-reject')!.onclick = () => {
              localStorage.removeItem(key);
              banner.remove();
            };
          }
        }
      } catch (err) {
        localStorage.removeItem(key);
      }
    }
  };
}
