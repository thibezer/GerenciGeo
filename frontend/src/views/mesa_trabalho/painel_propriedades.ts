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
import { initIcons, customAlert, showToast } from '../../utils';

const METODOS_SIGEF = [
  { codigo: 'PG1', nome: 'Relativo estático', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG2', nome: 'Relativo estático-rápido', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG3', nome: 'Relativo semicinemático', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG4', nome: 'Relativo cinemático', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG5', nome: 'Relativo a partir de códigos', aplicacao: 'Limite Natural' },
  { codigo: 'PG6', nome: 'RTK convencional / RTPPP', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG7', nome: 'RTK em rede', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PG8', nome: 'Differential GPS (DGPS)', aplicacao: 'Limite Natural' },
  { codigo: 'PG9', nome: 'Posicionamento por Ponto Preciso', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT1', nome: 'Poligonação', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT2', nome: 'Triangulação', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT3', nome: 'Trilateração', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT4', nome: 'Triangulateração', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT5', nome: 'Irradiação', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT6', nome: 'Interseção linear', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT7', nome: 'Interseção angular', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT8', nome: 'Alinhamento', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PT9', nome: 'Estação Livre', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PA1', nome: 'Paralela', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PA2', nome: 'Interseção de Retas', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PA3', nome: 'Projeção Técnica', aplicacao: 'Limite Artificial ou Natural' },
  { codigo: 'PS1', nome: 'Aerofotogrametria', aplicacao: 'Limite Artificial, Natural ou Inacessível' },
  { codigo: 'PS2', nome: 'Radar aerotransportado', aplicacao: 'Limite Artificial, Natural ou Inacessível' },
  { codigo: 'PS3', nome: 'Laser scanner aerotransportado', aplicacao: 'Limite Artificial, Natural ou Inacessível' },
  { codigo: 'PS4', nome: 'Sensores orbitais', aplicacao: 'Limite Artificial, Natural ou Inacessível' },
  { codigo: 'PB1', nome: 'Base cartográfica com precisão conhecida', aplicacao: 'Limite Artificial, Natural ou Inacessível' },
  { codigo: 'PB2', nome: 'Base cartográfica sem precisão conhecida', aplicacao: 'Limite Artificial, Natural ou Inacessível' }
];

const LIMITES_SIGEF = [
  { codigo: 'LA1', nome: 'Cerca' },
  { codigo: 'LA2', nome: 'Muro' },
  { codigo: 'LA3', nome: 'Estrada' },
  { codigo: 'LA4', nome: 'Vala' },
  { codigo: 'LA5', nome: 'Canal' },
  { codigo: 'LA6', nome: 'Linha ideal' },
  { codigo: 'LA7', nome: 'Limite artificial não tipificado' },
  { codigo: 'LN1', nome: 'Corpo d’água ou curso d’água' },
  { codigo: 'LN2', nome: 'Linha de cumeada' },
  { codigo: 'LN3', nome: 'Grota' },
  { codigo: 'LN4', nome: 'Crista de encosta' },
  { codigo: 'LN5', nome: 'Pé de encosta' },
  { codigo: 'LN6', nome: 'Limite natural não tipificado' }
];

const parseNumber = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

