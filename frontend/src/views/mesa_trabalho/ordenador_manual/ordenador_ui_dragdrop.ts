import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function configurarDragDropOrdenador(ctx: MesaTrabalhoContext, elReordenar: HTMLElement): void {
  let lastCheckedIdx: number | null = null;

  // Seleção múltipla com Shift+Clique nas checkboxes
  elReordenar.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const chk = target.closest('.chk-ponto-ordenador') as HTMLInputElement | null;

    if (chk) {
      const currentIdx = parseInt(chk.getAttribute('data-idx') || '-1', 10);
      const isChecked = chk.checked;

      if ((e as MouseEvent).shiftKey && lastCheckedIdx !== null && currentIdx !== -1) {
        const allChks = Array.from(
          elReordenar.querySelectorAll('.chk-ponto-ordenador')
        ) as HTMLInputElement[];

        const from = Math.min(lastCheckedIdx, currentIdx);
        const to = Math.max(lastCheckedIdx, currentIdx);

        allChks.forEach(c => {
          const cidx = parseInt(c.getAttribute('data-idx') || '-1', 10);
          if (cidx >= from && cidx <= to) {
            c.checked = isChecked;
          }
        });
      }

      lastCheckedIdx = currentIdx;
    }
  });

  elReordenar.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('.input-ordem-manual')) {
      e.stopPropagation();
    }
  });

  let dragSrcEl: HTMLElement | null = null;

  elReordenar.addEventListener('dragstart', (e: DragEvent) => {
    if ((e.target as HTMLElement).closest('.input-ordem-manual')) {
      e.preventDefault();
      return;
    }
    const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement | null;
    if (target) {
      dragSrcEl = target;
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('text/plain', target.getAttribute('data-ponto-id') || '');
      target.classList.add('opacity-40', 'border-dashed', 'border-mint-vibrant');
    }
  });

  // Digitação direta no input de posição
  elReordenar.addEventListener('change', (e) => {
    const input = (e.target as HTMLElement).closest('.input-ordem-manual') as HTMLInputElement | null;
    if (!input) return;

    const pontoId = parseInt(input.getAttribute('data-ponto-id') || '0', 10);
    const max = parseInt(input.getAttribute('max') || '1', 10);
    let novaPosicao = parseInt(input.value || '0', 10);

    if (!pontoId || isNaN(novaPosicao)) {
      ctx.renderListaReordenarSimplificada();
      return;
    }
    novaPosicao = Math.min(Math.max(novaPosicao, 1), max);
    ctx.moverPontoPosicao(pontoId, novaPosicao);
  });

  elReordenar.addEventListener('keydown', (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (el.classList.contains('input-ordem-manual') && e.key === 'Enter') {
      (el as HTMLInputElement).blur();
    }
  });

  elReordenar.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement | null;
    if (target && target !== dragSrcEl) {
      const rect = target.getBoundingClientRect();
      const isAfter = e.clientY > (rect.top + rect.height / 2);

      target.classList.add('bg-mint-vibrant/5');
      if (isAfter) {
        target.classList.add('border-b-2', '!border-b-mint-vibrant');
        target.classList.remove('border-t-2', '!border-t-mint-vibrant');
      } else {
        target.classList.add('border-t-2', '!border-t-mint-vibrant');
        target.classList.remove('border-b-2', '!border-b-mint-vibrant');
      }
    }
  });

  elReordenar.addEventListener('dragleave', (e: DragEvent) => {
    const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement | null;
    if (target) {
      target.classList.remove('bg-mint-vibrant/5', 'border-t-2', '!border-t-mint-vibrant', 'border-b-2', '!border-b-mint-vibrant');
    }
  });

  elReordenar.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement | null;
    const pontoIdArrastado = parseInt(e.dataTransfer!.getData('text/plain') || '0', 10);

    if (target && pontoIdArrastado) {
      const rect = target.getBoundingClientRect();
      const isAfter = e.clientY > (rect.top + rect.height / 2);
      let ordemAlvo = parseInt(target.getAttribute('data-ordem') || '1', 10);
      if (isAfter) {
        ordemAlvo += 1;
      }
      const pontosPerimetro = ctx.obterPontosParaOrdenacao()
        .filter(p =>
          p &&
          p.ignorar_poligono !== 1 &&
          p.tipo_ponto !== 'B' &&
          p.tipo !== 'B' &&
          (!ctx.currentMatriculaId || String(p.matricula_id) === String(ctx.currentMatriculaId))
        )
        .sort((a, b) => Number(a.ordem_caminhamento ?? 999999) - Number(b.ordem_caminhamento ?? 999999));

      const arrastado = pontosPerimetro.find(p => p.id === pontoIdArrastado);
      if (arrastado) {
        const seqId = arrastado.sequencia_travada_id;
        const movidosAntesDoDestino = pontosPerimetro.filter((p, idx) =>
          idx < ordemAlvo - 1 && (seqId ? p.sequencia_travada_id === seqId : p.id === pontoIdArrastado)
        ).length;
        ordemAlvo -= movidosAntesDoDestino;
      }
      ctx.moverPontoPosicao(pontoIdArrastado, ordemAlvo);
    }
  });

  elReordenar.addEventListener('dragend', () => {
    const items = elReordenar.querySelectorAll('.linha-ponto-ordenador');
    items.forEach(item => {
      item.classList.remove('opacity-40', 'border-dashed', 'border-mint-vibrant', 'bg-mint-vibrant/5', 'border-t-2', '!border-t-mint-vibrant', 'border-b-2', '!border-b-mint-vibrant');
    });
  });
}
