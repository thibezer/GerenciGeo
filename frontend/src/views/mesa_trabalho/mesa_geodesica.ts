/**
 * Barril de reexportação para retrocompatibilidade
 * A implementação completa foi modularizada em ./geodesica/
 */
export * from './geodesica/index';
export { setupMesaGeodesica, renderTabelaMesaGeodesica, latLonToUTM } from './geodesica/index';
