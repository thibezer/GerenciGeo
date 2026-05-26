import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { registerInterval } from '../utils';

export const hgoRoute: RouteDef = {
  render: () => `
     <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-3xl font-bold">Organizador HGO / Triagem</h2>
          <p class="text-white/40 mt-1">Organização inteligente de arquivos brutos por base e rover.</p>
        </div>
        <div class="flex gap-3">
          <button class="btn-primary" id="btn-start-hgo">
            <i data-lucide="play" class="w-4 h-4"></i>
            Converter e Organizar
          </button>
        </div>
      </div>

      <div class="glass-card p-6 flex items-center gap-4">
         <button class="btn-secondary whitespace-nowrap" id="btn-pick-folder">
            <i data-lucide="folder-tree" class="w-4 h-4"></i>
            Procurar Pasta Local
         </button>
         <div class="flex-1 bg-white/5 border border-white/10 rounded-technical px-4 py-2 font-mono text-sm text-white/60 truncate" id="lbl-folder-path">
            Nenhuma pasta selecionada...
         </div>
      </div>
      
      <div class="glass-card bg-[#050a08] border-mint-vibrant/10 overflow-hidden flex flex-col h-64 mt-6">
          <div class="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i data-lucide="terminal" class="w-4 h-4 text-mint-vibrant"></i>
              <span class="text-[10px] font-bold uppercase tracking-widest text-white/40">Terminal de Logs HGO</span>
            </div>
          </div>
          <div class="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 text-white/60" id="terminal-output-hgo">
             <div class="text-white/30">[IDLE] Aguardando seleção de pasta.</div>
          </div>
      </div>
     </div>
   `,
  setup: () => {
    let currentFolder = "";
    const lblPath = document.getElementById('lbl-folder-path');
    const term = document.getElementById('terminal-output-hgo');
    let lastLogCount = 0;
    const pollLogs = () => {
      fetch(`${API_BASE}/logs`)
        .then(res => res.json())
        .then(data => {
          const logs = data.logs || [];
          if (logs.length > lastLogCount && term) {
            term.innerHTML = '';
            logs.forEach((log: string) => {
              const div = document.createElement('div');
              div.className = 'text-mint-vibrant/80 py-0.5';
              div.innerText = `> ${log}`;
              term.appendChild(div);
            });
            term.scrollTop = term.scrollHeight;
            lastLogCount = logs.length;
          }
        });
    };
    const intervalId = window.setInterval(pollLogs, 1000);
    registerInterval(intervalId);

    document.getElementById('btn-pick-folder')?.addEventListener('click', async () => {
      try {
        const res = await fetch(`${API_BASE}/pick-folder`);
        const data = await res.json();
        if (data.path) {
          currentFolder = data.path;
          if (lblPath) {
            lblPath.innerText = currentFolder;
            lblPath.classList.remove('text-white/60');
            lblPath.classList.add('text-white');
          }
        }
      } catch (e) {
        console.error(e);
      }
    });

    document.getElementById('btn-start-hgo')?.addEventListener('click', async () => {
      if (!currentFolder) {
        alert("Selecione uma pasta primeiro!");
        return;
      }
      try {
        await fetch(`${API_BASE}/process/hgo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pasta: currentFolder })
        });
      } catch (e) {
        console.error(e);
      }
    });
  }
};
