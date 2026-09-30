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
  nome_original?: string;
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
  lat_corrigido?: number;
  lon_corrigido?: number;
  alt_corrigido?: number;
  sigma_lat?: number;
  sigma_lon?: number;
  sigma_alt?: number;
  sigma_e?: number;
  sigma_n?: number;
  sigma_z?: number;
  ordem_caminhamento?: number;
  status_correcao?: string;
  status_ponto?: string;
  ignorar_poligono?: number;
  arquivo_origem?: string;
  ponto_vizinho?: number;
}

// Interface auxiliar para os segmentos
interface Segmento {
  id: number;
  ponto_inicio_id: number;
  ponto_fim_id: number;
  confrontante_id?: number | null;
  tipo_limite_sigef: string;
  metodo_posicionamento_sigef: string;
  anuencia_assinada?: number;
}

export const obterCorArquivo = (nomeArquivo: string): string => {
  if (!nomeArquivo) return '#ffffff';
  let hash = 0;
  for (let i = 0; i < nomeArquivo.length; i++) {
    hash = nomeArquivo.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 75%, 55%)`;
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
      <td class="px-4 py-2.5 text-white text-xs">${p.nome_vertice}</td>
      <td class="px-2 py-2.5 text-right text-xs text-white/40 tabular-nums">${originalE}<br/><span class="text-[10px]">${originalN}</span></td>
      <td class="px-2 py-2.5 text-right text-xs text-mint-vibrant/90 tabular-nums">${corrE}<br/><span class="text-[10px] text-mint-vibrant/70">${corrN}</span></td>
      <td class="px-2 py-2.5 text-right text-xs ${parseFloat(devE) === 0 ? 'text-white/30' : 'text-blue-400'} tabular-nums">${devE}mm</td>
      <td class="px-2 py-2.5 text-right text-xs ${parseFloat(devN) === 0 ? 'text-white/30' : 'text-blue-400'} tabular-nums">${devN}mm</td>
      <td class="px-2 py-2.5 text-right text-xs ${parseFloat(devH) === 0 ? 'text-white/30' : 'text-blue-400'} tabular-nums">${devH}mm</td>
    </tr>
  `;
};

/**
 * Renderiza uma linha na tabela de Segmentos de Divisa (Confrontantes)
 */
