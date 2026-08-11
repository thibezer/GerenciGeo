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

export function renderPainelMultiSelecao(ctx: any, panelContent: HTMLElement, panelActions: HTMLElement | null, signal: AbortSignal, pontosList: Ponto[], confrontantesList: Confrontante[], selectedPontoIds: string[], selectedVizinhoPontoIds: string[], isArquivado: boolean) {
  const selectedCount = selectedPontoIds.length;
  const selectedVizinhoCount = selectedVizinhoPontoIds.length;
      // Caso 3: Múltiplos Vértices Selecionados — Painel Unificado
      // const isArquivado = ctx.currentLevantamento?.status === 'ARQUIVADO';

      // SEC-02: Filtra e impede a escrita em pontos protegidos de vizinhos
      const pontosMulti: Ponto[] = selectedPontoIds
        .map((id: any) => pontosList.find((pt: Ponto) => pt.id === id))
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
        const seg = (ctx.segmentosList ?? []).find((s: Segmento) => s.ponto_inicio_id === p.id);
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
          const seg = (ctx.segmentosList ?? []).find((s: Segmento) => s.ponto_inicio_id === p.id);
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

      // setupCollapsibleSections(['geral', 'confrontantes', 'brutos', 'info', 'dados'], signal);
      initIcons();

      const btnAjudaMetodoMulti = document.getElementById('btn-ajuda-metodo-multi');
      if (btnAjudaMetodoMulti) {
        btnAjudaMetodoMulti.addEventListener('click', () => {
          customAlert(renderModalMetodosHTML(), 'Catálogo: Métodos de Posicionamento');
        }, { signal });
      }

      const btnAjudaLimiteMulti = document.getElementById('btn-ajuda-limite-multi');
      if (btnAjudaLimiteMulti) {
        btnAjudaLimiteMulti.addEventListener('click', () => {
          customAlert(renderModalLimitesHTML(), 'Catálogo: Tipos de Limite');
        }, { signal });
      }

      // EDGE-02: Aplica indeterminate síncrono/seguro no checkbox de polígono
      const checkPoli = document.getElementById('prop-multi-ignorar-poligono') as HTMLInputElement;
      if (checkPoli && poligonoIndeterminate) {
        checkPoli.indeterminate = true;
      }

      if (panelActions) panelActions.classList.add('hidden');

      if (isArquivado) {
        const btnBatchIgnorar = document.getElementById('btn-batch-props-ignorar');
        if (btnBatchIgnorar) btnBatchIgnorar.addEventListener('click', () => document.getElementById('btn-batch-ignorar')?.click(), { signal });
        const btnBatchDeletar = document.getElementById('btn-batch-props-deletar');
        if (btnBatchDeletar) btnBatchDeletar.addEventListener('click', () => document.getElementById('btn-batch-deletar')?.click(), { signal });
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
          el.addEventListener('input', verificarAlteracoesMulti, { signal });
          el.addEventListener('change', verificarAlteracoesMulti, { signal });
        }
      });

      const checkPoliEl = document.getElementById('prop-multi-ignorar-poligono') as HTMLInputElement;
      if (checkPoliEl) {
        checkPoliEl.addEventListener('change', () => {
          checkPoliEl.indeterminate = false;
          verificarAlteracoesMulti();
        }, { signal });
      }

      // Botão Salvar em lote
      const btnSalvar = document.getElementById('btn-props-salvar');
      if (btnSalvar) {
        btnSalvar.addEventListener('click', async () => {
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
            btnSalvar.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 animate-spin"></i> Atualizando ${pontosMulti.length} vértices...`;
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
                const seg = (ctx.segmentosList ?? []).find((s: Segmento) => s.ponto_inicio_id === pid);
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
                const seg = (ctx.segmentosList ?? []).find((s: Segmento) => s.ponto_inicio_id === pid);
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
            btnSalvar.innerText = "Salvar Alterações em Lote";
          }
        }, { signal });
      }

      const btnDescartar = document.getElementById('btn-props-descartar');
      if (btnDescartar) {
        btnDescartar.addEventListener('click', () => atualizarPainelPropriedades(ctx), { signal });
      }

      const btnBatchIgnorar = document.getElementById('btn-batch-props-ignorar');
      if (btnBatchIgnorar) {
        btnBatchIgnorar.addEventListener('click', () => document.getElementById('btn-batch-ignorar')?.click(), { signal });
      }

      const btnBatchDeletar = document.getElementById('btn-batch-props-deletar');
      if (btnBatchDeletar) {
        btnBatchDeletar.addEventListener('click', () => document.getElementById('btn-batch-deletar')?.click(), { signal });
}
}
