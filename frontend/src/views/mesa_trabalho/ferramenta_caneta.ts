import L from 'leaflet';
import { showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

// Salvaguarda global para robustez do Leaflet contra bounds não-inicializados em Canvas
if (typeof L !== 'undefined' && L.Bounds && L.Bounds.prototype) {
  const proto = L.Bounds.prototype as any;
  if (!proto.__gerencigeo_bounds_patched) {
    proto.__gerencigeo_bounds_patched = true;
    const originalIntersects = proto.intersects;
    proto.intersects = function(other: any): boolean {
      if (!this.min || !this.max) return false;
      const b = (other instanceof L.Bounds) ? other : (L.bounds ? L.bounds(other) : other);
      if (!b || !b.min || !b.max) return false;
      return originalIntersects.call(this, b);
    };
  }
}

/**
 * Ferramenta Caneta de Seleção Poligonal (Estilo Pen Tool / Photoshop)
 * Permite ao operador clicar no mapa sucessivamente para definir os vértices
 * de um polígono arbitrário, selecionando todos os pontos contidos dentro dele.
 */
export class FerramentaCanetaSelecao {
  private ctx: MesaTrabalhoContext;
  private ativo: boolean = false;
  private vertices: L.LatLng[] = [];
  
  // Elementos do Leaflet
  private camadaDesenho: L.LayerGroup | null = null;
  private svgRenderer: L.SVG | null = null;
  private poligonoTemp: L.Polygon | null = null;
  private linhaGuia: L.Polyline | null = null;
  private marcadoresVertices: L.CircleMarker[] = [];
  private marcadorInicio: L.CircleMarker | null = null;
  private bannerFlutuante: HTMLElement | null = null;

  // Handlers vinculados para desregistro seguro
  private mouseMoveRaf: number | null = null;
  private onMapClickBound: (e: L.LeafletMouseEvent) => void;
  private onMapMouseMoveBound: (e: L.LeafletMouseEvent) => void;
  private onMapDblClickBound: (e: L.LeafletMouseEvent) => void;
  private onMapContextMenuBound: (e: L.LeafletMouseEvent) => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;

  constructor(ctx: MesaTrabalhoContext) {
    this.ctx = ctx;
    this.onMapClickBound = this.onMapClick.bind(this);
    this.onMapMouseMoveBound = this.onMapMouseMove.bind(this);
    this.onMapDblClickBound = this.onMapDblClick.bind(this);
    this.onMapContextMenuBound = this.onMapContextMenu.bind(this);
    this.onKeyDownBound = this.onKeyDown.bind(this);
  }

  public isAtivo(): boolean {
    return this.ativo;
  }

  /**
   * Alterna o estado ativo/inativo da ferramenta caneta
   */
  public alternar(): void {
    if (this.ativo) {
      this.desativar();
    } else {
      this.ativar();
    }
  }

  /**
   * Ativa a ferramenta caneta
   */
  public ativar(): void {
    const map = this.obterMapa();
    if (!map) {
      showToast('Mapa ainda não está pronto para a ferramenta caneta.', 'info');
      return;
    }

    this.ativo = true;
    this.vertices = [];

    // Desativa modos conflitantes se estiverem ativos
    if (this.ctx.modoReordenarAtivo && typeof this.ctx.alternarModoReordenarManual === 'function') {
      this.ctx.alternarModoReordenarManual(false);
    }
    this.ctx.modoCliqueSequencialAtivo = false;

    // Instancia renderer SVG isolado para evitar qualquer conflito com o Canvas global do mapa
    if (!this.svgRenderer) {
      this.svgRenderer = L.svg();
    }

    // Garante LayerGroup no mapa
    if (!this.camadaDesenho) {
      this.camadaDesenho = L.layerGroup().addTo(map);
    } else {
      this.camadaDesenho.clearLayers();
    }

    // Configura container do mapa para modo caneta (cursor crosshair)
    const container = map.getContainer();
    if (container) {
      container.style.cursor = 'crosshair';
      container.classList.add('modo-caneta-cursor');
    }

    // Desabilita duplo clique de zoom no mapa enquanto a caneta estiver ativa
    map.doubleClickZoom.disable();

    // Registra listeners do Leaflet
    map.on('click', this.onMapClickBound);
    map.on('mousemove', this.onMapMouseMoveBound);
    map.on('dblclick', this.onMapDblClickBound);
    map.on('contextmenu', this.onMapContextMenuBound);
    window.addEventListener('keydown', this.onKeyDownBound);

    this.atualizarBotaoUI(true);
    this.exibirBanner();
    showToast('Caneta de Seleção ativada: Clique no mapa para desenhar o polígono.', 'info');
  }

  /**
   * Desativa a ferramenta e limpa os desenhos temporários
   */
  public desativar(): void {
    this.ativo = false;
    this.limparDesenho();

    if (this.mouseMoveRaf) {
      cancelAnimationFrame(this.mouseMoveRaf);
      this.mouseMoveRaf = null;
    }

    if (this.svgRenderer) {
      try {
        this.svgRenderer.remove();
      } catch {
        // Ignora
      }
      this.svgRenderer = null;
    }

    const map = this.obterMapa();
    if (map) {
      const container = map.getContainer();
      if (container) {
        container.style.cursor = '';
        container.classList.remove('modo-caneta-cursor');
      }

      map.doubleClickZoom.enable();

      map.off('click', this.onMapClickBound);
      map.off('mousemove', this.onMapMouseMoveBound);
      map.off('dblclick', this.onMapDblClickBound);
      map.off('contextmenu', this.onMapContextMenuBound);
    }

    window.removeEventListener('keydown', this.onKeyDownBound);

    this.ocultarBanner();
    this.atualizarBotaoUI(false);
  }

  /**
   * Limpa polígonos e linhas temporárias
   */
  private limparDesenho(): void {
    this.vertices = [];
    if (this.camadaDesenho) {
      this.camadaDesenho.clearLayers();
    }
    this.poligonoTemp = null;
    this.linhaGuia = null;
    this.marcadoresVertices = [];
    this.marcadorInicio = null;
    this.atualizarContadorBanner();
  }

  /**
   * Adiciona um vértice ao polígono da caneta
   */
  private onMapClick(e: L.LeafletMouseEvent): void {
    if (!this.ativo) return;

    const map = this.obterMapa();
    if (!map) return;

    // Se já temos pelo menos 3 pontos, verifica se clicou próximo ao primeiro (Snap de fechamento)
    if (this.vertices.length >= 3 && this.marcadorInicio) {
      const pontoPixelClique = map.latLngToContainerPoint(e.latlng);
      const pontoPixelInicio = map.latLngToContainerPoint(this.vertices[0]);
      const distanciaPx = pontoPixelClique.distanceTo(pontoPixelInicio);

      if (distanciaPx <= 18) {
        // Fechar polígono e selecionar!
        this.concluirSelecao(e.originalEvent?.ctrlKey || e.originalEvent?.shiftKey);
        return;
      }
    }

    const novoVertice = e.latlng;
    this.vertices.push(novoVertice);

    // Cria marcador para o novo vértice
    const isPrimeiro = this.vertices.length === 1;
    const marker = L.circleMarker(novoVertice, {
      radius: isPrimeiro ? 6 : 4,
      fillColor: isPrimeiro ? '#00f5a0' : '#38bdf8',
      color: '#ffffff',
      weight: 1.5,
      fillOpacity: 1,
      renderer: this.svgRenderer || undefined
    });

    if (this.camadaDesenho) {
      marker.addTo(this.camadaDesenho);
    }
    this.marcadoresVertices.push(marker);

    if (isPrimeiro) {
      this.marcadorInicio = marker;
      marker.bindTooltip('Início (clique aqui para fechar)', {
        permanent: false,
        direction: 'top',
        className: 'tooltip-caneta-snap'
      });
    }

    this.redesenharPoligono();
    this.atualizarContadorBanner();
  }

  /**
   * Move a linha elástica (rubberband) acompanhando o cursor do mouse
   */
  private onMapMouseMove(e: L.LeafletMouseEvent): void {
    if (!this.ativo || this.vertices.length === 0) return;
    if (this.mouseMoveRaf !== null) return;

    const mouseLatLng = e.latlng;
    if (!mouseLatLng || typeof mouseLatLng.lat !== 'number' || typeof mouseLatLng.lng !== 'number' || isNaN(mouseLatLng.lat) || isNaN(mouseLatLng.lng)) return;

    this.mouseMoveRaf = requestAnimationFrame(() => {
      this.mouseMoveRaf = null;
      if (!this.ativo || this.vertices.length === 0) return;

      try {
        const map = this.obterMapa();
        if (!map) return;

        // Verifica se está com snap próximo ao ponto de partida
        if (this.vertices.length >= 3 && this.marcadorInicio) {
          const pontoPixelMouse = map.latLngToContainerPoint(mouseLatLng);
          const pontoPixelInicio = map.latLngToContainerPoint(this.vertices[0]);
          const dist = pontoPixelMouse.distanceTo(pontoPixelInicio);

          if (dist <= 18) {
            this.marcadorInicio.setStyle({
              radius: 9,
              fillColor: '#facc15', // Amarelo de destaque
              color: '#ffffff',
              weight: 2
            });
          } else {
            this.marcadorInicio.setStyle({
              radius: 6,
              fillColor: '#00f5a0',
              color: '#ffffff',
              weight: 1.5
            });
          }
        }

        // Linha elástica: quando há 1 vértice, liga o vértice 0 ao mouse.
        // Quando há 2 ou mais, fecha o loop visual: último vértice -> mouse -> primeiro vértice.
        const coordsGuia = this.vertices.length >= 2
          ? [this.vertices[this.vertices.length - 1], mouseLatLng, this.vertices[0]]
          : [this.vertices[0], mouseLatLng];

        if (!this.linhaGuia) {
          this.linhaGuia = L.polyline(coordsGuia, {
            color: '#00f5a0',
            weight: 1.5,
            opacity: 0.85,
            dashArray: '4, 4',
            renderer: this.svgRenderer || undefined
          });
          if (this.camadaDesenho) {
            this.linhaGuia.addTo(this.camadaDesenho);
          }
        } else {
          this.linhaGuia.setLatLngs(coordsGuia);
        }
      } catch (err) {
        // Ignora pequenos erros de projeção de pixel em movimento rápido
        console.warn('[Caneta] Erro ao atualizar linha guia:', err);
      }
    });
  }

  /**
   * Duplo clique no mapa fecha e conclui o polígono de seleção
   */
  private onMapDblClick(e: L.LeafletMouseEvent): void {
    if (!this.ativo || this.vertices.length < 3) return;
    if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
    this.concluirSelecao(e.originalEvent?.ctrlKey || e.originalEvent?.shiftKey);
  }

  /**
   * Botão direito desfaz o último ponto inserido ou cancela
   */
  private onMapContextMenu(e: L.LeafletMouseEvent): void {
    if (!this.ativo) return;
    if (e.originalEvent) L.DomEvent.preventDefault(e.originalEvent);

    if (this.vertices.length > 1) {
      this.desfazerUltimoVertice();
    } else if (this.vertices.length === 1) {
      this.limparDesenho();
      showToast('Desenho da caneta cancelado.', 'info');
    }
  }

  /**
   * Atalhos de teclado (ESC, Enter, Ctrl+Z)
   */
  private onKeyDown(e: KeyboardEvent): void {
    if (!this.ativo) return;

    if (e.key === 'Escape') {
      if (this.vertices.length > 0) {
        this.limparDesenho();
        showToast('Traçado cancelado.', 'info');
      } else {
        this.desativar();
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (this.vertices.length >= 3) {
        e.preventDefault();
        this.concluirSelecao(e.ctrlKey || e.shiftKey);
      }
    } else if ((e.ctrlKey && e.key.toLowerCase() === 'z') || e.key === 'Backspace') {
      if (this.vertices.length > 0) {
        e.preventDefault();
        this.desfazerUltimoVertice();
      }
    }
  }

  /**
   * Remove o último vértice inserido
   */
  public desfazerUltimoVertice(): void {
    if (this.vertices.length === 0) return;

    this.vertices.pop();
    const ultimoMarker = this.marcadoresVertices.pop();
    if (ultimoMarker && this.camadaDesenho) {
      this.camadaDesenho.removeLayer(ultimoMarker);
    }

    if (this.vertices.length === 0) {
      this.marcadorInicio = null;
      if (this.linhaGuia && this.camadaDesenho) {
        this.camadaDesenho.removeLayer(this.linhaGuia);
        this.linhaGuia = null;
      }
    }

    this.redesenharPoligono();
    this.atualizarContadorBanner();
    showToast('Último vértice removido.', 'info');
  }

  /**
   * Redesenha o polígono translúcido preenchido
   */
  private redesenharPoligono(): void {
    if (!this.camadaDesenho) return;

    if (this.vertices.length >= 3) {
      if (!this.poligonoTemp) {
        this.poligonoTemp = L.polygon(this.vertices, {
          color: '#00f5a0',
          weight: 2,
          opacity: 0.9,
          fillColor: '#00f5a0',
          fillOpacity: 0.16,
          renderer: this.svgRenderer || undefined
        }).addTo(this.camadaDesenho);
      } else {
        this.poligonoTemp.setLatLngs(this.vertices);
      }
    } else if (this.poligonoTemp) {
      this.camadaDesenho.removeLayer(this.poligonoTemp);
      this.poligonoTemp = null;
    }
  }

  /**
   * Conclui a seleção: testa quais pontos estão dentro do polígono desenhado
   */
  public concluirSelecao(aditiva: boolean = false): void {
    if (this.vertices.length < 3) {
      showToast('Defina pelo menos 3 pontos para formar uma área de seleção.', 'info');
      return;
    }

    const poligonoCoords = this.vertices.map(v => ({ lat: v.lat, lng: v.lng }));
    const pontosLista = this.ctx.pontosList || [];
    const vizinhosLista = this.ctx.pontosVizinhosList || [];

    // Encontra pontos contidos usando Ray Casting
    const pontosContidosIds: number[] = [];
    pontosLista.forEach(p => {
      const lat = p.lat_corrigido ?? p.lat;
      const lon = p.lon_corrigido ?? p.lon;
      if (lat != null && lon != null && lat !== 0 && lon !== 0) {
        if (this.pontoDentroDoPoligono(lat, lon, poligonoCoords)) {
          pontosContidosIds.push(p.id);
        }
      }
    });

    // Encontra pontos vizinhos contidos
    const vizinhosContidosIds: number[] = [];
    vizinhosLista.forEach(pv => {
      const lat = pv.lat;
      const lon = pv.lon;
      if (lat != null && lon != null && lat !== 0 && lon !== 0) {
        if (this.pontoDentroDoPoligono(lat, lon, poligonoCoords)) {
          vizinhosContidosIds.push(pv.id);
        }
      }
    });

    if (pontosContidosIds.length === 0 && vizinhosContidosIds.length === 0) {
      showToast('Nenhum vértice encontrado dentro do polígono desenhado.', 'info');
      this.limparDesenho();
      return;
    }

    // Aplica seleção (aditiva se Ctrl/Shift estiver ativo)
    if (aditiva) {
      const conjuntoPontos = new Set([...(this.ctx.selectedPontoIds || []), ...pontosContidosIds]);
      const conjuntoVizinhos = new Set([...(this.ctx.selectedVizinhoPontoIds || []), ...vizinhosContidosIds]);
      this.ctx.selectedPontoIds = Array.from(conjuntoPontos);
      this.ctx.selectedVizinhoPontoIds = Array.from(conjuntoVizinhos);
    } else {
      this.ctx.selectedPontoIds = pontosContidosIds;
      this.ctx.selectedVizinhoPontoIds = vizinhosContidosIds;
    }

    this.ctx.lastSelectedPontoId = pontosContidosIds.length > 0 
      ? pontosContidosIds[pontosContidosIds.length - 1] 
      : null;

    // Sincroniza tabelas e painel de propriedades
    if (typeof this.ctx.atualizarDestaqueLinhasTabela === 'function') {
      this.ctx.atualizarDestaqueLinhasTabela();
    }
    if (typeof this.ctx.atualizarPainelPropriedades === 'function') {
      this.ctx.atualizarPainelPropriedades();
    }

    // Dispara evento para o canvas CAD e para o ecossistema
    window.dispatchEvent(new CustomEvent('gerencigeo:ponto-selecionado', {
      detail: {
        selectedPontoIds: this.ctx.selectedPontoIds,
        selectedVizinhoPontoIds: this.ctx.selectedVizinhoPontoIds,
        lastSelectedPontoId: this.ctx.lastSelectedPontoId
      }
    }));

    showToast(`Caneta: ${pontosContidosIds.length} vértices selecionados com sucesso!`, 'success');
    this.limparDesenho();
  }

  /**
   * Algoritmo Ray-Casting clássico para teste Ponto-em-Polígono
   */
  private pontoDentroDoPoligono(lat: number, lon: number, vs: { lat: number; lng: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].lng, yi = vs[i].lat;
      const xj = vs[j].lng, yj = vs[j].lat;

      const intersect = ((yi > lat) !== (yj > lat))
        && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Recupera a instância ativa do Leaflet
   */
  private obterMapa(): L.Map | null {
    if (this.ctx.triagemMap) return this.ctx.triagemMap;
    if (this.ctx.mapaController) {
      if (typeof this.ctx.mapaController.getMap === 'function') {
        return this.ctx.mapaController.getMap();
      }
      if (this.ctx.mapaController.controller && typeof this.ctx.mapaController.controller.getMap === 'function') {
        return this.ctx.mapaController.controller.getMap();
      }
    }
    const el = document.getElementById('mapa-triagem') as any;
    if (el && typeof el.getMap === 'function') return el.getMap();
    return null;
  }

  /**
   * Atualiza visual do botão da Caneta na barra de ferramentas
   */
  private atualizarBotaoUI(ativo: boolean): void {
    const btn = document.getElementById('btn-ferramenta-caneta');
    if (btn) {
      if (ativo) {
        btn.classList.add('bg-mint-vibrant', 'text-slate-950', 'border-mint-vibrant', 'shadow-[0_0_12px_rgba(0,245,160,0.4)]');
        btn.classList.remove('bg-white/5', 'text-mint-vibrant');
      } else {
        btn.classList.remove('bg-mint-vibrant', 'text-slate-950', 'border-mint-vibrant', 'shadow-[0_0_12px_rgba(0,245,160,0.4)]');
        btn.classList.add('bg-white/5', 'text-mint-vibrant');
      }
    }

    const btnFlutuante = document.getElementById('btn-mapa-caneta-flutuante');
    if (btnFlutuante) {
      if (ativo) {
        btnFlutuante.classList.add('bg-mint-vibrant', 'text-slate-950', 'border-mint-vibrant', 'shadow-[0_0_12px_rgba(0,245,160,0.4)]');
        btnFlutuante.classList.remove('text-white/70');
      } else {
        btnFlutuante.classList.remove('bg-mint-vibrant', 'text-slate-950', 'border-mint-vibrant', 'shadow-[0_0_12px_rgba(0,245,160,0.4)]');
        btnFlutuante.classList.add('text-white/70');
      }
    }

    // Botão no ShadowRoot do Canvas se existir
    const canvasEl = document.getElementById('mapa-triagem') as any;
    if (canvasEl && canvasEl.shadowRoot) {
      const btnShadow = canvasEl.shadowRoot.getElementById('btn-tool-pen');
      if (btnShadow) {
        if (ativo) {
          btnShadow.classList.add('active');
        } else {
          btnShadow.classList.remove('active');
        }
      }
    }
  }

  /**
   * Exibe banner flutuante com instruções sobre o container do mapa
   */
  private exibirBanner(): void {
    const parent = document.getElementById('container-mapa-leaflet-parent');
    if (!parent) return;

    if (!this.bannerFlutuante) {
      this.bannerFlutuante = document.createElement('div');
      this.bannerFlutuante.id = 'banner-caneta-selecao';
      this.bannerFlutuante.className = 'absolute top-3 left-1/2 -translate-x-1/2 bg-[#0c1510]/90 backdrop-blur-md border border-mint-vibrant/40 shadow-2xl rounded-full px-4 py-1.5 z-[1000] flex items-center gap-3 text-xs text-white/90 select-none animate-in fade-in slide-in-from-top-2 duration-200';
      this.bannerFlutuante.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-mint-vibrant animate-ping"></span>
          <span class="font-bold text-mint-vibrant flex items-center gap-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
            Caneta de Seleção
          </span>
          <span class="text-white/40">|</span>
          <span id="txt-caneta-pontos-qtd" class="text-white/80 font-mono">0 vértices</span>
        </div>
        <span class="text-[10px] text-white/50 hidden sm:inline">Clique para adicionar · Duplo clique ou início para fechar</span>
        <div class="flex items-center gap-1.5 ml-1">
          <button id="btn-concluir-caneta" class="px-2.5 py-0.5 bg-mint-vibrant/20 hover:bg-mint-vibrant text-mint-vibrant hover:text-slate-950 font-bold rounded-full text-[10px] transition-all border border-mint-vibrant/30" type="button">
            Concluir
          </button>
          <button id="btn-desfazer-caneta" class="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-white/70 font-semibold rounded-full text-[10px] transition-all border border-white/10" type="button" title="Desfazer último vértice (Ctrl+Z)">
            Desfazer
          </button>
          <button id="btn-fechar-caneta" class="p-1 hover:bg-white/10 text-white/60 hover:text-white rounded-full transition-all" type="button" title="Cancelar (ESC)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;

      parent.appendChild(this.bannerFlutuante);

      // Eventos dos botões do banner
      this.bannerFlutuante.querySelector('#btn-concluir-caneta')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.concluirSelecao();
      });
      this.bannerFlutuante.querySelector('#btn-desfazer-caneta')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.desfazerUltimoVertice();
      });
      this.bannerFlutuante.querySelector('#btn-fechar-caneta')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.desativar();
      });
    }

    this.bannerFlutuante.style.display = 'flex';
    this.atualizarContadorBanner();
  }

  private ocultarBanner(): void {
    if (this.bannerFlutuante) {
      this.bannerFlutuante.style.display = 'none';
    }
  }

  private atualizarContadorBanner(): void {
    if (!this.bannerFlutuante) return;
    const txt = this.bannerFlutuante.querySelector('#txt-caneta-pontos-qtd');
    if (txt) {
      txt.textContent = `${this.vertices.length} ${this.vertices.length === 1 ? 'vértice' : 'vértices'}`;
    }
    const btnConcluir = this.bannerFlutuante.querySelector('#btn-concluir-caneta') as HTMLButtonElement;
    if (btnConcluir) {
      btnConcluir.disabled = this.vertices.length < 3;
      btnConcluir.style.opacity = this.vertices.length < 3 ? '0.4' : '1';
    }
  }
}
