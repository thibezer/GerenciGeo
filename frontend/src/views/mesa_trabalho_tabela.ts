/**
 * Componente de Geração de HTML Dinâmico para as Tabelas da Mesa de Trabalho
 * 
 * Contém funções puras que formatam e montam a marcação HTML para os vértices,
 * divisas/segmentos, auditoria de translação geodésica e logs do histórico de campo.
 */

// Interface auxiliar para os pontos
interface Ponto {
  id: number;
  nome_vertice: string;
  tipo_ponto?: string;
  tipo?: string;
  lat?: number;
  lon?: number;
  alt?: number;
  alt_original?: number;
  e_original?: number;
  n_original?: number;
  e_corrigido?: number;
  n_corrigido?: number;
  ordem_caminhamento?: number;
  status_correcao?: string;
  ignorar_poligono?: number;
  arquivo_origem?: string;
}

// Interface auxiliar para os segmentos
interface Segmento {
  id: number;
  ponto_inicio_id: number;
  ponto_fim_id: number;
  confrontante_id?: number | null;
  tipo_limite_sigef: string;
  metodo_posicionamento_sigef: string;
}

/**
 * Retorna uma cor HSL consistente para cada arquivo de origem.
 */
const obterCorArquivo = (nomeArquivo: string): string => {
  if (!nomeArquivo) return '#ffffff';
  let hash = 0;
  for (let i = 0; i < nomeArquivo.length; i++) {
    hash = nomeArquivo.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 75%, 55%)`;
};

/**
 * Renderiza uma linha de vértice na Etapa 2 (Organizador de Perímetro - Cartório)
 * Inclui os botões de reordenação arrastáveis e controle de participação no polígono.
 */
export const renderLinhaPontoCartorioHtml = (
  p: Ponto,
  ordemExibida: number | string,
  modoCoordenadas: string,
  isSelected: boolean,
  latLonToUTM: (lat: number, lon: number) => { e: number; n: number }
): string => {
  let col1 = '-';
  let col2 = '-';
  let col3 = '-';
  
  if (modoCoordenadas === 'geodesico') {
     col1 = p.lat ? p.lat.toFixed(8) : '-';
     col2 = p.lon ? p.lon.toFixed(8) : '-';
     col3 = p.alt ? p.alt.toFixed(3) : '-';
  } else {
     if (p.e_corrigido !== undefined && p.e_corrigido !== null && p.n_corrigido !== undefined && p.n_corrigido !== null) {
        col1 = p.e_corrigido.toFixed(3);
        col2 = p.n_corrigido.toFixed(3);
        col3 = p.alt ? p.alt.toFixed(3) : (p.alt_original ? p.alt_original.toFixed(3) : '-');
     } else if (p.e_original && p.n_original) {
        if (p.lat && p.lon) {
           const utm = latLonToUTM(p.lat, p.lon);
           col1 = utm.e.toFixed(3);
           col2 = utm.n.toFixed(3);
        } else {
           col1 = p.e_original.toFixed(3);
           col2 = p.n_original.toFixed(3);
        }
        col3 = p.alt ? p.alt.toFixed(3) : (p.alt_original ? p.alt_original.toFixed(3) : '-');
     } else if (p.lat && p.lon) {
        const utm = latLonToUTM(p.lat, p.lon);
        col1 = utm.e.toFixed(3);
        col2 = utm.n.toFixed(3);
        col3 = p.alt ? p.alt.toFixed(3) : '-';
     }
  }

  const isBasePPP = p.tipo_ponto === 'M' || p.tipo === 'M';
  const isBaseFisica = p.tipo_ponto === 'B' || p.tipo === 'B';

  const selectionClass = isSelected 
     ? 'bg-mint-vibrant/10 text-mint-vibrant border-mint-vibrant/30' 
     : (isBasePPP 
        ? 'bg-indigo-600/10 hover:bg-indigo-600/15 border-b border-indigo-500/20 text-indigo-100 font-semibold' 
        : (isBaseFisica
           ? 'bg-rose-600/10 hover:bg-rose-600/15 border-b border-rose-500/20 text-rose-100 font-semibold'
           : 'hover:bg-white/[0.02] border-b border-white/5'));

  const chkChecked = p.ignorar_poligono !== 1 ? 'checked' : '';

  // Badge do tipo
  let badgeHtml = '';
  if (isBasePPP) {
     badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">M (Base PPP)</span>`;
  } else if (isBaseFisica) {
     badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">B (Base)</span>`;
  } else {
     badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-white/50">${p.tipo_ponto || p.tipo}</span>`;
  }

  // Coluna de ações / ordem
  let colAcoesHtml = '';
  if (isBaseFisica || p.ignorar_poligono === 1) {
     colAcoesHtml = `<span class="text-[10px] font-bold text-white/30 font-mono">-</span>`;
  } else {
     colAcoesHtml = `
        <span class="text-[10px] font-bold text-mint-vibrant font-mono">${ordemExibida}</span>
        <button class="btn-subir-ponto p-0.5 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors" data-ponto-id="${p.id}" title="Subir Ponto" type="button">
          <i data-lucide="chevron-up" class="w-3.5 h-3.5"></i>
        </button>
        <button class="btn-descer-ponto p-0.5 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors" data-ponto-id="${p.id}" title="Descer Ponto" type="button">
          <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
        </button>
     `;
  }

  // Checkbox de ignorar
  const colIgnorarHtml = isBaseFisica 
     ? `<span class="text-white/20 text-[10px] font-mono">-</span>`
     : `<input type="checkbox" class="chk-ignorar-poligono rounded border-white/10 text-mint-vibrant focus:ring-mint-vibrant bg-white/5 w-3.5 h-3.5" data-ponto-id="${p.id}" ${chkChecked} />`;

  const cor = p.arquivo_origem ? obterCorArquivo(p.arquivo_origem) : '';
  const badgeArquivoHtml = p.arquivo_origem
     ? `<span class="block text-[9px] font-medium font-sans mt-0.5 max-w-[120px] truncate border px-1 rounded-sm w-fit" style="background-color: ${cor}15; color: ${cor}; border-color: ${cor}30;" title="${p.arquivo_origem}">${p.arquivo_origem}</span>`
     : `<span class="block text-[9px] font-medium font-sans mt-0.5 max-w-[120px] truncate border px-1 rounded-sm w-fit bg-white/5 text-white/30 border-white/10" title="Sem arquivo de origem (Criado manualmente)">Inserido Manual</span>`;

  return `
    <tr class="linha-ponto-tbl group cursor-pointer transition-colors border-b ${selectionClass} hover:bg-white/[0.02]" id="tr-ponto-${p.id}" data-ponto-id="${p.id}">
      <td class="px-2 py-2.5 text-center flex items-center justify-center gap-1.5">
        ${colAcoesHtml}
      </td>
      <td class="px-4 py-2.5">
        <div class="flex items-center gap-1.5">
          <div class="font-bold text-[13px] text-white ${isBasePPP ? 'text-indigo-400' : (isBaseFisica ? 'text-rose-400' : '')}">${p.nome_vertice}</div>
          <button class="btn-focar-ponto-mapa p-0.5 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" data-ponto-id="${p.id}" title="Focar no Mapa" type="button">
            <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
          </button>
        </div>
        ${badgeArquivoHtml}
      </td>
      <td class="px-2 py-2.5 text-center">
         ${badgeHtml}
      </td>
      <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-white/90 tabular-nums">${col1}</td>
      <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-white/90 tabular-nums">${col2}</td>
      <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-white/90 tabular-nums">${col3}</td>
      <td class="px-2 py-2.5 text-center" onclick="event.stopPropagation()">
         ${colIgnorarHtml}
      </td>
    </tr>
  `;
};

