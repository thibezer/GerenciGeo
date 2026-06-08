import L from 'leaflet';
import { API_BASE } from '../config';

/**
 * Controller Dedicado para o Mapa Leaflet da Mesa de Trabalho
 * 
 * Centraliza a gerência do mapa interativo, as camadas WMS do SIGEF,
 * a plotagem de marcadores de vértices e linhas de divisa, e as
 * operações espaciais como centralização e bounds.
 */
export class MesaTrabalhoMapa {
  private map: L.Map | null = null;
  private markers: L.Marker[] = [];
  private polylines: L.Polyline[] = [];
  private satelliteLayer: L.TileLayer | null = null;
  private gridGroup: L.LayerGroup | null = null;
  public modoCliqueSequencialAtivo: boolean = false;
  private sigefLayer: L.TileLayer.WMS | null = null;
  public levantamentoId: number | null = null;

  constructor() {}

  /**
   * Inicializa a instância do mapa no container especificado
   */
  public init(containerId: string): L.Map | null {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    const mapContainer = document.getElementById(containerId);
    if (!mapContainer) return null;

    // Configura o mapa com maxZoom 24 para permitir aproximar muito perto dos pontos
    this.map = L.map(containerId, {
      maxZoom: 24
    }).setView([-23.7661, -53.3204], 14);

    // Google Satélite Pane
    const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 24, // Permite acompanhar o zoom do mapa
      maxNativeZoom: 20, // O satélite físico do Google só tem tiles até 20
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: 'Google Maps',
      keepBuffer: 16, // Mantém 16 tiles vizinhos carregados na memória
      updateWhenZooming: false, // Sem flicker no meio do zoom
      updateWhenIdle: true // Só carrega novos tiles quando o mapa parar
    }).addTo(this.map);

    this.satelliteLayer = googleSat;

    // Inicializa a camada de grade a cada 1 metro
    this.gridGroup = L.layerGroup().addTo(this.map);

    // Registra listeners para desenhar a grade dinamicamente sob zooms altos
    this.map.on('zoomend moveend', () => this.atualizarGrade());

    // SIGEF Pane (Criado sob medida para ficar atrás dos marcadores e polilinhas)
    this.map.createPane('sigefPane');
    const sigefPane = this.map.getPane('sigefPane');
    if (sigefPane) {
      sigefPane.style.zIndex = '390';
      sigefPane.style.pointerEvents = 'none';
    }

    // Pane para os Marcadores de Vértices da Mesa de Trabalho (para ficarem garantidamente acima das polilinhas)
    this.map.createPane('verticesPane');
    const verticesPane = this.map.getPane('verticesPane');
    if (verticesPane) {
      verticesPane.style.zIndex = '650';
      verticesPane.style.pointerEvents = 'auto';
    }

    // Pane para as Linhas de Perímetro/Divisas (atrás dos marcadores, mas na frente do SIGEF e satélite)
    this.map.createPane('perimetroPane');
    const perimetroPane = this.map.getPane('perimetroPane');
    if (perimetroPane) {
      perimetroPane.style.zIndex = '450';
      perimetroPane.style.pointerEvents = 'auto';
    }

    const sigef = L.tileLayer.wms('https://acervofundiario.incra.gov.br/i3geo/ogc.php', {
      layers: 'certificada_sigef_particular_pr',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      pane: 'sigefPane',
      attribution: 'INCRA/SIGEF',
      className: 'sigef-wms-layer',
      keepBuffer: 8,
      updateWhenZooming: false,
      updateWhenIdle: true
    }).addTo(this.map);

    this.sigefLayer = sigef;

    L.control.layers({ "Satélite Google": googleSat }, { "Imóveis SIGEF (PR)": sigef }, { collapsed: true }).addTo(this.map);

    // Registra clique no mapa para consultar metadados das parcelas vizinhas do SIGEF WMS
    this.map.on('click', async (e: L.LeafletMouseEvent) => {
      // 1. Não faz nada se estiver no modo de clique sequencial
      if (this.modoCliqueSequencialAtivo) return;

      // 2. Só executa se a camada do SIGEF estiver ativada/visível no mapa
      if (this.sigefLayer && this.map && this.map.hasLayer(this.sigefLayer)) {
        await this.consultarSigef(e);
      }
    });

    return this.map;
  }

  /**
   * Retorna a instância do mapa Leaflet
   */
  public getMap(): L.Map | null {
    return this.map;
  }

  /**
   * Destrói a instância do mapa
   */
  public destroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.clearOverlays();
  }

  /**
   * Limpa todos os marcadores e polilinhas ativos no mapa
   */
  public clearOverlays(): void {
    if (this.map) {
      this.markers.forEach(m => this.map!.removeLayer(m));
      this.polylines.forEach(pl => this.map!.removeLayer(pl));
    }
    this.markers = [];
    this.polylines = [];
  }

  /**
   * Recalcula a viewport geográfica do mapa (invalidateSize)
   */
  public invalidateSize(): void {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  /**
   * Centraliza a tela do mapa com base nas coordenadas de um conjunto de pontos
   */
  public fitBounds(pontos: any[], padding: [number, number] = [40, 40]): void {
    if (!this.map) return;

    const validCoords = pontos
      .filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0)
      .map(p => L.latLng(p.lat, p.lon));

    if (validCoords.length > 0) {
      const bounds = L.latLngBounds(validCoords);
      this.map.fitBounds(bounds, { padding });

      // Pré-carrega os tiles de satélite ao redor da propriedade em múltiplos
      // níveis de zoom para que a navegação subsequente seja instantânea
      this.map.once('moveend', () => {
        this.preCarregarTilesRegiao(bounds);
      });
    }
  }

  /**
   * Plota os marcadores de vértices na tela do mapa
   */
  public plotPontos(
    pontos: any[],
    onMarkerClick: (pId: number) => void
  ): void {
    if (!this.map) return;

    pontos.forEach(p => {
      if (p.lat && p.lon && p.lat !== 0 && p.lon !== 0) {
        const isBaseFisica = p.tipo_ponto === 'B' || p.tipo === 'B';
        const isBasePPP = p.tipo_ponto === 'M' || p.tipo === 'M';
        let markerBg = 'bg-mint-vibrant text-[#0c1510]';
        
        if (isBasePPP) {
          markerBg = 'bg-indigo-600 text-white';
        } else if (isBaseFisica) {
          markerBg = 'bg-rose-600 text-white';
        }

        const markerHtml = `
          <div class="w-5 h-5 ${markerBg} border-2 border-[#0c1510] rounded-full flex items-center justify-center text-[7px] font-bold font-mono shadow-lg transition-transform hover:scale-125" id="map-marker-${p.id}">
            ${p.nome_vertice.substring(0, 3)}
          </div>
        `;
        const customIcon = L.divIcon({
          html: markerHtml,
          className: 'custom-leaflet-marker',
          iconSize: [20, 20]
        });

        const popupRole = isBasePPP 
          ? 'Base Homologada PPP' 
          : (isBaseFisica ? 'Base de Campo (Translação)' : 'Vértice de Perímetro');

        const marker = L.marker([p.lat, p.lon], { 
          icon: customIcon,
          pane: 'verticesPane'
        });
        
        if (!this.modoCliqueSequencialAtivo) {
          marker.bindPopup(`
            <div style="font-family:'Manrope',sans-serif; color:#1a1a1a; line-height:1.3;">
              <div style="font-weight:700; font-size:13px; margin-bottom:4px;">${p.nome_vertice}</div>
              <div style="font-size:11px; color:#555;">${popupRole} · ${p.tipo_ponto || p.tipo}</div>
              <div style="font-size:11px; color:#777; font-family:'JetBrains Mono',monospace; margin-top:4px;">Lat ${p.lat.toFixed(6)} &nbsp; Lon ${p.lon.toFixed(6)}</div>
            </div>
          `, {
            className: 'compact-popup',
            maxWidth: 220
          });
        }
        
        marker.addTo(this.map!);
        marker.setZIndexOffset(1000); // Garante que o vértice fique acima da polilinha no empilhamento

        marker.on('click', () => {
          onMarkerClick(p.id);
        });

        (marker as any).pontoId = p.id;
        this.markers.push(marker);
      }
    });
  }

  /**
   * Plota as linhas de divisa oficiais
   */
  public plotSegmentos(segmentos: any[], pontos: any[]): void {
    if (!this.map) return;

    segmentos.forEach(s => {
      const pIni = pontos.find(p => p.id === s.ponto_inicio_id);
      const pFim = pontos.find(p => p.id === s.ponto_fim_id);

      if (pIni && pFim && pIni.lat && pIni.lon && pFim.lat && pFim.lon) {
        const color = s.tipo_limite_sigef === 'LA1' ? '#10b981' : '#3b82f6';
        const polyline = L.polyline([[pIni.lat, pIni.lon], [pFim.lat, pFim.lon]], {
          color: color,
          weight: 4,
          dashArray: s.tipo_limite_sigef === 'LN1' ? '6, 6' : undefined,
          pane: 'perimetroPane'
        }).bindPopup(`
          <div style="font-family:'Manrope',sans-serif; color:#1a1a1a; line-height:1.3;">
            <div style="font-weight:700; font-size:12px; margin-bottom:3px;">${pIni.nome_vertice} ↔ ${pFim.nome_vertice}</div>
            <div style="font-size:11px; color:#555;">Limite: ${s.tipo_limite_sigef} · ${s.metodo_posicionamento_sigef}</div>
          </div>
        `, {
          className: 'compact-popup',
          maxWidth: 220
        }).addTo(this.map!);
        polyline.bringToBack(); // Garante que a linha fique abaixo dos vértices clicáveis

        this.polylines.push(polyline);
      }
    });
  }

  /**
   * Plota a polilinha temporária de fechamento perimetral em lote completo (Etapa 2)
   */
  public plotPolilinhaTemporaria(pontos: any[]): void {
    if (!this.map) return;

    const validPoints = pontos
      .filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0 && p.tipo_ponto !== 'B' && p.tipo !== 'B' && p.ignorar_poligono !== 1)
      .sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

    if (validPoints.length < 2) return;

    // Conecta sequencialmente 1 -> 2 -> ... -> N-1
    for (let i = 0; i < validPoints.length - 1; i++) {
      const pIni = validPoints[i];
      const pFim = validPoints[i + 1];
      const polyline = L.polyline([[pIni.lat, pIni.lon], [pFim.lat, pFim.lon]], {
        color: '#10b981',
        weight: 4,
        pane: 'perimetroPane'
      }).addTo(this.map!);
      polyline.bringToBack(); // Garante que a linha fique abaixo dos vértices
      this.polylines.push(polyline);
    }

    // Fechamento da malha de polígono N -> 1
    const pLast = validPoints[validPoints.length - 1];
    const pFirst = validPoints[0];
    const polylineClose = L.polyline([[pLast.lat, pLast.lon], [pFirst.lat, pFirst.lon]], {
      color: '#10b981',
      weight: 4,
      dashArray: '4, 4',
      pane: 'perimetroPane'
    }).addTo(this.map!);
    polylineClose.bringToBack(); // Garante que a linha de fechamento fique abaixo dos vértices
    this.polylines.push(polylineClose);
  }

  public selectPonto(pId: number, zoomLevel?: number): void {
    if (!this.map) return;
    const marker = this.markers.find(m => (m as any).pontoId === pId);
    if (marker) {
      const targetZoom = zoomLevel !== undefined ? zoomLevel : this.map.getZoom();
      this.map.setView(marker.getLatLng(), targetZoom);
      marker.openPopup();
    }
  }
  /**
   * Pré-carrega tiles de satélite ao redor dos bounds da propriedade em múltiplos
   * níveis de zoom (warm-up). Os tiles são baixados em background via Image() para
   * ficarem no cache HTTP do navegador, eliminando o piscar em navegações futuras.
   */
  private preCarregarTilesRegiao(bounds: L.LatLngBounds): void {
    if (!this.map) return;

    const currentZoom = this.map.getZoom();
    // Pré-carrega do zoom atual até o zoom 20 (nativo máximo do satélite)
    const minZoom = Math.max(Math.floor(currentZoom) - 2, 10);
    const maxZoom = Math.min(Math.floor(currentZoom) + 3, 20);

    // Expande os bounds em ~50% para cobrir a vizinhança da propriedade
    const expandedBounds = bounds.pad(0.5);

    const subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
    let tileCount = 0;
    const MAX_TILES = 300; // Limite para não sobrecarregar a rede

    for (let z = minZoom; z <= maxZoom && tileCount < MAX_TILES; z++) {
      // Converte os cantos dos bounds para coordenadas de tile no nível de zoom z
      const nw = expandedBounds.getNorthWest();
      const se = expandedBounds.getSouthEast();

      const tileMinX = this.lonToTileX(nw.lng, z);
      const tileMaxX = this.lonToTileX(se.lng, z);
      const tileMinY = this.latToTileY(nw.lat, z);
      const tileMaxY = this.latToTileY(se.lat, z);

      for (let x = tileMinX; x <= tileMaxX && tileCount < MAX_TILES; x++) {
        for (let y = tileMinY; y <= tileMaxY && tileCount < MAX_TILES; y++) {
          const subdomain = subdomains[(x + y) % subdomains.length];
          const url = `https://${subdomain}.google.com/vt/lyrs=s,h&x=${x}&y=${y}&z=${z}`;
          
          // Carrega o tile em background — o browser faz cache HTTP automaticamente
          const img = new Image();
          img.src = url;
          tileCount++;
        }
      }
    }

    console.log(`[GerenciGeo] Warm-up: ${tileCount} tiles pré-carregados ao redor da propriedade (zoom ${minZoom}-${maxZoom})`);
  }

  /** Converte longitude para coordenada X de tile */
  private lonToTileX(lon: number, zoom: number): number {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  }

  /** Converte latitude para coordenada Y de tile */
  private latToTileY(lat: number, zoom: number): number {
    const latRad = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
        Math.pow(2, zoom)
    );
  }

  /**
   * Redesenha a grade de 1m a partir do zoom 21 e desliga o satélite Google
   */
  private atualizarGrade(): void {
    if (!this.map) return;
    const zoom = this.map.getZoom();

    if (!this.gridGroup) {
      this.gridGroup = L.layerGroup().addTo(this.map);
    } else {
      this.gridGroup.clearLayers();
    }

    if (zoom > 20) {
      // Oculta o satélite Google quando exceder o zoom limite
      if (this.satelliteLayer) {
        this.satelliteLayer.setOpacity(0);
      }

      const bounds = this.map.getBounds();
      const south = bounds.getSouth();
      const north = bounds.getNorth();
      const west = bounds.getWest();
      const east = bounds.getEast();
      const center = this.map.getCenter();

      // Projeção local simplificada (1 metro em graus a partir da latitude central do Paraná)
      const latGridStep = 0.000008999;
      const cosLat = Math.cos(center.lat * Math.PI / 180);
      const lonGridStep = latGridStep / (cosLat > 0.1 ? cosLat : 1.0);

      const latLinesCount = Math.floor((north - south) / latGridStep);
      const lonLinesCount = Math.floor((east - west) / lonGridStep);

      // Limita a renderização a um número aceitável de linhas para não travar
      if (latLinesCount < 200 && lonLinesCount < 200) {
        // Linhas horizontais (Latitudes inteiras a cada 1m)
        const startLat = Math.ceil(south / latGridStep) * latGridStep;
        for (let lat = startLat; lat <= north; lat += latGridStep) {
          L.polyline([[lat, west], [lat, east]], {
            color: 'rgba(0, 245, 160, 0.15)', // Cor verde-menta premium e sutil
            weight: 0.6,
            interactive: false
          }).addTo(this.gridGroup);
        }

        // Linhas verticais (Longitudes inteiras a cada 1m)
        const startLon = Math.ceil(west / lonGridStep) * lonGridStep;
        for (let lon = startLon; lon <= east; lon += lonGridStep) {
          L.polyline([[south, lon], [north, lon]], {
            color: 'rgba(0, 245, 160, 0.15)',
            weight: 0.6,
            interactive: false
          }).addTo(this.gridGroup);
        }
      }
    } else {
      // Reativa o satélite do Google em zooms menores
      if (this.satelliteLayer) {
        this.satelliteLayer.setOpacity(1);
      }
    }
  }

  /**
   * Consulta os metadados da parcela no WMS do SIGEF via GetFeatureInfo e abre popup com link de download
   */
  private async consultarSigef(e: L.LeafletMouseEvent): Promise<void> {
    if (!this.map) return;

    const size = this.map.getSize();
    const bounds = this.map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const bbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
    const x = Math.round(this.map.layerPointToContainerPoint(e.layerPoint).x);
    const y = Math.round(this.map.layerPointToContainerPoint(e.layerPoint).y);

    const targetUrl = `https://acervofundiario.incra.gov.br/i3geo/ogc.php?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&FORMAT=image/png&TRANSPARENT=true&QUERY_LAYERS=certificada_sigef_particular_pr&LAYERS=certificada_sigef_particular_pr&INFO_FORMAT=application/json&X=${x}&Y=${y}&WIDTH=${size.x}&HEIGHT=${size.y}&SRS=EPSG:4326&BBOX=${bbox}`;

    // Altera o cursor para indicação de carregamento no container do mapa
    const mapContainer = this.map.getContainer();
    mapContainer.style.cursor = 'wait';

    // Cria um loading popup temporário na coordenada clicada
    const loadingPopup = L.popup({
      className: 'compact-sigef-popup',
      maxWidth: 250
    })
      .setLatLng(e.latlng)
      .setContent(`
        <div style="font-family:'Manrope',sans-serif; display:flex; align-items:center; gap:8px; color:#555; font-size:12px;">
          <svg style="animation:spin 1s linear infinite; width:14px; height:14px; flex-shrink:0;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="#ccc" stroke-width="4" fill="none"></circle>
            <path fill="#10b981" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Consultando SIGEF...
        </div>
      `)
      .openOn(this.map);

    try {
      const res = await fetch(`${API_BASE}/proxy/sigef?url=${encodeURIComponent(targetUrl)}`);
      const data = await res.json();

      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const props = feature.properties;
        const uuid = feature.id || props.parcela_codigo || props.co_parcela || props.id_parcela;

        if (uuid) {
          const downloadUrl = `https://sigef.incra.gov.br/geo/exportar/parcela/shp/${uuid}/`;
          const sigefConsultarUrl = `https://sigef.incra.gov.br/geo/parcela/detalhe/${uuid}/`;
          
          const popupContent = `
            <div style="font-family:'Manrope',sans-serif; color:#1a1a1a; line-height:1.4; min-width:180px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid #e5e5e5;">
                <span style="font-weight:700; font-size:11px; color:#10b981; text-transform:uppercase; letter-spacing:0.5px;">SIGEF</span>
                <span style="font-size:10px; color:#999;">${props.situacao_informada || props.status || 'Certificada'}</span>
              </div>
              <div style="font-weight:700; font-size:12px; margin-bottom:4px; word-break:break-word;">${props.nome_area || props.nome_imovel || 'Imóvel Sem Nome'}</div>
              <div style="font-size:11px; color:#555; margin-bottom:2px;">Cód: <span style="font-family:'JetBrains Mono',monospace;">${props.codigo_imovel || 'N/A'}</span></div>
              <div style="display:flex; gap:12px; font-size:11px; color:#555; margin-bottom:6px;">
                <span>Mat: <strong style="color:#1a1a1a;">${props.registro_matricula || props.matricula || 'N/A'}</strong></span>
                <span>${props.data_submissao || ''}</span>
              </div>
              <div style="display:flex; flex-direction:column; gap:5px; padding-top:6px; border-top:1px solid #e5e5e5;">
                <a href="${downloadUrl}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:5px; padding:5px 8px; background:#e6faf1; border:1px solid #a7f3d0; color:#059669; font-size:11px; font-weight:700; border-radius:5px; text-decoration:none; cursor:pointer;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Baixar Shapefile
                </a>
                <button onclick="window.importarVizinhoSIGEF('${uuid}', '${(props.nome_area || props.nome_imovel || 'Imóvel').replace(/'/g, "\\'")}')" style="display:flex; align-items:center; justify-content:center; gap:5px; padding:5px 8px; background:#e0f2fe; border:1px solid #bae6fd; color:#0369a1; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer; width:100%; text-align:center;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Importar Confrontante (CSV)
                </button>
                <a href="${sigefConsultarUrl}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:4px; padding:4px 6px; background:#f5f5f5; border:1px solid #e0e0e0; color:#555; font-size:10px; font-weight:600; border-radius:5px; text-decoration:none; cursor:pointer;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Abrir no SIGEF
                </a>
              </div>
            </div>
          `;
          
          loadingPopup.setContent(popupContent);
        } else {
          loadingPopup.setContent(`
            <div style="font-family:'Manrope',sans-serif; font-size:12px; color:#b45309; padding:2px 0;">
              Lote identificado, mas código da parcela indisponível.
            </div>
          `);
        }
      } else {
        // Remove o loading popup se não clicou em nada
        this.map.closePopup(loadingPopup);
      }
    } catch (err) {
      console.warn("Erro ao consultar SIGEF:", err);
      loadingPopup.setContent(`
        <div style="font-family:'Manrope',sans-serif; font-size:12px; color:#dc2626; padding:2px 0;">
          Erro ao comunicar com o proxy do SIGEF.
        </div>
      `);
    } finally {
      mapContainer.style.cursor = '';
    }
  }
}
