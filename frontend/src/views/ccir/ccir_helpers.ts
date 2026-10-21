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

export const formatarDataImportacao = (iso?: string | null): string => {
  const s = iso || '';
  return s.length >= 16 ? `${s.substring(8, 10)}/${s.substring(5, 7)} ${s.substring(11, 16)}` : (s || '—');
};

export const renderPlanilhasImportadas = (files: any[]): string => {
  if (!files || files.length === 0) {
    return `<p class="lp-sub" style="text-align:center;padding:16px 0">Nenhuma planilha cadastrada.</p>`;
  }

  return files.map((f: any) => `
    <div class="lp-planilha">
      <div class="min-w-0 flex-1">
        <p class="lp-planilha-nome" title="${escapeHtml(f.arquivo_origem)}">${escapeHtml(f.arquivo_origem)}</p>
        <p class="lp-sub" style="font-size:11.5px">${Number(f.total_registros || 0).toLocaleString('pt-BR')} reg • ${formatarDataImportacao(f.data_importacao)}</p>
      </div>
      <button type="button" class="lp-ico-btn is-danger btn-delete-ccir-file" data-file="${escapeHtml(f.arquivo_origem)}" title="Remover planilha" aria-label="Remover planilha ${escapeHtml(f.arquivo_origem)}">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `).join('');
};

// ---------------- Formatação e ordenação dos resultados (puras) ----------------

export const formatarAreaCcir = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : v.toFixed(4).replace('.', ',');

export const formatarPercentualCcir = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : v.toFixed(2).replace('.', ',') + '%';

export type CampoOrdemCcir = 'codigo' | 'imovel' | 'municipio' | 'area' | 'titular' | 'pct';
export type DirecaoOrdemCcir = 'asc' | 'desc';

/** Ordenação estável, sem mutar a entrada; valor ausente vai sempre para o fim; empate desempata por denominação. */
export const ordenarResultadosCcir = (data: any[], campo: CampoOrdemCcir, direcao: DirecaoOrdemCcir): any[] => {
  const fator = direcao === 'asc' ? 1 : -1;
  const txt = (v: unknown): string => String(v ?? '');
  const cmp = (a: string, b: string): number => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true });
  const chave = (r: any): string | number | null => {
    switch (campo) {
      case 'codigo': return r.codigo_imovel || null;
      case 'imovel': return r.denominacao || null;
      case 'municipio': return r.municipio ? `${r.municipio}-${r.uf ?? ''}` : null;
      case 'titular': return r.titular || null;
      case 'area': return r.area_total ?? null;
      default: return r.percentual_detencao ?? null;
    }
  };
  return [...data].sort((a, b) => {
    const ka = chave(a);
    const kb = chave(b);
    if (ka === null && kb !== null) return 1;
    if (ka !== null && kb === null) return -1;
    let r = 0;
    if (ka !== null && kb !== null) r = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : cmp(txt(ka), txt(kb));
    return r !== 0 ? r * fator : cmp(txt(a.denominacao), txt(b.denominacao));
  });
};

export const renderCcirResultadosTabela = (data: any[]): string => {
  if (!data || data.length === 0) {
    return `<tr><td colspan="7"><div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="search"></i></div><div class="lp-estado-titulo">Nenhum registro encontrado</div><div class="lp-estado-txt">Nada corresponde aos filtros aplicados.</div><button type="button" class="lp-btn-sec" data-estado-acao="limpar">Limpar filtros</button></div></td></tr>`;
  }

  return data.map((r: any) => {
    const nome = escapeHtml(r.denominacao || '');
    return `
      <tr class="ccir-row" data-codigo="${escapeHtml(r.codigo_imovel)}" tabindex="0" aria-label="Ver coproprietários de ${nome || escapeHtml(r.codigo_imovel)}">
        <td><span class="lp-mono" style="font-size:12.5px;font-weight:700;color:var(--lp-text)">${formatarCCIR(r.codigo_imovel)}</span></td>
        <td><div class="lp-id-nome"><span title="${nome}">${nome || '<span class="lp-muted">sem denominação</span>'}</span></div></td>
        <td class="lp-oculta-md"><span class="lp-sub" style="font-size:13px;color:var(--lp-text-2)">${escapeHtml(r.municipio || '')}-${escapeHtml(r.uf || '')}</span></td>
        <td class="lp-col-num"><span class="lp-mono" style="font-size:12.5px">${formatarAreaCcir(r.area_total)}</span></td>
        <td class="lp-oculta-sm"><span class="lp-sub" style="font-size:13px;color:var(--lp-text-2)" title="${escapeHtml(r.titular || '')}">${escapeHtml(r.titular || '')}</span></td>
        <td class="lp-col-num"><span class="lp-mono" style="font-size:12.5px;font-weight:700;color:var(--lp-accent)">${formatarPercentualCcir(r.percentual_detencao)}</span></td>
        <td class="lp-col-acoes" style="width:84px">
          <div class="lp-acoes">
            <button type="button" class="lp-ico-btn btn-view-ccir-detail" data-codigo="${escapeHtml(r.codigo_imovel)}" title="Ver coproprietários" aria-label="Ver coproprietários de ${nome}">
              <i data-lucide="eye"></i>
            </button>
            <button type="button" class="lp-ico-btn btn-emitir-ccir-incra" style="color:#7dd3fc"
                    data-codigo="${escapeHtml(r.codigo_imovel)}"
                    data-uf="${escapeHtml(r.uf || '')}"
                    data-municipio="${escapeHtml(r.municipio || '')}"
                    data-titular="${escapeHtml(r.titular || '')}"
                    data-imovel="${nome}"
                    title="Emitir CCIR no portal do INCRA" aria-label="Emitir CCIR de ${nome}">
              <i data-lucide="globe"></i>
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
