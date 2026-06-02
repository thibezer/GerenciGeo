import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons } from '../utils';

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
          <div class="flex flex-wrap gap-3 items-center">
             <!-- Alternador de Modos de Visualização -->
             <div class="flex gap-0.5 bg-white/5 p-1 rounded-lg border border-white/5 shrink-0" id="lev-view-toggle">
                <button class="p-1.5 rounded transition-all" id="btn-mode-grid" title="Visualização em Cards">
                   <i data-lucide="layout-grid" class="w-4 h-4"></i>
                </button>
                <button class="p-1.5 rounded transition-all" id="btn-mode-list" title="Visualização em Lista (Windows Explorer)">
                   <i data-lucide="list" class="w-4 h-4"></i>
                </button>
             </div>
             <input type="text" placeholder="Buscar levantamento..." class="glass-input text-xs w-56 md:w-64" id="busca-levantamento" />
             <button class="btn-primary text-xs flex items-center gap-1.5 shrink-0" id="btn-novo-lev">
               <i data-lucide="plus" class="w-4 h-4"></i>
               Novo Levantamento
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
                  <input type="text" id="input-lev-prop-busca" placeholder="Digite para buscar propriedade..." class="glass-input w-full text-xs py-2 pr-8" autocomplete="off" required />
                  <input type="hidden" id="select-lev-propriedade" required />
                  <div id="lista-flutuante-propriedades" class="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#0a100d] border border-white/10 rounded-technical shadow-2xl z-50 hidden divide-y divide-white/5">
                     <!-- Opções renderizadas dinamicamente -->
                  </div>
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Responsável Técnico *</label>
                  <select id="select-lev-profissional" required class="glass-input w-full text-xs py-2">
                     <option value="1">Dr. Thiago A. Silva (INCRA Credenciado)</option>
                  </select>
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Data de Início *</label>
                  <input type="date" id="input-lev-data" required class="glass-input w-full text-sm py-2" />
               </div>
               <div id="container-lev-status" class="hidden">
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Status *</label>
                  <select id="select-lev-status" class="glass-input w-full text-xs py-2">
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

      document.addEventListener('click', (e) => {
        if (!inputBusca.contains(e.target as Node) && !listaFlutuante.contains(e.target as Node)) {
          listaFlutuante.classList.add('hidden');
        }
      });
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
                      <div class="flex items-center gap-1.5"><span class="text-blue-400 font-bold shrink-0">CCIR:</span> <span class="truncate" title="${l.codigo_ccir || 'Não Informado'}">${l.codigo_ccir || 'Não Informado'}</span></div>
                      <div class="flex items-center gap-1.5"><span class="text-white/60 font-bold shrink-0">MUNICÍPIO:</span> <span>${l.municipio || 'Não Informado'}/${l.uf}</span></div>
                   </div>
                 </div>
                 
                 <div class="flex gap-2 mt-3.5 border-t border-white/5 pt-2.5">
                   <button class="btn-primary text-xs py-1.5 px-3 flex-1 btn-auditar" data-id="${l.id}">
                     <i data-lucide="play" class="w-3.5 h-3.5"></i>
                     Auditar & Triar
                   </button>
                   <button class="btn-secondary text-white/40 hover:text-mint-vibrant px-2 py-1.5 btn-editar-lev" data-id="${l.id}" title="Editar Levantamento">
                     <i data-lucide="edit" class="w-4 h-4"></i>
                   </button>
                   <button class="btn-secondary text-red-400 hover:bg-red-500/10 px-2 py-1.5 btn-excluir-lev" data-id="${l.id}">
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
                                 <span class="block text-[9px] text-white/20 mt-0.5 truncate font-mono">CAR: ${l.codigo_car || 'N/I'} • CCIR: ${l.codigo_ccir || 'N/I'}</span>
                              </td>
                              <td class="px-4 py-3">
                                 <span class="text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase ${l.status === 'CONCLUIDO' ? 'bg-mint-vibrant/15 text-mint-vibrant' : l.status === 'ARQUIVADO' ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'}">${l.status.replace('_', ' ')}</span>
                              </td>
                              <td class="px-4 py-3 text-white/60 font-mono">${l.data_inicio}</td>
                              <td class="px-4 py-3 text-white/40 truncate max-w-xs" title="${proprietarios}">${proprietarios}</td>
                              <td class="px-4 py-3 text-white/40 font-mono uppercase">${l.total_pontos || 0} pts • ${l.total_segmentos || 0} div</td>
                              <td class="px-4 py-3">
                                 <div class="flex items-center justify-center gap-1.5">
                                    <button class="text-mint-vibrant hover:bg-mint-vibrant/20 p-1 rounded btn-auditar-icon" data-id="${l.id}" title="Auditar & Triar">
                                       <i data-lucide="play" class="w-3.5 h-3.5"></i>
                                    </button>
                                    <button class="text-white/40 hover:text-mint-vibrant p-1 rounded btn-editar-lev" data-id="${l.id}" title="Editar">
                                       <i data-lucide="edit" class="w-3.5 h-3.5"></i>
                                    </button>
                                    <button class="text-red-400 hover:bg-red-500/10 p-1 rounded btn-excluir-lev" data-id="${l.id}" title="Excluir">
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
         const btn = target.closest('.btn-auditar, .btn-auditar-icon, .btn-auditar-link, .btn-editar-lev, .btn-excluir-lev') as HTMLElement;
         if (!btn) return;

         const id = parseInt(btn.getAttribute('data-id') || '0');
         
         if (btn.classList.contains('btn-auditar') || btn.classList.contains('btn-auditar-icon') || btn.classList.contains('btn-auditar-link')) {
            localStorage.setItem('active_levantamento_id', id.toString());
            window.location.hash = '#mesa_trabalho';
         } else if (btn.classList.contains('btn-editar-lev')) {
            (async () => {
              const l = levantamentosList.find(x => x.id === id);
              if (!l) return;
              editandoLevId = id;
              try {
                 const res = await fetch(`${API_BASE}/propriedades`);
                 globalPropriedadesList = await res.json();
              } catch(err) { console.error("Erro:", err); }
              
              const modalTitulo = document.getElementById('modal-lev-titulo');
              if (modalTitulo) modalTitulo.innerText = "Editar Levantamento";
              const submitBtn = document.getElementById('btn-submit-lev');
              if (submitBtn) submitBtn.innerText = "Salvar Alterações";
              
              const inputBusca = document.getElementById('input-lev-prop-busca') as HTMLInputElement;
              const inputHidden = document.getElementById('select-lev-propriedade') as HTMLInputElement;
              const selectProf = document.getElementById('select-lev-profissional') as HTMLSelectElement;
              const inputData = document.getElementById('input-lev-data') as HTMLInputElement;
              const selectStatus = document.getElementById('select-lev-status') as HTMLSelectElement;
              const containerStatus = document.getElementById('container-lev-status');
              
              const propObj = globalPropriedadesList.find(p => p.id === l.propriedade_id);
              if (inputBusca && propObj) inputBusca.value = `${propObj.nome_propriedade} (${propObj.municipio}/${propObj.uf})`;
              if (inputHidden) inputHidden.value = l.propriedade_id.toString();
              if (selectProf) selectProf.value = l.profissional_id.toString();
              if (inputData) inputData.value = l.data_inicio;
              if (selectStatus) selectStatus.value = l.status;
              if (containerStatus) containerStatus.classList.remove('hidden');
              document.getElementById('modal-levantamento')?.classList.remove('hidden');
            })();
         } else if (btn.classList.contains('btn-excluir-lev')) {
             (async () => {
              if (confirm('Deseja apagar também a pasta física (Workspace) de arquivos associada a este levantamento?\n\nOK: Apagar registro + Pasta física\nCancelar: Cancelar exclusão')) {
                 await fetch(`${API_BASE}/levantamentos/${id}?apagar_arquivos=true`, { method: 'DELETE' });
                 loadLevantamentos();
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
       
       if (inputData) {
          inputData.value = new Date().toISOString().split('T')[0];
       }
       if (inputBusca) inputBusca.value = '';
       if (inputHidden) inputHidden.value = '';
       
       try {
          const res = await fetch(`${API_BASE}/propriedades`);
          globalPropriedadesList = await res.json();
          if (globalPropriedadesList.length === 0) {
             alert("Cadastre uma propriedade no módulo de Propriedades primeiro!");
             return;
          }
          modalLev?.classList.remove('hidden');
       } catch(e) {
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
        
        const payload: any = { propriedade_id, profissional_id: profesional_id, data_inicio };
        
        if (editandoLevId) {
           const selectStatus = document.getElementById('select-lev-status') as HTMLSelectElement;
           payload.status = selectStatus.value;
        }
        
        try {
           const url = editandoLevId ? `${API_BASE}/levantamentos/${editandoLevId}` : `${API_BASE}/levantamentos`;
           const method = editandoLevId ? 'PUT' : 'POST';
           
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
        } catch(e) {
           alert("Erro ao salvar levantamento.");
        }
     });
 
     loadLevantamentos();
     configurarComboboxPropriedades();
  }
};
