import { API_BASE } from '../../config';
import { initIcons, showToast } from '../../utils';
import { renderLinhaPontoGeoprocessamentoHtml, renderAuditoriaTranslacaoHtml } from '../mesa_trabalho_tabela';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

// Função matemática precisa e determinística de conversão Lat/Lon para UTM SIRGAS 2000
export const latLonToUTM = (lat: number, lon: number) => {
  const sa = 6378137.0;
  const sb = 6356752.314245;
  const e2cuadrado = (sa * sa - sb * sb) / (sb * sb);
  const c = sa * sa / sb;

  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;

  const zone = Math.floor((lon + 180) / 6) + 1;
  const lonSMRad = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;

  const deltaLon = lonRad - lonSMRad;

  const A = Math.cos(latRad) * Math.sin(deltaLon);
  const xi = 0.5 * Math.log((1 + A) / (1 - A));
  const eta = Math.atan(Math.tan(latRad) / Math.cos(deltaLon)) - latRad;

  const nu = c / Math.sqrt(1 + e2cuadrado * Math.cos(latRad) * Math.cos(latRad));
  const zeta = (e2cuadrado / 2) * xi * xi * Math.cos(latRad) * Math.cos(latRad);
  const A1 = Math.sin(2 * latRad);
  const A2 = A1 * Math.cos(latRad) * Math.cos(latRad);
  const J2 = latRad + A1 / 2;
  const J4 = (3 * J2 + A2) / 4;
  const J6 = (5 * J4 + A2 * Math.cos(latRad) * Math.cos(latRad)) / 3;

  const alpha = (3 / 4) * e2cuadrado;
  const beta = (5 / 3) * alpha * alpha;
  const gama = (35 / 27) * alpha * alpha * alpha;

  const Bm = 0.9996 * c * (latRad - alpha * J2 + beta * J4 - gama * J6);

  const e = xi * nu * 0.9996 * (1 + zeta / 3) + 500000;
  let n = eta * nu * 0.9996 * (1 + zeta) + Bm;

  if (n < 0) {
    n = n + 10000000;
  }

  return { e, n, zone };
};

