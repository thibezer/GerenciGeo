import { API_BASE } from '../../config';
import { initIcons, showToast } from '../../utils';
import { renderLinhaPontoGeoprocessamentoHtml, renderAuditoriaTranslacaoHtml } from './mesa_trabalho_tabela';
import { registrarEventosExportacao } from './exportacao_cad';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

import { latLonToUTM } from './mesa_geodesica_calculo';
import { renderTabelaMesaGeodesica } from './mesa_geodesica_render';
import { setupMesaGeodesicaUpload } from './mesa_geodesica_upload';
import { setupMesaGeodesicaEventos } from './mesa_geodesica_eventos';

export { latLonToUTM } from './mesa_geodesica_calculo';
export { renderTabelaMesaGeodesica } from './mesa_geodesica_render';

export function setupMesaGeodesica(ctx: MesaTrabalhoContext) {
  ctx.latLonToUTM = latLonToUTM;
  setupMesaGeodesicaUpload(ctx);
  setupMesaGeodesicaEventos(ctx);
}
