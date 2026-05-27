import type { RouteDef } from '../types';
import { API_BASE } from '../config';

export const clientesRoute: RouteDef = {
  render: () => `
    <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-3xl font-bold">Clientes</h2>
          <p class="text-white/40 mt-1">Gestão de Alta Precisão: Dados Jurídicos e Metadados Extensíveis.</p>
        </div>
        <div class="flex gap-3">
          <button class="btn-primary" id="btn-abrir-modal-cliente">
             <i data-lucide="plus" class="w-4 h-4"></i>
             Novo Cliente
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div class="glass-card p-6 col-span-1 lg:col-span-1" id="dash-clientes">
           <div class="flex justify-between items-center mb-4">
              <h4 class="font-bold text-sm">Cadastrados</h4>
              <span class="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-white/60" id="total-cli-count">0</span>
           </div>
           <div class="mb-4">
              <input type="text" placeholder="Buscar cliente..." class="glass-input w-full text-sm" id="busca-cliente" />
           </div>
           <div id="lista-clientes" class="space-y-2 max-h-[500px] overflow-y-auto pr-2">Carregando...</div>
        </div>
        
        <div class="col-span-1 lg:col-span-3 space-y-6 hidden" id="cliente-detalhe">
           <div class="glass-card p-0 overflow-hidden border-mint-vibrant/20 border">
              <div class="flex justify-between items-center pr-6 bg-white/[0.02]">
                 <div class="flex border-b border-white/5">
                    <button class="px-6 py-3 text-sm font-bold border-b-2 border-mint-vibrant text-mint-vibrant tab-btn" data-tab="tab-principais">Dados Principais</button>
                    <button class="px-6 py-3 text-sm font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn" data-tab="tab-adicionais">Metadados</button>
                 </div>
                 <div class="flex gap-2">
                    <button class="text-white/40 hover:text-mint-vibrant transition-colors p-2" id="btn-editar-cliente" title="Editar Cliente">
                        <i data-lucide="edit" class="w-4 h-4"></i>
                     </button>
                     <button class="text-white/40 hover:text-red-400 transition-colors p-2" id="btn-excluir-cliente" title="Excluir Cliente">
                       <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                 </div>
              </div>
              
              <div class="p-6">
                 <!-- TAB PRINCIPAIS -->
                 <div id="tab-principais" class="tab-content space-y-6">
                    <div class="grid grid-cols-2 gap-4">
                       <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Nome Completo</p><p class="text-sm font-medium" id="cli-nome">-</p></div>
                       <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">CPF/CNPJ</p><p class="text-sm font-mono text-mint-vibrant" id="cli-cpf">-</p></div>
                       <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">RG/IE</p><p class="text-sm font-mono" id="cli-rg">-</p></div>
                       <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Estado Civil</p><p class="text-sm" id="cli-estcivil">-</p></div>
                    </div>
                    <div class="border-t border-white/5 pt-4 grid grid-cols-2 gap-4">
                       <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Cônjuge</p><p class="text-sm font-medium" id="cli-conjuge">-</p></div>
                       <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">CPF Cônjuge</p><p class="text-sm font-mono" id="cli-cpfconjuge">-</p></div>
                    </div>
                    <div class="border-t border-white/5 pt-4">
                       <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Endereço</p>
                       <p class="text-sm" id="cli-endereco">-</p>
                    </div>
                 </div>
                 
                 <!-- TAB ADICIONAIS -->
                 <div id="tab-adicionais" class="tab-content hidden space-y-4">
                    <div class="bg-white/5 rounded-technical p-4">
                       <table class="w-full text-left text-sm">
                          <tbody id="cli-metadados"></tbody>
                       </table>
                    </div>
                 </div>
              </div>
           </div>
           
           <div class="grid grid-cols-2 gap-6">
              <div class="glass-card p-6 flex items-center justify-between">
                 <div>
                    <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Levantamentos</p>
                    <h3 class="text-2xl font-mono mt-1" id="cli-levs">0</h3>
                 </div>
                 <div class="w-10 h-10 bg-mint-vibrant/10 rounded-full flex items-center justify-center">
                    <i data-lucide="map-pin" class="w-5 h-5 text-mint-vibrant"></i>
                 </div>
              </div>
              <div class="glass-card p-6 flex items-center justify-between opacity-50">
                 <div>
                    <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Propriedades</p>
                    <h3 class="text-2xl font-mono mt-1">0</h3>
                 </div>
                 <div class="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center">
                    <i data-lucide="home" class="w-5 h-5 text-white/40"></i>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <!-- MODAL NOVO CLIENTE -->
      <div id="modal-cliente" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div class="p-6 border-b border-white/5 flex justify-between items-center">
               <h3 class="text-xl font-bold">Cadastro de Cliente</h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal">
                  <i data-lucide="x" class="w-6 h-6"></i>
               </button>
            </div>
            <form id="form-cliente" class="p-6 space-y-6">
               <div class="grid grid-cols-2 gap-4">
                  <div class="col-span-2">
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nome Completo</label>
                     <input type="text" name="nome_completo" required class="glass-input w-full">
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">CPF / CNPJ</label>
                     <input type="text" name="cpf_cnpj" required class="glass-input w-full">
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">RG / IE</label>
                     <input type="text" name="rg_ie" class="glass-input w-full">
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Estado Civil</label>
                     <select name="estado_civil" class="glass-input w-full">
                        <option value="Solteiro(a)">Solteiro(a)</option>
                        <option value="Casado(a)">Casado(a)</option>
                        <option value="Divorciado(a)">Divorciado(a)</option>
                        <option value="Viúvo(a)">Viúvo(a)</option>
                        <option value="União Estável">União Estável</option>
                     </select>
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nacionalidade</label>
                     <input type="text" name="nacionalidade" class="glass-input w-full" value="Brasileiro(a)">
                  </div>
               </div>
               <div class="border-t border-white/5 pt-4 grid grid-cols-2 gap-4">
                  <div class="col-span-2"><h5 class="text-xs font-bold text-mint-vibrant">CÔNJUGE</h5></div>
                  <div class="col-span-2">
                     <input type="text" name="nome_conjuge" class="glass-input w-full" placeholder="Nome do Cônjuge">
                  </div>
                  <input type="text" name="cpf_conjuge" class="glass-input w-full" placeholder="CPF Cônjuge">
                  <input type="text" name="rg_conjuge" class="glass-input w-full" placeholder="RG Cônjuge">
               </div>
               <div class="border-t border-white/5 pt-4 grid grid-cols-2 gap-4">
                  <div class="col-span-2"><h5 class="text-xs font-bold text-mint-vibrant">CONTATO E ENDEREÇO</h5></div>
                  <input type="text" name="telefone" class="glass-input w-full" placeholder="Telefone">
                  <input type="email" name="email" class="glass-input w-full" placeholder="Email">
                  <div class="col-span-2">
                     <input type="text" name="endereco_completo" class="glass-input w-full" placeholder="Endereço">
                  </div>
                  <input type="text" name="cidade" class="glass-input w-full" placeholder="Cidade">
                  <input type="text" name="estado" class="glass-input w-full" placeholder="UF" maxlength="2">
               </div>
               <div class="flex justify-end gap-3 pt-6 border-t border-white/5">
                  <button type="button" class="btn-secondary" id="btn-cancelar-cliente">Cancelar</button>
                  <button type="submit" class="btn-primary">Salvar Cliente</button>
               </div>
            </form>
         </div>
      </div>
    </div>
  `,
  setup: () => {
     let clienteSelecionadoId: number | null = null;
     let todosClientes: any[] = [];
     
     // Utilitário de máscara dinâmica CPF/CNPJ
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

     const inputCpfCnpj = document.querySelector('#form-cliente [name="cpf_cnpj"]') as HTMLInputElement;
     const inputCpfConjuge = document.querySelector('#form-cliente [name="cpf_conjuge"]') as HTMLInputElement;

     const formatarInput = (input: HTMLInputElement) => {
        input.addEventListener('input', (e) => {
           const target = e.target as HTMLInputElement;
           target.value = aplicarMascaraCpfCnpj(target.value);
        });
     };

     if (inputCpfCnpj) formatarInput(inputCpfCnpj);
     if (inputCpfConjuge) formatarInput(inputCpfConjuge);
     
     // Modal control
     const modal = document.getElementById('modal-cliente');
     document.getElementById('btn-abrir-modal-cliente')?.addEventListener('click', () => {
         clienteSelecionadoId = null;
         const form = document.getElementById('form-cliente') as HTMLFormElement;
         if(form) form.reset();
         const title = document.querySelector('#modal-cliente h3');
         if(title) title.textContent = 'Cadastro de Cliente';
         modal?.classList.remove('hidden');
      });
     document.getElementById('btn-fechar-modal')?.addEventListener('click', () => modal?.classList.add('hidden'));
     document.getElementById('btn-cancelar-cliente')?.addEventListener('click', () => modal?.classList.add('hidden'));

     // Tab logic
     document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
           const target = (e.target as HTMLElement).getAttribute('data-tab');
           document.querySelectorAll('.tab-btn').forEach(b => b.classList.replace('border-mint-vibrant', 'border-transparent'));
           document.querySelectorAll('.tab-btn').forEach(b => b.classList.replace('text-mint-vibrant', 'text-white/40'));
           (e.target as HTMLElement).classList.replace('border-transparent', 'border-mint-vibrant');
           (e.target as HTMLElement).classList.replace('text-white/40', 'text-mint-vibrant');
           document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
           document.getElementById(target || '')?.classList.remove('hidden');
        });
     });

     // Busca de Clientes
     document.getElementById('busca-cliente')?.addEventListener('input', (e) => {
        const term = (e.target as HTMLInputElement).value.toLowerCase();
        document.querySelectorAll('.cli-item').forEach(el => {
           const nome = el.querySelector('p')?.textContent?.toLowerCase() || '';
           const doc = el.querySelector('p:last-child')?.textContent?.toLowerCase() || '';
           (el as HTMLElement).style.display = (nome.includes(term) || doc.includes(term)) ? 'flex' : 'none';
        });
     });

     const loadClientes = () => {
        const lista = document.getElementById('lista-clientes');
        if(!lista) return Promise.resolve();
        lista.innerHTML = '<p class="text-sm text-white/40 text-center py-4">Carregando...</p>';
        
        return fetch(`${API_BASE}/clientes`)
           .then(res => res.json())
           .then(data => {
              if(data.error) { lista.innerHTML = `<p class="text-xs text-red-400 p-4">${data.error}</p>`; return; }
              todosClientes = data;
              const count = document.getElementById('total-cli-count');
              if(count) count.innerText = data.length.toString();
              
              if(!Array.isArray(data) || data.length === 0) {
                 lista.innerHTML = '<p class="text-sm text-white/40 text-center py-4">Nenhum cliente.</p>';
                 return;
              }
              
              lista.innerHTML = data.map((cli: any) => `
                 <div class="p-3 bg-white/5 hover:bg-white/10 rounded-technical cursor-pointer transition-colors cli-item flex items-center gap-3" data-id="${cli.id}">
                    <div class="w-8 h-8 rounded-full bg-mint-vibrant/10 flex items-center justify-center text-xs font-bold text-mint-vibrant">
                       ${(cli.nome_completo || '??').substring(0,2).toUpperCase()}
                    </div>
                    <div class="min-w-0 flex-1">
                       <p class="text-sm font-bold text-white truncate">${cli.nome_completo}</p>
                       <p class="text-[10px] text-white/40 font-mono">${aplicarMascaraCpfCnpj(cli.cpf_cnpj || '')}</p>
                    </div>
                 </div>
              `).join('');

              document.querySelectorAll('.cli-item').forEach(el => {
                 el.addEventListener('click', () => {
                    const id = parseInt(el.getAttribute('data-id') || '0');
                    const cli = data.find((c:any) => c.id === id);
                    if(!cli) return;
                    clienteSelecionadoId = id;
                    document.getElementById('cliente-detalhe')?.classList.remove('hidden');
                    
                    const setVal = (id:string, val:any) => { const e = document.getElementById(id); if(e) e.innerText = val || '-'; };
                    setVal('cli-nome', cli.nome_completo);
                    setVal('cli-cpf', aplicarMascaraCpfCnpj(cli.cpf_cnpj || ''));
                    setVal('cli-rg', cli.rg_ie);
                    setVal('cli-estcivil', cli.estado_civil);
                    setVal('cli-conjuge', cli.nome_conjuge);
                    setVal('cli-cpfconjuge', aplicarMascaraCpfCnpj(cli.cpf_conjuge || ''));
                    setVal('cli-endereco', `${cli.endereco_completo || ''} - ${cli.cidade || ''}/${cli.estado || ''}`);
                    setVal('cli-levs', cli.total_levantamentos);

                    const metas = document.getElementById('cli-metadados');
                    if(metas) {
                       const entries = Object.entries(cli.metadados || {});
                       metas.innerHTML = entries.length ? entries.map(([k,v]) => `
                          <tr class="border-b border-white/5">
                             <td class="py-2 text-[10px] text-white/40 uppercase font-bold">${k}</td>
                             <td class="py-2 text-right font-mono">${v}</td>
                          </tr>
                       `).join('') : '<tr><td class="text-white/20 py-2">Sem metadados.</td></tr>';
                    }
                 });
              });
           });
     };

     loadClientes();

     // Editar Cliente
      document.getElementById('btn-editar-cliente')?.addEventListener('click', () => {
         if(!clienteSelecionadoId) return;
         const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
         if(!cli) return;

         const form = document.getElementById('form-cliente') as HTMLFormElement;
         if(!form) return;

         const setFormVal = (name: string, val: any) => {
            const input = form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;
            if(input) input.value = val || '';
         };

         setFormVal('nome_completo', cli.nome_completo);
         setFormVal('cpf_cnpj', aplicarMascaraCpfCnpj(cli.cpf_cnpj || ''));
         setFormVal('rg_ie', cli.rg_ie);
         setFormVal('estado_civil', cli.estado_civil);
         setFormVal('nacionalidade', cli.nacionalidade);
         setFormVal('nome_conjuge', cli.nome_conjuge);
         setFormVal('cpf_conjuge', aplicarMascaraCpfCnpj(cli.cpf_conjuge || ''));
         setFormVal('rg_conjuge', cli.rg_conjuge);
         setFormVal('telefone', cli.telefone);
         setFormVal('email', cli.email);
         setFormVal('endereco_completo', cli.endereco_completo);
         setFormVal('cidade', cli.cidade);
         setFormVal('estado', cli.estado);

         const title = document.querySelector('#modal-cliente h3');
         if(title) title.textContent = 'Editar Cliente';

         modal?.classList.remove('hidden');
      });

      // Excluir Cliente
     document.getElementById('btn-excluir-cliente')?.addEventListener('click', async () => {
        if(!clienteSelecionadoId || !confirm("Deseja realmente excluir este cliente?")) return;
        try {
           const res = await fetch(`${API_BASE}/clientes/${clienteSelecionadoId}`, { method: 'DELETE' });
           const data = await res.json();
           if(data.error) alert(data.error);
           else {
              document.getElementById('cliente-detalhe')?.classList.add('hidden');
              loadClientes();
           }
        } catch(e) { alert("Erro ao excluir."); }
     });

     // Form Submit
     document.getElementById('form-cliente')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const payload = Object.fromEntries(formData.entries()) as any;
         
         if (clienteSelecionadoId) {
            const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
            if (cli && cli.metadados) {
               payload.metadados = cli.metadados;
            }
         }
        
        try {
           const url = clienteSelecionadoId ? `${API_BASE}/clientes/${clienteSelecionadoId}` : `${API_BASE}/clientes`;
           const method = clienteSelecionadoId ? 'PUT' : 'POST';
           
           const res = await fetch(url, {
              method: method,
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(payload)
           });
           
           if (!res.ok) {
              const errData = await res.json();
              let errMsg = "Erro ao salvar.";
              if (errData.error) {
                 errMsg = errData.error;
              } else if (errData.detail) {
                 errMsg = Array.isArray(errData.detail) 
                    ? errData.detail.map((d: any) => `${d.loc.join('.')}: ${d.msg}`).join('\n') 
                    : JSON.stringify(errData.detail);
              }
              alert(errMsg);
              return;
           }
           
           const data = await res.json();
           if(data.error) {
              alert(data.error);
           } else {
              modal?.classList.add('hidden');
              (e.target as HTMLFormElement).reset();
              loadClientes().then(() => {
                 if(clienteSelecionadoId) {
                    const item = document.querySelector(`.cli-item[data-id="${clienteSelecionadoId}"]`) as HTMLElement;
                    if(item) item.click();
                 }
              });
           }
        } catch(e) { alert("Erro ao salvar."); }
     });
  }
};