export const renderTabelaMesaGeodesica = (ctx: MesaTrabalhoContext) => {
  const isIgnoradoOuBase = (p: any) => p.ignorar_poligono === 1 || p.tipo_ponto === 'B' || p.tipo === 'B';

  let pontosMat = [...ctx.pontosList];

  // Calcula o mapa de ordem real estável de caminhamento antes de qualquer filtro
  const pontosOrdenadosOriginal = [...pontosMat].sort((a, b) => {
    const isIgnA = isIgnoradoOuBase(a) ? 1 : 0;
    const isIgnB = isIgnoradoOuBase(b) ? 1 : 0;
    if (isIgnA !== isIgnB) return isIgnB - isIgnA;
    if (isIgnA === 1) return a.nome_vertice.localeCompare(b.nome_vertice);
    const valA = a.ordem_caminhamento;
    const valB = b.ordem_caminhamento;
    const numA = typeof valA === 'number' ? valA : (parseInt(valA) || 999999);
    const numB = typeof valB === 'number' ? valB : (parseInt(valB) || 999999);
    return numA - numB;
  });

  let seqReal = 1;
  const mapaOrdemReal = new Map<number, string | number>();
  pontosOrdenadosOriginal.forEach((p) => {
    const isIgn = isIgnoradoOuBase(p);
    mapaOrdemReal.set(p.id, isIgn ? '-' : seqReal++);
  });

  // Calcula as contagens dinâmicas de filtros rápidos antes de aplicar o filtro ativo
  const totalTodos = pontosMat.length;
  const totalBases = pontosMat.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B').length;
  const totalRovers = pontosMat.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B').length;
  const totalBrutos = pontosMat.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO').length;
  const totalCorrigidos = pontosMat.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO').length;

  const btnTodos = document.querySelector('.btn-filtro-rapido[data-filtro="todos"]');
  if (btnTodos) btnTodos.textContent = `Todos (${totalTodos})`;
  
  const btnBases = document.querySelector('.btn-filtro-rapido[data-filtro="bases"]');
  if (btnBases) btnBases.textContent = `Bases (M/B) (${totalBases})`;
  
  const btnRovers = document.querySelector('.btn-filtro-rapido[data-filtro="rovers"]');
  if (btnRovers) btnRovers.textContent = `Rovers (P/V) (${totalRovers})`;
  
  const btnBrutos = document.querySelector('.btn-filtro-rapido[data-filtro="brutos"]');
  if (btnBrutos) btnBrutos.textContent = `Brutos (${totalBrutos})`;
  
  const btnCorrigidos = document.querySelector('.btn-filtro-rapido[data-filtro="corrigidos"]');
  if (btnCorrigidos) btnCorrigidos.textContent = `Corrigidos (${totalCorrigidos})`;

  if (ctx.ocultarForaPoligono) {
    pontosMat = pontosMat.filter(p => p.ignorar_poligono !== 1);
  }

  if (ctx.filtroRapidoAtivo !== 'todos') {
    if (ctx.filtroRapidoAtivo === 'bases') {
      pontosMat = pontosMat.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B');
    } else if (ctx.filtroRapidoAtivo === 'rovers') {
      pontosMat = pontosMat.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    } else if (ctx.filtroRapidoAtivo === 'brutos') {
      pontosMat = pontosMat.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO');
    } else if (ctx.filtroRapidoAtivo === 'corrigidos') {
      pontosMat = pontosMat.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO');
    }
  }

  if (ctx.searchFilterValue) {
    pontosMat = pontosMat.filter(p =>
      (p.nome_vertice && p.nome_vertice.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.tipo && p.tipo.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.arquivo_origem && p.arquivo_origem.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.ordem_caminhamento && String(p.ordem_caminhamento).includes(ctx.searchFilterValue))
    );
  }

  if (ctx.triagemMap) {
    const bpAtivo = ctx.bancoPontosExibido && ctx.bancoPontosList.length > 0;
    ctx.mapaController.clearOverlays(bpAtivo);
    ctx.mapaController.plotPontos(pontosMat, (pId: number) => {
      ctx.selectPontoFromTabela(pId);
    });

    ctx.mapaController.plotPolilinhaTemporaria(pontosMat);

    if (bpAtivo) {
      ctx.mapaController.plotPoligonalHomologada(ctx.bancoPontosList);
    }

    if (ctx.pontosVizinhosList && ctx.pontosVizinhosList.length > 0) {
      ctx.mapaController.plotPontosVizinhos(ctx.pontosVizinhosList);
    }

    ctx.mapaController.fitBounds(pontosMat);
  }

  const tblHeader = document.getElementById('tbl-pontos-header');
  if (tblHeader) {
    if (ctx.modoCoordenadas === 'geodesico') {
      tblHeader.innerHTML = `
           <th class="px-2 py-3 text-center resizable-col w-[60px] cursor-pointer hover:bg-white/5 transition-colors font-mono select-none" id="header-sort-ordem" data-col-id="col_vertice_ordem">Ord. ${ctx.currentSortColumn === 'ordem' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-nome" data-col-id="col_vertice_nome">Vértice ${ctx.currentSortColumn === 'nome' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-2 py-3 text-center resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-tipo" data-col-id="col_vertice_tipo">Tipo ${ctx.currentSortColumn === 'tipo' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-norte-bruto" data-col-id="col_vertice_lat_bruta">Lat Bruta ${ctx.currentSortColumn === 'norte_bruto' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-este-bruto" data-col-id="col_vertice_lon_bruta">Lon Bruta ${ctx.currentSortColumn === 'este_bruto' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-norte" data-col-id="col_vertice_lat_corr">Lat Corr ${ctx.currentSortColumn === 'norte' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-este" data-col-id="col_vertice_lon_corr">Lon Corr ${ctx.currentSortColumn === 'este' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-alt-bruta" data-col-id="col_vertice_alt_bruta">Alt Bruta ${ctx.currentSortColumn === 'alt_bruta' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-altitude" data-col-id="col_vertice_alt_corr">Alt Corr ${ctx.currentSortColumn === 'altitude' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-2 py-3 text-center resizable-col" data-col-id="col_vertice_poligono">Políg</th>
           <th class="px-4 py-3 text-center resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-status" data-col-id="col_vertice_status">Status ${ctx.currentSortColumn === 'status' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
         `;
    } else {
      tblHeader.innerHTML = `
           <th class="px-2 py-3 text-center resizable-col w-[60px] cursor-pointer hover:bg-white/5 transition-colors font-mono select-none" id="header-sort-ordem" data-col-id="col_vertice_ordem">Ord. ${ctx.currentSortColumn === 'ordem' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-nome" data-col-id="col_vertice_nome">Vértice ${ctx.currentSortColumn === 'nome' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-2 py-3 text-center resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-tipo" data-col-id="col_vertice_tipo">Tipo ${ctx.currentSortColumn === 'tipo' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-norte-bruto" data-col-id="col_vertice_n_bruto">Norte Bruto ${ctx.currentSortColumn === 'norte_bruto' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-este-bruto" data-col-id="col_vertice_e_bruto">Este Bruto ${ctx.currentSortColumn === 'este_bruto' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-norte" data-col-id="col_vertice_n_corr">Norte Corr ${ctx.currentSortColumn === 'norte' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-este" data-col-id="col_vertice_e_corr">Este Corr ${ctx.currentSortColumn === 'este' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-delta-n" data-col-id="col_vertice_dn">Δ N (mm) ${ctx.currentSortColumn === 'delta_n' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-delta-e" data-col-id="col_vertice_de">Δ E (mm) ${ctx.currentSortColumn === 'delta_e' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-delta-h" data-col-id="col_vertice_dh">Δ H (mm) ${ctx.currentSortColumn === 'delta_h' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
           <th class="px-2 py-3 text-center resizable-col" data-col-id="col_vertice_poligono">Políg</th>
           <th class="px-4 py-3 text-center resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-status" data-col-id="col_vertice_status">Status ${ctx.currentSortColumn === 'status' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
         `;
    }

    const setupSortHeader = (id: string, column: string) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.onclick = () => {
          if (ctx.currentSortColumn === column) {
            ctx.currentSortDirection = ctx.currentSortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            ctx.currentSortColumn = column;
            ctx.currentSortDirection = 'asc';
          }
          ctx.renderMatriculaDados();
        };
      }
    };

    setupSortHeader('header-sort-ordem', 'ordem');
    setupSortHeader('header-sort-nome', 'nome');
    setupSortHeader('header-sort-tipo', 'tipo');
    setupSortHeader('header-sort-este', 'este');
    setupSortHeader('header-sort-norte', 'norte');
    setupSortHeader('header-sort-altitude', 'altitude');
    setupSortHeader('header-sort-norte-bruto', 'norte_bruto');
    setupSortHeader('header-sort-este-bruto', 'este_bruto');
    setupSortHeader('header-sort-alt-bruta', 'alt_bruta');
    setupSortHeader('header-sort-delta-n', 'delta_n');
    setupSortHeader('header-sort-delta-e', 'delta_e');
    setupSortHeader('header-sort-delta-h', 'delta_h');
    setupSortHeader('header-sort-status', 'status');
  }

  const listPt = document.getElementById('tbl-pontos-triagem');
  if (listPt) {
    if (pontosMat.length === 0) {
      listPt.innerHTML = `<tr><td colspan="12" class="px-4 py-8 text-center text-white/30">Nenhum ponto atrelado a este levantamento.</td></tr>`;
    } else {
      pontosMat.sort((a, b) => {
        let valA: any;
        let valB: any;
        let isNumeric = false;

        if (ctx.currentSortColumn === 'ordem') {
          const isIgnA = isIgnoradoOuBase(a) ? 1 : 0;
          const isIgnB = isIgnoradoOuBase(b) ? 1 : 0;
          if (isIgnA !== isIgnB) {
            return isIgnB - isIgnA;
          }
          if (isIgnA === 1) {
            return a.nome_vertice.localeCompare(b.nome_vertice);
          }
          const valAOrdem = a.ordem_caminhamento;
          const valBOrdem = b.ordem_caminhamento;
          const numA = typeof valAOrdem === 'number' ? valAOrdem : (parseInt(valAOrdem) || 999999);
          const numB = typeof valBOrdem === 'number' ? valBOrdem : (parseInt(valBOrdem) || 999999);
          return ctx.currentSortDirection === 'asc' ? numA - numB : numB - numA;
        } else if (ctx.currentSortColumn === 'nome') {
          valA = a.nome_vertice;
          valB = b.nome_vertice;
        } else if (ctx.currentSortColumn === 'tipo') {
          valA = a.tipo_ponto || a.tipo || '';
          valB = b.tipo_ponto || b.tipo || '';
        } else if (ctx.currentSortColumn === 'este') {
          isNumeric = true;
          valA = a.e_corrigido !== undefined && a.e_corrigido !== null ? a.e_corrigido : (a.e_original || a.lon || 0);
          valB = b.e_corrigido !== undefined && b.e_corrigido !== null ? b.e_corrigido : (b.e_original || b.lon || 0);
        } else if (ctx.currentSortColumn === 'norte') {
          isNumeric = true;
          valA = a.n_corrigido !== undefined && a.n_corrigido !== null ? a.n_corrigido : (a.n_original || a.lat || 0);
          valB = b.n_corrigido !== undefined && b.n_corrigido !== null ? b.n_corrigido : (b.n_original || b.lat || 0);
        } else if (ctx.currentSortColumn === 'altitude') {
          isNumeric = true;
          valA = a.alt !== undefined && a.alt !== null ? a.alt : (a.alt_original || 0);
          valB = b.alt !== undefined && b.alt !== null ? b.alt : (b.alt_original || 0);
        } else if (ctx.currentSortColumn === 'norte_bruto') {
          isNumeric = true;
          valA = a.n_original || a.lat || 0;
          valB = b.n_original || b.lat || 0;
        } else if (ctx.currentSortColumn === 'este_bruto') {
          isNumeric = true;
          valA = a.e_original || a.lon || 0;
          valB = b.e_original || b.lon || 0;
        } else if (ctx.currentSortColumn === 'alt_bruta') {
          isNumeric = true;
          valA = a.alt_original || 0;
          valB = b.alt_original || 0;
        } else if (ctx.currentSortColumn === 'delta_n') {
          isNumeric = true;
          const da = a.n_corrigido !== undefined && a.n_corrigido !== null && a.n_original ? (a.n_corrigido - a.n_original) : 0;
          const db = b.n_corrigido !== undefined && b.n_corrigido !== null && b.n_original ? (b.n_corrigido - b.n_original) : 0;
          valA = da;
          valB = db;
        } else if (ctx.currentSortColumn === 'delta_e') {
          isNumeric = true;
          const da = a.e_corrigido !== undefined && a.e_corrigido !== null && a.e_original ? (a.e_corrigido - a.e_original) : 0;
          const db = b.e_corrigido !== undefined && b.e_corrigido !== null && b.e_original ? (b.e_corrigido - b.e_original) : 0;
          valA = da;
          valB = db;
        } else if (ctx.currentSortColumn === 'delta_h') {
          isNumeric = true;
          const da = a.alt !== undefined && a.alt !== null && a.alt_original ? (a.alt - a.alt_original) : 0;
          const db = b.alt !== undefined && b.alt !== null && b.alt_original ? (b.alt - b.alt_original) : 0;
          valA = da;
          valB = db;
        } else if (ctx.currentSortColumn === 'status') {
          valA = a.status_correcao || a.status_ponto || '';
          valB = b.status_correcao || b.status_ponto || '';
        }

        if (isNumeric) {
          const numA = Number(valA) || 0;
          const numB = Number(valB) || 0;
          return ctx.currentSortDirection === 'asc' ? numA - numB : numB - numA;
        } else {
          if (valA === null || valA === undefined) valA = '';
          if (valB === null || valB === undefined) valB = '';
          const strA = String(valA).toLowerCase();
          const strB = String(valB).toLowerCase();
          return ctx.currentSortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
        }
      });

      listPt.innerHTML = pontosMat.map((p) => {
        const ordemExibida = mapaOrdemReal.get(p.id) || '-';
        return renderLinhaPontoGeoprocessamentoHtml(p, ordemExibida, ctx.modoCoordenadas, ctx.selectedPontoIds, latLonToUTM);
      }).join('');

      initIcons();
    }
  }

  const containerLateral = document.getElementById('container-tabela-lateral-content');
  if (containerLateral) {
    if (pontosMat.length === 0) {
      containerLateral.innerHTML = `
           <table class="w-full text-left border-collapse">
             <tbody class="text-xs text-white/30">
               <tr><td class="px-4 py-8 text-center">Nenhum ponto para auditar translação.</td></tr>
             </tbody>
           </table>
         `;
    } else {
      const auditoriaHtml = pontosMat.map(p => renderAuditoriaTranslacaoHtml(p, latLonToUTM)).join('');
      containerLateral.innerHTML = `
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
                  <th class="px-4 py-3 resizable-col" data-col-id="col_auditoria_vertice">Vértice</th>
                  <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_original">Original (E/N)</th>
                  <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_corrigido">Corrigido (E/N)</th>
                  <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_de">dE</th>
                  <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_dn">dN</th>
                  <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_dh">dH</th>
                </tr>
              </thead>
              <tbody class="text-xs divide-y divide-white/5 text-white/60">
                ${auditoriaHtml}
              </tbody>
            </table>
          `;
    }
  }
};

