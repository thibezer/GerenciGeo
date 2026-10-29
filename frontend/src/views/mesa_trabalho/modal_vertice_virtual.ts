import L from 'leaflet';
import { API_BASE } from '../../config';
import { showToast, escapeHtml } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import type { LadoOffset, RespostaVerticeVirtual } from '../../types/verticesVirtuais';

const PRESETS_DISTANCIA = [5, 10, 15, 20, 25, 30];
const LIMITE_SIGMA_P_M = 0.5;

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
  container.className = 'w-full max-w-3xl mx-4 bg-[#111113] border border-white/10 rounded-technical shadow-2xl transform scale-95 transition-transform duration-200 max-h-[90vh] flex flex-col text-white';

  // Pré-seleção: se houver pontos selecionados, usa-os
  const idsIniciais = (ctx.selectedPontoIds && ctx.selectedPontoIds.length >= 2)
    ? ctx.selectedPontoIds
    : pontosDisponiveis.slice(0, 4).map(p => p.id);

  let abaAtiva: 'offset' | 'pa1pa2' = 'offset';
  // Valor bruto do input, para não perder o que o usuário está digitando ("1.", "") ao re-renderizar
  let distanciaTexto = '15';
  let ladoOffset: LadoOffset = 'DIREITA';
  let prefixoNome = 'V';
  let pontosSelecionadosIds: number[] = [...idsIniciais];

  let resultadosOffset: RespostaVerticeVirtual[] = [];
  let previaDesatualizada = false;
  let calculando = false;
  let salvando = false;

  const distanciaOffset = () => {
    const v = parseFloat(distanciaTexto.replace(',', '.'));
    return Number.isFinite(v) ? v : 0;
  };

  const nomePonto = (pid: number) => {
    const p = pontosDisponiveis.find(pt => pt.id === pid);
    return String(p?.nome_vertice || `P${pid}`);
  };

  const nomeVirtual = (i: number) => {
    const prefixo = prefixoNome || 'V';
    const sep = prefixo.endsWith('-') || prefixo.endsWith('_') ? '' : '-';
    return `${prefixo}${sep}${String(i + 1).padStart(2, '0')}`;
  };

  const fecharModal = () => {
    limparPreviewMapa();
    if (previewLayerGroup && map) {
      map.removeLayer(previewLayerGroup);
    }
    window.removeEventListener('keydown', onKeyDown);
    overlay.classList.remove('opacity-100');
    overlay.classList.add('opacity-0');
    container.classList.remove('scale-100');
    container.classList.add('scale-95');
    setTimeout(() => overlay.remove(), 200);
  };

  // Qualquer mudança de parâmetro torna a prévia anterior inválida
  const invalidarPrevia = () => {
    if (resultadosOffset.length > 0) {
      resultadosOffset = [];
      previaDesatualizada = true;
      limparPreviewMapa();
    }
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
    if (distanciaOffset() <= 0) {
      showToast('Informe uma distância maior que zero.', 'info');
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
          distancia: distanciaOffset(),
          lado: ladoOffset,
          prefixo_nome: prefixoNome || 'V'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao calcular offset.');

      resultadosOffset = data.resultados || [];
      previaDesatualizada = false;
      desenharPreviewLoteNoMapa(resultadosOffset);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      calculando = false;
      renderConteudo();
      if (resultadosOffset.length > 0) {
        container.querySelector('#vv-secao-previa')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  };

  const confirmarInsercaoLote = async () => {
    if (resultadosOffset.length === 0) {
      showToast('Calcule a prévia dos vértices antes de confirmar.', 'info');
      return;
    }
    salvando = true;
    renderConteudo();

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
      salvando = false;
      renderConteudo();
    }
  };

  // ── Blocos de interface ─────────────────────────────────────────────────────

  const tituloEtapa = (num: number, titulo: string, ajuda: string, extra = '') => `
    <div class="flex items-start justify-between gap-3 mb-2.5">
      <div class="flex items-start gap-2.5">
        <span class="w-5 h-5 shrink-0 rounded-full bg-white/10 text-white/70 text-[10px] font-bold flex items-center justify-center mt-px">${num}</span>
        <div>
          <div class="text-[13px] font-semibold text-white/90">${titulo}</div>
          <div class="text-[11px] text-white/45 leading-snug">${ajuda}</div>
        </div>
      </div>
      ${extra}
    </div>
  `;

  // Esquema ilustrativo: linha de apoio (cinza, com sentido) e linha deslocada (verde tracejada)
  const renderDiagramaLado = () => {
    const base = [[24, 52], [84, 42], [144, 56], [204, 46]];
    const dy = ladoOffset === 'DIREITA' ? 26 : -26;
    const pts = (arr: number[][]) => arr.map(([x, y]) => `${x},${y}`).join(' ');
    const desloc = base.map(([x, y]) => [x, y + dy]);
    const inicio = escapeHtml(nomePonto(pontosSelecionadosIds[0]).slice(0, 10));
    const fim = escapeHtml(nomePonto(pontosSelecionadosIds[pontosSelecionadosIds.length - 1]).slice(0, 10));
    const dist = distanciaOffset();
    const yCota = (base[0][1] + desloc[0][1]) / 2;
    return `
      <svg viewBox="0 0 228 104" class="w-full h-auto" aria-hidden="true">
        <defs>
          <marker id="vv-seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,0.55)" />
          </marker>
        </defs>
        <polyline points="${pts(desloc)}" fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="5 4" />
        ${desloc.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#10b981" />`).join('')}
        <line x1="${base[0][0]}" y1="${base[0][1]}" x2="${desloc[0][0]}" y2="${desloc[0][1]}" stroke="rgba(16,185,129,0.5)" stroke-width="1" />
        <text x="${base[0][0] + 5}" y="${yCota + 3}" font-size="9" fill="#6ee7b7" font-family="ui-monospace,monospace">${dist > 0 ? `${dist} m` : '? m'}</text>
        <polyline points="${pts(base)}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2" marker-end="url(#vv-seta)" />
        ${base.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#111113" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" />`).join('')}
        <text x="${base[0][0]}" y="${ladoOffset === 'DIREITA' ? 30 : 100}" font-size="9" fill="rgba(255,255,255,0.5)" font-family="ui-monospace,monospace" text-anchor="start">${inicio}</text>
        <text x="${base[3][0]}" y="${ladoOffset === 'DIREITA' ? 30 : 100}" font-size="9" fill="rgba(255,255,255,0.5)" font-family="ui-monospace,monospace" text-anchor="end">${fim}</text>
      </svg>
    `;
  };

  const renderCadeia = () => {
    const restantes = pontosDisponiveis.filter(p => !pontosSelecionadosIds.includes(p.id));
    const chips = pontosSelecionadosIds.map((pid, i) => `
      ${i > 0 ? '<span class="text-white/25 select-none">→</span>' : ''}
      <span class="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md bg-white/[0.06] border border-white/10 font-mono text-[11px] text-white/85">
        <span class="text-white/35">${i + 1}</span>
        ${escapeHtml(nomePonto(pid))}
        <button type="button" class="btn-remover-apoio w-4 h-4 rounded flex items-center justify-center text-white/35 hover:text-red-400 hover:bg-red-500/10" data-id="${pid}" title="Remover da sequência">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </span>
    `).join('');

    return `
      <div class="flex flex-wrap items-center gap-1.5">
        ${chips || '<span class="text-[11px] text-white/40 italic">Nenhum ponto na sequência.</span>'}
        ${restantes.length > 0 ? `
          <select id="sel-adicionar-apoio" class="bg-transparent border border-dashed border-white/20 hover:border-emerald-500/60 rounded-md px-2 py-1 text-[11px] text-white/60 focus:outline-none focus:border-emerald-500 cursor-pointer">
            <option value="" class="bg-[#111113]">+ Adicionar ponto</option>
            ${restantes.map(p => `<option value="${p.id}" class="bg-[#111113]">${escapeHtml(String(p.nome_vertice || `P${p.id}`))}</option>`).join('')}
          </select>
        ` : ''}
      </div>
      ${pontosSelecionadosIds.length < 2 ? '<div class="mt-2 text-[11px] text-amber-400">Adicione pelo menos 2 pontos para definir o alinhamento.</div>' : ''}
    `;
  };

  const renderResultados = () => {
    if (calculando) {
      return `
        <div class="flex items-center justify-center gap-2 py-8 rounded-lg bg-white/[0.02] border border-white/5 text-white/50">
          <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
          Calculando vértices…
        </div>
      `;
    }

    if (resultadosOffset.length === 0) {
      return `
        <div class="flex items-center gap-3 px-4 py-4 rounded-lg border border-dashed ${previaDesatualizada ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-white/10'}">
          <svg class="shrink-0 ${previaDesatualizada ? 'text-amber-400' : 'text-white/30'}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <div class="text-[11px] leading-snug ${previaDesatualizada ? 'text-amber-200/80' : 'text-white/45'}">
            ${previaDesatualizada
              ? 'Os parâmetros mudaram. Gere a prévia novamente para conferir os vértices antes de inserir.'
              : 'Nenhuma prévia gerada ainda. Os vértices calculados também aparecem no mapa, em verde tracejado.'}
          </div>
        </div>
      `;
    }

    const conformes = resultadosOffset.filter(r => r.conformeNormaIncra).length;
    const todosConformes = conformes === resultadosOffset.length;
    return `
      <div class="border border-white/10 rounded-lg overflow-hidden">
        <div class="px-3 py-2 bg-white/[0.04] border-b border-white/10 flex items-center justify-between gap-2">
          <span class="text-[12px] font-semibold text-white/90">Prévia · ${resultadosOffset.length} vértice(s)</span>
          <span class="text-[11px] ${todosConformes ? 'text-emerald-400' : 'text-amber-400'}">
            ${conformes} de ${resultadosOffset.length} dentro do limite INCRA (σP ≤ ${(LIMITE_SIGMA_P_M * 100).toFixed(0)} cm)
          </span>
        </div>
        <div class="max-h-48 overflow-y-auto">
          <table class="w-full text-left border-collapse text-[11px]">
            <thead class="text-white/40 border-b border-white/5 sticky top-0 bg-[#141416]">
              <tr>
                <th class="px-3 py-1.5 font-medium">Vértice</th>
                <th class="px-3 py-1.5 font-medium text-right">Este (m)</th>
                <th class="px-3 py-1.5 font-medium text-right">Norte (m)</th>
                <th class="px-3 py-1.5 font-medium text-right">Altitude (m)</th>
                <th class="px-3 py-1.5 font-medium text-right">σP</th>
                <th class="px-3 py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5 font-mono">
              ${resultadosOffset.map(r => `
                <tr class="hover:bg-white/[0.03]" ${r.alerta ? `title="${escapeHtml(r.alerta)}"` : ''}>
                  <td class="px-3 py-1.5 font-bold text-emerald-400">${escapeHtml(r.nome)}</td>
                  <td class="px-3 py-1.5 text-right text-white/80">${r.este.toFixed(3)}</td>
                  <td class="px-3 py-1.5 text-right text-white/80">${r.norte.toFixed(3)}</td>
                  <td class="px-3 py-1.5 text-right text-white/80">${r.altitude.toFixed(3)}</td>
                  <td class="px-3 py-1.5 text-right ${r.conformeNormaIncra ? 'text-white/80' : 'text-red-400'}">${(r.sigmaPlanimetrico * 100).toFixed(1)} cm</td>
                  <td class="px-3 py-1.5 text-right">
                    ${r.conformeNormaIncra
                      ? '<span class="text-emerald-400" title="Dentro do limite">✓</span>'
                      : '<span class="text-[10px] font-sans font-semibold text-red-400" title="Acima do limite INCRA">Excede</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  const renderAbaOffset = () => {
    const dist = distanciaOffset();
    const n = pontosSelecionadosIds.length;
    const podeCalcular = n >= 2 && dist > 0 && !calculando;
    const exemplos = n > 0
      ? (n <= 3
        ? Array.from({ length: n }, (_, i) => nomeVirtual(i)).join(', ')
        : `${nomeVirtual(0)}, ${nomeVirtual(1)} … ${nomeVirtual(n - 1)}`)
      : '';
    const btnLado = (lado: LadoOffset, rotulo: string, icone: string) => `
      <button type="button" data-lado="${lado}" class="btn-lado flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${ladoOffset === lado ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/60' : 'text-white/50 hover:text-white hover:bg-white/5'}">
        ${icone}${rotulo}
      </button>
    `;

    return `
      <section>
        ${tituloEtapa(1, 'Pontos de apoio', 'Sequência medida que define o alinhamento. A ordem determina o sentido.', `
          <button type="button" id="btn-inverter-cadeia" class="shrink-0 flex items-center gap-1 text-[11px] text-white/50 hover:text-white px-2 py-1 rounded hover:bg-white/5 ${n < 2 ? 'invisible' : ''}" title="Inverter o sentido da sequência">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
            Inverter sentido
          </button>
        `)}
        <div class="pl-[30px]">${renderCadeia()}</div>
      </section>

      <section class="pt-4 border-t border-white/5">
        ${tituloEtapa(2, 'Deslocamento', 'Distância e lado da linha paralela, olhando no sentido da sequência.')}
        <div class="pl-[30px] grid grid-cols-1 sm:grid-cols-[1fr_1fr_228px] gap-4 items-start">
          <div>
            <label for="input-dist-offset" class="block text-[11px] text-white/50 mb-1">Distância</label>
            <div class="relative">
              <input id="input-dist-offset" type="text" inputmode="decimal" value="${escapeHtml(distanciaTexto)}" class="w-full bg-white/5 border ${dist > 0 ? 'border-white/10' : 'border-red-500/50'} rounded-md pl-2.5 pr-8 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono" />
              <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-white/40 pointer-events-none">m</span>
            </div>
            <div class="flex flex-wrap gap-1 mt-1.5">
              ${PRESETS_DISTANCIA.map(d => `
                <button type="button" class="btn-preset-dist text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${dist === d ? 'bg-emerald-500/15 text-emerald-300' : 'text-white/45 hover:text-white hover:bg-white/5'}" data-val="${d}">${d}</button>
              `).join('')}
            </div>
          </div>

          <div>
            <span class="block text-[11px] text-white/50 mb-1">Lado</span>
            <div class="flex gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
              ${btnLado('ESQUERDA', 'Esquerda', '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg>')}
              ${btnLado('DIREITA', 'Direita', '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>')}
            </div>
          </div>

          <div class="rounded-lg bg-black/30 border border-white/5 px-1 py-0.5">
            ${n >= 2 ? renderDiagramaLado() : '<div class="h-[104px] flex items-center justify-center text-[10px] text-white/30">Esquema do deslocamento</div>'}
          </div>
        </div>
      </section>

      <section class="pt-4 border-t border-white/5">
        ${tituloEtapa(3, 'Nome dos vértices', 'Prefixo usado na numeração. Um vértice virtual por ponto de apoio.')}
        <div class="pl-[30px] flex flex-wrap items-center gap-3">
          <input id="input-prefixo" type="text" value="${escapeHtml(prefixoNome)}" maxlength="12" class="w-24 bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono uppercase" />
          ${n > 0 ? `<span class="text-[11px] text-white/45">Serão criados <b class="text-white/80">${n}</b>: <span class="font-mono text-white/70">${escapeHtml(exemplos)}</span></span>` : ''}
        </div>
      </section>

      <section id="vv-secao-previa" class="pt-4 border-t border-white/5">
        ${tituloEtapa(4, 'Conferir prévia', 'Confira coordenadas e precisão antes de inserir.', `
          <button id="btn-calcular-preview-lote" type="button" class="shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all border ${podeCalcular ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10' : 'border-white/10 text-white/30 cursor-not-allowed'}" ${podeCalcular ? '' : 'disabled'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            ${resultadosOffset.length > 0 ? 'Recalcular' : 'Gerar prévia no mapa'}
          </button>
        `)}
        <div class="pl-[30px]">${renderResultados()}</div>
      </section>
    `;
  };

  const renderAbaPa1Pa2 = () => `
    <div class="flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 text-[11px] text-amber-100/80 leading-snug">
      <svg class="shrink-0 text-amber-400 mt-px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div>
        <b class="text-amber-200">Em desenvolvimento.</b> Este modo vai calcular o vértice no cruzamento da faixa de domínio (paralela ao eixo da via) com a divisa do confrontante. Por enquanto, use <b>Deslocamento paralelo</b>.
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 opacity-50 pointer-events-none select-none" aria-disabled="true">
      ${[['Eixo da via', 'sel-eixo'], ['Divisa do confrontante', 'sel-div']].map(([rotulo, id]) => `
        <div>
          <span class="block text-[11px] text-white/50 mb-1">${rotulo} (início → fim)</span>
          <div class="grid grid-cols-2 gap-2">
            <select id="${id}-1" disabled class="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white">
              ${pontosDisponiveis.map(p => `<option value="${p.id}">${escapeHtml(String(p.nome_vertice))}</option>`).join('')}
            </select>
            <select id="${id}-2" disabled class="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white">
              ${pontosDisponiveis.slice(1).map(p => `<option value="${p.id}">${escapeHtml(String(p.nome_vertice))}</option>`).join('')}
            </select>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  const renderRodape = () => {
    const n = resultadosOffset.length;
    const pronto = abaAtiva === 'offset' && n > 0 && !salvando;
    const dica = abaAtiva !== 'offset'
      ? ''
      : n > 0
        ? 'Os vértices serão adicionados ao perímetro da matrícula.'
        : 'Gere a prévia para habilitar a inserção.';
    return `
      <div class="px-6 py-4 border-t border-white/10 flex items-center justify-between gap-4 shrink-0">
        <button id="btn-cancelar-modal" type="button" class="px-4 py-2 rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-all text-xs font-semibold">
          Cancelar
        </button>
        <div class="flex items-center gap-3">
          <span class="max-sm:hidden text-[11px] text-white/40">${dica}</span>
          <button id="btn-confirmar-gravar-lote" type="button" class="px-4 py-2 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${pronto ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' : 'bg-white/5 text-white/30 cursor-not-allowed'}" ${pronto ? '' : 'disabled'}>
            ${salvando ? 'Inserindo…' : n > 0 ? `Inserir ${n} vértice${n > 1 ? 's' : ''}` : 'Inserir vértices'}
          </button>
        </div>
      </div>
    `;
  };

  const renderConteudo = () => {
    container.innerHTML = `
      <div class="px-6 pt-5 pb-4 flex items-start justify-between gap-4 shrink-0">
        <div>
          <h3 class="text-base font-bold text-white">Criar vértices virtuais</h3>
          <p class="text-[12px] text-white/50 mt-0.5">Gera vértices tipo <span class="font-mono text-white/70">V</span> calculados a partir de pontos medidos, com incerteza propagada conforme o SIGEF.</p>
        </div>
        <button id="btn-fechar-modal-vvirtual" type="button" class="text-white/40 hover:text-white hover:bg-white/5 rounded-md transition-colors p-1.5 -mr-1.5 -mt-1" title="Fechar (Esc)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="px-6 shrink-0">
        <div class="inline-flex p-0.5 rounded-lg bg-white/5 border border-white/10 text-xs">
          <button id="tab-offset" type="button" class="px-3 py-1.5 rounded-md font-semibold transition-all ${abaAtiva === 'offset' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}">
            Deslocamento paralelo
          </button>
          <button id="tab-pa1pa2" type="button" class="px-3 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 ${abaAtiva === 'pa1pa2' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}">
            Faixa de domínio
            <span class="text-[9px] font-semibold px-1 py-px rounded bg-amber-500/15 text-amber-300">em breve</span>
          </button>
        </div>
      </div>

      <div class="px-6 py-5 overflow-y-auto space-y-4 flex-1 text-xs">
        ${abaAtiva === 'offset' ? renderAbaOffset() : renderAbaPa1Pa2()}
      </div>

      ${renderRodape()}
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

    container.querySelectorAll<HTMLElement>('.btn-remover-apoio').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        pontosSelecionadosIds = pontosSelecionadosIds.filter(pid => pid !== id);
        invalidarPrevia();
        renderConteudo();
      });
    });

    container.querySelector('#sel-adicionar-apoio')?.addEventListener('change', (e) => {
      const valor = (e.target as HTMLSelectElement).value;
      if (!valor) return;
      const ponto = pontosDisponiveis.find(p => String(p.id) === valor);
      if (ponto) pontosSelecionadosIds = [...pontosSelecionadosIds, ponto.id];
      invalidarPrevia();
      renderConteudo();
    });

    container.querySelector('#btn-inverter-cadeia')?.addEventListener('click', () => {
      pontosSelecionadosIds = [...pontosSelecionadosIds].reverse();
      invalidarPrevia();
      renderConteudo();
    });

    container.querySelector('#input-dist-offset')?.addEventListener('input', (e) => {
      distanciaTexto = (e.target as HTMLInputElement).value;
      invalidarPrevia();
      renderMantendoFoco('input-dist-offset');
    });

    container.querySelectorAll<HTMLElement>('.btn-preset-dist').forEach(btn => {
      btn.addEventListener('click', () => {
        distanciaTexto = btn.dataset.val || '15';
        invalidarPrevia();
        renderConteudo();
      });
    });

    container.querySelectorAll<HTMLElement>('.btn-lado').forEach(btn => {
      btn.addEventListener('click', () => {
        const lado = btn.dataset.lado as LadoOffset;
        if (lado === ladoOffset) return;
        ladoOffset = lado;
        invalidarPrevia();
        renderConteudo();
      });
    });

    container.querySelector('#input-prefixo')?.addEventListener('input', (e) => {
      prefixoNome = (e.target as HTMLInputElement).value.trim().toUpperCase();
      invalidarPrevia();
      renderMantendoFoco('input-prefixo');
    });

    container.querySelector('#btn-calcular-preview-lote')?.addEventListener('click', calcularOffsetApi);
    container.querySelector('#btn-confirmar-gravar-lote')?.addEventListener('click', confirmarInsercaoLote);
  };

  // Re-renderiza a partir de um input de texto sem tirar o cursor do lugar
  const renderMantendoFoco = (inputId: string) => {
    const atual = container.querySelector<HTMLInputElement>(`#${inputId}`);
    const cursor = atual?.selectionStart ?? null;
    renderConteudo();
    const novo = container.querySelector<HTMLInputElement>(`#${inputId}`);
    if (!novo) return;
    novo.focus();
    if (cursor !== null) novo.setSelectionRange(cursor, cursor);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') fecharModal();
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

  window.addEventListener('keydown', onKeyDown);
}
