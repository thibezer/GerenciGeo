import L from 'leaflet';
import type { Ponto } from '../../../types';
import { escapeHtml } from '../../../utils';
import type { MapaCore } from './mapa_core';

import type { MesaTrabalhoMapa } from './mapa_controller';
import { getPointShapeHtml } from './mapa_pontos_shapes';

export class MapaMarcadores {
  public markers: L.Marker[] = [];
  public vizinhosMarkers: L.Marker[] = [];
  public vizinhosPoligonos: L.Polygon[] = [];
  private core: MapaCore;
  private controller: MesaTrabalhoMapa;

  constructor(core: MapaCore, controller: MesaTrabalhoMapa) {
    this.core = core;
    this.controller = controller;
  }

  public plotPontos(pontos: Ponto[], onMarkerClick: (id: number) => void): void {
    if (!this.core.map) return;

    pontos.forEach(p => {
      if (p.lat && p.lon && p.lat !== 0 && p.lon !== 0) {
        const isBaseFisica = p.tipo_ponto === 'B' || p.tipo === 'B';
        const isBasePPP = p.tipo_ponto === 'M' || p.tipo === 'M';
        let markerBg = 'bg-mint-vibrant';
        let shapeStyle = 'x';
        let markerSize = 7;

        if (isBasePPP) {
          markerBg = 'bg-indigo-500';
          markerSize = 9;
        } else if (isBaseFisica) {
          markerBg = 'bg-rose-500';
          markerSize = 9;
        }

        const animClass = this.core.config.enableAnimations ? 'transition-all duration-150' : '';
        const opacityClass = (this.controller as any).linhas.bancoPontosAtivo ? 'opacity-40 hover:opacity-100' : '';
        const markerHtml = getPointShapeHtml(shapeStyle, markerSize, markerBg, `${animClass} ${opacityClass}`, `map-marker-${p.id}`);
        
        const customIcon = L.divIcon({
          html: markerHtml,
          className: 'custom-leaflet-marker flex items-center justify-center',
          iconSize: [markerSize + 6, markerSize + 6]
        });

        const popupRole = isBasePPP
          ? 'Base Homologada PPP'
          : (isBaseFisica ? 'Base de Campo (Translação)' : 'Vértice de Perímetro');

        const marker = L.marker([p.lat, p.lon], {
          icon: customIcon,
          pane: 'verticesPane'
        });

        (marker as any).pontoId = p.id;

        if (!this.controller.modoCliqueSequencialAtivo) {
          marker.bindPopup(`
            <div style="font-family:var(--geo-font-sans),sans-serif; color:rgba(255, 255, 255, 0.9); line-height:1.3;">
              <div style="font-weight:700; font-size:13px; margin-bottom:4px; color:#ffffff;">${escapeHtml(p.nome_vertice)}</div>
              <div style="font-size:11px; color:rgba(255, 255, 255, 0.65);">${escapeHtml(popupRole)} · ${escapeHtml(p.tipo_ponto || p.tipo)}</div>
              <div style="font-size:11px; color:rgba(255, 255, 255, 0.45); font-family:'JetBrains Mono',monospace; margin-top:4px;">Lat ${p.lat.toFixed(6)} &nbsp; Lon ${p.lon.toFixed(6)}</div>
            </div>
          `, {
            className: 'compact-popup',
            maxWidth: 220
          });
        }

        marker.addTo(this.core.map!);
        marker.setZIndexOffset(1000);

        marker.on('click', () => {
          onMarkerClick(p.id);
        });

        this.markers.push(marker);
      }
    });
  }

