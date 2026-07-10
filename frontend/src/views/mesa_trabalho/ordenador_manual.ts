import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import { setupOrdenadorContext } from './ordenador_manual/ordenador_context';
import { setupOrdenadorStorage } from './ordenador_manual/ordenador_storage';
import { setupOrdenadorUI } from './ordenador_manual/ordenador_ui';

export function setupOrdenadorManual(ctx: MesaTrabalhoContext) {
  setupOrdenadorContext(ctx);
  setupOrdenadorStorage(ctx);
  setupOrdenadorUI(ctx);

  if (ctx.inicializarEventosCartorio) {
      ctx.inicializarEventosCartorio();
  }
}
