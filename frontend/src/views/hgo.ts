import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { registerInterval, showToast } from '../utils';

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

      <!-- Painel de Progresso HGO -->
      <div class="glass-card p-6 mt-6 hidden" id="hgo-progress-panel">
         <div class="flex justify-between items-center text-xs font-mono mb-2">
            <span class="text-white/60 font-semibold">Progresso do Processamento:</span>
            <span id="hgo-progress-percent" class="text-mint-vibrant font-bold">0/0 (0%)</span>
         </div>
         <div class="w-full bg-white/5 border border-white/10 h-2.5 rounded-full overflow-hidden">
            <div class="bg-mint-vibrant h-full transition-all duration-300 w-0" id="hgo-progress-bar"></div>
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
        .then(res => {
          if (!res.ok) throw new Error('Erro na requisição');
          return res.json();
        })
        .then(data => {
          const logs = data.logs || [];
          if (logs.length > lastLogCount && term) {
            let totalFiles = 0;
            let processedFiles = 0;

            term.innerHTML = '';
            logs.forEach((log: string) => {
              const div = document.createElement('div');
              div.className = 'py-0.5';
              
              // Cores semânticas reativas e dinâmicas nos logs
              const upperLog = log.toUpperCase();
              if (upperLog.includes('ERROR') || upperLog.includes('ERRO') || upperLog.includes('FALHA') || upperLog.includes('CRITICAL') || upperLog.includes('REJEITADO')) {
                div.className += ' text-rose-400 font-medium';
              } else if (upperLog.includes('WARN') || upperLog.includes('AVISO') || upperLog.includes('ATENÇÃO')) {
                div.className += ' text-yellow-400';
              } else if (upperLog.includes('SUCCESS') || upperLog.includes('SUCESSO') || upperLog.includes('CONCLUÍDO') || upperLog.includes('CRIADA') || upperLog.includes('OK')) {
                div.className += ' text-emerald-400 font-semibold';
              } else {
                div.className += ' text-mint-vibrant/80';
              }
              
              div.innerText = `> ${log}`;
              term.appendChild(div);

              // Parse do progresso (ex: "Convertendo arquivo [1/15]")
              const match = log.match(/\[(\d+)\/(\d+)\]/) || log.match(/(\d+)\s+de\s+(\d+)/);
              if (match) {
                 processedFiles = parseInt(match[1]);
                 totalFiles = parseInt(match[2]);
              }
            });
            
            term.scrollTop = term.scrollHeight;
            lastLogCount = logs.length;

            // Atualiza barra de progresso visual
            if (totalFiles > 0) {
              const percent = Math.round((processedFiles / totalFiles) * 100);
              const progressPanel = document.getElementById('hgo-progress-panel');
              const progressPercent = document.getElementById('hgo-progress-percent');
              const progressBar = document.getElementById('hgo-progress-bar');
              
              if (progressPanel) progressPanel.classList.remove('hidden');
              if (progressPercent) progressPercent.innerText = `${processedFiles}/${totalFiles} (${percent}%)`;
              if (progressBar) progressBar.style.width = `${percent}%`;
            }
          }
        })
        .catch(err => console.warn('Erro ao buscar logs HGO:', err));
    };
    const intervalId = window.setInterval(pollLogs, 1000);
    registerInterval(intervalId);

    document.getElementById('btn-pick-folder')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/pick-folder`);
        if (!res.ok) throw new Error('Erro ao abrir pasta');
        const data = await res.json();
        if (data.path) {
          currentFolder = data.path;
          if (lblPath) {
            lblPath.innerText = currentFolder;
            lblPath.classList.remove('text-white/60');
            lblPath.classList.add('text-white');
          }
          showToast("Pasta de trabalho selecionada com sucesso!", "success");
        }
      } catch (e) {
        console.error(e);
        showToast("Erro ao abrir janela de diretório.", "error");
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('btn-start-hgo')?.addEventListener('click', async (e) => {
      if (!currentFolder) {
        showToast("Selecione uma pasta de arquivos brutos primeiro!", "error");
        return;
      }
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true;
      try {
        showToast("Iniciando esteira de processamento GNSS...", "info");
        const res = await fetch(`${API_BASE}/process/hgo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pasta: currentFolder })
        });
        if (!res.ok) throw new Error('Erro no processo');
      } catch (e) {
        console.error(e);
        showToast("Erro ao disparar processo HGO.", "error");
      } finally {
        btn.disabled = false;
      }
    });
  }
};
