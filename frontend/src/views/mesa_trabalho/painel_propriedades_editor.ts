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


import { atualizarPainelPropriedades } from './painel_propriedades';

export function renderPainelSelecaoUnica(ctx: any, panelContent: HTMLElement, panelActions: HTMLElement | null, signal: AbortSignal, pontosList: Ponto[], segmentosList: Segmento[], confrontantesList: Confrontante[], selectedPontoIds: string[], selectedVizinhoPontoIds: string[], isArquivado: boolean) {
  const selectedCount = selectedPontoIds.length;
  const selectedVizinhoCount = selectedVizinhoPontoIds.length;
      let p: Ponto | undefined;
      let isPontoVizinho = false;

      if (selectedCount === 1) {
        const pId = selectedPontoIds[0];
        p = pontosList.find((pt: Ponto) => String(pt.id) === String(pId));
        isPontoVizinho = p ? p.ponto_vizinho === 1 : false;
      } else {
        const pId = selectedVizinhoPontoIds[0];
        p = (ctx.pontosVizinhosList ?? []).find((pt: Ponto) => String(pt.id) === String(pId));
        isPontoVizinho = true;
      }

      // const isArquivado = ctx.currentLevantamento?.status === 'ARQUIVADO';
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

      // setupCollapsibleSections(['geral', 'confrontantes', 'brutos', 'dados'], signal);
      initIcons();

      const btnAjudaMetodo = document.getElementById('btn-ajuda-metodo');
      if (btnAjudaMetodo) {
        btnAjudaMetodo.addEventListener('click', () => {
          customAlert(renderModalMetodosHTML(), 'Catálogo: Métodos de Posicionamento');
        }, { signal });
      }

      const btnAjudaLimite = document.getElementById('btn-ajuda-limite');
      if (btnAjudaLimite) {
        btnAjudaLimite.addEventListener('click', () => {
          customAlert(renderModalLimitesHTML(), 'Catálogo: Tipos de Limite');
        }, { signal });
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
          el.addEventListener('input', verificarAlteracoes, { signal });
          el.addEventListener('change', verificarAlteracoes, { signal });
        }
      });

      const btnSugerir = document.getElementById('btn-sugerir-nome');
      if (btnSugerir) {
        btnSugerir.addEventListener('click', async () => {
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
        }, { signal });
      }

      // Salvar Alterações (gerenciado via signal sem clones DOM)
      const btnSalvar = document.getElementById('btn-props-salvar');
      if (btnSalvar) {
        btnSalvar.addEventListener('click', async () => {
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
        }, { signal });
      }

      const btnDescartar = document.getElementById('btn-props-descartar');
      if (btnDescartar) {
        btnDescartar.addEventListener('click', () => {
          atualizarPainelPropriedades(ctx);
        }, { signal });
      }

      if (panelActions) {
        if (isPontoVizinho || isArquivado) {
          panelActions.classList.add('hidden');
        } else {
          panelActions.classList.remove('hidden');
        }
      }

}
