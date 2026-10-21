import { showToast } from '../../utils';
import { API_BASE } from '../../config';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

export interface PontoCADPreview {
  id: string;
  tipo: string;
  bloco: string;
  x: number;
  y: number;
  z: number;
  poligono: string;
  ordem: number;
  sigma: string;
  metpos: string;
  tiplim: string;
  cns: string;
  matr: string;
  confro: string;
  existente: boolean;
}

/**
 * Faz o parse estruturado do payload copiado via comando GCOPIA no AutoCAD.
 */
export function parsearPayloadCAD(text: string, pontosExistentes: any[]): {
  pontos: PontoCADPreview[];
  total: number;
  naPoligonal: number;
  suporte: number;
  novos: number;
  atualizados: number;
  confrontantes: string[];
} {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const pontos: PontoCADPreview[] = [];
  const confrontantesSet = new Set<string>();
  const nomesExistentes = new Set((pontosExistentes || []).map(p => (p.nome_vertice || p.nome || '').toUpperCase()));

  for (const line of lines) {
    const parts = line.split(';');
    let x = 0, y = 0, z = 0;
    let id = '', tipo = '', bloco = '', poligono = '1', ordem = 0;
    let sigma = '0.000', metpos = '', tiplim = '', cns = '', matr = '', confro = '';

    for (const part of parts) {
      if (part.includes('=') && !part.startsWith('ATRIB(')) {
        const [param, val] = part.split('=');
        const pUpper = param.trim().toUpperCase();
        const vTrim = (val || '').trim();
        if (pUpper === 'BLOCO') bloco = vTrim;
        else if (pUpper === 'X') x = parseFloat(vTrim) || 0;
        else if (pUpper === 'Y') y = parseFloat(vTrim) || 0;
        else if (pUpper === 'Z') z = parseFloat(vTrim) || 0;
        else if (pUpper === 'POLIGONO') poligono = vTrim;
        else if (pUpper === 'ORDEM') ordem = parseInt(vTrim) || 0;
      }

      if (part.startsWith('ATRIB(') && part.endsWith(')')) {
        const attrStr = part.slice(6, -1);
        const regex = /(ID|TIPO|SIGMA|METPOS|TIPLIM|CNS|MATR|CONFRO)\s*:\s*(.*?)(?=(?:,\s*(?:ID|TIPO|SIGMA|METPOS|TIPLIM|CNS|MATR|CONFRO)\s*:)|$)/gi;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(attrStr)) !== null) {
          const k = match[1].trim().toUpperCase();
          const v = match[2].trim();
          if (k === 'ID') id = v;
          else if (k === 'TIPO') tipo = v.toUpperCase();
          else if (k === 'SIGMA') sigma = v;
          else if (k === 'METPOS') metpos = v;
          else if (k === 'TIPLIM') tiplim = v;
          else if (k === 'CNS') cns = v;
          else if (k === 'MATR') matr = v;
          else if (k === 'CONFRO') confro = v;
        }
      }
    }

    if (!id || x === 0 || y === 0) continue;

    // Inferência inteligente de tipo
    let tipoFinal = tipo;
    if (!tipoFinal || tipoFinal === 'V') {
      const bUpper = bloco.toUpperCase();
      const idUpper = id.toUpperCase();
      if (bUpper.includes('MEMOVEM') || idUpper.includes('-M-')) tipoFinal = 'M';
      else if (bUpper.includes('MEMOVEP') || idUpper.includes('-P-')) tipoFinal = 'P';
      else if (bUpper.includes('MEMOVEB') || idUpper.includes('-B-') || idUpper.startsWith('BASE')) tipoFinal = 'B';
      else tipoFinal = tipoFinal || 'V';
    }

    if (confro && confro.trim()) {
      confrontantesSet.add(confro.trim());
    }

    const jaExiste = nomesExistentes.has(id.toUpperCase());

    pontos.push({
      id,
      tipo: tipoFinal,
      bloco,
      x,
      y,
      z,
      poligono,
      ordem,
      sigma,
      metpos,
      tiplim,
      cns,
      matr,
      confro,
      existente: jaExiste
    });
  }

  const naPoligonal = pontos.filter(p => p.poligono === '1').length;
  const suporte = pontos.filter(p => p.poligono === '0').length;
  const novos = pontos.filter(p => !p.existente).length;
  const atualizados = pontos.filter(p => p.existente).length;

  return {
    pontos,
    total: pontos.length,
    naPoligonal,
    suporte,
    novos,
    atualizados,
    confrontantes: Array.from(confrontantesSet)
  };
}

