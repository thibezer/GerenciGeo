import L from 'leaflet';
import type { Ponto } from '../../../types';
import { escapeHtml } from '../../../utils';
import type { MapaCore } from './mapa_core';

import type { MesaTrabalhoMapa } from './mapa_controller';

export class MapaMarcadores {
  public markers: L.Marker[] = [];
  public vizinhosMarkers: L.Marker[] = [];
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

        if (isBasePPP) {
          markerBg = 'bg-indigo-500';
        } else if (isBaseFisica) {
          markerBg = 'bg-rose-500';
        }

        const animClass = this.core.config.enableAnimations ? 'transition-all duration-150' : '';
        const markerSize = this.core.config.markerSizeBase;
        // Check bancoPontosAtivo on the linhas instance of the controller (which manages its state)
        const opacityClass = (this.controller as any).linhas.bancoPontosAtivo ? 'opacity-40 hover:opacity-100' : '';
        const markerHtml = `
          <div style="width: ${markerSize}px; height: ${markerSize}px;" class="${markerBg} border border-[#0c1510] rounded-full shadow-md coordinate-marker ${animClass} ${opacityClass}" data-ponto-bg="${markerBg}" id="map-marker-${p.id}"></div>
        `;
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
    this.core.pontosVizinhosGroup.clearLayers();
    this.vizinhosMarkers = [];

    const grupos = new Map<number, Ponto[]>();
    pontos.forEach(p => {
      if (p.lat && p.lon && p.lat !== 0 && p.lon !== 0 && p.confrontante_id !== undefined) {
        const cId = p.confrontante_id;
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
        const popupContent = `
          <div class="p-2 font-sans text-xs bg-forest-deep text-white min-w-[200px]">
            <div class="font-bold text-purple-400 mb-1 border-b border-white/10 pb-1">Confrontante (Importado)</div>
            <div class="mb-1"><strong>Vértice:</strong> <span class="font-mono">${escapeHtml(p.nome_vertice)}</span></div>
            <div class="mb-1"><strong>Proprietário:</strong> ${escapeHtml(p.nome_confrontante) || 'Desconhecido'}</div>
            <div class="mb-1"><strong>Propriedade:</strong> ${escapeHtml(p.nome_propriedade) || 'Desconhecida'}</div>
            <div class="mb-1"><strong>Coordenadas:</strong> ${(p.lat as number).toFixed(7)}, ${(p.lon as number).toFixed(7)}</div>
            <div class="text-[10px] text-white/50 border-t border-white/5 pt-1 mt-1 font-mono uppercase tracking-wider mb-2">Pontos Imutáveis do Vizinho</div>
            <div class="flex gap-2 border-t border-white/10 pt-2">
              <button class="px-2 py-1 text-[10px] font-bold rounded bg-mint-vibrant text-forest-deep hover:bg-mint-vibrant/90 active:scale-95 transition-all btn-integrar-vizinho-mapa" data-ponto-id="${p.id}" type="button">
                Integrar
              </button>
              <button class="px-2 py-1 text-[10px] font-bold rounded bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 active:scale-95 transition-all btn-ocultar-vizinho-mapa" data-ponto-id="${p.id}" type="button">
                Ocultar
              </button>
            </div>
          </div>
        `;

        const markerSize = this.core.config.markerSizeBase;
        const animClass = this.core.config.enableAnimations ? 'transition-all duration-150' : '';
        const markerHtml = `
          <div style="width: ${markerSize - 2}px; height: ${markerSize - 2}px;" class="bg-[#a855f7] border border-[#0c1510] rounded-full shadow-md coordinate-marker ${animClass}" data-ponto-bg="bg-[#a855f7]" id="map-marker-vizinho-${p.id}"></div>
        `;

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

  public clearMarkers(): void {
    if (this.core.map) {
      this.markers.forEach(m => this.core.map!.removeLayer(m));
    }
    if (this.core.pontosVizinhosGroup) {
      this.core.pontosVizinhosGroup.clearLayers();
    }
    this.markers = [];
    this.vizinhosMarkers = [];
  }
}