/**
 * Renderiza uma linha de vértice na Etapa 1 (Mesa Geodésica - Geoprocessamento)
 * Exibe os desvios e deltas contra a base estática/bruta.
 */
export const renderLinhaPontoGeoprocessamentoHtml = (
  p: Ponto,
  ordemExibida: number | string,
  modoCoordenadas: string,
  selectedPontoIds: number[],
  latLonToUTM: (lat: number, lon: number) => { e: number; n: number }
): string => {
  const isSelected = selectedPontoIds.includes(p.id);
  const isBasePPP = p.tipo_ponto === 'M' || p.tipo === 'M';
  const isBaseFisica = p.tipo_ponto === 'B' || p.tipo === 'B';
  
  let col1 = '-';
  let col2 = '-';
  let col3 = '-';
  let col4 = '-';
  let col5 = '-';
  let col6 = '-';

  let deltaN = '0.000';
  let deltaE = '0.000';
  let deltaH = '0.000';

  if (modoCoordenadas === 'geodesico') {
     col1 = p.lat ? p.lat.toFixed(8) : '-';
     col2 = p.lon ? p.lon.toFixed(8) : '-';
     col3 = p.alt ? p.alt.toFixed(3) : '-';
     col4 = p.lat ? p.lat.toFixed(8) : '-';
     col5 = p.lon ? p.lon.toFixed(8) : '-';
     col6 = p.alt ? p.alt.toFixed(3) : '-';
  } else {
     // Coordenadas Planas UTM
     let brutE = '-';
     let brutN = '-';
     let brutH = p.alt_original ? p.alt_original.toFixed(3) : '-';

     if (p.e_original && p.n_original) {
        brutE = p.e_original.toFixed(3);
        brutN = p.n_original.toFixed(3);
     }

     let corrE = '-';
     let corrN = '-';
     let corrH = p.alt ? p.alt.toFixed(3) : '-';

     if (p.e_corrigido !== undefined && p.e_corrigido !== null && p.n_corrigido !== undefined && p.n_corrigido !== null) {
        corrE = p.e_corrigido.toFixed(3);
        corrN = p.n_corrigido.toFixed(3);
        
        if (p.e_original && p.n_original) {
           deltaE = ((p.e_corrigido - p.e_original) * 1000).toFixed(0);
           deltaN = ((p.n_corrigido - p.n_original) * 1000).toFixed(0);
           deltaH = (((p.alt || 0) - (p.alt_original || 0)) * 1000).toFixed(0);
        }
     } else if (p.lat && p.lon) {
        const utm = latLonToUTM(p.lat, p.lon);
        corrE = utm.e.toFixed(3);
        corrN = utm.n.toFixed(3);
        
        if (p.e_original && p.n_original) {
           deltaE = ((utm.e - p.e_original) * 1000).toFixed(0);
           deltaN = ((utm.n - p.n_original) * 1000).toFixed(0);
           deltaH = (((p.alt || 0) - (p.alt_original || 0)) * 1000).toFixed(0);
        }
     }

     col1 = brutE;
     col2 = brutN;
     col3 = corrE;
     col4 = corrN;
     col5 = brutH;
     col6 = corrH;
  }

  const isCorrigido = p.status_correcao === 'CORRIGIDO';
  const rowClass = isSelected 
     ? 'bg-mint-vibrant/10 text-mint-vibrant border-mint-vibrant/30' 
     : (!isCorrigido 
        ? 'bg-yellow-500/5 hover:bg-yellow-500/10 border-b border-yellow-500/10 text-yellow-100/90' 
        : (isBasePPP 
           ? 'bg-indigo-600/10 hover:bg-indigo-600/15 border-b border-indigo-500/20 text-indigo-100 font-semibold' 
           : (isBaseFisica
              ? 'bg-rose-600/10 hover:bg-rose-600/15 border-b border-rose-500/20 text-rose-100 font-semibold'
              : 'hover:bg-white/[0.02] border-b border-white/5')));

  const statusText = !isCorrigido 
     ? `<span class="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-bold border border-yellow-500/30 text-[9px] uppercase tracking-wider">BRUTO</span>`
     : `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 text-[9px] uppercase tracking-wider">CORRIGIDO</span>`;

  // Badge do tipo
  let badgeHtml = '';
  if (isBasePPP) {
     badgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300">M</span>`;
  } else if (isBaseFisica) {
     badgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">B</span>`;
  } else {
     badgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/5 text-white/50">${p.tipo_ponto || p.tipo}</span>`;
  }

  let colAcoesHtml = '';
  if (isBaseFisica || p.ignorar_poligono === 1) {
     colAcoesHtml = `<span class="text-[10px] font-bold text-white/30 font-mono">-</span>`;
  } else {
     colAcoesHtml = `
        <span class="text-[10px] font-bold text-mint-vibrant font-mono">${ordemExibida}</span>
     `;
  }

  const cor = p.arquivo_origem ? obterCorArquivo(p.arquivo_origem) : '';
  const badgeArquivoHtml = p.arquivo_origem
     ? `<span class="block text-[9px] font-medium font-sans mt-0.5 max-w-[120px] truncate border px-1 rounded-sm w-fit" style="background-color: ${cor}15; color: ${cor}; border-color: ${cor}30;" title="${p.arquivo_origem}">${p.arquivo_origem}</span>`
     : `<span class="block text-[9px] font-medium font-sans mt-0.5 max-w-[120px] truncate border px-1 rounded-sm w-fit bg-white/5 text-white/30 border-white/10" title="Sem arquivo de origem (Criado manualmente)">Inserido Manual</span>`;

  if (modoCoordenadas === 'geodesico') {
      return `
        <tr class="linha-ponto-tbl group cursor-pointer transition-colors border-b ${rowClass} hover:bg-white/[0.02]" id="tr-ponto-${p.id}" data-ponto-id="${p.id}">
          <td class="px-2 py-2.5 text-center flex items-center justify-center gap-1.5">${colAcoesHtml}</td>
          <td class="px-4 py-2.5">
             <div class="flex items-center gap-1.5">
                <div class="font-bold text-[13px] text-white ${isBasePPP ? 'text-indigo-400' : (isBaseFisica ? 'text-rose-400' : '')}">${p.nome_vertice}</div>
                <button class="btn-focar-ponto-mapa p-0.5 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" data-ponto-id="${p.id}" title="Focar no Mapa" type="button">
                   <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
                </button>
             </div>
             ${badgeArquivoHtml}
          </td>
          <td class="px-2 py-2.5 text-center">
             ${badgeHtml}
          </td>
          <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-white/80 tabular-nums">${col1}</td>
          <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-white/80 tabular-nums">${col2}</td>
          <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-mint-vibrant tabular-nums">${col3}</td>
          <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-mint-vibrant tabular-nums">${col4}</td>
          <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-white/80 tabular-nums">${col5}</td>
          <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-mint-vibrant tabular-nums">${col6}</td>
          <td class="px-2 py-2.5 text-center">
            <input type="checkbox" class="chk-ignorar-poligono rounded border-white/10 bg-white/5 text-mint-vibrant focus:ring-mint-vibrant/30 cursor-pointer" data-ponto-id="${p.id}" ${p.ignorar_poligono === 1 ? '' : 'checked'} />
          </td>
          <td class="px-4 py-2.5 text-center">${statusText}</td>
        </tr>
      `;
  } else {
     return `
       <tr class="linha-ponto-tbl group cursor-pointer transition-colors border-b ${rowClass} hover:bg-white/[0.02]" id="tr-ponto-${p.id}" data-ponto-id="${p.id}">
         <td class="px-2 py-2.5 text-center flex items-center justify-center gap-1.5">${colAcoesHtml}</td>
         <td class="px-4 py-2.5">
            <div class="flex items-center gap-1.5">
               <div class="font-bold text-[13px] text-white ${isBasePPP ? 'text-indigo-400' : (isBaseFisica ? 'text-rose-400' : '')}">${p.nome_vertice}</div>
               <button class="btn-focar-ponto-mapa p-0.5 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" data-ponto-id="${p.id}" title="Focar no Mapa" type="button">
                  <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
               </button>
            </div>
            ${badgeArquivoHtml}
         </td>
         <td class="px-2 py-2.5 text-center">
            ${badgeHtml}
         </td>
         <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-white/40 tabular-nums">${col1}</td>
         <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-white/40 tabular-nums">${col2}</td>
         <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-mint-vibrant tabular-nums">${col3}</td>
         <td class="px-4 py-2.5 text-right font-mono font-medium text-xs text-mint-vibrant tabular-nums">${col4}</td>
         <td class="px-4 py-2.5 text-right font-mono font-medium text-xs ${parseFloat(deltaN) === 0 ? 'text-white/30' : 'text-blue-400'} tabular-nums">${deltaN}</td>
         <td class="px-4 py-2.5 text-right font-mono font-medium text-xs ${parseFloat(deltaE) === 0 ? 'text-white/30' : 'text-blue-400'} tabular-nums">${deltaE}</td>
         <td class="px-4 py-2.5 text-right font-mono font-medium text-xs ${parseFloat(deltaH) === 0 ? 'text-white/30' : 'text-blue-400'} tabular-nums">${deltaH}</td>
         <td class="px-2 py-2.5 text-center">
           <input type="checkbox" class="chk-ignorar-poligono rounded border-white/10 bg-white/5 text-mint-vibrant focus:ring-mint-vibrant/30 cursor-pointer" data-ponto-id="${p.id}" ${p.ignorar_poligono === 1 ? '' : 'checked'} />
         </td>
         <td class="px-4 py-2.5 text-center">${statusText}</td>
       </tr>
     `;
  }
};

