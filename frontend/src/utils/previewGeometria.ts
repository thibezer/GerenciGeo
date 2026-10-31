/**
 * utils/previewGeometria.ts
 * Utilitário vetorial para pré-visualização (ghost line / ponto virtual) na tela antes da gravação.
 */

import type { LadoOffset, PontoTopografico } from '../types/verticesVirtuais';

export interface Ponto2D {
  este: number;
  norte: number;
}

export interface PreviewResultadoFaixa {
  diretrizOffset: [Ponto2D, Ponto2D];
  intersecao: Ponto2D | null;
  anguloIntersecaoGraus: number | null;
}

export interface PreviewResultadoOffsetPolilinha {
  vertices: Ponto2D[];
  segmentos: [Ponto2D, Ponto2D][];
}

/**
 * Calcula a linha paralela da faixa de domínio e a interseção em tela
 * para renderização vetorial no mapa (Leaflet/Canvas).
 */
export function gerarGeometriaPreviewFaixa(
  e1: PontoTopografico,
  e2: PontoTopografico,
  d1: PontoTopografico,
  d2: PontoTopografico,
  distancia: number,
  lado: LadoOffset
): PreviewResultadoFaixa {
  const de = e2.este - e1.este;
  const dn = e2.norte - e1.norte;
  const len = Math.hypot(de, dn);

  if (len < 1e-4) {
    return {
      diretrizOffset: [{ este: e1.este, norte: e1.norte }, { este: e2.este, norte: e2.norte }],
      intersecao: null,
      anguloIntersecaoGraus: null,
    };
  }

  const sinal = lado === 'DIREITA' ? 1 : -1;
  const offE = sinal * distancia * (dn / len);
  const offN = -sinal * distancia * (de / len);

  const off1: Ponto2D = { este: e1.este + offE, norte: e1.norte + offN };
  const off2: Ponto2D = { este: e2.este + offE, norte: e2.norte + offN };

  const l1 = Math.hypot(off2.este - off1.este, off2.norte - off1.norte);
  const l2 = Math.hypot(d2.este - d1.este, d2.norte - d1.norte);

  // Interseção analítica em coordenadas UTM de tela
  const den = (off1.este - off2.este) * (d1.norte - d2.norte) - (off1.norte - off2.norte) * (d1.este - d2.este);
  if (Math.abs(den) < 1e-7 || l1 < 1e-4 || l2 < 1e-4) {
    return { diretrizOffset: [off1, off2], intersecao: null, anguloIntersecaoGraus: null };
  }

  const sinTheta = Math.min(1.0, Math.max(0.0, Math.abs(den) / (l1 * l2)));
  const anguloGraus = (Math.asin(sinTheta) * 180) / Math.PI;

  const k1 = off1.este * off2.norte - off1.norte * off2.este;
  const k2 = d1.este * d2.norte - d1.norte * d2.este;

  const intE = (k1 * (d1.este - d2.este) - (off1.este - off2.este) * k2) / den;
  const intN = (k1 * (d1.norte - d2.norte) - (off1.norte - off2.norte) * k2) / den;

  return {
    diretrizOffset: [off1, off2],
    intersecao: { este: round3(intE), norte: round3(intN) },
    anguloIntersecaoGraus: round2(anguloGraus),
  };
}

/**
 * Calcula a interseção analítica pura entre duas retas (PA2) para preview.
 */
export function gerarGeometriaPreviewPA2Puro(
  r1_p1: PontoTopografico,
  r1_p2: PontoTopografico,
  r2_p1: PontoTopografico,
  r2_p2: PontoTopografico
): { intersecao: Ponto2D | null; anguloIntersecaoGraus: number | null } {
  const l1 = Math.hypot(r1_p2.este - r1_p1.este, r1_p2.norte - r1_p1.norte);
  const l2 = Math.hypot(r2_p2.este - r2_p1.este, r2_p2.norte - r2_p1.norte);

  const den = (r1_p1.este - r1_p2.este) * (r2_p1.norte - r2_p2.norte) -
              (r1_p1.norte - r1_p2.norte) * (r2_p1.este - r2_p2.este);

  if (Math.abs(den) < 1e-7 || l1 < 1e-4 || l2 < 1e-4) {
    return { intersecao: null, anguloIntersecaoGraus: null };
  }

  const sinTheta = Math.min(1.0, Math.max(0.0, Math.abs(den) / (l1 * l2)));
  const anguloGraus = (Math.asin(sinTheta) * 180) / Math.PI;

  const k1 = r1_p1.este * r1_p2.norte - r1_p1.norte * r1_p2.este;
  const k2 = r2_p1.este * r2_p2.norte - r2_p1.norte * r2_p2.este;

  const intE = (k1 * (r2_p1.este - r2_p2.este) - (r1_p1.este - r1_p2.este) * k2) / den;
  const intN = (k1 * (r2_p1.norte - r2_p2.norte) - (r1_p1.norte - r1_p2.norte) * k2) / den;

  return {
    intersecao: { este: round3(intE), norte: round3(intN) },
    anguloIntersecaoGraus: round2(anguloGraus),
  };
}