  public plotPontosVizinhos(pontos: Ponto[]): void {
    if (!this.core.map || !this.core.pontosVizinhosGroup) return;
    
    if (!this.core.map.hasLayer(this.core.pontosVizinhosGroup)) {
      this.core.pontosVizinhosGroup.addTo(this.core.map);
    }
    
    if (this.vizinhosMarkers && this.vizinhosMarkers.length > 0) {
      this.vizinhosMarkers.forEach(m => {
        m.off();
        m.unbindPopup();
      });
      this.vizinhosMarkers = [];
    }
    this.core.pontosVizinhosGroup.clearLayers();

    const grupos = new Map<string, Ponto[]>();
    (pontos || []).forEach(p => {
      const rawLat = p.lat ?? (p as any).latitude ?? (p as any).y;
      const rawLon = p.lon ?? (p as any).lng ?? (p as any).longitude ?? (p as any).x;
      const lat = typeof rawLat === 'string' ? parseFloat(rawLat.replace(',', '.')) : Number(rawLat);
      const lon = typeof rawLon === 'string' ? parseFloat(rawLon.replace(',', '.')) : Number(rawLon);

      if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
        p.lat = lat;
        p.lon = lon;
        const cId = p.confrontante_id !== undefined && p.confrontante_id !== null ? String(p.confrontante_id) : '0';
        if (!grupos.has(cId)) grupos.set(cId, []);
        grupos.get(cId)!.push(p);
      }
    });