/**
 * Renderiza uma linha de auditoria (Deltas horizontais em mm)
 */
export const renderAuditoriaTranslacaoHtml = (
  p: Ponto,
  latLonToUTM: (lat: number, lon: number) => { e: number; n: number }
): string => {
  let originalE = '-';
  let originalN = '-';
  let corrE = '-';
  let corrN = '-';
  
  let devE = '0.0';
  let devN = '0.0';
  let devH = '0.0';

  if (p.e_corrigido !== undefined && p.e_corrigido !== null && p.n_corrigido !== undefined && p.n_corrigido !== null) {
     corrE = p.e_corrigido.toFixed(3);
     corrN = p.n_corrigido.toFixed(3);

     if (p.e_original && p.n_original) {
        originalE = p.e_original.toFixed(3);
        originalN = p.n_original.toFixed(3);

        const dE = (p.e_corrigido - p.e_original) * 1000;
        const dN = (p.n_corrigido - p.n_original) * 1000;
        const dH = ((p.alt || 0) - (p.alt_original || 0)) * 1000;

        devE = dE >= 0 ? '+' + dE.toFixed(1) : dE.toFixed(1);
        devN = dN >= 0 ? '+' + dN.toFixed(1) : dN.toFixed(1);
        devH = dH >= 0 ? '+' + dH.toFixed(1) : dH.toFixed(1);
     }
  } else if (p.lat && p.lon) {
     const utmCorr = latLonToUTM(p.lat, p.lon);
     corrE = utmCorr.e.toFixed(3);
     corrN = utmCorr.n.toFixed(3);

     if (p.e_original && p.n_original) {
        originalE = p.e_original.toFixed(3);
        originalN = p.n_original.toFixed(3);

        const dE = (utmCorr.e - p.e_original) * 1000;
        const dN = (utmCorr.n - p.n_original) * 1000;
        const dH = ((p.alt || 0) - (p.alt_original || 0)) * 1000;

        devE = dE >= 0 ? '+' + dE.toFixed(1) : dE.toFixed(1);
        devN = dN >= 0 ? '+' + dN.toFixed(1) : dN.toFixed(1);
        devH = dH >= 0 ? '+' + dH.toFixed(1) : dH.toFixed(1);
     }
  }

  return `
    <tr class="hover:bg-white/[0.02] border-b border-white/5 font-sans text-xs">
      <td class="px-4 py-2.5 font-bold text-white text-[13px]">${p.nome_vertice}</td>
      <td class="px-2 py-2.5 text-right font-mono text-xs text-white/40 tabular-nums">${originalE}<br/><span class="text-[10px]">${originalN}</span></td>
      <td class="px-2 py-2.5 text-right font-mono text-xs text-mint-vibrant/90 tabular-nums">${corrE}<br/><span class="text-[10px] text-mint-vibrant/70">${corrN}</span></td>
      <td class="px-2 py-2.5 text-right font-mono font-semibold text-xs ${parseFloat(devE) === 0 ? 'text-white/30' : 'text-blue-400'} tabular-nums">${devE}mm</td>
      <td class="px-2 py-2.5 text-right font-mono font-semibold text-xs ${parseFloat(devN) === 0 ? 'text-white/30' : 'text-blue-400'} tabular-nums">${devN}mm</td>
      <td class="px-2 py-2.5 text-right font-mono font-semibold text-xs ${parseFloat(devH) === 0 ? 'text-white/30' : 'text-blue-400'} tabular-nums">${devH}mm</td>
    </tr>
  `;
};

