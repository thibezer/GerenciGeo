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

export function atualizarPainelPropriedades(ctx: any): void {
  const panelContent = document.getElementById('props-panel-content');
  const panelActions = document.getElementById('props-panel-actions');
  if (!panelContent) return;

  if (ctx.etapaAtiva === 'cartorio') {
    if (panelActions) panelActions.classList.add('hidden');
    return;
  }

  try {
    const selectedPontoIds: number[] = ctx.selectedPontoIds ?? [];
    const selectedVizinhoPontoIds: number[] = ctx.selectedVizinhoPontoIds ?? [];
    const selectedCount = selectedPontoIds.length;
    const selectedVizinhoCount = selectedVizinhoPontoIds.length;

    const pontosList: Ponto[] = ctx.pontosList ?? [];
    const pontosVizinhosList: Ponto[] = ctx.pontosVizinhosList ?? [];
    const segmentosList: Segmento[] = ctx.segmentosList ?? [];
    const confrontantesList: Confrontante[] = ctx.confrontantesList ?? [];
    const matriculasList: any[] = ctx.matriculasList ?? [];

    if (selectedCount === 0 && selectedVizinhoCount === 0) {
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

      setupCollapsibleSections(['geral', 'matricula']);
      initIcons();
      if (panelActions) panelActions.classList.add('hidden');
    }
    else if (selectedCount === 1 || (selectedCount === 0 && selectedVizinhoCount === 1)) {
      // Caso 2: Um Vértice Selecionado (Normal ou Vizinho)
      let p: Ponto | undefined;
      let isPontoVizinho = false;

      if (selectedCount === 1) {
        const pId = selectedPontoIds[0];
        p = pontosList.find((pt: Ponto) => pt.id === pId);
        isPontoVizinho = p ? p.ponto_vizinho === 1 : false;
      } else {
        const pId = selectedVizinhoPontoIds[0];
        p = pontosVizinhosList.find((pt: Ponto) => pt.id === pId);
        isPontoVizinho = true;
      }

      const isArquivado = ctx.currentLevantamento?.status === 'ARQUIVADO';
      const isDisabled = isPontoVizinho || isArquivado;

      if (!p) {
        panelContent.innerHTML = `<div class="p-4 text-white/40 italic">Ponto não encontrado.</div>`;
        if (panelActions) panelActions.classList.add('hidden');
        return;
      }

      const isCorrigido = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';

      let latVal: number | null = null;
      let lonVal: number | null = null;
      let eVal: number | null = null;
      let nVal: number | null = null;
      let hVal: number | null = null;

      if (isCorrigido) {
        latVal = parseNumberOrNull(p.lat_corrigido ?? p.lat);
        lonVal = parseNumberOrNull(p.lon_corrigido ?? p.lon);
        eVal = parseNumberOrNull(p.e_corrigido ?? p.e_original);
        nVal = parseNumberOrNull(p.n_corrigido ?? p.n_original);
        hVal = parseNumberOrNull(p.alt_corrigido ?? (p.alt ?? p.alt_original));
      } else {
        latVal = parseNumberOrNull(p.lat);
        lonVal = parseNumberOrNull(p.lon);
        eVal = parseNumberOrNull(p.e_original ?? p.e_corrigido);
        nVal = parseNumberOrNull(p.n_original ?? p.n_corrigido);
        hVal = parseNumberOrNull(p.alt ?? p.alt_original);
      }

      const sigE = parseNumberDefault(p.sigma_e, 0);
      const sigN = parseNumberDefault(p.sigma_n, 0);
      const temSigmas = p.sigma_e !== undefined && p.sigma_e !== null && p.sigma_n !== undefined && p.sigma_n !== null;
      const resultante = temSigmas ? Math.sqrt(sigE * sigE + sigN * sigN) * 1000 : 0;

      let corResultanteClass = 'text-emerald-400';
      if (!temSigmas) {
        corResultanteClass = 'text-white/40';
      } else if (resultante > 30 && resultante <= 100) {
        corResultanteClass = 'text-yellow-400';
      } else if (resultante > 100) {
        corResultanteClass = 'text-rose-400';
      }

      const seg = segmentosList.find((s: Segmento) => s.ponto_inicio_id === p!.id);
      let confNome = '';
      let confMatricula = '';
      let confCartorio = '';
      let confObj: Confrontante | undefined;

      const confrontanteId = p.confrontante_id || (seg && seg.confrontante_id);
      if (confrontanteId) {
        confObj = confrontantesList.find((c: Confrontante) => c.id === confrontanteId);
        if (confObj) {
          confNome = confObj.nome || '';
          confMatricula = confObj.matricula_imovel || '';
          confCartorio = confObj.cns_confrontante || '';
        }
      }

      const temCoordenadasBrutas = isCorrigido && (p.e_original != null || p.lat != null || p.lon != null);

      let nomeBaseApoio = 'Nenhuma';
      if (p.ponto_base_id) {
        const basePt = pontosList.find((pt: Ponto) => pt.id === p!.ponto_base_id);
        if (basePt) nomeBaseApoio = basePt.nome_vertice || `ID ${p.ponto_base_id}`;
      }

      let origemTexto = 'Vértice de Campo';
      let badgeClass = 'bg-mint-vibrant/10 text-mint-vibrant border-mint-vibrant/20';
      if (isPontoVizinho) {
        origemTexto = 'Vizinho (Não Integrado)';
        badgeClass = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      } else if (p.confrontante_id) {
        origemTexto = 'Vizinho Integrado';
        badgeClass = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      }

      panelContent.innerHTML = `
      <!-- GRUPO 1: GERAL -->
      <div class="props-section" id="sec-props-geral">
        <div class="props-section-header" id="header-props-geral">
          <i data-lucide="chevron-down"></i> Geral
        </div>
        <div class="props-section-body" id="body-props-geral">
          <div class="props-field mb-3 flex items-center justify-between">
            <span class="text-[9px] uppercase font-bold tracking-wider text-white/40">Origem</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold border ${badgeClass}">${origemTexto}</span>
          </div>
          <div class="props-field">
            <label class="props-field-label">Nome Original (Campo)</label>
            <input type="text" value="${escapeHtml(p.ponto_nome || p.arquivo_nome || p.nome_vertice || '-')}" class="props-field-value opacity-50 cursor-not-allowed text-white/50" readonly disabled title="Nome original importado do equipamento GPS" />
          </div>
          <div class="props-field">
            <label class="props-field-label">Vértice</label>
            <div class="flex items-center gap-1 flex-1 min-w-0 pr-1 text-left justify-start">
              <input type="text" id="prop-nome-vertice" value="${escapeHtml(p.nome_vertice || '')}" class="props-field-value font-mono flex-1 min-w-0" ${isDisabled ? 'disabled' : ''} />
              ${!isDisabled ? `
                <button type="button" id="btn-sugerir-nome" class="p-0.5 bg-mint-vibrant/10 hover:bg-mint-vibrant/25 border border-mint-vibrant/30 rounded text-mint-vibrant transition-colors active:scale-95 flex items-center justify-center shrink-0 w-4 h-4" title="Sugerir Nome Oficial (INCRA)">
                  <i data-lucide="sparkles" class="w-2.5 h-2.5"></i>
                </button>
              ` : ''}
            </div>
          </div>

          <div class="props-field">
            <label class="props-field-label">Tipo</label>
            <select id="prop-tipo-ponto" class="props-field-value" ${isDisabled ? 'disabled' : ''}>
              <option class="bg-[#111113] text-white/90" value="M" ${p.tipo_ponto === 'M' || p.tipo === 'M' ? 'selected' : ''}>M - Marco</option>
              <option class="bg-[#111113] text-white/90" value="P" ${p.tipo_ponto === 'P' || p.tipo === 'P' ? 'selected' : ''}>P - Ponto</option>
              <option class="bg-[#111113] text-white/90" value="V" ${p.tipo_ponto === 'V' || p.tipo === 'V' ? 'selected' : ''}>V - Virtual</option>
              <option class="bg-[#111113] text-white/90" value="B" ${p.tipo_ponto === 'B' || p.tipo === 'B' ? 'selected' : ''}>B - Base</option>
            </select>
          </div>

          <div class="props-field">
            <label class="props-field-label">Método</label>
            <div class="flex items-center gap-1 flex-1 min-w-0 pr-1 text-left justify-start">
              <select id="prop-metodo" class="props-field-value flex-1 min-w-0" ${isDisabled ? 'disabled' : ''}>
                <option class="bg-[#111113] text-white/90" value="">Selecione...</option>
                ${METODOS_SIGEF.map(m => `<option class="bg-[#111113] text-white/90" value="${escapeHtml(m.codigo)}" ${p.tipo_ponto === m.codigo || (p as any).metodo_posicionamento === m.codigo ? 'selected' : ''}>${escapeHtml(m.codigo)} - ${escapeHtml(m.nome)}</option>`).join('')}
              </select>
              <button type="button" id="btn-ajuda-metodo" class="p-0.5 bg-mint-vibrant/10 hover:bg-mint-vibrant/25 border border-mint-vibrant/30 rounded text-mint-vibrant transition-colors active:scale-95 flex items-center justify-center shrink-0 w-4 h-4" title="Catálogo de Métodos SIGEF">
                <i data-lucide="help-circle" class="w-2.5 h-2.5"></i>
              </button>
            </div>
          </div>
          
          <div class="props-field">
            <label class="props-field-label">Limite</label>
            <div class="flex items-center gap-1 flex-1 min-w-0 pr-1 text-left justify-start">
              <select id="prop-tipo-limite" class="props-field-value flex-1 min-w-0" ${isDisabled || !seg ? 'disabled' : ''} title="${!seg ? 'Sem segmento de divisa associado' : ''}">
                <option class="bg-[#111113] text-white/90" value="">${seg ? 'Selecione...' : 'Sem Divisa'}</option>
                ${LIMITES_SIGEF.map(l => `<option class="bg-[#111113] text-white/90" value="${escapeHtml(l.codigo)}" ${(seg && seg.tipo_limite_sigef === l.codigo) ? 'selected' : ''}>${escapeHtml(l.codigo)} - ${escapeHtml(l.nome)}</option>`).join('')}
              </select>
              <button type="button" id="btn-ajuda-limite" class="p-0.5 bg-mint-vibrant/10 hover:bg-mint-vibrant/25 border border-mint-vibrant/30 rounded text-mint-vibrant transition-colors active:scale-95 flex items-center justify-center shrink-0 w-4 h-4" title="Catálogo de Tipos de Limite">
                <i data-lucide="help-circle" class="w-2.5 h-2.5"></i>
              </button>
            </div>
          </div>

          ${ctx.modoCoordenadas === 'utm' ? `
            <div class="props-field">
              <label class="props-field-label">Este (E)</label>
              <input type="text" id="prop-e-corrigido" value="${formatCoordinate(eVal, 3)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma E</label>
              <input type="text" value="${p.sigma_e != null ? parseNumberDefault(p.sigma_e).toFixed(4) + ' m' : '-'}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Norte (N)</label>
              <input type="text" id="prop-n-corrigido" value="${formatCoordinate(nVal, 3)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma N</label>
              <input type="text" value="${p.sigma_n != null ? parseNumberDefault(p.sigma_n).toFixed(4) + ' m' : '-'}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Altitude (H)</label>
              <input type="text" id="prop-alt-corrigido" value="${formatCoordinate(hVal, 3)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma H</label>
              <input type="text" value="${(p.sigma_z ?? p.sigma_alt) != null ? parseNumberDefault(p.sigma_z ?? p.sigma_alt).toFixed(4) + ' m' : '-'}" class="props-field-value font-mono" readonly />
            </div>
          ` : `
            <div class="props-field">
              <label class="props-field-label">Latitude</label>
              <input type="text" id="prop-lat-corrigido" value="${formatCoordinate(latVal, 9)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma Lat</label>
              <input type="text" value="${(p.sigma_lat ?? p.sigma_n) != null ? parseNumberDefault(p.sigma_lat ?? p.sigma_n).toFixed(6) + '°' : '-'}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Longitude</label>
              <input type="text" id="prop-lon-corrigido" value="${formatCoordinate(lonVal, 9)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma Lon</label>
              <input type="text" value="${(p.sigma_lon ?? p.sigma_e) != null ? parseNumberDefault(p.sigma_lon ?? p.sigma_e).toFixed(6) + '°' : '-'}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Altitude (h)</label>
              <input type="text" id="prop-alt-corrigido" value="${formatCoordinate(hVal, 3)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma Alt</label>
              <input type="text" value="${(p.sigma_alt ?? p.sigma_z) != null ? parseNumberDefault(p.sigma_alt ?? p.sigma_z).toFixed(4) + ' m' : '-'}" class="props-field-value font-mono" readonly />
            </div>
          `}

          <div class="props-quality-container">
            <div class="flex justify-between items-center text-[9px] mb-1">
              <span class="text-white/40 uppercase">Desvio Posicional</span>
              <span class="font-mono font-bold ${corResultanteClass}">${temSigmas ? resultante.toFixed(1) + ' mm' : 'N/A'}</span>
            </div>
            <div class="props-quality-track">
              <div class="props-quality-fill ${temSigmas ? (resultante <= 30 ? 'ok' : resultante <= 100 ? 'warn' : 'err') : 'bg-white/20'}" style="width: ${temSigmas ? Math.min(100, (resultante / 150) * 100) : 0}%;"></div>
            </div>
            <div class="flex justify-between text-[8px] text-white/30 font-mono mt-1 select-none">
              <span>Aprovado (≤30mm)</span>
              <span>Revisar (≤100mm)</span>
              <span>Reprovar</span>
            </div>
          </div>
        </div>
      </div>

      <!-- GRUPO 2: CONFRONTANTES -->
      <div class="props-section mt-2" id="sec-props-confrontantes">
        <div class="props-section-header" id="header-props-confrontantes">
          <i data-lucide="chevron-down"></i> Confrontantes
        </div>
        <div class="props-section-body" id="body-props-confrontantes">
          <div class="props-field">
            <label class="props-field-label">Confrontante</label>
            <input type="text" id="prop-confrontante" value="${escapeHtml(confNome)}" placeholder="Nenhum confrontante associado" class="props-field-value" ${isDisabled ? 'disabled' : ''} />
          </div>
          <div class="props-field">
            <label class="props-field-label">Matrícula</label>
            <input type="text" id="prop-confrontante-matricula" value="${escapeHtml(confMatricula)}" placeholder="Não informada" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
          </div>
          <div class="props-field">
            <label class="props-field-label">Cartório (CNS)</label>
            <input type="text" id="prop-confrontante-cartorio" value="${escapeHtml(confCartorio)}" placeholder="Não informado" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
          </div>
        </div>
      </div>

      <!-- GRUPO 3: BRUTOS (quando tiver) -->
      ${temCoordenadasBrutas ? `
      <div class="props-section mt-2" id="sec-props-brutos">
        <div class="props-section-header" id="header-props-brutos">
          <i data-lucide="chevron-down"></i> Brutos
        </div>
        <div class="props-section-body" id="body-props-brutos">
          ${ctx.modoCoordenadas === 'utm' ? `
            <div class="props-field">
              <label class="props-field-label">Este Bruto</label>
              <input type="text" value="${formatCoordinate(p.e_original, 3)}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Norte Bruto</label>
              <input type="text" value="${formatCoordinate(p.n_original, 3)}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Alt Bruta</label>
              <input type="text" value="${formatCoordinate(p.alt_original, 3)}" class="props-field-value font-mono" readonly />
            </div>
          ` : `
            <div class="props-field">
              <label class="props-field-label">Lat Bruta</label>
              <input type="text" value="${formatCoordinate(p.lat, 9)}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Lon Bruta</label>
              <input type="text" value="${formatCoordinate(p.lon, 9)}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Alt Bruta</label>
              <input type="text" value="${formatCoordinate(p.alt, 3)}" class="props-field-value font-mono" readonly />
            </div>
          `}
        </div>
      </div>
      ` : ''}

      <!-- GRUPO 4: DADOS -->
      <div class="props-section mt-2" id="sec-props-dados">
        <div class="props-section-header" id="header-props-dados">
          <i data-lucide="chevron-down"></i> Dados
        </div>
        <div class="props-section-body" id="body-props-dados">
          <div class="props-field">
            <label class="props-field-label">Origem</label>
            <input type="text" value="${escapeHtml(p.arquivo_origem || '-')}" class="props-field-value font-mono text-[9px]" readonly title="${escapeHtml(p.arquivo_origem || '')}" />
          </div>
          <div class="props-field">
            <label class="props-field-label">Correção</label>
            <input type="text" value="${escapeHtml(p.status_correcao || p.status_ponto || 'BRUTO')}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Base Apoio</label>
            <input type="text" value="${escapeHtml(nomeBaseApoio)}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field flex items-center justify-between py-1">
            <label class="props-field-label cursor-pointer select-none" for="prop-ignorar-poligono">Polígono</label>
            <input type="checkbox" id="prop-ignorar-poligono" class="rounded border-white/10 text-mint-vibrant bg-white/5 focus:ring-0 w-4 h-4 cursor-pointer" ${p.ignorar_poligono !== 1 ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} />
          </div>
        </div>
      </div>

      ${isPontoVizinho || isArquivado ? `
      <div class="props-info-container">
        <div class="text-[9px] text-yellow-500/80 italic text-center">
           ⚠️ ${isArquivado ? 'Este projeto está ARQUIVADO (Modo Somente Leitura).' : 'Pontos de confrontantes/vizinhos são protegidos contra escrita.'}
        </div>
      </div>
      ` : ''}
    `;

      setupCollapsibleSections(['geral', 'confrontantes', 'brutos', 'dados']);
      initIcons();

      const btnAjudaMetodo = document.getElementById('btn-ajuda-metodo');
      if (btnAjudaMetodo) {
        btnAjudaMetodo.onclick = () => {
          customAlert(renderModalMetodosHTML(), 'Catálogo: Métodos de Posicionamento');
        };
      }

      const btnAjudaLimite = document.getElementById('btn-ajuda-limite');
      if (btnAjudaLimite) {
        btnAjudaLimite.onclick = () => {
          customAlert(renderModalLimitesHTML(), 'Catálogo: Tipos de Limite');
        };
      }

      if (isPontoVizinho || isArquivado) {
        if (panelActions) panelActions.classList.add('hidden');
        return;
      }

      // Registra os valores originais para detecção de alteração ("dirty")
      const valoresOriginais = {
        nome_vertice: p.nome_vertice || '',
        tipo_ponto: p.tipo_ponto || p.tipo || '',
        metodo: (p as any).metodo_posicionamento || '',
        limite: (seg && seg.tipo_limite_sigef) ? seg.tipo_limite_sigef : '',
        e_corrigido: formatCoordinate(eVal, 3),
        n_corrigido: formatCoordinate(nVal, 3),
        lat_corrigido: formatCoordinate(latVal, 9),
        lon_corrigido: formatCoordinate(lonVal, 9),
        alt_corrigido: formatCoordinate(hVal, 3),
        confrontante: confNome,
        confrontante_matricula: confMatricula,
        confrontante_cartorio: confCartorio,
        ignorar_poligono: p.ignorar_poligono === 1
      };

      const inputs = [
        'prop-nome-vertice', 'prop-tipo-ponto', 'prop-alt-corrigido',
        'prop-confrontante', 'prop-confrontante-matricula', 'prop-confrontante-cartorio',
        'prop-ignorar-poligono', 'prop-metodo', 'prop-tipo-limite'
      ];

      if (ctx.modoCoordenadas === 'utm') {
        inputs.push('prop-e-corrigido', 'prop-n-corrigido');
      } else {
        inputs.push('prop-lat-corrigido', 'prop-lon-corrigido');
      }

      const verificarAlteracoes = () => {
        let modificado = false;

        const checkDirty = (id: string, originalVal: any, isCheckbox = false) => {
          const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
          if (el) {
            const val = isCheckbox ? (el as HTMLInputElement).checked : el.value;
            const d = val !== originalVal;
            el.classList.toggle('dirty', d);
            if (d) modificado = true;
          }
        };

        checkDirty('prop-nome-vertice', valoresOriginais.nome_vertice);
        checkDirty('prop-tipo-ponto', valoresOriginais.tipo_ponto);
        checkDirty('prop-metodo', valoresOriginais.metodo);
        checkDirty('prop-tipo-limite', valoresOriginais.limite);

        if (ctx.modoCoordenadas === 'utm') {
          checkDirty('prop-e-corrigido', valoresOriginais.e_corrigido);
          checkDirty('prop-n-corrigido', valoresOriginais.n_corrigido);
        } else {
          checkDirty('prop-lat-corrigido', valoresOriginais.lat_corrigido);
          checkDirty('prop-lon-corrigido', valoresOriginais.lon_corrigido);
        }
        checkDirty('prop-alt-corrigido', valoresOriginais.alt_corrigido);

        checkDirty('prop-confrontante', valoresOriginais.confrontante);
        checkDirty('prop-confrontante-matricula', valoresOriginais.confrontante_matricula);
        checkDirty('prop-confrontante-cartorio', valoresOriginais.confrontante_cartorio);
        checkDirty('prop-ignorar-poligono', valoresOriginais.ignorar_poligono, true);

        if (panelActions) {
          panelActions.classList.toggle('hidden', !modificado);
        }
      };

      inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', verificarAlteracoes);
          el.addEventListener('change', verificarAlteracoes);
        }
      });

      const btnSugerir = document.getElementById('btn-sugerir-nome');
      if (btnSugerir) {
        btnSugerir.onclick = async () => {
          try {
            const tipoSelect = document.getElementById('prop-tipo-ponto') as HTMLSelectElement;
            const tipo = tipoSelect ? tipoSelect.value : (p!.tipo_ponto || p!.tipo);

            if (!['M', 'P', 'V'].includes(tipo || '')) {
              showToast("Sugestão de nome oficial apenas para Marcos (M), Pontos (P) ou Virtuais (V).", "info");
              return;
            }

            const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos-sugeridos`);
            if (!res.ok) throw new Error("Erro ao buscar sugestão de código");

            const data = await res.json();
            const sug = data.sugestoes[tipo!];
            if (sug && sug.codigo_sugerido) {
              const nomeInput = document.getElementById('prop-nome-vertice') as HTMLInputElement;
              if (nomeInput) {
                nomeInput.value = sug.codigo_sugerido;
                nomeInput.classList.add('dirty');
                verificarAlteracoes();
                showToast(`Sugestão aplicada: ${sug.codigo_sugerido}`, "success");
              }
            }
          } catch (err) {
            console.error(err);
            showToast(tratarErroAPI(err, "Erro ao sugerir código de ponto."), "error");
          }
        };
      }

      // Salvar Alterações
      const btnSalvar = document.getElementById('btn-props-salvar');
      if (btnSalvar) {
        const novoBtn = btnSalvar.cloneNode(true) as HTMLButtonElement;
        btnSalvar.parentNode?.replaceChild(novoBtn, btnSalvar);

        novoBtn.onclick = async () => {
          const nomeInput = document.getElementById('prop-nome-vertice') as HTMLInputElement;
          const tipoSelect = document.getElementById('prop-tipo-ponto') as HTMLSelectElement;
          const altInput = document.getElementById('prop-alt-corrigido') as HTMLInputElement;
          const ignorarCheck = document.getElementById('prop-ignorar-poligono') as HTMLInputElement;
          const metodoSelect = document.getElementById('prop-metodo') as HTMLSelectElement;
          const limiteSelect = document.getElementById('prop-tipo-limite') as HTMLSelectElement;

          const altVal = parseFloat(altInput.value);

          const payload: any = {
            nome_vertice: nomeInput.value,
            tipo_ponto: tipoSelect.value,
            ignorar_poligono: ignorarCheck.checked ? 0 : 1,
            metodo_posicionamento: metodoSelect.value
          };

          if (ctx.modoCoordenadas === 'utm') {
            const eInput = document.getElementById('prop-e-corrigido') as HTMLInputElement;
            const nInput = document.getElementById('prop-n-corrigido') as HTMLInputElement;
            payload.e_corrigido = parseFloat(eInput.value);
            payload.n_corrigido = parseFloat(nInput.value);
            payload.alt_corrigido = altVal;
            payload.alt = altVal;
            payload.fuso = p!.fuso || localStorage.getItem(`utm_zone_${ctx.currentLevId}`) || '22S';
          } else {
            const latInput = document.getElementById('prop-lat-corrigido') as HTMLInputElement;
            const lonInput = document.getElementById('prop-lon-corrigido') as HTMLInputElement;
            payload.lat = parseFloat(latInput.value);
            payload.lon = parseFloat(lonInput.value);
            payload.alt = altVal;
            payload.alt_corrigido = altVal; // GEO-02: Mantém sincronização atômica inter-projeções
          }

          try {
            const res = await fetch(`${API_BASE}/pontos/${p!.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            if (res.status === 403) {
              throw new Error("Este projeto está ARQUIVADO e não pode ser modificado (Modo Somente Leitura).");
            }
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.detail || errData.error || "Falha ao salvar vértice");
            }

            const confNomeVal = (document.getElementById('prop-confrontante') as HTMLInputElement).value;
            const confMatriculaVal = (document.getElementById('prop-confrontante-matricula') as HTMLInputElement).value;
            const confCartorioVal = (document.getElementById('prop-confrontante-cartorio') as HTMLInputElement).value;

            const confrontanteAlterado =
              confNomeVal !== valoresOriginais.confrontante ||
              confMatriculaVal !== valoresOriginais.confrontante_matricula ||
              confCartorioVal !== valoresOriginais.confrontante_cartorio;

            if (confrontanteAlterado) {
              const confrontanteIdAtual = p!.confrontante_id || (seg && seg.confrontante_id);

              if (confNomeVal.trim() === '') {
                if (seg && seg.confrontante_id) {
                  await fetch(`${API_BASE}/segmentos/${seg.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      matricula_id: seg.matricula_id,
                      ponto_inicio_id: seg.ponto_inicio_id,
                      ponto_fim_id: seg.ponto_fim_id,
                      confrontante_id: null,
                      tipo_limite_sigef: limiteSelect.value,
                      metodo_posicionamento_sigef: metodoSelect.value
                    })
                  });
                } else if (p!.confrontante_id) {
                  throw new Error(
                    "Não é possível remover o confrontante deste vértice pelo painel: " +
                    "o vínculo está gravado diretamente no ponto (vértice integrado de " +
                    "vizinho) e não há endpoint de API para desvincular esse campo."
                  );
                }
              } else if (confrontanteIdAtual) {
                const resConf = await fetch(`${API_BASE}/confrontantes/${confrontanteIdAtual}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ...confObj,
                    nome: confNomeVal,
                    matricula_imovel: confMatriculaVal,
                    cns_confrontante: confCartorioVal,
                    tipo_relacao: confObj?.tipo_relacao || 'Divisa'
                  })
                });
                if (!resConf.ok) {
                  throw new Error(`Erro ao atualizar confrontante: HTTP ${resConf.status}`);
                }
                const resConfData = await resConf.json().catch(() => ({}));
                if (resConfData.error) {
                  throw new Error(`Erro ao atualizar confrontante: ${resConfData.error}`);
                }
              } else {
                // GEO-03: Trata ausência de segmento perimetral antes da tentativa de salvar
                if (!seg) {
                  throw new Error(
                    "Não foi possível salvar o confrontante: este vértice não possui um " +
                    "segmento de divisa associado em memória. Rode 'Reordenar Perimetral' " +
                    "na matrícula para regenerar os segmentos e tente novamente."
                  );
                }
                const resConf = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    nome: confNomeVal,
                    matricula_imovel: confMatriculaVal,
                    cns_confrontante: confCartorioVal,
                    tipo_relacao: 'Divisa'
                  })
                });
                if (!resConf.ok) {
                  throw new Error(`Erro ao criar confrontante: HTTP ${resConf.status}`);
                }
                const resConfData = await resConf.json().catch(() => ({}));
                if (resConfData.error) {
                  throw new Error(`Erro ao criar confrontante: ${resConfData.error}`);
                }
                const confId = resConfData.id || resConfData.confrontante_id;
                if (confId) {
                  const resSeg = await fetch(`${API_BASE}/segmentos/${seg.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      matricula_id: seg.matricula_id,
                      ponto_inicio_id: seg.ponto_inicio_id,
                      ponto_fim_id: seg.ponto_fim_id,
                      confrontante_id: confId,
                      tipo_limite_sigef: limiteSelect.value,
                      metodo_posicionamento_sigef: metodoSelect.value
                    })
                  });
                  if (!resSeg.ok) {
                    throw new Error(`Erro ao associar confrontante ao segmento: HTTP ${resSeg.status}`);
                  }
                  const resSegData = await resSeg.json().catch(() => ({}));
                  if (resSegData.error) {
                    throw new Error(`Erro ao associar confrontante ao segmento: ${resSegData.error}`);
                  }
                }
              }
            } else if (seg && (limiteSelect.value !== valoresOriginais.limite || metodoSelect.value !== valoresOriginais.metodo)) {
              const resSeg = await fetch(`${API_BASE}/segmentos/${seg.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  matricula_id: seg.matricula_id,
                  ponto_inicio_id: seg.ponto_inicio_id,
                  ponto_fim_id: seg.ponto_fim_id,
                  confrontante_id: seg.confrontante_id,
                  tipo_limite_sigef: limiteSelect.value,
                  metodo_posicionamento_sigef: metodoSelect.value
                })
              });
              if (!resSeg.ok) throw new Error(`Erro ao atualizar segmento: HTTP ${resSeg.status}`);
            }

            showToast("Vértice salvo com sucesso!", "success");
            await ctx.loadLevantamentoDetails();
            atualizarPainelPropriedades(ctx);
          } catch (err) {
            console.error(err);
            showToast(tratarErroAPI(err, "Erro ao salvar alterações no vértice."), "error");
          }
        };
      }

      const btnDescartar = document.getElementById('btn-props-descartar');
      if (btnDescartar) {
        const novoBtn = btnDescartar.cloneNode(true) as HTMLButtonElement;
        btnDescartar.parentNode?.replaceChild(novoBtn, btnDescartar);
        novoBtn.onclick = () => {
          atualizarPainelPropriedades(ctx);
        };
      }

      if (panelActions) {
        if (isPontoVizinho || isArquivado) {
          panelActions.classList.add('hidden');
        } else {
          panelActions.classList.remove('hidden');
        }
      }
    }
    else {
      // Caso 3: Múltiplos Vértices Selecionados — Painel Unificado
      const isArquivado = ctx.currentLevantamento?.status === 'ARQUIVADO';

      // SEC-02: Filtra e impede a escrita em pontos protegidos de vizinhos
      const pontosMulti: Ponto[] = selectedPontoIds
        .map((id: number) => pontosList.find((pt: Ponto) => pt.id === id))
        .filter((pt?: Ponto): pt is Ponto => Boolean(pt) && pt!.ponto_vizinho !== 1);

      const resolveField = (extractor: (p: Ponto) => string): string => {
        const vals = pontosMulti.map(extractor);
        const unique = [...new Set(vals)];
        return unique.length === 1 ? unique[0] : 'várias';
      };

      const resolveNum = (extractor: (p: Ponto) => number | null, decimals: number): string => {
        const vals = pontosMulti.map(extractor);
        const unique = [...new Set(vals.map(v => v !== null ? v.toFixed(decimals) : '-'))];
        return unique.length === 1 ? unique[0] : 'várias';
      };

      const tipoResolvido = resolveField(p => p.tipo_ponto || p.tipo || '');
      const metodoResolvidoMulti = resolveField(p => (p as any).metodo_posicionamento || '');
      const limiteResolvidoMulti = resolveField(p => {
        const seg = segmentosList.find((s: Segmento) => s.ponto_inicio_id === p.id);
        return seg ? (seg.tipo_limite_sigef || '') : '';
      });

      const modUtm = ctx.modoCoordenadas === 'utm';
      let coordDisplay: { label: string; value: string }[] = [];

      if (modUtm) {
        const resolveE = (p: Ponto) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumberOrNull(isC && p.e_corrigido != null ? p.e_corrigido : p.e_original);
        };
        const resolveN = (p: Ponto) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumberOrNull(isC && p.n_corrigido != null ? p.n_corrigido : p.n_original);
        };
        const resolveH = (p: Ponto) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumberOrNull(isC && p.alt_corrigido != null ? p.alt_corrigido : (p.alt ?? p.alt_original));
        };
        coordDisplay = [
          { label: 'Este (E)', value: resolveNum(resolveE, 3) },
          { label: 'Norte (N)', value: resolveNum(resolveN, 3) },
          { label: 'Altitude (H)', value: resolveNum(resolveH, 3) },
        ];
      } else {
        const resolveLat = (p: Ponto) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumberOrNull(isC && p.lat_corrigido != null ? p.lat_corrigido : p.lat);
        };
        const resolveLon = (p: Ponto) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumberOrNull(isC && p.lon_corrigido != null ? p.lon_corrigido : p.lon);
        };
        const resolveH = (p: Ponto) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumberOrNull(isC && p.alt_corrigido != null ? p.alt_corrigido : (p.alt ?? p.alt_original));
        };
        coordDisplay = [
          { label: 'Latitude', value: resolveNum(resolveLat, 9) },
          { label: 'Longitude', value: resolveNum(resolveLon, 9) },
          { label: 'Altitude (h)', value: resolveNum(resolveH, 3) },
        ];
      }

      const resolveConf = (field: 'nome' | 'matricula_imovel' | 'cns_confrontante'): string => {
        const vals = pontosMulti.map(p => {
          const seg = segmentosList.find((s: Segmento) => s.ponto_inicio_id === p.id);
          const cId = p.confrontante_id || (seg && seg.confrontante_id);
          if (!cId) return '';
          const cObj = confrontantesList.find((c: Confrontante) => c.id === cId);
          return cObj ? (cObj[field] || '') : '';
        });
        const unique = [...new Set(vals)];
        return unique.length === 1 ? unique[0] : 'várias';
      };

      const confNomeResolvido = resolveConf('nome');
      const confMatResolvido = resolveConf('matricula_imovel');
      const confCnsResolvido = resolveConf('cns_confrontante');

      const ignorarVals = pontosMulti.map(p => p.ignorar_poligono === 1);
      const todosIgnorados = ignorarVals.every(v => v === true);
      const todosIncluidos = ignorarVals.every(v => v === false);
      const poligonoIndeterminate = !todosIgnorados && !todosIncluidos;

      const origemResolvida = resolveField(p => p.arquivo_origem || '-');
      const correcaoResolvida = resolveField(p => p.status_correcao || p.status_ponto || 'BRUTO');
      const baseApoioResolvida = resolveField(p => {
        if (!p.ponto_base_id) return 'Nenhuma';
        const basePt = pontosList.find((pt: Ponto) => pt.id === p.ponto_base_id);
        return basePt ? (basePt.nome_vertice || `ID ${p.ponto_base_id}`) : 'Nenhuma';
      });

      const algumTemBrutos = pontosMulti.some(p => {
        const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
        return isC && (p.e_original != null || p.lat != null || p.lon != null);
      });

      const resolveBruto = (extractor: (p: Ponto) => string): string => {
        const vals = pontosMulti.map(p => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return isC ? extractor(p) : '-';
        });
        const unique = [...new Set(vals)];
        return unique.length === 1 ? unique[0] : 'várias';
      };

      let brutosFieldsHTML = '';
      if (algumTemBrutos) {
        if (modUtm) {
          brutosFieldsHTML = `
          <div class="props-field">
            <label class="props-field-label">Este Bruto</label>
            <input type="text" value="${resolveBruto(p => formatCoordinate(p.e_original, 3))}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Norte Bruto</label>
            <input type="text" value="${resolveBruto(p => formatCoordinate(p.n_original, 3))}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Alt Bruta</label>
            <input type="text" value="${resolveBruto(p => formatCoordinate(p.alt_original, 3))}" class="props-field-value font-mono" readonly />
          </div>`;
        } else {
          brutosFieldsHTML = `
          <div class="props-field">
            <label class="props-field-label">Lat Bruta</label>
            <input type="text" value="${resolveBruto(p => formatCoordinate(p.lat, 9))}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Lon Bruta</label>
            <input type="text" value="${resolveBruto(p => formatCoordinate(p.lon, 9))}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Alt Bruta</label>
            <input type="text" value="${resolveBruto(p => formatCoordinate(p.alt, 3))}" class="props-field-value font-mono" readonly />
          </div>`;
        }
      }

      const coordFieldsHTML = coordDisplay.map(f => `
      <div class="props-field">
        <label class="props-field-label">${escapeHtml(f.label)}</label>
        <input type="text" value="${escapeHtml(f.value)}" class="props-field-value font-mono" readonly title="Edição de coordenadas não disponível em seleção múltipla" />
      </div>
    `).join('');

      panelContent.innerHTML = `
      <!-- GRUPO 1: GERAL -->
      <div class="props-section" id="sec-props-geral">
        <div class="props-section-header" id="header-props-geral">
          <i data-lucide="chevron-down"></i> Geral
        </div>
        <div class="props-section-body" id="body-props-geral">
          <div class="props-field mb-3 flex items-center justify-between">
            <span class="text-[9px] uppercase font-bold tracking-wider text-white/40">Seleção</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold border bg-mint-vibrant/10 text-mint-vibrant border-mint-vibrant/20">
              ${escapeHtml(String(selectedCount))} vértices
            </span>
          </div>

          <div class="props-field">
            <label class="props-field-label">Tipo</label>
            <select id="prop-multi-tipo" class="props-field-value" ${isArquivado ? 'disabled' : ''}>
              ${tipoResolvido === 'várias' ? '<option class="bg-[#111113] text-white/90" value="">várias</option>' : ''}
              <option class="bg-[#111113] text-white/90" value="M" ${tipoResolvido === 'M' ? 'selected' : ''}>M - Marco</option>
              <option class="bg-[#111113] text-white/90" value="P" ${tipoResolvido === 'P' ? 'selected' : ''}>P - Ponto</option>
              <option class="bg-[#111113] text-white/90" value="V" ${tipoResolvido === 'V' ? 'selected' : ''}>V - Virtual</option>
              <option class="bg-[#111113] text-white/90" value="B" ${tipoResolvido === 'B' ? 'selected' : ''}>B - Base</option>
            </select>
          </div>

          <div class="props-field">
            <label class="props-field-label">Método</label>
            <div class="flex items-center gap-1 flex-1 min-w-0 pr-1 text-left justify-start">
              <select id="prop-multi-metodo" class="props-field-value flex-1 min-w-0" ${isArquivado ? 'disabled' : ''}>
                ${metodoResolvidoMulti === 'várias' ? '<option class="bg-[#111113] text-white/90" value="">várias</option>' : '<option class="bg-[#111113] text-white/90" value="">Selecione...</option>'}
                ${METODOS_SIGEF.map(m => `<option class="bg-[#111113] text-white/90" value="${escapeHtml(m.codigo)}" ${metodoResolvidoMulti === m.codigo ? 'selected' : ''}>${escapeHtml(m.codigo)} - ${escapeHtml(m.nome)}</option>`).join('')}
              </select>
              <button type="button" id="btn-ajuda-metodo-multi" class="p-0.5 bg-mint-vibrant/10 hover:bg-mint-vibrant/25 border border-mint-vibrant/30 rounded text-mint-vibrant transition-colors active:scale-95 flex items-center justify-center shrink-0 w-4 h-4" title="Catálogo de Métodos SIGEF">
                <i data-lucide="help-circle" class="w-2.5 h-2.5"></i>
              </button>
            </div>
          </div>
          
          <div class="props-field">
            <label class="props-field-label">Limite</label>
            <div class="flex items-center gap-1 flex-1 min-w-0 pr-1 text-left justify-start">
              <select id="prop-multi-tipo-limite" class="props-field-value flex-1 min-w-0" ${isArquivado ? 'disabled' : ''}>
                ${limiteResolvidoMulti === 'várias' ? '<option class="bg-[#111113] text-white/90" value="">várias</option>' : '<option class="bg-[#111113] text-white/90" value="">Selecione...</option>'}
                ${LIMITES_SIGEF.map(l => `<option class="bg-[#111113] text-white/90" value="${escapeHtml(l.codigo)}" ${limiteResolvidoMulti === l.codigo ? 'selected' : ''}>${escapeHtml(l.codigo)} - ${escapeHtml(l.nome)}</option>`).join('')}
              </select>
              <button type="button" id="btn-ajuda-limite-multi" class="p-0.5 bg-mint-vibrant/10 hover:bg-mint-vibrant/25 border border-mint-vibrant/30 rounded text-mint-vibrant transition-colors active:scale-95 flex items-center justify-center shrink-0 w-4 h-4" title="Catálogo de Tipos de Limite">
                <i data-lucide="help-circle" class="w-2.5 h-2.5"></i>
              </button>
            </div>
          </div>

          ${coordFieldsHTML}
        </div>
      </div>

      <!-- GRUPO 2: CONFRONTANTES -->
      <div class="props-section mt-2" id="sec-props-confrontantes">
        <div class="props-section-header" id="header-props-confrontantes">
          <i data-lucide="chevron-down"></i> Confrontantes
        </div>
        <div class="props-section-body" id="body-props-confrontantes">
          <div class="props-field">
            <label class="props-field-label">Confrontante</label>
            <input type="text" id="prop-multi-confrontante" value="${escapeHtml(confNomeResolvido === 'várias' ? '' : confNomeResolvido)}" placeholder="${escapeHtml(confNomeResolvido === 'várias' ? 'várias' : 'Nenhum confrontante associado')}" class="props-field-value" ${isArquivado ? 'disabled' : ''} />
          </div>
          <div class="props-field">
            <label class="props-field-label">Matrícula</label>
            <input type="text" id="prop-multi-confrontante-matricula" value="${escapeHtml(confMatResolvido === 'várias' ? '' : confMatResolvido)}" placeholder="${escapeHtml(confMatResolvido === 'várias' ? 'várias' : 'Não informada')}" class="props-field-value font-mono" ${isArquivado ? 'disabled' : ''} />
          </div>
          <div class="props-field">
            <label class="props-field-label">Cartório (CNS)</label>
            <input type="text" id="prop-multi-confrontante-cartorio" value="${escapeHtml(confCnsResolvido === 'várias' ? '' : confCnsResolvido)}" placeholder="${escapeHtml(confCnsResolvido === 'várias' ? 'várias' : 'Não informado')}" class="props-field-value font-mono" ${isArquivado ? 'disabled' : ''} />
          </div>
        </div>
      </div>

      <!-- GRUPO 3: BRUTOS (quando algum ponto corrigido tiver brutas) -->
      ${algumTemBrutos ? `
      <div class="props-section mt-2" id="sec-props-brutos">
        <div class="props-section-header" id="header-props-brutos">
          <i data-lucide="chevron-down"></i> Brutos
        </div>
        <div class="props-section-body" id="body-props-brutos">
          ${brutosFieldsHTML}
        </div>
      </div>
      ` : ''}

      <!-- GRUPO 4: DADOS -->
      <div class="props-section mt-2" id="sec-props-info">
        <div class="props-section-header" id="header-props-info">
          <i data-lucide="chevron-down"></i> Dados
        </div>
        <div class="props-section-body" id="body-props-info">
          <div class="props-field">
            <label class="props-field-label">Origem</label>
            <input type="text" value="${escapeHtml(origemResolvida)}" class="props-field-value font-mono text-[9px]" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Correção</label>
            <input type="text" value="${escapeHtml(correcaoResolvida)}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Base Apoio</label>
            <input type="text" value="${escapeHtml(baseApoioResolvida)}" class="props-field-value font-mono" readonly />
          </div>
        </div>
      </div>

      <!-- GRUPO 5: AÇÕES -->
      <div class="props-section mt-2" id="sec-props-dados">
        <div class="props-section-header" id="header-props-dados">
          <i data-lucide="chevron-down"></i> Ações
        </div>
        <div class="props-section-body" id="body-props-dados">
          <div class="props-field flex items-center justify-between py-1">
            <label class="props-field-label cursor-pointer select-none" for="prop-multi-ignorar-poligono">Polígono</label>
            <input type="checkbox" id="prop-multi-ignorar-poligono" class="rounded border-white/10 text-mint-vibrant bg-white/5 focus:ring-0 w-4 h-4 cursor-pointer" ${todosIncluidos ? 'checked' : ''} ${isArquivado ? 'disabled' : ''} />
          </div>
          <div class="space-y-2 mt-3">
            <button class="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-bold py-2 rounded-md hover:bg-yellow-500/20 hover:text-white transition-all w-full flex items-center justify-center gap-1.5 cursor-pointer ${isArquivado ? 'opacity-50 pointer-events-none' : ''}" id="btn-batch-props-ignorar" ${isArquivado ? 'disabled' : ''} type="button">
              Alternar Participação no Polígono
            </button>
            <button class="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold py-2 rounded-md hover:bg-red-500 hover:text-white transition-all w-full flex items-center justify-center gap-1.5 cursor-pointer ${isArquivado ? 'opacity-50 pointer-events-none' : ''}" id="btn-batch-props-deletar" ${isArquivado ? 'disabled' : ''} type="button">
              Excluir Vértices Selecionados
            </button>
          </div>
        </div>
      </div>

      ${isArquivado ? `
      <div class="props-info-container">
        <div class="text-[9px] text-yellow-500/80 italic text-center">
          ⚠️ Este projeto está ARQUIVADO (Modo Somente Leitura).
        </div>
      </div>
      ` : ''}
    `;

      setupCollapsibleSections(['geral', 'confrontantes', 'brutos', 'info', 'dados']);
      initIcons();

      const btnAjudaMetodoMulti = document.getElementById('btn-ajuda-metodo-multi');
      if (btnAjudaMetodoMulti) {
        btnAjudaMetodoMulti.onclick = () => {
          customAlert(renderModalMetodosHTML(), 'Catálogo: Métodos de Posicionamento');
        };
      }

      const btnAjudaLimiteMulti = document.getElementById('btn-ajuda-limite-multi');
      if (btnAjudaLimiteMulti) {
        btnAjudaLimiteMulti.onclick = () => {
          customAlert(renderModalLimitesHTML(), 'Catálogo: Tipos de Limite');
        };
      }

      // Aplica indeterminate síncrono/seguro no checkbox de polígono
      const checkPoli = document.getElementById('prop-multi-ignorar-poligono') as HTMLInputElement;
      if (checkPoli && poligonoIndeterminate) {
        checkPoli.indeterminate = true;
      }

      if (panelActions) panelActions.classList.add('hidden');

      if (isArquivado) {
        const btnBatchIgnorar = document.getElementById('btn-batch-props-ignorar');
        if (btnBatchIgnorar) btnBatchIgnorar.onclick = () => document.getElementById('btn-batch-ignorar')?.click();
        const btnBatchDeletar = document.getElementById('btn-batch-props-deletar');
        if (btnBatchDeletar) btnBatchDeletar.onclick = () => document.getElementById('btn-batch-deletar')?.click();
        return;
      }

      const multiOriginais = {
        tipo: tipoResolvido === 'várias' ? '' : tipoResolvido,
        metodo: metodoResolvidoMulti === 'várias' ? '' : metodoResolvidoMulti,
        limite: limiteResolvidoMulti === 'várias' ? '' : limiteResolvidoMulti,
        confrontante: confNomeResolvido === 'várias' ? '' : confNomeResolvido,
        confrontante_matricula: confMatResolvido === 'várias' ? '' : confMatResolvido,
        confrontante_cartorio: confCnsResolvido === 'várias' ? '' : confCnsResolvido,
        ignorar_poligono: todosIncluidos,
      };

      const verificarAlteracoesMulti = () => {
        let modificado = false;

        const tipoEl = document.getElementById('prop-multi-tipo') as HTMLSelectElement;
        if (tipoEl && tipoEl.value && tipoEl.value !== multiOriginais.tipo) {
          tipoEl.classList.add('dirty');
          modificado = true;
        } else if (tipoEl) {
          tipoEl.classList.remove('dirty');
        }

        const metodoEl = document.getElementById('prop-multi-metodo') as HTMLSelectElement;
        if (metodoEl && metodoEl.value && metodoEl.value !== multiOriginais.metodo) {
          metodoEl.classList.add('dirty');
          modificado = true;
        } else if (metodoEl) {
          metodoEl.classList.remove('dirty');
        }

        const limiteEl = document.getElementById('prop-multi-tipo-limite') as HTMLSelectElement;
        if (limiteEl && limiteEl.value && limiteEl.value !== multiOriginais.limite) {
          limiteEl.classList.add('dirty');
          modificado = true;
        } else if (limiteEl) {
          limiteEl.classList.remove('dirty');
        }

        const confEl = document.getElementById('prop-multi-confrontante') as HTMLInputElement;
        if (confEl && confEl.value !== multiOriginais.confrontante) {
          confEl.classList.add('dirty');
          modificado = true;
        } else if (confEl) {
          confEl.classList.remove('dirty');
        }

        const confMatEl = document.getElementById('prop-multi-confrontante-matricula') as HTMLInputElement;
        if (confMatEl && confMatEl.value !== multiOriginais.confrontante_matricula) {
          confMatEl.classList.add('dirty');
          modificado = true;
        } else if (confMatEl) {
          confMatEl.classList.remove('dirty');
        }

        const confCnsEl = document.getElementById('prop-multi-confrontante-cartorio') as HTMLInputElement;
        if (confCnsEl && confCnsEl.value !== multiOriginais.confrontante_cartorio) {
          confCnsEl.classList.add('dirty');
          modificado = true;
        } else if (confCnsEl) {
          confCnsEl.classList.remove('dirty');
        }

        const poliEl = document.getElementById('prop-multi-ignorar-poligono') as HTMLInputElement;
        if (poliEl && !poliEl.indeterminate && poliEl.checked !== multiOriginais.ignorar_poligono) {
          modificado = true;
        }

        if (panelActions) panelActions.classList.toggle('hidden', !modificado);
      };

      ['prop-multi-tipo', 'prop-multi-metodo', 'prop-multi-tipo-limite', 'prop-multi-confrontante', 'prop-multi-confrontante-matricula', 'prop-multi-confrontante-cartorio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', verificarAlteracoesMulti);
          el.addEventListener('change', verificarAlteracoesMulti);
        }
      });

      const checkPoliElOrig = document.getElementById('prop-multi-ignorar-poligono') as HTMLInputElement;
      if (checkPoliElOrig) {
        const checkPoliEl = checkPoliElOrig.cloneNode(true) as HTMLInputElement;
        checkPoliElOrig.parentNode?.replaceChild(checkPoliEl, checkPoliElOrig);

        checkPoliEl.addEventListener('change', () => {
          checkPoliEl.indeterminate = false;
          verificarAlteracoesMulti();
        });
      }

      // Botão Salvar em lote
      const btnSalvar = document.getElementById('btn-props-salvar');
      if (btnSalvar) {
        const novoBtn = btnSalvar.cloneNode(true) as HTMLButtonElement;
        btnSalvar.parentNode?.replaceChild(novoBtn, btnSalvar);

        novoBtn.onclick = async () => {
          const tipoEl = document.getElementById('prop-multi-tipo') as HTMLSelectElement;
          const metodoEl = document.getElementById('prop-multi-metodo') as HTMLSelectElement;
          const limiteEl = document.getElementById('prop-multi-tipo-limite') as HTMLSelectElement;
          const confEl = document.getElementById('prop-multi-confrontante') as HTMLInputElement;
          const confMatEl = document.getElementById('prop-multi-confrontante-matricula') as HTMLInputElement;
          const confCnsEl = document.getElementById('prop-multi-confrontante-cartorio') as HTMLInputElement;
          const poliEl = document.getElementById('prop-multi-ignorar-poligono') as HTMLInputElement;

          const tipoAlterado = tipoEl && tipoEl.value && tipoEl.value !== multiOriginais.tipo;
          const metodoAlterado = metodoEl && metodoEl.value && metodoEl.value !== multiOriginais.metodo;
          const limiteAlterado = limiteEl && limiteEl.value && limiteEl.value !== multiOriginais.limite;
          const confAlterado = (confEl && confEl.value !== multiOriginais.confrontante) ||
            (confMatEl && confMatEl.value !== multiOriginais.confrontante_matricula) ||
            (confCnsEl && confCnsEl.value !== multiOriginais.confrontante_cartorio);
          if (poliEl) poliEl.indeterminate = false;
          const poliAlterado = poliEl && !poliEl.indeterminate && poliEl.checked !== multiOriginais.ignorar_poligono;

          try {
            novoBtn.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 animate-spin"></i> Atualizando ${pontosMulti.length} vértices...`;
            initIcons();

            const batchPayload: any = { pontos: [] };
            const segmentoPromises: Promise<Response>[] = [];

            for (const pObj of pontosMulti) {
              const pid = pObj.id;
              const itemPayload: any = { id: pid };

              if (tipoAlterado) itemPayload.tipo_ponto = tipoEl.value;
              if (metodoAlterado) itemPayload.metodo_posicionamento = metodoEl.value;
              if (poliAlterado) itemPayload.ignorar_poligono = poliEl.checked ? 0 : 1;

              if (limiteAlterado || metodoAlterado) {
                const seg = segmentosList.find((s: Segmento) => s.ponto_inicio_id === pid);
                if (seg) {
                  // ARQ-01: Armazena promessa para execução paralela via Promise.all
                  segmentoPromises.push(
                    fetch(`${API_BASE}/segmentos/${seg.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        matricula_id: seg.matricula_id,
                        ponto_inicio_id: seg.ponto_inicio_id,
                        ponto_fim_id: seg.ponto_fim_id,
                        confrontante_id: seg.confrontante_id,
                        tipo_limite_sigef: limiteAlterado ? limiteEl.value : seg.tipo_limite_sigef,
                        metodo_posicionamento_sigef: metodoAlterado ? metodoEl.value : seg.metodo_posicionamento_sigef
                      })
                    })
                  );
                }
              }

              if (confAlterado) {
                const seg = segmentosList.find((s: Segmento) => s.ponto_inicio_id === pid);
                const cId = pObj.confrontante_id || (seg && seg.confrontante_id);
                const cObj = cId ? confrontantesList.find((c: Confrontante) => c.id === cId) : null;

                const confNomeInput = confEl.value.trim();
                const confMatInput = confMatEl.value.trim();
                const confCnsInput = confCnsEl.value.trim();

                const finalNome = confNomeInput !== '' ? confNomeInput : (cObj?.nome || '');
                const finalMat = confMatInput !== '' ? confMatInput : (cObj?.matricula_imovel || '');
                const finalCns = confCnsInput !== '' ? confCnsInput : (cObj?.cns_confrontante || '');

                if ((finalNome !== '' || finalMat !== '' || finalCns !== '') && (cId || seg)) {
                  itemPayload.confrontante = {
                    nome: finalNome || finalMat || 'Confrontante',
                    matricula_imovel: finalMat || null,
                    cns_confrontante: finalCns || null,
                  };
                }
              }

              if (Object.keys(itemPayload).length > 1) {
                batchPayload.pontos.push(itemPayload);
              }
            }

            // ARQ-01: Dispara todas as atualizações de segmento em paralelo
            if (segmentoPromises.length > 0) {
              const resSegs = await Promise.all(segmentoPromises);
              const falhas = resSegs.filter(r => !r.ok);
              if (falhas.length > 0) {
                throw new Error(`Falha ao atualizar ${falhas.length} segmentos perimetrais.`);
              }
            }

            if (batchPayload.pontos.length > 0) {
              const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos/batch`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batchPayload)
              });

              if (res.status === 403) {
                await customAlert("Este projeto está ARQUIVADO e não pode ser modificado (Modo Somente Leitura).");
                return;
              }

              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || errData.error || "Falha ao salvar lote de vértices");
              }

              showToast(`${batchPayload.pontos.length} vértices atualizados com sucesso!`, "success");
              await ctx.loadLevantamentoDetails();
              atualizarPainelPropriedades(ctx);
            } else {
              showToast("Nenhuma alteração detectada para salvar.", "info");
            }
          } catch (err) {
            console.error(err);
            showToast(tratarErroAPI(err, "Erro ao salvar alterações em lote."), "error");
          } finally {
            novoBtn.innerText = "Salvar Alterações em Lote";
          }
        };
      }

      const btnDescartar = document.getElementById('btn-props-descartar');
      if (btnDescartar) {
        const novoBtn = btnDescartar.cloneNode(true) as HTMLButtonElement;
        btnDescartar.parentNode?.replaceChild(novoBtn, btnDescartar);
        novoBtn.onclick = () => atualizarPainelPropriedades(ctx);
      }

      const btnBatchIgnorar = document.getElementById('btn-batch-props-ignorar');
      if (btnBatchIgnorar) {
        btnBatchIgnorar.onclick = () => document.getElementById('btn-batch-ignorar')?.click();
      }

      const btnBatchDeletar = document.getElementById('btn-batch-props-deletar');
      if (btnBatchDeletar) {
        btnBatchDeletar.onclick = () => document.getElementById('btn-batch-deletar')?.click();
      }
    }
  } catch (err) {
    console.error("Erro ao atualizar painel de propriedades:", err);
    panelContent.innerHTML = `
      <div class="p-4 text-rose-400 text-xs italic select-none">
        ❌ Erro ao renderizar propriedades do vértice: ${escapeHtml(tratarErroAPI(err, "Falha interna ao exibir propriedades"))}
      </div>
    `;
  }
}

function setupCollapsibleSections(sections: string[]): void {
  setTimeout(() => {
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

        header.onclick = () => {
          const currentlyCollapsed = header.classList.toggle('collapsed');
          body.classList.toggle('hidden', currentlyCollapsed);
          localStorage.setItem(`props_collapsed_${sec}`, currentlyCollapsed ? 'true' : 'false');

          const icon = header.querySelector('i, svg');
          if (icon) {
            (icon as HTMLElement).style.transform = currentlyCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
          }
        };
      }
    });
  }, 10);
}