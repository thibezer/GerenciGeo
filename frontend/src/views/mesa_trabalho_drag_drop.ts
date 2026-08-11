import { initIcons } from '../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho/mesa_trabalho_context';
import { showToast } from '../utils';

export function setupDragDropGlobal(ctx: MesaTrabalhoContext) {
    const inicializarDragDropGlobal = () => {
      let dragCounter = 0;
      const overlay = document.createElement('div');
      overlay.id = 'global-drag-overlay';
      overlay.className = 'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0c1510]/85 backdrop-blur-md border-4 border-dashed border-mint-vibrant/60 m-6 rounded-2xl pointer-events-none opacity-0 transition-all duration-300';
      overlay.innerHTML = `
        <div class="flex flex-col items-center justify-center p-8 text-center max-w-md bg-[#0e1b14]/95 border border-mint-vibrant/20 rounded-technical shadow-2xl scale-95 transition-transform duration-300" style="pointer-events: none;">
          <div class="w-20 h-20 bg-mint-vibrant/10 rounded-full flex items-center justify-center mb-6 border border-mint-vibrant/30 animate-pulse">
            <i data-lucide="upload-cloud" class="w-10 h-10 text-mint-vibrant"></i>
          </div>
          <h3 class="text-xl font-bold text-white mb-2">Importação Rápida de Campo</h3>
          <p class="text-sm text-white/70 leading-relaxed mb-4">
            Solte os arquivos <span class="font-mono text-mint-vibrant font-bold">.GNS</span>, <span class="font-mono text-mint-vibrant font-bold">.TXT</span>, <span class="font-mono text-mint-vibrant font-bold">.CSV</span> ou planilhas (<span class="font-mono text-mint-vibrant font-bold">.XLSX/.ODS</span>) em qualquer lugar para iniciar o processamento na Mesa Geodésica.
          </p>
          <span class="text-[10px] text-white/30 uppercase tracking-widest font-mono">GerenciGeo Auto-Detect</span>
        </div>
      `;
      document.body.appendChild(overlay);
      initIcons();

      const handleDragEnter = (e: DragEvent) => {
        if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          dragCounter++;
          overlay.classList.remove('pointer-events-none', 'opacity-0');
          overlay.classList.add('opacity-100');
          const innerCard = overlay.querySelector('div');
          if (innerCard) {
            innerCard.classList.remove('scale-95');
            innerCard.classList.add('scale-100');
          }
        }
      };

      const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
      };

      const handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          overlay.classList.add('pointer-events-none', 'opacity-0');
          overlay.classList.remove('opacity-100');
          const innerCard = overlay.querySelector('div');
          if (innerCard) {
            innerCard.classList.remove('scale-100');
            innerCard.classList.add('scale-95');
          }
        }
      };

      const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.add('pointer-events-none', 'opacity-0');
        overlay.classList.remove('opacity-100');
        const innerCard = overlay.querySelector('div');
        if (innerCard) {
          innerCard.classList.remove('scale-100');
          innerCard.classList.add('scale-95');
        }

        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          ctx.alternarEtapa('geoprocessamento');
          if (ctx.expandirIngestao) {
            ctx.expandirIngestao();
          }

          Array.from(e.dataTransfer.files).forEach(f => {
            const isGns = f.name.toLowerCase().endsWith('.gns');
            ctx.filesQueue.push({ file: f, destination: isGns ? 'base' : 'rover_rtk' });
          });

          ctx.renderFilaArquivos();
          showToast(`${e.dataTransfer.files.length} arquivo(s) adicionado(s) à fila de triagem.`, "success");
        }
      };

      window.addEventListener('dragenter', handleDragEnter);
      window.addEventListener('dragover', handleDragOver);
      window.addEventListener('dragleave', handleDragLeave);
      window.addEventListener('drop', handleDrop);

      return () => {
        window.removeEventListener('dragenter', handleDragEnter);
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('drop', handleDrop);
        overlay.remove();
      };
    };

    return inicializarDragDropGlobal();
}
