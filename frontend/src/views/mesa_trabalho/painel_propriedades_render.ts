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


let collapseTimeoutId: ReturnType<typeof setTimeout> | null = null;

export function renderPainelSemSelecao(ctx: any, panelContent: HTMLElement, panelActions: HTMLElement | null, matriculasList: any[], pontosList: Ponto[], confrontantesList: Confrontante[]) {
      // Caso 1: Sem Seleção
      const matObj = matriculasList.find((m: any) => m.id === ctx.currentMatriculaId);
      const pontosAtivosCount = pontosList.filter((p: Ponto) => p.ignorar_poligono !== 1).length;
      const confrontantesCount = confrontantesList.length;

      panelContent.innerHTML = `
      <div class="props-section">
        <div class="props-section-header" id="header-props-geral">
          <i data-lucide="chevron-down"></i> Geral
        </div>
        <div class="props-section-body" id="body-props-geral">
          <div class="props-field">
            <label class="props-field-label">Nome</label>
            <input type="text" value="${escapeHtml(ctx.currentLevantamento?.nome_propriedade || '-')}" class="props-field-value" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Status</label>
            <input type="text" value="${escapeHtml(ctx.currentLevantamento?.status || '-')}" class="props-field-value text-mint-vibrant font-bold" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">CAR</label>
            <input type="text" value="${escapeHtml(ctx.currentLevantamento?.codigo_car || 'Não Informado')}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">INCRA</label>
            <input type="text" value="${escapeHtml(ctx.currentLevantamento?.codigo_incra || 'Não Informado')}" class="props-field-value font-mono" readonly />
          </div>
        </div>
      </div>

      <div class="props-section mt-2">
        <div class="props-section-header" id="header-props-matricula">
          <i data-lucide="chevron-down"></i> Matrícula Ativa
        </div>
        <div class="props-section-body" id="body-props-matricula">
          <div class="props-field">
            <label class="props-field-label">Número</label>
            <input type="text" value="${escapeHtml(matObj ? matObj.numero_matricula : '-')}" class="props-field-value text-mint-vibrant font-bold" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Área (ha)</label>
            <input type="text" value="${escapeHtml(matObj ? (matObj.area_ha || matObj.area || '0') : '-')}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Vértices</label>
            <input type="text" value="${escapeHtml(String(pontosAtivosCount))}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Confront.</label>
            <input type="text" value="${escapeHtml(String(confrontantesCount))}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Fuso</label>
            <input type="text" value="${escapeHtml(localStorage.getItem(`utm_zone_${ctx.currentLevId}`) || '22S')}" class="props-field-value font-mono" readonly />
          </div>
        </div>
      </div>

      <div class="props-info-container">
        <div class="text-[10px] text-white/30 italic text-center select-none mt-2">
          Selecione um ou mais vértices na tabela ou no mapa para ver suas propriedades.
        </div>
      </div>
    `;

      // setupCollapsibleSections(['geral', 'matricula'], signal);
      initIcons();
      if (panelActions) panelActions.classList.add('hidden');

}

export function setupCollapsibleSections(sections: string[], signal: AbortSignal): void {
  if (collapseTimeoutId) {
    clearTimeout(collapseTimeoutId);
  }
  collapseTimeoutId = setTimeout(() => {
    if (signal.aborted) return;
    sections.forEach(sec => {
      const header = document.getElementById(`header-props-${sec}`);
      const body = document.getElementById(`body-props-${sec}`);
      if (header && body) {
        const isCollapsed = localStorage.getItem(`props_collapsed_${sec}`) === 'true';
        if (isCollapsed) {
          header.classList.add('collapsed');
          body.classList.add('hidden');
          const icon = header.querySelector('i, svg');
          if (icon) {
            (icon as HTMLElement).style.transform = 'rotate(-90deg)';
          }
        }

        header.addEventListener('click', () => {
          const currentlyCollapsed = header.classList.toggle('collapsed');
          body.classList.toggle('hidden', currentlyCollapsed);
          localStorage.setItem(`props_collapsed_${sec}`, currentlyCollapsed ? 'true' : 'false');

          const icon = header.querySelector('i, svg');
          if (icon) {
            (icon as HTMLElement).style.transform = currentlyCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
          }
        }, { signal: (window as any).signal });
      }
    });
  }, 10);
}
