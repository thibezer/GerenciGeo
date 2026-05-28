import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, formatarCAR, formatarCCIR } from '../utils';

export const propriedadesRoute: RouteDef = {
  render: () => `
    <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-3xl font-bold">Propriedades</h2>
          <p class="text-white/40 mt-1">Gestão Fundiária Avançada: Documentação Técnica de Alta Fidelidade.</p>
        </div>
        <div class="flex gap-3">
          <button class="btn-primary" id="btn-abrir-modal-propriedade">
             <i data-lucide="plus" class="w-4 h-4"></i>
             Nova Propriedade
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <!-- PAINEL LATERAL: LISTA DE PROPRIEDADES -->
        <div class="glass-card p-6 col-span-1 lg:col-span-1" id="dash-propriedades">
           <div class="flex justify-between items-center mb-4">
              <h4 class="font-bold text-sm">Cadastradas</h4>
              <span class="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-white/60" id="total-prop-count">0</span>
           </div>
           <div class="mb-4">
              <input type="text" placeholder="Buscar propriedade..." class="glass-input w-full text-sm" id="busca-propriedade" />
           </div>
           <div id="lista-propriedades" class="space-y-2 max-h-[500px] overflow-y-auto pr-2">Carregando propriedades...</div>
        </div>
        
        <!-- PAINEL PRINCIPAL: DETALHE DA PROPRIEDADE -->
        <div class="col-span-1 lg:col-span-3 space-y-6 hidden" id="propriedade-detalhe">
           <div class="glass-card p-0 overflow-hidden border-mint-vibrant/20 border">
              <div class="flex justify-between items-center pr-6 bg-white/[0.02]">
                 <div class="flex border-b border-white/5">
                    <button class="px-6 py-3 text-sm font-bold border-b-2 border-mint-vibrant text-mint-vibrant prop-tab-btn" data-tab="tab-prop-dados">Dados Gerais</button>
                    <button class="px-6 py-3 text-sm font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors prop-tab-btn" data-tab="tab-prop-proprietarios">Proprietários</button>
                    <button class="px-6 py-3 text-sm font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors prop-tab-btn" data-tab="tab-prop-matriculas">Matrículas</button>
                 </div>
                 <div class="flex gap-2">
                    <button class="text-white/40 hover:text-mint-vibrant transition-colors p-2" id="btn-editar-propriedade" title="Editar Propriedade">
                        <i data-lucide="edit" class="w-4 h-4"></i>
                     </button>
                     <button class="text-white/40 hover:text-red-400 transition-colors p-2" id="btn-excluir-propriedade" title="Excluir Propriedade">
                       <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                 </div>
              </div>
              
              <div class="p-6">
                 <!-- TAB 1: DADOS GERAIS E ANEXOS -->
                 <div id="tab-prop-dados" class="prop-tab-content space-y-6">
                    <div class="grid grid-cols-2 gap-6">
                       <div>
                          <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Nome do Imóvel Rural</p>
                          <p class="text-base font-bold text-white mt-0.5" id="lbl-prop-nome">-</p>
                       </div>
                       <div>
                          <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Município / UF</p>
                          <p class="text-sm font-medium text-white/80 mt-0.5" id="lbl-prop-localidade">-</p>
                       </div>
                       <div>
                          <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Código do CAR</p>
                          <p class="text-sm font-mono text-mint-vibrant mt-0.5" id="lbl-prop-car">-</p>
                       </div>
                       <div>
                          <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Código do CCIR</p>
                          <p class="text-sm font-mono text-blue-400 mt-0.5" id="lbl-prop-ccir">-</p>
                       </div>
                    </div>

                    <!-- MESA DE ANEXOS FÍSICOS (CAR & CCIR) -->
                    <div class="border-t border-white/5 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                       <!-- Bloco CAR -->
                       <div class="flex flex-col bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-3">
                          <div class="flex justify-between items-center">
                             <span class="text-[10px] font-mono font-bold text-mint-vibrant bg-mint-vibrant/10 px-2.5 py-0.5 rounded border border-mint-vibrant/20">DOCUMENTO DO CAR</span>
                          </div>
                          
                          <!-- Área de Upload do CAR -->
                          <div class="border-2 border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-lg p-4 text-center cursor-pointer transition-colors flex flex-col justify-center items-center py-6 group relative" id="dropzone-car">
                             <input type="file" id="input-file-car" class="hidden" accept=".pdf,.png,.jpg,.jpeg" />
                             <i data-lucide="upload" class="w-6 h-6 text-white/40 group-hover:text-mint-vibrant group-hover:scale-110 transition-all mb-2"></i>
                             <p class="text-[11px] font-bold">Ingestão do arquivo do CAR</p>
                             <p class="text-[9px] text-white/30 uppercase mt-0.5">Arraste ou clique para enviar</p>
                          </div>

                          <div class="hidden flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/5 rounded-technical text-xs" id="container-anexo-car">
                             <div class="min-w-0 flex-1 flex items-center gap-2">
                                <i data-lucide="file-text" class="w-4 h-4 text-mint-vibrant shrink-0"></i>
                                <span class="truncate font-mono" id="txt-anexo-car-nome">Arquivo</span>
                             </div>
                             <div class="flex gap-1">
                                <button class="text-mint-vibrant hover:text-white p-1 hover:bg-mint-vibrant/20 rounded transition-all shrink-0" id="btn-download-car" title="Download">
                                   <i data-lucide="download" class="w-3.5 h-3.5"></i>
                                </button>
                             </div>
                          </div>
                       </div>

                       <!-- Bloco CCIR -->
                       <div class="flex flex-col bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-3">
                          <div class="flex justify-between items-center">
                             <span class="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded border border-blue-500/20">DOCUMENTO DO CCIR</span>
                          </div>
                          
                          <!-- Área de Upload do CCIR -->
                          <div class="border-2 border-dashed border-white/10 hover:border-blue-500/40 rounded-lg p-4 text-center cursor-pointer transition-colors flex flex-col justify-center items-center py-6 group relative" id="dropzone-ccir">
                             <input type="file" id="input-file-ccir" class="hidden" accept=".pdf,.png,.jpg,.jpeg" />
                             <i data-lucide="upload" class="w-6 h-6 text-white/40 group-hover:text-blue-400 group-hover:scale-110 transition-all mb-2"></i>
                             <p class="text-[11px] font-bold">Ingestão do arquivo do CCIR</p>
                             <p class="text-[9px] text-white/30 uppercase mt-0.5">Arraste ou clique para enviar</p>
                          </div>

                          <div class="hidden flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/5 rounded-technical text-xs" id="container-anexo-ccir">
                             <div class="min-w-0 flex-1 flex items-center gap-2">
                                <i data-lucide="file-text" class="w-4 h-4 text-blue-400 shrink-0"></i>
                                <span class="truncate font-mono" id="txt-anexo-ccir-nome">Arquivo</span>
                             </div>
                             <div class="flex gap-1">
                                <button class="text-blue-400 hover:text-white p-1 hover:bg-blue-500/20 rounded transition-all shrink-0" id="btn-download-ccir" title="Download">
                                   <i data-lucide="download" class="w-3.5 h-3.5"></i>
                                </button>
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>
                 
                 <!-- TAB 2: PROPRIETÁRIOS VINCULADOS -->
                 <div id="tab-prop-proprietarios" class="prop-tab-content hidden space-y-6">
                    <!-- Formulário de vínculo de proprietário -->
                    <div class="bg-white/[0.01] border border-white/5 p-4 rounded-xl space-y-4">
                       <h5 class="text-xs font-bold text-mint-vibrant flex items-center gap-1.5">
                          <i data-lucide="plus" class="w-4 h-4"></i>
                          Vincular Novo Proprietário
                       </h5>
                       <form id="form-vincular-proprietario" class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                          <div class="relative">
                             <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Buscar Cliente</label>
                             <input type="text" id="busca-proprietario-cliente" placeholder="Digite para buscar..." class="glass-input w-full text-xs py-2 pr-8" autocomplete="off" required />
                             <input type="hidden" id="vinc-cliente-id" required />
                             <div id="lista-vinc-clientes" class="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-[#0a100d] border border-white/10 rounded-technical shadow-2xl z-50 hidden divide-y divide-white/5">
                                <!-- Clientes listados dinamicamente -->
                             </div>
                          </div>
                          <div>
                             <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Participação (%)</label>
                             <input type="number" id="vinc-participacao" min="0.01" max="100" step="0.01" placeholder="Ex: 50.00" required class="glass-input w-full text-xs py-2" />
                          </div>
                          <button type="submit" class="btn-primary py-2.5 text-xs font-bold w-full">Vincular Proprietário</button>
                       </form>
                       <p class="text-[10px] text-white/30 font-mono mt-1 uppercase">Quota Restante Disponível: <span class="text-mint-vibrant font-bold" id="lbl-quota-restante">100.00%</span></p>
                    </div>

                    <!-- Tabela de Proprietários -->
                    <div class="bg-white/5 rounded-technical overflow-hidden border border-white/5">
                       <table class="w-full text-left text-sm border-collapse">
                          <thead>
                             <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/40 border-b border-white/5">
                                <th class="px-4 py-3">Proprietário</th>
                                <th class="px-4 py-3">CPF/CNPJ</th>
                                <th class="px-4 py-3 text-right">Participação</th>
                                <th class="px-4 py-3 text-center w-16">Ação</th>
                             </tr>
                          </thead>
                          <tbody id="tbl-prop-proprietarios-corpo" class="divide-y divide-white/5 text-xs text-white/80">
                             <tr>
                                <td colspan="4" class="text-center py-6 text-white/30 italic">Nenhum proprietário atrelado a esta propriedade.</td>
                             </tr>
                          </tbody>
                       </table>
                    </div>
                 </div>

                 <!-- TAB 3: MATRÍCULAS VINCULADAS -->
                 <div id="tab-prop-matriculas" class="prop-tab-content hidden space-y-6">
                    <!-- Formulário de cadastro de matrícula -->
                    <div class="bg-white/[0.01] border border-white/5 p-4 rounded-xl space-y-4">
                       <h5 class="text-xs font-bold text-mint-vibrant flex items-center gap-1.5">
                          <i data-lucide="plus" class="w-4 h-4"></i>
                          Cadastrar Nova Matrícula
                       </h5>
                       <form id="form-cadastrar-matricula-prop" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                          <div>
                             <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Número da Matrícula *</label>
                             <input type="text" id="input-new-mat-numero" required placeholder="Ex: 12.345" class="glass-input w-full text-xs py-2 font-mono" />
                          </div>
                          <div>
                             <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Área (Hectares) *</label>
                             <input type="number" step="0.0001" id="input-new-mat-area" required placeholder="Ex: 45.1234" class="glass-input w-full text-xs py-2 font-mono" />
                          </div>
                          <div>
                             <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Código CCIR</label>
                             <input type="text" id="input-new-mat-ccir" placeholder="Ex: 950.082.012.345-6" class="glass-input w-full text-xs py-2 font-mono" />
                          </div>
                          <div>
                             <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Código ITR / NIRF</label>
                             <input type="text" id="input-new-mat-itr" placeholder="Ex: 1.234.567-8" class="glass-input w-full text-xs py-2 font-mono" />
                          </div>
                          <div class="md:col-span-4 flex justify-end">
                             <button type="submit" class="btn-primary py-2.5 px-6 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">Salvar Matrícula</button>
                          </div>
                       </form>
                    </div>

                    <!-- Tabela de Matrículas -->
                    <div class="bg-white/5 rounded-technical overflow-hidden border border-white/5">
                       <table class="w-full text-left text-sm border-collapse">
                          <thead>
                             <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/40 border-b border-white/5">
                                <th class="px-4 py-3">Número</th>
                                <th class="px-4 py-3 text-right">Área Registrada</th>
                                <th class="px-4 py-3">CCIR / ITR</th>
                                <th class="px-4 py-3 text-center w-16">Ação</th>
                             </tr>
                          </thead>
                          <tbody id="tbl-prop-matriculas-corpo" class="divide-y divide-white/5 text-xs text-white/80 font-mono">
                             <tr>
                                <td colspan="4" class="text-center py-6 text-white/30 italic font-sans">Nenhuma matrícula cadastrada para esta propriedade.</td>
                             </tr>
                          </tbody>
                       </table>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <!-- MODAL DE CADASTRO/EDIÇÃO DE PROPRIEDADE -->
      <div id="modal-propriedade" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-md">
            <div class="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
               <h3 class="text-lg font-bold flex items-center gap-2">
                  <i data-lucide="plus" class="w-5 h-5 text-mint-vibrant"></i>
                  <span id="modal-prop-titulo">Nova Propriedade</span>
               </h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal-prop">
                  <i data-lucide="x" class="w-5 h-5"></i>
               </button>
            </div>
            <form id="form-propriedade" class="p-6 space-y-4">
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nome da Propriedade *</label>
                  <input type="text" name="nome_propriedade" required class="glass-input w-full text-xs py-2" placeholder="Ex: Fazenda Três Barras" />
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Código do CAR</label>
                  <input type="text" name="codigo_car" class="glass-input w-full text-xs py-2 font-mono" placeholder="Ex: PR-4128104-58A2..." />
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Código do CCIR</label>
                  <input type="text" name="codigo_ccir" class="glass-input w-full text-xs py-2 font-mono" placeholder="Ex: 000.000.000.000-0" />
               </div>
               <div class="grid grid-cols-3 gap-3">
                  <div class="col-span-2">
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Município *</label>
                     <input type="text" name="municipio" required class="glass-input w-full text-xs py-2" placeholder="Ex: Umuarama" />
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">UF *</label>
                     <input type="text" name="uf" required maxlength="2" class="glass-input w-full text-xs py-2 uppercase" placeholder="PR" />
                  </div>
               </div>
               <div class="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button type="button" class="btn-secondary text-xs" id="btn-cancelar-prop">Cancelar</button>
                  <button type="submit" class="btn-primary text-xs" id="btn-submit-prop">Salvar Propriedade</button>
               </div>
            </form>
         </div>
      </div>
    </div>
  `,
  setup: () => {
    let propriedadeSelecionadaId: number | null = null;
    let todasPropriedades: any[] = [];
    let todosClientesList: any[] = [];

    // --- MASCARAMENTO DE INPUTS NO MODAL ---
    const inputCAR = document.querySelector('#form-propriedade [name="codigo_car"]') as HTMLInputElement;
    const inputCCIR = document.querySelector('#form-propriedade [name="codigo_ccir"]') as HTMLInputElement;
    const inputUF = document.querySelector('#form-propriedade [name="uf"]') as HTMLInputElement;

    if (inputCAR) {
      inputCAR.addEventListener('input', (e) => {
        const t = e.target as HTMLInputElement;
        t.value = formatarCAR(t.value);
      });
    }

    if (inputCCIR) {
      inputCCIR.addEventListener('input', (e) => {
        const t = e.target as HTMLInputElement;
        t.value = formatarCCIR(t.value);
      });
    }

    if (inputUF) {
      inputUF.addEventListener('input', (e) => {
        const t = e.target as HTMLInputElement;
        t.value = t.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
      });
    }

    // --- TAB LOGIC NO DETALHE ---
    document.querySelectorAll('.prop-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).getAttribute('data-tab');
        document.querySelectorAll('.prop-tab-btn').forEach(b => b.classList.replace('border-mint-vibrant', 'border-transparent'));
        document.querySelectorAll('.prop-tab-btn').forEach(b => b.classList.replace('text-mint-vibrant', 'text-white/40'));
        (e.target as HTMLElement).classList.replace('border-transparent', 'border-mint-vibrant');
        (e.target as HTMLElement).classList.replace('text-white/40', 'text-mint-vibrant');
        
        document.querySelectorAll('.prop-tab-content').forEach(tc => tc.classList.add('hidden'));
        document.getElementById(target || '')?.classList.remove('hidden');
      });
    });

    // --- MODAL CONTROLLERS ---
    const modalProp = document.getElementById('modal-propriedade');
    const formProp = document.getElementById('form-propriedade') as HTMLFormElement;

    document.getElementById('btn-abrir-modal-propriedade')?.addEventListener('click', () => {
      propriedadeSelecionadaId = null;
      if (formProp) formProp.reset();
      
      const modalTitulo = document.getElementById('modal-prop-titulo');
      if (modalTitulo) modalTitulo.innerText = "Nova Propriedade";
      
      const submitBtn = document.getElementById('btn-submit-prop');
      if (submitBtn) submitBtn.innerText = "Cadastrar Propriedade";
      
      modalProp?.classList.remove('hidden');
    });

    document.getElementById('btn-fechar-modal-prop')?.addEventListener('click', () => modalProp?.classList.add('hidden'));
    document.getElementById('btn-cancelar-prop')?.addEventListener('click', () => modalProp?.classList.add('hidden'));

    // --- BUSCA DINÂMICA DE PROPRIEDADES ---
    document.getElementById('busca-propriedade')?.addEventListener('input', (e) => {
      const term = (e.target as HTMLInputElement).value.toLowerCase();
      document.querySelectorAll('.prop-item').forEach(el => {
        const nome = el.querySelector('p')?.textContent?.toLowerCase() || '';
        const local = el.querySelector('p:last-child')?.textContent?.toLowerCase() || '';
        (el as HTMLElement).style.display = (nome.includes(term) || local.includes(term)) ? 'flex' : 'none';
      });
    });

    // --- CARREGAR CLIENTES GLOBAIS PARA VÍNCULO ---
    const loadClientesList = async () => {
      try {
        const res = await fetch(`${API_BASE}/clientes`);
        todosClientesList = await res.json();
        setupComboboxClientes();
      } catch (err) {
        console.error("Erro ao carregar clientes globais:", err);
      }
    };

    const setupComboboxClientes = () => {
      const inputBusca = document.getElementById('busca-proprietario-cliente') as HTMLInputElement;
      const inputHidden = document.getElementById('vinc-cliente-id') as HTMLInputElement;
      const listaFlutuante = document.getElementById('lista-vinc-clientes');

      if (!inputBusca || !inputHidden || !listaFlutuante) return;

      const renderOpcoes = (termo: string) => {
        const t = termo.toLowerCase();
        const filtrados = todosClientesList.filter(c => 
          c.nome_completo.toLowerCase().includes(t) ||
          c.cpf_cnpj.includes(t)
        );

        if (filtrados.length === 0) {
          listaFlutuante.innerHTML = '<div class="p-3 text-xs text-white/30 italic">Nenhum cliente localizado.</div>';
        } else {
          listaFlutuante.innerHTML = filtrados.map(c => `
            <div class="opcao-vinc-item p-3 hover:bg-mint-vibrant/10 cursor-pointer text-xs transition-colors flex flex-col" data-id="${c.id}" data-nome="${c.nome_completo}">
              <span class="font-bold text-white">${c.nome_completo}</span>
              <span class="text-[10px] text-white/40 font-mono mt-0.5">Doc: ${c.cpf_cnpj}</span>
            </div>
          `).join('');

          listaFlutuante.querySelectorAll('.opcao-vinc-item').forEach(item => {
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

    // --- CARREGAR PROPRIEDADES ---
    const loadPropriedades = () => {
      const lista = document.getElementById('lista-propriedades');
      if (!lista) return;
      lista.innerHTML = '<p class="text-sm text-white/40 text-center py-4">Carregando...</p>';

      fetch(`${API_BASE}/propriedades`)
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            lista.innerHTML = `<p class="text-xs text-red-400 p-4">${data.error}</p>`;
            return;
          }
          todasPropriedades = data;
          
          const count = document.getElementById('total-prop-count');
          if (count) count.innerText = data.length.toString();

          if (!Array.isArray(data) || data.length === 0) {
            lista.innerHTML = '<p class="text-sm text-white/40 text-center py-4">Nenhuma propriedade cadastrada.</p>';
            return;
          }

          lista.innerHTML = data.map(p => `
            <div class="p-3 bg-white/5 hover:bg-white/10 rounded-technical cursor-pointer transition-colors prop-item flex items-center gap-3" data-id="${p.id}">
              <div class="w-8 h-8 rounded-full bg-mint-vibrant/10 flex items-center justify-center text-xs font-bold text-mint-vibrant shrink-0">
                 <i data-lucide="home" class="w-4 h-4 text-mint-vibrant"></i>
              </div>
              <div class="min-w-0 flex-1">
                 <p class="text-sm font-bold text-white truncate">${p.nome_propriedade}</p>
                 <p class="text-[10px] text-white/40 truncate">${p.municipio}/${p.uf}</p>
              </div>
            </div>
          `).join('');

          initIcons();

          // Clique no item da lista
          document.querySelectorAll('.prop-item').forEach(el => {
            el.addEventListener('click', () => {
              const id = parseInt(el.getAttribute('data-id') || '0');
              exibirDetalhesPropriedade(id);
            });
          });

          // Re-clica na propriedade selecionada se ela ainda existir na nova lista
          if (propriedadeSelecionadaId) {
             const activeItem = document.querySelector(`.prop-item[data-id="${propriedadeSelecionadaId}"]`) as HTMLElement;
             if (activeItem) {
                activeItem.classList.add('bg-white/10');
             }
          }
        })
        .catch(err => {
          console.error("Erro ao buscar propriedades:", err);
          lista.innerHTML = '<p class="text-sm text-red-400 text-center py-4">Erro de conexão com o servidor.</p>';
        });
    };

    const exibirDetalhesPropriedade = (id: number) => {
      const p = todasPropriedades.find(x => x.id === id);
      if (!p) return;

      propriedadeSelecionadaId = id;
      document.getElementById('propriedade-detalhe')?.classList.remove('hidden');

      // Realce na lista lateral
      document.querySelectorAll('.prop-item').forEach(el => el.classList.remove('bg-white/10'));
      const activeItem = document.querySelector(`.prop-item[data-id="${id}"]`);
      if (activeItem) activeItem.classList.add('bg-white/10');

      // Preenchimento de labels de dados gerais
      const setVal = (elementId: string, val: string) => {
        const el = document.getElementById(elementId);
        if (el) el.innerText = val || '-';
      };

      setVal('lbl-prop-nome', p.nome_propriedade);
      setVal('lbl-prop-localidade', `${p.municipio} / ${p.uf}`);
      setVal('lbl-prop-car', p.codigo_car || 'Não Informado');
      setVal('lbl-prop-ccir', p.codigo_ccir || 'Não Informado');

      // Controle de arquivos físicos anexados
      configurarExibicaoArquivo('car', p.caminho_arquivo_car);
      configurarExibicaoArquivo('ccir', p.caminho_arquivo_ccir);

      // Renderiza proprietários e atualiza quota restante
      renderProprietariosTabela(p.clientes || []);
      loadMatriculasDaPropriedade(id);
    };

    const configurarExibicaoArquivo = (tipo: 'car' | 'ccir', caminho: string | null) => {
      const dropzone = document.getElementById(`dropzone-${tipo}`);
      const containerAnexo = document.getElementById(`container-anexo-${tipo}`);
      const textNome = document.getElementById(`txt-anexo-${tipo}-nome`);
      const btnDownload = document.getElementById(`btn-download-${tipo}`) as HTMLButtonElement;

      if (!dropzone || !containerAnexo || !textNome || !btnDownload) return;

      if (caminho) {
        dropzone.classList.add('hidden');
        containerAnexo.classList.remove('hidden');
        
        // Extrai o nome do arquivo do caminho físico
        const parts = caminho.split(/[\\/]/);
        textNome.innerText = parts[parts.length - 1];

        // Atualiza evento do botão de download
        btnDownload.onclick = () => {
          window.open(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/arquivo-${tipo}`, '_blank');
        };
      } else {
        dropzone.classList.remove('hidden');
        containerAnexo.classList.add('hidden');
        textNome.innerText = '';
      }
    };

    // --- LOGICA DE PROPRIETÁRIOS E PARTICIPAÇÃO ---
    const renderProprietariosTabela = (clientes: any[]) => {
      const corpo = document.getElementById('tbl-prop-proprietarios-corpo');
      const lblQuota = document.getElementById('lbl-quota-restante');
      if (!corpo || !lblQuota) return;

      let somaParticipacao = 0;

      if (clientes.length === 0) {
        corpo.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-6 text-white/30 italic">Nenhum proprietário atrelado a esta propriedade.</td>
          </tr>
        `;
      } else {
        corpo.innerHTML = clientes.map(c => {
          somaParticipacao += c.percentual_participacao || 0;
          return `
            <tr class="hover:bg-white/[0.01] border-b border-white/5">
               <td class="px-4 py-3 font-bold text-white">${c.nome_completo}</td>
               <td class="px-4 py-3 font-mono text-white/60">${c.cpf_cnpj}</td>
               <td class="px-4 py-3 text-right font-mono text-mint-vibrant font-bold">${(c.percentual_participacao || 0).toFixed(2)}%</td>
               <td class="px-4 py-3 text-center">
                  <button class="text-white/40 hover:text-red-400 p-1 btn-remover-vinculo" data-cli-id="${c.id}" title="Desvincular Proprietário">
                     <i data-lucide="x" class="w-4 h-4"></i>
                  </button>
               </td>
            </tr>
          `;
        }).join('');

        initIcons();

        // Eventos de exclusão do vínculo
        corpo.querySelectorAll('.btn-remover-vinculo').forEach(btn => {
          btn.addEventListener('click', async () => {
            const cliId = btn.getAttribute('data-cli-id');
            if (confirm("Tem certeza que deseja desvincular este proprietário desta propriedade?")) {
               try {
                  const res = await fetch(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/clientes/${cliId}`, { method: 'DELETE' });
                  const data = await res.json();
                  if (data.error) {
                     alert(data.error);
                  } else {
                     // Recarrega dados completos
                     const propRes = await fetch(`${API_BASE}/propriedades`);
                     todasPropriedades = await propRes.json();
                     exibirDetalhesPropriedade(propriedadeSelecionadaId!);
                  }
               } catch (err) {
                  alert("Erro de conexão ao remover vínculo.");
               }
            }
          });
        });
      }

      const quotaDisponivel = Math.max(0, 100 - somaParticipacao);
      lblQuota.innerText = `${quotaDisponivel.toFixed(2)}%`;
    };

    // --- FORM SUBMIT PROPRIEDADE ---
    document.getElementById('form-propriedade')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const payload = Object.fromEntries(formData.entries());

      try {
        const url = propriedadeSelecionadaId ? `${API_BASE}/propriedades/${propriedadeSelecionadaId}` : `${API_BASE}/propriedades`;
        const method = propriedadeSelecionadaId ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.error) {
          alert(data.error);
        } else {
          modalProp?.classList.add('hidden');
          formProp.reset();
          
          // Recarrega e foca na selecionada ou na nova
          const idDestino = propriedadeSelecionadaId || data.id;
          
          fetch(`${API_BASE}/propriedades`)
            .then(r => r.json())
            .then(propsData => {
               todasPropriedades = propsData;
               loadPropriedades();
               if (idDestino) {
                  exibirDetalhesPropriedade(idDestino);
               }
            });
        }
      } catch (err) {
        alert("Erro de conexão ao salvar propriedade.");
      }
    });

    // --- EDITAR PROPRIEDADE ---
    document.getElementById('btn-editar-propriedade')?.addEventListener('click', () => {
      if (!propriedadeSelecionadaId) return;
      const p = todasPropriedades.find(x => x.id === propriedadeSelecionadaId);
      if (!p) return;

      const modalTitulo = document.getElementById('modal-prop-titulo');
      if (modalTitulo) modalTitulo.innerText = "Editar Propriedade";
      
      const submitBtn = document.getElementById('btn-submit-prop');
      if (submitBtn) submitBtn.innerText = "Salvar Alterações";

      const setFormVal = (name: string, val: string) => {
        const input = formProp.querySelector(`[name="${name}"]`) as HTMLInputElement;
        if (input) input.value = val || '';
      };

      setFormVal('nome_propriedade', p.nome_propriedade);
      setFormVal('codigo_car', p.codigo_car ? formatarCAR(p.codigo_car) : '');
      setFormVal('codigo_ccir', p.codigo_ccir ? formatarCCIR(p.codigo_ccir) : '');
      setFormVal('municipio', p.municipio);
      setFormVal('uf', p.uf);

      modalProp?.classList.remove('hidden');
    });

    // --- EXCLUIR PROPRIEDADE ---
    document.getElementById('btn-excluir-propriedade')?.addEventListener('click', async () => {
      if (!propriedadeSelecionadaId) return;
      if (!confirm("A exclusão da propriedade também removerá todos os vínculos de proprietários e histórico espacial correspondente. Deseja continuar?")) return;

      try {
        const res = await fetch(`${API_BASE}/propriedades/${propriedadeSelecionadaId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.error) {
          alert(data.error);
        } else {
          document.getElementById('propriedade-detalhe')?.classList.add('hidden');
          propriedadeSelecionadaId = null;
          loadPropriedades();
        }
      } catch (err) {
        alert("Erro de conexão ao excluir propriedade.");
      }
    });

    // --- FORM VINCULAR PROPRIETÁRIO ---
    document.getElementById('form-vincular-proprietario')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cliId = parseInt((document.getElementById('vinc-cliente-id') as HTMLInputElement).value);
      const participacao = parseFloat((document.getElementById('vinc-participacao') as HTMLInputElement).value);

      if (!cliId || isNaN(participacao)) return;

      try {
        const res = await fetch(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/clientes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente_id: cliId, percentual_participacao: participacao })
        });
        const data = await res.json();
        if (data.error) {
          alert(data.error);
        } else {
          // Limpa formulário de vínculo
          (document.getElementById('busca-proprietario-cliente') as HTMLInputElement).value = '';
          (document.getElementById('vinc-cliente-id') as HTMLInputElement).value = '';
          (document.getElementById('vinc-participacao') as HTMLInputElement).value = '';

          // Recarrega dados atualizados da propriedade
          const propRes = await fetch(`${API_BASE}/propriedades`);
          todasPropriedades = await propRes.json();
          exibirDetalhesPropriedade(propriedadeSelecionadaId!);
        }
      } catch (err) {
        alert("Erro de conexão ao vincular proprietário.");
      }
    });

    // --- DRAG AND DROP & UPLOADS DE ANEXOS FÍSICOS ---
    const configurarDropzone = (tipo: 'car' | 'ccir') => {
      const dropzone = document.getElementById(`dropzone-${tipo}`);
      const fileInput = document.getElementById(`input-file-${tipo}`) as HTMLInputElement;

      if (!dropzone || !fileInput) return;

      dropzone.addEventListener('click', () => fileInput.click());

      const processarUpload = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        // Indica carregamento visual mudando cursor da dropzone
        dropzone.style.cursor = 'wait';
        dropzone.classList.add('animate-pulse');

        try {
          const res = await fetch(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/upload-${tipo}`, {
             method: 'POST',
             body: formData
          });
          const data = await res.json();
          if (data.error) {
             alert(`Erro ao carregar arquivo do ${tipo.toUpperCase()}: ${data.error}`);
          } else {
             alert(`Arquivo do ${tipo.toUpperCase()} anexado física e logicamente com sucesso no Windows Workspace!`);
             
             // Recarrega propriedades atualizadas
             const propRes = await fetch(`${API_BASE}/propriedades`);
             todasPropriedades = await propRes.json();
             exibirDetalhesPropriedade(propriedadeSelecionadaId!);
          }
        } catch (err) {
          alert("Erro de conexão com o servidor no upload.");
        } finally {
          dropzone.style.cursor = '';
          dropzone.classList.remove('animate-pulse');
        }
      };

      fileInput.addEventListener('change', (e: any) => {
        if (e.target.files && e.target.files.length > 0) {
          processarUpload(e.target.files[0]);
        }
        fileInput.value = '';
      });

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        const hoverClass = tipo === 'car' ? 'border-mint-vibrant' : 'border-blue-500';
        dropzone.classList.add(hoverClass);
      });

      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        const hoverClass = tipo === 'car' ? 'border-mint-vibrant' : 'border-blue-500';
        dropzone.classList.remove(hoverClass);
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        const hoverClass = tipo === 'car' ? 'border-mint-vibrant' : 'border-blue-500';
        dropzone.classList.remove(hoverClass);
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processarUpload(e.dataTransfer.files[0]);
        }
      });
    };

    configurarDropzone('car');
    configurarDropzone('ccir');

    // --- LÓGICA DE MATRÍCULAS DA PROPRIEDADE ---
    const loadMatriculasDaPropriedade = async (propId: number) => {
      const corpo = document.getElementById('tbl-prop-matriculas-corpo');
      if (!corpo) return;

      corpo.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-white/30 italic font-sans">Carregando matrículas...</td></tr>';

      try {
        const res = await fetch(`${API_BASE}/propriedades/${propId}/matriculas`);
        const matriculas = await res.json();

        if (matriculas.error) {
          corpo.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-red-400 font-sans">${matriculas.error}</td></tr>`;
          return;
        }

        if (!Array.isArray(matriculas) || matriculas.length === 0) {
          corpo.innerHTML = `
            <tr>
               <td colspan="4" class="text-center py-6 text-white/30 italic font-sans">Nenhuma matrícula cadastrada para esta propriedade.</td>
            </tr>
          `;
          return;
        }

        corpo.innerHTML = matriculas.map(m => `
          <tr class="hover:bg-white/[0.01] border-b border-white/5">
             <td class="px-4 py-3 font-bold text-white">Matrícula nº ${m.numero_matricula}</td>
             <td class="px-4 py-3 text-right font-mono text-white/80">${(m.area_ha || 0).toFixed(4)} ha</td>
             <td class="px-4 py-3 text-white/60">
                <span class="block">CCIR: ${m.ccir || 'N/A'}</span>
                <span class="block">ITR: ${m.itr || 'N/A'}</span>
             </td>
             <td class="px-4 py-3 text-center">
                <button class="text-white/40 hover:text-red-400 p-1 btn-excluir-matricula-prop" data-mat-id="${m.id}" title="Excluir Matrícula">
                   <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
             </td>
          </tr>
        `).join('');

        initIcons();

        // Evento de exclusão de matrícula
        corpo.querySelectorAll('.btn-excluir-matricula-prop').forEach(btn => {
          btn.addEventListener('click', async () => {
            const matId = btn.getAttribute('data-mat-id');
            if (confirm("ATENÇÃO: Tem certeza absoluta que deseja excluir definitivamente esta matrícula? Todos os vértices e polígonos a ela vinculados serão impactados.")) {
              try {
                const deleteRes = await fetch(`${API_BASE}/matriculas/${matId}`, { method: 'DELETE' });
                const deleteData = await deleteRes.json();
                if (deleteData.error) {
                  alert(deleteData.error);
                } else {
                  loadMatriculasDaPropriedade(propId);
                }
              } catch (err) {
                alert("Erro de conexão ao excluir matrícula.");
              }
            }
          });
        });

      } catch (err) {
        console.error("Erro ao carregar matrículas:", err);
        corpo.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-red-400 font-sans">Erro de conexão ao carregar.</td></tr>';
      }
    };

    // Submissão do formulário de matrícula
    document.getElementById('form-cadastrar-matricula-prop')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!propriedadeSelecionadaId) return;

      const numero_matricula = (document.getElementById('input-new-mat-numero') as HTMLInputElement).value.trim();
      const area_ha = parseFloat((document.getElementById('input-new-mat-area') as HTMLInputElement).value);
      const ccir = (document.getElementById('input-new-mat-ccir') as HTMLInputElement).value.trim();
      const itr = (document.getElementById('input-new-mat-itr') as HTMLInputElement).value.trim();

      if (!numero_matricula || isNaN(area_ha)) return;

      try {
        const res = await fetch(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/matriculas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ numero_matricula, ccir, itr, area_ha })
        });
        const data = await res.json();
        if (data.error) {
          alert(data.error);
        } else {
          // Limpa
          (document.getElementById('input-new-mat-numero') as HTMLInputElement).value = '';
          (document.getElementById('input-new-mat-area') as HTMLInputElement).value = '';
          (document.getElementById('input-new-mat-ccir') as HTMLInputElement).value = '';
          (document.getElementById('input-new-mat-itr') as HTMLInputElement).value = '';

          // Recarrega
          loadMatriculasDaPropriedade(propriedadeSelecionadaId);
        }
      } catch (err) {
        alert("Erro de conexão ao cadastrar matrícula.");
      }
    });

    // --- INICIALIZADORES ---
    loadPropriedades();
    loadClientesList();
  }
};
