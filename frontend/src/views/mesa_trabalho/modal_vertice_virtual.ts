import L from 'leaflet';
import { API_BASE } from '../../config';
import { showToast, escapeHtml } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import type { LadoOffset, RespostaVerticeVirtual } from '../../types/verticesVirtuais';
import { zonaUtmDoLevantamento } from './coordenadas_mapa';
import { ordenarSequenciaOffset, pontosDoPerimetro } from './offset_sequencia';

const PRESETS_DISTANCIA = [5, 10, 15, 20, 25, 30];
const LIMITE_SIGMA_P_M = 0.5;

type Aba = 'offset' | 'faixa';
type CampoDistancia = 'distancia' | 'largura';

// A API responde em snake_case; o restante do modal trabalha com o tipo camelCase
const normalizarResultado = (r: any): RespostaVerticeVirtual => ({
  nome: String(r.nome),
  este: Number(r.este),
  norte: Number(r.norte),
  altitude: Number(r.altitude ?? 0),
  sigmaEste: Number(r.sigma_este ?? r.sigmaEste ?? 0),
  sigmaNorte: Number(r.sigma_norte ?? r.sigmaNorte ?? 0),
  sigmaAltitude: Number(r.sigma_altitude ?? r.sigmaAltitude ?? 0),
  sigmaPlanimetrico: Number(r.sigma_planimetrico ?? r.sigmaPlanimetrico ?? 0),
  tipoPonto: 'V',
  metodo: r.metodo,
  conformeNormaIncra: Boolean(r.conforme_norma_incra ?? r.conformeNormaIncra),
  alerta: r.alerta || undefined,
  anguloIntersecaoGraus: r.angulo_intersecao_graus ?? r.anguloIntersecaoGraus ?? undefined,
  lat: r.lat != null ? Number(r.lat) : undefined,
  lon: r.lon != null ? Number(r.lon) : undefined,
});