/**
 * Renderiza uma linha na tabela de Segmentos de Divisa (Confrontantes)
 */
export const renderLinhaSegmentoHtml = (
  s: Segmento,
  confrontantesList: any[],
  pontosList: any[]
): string => {
  const pIni = pontosList.find(p => p.id === s.ponto_inicio_id);
  const pFim = pontosList.find(p => p.id === s.ponto_fim_id);

  const confOptions = confrontantesList.map(c => `
    <option value="${c.id}" ${c.id === s.confrontante_id ? 'selected' : ''}>${c.nome}</option>
  `);
  confOptions.unshift(`<option value="" ${!s.confrontante_id ? 'selected' : ''}>[Sem Confrontante]</option>`);

  const limiteOptions = [
    { val: 'LN1', txt: 'Cerca (LN1)' },
    { val: 'LA1', txt: 'Muro/Parede (LA1)' },
    { val: 'LI1', txt: 'Córrego/Vala (LI1)' },
    { val: 'LI2', txt: 'Estrada (LI2)' }
  ].map(o => `<option value="${o.val}" ${o.val === s.tipo_limite_sigef ? 'selected' : ''}>${o.txt}</option>`).join('');

  const metodoOptions = [
    { val: 'PG1', txt: 'RTK Relativo (PG1)' },
    { val: 'MC1', txt: 'Estático (MC1)' },
    { val: 'MC2', txt: 'Estático Rápido (MC2)' },
    { val: 'PG2', txt: 'RTK Wms/Ntrip (PG2)' }
  ].map(o => `<option value="${o.val}" ${o.val === s.metodo_posicionamento_sigef ? 'selected' : ''}>${o.txt}</option>`).join('');

  return `
    <tr class="linha-segmento-tbl hover:bg-white/[0.02] border-b border-white/5" data-seg-id="${s.id}">
      <td class="px-4 py-2.5 font-bold font-sans text-xs text-white">${pIni ? pIni.nome_vertice : '??'}</td>
      <td class="px-4 py-2.5 font-bold font-sans text-xs text-white">${pFim ? pFim.nome_vertice : '??'}</td>
      <td class="px-4 py-2.5">
        <select class="glass-input text-[10px] py-0.5 px-1 select-seg-conf w-full" data-seg-id="${s.id}">
          ${confOptions.join('')}
        </select>
      </td>
      <td class="px-4 py-2.5">
        <select class="glass-input text-[10px] py-0.5 px-1 select-seg-limite w-full" data-seg-id="${s.id}">
          ${limiteOptions}
        </select>
      </td>
      <td class="px-4 py-2.5">
        <select class="glass-input text-[10px] py-0.5 px-1 select-seg-metodo w-full" data-seg-id="${s.id}">
          ${metodoOptions}
        </select>
      </td>
    </tr>
  `;
};

