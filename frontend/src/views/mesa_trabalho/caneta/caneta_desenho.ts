import L from 'leaflet';

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

export class CanetaDesenhoRenderer {
  private camadaDesenho: L.LayerGroup | null = null;
  private svgRenderer: L.SVG | null = null;
  private poligonoTemp: L.Polygon | null = null;
  private linhaGuia: L.Polyline | null = null;
  private marcadoresVertices: L.CircleMarker[] = [];
  private marcadorInicio: L.CircleMarker | null = null;
  private mouseMoveRaf: number | null = null;

  public inicializar(map: L.Map): void {
    if (!this.svgRenderer) {
      this.svgRenderer = L.svg();
    }
    if (!this.camadaDesenho) {
      this.camadaDesenho = L.layerGroup().addTo(map);
    } else {
      this.camadaDesenho.clearLayers();
    }
  }

  public destruir(): void {
    this.limpar();
    if (this.svgRenderer) {
      try {
        this.svgRenderer.remove();
      } catch {
        // Ignora
      }
      this.svgRenderer = null;
    }
  }

  public limpar(): void {
    if (this.mouseMoveRaf !== null) {
      cancelAnimationFrame(this.mouseMoveRaf);
      this.mouseMoveRaf = null;
    }
    if (this.camadaDesenho) {
      this.camadaDesenho.clearLayers();
    }
    this.poligonoTemp = null;
    this.linhaGuia = null;
    this.marcadoresVertices = [];
    this.marcadorInicio = null;
  }

  public adicionarVertice(ponto: L.LatLng, ehPrimeiro: boolean): L.CircleMarker {
    const marker = L.circleMarker(ponto, {
      radius: ehPrimeiro ? 6 : 4,
      fillColor: ehPrimeiro ? '#00f5a0' : '#38bdf8',
      color: '#ffffff',
      weight: 1.5,
      fillOpacity: 1,
      renderer: this.svgRenderer || undefined
    });

    if (this.camadaDesenho) {
      marker.addTo(this.camadaDesenho);
    }
    this.marcadoresVertices.push(marker);

    if (ehPrimeiro) {
      this.marcadorInicio = marker;
      marker.bindTooltip('Início (clique aqui para fechar)', {
        permanent: false,
        direction: 'top',
        className: 'tooltip-caneta-snap'
      });
    }

    return marker;
  }

  public removerUltimoVertice(): void {
    const ultimoMarker = this.marcadoresVertices.pop();
    if (ultimoMarker && this.camadaDesenho) {
      this.camadaDesenho.removeLayer(ultimoMarker);
    }
    if (this.marcadoresVertices.length === 0) {
      this.marcadorInicio = null;
      if (this.linhaGuia && this.camadaDesenho) {
        this.camadaDesenho.removeLayer(this.linhaGuia);
        this.linhaGuia = null;
      }
    }
  }

  public atualizarPoligono(vertices: L.LatLng[]): void {
    if (!this.camadaDesenho) return;

    if (vertices.length >= 3) {
      if (!this.poligonoTemp) {
        this.poligonoTemp = L.polygon(vertices, {
          color: '#00f5a0',
          weight: 2,
          opacity: 0.9,
          fillColor: '#00f5a0',
          fillOpacity: 0.16,
          renderer: this.svgRenderer || undefined
        }).addTo(this.camadaDesenho);
      } else {
        this.poligonoTemp.setLatLngs(vertices);
      }
    } else if (this.poligonoTemp) {
      this.camadaDesenho.removeLayer(this.poligonoTemp);
      this.poligonoTemp = null;
    }
  }

  public atualizarLinhaGuia(map: L.Map, vertices: L.LatLng[], mouseLatLng: L.LatLng): void {
    if (this.mouseMoveRaf !== null) return;
    if (!mouseLatLng || isNaN(mouseLatLng.lat) || isNaN(mouseLatLng.lng)) return;

    this.mouseMoveRaf = requestAnimationFrame(() => {
      this.mouseMoveRaf = null;
      if (vertices.length === 0) return;

      try {
        // Destaque visual caso o mouse esteja próximo do início (Snap)
        if (vertices.length >= 3 && this.marcadorInicio) {
          const pontoPixelMouse = map.latLngToContainerPoint(mouseLatLng);
          const pontoPixelInicio = map.latLngToContainerPoint(vertices[0]);
          const dist = pontoPixelMouse.distanceTo(pontoPixelInicio);

          if (dist <= 18) {
            this.marcadorInicio.setStyle({
              radius: 9,
              fillColor: '#facc15',
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

        const coordsGuia = vertices.length >= 2
          ? [vertices[vertices.length - 1], mouseLatLng, vertices[0]]
          : [vertices[0], mouseLatLng];

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
        console.warn('[Caneta] Erro ao atualizar linha guia:', err);
      }
    });
  }

  public getMarcadorInicio(): L.CircleMarker | null {
    return this.marcadorInicio;
  }
}
