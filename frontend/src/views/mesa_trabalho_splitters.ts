import type { MesaTrabalhoContext } from './mesa_trabalho/mesa_trabalho_context';

export const aplicarLargurasSalvas = () => {
      const savedSupWidth = localStorage.getItem('gerencigeo_split_sup_width');
    if (savedSupWidth) {
        const widthPx = parseInt(savedSupWidth);
        const containerIngestao = document.getElementById('container-ingestao-arquivos');
        const containerReordenar = document.getElementById('container-reordenar-manual');
      if (containerIngestao) containerIngestao.style.width = `${widthPx}px`;
      if (containerReordenar) containerReordenar.style.width = `${widthPx}px`;
      }
      const savedInfWidth = localStorage.getItem('gerencigeo_split_inf_width');
    if (savedInfWidth) {
        const widthPx = parseInt(savedInfWidth);
        const containerDivisas = document.getElementById('container-tabela-divisas');
      if (containerDivisas) containerDivisas.style.width = `${widthPx}px`;
      }
      const savedPropsWidth = localStorage.getItem('gerencigeo_props_panel_width') || '280px';
      const panelProps = document.getElementById('painel-propriedades');
      const workspaceBody = document.querySelector('.workspace-body') as HTMLElement;
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
      const mainContent = document.querySelector('.workspace-main-content') as HTMLElement;
    if (mainContent) {
        mainContent.style.setProperty('--table-area-h', savedTableHeight.endsWith('px') ? savedTableHeight : `${savedTableHeight}px`);
      }
    };


