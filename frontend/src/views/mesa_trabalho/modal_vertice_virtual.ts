import L from 'leaflet';
import { API_BASE } from '../../config';
import { showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import type { LadoOffset, RespostaVerticeVirtual } from '../../types/verticesVirtuais';

export async function abrirModalVerticeVirtual(ctx: MesaTrabalhoContext): Promise<void> {
  const levId = ctx.currentLevId;
  const matId = ctx.currentMatriculaId;
  const map = ctx.triagemMap;

  if (!levId || !matId) {
    showToast('Selecione um levantamento e matrícula ativos para criar vértices virtuais.', 'info');
    return;
  }

  // Identifica pontos elegíveis
  const pontosDisponiveis = (ctx.pontosList || []).filter(p => !p.ignorar_poligono);
  if (pontosDisponiveis.length < 2) {
    showToast('São necessários pelo menos 2 pontos cadastrados no levantamento para cálculo virtual.', 'info');
    return;
  }

  // Camadas de preview no Leaflet
  let previewLayerGroup: L.LayerGroup | null = null;
  if (map) {
    previewLayerGroup = L.layerGroup().addTo(map);
  }

  const limparPreviewMapa = () => {
    if (previewLayerGroup && map) {
      previewLayerGroup.clearLayers();
    }
  };

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-200 opacity-0 z-[999999]';

  const container = document.createElement('div');
  container.className = 'w-full max-w-3xl mx-4 bg-[#111113] border border-white/10 rounded-technical shadow-2xl p-6 transform scale-95 transition-transform duration-200 max-h-[90vh] flex flex-col text-white';

  // Pré-seleção: se houver pontos selecionados, usa-os
  const idsIniciais = (ctx.selectedPontoIds && ctx.selectedPontoIds.length >= 2)
    ? ctx.selectedPontoIds
    : pontosDisponiveis.slice(0, 4).map(p => p.id);

  let abaAtiva: 'offset' | 'pa1pa2' = 'offset';
  let distanciaOffset = 15.0;
  let ladoOffset: LadoOffset = 'DIREITA';
  let prefixoNome = 'V';
  let pontosSelecionadosIds: number[] = [...idsIniciais];

  let resultadosOffset: RespostaVerticeVirtual[] = [];
  // // let resultadoPA1PA2
  let calculando = false;

  const fecharModal = () => {
    limparPreviewMapa();
    if (previewLayerGroup && map) {
      map.removeLayer(previewLayerGroup);
    }
    overlay.classList.remove('opacity-100');
    overlay.classList.add('opacity-0');
    container.classList.remove('scale-100');
    container.classList.add('scale-95');
    setTimeout(() => overlay.remove(), 200);
  };

  const desenharPreviewLoteNoMapa = (resultados: RespostaVerticeVirtual[]) => {
    if (!previewLayerGroup || !map || resultados.length === 0) return;
    previewLayerGroup.clearLayers();

    // Converte UTM para LatLng aproximado baseado nos pontos de apoio ou pela API
    const latlngs: L.LatLngExpression[] = [];
    resultados.forEach(r => {
      // Procura ponto mais próximo para obter projeção de referência
      const ptRef = pontosDisponiveis[0];
      if (ptRef && ptRef.lat && ptRef.lon && (ptRef.e_corrigido || ptRef.e_original)) {
        const eOrig = Number(ptRef.e_corrigido || ptRef.e_original);
        const nOrig = Number(ptRef.n_corrigido || ptRef.n_original);
        const dE = r.este - eOrig;
        const dN = r.norte - nOrig;
        // Aproximação métrica local (1 grau lat ~ 111.000m, lon ~ 111.000m * cos(lat))
        const dLat = dN / 111139.0;
        const dLon = dE / (111139.0 * Math.cos((ptRef.lat * Math.PI) / 180));
        const pos: [number, number] = [ptRef.lat + dLat, ptRef.lon + dLon];
        latlngs.push(pos);

        const marker = L.circleMarker(pos, {
          radius: 5,
          color: '#10b981',
          weight: 2,
          fillColor: '#059669',
          fillOpacity: 0.8
        });
        marker.bindTooltip(`<b>${r.nome} (Virtual)</b><br>E: ${r.este.toFixed(3)} | N: ${r.norte.toFixed(3)}<br>σP: ${(r.sigmaPlanimetrico * 100).toFixed(1)} cm`, {
          permanent: false,
          direction: 'top'
        });
        previewLayerGroup.addLayer(marker);
      }
    });

    if (latlngs.length >= 2) {
      const line = L.polyline(latlngs, {
        color: '#10b981',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.85
      });
      previewLayerGroup.addLayer(line);
      map.fitBounds(line.getBounds(), { padding: [50, 50], maxZoom: 18 });
    }
  };

  const calcularOffsetApi = async () => {
    if (pontosSelecionadosIds.length < 2) {
      showToast('Selecione pelo menos 2 pontos de apoio.', 'info');
      return;
    }
    calculando = true;
    renderConteudo();

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/vertices-virtuais/calcular-offset-lote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ponto_ids: pontosSelecionadosIds,
          distancia: distanciaOffset,
          lado: ladoOffset,
          prefixo_nome: prefixoNome || 'V'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao calcular offset.');

      resultadosOffset = data.resultados || [];
      desenharPreviewLoteNoMapa(resultadosOffset);
      showToast(`Cálculo concluído: ${resultadosOffset.length} vértices virtuais gerados na prévia.`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      calculando = false;
      renderConteudo();
    }
  };

  const confirmarInsercaoLote = async () => {
    if (resultadosOffset.length === 0) {
      showToast('Calcule a prévia dos vértices antes de confirmar.', 'info');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/vertices-virtuais/confirmar-lote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fuso_utm: 22,
          vertices: resultadosOffset.map(r => ({
            nome_vertice: r.nome,
            este: r.este,
            norte: r.norte,
            altitude: r.altitude,
            sigma_este: r.sigmaEste,
            sigma_norte: r.sigmaNorte,
            sigma_altitude: r.sigmaAltitude,
            sigma_planimetrico: r.sigmaPlanimetrico,
            metodo: r.metodo
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao persistir vértices virtuais.');

      showToast(data.mensagem || 'Vértices virtuais inseridos no perímetro com sucesso!', 'success');
      fecharModal();
      if (typeof ctx.loadLevantamentoDetails === 'function') {
        await ctx.loadLevantamentoDetails();
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const renderConteudo = () => {
    container.innerHTML = `
      <div class="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
          <div>
            <h3 class="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              Gerador de Vértices Virtuais (Tipo 'V')
              <span class="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold">INCRA / SIGEF 3ª Ed.</span>
            </h3>
            <p class="text-[11px] text-white/50">Determinação analítica com LPV (Lei de Propagação de Variâncias) e deslocamento paralelo estilo CAD.</p>
          </div>
        </div>
        <button id="btn-fechar-modal-vvirtual" class="text-white/40 hover:text-white transition-colors p-1" title="Fechar (ESC)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Abas -->
      <div class="flex items-center gap-2 pt-3 border-b border-white/10 text-xs shrink-0">
        <button id="tab-offset" class="pb-2 px-3 border-b-2 font-bold transition-all ${abaAtiva === 'offset' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-white/50 hover:text-white'}">
          Deslocamento em Cadeia (Offset AutoCAD)
        </button>
        <button id="tab-pa1pa2" class="pb-2 px-3 border-b-2 font-bold transition-all ${abaAtiva === 'pa1pa2' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-white/50 hover:text-white'}">
          Faixa de Domínio Conjugada (PA1 + PA2)
        </button>
      </div>

      <div class="py-4 overflow-y-auto space-y-4 flex-1 text-xs">
        ${abaAtiva === 'offset' ? `
          <!-- Painel Offset em Cadeia -->
          <div class="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-3">
            <div class="flex items-center justify-between">
              <span class="font-bold text-white/80">Parâmetros de Deslocamento</span>
              <span class="text-[11px] text-white/40 font-mono">${pontosSelecionadosIds.length} pontos de apoio selecionados</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-[10px] text-white/50 mb-1">Distância do Offset (metros)</label>
                <div class="flex items-center gap-1">
                  <input id="input-dist-offset" type="number" step="0.5" min="0.1" value="${distanciaOffset}" class="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono" />
                </div>
                <div class="flex gap-1 mt-1">
                  ${[5, 10, 15, 20, 25, 30].map(d => `
                    <button type="button" class="btn-preset-dist text-[9px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white/70" data-val="${d}">
                      ${d}m
                    </button>
                  `).join('')}
                </div>
              </div>

              <div>
                <label class="block text-[10px] text-white/50 mb-1">Lado do Deslocamento</label>
                <div class="grid grid-cols-2 gap-1.5">
                  <button type="button" id="btn-lado-dir" class="py-1.5 text-center rounded border font-semibold text-xs transition-all ${ladoOffset === 'DIREITA' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}">
                    Direita
                  </button>
                  <button type="button" id="btn-lado-esq" class="py-1.5 text-center rounded border font-semibold text-xs transition-all ${ladoOffset === 'ESQUERDA' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}">
                    Esquerda
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-[10px] text-white/50 mb-1">Prefixo do Vértice</label>
                <input id="input-prefixo" type="text" value="${prefixoNome}" placeholder="Ex: V" class="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono uppercase" />
                <span class="text-[9px] text-white/40">Gera ${prefixoNome}-01, ${prefixoNome}-02...</span>
              </div>
            </div>

            <div class="pt-2 flex items-center justify-between border-t border-white/5">
              <span class="text-[11px] text-white/50">Cadeia de apoio: <span class="text-white/80 font-mono">${pontosSelecionadosIds.map(pid => {
                const p = pontosDisponiveis.find(pt => pt.id === pid);
                return p?.nome_vertice || `P${pid}`;
              }).join(' → ')}</span></span>
              <button id="btn-calcular-preview-lote" class="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 font-bold rounded text-xs transition-all border border-emerald-500/30 flex items-center gap-1.5" ${calculando ? 'disabled' : ''}>
                ${calculando ? '<span class="animate-spin">⏳</span> Calculando...' : '🔍 Calcular Prévia e Visualizar no Mapa'}
              </button>
            </div>
          </div>

          <!-- Tabela de Resultados -->
          ${resultadosOffset.length > 0 ? `
            <div class="border border-white/10 rounded-lg overflow-hidden bg-black/20">
              <div class="px-3 py-2 bg-white/5 border-b border-white/10 flex items-center justify-between">
                <span class="font-bold text-white/90">Vértices Calculados (${resultadosOffset.length})</span>
                <span class="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                  ✓ Limite Artificial INCRA: σP ≤ 0.50 m
                </span>
              </div>
              <div class="max-h-48 overflow-y-auto">
                <table class="w-full text-left border-collapse text-[11px]">
                  <thead class="bg-white/[0.02] text-white/50 font-mono border-b border-white/5">
                    <tr>
                      <th class="p-2">Nome</th>
                      <th class="p-2">Este (X)</th>
                      <th class="p-2">Norte (Y)</th>
                      <th class="p-2">Altitude (Z)</th>
                      <th class="p-2">Incerteza (σP)</th>
                      <th class="p-2">Método</th>
                      <th class="p-2">Conformidade</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5 font-mono">
                    ${resultadosOffset.map(r => `
                      <tr class="hover:bg-white/5">
                        <td class="p-2 font-bold text-emerald-400">${r.nome}</td>
                        <td class="p-2">${r.este.toFixed(3)}</td>
                        <td class="p-2">${r.norte.toFixed(3)}</td>
                        <td class="p-2">${r.altitude.toFixed(3)}</td>
                        <td class="p-2">${(r.sigmaPlanimetrico * 1000).toFixed(0)} mm</td>
                        <td class="p-2 text-white/60">${r.metodo}</td>
                        <td class="p-2">
                          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${r.conformeNormaIncra ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}">
                            ${r.conformeNormaIncra ? 'CONFORME' : 'EXCEDIDO'}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : `
            <div class="text-center py-6 border border-dashed border-white/10 rounded-lg text-white/40">
              Clique em <strong>"Calcular Prévia"</strong> para computar o alinhamento paralelo e visualizar no mapa.
            </div>
          `}
        ` : `
          <!-- Aba PA1 + PA2 Simples -->
          <div class="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-3">
            <span class="font-bold text-white/80">Cruzamento de Eixo com Divisa Confrontante</span>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] text-white/50 mb-1">Eixo Inicial e Final</label>
                <div class="grid grid-cols-2 gap-2">
                  <select id="sel-eixo-1" class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">
                    ${pontosDisponiveis.map(p => `<option value="${p.id}">${p.nome_vertice}</option>`).join('')}
                  </select>
                  <select id="sel-eixo-2" class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">
                    ${pontosDisponiveis.slice(1).map(p => `<option value="${p.id}">${p.nome_vertice}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-[10px] text-white/50 mb-1">Divisa Inicial e Final</label>
                <div class="grid grid-cols-2 gap-2">
                  <select id="sel-div-1" class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">
                    ${pontosDisponiveis.map(p => `<option value="${p.id}">${p.nome_vertice}</option>`).join('')}
                  </select>
                  <select id="sel-div-2" class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">
                    ${pontosDisponiveis.slice(1).map(p => `<option value="${p.id}">${p.nome_vertice}</option>`).join('')}
                  </select>
                </div>
              </div>
            </div>
          </div>
        `}
      </div>

      <div class="pt-4 border-t border-white/10 flex items-center justify-between shrink-0">
        <button id="btn-cancelar-modal" class="px-4 py-2 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all text-xs font-semibold">
          Cancelar
        </button>
        <button id="btn-confirmar-gravar-lote" class="px-5 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all text-xs font-bold flex items-center gap-2 ${resultadosOffset.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}" ${resultadosOffset.length === 0 ? 'disabled' : ''}>
          <span>Salvar e Inserir ${resultadosOffset.length} Vértice(s) no Perímetro</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>
    `;

    // Eventos
    container.querySelector('#btn-fechar-modal-vvirtual')?.addEventListener('click', fecharModal);
    container.querySelector('#btn-cancelar-modal')?.addEventListener('click', fecharModal);

    container.querySelector('#tab-offset')?.addEventListener('click', () => {
      abaAtiva = 'offset';
      renderConteudo();
    });
    container.querySelector('#tab-pa1pa2')?.addEventListener('click', () => {
      abaAtiva = 'pa1pa2';
      renderConteudo();
    });

    const distInput = container.querySelector('#input-dist-offset') as HTMLInputElement | null;
    distInput?.addEventListener('input', (e) => {
      distanciaOffset = parseFloat((e.target as HTMLInputElement).value) || 0;
    });

    container.querySelectorAll('.btn-preset-dist').forEach(btn => {
      btn.addEventListener('click', () => {
        distanciaOffset = parseFloat((btn as HTMLElement).dataset.val || '15');
        renderConteudo();
      });
    });

    container.querySelector('#btn-lado-dir')?.addEventListener('click', () => {
      ladoOffset = 'DIREITA';
      renderConteudo();
    });
    container.querySelector('#btn-lado-esq')?.addEventListener('click', () => {
      ladoOffset = 'ESQUERDA';
      renderConteudo();
    });

    const prefixoInput = container.querySelector('#input-prefixo') as HTMLInputElement | null;
    prefixoInput?.addEventListener('input', (e) => {
      prefixoNome = (e.target as HTMLInputElement).value.trim().toUpperCase() || 'V';
    });

    container.querySelector('#btn-calcular-preview-lote')?.addEventListener('click', calcularOffsetApi);
    container.querySelector('#btn-confirmar-gravar-lote')?.addEventListener('click', confirmarInsercaoLote);
  };

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  renderConteudo();

  // Animação de entrada
  requestAnimationFrame(() => {
    overlay.classList.remove('opacity-0');
    overlay.classList.add('opacity-100');
    container.classList.remove('scale-95');
    container.classList.add('scale-100');
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      fecharModal();
      window.removeEventListener('keydown', onKeyDown);
    }
  };
  window.addEventListener('keydown', onKeyDown);
}
