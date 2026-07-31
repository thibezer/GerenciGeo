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

  public fitBounds(pontos: Ponto[], padding: [number, number] = [40, 40]): void {
    if (!this.core.map) return;
    const validCoords = pontos
      .filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0)
      .map(p => L.latLng(p.lat as number, p.lon as number));
    if (validCoords.length > 0) {
      const bounds = L.latLngBounds(validCoords);
      this.core.map.fitBounds(bounds, { padding });

      this.core.map.once('moveend', () => {
        this.core.preCarregarTilesRegiao(bounds);
      });
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
