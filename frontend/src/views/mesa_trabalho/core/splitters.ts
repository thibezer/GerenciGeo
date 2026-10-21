import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function aplicarLargurasSalvas(): void {
  const savedPropsWidth = localStorage.getItem('gerencigeo_props_panel_width') || '280px';
  const panelProps = document.getElementById('painel-propriedades');
  const workspaceBody = document.querySelector('.workspace-body') as HTMLElement | null;
  if (panelProps && workspaceBody) {
    if (panelProps.classList.contains('collapsed')) {
      workspaceBody.style.setProperty('--props-panel-w', '36px');
    } else {
      workspaceBody.style.setProperty('--props-panel-w', savedPropsWidth);
      panelProps.style.width = savedPropsWidth;
    }
  }

  // Restaurar altura da tabela e mapa salvos
  const savedTableHeight = localStorage.getItem('gerencigeo_table_height') || '280px';
  const mainContent = document.querySelector('.workspace-main-content') as HTMLElement | null;
  if (mainContent) {
    mainContent.style.setProperty('--table-area-h', savedTableHeight.endsWith('px') ? savedTableHeight : `${savedTableHeight}px`);
  }
}

export function inicializarSplitters(ctx: MesaTrabalhoContext): () => void {
  const cleanups: Array<() => void> = [];

  // 1. Redimensionador de Altura do Mapa vs Tabela (Splitter Horizontal)
  const splitterMapa = document.getElementById('splitter-mapa-tabela');
  const mainContent = document.querySelector('.workspace-main-content') as HTMLElement | null;

  if (splitterMapa && mainContent) {
    let isDraggingMapa = false;
    let startY = 0;
    let startHeight = 0;

    const onMouseMoveMapa = (e: MouseEvent) => {
      if (!isDraggingMapa) return;
      const deltaY = startY - e.clientY;
      const newHeight = Math.max(150, Math.min(window.innerHeight - 300, startHeight + deltaY));

      mainContent.style.setProperty('--table-area-h', `${newHeight}px`);
      localStorage.setItem('gerencigeo_table_height', `${newHeight}px`);

      if (ctx.triagemMap) {
        try {
          ctx.triagemMap.invalidateSize?.();
        } catch (e) {}
      }
    };

    const onMouseUpMapa = () => {
      isDraggingMapa = false;
      splitterMapa.classList.remove('resizing');
      document.removeEventListener('mousemove', onMouseMoveMapa);
      document.removeEventListener('mouseup', onMouseUpMapa);
      document.body.classList.remove('cursor-row-resize', 'select-none');

      if (ctx.triagemMap) {
        setTimeout(() => {
          try {
            ctx.triagemMap?.invalidateSize?.();
          } catch (e) {}
        }, 50);
      }
    };

    const onMouseDownMapa = (e: MouseEvent) => {
      e.preventDefault();
      isDraggingMapa = true;
      startY = e.clientY;

      const activePanel = document.querySelector('.view-panel.active-view') as HTMLElement | null;
      startHeight = activePanel ? activePanel.getBoundingClientRect().height : 280;

      splitterMapa.classList.add('resizing');
      document.addEventListener('mousemove', onMouseMoveMapa);
      document.addEventListener('mouseup', onMouseUpMapa);
      document.body.classList.add('cursor-row-resize', 'select-none');
    };

    splitterMapa.addEventListener('mousedown', onMouseDownMapa);
    cleanups.push(() => {
      splitterMapa.removeEventListener('mousedown', onMouseDownMapa);
      document.removeEventListener('mousemove', onMouseMoveMapa);
      document.removeEventListener('mouseup', onMouseUpMapa);
    });
  }

  // 2. Redimensionador do Painel de Propriedades Lateral (Splitter Vertical)
  const resizerProps = document.getElementById('props-panel-resizer');
  const panelProps = document.getElementById('painel-propriedades');
  const workspaceBody = document.querySelector('.workspace-body') as HTMLElement | null;

  if (resizerProps && panelProps && workspaceBody) {
    let isDraggingProps = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseMoveProps = (e: MouseEvent) => {
      if (!isDraggingProps) return;
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(200, Math.min(600, startWidth + deltaX));

      workspaceBody.style.setProperty('--props-panel-w', `${newWidth}px`);
      panelProps.style.width = `${newWidth}px`;
      localStorage.setItem('gerencigeo_props_panel_width', `${newWidth}px`);

      if (ctx.triagemMap) {
        try {
          ctx.triagemMap.invalidateSize?.();
        } catch (e) {}
      }
    };

    const onMouseUpProps = () => {
      isDraggingProps = false;
      resizerProps.classList.remove('resizing');
      document.removeEventListener('mousemove', onMouseMoveProps);
      document.removeEventListener('mouseup', onMouseUpProps);
      document.body.classList.remove('cursor-col-resize', 'select-none');
      if (ctx.triagemMap) {
        setTimeout(() => {
          try {
            ctx.triagemMap?.invalidateSize?.();
          } catch (e) {}
        }, 50);
      }
    };

    const onMouseDownProps = (e: MouseEvent) => {
      if (panelProps.classList.contains('collapsed')) return;

      e.preventDefault();
      isDraggingProps = true;
      resizerProps.classList.add('resizing');
      startX = e.clientX;
      startWidth = panelProps.getBoundingClientRect().width;

      document.body.classList.add('cursor-col-resize', 'select-none');
      document.addEventListener('mousemove', onMouseMoveProps);
      document.addEventListener('mouseup', onMouseUpProps);
    };

    resizerProps.addEventListener('mousedown', onMouseDownProps);
    cleanups.push(() => {
      resizerProps.removeEventListener('mousedown', onMouseDownProps);
      document.removeEventListener('mousemove', onMouseMoveProps);
      document.removeEventListener('mouseup', onMouseUpProps);
    });
  }

  aplicarLargurasSalvas();

  return () => {
    cleanups.forEach(c => c());
  };
}
