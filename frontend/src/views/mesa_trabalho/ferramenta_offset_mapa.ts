import L from 'leaflet';
import { API_BASE } from '../../config';
import { showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import type { LadoOffset } from '../../types/verticesVirtuais';
import { gerarGeometriaPreviewOffsetPolilinha } from '../../utils/previewGeometria';

/**
 * Ferramenta Interativa de Deslocamento (Offset) no Mapa - Padrão AutoCAD
 * Permite ao operador selecionar pontos do eixo, definir a distância e mover o mouse
 * para a direita/esquerda do alinhamento vendo a ghost line em tempo real.
 * Um clique no mapa ou 'Enter' grava os vértices virtuais atomicamente.
 */
export class FerramentaOffsetMapa {
  private ctx: MesaTrabalhoContext;
  private ativo: boolean = false;
  private distancia: number = 15.0;
  private ladoDetectado: LadoOffset = 'DIREITA';

  private bannerElement: HTMLElement | null = null;
  private previewLayer: L.LayerGroup | null = null;

  // Handlers para registro e desregistro seguro
  private onMouseMoveBound: (e: L.LeafletMouseEvent) => void;
  private onMapClickBound: (e: L.LeafletMouseEvent) => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;

  constructor(ctx: MesaTrabalhoContext) {
    this.ctx = ctx;
    this.onMouseMoveBound = this.onMouseMove.bind(this);
    this.onMapClickBound = this.onMapClick.bind(this);
    this.onKeyDownBound = this.onKeyDown.bind(this);
  }

  public isAtivo(): boolean {
    return this.ativo;
  }

  public alternar(): void {
    if (this.ativo) this.desativar();
    else this.ativar();
  }

  public ativar(): void {
    if (this.ativo) return;
    const map = this.ctx.triagemMap;
    if (!map) {
      showToast('O mapa ainda não está pronto para a ferramenta de offset.', 'info');
      return;
    }

    const pontos = this.obterPontosOrigem();
    if (pontos.length < 2) {
      showToast('Selecione pelo menos 2 vértices no mapa ou tabela para aplicar o Offset.', 'info');
      return;
    }

    this.ativo = true;
    this.previewLayer = L.layerGroup().addTo(map);

    const container = map.getContainer();
    if (container) {
      container.style.cursor = 'crosshair';
      container.classList.add('modo-offset-cursor');
    }

    this.criarBannerFlutuante();
    this.atualizarPreview();

    map.on('mousemove', this.onMouseMoveBound);
    map.on('click', this.onMapClickBound);
    window.addEventListener('keydown', this.onKeyDownBound);
  }

  public desativar(): void {
    if (!this.ativo) return;
    this.ativo = false;

    const map = this.ctx.triagemMap;
    if (map) {
      map.off('mousemove', this.onMouseMoveBound);
      map.off('click', this.onMapClickBound);
      const container = map.getContainer();
      if (container) {
        container.style.cursor = '';
        container.classList.remove('modo-offset-cursor');
      }
      if (this.previewLayer) {
        map.removeLayer(this.previewLayer);
        this.previewLayer = null;
      }
    }

    window.removeEventListener('keydown', this.onKeyDownBound);
    this.removerBanner();
  }

  private obterPontosOrigem(): any[] {
    const todos = this.ctx.pontosList || [];
    if (this.ctx.selectedPontoIds && this.ctx.selectedPontoIds.length >= 2) {
      return this.ctx.selectedPontoIds
        .map(id => todos.find(p => p.id === id))
        .filter(Boolean);
    }
    // Fallback: primeiros pontos da matrícula
    return todos.filter(p => !p.ignorar_poligono).slice(0, 4);
  }

  private onMouseMove(e: L.LeafletMouseEvent): void {
    if (!this.ativo) return;
    const pontos = this.obterPontosOrigem();
    if (pontos.length < 2) return;

    // Detecta de qual lado da linha (P0 -> P1) o mouse está usando produto vetorial 2D
    const p0 = pontos[0];
    const p1 = pontos[1];
    const x0 = p0.lon || p0.lat; // coordenadas para orientação de tela
    const y0 = p0.lat;
    const x1 = p1.lon || p1.lat;
    const y1 = p1.lat;

    const mx = e.latlng.lng;
    const my = e.latlng.lat;

    // Determinante 2D: (x1 - x0)*(my - y0) - (y1 - y0)*(mx - x0)
    const det = (x1 - x0) * (my - y0) - (y1 - y0) * (mx - x0);
    const novoLado: LadoOffset = det < 0 ? 'DIREITA' : 'ESQUERDA';

    if (novoLado !== this.ladoDetectado) {
      this.ladoDetectado = novoLado;
      this.atualizarTextoBanner();
    }
    this.atualizarPreview();
  }

  private onMapClick(_e: L.LeafletMouseEvent): void {
    if (!this.ativo) return;
    // Clique no mapa confirma o lado e grava
    this.confirmarEGravacao();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.ativo) return;
    if (e.key === 'Escape') {
      this.desativar();
    } else if (e.key === 'Enter') {
      this.confirmarEGravacao();
    }
  }

  private atualizarPreview(): void {
    if (!this.previewLayer || !this.ctx.triagemMap) return;
    this.previewLayer.clearLayers();

    const pontos = this.obterPontosOrigem();
    if (pontos.length < 2) return;

    // Coleta coordenadas UTM ou aproximação métrica
    const ptsMetricos = pontos.map(p => ({
      este: Number(p.e_corrigido || p.e_original || 500000),
      norte: Number(p.n_corrigido || p.n_original || 7000000)
    }));

    const preview = gerarGeometriaPreviewOffsetPolilinha(ptsMetricos, this.distancia, this.ladoDetectado);
    if (preview.vertices.length === 0) return;

    // Projeta de volta para lat/lon em relação aos pontos de origem
    const latlngs: L.LatLngExpression[] = [];
    const ptRef = pontos[0];
    const eRef = Number(ptRef.e_corrigido || ptRef.e_original || 500000);
    const nRef = Number(ptRef.n_corrigido || ptRef.n_original || 7000000);

    preview.vertices.forEach((v, idx) => {
      const dE = v.este - eRef;
      const dN = v.norte - nRef;
      const dLat = dN / 111139.0;
      const dLon = dE / (111139.0 * Math.cos((ptRef.lat * Math.PI) / 180));
      const pos: [number, number] = [ptRef.lat + dLat, ptRef.lon + dLon];
      latlngs.push(pos);

      const marker = L.circleMarker(pos, {
        radius: 4,
        color: '#10b981',
        weight: 2,
        fillColor: '#059669',
        fillOpacity: 0.9
      });
      marker.bindTooltip(`V-${String(idx + 1).padStart(2, '0')} (${this.distancia}m ${this.ladoDetectado})`, {
        permanent: false,
        direction: 'top'
      });
      this.previewLayer?.addLayer(marker);
    });

    if (latlngs.length >= 2) {
      const line = L.polyline(latlngs, {
        color: '#10b981',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.9
      });
      this.previewLayer.addLayer(line);
    }
  }

  private async confirmarEGravacao(): Promise<void> {
    const levId = this.ctx.currentLevId;
    const matId = this.ctx.currentMatriculaId;
    if (!levId || !matId) return;

    const pontos = this.obterPontosOrigem();
    const pontoIds = pontos.map(p => p.id);

    try {
      showToast('Calculando e gerando vértices virtuais...', 'info');

      // 1. Calcula via backend oficial
      const resCalc = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/vertices-virtuais/calcular-offset-lote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ponto_ids: pontoIds,
          distancia: this.distancia,
          lado: this.ladoDetectado,
          prefixo_nome: 'V'
        })
      });
      const dataCalc = await resCalc.json();
      if (!resCalc.ok) throw new Error(dataCalc.detail || 'Erro ao calcular offset no servidor.');

      // 2. Persiste atomicamente
      const resConf = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/vertices-virtuais/confirmar-lote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fuso_utm: 22,
          vertices: dataCalc.resultados.map((r: any) => ({
            nome_vertice: r.nome,
            este: r.este,
            norte: r.norte,
            altitude: r.altitude,
            sigma_este: r.sigma_este,
            sigma_norte: r.sigma_norte,
            sigma_altitude: r.sigma_altitude,
            sigma_planimetrico: r.sigma_planimetrico,
            metodo: r.metodo
          }))
        })
      });
      const dataConf = await resConf.json();
      if (!resConf.ok) throw new Error(dataConf.detail || 'Erro ao persistir vértices virtuais.');

      showToast(`Sucesso! ${dataConf.total_inseridos} vértices virtuais criados com offset de ${this.distancia}m.`, 'success');
      this.desativar();

      if (typeof this.ctx.loadLevantamentoDetails === 'function') {
        await this.ctx.loadLevantamentoDetails();
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }

  private criarBannerFlutuante(): void {
    const parent = document.getElementById('container-mapa-leaflet-parent');
    if (!parent || this.bannerElement) return;

    this.bannerElement = document.createElement('div');
    this.bannerElement.id = 'banner-offset-mapa';
    this.bannerElement.className = 'absolute top-3 left-1/2 -translate-x-1/2 bg-[#0c1510]/95 backdrop-blur-md border border-emerald-500/50 shadow-2xl rounded-full px-4 py-1.5 z-[1000] flex items-center gap-3 text-xs text-white select-none animate-in fade-in slide-in-from-top-2 duration-200';
    this.bannerElement.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
        <span class="font-bold text-emerald-400 flex items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          Offset CAD
        </span>
        <span class="text-white/40">|</span>
        <span class="text-white/70">Distância:</span>
        <input id="input-dist-offset-flutuante" type="number" step="1" min="0.5" value="${this.distancia}" class="w-14 bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-xs text-white text-center font-mono focus:outline-none focus:border-emerald-400" />
        <span class="text-white/50 text-[10px]">m</span>
      </div>
      <span class="text-white/40">|</span>
      <span id="txt-lado-offset" class="font-bold font-mono text-emerald-300 px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20 text-[10px]">
        Lado: ${this.ladoDetectado}
      </span>
      <span class="text-[10px] text-white/50 hidden md:inline">Mova o cursor para definir o lado · Clique para confirmar</span>
      <div class="flex items-center gap-1.5 ml-1">
        <button id="btn-confirmar-offset-flutuante" class="px-2.5 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-full text-[10px] transition-all">
          Aplicar (Enter)
        </button>
        <button id="btn-cancelar-offset-flutuante" class="p-1 hover:bg-white/10 text-white/60 hover:text-white rounded-full transition-all" title="Cancelar (ESC)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;

    parent.appendChild(this.bannerElement);

    const inputDist = this.bannerElement.querySelector('#input-dist-offset-flutuante') as HTMLInputElement | null;
    inputDist?.addEventListener('input', (e) => {
      this.distancia = parseFloat((e.target as HTMLInputElement).value) || 0;
      this.atualizarPreview();
    });
    inputDist?.addEventListener('click', (e) => e.stopPropagation());

    this.bannerElement.querySelector('#btn-confirmar-offset-flutuante')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmarEGravacao();
    });
    this.bannerElement.querySelector('#btn-cancelar-offset-flutuante')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.desativar();
    });
  }

  private atualizarTextoBanner(): void {
    if (!this.bannerElement) return;
    const txtLado = this.bannerElement.querySelector('#txt-lado-offset');
    if (txtLado) {
      txtLado.textContent = `Lado: ${this.ladoDetectado}`;
    }
  }

  private removerBanner(): void {
    if (this.bannerElement) {
      this.bannerElement.remove();
      this.bannerElement = null;
    }
  }
}