const paraNumero = (texto: string) => {
  const v = parseFloat(texto.replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
};

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

  // Mesmo fuso no cálculo e na gravação: os E/N devolvidos pelo servidor só valem nele
  const fusoUtm = Number(pontosDisponiveis.find(p => p.fuso_utm)?.fuso_utm)
    || ctx.mapaController?.fusoUtm
    || zonaUtmDoLevantamento(ctx.pontosList)
    || 22;
  const perimetro = pontosDoPerimetro(ctx.pontosList || [], matId);

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

  // Pré-seleção: se houver pontos selecionados, usa-os na ordem do caminhamento (não na de seleção)
  const idsIniciais: number[] = (ctx.selectedPontoIds && ctx.selectedPontoIds.length >= 2)
    ? ordenarSequenciaOffset(
        ctx.selectedPontoIds.map(id => pontosDisponiveis.find(p => String(p.id) === String(id))).filter(Boolean),
        perimetro
      ).pontos.map(p => p.id)
    : pontosDisponiveis.slice(0, 4).map(p => p.id);
  // Perímetro inteiro na sequência: offset de polígono fechado
  const sequenciaFechada = (ids: number[]) =>
    perimetro.length >= 3 && ids.length === perimetro.length
    && perimetro.every(p => ids.some(id => String(id) === String(p.id)));
  const idPadrao = (i: number) => idsIniciais[i] ?? pontosDisponiveis[i % pontosDisponiveis.length].id;

  let abaAtiva: Aba = 'offset';

  // Deslocamento paralelo (cadeia)
  // Valores brutos dos inputs, para não perder o que o usuário está digitando ("1.", "") ao re-renderizar
  let distanciaTexto = '15';
  let ladoOffset: LadoOffset = 'DIREITA';
  let prefixoNome = 'V';
  let pontosSelecionadosIds: number[] = [...idsIniciais];

  // Faixa de domínio (PA1 + PA2)
  let larguraTexto = '15';
  let ladoFaixa: LadoOffset = 'DIREITA';
  let nomeVerticeFaixa = 'V-01';
  let eixoIds: [number, number] = [idPadrao(0), idPadrao(1)];
  let divisaIds: [number, number] = [idPadrao(2), idPadrao(3)];

  const previas: Record<Aba, { resultados: RespostaVerticeVirtual[]; desatualizada: boolean }> = {
    offset: { resultados: [], desatualizada: false },
    faixa: { resultados: [], desatualizada: false },
  };
  let calculando = false;
  let salvando = false;

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

  // Qualquer mudança de parâmetro torna a prévia da aba atual inválida
  const invalidarPrevia = () => {
    const previa = previas[abaAtiva];
    if (previa.resultados.length > 0) {
      previa.resultados = [];
      previa.desatualizada = true;
      limparPreviewMapa();
    }
  };

  const desenharPreviewNoMapa = (resultados: RespostaVerticeVirtual[]) => {
    if (!previewLayerGroup || !map) return;
    previewLayerGroup.clearLayers();
    if (resultados.length === 0) return;

    // lat/lon vem do servidor, convertido do E/N no mesmo fuso do cálculo (sem aproximação local)
    const latlngs: [number, number][] = [];
    resultados.forEach(r => {
      if (r.lat == null || r.lon == null) return;
      const pos: [number, number] = [r.lat, r.lon];
      latlngs.push(pos);

      const marker = L.circleMarker(pos, {
        radius: 5,
        color: '#10b981',
        weight: 2,
        fillColor: '#059669',
        fillOpacity: 0.8
      });
      marker.bindTooltip(`<b>${escapeHtml(r.nome)} (Virtual)</b><br>E: ${r.este.toFixed(3)} | N: ${r.norte.toFixed(3)}<br>σP: ${(r.sigmaPlanimetrico * 100).toFixed(1)} cm`, {
        permanent: false,
        direction: 'top'
      });
      previewLayerGroup!.addLayer(marker);
    });

    if (latlngs.length >= 2) {
      const fechar = abaAtiva === 'offset' && sequenciaFechada(pontosSelecionadosIds) && latlngs.length >= 3;
      const line = L.polyline(fechar ? [...latlngs, latlngs[0]] : latlngs, {
        color: '#10b981',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.85
      });
      previewLayerGroup.addLayer(line);
      map.fitBounds(line.getBounds(), { padding: [50, 50], maxZoom: 18 });
    } else if (latlngs.length === 1) {
      map.setView(latlngs[0], Math.max(map.getZoom(), 17));
    }
  };

  const executarCalculo = async (aba: Aba, url: string, corpo: object) => {
    calculando = true;
    renderConteudo();

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/vertices-virtuais/${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha no cálculo dos vértices virtuais.');

      const brutos = aba === 'offset' ? (data.resultados || []) : (data.resultado ? [data.resultado] : []);
      previas[aba].resultados = brutos.map(normalizarResultado);
      previas[aba].desatualizada = false;
      if (abaAtiva === aba) desenharPreviewNoMapa(previas[aba].resultados);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      calculando = false;
      renderConteudo();
      if (previas[abaAtiva].resultados.length > 0) {
        container.querySelector('#vv-secao-previa')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  };

  const calcularOffsetApi = () => {
    if (pontosSelecionadosIds.length < 2) {
      showToast('Selecione pelo menos 2 pontos de apoio.', 'info');
      return;
    }
    if (paraNumero(distanciaTexto) <= 0) {
      showToast('Informe uma distância maior que zero.', 'info');
      return;
    }
    executarCalculo('offset', 'calcular-offset-lote', {
      ponto_ids: pontosSelecionadosIds,
      distancia: paraNumero(distanciaTexto),
      lado: ladoOffset,
      prefixo_nome: prefixoNome || 'V',
      fuso_utm: fusoUtm,
      fechado: sequenciaFechada(pontosSelecionadosIds)
    });
  };

  const calcularFaixaApi = () => {
    if (eixoIds[0] === eixoIds[1] || divisaIds[0] === divisaIds[1]) {
      showToast('O início e o fim de cada linha precisam ser pontos diferentes.', 'info');
      return;
    }
    if (paraNumero(larguraTexto) <= 0) {
      showToast('Informe uma largura de faixa maior que zero.', 'info');
      return;
    }
    executarCalculo('faixa', 'calcular-combo-pa1-pa2', {
      eixo_inicio_id: eixoIds[0],
      eixo_fim_id: eixoIds[1],
      divisa_inicio_id: divisaIds[0],
      divisa_fim_id: divisaIds[1],
      largura_faixa: paraNumero(larguraTexto),
      lado: ladoFaixa,
      nome_vertice: nomeVerticeFaixa || 'V-01',
      fuso_utm: fusoUtm
    });
  };

  const confirmarInsercao = async () => {
    const resultados = previas[abaAtiva].resultados;
    if (resultados.length === 0) {
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
          fuso_utm: fusoUtm,
          vertices: resultados.map(r => ({
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
      showToast(typeof err?.message === 'string' ? err.message : 'Erro ao persistir vértices virtuais.', 'error');
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

  const secao = (conteudo: string, id = '') => `
    <section ${id ? `id="${id}"` : ''} class="pt-4 border-t border-white/5 first:pt-0 first:border-t-0">${conteudo}</section>
  `;

  const botaoInverter = (id: string, visivel: boolean) => `
    <button type="button" id="${id}" class="shrink-0 flex items-center gap-1 text-[11px] text-white/50 hover:text-white px-2 py-1 rounded hover:bg-white/5 ${visivel ? '' : 'invisible'}" title="Inverter o sentido">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
      Inverter sentido
    </button>
  `;

  const campoDistancia = (campo: CampoDistancia, rotulo: string, texto: string) => {
    const valor = paraNumero(texto);
    return `
      <div>
        <label for="input-${campo}" class="block text-[11px] text-white/50 mb-1">${rotulo}</label>
        <div class="relative">
          <input id="input-${campo}" type="text" inputmode="decimal" value="${escapeHtml(texto)}" class="w-full bg-white/5 border ${valor > 0 ? 'border-white/10' : 'border-red-500/50'} rounded-md pl-2.5 pr-8 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono" />
          <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-white/40 pointer-events-none">m</span>
        </div>
        <div class="flex flex-wrap gap-1 mt-1.5">
          ${PRESETS_DISTANCIA.map(d => `
            <button type="button" class="btn-preset text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${valor === d ? 'bg-emerald-500/15 text-emerald-300' : 'text-white/45 hover:text-white hover:bg-white/5'}" data-campo="${campo}" data-val="${d}">${d}</button>
          `).join('')}
        </div>
      </div>
    `;
  };

  const seletorLado = (campo: CampoDistancia, ladoAtual: LadoOffset) => {
    const btn = (lado: LadoOffset, rotulo: string, icone: string) => `
      <button type="button" data-campo="${campo}" data-lado="${lado}" class="btn-lado flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${ladoAtual === lado ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/60' : 'text-white/50 hover:text-white hover:bg-white/5'}">
        ${icone}${rotulo}
      </button>
    `;
    return `
      <div>
        <span class="block text-[11px] text-white/50 mb-1">Lado</span>
        <div class="flex gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
          ${btn('ESQUERDA', 'Esquerda', '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg>')}
          ${btn('DIREITA', 'Direita', '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>')}
        </div>
      </div>
    `;
  };

  const caixaDiagrama = (svg: string) => `
    <div class="rounded-lg bg-black/30 border border-white/5 px-1 py-0.5">${svg}</div>
  `;

  const defsSeta = `
    <defs>
      <marker id="vv-seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,0.55)" />
      </marker>
    </defs>
  `;
  const estiloRotulo = 'font-size="9" font-family="ui-monospace,monospace"';

  // Esquema ilustrativo: linha de apoio (cinza, com sentido) e linha deslocada (verde tracejada)
  const renderDiagramaOffset = () => {
    const base = [[24, 52], [84, 42], [144, 56], [204, 46]];
    const dy = ladoOffset === 'DIREITA' ? 26 : -26;
    const pts = (arr: number[][]) => arr.map(([x, y]) => `${x},${y}`).join(' ');
    const desloc = base.map(([x, y]) => [x, y + dy]);
    const inicio = escapeHtml(nomePonto(pontosSelecionadosIds[0]).slice(0, 10));
    const fim = escapeHtml(nomePonto(pontosSelecionadosIds[pontosSelecionadosIds.length - 1]).slice(0, 10));
    const dist = paraNumero(distanciaTexto);
    const yCota = (base[0][1] + desloc[0][1]) / 2;
    const yRotulos = ladoOffset === 'DIREITA' ? 30 : 100;
    return `
      <svg viewBox="0 0 228 104" class="w-full h-auto" aria-hidden="true">
        ${defsSeta}
        <polyline points="${pts(desloc)}" fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="5 4" />
        ${desloc.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#10b981" />`).join('')}
        <line x1="${base[0][0]}" y1="${base[0][1]}" x2="${desloc[0][0]}" y2="${desloc[0][1]}" stroke="rgba(16,185,129,0.5)" stroke-width="1" />
        <text x="${base[0][0] + 5}" y="${yCota + 3}" ${estiloRotulo} fill="#6ee7b7">${dist > 0 ? `${dist} m` : '? m'}</text>
        <polyline points="${pts(base)}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2" marker-end="url(#vv-seta)" />
        ${base.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#111113" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" />`).join('')}
        <text x="${base[0][0]}" y="${yRotulos}" ${estiloRotulo} fill="rgba(255,255,255,0.5)" text-anchor="start">${inicio}</text>
        <text x="${base[3][0]}" y="${yRotulos}" ${estiloRotulo} fill="rgba(255,255,255,0.5)" text-anchor="end">${fim}</text>
      </svg>
    `;
  };

  // Esquema: eixo (cinza, com sentido), limite da faixa (verde tracejado) e divisa (âmbar) cruzando-o no vértice V
  const renderDiagramaFaixa = () => {
    const yEixo = 52;
    const yFaixa = yEixo + (ladoFaixa === 'DIREITA' ? 30 : -30);
    // Divisa inclinada de (120,4) a (164,100); ponto de cruzamento com a faixa
    const xDivisa = (y: number) => 120 + ((y - 4) / 96) * 44;
    const largura = paraNumero(larguraTexto);
    return `
      <svg viewBox="0 0 228 104" class="w-full h-auto" aria-hidden="true">
        ${defsSeta}
        <line x1="12" y1="${yFaixa}" x2="216" y2="${yFaixa}" stroke="#10b981" stroke-width="2" stroke-dasharray="5 4" />
        <line x1="120" y1="4" x2="164" y2="100" stroke="#f59e0b" stroke-width="2" stroke-opacity="0.8" />
        <line x1="40" y1="${yEixo}" x2="40" y2="${yFaixa}" stroke="rgba(16,185,129,0.5)" stroke-width="1" />
        <text x="44" y="${(yEixo + yFaixa) / 2 + 3}" ${estiloRotulo} fill="#6ee7b7">${largura > 0 ? `${largura} m` : '? m'}</text>
        <line x1="12" y1="${yEixo}" x2="214" y2="${yEixo}" stroke="rgba(255,255,255,0.55)" stroke-width="2" marker-end="url(#vv-seta)" />
        <circle cx="${xDivisa(yFaixa)}" cy="${yFaixa}" r="5" fill="#10b981" stroke="#111113" stroke-width="2" />
        <text x="${xDivisa(yFaixa) + 8}" y="${yFaixa + (ladoFaixa === 'DIREITA' ? 12 : -5)}" ${estiloRotulo} fill="#6ee7b7" font-weight="bold">V</text>
        <text x="12" y="${yEixo + (ladoFaixa === 'DIREITA' ? -5 : 12)}" ${estiloRotulo} fill="rgba(255,255,255,0.5)">eixo</text>
        <text x="${ladoFaixa === 'DIREITA' ? 126 : 168}" y="${ladoFaixa === 'DIREITA' ? 12 : 98}" ${estiloRotulo} fill="#fbbf24">divisa</text>
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
            ${restantes.map(p => `<option value="${p.id}" class="bg-[#111113]">${escapeHtml(nomePonto(p.id))}</option>`).join('')}
          </select>
        ` : ''}
      </div>
      ${pontosSelecionadosIds.length < 2 ? '<div class="mt-2 text-[11px] text-amber-400">Adicione pelo menos 2 pontos para definir o alinhamento.</div>' : ''}
    `;
  };

  // Par de selects início → fim para uma linha definida por dois pontos
  const renderParPontos = (linha: 'eixo' | 'divisa', ids: [number, number]) => {
    const select = (i: 0 | 1) => `
      <select data-linha="${linha}" data-indice="${i}" class="sel-par-ponto w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 cursor-pointer">
        ${pontosDisponiveis.map(p => `<option value="${p.id}" class="bg-[#111113]" ${p.id === ids[i] ? 'selected' : ''}>${escapeHtml(nomePonto(p.id))}</option>`).join('')}
      </select>
    `;
    return `
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 max-w-sm">
        ${select(0)}
        <span class="text-white/30">→</span>
        ${select(1)}
      </div>
      ${ids[0] === ids[1] ? '<div class="mt-2 text-[11px] text-amber-400">Escolha dois pontos diferentes.</div>' : ''}
    `;
  };

  const renderResultados = () => {
    const { resultados, desatualizada } = previas[abaAtiva];

    if (calculando) {
      return `
        <div class="flex items-center justify-center gap-2 py-8 rounded-lg bg-white/[0.02] border border-white/5 text-white/50">
          <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
          Calculando…
        </div>
      `;
    }

    if (resultados.length === 0) {
      return `
        <div class="flex items-center gap-3 px-4 py-4 rounded-lg border border-dashed ${desatualizada ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-white/10'}">
          <svg class="shrink-0 ${desatualizada ? 'text-amber-400' : 'text-white/30'}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <div class="text-[11px] leading-snug ${desatualizada ? 'text-amber-200/80' : 'text-white/45'}">
            ${desatualizada
              ? 'Os parâmetros mudaram. Gere a prévia novamente para conferir antes de inserir.'
              : 'Nenhuma prévia gerada ainda. O resultado também aparece no mapa, em verde.'}
          </div>
        </div>
      `;
    }

    const conformes = resultados.filter(r => r.conformeNormaIncra).length;
    const todosConformes = conformes === resultados.length;
    const comAngulo = resultados.some(r => r.anguloIntersecaoGraus !== undefined) && abaAtiva === 'faixa';
    const alertas = resultados.filter(r => r.alerta);
    return `
      <div class="border border-white/10 rounded-lg overflow-hidden">
        <div class="px-3 py-2 bg-white/[0.04] border-b border-white/10 flex items-center justify-between gap-2">
          <span class="text-[12px] font-semibold text-white/90">${resultados.length} vértice${resultados.length > 1 ? 's' : ''}</span>
          <span class="text-[11px] ${todosConformes ? 'text-emerald-400' : 'text-amber-400'}">
            ${resultados.length > 1 ? `${conformes} de ${resultados.length} dentro` : todosConformes ? 'Dentro' : 'Fora'} do limite INCRA (σP ≤ ${(LIMITE_SIGMA_P_M * 100).toFixed(0)} cm)
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
                ${comAngulo ? '<th class="px-3 py-1.5 font-medium text-right" title="Ângulo entre o limite da faixa e a divisa">Ângulo</th>' : ''}
                <th class="px-3 py-1.5 font-medium text-right">σP</th>
                <th class="px-3 py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5 font-mono">
              ${resultados.map(r => `
                <tr class="hover:bg-white/[0.03]">
                  <td class="px-3 py-1.5 font-bold text-emerald-400">${escapeHtml(r.nome)}</td>
                  <td class="px-3 py-1.5 text-right text-white/80">${r.este.toFixed(3)}</td>
                  <td class="px-3 py-1.5 text-right text-white/80">${r.norte.toFixed(3)}</td>
                  <td class="px-3 py-1.5 text-right text-white/80">${r.altitude.toFixed(3)}</td>
                  ${comAngulo ? `<td class="px-3 py-1.5 text-right text-white/80">${r.anguloIntersecaoGraus !== undefined ? `${r.anguloIntersecaoGraus.toFixed(1)}°` : '—'}</td>` : ''}
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
      ${alertas.length > 0 ? `
        <div class="mt-2 space-y-1">
          ${alertas.map(r => `
            <div class="flex items-start gap-2 text-[11px] text-amber-200/80">
              <span class="text-amber-400">⚠</span>
              <span><b class="font-mono">${escapeHtml(r.nome)}</b>: ${escapeHtml(r.alerta)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  };

  const renderSecaoPrevia = (num: number, podeCalcular: boolean) => secao(`
    ${tituloEtapa(num, 'Conferir prévia', 'Confira coordenadas e precisão antes de inserir.', `
      <button id="btn-calcular-preview" type="button" class="shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all border ${podeCalcular ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10' : 'border-white/10 text-white/30 cursor-not-allowed'}" ${podeCalcular ? '' : 'disabled'}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
        ${previas[abaAtiva].resultados.length > 0 ? 'Recalcular' : 'Gerar prévia no mapa'}
      </button>
    `)}
    <div class="pl-[30px]">${renderResultados()}</div>
  `, 'vv-secao-previa');

  const renderAbaOffset = () => {
    const n = pontosSelecionadosIds.length;
    const podeCalcular = n >= 2 && paraNumero(distanciaTexto) > 0 && !calculando;
    const exemplos = n > 0
      ? (n <= 3
        ? Array.from({ length: n }, (_, i) => nomeVirtual(i)).join(', ')
        : `${nomeVirtual(0)}, ${nomeVirtual(1)} … ${nomeVirtual(n - 1)}`)
      : '';

    return `
      ${secao(`
        ${tituloEtapa(1, 'Pontos de apoio', 'Sequência medida que define o alinhamento. A ordem determina o sentido.', botaoInverter('btn-inverter-cadeia', n >= 2))}
        <div class="pl-[30px]">${renderCadeia()}</div>
      `)}

      ${secao(`
        ${tituloEtapa(2, 'Deslocamento', 'Distância e lado da linha paralela, olhando no sentido da sequência.')}
        <div class="pl-[30px] grid grid-cols-1 sm:grid-cols-[1fr_1fr_228px] gap-4 items-start">
          ${campoDistancia('distancia', 'Distância', distanciaTexto)}
          ${seletorLado('distancia', ladoOffset)}
          ${caixaDiagrama(n >= 2 ? renderDiagramaOffset() : '<div class="h-[104px] flex items-center justify-center text-[10px] text-white/30">Esquema do deslocamento</div>')}
        </div>
      `)}

      ${secao(`
        ${tituloEtapa(3, 'Nome dos vértices', 'Prefixo usado na numeração. Um vértice virtual por ponto de apoio.')}
        <div class="pl-[30px] flex flex-wrap items-center gap-3">
          <input id="input-prefixo" type="text" value="${escapeHtml(prefixoNome)}" maxlength="12" class="w-24 bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono uppercase" />
          ${n > 0 ? `<span class="text-[11px] text-white/45">Serão criados <b class="text-white/80">${n}</b>: <span class="font-mono text-white/70">${escapeHtml(exemplos)}</span></span>` : ''}
        </div>
      `)}

      ${renderSecaoPrevia(4, podeCalcular)}
    `;
  };

  const renderAbaFaixa = () => {
    const linhasValidas = eixoIds[0] !== eixoIds[1] && divisaIds[0] !== divisaIds[1];
    const podeCalcular = linhasValidas && paraNumero(larguraTexto) > 0 && !calculando;

    return `
      ${secao(`
        ${tituloEtapa(1, 'Eixo da via', 'Dois pontos medidos sobre o eixo. O sentido início → fim define o lado.', botaoInverter('btn-inverter-eixo', true))}
        <div class="pl-[30px]">${renderParPontos('eixo', eixoIds)}</div>
      `)}

      ${secao(`
        ${tituloEtapa(2, 'Divisa do confrontante', 'Dois pontos sobre a divisa. A linha é prolongada até cruzar a faixa.')}
        <div class="pl-[30px]">${renderParPontos('divisa', divisaIds)}</div>
      `)}

      ${secao(`
        ${tituloEtapa(3, 'Faixa de domínio', 'Largura medida a partir do eixo e lado da faixa, olhando no sentido do eixo.')}
        <div class="pl-[30px] grid grid-cols-1 sm:grid-cols-[1fr_1fr_228px] gap-4 items-start">
          ${campoDistancia('largura', 'Largura', larguraTexto)}
          ${seletorLado('largura', ladoFaixa)}
          ${caixaDiagrama(renderDiagramaFaixa())}
        </div>
      `)}

      ${secao(`
        ${tituloEtapa(4, 'Nome do vértice', 'Identificador do vértice criado no cruzamento.')}
        <div class="pl-[30px]">
          <input id="input-nome-faixa" type="text" value="${escapeHtml(nomeVerticeFaixa)}" maxlength="16" class="w-32 bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono uppercase" />
        </div>
      `)}

      ${renderSecaoPrevia(5, podeCalcular)}
    `;
  };

  const renderRodape = () => {
    const n = previas[abaAtiva].resultados.length;
    const pronto = n > 0 && !salvando;
    const dica = n > 0
      ? 'Será adicionado ao perímetro da matrícula.'
      : 'Gere a prévia para habilitar a inserção.';
    return `
      <div class="px-6 py-4 border-t border-white/10 flex items-center justify-between gap-4 shrink-0">
        <button id="btn-cancelar-modal" type="button" class="px-4 py-2 rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-all text-xs font-semibold">
          Cancelar
        </button>
        <div class="flex items-center gap-3">
          <span class="max-sm:hidden text-[11px] text-white/40">${dica}</span>
          <button id="btn-confirmar-gravar" type="button" class="px-4 py-2 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${pronto ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' : 'bg-white/5 text-white/30 cursor-not-allowed'}" ${pronto ? '' : 'disabled'}>
            ${salvando ? 'Inserindo…' : n > 0 ? `Inserir ${n} vértice${n > 1 ? 's' : ''}` : 'Inserir vértices'}
          </button>
        </div>
      </div>
    `;
  };

  const botaoAba = (aba: Aba, rotulo: string) => `
    <button data-aba="${aba}" type="button" class="btn-aba px-3 py-1.5 rounded-md font-semibold transition-all ${abaAtiva === aba ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}">
      ${rotulo}
    </button>
  `;

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
          ${botaoAba('offset', 'Deslocamento paralelo')}
          ${botaoAba('faixa', 'Faixa de domínio × divisa')}
        </div>
        <p class="text-[11px] text-white/40 mt-2">
          ${abaAtiva === 'offset'
            ? 'Cria uma linha paralela a uma sequência de pontos, com um vértice para cada ponto.'
            : 'Cria um único vértice onde o limite da faixa de domínio (paralela ao eixo da via) cruza a divisa do confrontante.'}
        </p>
      </div>

      <div class="px-6 py-5 overflow-y-auto space-y-4 flex-1 text-xs">
        ${abaAtiva === 'offset' ? renderAbaOffset() : renderAbaFaixa()}
      </div>

      ${renderRodape()}
    `;

    // Eventos
    container.querySelector('#btn-fechar-modal-vvirtual')?.addEventListener('click', fecharModal);
    container.querySelector('#btn-cancelar-modal')?.addEventListener('click', fecharModal);

    container.querySelectorAll<HTMLElement>('.btn-aba').forEach(btn => {
      btn.addEventListener('click', () => {
        const aba = btn.dataset.aba as Aba;
        if (aba === abaAtiva) return;
        abaAtiva = aba;
        desenharPreviewNoMapa(previas[aba].resultados);
        renderConteudo();
      });
    });

    // Deslocamento paralelo
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

    container.querySelector('#input-prefixo')?.addEventListener('input', (e) => {
      prefixoNome = (e.target as HTMLInputElement).value.trim().toUpperCase();
      invalidarPrevia();
      renderMantendoFoco('input-prefixo');
    });

    // Faixa de domínio
    container.querySelectorAll<HTMLSelectElement>('.sel-par-ponto').forEach(sel => {
      sel.addEventListener('change', () => {
        const linha = sel.dataset.linha === 'eixo' ? eixoIds : divisaIds;
        linha[Number(sel.dataset.indice)] = Number(sel.value);
        invalidarPrevia();
        renderConteudo();
      });
    });

    container.querySelector('#btn-inverter-eixo')?.addEventListener('click', () => {
      eixoIds = [eixoIds[1], eixoIds[0]];
      invalidarPrevia();
      renderConteudo();
    });

    container.querySelector('#input-nome-faixa')?.addEventListener('input', (e) => {
      nomeVerticeFaixa = (e.target as HTMLInputElement).value.trim().toUpperCase();
      invalidarPrevia();
      renderMantendoFoco('input-nome-faixa');
    });

    // Campos compartilhados (distância/largura e lado)
    const definirTexto = (campo: CampoDistancia, texto: string) => {
      if (campo === 'distancia') distanciaTexto = texto;
      else larguraTexto = texto;
    };

    (['distancia', 'largura'] as CampoDistancia[]).forEach(campo => {
      container.querySelector(`#input-${campo}`)?.addEventListener('input', (e) => {
        definirTexto(campo, (e.target as HTMLInputElement).value);
        invalidarPrevia();
        renderMantendoFoco(`input-${campo}`);
      });
    });

    container.querySelectorAll<HTMLElement>('.btn-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        definirTexto(btn.dataset.campo as CampoDistancia, btn.dataset.val || '15');
        invalidarPrevia();
        renderConteudo();
      });
    });

    container.querySelectorAll<HTMLElement>('.btn-lado').forEach(btn => {
      btn.addEventListener('click', () => {
        const lado = btn.dataset.lado as LadoOffset;
        const atual = btn.dataset.campo === 'distancia' ? ladoOffset : ladoFaixa;
        if (lado === atual) return;
        if (btn.dataset.campo === 'distancia') ladoOffset = lado;
        else ladoFaixa = lado;
        invalidarPrevia();
        renderConteudo();
      });
    });

    container.querySelector('#btn-calcular-preview')?.addEventListener('click', () => {
      if (abaAtiva === 'offset') calcularOffsetApi();
      else calcularFaixaApi();
    });
    container.querySelector('#btn-confirmar-gravar')?.addEventListener('click', confirmarInsercao);
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
