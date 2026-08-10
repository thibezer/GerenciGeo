/**
 * ccir_template.ts — Marcação HTML da tela Banco de Dados CCIR.
 */
export function renderCcirTemplate(): string {
  return `
    <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <!-- Cabeçalho -->
      <div class="flex justify-between items-center h-10 sm:h-12 border-b border-white/5 pb-2 sm:pb-3">
        <div>
          <h2 class="text-lg sm:text-xl font-bold tracking-tight text-white leading-none">Banco de Dados CCIR</h2>
          <p class="text-white/40 text-[10px] mt-1.5 hidden sm:block">Consulte cadastros do CCIR de forma integrada e gerencie planilhas locais.</p>
        </div>
      </div>

      <!-- Painel de Sincronização e Ferramentas no Topo -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Bloco de Sincronização de Pasta -->
        <div class="glass-card p-4 flex flex-col justify-between space-y-3">
          <div>
            <h4 class="font-bold text-xs text-mint-vibrant flex items-center gap-1.5">
              <i data-lucide="folder-sync" class="w-3.5 h-3.5"></i>
              Sincronização de Pasta
            </h4>
            <p class="text-[10px] text-white/50 leading-relaxed mt-1">
              O sistema sincroniza automaticamente as planilhas CSV inseridas na pasta externa de dados.
            </p>
          </div>
          <div class="flex gap-2">
            <button id="btn-sync-ccir" class="btn-primary flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs cursor-pointer">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5" id="sync-icon"></i>
              Sincronizar Pasta
            </button>
            <button id="btn-open-ccir-folder" class="btn-secondary flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs cursor-pointer">
              <i data-lucide="folder-open" class="w-3.5 h-3.5"></i>
              Abrir Pasta
            </button>
          </div>
        </div>

        <!-- Bloco de Planilhas Importadas -->
        <div class="glass-card p-4 flex flex-col justify-between">
          <h4 class="font-bold text-xs text-white mb-2 flex items-center gap-1.5">
            <i data-lucide="database" class="w-3.5 h-3.5 text-white/40"></i>
            Planilhas Importadas
          </h4>
          <div id="ccir-imported-files" class="space-y-1.5 max-h-24 overflow-y-auto pr-1 text-xs">
            <p class="text-[11px] text-white/20 text-center py-4">Carregando planilhas...</p>
          </div>
        </div>

        <!-- Bloco de Emissão Automática -->
        <div class="glass-card p-4 flex flex-col justify-between space-y-3">
          <div>
            <h4 class="font-bold text-xs text-blue-400 flex items-center gap-1.5">
              <i data-lucide="globe" class="w-3.5 h-3.5 animate-pulse"></i>
              Preenchimento INCRA
            </h4>
            <p class="text-[10px] text-white/50 leading-relaxed mt-1">
              Arraste o botão abaixo para a barra de favoritos do seu navegador para preencher os campos.
            </p>
          </div>
          <div>
            <a href="javascript:(function(){navigator.clipboard.readText().then(t=>{try{const d=JSON.parse(t);if(!d.codigo){alert('Nenhum dado de CCIR na área de transferência!');return;}const c=document.querySelector('input[name=\\'codigoImovel\\'],#codigoImovel');if(c){c.value=d.codigo.replace(/\\D/g,'');c.dispatchEvent(new Event('input',{bubbles:!0}));c.dispatchEvent(new Event('change',{bubbles:!0}));}const u=document.querySelector('select[name=\\'ufSede\\'],#ufSede');if(u){u.value=d.uf.toUpperCase();u.dispatchEvent(new Event('change',{bubbles:!0}));}setTimeout(()=>{const m=document.querySelector('select[name=\\'municipioSede\\'],#municipioSede');if(m){for(let i=0;i<m.options.length;i++){const o=m.options[i].text.toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');const s=d.municipio.toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');if(o.includes(s)||s.includes(o)){m.selectedIndex=i;m.dispatchEvent(new Event('change',{bubbles:!0}));break;}}}const l=d.cpf.replace(/\\D/g,'');const f=l.length<=11;const r=document.getElementById(f?'tipoPessoaFisica':'tipoPessoaJuridica')||document.querySelector(f?'input[value=\\'F\\']':'input[value=\\'J\\']');if(r){r.checked=!0;r.dispatchEvent(new Event('click',{bubbles:!0}));r.dispatchEvent(new Event('change',{bubbles:!0}));}setTimeout(()=>{const p=document.querySelector('input[name=\\'cpfDeclarante\\'],#cpfDeclarante,input[name=\\'cnpjDeclarante\\'],#cnpjDeclarante');if(p){p.value=l;p.dispatchEvent(new Event('input',{bubbles:!0}));p.dispatchEvent(new Event('change',{bubbles:!0}));}const h=document.querySelector('.h-captcha,iframe[title*=\\'hCaptcha\\']');if(h)h.scrollIntoView({behavior:\\'smooth\\'});},150);},600);}catch(e){alert('Erro ao ler dados da área de transferência!');}});})();" class="btn-primary text-center block w-full py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-white border border-blue-500/30 hover:border-transparent select-none cursor-grab font-bold transition-all" title="Arraste este botão para a sua barra de favoritos do navegador">
              Preencher CCIR (Favorito)
            </a>
          </div>
        </div>
      </div>

      <!-- Busca Avançada de Imóveis (Largura Total) -->
      <div class="glass-card p-5">
        <h4 class="font-bold text-xs text-white mb-3 flex items-center gap-1.5">
          <i data-lucide="search" class="w-3.5 h-3.5 text-white/40"></i>
          Busca Avançada de Imóveis
        </h4>
        <form id="form-ccir-search" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label class="text-[9px] text-white/40 uppercase font-bold block mb-1">Código do Imóvel</label>
              <input type="text" name="codigo_imovel" placeholder="Código CCIR..." class="glass-input w-full text-xs py-1.5 font-mono">
            </div>
            <div>
              <label class="text-[9px] text-white/40 uppercase font-bold block mb-1">Denominação do Imóvel</label>
              <input type="text" name="denominacao" placeholder="Nome da propriedade..." class="glass-input w-full text-xs py-1.5">
            </div>
            <div>
              <label class="text-[9px] text-white/40 uppercase font-bold block mb-1">Titular (Beneficiário)</label>
              <input type="text" name="titular" placeholder="Nome do proprietário..." class="glass-input w-full text-xs py-1.5">
            </div>
            <div>
              <label class="text-[9px] text-white/40 uppercase font-bold block mb-1">Município/UF</label>
              <input type="text" name="municipio" placeholder="Nome da cidade..." class="glass-input w-full text-xs py-1.5">
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-white/5">
            <div class="flex flex-wrap items-center gap-6 text-xs">
              <div class="flex items-center gap-1.5">
                <span class="text-[9px] text-white/40 uppercase font-bold">Área (ha):</span>
                <input type="number" step="any" name="area_min" placeholder="Mínima" class="glass-input w-20 text-center text-xs py-1">
                <span class="text-white/40 text-xs">a</span>
                <input type="number" step="any" name="area_max" placeholder="Máxima" class="glass-input w-20 text-center text-xs py-1">
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-[9px] text-white/40 uppercase font-bold">Detenção (%):</span>
                <input type="number" step="any" name="pct_min" placeholder="Mínimo" class="glass-input w-20 text-center text-xs py-1">
                <span class="text-white/40 text-xs">a</span>
                <input type="number" step="any" name="pct_max" placeholder="Máximo" class="glass-input w-20 text-center text-xs py-1">
              </div>
            </div>

            <div class="flex justify-end gap-2 shrink-0">
              <button type="button" id="btn-clear-ccir-search" class="btn-secondary text-xs py-1 px-4 cursor-pointer">Limpar Filtros</button>
              <button type="submit" class="btn-primary text-xs py-1 px-6 flex items-center gap-1.5 cursor-pointer">
                <i data-lucide="search" class="w-3.5 h-3.5"></i>
                Filtrar Registros
              </button>
            </div>
          </div>
        </form>
      </div>

      <!-- Tabela de Resultados (Largura Total) -->
      <div class="glass-card overflow-hidden">
        <div class="p-4 border-b border-white/5 bg-white/[0.01] flex justify-between items-center">
          <h4 class="font-bold text-xs">Resultados da Consulta</h4>
          <span class="text-[9px] bg-mint-vibrant/20 text-mint-vibrant px-2.5 py-0.5 rounded font-mono" id="ccir-results-count">0 registros</span>
        </div>
        
        <div class="overflow-x-auto min-w-0">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-white/[0.02] text-white/40 text-[9px] uppercase tracking-wider font-bold border-b border-white/5">
                <th class="p-3">Código CCIR</th>
                <th class="p-3">Imóvel</th>
                <th class="p-3">Município/UF</th>
                <th class="p-3 text-right">Área (ha)</th>
                <th class="p-3">Titular</th>
                <th class="p-3 text-right">% Det.</th>
                <th class="p-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody id="ccir-results-body" class="divide-y divide-white/5">
              <tr>
                <td colspan="7" class="p-12 text-center text-white/20">Utilize os filtros acima para realizar uma busca.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal do Emissor CCIR (CPF / CNPJ) -->
    <div id="modal-ccir-emissao" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] hidden flex items-center justify-center p-4">
       <div class="glass-card w-full max-w-sm border border-mint-vibrant/20 shadow-2xl animate-in zoom-in-95 duration-200">
          <div class="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
             <h3 class="text-xs font-bold text-white flex items-center gap-1.5">
                <i data-lucide="globe" class="w-4 h-4 text-mint-vibrant animate-pulse"></i>
                Emissor CCIR — INCRA
             </h3>
             <button class="text-white/40 hover:text-white transition-colors cursor-pointer" id="btn-fechar-emissao-modal">
                <i data-lucide="x" class="w-4 h-4"></i>
             </button>
          </div>
          <form id="form-ccir-emissao" class="p-4 space-y-4">
             <input type="hidden" id="emissao-ccir-codigo" />
             <input type="hidden" id="emissao-ccir-uf" />
             <input type="hidden" id="emissao-ccir-municipio" />
             <input type="hidden" id="emissao-ccir-titular" />
             <input type="hidden" id="emissao-ccir-imovel" />
             
             <div class="bg-white/[0.01] p-3 border border-white/5 rounded text-[11px] text-white/60 space-y-1">
                <p><strong>Imóvel:</strong> <span id="lbl-emissao-imovel" class="text-white">-</span></p>
                <p><strong>Código CCIR:</strong> <span id="lbl-emissao-codigo" class="text-white font-mono">-</span></p>
                <p><strong>Titular:</strong> <span id="lbl-emissao-titular" class="text-white">-</span></p>
             </div>

             <div>
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">CPF ou CNPJ do Declarante *</label>
                <input type="text" id="input-emissao-cpf" required class="glass-input w-full text-xs h-8.5 font-mono" placeholder="000.000.000-00">
                <span id="lbl-emissao-sugestao" class="text-[9px] text-mint-vibrant mt-1.5 block hidden hover:underline cursor-pointer"></span>
             </div>

             <div class="flex justify-end gap-2 pt-2 border-t border-white/5">
                <button type="button" class="btn-secondary text-xs py-1.5 px-3 cursor-pointer" id="btn-cancelar-emissao">Cancelar</button>
                <button type="submit" class="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5 cursor-pointer">
                   <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                   Copiar & Ir para o INCRA
                </button>
             </div>
          </form>
       </div>
    </div>
  `;
}