    grupos.forEach((pontosGrupo) => {
      if (pontosGrupo.length >= 2) {
        pontosGrupo.sort((a, b) => a.id - b.id);

        const coords = pontosGrupo.map(p => L.latLng(p.lat as number, p.lon as number));

        if (pontosGrupo.length > 2) {
           coords.push(L.latLng(pontosGrupo[0].lat as number, pontosGrupo[0].lon as number));
        }

        L.polyline(coords, {
          color: '#a855f7',
          weight: this.core.config.vizinhoWeight,
          dashArray: '4, 6',
          pane: 'overlayPane'
        }).addTo(this.core.pontosVizinhosGroup!);
      }

      pontosGrupo.forEach(p => {
        const safePId = escapeHtml(String(p.id));
        const popupContent = `
          <div class="p-2 font-sans text-xs bg-forest-deep text-white min-w-[200px]">
            <div class="font-bold text-purple-400 mb-1 border-b border-white/10 pb-1">Confrontante (Importado)</div>
            <div class="mb-1"><strong>Vértice:</strong> <span class="font-mono">${escapeHtml(p.nome_vertice || '')}</span></div>
            <div class="mb-1"><strong>Proprietário:</strong> ${escapeHtml(p.nome_confrontante || '') || 'Desconhecido'}</div>
            <div class="mb-1"><strong>Propriedade:</strong> ${escapeHtml(p.nome_propriedade || '') || 'Desconhecida'}</div>
            <div class="mb-1"><strong>Coordenadas:</strong> ${(p.lat as number).toFixed(7)}, ${(p.lon as number).toFixed(7)}</div>
            <div class="text-[10px] text-white/50 border-t border-white/5 pt-1 mt-1 font-mono uppercase tracking-wider mb-2">Pontos Imutáveis do Vizinho</div>
            <div class="flex gap-2 border-t border-white/10 pt-2">
              <button class="px-2 py-1 text-[10px] font-bold rounded bg-mint-vibrant text-forest-deep hover:bg-mint-vibrant/90 active:scale-95 transition-all btn-integrar-vizinho-mapa" data-ponto-id="${safePId}" type="button">
                Integrar
              </button>
              <button class="px-2 py-1 text-[10px] font-bold rounded bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 active:scale-95 transition-all btn-ocultar-vizinho-mapa" data-ponto-id="${safePId}" type="button">
                Ocultar
              </button>
            </div>
          </div>
        `;

        let shapeStyle = this.core.config.markerStyleV || 'cross';
        let markerSize = this.core.config.markerSizeV || 8;
        if (p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo === 'B') {
           shapeStyle = this.core.config.markerStyleM || 'circle-dot';
           markerSize = this.core.config.markerSizeM || 14;
        } else if (p.tipo_ponto === 'P' || p.tipo === 'P' || p.tipo === 'O') {
           shapeStyle = this.core.config.markerStyleP || 'circle';
           markerSize = this.core.config.markerSizeP || 10;
        }
        
        const animClass = this.core.config.enableAnimations ? 'transition-all duration-150' : '';
        const markerHtml = getPointShapeHtml(shapeStyle, markerSize, 'bg-[#a855f7]', animClass, `map-marker-vizinho-${p.id}`);

        const groupCustomIcon = L.divIcon({
          html: markerHtml,
          className: 'custom-leaflet-marker flex items-center justify-center',
          iconSize: [markerSize + 4, markerSize + 4]
        });

        const marker = L.marker([p.lat as number, p.lon as number], {
          icon: groupCustomIcon,
          pane: 'overlayPane'
        })
          .bindPopup(popupContent, { className: 'custom-leaflet-popup' });

        (marker as any).pontoId = p.id;
        (marker as any).isVizinho = true;

        marker.addTo(this.core.pontosVizinhosGroup!);
        this.vizinhosMarkers.push(marker);
      });
    });
  }

  /**
   * Desenha o perímetro (limites) dos imóveis vizinhos importados via CSV de "limites" do SIGEF.
   * Cada confrontante pode ter um `poligono_wkt` no formato "POLYGON((lon lat, lon lat, ...))",
   * montado a partir dos segmentos LINESTRING do arquivo de limites (ver backend: segmentos.py).
   */
  public plotPoligonosVizinhos(confrontantes: any[]): void {
    if (!this.core.map || !this.core.pontosVizinhosGroup) return;

    if (!this.core.map.hasLayer(this.core.pontosVizinhosGroup)) {
      this.core.pontosVizinhosGroup.addTo(this.core.map);
    }

    if (this.vizinhosPoligonos.length > 0) {
      this.vizinhosPoligonos.forEach(pg => pg.off());
      this.vizinhosPoligonos = [];
    }

    (confrontantes || []).forEach(c => {
      if (!c || !c.poligono_wkt) return;

      const match = /POLYGON\s*\(\s*\(\s*(.*?)\s*\)\s*\)/i.exec(c.poligono_wkt);
      if (!match) return;

      const coords: L.LatLngExpression[] = match[1]
        .split(',')
        .map(par => {
          const partes = par.trim().split(/\s+/);
          const lon = parseFloat(partes[0]);
          const lat = parseFloat(partes[1]);
          return (!isNaN(lat) && !isNaN(lon)) ? [lat, lon] as L.LatLngExpression : null;
        })
        .filter((p): p is L.LatLngExpression => p !== null);

      if (coords.length < 3) return;

      const nomePropriedade = escapeHtml(c.nome_propriedade || 'Propriedade Vizinha');
      const nomeConfrontante = escapeHtml(c.nome || 'Desconhecido');

      const poligono = L.polygon(coords, {
        color: '#a855f7',
        weight: this.core.config.vizinhoWeight,
        dashArray: '4, 6',
        fillColor: '#a855f7',
        fillOpacity: 0.05,
        pane: 'overlayPane'
      }).bindPopup(`
        <div class="p-2 font-sans text-xs bg-forest-deep text-white min-w-[200px]">
          <div class="font-bold text-purple-400 mb-1 border-b border-white/10 pb-1">Limite do Vizinho (Importado)</div>
          <div class="mb-1"><strong>Propriedade:</strong> ${nomePropriedade}</div>
          <div class="mb-1"><strong>Proprietário:</strong> ${nomeConfrontante}</div>
        </div>
      `, { className: 'custom-leaflet-popup' });

      poligono.addTo(this.core.pontosVizinhosGroup!);
      this.vizinhosPoligonos.push(poligono);
    });
  }

  public clearMarkers(): void {
    if (this.markers) {
      this.markers.forEach(m => {
        m.off();
        m.unbindPopup();
        if (this.core.map) this.core.map.removeLayer(m);
      });
      this.markers = [];
    }
    if (this.vizinhosMarkers) {
      this.vizinhosMarkers.forEach(m => {
        m.off();
        m.unbindPopup();
      });
      this.vizinhosMarkers = [];
    }
    if (this.vizinhosPoligonos) {
      this.vizinhosPoligonos.forEach(pg => pg.off());
      this.vizinhosPoligonos = [];
    }
    if (this.core.pontosVizinhosGroup) {
      this.core.pontosVizinhosGroup.clearLayers();
    }
  }
}
