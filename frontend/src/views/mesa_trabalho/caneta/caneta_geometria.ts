import type L from 'leaflet';
import { MapaConfigManager } from '../../mapa_config';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';
import { coordenadaPonto } from '../coordenadas_mapa';
import { pontosVisiveisParaSelecao } from '../pontos_visiveis';

/** Distância máxima (px) para o ímã puxar o clique da Caneta para um vértice existente. */
export const TOLERANCIA_IMA_PX = 12;

/**
 * Algoritmo Ray-Casting clássico para teste Ponto-em-Polígono
 */
export function pontoDentroDoPoligono(lat: number, lon: number, vs: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].lng, yi = vs[i].lat;
    const xj = vs[j].lng, yj = vs[j].lat;

    const intersect = ((yi > lat) !== (yj > lat))
      && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Configuração "Imã (Atrair para o Vértice)" da janela Configurações do Mapa (`magnetSnap`).
 */
export function lerImaConfigurado(): boolean {
  try {
    return !!MapaConfigManager.getInstance().getConfig().magnetSnap;
  } catch {
    return false;
  }
}

/**
 * Ímã: se ligado em Configurações do Mapa, devolve a posição do vértice visível mais próximo do clique
 * (até TOLERANCIA_IMA_PX pixels); caso contrário, o próprio clique.
 */
export function aplicarIma(
  map: L.Map | null,
  latlng: L.LatLng,
  ctx: MesaTrabalhoContext
): L.LatLng {
  if (!lerImaConfigurado() || !map) return latlng;

  const alvo = map.latLngToContainerPoint(latlng);
  let melhor: L.LatLng | null = null;
  let menor = TOLERANCIA_IMA_PX;

  const testar = (p: any) => {
    const c = coordenadaPonto(p);
    if (!c) return;
    const d = map.latLngToContainerPoint([c.lat, c.lon]).distanceTo(alvo);
    if (d <= menor) {
      menor = d;
      melhor = { lat: c.lat, lng: c.lon } as any;
    }
  };

  pontosVisiveisParaSelecao(ctx).forEach(testar);
  if (ctx.exibirVizinhosNoMapa !== false) {
    (ctx.pontosVizinhosList || []).forEach(testar);
  }

  return melhor ?? latlng;
}

export interface ResultadoSelecaoPoligono {
  pontosContidosIds: number[];
  vizinhosContidosIds: number[];
}

/**
 * Filtra quais pontos da matrícula e vizinhos estão contidos dentro dos vértices do polígono desenhado
 */
export function filtrarPontosNoPoligono(
  vertices: L.LatLng[],
  ctx: MesaTrabalhoContext
): ResultadoSelecaoPoligono {
  const poligonoCoords = vertices.map(v => ({ lat: v.lat, lng: v.lng }));
  const pontosLista = pontosVisiveisParaSelecao(ctx);
  const vizinhosLista = ctx.pontosVizinhosList || [];

  const pontosContidosIds: number[] = [];
  pontosLista.forEach(p => {
    const c = coordenadaPonto(p);
    if (c && pontoDentroDoPoligono(c.lat, c.lon, poligonoCoords)) {
      pontosContidosIds.push(p.id);
    }
  });

  const vizinhosContidosIds: number[] = [];
  vizinhosLista.forEach(pv => {
    const c = coordenadaPonto(pv);
    if (c && pontoDentroDoPoligono(c.lat, c.lon, poligonoCoords)) {
      vizinhosContidosIds.push(pv.id);
    }
  });

  return { pontosContidosIds, vizinhosContidosIds };
}
