import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons } from '../utils';

export const levantamentosRoute: RouteDef = {
  render: () => `
    <div class="space-y-6 animate-in fade-in duration-300">
      <!-- LISTA DE LEVANTAMENTOS -->
      <div id="painel-lista-projetos" class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-3xl font-bold">Mesa de Levantamentos</h2>
            <p class="text-white/40 mt-1">Selecione um projeto de georreferenciamento ativo para iniciar a triagem espacial.</p>
          </div>
          <div class="flex gap-4">
             <input type="text" placeholder="Buscar levantamento..." class="glass-input text-xs w-64" id="busca-levantamento" />
             <button class="btn-primary text-xs flex items-center gap-1.5" id="btn-novo-lev">
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

       grid.innerHTML = lista.map((l: any) => {
          const proprietarios = l.clientes && l.clientes.length 
              ? l.clientes.map((c: any) => `${c.nome_completo} (${(c.percentual_participacao || 0).toFixed(0)}%)`).join(', ') 
              : 'Sem proprietário vinculado';

          return `
            <div class="glass-card p-6 flex flex-col justify-between hover:border-mint-vibrant/20 transition-colors group lev-card-item" data-id="${l.id}">
              <div>
                <div class="flex justify-between items-start mb-4">
                  <span class="text-[9px] bg-white/5 px-2 py-0.5 rounded text-white/40 font-mono">LEV_ID: #${l.id}</span>
                  <span class="text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase ${l.status === 'CONCLUIDO' ? 'bg-mint-vibrant/15 text-mint-vibrant' : l.status === 'ARQUIVADO' ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'}">${l.status}</span>
                </div>
                <h4 class="font-bold text-base text-white group-hover:text-mint-vibrant transition-colors prop-title-text">${l.nome_propriedade}</h4>
                <p class="text-xs text-white/40 mt-1">Data Início: ${l.data_inicio}</p>
                <p class="text-xs text-white/60 mt-2 truncate font-medium">Proprietários: <span class="text-white/40 prop-owners-text">${proprietarios}</span></p>
                <p class="text-[10px] text-white/30 font-mono mt-3 uppercase tracking-wider">${l.total_pontos || 0} Pontos Medidos • ${l.total_segmentos || 0} Divisas</p>
                <p class="text-[9px] text-white/20 font-mono mt-1 truncate prop-extra-text">CAR: ${l.codigo_car || 'N/I'} • CCIR: ${l.codigo_ccir || 'N/I'} • MUNICÍPIO: ${l.municipio || 'N/I'}</p>
              </div>
              <div class="flex gap-2 mt-6 border-t border-white/5 pt-4">
                <button class="btn-primary text-xs py-1.5 px-4 flex-1 btn-auditar" data-id="${l.id}">
                  <i data-lucide="play" class="w-3.5 h-3.5"></i>
                  Auditar & Triar
                </button>
                <button class="btn-secondary text-white/40 hover:text-mint-vibrant px-2.5 py-1.5 btn-editar-lev" data-id="${l.id}" title="Editar Levantamento">
                  <i data-lucide="edit" class="w-4 h-4"></i>
                </button>
                <button class="btn-secondary text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 btn-excluir-lev" data-id="${l.id}">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
          `;
       }).join('');

       initIcons();

       // Eventos nos botões da lista
       document.querySelectorAll('.btn-auditar').forEach(btn => {
         btn.addEventListener('click', () => {
           const id = parseInt(btn.getAttribute('data-id') || '0');
           localStorage.setItem('active_levantamento_id', id.toString());
           window.location.hash = '#mesa_trabalho';
         });
       });

       document.querySelectorAll('.btn-editar-lev').forEach(btn => {
         btn.addEventListener('click', async () => {
            const id = parseInt(btn.getAttribute('data-id') || '0');
            const l = levantamentosList.find(x => x.id === id);
            if (!l) return;
            
            editandoLevId = id;

            try {
               const res = await fetch(`${API_BASE}/propriedades`);
               globalPropriedadesList = await res.json();
            } catch(err) {
               console.error("Erro ao carregar propriedades na edição:", err);
            }
            
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
            if (inputBusca && propObj) {
               inputBusca.value = `${propObj.nome_propriedade} (${propObj.municipio}/${propObj.uf})`;
            } else if (inputBusca) {
               inputBusca.value = l.nome_propriedade || '';
            }
            if (inputHidden) inputHidden.value = l.propriedade_id.toString();
            if (selectProf) selectProf.value = l.profissional_id.toString();
            if (inputData) inputData.value = l.data_inicio;
            if (selectStatus) selectStatus.value = l.status;
            if (containerStatus) containerStatus.classList.remove('hidden');
            
            document.getElementById('modal-levantamento')?.classList.remove('hidden');
         });
       });

       document.querySelectorAll('.btn-excluir-lev').forEach(btn => {
         btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (confirm('Deseja apagar também a pasta física (Workspace) de arquivos associada a este levantamento?\n\nOK: Apagar registro + Pasta física\nCancelar: Cancelar exclusão')) {
              await fetch(`${API_BASE}/levantamentos/${id}?apagar_arquivos=true`, { method: 'DELETE' });
              loadLevantamentos();
            }
         });
       });
    };

    document.getElementById('busca-levantamento')?.addEventListener('input', (e) => {
       const term = (e.target as HTMLInputElement).value.toLowerCase();
       document.querySelectorAll('.lev-card-item').forEach(el => {
          const propTitle = el.querySelector('.prop-title-text')?.textContent?.toLowerCase() || '';
          const owners = el.querySelector('.prop-owners-text')?.textContent?.toLowerCase() || '';
          const extra = el.querySelector('.prop-extra-text')?.textContent?.toLowerCase() || '';
          const match = propTitle.includes(term) || owners.includes(term) || extra.includes(term);
          (el as HTMLElement).style.display = match ? 'flex' : 'none';
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
