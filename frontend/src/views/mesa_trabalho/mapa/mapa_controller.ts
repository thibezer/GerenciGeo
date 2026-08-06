import L from 'leaflet';
import type { Ponto, Segmento, BancoPonto } from '../../../types';
import { MapaCore } from './mapa_core';
import { MapaMarcadores } from './mapa_marcadores';
import { MapaLinhas } from './mapa_linhas';

export class MesaTrabalhoMapa {
  public core: MapaCore;
  private marcadores: MapaMarcadores;
  private linhas: MapaLinhas;

  public modoCliqueSequencialAtivo: boolean = false;
  public levantamentoId: number | null = null;
  public canvasInteracao: any = null;

  constructor() {
    this.core = new MapaCore(this);
    this.marcadores = new MapaMarcadores(this.core, this);
    this.linhas = new MapaLinhas(this.core, this);
  }

  public init(containerId: string): L.Map | null {
    return this.core.init(containerId);
  }

  public invalidateSize(): void {
    try {
      this.core?.invalidateSize();
    } catch (err) {
      // Ignora chamadas se desinicializado
    }
  }

  public plotPontos(pontos: Ponto[], onMarkerClick: (id: number) => void): void {
    this.marcadores.plotPontos(pontos, onMarkerClick);
  }

  public plotPontosVizinhos(pontos: Ponto[]): void {
    this.marcadores.plotPontosVizinhos(pontos);
  }

  public plotPoligonosVizinhos(confrontantes: any[]): void {
    this.marcadores.plotPoligonosVizinhos(confrontantes);
  }

  public plotSegmentos(segmentos: Segmento[], pontos: Ponto[]): void {
    this.linhas.plotSegmentos(segmentos, pontos);
  }

  public plotPolilinhaTemporaria(pontos: Ponto[]): void {
    this.linhas.plotPolilinhaTemporaria(pontos);
  }

  public plotPoligonalHomologada(bancoPontos: BancoPonto[]): void {
    this.linhas.plotPoligonalHomologada(bancoPontos);
  }

  public clearOverlays(bancoPontosAtivo: boolean = false): void {
    this.linhas.setBancoPontosAtivo(bancoPontosAtivo);
    this.marcadores.clearMarkers();
    this.linhas.clearLinhas();
  }

  public selectPonto(pId: number, zoomLevel?: number): void {
    if (!this.core.map) return;
    const marker = this.marcadores.markers.find(m => (m as any).pontoId === pId);
    if (marker) {
      const targetZoom = zoomLevel !== undefined ? zoomLevel : this.core.map.getZoom();
      this.core.map.setView(marker.getLatLng(), targetZoom);
      marker.openPopup();
    }
  }

  public fitBounds(pontos: Ponto[], padding: [number, number] = [40, 40], incluirVizinhos: boolean = false, pontosVizinhos: Ponto[] = []): void {
    if (!this.core.map) return;

    let todosPontos = [...pontos];
    if (incluirVizinhos && pontosVizinhos && pontosVizinhos.length > 0) {
      todosPontos = [...todosPontos, ...pontosVizinhos];
    }

    const validCoords = todosPontos
      .map(p => {
        const rawLat = p.lat ?? (p as any).latitude ?? (p as any).y;
        const rawLon = p.lon ?? (p as any).lng ?? (p as any).longitude ?? (p as any).x;
        const lat = typeof rawLat === 'string' ? parseFloat(rawLat) : Number(rawLat);
        const lon = typeof rawLon === 'string' ? parseFloat(rawLon) : Number(rawLon);
        if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
          return L.latLng(lat, lon);
        }
        return null;
      })
      .filter((coord): coord is L.LatLng => coord !== null);

    if (validCoords.length > 0) {
      const bounds = L.latLngBounds(validCoords);
      this.core.map.fitBounds(bounds, { padding });

      this.core.map.once('moveend', () => {
        this.core.preCarregarTilesRegiao(bounds);
      });
    }

    try {
      this.core.map.invalidateSize();
    } catch (err) {
      // Absorve exceções de desmontagem DOM silenciosamente
    }
  }

  public getMarkers(): L.Marker[] {
    return this.marcadores.markers;
  }

  public getVizinhosMarkers(): L.Marker[] {
    return this.marcadores.vizinhosMarkers;
  }

  public destroy(): void {
    if (this.core.map) {
      this.core.map.remove();
      this.core.map = null;
    }
    this.clearOverlays();
  }

  public getMap(): L.Map | null {
    return this.core.map;
  }
}