/**
 * Renderiza um evento individual na linha do tempo do Histórico e Auditoria de Campo
 */
export const renderHistoricoTimelineHtml = (log: any): string => {
  let icone = 'info';
  let corIcone = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  
  if (log.tipo_evento === 'IMPORTACAO_TXT') {
    icone = 'file-up';
    corIcone = 'text-mint-vibrant bg-mint-vibrant/10 border-mint-vibrant/20';
  } else if (log.tipo_evento === 'EXCLUSAO_PONTO') {
    icone = 'trash-2';
    corIcone = 'text-red-400 bg-red-500/10 border-red-500/20';
  } else if (log.tipo_evento === 'CORRECAO_TRANSLACAO') {
    icone = 'refresh-cw';
    corIcone = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  } else if (log.tipo_evento === 'EDICAO_METODO') {
    icone = 'edit-3';
    corIcone = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  } else if (log.tipo_evento === 'ALTERACAO_BASE') {
    icone = 'link-2';
    corIcone = 'text-purple-400 bg-purple-500/10 border-purple-500/20';
  } else if (log.tipo_evento === 'CORRECAO_PONTO') {
    icone = 'crosshair';
    corIcone = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  }

  const dataFormatada = new Date(log.timestamp).toLocaleString('pt-BR');
  let extraDetailsHtml = '';
  
  if (log.dados_detalhados && Object.keys(log.dados_detalhados).length > 0) {
     extraDetailsHtml = `
       <details class="mt-2 text-[10px] text-white/40 cursor-pointer outline-none">
         <summary class="hover:text-white/60 select-none font-medium">Ver detalhes estruturados</summary>
         <pre class="mt-1 p-2 bg-[#0c1510]/80 border border-white/5 rounded text-[10px] text-mint-vibrant/80 font-mono overflow-x-auto max-w-full">${JSON.stringify(log.dados_detalhados, null, 2)}</pre>
       </details>
     `;
  }

  return `
    <div class="flex items-start gap-4 p-4 border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] rounded-technical transition-colors group text-left">
      <div class="w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${corIcone} transition-transform group-hover:scale-105">
        <i data-lucide="${icone}" class="w-4 h-4"></i>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between items-start gap-2">
          <span class="text-[10px] font-bold tracking-wider uppercase text-white/30 font-mono">${log.tipo_evento}</span>
          <span class="text-[9px] text-white/30 font-mono">${dataFormatada}</span>
        </div>
        <h5 class="text-xs font-bold text-white mt-1 leading-relaxed">${log.descricao}</h5>
        ${extraDetailsHtml}
      </div>
    </div>
  `;
};
