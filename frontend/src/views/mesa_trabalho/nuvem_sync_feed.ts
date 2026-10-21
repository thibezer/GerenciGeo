import { initIcons } from '../../utils';
import { realtimeSyncClient } from '../../utils/realtime_sync_client';
import type { SyncEventItem } from '../../utils/realtime_sync_client';

/**
 * Renderiza a lista de eventos recentes de sincronização em tempo real.
 */
export function renderizarFeedEventos(
  feedEventos: HTMLElement | null,
  labelContadorEventos: HTMLElement | null
): void {
  if (!feedEventos) return;
  const eventos = realtimeSyncClient.getRecentEvents();

  if (labelContadorEventos) {
    labelContadorEventos.innerText = `${eventos.length} evento(s)`;
  }

  if (!eventos || eventos.length === 0) {
    feedEventos.innerHTML = `<div class="text-white/30 text-center py-2 text-[10px]">Nenhuma atividade recente registrada.</div>`;
    return;
  }

  feedEventos.innerHTML = eventos
    .map((evt: SyncEventItem) => {
      let iconColor = 'text-mint-vibrant';
      let iconName = 'activity';

      if (evt.tipo === 'push') {
        iconColor = 'text-cyan-400';
        iconName = 'upload-cloud';
      } else if (evt.tipo === 'pull') {
        iconColor = 'text-emerald-400';
        iconName = 'download-cloud';
      } else if (evt.tipo === 'warning') {
        iconColor = 'text-amber-400';
        iconName = 'alert-circle';
      } else if (evt.tipo === 'error') {
        iconColor = 'text-red-400';
        iconName = 'x-circle';
      }

      return `
        <div class="flex items-start justify-between gap-2 py-1 border-b border-white/5 last:border-0 hover:bg-white/[0.02] px-1 rounded transition-colors">
          <div class="flex items-start gap-1.5 min-w-0">
            <span class="${iconColor} shrink-0 mt-0.5"><i data-lucide="${iconName}" class="w-3 h-3"></i></span>
            <div class="min-w-0">
              <span class="text-white/90 font-medium block truncate">${evt.titulo}</span>
              ${evt.detalhe ? `<span class="text-white/40 text-[9px] block truncate">${evt.detalhe}</span>` : ''}
            </div>
          </div>
          <span class="text-white/30 text-[9px] shrink-0 font-mono">${evt.hora}</span>
        </div>
      `;
    })
    .join('');

  initIcons();
}

/**
 * Helper para exibir o log de resultado no modal.
 */
export function exibirResultadoSync(
  containerResultado: HTMLElement | null,
  labelResultadoStatus: HTMLElement | null,
  labelResultadoHora: HTMLElement | null,
  labelResultadoMsg: HTMLElement | null,
  sucesso: boolean,
  titulo: string,
  msg: string
): void {
  if (!containerResultado) return;
  containerResultado.classList.remove('hidden');
  if (labelResultadoStatus) {
    labelResultadoStatus.innerText = sucesso ? `✓ ${titulo}` : `✕ ${titulo}`;
    labelResultadoStatus.className = sucesso ? 'text-mint-vibrant font-bold' : 'text-red-400 font-bold';
  }
  if (labelResultadoHora) {
    labelResultadoHora.innerText = new Date().toLocaleTimeString();
  }
  if (labelResultadoMsg) {
    labelResultadoMsg.innerText = msg;
  }
}
