import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons } from '../utils';

export const historicoRoute: RouteDef = {
  render: () => `
    <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-3xl font-bold">Histórico Geral</h2>
          <p class="text-white/40 mt-1">Gerenciamento de registros processados e exportação.</p>
        </div>
        <div class="flex gap-3">
          <button class="btn-primary">
             <i data-lucide="download" class="w-4 h-4"></i>
             Exportar UTM/KML
          </button>
        </div>
      </div>

      <div class="glass-card">
         <div class="p-4 border-b border-white/5 flex gap-4">
            <input type="text" placeholder="Filtrar registros..." class="glass-input flex-1 text-sm" />
         </div>
         <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40">
                  <th class="px-6 py-4 w-12"><input type="checkbox" /></th>
                  <th class="px-6 py-4">Arquivo</th>
                  <th class="px-6 py-4">Ponto</th>
                  <th class="px-6 py-4">Data/Hora</th>
                  <th class="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody class="text-sm divide-y divide-white/5" id="history-tbody">
                <tr><td colspan="5" class="px-6 py-4 text-center text-white/40">Carregando...</td></tr>
              </tbody>
            </table>
         </div>
      </div>
    </div>
  `,
  setup: () => {
    fetch(`${API_BASE}/history`)
      .then(res => res.json())
      .then(data => {
        const tbody = document.getElementById('history-tbody');
        if (!tbody) return;
        if (data.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-white/40">Nenhum registro encontrado.</td></tr>`;
          return;
        }
        tbody.innerHTML = '';
        data.forEach((row: any) => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-white/[0.02] transition-colors cursor-pointer group';
          tr.innerHTML = `
              <td class="px-6 py-4"><input type="checkbox" value="${row.id}" /></td>
              <td class="px-6 py-4 font-mono text-xs">${row.arquivo_nome}</td>
              <td class="px-6 py-4">${row.ponto_nome || '-'}</td>
              <td class="px-6 py-4 text-white/60">${row.data_inicio || '-'}</td>
              <td class="px-6 py-4">
                 <span class="flex items-center gap-1.5 text-[10px] font-bold ${row.sucesso ? 'text-mint-vibrant' : 'text-orange-400'} uppercase">
                    <i data-lucide="${row.sucesso ? 'check-circle-2' : 'alert-circle'}" class="w-3 h-3"></i>
                    ${row.sucesso ? 'Processado' : 'Pendente/Erro'}
                 </span>
              </td>
            `;
          tbody.appendChild(tr);
        });
        initIcons();
      })
      .catch(err => {
        console.error(err);
        const tbody = document.getElementById('history-tbody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-400">Erro ao carregar histórico.</td></tr>`;
      });
  }
};
