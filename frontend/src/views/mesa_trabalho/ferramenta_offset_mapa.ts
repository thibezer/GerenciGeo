import L from 'leaflet';
import { API_BASE } from '../../config';
import { showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import type { LadoOffset } from '../../types/verticesVirtuais';
import { criarPlanoLocal, gerarGeometriaPreviewOffsetPolilinha, type Ponto2D } from '../../utils/previewGeometria';
import { coordenadaPonto, zonaUtmDoLevantamento } from './coordenadas_mapa';
import { ordenarSequenciaOffset, pontosDoPerimetro, removerCoincidentes } from './offset_sequencia';

interface GeometriaOffset {
  pontos: any[];
  fechado: boolean;
  plano: ReturnType<typeof criarPlanoLocal>;
  /** Vértices de origem no plano local, na ordem do caminhamento */
  pts: Ponto2D[];
}

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

    if (!this.obterGeometria()) {
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

  /** Pontos de origem na ordem do caminhamento (não na ordem em que foram selecionados) */
  private obterSequencia(): { pontos: any[]; fechado: boolean } {
    const todos = this.ctx.pontosList || [];
    if (this.ctx.selectedPontoIds && this.ctx.selectedPontoIds.length >= 2) {
      const selecionados = this.ctx.selectedPontoIds
        .map(id => todos.find(p => String(p.id) === String(id)))
        .filter(Boolean);
      const matId = selecionados[0]?.matricula_id ?? this.ctx.currentMatriculaId;
      return ordenarSequenciaOffset(selecionados, pontosDoPerimetro(todos, matId));
    }
    // Fallback: primeiros pontos do perímetro da matrícula ativa
    const matId = this.ctx.currentMatriculaId;
    const perimetro = pontosDoPerimetro(todos, matId);
    if (perimetro.length >= 2) return { pontos: perimetro.slice(0, 4), fechado: false };
    const pontosMat = matId
      ? todos.filter(p => String(p.matricula_id) === String(matId) && !p.ignorar_poligono)
      : todos.filter(p => !p.ignorar_poligono);
    return { pontos: pontosMat.slice(0, 4), fechado: false };
  }

  /**
   * Geometria de origem num plano local centrado no 1º vértice, a partir da posição verdadeira de cada
   * ponto (coordenadaPonto) — a mesma que o mapa desenha e que o backend usa no cálculo.
   */
  private obterGeometria(): GeometriaOffset | null {
    const seq = this.obterSequencia();
    const c0 = seq.pontos.map(coordenadaPonto).find(Boolean);
    if (!c0) return null;
    const plano = criarPlanoLocal(c0.lat, c0.lon);
    const noPlano = (p: any) => {
      const c = coordenadaPonto(p);
      return c ? plano.paraPlano(c.lat, c.lon) : null;
    };

    let fechado = seq.fechado;
    const pontos = removerCoincidentes(seq.pontos, noPlano, fechado);
    if (fechado && pontos.length < 3) fechado = false;
    if (pontos.length < 2) return null;
    return { pontos, fechado, plano, pts: pontos.map(p => noPlano(p)!) };
  }

  private onMouseMove(e: L.LeafletMouseEvent): void {
    if (!this.ativo) return;
    const geo = this.obterGeometria();
    if (!geo) return;

    // Lado em relação ao trecho mais próximo do cursor (produto vetorial 2D), não só ao 1º trecho:
    // numa polilinha que dobra, o 1º trecho pode apontar o lado contrário ao que o usuário vê.
    const m = geo.plano.paraPlano(e.latlng.lat, e.latlng.lng);
    const n = geo.pts.length;
    const numSegmentos = geo.fechado ? n : n - 1;
    let det = 0;
    let menorDist = Infinity;
    for (let i = 0; i < numSegmentos; i++) {
      const a = geo.pts[i];
      const b = geo.pts[(i + 1) % n];
      const dx = b.este - a.este;
      const dy = b.norte - a.norte;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) continue;
      const t = Math.max(0, Math.min(1, ((m.este - a.este) * dx + (m.norte - a.norte) * dy) / len2));
      const dist = Math.hypot(m.este - (a.este + t * dx), m.norte - (a.norte + t * dy));
      if (dist < menorDist) {
        menorDist = dist;
        det = dx * (m.norte - a.norte) - dy * (m.este - a.este);
      }
    }
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

    const geo = this.obterGeometria();
    if (!geo) return;

    const preview = gerarGeometriaPreviewOffsetPolilinha(geo.pts, this.distancia, this.ladoDetectado, geo.fechado);
    if (preview.vertices.length === 0) return;

    const latlngs: L.LatLngExpression[] = [];
    preview.vertices.forEach((v, idx) => {
      const g = geo.plano.paraGeo(v);
      const pos: [number, number] = [g.lat, g.lon];
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
      const line = L.polyline(geo.fechado ? [...latlngs, latlngs[0]] : latlngs, {
        color: '#10b981',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.9
      });
      this.previewLayer.addLayer(line);
    }
    this.atualizarTextoBanner(geo.fechado);
  }

  private async confirmarEGravacao(): Promise<void> {
    const levId = this.ctx.currentLevId;
    const matId = this.ctx.currentMatriculaId;
    if (!levId || !matId) return;

    const geo = this.obterGeometria();
    if (!geo) return;
    const { pontos, fechado } = geo;
    const pontoIds = pontos.map(p => p.id);
    const fuso = Number(pontos.find(p => p.fuso_utm)?.fuso_utm)
      || (this.ctx.mapaController?.fusoUtm)
      || zonaUtmDoLevantamento(this.ctx.pontosList)
      || 22;

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
          prefixo_nome: 'V',
          fuso_utm: fuso,
          fechado
        })
      });
      const dataCalc = await resCalc.json();
      if (!resCalc.ok) throw new Error(dataCalc.detail || 'Erro ao calcular offset no servidor.');

      // 2. Persiste atomicamente, no mesmo fuso em que o servidor calculou os E/N
      const resConf = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/vertices-virtuais/confirmar-lote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fuso_utm: Number(dataCalc.fuso_utm) || fuso,
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

  private atualizarTextoBanner(fechado: boolean = false): void {
    if (!this.bannerElement) return;
    const txtLado = this.bannerElement.querySelector('#txt-lado-offset');
    if (txtLado) {
      txtLado.textContent = `Lado: ${this.ladoDetectado}${fechado ? ' · Polígono fechado' : ''}`;
    }
  }

  private removerBanner(): void {
    if (this.bannerElement) {
      this.bannerElement.remove();
      this.bannerElement = null;
    }
  }
}
