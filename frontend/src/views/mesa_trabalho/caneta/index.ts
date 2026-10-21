import L from 'leaflet';
import { showToast } from '../../../utils';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';
import { focoEmCampoDeTexto, alvoAcionavelPorTeclado } from '../foco_texto';
import {
  TOLERANCIA_IMA_PX,
  aplicarIma,
  filtrarPontosNoPoligono,
  pontoDentroDoPoligono,
  lerImaConfigurado
} from './caneta_geometria';
import { CanetaDesenhoRenderer } from './caneta_desenho';
import { BannerCanetaManager, sincronizarBotoesCanetaUI } from './caneta_overlay';

export { TOLERANCIA_IMA_PX, pontoDentroDoPoligono, lerImaConfigurado };

/**
 * Ferramenta Caneta de Seleção Poligonal (Estilo Pen Tool / Photoshop)
 * Permite ao operador clicar no mapa sucessivamente para definir os vértices
 * de um polígono arbitrário, selecionando todos os pontos contidos dentro dele.
 */
export class FerramentaCanetaSelecao {
  private ctx: MesaTrabalhoContext;
  private ativo: boolean = false;
  private vertices: L.LatLng[] = [];

  private renderer = new CanetaDesenhoRenderer();
  private bannerManager: BannerCanetaManager;

  // Handlers vinculados para desregistro seguro
  private onMapClickBound: (e: L.LeafletMouseEvent) => void;
  private onMapMouseMoveBound: (e: L.LeafletMouseEvent) => void;
  private onMapDblClickBound: (e: L.LeafletMouseEvent) => void;
  private onMapContextMenuBound: (e: L.LeafletMouseEvent) => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;

  constructor(ctx: MesaTrabalhoContext) {
    this.ctx = ctx;
    this.bannerManager = new BannerCanetaManager({
      onConcluir: () => this.concluirSelecao(),
      onDesfazer: () => this.desfazerUltimoVertice(),
      onFechar: () => this.desativar()
    });

    this.onMapClickBound = this.onMapClick.bind(this);
    this.onMapMouseMoveBound = this.onMapMouseMove.bind(this);
    this.onMapDblClickBound = this.onMapDblClick.bind(this);
    this.onMapContextMenuBound = this.onMapContextMenu.bind(this);
    this.onKeyDownBound = this.onKeyDown.bind(this);
  }

  public isAtivo(): boolean {
    return this.ativo;
  }

  public temVerticesPendentes(): boolean {
    return this.ativo && this.vertices.length > 0;
  }

  public disponivel(): boolean {
    return this.ctx.etapaAtiva === 'geoprocessamento';
  }

  public alternar(): void {
    if (this.ativo) this.desativar();
    else this.ativar();
  }

  public ativar(): void {
    if (this.ativo) return;
    if (!this.disponivel()) {
      showToast('A Caneta de Seleção só está disponível na aba Geoprocessamento.', 'info');
      return;
    }
    const map = this.obterMapa();
    if (!map) {
      showToast('Mapa ainda não está pronto para a ferramenta caneta.', 'info');
      return;
    }

    this.ativo = true;
    this.vertices = [];

    if (this.ctx.modoReordenarAtivo && typeof this.ctx.alternarModoReordenarManual === 'function') {
      this.ctx.alternarModoReordenarManual(false);
    }
    this.ctx.modoCliqueSequencialAtivo = false;

    this.renderer.inicializar(map);

    const container = map.getContainer();
    if (container) {
      container.style.cursor = 'crosshair';
      container.classList.add('modo-caneta-cursor');
    }

    map.doubleClickZoom.disable();
    map.on('click', this.onMapClickBound);
    map.on('mousemove', this.onMapMouseMoveBound);
    map.on('dblclick', this.onMapDblClickBound);
    map.on('contextmenu', this.onMapContextMenuBound);
    window.addEventListener('keydown', this.onKeyDownBound, true);

    sincronizarBotoesCanetaUI(true);
    this.bannerManager.exibir(0);
    showToast('Caneta de Seleção ativada: Clique no mapa para desenhar o polígono.', 'info');
  }