export const renderLinhaSegmentoHtml = (
  s: Segmento,
  confrontantesList: any[],
  pontosList: any[],
  latLonToUTM: (lat: number, lon: number) => { e: number; n: number }
): string => {
  const pIni = pontosList.find(p => p.id === s.ponto_inicio_id);
  const pFim = pontosList.find(p => p.id === s.ponto_fim_id);

  const obterCoordenadas = (p: any) => {
    if (!p) return null;
    if (p.e_corrigido !== undefined && p.e_corrigido !== null && p.n_corrigido !== undefined && p.n_corrigido !== null) {
      return { e: p.e_corrigido, n: p.n_corrigido };
    }
    if (p.e_original !== undefined && p.e_original !== null && p.n_original !== undefined && p.n_original !== null) {
      return { e: p.e_original, n: p.n_original };
    }
    if (p.lat && p.lon) {
      return latLonToUTM(p.lat, p.lon);
    }
    return null;
  };

  const coordIni = obterCoordenadas(pIni);
  const coordFim = obterCoordenadas(pFim);

  let distStr = '-';
  let azimuteStr = '-';

  if (coordIni && coordFim) {
    const dE = coordFim.e - coordIni.e;
    const dN = coordFim.n - coordIni.n;
    const dist = Math.sqrt(dE * dE + dN * dN);
    distStr = dist.toFixed(2);

    let azRad = Math.atan2(dE, dN);
    let azDeg = (azRad * 180) / Math.PI;
    if (azDeg < 0) azDeg += 360;

    // Arredondamento clássico com proteção de segundos >= 59.5
    const totalSegundos = Math.round(azDeg * 3600);
    let segundos = totalSegundos % 60;
    let totalMinutos = Math.floor(totalSegundos / 60);
    let minutos = totalMinutos % 60;
    let graus = Math.floor(totalMinutos / 60) % 360;

    if (segundos >= 60) {
      segundos = 0;
      minutos += 1;
    }
    if (minutos >= 60) {
      minutos = 0;
      graus = (graus + 1) % 360;
    }

    azimuteStr = `${graus}°${String(minutos).padStart(2, '0')}'${String(segundos).padStart(2, '0')}"`;
  }

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
    { val: 'PG1', txt: 'PG1 - Posicionamento GNSS - Relativo' },
    { val: 'PG2', txt: 'PG2 - Posicionamento GNSS - Absoluto' },
    { val: 'PT1', txt: 'PT1 - Poligonação' },
    { val: 'PT2', txt: 'PT2 - Irradiação' }
  ].map(o => `<option value="${o.val}" ${o.val === s.metodo_posicionamento_sigef ? 'selected' : ''}>${o.txt}</option>`).join('');

  return `
    <tr class="linha-segmento-tbl hover:bg-white/[0.02] border-b border-white/5" data-seg-id="${s.id}">
      <td class="px-3 py-2.5 font-sans text-xs text-white">
        <span class="text-white/40 block text-[9px] uppercase">De ➔ Para</span>
        ${pIni ? pIni.nome_vertice : '??'} ➔ ${pFim ? pFim.nome_vertice : '??'}
      </td>
      <td class="px-2 py-2.5 text-right text-xs text-white/90 tabular-nums">${distStr}</td>
      <td class="px-2 py-2.5 text-right text-xs text-white/90 tabular-nums">${azimuteStr}</td>
      <td class="px-3 py-2.5">
        <div class="space-y-1.5 py-1">
          <select class="glass-input text-xs py-1 px-1.5 select-segmento-confrontante w-full" data-segmento-id="${s.id}">
            ${confOptions.join('')}
          </select>
          <div class="grid grid-cols-2 gap-1">
            <select class="glass-input text-[10px] py-0.5 px-1 select-segmento-limite w-full" data-segmento-id="${s.id}">
              ${limiteOptions}
            </select>
            <select class="glass-input text-[10px] py-0.5 px-1 select-segmento-posicionamento w-full" data-segmento-id="${s.id}">
              ${metodoOptions}
            </select>
          </div>
        </div>
      </td>
      <td class="px-2 py-2.5 text-center">
        <div class="flex items-center justify-center">
          <input type="checkbox" class="chk-segmento-anuente rounded border-white/10 text-mint-vibrant focus:ring-mint-vibrant bg-white/5 w-5 h-5 md:w-4 md:h-4 cursor-pointer" data-segmento-id="${s.id}" ${s.anuencia_assinada === 1 ? 'checked' : ''} />
        </div>
      </td>
      <td class="px-3 py-2.5 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <button class="btn-emitir-anuencia-rapida p-1.5 bg-mint-vibrant/10 hover:bg-mint-vibrant/20 text-mint-vibrant rounded transition-all active:scale-95 flex items-center justify-center" 
                  data-segmento-id="${s.id}" 
                  data-confrontante-id="${s.confrontante_id || ''}" 
                  title="Emissão Rápida de Termo de Anuência" 
                  type="button">
            <i data-lucide="file-text" class="w-4 h-4"></i>
          </button>
          <button class="btn-emitir-requerimento-rapido p-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded transition-all active:scale-95 flex items-center justify-center" 
                  data-segmento-id="${s.id}" 
                  title="Emissão Rápida de Requerimento de Retificação" 
                  type="button">
            <i data-lucide="file-signature" class="w-4 h-4"></i>
          </button>
          <button class="btn-emitir-laudo-rapido p-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded transition-all active:scale-95 flex items-center justify-center" 
                  data-segmento-id="${s.id}" 
                  title="Emissão Rápida de Laudo Técnico" 
                  type="button">
            <i data-lucide="file-check" class="w-4 h-4"></i>
          </button>
        </div>
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
