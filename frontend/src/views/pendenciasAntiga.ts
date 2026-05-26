import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons } from '../utils';

export const pendenciasAntigaRoute: RouteDef = {
  render: () => `
    <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative min-h-[500px]">
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-3xl font-bold">Agenda de Pendências</h2>
          <p class="text-white/40 mt-1">Gerenciamento de tarefas e alertas de integridade.</p>
        </div>
        <div class="flex gap-3">
          <button class="btn-primary" id="btn-nova-tarefa">
             <i data-lucide="plus" class="w-4 h-4"></i>
             Nova Tarefa
          </button>
        </div>
      </div>

      <div class="glass-card">
         <div class="p-4 border-b border-white/5 flex gap-4">
            <input type="text" placeholder="Buscar pendências..." class="glass-input flex-1 text-sm" />
         </div>
         <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40">
                  <th class="px-6 py-4 w-12"></th>
                  <th class="px-6 py-4">Título</th>
                  <th class="px-6 py-4">Descrição</th>
                  <th class="px-6 py-4">Prioridade</th>
                  <th class="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody class="text-sm divide-y divide-white/5" id="pendencias-tbody">
                <tr><td colspan="5" class="px-6 py-4 text-center text-white/40">Carregando...</td></tr>
              </tbody>
            </table>
         </div>
      </div>

      <!-- Modal Nova Tarefa -->
      <div id="modal-tarefa" class="absolute inset-0 z-50 hidden bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 transition-opacity duration-300">
         <div class="bg-[#0c1510] border border-mint-vibrant/20 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div class="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
               <h3 class="text-lg font-bold flex items-center gap-2">
                  <i data-lucide="plus" class="w-5 h-5 text-mint-vibrant"></i>
                  Nova Pendência
               </h3>
               <button id="close-modal-tarefa" class="text-white/40 hover:text-white transition-colors">
                  <i data-lucide="x" class="w-5 h-5"></i>
               </button>
            </div>
            <div class="p-6 space-y-4">
               <div>
                  <label class="block text-xs font-bold text-white/40 uppercase tracking-widest mb-1">Título</label>
                  <input type="text" id="tarefa-titulo" class="glass-input w-full text-sm" placeholder="Ex: Revisar cálculo de PPP" />
               </div>
               <div>
                  <label class="block text-xs font-bold text-white/40 uppercase tracking-widest mb-1">Descrição</label>
                  <textarea id="tarefa-descricao" class="glass-input w-full text-sm min-h-[80px]" placeholder="Detalhes da tarefa..."></textarea>
               </div>
               <div>
                  <label class="block text-xs font-bold text-white/40 uppercase tracking-widest mb-1">Prioridade</label>
                  <select id="tarefa-prioridade" class="glass-input w-full text-sm">
                     <option value="BAIXA">Baixa</option>
                     <option value="MEDIA" selected>Média</option>
                     <option value="ALTA">Alta</option>
                  </select>
               </div>
            </div>
            <div class="px-6 py-4 border-t border-white/10 flex justify-end gap-3 bg-white/[0.02]">
               <button id="btn-cancelar-tarefa" class="btn-secondary text-sm px-4 py-2">Cancelar</button>
               <button id="btn-salvar-tarefa" class="btn-primary text-sm px-4 py-2">Salvar</button>
            </div>
         </div>
      </div>

    </div>
  `,
  setup: () => {
    const loadPendencias = () => {
       fetch(`${API_BASE}/pendencias`)
         .then(res => res.json())
         .then(data => {
           const tbody = document.getElementById('pendencias-tbody');
           if (!tbody) return;
           if (data.length === 0) {
             tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-white/40">Nenhuma pendência encontrada.</td></tr>`;
             return;
           }
           tbody.innerHTML = '';
           data.forEach((row: any) => {
             const tr = document.createElement('tr');
             tr.className = 'hover:bg-white/[0.02] transition-colors group';
             const isConcluido = row.status === 'CONCLUIDO';
             tr.innerHTML = `
                 <td class="px-6 py-4">
                    <input type="checkbox" class="status-checkbox" data-id="${row.id}" ${isConcluido ? 'checked' : ''} />
                 </td>
                 <td class="px-6 py-4 font-medium ${isConcluido ? 'line-through text-white/40' : 'text-white'}">${row.titulo}</td>
                 <td class="px-6 py-4 text-white/60 text-xs ${isConcluido ? 'line-through opacity-50' : ''}">${row.descricao || '-'}</td>
                 <td class="px-6 py-4">
                    <span class="text-[10px] font-bold px-2 py-1 rounded ${row.prioridade === 'ALTA' ? 'bg-red-500/20 text-red-400' : row.prioridade === 'MEDIA' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'} uppercase">
                       ${row.prioridade}
                    </span>
                 </td>
                 <td class="px-6 py-4">
                    <span class="text-[10px] font-bold ${isConcluido ? 'text-mint-vibrant' : 'text-white/40'} uppercase">
                       ${row.status}
                    </span>
                 </td>
               `;
             tbody.appendChild(tr);
           });
           
           // Attach event listeners to checkboxes
           document.querySelectorAll('.status-checkbox').forEach(cb => {
              cb.addEventListener('change', async (e: any) => {
                 const id = e.target.getAttribute('data-id');
                 const novoStatus = e.target.checked ? 'CONCLUIDO' : 'PENDENTE';
                 try {
                    await fetch(`${API_BASE}/pendencias/${id}`, {
                       method: 'PUT',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ status: novoStatus })
                    });
                    loadPendencias();
                 } catch (err) {
                    console.error('Erro ao atualizar status', err);
                 }
              });
           });
           initIcons();
         })
         .catch(err => {
           console.error(err);
           const tbody = document.getElementById('pendencias-tbody');
           if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-400">Erro ao carregar pendências.</td></tr>`;
         });
    };
    
    loadPendencias();

    const modal = document.getElementById('modal-tarefa');
    const btnNova = document.getElementById('btn-nova-tarefa');
    const btnClose = document.getElementById('close-modal-tarefa');
    const btnCancel = document.getElementById('btn-cancelar-tarefa');
    const btnSalvar = document.getElementById('btn-salvar-tarefa');

    const openModal = () => {
       modal?.classList.remove('hidden');
       setTimeout(() => modal?.classList.add('opacity-100'), 10);
    };

    const closeModal = () => {
       modal?.classList.remove('opacity-100');
       setTimeout(() => modal?.classList.add('hidden'), 300);
    };

    btnNova?.addEventListener('click', openModal);
    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    btnSalvar?.addEventListener('click', async () => {
       const titulo = (document.getElementById('tarefa-titulo') as HTMLInputElement).value;
       const descricao = (document.getElementById('tarefa-descricao') as HTMLInputElement).value;
       const prioridade = (document.getElementById('tarefa-prioridade') as HTMLSelectElement).value;

       if (!titulo) return alert('O título é obrigatório.');

       try {
          await fetch(`${API_BASE}/pendencias`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ titulo, descricao, prioridade })
          });
          closeModal();
          loadPendencias();
          
          // clear form
          (document.getElementById('tarefa-titulo') as HTMLInputElement).value = '';
          (document.getElementById('tarefa-descricao') as HTMLInputElement).value = '';
       } catch (e) {
          alert('Erro ao salvar pendência.');
       }
    });
  }
};