/**
 * Renderiza o modal de conferência inteligente com preview dos vértices, suporte a polilinha e opções de destino.
 */
export function abrirModalConfirmacaoCAD(ctx: MesaTrabalhoContext, preview: ReturnType<typeof parsearPayloadCAD>, rawText: string): void {
  const existingModal = document.getElementById('modal-cad-sync-preview');
  if (existingModal) existingModal.remove();

  const matriculasOptionsHtml = (ctx.matriculasList && ctx.matriculasList.length > 0)
    ? ctx.matriculasList.map((m: any) => `
        <option value="${m.id}" ${String(ctx.currentMatriculaId) === String(m.id) ? 'selected' : ''}>
          Matrícula ${m.numero_matricula || m.num_matricula || m.id} (${(m.area_ha || m.area || 0).toFixed(2)} ha)
        </option>
      `).join('')
    : `<option value="">[Sem Matrícula Registrada]</option>`;

  const linhasPreviewHtml = preview.pontos.map(p => `
    <tr class="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors text-[11px]">
      <td class="px-3 py-1.5 font-mono font-bold text-white flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full ${p.tipo === 'M' ? 'bg-amber-400' : p.tipo === 'P' ? 'bg-mint-vibrant' : p.tipo === 'B' ? 'bg-purple-400' : 'bg-sky-400'}"></span>
        ${p.id}
      </td>
      <td class="px-3 py-1.5">
        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${p.tipo === 'M' ? 'bg-amber-500/20 text-amber-300' : p.tipo === 'P' ? 'bg-mint-vibrant/20 text-mint-vibrant' : p.tipo === 'B' ? 'bg-purple-500/20 text-purple-300' : 'bg-sky-500/20 text-sky-300'}">
          ${p.tipo === 'M' ? 'Marco' : p.tipo === 'P' ? 'Ponto' : p.tipo === 'B' ? 'Base' : 'Virtual'}
        </span>
      </td>
      <td class="px-3 py-1.5">
        ${p.poligono === '1'
          ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 flex items-center gap-1 w-max">
               <i data-lucide="check" class="w-3 h-3"></i> Perímetro #${p.ordem}
             </span>`
          : `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/5 text-white/40 border border-white/10 flex items-center gap-1 w-max">
               <i data-lucide="minus" class="w-3 h-3"></i> Suporte (Fora)
             </span>`}
      </td>
      <td class="px-3 py-1.5 font-mono text-white/70">${p.x.toFixed(3)}</td>
      <td class="px-3 py-1.5 font-mono text-white/70">${p.y.toFixed(3)}</td>
      <td class="px-3 py-1.5 text-white/80 max-w-[180px] truncate" title="${p.confro || '-'}">${p.confro || '-'}</td>
      <td class="px-3 py-1.5 text-white/60">${p.metpos || '-'}</td>
    </tr>
  `).join('');

  const modalHtml = `
    <div id="modal-cad-sync-preview" class="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4" style="z-index: var(--geo-z-max, 100000);">
      <div class="glass-card w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-mint-vibrant/30 rounded-2xl bg-[#0c1510]/95">
        <div class="p-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-mint-vibrant/10 border border-mint-vibrant/30 flex items-center justify-center text-mint-vibrant shadow-inner">
              <i data-lucide="refresh-cw" class="w-5 h-5 animate-spin-slow"></i>
            </div>
            <div>
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                Sincronização Inteligente do CAD
                <span class="px-2 py-0.5 text-[10px] rounded-full bg-mint-vibrant/20 text-mint-vibrant border border-mint-vibrant/30 font-mono">
                  AutoCAD / TopoCAD
                </span>
              </h3>
              <p class="text-xs text-white/50">Conferência dos vértices, topologia da polilinha e amarração de confrontantes</p>
            </div>
          </div>
          <button class="text-white/40 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5" id="btn-fechar-cad-preview" type="button">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div class="p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="bg-white/[0.03] border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <span class="text-[10px] text-white/50 font-bold uppercase tracking-wider">No Perímetro</span>
              <div class="flex items-baseline gap-1.5 mt-1">
                <span class="text-xl font-bold font-mono text-mint-vibrant">${preview.naPoligonal}</span>
                <span class="text-[11px] text-white/40">vértices</span>
              </div>
              <span class="text-[9px] text-mint-vibrant/80 mt-1">Sequência via Polilinha</span>
            </div>

            <div class="bg-white/[0.03] border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <span class="text-[10px] text-white/50 font-bold uppercase tracking-wider">Pontos de Suporte</span>
              <div class="flex items-baseline gap-1.5 mt-1">
                <span class="text-xl font-bold font-mono text-white/70">${preview.suporte}</span>
                <span class="text-[11px] text-white/40">fora</span>
              </div>
              <span class="text-[9px] text-white/40 mt-1">Ignorados no polígono</span>
            </div>

            <div class="bg-white/[0.03] border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <span class="text-[10px] text-white/50 font-bold uppercase tracking-wider">Confrontantes</span>
              <div class="flex items-baseline gap-1.5 mt-1">
                <span class="text-xl font-bold font-mono text-purple-300">${preview.confrontantes.length}</span>
                <span class="text-[11px] text-white/40">detectados</span>
              </div>
              <span class="text-[9px] text-purple-300/80 mt-1">Auto-amarração</span>
            </div>

            <div class="bg-white/[0.03] border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <span class="text-[10px] text-white/50 font-bold uppercase tracking-wider">Operações</span>
              <div class="flex items-baseline gap-1.5 mt-1">
                <span class="text-xs font-bold text-amber-300">${preview.novos} novos</span>
                <span class="text-[10px] text-white/40">/</span>
                <span class="text-xs font-bold text-sky-300">${preview.atualizados} atualiz.</span>
              </div>
              <span class="text-[9px] text-white/40 mt-1">Upsert determinístico</span>
            </div>
          </div>

          <div class="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label class="block text-[10px] text-white/50 uppercase font-bold mb-1.5">Matrícula de Destino dos Vértices *</label>
                <select id="select-cad-target-matricula" class="glass-input w-full text-xs bg-[#0c1510] border-white/10 text-white rounded-lg p-2">
                  ${matriculasOptionsHtml}
                </select>
              </div>

              <div class="flex items-center gap-3 pt-4 sm:pt-0">
                <input type="checkbox" id="chk-cad-reconstruir-poligonal" checked class="rounded border-white/20 text-mint-vibrant bg-white/5 focus:ring-0 w-4 h-4 cursor-pointer" />
                <label for="chk-cad-reconstruir-poligonal" class="text-xs text-white/80 cursor-pointer select-none">
                  <strong>Reconstruir Poligonal Perimetral</strong>
                  <span class="block text-[10px] text-white/40">Gera as divisas e fecha o polígono na sequência exata da polilinha do CAD.</span>
                </label>
              </div>
            </div>
          </div>

          <div class="border border-white/10 rounded-xl overflow-hidden bg-black/20">
            <div class="px-4 py-2.5 bg-white/[0.03] border-b border-white/10 flex justify-between items-center">
              <span class="text-xs font-bold text-white flex items-center gap-2">
                <i data-lucide="list" class="w-3.5 h-3.5 text-mint-vibrant"></i>
                Vértices Identificados no Payload (${preview.total})
              </span>
              <span class="text-[10px] text-white/40">Coordenadas em UTM Zone 22S (SIRGAS 2000)</span>
            </div>
            
            <div class="max-h-56 overflow-y-auto custom-scrollbar">
              <table class="w-full text-left border-collapse">
                <thead class="bg-white/[0.02] border-b border-white/5 text-[9px] uppercase tracking-wider text-white/40 sticky top-0 bg-[#0c1510]">
                  <tr>
                    <th class="px-3 py-2">Vértice</th>
                    <th class="px-3 py-2">Tipo</th>
                    <th class="px-3 py-2">Poligonal</th>
                    <th class="px-3 py-2">Este (X)</th>
                    <th class="px-3 py-2">Norte (Y)</th>
                    <th class="px-3 py-2">Confrontante</th>
                    <th class="px-3 py-2">Método</th>
                  </tr>
                </thead>
                <tbody>
                  ${linhasPreviewHtml}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end items-center gap-3">
          <button type="button" class="btn-secondary text-xs px-4 py-2" id="btn-cancelar-cad-sync">
            Cancelar
          </button>
          <button type="button" class="btn-primary text-xs px-5 py-2 flex items-center gap-2 shadow-lg shadow-mint-vibrant/20 font-bold" id="btn-confirmar-cad-sync">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            Confirmar e Sincronizar Vértices
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  if ((window as any).lucide && typeof (window as any).lucide.createIcons === 'function') {
    (window as any).lucide.createIcons();
  }

  const modalEl = document.getElementById('modal-cad-sync-preview');
  const btnFechar = document.getElementById('btn-fechar-cad-preview');
  const btnCancelar = document.getElementById('btn-cancelar-cad-sync');
  const btnConfirmar = document.getElementById('btn-confirmar-cad-sync') as HTMLButtonElement;

  const fecharModal = () => {
    if (modalEl) modalEl.remove();
  };

  btnFechar?.addEventListener('click', fecharModal);
  btnCancelar?.addEventListener('click', fecharModal);

  btnConfirmar?.addEventListener('click', async () => {
    const selectMat = document.getElementById('select-cad-target-matricula') as HTMLSelectElement;
    const chkReconstruir = document.getElementById('chk-cad-reconstruir-poligonal') as HTMLInputElement;

    const matriculaIdEscolhida = selectMat && selectMat.value ? parseInt(selectMat.value) : (ctx.currentMatriculaId || undefined);
    const reconstruirPoligonal = chkReconstruir ? chkReconstruir.checked : true;

    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Sincronizando...`;
    if ((window as any).lucide && typeof (window as any).lucide.createIcons === 'function') {
      (window as any).lucide.createIcons();
    }

    try {
      const resp = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos/sincronizar-cad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          payload_cad: rawText,
          matricula_id: matriculaIdEscolhida,
          reconstruir_poligonal: reconstruirPoligonal
        })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || "Erro ao processar a sincronização do CAD no servidor.");
      }

      const data = await resp.json();
      fecharModal();

      showToast(data.mensagem || "Sincronização com o CAD concluída com sucesso!", "success");

      if (typeof ctx.loadLevantamentoDetails === 'function') {
        await ctx.loadLevantamentoDetails();
      }

      if (typeof ctx.alternarEtapa === 'function') {
        ctx.alternarEtapa(ctx.etapaAtiva);
      }
    } catch (err: any) {
      console.error("Erro na sincronização:", err);
      alert(err.message || "Falha ao sincronizar pontos com o servidor.");
      btnConfirmar.disabled = false;
      btnConfirmar.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4"></i> Tentar Novamente`;
    }
  });
}

/**
 * Importa/Sincroniza os vértices do CAD via Clipboard com Modal Interativo de Conferência.
 */
export async function importarDoCADClipboard(ctx: MesaTrabalhoContext): Promise<void> {
  if (!ctx.currentLevId) {
    alert("Nenhum levantamento ativo selecionado!");
    return;
  }

  try {
    const text = await navigator.clipboard.readText();
    if (!text || (!text.includes("ACAO=") && !text.includes("ATRIB("))) {
      alert("A área de transferência não contém um payload válido do CAD. Selecione a polilinha e os pontos no AutoCAD/TopoCAD e execute o comando GCOPIAR antes de importar.");
      return;
    }

    const preview = parsearPayloadCAD(text, ctx.pontosList || []);
    if (preview.total === 0) {
      alert("Nenhum vértice válido encontrado no payload da Área de Transferência.");
      return;
    }

    abrirModalConfirmacaoCAD(ctx, preview, text);
  } catch (err: any) {
    console.error("Erro na importação do CAD:", err);
    alert(err.message || "Falha ao ler a área de transferência ou sincronizar os pontos com o CAD.");
  }
}
