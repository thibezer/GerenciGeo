import { API_BASE } from '../../../config';
import { initIcons, showToast, customAlert } from '../../../utils';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';
import { detectarGruposSobrepostos } from './sobrepostos_detector';

/**
 * Abre o modal interativo para o usuário revisar e confirmar a unificação dos pontos
 */
export async function abrirModalUnificacaoSobrepostos(ctx: MesaTrabalhoContext, toleranciaInicial = 0.05): Promise<void> {
  let toleranciaAtual = toleranciaInicial;
  let grupos = detectarGruposSobrepostos(ctx, toleranciaAtual);

  if (grupos.length === 0 && toleranciaInicial === 0.05) {
    const grupos10cm = detectarGruposSobrepostos(ctx, 0.10);
    if (grupos10cm.length === 0) {
      showToast("Nenhum vértice sobreposto detectado no perímetro.", "info");
      return;
    }
    toleranciaAtual = 0.10;
    grupos = grupos10cm;
  }

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-sm transition-opacity duration-200 opacity-0 z-[999999]';

  const container = document.createElement('div');
  container.className = 'w-full max-w-2xl mx-4 bg-[#111113] border border-white/10 rounded-technical shadow-2xl p-6 transform scale-95 transition-transform duration-200 max-h-[88vh] flex flex-col';

  const renderConteudo = () => {
    const totalDuplicados = grupos.reduce((acc, g) => acc + (g.pontos.length - 1), 0);
    const totalComNomesDiferentes = grupos.filter(g => g.temNomesDiferentes).length;

    container.innerHTML = `
      <div class="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <i data-lucide="layers" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              Unificação de Vértices Sobrepostos
              ${totalComNomesDiferentes > 0 ? `<span class="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded font-mono font-bold">${totalComNomesDiferentes} com Nomes Diferentes</span>` : ''}
            </h3>
            <p class="text-[11px] text-white/50">Detectados <strong class="text-amber-400 font-mono">${grupos.length} grupo(s)</strong> com <strong class="text-amber-400 font-mono">${totalDuplicados} vértice(s) duplicado(s)</strong> nas mesmas coordenadas.</p>
          </div>
        </div>
        <button id="btn-fechar-modal-sobrepostos" class="text-white/40 hover:text-white transition-colors p-1" title="Fechar">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="py-3 flex items-center justify-between border-b border-white/5 shrink-0 text-xs">
        <span class="text-[11px] text-white/60 font-mono">Tolerância de Proximidade:</span>
        <div class="flex items-center gap-1.5">
          ${[
            { label: '3 cm', val: 0.03 },
            { label: '5 cm (Padrão)', val: 0.05 },
            { label: '10 cm', val: 0.10 },
            { label: '50 cm', val: 0.50 }
          ].map(t => `
            <button class="btn-tolerancia px-2 py-0.5 rounded text-[10px] font-mono transition-all border ${toleranciaAtual === t.val ? 'bg-mint-vibrant/20 text-mint-vibrant border-mint-vibrant/40 font-bold' : 'bg-white/5 text-white/50 border-white/10 hover:text-white'}" data-val="${t.val}">
              ${t.label}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="py-3 overflow-y-auto flex-1 flex flex-col gap-3 pr-1 text-xs">
        <div class="bg-white/[0.02] border border-white/5 p-2.5 rounded text-[11px] text-white/70 leading-relaxed">
          <span class="text-mint-vibrant font-bold">ℹ️ Como funciona a unificação:</span>
          O vértice marcado como <strong class="text-mint-vibrant">● Manter como Mestre</strong> permanecerá ativo no perímetro. Os outros vértices coincidentes serão marcados como <em>Fora do Polígono</em> (eliminando duplicatas e segmentos nulos de comprimento zero).
        </div>

        <div class="flex flex-col gap-3" id="lista-grupos-sobrepostos">
          ${grupos.length === 0 ? `
            <div class="text-center py-8 text-white/30 border border-white/5 bg-white/[0.01] rounded">
              Nenhum vértice sobreposto encontrado com a tolerância de ${(toleranciaAtual * 100).toFixed(0)} cm.
            </div>
          ` : grupos.map(g => `
            <div class="border border-white/10 bg-white/[0.02] rounded-technical p-3 flex flex-col gap-2 grupo-card" data-grupo-id="${g.id}">
              <div class="flex items-center justify-between border-b border-white/5 pb-2">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-bold text-[11px] text-amber-300 flex items-center gap-1.5">
                    <i data-lucide="map-pin" class="w-3 h-3 text-amber-400"></i> Grupo #${g.id} (${g.pontos.length} vértices coincidentes)
                  </span>
                  ${g.temNomesDiferentes ? `
                    <span class="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded text-[8.5px] font-mono font-bold" title="Estes vértices possuem nomes diferentes mas ocupam as mesmas coordenadas exatas">
                      ⚠️ Nomes Diferentes
                    </span>
                  ` : ''}
                </div>
                <span class="text-[10px] font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded">
                  Δ máx: ${(g.distanciaMaxMetros * 1000).toFixed(1)} mm
                </span>
              </div>

              <div class="flex flex-col gap-1.5 mt-1">
                ${g.pontos.map((item) => {
                  const p = item.ponto;
                  const isChecked = item.isSugeridoMestre ? 'checked' : '';
                  const statusClass = (p.status_ponto === 'CORRIGIDO') ? 'bg-mint-vibrant/20 text-mint-vibrant border-mint-vibrant/30' : 'bg-white/5 text-white/50 border-white/10';
                  const statusLabel = p.status_ponto || 'BRUTO';
                  const arqOrigem = p.arquivo_origem || 'Manual';

                  return `
                    <label class="flex items-center justify-between p-2 rounded bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 cursor-pointer transition-all option-vertice">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <input type="radio" name="mestre_grupo_${g.id}" value="${p.id}" ${isChecked} class="radio-mestre text-mint-vibrant focus:ring-mint-vibrant/20 bg-white/5 border-white/10 w-3.5 h-3.5 cursor-pointer" />
                        <div class="flex flex-col min-w-0">
                          <div class="flex items-center gap-1.5">
                            <span class="font-bold text-white font-mono text-[11px] truncate">${p.nome_vertice || `Ponto #${p.id}`}</span>
                            <span class="text-[9px] px-1 py-0.2 rounded border font-mono ${statusClass}">${statusLabel}</span>
                            <span class="text-[9px] text-white/40 font-mono">(${p.tipo_ponto || p.tipo || 'P'})</span>
                            ${item.isSugeridoMestre ? `<span class="text-[8.5px] text-mint-vibrant font-mono font-bold bg-mint-vibrant/10 px-1 py-0.2 rounded">Sugerido Mestre</span>` : ''}
                          </div>
                          <span class="text-[9px] text-white/30 truncate mt-0.5" title="${arqOrigem}">Origem: ${arqOrigem}</span>
                        </div>
                      </div>

                      <div class="text-right font-mono text-[10px] text-white/40 shrink-0">
                        ${p.e_corrigido ? `E: ${Number(p.e_corrigido).toFixed(2)} | N: ${Number(p.n_corrigido).toFixed(2)}` : `Lat: ${Number(p.lat).toFixed(6)}`}
                      </div>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="flex items-center justify-between pt-4 border-t border-white/10 shrink-0 gap-3">
        <span class="text-[10px] text-white/40 font-mono">
          <i data-lucide="rotate-ccw" class="w-3 h-3 inline mr-1 text-mint-vibrant"></i> Você poderá desfazer a qualquer momento com <strong>Ctrl+Z</strong>
        </span>
        <div class="flex items-center gap-2">
          <button id="btn-cancelar-modal-sobrepostos" class="px-3 py-1.5 rounded text-white/60 hover:text-white hover:bg-white/5 transition-colors font-medium text-xs">
            Cancelar
          </button>
          <button id="btn-confirmar-unificacao-sobrepostos" class="px-4 py-1.5 rounded bg-mint-vibrant text-black hover:bg-mint-vibrant/90 font-bold transition-all text-xs flex items-center gap-1.5 shadow-lg shadow-mint-vibrant/10 ${grupos.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}" ${grupos.length === 0 ? 'disabled' : ''}>
            <i data-lucide="check" class="w-3.5 h-3.5"></i> Unificar ${totalDuplicados} Vértice(s)
          </button>
        </div>
      </div>
    `;

    initIcons();

    container.querySelectorAll('.btn-tolerancia').forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        const val = parseFloat(btn.getAttribute('data-val') || '0.05');
        toleranciaAtual = val;
        grupos = detectarGruposSobrepostos(ctx, toleranciaAtual);
        renderConteudo();
      };
    });

    const fecharModal = () => {
      overlay.classList.add('opacity-0');
      container.classList.add('scale-95');
      setTimeout(() => overlay.remove(), 200);
    };

    const btnFechar = container.querySelector('#btn-fechar-modal-sobrepostos') as HTMLElement | null;
    const btnCancelar = container.querySelector('#btn-cancelar-modal-sobrepostos') as HTMLElement | null;
    if (btnFechar) btnFechar.onclick = fecharModal;
    if (btnCancelar) btnCancelar.onclick = fecharModal;

    const btnConfirmar = container.querySelector('#btn-confirmar-unificacao-sobrepostos') as HTMLButtonElement | null;
    if (btnConfirmar && grupos.length > 0) {
      btnConfirmar.onclick = async () => {
        btnConfirmar.disabled = true;
        btnConfirmar.innerHTML = `<i data-lucide="refresh-cw" class="w-3.5 h-3.5 animate-spin"></i> Unificando...`;
        initIcons();

        try {
          if (ctx.salvarEstadoHistorico) {
            ctx.salvarEstadoHistorico(`Unificação de ${totalDuplicados} pontos sobrepostos`);
          }

          const pontosParaIgnorarIds: number[] = [];

          grupos.forEach(g => {
            const radioSelecionado = container.querySelector(`input[name="mestre_grupo_${g.id}"]:checked`) as HTMLInputElement | null;
            const idMestreEscolhido = radioSelecionado ? parseInt(radioSelecionado.value) : g.pontos[0].ponto.id;

            g.pontos.forEach(item => {
              if (item.ponto.id !== idMestreEscolhido) {
                pontosParaIgnorarIds.push(item.ponto.id);
              }
            });
          });

          if (ctx.pontosList) {
            ctx.pontosList.forEach(p => {
              if (pontosParaIgnorarIds.includes(p.id)) {
                p.ignorar_poligono = 1;
              }
            });
          }

          if (ctx.currentLevId) {
            const payload = {
              pontos: pontosParaIgnorarIds.map(pid => ({
                id: pid,
                ignorar_poligono: 1
              }))
            };

            const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos/batch`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.detail || errData.error || "Falha ao persistir unificação no servidor.");
            }
          }

          fecharModal();
          showToast(`${totalDuplicados} vértice(s) sobreposto(s) unificados com sucesso! (Pressione Ctrl+Z para desfazer)`, "success", 4000);

          if (ctx.renderListaReordenarSimplificada) ctx.renderListaReordenarSimplificada();
          if (ctx.atualizarPolilinhaMapaTemp) ctx.atualizarPolilinhaMapaTemp();
          if (ctx.renderMatriculaDados) ctx.renderMatriculaDados();
          if (ctx.salvarRascunhoLocal) ctx.salvarRascunhoLocal();

          const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
          if (btnSalvar) {
            btnSalvar.classList.remove('hidden');
            btnSalvar.classList.add('animate-pulse');
          }
        } catch (err: any) {
          console.error("Erro na unificação de sobrepostos:", err);
          await customAlert(err.message || "Ocorreu um erro ao unificar os pontos sobrepostos.", "Erro na Unificação");
          btnConfirmar.disabled = false;
          btnConfirmar.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> Unificar ${totalDuplicados} Vértice(s)`;
          initIcons();
        }
      };
    }
  };

  document.body.appendChild(overlay);
  overlay.appendChild(container);
  renderConteudo();

  requestAnimationFrame(() => {
    overlay.classList.remove('opacity-0');
    container.classList.remove('scale-95');
  });
}
