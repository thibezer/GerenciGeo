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

      // Design System §7.1 — Cards do Workspace GNSS
      // Ref: GerenciGeo_Design_UI.md — padding 12px 16px, bg-overlay nos itens, border-radius concêntrico
      const categoriasMap: { [key: string]: { label: string; seq: string; icone: string; desc: string } } = {
        "Brutos":      { label: "Brutos",          seq: "01", icone: "file-box",      desc: "Binários .GNS / Cadernetas brutos" },
        "Rinex":       { label: "Rinex",            seq: "02", icone: "file-digit",   desc: "Arquivos de Observação/Navegação" },
        "Processados": { label: "Pós-Processados",  seq: "03", icone: "cpu",          desc: "Corrigidos / PPP / Processados HGO" },
        "Exportacoes": { label: "Exportações",      seq: "04", icone: "file-symlink", desc: "KML gerados / DXF / Shapes" },
        "Documentos":  { label: "Documentos",       seq: "05", icone: "file-text",    desc: "DADOS_GERAIS.json / Snapshots" }
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

        const temArquivos = arquivos.length > 0;

        // Número sequencial: verde (acento único) quando tem arquivos; branco/20 quando vazio
        const seqColor = temArquivos ? "text-mint-vibrant" : "text-white/20";

        // Borda do card: default (branco 10%) com arquivos, subtle (branco 6%) sem
        const cardBorder = temArquivos ? "border-white/10" : "border-white/[0.06]";

        // Contagem de arquivos
        const countBadge = temArquivos
          ? `<span class="text-[9px] font-mono text-white/35 ml-auto">${arquivos.length}</span>`
          : `<span class="text-[9px] font-mono text-white/20 ml-auto">—</span>`;

        // Itens de arquivo: fundo bg-overlay diferenciado + border-radius concêntrico (card=rounded-xl → itens=rounded-md)
        // Ações ficam opacity-0 até hover do item (não poluem visualmente no repouso)
        const arquivosHtml = !temArquivos
          ? `<div class="text-[9px] text-white/20 italic py-2 text-center">Pasta vazia</div>`
          : arquivos.map((f: any) => `
            <div class="flex items-center justify-between px-2.5 py-2 bg-white/[0.06] hover:bg-white/[0.09] rounded-md gap-2 transition-all group/item cursor-default">
              <div class="min-w-0 flex-1">
                <p class="font-mono text-[11px] text-white/85 truncate font-medium leading-none" title="${f.nome}">${f.nome}</p>
                <p class="text-[8px] text-white/35 mt-1 font-mono">${f.tamanho} · ${f.modificado}</p>
              </div>
              <div class="flex items-center gap-px shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                <button class="btn-visualizar-workspace text-white/50 hover:text-white p-1 hover:bg-white/10 rounded transition-all active:scale-95" data-cat="${cat}" data-nome="${f.nome}" title="Visualizar">
                  <i data-lucide="eye" class="w-3 h-3"></i>
                </button>
                <button class="btn-download-workspace text-mint-vibrant hover:text-white p-1 hover:bg-mint-vibrant/20 rounded transition-all active:scale-95" data-cat="${cat}" data-nome="${f.nome}" title="Download">
                  <i data-lucide="download" class="w-3 h-3"></i>
                </button>
                <button class="btn-deletar-workspace text-white/30 hover:text-red-400 p-1 hover:bg-red-500/15 rounded transition-all active:scale-95" data-cat="${cat}" data-nome="${f.nome}" title="Excluir">
                  <i data-lucide="trash-2" class="w-3 h-3"></i>
                </button>
              </div>
            </div>
          `).join('');

        // Card: padding 12px 16px (py-3 px-4), gap interno 8px (gap-2)
        // Header: número (verde=acento único) + ícone + título + contagem
        // Subtítulo: text-tertiary, recua
        // Lista: scroll se > 3 itens, max-h definida
        return `
          <div class="flex flex-col bg-white/[0.015] border ${cardBorder} rounded-xl py-3 px-4 gap-2 transition-colors">
            <div class="flex flex-col gap-0.5">
              <div class="flex items-center gap-2">
                <span class="font-mono text-[10px] font-bold tracking-widest ${seqColor}">${info.seq}</span>
                <i data-lucide="${info.icone}" class="w-3.5 h-3.5 text-white/40 shrink-0"></i>
                <span class="text-[12px] font-semibold text-white/85">${info.label}</span>
                ${countBadge}
              </div>
              <p class="text-[8px] text-white/30 leading-snug pl-px">${info.desc}</p>
            </div>
            <div class="flex flex-col gap-1 overflow-y-auto max-h-[112px] pr-px">
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
