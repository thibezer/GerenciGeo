/**
 * ============================================================================
 * DIRETRIZES VISUAIS DO PAINEL DE PROPRIEDADES (NUNCA ALTERAR):
 * ============================================================================
 * 1. MARGENS LATERAIS: Devem ter estritamente 10px (controladas pelo CSS e
 *    containers utilitários para manter alinhamento). Os campos devem se
 *    redimensionar conforme a largura da aba de propriedades ajustável.
 * 2. ALTURA DOS CAMPOS: Cada campo (.props-field) deve ter exatamente 18px de altura.
 * 3. LINHA SEPARADORA: Os campos devem ser separados apenas por uma linha sutil
 *    de 1px de espessura (borda inferior de 1px).
 * 4. ALTURA DOS GRUPOS: Os cabeçalhos de grupos/seções (.props-section-header)
 *    devem ter exatamente 23px de altura e fundo ligeiramente mais escuro.
 * 5. ALINHAMENTO DO TEXTO: Todos os textos (rótulos e valores/inputs/selects)
 *    devem estar alinhados estritamente à ESQUERDA.
 * ============================================================================
 */

import { API_BASE } from '../../config';
import { initIcons, customAlert, showToast, escapeHtml } from '../../utils';
import {
  METODOS_SIGEF,
  LIMITES_SIGEF,
  parseNumberOrNull,
  parseNumberDefault,
  formatCoordinate,
  tratarErroAPI,
  renderModalMetodosHTML,
  renderModalLimitesHTML
} from './painel_propriedades_helpers';
import type { Ponto, Segmento, Confrontante } from './painel_propriedades_helpers';


import { renderPainelSemSelecao, setupCollapsibleSections } from './painel_propriedades_render';
import { renderPainelSelecaoUnica } from './painel_propriedades_editor';
import { renderPainelMultiSelecao } from './painel_propriedades_validacao';

let panelAbortController: AbortController | null = null;

export function atualizarPainelPropriedades(ctx: any): void {
  const panelContent = document.getElementById('props-panel-content');
  const panelActions = document.getElementById('props-panel-actions');
  if (!panelContent) return;

  if (panelAbortController) {
    panelAbortController.abort();
  }
  panelAbortController = new AbortController();
  const signal = panelAbortController.signal;

  try {
    if (ctx.etapaAtiva === 'cartorio') {
      panelContent.innerHTML = `<div class="props-section-body p-4 text-center text-white/50 text-xs mt-10">O painel de atributos não está disponível na etapa de documentação (Cartório).</div>`;
      if (panelActions) panelActions.classList.add('hidden');
      return;
    }

    const selectedPontoIds = Array.from(ctx.pontosSelecionadosParaOrdenacao as Set<string>);
    const selectedVizinhoPontoIds = Array.from(ctx.pontosVizinhosSelecionados as Set<string>);
    const selectedCount = selectedPontoIds.length;
    const selectedVizinhoCount = selectedVizinhoPontoIds.length;

    const pontosList: Ponto[] = ctx.pontosList ?? [];
    const segmentosList: Segmento[] = ctx.segmentosList ?? [];
    const confrontantesList: Confrontante[] = ctx.confrontantesList ?? [];
    const matriculasList: any[] = ctx.matriculasList ?? [];
    const isArquivado = ctx.currentLevantamento?.status === 'ARQUIVADO';

    if (selectedCount === 0 && selectedVizinhoCount === 0) {
      renderPainelSemSelecao(ctx, panelContent, panelActions, matriculasList, pontosList, confrontantesList);
    } else if (selectedCount === 1 || (selectedCount === 0 && selectedVizinhoCount === 1)) {
      renderPainelSelecaoUnica(ctx, panelContent, panelActions, signal, pontosList, segmentosList, confrontantesList, selectedPontoIds, selectedVizinhoPontoIds, isArquivado);
    } else {
      renderPainelMultiSelecao(ctx, panelContent, panelActions, signal, pontosList, confrontantesList, selectedPontoIds, selectedVizinhoPontoIds, isArquivado);
    }

    setupCollapsibleSections(['props-geral', 'props-matricula', 'props-atributos', 'props-qualidade', 'props-coordenadas', 'props-limite', 'props-confrontante', 'props-acoes-multiplas', 'props-acoes-multiplas-lote', 'props-acoes-multiplas-confrontantes'], signal);

  } catch (err) {
    console.error("Erro ao atualizar painel de propriedades:", err);
    panelContent.innerHTML = `
      <div class="p-4 text-rose-400 text-xs italic select-none">
        ❌ Erro ao renderizar propriedades do vértice: ${escapeHtml(tratarErroAPI(err, "Falha interna ao exibir propriedades"))}
      </div>
    `;
}
}