  public desativar(): void {
    this.ativo = false;
    this.vertices = [];
    this.renderer.limpar();
    this.renderer.destruir();

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

    window.removeEventListener('keydown', this.onKeyDownBound, true);
    this.bannerManager.ocultar();
    sincronizarBotoesCanetaUI(false);
  }

  private limparDesenho(): void {
    this.vertices = [];
    this.renderer.limpar();
    this.bannerManager.atualizarContador(0);
  }

  private onMapClick(e: L.LeafletMouseEvent): void {
    if (!this.ativo) return;
    const map = this.obterMapa();
    if (!map) return;

    if (this.vertices.length >= 3 && this.renderer.getMarcadorInicio()) {
      const pontoPixelClique = map.latLngToContainerPoint(e.latlng);
      const pontoPixelInicio = map.latLngToContainerPoint(this.vertices[0]);
      if (pontoPixelClique.distanceTo(pontoPixelInicio) <= 18) {
        this.concluirSelecao(e.originalEvent?.ctrlKey || e.originalEvent?.shiftKey);
        return;
      }
    }

    const novoVertice = aplicarIma(map, e.latlng, this.ctx);
    this.vertices.push(novoVertice);

    this.renderer.adicionarVertice(novoVertice, this.vertices.length === 1);
    this.renderer.atualizarPoligono(this.vertices);
    this.bannerManager.atualizarContador(this.vertices.length);
  }

  private onMapMouseMove(e: L.LeafletMouseEvent): void {
    if (!this.ativo || this.vertices.length === 0) return;
    const map = this.obterMapa();
    if (map) {
      this.renderer.atualizarLinhaGuia(map, this.vertices, e.latlng);
    }
  }

  private onMapDblClick(e: L.LeafletMouseEvent): void {
    if (!this.ativo || this.vertices.length < 3) return;
    if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
    this.concluirSelecao(e.originalEvent?.ctrlKey || e.originalEvent?.shiftKey);
  }

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

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.ativo) return;
    if (focoEmCampoDeTexto(e)) return;

    const consumir = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    if (e.key === 'Escape') {
      if (this.vertices.length > 0) {
        consumir();
        this.limparDesenho();
        showToast('Traçado cancelado.', 'info');
      } else {
        this.desativar();
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (this.vertices.length >= 3 && !alvoAcionavelPorTeclado(e)) {
        consumir();
        this.concluirSelecao(e.ctrlKey || e.shiftKey);
      }
    } else if ((e.ctrlKey && e.key.toLowerCase() === 'z') || e.key === 'Backspace') {
      if (this.vertices.length > 0) {
        consumir();
        this.desfazerUltimoVertice();
      }
    }
  }

  public desfazerUltimoVertice(): void {
    if (this.vertices.length === 0) return;
    this.vertices.pop();
    this.renderer.removerUltimoVertice();
    this.renderer.atualizarPoligono(this.vertices);
    this.bannerManager.atualizarContador(this.vertices.length);
    showToast('Último vértice removido.', 'info');
  }

  public concluirSelecao(aditiva: boolean = false): void {
    if (this.vertices.length < 3) {
      showToast('Defina pelo menos 3 pontos para formar uma área de seleção.', 'info');
      return;
    }

    const { pontosContidosIds, vizinhosContidosIds } = filtrarPontosNoPoligono(this.vertices, this.ctx);

    if (pontosContidosIds.length === 0 && vizinhosContidosIds.length === 0) {
      showToast('Nenhum vértice encontrado dentro do polígono desenhado.', 'info');
      this.limparDesenho();
      return;
    }

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

    if (typeof this.ctx.atualizarDestaqueLinhasTabela === 'function') {
      this.ctx.atualizarDestaqueLinhasTabela();
    }
    if (typeof this.ctx.atualizarPainelPropriedades === 'function') {
      this.ctx.atualizarPainelPropriedades();
    }

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
}