/**
 * Plano local tangente (GRS80) centrado em (lat0, lon0): converte lat/lon <-> metros sem passar por UTM,
 * então a prévia não sofre com convergência meridiana nem depende de coordenadas E/N gravadas.
 */
export function criarPlanoLocal(lat0: number, lon0: number) {
  const a = 6378137.0;
  const e2 = 0.00669438002290;
  const phi = (lat0 * Math.PI) / 180;
  const w = 1 - e2 * Math.sin(phi) ** 2;
  const raioMeridiano = (a * (1 - e2)) / Math.pow(w, 1.5);
  const raioPrimeiroVertical = a / Math.sqrt(w);
  const metrosPorGrauLat = (raioMeridiano * Math.PI) / 180;
  const metrosPorGrauLon = (raioPrimeiroVertical * Math.cos(phi) * Math.PI) / 180;

  return {
    paraPlano: (lat: number, lon: number): Ponto2D => ({
      este: (lon - lon0) * metrosPorGrauLon,
      norte: (lat - lat0) * metrosPorGrauLat,
    }),
    paraGeo: (p: Ponto2D): { lat: number; lon: number } => ({
      lat: lat0 + p.norte / metrosPorGrauLat,
      lon: lon0 + p.este / metrosPorGrauLon,
    }),
  };
}

/**
 * Calcula a pré-visualização vetorial em tempo real para deslocamento em lote de polilinha (Offset estilo AutoCAD).
 * Mesma regra do backend (MotorVerticesVirtuais.calcular_offset_polilinha): com `fechado`, o trecho
 * último -> primeiro também é deslocado e todos os vértices viram cantos interceptados.
 */
export function gerarGeometriaPreviewOffsetPolilinha(
  pontos: { este: number; norte: number }[],
  distancia: number,
  lado: LadoOffset,
  fechado: boolean = false
): PreviewResultadoOffsetPolilinha {
  if (pontos.length < 2 || distancia <= 0 || (fechado && pontos.length < 3)) {
    return { vertices: [], segmentos: [] };
  }

  const numSegmentos = fechado ? pontos.length : pontos.length - 1;
  const segmentos: [Ponto2D, Ponto2D][] = [];
  for (let i = 0; i < numSegmentos; i++) {
    const p1 = pontos[i];
    const p2 = pontos[(i + 1) % pontos.length];
    const de = p2.este - p1.este;
    const dn = p2.norte - p1.norte;
    const len = Math.hypot(de, dn);
    // Trecho nulo desalinharia segmento x vértice (e o backend recusa): sem prévia
    if (len < 1e-4) return { vertices: [], segmentos: [] };

    const sinal = lado === 'DIREITA' ? 1 : -1;
    const offE = sinal * distancia * (dn / len);
    const offN = -sinal * distancia * (de / len);

    segmentos.push([
      { este: round3(p1.este + offE), norte: round3(p1.norte + offN) },
      { este: round3(p2.este + offE), norte: round3(p2.norte + offN) }
    ]);
  }

  const vertices: Ponto2D[] = [];
  for (let i = 0; i < pontos.length; i++) {
    if (i === 0 && !fechado) {
      vertices.push(segmentos[0][0]);
    } else if (i === pontos.length - 1 && !fechado) {
      vertices.push(segmentos[segmentos.length - 1][1]);
    } else {
      const seg1 = segmentos[(i - 1 + segmentos.length) % segmentos.length];
      const seg2 = segmentos[i];
      const den = (seg1[0].este - seg1[1].este) * (seg2[0].norte - seg2[1].norte) -
                  (seg1[0].norte - seg1[1].norte) * (seg2[0].este - seg2[1].este);
      if (Math.abs(den) < 1e-7) {
        vertices.push({
          este: round3((seg1[1].este + seg2[0].este) / 2),
          norte: round3((seg1[1].norte + seg2[0].norte) / 2)
        });
      } else {
        const k1 = seg1[0].este * seg1[1].norte - seg1[0].norte * seg1[1].este;
        const k2 = seg2[0].este * seg2[1].norte - seg2[0].norte * seg2[1].este;
        const intE = (k1 * (seg2[0].este - seg2[1].este) - (seg1[0].este - seg1[1].este) * k2) / den;
        const intN = (k1 * (seg2[0].norte - seg2[1].norte) - (seg1[0].norte - seg1[1].norte) * k2) / den;
        vertices.push({ este: round3(intE), norte: round3(intN) });
      }
    }
  }

  return { vertices, segmentos };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
