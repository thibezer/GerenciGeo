/**
 * Re-exportação retrocompatível da Unificação de Vértices Sobrepostos
 * A implementação modularizada reside em ./sobrepostos/
 */
export type {
  PontoSobrepostoInfo,
  GrupoSobreposto
} from './sobrepostos';

export {
  calcularDistancia2D,
  calcularScoreMestre,
  detectarGruposSobrepostos,
  abrirModalUnificacaoSobrepostos
} from './sobrepostos';
