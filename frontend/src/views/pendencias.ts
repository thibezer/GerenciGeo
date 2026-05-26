import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons } from '../utils';

export const pendenciasRoute: RouteDef = {
  render: () => `
    <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-3xl font-bold text-white">Agenda de Pendências</h2>
          <p class="text-white/40 mt-1">Gerencie tarefas críticas e prazos de georreferenciamento.</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-1 space-y-6">
          <div class="glass-card p-6">
            <h4 class="font-bold text-sm mb-4">Nova Pendência</h4>
            <form id="form-pendencia" class="space-y-4">
              <input type="text" name="titulo" placeholder="Título da tarefa..." required class="glass-input w-full">
              <textarea name="descricao" placeholder="Descrição detalhada..." class="glass-input w-full h-24"></textarea>
              <select name="prioridade" class="glass-input w-full">
                <option value="BAIXA">Prioridade Baixa</option>
                <option value="MEDIA" selected>Prioridade Média</option>
                <option value="ALTA">Prioridade Alta</option>
              </select>
              <button type="submit" class="btn-primary w-full">Criar Tarefa</button>
            </form>
          </div>
        </div>

        <div class="lg:col-span-2 glass-card overflow-hidden">
          <div class="p-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
            <h4 class="font-bold text-sm">Lista de Atividades</h4>
            <div class="flex gap-2">
              <span class="text-[10px] bg-mint-vibrant/20 text-mint-vibrant px-2 py-0.5 rounded-full" id="pendencias-count">0</span>
            </div>
          </div>
          <div id="lista-pendencias" class="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
            <div class="p-8 text-center text-white/20">Carregando tarefas...</div>
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
             const container = document.getElementById('lista-pendencias');
             if(!container) return;
             document.getElementById('pendencias-count')!.innerText = data.length.toString();
             
             if(data.length === 0) {
                container.innerHTML = `<div class="p-12 text-center text-white/20">Nenhuma pendência encontrada.</div>`;
                return;
             }

             container.innerHTML = data.map((p: any) => `
                <div class="p-4 hover:bg-white/[0.02] transition-colors flex items-center justify-between group">
                  <div class="flex items-start gap-4">
                    <div class="mt-1">
                      <i data-lucide="${p.status === 'CONCLUIDO' ? 'check-circle-2' : 'alert-circle'}" 
                         class="w-5 h-5 ${p.status === 'CONCLUIDO' ? 'text-mint-vibrant' : (p.prioridade === 'ALTA' ? 'text-red-400' : 'text-white/20')}"></i>
                    </div>
                    <div>
                      <h5 class="text-sm font-bold ${p.status === 'CONCLUIDO' ? 'text-white/40 line-through' : 'text-white'}">${p.titulo}</h5>
                      <p class="text-xs text-white/40 mt-0.5">${p.descricao || 'Sem descrição'}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    ${p.status === 'PENDENTE' ? `<button class="btn-check text-mint-vibrant opacity-0 group-hover:opacity-100 transition-opacity" data-id="${p.id}"><i data-lucide="check" class="w-4 h-4"></i></button>` : ''}
                    <button class="text-white/10 hover:text-red-400 btn-delete-pendencia" data-id="${p.id}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                  </div>
                </div>
             `).join('');
             initIcons();

             document.querySelectorAll('.btn-check').forEach(b => b.addEventListener('click', () => {
                const id = b.getAttribute('data-id');
                fetch(`${API_BASE}/pendencias/${id}/concluir`, { method: 'POST' }).then(() => loadPendencias());
             }));

             document.querySelectorAll('.btn-delete-pendencia').forEach(b => b.addEventListener('click', () => {
                const id = b.getAttribute('data-id');
                fetch(`${API_BASE}/pendencias/${id}`, { method: 'DELETE' }).then(() => loadPendencias());
             }));
          });
     };

     loadPendencias();

     document.getElementById('form-pendencia')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        fetch(`${API_BASE}/pendencias`, {
           method: 'POST',
           headers: {'Content-Type': 'application/json'},
           body: JSON.stringify(Object.fromEntries(formData.entries()))
        }).then(() => {
           (e.target as HTMLFormElement).reset();
           loadPendencias();
        });
     });
  }
};
