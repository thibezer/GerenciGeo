import L from 'leaflet';

/**
 * Controlador de Interações do Canvas AutoCAD-like para o Leaflet
 * 
 * Modifica as interações padrão do Leaflet para simular a mesa de desenho do AutoCAD:
 *  - Clique esquerdo + arrastar: Cria caixa de seleção (Window/Crossing)
 *  - Clique da rodinha (botão do meio) + arrastar: Pan dinâmico
 *  - Clique duplo na rodinha: Zoom Extents (ajustar limites de toda a malha)
 *  - Tecla ESC: Cancela a seleção ativa
 */
export class CanvasInteracao {
  private ctx: any;
  private map: L.Map | null = null;
  private mapContainer: HTMLElement | null = null;
  
  // Estados de Pan (Rodinha)
  private isPanning: boolean = false;
  private lastMousePos = { x: 0, y: 0 };
  
  // Estados de Seleção (Clique Esquerdo)
  private isSelecting: boolean = false;
  private selectStartPos = { x: 0, y: 0 };
  private selectStartPoint: L.Point | null = null;
  private selectionDiv: HTMLDivElement | null = null;
  
  // Tempo do último clique do botão do meio para simular clique duplo
  private lastMiddleClickTime: number = 0;

  // Sinaliza que uma caixa de seleção foi arrastada (evita popups do WMS do SIGEF)
  public selectionHappened: boolean = false;

  constructor(ctx: any) {
    this.ctx = ctx;
  }

  /**
   * Ativa as interações customizadas no mapa Leaflet da mesa de trabalho
   */
  public ativar(mapaController: any): void {
    this.map = mapaController.getMap();
    if (!this.map) return;

    this.mapContainer = this.map.getContainer();
    if (!this.mapContainer) return;

    // 1. Desativa comportamento padrão de arrasto com botão esquerdo para Pan
    this.map.dragging.disable();
    this.map.doubleClickZoom.disable();

    // 2. Cria o elemento div absoluto de seleção
    this.selectionDiv = document.createElement('div');
    this.selectionDiv.style.position = 'fixed';
    this.selectionDiv.style.zIndex = '9999';
    this.selectionDiv.style.pointerEvents = 'none';
    this.selectionDiv.style.display = 'none';
    this.selectionDiv.style.borderRadius = '2px';
    document.body.appendChild(this.selectionDiv);

    // 3. Registra os listeners de eventos do mouse no container do mapa
    this.mapContainer.addEventListener('mousedown', this.handleMouseDown);
    this.mapContainer.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
    
    // Evita abrir o menu de contexto do navegador ao clicar com botão direito ou meio
    this.mapContainer.addEventListener('contextmenu', this.handleContextMenu);

    // 4. Registra listener global para tecla ESC
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Destrói os listeners e elementos criados
   */
  public desativar(): void {
    if (this.mapContainer) {
      this.mapContainer.removeEventListener('mousedown', this.handleMouseDown);
      this.mapContainer.removeEventListener('mousemove', this.handleMouseMove);
      this.mapContainer.removeEventListener('contextmenu', this.handleContextMenu);
    }
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleKeyDown);

    if (this.selectionDiv && this.selectionDiv.parentNode) {
      this.selectionDiv.parentNode.removeChild(this.selectionDiv);
    }
    
    // Restaura arrasto original se aplicável
    if (this.map) {
      this.map.dragging.enable();
      this.map.doubleClickZoom.enable();
    }
  }

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  /**
   * Captura clique inicial do mouse
   */
  private handleMouseDown = (e: MouseEvent): void => {
    if (!this.map) return;

    // Botão do Meio (Rodinha / Scroll Wheel) -> PAN do AutoCAD
    if (e.button === 1) {
      e.preventDefault();
      
      const agora = Date.now();
      if (agora - this.lastMiddleClickTime < 300) {
        // DUPLO CLIQUE DA RODINHA -> Zoom Extents
        this.zoomExtents();
        return;
      }
      this.lastMiddleClickTime = agora;

      this.isPanning = true;
      this.lastMousePos = { x: e.clientX, y: e.clientY };
      this.mapContainer!.style.cursor = 'grabbing';
      return;
    }

    // Botão Esquerdo -> JANELA DE SELEÇÃO do AutoCAD
    if (e.button === 0) {
      // Se o usuário estiver desenhando poligonal ponto a ponto (modo sequencial), ignore a caixa de seleção
      if (this.ctx.mapaController && this.ctx.mapaController.modoCliqueSequencialAtivo) {
        return;
      }

      this.isSelecting = true;
      this.selectStartPos = { x: e.clientX, y: e.clientY };
      this.selectStartPoint = this.map.mouseEventToContainerPoint(e);
      
      this.selectionDiv!.style.left = `${e.clientX}px`;
      this.selectionDiv!.style.top = `${e.clientY}px`;
      this.selectionDiv!.style.width = '0px';
      this.selectionDiv!.style.height = '0px';
      this.selectionDiv!.style.display = 'block';

      // AutoCAD-style: Desativa temporariamente pointer-events nos panes dos marcadores e polilinhas
      // para evitar que tooltips ou popups apareçam no mouseup ou mousemove da seleção.
      const verticesPane = this.map.getPane('verticesPane');
      const perimetroPane = this.map.getPane('perimetroPane');
      const overlayPane = this.map.getPane('overlayPane');
      if (verticesPane) verticesPane.style.pointerEvents = 'none';
      if (perimetroPane) perimetroPane.style.pointerEvents = 'none';
      if (overlayPane) overlayPane.style.pointerEvents = 'none';
    }
  }