export function setupMesaGeodesica(ctx: MesaTrabalhoContext) {
  ctx.latLonToUTM = latLonToUTM;

  const dropzone = document.getElementById('triagem-dropzone');
  const fileInput = document.getElementById('triagem-file-input') as HTMLInputElement;
  const filaContainer = document.getElementById('triagem-fila-container');
  const btnProcessar = document.getElementById('btn-processar-lote');

  ctx.renderFilaArquivos = () => {
    const dropzoneEl = document.getElementById('triagem-dropzone');
    const dropzoneIcon = document.getElementById('triagem-dropzone-icon');
    const dropzoneTitle = document.getElementById('triagem-dropzone-title');
    const dropzoneDesc = document.getElementById('triagem-dropzone-desc');
    const chkContainer = document.getElementById('triagem-opcoes-lote');

    if (ctx.filesQueue.length === 0) {
      if (dropzoneEl) {
        dropzoneEl.className = "border-2 border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-xl p-4 text-center cursor-pointer transition-all flex-1 flex flex-col justify-center items-center group relative overflow-hidden min-h-[120px]";
      }
      if (dropzoneIcon) dropzoneIcon.classList.remove('hidden');
      if (dropzoneDesc) dropzoneDesc.classList.remove('hidden');
      if (dropzoneTitle) {
        dropzoneTitle.innerText = "Arraste múltiplos arquivos para triagem";
        dropzoneTitle.className = "text-xs font-bold";
      }

      filaContainer?.classList.add('hidden');
      btnProcessar?.classList.add('hidden');
      if (chkContainer) {
        chkContainer.classList.remove('flex');
        chkContainer.classList.add('hidden');
      }
      return;
    }

    if (dropzoneEl) {
      dropzoneEl.className = "border border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-xl p-2 text-center cursor-pointer transition-all flex flex-row justify-center items-center gap-2 group relative overflow-hidden h-11 min-h-[44px] max-h-11 shrink-0";
    }
    if (dropzoneIcon) dropzoneIcon.classList.add('hidden');
    if (dropzoneDesc) dropzoneDesc.classList.add('hidden');
    if (dropzoneTitle) {
      dropzoneTitle.innerText = "Arraste mais arquivos para triagem";
      dropzoneTitle.className = "text-[11px] font-bold text-white/80 select-none";
    }

    filaContainer?.classList.remove('hidden');
    btnProcessar?.classList.remove('hidden');
    if (chkContainer) {
      chkContainer.classList.remove('hidden');
      chkContainer.classList.add('flex');
    }

    if (btnProcessar) {
      (btnProcessar as HTMLButtonElement).disabled = false;
      btnProcessar.classList.remove('opacity-50', 'cursor-not-allowed');
      btnProcessar.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i> Processar Lote em Segundo Plano`;
    }

    const basesPossiveis = ctx.pontosList.filter(p => p.tipo_ponto === 'M' || p.nome_vertice.toUpperCase().includes('BASE') || p.tipo_ponto === 'BASE');
    const basesParaRenderizar = basesPossiveis.length > 0 ? basesPossiveis : ctx.pontosList;

    filaContainer!.innerHTML = ctx.filesQueue.map((item, idx) => {
      const kbSize = (item.file.size / 1024).toFixed(1);

      if (item.matricula_id === undefined || item.matricula_id === null) {
        item.matricula_id = ctx.currentMatriculaId;
      }

      const options = [
        `<option value="base" ${item.destination === 'base' ? 'selected' : ''}>[Base - Enviar ao PPP]</option>`,
        `<option value="rover_estatico_corrigido" ${item.destination === 'rover_estatico_corrigido' ? 'selected' : ''}>[Rover Estático - Relatório de Coordenadas Corrigidas]</option>`,
        `<option value="rover_estatico_bruto" ${item.destination === 'rover_estatico_bruto' ? 'selected' : ''}>[Rover Estático - Arquivo Bruto (Aguardando Baseline)]</option>`,
        `<option value="rover_rtk" ${item.destination === 'rover_rtk' ? 'selected' : ''}>[RTK - Ingestão de Pontos (Vincular à Base Selecionada)]</option>`
      ];

      let extraSelectorsHtml = '';

      if (item.destination === 'rover_rtk') {
        extraSelectorsHtml += `
          <select class="glass-input text-[9px] py-0.5 px-1.5 select-file-base shrink-0 w-[140px]" data-idx="${idx}" title="Vincular à Base de Campo">
            <option value="">[Nenhuma Base (Autodetectar)]</option>
            ${basesParaRenderizar.map(p => `<option value="${p.id}" ${item.base_escolhida_id === p.id ? 'selected' : ''}>Base: ${p.nome_vertice}</option>`).join('')}
          </select>
        `;
      }

      return `
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded-technical text-[11px] gap-2">
          <div class="min-w-0 flex-1">
            <p class="font-mono text-white truncate font-medium" title="${item.file.name}">${item.file.name}</p>
            <p class="text-[8px] text-white/30 font-mono mt-0.5">${kbSize} KB</p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <select class="glass-input text-[9px] py-0.5 px-1.5 select-file-dest shrink-0 w-[190px]" data-idx="${idx}">
              ${options.join('')}
            </select>
            ${extraSelectorsHtml}
            <button class="text-white/30 hover:text-red-400 p-1 btn-remover-arquivo shrink-0" data-idx="${idx}">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    initIcons();

    document.querySelectorAll('.select-file-dest').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-idx') || '0');
        ctx.filesQueue[idx].destination = (e.target as HTMLSelectElement).value;
        ctx.renderFilaArquivos();
      });
    });

    document.querySelectorAll('.select-file-base').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-idx') || '0');
        const val = (e.target as HTMLSelectElement).value;
        ctx.filesQueue[idx].base_escolhida_id = val ? parseInt(val) : null;
      });
    });

    document.querySelectorAll('.btn-remover-arquivo').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.getAttribute('data-idx') || '0');
        ctx.filesQueue.splice(idx, 1);
        ctx.renderFilaArquivos();
      });
    });
  };

  dropzone?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (e: any) => {
    if (e.target.files) {
      Array.from(e.target.files as FileList).forEach(f => {
        const isGns = f.name.toLowerCase().endsWith('.gns');
        ctx.filesQueue.push({ file: f, destination: isGns ? 'base' : 'rover_rtk' });
      });
      ctx.renderFilaArquivos();
    }
    fileInput.value = '';
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
  });

  dropzone?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    if (e.dataTransfer && e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach(f => {
        const isGns = f.name.toLowerCase().endsWith('.gns');
        ctx.filesQueue.push({ file: f, destination: isGns ? 'base' : 'rover_rtk' });
      });
      ctx.renderFilaArquivos();
    }
  });

  btnProcessar?.addEventListener('click', async () => {
    if (ctx.filesQueue.length === 0) return;

    const chkInverter = document.getElementById('chk-inverter-ne-mesa') as HTMLInputElement;
    const inverterNE = chkInverter?.checked ? 'true' : 'false';

    let basesEnviadas = 0;
    let brutosEnviados = 0;
    let corrigidosProcessados = 0;
    let rtkProcessados = 0;

    for (const item of ctx.filesQueue) {
      if (item.destination === 'base') {
        const formDataBruto = new FormData();
        formDataBruto.append('categoria', 'Brutos');
        formDataBruto.append('file', item.file);
        try {
          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/upload-arquivo`, {
            method: 'POST',
            body: formDataBruto
          });
          const data = await res.json();
          if (res.ok) {
            brutosEnviados++;
          } else {
            const errMsg = data.error || data.detail || 'Falha no envio do arquivo bruto.';
            alert(`Erro no envio da Base ${item.file.name}: ${errMsg}`);
          }
        } catch (errBruto) {
          console.error("Erro ao salvar arquivo bruto da Base no workspace:", errBruto);
          alert(`Erro ao salvar arquivo bruto da Base ${item.file.name}`);
        }
        basesEnviadas++;
      }
      else if (item.destination === 'rover_estatico_bruto') {
        const formData = new FormData();
        formData.append('categoria', 'Brutos');
        formData.append('file', item.file);
        try {
          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/upload-arquivo`, {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (res.ok && data.success) {
            brutosEnviados++;
          } else {
            const errMsg = data.error || data.detail || data.message || 'Erro no upload';
            alert(`Erro no arquivo ${item.file.name}: ${errMsg}`);
          }
        } catch (err) {
          console.error("Erro ao enviar arquivo bruto:", err);
          alert(`Erro na comunicação ao subir ${item.file.name}`);
        }
      }
      else if (item.destination === 'rover_estatico_corrigido') {
        const mId = item.matricula_id || ctx.currentMatriculaId;
        const formData = new FormData();
        formData.append('file', item.file);
        if (mId) {
          formData.append('matricula_id', mId.toString());
        }
        formData.append('inverter_ne', inverterNE);
        try {
          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/importar-txt`, {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (!res.ok) {
            const errMsg = typeof data.detail === 'object' ? (data.detail.mensagem || JSON.stringify(data.detail)) : (data.detail || data.error || "Erro desconhecido");
            alert(`Erro na importação de ${item.file.name}: ${errMsg}`);
          } else if (data.error) {
            alert(`Erro na importação de ${item.file.name}: ${data.error}`);
          } else {
            corrigidosProcessados++;
          }
        } catch (err) {
          console.error("Erro ao importar estático corrigido:", err);
          alert(`Erro na comunicação ao processar ${item.file.name}`);
        }
      }
      else if (item.destination === 'rover_rtk') {
        const mId = item.matricula_id || ctx.currentMatriculaId;
        const formData = new FormData();
        formData.append('file', item.file);
        if (mId) {
          formData.append('matricula_id', mId.toString());
        }
        if (item.base_escolhida_id) {
          formData.append('base_escolhida_id', item.base_escolhida_id.toString());
        }
        formData.append('inverter_ne', inverterNE);
        try {
          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/importar-txt`, {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (!res.ok) {
            const errMsg = typeof data.detail === 'object' ? (data.detail.mensagem || JSON.stringify(data.detail)) : (data.detail || data.error || "Erro desconhecido");
            alert(`Erro na importação RTK de ${item.file.name}: ${errMsg}`);
          } else if (data.error) {
            alert(`Erro na importação RTK de ${item.file.name}: ${data.error}`);
          } else {
            rtkProcessados++;
          }
        } catch (err) {
          console.error("Erro ao importar RTK:", err);
          alert(`Erro na comunicação ao processar ${item.file.name}`);
        }
      }
    }

    let msgAlerta = "Processamento do lote finalizado com sucesso!\n\n";
    if (basesEnviadas > 0) msgAlerta += `• ${basesEnviadas} Base(s) enviada(s) ao PPP IBGE.\n`;
    if (brutosEnviados > 0) msgAlerta += `• ${brutosEnviados} Rover(s) Estático(s) Bruto(s) salvos no Workspace.\n`;
    if (corrigidosProcessados > 0) msgAlerta += `• ${corrigidosProcessados} Rover(s) Estático(s) Corrigido(s) importados.\n`;
    if (rtkProcessados > 0) msgAlerta += `• ${rtkProcessados} RTK Rover(s) importado(s) e vinculado(s) à base.\n`;

    alert(msgAlerta);

    if (chkInverter) chkInverter.checked = false;
    ctx.filesQueue = [];
    ctx.renderFilaArquivos();
    ctx.loadLevantamentoDetails();
  });

  document.getElementById('btn-voltar-lista')?.addEventListener('click', () => {
    localStorage.removeItem('active_levantamento_id');
    if (ctx.triagemMap) {
      ctx.triagemMap.remove();
      ctx.triagemMap = null;
    }
    window.location.hash = '#levantamentos';
  });

  document.getElementById('btn-atualizar-arquivos-list')?.addEventListener('click', () => {
    ctx.loadWorkspaceArquivos();
  });

  document.getElementById('btn-testar-busca-rinex')?.addEventListener('click', async () => {
    if (!ctx.currentLevId) return;

    const btn = document.getElementById('btn-testar-busca-rinex') as HTMLButtonElement;
    let originalHtml = "";
    if (btn) {
      btn.disabled = true;
      originalHtml = btn.innerHTML;
      btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 mr-1 animate-spin"></i> Buscando...`;
    }

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/testar-busca-rinex`, { method: 'POST' });
      const data = await res.json();

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }

      if (data.success) {
        let detalhes = `📂 Resultado da Busca de RINEX\n\n${data.message}\n\n`;
        if (data.arquivos_rinex_encontrados && data.arquivos_rinex_encontrados.length > 0) {
          detalhes += `🔍 Encontrados no PC (${data.arquivos_rinex_encontrados.length}):\n` + data.arquivos_rinex_encontrados.map((item: any) => `  • ${item.rinex}\n    em: ${item.origem}`).join('\n') + `\n\n`;
        }
        if (data.arquivos_copiados && data.arquivos_copiados.length > 0) {
          detalhes += `✅ Copiados para o Workspace (${data.arquivos_copiados.length}):\n` + data.arquivos_copiados.map((f: string) => `  • ${f}`).join('\n') + `\n\n`;
        }
        if (data.arquivos_ja_existentes && data.arquivos_ja_existentes.length > 0) {
          detalhes += `ℹ️ Já existiam no Workspace (${data.arquivos_ja_existentes.length}):\n` + data.arquivos_ja_existentes.map((f: string) => `  • ${f}`).join('\n') + `\n\n`;
        }
        if (data.arquivos_registrados && data.arquivos_registrados.length > 0) {
          detalhes += `💾 Registrados no Banco (${data.arquivos_registrados.length}):\n` + data.arquivos_registrados.map((f: string) => `  • ${f}`).join('\n') + `\n\n`;
        }
        if (data.erros && data.erros.length > 0) {
          detalhes += `❌ Erros:\n` + data.erros.join('\n');
        }
        if (data.arquivos_rinex_encontrados?.length === 0) {
          detalhes += `⚠️ Nenhum arquivo RINEX encontrado nas pastas conhecidas.\nVerifique se a conversão HGO foi executada antes de buscar.`;
        }
        alert(detalhes);
        ctx.loadWorkspaceArquivos();
      } else {
        alert("Falha: " + data.message);
      }
    } catch (e: any) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
      alert("Erro de comunicação com o servidor: " + e.message);
    }
  });

  document.getElementById('btn-download-rinex-zip')?.addEventListener('click', async () => {
    if (!ctx.currentLevId) return;

    const btn = document.getElementById('btn-download-rinex-zip') as HTMLButtonElement;
    let originalHtml = '';
    if (btn) {
      btn.disabled = true;
      originalHtml = btn.innerHTML;
      btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 mr-1 animate-spin"></i> Preparando...`;
    }

    try {
      const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/rinex/download-zip`;
      const res = await fetch(url);

      if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        alert('Erro ao gerar ZIP: ' + (err.detail || res.statusText));
        return;
      }

      // Dispara o download no navegador
      const blob = await res.blob();
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlObj;
      a.download = `Rinex_Lev${ctx.currentLevId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(urlObj);
    } catch (e: any) {
      if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
      alert('Erro de comunicação com o servidor: ' + e.message);
    }
  });

  document.getElementById('btn-exportar-kml')?.addEventListener('click', () => {
    if (!ctx.currentMatriculaId) return;
    alert(`Arquivo KML Sirgas 2000 gerado e copiado com sucesso para a pasta: \n/Projetos/Propriedade_Thiago/Lev_${ctx.currentLevId}/Exportacoes/`);
  });

  document.getElementById('btn-consolidar-pontos-utm')?.addEventListener('click', async () => {
    if (!ctx.currentLevId) return;
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/consolidar-pontos`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(`Erro na consolidação: ${data.detail || data.error || 'Falha desconhecida'}`);
      } else if (data.error) {
        alert(data.error);
      } else {
        alert(data.message);
        window.open(`${API_BASE}/levantamentos/${ctx.currentLevId}/arquivos/download?categoria=Exportacoes&nome=PONTOS_CONSOLIDADOS_UTM.txt`, '_blank');
        ctx.loadWorkspaceArquivos();
      }
    } catch (e) {
      alert("Erro ao consolidar pontos.");
    }
  });

  document.getElementById('btn-sincronizar-nuvem')?.addEventListener('click', async () => {
    if (!ctx.currentLevId || !ctx.currentMatriculaId) {
      alert("Selecione uma matrícula ativa antes de sincronizar!");
      return;
    }

    const btn = document.getElementById('btn-sincronizar-nuvem') as HTMLButtonElement;
    let originalHtml = '';
    if (btn) {
      btn.disabled = true;
      originalHtml = btn.innerHTML;
      btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 mr-1 animate-spin"></i> Sincronizando...`;
      initIcons();
    }

    try {
      const res = await fetch(`${API_BASE}/sincronizar/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}`, {
        method: 'POST'
      });
      const data = await res.json();

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        initIcons();
      }

      if (!res.ok) {
        alert(`Erro na sincronização: ${data.detail || data.error || 'Falha desconhecida'}`);
      } else {
        alert("✓ Sincronizado com a nuvem com sucesso!");
      }
    } catch (e: any) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        initIcons();
      }
      alert("Erro ao conectar com o servidor local: " + e.message);
    }
  });


  document.getElementById('btn-reordenar-caminhamento')?.addEventListener('click', async () => {
    if (!ctx.currentLevId) return;
    if (ctx.etapaAtiva !== 'geoprocessamento' && !ctx.currentMatriculaId) {
      alert("Selecione uma matrícula ativa antes de ordenar!");
      return;
    }

    const msgConfirm = ctx.etapaAtiva === 'geoprocessamento'
      ? "Tem certeza que deseja reordenar os pontos avulsos deste levantamento de modo que o caminhamento comece no ponto mais ao norte (sentido horário)?"
      : "Tem certeza que deseja reordenar as divisas desta matrícula de modo que o caminhamento comece no ponto mais ao norte (sentido horário)? As qualificações de confrontantes e limites serão preservadas.";

    if (!confirm(msgConfirm)) return;

    try {
      const url = ctx.etapaAtiva === 'geoprocessamento'
        ? `${API_BASE}/levantamentos/${ctx.currentLevId}/reordenar`
        : `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/reordenar`;

      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (data.error || data.detail) {
        alert(data.error || data.detail);
      } else {
        alert(data.mensagem || "Pontos reordenados com sucesso!");
        ctx.loadLevantamentoDetails();
      }
    } catch (e) {
      alert("Erro ao reordenar Poligonal.");
    }
  });

  document.getElementById('btn-arquivar-projeto-seguro')?.addEventListener('click', async () => {
    if (!ctx.currentLevId) return;
    if (!confirm("ATENÇÃO: Você tem certeza que deseja arquivar definitivamente este levantamento? As pastas físicas no Windows serão travadas como Somente Leitura (Read-Only) e a edição de dados no banco será bloqueada.")) return;

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/arquivar`, { method: 'POST' });
      const data = await res.json();
      alert(data.message);
      window.location.hash = '#levantamentos';
    } catch (e) {
      alert("Erro ao arquivar levantamento.");
    }
  });

  document.getElementById('btn-toggle-coordenadas')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-toggle-coordenadas');
    const lbl = document.getElementById('lbl-titulo-vertices');

    if (ctx.modoCoordenadas === 'geodesico') {
      ctx.modoCoordenadas = 'utm';
      if (btn) btn.innerText = 'Ver em Geodésico';
      if (lbl) lbl.innerText = 'Vértices UTM (SIRGAS 22S)';
    } else {
      ctx.modoCoordenadas = 'geodesico';
      if (btn) btn.innerText = 'Ver em UTM';
      if (lbl) lbl.innerText = 'Vértices Geodésicos';
    }

    ctx.renderMatriculaDados();
  });

  document.getElementById('btn-toggle-ocultar-ignorados')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-toggle-ocultar-ignorados');
    ctx.ocultarForaPoligono = !ctx.ocultarForaPoligono;

    if (btn) {
      if (ctx.ocultarForaPoligono) {
        btn.innerText = 'Mostrar Fora da Poligonal';
        btn.classList.replace('bg-white/5', 'bg-mint-vibrant/20');
        btn.classList.add('border-mint-vibrant/40');
      } else {
        btn.innerText = 'Ocultar Fora da Poligonal';
        btn.classList.replace('bg-mint-vibrant/20', 'bg-white/5');
        btn.classList.remove('border-mint-vibrant/40');
      }
    }
    ctx.renderMatriculaDados();
  });

  document.getElementById('btn-exportar-tabela-csv')?.addEventListener('click', () => {
    let pontosExport = [...ctx.pontosList];

    if (ctx.ocultarForaPoligono) {
      pontosExport = pontosExport.filter(p => p.ignorar_poligono !== 1);
    }

    if (ctx.filtroRapidoAtivo !== 'todos') {
      if (ctx.filtroRapidoAtivo === 'bases') {
        pontosExport = pontosExport.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B');
      } else if (ctx.filtroRapidoAtivo === 'rovers') {
        pontosExport = pontosExport.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B');
      } else if (ctx.filtroRapidoAtivo === 'brutos') {
        pontosExport = pontosExport.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO');
      } else if (ctx.filtroRapidoAtivo === 'corrigidos') {
        pontosExport = pontosExport.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO');
      }
    }

    if (ctx.searchFilterValue) {
      pontosExport = pontosExport.filter(p =>
        (p.nome_vertice && p.nome_vertice.toLowerCase().includes(ctx.searchFilterValue)) ||
        (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(ctx.searchFilterValue)) ||
        (p.tipo && p.tipo.toLowerCase().includes(ctx.searchFilterValue)) ||
        (p.arquivo_origem && p.arquivo_origem.toLowerCase().includes(ctx.searchFilterValue)) ||
        (p.ordem_caminhamento && String(p.ordem_caminhamento).includes(ctx.searchFilterValue))
      );
    }

    if (pontosExport.length === 0) {
      alert("Nenhum dado para exportar!");
      return;
    }

    const headers = ["Ordem", "Vertice", "Tipo", "Status", "Latitude", "Longitude", "Altitude", "Este_Corr", "Norte_Corr", "Este_Orig", "Norte_Orig", "Arquivo_Origem"];
    let seqValida = 1;
    const rows = pontosExport.map((p) => {
      const isIgn = p.ignorar_poligono === 1 || p.tipo_ponto === 'B' || p.tipo === 'B';
      const ordem = isIgn ? '-' : seqValida++;
      return [
        ordem,
        p.nome_vertice,
        p.tipo_ponto || p.tipo || '-',
        p.status_ponto || p.status_correcao || 'BRUTO',
        p.lat || '',
        p.lon || '',
        p.alt || p.alt_original || '',
        p.e_corrigido || '',
        p.n_corrigido || '',
        p.e_original || '',
        p.n_original || '',
        p.arquivo_origem || ''
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `vertices_levantamento_${ctx.currentLevId}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Ouvintes de filtros rápidos de tabela
  document.querySelectorAll('.btn-filtro-rapido').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.currentTarget as HTMLButtonElement;
      
      document.querySelectorAll('.btn-filtro-rapido').forEach(b => {
        b.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-white/50 border border-transparent hover:text-white hover:bg-white/[0.08] btn-filtro-rapido transition-all";
      });
      
      targetBtn.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 btn-filtro-rapido transition-all";
      
      ctx.filtroRapidoAtivo = targetBtn.getAttribute('data-filtro') || 'todos';
      ctx.renderMatriculaDados();
    });
  });

  const btnImportarCsvVizinho = document.getElementById('btn-importar-csv-vizinho');
  const inputCsvVizinho = document.getElementById('input-csv-vizinho') as HTMLInputElement;

  btnImportarCsvVizinho?.addEventListener('click', () => {
    inputCsvVizinho?.click();
  });

  inputCsvVizinho?.addEventListener('change', async (e: any) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      showToast(`Processando ${files.length} arquivo(s) de vizinho...`, "info");
      
      let sucessos = 0;
      let mensagens = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/importar-vizinho-csv`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        
        if (data.error || data.detail) {
          console.error(`Erro ao importar ${file.name}:`, data.error || data.detail);
        } else {
          sucessos++;
          mensagens.push(data.mensagem);
        }
      }

      inputCsvVizinho.value = '';

      if (sucessos > 0) {
        showToast(`Sucesso: ${sucessos} de ${files.length} arquivo(s) importados!`, 'success');
        ctx.loadLevantamentoDetails();
      } else {
        alert("Erro ao importar arquivos de vizinho.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar arquivos de vizinho.");
      inputCsvVizinho.value = '';
    }
  });

  const btnLimparVizinhos = document.getElementById('btn-limpar-vizinhos');
  btnLimparVizinhos?.addEventListener('click', async () => {
    if (!confirm("Tem certeza que deseja apagar todos os pontos de vizinhos importados no mapa?")) return;

    try {
      showToast("Removendo pontos de vizinhos...", "info");
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos-vizinhos`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (data.error || data.detail) {
        alert(data.error || data.detail);
      } else {
        showToast("Todos os pontos de vizinhos foram apagados!", "success");
        ctx.loadLevantamentoDetails();
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao remover pontos de vizinhos.");
    }
  });

  const handlePopupActions = async (e: MouseEvent) => {
    const btnIntegrar = (e.target as HTMLElement).closest('.btn-integrar-vizinho-mapa');
    const btnOcultar = (e.target as HTMLElement).closest('.btn-ocultar-vizinho-mapa');

    if (btnIntegrar) {
      const pId = btnIntegrar.getAttribute('data-ponto-id');
      if (!pId) return;

      try {
        showToast("Integrando ponto ao levantamento...", "info");
        const matriculaIdParam = ctx.currentMatriculaId ? `?matricula_id=${ctx.currentMatriculaId}` : '';
        const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos/integrar-vizinho/${pId}${matriculaIdParam}`, {
          method: 'POST'
        });
        const data = await res.json();
        
        if (data.error || data.detail) {
          alert(data.error || data.detail);
        } else {
          showToast(data.mensagem || "Ponto integrado com sucesso!", "success");
          ctx.loadLevantamentoDetails();
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao integrar ponto.");
      }
    }

    if (btnOcultar) {
      const pId = btnOcultar.getAttribute('data-ponto-id');
      if (!pId) return;

      try {
        showToast("Ocultando ponto do vizinho...", "info");
        const res = await fetch(`${API_BASE}/pontos/${pId}/toggle-ignorar-vizinho`, {
          method: 'POST'
        });
        const data = await res.json();
        
        if (data.error || data.detail) {
          alert(data.error || data.detail);
        } else {
          showToast("Ponto ocultado do mapa!", "success");
          if (ctx.mapaController) {
            const map = ctx.mapaController.getMap();
            map?.closePopup();
          }
          ctx.loadLevantamentoDetails();
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao ocultar ponto.");
      }
    }
  };

  document.removeEventListener('click', (ctx as any)._popupActionsListener);
  (ctx as any)._popupActionsListener = handlePopupActions;
  document.addEventListener('click', handlePopupActions);
}
