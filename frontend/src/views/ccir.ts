import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, formatarCCIR, showToast, customAlert, customConfirm, escapeHtml } from '../utils';
export const ccirRoute: RouteDef = {
  render: () => `
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
            <a href="javascript:(function(){navigator.clipboard.readText().then(t=>{try{const d=JSON.parse(t);if(!d.codigo){alert('Nenhum dado de CCIR na área de transferência!');return;}const c=document.querySelector('input[name=\'codigoImovel\'],#codigoImovel');if(c){c.value=d.codigo.replace(/\D/g,'');c.dispatchEvent(new Event('input',{bubbles:!0}));c.dispatchEvent(new Event('change',{bubbles:!0}));}const u=document.querySelector('select[name=\'ufSede\'],#ufSede');if(u){u.value=d.uf.toUpperCase();u.dispatchEvent(new Event('change',{bubbles:!0}));}setTimeout(()=>{const m=document.querySelector('select[name=\'municipioSede\'],#municipioSede');if(m){for(let i=0;i<m.options.length;i++){const o=m.options[i].text.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');const s=d.municipio.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(o.includes(s)||s.includes(o)){m.selectedIndex=i;m.dispatchEvent(new Event('change',{bubbles:!0}));break;}}}const l=d.cpf.replace(/\D/g,'');const f=l.length<=11;const r=document.getElementById(f?'tipoPessoaFisica':'tipoPessoaJuridica')||document.querySelector(f?'input[value=\'F\']':'input[value=\'J\']');if(r){r.checked=!0;r.dispatchEvent(new Event('click',{bubbles:!0}));r.dispatchEvent(new Event('change',{bubbles:!0}));}setTimeout(()=>{const p=document.querySelector('input[name=\'cpfDeclarante\'],#cpfDeclarante,input[name=\'cnpjDeclarante\'],#cnpjDeclarante');if(p){p.value=l;p.dispatchEvent(new Event('input',{bubbles:!0}));p.dispatchEvent(new Event('change',{bubbles:!0}));}const h=document.querySelector('.h-captcha,iframe[title*=\'hCaptcha\']');if(h)h.scrollIntoView({behavior:\'smooth\'});},150);},600);}catch(e){alert('Erro ao ler dados da área de transferência!');}});})();" class="btn-primary text-center block w-full py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-white border border-blue-500/30 hover:border-transparent select-none cursor-grab font-bold transition-all" title="Arraste este botão para a sua barra de favoritos do navegador">
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
             <button class="text-white/40 hover:text-white transition-colors" id="btn-fechar-emissao-modal">
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
  `,
  setup: () => {
    const btnSync = document.getElementById('btn-sync-ccir');
    const btnOpenFolder = document.getElementById('btn-open-ccir-folder');
    const formSearch = document.getElementById('form-ccir-search') as HTMLFormElement;
    const btnClear = document.getElementById('btn-clear-ccir-search');
    
    // Carrega a listagem de arquivos
    const loadFiles = () => {
      fetch(`${API_BASE}/ccir/files`)
        .then(res => {
          if (!res.ok) throw new Error('Erro de requisição');
          return res.json();
        })
        .then(files => {
          const container = document.getElementById('ccir-imported-files');
          if (!container) return;
          
          if (!files || files.length === 0) {
            container.innerHTML = `<p class="text-xs text-white/20 text-center py-4">Nenhuma planilha cadastrada.</p>`;
            return;
          }

          container.innerHTML = files.map((f: any) => `
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
          
          initIcons();

          // Bind exclusão
          document.querySelectorAll('.btn-delete-ccir-file').forEach(btn => {
            btn.addEventListener('click', () => {
              const filename = btn.getAttribute('data-file');
              if(filename) {
                customConfirm(`Tem certeza de que deseja remover TODOS os registros importados da planilha "${filename}"?`).then(confirmed => {
                  if (confirmed) {
                    fetch(`${API_BASE}/ccir/files/${filename}`, { method: 'DELETE' })
                      .then(res => {
                        if(!res.ok) throw new Error('Erro ao remover arquivo');
                        return res.json();
                      })
                      .then(() => {
                        showToast('Planilha removida com sucesso!', 'success');
                        loadFiles();
                        runSearch();
                      })
                      .catch(err => showToast(err.message, 'error'));
                  }
                });
              }
            });
          });
        })
        .catch(err => {
          const container = document.getElementById('ccir-imported-files');
          if (container) container.innerHTML = `<p class="text-xs text-red-400 text-center py-4">Erro ao carregar arquivos: ${err.message}</p>`;
        });
    };

    // Executa a busca avançada
    const runSearch = () => {
      if (!formSearch) return;
      
      const formData = new FormData(formSearch);
      const params = new URLSearchParams();
      
      for (const [key, val] of formData.entries()) {
        if (val) {
          params.append(key, val.toString());
        }
      }
      
      fetch(`${API_BASE}/ccir/search?${params.toString()}`)
        .then(res => {
          if(!res.ok) throw new Error('Erro na busca');
          return res.json();
        })
        .then(data => {
          const body = document.getElementById('ccir-results-body');
          const count = document.getElementById('ccir-results-count');
          if (!body || !count) return;
          
          count.innerText = `${data.length} registros`;
          
          if (data.length === 0) {
            body.innerHTML = `
              <tr>
                <td colspan="7" class="p-12 text-center text-white/20">Nenhum registro encontrado para a busca.</td>
              </tr>
            `;
            return;
          }

          body.innerHTML = data.map((r: any) => {
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
          
          initIcons();

          // Bind clique nas linhas
          document.querySelectorAll('.ccir-row').forEach(row => {
            row.addEventListener('dblclick', () => {
              const codigo = row.getAttribute('data-codigo');
              if (codigo) showDetails(codigo);
            });
          });

          // Bind botão visualização
          document.querySelectorAll('.btn-view-ccir-detail').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const codigo = btn.getAttribute('data-codigo');
              if (codigo) showDetails(codigo);
            });
          });

          // Bind botão emissão externa
          document.querySelectorAll('.btn-emitir-ccir-incra').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const codigo = btn.getAttribute('data-codigo') || '';
              const uf = btn.getAttribute('data-uf') || '';
              const municipio = btn.getAttribute('data-municipio') || '';
              const titular = btn.getAttribute('data-titular') || '';
              const imovel = btn.getAttribute('data-imovel') || '';
              
              if (codigo) {
                 abrirModalEmissao(codigo, uf, municipio, imovel, titular);
              }
            });
          });
        })
        .catch(err => {
          showToast("Erro ao realizar busca: " + err.message, "error");
        });
    };

    // Abre modal de co-propriedade
    const showDetails = (codigo_imovel: string) => {
      fetch(`${API_BASE}/ccir/imovel/${codigo_imovel}`)
        .then(res => {
          if(!res.ok) throw new Error('Erro ao carregar detalhes');
          return res.json();
        })
        .then(data => {
          if (!data || data.length === 0) return;
          
          let modal = document.getElementById('ccir-modal');
          if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ccir-modal';
            modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center transition-all duration-300';
            document.body.appendChild(modal);
          }

          const regBase = data[0];
          const areaFmt = regBase.area_total !== null ? regBase.area_total.toFixed(4).replace('.', ',') : 'N/A';
          const somaPct = data.reduce((sum: number, r: any) => sum + (r.percentual_detencao || 0.0), 0.0).toFixed(2).replace('.', ',');

          modal.innerHTML = `
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

          initIcons();
          modal.classList.remove('hidden');

          const closeModal = () => {
             modal!.classList.add('hidden');
          };

          document.getElementById('close-ccir-modal')?.addEventListener('click', closeModal);
          document.getElementById('btn-fechar-ccir-modal')?.addEventListener('click', closeModal);
          document.getElementById('btn-emitir-modal-incra')?.addEventListener('click', () => {
             closeModal();
             abrirModalEmissao(
                codigo_imovel, 
                regBase.uf || '', 
                regBase.municipio || '', 
                regBase.denominacao || '', 
                regBase.titular || ''
             );
          });
        })
        .catch(err => {
          showToast("Erro ao carregar detalhes: " + err.message, "error");
        });
    };

    // Bind botões de sinc e pasta
    if (btnSync) {
      btnSync.addEventListener('click', () => {
        const icon = document.getElementById('sync-icon');
        if (icon) icon.classList.add('animate-spin');
        btnSync.setAttribute('disabled', 'true');
        
        fetch(`${API_BASE}/ccir/sync`)
          .then(res => {
            if(!res.ok) throw new Error('Erro ao sincronizar');
            return res.json();
          })
          .then(res => {
            if (icon) icon.classList.remove('animate-spin');
            btnSync.removeAttribute('disabled');
            
            customAlert("Relatório de Sincronização:\n\n" + res.logs.join('\n'));
            loadFiles();
            runSearch();
          })
          .catch(err => {
            if (icon) icon.classList.remove('animate-spin');
            btnSync.removeAttribute('disabled');
            showToast("Erro ao sincronizar: " + err.message, "error");
          });
      });
    }

    if (btnOpenFolder) {
      btnOpenFolder.addEventListener('click', () => {
        fetch(`${API_BASE}/ccir/abrir-pasta`, { method: 'POST' })
          .then(res => {
            if(!res.ok) showToast("Erro ao abrir pasta", "error");
          })
          .catch(() => showToast("Erro de conexão ao abrir pasta", "error"));
      });
    }

    if (formSearch) {
      formSearch.addEventListener('submit', (e) => {
        e.preventDefault();
        runSearch();
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        formSearch.reset();
        runSearch();
      });
    }

    // --- LÓGICA DO EMISSOR CCIR AUTOMÁTICO (PORTAL INCRA) ---
    const modalEmissao = document.getElementById('modal-ccir-emissao');
    const formEmissao = document.getElementById('form-ccir-emissao') as HTMLFormElement;
    const inputEmissaoCpf = document.getElementById('input-emissao-cpf') as HTMLInputElement;
    const lblSugestao = document.getElementById('lbl-emissao-sugestao');

    const aplicarMascaraCpfCnpj = (value: string): string => {
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

    inputEmissaoCpf?.addEventListener('input', (e) => {
       const t = e.target as HTMLInputElement;
       t.value = aplicarMascaraCpfCnpj(t.value);
    });

    const abrirModalEmissao = (codigo: string, uf: string, municipio: string, denominacao: string, titular: string) => {
       if (!modalEmissao) return;

       (document.getElementById('emissao-ccir-codigo') as HTMLInputElement).value = codigo;
       (document.getElementById('emissao-ccir-uf') as HTMLInputElement).value = uf;
       (document.getElementById('emissao-ccir-municipio') as HTMLInputElement).value = municipio;
       (document.getElementById('emissao-ccir-titular') as HTMLInputElement).value = titular;
       (document.getElementById('emissao-ccir-imovel') as HTMLInputElement).value = denominacao;

       const lblImovel = document.getElementById('lbl-emissao-imovel');
       const lblCodigo = document.getElementById('lbl-emissao-codigo');
       const lblTitular = document.getElementById('lbl-emissao-titular');

       if (lblImovel) lblImovel.innerText = denominacao || 'Não Informado';
       if (lblCodigo) lblCodigo.innerText = formatarCCIR(codigo);
       if (lblTitular) lblTitular.innerText = titular || 'Não Informado';

       // Limpa e esconde sugestões
       if (lblSugestao) {
          lblSugestao.classList.add('hidden');
          lblSugestao.innerText = '';
          lblSugestao.onclick = null;
       }

       // Carrega do localStorage se houver
       const salvo = localStorage.getItem('ccir_cpf_' + codigo);
       if (salvo) {
          inputEmissaoCpf.value = salvo;
       } else {
          inputEmissaoCpf.value = '';
       }

       // Busca reativa silenciosa na base de Clientes
       const nomeBase = (titular || '').replace(/\*+/g, '').trim();
       if (nomeBase.length >= 3) {
          fetch(`${API_BASE}/clientes`)
             .then(res => {
               if(!res.ok) throw new Error('Erro ao buscar clientes');
               return res.json();
             })
             .then(clientes => {
                const correspondente = clientes.find((c: any) => 
                   c.nome_completo.toLowerCase().startsWith(nomeBase.toLowerCase()) ||
                   c.nome_completo.toLowerCase().includes(nomeBase.toLowerCase())
                );
                if (correspondente && correspondente.cpf_cnpj) {
                   if (lblSugestao) {
                      lblSugestao.innerText = `💡 Sugerir do cliente: ${escapeHtml(correspondente.nome_completo)} (${aplicarMascaraCpfCnpj(correspondente.cpf_cnpj)})`;
                      lblSugestao.classList.remove('hidden');
                      lblSugestao.onclick = () => {
                         inputEmissaoCpf.value = aplicarMascaraCpfCnpj(correspondente.cpf_cnpj);
                         lblSugestao.classList.add('hidden');
                      };
                   }
                }
             })
             .catch(err => console.warn("Erro ao buscar sugestão de clientes:", err));
       }

       modalEmissao.classList.remove('hidden');
    };

    const fecharModalEmissao = () => {
       modalEmissao?.classList.add('hidden');
    };

    document.getElementById('btn-fechar-emissao-modal')?.addEventListener('click', fecharModalEmissao);
    document.getElementById('btn-cancelar-emissao')?.addEventListener('click', fecharModalEmissao);

    formEmissao?.addEventListener('submit', (e) => {
       e.preventDefault();
       
       const codigo = (document.getElementById('emissao-ccir-codigo') as HTMLInputElement).value;
       const uf = (document.getElementById('emissao-ccir-uf') as HTMLInputElement).value;
       const municipio = (document.getElementById('emissao-ccir-municipio') as HTMLInputElement).value;
       const cpf = inputEmissaoCpf.value;

       if (!codigo || !cpf) return;

       // Salva no localStorage para a próxima emissão deste mesmo CCIR
       localStorage.setItem('ccir_cpf_' + codigo, cpf);

       // Copia os dados no clipboard em formato JSON
       const dataPayload = {
          codigo: codigo.replace(/\D/g, ''),
          uf: uf.toUpperCase(),
          municipio: municipio.trim(),
          cpf: cpf
       };

       navigator.clipboard.writeText(JSON.stringify(dataPayload))
          .then(() => {
             fecharModalEmissao();
             
             // Abre a página de emissão do INCRA em uma nova aba
             window.open('https://sncr.serpro.gov.br/ccir/emissao', '_blank');
             
             customAlert("Dados de emissão copiados para a área de transferência!\n\nNo site do INCRA, basta clicar no seu favorito 'Preencher CCIR' para colar e autopreencher todos os campos de uma vez, restando apenas resolver o captcha.");
          })
          .catch(err => {
             showToast("Erro ao copiar dados para a área de transferência: " + err.message, "error");
          });
    });

    // Inicialização silenciosa da sincronização ao carregar a página
    fetch(`${API_BASE}/ccir/sync`)
      .then(res => res.json())
      .then(() => {
        loadFiles();
        runSearch();
      })
      .catch(() => {
        loadFiles();
        runSearch();
      });
  }
};
