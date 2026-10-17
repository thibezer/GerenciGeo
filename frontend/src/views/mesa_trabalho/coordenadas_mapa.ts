/**
 * Regra única de coordenadas da Mesa de Trabalho.
 *
 * `GET /levantamentos/{id}/pontos` devolve `SELECT p.*`: `lat/lon` são as coordenadas brutas (rover) e
 * `lat_corrigido/lon_corrigido` só existem depois da correção (PPP/translação). A posição verdadeira do
 * vértice — a mesma que o backend usa no resumo de confrontantes e nos documentos
 * (COALESCE(lat_corrigido, lat)) — é a corrigida quando existe. O kit plota o que recebe em `lat/lon`,
 * então tudo que vai para o mapa passa por `pontoParaMapa` e tudo que testa posição (Caneta, ímã,
 * acerto de clique) usa `coordenadaPonto`.
 */

export interface CoordenadaPonto {
  lat: number;
  lon: number;
}

const valido = (v: any): boolean => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) !== 0;

/** Coordenada verdadeira do ponto (corrigida > bruta) ou null quando não há coordenada utilizável. */
export function coordenadaPonto(p: any): CoordenadaPonto | null {
  if (!p) return null;
  // Latitude e longitude vêm sempre do mesmo conjunto (par corrigido ou par bruto)
  if (valido(p.lat_corrigido) && valido(p.lon_corrigido)) {
    return { lat: Number(p.lat_corrigido), lon: Number(p.lon_corrigido) };
  }
  const lon = valido(p.lon) ? p.lon : p.lng;
  if (valido(p.lat) && valido(lon)) return { lat: Number(p.lat), lon: Number(lon) };
  return null;
}

/** Cópia do ponto com `lat/lon` = coordenada verdadeira, pronta para `plotPontos/plotSegmentos`. */
export function pontoParaMapa<T extends Record<string, any>>(p: T): T {
  const c = coordenadaPonto(p);
  if (!p || !c) return p;
  if (c.lat === p.lat && c.lon === p.lon) return p;
  return { ...p, lat: c.lat, lon: c.lon };
}

export function pontosParaMapa<T extends Record<string, any>>(lista: T[] | null | undefined): T[] {
  return (lista || []).map(pontoParaMapa);
}

/** Zona UTM (1–60) natural de uma longitude. */
export function zonaUtmDaLongitude(lon: number): number {
  const z = Math.floor((lon + 180) / 6) + 1;
  return Math.min(60, Math.max(1, z));
}

/** Zona UTM pela longitude média dos pontos do levantamento, ou null sem coordenadas. */
export function zonaUtmDoLevantamento(pontos: any[] | null | undefined): number | null {
  let soma = 0;
  let n = 0;
  (pontos || []).forEach(p => {
    const c = coordenadaPonto(p);
    if (c) { soma += c.lon; n++; }
  });
  return n > 0 ? zonaUtmDaLongitude(soma / n) : null;
}

/** Quantos dos pontos candidatos caem fora do envelope dos pontos do levantamento (+ margem em graus). */
export function contarForaDoEnvelope(base: any[] | null | undefined, candidatos: any[] | null | undefined, margemGraus = 0.5): number {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  (base || []).forEach(p => {
    const c = coordenadaPonto(p);
    if (!c) return;
    minLat = Math.min(minLat, c.lat); maxLat = Math.max(maxLat, c.lat);
    minLon = Math.min(minLon, c.lon); maxLon = Math.max(maxLon, c.lon);
  });
  if (!Number.isFinite(minLat)) return 0;
  let fora = 0;
  (candidatos || []).forEach(p => {
    const c = coordenadaPonto(p);
    if (!c) return;
    if (c.lat < minLat - margemGraus || c.lat > maxLat + margemGraus || c.lon < minLon - margemGraus || c.lon > maxLon + margemGraus) fora++;
  });
  return fora;
}
