import L from 'leaflet';
import { API_BASE } from '../../config';
import { initIcons } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';


import { setupHomologacao } from './gerador_documentos_homologacao';
import { setupCartorio } from './gerador_documentos_cartorio';
export { configurarMaquinadeEstadosCivil, formatarCpfCnpjDinamico } from './gerador_documentos_utils';

export function setupGeradorDocumentos(ctx: MesaTrabalhoContext) {
  setupHomologacao(ctx);
  setupCartorio(ctx);
}
