import { API_BASE } from '../../config';
import { initIcons } from '../../utils';
import { renderHistoricoTimelineHtml } from '../mesa_trabalho_tabela';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

export const renderHistoricoCampo = async (ctx: MesaTrabalhoContext) => {
  const timeline = document.getElementById('timeline-historico-campo');
  if (!timeline || !ctx.currentLevId) return;

  try {
    timeline.innerHTML = `<div class="text-center py-8 text-white/30 flex flex-col items-center justify-center gap-2"><i data-lucide="refresh-cw" class="w-6 h-6 animate-spin text-mint-vibrant"></i> Carregando linha do tempo...</div>`;
    initIcons();

    const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/historico-campo`);
    const logs = await res.json();

    if (logs.length === 0) {
      timeline.innerHTML = `<div class="text-center py-8 text-white/30 border border-white/5 bg-white/[0.01] rounded-technical">Nenhum evento registrado nesta auditoria de campo.</div>`;
      return;
    }

    timeline.innerHTML = logs.map((log: any) => renderHistoricoTimelineHtml(log)).join('');

    initIcons();
  } catch (err) {
    console.error("Erro ao carregar histórico de campo:", err);
    timeline.innerHTML = `<div class="text-center py-8 text-red-400 border border-red-500/10 bg-red-500/[0.01] rounded-technical">Erro ao carregar auditoria de campo.</div>`;
  }
};

export function setupAuditoriaHistorico(ctx: MesaTrabalhoContext) {
  // Atrela as funções no contexto
  ctx.loadWorkspaceArquivos = async () => {
    if (!ctx.currentLevId) return;
    const container = document.getElementById('container-workspace-arquivos');
    if (!container) return;

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/arquivos`);
      const data = await res.json();
      if (data.error) {
        container.innerHTML = `<div class="text-red-400 p-8 text-center col-span-full">${data.error}</div>`;
        return;
      }

      const categoriasMap: { [key: string]: { label: string; icone: string; color: string; desc: string } } = {
        "Brutos": { label: "1. Brutos", icone: "file-box", color: "text-orange-400 bg-orange-500/10 border-orange-500/20", desc: "Binários .GNS / Cadernetas brutos" },
        "Rinex": { label: "2. Rinex", icone: "file-digit", color: "text-blue-400 bg-blue-500/10 border-blue-500/20", desc: "Arquivos de Observação/Navegação" },
        "Processados": { label: "3. Pós-Processados", icone: "cpu", color: "text-mint-vibrant bg-mint-vibrant/10 border-mint-vibrant/20", desc: "Corrigidos / PPP / Processados HGO" },
        "Exportacoes": { label: "4. Exportações", icone: "file-symlink", color: "text-purple-400 bg-purple-500/10 border-purple-500/20", desc: "KML gerados / DXF / Shapes" },
        "Documentos": { label: "5. Documentos", icone: "file-text", color: "text-pink-400 bg-pink-500/10 border-pink-500/20", desc: "DADOS_GERAIS.json / Snapshots" }
      };

      container.innerHTML = Object.keys(categoriasMap).map(cat => {
        const info = categoriasMap[cat];
        let arquivos = data[cat] || [];

        if (cat === "Rinex") {
          arquivos = arquivos.filter((f: any) => {
            const nameLower = f.nome.toLowerCase();
            return nameLower.endsWith('.obs') || nameLower.endsWith('.o') || /\.\d{2}o$/.test(nameLower);
          });
        }

        const arquivosHtml = arquivos.length === 0
          ? `<div class="text-[9px] text-white/20 italic py-3 text-center bg-white/[0.01] border border-dashed border-white/5 rounded-technical">Pasta vazia</div>`
          : arquivos.map((f: any) => `
            <div class="flex items-center justify-between p-2.5 md:p-1.5 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-technical text-xs md:text-[10px] gap-2 md:gap-1.5 transition-all group/item">
              <div class="min-w-0 flex-1">
                <p class="font-mono text-white truncate font-medium" title="${f.nome}">${f.nome}</p>
                <p class="text-[8px] text-white/30 font-mono mt-0.5">${f.tamanho} • ${f.modificado}</p>
              </div>
              <div class="flex items-center gap-3 md:gap-0.5 shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                <button class="btn-visualizar-workspace text-blue-400 hover:text-white p-3 md:p-0.5 hover:bg-blue-500/20 rounded transition-all active:scale-95 inline-flex items-center justify-center" data-cat="${cat}" data-nome="${f.nome}" title="Visualizar Arquivo">
                  <i data-lucide="eye" class="w-3 h-3"></i>
                </button>
                <button class="btn-download-workspace text-mint-vibrant hover:text-white p-3 md:p-0.5 hover:bg-mint-vibrant/20 rounded transition-all active:scale-95 inline-flex items-center justify-center" data-cat="${cat}" data-nome="${f.nome}" title="Download do Arquivo">
                  <i data-lucide="download" class="w-3 h-3"></i>
                </button>
                <button class="btn-deletar-workspace text-red-400 hover:text-white p-3 md:p-0.5 hover:bg-red-500/20 rounded transition-all active:scale-95 inline-flex items-center justify-center" data-cat="${cat}" data-nome="${f.nome}" title="Excluir Arquivo do Workspace">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          `).join('');

        return `
          <div class="flex flex-col bg-white/[0.01] border border-white/5 rounded-xl p-2.5 space-y-2">
            <div class="border-b border-white/5 pb-1.5">
              <div class="flex items-center gap-1 font-bold text-xs text-white">
                <span class="text-[9px] font-mono px-1.5 py-0.5 rounded border ${info.color}">${info.label}</span>
              </div>
              <p class="text-[8px] text-white/30 mt-0.5">${info.desc}</p>
            </div>
            <div class="flex-1 overflow-y-auto space-y-1.5 max-h-[115px] pr-1">
              ${arquivosHtml}
            </div>
          </div>
        `;
      }).join('');

      initIcons();
    } catch (e) {
      console.error("Erro ao carregar arquivos do Workspace:", e);
      container.innerHTML = `<div class="text-red-400 p-8 text-center col-span-full">Falha de conexão com o servidor API.</div>`;
    }
  };
}
