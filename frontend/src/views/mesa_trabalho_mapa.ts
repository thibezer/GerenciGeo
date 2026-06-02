import L from 'leaflet';

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

    this.map = L.map(containerId).setView([-23.7661, -53.3204], 14);

    // Google Satélite Pane
    const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: 'Google Maps'
    }).addTo(this.map);

    // SIGEF Pane
    this.map.createPane('overlayPane');
    const overlayPane = this.map.getPane('overlayPane');
    if (overlayPane) {
      overlayPane.style.zIndex = '650';
      overlayPane.style.pointerEvents = 'none';
    }

    const sigef = L.tileLayer.wms('https://acervofundiario.incra.gov.br/i3geo/ogc.php', {
      layers: 'certificada_sigef_particular_pr',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      pane: 'overlayPane',
      attribution: 'INCRA/SIGEF',
      className: 'sigef-wms-layer'
    }).addTo(this.map);

    L.control.layers({ "Satélite Google": googleSat }, { "Imóveis SIGEF (PR)": sigef }, { collapsed: true }).addTo(this.map);

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

        const marker = L.marker([p.lat, p.lon], { icon: customIcon })
          .bindPopup(`
            <div class="font-sans">
              <p class="font-bold text-sm text-[#0c1510]">Vértice ${p.nome_vertice}</p>
              <p class="text-xs text-gray-600 mt-0.5">Função: ${popupRole}</p>
              <p class="text-xs text-gray-600">Tipo: ${p.tipo_ponto || p.tipo}</p>
              <p class="text-xs text-gray-500 font-mono mt-1">Lat: ${p.lat.toFixed(6)}</p>
              <p class="text-xs text-gray-500 font-mono">Lon: ${p.lon.toFixed(6)}</p>
            </div>
          `)
          .addTo(this.map!);

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
          dashArray: s.tipo_limite_sigef === 'LN1' ? '6, 6' : undefined
        }).bindPopup(`
          <div class="font-sans">
            <p class="font-bold text-xs text-[#0c1510]">Segmento ${pIni.nome_vertice} ↔ ${pFim.nome_vertice}</p>
            <p class="text-xs text-gray-600">Limite: ${s.tipo_limite_sigef}</p>
            <p class="text-xs text-gray-500">Método: ${s.metodo_posicionamento_sigef}</p>
          </div>
        `).addTo(this.map!);

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
        weight: 4
      }).addTo(this.map!);
      this.polylines.push(polyline);
    }

    // Fechamento da malha de polígono N -> 1
    const pLast = validPoints[validPoints.length - 1];
    const pFirst = validPoints[0];
    const polylineClose = L.polyline([[pLast.lat, pLast.lon], [pFirst.lat, pFirst.lon]], {
      color: '#10b981',
      weight: 4,
      dashArray: '4, 4'
    }).addTo(this.map!);
    this.polylines.push(polylineClose);
  }

  /**
   * Foca no marcador de um ponto específico, alterando a view do mapa e abrindo o popup
   */
  public selectPonto(pId: number, zoomLevel: number = 18): void {
    if (!this.map) return;
    const marker = this.markers.find(m => (m as any).pontoId === pId);
    if (marker) {
      this.map.setView(marker.getLatLng(), zoomLevel);
      marker.openPopup();
    }
  }
}