  /**
   * Captura movimento do mouse para arrasto ou seleção
   */
  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.map) return;

    // Executa Pan dinâmico
    if (this.isPanning) {
      const dx = this.lastMousePos.x - e.clientX;
      const dy = this.lastMousePos.y - e.clientY;
      
      this.map.panBy([dx, dy], { animate: false });
      this.lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }

    // Atualiza retângulo de seleção
    if (this.isSelecting) {
      const width = Math.abs(e.clientX - this.selectStartPos.x);
      const height = Math.abs(e.clientY - this.selectStartPos.y);
      const left = Math.min(e.clientX, this.selectStartPos.x);
      const top = Math.min(e.clientY, this.selectStartPos.y);

      this.selectionDiv!.style.left = `${left}px`;
      this.selectionDiv!.style.top = `${top}px`;
      this.selectionDiv!.style.width = `${width}px`;
      this.selectionDiv!.style.height = `${height}px`;

      // Direção do arraste:
      if (e.clientX >= this.selectStartPos.x) {
        // Esquerda para Direita: Window Selection (Azul - Sólida)
        this.selectionDiv!.style.background = 'rgba(14, 116, 144, 0.18)'; 
        this.selectionDiv!.style.border = '1.5px solid #06b6d4'; 
      } else {
        // Direita para Esquerda: Crossing Selection (Verde - Tracejada)
        this.selectionDiv!.style.background = 'rgba(16, 185, 129, 0.18)'; 
        this.selectionDiv!.style.border = '1.5px dashed #10b981'; 
      }
    }
  }

  /**
   * Finaliza operações ao soltar o mouse
   */
  private handleMouseUp = (e: MouseEvent): void => {
    if (this.isPanning) {
      this.isPanning = false;
      if (this.mapContainer) {
        this.mapContainer.style.cursor = 'grab';
      }
    }

    if (this.isSelecting) {
      this.isSelecting = false;
      this.selectionDiv!.style.display = 'none';

      if (!this.map) return;

      // AutoCAD-style: Fecha popups abertos e reabilita interações físicas com delay
      this.map.closePopup();
      setTimeout(() => {
        const verticesPane = this.map?.getPane('verticesPane');
        const perimetroPane = this.map?.getPane('perimetroPane');
        const overlayPane = this.map?.getPane('overlayPane');
        if (verticesPane) verticesPane.style.pointerEvents = 'auto';
        if (perimetroPane) perimetroPane.style.pointerEvents = 'auto';
        if (overlayPane) overlayPane.style.pointerEvents = 'auto';
      }, 80);

      const endPoint = this.map.mouseEventToContainerPoint(e);
      const endPos = { x: e.clientX, y: e.clientY };
      
      const width = Math.abs(endPos.x - this.selectStartPos.x);
      const height = Math.abs(endPos.y - this.selectStartPos.y);

      // Clique curto (limpa seleção se clicado no vazio)
      if (width < 4 && height < 4) {
        const target = e.target as HTMLElement;
        if (target.classList.contains('leaflet-container') || target.id === 'mapa-triagem' || target.closest('.leaflet-pane')) {
          const clicouNoMarcador = target.closest('.custom-leaflet-marker') || target.closest('.custom-div-icon');
          if (!clicouNoMarcador) {
            this.ctx.selectedPontoIds = [];
            this.ctx.selectedVizinhoPontoIds = [];
            this.ctx.lastSelectedPontoId = null;
            this.ctx.atualizarDestaqueLinhasTabela();
          }
        }
        return;
      }

      // AutoCAD-style: sinaliza que houve uma seleção válida por arrasto para impedir popup do SIGEF
      this.selectionHappened = true;

      const rect = {
        x1: Math.min(this.selectStartPoint!.x, endPoint.x),
        y1: Math.min(this.selectStartPoint!.y, endPoint.y),
        x2: Math.max(this.selectStartPoint!.x, endPoint.x),
        y2: Math.max(this.selectStartPoint!.y, endPoint.y)
      };

      const markers = this.ctx.mapaController.getMarkers() as L.Marker[];
      const vizinhosMarkers = this.ctx.mapaController.getVizinhosMarkers() as L.Marker[];
      
      const selectedIds: number[] = [];
      const selectedVizinhoIds: number[] = [];

      // Filtra marcadores principais
      markers.forEach(m => {
        const pId = (m as any).pontoId;
        if (!pId) return;

        const mPos = this.map!.latLngToContainerPoint(m.getLatLng());
        const inside = mPos.x >= rect.x1 && mPos.x <= rect.x2 && mPos.y >= rect.y1 && mPos.y <= rect.y2;

        if (inside) {
          selectedIds.push(pId);
        }
      });

      // Filtra marcadores de vizinhos (roxos)
      vizinhosMarkers.forEach(m => {
        const pId = (m as any).pontoId;
        if (!pId) return;

        const mPos = this.map!.latLngToContainerPoint(m.getLatLng());
        const inside = mPos.x >= rect.x1 && mPos.x <= rect.x2 && mPos.y >= rect.y1 && mPos.y <= rect.y2;

        if (inside) {
          selectedVizinhoIds.push(pId);
        }
      });

      // Aplica a seleção
      if (e.ctrlKey || e.metaKey) {
        // Toggle/Add se pressionar Ctrl
        selectedIds.forEach(id => {
          if (this.ctx.selectedPontoIds.includes(id)) {
            this.ctx.selectedPontoIds = this.ctx.selectedPontoIds.filter((sid: number) => sid !== id);
          } else {
            this.ctx.selectedPontoIds.push(id);
          }
        });
        
        selectedVizinhoIds.forEach(id => {
          if (this.ctx.selectedVizinhoPontoIds.includes(id)) {
            this.ctx.selectedVizinhoPontoIds = this.ctx.selectedVizinhoPontoIds.filter((sid: number) => sid !== id);
          } else {
            this.ctx.selectedVizinhoPontoIds.push(id);
          }
        });
      } else {
        // Sobrescreve a seleção
        this.ctx.selectedPontoIds = selectedIds;
        this.ctx.selectedVizinhoPontoIds = selectedVizinhoIds;
      }

      if (this.ctx.selectedPontoIds.length > 0) {
        this.ctx.lastSelectedPontoId = this.ctx.selectedPontoIds[this.ctx.selectedPontoIds.length - 1];
      }

      this.ctx.atualizarDestaqueLinhasTabela();
    }
  }

  /**
   * Monitora teclas físicas pressionadas
   */
  private handleKeyDown = (e: KeyboardEvent): void => {
    // Tecla ESC -> Limpa a seleção de pontos ativa
    if (e.key === 'Escape') {
      if (this.ctx.selectedPontoIds.length > 0 || this.ctx.selectedVizinhoPontoIds.length > 0) {
        this.ctx.selectedPontoIds = [];
        this.ctx.selectedVizinhoPontoIds = [];
        this.ctx.lastSelectedPontoId = null;
        this.ctx.atualizarDestaqueLinhasTabela();
      }
    }
  }

  /**
   * Enquadra visualmente todo o levantamento perimetral na tela (AutoCAD Zoom Extents)
   */
  private zoomExtents(): void {
    if (!this.ctx.pontosList || this.ctx.pontosList.length === 0) return;
    
    const pontosMat = this.ctx.etapaAtiva === 'geoprocessamento'
      ? this.ctx.pontosList.filter((p: any) => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B')
      : this.ctx.pontosList.filter((p: any) => p.matricula_id === this.ctx.currentMatriculaId);

    if (pontosMat.length > 0) {
      this.ctx.mapaController.fitBounds(pontosMat);
    }
  }

  public destroy() {
    if (this.mapContainer) {
      this.mapContainer.removeEventListener('mousedown', this.handleMouseDown);
      this.mapContainer.removeEventListener('mousemove', this.handleMouseMove);
      this.mapContainer.removeEventListener('contextmenu', this.handleContextMenu);
    }
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleKeyDown);
  }

}