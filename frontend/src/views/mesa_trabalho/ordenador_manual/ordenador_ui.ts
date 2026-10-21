import type { MesaTrabalhoContext } from '../mesa_trabalho_context';
import { renderizarCardsOrdenador } from './ordenador_ui_cards';
import { configurarDragDropOrdenador } from './ordenador_ui_dragdrop';
import { configurarAcoesOrdenador } from './ordenador_ui_acoes';

export { renderizarCardsOrdenador } from './ordenador_ui_cards';
export { configurarDragDropOrdenador } from './ordenador_ui_dragdrop';
export { configurarAcoesOrdenador } from './ordenador_ui_acoes';

export function setupOrdenadorUI(ctx: MesaTrabalhoContext): void {
  // Callback de renderização da lista de cartões de reordenação
  ctx.renderListaReordenarSimplificada = () => {
    renderizarCardsOrdenador(ctx);
  };

  const inicializarEventosOrdenador = () => {
    const containerReordenar = document.getElementById('lista-reordenar-simplificada');
    if (containerReordenar) {
      // Clona para purgar listeners acumulados
      const novoContainer = containerReordenar.cloneNode(true) as HTMLElement;
      containerReordenar.parentNode?.replaceChild(novoContainer, containerReordenar);

      const elReordenar = document.getElementById('lista-reordenar-simplificada')!;
      configurarDragDropOrdenador(ctx, elReordenar);
    }

    configurarAcoesOrdenador(ctx);
  };

  ctx.inicializarEventosOrdenador = () => {
    inicializarEventosOrdenador();
  };

  ctx.inicializarEventosOrdenador();
}