export function atualizarPainelPropriedades(ctx: any): void {
  const panelContent = document.getElementById('props-panel-content');
  const panelActions = document.getElementById('props-panel-actions');
  if (!panelContent) return;

  try {
    const selectedCount = ctx.selectedPontoIds.length;
    const selectedVizinhoCount = ctx.selectedVizinhoPontoIds ? ctx.selectedVizinhoPontoIds.length : 0;

    if (selectedCount === 0 && selectedVizinhoCount === 0) {
      // Caso 1: Sem Seleção
      const matObj = ctx.matriculasList.find((m: any) => m.id === ctx.currentMatriculaId);
      const pontosMat = ctx.pontosList;
      const pontosAtivosCount = pontosMat.filter((p: any) => p.ignorar_poligono !== 1).length;
      const confrontantesCount = ctx.confrontantesList.length;

      panelContent.innerHTML = `
      <div class="props-section">
        <div class="props-section-header" id="header-props-geral">
          <i data-lucide="chevron-down"></i> Geral
        </div>
        <div class="props-section-body" id="body-props-geral">
          <div class="props-field">
            <label class="props-field-label">Nome</label>
            <input type="text" value="${ctx.currentLevantamento?.nome_propriedade || '-'}" class="props-field-value" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Status</label>
            <input type="text" value="${ctx.currentLevantamento?.status || '-'}" class="props-field-value text-mint-vibrant font-bold" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">CAR</label>
            <input type="text" value="${ctx.currentLevantamento?.codigo_car || 'Não Informado'}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">INCRA</label>
            <input type="text" value="${ctx.currentLevantamento?.codigo_incra || 'Não Informado'}" class="props-field-value font-mono" readonly />
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
            <input type="text" value="${matObj ? matObj.numero_matricula : '-'}" class="props-field-value text-mint-vibrant font-bold" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Área (ha)</label>
            <input type="text" value="${matObj ? (matObj.area_ha || matObj.area || '0') : '-'}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Vértices</label>
            <input type="text" value="${pontosAtivosCount}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Confront.</label>
            <input type="text" value="${confrontantesCount}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Fuso</label>
            <input type="text" value="${localStorage.getItem(`utm_zone_${ctx.currentLevId}`) || '22S'}" class="props-field-value font-mono" readonly />
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
      let p: any = null;
      let isPontoVizinho = false;

      if (selectedCount === 1) {
        const pId = ctx.selectedPontoIds[0];
        p = ctx.pontosList.find((pt: any) => pt.id === pId);
        isPontoVizinho = p ? p.ponto_vizinho === 1 : false;
      } else {
        const pId = ctx.selectedVizinhoPontoIds[0];
        p = ctx.pontosVizinhosList.find((pt: any) => pt.id === pId);
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

      let latVal = 0;
      let lonVal = 0;
      let eVal = 0;
      let nVal = 0;
      let hVal = 0;

      if (isCorrigido) {
        latVal = parseNumber(p.lat_corrigido !== undefined && p.lat_corrigido !== null ? p.lat_corrigido : p.lat);
        lonVal = parseNumber(p.lon_corrigido !== undefined && p.lon_corrigido !== null ? p.lon_corrigido : p.lon);
        eVal = parseNumber(p.e_corrigido !== undefined && p.e_corrigido !== null ? p.e_corrigido : p.e_original);
        nVal = parseNumber(p.n_corrigido !== undefined && p.n_corrigido !== null ? p.n_corrigido : p.n_original);
        hVal = parseNumber(p.alt_corrigido !== undefined && p.alt_corrigido !== null ? p.alt_corrigido : (p.alt || p.alt_original));
      } else {
        latVal = parseNumber(p.lat);
        lonVal = parseNumber(p.lon);
        eVal = parseNumber(p.e_original || p.e_corrigido);
        nVal = parseNumber(p.n_original || p.n_corrigido);
        hVal = parseNumber(p.alt || p.alt_original);
      }

      const sigE = parseNumber(p.sigma_e);
      const sigN = parseNumber(p.sigma_n);
      const resultante = parseNumber(Math.sqrt(sigE * sigE + sigN * sigN) * 1000);

      let corResultanteClass = 'text-emerald-400';
      if (resultante > 30 && resultante <= 100) {
        corResultanteClass = 'text-yellow-400';
      } else if (resultante > 100) {
        corResultanteClass = 'text-rose-400';
      }

      let seg: any = null;
      if (ctx.segmentosList && Array.isArray(ctx.segmentosList)) {
        seg = ctx.segmentosList.find((s: any) => s.ponto_inicio_id === p.id);
      }
      let confNome = '';
      let confMatricula = '';
      let confCartorio = '';
      let confObj: any = null;

      const confrontanteId = p.confrontante_id || (seg && seg.confrontante_id);
      if (confrontanteId && ctx.confrontantesList && Array.isArray(ctx.confrontantesList)) {
        confObj = ctx.confrontantesList.find((c: any) => c.id === confrontanteId);
        if (confObj) {
          confNome = confObj.nome || '';
          confMatricula = confObj.matricula_imovel || '';
          confCartorio = confObj.cns_confrontante || '';
        }
      }

      const temCoordenadasBrutas = isCorrigido && (p.e_original || p.lat || p.lon);

      let nomeBaseApoio = 'Nenhuma';
      if (p.ponto_base_id && ctx.pontosList && Array.isArray(ctx.pontosList)) {
        const basePt = ctx.pontosList.find((pt: any) => pt.id === p.ponto_base_id);
        if (basePt) nomeBaseApoio = basePt.nome_vertice || `ID ${p.ponto_base_id}`;
      }

      let origemTexto = 'Vértice de Campo (Medido)';
      let badgeClass = 'bg-mint-vibrant/10 text-mint-vibrant border-mint-vibrant/20';
      if (isPontoVizinho) {
        origemTexto = 'Vértice de Vizinho (SIGEF - Não Integrado)';
        badgeClass = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      } else if (p.confrontante_id) {
        origemTexto = 'Vértice Integrado de Vizinho';
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
            <input type="text" value="${p.ponto_nome || p.arquivo_nome || p.nome_vertice || '-'}" class="props-field-value opacity-50 cursor-not-allowed text-white/50" readonly disabled title="Nome original importado do equipamento GPS" />
          </div>
          <div class="props-field">
            <label class="props-field-label">Vértice</label>
            <div class="flex items-center gap-1 flex-1 min-w-0 pr-1 text-left justify-start">
              <input type="text" id="prop-nome-vertice" value="${p.nome_vertice || ''}" class="props-field-value font-mono flex-1 min-w-0" ${isDisabled ? 'disabled' : ''} />
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
                ${METODOS_SIGEF.map(m => `<option class="bg-[#111113] text-white/90" value="${m.codigo}" ${p.metodo_posicionamento === m.codigo ? 'selected' : ''}>${m.codigo} - ${m.nome}</option>`).join('')}
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
                ${LIMITES_SIGEF.map(l => `<option class="bg-[#111113] text-white/90" value="${l.codigo}" ${(seg && seg.tipo_limite_sigef === l.codigo) ? 'selected' : ''}>${l.codigo} - ${l.nome}</option>`).join('')}
              </select>
              <button type="button" id="btn-ajuda-limite" class="p-0.5 bg-mint-vibrant/10 hover:bg-mint-vibrant/25 border border-mint-vibrant/30 rounded text-mint-vibrant transition-colors active:scale-95 flex items-center justify-center shrink-0 w-4 h-4" title="Catálogo de Tipos de Limite">
                <i data-lucide="help-circle" class="w-2.5 h-2.5"></i>
              </button>
            </div>
          </div>

          ${ctx.modoCoordenadas === 'utm' ? `
            <div class="props-field">
              <label class="props-field-label">Este (E)</label>
              <input type="text" id="prop-e-corrigido" value="${eVal.toFixed(3)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma E</label>
              <input type="text" value="${parseNumber(p.sigma_e).toFixed(4)} m" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Norte (N)</label>
              <input type="text" id="prop-n-corrigido" value="${nVal.toFixed(3)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma N</label>
              <input type="text" value="${parseNumber(p.sigma_n).toFixed(4)} m" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Altitude (H)</label>
              <input type="text" id="prop-alt-corrigido" value="${hVal.toFixed(3)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma H</label>
              <input type="text" value="${parseNumber(p.sigma_z || p.sigma_alt).toFixed(4)} m" class="props-field-value font-mono" readonly />
            </div>
          ` : `
            <div class="props-field">
              <label class="props-field-label">Latitude</label>
              <input type="text" id="prop-lat-corrigido" value="${latVal.toFixed(9)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma Lat</label>
              <input type="text" value="${parseNumber(p.sigma_lat || p.sigma_n).toFixed(6)}°" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Longitude</label>
              <input type="text" id="prop-lon-corrigido" value="${lonVal.toFixed(9)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma Lon</label>
              <input type="text" value="${parseNumber(p.sigma_lon || p.sigma_e).toFixed(6)}°" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Altitude (h)</label>
              <input type="text" id="prop-alt-corrigido" value="${hVal.toFixed(3)}" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
            </div>
            <div class="props-field">
              <label class="props-field-label">Sigma Alt</label>
              <input type="text" value="${parseNumber(p.sigma_alt || p.sigma_z).toFixed(4)} m" class="props-field-value font-mono" readonly />
            </div>
          `}

          <div class="props-quality-container">
            <div class="flex justify-between items-center text-[9px] mb-1">
              <span class="text-white/40 uppercase">Desvio Posicional</span>
              <span class="font-mono font-bold ${corResultanteClass}">${resultante.toFixed(1)} mm</span>
            </div>
            <div class="props-quality-track">
              <div class="props-quality-fill ${resultante <= 30 ? 'ok' : resultante <= 100 ? 'warn' : 'err'}" style="width: ${Math.min(100, (resultante / 150) * 100)}%;"></div>
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
            <input type="text" id="prop-confrontante" value="${confNome}" placeholder="Nenhum confrontante associado" class="props-field-value" ${isDisabled ? 'disabled' : ''} />
          </div>
          <div class="props-field">
            <label class="props-field-label">Matrícula</label>
            <input type="text" id="prop-confrontante-matricula" value="${confMatricula}" placeholder="Não informada" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
          </div>
          <div class="props-field">
            <label class="props-field-label">Cartório (CNS)</label>
            <input type="text" id="prop-confrontante-cartorio" value="${confCartorio}" placeholder="Não informado" class="props-field-value font-mono" ${isDisabled ? 'disabled' : ''} />
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
              <input type="text" value="${(p.e_original || 0).toFixed(3)}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Norte Bruto</label>
              <input type="text" value="${(p.n_original || 0).toFixed(3)}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Alt Bruta</label>
              <input type="text" value="${(p.alt_original || 0).toFixed(3)}" class="props-field-value font-mono" readonly />
            </div>
          ` : `
            <div class="props-field">
              <label class="props-field-label">Lat Bruta</label>
              <input type="text" value="${(p.lat || 0).toFixed(9)}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Lon Bruta</label>
              <input type="text" value="${(p.lon || 0).toFixed(9)}" class="props-field-value font-mono" readonly />
            </div>
            <div class="props-field">
              <label class="props-field-label">Alt Bruta</label>
              <input type="text" value="${(p.alt || 0).toFixed(3)}" class="props-field-value font-mono" readonly />
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
            <input type="text" value="${p.arquivo_origem || '-'}" class="props-field-value font-mono text-[9px]" readonly title="${p.arquivo_origem || ''}" />
          </div>
          <div class="props-field">
            <label class="props-field-label">Correção</label>
            <input type="text" value="${p.status_correcao || p.status_ponto || 'BRUTO'}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Base Apoio</label>
            <input type="text" value="${nomeBaseApoio}" class="props-field-value font-mono" readonly />
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
          const tableHtml = `
            <div class="max-h-[60vh] overflow-y-auto mt-2">
              <table class="w-full text-[10px] text-left border-collapse">
                <thead class="sticky top-0 bg-[#111113] border-b border-white/10 text-white/60">
                  <tr>
                    <th class="py-1 px-2">Código</th>
                    <th class="py-1 px-2">Método</th>
                    <th class="py-1 px-2">Aplicação</th>
                  </tr>
                </thead>
                <tbody class="text-white/80">
                  ${METODOS_SIGEF.map(m => `
                    <tr class="border-b border-white/5 hover:bg-white/5">
                      <td class="py-1.5 px-2 font-mono text-mint-vibrant">${m.codigo}</td>
                      <td class="py-1.5 px-2">${m.nome}</td>
                      <td class="py-1.5 px-2">${m.aplicacao}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
          customAlert(tableHtml, 'Catálogo: Métodos de Posicionamento');
        };
      }

      const btnAjudaLimite = document.getElementById('btn-ajuda-limite');
      if (btnAjudaLimite) {
        btnAjudaLimite.onclick = () => {
          const tableHtml = `
            <div class="max-h-[60vh] overflow-y-auto mt-2">
              <table class="w-full text-[10px] text-left border-collapse">
                <thead class="sticky top-0 bg-[#111113] border-b border-white/10 text-white/60">
                  <tr>
                    <th class="py-1 px-2">Código</th>
                    <th class="py-1 px-2">Tipo de Limite</th>
                  </tr>
                </thead>
                <tbody class="text-white/80">
                  ${LIMITES_SIGEF.map(l => `
                    <tr class="border-b border-white/5 hover:bg-white/5">
                      <td class="py-1.5 px-2 font-mono text-purple-400">${l.codigo}</td>
                      <td class="py-1.5 px-2">${l.nome}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
          customAlert(tableHtml, 'Catálogo: Tipos de Limite');
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
        metodo: p.metodo_posicionamento || '',
        limite: (seg && seg.tipo_limite_sigef) ? seg.tipo_limite_sigef : '',
        e_corrigido: eVal.toFixed(3),
        n_corrigido: nVal.toFixed(3),
        lat_corrigido: latVal.toFixed(9),
        lon_corrigido: lonVal.toFixed(9),
        alt_corrigido: hVal.toFixed(3),
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
            const d = isCheckbox ? val !== originalVal : val !== originalVal;
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
            const tipo = tipoSelect ? tipoSelect.value : (p.tipo_ponto || p.tipo);

            if (!['M', 'P', 'V'].includes(tipo)) {
              showToast("Sugestão de nome oficial apenas para Marcos (M), Pontos (P) ou Virtuais (V).", "info");
              return;
            }

            const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos-sugeridos`);
            if (!res.ok) throw new Error("Erro ao buscar sugestão de código");

            const data = await res.json();
            const sug = data.sugestoes[tipo];
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
            showToast("Erro ao sugerir código de ponto.", "error");
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
            payload.alt_corrigido = parseFloat(altInput.value);
            payload.alt = parseFloat(altInput.value);
            payload.fuso = p.fuso || localStorage.getItem(`utm_zone_${ctx.currentLevId}`) || '22S';
          } else {
            const latInput = document.getElementById('prop-lat-corrigido') as HTMLInputElement;
            const lonInput = document.getElementById('prop-lon-corrigido') as HTMLInputElement;
            payload.lat = parseFloat(latInput.value);
            payload.lon = parseFloat(lonInput.value);
            payload.alt = parseFloat(altInput.value);
          }

          try {
            const res = await fetch(`${API_BASE}/pontos/${p.id}`, {
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
              // ID do confrontante já vinculado a este vértice, seja diretamente
              // (vértice integrado de vizinho, via ponto.confrontante_id) ou
              // através do segmento de divisa que começa neste vértice.
              const confrontanteIdAtual = p.confrontante_id || (seg && seg.confrontante_id);

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
                } else if (p.confrontante_id) {
                  // Vínculo gravado direto no ponto (vértice integrado de vizinho):
                  // não existe hoje endpoint de API para desvincular esse campo por
                  // aqui, então avisamos em vez de fingir que limpou.
                  throw new Error(
                    "Não é possível remover o confrontante deste vértice pelo painel: " +
                    "o vínculo está gravado diretamente no ponto (vértice integrado de " +
                    "vizinho) e não há endpoint de API para desvincular esse campo."
                  );
                }
              } else if (confrontanteIdAtual) {
                // BUGFIX: antes, esta atualização só rodava dentro de "if (seg)" — um
                // vértice com vínculo direto (p.confrontante_id) mas sem segmento
                // correspondente em ctx.segmentosList nunca conseguia ser atualizado,
                // mesmo já tendo um confrontante_id válido para atualizar via PUT.
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
                // Não há confrontante vinculado ainda: para CRIAR um novo é preciso
                // gravar o vínculo em algum lugar, e hoje só o segmento tem um campo
                // confrontante_id editável via API (o ponto não tem esse campo no
                // PUT /pontos/{id}). Por isso, aqui sim é obrigatório ter um "seg".
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
              // Apenas limites e métodos foram alterados no segmento
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
            showToast("Erro ao salvar alterações no vértice.", "error");
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

      // Oculta painel de ações para pontos do vizinho ou projeto arquivado (somente leitura)
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

      // Coleta todos os pontos selecionados
      const pontosMulti: any[] = ctx.selectedPontoIds
        .map((id: number) => ctx.pontosList.find((pt: any) => pt.id === id))
        .filter(Boolean);

      // Resolve um campo: se todos iguais → valor; caso contrário → 'várias'
      const resolveField = (extractor: (p: any) => string): string => {
        const vals = pontosMulti.map(extractor);
        const unique = [...new Set(vals)];
        return unique.length === 1 ? unique[0] : 'várias';
      };

      // Resolve um campo numérico formatado
      const resolveNum = (extractor: (p: any) => number, decimals: number): string => {
        const vals = pontosMulti.map(extractor);
        const unique = [...new Set(vals.map(v => v.toFixed(decimals)))];
        return unique.length === 1 ? unique[0] : 'várias';
      };

      // Resolve tipo do ponto
      const tipoResolvido = resolveField(p => p.tipo_ponto || p.tipo || '');
      const metodoResolvidoMulti = resolveField(p => p.metodo_posicionamento || '');
      const limiteResolvidoMulti = resolveField(p => {
        const seg = ctx.segmentosList?.find((s: any) => s.ponto_inicio_id === p.id);
        return seg ? (seg.tipo_limite_sigef || '') : '';
      });

      // Coordenadas (sempre readonly no modo multi)
      const modUtm = ctx.modoCoordenadas === 'utm';
      let coordDisplay: { label: string; value: string }[] = [];

      if (modUtm) {
        const resolveE = (p: any) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumber(isC && p.e_corrigido != null ? p.e_corrigido : p.e_original);
        };
        const resolveN = (p: any) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumber(isC && p.n_corrigido != null ? p.n_corrigido : p.n_original);
        };
        const resolveH = (p: any) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumber(isC && p.alt_corrigido != null ? p.alt_corrigido : (p.alt || p.alt_original));
        };
        coordDisplay = [
          { label: 'Este (E)', value: resolveNum(resolveE, 3) },
          { label: 'Norte (N)', value: resolveNum(resolveN, 3) },
          { label: 'Altitude (H)', value: resolveNum(resolveH, 3) },
        ];
      } else {
        const resolveLat = (p: any) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumber(isC && p.lat_corrigido != null ? p.lat_corrigido : p.lat);
        };
        const resolveLon = (p: any) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumber(isC && p.lon_corrigido != null ? p.lon_corrigido : p.lon);
        };
        const resolveH = (p: any) => {
          const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
          return parseNumber(isC && p.alt_corrigido != null ? p.alt_corrigido : (p.alt || p.alt_original));
        };
        coordDisplay = [
          { label: 'Latitude', value: resolveNum(resolveLat, 9) },
          { label: 'Longitude', value: resolveNum(resolveLon, 9) },
          { label: 'Altitude (h)', value: resolveNum(resolveH, 3) },
        ];
      }

      // Confrontantes: busca via segmentosList
      const resolveConf = (field: 'nome' | 'matricula_imovel' | 'cns_confrontante'): string => {
        const vals = pontosMulti.map(p => {
          const seg = ctx.segmentosList?.find((s: any) => s.ponto_inicio_id === p.id);
          const cId = p.confrontante_id || (seg && seg.confrontante_id);
          if (!cId) return '';
          const cObj = ctx.confrontantesList?.find((c: any) => c.id === cId);
          return cObj ? (cObj[field] || '') : '';
        });
        const unique = [...new Set(vals)];
        return unique.length === 1 ? unique[0] : 'várias';
      };

      const confNomeResolvido = resolveConf('nome');
      const confMatResolvido = resolveConf('matricula_imovel');
      const confCnsResolvido = resolveConf('cns_confrontante');

      // Polígono: verifica se todos iguais
      const ignorarVals = pontosMulti.map(p => p.ignorar_poligono === 1);
      const todosIgnorados = ignorarVals.every(v => v === true);
      const todosIncluidos = ignorarVals.every(v => v === false);
      const poligonoIndeterminate = !todosIgnorados && !todosIncluidos;

      // Campos da seção Dados (readonly)
      const origemResolvida = resolveField(p => p.arquivo_origem || '-');
      const correcaoResolvida = resolveField(p => p.status_correcao || p.status_ponto || 'BRUTO');
      const baseApoioResolvida = resolveField(p => {
        if (!p.ponto_base_id) return 'Nenhuma';
        const basePt = ctx.pontosList?.find((pt: any) => pt.id === p.ponto_base_id);
        return basePt ? (basePt.nome_vertice || `ID ${p.ponto_base_id}`) : 'Nenhuma';
      });

      // Brutos: mostra seção se ALGUM ponto for corrigido e tiver coordenadas brutas
      const algumTemBrutos = pontosMulti.some(p => {
        const isC = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO';
        return isC && (p.e_original || p.lat || p.lon);
      });

      // Resolve brutos (apenas pontos corrigidos contribuem; os sem brutos ficam como '-')
      const resolveBruto = (extractor: (p: any) => string): string => {
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
            <input type="text" value="${resolveBruto(p => p.e_original != null ? parseNumber(p.e_original).toFixed(3) : '-')}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Norte Bruto</label>
            <input type="text" value="${resolveBruto(p => p.n_original != null ? parseNumber(p.n_original).toFixed(3) : '-')}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Alt Bruta</label>
            <input type="text" value="${resolveBruto(p => p.alt_original != null ? parseNumber(p.alt_original).toFixed(3) : '-')}" class="props-field-value font-mono" readonly />
          </div>`;
        } else {
          brutosFieldsHTML = `
          <div class="props-field">
            <label class="props-field-label">Lat Bruta</label>
            <input type="text" value="${resolveBruto(p => p.lat != null ? parseNumber(p.lat).toFixed(9) : '-')}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Lon Bruta</label>
            <input type="text" value="${resolveBruto(p => p.lon != null ? parseNumber(p.lon).toFixed(9) : '-')}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Alt Bruta</label>
            <input type="text" value="${resolveBruto(p => p.alt != null ? parseNumber(p.alt).toFixed(3) : '-')}" class="props-field-value font-mono" readonly />
          </div>`;
        }
      }

      const coordFieldsHTML = coordDisplay.map(f => `
      <div class="props-field">
        <label class="props-field-label">${f.label}</label>
        <input type="text" value="${f.value}" class="props-field-value font-mono" readonly title="Edição de coordenadas não disponível em seleção múltipla" />
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
              ${selectedCount} vértices
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
                ${METODOS_SIGEF.map(m => `<option class="bg-[#111113] text-white/90" value="${m.codigo}" ${metodoResolvidoMulti === m.codigo ? 'selected' : ''}>${m.codigo} - ${m.nome}</option>`).join('')}
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
                ${LIMITES_SIGEF.map(l => `<option class="bg-[#111113] text-white/90" value="${l.codigo}" ${limiteResolvidoMulti === l.codigo ? 'selected' : ''}>${l.codigo} - ${l.nome}</option>`).join('')}
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
            <input type="text" id="prop-multi-confrontante" value="${confNomeResolvido === 'várias' ? '' : confNomeResolvido}" placeholder="${confNomeResolvido === 'várias' ? 'várias' : 'Nenhum confrontante associado'}" class="props-field-value" ${isArquivado ? 'disabled' : ''} />
          </div>
          <div class="props-field">
            <label class="props-field-label">Matrícula</label>
            <input type="text" id="prop-multi-confrontante-matricula" value="${confMatResolvido === 'várias' ? '' : confMatResolvido}" placeholder="${confMatResolvido === 'várias' ? 'várias' : 'Não informada'}" class="props-field-value font-mono" ${isArquivado ? 'disabled' : ''} />
          </div>
          <div class="props-field">
            <label class="props-field-label">Cartório (CNS)</label>
            <input type="text" id="prop-multi-confrontante-cartorio" value="${confCnsResolvido === 'várias' ? '' : confCnsResolvido}" placeholder="${confCnsResolvido === 'várias' ? 'várias' : 'Não informado'}" class="props-field-value font-mono" ${isArquivado ? 'disabled' : ''} />
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
            <input type="text" value="${origemResolvida}" class="props-field-value font-mono text-[9px]" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Correção</label>
            <input type="text" value="${correcaoResolvida}" class="props-field-value font-mono" readonly />
          </div>
          <div class="props-field">
            <label class="props-field-label">Base Apoio</label>
            <input type="text" value="${baseApoioResolvida}" class="props-field-value font-mono" readonly />
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
          const tableHtml = `
            <div class="max-h-[60vh] overflow-y-auto mt-2">
              <table class="w-full text-[10px] text-left border-collapse">
                <thead class="sticky top-0 bg-[#111113] border-b border-white/10 text-white/60">
                  <tr>
                    <th class="py-1 px-2">Código</th>
                    <th class="py-1 px-2">Método</th>
                    <th class="py-1 px-2">Aplicação</th>
                  </tr>
                </thead>
                <tbody class="text-white/80">
                  ${METODOS_SIGEF.map(m => `
                    <tr class="border-b border-white/5 hover:bg-white/5">
                      <td class="py-1.5 px-2 font-mono text-mint-vibrant">${m.codigo}</td>
                      <td class="py-1.5 px-2">${m.nome}</td>
                      <td class="py-1.5 px-2">${m.aplicacao}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
          customAlert(tableHtml, 'Catálogo: Métodos de Posicionamento');
        };
      }

      const btnAjudaLimiteMulti = document.getElementById('btn-ajuda-limite-multi');
      if (btnAjudaLimiteMulti) {
        btnAjudaLimiteMulti.onclick = () => {
          const tableHtml = `
            <div class="max-h-[60vh] overflow-y-auto mt-2">
              <table class="w-full text-[10px] text-left border-collapse">
                <thead class="sticky top-0 bg-[#111113] border-b border-white/10 text-white/60">
                  <tr>
                    <th class="py-1 px-2">Código</th>
                    <th class="py-1 px-2">Tipo de Limite</th>
                  </tr>
                </thead>
                <tbody class="text-white/80">
                  ${LIMITES_SIGEF.map(l => `
                    <tr class="border-b border-white/5 hover:bg-white/5">
                      <td class="py-1.5 px-2 font-mono text-mint-vibrant">${l.codigo}</td>
                      <td class="py-1.5 px-2">${l.nome}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
          customAlert(tableHtml, 'Catálogo: Tipos de Limite');
        };
      }

      // Aplica indeterminate no checkbox de polígono (não pode ser feito via HTML)
      setTimeout(() => {
        const checkPoli = document.getElementById('prop-multi-ignorar-poligono') as HTMLInputElement;
        if (checkPoli && poligonoIndeterminate) {
          checkPoli.indeterminate = true;
        }
      }, 20);

      if (panelActions) panelActions.classList.add('hidden');

      if (isArquivado) {
        // Apenas conecta os botões de ação
        const btnBatchIgnorar = document.getElementById('btn-batch-props-ignorar');
        if (btnBatchIgnorar) btnBatchIgnorar.onclick = () => document.getElementById('btn-batch-ignorar')?.click();
        const btnBatchDeletar = document.getElementById('btn-batch-props-deletar');
        if (btnBatchDeletar) btnBatchDeletar.onclick = () => document.getElementById('btn-batch-deletar')?.click();
        return;
      }

      // Valores originais para dirty-check
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

      // Quando clica no checkbox, remove o indeterminate e marca dirty
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
            novoBtn.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 animate-spin"></i> Atualizando ${ctx.selectedPontoIds.length} vértices...`;
            initIcons();

            const batchPayload: any = { pontos: [] };

            for (const pid of ctx.selectedPontoIds) {
              const itemPayload: any = { id: pid };

              if (tipoAlterado) itemPayload.tipo_ponto = tipoEl.value;
              if (metodoAlterado) itemPayload.metodo_posicionamento = metodoEl.value;
              if (poliAlterado) itemPayload.ignorar_poligono = poliEl.checked ? 0 : 1;

              if (limiteAlterado || metodoAlterado) {
                 const seg = ctx.segmentosList?.find((s: any) => s.ponto_inicio_id === pid);
                 if (seg) {
                    await fetch(`${API_BASE}/segmentos/${seg.id}`, {
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
                    }).catch(console.error);
                 }
              }

              if (confAlterado) {
                const pObj = ctx.pontosList.find((pt: any) => pt.id === pid);
                const seg = ctx.segmentosList?.find((s: any) => s.ponto_inicio_id === pid);
                const cId = pObj?.confrontante_id || (seg && seg.confrontante_id);
                const cObj = cId ? ctx.confrontantesList?.find((c: any) => c.id === cId) : null;

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
                } else if ((finalNome !== '' || finalMat !== '' || finalCns !== '') && !seg) {
                  console.warn(`[SAVE-LOTE] Ponto ${pid}: sem 'seg' (ponto_inicio_id) em ctx.segmentosList. Confrontante NÃO salvo.`);
                }
              }

              // Só adiciona se houver algo para alterar
              if (Object.keys(itemPayload).length > 1) {
                  batchPayload.pontos.push(itemPayload);
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
            showToast("Erro ao salvar alterações em lote.", "error");
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
        ❌ Erro ao renderizar propriedades do vértice: ${(err as Error).message}
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