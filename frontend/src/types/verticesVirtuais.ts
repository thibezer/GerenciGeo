/**
 * types/verticesVirtuais.ts
 * Definições de tipos para o motor de vértices virtuais (PA1/PA2 - INCRA/SIGEF).
 */

export type LadoOffset = 'DIREITA' | 'ESQUERDA';

export interface PontoTopografico {
  id: string | number;
  nome: string;
  este: number;
  norte: number;
  altitude: number;
  sigmaEste: number;
  sigmaNorte: number;
  sigmaAltitude: number;
}

export interface PayloadComboPA1PA2 {
  eixoInicioId: string | number;
  eixoFimId: string | number;
  divisaInicioId: string | number;
  divisaFimId: string | number;
  larguraFaixaDominio: number;
  lado: LadoOffset;
  identificadorSugerido: string;
}

export interface PayloadPA2Puro {
  alinhamento1InicioId: string | number;
  alinhamento1FimId: string | number;
  alinhamento2InicioId: string | number;
  alinhamento2FimId: string | number;
  identificadorSugerido: string;
}

export interface RespostaVerticeVirtual {
  nome: string;
  este: number;
  norte: number;
  altitude: number;
  sigmaEste: number;
  sigmaNorte: number;
  sigmaAltitude: number;
  sigmaPlanimetrico: number;
  tipoPonto: 'V';
  metodo: 'PA1+PA2' | 'PA2' | 'PA1';
  conformeNormaIncra: boolean;
  alerta?: string;
  anguloIntersecaoGraus?: number;
  /** Posição geodésica do vértice calculado (convertida no fuso do cálculo) */
  lat?: number;
  lon?: number;
}

export interface PayloadCalcularOffsetLote {
  ponto_ids: number[];
  distancia: number;
  lado: LadoOffset;
  prefixo_nome?: string;
  fuso_utm?: number;
  fechado?: boolean;
}

export interface RespostaOffsetLote {
  sucesso: boolean;
  fuso_utm: number;
  total: number;
  resultados: RespostaVerticeVirtual[];
}

export interface PayloadConfirmarOffsetLote {
  fuso_utm?: number;
  confrontante_id?: number | null;
  vertices: {
    nome_vertice: string;
    este: number;
    norte: number;
    altitude: number;
    sigma_este: number;
    sigma_norte: number;
    sigma_altitude: number;
    sigma_planimetrico: number;
    metodo: string;
    ordem_caminhamento?: number | null;
  }[];
}
