import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { registerInterval } from '../utils';

export const pppRoute: RouteDef = {
  render: () => `
    <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-3xl font-bold">Módulo de Processamento PPP</h2>
          <p class="text-white/40 mt-1">Automatização de conversão Rinex e submissão ao IBGE.</p>
        </div>
        <div class="flex gap-3">
          <button class="btn-primary" id="btn-start-ppp">
            <i data-lucide="play" class="w-4 h-4"></i>
            Iniciar Fluxo Completo
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div class="lg:col-span-1 space-y-6">
          <div class="glass-card p-6 border-dashed border-mint-vibrant/20 bg-mint-vibrant/[0.02] flex flex-col items-center justify-center text-center cursor-pointer hover:bg-mint-vibrant/[0.05] transition-all group" id="dropzone">
            <input type="file" id="file-input" class="hidden" multiple accept=".gns,.GNS" />
            <div class="w-12 h-12 bg-mint-vibrant/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <i data-lucide="upload" class="w-6 h-6 text-mint-vibrant"></i>
            </div>
            <h4 class="font-bold text-sm">Upload de Brutos</h4>
            <p class="text-[10px] text-white/40 mt-2 uppercase tracking-widest">Clique para selecionar arquivos .GNS</p>
          </div>

          <div class="glass-card p-6 space-y-4">
            <h4 class="text-sm font-bold uppercase tracking-widest text-white/40">Status do Lote</h4>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-xs text-white/60">Arquivos Carregados</span>
                <span class="text-sm font-mono" id="file-count">0</span>
              </div>
            </div>
          </div>
        </div>

        <div class="lg:col-span-3 space-y-6">
          <div class="glass-card bg-[#050a08] border-mint-vibrant/10 overflow-hidden flex flex-col h-64">
            <div class="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <i data-lucide="terminal" class="w-4 h-4 text-mint-vibrant"></i>
                <span class="text-[10px] font-bold uppercase tracking-widest text-white/40">Terminal de Logs (Real-time)</span>
              </div>
            </div>
            <div class="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 text-white/60" id="terminal-output">
               <div class="text-white/30">[IDLE] Aguardando entrada de dados.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  setup: () => {
    const term = document.getElementById('terminal-output');
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

    let selectedFiles: File[] = [];
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const fileCount = document.getElementById('file-count');
    const dropzone = document.getElementById('dropzone');

    const updateFileCount = (files: FileList | File[]) => {
      if (!files || files.length === 0) return;
      selectedFiles = Array.from(files);
      if (fileCount) {
        fileCount.textContent = selectedFiles.length.toString();
      }
    };

    fileInput?.addEventListener('change', (e: any) => {
      updateFileCount(e.target.files);
      // Permite re-selecionar o mesmo arquivo se necessário
      fileInput.value = '';
    });

    // Clique na dropzone dispara o file-input
    dropzone?.addEventListener('click', (e) => {
       if (e.target !== fileInput) {
           fileInput?.click();
       }
    });

    // Drag and drop support
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-mint-vibrant');
    });
    dropzone?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant');
    });
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant');
      if (e.dataTransfer && e.dataTransfer.files) {
        updateFileCount(e.dataTransfer.files);
      }
    });

    document.getElementById('btn-start-ppp')?.addEventListener('click', async () => {
      if (selectedFiles.length === 0) {
        alert("Selecione arquivos primeiro!");
        return;
      }
      const formData = new FormData();
      selectedFiles.forEach(f => formData.append('files', f));
      if (term) term.innerHTML += `<div class="text-blue-400 py-0.5">> Fazendo upload de ${selectedFiles.length} arquivos...</div>`;
      try {
        const upRes = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
        const upData = await upRes.json();
        await fetch(`${API_BASE}/process/ppp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(upData.files)
        });
      } catch (e) {
        console.error(e);
        if (term) term.innerHTML += `<div class="text-red-500 py-0.5">> Erro de conexão com a API.</div>`;
      }
    });
  }
};
