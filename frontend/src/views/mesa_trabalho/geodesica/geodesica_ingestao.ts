import { API_BASE } from '../../../config';
import { initIcons } from '../../../utils';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function setupIngestaoArquivos(ctx: MesaTrabalhoContext): void {
  const dropzone = document.getElementById('triagem-dropzone');
  const fileInput = document.getElementById('triagem-file-input') as HTMLInputElement | null;
  const filaContainer = document.getElementById('triagem-fila-container');
  const btnProcessar = document.getElementById('btn-processar-lote');

  ctx.renderFilaArquivos = () => {
    const dropzoneEl = document.getElementById('triagem-dropzone');
    const dropzoneIcon = document.getElementById('triagem-dropzone-icon');
    const dropzoneTitle = document.getElementById('triagem-dropzone-title');
    const dropzoneDesc = document.getElementById('triagem-dropzone-desc');
    const chkContainer = document.getElementById('triagem-opcoes-lote');

    if (ctx.filesQueue.length === 0) {
      if (dropzoneEl) {
        dropzoneEl.className = 'border-2 border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-xl p-4 text-center cursor-pointer transition-all flex-1 flex flex-col justify-center items-center group relative overflow-hidden min-h-[120px]';
      }
      if (dropzoneIcon) dropzoneIcon.classList.remove('hidden');
      if (dropzoneDesc) dropzoneDesc.classList.remove('hidden');
      if (dropzoneTitle) {
        dropzoneTitle.innerText = 'Arraste múltiplos arquivos para triagem';
        dropzoneTitle.className = 'text-xs font-bold';
      }

      filaContainer?.classList.add('hidden');
      btnProcessar?.classList.add('hidden');
      const btnProcessarModal = document.getElementById('btn-processar-lote-modal');
      if (btnProcessarModal) btnProcessarModal.classList.add('hidden');
      if (chkContainer) {
        chkContainer.classList.remove('flex');
        chkContainer.classList.add('hidden');
      }
      return;
    }

    if (dropzoneEl) {
      dropzoneEl.className = 'border border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-xl p-2 text-center cursor-pointer transition-all flex flex-row justify-center items-center gap-2 group relative overflow-hidden h-11 min-h-[44px] max-h-11 shrink-0';
    }
    if (dropzoneIcon) dropzoneIcon.classList.add('hidden');
    if (dropzoneDesc) dropzoneDesc.classList.add('hidden');
    if (dropzoneTitle) {
      dropzoneTitle.innerText = 'Arraste mais arquivos para triagem';
      dropzoneTitle.className = 'text-[11px] font-bold text-white/80 select-none';
    }

    filaContainer?.classList.remove('hidden');
    btnProcessar?.classList.remove('hidden');
    const btnProcessarModal = document.getElementById('btn-processar-lote-modal');
    if (btnProcessarModal) btnProcessarModal.classList.remove('hidden');
    if (chkContainer) {
      chkContainer.classList.remove('hidden');
      chkContainer.classList.add('flex');
    }

    if (btnProcessar) {
      (btnProcessar as HTMLButtonElement).disabled = false;
      btnProcessar.classList.remove('opacity-50', 'cursor-not-allowed');
      btnProcessar.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i> Processar Lote em Segundo Plano`;
    }
    const btnProcessarModalEl = document.getElementById('btn-processar-lote-modal') as HTMLButtonElement | null;
    if (btnProcessarModalEl) {
      btnProcessarModalEl.disabled = false;
      btnProcessarModalEl.classList.remove('opacity-50', 'cursor-not-allowed');
      btnProcessarModalEl.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i> Iniciar Processamento`;
    }

    const basesPossiveis = ctx.pontosList.filter(p => p.tipo_ponto === 'M' || p.nome_vertice.toUpperCase().includes('BASE') || p.tipo_ponto === 'BASE');
    const basesParaRenderizar = basesPossiveis.length > 0 ? basesPossiveis : ctx.pontosList;

    filaContainer!.innerHTML = ctx.filesQueue.map((item, idx) => {
      const kbSize = (item.file.size / 1024).toFixed(1);

      if (item.matricula_id === undefined || item.matricula_id === null) {
        item.matricula_id = ctx.currentMatriculaId;
      }

      const options = [
        `<option value="base" ${item.destination === 'base' ? 'selected' : ''}>[Base - Enviar ao PPP]</option>`,
        `<option value="rover_estatico_corrigido" ${item.destination === 'rover_estatico_corrigido' ? 'selected' : ''}>[Rover Estático - Relatório de Coordenadas Corrigidas]</option>`,
        `<option value="rover_estatico_bruto" ${item.destination === 'rover_estatico_bruto' ? 'selected' : ''}>[Rover Estático - Arquivo Bruto (Aguardando Baseline)]</option>`,
        `<option value="rover_rtk" ${item.destination === 'rover_rtk' ? 'selected' : ''}>[RTK - Ingestão de Pontos (Vincular à Base Selecionada)]</option>`
      ];

      let extraSelectorsHtml = '';

      if (item.destination === 'rover_rtk') {
        extraSelectorsHtml += `
          <select class="glass-input text-[9px] py-0.5 px-1.5 select-file-base shrink-0 w-[140px]" data-idx="${idx}" title="Vincular à Base de Campo">
            <option value="">[Nenhuma Base (Autodetectar)]</option>
            ${basesParaRenderizar.map(p => `<option value="${p.id}" ${item.base_escolhida_id === p.id ? 'selected' : ''}>Base: ${p.nome_vertice}</option>`).join('')}
          </select>
        `;
      }

      return `
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded-technical text-[11px] gap-2">
          <div class="min-w-0 flex-1">
            <p class="font-mono text-white truncate font-medium" title="${item.file.name}">${item.file.name}</p>
            <p class="text-[8px] text-white/30 font-mono mt-0.5">${kbSize} KB</p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <select class="glass-input text-[9px] py-0.5 px-1.5 select-file-dest shrink-0 w-[190px]" data-idx="${idx}">
              ${options.join('')}
            </select>
            ${extraSelectorsHtml}
            <button class="text-white/30 hover:text-red-400 p-1 btn-remover-arquivo shrink-0" data-idx="${idx}">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    initIcons();

    document.querySelectorAll('.select-file-dest').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-idx') || '0', 10);
        ctx.filesQueue[idx].destination = (e.target as HTMLSelectElement).value;
        ctx.renderFilaArquivos();
      });
    });

    document.querySelectorAll('.select-file-base').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-idx') || '0', 10);
        const val = (e.target as HTMLSelectElement).value;
        ctx.filesQueue[idx].base_escolhida_id = val ? parseInt(val, 10) : null;
      });
    });

    document.querySelectorAll('.btn-remover-arquivo').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.getAttribute('data-idx') || '0', 10);
        ctx.filesQueue.splice(idx, 1);
        ctx.renderFilaArquivos();
      });
    });
  };

  dropzone?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (e: any) => {
    if (e.target.files) {
      Array.from(e.target.files as FileList).forEach(f => {
        const isGns = f.name.toLowerCase().endsWith('.gns');
        ctx.filesQueue.push({ file: f, destination: isGns ? 'base' : 'rover_rtk' });
      });
      ctx.renderFilaArquivos();
    }
    fileInput.value = '';
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
  });

  dropzone?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    if (e.dataTransfer && e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach(f => {
        const isGns = f.name.toLowerCase().endsWith('.gns');
        ctx.filesQueue.push({ file: f, destination: isGns ? 'base' : 'rover_rtk' });
      });
      ctx.renderFilaArquivos();
    }
  });

  btnProcessar?.addEventListener('click', async () => {
    if (ctx.filesQueue.length === 0) return;

    const btnProcessarOriginal = btnProcessar as HTMLButtonElement;
    const btnProcessarModalEl = document.getElementById('btn-processar-lote-modal') as HTMLButtonElement | null;
    const originalHtmlBtn = btnProcessarOriginal.innerHTML;
    const originalHtmlModal = btnProcessarModalEl ? btnProcessarModalEl.innerHTML : '';

    btnProcessarOriginal.disabled = true;
    btnProcessarOriginal.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processando...`;

    if (btnProcessarModalEl) {
      btnProcessarModalEl.disabled = true;
      btnProcessarModalEl.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processando...`;
    }
    initIcons();

    const chkInverter = document.getElementById('chk-inverter-ne-mesa') as HTMLInputElement | null;
    const inverterNE = chkInverter?.checked ? 'true' : 'false';

    let basesEnviadas = 0;
    let brutosEnviados = 0;
    let corrigidosProcessados = 0;
    let rtkProcessados = 0;

    for (const item of ctx.filesQueue) {
      if (item.destination === 'base') {
        const formDataBruto = new FormData();
        formDataBruto.append('categoria', 'Brutos');
        formDataBruto.append('file', item.file);
        try {
          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/upload-arquivo`, {
            method: 'POST',
            body: formDataBruto
          });
          const data = await res.json();
          if (res.ok) {
            brutosEnviados++;
          } else {
            const errMsg = data.error || data.detail || 'Falha no envio do arquivo bruto.';
            alert(`Erro no envio da Base ${item.file.name}: ${errMsg}`);
          }
        } catch (errBruto) {
          console.error('Erro ao salvar arquivo bruto da Base no workspace:', errBruto);
          alert(`Erro ao salvar arquivo bruto da Base ${item.file.name}`);
        }
        basesEnviadas++;
      } else if (item.destination === 'rover_estatico_bruto') {
        const formData = new FormData();
        formData.append('categoria', 'Brutos');
        formData.append('file', item.file);
        try {
          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/upload-arquivo`, {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (res.ok && data.success) {
            brutosEnviados++;
          } else {
            const errMsg = data.error || data.detail || data.message || 'Erro no upload';
            alert(`Erro no arquivo ${item.file.name}: ${errMsg}`);
          }
        } catch (err) {
          console.error('Erro ao enviar arquivo bruto:', err);
          alert(`Erro na comunicação ao subir ${item.file.name}`);
        }
      } else if (item.destination === 'rover_estatico_corrigido') {
        const mId = item.matricula_id || ctx.currentMatriculaId;
        const formData = new FormData();
        formData.append('file', item.file);
        if (mId) {
          formData.append('matricula_id', mId.toString());
        }
        formData.append('inverter_ne', inverterNE);
        try {
          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/importar-txt`, {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (!res.ok) {
            const errMsg = typeof data.detail === 'object' ? (data.detail.mensagem || JSON.stringify(data.detail)) : (data.detail || data.error || 'Erro desconhecido');
            alert(`Erro na importação de ${item.file.name}: ${errMsg}`);
          } else if (data.error) {
            alert(`Erro na importação de ${item.file.name}: ${data.error}`);
          } else {
            corrigidosProcessados++;
          }
        } catch (err) {
          console.error('Erro ao importar estático corrigido:', err);
          alert(`Erro na comunicação ao processar ${item.file.name}`);
        }
      } else if (item.destination === 'rover_rtk') {
        const mId = item.matricula_id || ctx.currentMatriculaId;
        const formData = new FormData();
        formData.append('file', item.file);
        if (mId) {
          formData.append('matricula_id', mId.toString());
        }
        if (item.base_escolhida_id) {
          formData.append('base_escolhida_id', item.base_escolhida_id.toString());
        }
        formData.append('inverter_ne', inverterNE);
        try {
          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/importar-txt`, {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (!res.ok) {
            const errMsg = typeof data.detail === 'object' ? (data.detail.mensagem || JSON.stringify(data.detail)) : (data.detail || data.error || 'Erro desconhecido');
            alert(`Erro na importação RTK de ${item.file.name}: ${errMsg}`);
          } else if (data.error) {
            alert(`Erro na importação RTK de ${item.file.name}: ${data.error}`);
          } else {
            rtkProcessados++;
          }
        } catch (err) {
          console.error('Erro ao importar RTK:', err);
          alert(`Erro na comunicação ao processar ${item.file.name}`);
        }
      }
    }

    let msgAlerta = 'Processamento do lote finalizado com sucesso!\n\n';
    if (basesEnviadas > 0) msgAlerta += `• ${basesEnviadas} Base(s) enviada(s) ao PPP IBGE.\n`;
    if (brutosEnviados > 0) msgAlerta += `• ${brutosEnviados} Rover(s) Estático(s) Bruto(s) salvos no Workspace.\n`;
    if (corrigidosProcessados > 0) msgAlerta += `• ${corrigidosProcessados} Rover(s) Estático(s) Corrigido(s) importados.\n`;
    if (rtkProcessados > 0) msgAlerta += `• ${rtkProcessados} RTK Rover(s) importado(s) e vinculado(s) à base.\n`;

    alert(msgAlerta);

    if (chkInverter) chkInverter.checked = false;
    ctx.filesQueue = [];

    btnProcessarOriginal.disabled = false;
    btnProcessarOriginal.innerHTML = originalHtmlBtn;
    if (btnProcessarModalEl) {
      btnProcessarModalEl.disabled = false;
      btnProcessarModalEl.innerHTML = originalHtmlModal;
    }
    initIcons();

    ctx.renderFilaArquivos();
    ctx.loadLevantamentoDetails();
  });
}
