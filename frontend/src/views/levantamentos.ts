import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, formatarCCIR, showToast } from '../utils';
import L from 'leaflet';


let clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

export const levantamentosRoute: RouteDef = {
   render: () => `
    <div class="space-y-6 animate-in fade-in duration-300">
      <!-- LISTA DE LEVANTAMENTOS -->
      <div id="painel-lista-projetos" class="space-y-6">
        <div class="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h2 class="text-3xl font-bold">Mesa de Levantamentos</h2>
            <p class="text-white/40 mt-1">Selecione um projeto de georreferenciamento ativo para iniciar a triagem espacial.</p>
          </div>
          <div class="flex flex-col sm:flex-row gap-3 sm:items-center w-full sm:w-auto">
             <!-- Alternador de Modos de Visualização -->
             <div class="flex gap-0.5 bg-white/5 p-1 rounded-lg border border-white/5 shrink-0 justify-center" id="lev-view-toggle">
                <button class="p-1.5 rounded transition-all" id="btn-mode-grid" title="Visualização em Cards">
                   <i data-lucide="layout-grid" class="w-4 h-4"></i>
                </button>
                <button class="p-1.5 rounded transition-all" id="btn-mode-list" title="Visualização em Lista (Windows Explorer)">
                   <i data-lucide="list" class="w-4 h-4"></i>
                </button>
             </div>
             <input type="text" placeholder="Buscar levantamento..." class="glass-input text-xs w-full sm:w-56 md:w-64" id="busca-levantamento" />
             <button class="btn-primary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto shrink-0 py-2.5 sm:py-2" id="btn-novo-lev">
                <i data-lucide="plus" class="w-4 h-4"></i>
                Novo Levantamento
             </button>
             <button class="btn-secondary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto shrink-0 py-2.5 sm:py-2 text-mint-vibrant border-mint-vibrant/20" id="btn-triagem-txt">
                <i data-lucide="filter" class="w-4 h-4"></i>
                Área de Triagem
             </button>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="grid-projetos">
          <div class="text-white/20 p-8 text-center col-span-full">Carregando levantamentos...</div>
        </div>
      </div>
      
      <!-- MODAL NOVO/EDITAR LEVANTAMENTO -->
      <div id="modal-levantamento" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-md">
            <div class="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
               <h3 class="text-lg font-bold flex items-center gap-2">
                  <i data-lucide="plus" class="w-5 h-5 text-mint-vibrant"></i>
                  <span id="modal-lev-titulo">Novo Levantamento</span>
               </h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal-lev">
                  <i data-lucide="x" class="w-5 h-5"></i>
               </button>
            </div>
            <form id="form-levantamento" class="p-6 space-y-4">
               <div class="relative">
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Selecionar Propriedade *</label>
                  <input type="text" id="input-lev-prop-busca" placeholder="Digite para buscar propriedade..." class="glass-input w-full text-xs py-3 md:py-2 pr-8" autocomplete="off" required />
                  <input type="hidden" id="select-lev-propriedade" required />
                  <div id="lista-flutuante-propriedades" class="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#0a100d] border border-white/10 rounded-technical shadow-2xl z-50 hidden divide-y divide-white/5">
                     <!-- Opções renderizadas dinamicamente -->
                  </div>
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Responsável Técnico *</label>
                  <select id="select-lev-profissional" required class="glass-input w-full text-xs py-3 md:py-2">
                     <option value="1">Dr. Thiago A. Silva (INCRA Credenciado)</option>
                  </select>
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Data de Início *</label>
                  <input type="date" id="input-lev-data" required class="glass-input w-full text-sm py-3 md:py-2" />
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Número TRT (Opcional)</label>
                  <input type="text" id="input-lev-trt-numero" class="glass-input w-full text-xs py-3 md:py-2" placeholder="Ex: 2026123456" />
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Data Quitação TRT (Opcional)</label>
                  <input type="date" id="input-lev-trt-data" class="glass-input w-full text-sm py-3 md:py-2" />
               </div>
               <div id="container-lev-status" class="hidden">
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Status *</label>
                  <select id="select-lev-status" class="glass-input w-full text-xs py-3 md:py-2">
                     <option value="EM_ANDAMENTO">Em Andamento</option>
                     <option value="CONCLUIDO">Concluido</option>
                     <option value="ARQUIVADO">Arquivado</option>
                  </select>
               </div>
               <div class="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button type="button" class="btn-secondary text-xs" id="btn-cancelar-lev">Cancelar</button>
                  <button type="submit" class="btn-primary text-xs" id="btn-submit-lev">Criar Levantamento</button>
               </div>
            </form>
         </div>
      </div>

      <!-- MODAL ÁREA DE TRIAGEM -->
      <div id="modal-triagem" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-5xl h-[85vh] flex flex-col">
            <!-- Cabeçalho -->
            <div class="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02] shrink-0">
               <h3 class="text-sm font-bold flex items-center gap-2">
                  <i data-lucide="filter" class="w-4 h-4 text-mint-vibrant"></i>
                  <span>Área de Triagem Espacial (Testador de Arquivos)</span>
               </h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal-triagem">
                  <i data-lucide="x" class="w-4 h-4"></i>
               </button>
            </div>
            <!-- Conteúdo Principal -->
            <div class="p-4 flex flex-col md:flex-row gap-4 overflow-hidden flex-1 min-h-0">
               <!-- Painel de Controle (Esquerdo) -->
               <div class="w-full md:w-2/5 flex flex-col gap-3 overflow-y-auto pr-1">
                  <div>
                     <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">1. Carregar Arquivo de Pontos (.TXT) *</label>
                     <div id="drop-zone-triagem" class="border border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-lg p-4 text-center cursor-pointer transition-colors bg-white/[0.01]">
                        <i data-lucide="upload-cloud" class="w-6 h-6 text-white/20 mx-auto mb-1" id="icon-upload-triagem"></i>
                        <span class="text-[10px] block text-white/60 font-medium" id="label-upload-triagem">Arraste ou clique para selecionar arquivo .txt</span>
                        <input type="file" id="input-file-triagem" accept=".txt" class="hidden" />
                     </div>
                  </div>
                  <div class="flex gap-2">
                     <div class="flex-1">
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Fuso UTM *</label>
                        <select id="select-fuso-triagem" class="glass-input w-full text-[11px] py-1 px-2">
                           <option value="18">Fuso 18S</option>
                           <option value="19">Fuso 19S</option>
                           <option value="20">Fuso 20S</option>
                           <option value="21">Fuso 21S</option>
                           <option value="22" selected>Fuso 22S (PR/SP/etc.)</option>
                           <option value="23">Fuso 23S (MG/RJ/BA/etc.)</option>
                           <option value="24">Fuso 24S</option>
                           <option value="25">Fuso 25S</option>
                        </select>
                     </div>
                     <div class="flex flex-col justify-end min-w-[90px]">
                        <label class="flex items-center gap-1 text-[9px] text-white/60 font-bold mb-1.5 cursor-pointer select-none">
                           <input type="checkbox" id="chk-inverter-ne" class="rounded border-white/10 text-mint-vibrant bg-white/5 focus:ring-0 focus:ring-offset-0 w-3 h-3 cursor-pointer" />
                           Inverter N/E
                        </label>
                        <button type="button" class="btn-primary text-[10px] py-1.5 px-3 flex items-center justify-center gap-1 w-full" id="btn-processar-triagem">
                           <i data-lucide="play" class="w-3 h-3"></i> Processar
                        </button>
                     </div>
                  </div>

                  <!-- Lista de pontos carregados -->
                  <div class="flex-1 flex flex-col min-h-[120px] border border-white/5 rounded-lg p-2.5 bg-white/[0.01] overflow-hidden">
                     <div class="flex justify-between items-center mb-1 shrink-0">
                        <span class="text-[9px] text-white/40 uppercase font-bold">Pontos Carregados (<span id="count-pontos-triagem">0</span>)</span>
                        <span class="text-[8px] font-mono font-bold bg-mint-vibrant/10 text-mint-vibrant px-1.5 py-0.5 rounded hidden" id="tag-layout-triagem">RTK</span>
                     </div>
                     <div class="flex-1 overflow-y-auto text-[10px] font-mono text-white/60 divide-y divide-white/5 font-mono max-h-[180px]" id="lista-pontos-triagem">
                        <div class="text-white/20 italic text-center py-4">Nenhum arquivo carregado</div>
                     </div>
                  </div>

                  <!-- Direcionar para Levantamento -->
                  <div class="border-t border-white/5 pt-3 space-y-2 shrink-0">
                     <h4 class="text-[11px] font-bold text-mint-vibrant flex items-center gap-1">
                        <i data-lucide="corner-down-right" class="w-3.5 h-3.5"></i>
                        <span>2. Direcionar para Levantamento</span>
                     </h4>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Selecionar Levantamento *</label>
                        <select id="select-destino-triagem" class="glass-input w-full text-[11px] py-1 px-2">
                           <option value="">Selecione o levantamento...</option>
                        </select>
                     </div>
                     <div class="grid grid-cols-2 gap-2">
                        <div>
                           <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Matrícula (Opcional)</label>
                           <select id="select-matricula-triagem" class="glass-input w-full text-[11px] py-1 px-2" disabled>
                              <option value="">Selecione o levantamento...</option>
                           </select>
                        </div>
                        <div>
                           <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Base de Campo (Opcional)</label>
                           <select id="select-base-triagem" class="glass-input w-full text-[11px] py-1 px-2" disabled>
                              <option value="">Selecione o levantamento...</option>
                           </select>
                        </div>
                     </div>
                     <button type="button" class="btn-primary w-full text-[11px] py-2 flex items-center justify-center gap-1 active:scale-95 transition-all mb-2" id="btn-salvar-associacao-triagem" disabled>
                        <i data-lucide="check" class="w-3.5 h-3.5"></i>
                        Confirmar e Importar
                     </button>
                  </div>
               </div>
               <!-- Mapa (Direito) -->
               <div class="w-full md:w-3/5 h-[300px] md:h-full rounded-lg overflow-hidden border border-white/5 relative bg-black/40 flex-1">
                  <div id="mapa-triagem" class="w-full h-full z-10"></div>
                  <!-- Indicador de sem dados no mapa -->
                  <div id="placeholder-mapa-triagem" class="absolute inset-0 bg-[#0a100d]/90 flex flex-col items-center justify-center z-20 text-center p-4 pointer-events-none">
                     <i data-lucide="map" class="w-10 h-10 text-white/10 mb-1"></i>
                     <span class="text-[10px] text-white/30 font-medium">Os pontos serão plotados aqui após o processamento</span>
                  </div>
               </div>
            </div>
         </div>
      </div>
   </div>
  `,
   setup: () => {
      let levantamentosList: any[] = [];
      let globalPropriedadesList: any[] = [];
      let editandoLevId: number | null = null;
      let viewMode: 'grid' | 'list' = (localStorage.getItem('lev_view_mode') as 'grid' | 'list') || 'grid';

      const updateToggleButtonsState = () => {
         const btnGrid = document.getElementById('btn-mode-grid');
         const btnList = document.getElementById('btn-mode-list');
         if (btnGrid && btnList) {
            if (viewMode === 'grid') {
               btnGrid.className = "p-1.5 rounded transition-all bg-mint-vibrant/20 text-mint-vibrant";
               btnList.className = "p-1.5 rounded transition-all text-white/40 hover:text-white";
            } else {
               btnList.className = "p-1.5 rounded transition-all bg-mint-vibrant/20 text-mint-vibrant";
               btnGrid.className = "p-1.5 rounded transition-all text-white/40 hover:text-white";
            }
         }
      };

      const configurarComboboxPropriedades = () => {
         const inputBusca = document.getElementById('input-lev-prop-busca') as HTMLInputElement;
         const inputHidden = document.getElementById('select-lev-propriedade') as HTMLInputElement;
         const listaFlutuante = document.getElementById('lista-flutuante-propriedades');

         if (!inputBusca || !inputHidden || !listaFlutuante) return;

         const renderOpcoes = (termo: string) => {
            const t = termo.toLowerCase();
            const filtradas = globalPropriedadesList.filter(p =>
               p.nome_propriedade.toLowerCase().includes(t) ||
               p.municipio.toLowerCase().includes(t) ||
               p.uf.toLowerCase().includes(t) ||
               (p.codigo_car && p.codigo_car.toLowerCase().includes(t))
            );

            if (filtradas.length === 0) {
               listaFlutuante.innerHTML = '<div class="p-3 text-xs text-white/30 italic">Nenhuma propriedade localizada.</div>';
            } else {
               listaFlutuante.innerHTML = filtradas.map(p => `
            <div class="opcao-prop-item p-3 hover:bg-mint-vibrant/10 cursor-pointer text-xs transition-colors flex flex-col" data-id="${p.id}" data-nome="${p.nome_propriedade} (${p.municipio}/${p.uf})">
              <span class="font-bold text-white">${p.nome_propriedade}</span>
              <span class="text-[10px] text-white/40 font-mono mt-0.5">CAR: ${p.codigo_car || 'N/I'} • ${p.municipio}/${p.uf}</span>
            </div>
          `).join('');

               listaFlutuante.querySelectorAll('.opcao-prop-item').forEach(item => {
                  item.addEventListener('click', () => {
                     const id = item.getAttribute('data-id') || '';
                     const nome = item.getAttribute('data-nome') || '';

                     inputBusca.value = nome;
                     inputHidden.value = id;
                     listaFlutuante.classList.add('hidden');
                  });
               });
            }
         };

         inputBusca.addEventListener('focus', () => {
            listaFlutuante.classList.remove('hidden');
            renderOpcoes(inputBusca.value);
         });

         inputBusca.addEventListener('input', () => {
            listaFlutuante.classList.remove('hidden');
            renderOpcoes(inputBusca.value);
         });

         clickOutsideHandler = (e: MouseEvent) => {
            if (!inputBusca.contains(e.target as Node) && !listaFlutuante.contains(e.target as Node)) {
               listaFlutuante.classList.add('hidden');
            }
         };
         document.addEventListener('click', clickOutsideHandler);
      };

      const loadLevantamentos = () => {
         const grid = document.getElementById('grid-projetos');
         if (!grid) return;
         grid.innerHTML = '<div class="text-white/20 p-8 text-center col-span-full">Carregando levantamentos...</div>';

         fetch(`${API_BASE}/levantamentos`)
            .then(res => res.json())
            .then(data => {
               levantamentosList = data;
               if (!data || data.length === 0) {
                  grid.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6";
                  grid.innerHTML = '<div class="text-white/30 p-8 text-center col-span-full bg-white/[0.01] border border-dashed border-white/5 rounded-xl">Nenhum levantamento cadastrado. Crie um novo para iniciar.</div>';
                  return;
               }

               renderListaProjetos(data);
            })
            .catch(() => {
               grid.innerHTML = `<div class="text-red-400 p-8 text-center col-span-full">Erro de conexão com o servidor API.</div>`;
            });
      };

      const renderListaProjetos = (lista: any[]) => {
         const grid = document.getElementById('grid-projetos');
         if (!grid) return;

         if (viewMode === 'grid') {
            grid.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6";
            grid.innerHTML = lista.map((l: any) => {
               const proprietarios = l.clientes && l.clientes.length
                  ? l.clientes.map((c: any) => `${c.nome_completo} (${(c.percentual_participacao || 0).toFixed(0)}%)`).join(', ')
                  : 'Sem proprietário vinculado';

               return `
               <div class="glass-card p-4 flex flex-col justify-between hover:border-mint-vibrant/20 transition-colors group lev-card-item" data-id="${l.id}">
                 <div>
                   <div class="flex justify-between items-start gap-4 mb-2">
                     <h4 class="font-bold text-base text-white group-hover:text-mint-vibrant transition-colors prop-title-text max-w-[70%] truncate">${l.nome_propriedade}</h4>
                     <span class="text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase shrink-0 ${l.status === 'CONCLUIDO' ? 'bg-mint-vibrant/15 text-mint-vibrant' : l.status === 'ARQUIVADO' ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'}">${l.status.replace('_', ' ')}</span>
                   </div>
                   
                   <div class="flex items-center justify-between text-[10px] text-white/30 font-mono mt-1 border-b border-white/5 pb-1.5">
                      <div class="flex items-center gap-1">
                         <i data-lucide="calendar" class="w-3 h-3 text-white/20 shrink-0"></i>
                         <span>Início: ${l.data_inicio}</span>
                      </div>
                      <div class="flex items-center gap-1">
                         <i data-lucide="map-pin" class="w-3 h-3 text-white/20 shrink-0"></i>
                         <span>${l.total_pontos || 0} Pts • ${l.total_segmentos || 0} Div</span>
                      </div>
                   </div>

                   <p class="text-xs text-white/60 mt-1.5 truncate font-medium">Proprietários: <span class="text-white/40 prop-owners-text">${proprietarios}</span></p>
                   
                   <div class="space-y-0.5 mt-2 pt-1.5 border-t border-white/5 text-[10px] font-mono text-white/40 prop-extra-text">
                      <div class="flex items-center gap-1.5"><span class="text-mint-vibrant font-bold shrink-0">CAR:</span> <span class="truncate" title="${l.codigo_car || 'Não Informado'}">${l.codigo_car || 'Não Informado'}</span></div>
                      <div class="flex items-center gap-1.5"><span class="text-blue-400 font-bold shrink-0">CCIR:</span> <span class="truncate" title="${l.codigo_ccir ? formatarCCIR(l.codigo_ccir) : 'Não Informado'}">${l.codigo_ccir ? formatarCCIR(l.codigo_ccir) : 'Não Informado'}</span></div>
                      <div class="flex items-center gap-1.5"><span class="text-white/60 font-bold shrink-0">MUNICÍPIO:</span> <span>${l.municipio || 'Não Informado'}/${l.uf}</span></div>
                   </div>
                 </div>
                 
                 <div class="flex gap-2 md:gap-2 items-center mt-3.5 border-t border-white/5 pt-2.5">
                    <button class="btn-primary text-xs py-2.5 px-3 md:py-1.5 md:px-3 flex-1 btn-auditar active:scale-95 transition-all" data-id="${l.id}">
                      <i data-lucide="play" class="w-3.5 h-3.5"></i>
                      Auditar & Triar
                    </button>
                    ${l.status === 'ARQUIVADO' ? `
                    <button class="btn-secondary text-mint-vibrant hover:bg-mint-vibrant/10 p-3.5 md:px-2 md:py-1.5 btn-desarquivar-lev active:scale-95 transition-all" data-id="${l.id}" title="Desarquivar Levantamento">
                      <i data-lucide="lock-open" class="w-4 h-4"></i>
                    </button>
                    ` : ''}
                    <button class="btn-secondary text-white/40 hover:text-mint-vibrant p-3.5 md:px-2 md:py-1.5 btn-editar-lev active:scale-95 transition-all" data-id="${l.id}" title="Editar Levantamento">
                      <i data-lucide="edit" class="w-4 h-4"></i>
                    </button>
                    <button class="btn-secondary text-red-400 hover:bg-red-500/10 p-3.5 md:px-2 md:py-1.5 btn-excluir-lev active:scale-95 transition-all" data-id="${l.id}">
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                  </div>
               </div>
             `;
            }).join('');
         } else {
            // Visualização em Lista do Windows Explorer
            grid.className = "w-full overflow-x-auto";
            grid.innerHTML = `
            <div class="glass-card p-0 overflow-hidden border border-white/5">
               <table class="w-full text-left text-xs border-collapse">
                  <thead>
                     <tr class="bg-white/[0.02] text-[10px] font-bold uppercase tracking-wider text-white/40 border-b border-white/5">
                        <th class="px-4 py-3 w-8"></th>
                        <th class="px-4 py-3">Nome / Localidade</th>
                        <th class="px-4 py-3 w-32">Status</th>
                        <th class="px-4 py-3 w-40">Data de início</th>
                        <th class="px-4 py-3">Proprietários</th>
                        <th class="px-4 py-3 w-44">Tamanho / Medições</th>
                        <th class="px-4 py-3 text-center w-28">Ações</th>
                     </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5 text-white/80">
                     ${lista.map((l: any) => {
               const proprietarios = l.clientes && l.clientes.length
                  ? l.clientes.map((c: any) => `${c.nome_completo} (${(c.percentual_participacao || 0).toFixed(0)}%)`).join(', ')
                  : 'Sem proprietário';
               return `
                           <tr class="hover:bg-white/[0.01] transition-colors lev-list-item" data-id="${l.id}">
                              <td class="px-4 py-3 text-center">
                                 <i data-lucide="folder" class="w-4 h-4 text-amber-400 fill-amber-400/20 shrink-0"></i>
                              </td>
                              <td class="px-4 py-3 font-bold text-white max-w-xs truncate">
                                 <span class="hover:text-mint-vibrant cursor-pointer btn-auditar-link" data-id="${l.id}">${l.nome_propriedade}</span>
                                 <span class="block text-[9px] text-white/20 mt-0.5 truncate font-mono">CAR: ${l.codigo_car || 'N/I'} • CCIR: ${l.codigo_ccir ? formatarCCIR(l.codigo_ccir) : 'N/I'}</span>
                              </td>
                              <td class="px-4 py-3">
                                 <span class="text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase ${l.status === 'CONCLUIDO' ? 'bg-mint-vibrant/15 text-mint-vibrant' : l.status === 'ARQUIVADO' ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'}">${l.status.replace('_', ' ')}</span>
                              </td>
                              <td class="px-4 py-3 text-white/60 font-mono">${l.data_inicio}</td>
                              <td class="px-4 py-3 text-white/40 truncate max-w-xs" title="${proprietarios}">${proprietarios}</td>
                              <td class="px-4 py-3 text-white/40 font-mono uppercase">${l.total_pontos || 0} pts • ${l.total_segmentos || 0} div</td>
                              <td class="px-4 py-3">
                                 <div class="flex items-center justify-center gap-3.5 md:gap-1.5">
                                    <button class="text-mint-vibrant hover:bg-mint-vibrant/20 p-3 md:p-1.5 rounded btn-auditar-icon active:scale-95 transition-all" data-id="${l.id}" title="Auditar & Triar">
                                       <i data-lucide="play" class="w-3.5 h-3.5"></i>
                                    </button>
                                    ${l.status === 'ARQUIVADO' ? `
                                    <button class="text-mint-vibrant hover:bg-mint-vibrant/20 p-3 md:p-1.5 rounded btn-desarquivar-lev active:scale-95 transition-all" data-id="${l.id}" title="Desarquivar Levantamento">
                                       <i data-lucide="lock-open" class="w-3.5 h-3.5"></i>
                                    </button>
                                    ` : ''}
                                    <button class="text-white/40 hover:text-mint-vibrant p-3 md:p-1.5 rounded btn-editar-lev active:scale-95 transition-all" data-id="${l.id}" title="Editar">
                                       <i data-lucide="edit" class="w-3.5 h-3.5"></i>
                                    </button>
                                    <button class="text-red-400 hover:bg-red-500/10 p-3 md:p-1.5 rounded btn-excluir-lev active:scale-95 transition-all" data-id="${l.id}" title="Excluir">
                                       <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                    </button>
                                 </div>
                              </td>
                           </tr>
                        `;
            }).join('')}
                  </tbody>
               </table>
            </div>
          `;
         }

         initIcons();

         // Delegação de eventos no grid-projetos
         grid.onclick = (e) => {
            const target = e.target as HTMLElement;
            const btn = target.closest('.btn-auditar, .btn-auditar-icon, .btn-auditar-link, .btn-editar-lev, .btn-excluir-lev, .btn-desarquivar-lev') as HTMLElement;
            if (!btn) return;

            const id = parseInt(btn.getAttribute('data-id') || '0');

            if (btn.classList.contains('btn-auditar') || btn.classList.contains('btn-auditar-icon') || btn.classList.contains('btn-auditar-link')) {
               localStorage.setItem('active_levantamento_id', id.toString());
               window.location.hash = '#mesa_trabalho';
            } else if (btn.classList.contains('btn-desarquivar-lev')) {
               (async () => {
                  const justificativa = prompt("Informe a justificativa formal para o desarquivamento do levantamento:");
                  if (justificativa === null) return; // Cancelou
                  if (!justificativa.trim()) {
                     alert("A justificativa é obrigatória para desarquivamento.");
                     return;
                  }

                  try {
                     const res = await fetch(`${API_BASE}/levantamentos/${id}/desarquivar`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ justificativa })
                     });
                     const data = await res.json();
                     if (res.ok) {
                        alert(data.message || "Levantamento desarquivado com sucesso.");
                        loadLevantamentos();
                     } else {
                        alert(data.detail || "Erro ao desarquivar levantamento.");
                     }
                  } catch (err) {
                     console.error(err);
                     alert("Erro na requisição de desarquivamento.");
                  }
               })();
            } else if (btn.classList.contains('btn-editar-lev')) {
               (async () => {
                  const l = levantamentosList.find(x => x.id === id);
                  if (!l) return;
                  editandoLevId = id;
                  try {
                     const res = await fetch(`${API_BASE}/propriedades`);
                     globalPropriedadesList = await res.json();
                  } catch (err) { console.error("Erro:", err); }

                  const modalTitulo = document.getElementById('modal-lev-titulo');
                  if (modalTitulo) modalTitulo.innerText = "Editar Levantamento";
                  const submitBtn = document.getElementById('btn-submit-lev');
                  if (submitBtn) submitBtn.innerText = "Salvar Alterações";

                  const inputBusca = document.getElementById('input-lev-prop-busca') as HTMLInputElement;
                  const inputHidden = document.getElementById('select-lev-propriedade') as HTMLInputElement;
                  const selectProf = document.getElementById('select-lev-profissional') as HTMLSelectElement;
                  const inputData = document.getElementById('input-lev-data') as HTMLInputElement;
                  const inputTrtNumero = document.getElementById('input-lev-trt-numero') as HTMLInputElement;
                  const inputTrtData = document.getElementById('input-lev-trt-data') as HTMLInputElement;
                  const selectStatus = document.getElementById('select-lev-status') as HTMLSelectElement;
                  const containerStatus = document.getElementById('container-lev-status');

                  const propObj = globalPropriedadesList.find(p => p.id === l.propriedade_id);
                  if (inputBusca && propObj) inputBusca.value = `${propObj.nome_propriedade} (${propObj.municipio}/${propObj.uf})`;
                  if (inputHidden) inputHidden.value = l.propriedade_id.toString();
                  if (selectProf) selectProf.value = l.profissional_id.toString();
                  if (inputData) inputData.value = l.data_inicio;
                  if (inputTrtNumero) inputTrtNumero.value = l.numero_trt || '';
                  if (inputTrtData) inputTrtData.value = l.data_trt || '';
                  if (selectStatus) selectStatus.value = l.status;
                  if (containerStatus) containerStatus.classList.remove('hidden');
                  document.getElementById('modal-levantamento')?.classList.remove('hidden');
               })();
            } else if (btn.classList.contains('btn-excluir-lev')) {
               (async () => {
                  if (confirm('Deseja apagar também a pasta física (Workspace) de arquivos associada a este levantamento?\n\nOK: Apagar registro + Pasta física\nCancelar: Cancelar exclusão')) {
                     try {
                        const res = await fetch(`${API_BASE}/levantamentos/${id}?apagar_arquivos=true`, { method: 'DELETE' });
                        if (!res.ok) {
                           const errData = await res.json().catch(() => ({}));
                           showToast(errData.detail || 'Erro ao excluir levantamento.', 'error');
                           return;
                        }
                        loadLevantamentos();
                     } catch (err) {
                        console.error('Erro ao excluir levantamento:', err);
                        showToast('Erro de comunicação com o servidor ao tentar excluir.', 'error');
                     }
                  }
               })();
            }
         };
      };

      // --- BOTOES DE ALTERNAÇÃO DE VISUALIZAÇÃO ---
      updateToggleButtonsState();

      document.getElementById('btn-mode-grid')?.addEventListener('click', () => {
         if (viewMode === 'grid') return;
         viewMode = 'grid';
         localStorage.setItem('lev_view_mode', 'grid');
         updateToggleButtonsState();
         renderListaProjetos(levantamentosList);
      });

      document.getElementById('btn-mode-list')?.addEventListener('click', () => {
         if (viewMode === 'list') return;
         viewMode = 'list';
         localStorage.setItem('lev_view_mode', 'list');
         updateToggleButtonsState();
         renderListaProjetos(levantamentosList);
      });

      // --- BUSCA DINÂMICA FILTRADA ---
      document.getElementById('busca-levantamento')?.addEventListener('input', (e) => {
         const term = (e.target as HTMLInputElement).value.toLowerCase();
         const items = document.querySelectorAll('.lev-card-item, .lev-list-item');
         items.forEach(el => {
            const propTitle = el.querySelector('.prop-title-text, .btn-auditar-link')?.textContent?.toLowerCase() || '';
            const owners = el.querySelector('.prop-owners-text, td:nth-child(5)')?.textContent?.toLowerCase() || '';
            const extra = el.querySelector('.prop-extra-text, td:nth-child(2)')?.textContent?.toLowerCase() || '';
            const match = propTitle.includes(term) || owners.includes(term) || extra.includes(term);
            if (el.classList.contains('lev-card-item')) {
               (el as HTMLElement).style.display = match ? 'flex' : 'none';
            } else {
               (el as HTMLElement).style.display = match ? 'table-row' : 'none';
            }
         });
      });

      document.getElementById('btn-novo-lev')?.addEventListener('click', async () => {
         editandoLevId = null;

         const modalTitulo = document.getElementById('modal-lev-titulo');
         if (modalTitulo) modalTitulo.innerText = "Novo Levantamento";

         const submitBtn = document.getElementById('btn-submit-lev');
         if (submitBtn) submitBtn.innerText = "Criar Levantamento";

         const containerStatus = document.getElementById('container-lev-status');
         if (containerStatus) containerStatus.classList.add('hidden');

         const modalLev = document.getElementById('modal-levantamento');
         const inputBusca = document.getElementById('input-lev-prop-busca') as HTMLInputElement;
         const inputHidden = document.getElementById('select-lev-propriedade') as HTMLInputElement;
         const inputData = document.getElementById('input-lev-data') as HTMLInputElement;
         const inputTrtNumero = document.getElementById('input-lev-trt-numero') as HTMLInputElement;
         const inputTrtData = document.getElementById('input-lev-trt-data') as HTMLInputElement;

         if (inputData) {
            inputData.value = new Date().toISOString().split('T')[0];
         }
         if (inputBusca) inputBusca.value = '';
         if (inputHidden) inputHidden.value = '';
         if (inputTrtNumero) inputTrtNumero.value = '';
         if (inputTrtData) inputTrtData.value = '';

         try {
            const res = await fetch(`${API_BASE}/propriedades`);
            globalPropriedadesList = await res.json();
            if (globalPropriedadesList.length === 0) {
               alert("Cadastre uma propriedade no módulo de Propriedades primeiro!");
               return;
            }
            modalLev?.classList.remove('hidden');
         } catch (e) {
            alert("Erro ao buscar propriedades.");
         }
      });

      document.getElementById('btn-fechar-modal-lev')?.addEventListener('click', () => {
         document.getElementById('modal-levantamento')?.classList.add('hidden');
      });
      document.getElementById('btn-cancelar-lev')?.addEventListener('click', () => {
         document.getElementById('modal-levantamento')?.classList.add('hidden');
      });

      document.getElementById('form-levantamento')?.addEventListener('submit', async (e) => {
         e.preventDefault();
         const propriedade_id = parseInt((document.getElementById('select-lev-propriedade') as HTMLSelectElement).value);
         const profesional_id = parseInt((document.getElementById('select-lev-profissional') as HTMLSelectElement).value);
         const data_inicio = (document.getElementById('input-lev-data') as HTMLInputElement).value;
         const numero_trt = (document.getElementById('input-lev-trt-numero') as HTMLInputElement).value.trim() || null;
         const data_trt = (document.getElementById('input-lev-trt-data') as HTMLInputElement).value || null;

         const payload: any = { propriedade_id, profissional_id: profesional_id, data_inicio, numero_trt, data_trt };

         if (editandoLevId) {
            const selectStatus = document.getElementById('select-lev-status') as HTMLSelectElement;
            payload.status = selectStatus.value;
         }

         try {
            const url = editandoLevId ? `${API_BASE}/levantamentos/${editandoLevId}` : `${API_BASE}/levantamentos`;
            const method = editandoLevId ? 'PUT' : 'POST';

            // Desabilita o botão submit para evitar double-submit durante a requisição
            const btnSubmit = document.getElementById('btn-submit-lev') as HTMLButtonElement;
            if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'Salvando...'; }

            try {
               const res = await fetch(url, {
                  method: method,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
               });
               const data = await res.json();
               if (data.error) {
                  alert(data.error);
               } else {
                  document.getElementById('modal-levantamento')?.classList.add('hidden');
                  loadLevantamentos();
               }
            } catch (e) {
               alert("Erro ao salvar levantamento.");
            } finally {
               if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = editandoLevId ? 'Salvar Alterações' : 'Criar Levantamento'; }
            }
         } catch (_outerErr) {
            // noop - bloco interno já captura o erro
         }
      });

      const loadProfissionais = () => {
         const selectProf = document.getElementById('select-lev-profissional') as HTMLSelectElement;
         if (!selectProf) return;

         fetch(`${API_BASE}/profissionais`)
            .then(res => {
               if (!res.ok) throw new Error(`HTTP ${res.status}`);
               return res.json();
            })
            .then(data => {
               if (!data || data.length === 0) {
                  selectProf.innerHTML = '<option value="">Nenhum profissional cadastrado</option>';
                  return;
               }
               selectProf.innerHTML = data.map((p: any) => `
               <option value="${p.id}">${p.nome} (${p.registro || 'Sem Registro'})</option>
             `).join('');
            })
            .catch(err => {
               console.error("Erro ao carregar profissionais:", err);
               selectProf.innerHTML = '<option value="">Erro ao carregar profissionais</option>';
            });
      };

      // =========================================================================
      // LÓGICA DA ÁREA DE TRIAGEM ESPACIAL
      // =========================================================================
      let mapaTriagem: L.Map | null = null;
      let mapaTriagemMarkers: L.Marker[] = [];
      let mapaTriagemPolyline: L.Polyline | null = null;
      let arquivoSelecionadoTriagem: File | null = null;
      let pontosProcessadosTriagem: any[] = [];
      let layoutDetectadoTriagem: string = '';

      const initMapaTriagem = () => {
         if (mapaTriagem) {
            mapaTriagem.remove();
            mapaTriagem = null;
         }

         const mapContainer = document.getElementById('mapa-triagem');
         if (!mapContainer) return;

         mapaTriagem = L.map('mapa-triagem', {
            maxZoom: 24,
            scrollWheelZoom: true
         }).setView([-23.7661, -53.3204], 14);

         // Google Satélite
         L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
            maxZoom: 24,
            maxNativeZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: 'Google Maps'
         }).addTo(mapaTriagem);
      };

      const limparMapaTriagem = () => {
         if (!mapaTriagem) return;
         mapaTriagemMarkers.forEach(m => mapaTriagem!.removeLayer(m));
         mapaTriagemMarkers = [];
         if (mapaTriagemPolyline) {
            mapaTriagem.removeLayer(mapaTriagemPolyline);
            mapaTriagemPolyline = null;
         }
      };

      const plotarPontosNoMapaTriagem = (pontos: any[]) => {
         limparMapaTriagem();
         if (!mapaTriagem || pontos.length === 0) return;

         const placeholder = document.getElementById('placeholder-mapa-triagem');
         if (placeholder) placeholder.classList.add('hidden');

         const coords: L.LatLng[] = [];

         pontos.forEach(p => {
            if (p.lat && p.lon) {
               const latLng = L.latLng(p.lat, p.lon);
               coords.push(latLng);

               // Copiado o mesmo estilo do mapa oficial do GerenciGeo
               const isBaseFisica = p.descricao && p.descricao.toLowerCase() === 'set_base';
               const isBasePPP = p.nome && (p.nome.toUpperCase().startsWith('M') || p.nome.toUpperCase().includes('BASE'));
               let markerBg = 'bg-mint-vibrant text-[#0c1510]';

               if (isBasePPP) {
                  markerBg = 'bg-indigo-600 text-white';
               } else if (isBaseFisica) {
                  markerBg = 'bg-rose-600 text-white';
               }

               const markerHtml = `
                 <div class="w-5 h-5 ${markerBg} border-2 border-[#0c1510] rounded-full flex items-center justify-center text-[7px] font-bold font-mono shadow-lg transition-transform hover:scale-125">
                   ${p.nome.substring(0, 3)}
                 </div>
               `;
               const customIcon = L.divIcon({
                  html: markerHtml,
                  className: 'custom-leaflet-marker',
                  iconSize: [20, 20]
               });

               const popupRole = isBasePPP
                  ? 'Base Homologada PPP (Provável)'
                  : (isBaseFisica ? 'Base de Campo (RTK set_base)' : 'Vértice de Perímetro');

               const marker = L.marker(latLng, { icon: customIcon })
                  .bindPopup(`
                     <div style="font-family:var(--geo-font-sans),sans-serif; color:rgba(255, 255, 255, 0.9); line-height:1.3; font-size:11px;">
                        <div style="font-weight:700; font-size:13px; margin-bottom:4px; color:#00b366;">${p.nome}</div>
                        <div style="font-size:10px; color:rgba(255, 255, 255, 0.65); font-weight:bold;">${popupRole}</div>
                        <div style="margin-top:4px; color:rgba(255, 255, 255, 0.85);">N: ${p.norte.toFixed(3)}</div>
                        <div style="color:rgba(255, 255, 255, 0.85);">E: ${p.este.toFixed(3)}</div>
                        <div style="color:rgba(255, 255, 255, 0.85);">Alt: ${p.alt.toFixed(3)}</div>
                        <div style="font-size:9px; color:rgba(255, 255, 255, 0.45); font-family:'JetBrains Mono',monospace; margin-top:4px;">Lat ${p.lat.toFixed(6)} &nbsp; Lon ${p.lon.toFixed(6)}</div>
                     </div>
                  `, { maxWidth: 220 })
                  .addTo(mapaTriagem!);

               mapaTriagemMarkers.push(marker);
            }
         });

         if (coords.length > 0) {
            // Desenha a polilinha conectando os pontos e fechando no primeiro
            const coordsPolilinha = [...coords, coords[0]];
            mapaTriagemPolyline = L.polyline(coordsPolilinha, {
               color: '#00ff88',
               weight: 2,
               opacity: 0.8,
               dashArray: '5, 5'
            }).addTo(mapaTriagem);

            const bounds = L.latLngBounds(coords);
            mapaTriagem.fitBounds(bounds, { padding: [40, 40] });
         }
      };

      const btnTriagem = document.getElementById('btn-triagem-txt');
      const modalTriagem = document.getElementById('modal-triagem');
      const btnFecharTriagem = document.getElementById('btn-fechar-modal-triagem');

      const dropZone = document.getElementById('drop-zone-triagem');
      const inputFile = document.getElementById('input-file-triagem') as HTMLInputElement;
      const labelUpload = document.getElementById('label-upload-triagem');
      const iconUpload = document.getElementById('icon-upload-triagem');

      const selectFuso = document.getElementById('select-fuso-triagem') as HTMLSelectElement;
      const chkInverterNE = document.getElementById('chk-inverter-ne') as HTMLInputElement;
      const btnProcessar = document.getElementById('btn-processar-triagem');
      const countPontos = document.getElementById('count-pontos-triagem');
      const tagLayout = document.getElementById('tag-layout-triagem');
      const listaPontos = document.getElementById('lista-pontos-triagem');

      const selectDestino = document.getElementById('select-destino-triagem') as HTMLSelectElement;
      const selectMatricula = document.getElementById('select-matricula-triagem') as HTMLSelectElement;
      const selectBase = document.getElementById('select-base-triagem') as HTMLSelectElement;
      const btnSalvarAssociacao = document.getElementById('btn-salvar-associacao-triagem') as HTMLButtonElement;

      const atualizarBotaoImportar = () => {
         if (btnSalvarAssociacao) {
            const temPontos = pontosProcessadosTriagem.length > 0;
            const temDestino = selectDestino && selectDestino.value !== '';
            btnSalvarAssociacao.disabled = !(temPontos && temDestino);
         }
      };

      // Abrir Modal de Triagem
      btnTriagem?.addEventListener('click', () => {
         modalTriagem?.classList.remove('hidden');

         // Inicializa o mapa do Leaflet
         setTimeout(() => {
            initMapaTriagem();
            if (mapaTriagem) {
               mapaTriagem.invalidateSize();
            }
         }, 100);

         // Preencher o select de levantamento destino com levantamentos ativos
         if (selectDestino) {
            selectDestino.innerHTML = '<option value="">Selecione o levantamento de destino...</option>' +
               levantamentosList
                  .filter(l => l.status === 'EM_ANDAMENTO')
                  .map(l => `<option value="${l.id}">${l.nome_propriedade} (${l.municipio}/${l.uf})</option>`)
                  .join('');
         }

         // Resetar selects dependentes
         if (selectMatricula) {
            selectMatricula.innerHTML = '<option value="">Selecione o levantamento...</option>';
            selectMatricula.disabled = true;
         }
         if (selectBase) {
            selectBase.innerHTML = '<option value="">Selecione o levantamento...</option>';
            selectBase.disabled = true;
         }
         if (btnSalvarAssociacao) {
            btnSalvarAssociacao.disabled = true;
         }
      });

      // Fechar modal
      btnFecharTriagem?.addEventListener('click', () => {
         modalTriagem?.classList.add('hidden');
         limparMapaTriagem();
         if (mapaTriagem) {
            mapaTriagem.remove();
            mapaTriagem = null;
         }
         // Resetar estado
         arquivoSelecionadoTriagem = null;
         pontosProcessadosTriagem = [];
         if (labelUpload) labelUpload.innerText = 'Arraste ou clique para selecionar arquivo .txt';
         if (iconUpload) iconUpload.setAttribute('class', 'w-6 h-6 text-white/20 mx-auto mb-1');
         if (countPontos) countPontos.innerText = '0';
         if (tagLayout) tagLayout.classList.add('hidden');
         if (listaPontos) listaPontos.innerHTML = '<div class="text-white/20 italic text-center py-4">Nenhum arquivo carregado</div>';
         const placeholder = document.getElementById('placeholder-mapa-triagem');
         if (placeholder) placeholder.classList.remove('hidden');
      });

      // Drag and Drop
      dropZone?.addEventListener('click', () => inputFile?.click());
      dropZone?.addEventListener('dragover', (e) => {
         e.preventDefault();
         dropZone.classList.add('border-mint-vibrant/60', 'bg-mint-vibrant/5');
      });
      dropZone?.addEventListener('dragleave', () => {
         dropZone.classList.remove('border-mint-vibrant/60', 'bg-mint-vibrant/5');
      });
      dropZone?.addEventListener('drop', (e) => {
         e.preventDefault();
         dropZone.classList.remove('border-mint-vibrant/60', 'bg-mint-vibrant/5');

         if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.txt')) {
               arquivoSelecionadoTriagem = file;
               if (labelUpload) labelUpload.innerText = `Selecionado: ${file.name}`;
               if (iconUpload) iconUpload.setAttribute('class', 'w-6 h-6 text-mint-vibrant mx-auto mb-1');
            } else {
               showToast('Apenas arquivos de extensão .txt são permitidos na triagem.', 'error');
            }
         }
      });

      inputFile?.addEventListener('change', () => {
         if (inputFile.files && inputFile.files.length > 0) {
            const file = inputFile.files[0];
            arquivoSelecionadoTriagem = file;
            if (labelUpload) labelUpload.innerText = `Selecionado: ${file.name}`;
            if (iconUpload) iconUpload.setAttribute('class', 'w-6 h-6 text-mint-vibrant mx-auto mb-1');
         }
      });

      // Enviar arquivo para processamento temporário
      btnProcessar?.addEventListener('click', async () => {
         if (!arquivoSelecionadoTriagem) {
            showToast('Por favor, selecione ou arraste um arquivo de pontos (.txt) primeiro.', 'error');
            return;
         }

         const fuso = selectFuso.value;
         const inverterNE = chkInverterNE?.checked ? 'true' : 'false';
         const formData = new FormData();
         formData.append('file', arquivoSelecionadoTriagem);
         formData.append('fuso_utm', fuso);
         formData.append('inverter_ne', inverterNE);

         try {
            btnProcessar.innerHTML = '<i class="animate-spin mr-1">🔄</i> Processando...';
            (btnProcessar as HTMLButtonElement).disabled = true;

            const res = await fetch(`${API_BASE}/pontos/analisar-txt`, {
               method: 'POST',
               body: formData
            });

            const data = await res.json();
            if (!res.ok) {
               throw new Error(data.detail || 'Erro ao processar arquivo.');
            }

            if (data.error) {
               throw new Error(data.error);
            }

            pontosProcessadosTriagem = data.pontos || [];
            layoutDetectadoTriagem = data.layout_detectado || 'DESCONHECIDO';

            if (countPontos) countPontos.innerText = pontosProcessadosTriagem.length.toString();
            if (tagLayout) {
               tagLayout.innerText = layoutDetectadoTriagem;
               tagLayout.classList.remove('hidden');
            }

            // Renderizar na lista do painel
            if (listaPontos) {
               if (pontosProcessadosTriagem.length === 0) {
                  listaPontos.innerHTML = '<div class="text-white/20 italic text-center py-4">Nenhum ponto válido processado</div>';
               } else {
                  listaPontos.innerHTML = pontosProcessadosTriagem.map((p) => `
                     <div class="py-1 px-1 flex justify-between items-center hover:bg-white/5 transition-colors">
                        <span class="font-bold text-white">${p.nome}</span>
                        <span class="text-white/40 text-[9px]">N: ${p.norte.toFixed(1)} E: ${p.este.toFixed(1)}</span>
                     </div>
                  `).join('');
               }
            }

            // Plotar no Mapa
            plotarPontosNoMapaTriagem(pontosProcessadosTriagem);

            // Ativa o botão de associação se já houver levantamento destino
            atualizarBotaoImportar();

         } catch (err: any) {
            console.error(err);
            alert(`Falha no processamento: ${err.message}`);
         } finally {
            if (btnProcessar) {
               btnProcessar.innerHTML = 'Processar';
               (btnProcessar as HTMLButtonElement).disabled = false;
               initIcons();
            }
         }
      });

      // Monitorar troca do Levantamento Destino
      selectDestino?.addEventListener('change', async () => {
         const levId = selectDestino.value;
         if (!levId) {
            if (selectMatricula) {
               selectMatricula.innerHTML = '<option value="">Selecione o levantamento...</option>';
               selectMatricula.disabled = true;
            }
            if (selectBase) {
               selectBase.innerHTML = '<option value="">Selecione o levantamento...</option>';
               selectBase.disabled = true;
            }
            atualizarBotaoImportar();
            return;
         }

         try {
            // 1. Carregar Matrículas
            if (selectMatricula) {
               selectMatricula.innerHTML = '<option value="">Carregando...</option>';
            }
            const resMat = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas`);
            const matriculas = await resMat.json();
            if (selectMatricula) {
               if (matriculas.length === 0) {
                  selectMatricula.innerHTML = '<option value="">Sem matrículas vinculadas</option>';
                  selectMatricula.disabled = true;
               } else {
                  selectMatricula.innerHTML = '<option value="">[Geral - Sem Matrícula]</option>' +
                     matriculas.map((m: any) => `<option value="${m.id}">Matrícula: ${m.numero_matricula} (${m.area_ha.toFixed(2)} Ha)</option>`).join('');
                  selectMatricula.disabled = false;
               }
            }

            // 2. Carregar Bases de Campo do Levantamento
            if (selectBase) {
               selectBase.innerHTML = '<option value="">Carregando...</option>';
            }
            const resPts = await fetch(`${API_BASE}/levantamentos/${levId}/pontos`);
            const pontos = await resPts.json();
            if (selectBase) {
               const bases = pontos.filter((p: any) => p.tipo_ponto === 'M' || p.nome_vertice.toUpperCase().includes('BASE') || p.tipo_ponto === 'B');
               if (bases.length === 0) {
                  selectBase.innerHTML = '<option value="">[Sem Bases]</option>';
                  selectBase.disabled = true;
               } else {
                  selectBase.innerHTML = '<option value="">[Nenhuma Base / Autodetectar]</option>' +
                     bases.map((p: any) => `<option value="${p.id}">Base: ${p.nome_vertice}</option>`).join('');
                  selectBase.disabled = false;
               }
            }

            atualizarBotaoImportar();

         } catch (e) {
            console.error("Erro ao carregar dados do levantamento destino:", e);
            if (selectMatricula) selectMatricula.innerHTML = '<option value="">Erro ao carregar</option>';
            if (selectBase) selectBase.innerHTML = '<option value="">Erro ao carregar</option>';
         }
      });

      // Confirmar Associação e Importar Oficialmente no Levantamento de Destino
      btnSalvarAssociacao?.addEventListener('click', async () => {
         const levId = selectDestino.value;
         if (!levId || !arquivoSelecionadoTriagem) return;

         if (!confirm('Confirmar importação oficial deste arquivo no levantamento selecionado? Os segmentos e polilinha perimetral correspondentes serão recalculados no destino.')) {
            return;
         }

         const formData = new FormData();
         formData.append('file', arquivoSelecionadoTriagem);

         const inverterNE = chkInverterNE?.checked ? 'true' : 'false';
         formData.append('inverter_ne', inverterNE);

         const matriculaVal = selectMatricula.value;
         if (matriculaVal) {
            formData.append('matricula_id', matriculaVal);
         }

         const baseVal = selectBase.value;
         if (baseVal && !selectBase.disabled) {
            formData.append('base_escolhida_id', baseVal);
         }

         try {
            btnSalvarAssociacao.innerHTML = '<i class="animate-spin mr-1">🔄</i> Importando...';
            btnSalvarAssociacao.disabled = true;

            const res = await fetch(`${API_BASE}/levantamentos/${levId}/importar-txt`, {
               method: 'POST',
               body: formData
            });

            const data = await res.json();
            if (!res.ok) {
               const errorMsg = typeof data.detail === 'object' ? (data.detail.mensagem || JSON.stringify(data.detail)) : (data.detail || data.error || 'Erro na importação.');
               throw new Error(errorMsg);
            }

            if (data.error) {
               throw new Error(data.error);
            }

            showToast(data.message || 'Pontos e topologia importados com sucesso no levantamento de destino!', 'success');

            // Fechar modal de triagem
            btnFecharTriagem?.click();

            // Recarregar lista de levantamentos na tela principal
            loadLevantamentos();

         } catch (e: any) {
            console.error(e);
            alert(`Falha ao importar no levantamento: ${e.message}`);
         } finally {
            if (btnSalvarAssociacao) {
               btnSalvarAssociacao.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> Confirmar e Importar';
               btnSalvarAssociacao.disabled = false;
               initIcons();
            }
         }
      });

      loadLevantamentos();
      configurarComboboxPropriedades();
      loadProfissionais();
   },
   cleanup: () => {
      if (clickOutsideHandler) {
         document.removeEventListener('click', clickOutsideHandler);
         clickOutsideHandler = null;
      }
   }
};
