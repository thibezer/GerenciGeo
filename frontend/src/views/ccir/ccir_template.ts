/**
 * ccir_template.ts — Marcação HTML da tela Banco de Dados CCIR.
 * Padrão de tela: "Arquivos .md/PADRAO_TELA_LISTAGEM.md".
 */
export function renderCcirTemplate(): string {
  return `
    <div class="gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full min-h-0 flex-1">
      <!-- Barra superior: título + total + ferramentas -->
      <div class="lp-bar">
        <div class="lp-bar-left">
          <h2 class="lp-titulo" title="Consulte cadastros do CCIR e gerencie as planilhas locais">Banco CCIR</h2>
          <span class="lp-tag lp-tag-pf" id="ccir-results-count" role="status" aria-live="polite">0 registros</span>
          
        </div>
        <div class="lp-bar-right">
          <div class="relative">
            <button type="button" class="lp-btn-sec" id="btn-planilhas" aria-haspopup="true" aria-expanded="false" title="Planilhas CSV já importadas">
              <i data-lucide="database" class="w-3.5 h-3.5"></i>
              Planilhas <span class="lp-seg-n" id="ccir-planilhas-count">0</span>
              <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
            </button>
            <div class="lp-popover hidden" id="popover-planilhas" role="dialog" aria-label="Planilhas importadas">
              <div class="lp-card-titulo"><i data-lucide="database"></i>Planilhas importadas</div>
              <div id="ccir-imported-files" class="lp-popover-corpo">
                <p class="lp-sub" style="text-align:center;padding:16px 0">Carregando planilhas...</p>
              </div>
            </div>
          </div>
          <button type="button" id="btn-open-ccir-folder" class="lp-btn-sec" title="Abrir a pasta externa de dados do CCIR">
            <i data-lucide="folder-open" class="w-3.5 h-3.5"></i>
            Abrir pasta
          </button>
          <a href="javascript:(function(){navigator.clipboard.readText().then(t=>{try{const d=JSON.parse(t);if(!d.codigo){alert('Nenhum dado de CCIR na área de transferência!');return;}const c=document.querySelector('input[name=\\'codigoImovel\\'],#codigoImovel');if(c){c.value=d.codigo.replace(/\\D/g,'');c.dispatchEvent(new Event('input',{bubbles:!0}));c.dispatchEvent(new Event('change',{bubbles:!0}));}const u=document.querySelector('select[name=\\'ufSede\\'],#ufSede');if(u){u.value=d.uf.toUpperCase();u.dispatchEvent(new Event('change',{bubbles:!0}));}setTimeout(()=>{const m=document.querySelector('select[name=\\'municipioSede\\'],#municipioSede');if(m){for(let i=0;i<m.options.length;i++){const o=m.options[i].text.toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');const s=d.municipio.toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');if(o.includes(s)||s.includes(o)){m.selectedIndex=i;m.dispatchEvent(new Event('change',{bubbles:!0}));break;}}}const l=d.cpf.replace(/\\D/g,'');const f=l.length<=11;const r=document.getElementById(f?'tipoPessoaFisica':'tipoPessoaJuridica')||document.querySelector(f?'input[value=\\'F\\']':'input[value=\\'J\\']');if(r){r.checked=!0;r.dispatchEvent(new Event('click',{bubbles:!0}));r.dispatchEvent(new Event('change',{bubbles:!0}));}setTimeout(()=>{const p=document.querySelector('input[name=\\'cpfDeclarante\\'],#cpfDeclarante,input[name=\\'cnpjDeclarante\\'],#cnpjDeclarante');if(p){p.value=l;p.dispatchEvent(new Event('input',{bubbles:!0}));p.dispatchEvent(new Event('change',{bubbles:!0}));}const h=document.querySelector('.h-captcha,iframe[title*=\\'hCaptcha\\']');if(h)h.scrollIntoView({behavior:\\'smooth\\'});},150);},600);}catch(e){alert('Erro ao ler dados da área de transferência!');}});})();" class="lp-btn-sec lp-fav" title="Arraste este botão para a barra de favoritos do navegador: ele preenche os campos do emissor do INCRA" style="color:#7dd3fc;border-color:rgba(56,189,248,.3);cursor:grab" draggable="true">
            <i data-lucide="globe" class="w-3.5 h-3.5"></i>
            Favorito INCRA
          </a>
          <button type="button" id="btn-sync-ccir" class="lp-btn-primario" title="Sincroniza automaticamente as planilhas CSV da pasta externa de dados">
            <i data-lucide="refresh-cw" class="w-4 h-4" id="sync-icon"></i>
            Sincronizar
          </button>
        </div>
      </div>

      <!-- Resultados com filtros (o formulário fica dentro do card) -->
      <div class="lp-card">
        <form id="form-ccir-search" class="lp-card-barra" style="align-items:flex-end">
          <label class="lp-campo" style="flex:1 1 150px">
            <span>Código do imóvel</span>
            <input type="text" name="codigo_imovel" placeholder="Código CCIR" class="lp-mono" autocomplete="off">
          </label>
          <label class="lp-campo" style="flex:2 1 200px">
            <span>Denominação</span>
            <input type="text" name="denominacao" placeholder="Nome da propriedade" autocomplete="off">
          </label>
          <label class="lp-campo" style="flex:2 1 200px">
            <span>Titular</span>
            <input type="text" name="titular" placeholder="Nome do proprietário" autocomplete="off">
          </label>
          <label class="lp-campo" style="flex:1 1 150px">
            <span>Município</span>
            <input type="text" name="municipio" placeholder="Nome da cidade" autocomplete="off">
          </label>
          <div class="flex items-end gap-2">
            <button type="button" class="lp-btn-sec" id="btn-mais-filtros" aria-expanded="false" aria-controls="filtros-avancados">
              <i data-lucide="sliders-horizontal" class="w-3.5 h-3.5"></i>
              Área e detenção
            </button>
            <button type="button" id="btn-clear-ccir-search" class="lp-btn-sec">Limpar</button>
            <button type="submit" class="lp-btn-primario">
              <i data-lucide="search" class="w-4 h-4"></i>
              Filtrar
            </button>
          </div>
          <div id="filtros-avancados" class="hidden w-full flex flex-wrap items-end gap-x-6 gap-y-2 pt-2" style="border-top:1px solid var(--lp-line)">
            <div class="lp-faixa-num">
              <span>Área (ha)</span>
              <input type="number" step="any" name="area_min" placeholder="Mín." aria-label="Área mínima">
              <i>a</i>
              <input type="number" step="any" name="area_max" placeholder="Máx." aria-label="Área máxima">
            </div>
            <div class="lp-faixa-num">
              <span>Detenção (%)</span>
              <input type="number" step="any" name="pct_min" placeholder="Mín." aria-label="Detenção mínima">
              <i>a</i>
              <input type="number" step="any" name="pct_max" placeholder="Máx." aria-label="Detenção máxima">
            </div>
          </div>
        </form>

        <div class="lp-wrap overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table class="lp-tabela">
            <thead>
              <tr>
                <th class="lp-ordenavel" data-ordem="codigo" tabindex="0">Código CCIR<span class="lp-sort-ico"></span></th>
                <th class="lp-ordenavel" data-ordem="imovel" aria-sort="ascending" tabindex="0">Imóvel<span class="lp-sort-ico"></span></th>
                <th class="lp-ordenavel lp-oculta-md" data-ordem="municipio" tabindex="0">Município/UF<span class="lp-sort-ico"></span></th>
                <th class="lp-ordenavel lp-col-num" data-ordem="area" tabindex="0">Área (ha)<span class="lp-sort-ico"></span></th>
                <th class="lp-ordenavel lp-oculta-sm" data-ordem="titular" tabindex="0">Titular<span class="lp-sort-ico"></span></th>
                <th class="lp-ordenavel lp-col-num" data-ordem="pct" tabindex="0">% Det.<span class="lp-sort-ico"></span></th>
                <th class="lp-col-acoes"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody id="ccir-results-body">
              <tr><td colspan="7"><div class="lp-skel"></div></td></tr>
            </tbody>
          </table>
        </div>

        <div class="lp-rodape">
          <span id="ccir-rodape-info">Aguardando consulta...</span>
          <span class="lp-muted" style="font-size:11px">Clique na linha para ver os coproprietários</span>
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
