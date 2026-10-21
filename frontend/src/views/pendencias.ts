import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, showToast, escapeHtml } from '../utils';
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
          <ui-card elevacao="baixa" class="p-6 flex flex-col">
            <h4 class="font-bold text-sm mb-4 text-white">Nova Pendência</h4>
            <form id="form-pendencia" class="space-y-4">
              <ui-campo-texto name="titulo" placeholder="Título da tarefa..." obrigatorio class="w-full"></ui-campo-texto>
              <textarea name="descricao" placeholder="Descrição detalhada..." class="glass-input w-full h-24 text-xs p-3"></textarea>
              <ui-select name="prioridade" value="MEDIA" class="w-full">
                <option value="BAIXA">Prioridade Baixa</option>
                <option value="MEDIA">Prioridade Média</option>
                <option value="ALTA">Prioridade Alta</option>
              </ui-select>
              <ui-botao variante="primario" type="submit" class="w-full">Criar Tarefa</ui-botao>
            </form>
          </ui-card>
        </div>

        <div class="lg:col-span-2">
          <ui-card elevacao="baixa" class="overflow-hidden flex flex-col">
            <div class="p-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
              <h4 class="font-bold text-sm text-white">Lista de Atividades</h4>
              <div class="flex gap-2">
                <ui-badge variante="sucesso" id="pendencias-count">0</ui-badge>
              </div>
            </div>
            <div id="lista-pendencias" class="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
              <div class="p-8 text-center text-white/20">Carregando tarefas...</div>
            </div>
          </ui-card>
        </div>
      </div>
    </div>
  `,
  setup: () => {
     const loadPendencias = () => {
        fetch(`${API_BASE}/pendencias`)
          .then(res => {
            if(!res.ok) throw new Error('Erro ao carregar pendências');
            return res.json();
          })
          .then(data => {
             const container = document.getElementById('lista-pendencias');
             if(!container) return;
             const countEl = document.getElementById('pendencias-count');
             if (countEl) countEl.innerText = data.length.toString();
             
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
                      <h5 class="text-sm font-bold ${p.status === 'CONCLUIDO' ? 'text-white/40 line-through' : 'text-white'}">${escapeHtml(p.titulo)}</h5>
                      <p class="text-xs text-white/40 mt-0.5">${escapeHtml(p.descricao || 'Sem descrição')}</p>
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
                fetch(`${API_BASE}/pendencias/${id}/concluir`, { method: 'POST' })
                  .then(res => {
                    if (!res.ok) throw new Error('Erro ao concluir tarefa');
                    showToast('Tarefa concluída!', 'success');
                    loadPendencias();
                  })
                  .catch(err => showToast(err.message, 'error'));
             }));

             document.querySelectorAll('.btn-delete-pendencia').forEach(b => b.addEventListener('click', () => {
                const id = b.getAttribute('data-id');
                fetch(`${API_BASE}/pendencias/${id}`, { method: 'DELETE' })
                  .then(res => {
                    if (!res.ok) throw new Error('Erro ao deletar tarefa');
                    showToast('Tarefa removida!', 'success');
                    loadPendencias();
                  })
                  .catch(err => showToast(err.message, 'error'));
             }));
          })
          .catch(err => {
            const container = document.getElementById('lista-pendencias');
            if(container) container.innerHTML = `<div class="p-12 text-center text-red-400">Erro ao carregar pendências: ${err.message}</div>`;
          });
     };

     loadPendencias();

     document.getElementById('form-pendencia')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const btn = (form.querySelector('ui-botao[type="submit"]') || form.querySelector('button[type="submit"]')) as any;
        const formData = new FormData(form);
        const payload: Record<string, any> = Object.fromEntries(formData.entries());
        
        // Garante valores de web components se FormData estiver polifillado
        const campoTitulo = form.querySelector('[name="titulo"]') as any;
        if (campoTitulo && !payload.titulo) payload.titulo = campoTitulo.value || '';
        const campoPrioridade = form.querySelector('[name="prioridade"]') as any;
        if (campoPrioridade && !payload.prioridade) payload.prioridade = campoPrioridade.value || 'MEDIA';
        const campoDescricao = form.querySelector('[name="descricao"]') as any;
        if (campoDescricao && !payload.descricao) payload.descricao = campoDescricao.value || '';

        if (btn) btn.disabled = true;
        fetch(`${API_BASE}/pendencias`, {
           method: 'POST',
           headers: {'Content-Type': 'application/json'},
           body: JSON.stringify(payload)
        })
        .then(res => {
           if (!res.ok) throw new Error('Erro ao criar pendência');
           form.reset();
           showToast('Nova tarefa adicionada!', 'success');
           loadPendencias();
        })
        .catch(err => showToast(err.message, 'error'))
        .finally(() => {
           if (btn) btn.disabled = false;
        });
     });
  }
};
