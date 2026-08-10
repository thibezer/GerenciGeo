/**
 * ccir_helpers.ts — Formatadores, máscaras e geradores de templates parciais do módulo CCIR.
 */
import { formatarCCIR, escapeHtml } from '../../utils';

export const aplicarMascaraCpfCnpj = (value: string): string => {
  const apenasNumeros = value.replace(/\D/g, '');
  if (apenasNumeros.length <= 11) {
    return apenasNumeros
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    return apenasNumeros
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
};

export const renderPlanilhasImportadas = (files: any[]): string => {
  if (!files || files.length === 0) {
    return `<p class="text-xs text-white/20 text-center py-4">Nenhuma planilha cadastrada.</p>`;
  }

  return files.map((f: any) => `
    <div class="p-2 rounded bg-white/[0.01] border border-white/5 flex items-center justify-between group">
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-bold text-white truncate" title="${escapeHtml(f.arquivo_origem)}">${escapeHtml(f.arquivo_origem)}</p>
        <p class="text-[9px] text-white/40 mt-0.5">${f.total_registros} reg • ${f.data_importacao.substring(8, 10)}/${f.data_importacao.substring(5, 7)} ${f.data_importacao.substring(11, 16)}</p>
      </div>
      <button class="text-white/20 hover:text-red-400 p-1 rounded hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all btn-delete-ccir-file cursor-pointer" data-file="${escapeHtml(f.arquivo_origem)}">
        <i data-lucide="trash-2" class="w-3 h-3"></i>
      </button>
    </div>
  `).join('');
};

export const renderCcirResultadosTabela = (data: any[]): string => {
  if (!data || data.length === 0) {
    return `
      <tr>
        <td colspan="7" class="p-12 text-center text-white/20">Nenhum registro encontrado para a busca.</td>
      </tr>
    `;
  }

  return data.map((r: any) => {
    const areaFmt = r.area_total !== null ? r.area_total.toFixed(4).replace('.', ',') : '';
    const pctFmt = r.percentual_detencao !== null ? r.percentual_detencao.toFixed(2).replace('.', ',') + '%' : '';

    return `
      <tr class="hover:bg-white/[0.01] transition-all cursor-pointer ccir-row" data-codigo="${escapeHtml(r.codigo_imovel)}">
        <td class="p-3 font-mono font-bold text-white/80">${formatarCCIR(r.codigo_imovel)}</td>
        <td class="p-3 font-bold text-white">${escapeHtml(r.denominacao || '')}</td>
        <td class="p-3 text-white/60">${escapeHtml(r.municipio || '')}-${escapeHtml(r.uf || '')}</td>
        <td class="p-3 text-right font-mono text-white/80">${areaFmt}</td>
        <td class="p-3 text-white/80">${escapeHtml(r.titular || '')}</td>
        <td class="p-3 text-right font-mono text-mint-vibrant font-bold">${pctFmt}</td>
        <td class="p-3 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button class="text-mint-vibrant hover:bg-mint-vibrant/10 p-1.5 rounded btn-view-ccir-detail cursor-pointer" data-codigo="${escapeHtml(r.codigo_imovel)}" title="Visualizar Coproprietários">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            </button>
            <button class="text-blue-400 hover:bg-blue-500/10 p-1.5 rounded btn-emitir-ccir-incra cursor-pointer" 
                    data-codigo="${escapeHtml(r.codigo_imovel)}" 
                    data-uf="${escapeHtml(r.uf || '')}" 
                    data-municipio="${escapeHtml(r.municipio || '')}" 
                    data-titular="${escapeHtml(r.titular || '')}"
                    data-imovel="${escapeHtml(r.denominacao || '')}"
                    title="Emitir CCIR no Portal do INCRA">
              <i data-lucide="globe" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

export const renderCcirDetalhesModalHtml = (codigo_imovel: string, data: any[]): string => {
  const regBase = data[0];
  const areaFmt = regBase.area_total !== null ? regBase.area_total.toFixed(4).replace('.', ',') : 'N/A';
  const somaPct = data.reduce((sum: number, r: any) => sum + (r.percentual_detencao || 0.0), 0.0).toFixed(2).replace('.', ',');

  return `
    <div class="glass-card w-full max-w-3xl p-0 overflow-hidden border-mint-vibrant/20 shadow-2xl animate-in zoom-in-95 duration-200">
      <div class="bg-mint-vibrant/10 px-6 py-4 border-b border-white/10 flex justify-between items-center">
        <h3 class="text-lg font-bold flex items-center gap-2 text-white">
          <i data-lucide="database" class="w-5 h-5 text-mint-vibrant"></i>
          Ficha do Imóvel — CCIR ${formatarCCIR(codigo_imovel)}
        </h3>
        <button class="text-white/40 hover:text-white transition-colors cursor-pointer" id="close-ccir-modal">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>
      
      <div class="p-6 space-y-6">
        <!-- Informações Gerais -->
        <div class="grid grid-cols-2 gap-4 bg-white/[0.02] p-4 rounded-technical border border-white/5 text-xs">
          <div>
            <p class="text-white/40 mb-0.5">Denominação</p>
            <p class="text-sm font-bold text-white">${escapeHtml(regBase.denominacao || 'N/A')}</p>
          </div>
          <div>
            <p class="text-white/40 mb-0.5">Município/UF</p>
            <p class="text-sm font-bold text-white">${escapeHtml(regBase.municipio || 'N/A')}-${escapeHtml(regBase.uf || '')}</p>
          </div>
          <div>
            <p class="text-white/40 mb-0.5">Área Total</p>
            <p class="text-sm font-bold text-white">${areaFmt} ha</p>
          </div>
          <div>
            <p class="text-white/40 mb-0.5">Código IBGE</p>
            <p class="text-sm font-bold text-white">${escapeHtml(regBase.codigo_municipio || 'N/A')}</p>
          </div>
        </div>

        <!-- Lista de Coproprietários -->
        <div>
          <h4 class="text-sm font-bold text-white mb-2">Distribuição de Detenção e Co-proprietários</h4>
          <div class="max-h-60 overflow-y-auto border border-white/5 rounded-technical">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-white/[0.04] text-white/60 border-b border-white/5">
                  <th class="p-2.5">Titular / Beneficiário</th>
                  <th class="p-2.5">Condição</th>
                  <th class="p-2.5">Natureza Jurídica</th>
                  <th class="p-2.5 text-right">% Detenção</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${data.map((r: any) => `
                  <tr class="hover:bg-white/[0.01]">
                    <td class="p-2.5 font-bold text-white">${escapeHtml(r.titular || '')}</td>
                    <td class="p-2.5 text-white/80">${escapeHtml(r.condicao_pessoa || 'N/A')}</td>
                    <td class="p-2.5 text-white/60">${escapeHtml(r.natureza_juridica || 'N/A')}</td>
                    <td class="p-2.5 text-right font-mono text-mint-vibrant font-bold">${r.percentual_detencao !== null ? r.percentual_detencao.toFixed(2).replace('.', ',') + '%' : 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <div class="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex justify-between items-center">
        <p class="text-xs font-bold text-white/60">Soma de Detenção Cadastrada: <span class="text-mint-vibrant font-mono font-bold">${somaPct}%</span></p>
        <div class="flex gap-2">
          <button class="btn-primary py-1.5 px-4 text-xs flex items-center gap-1.5 cursor-pointer" id="btn-emitir-modal-incra">
             <i data-lucide="globe" class="w-3.5 h-3.5"></i>
             Emitir CCIR (INCRA)
          </button>
          <button class="btn-secondary py-1.5 px-4 text-xs cursor-pointer" id="btn-fechar-ccir-modal">Fechar Ficha</button>
        </div>
      </div>
    </div>
  `;
};