export function setupMesaSplitters(ctx: MesaTrabalhoContext) {
        const inicializarSplitters = () => {
      const splitterSup = document.getElementById('splitter-superior');
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      const containerReordenar = document.getElementById('container-reordenar-manual');
      const gridSuperior = document.getElementById('grid-superior-detalhe');

      const splitterInf = document.getElementById('splitter-inferior');
      const containerDivisas = document.getElementById('container-tabela-divisas');

      if (splitterSup && gridSuperior) {
        let isDraggingSup = false;
        let startX = 0;
        let startWidthRight = 0;

        const onMouseMoveSup = (e: MouseEvent) => {
          if (!isDraggingSup) return;
          const rectGrid = gridSuperior.getBoundingClientRect();
          const deltaX = startX - e.clientX;
          const newWidthRight = Math.max(250, Math.min(rectGrid.width - 350, startWidthRight + deltaX));

          if (containerIngestao && !containerIngestao.classList.contains('hidden') && !containerIngestao.classList.contains('ingestao-collapsed')) {
            containerIngestao.style.width = `${newWidthRight}px`;
            localStorage.setItem('gerencigeo_split_sup_width', `${newWidthRight}`);
          }
          if (containerReordenar && !containerReordenar.classList.contains('hidden')) {
            containerReordenar.style.width = `${newWidthRight}px`;
            localStorage.setItem('gerencigeo_split_sup_width', `${newWidthRight}`);
          }

          if (ctx.triagemMap) ctx.triagemMap.invalidateSize?.();
        };

        const onMouseUpSup = () => {
          isDraggingSup = false;
          document.removeEventListener('mousemove', onMouseMoveSup);
          document.removeEventListener('mouseup', onMouseUpSup);
          document.body.classList.remove('cursor-col-resize', 'select-none');
          if (ctx.triagemMap) {
            setTimeout(() => ctx.triagemMap?.invalidateSize?.(), 50);
          }
        };

        splitterSup.addEventListener('mousedown', (e: MouseEvent) => {
          if (containerIngestao && containerIngestao.classList.contains('ingestao-collapsed')) return;

          e.preventDefault();
          isDraggingSup = true;
          startX = e.clientX;

          const activePanel = (containerIngestao && !containerIngestao.classList.contains('hidden'))
            ? containerIngestao
            : containerReordenar;

          if (activePanel) {
            startWidthRight = activePanel.getBoundingClientRect().width;
          }

          document.addEventListener('mousemove', onMouseMoveSup);
          document.addEventListener('mouseup', onMouseUpSup);
          document.body.classList.add('cursor-col-resize', 'select-none');
        });
      }

      if (splitterInf && containerDivisas) {
        let isDraggingInf = false;
        let startX = 0;
        let startWidthRight = 0;

        const onMouseMoveInf = (e: MouseEvent) => {
          if (!isDraggingInf) return;
          const containerParent = splitterInf.parentElement;
          if (!containerParent) return;
          const rectParent = containerParent.getBoundingClientRect();
          const deltaX = startX - e.clientX;
          const newWidthRight = Math.max(250, Math.min(rectParent.width - 350, startWidthRight + deltaX));

          containerDivisas.style.width = `${newWidthRight}px`;
          localStorage.setItem('gerencigeo_split_inf_width', `${newWidthRight}`);
        };

        const onMouseUpInf = () => {
          isDraggingInf = false;
          document.removeEventListener('mousemove', onMouseMoveInf);
          document.removeEventListener('mouseup', onMouseUpInf);
          document.body.classList.remove('cursor-col-resize', 'select-none');
        };

        splitterInf.addEventListener('mousedown', (e: MouseEvent) => {
          e.preventDefault();
          isDraggingInf = true;
          startX = e.clientX;
          startWidthRight = containerDivisas.getBoundingClientRect().width;

          document.addEventListener('mousemove', onMouseMoveInf);
          document.addEventListener('mouseup', onMouseUpInf);
          document.body.classList.add('cursor-col-resize', 'select-none');
        });
      }

      // Redimensionador de Altura do Mapa vs Tabela (Splitter Horizontal)
      const splitterMapa = document.getElementById('splitter-mapa-tabela');
      const mainContent = document.querySelector('.workspace-main-content') as HTMLElement;

      if (splitterMapa && mainContent) {
        let isDraggingMapa = false;
        let startY = 0;
        let startHeight = 0;

        const onMouseMoveMapa = (e: MouseEvent) => {
          if (!isDraggingMapa) return;
          const deltaY = startY - e.clientY; // Arrastar para cima aumenta a altura da tabela/view inferior
          const newHeight = Math.max(150, Math.min(window.innerHeight - 300, startHeight + deltaY));

          mainContent.style.setProperty('--table-area-h', `${newHeight}px`);
          localStorage.setItem('gerencigeo_table_height', `${newHeight}px`);

          if (ctx.triagemMap) {
            ctx.triagemMap.invalidateSize();
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
              ctx.triagemMap?.invalidateSize();
            }, 50);
          }
        };

        splitterMapa.addEventListener('mousedown', (e: MouseEvent) => {
          e.preventDefault();
          isDraggingMapa = true;
          startY = e.clientY;

          // Lê a altura da view-panel ativa no momento
          const activePanel = document.querySelector('.view-panel.active-view') as HTMLElement;
          startHeight = activePanel ? activePanel.getBoundingClientRect().height : 280;

          splitterMapa.classList.add('resizing');
          document.addEventListener('mousemove', onMouseMoveMapa);
          document.addEventListener('mouseup', onMouseUpMapa);
          document.body.classList.add('cursor-row-resize', 'select-none');
        });
      }

      // Redimensionador do Painel de Propriedades Lateral
      const resizerProps = document.getElementById('props-panel-resizer');
      const panelProps = document.getElementById('painel-propriedades');
      const workspaceBody = document.querySelector('.workspace-body') as HTMLElement;

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

          if (ctx.triagemMap) ctx.triagemMap.invalidateSize?.();
        };

        const onMouseUpProps = () => {
          isDraggingProps = false;
          resizerProps.classList.remove('resizing');
          document.removeEventListener('mousemove', onMouseMoveProps);
          document.removeEventListener('mouseup', onMouseUpProps);
          document.body.classList.remove('cursor-col-resize', 'select-none');
          if (ctx.triagemMap) {
            setTimeout(() => ctx.triagemMap?.invalidateSize?.(), 50);
          }
        };

        resizerProps.addEventListener('mousedown', (e: MouseEvent) => {
          if (panelProps.classList.contains('collapsed')) return; // Protege se estiver colapsado

          e.preventDefault();
          isDraggingProps = true;
          resizerProps.classList.add('resizing');
          startX = e.clientX;
          startWidth = panelProps.getBoundingClientRect().width;

          document.body.classList.add('cursor-col-resize', 'select-none');
          document.addEventListener('mousemove', onMouseMoveProps);
          document.addEventListener('mouseup', onMouseUpProps);
        });
      }

      aplicarLargurasSalvas();
    };
  aplicarLargurasSalvas();
  return inicializarSplitters();
}
