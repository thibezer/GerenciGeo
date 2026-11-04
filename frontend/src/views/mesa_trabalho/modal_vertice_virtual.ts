import L from 'leaflet';
import { API_BASE } from '../../config';
import { showToast, escapeHtml } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import type { LadoOffset, RespostaVerticeVirtual } from '../../types/verticesVirtuais';
import { coordenadaPonto } from './coordenadas_mapa';
import { avisoContinuidadeAlinhamento } from '../../utils/continuidadeAlinhamento';
import { ehVerticeVirtualRascunho } from './modal_promover_virtuais';

const PRESETS_DISTANCIA = [5, 10, 15, 20, 25, 30];
const LIMITE_SIGMA_P_M = 0.5;

type Aba = 'intersecao' | 'faixa' | 'offset';
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
});

// Aceita "15", "15,5", "15.5" e "1.500,5"; qualquer outra coisa vale 0 (campo inválido)
const paraNumero = (texto: string) => {
  let t = texto.trim();
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return 0;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : 0;
};

// Corpo da resposta pode não ser JSON (proxy/500); `detail` do FastAPI pode ser lista (422)
const lerJson = async (res: Response): Promise<any> => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};
const mensagemErro = (data: any, padrao: string): string =>
  typeof data?.detail === 'string' && data.detail.trim() ? data.detail : padrao;

// UTM → lat/lon a partir de um ponto de referência próximo (plano local + convergência meridiana)
const utmParaLatLonLocal = (
  ref: { lat: number; lon: number; e: number; n: number },
  fuso: number,
  e: number,
  n: number,
): [number, number] => {
  const rad = Math.PI / 180;
  const phi = ref.lat * rad;
  const metrosPorGrauLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
  const metrosPorGrauLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  const lon0 = fuso * 6 - 183;
  const gamma = Math.atan(Math.tan((ref.lon - lon0) * rad) * Math.sin(phi));
  const dE = e - ref.e;
  const dN = n - ref.n;
  // O norte da grade está girado de gamma em relação ao norte verdadeiro
  const dEv = dE * Math.cos(gamma) + dN * Math.sin(gamma);
  const dNv = -dE * Math.sin(gamma) + dN * Math.cos(gamma);
  return [ref.lat + dNv / metrosPorGrauLat, ref.lon + dEv / metrosPorGrauLon];
};

export async function abrirModalVerticeVirtual(ctx: MesaTrabalhoContext, abaInicial: Aba = 'intersecao'): Promise<void> {
  if (document.getElementById('vv-overlay')) return; // já aberto

  const levId = ctx.currentLevId;
  const matId = ctx.currentMatriculaId;
  const map = ctx.triagemMap;

  if (!levId || !matId) {
    showToast('Selecione um levantamento e matrícula ativos para criar vértices virtuais.', 'info');
    return;
  }

  // Identifica pontos elegíveis
  // Rascunhos virtuais (fora do polígono) continuam disponíveis como apoio para novos cálculos
  const pontosDisponiveis = (ctx.pontosList || []).filter(p => !p.ignorar_poligono || ehVerticeVirtualRascunho(p));
  if (pontosDisponiveis.length < 2) {
    showToast('São necessários pelo menos 2 pontos cadastrados no levantamento para cálculo virtual.', 'info');
    return;
  }

  const fusoUtm = Number(pontosDisponiveis.find(p => p.fuso_utm)?.fuso_utm) || 22;

  // Camadas de preview no Leaflet
  let previewLayerGroup: L.LayerGroup | null = null;
  if (map) {
    previewLayerGroup = L.layerGroup().addTo(map);
  }

  // Guias das linhas escolhidas (com prolongamento até o cruzamento), visíveis antes de calcular
  const guiasLayer: L.LayerGroup | null = map ? L.layerGroup().addTo(map) : null;
  let guiasBounds: L.LatLngBounds | null = null;

  const limparPreviewMapa = () => {
    if (previewLayerGroup && map) {
      previewLayerGroup.clearLayers();
    }
  };

  const overlay = document.createElement('div');
  overlay.id = 'vv-overlay';
  overlay.className = 'fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-200 opacity-0 z-[999999]';

  const container = document.createElement('div');
  container.className = 'w-full max-w-3xl mx-4 bg-[#111113] border border-white/10 rounded-technical shadow-2xl transform scale-95 transition-transform duration-200 max-h-[90vh] flex flex-col text-white';

  // Pré-seleção: se houver pontos selecionados, usa-os
  const idsIniciais: number[] = ((ctx.selectedPontoIds && ctx.selectedPontoIds.length >= 2)
    ? ctx.selectedPontoIds
    : []).map(Number);
  const idPadrao = (i: number): number => idsIniciais[i] ?? Number(pontosDisponiveis[i % pontosDisponiveis.length]?.id ?? 0);

  let abaAtiva: Aba = abaInicial;

  // Deslocamento paralelo (cadeia)
  // Valores brutos dos inputs, para não perder o que o usuário está digitando ("1.", "") ao re-renderizar
  let distanciaTexto = '15';
  let ladoOffset: LadoOffset = 'DIREITA';
  let prefixoNome = 'V';
  // Mesma regra da ferramenta de offset no mapa: a cadeia segue a ordem de caminhamento, não a de clique
  const ordemDoPonto = (id: number) =>
    Number(pontosDisponiveis.find(p => Number(p.id) === id)?.ordem_caminhamento) || 0;
  let pontosSelecionadosIds: number[] = [...idsIniciais].sort((a, b) => ordemDoPonto(a) - ordemDoPonto(b));

  const obterProximoNumeroVirtual = (prefix: string = 'V'): number => {
    let maxNum = 0;
    const cleanPref = (prefix || 'V').trim().toUpperCase().replace(/[-_]$/, '');
    const regex = new RegExp(`^${cleanPref}[-_]?(\\d+)$`, 'i');
    for (const p of pontosDisponiveis) {
      const nome = String(p.nome_vertice || '').trim();
      const match = nome.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
    return maxNum + 1;
  };

  // Interseção pura de 2 alinhamentos (PA2)
  let nomeVerticeIntersecao = `V-${String(obterProximoNumeroVirtual('V')).padStart(2, '0')}`;
  let alinhamento1Ids: [number, number] = [idPadrao(0), idPadrao(1)];
  let alinhamento2Ids: [number, number] = [idPadrao(2), idPadrao(3)];

  // Faixa de domínio (PA1 + PA2)
  let larguraTexto = '15';
  let ladoFaixa: LadoOffset = 'DIREITA';
  let nomeVerticeFaixa = `V-${String(obterProximoNumeroVirtual('V')).padStart(2, '0')}`;
  let eixoIds: [number, number] = [idPadrao(0), idPadrao(1)];
  let divisaIds: [number, number] = [idPadrao(2), idPadrao(3)];

  const previas: Record<Aba, { resultados: RespostaVerticeVirtual[]; desatualizada: boolean }> = {
    intersecao: { resultados: [], desatualizada: false },
    offset: { resultados: [], desatualizada: false },
    faixa: { resultados: [], desatualizada: false },
  };
  let calculando = false;
  let salvando = false;
  let fechado = false;
  // Incrementa a cada mudança de parâmetro; a resposta de um cálculo só vale se a versão não mudou
  let versaoParametros = 0;

  // Botão flutuante para devolver o modal depois de "Ver mapa"
  const botaoRestaurar = document.createElement('button');
  botaoRestaurar.type = 'button';
  botaoRestaurar.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[999999] hidden px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-2xl';
  botaoRestaurar.textContent = 'Voltar aos vértices virtuais';

  const definirOculto = (oculto: boolean) => {
    overlay.classList.toggle('opacity-0', oculto);
    overlay.classList.toggle('pointer-events-none', oculto);
    overlay.classList.toggle('opacity-100', !oculto);
    botaoRestaurar.classList.toggle('hidden', !oculto);
  };
  botaoRestaurar.addEventListener('click', () => {
    if (alvoPick) encerrarPick();
    else definirOculto(false);
  });

  // ── Escolha de pontos direto no mapa ────────────────────────────────────────
  type LinhaId = 'eixo' | 'divisa' | 'linha1' | 'linha2';
  const ROTULO_LINHA: Record<LinhaId, string> = { eixo: 'Eixo', divisa: 'Divisa', linha1: 'Linha 1', linha2: 'Linha 2' };
  let alvoPick: LinhaId | null = null;
  let pickPendente: number | null = null;
  let ultimoPick = { id: 0, instante: 0 };
  const cliqueOriginal = ctx.cliqueVerticeMapa;

  const idsDaLinha = (linha: LinhaId): [number, number] =>
    linha === 'eixo' ? eixoIds : linha === 'divisa' ? divisaIds : linha === 'linha1' ? alinhamento1Ids : alinhamento2Ids;

  const bannerPick = document.createElement('div');
  bannerPick.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[999999] hidden items-center gap-3 px-4 py-2 rounded-full bg-[#111113] border border-emerald-500/50 text-white text-xs shadow-2xl';

  const atualizarBannerPick = () => {
    if (!alvoPick) return;
    const etapa = pickPendente === null ? 'ponto inicial' : 'ponto final';
    bannerPick.innerHTML = `
      <span><b class="text-emerald-300">${ROTULO_LINHA[alvoPick]}</b>: clique no <b>${etapa}</b> no mapa${pickPendente !== null ? ` (início: ${escapeHtml(nomePonto(pickPendente))})` : ''}</span>
      <button type="button" class="px-2 py-0.5 rounded text-white/60 hover:text-white hover:bg-white/10">Cancelar (Esc)</button>
    `;
    bannerPick.querySelector('button')?.addEventListener('click', () => encerrarPick());
  };

  function encerrarPick(): void {
    alvoPick = null;
    pickPendente = null;
    bannerPick.classList.add('hidden');
    bannerPick.classList.remove('flex');
    ctx.cliqueVerticeMapa = cliqueOriginal;
    definirOculto(false);
    renderConteudo();
  }

  const aoClicarPontoNoMapa = (idBruto: number | string) => {
    if (!alvoPick) return;
    const id = Number(idBruto);
    // O mesmo clique chega por dois caminhos (callback do marcador e evento do canvas)
    const agora = Date.now();
    if (ultimoPick.id === id && agora - ultimoPick.instante < 400) return;
    ultimoPick = { id, instante: agora };

    if (!pontosDisponiveis.some(p => Number(p.id) === id)) {
      showToast('Esse ponto não está disponível para o cálculo.', 'info');
      return;
    }
    if (pickPendente === null) {
      pickPendente = id;
      atualizarBannerPick();
      desenharGuias();
      return;
    }
    if (id === pickPendente) {
      showToast('Escolha um ponto diferente do inicial.', 'info');
      return;
    }
    const par = idsDaLinha(alvoPick);
    par[0] = pickPendente;
    par[1] = id;
    invalidarPrevia();
    encerrarPick();
  };

  const iniciarPick = (linha: LinhaId) => {
    if (!map) return;
    alvoPick = linha;
    pickPendente = null;
    ctx.cliqueVerticeMapa = (id: number | string) => aoClicarPontoNoMapa(id);
    atualizarBannerPick();
    bannerPick.classList.remove('hidden');
    bannerPick.classList.add('flex');
    definirOculto(true);
    desenharGuias();
  };

  const nomePonto = (pid: number) => {
    const p = pontosDisponiveis.find(pt => pt.id === pid);
    return String(p?.nome_vertice || `P${pid}`);
  };

  const nomeVirtual = (i: number) => {
    const rawPref = (prefixoNome || 'V').trim().toUpperCase();
    const sep = rawPref.endsWith('-') || rawPref.endsWith('_') ? '' : '-';
    const cleanPref = rawPref.replace(/[-_]$/, '');
    const startIdx = obterProximoNumeroVirtual(cleanPref);
    return `${cleanPref}${sep}${String(startIdx + i).padStart(2, '0')}`;
  };

  const fecharModal = () => {
    fechado = true;
    botaoRestaurar.remove();
    bannerPick.remove();
    if (alvoPick) ctx.cliqueVerticeMapa = cliqueOriginal;
    alvoPick = null;
    limparPreviewMapa();
    if (previewLayerGroup && map) {
      map.removeLayer(previewLayerGroup);
    }
    if (guiasLayer && map) {
      guiasLayer.clearLayers();
      map.removeLayer(guiasLayer);
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
    versaoParametros++;
    const previa = previas[abaAtiva];
    if (calculando) previa.desatualizada = true;
    if (previa.resultados.length > 0) {
      previa.resultados = [];
      previa.desatualizada = true;
      limparPreviewMapa();
    }
  };

  // Desenha as linhas escolhidas e o prolongamento até o cruzamento previsto (plano local em metros: só visual)
  const desenharGuias = () => {
    if (!guiasLayer || !map) return;
    guiasLayer.clearLayers();
    guiasBounds = null;
    if (abaAtiva === 'offset') return;

    type XY = { x: number; y: number };
    const linhasAba: LinhaId[] = abaAtiva === 'intersecao' ? ['linha1', 'linha2'] : ['eixo', 'divisa'];
    const coords = linhasAba.map(l => idsDaLinha(l).map(id => {
      const pt = pontosDisponiveis.find(p => Number(p.id) === Number(id));
      return { id, c: pt ? coordenadaPonto(pt) : null };
    }));
    const pendente = pickPendente !== null
      ? { id: pickPendente, c: coordenadaPonto(pontosDisponiveis.find(p => Number(p.id) === pickPendente)) }
      : null;

    const todos = coords.flat();
    const ref = todos.find(t => t.c)?.c;
    if (!ref) return;
    const mLat = 111320;
    const mLon = 111320 * Math.cos(ref.lat * Math.PI / 180);
    const proj = (c: { lat: number; lon: number }): XY => ({ x: (c.lon - ref.lon) * mLon, y: (c.lat - ref.lat) * mLat });
    const unproj = (p: XY): [number, number] => [ref.lat + p.y / mLat, ref.lon + p.x / mLon];
    const marcador = (id: number, c: { lat: number; lon: number }, cor: string) => {
      const m = L.circleMarker([c.lat, c.lon], { radius: 6, color: cor, weight: 2, fillColor: '#111113', fillOpacity: 0.9 });
      m.bindTooltip(escapeHtml(nomePonto(id)), { permanent: true, direction: 'top', offset: [0, -6] });
      guiasLayer.addLayer(m);
    };

    if (pendente?.c) { marcador(pendente.id, pendente.c, '#10b981'); guiasBounds = L.latLngBounds([[pendente.c.lat, pendente.c.lon]]); }

    // Retas completas (quatro pontos válidos), exceto a que está sendo escolhida no mapa
    const emEscolha = alvoPick ? linhasAba.indexOf(alvoPick) : -1;
    const validas = coords.map((par, i) => i !== emEscolha && par[0].c && par[1].c && par[0].id !== par[1].id);
    const cores = abaAtiva === 'intersecao' ? ['#38bdf8', '#fbbf24'] : ['#e5e7eb', '#fbbf24'];

    const pares: ([XY, XY] | null)[] = coords.map((par, i) => validas[i] ? [proj(par[0].c!), proj(par[1].c!)] : null);
    // Na faixa de domínio o cruzamento é com a paralela do eixo, não com o eixo em si
    let retaA = pares[0];
    if (abaAtiva === 'faixa' && pares[0]) {
      const [a, b] = pares[0];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      const d = paraNumero(larguraTexto) * (ladoFaixa === 'DIREITA' ? 1 : -1);
      retaA = len > 1e-6 ? [{ x: a.x + d * dy / len, y: a.y - d * dx / len }, { x: b.x + d * dy / len, y: b.y - d * dx / len }] : null;
    }
    const retaB = pares[1];

    let ta: number | null = null, tb: number | null = null, cruz: XY | null = null;
    if (retaA && retaB) {
      const [a, b] = retaA, [c, e] = retaB;
      const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: e.x - c.x, y: e.y - c.y };
      const den = r.x * s.y - r.y * s.x;
      if (Math.abs(den) > 1e-9) {
        ta = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
        tb = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
        cruz = { x: a.x + ta * r.x, y: a.y + ta * r.y };
      }
    }

    const desenharReta = (reta: [XY, XY], t: number | null, cor: string, tracejada: boolean) => {
      const [a, b] = reta;
      const linha = L.polyline([unproj(a), unproj(b)], { color: cor, weight: 3, opacity: 0.9, dashArray: tracejada ? '8, 6' : undefined });
      guiasLayer.addLayer(linha);
      if (cruz && t !== null && (t < 0 || t > 1)) {
        const extremo = t > 1 ? b : a;
        guiasLayer.addLayer(L.polyline([unproj(extremo), unproj(cruz)], { color: cor, weight: 2.5, opacity: 0.9, dashArray: '2, 7' }));
      }
    };

    const latlngsBounds: [number, number][] = [];
    coords.forEach((par, i) => {
      if (i === emEscolha) return;
      par.forEach(p => { if (p.c) marcador(p.id, p.c, cores[i]); });
    });
    if (retaA && retaB) {
      if (abaAtiva === 'faixa' && pares[0]) desenharReta(pares[0], null, cores[0], false);
      desenharReta(retaA, ta, abaAtiva === 'faixa' ? '#10b981' : cores[0], abaAtiva === 'faixa');
      desenharReta(retaB, tb, cores[1], false);
    } else {
      if (pares[0]) desenharReta(pares[0], null, cores[0], false);
      if (pares[1]) desenharReta(pares[1], null, cores[1], false);
    }

    if (cruz) {
      const nome = abaAtiva === 'intersecao' ? nomeVerticeIntersecao : nomeVerticeFaixa;
      const extensoes: string[] = [];
      const medir = (rotulo: string, t: number | null, reta: [XY, XY]) => {
        if (t === null || (t >= 0 && t <= 1)) return;
        const len = Math.hypot(reta[1].x - reta[0].x, reta[1].y - reta[0].y);
        extensoes.push(`prolonga ${rotulo} em ${(Math.abs(t > 1 ? t - 1 : t) * len).toFixed(1)} m`);
      };
      medir(abaAtiva === 'intersecao' ? 'Linha 1' : 'a paralela do eixo', ta, retaA!);
      medir(abaAtiva === 'intersecao' ? 'Linha 2' : 'a divisa', tb, retaB!);
      const pos = unproj(cruz);
      const m = L.circleMarker(pos, { radius: 7, color: '#10b981', weight: 2, fillColor: '#10b981', fillOpacity: 0.25, dashArray: '3, 3' });
      m.bindTooltip(`<b>${escapeHtml(nome || 'V')}</b> (previsto)${extensoes.length ? `<br>${extensoes.join('<br>')}` : '<br>cruza dentro dos segmentos'}`, { permanent: true, direction: 'right', offset: [8, 0] });
      guiasLayer.addLayer(m);
      latlngsBounds.push(pos);
    }

    todos.forEach(t => { if (t.c) latlngsBounds.push([t.c.lat, t.c.lon]); });
    if (latlngsBounds.length > 0) guiasBounds = L.latLngBounds(latlngsBounds);
  };

  const desenharPreviewNoMapa = (resultados: RespostaVerticeVirtual[]) => {
    if (!previewLayerGroup || !map) return;
    previewLayerGroup.clearLayers();
    if (resultados.length === 0) return;

    // Converte UTM para LatLng a partir do ponto de apoio DA ABA ATUAL mais próximo do resultado
    const latlngs: [number, number][] = [];
    const idsAba = abaAtiva === 'intersecao'
      ? [...alinhamento1Ids, ...alinhamento2Ids]
      : abaAtiva === 'faixa' ? [...eixoIds, ...divisaIds] : pontosSelecionadosIds;
    const candidatos = idsAba
      .map(id => pontosDisponiveis.find(pt => Number(pt.id) === Number(id)))
      .map(pt => {
        const c = coordenadaPonto(pt);
        const e = Number(pt?.e_corrigido || pt?.e_original || 0);
        const n = Number(pt?.n_corrigido || pt?.n_original || 0);
        return c && e > 0 && n > 0 ? { lat: c.lat, lon: c.lon, e, n } : null;
      })
      .filter((c): c is { lat: number; lon: number; e: number; n: number } => c !== null);
    const alvo = resultados[0];
    const ref = candidatos.sort((a, b) =>
      Math.hypot(a.e - alvo.este, a.n - alvo.norte) - Math.hypot(b.e - alvo.este, b.n - alvo.norte))[0];

    if (!ref) {
      showToast('Prévia indisponível no mapa: os pontos de apoio não têm coordenada UTM. A tabela continua válida.', 'info');
    } else {
      resultados.forEach(r => {
        const pos = utmParaLatLonLocal(ref, fusoUtm, r.este, r.norte);
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
    }

    if (abaAtiva === 'intersecao' && resultados.length === 1 && latlngs.length === 1) {
      const p1 = pontosDisponiveis.find(p => p.id === alinhamento1Ids[0]);
      const p2 = pontosDisponiveis.find(p => p.id === alinhamento1Ids[1]);
      const p3 = pontosDisponiveis.find(p => p.id === alinhamento2Ids[0]);
      const p4 = pontosDisponiveis.find(p => p.id === alinhamento2Ids[1]);
      const c1 = p1 ? coordenadaPonto(p1) : null;
      const c2 = p2 ? coordenadaPonto(p2) : null;
      const c3 = p3 ? coordenadaPonto(p3) : null;
      const c4 = p4 ? coordenadaPonto(p4) : null;
      const boundsPts: [number, number][] = [latlngs[0]];
      if (c1 && c2) {
        boundsPts.push([c1.lat, c1.lon], [c2.lat, c2.lon]);
        const line1 = L.polyline([[c1.lat, c1.lon], [c2.lat, c2.lon]], {
          color: '#38bdf8',
          weight: 2,
          dashArray: '5, 5',
          opacity: 0.85
        });
        previewLayerGroup!.addLayer(line1);
      }
      if (c3 && c4) {
        boundsPts.push([c3.lat, c3.lon], [c4.lat, c4.lon]);
        const line2 = L.polyline([[c3.lat, c3.lon], [c4.lat, c4.lon]], {
          color: '#fbbf24',
          weight: 2,
          dashArray: '5, 5',
          opacity: 0.85
        });
        previewLayerGroup!.addLayer(line2);
      }
      if (boundsPts.length > 1) {
        map.fitBounds(L.latLngBounds(boundsPts), { padding: [50, 50], maxZoom: 18 });
      } else {
        map.setView(latlngs[0], Math.max(map.getZoom(), 17));
      }
    } else if (latlngs.length >= 2) {
      const line = L.polyline(latlngs, {
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
    const versao = versaoParametros;
    renderConteudo();

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/vertices-virtuais/${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
      });
      const data = await lerJson(res);
      if (fechado) return;
      if (!res.ok) throw new Error(mensagemErro(data, 'Falha no cálculo dos vértices virtuais.'));

      if (versao !== versaoParametros) {
        // Parâmetros mudaram durante o cálculo: o resultado não corresponde mais ao que está na tela
        previas[aba].desatualizada = true;
        return;
      }
      const brutos = aba === 'offset' ? (data.resultados || []) : (data.resultado ? [data.resultado] : []);
      previas[aba].resultados = brutos.map(normalizarResultado);
      previas[aba].desatualizada = false;
      if (abaAtiva === aba) desenharPreviewNoMapa(previas[aba].resultados);
    } catch (err: any) {
      if (!fechado) showToast(err.message, 'error');
    } finally {
      if (!fechado) {
        calculando = false;
        renderConteudo();
      }
      if (!fechado && previas[abaAtiva].resultados.length > 0) {
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
    const cleanPref = (prefixoNome || 'V').trim().toUpperCase().replace(/[-_]$/, '');
    const startIdx = obterProximoNumeroVirtual(cleanPref);
    executarCalculo('offset', 'calcular-offset-lote', {
      ponto_ids: pontosSelecionadosIds,
      distancia: paraNumero(distanciaTexto),
      lado: ladoOffset,
      prefixo_nome: prefixoNome || 'V',
      indice_inicial: startIdx
    });
  };

  const calcularFaixaApi = () => {
    if (!nomeVerticeFaixa.trim()) {
      showToast('Informe o nome do vértice.', 'info');
      return;
    }
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
      nome_vertice: nomeVerticeFaixa.trim()
    });
  };

  const calcularIntersecaoApi = () => {
    if (!nomeVerticeIntersecao.trim()) {
      showToast('Informe o nome do vértice.', 'info');
      return;
    }
    if (alinhamento1Ids[0] === alinhamento1Ids[1] || alinhamento2Ids[0] === alinhamento2Ids[1]) {
      showToast('O início e o fim de cada alinhamento precisam ser pontos diferentes.', 'info');
      return;
    }
    if (
      (alinhamento1Ids[0] === alinhamento2Ids[0] && alinhamento1Ids[1] === alinhamento2Ids[1]) ||
      (alinhamento1Ids[0] === alinhamento2Ids[1] && alinhamento1Ids[1] === alinhamento2Ids[0])
    ) {
      showToast('Os dois alinhamentos não podem ser formados pelos mesmos pontos.', 'info');
      return;
    }
    executarCalculo('intersecao', 'calcular-pa2-puro', {
      alinhamento1_inicio_id: alinhamento1Ids[0],
      alinhamento1_fim_id: alinhamento1Ids[1],
      alinhamento2_inicio_id: alinhamento2Ids[0],
      alinhamento2_fim_id: alinhamento2Ids[1],
      nome_vertice: nomeVerticeIntersecao.trim()
    });
  };

  const confirmarInsercao = async () => {
    const resultados = previas[abaAtiva].resultados;
    if (resultados.length === 0) {
      showToast('Calcule a prévia dos vértices antes de confirmar.', 'info');
      return;
    }
    salvando = true;
    let inserido = false;
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
      const data = await lerJson(res);
      if (!res.ok) throw new Error(mensagemErro(data, 'Erro ao persistir vértices virtuais.'));

      showToast(data.mensagem || 'Vértices virtuais inseridos no perímetro com sucesso!', 'success');
      if (Array.isArray(data.renomeados) && data.renomeados.length > 0) {
        const trocas = data.renomeados.map((r: { de: string; para: string }) => `${r.de} → ${r.para}`).join(', ');
        showToast(`Nome já existente na matrícula, ajustado: ${trocas}`, 'info');
      }
      inserido = true;
    } catch (err: any) {
      showToast(typeof err?.message === 'string' ? err.message : 'Erro ao persistir vértices virtuais.', 'error');
      salvando = false;
      renderConteudo();
    }

    if (!inserido) return;
    fecharModal();
    try {
      if (typeof ctx.loadLevantamentoDetails === 'function') await ctx.loadLevantamentoDetails();
    } catch {
      showToast('Vértices inseridos, mas não foi possível atualizar a tela. Recarregue o levantamento.', 'info');
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
    const avisoContinuidade = avisoContinuidadeAlinhamento(
      pontosSelecionadosIds.map(id => pontosDisponiveis.find(p => Number(p.id) === id)).filter(Boolean) as any[],
      ctx.pontosList || [],
      ctx.currentMatriculaId,
    );
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
      ${avisoContinuidade ? `<div class="mt-2 text-[11px] text-amber-400">⚠ ${escapeHtml(avisoContinuidade)}</div>` : ''}
    `;
  };

  // Par de selects início → fim para uma linha definida por dois pontos
  const renderParPontos = (linha: 'eixo' | 'divisa' | 'linha1' | 'linha2', ids: [number, number]) => {
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
      ${map ? `
        <button type="button" data-linha="${linha}" class="btn-pick-mapa mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300/80 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md px-2 py-1 -ml-2 transition-colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="1" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="23"/><line x1="1" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="23" y2="12"/></svg>
          Escolher no mapa
        </button>` : ''}
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
      if (!desatualizada) return '';
      return `
        <div class="flex items-center gap-3 px-4 py-4 rounded-lg border border-dashed ${desatualizada ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-white/10'}">
          <svg class="shrink-0 ${desatualizada ? 'text-amber-400' : 'text-white/30'}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <div class="text-[11px] leading-snug ${desatualizada ? 'text-amber-200/80' : 'text-white/45'}">
            ${desatualizada
              ? 'Os parâmetros mudaram. Gere a prévia novamente para conferir antes de inserir.'
              : ''}
          </div>
        </div>
      `;
    }

    const conformes = resultados.filter(r => r.conformeNormaIncra).length;
    const todosConformes = conformes === resultados.length;
    const comAngulo = resultados.some(r => r.anguloIntersecaoGraus !== undefined) && (abaAtiva === 'faixa' || abaAtiva === 'intersecao');
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
                ${comAngulo ? '<th class="px-3 py-1.5 font-medium text-right" title="Ângulo de interseção entre os alinhamentos">Ângulo</th>' : ''}
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
    const nomeOk = nomeVerticeFaixa.trim() !== '';
    const podeCalcular = linhasValidas && nomeOk && paraNumero(larguraTexto) > 0 && !calculando;

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
          <input id="input-nome-faixa" type="text" value="${escapeHtml(nomeVerticeFaixa)}" maxlength="16" class="w-32 bg-white/5 border ${nomeOk ? 'border-white/10' : 'border-red-500/50'} rounded-md px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono uppercase" />
        </div>
      `)}

      ${renderSecaoPrevia(5, podeCalcular)}
    `;
  };

  // Esquema: Linha 1 (azul claro) e Linha 2 (âmbar) se cruzando no vértice V (verde)
  const renderDiagramaIntersecao = () => {
    return `
      <svg viewBox="0 0 228 104" class="w-full h-auto" aria-hidden="true">
        ${defsSeta}
        <!-- Linha 1 (azul claro) -->
        <line x1="20" y1="28" x2="208" y2="76" stroke="#38bdf8" stroke-width="2" marker-end="url(#vv-seta)" />
        <circle cx="36" cy="32" r="3" fill="#111113" stroke="#38bdf8" stroke-width="1.5" />
        <circle cx="188" cy="71" r="3" fill="#111113" stroke="#38bdf8" stroke-width="1.5" />
        <!-- Linha 2 (âmbar) -->
        <line x1="48" y1="92" x2="180" y2="12" stroke="#f59e0b" stroke-width="2" marker-end="url(#vv-seta)" />
        <circle cx="62" cy="83" r="3" fill="#111113" stroke="#f59e0b" stroke-width="1.5" />
        <circle cx="166" cy="20" r="3" fill="#111113" stroke="#f59e0b" stroke-width="1.5" />
        <!-- Ponto V no cruzamento central -->
        <circle cx="114" cy="52" r="5" fill="#10b981" stroke="#111113" stroke-width="2" />
        <text x="122" y="48" ${estiloRotulo} fill="#6ee7b7" font-weight="bold">V</text>
        <text x="20" y="20" ${estiloRotulo} fill="#38bdf8">Linha 1</text>
        <text x="176" y="10" ${estiloRotulo} fill="#fbbf24">Linha 2</text>
      </svg>
    `;
  };

  const renderAbaIntersecao = () => {
    const linhasValidas = alinhamento1Ids[0] !== alinhamento1Ids[1] && alinhamento2Ids[0] !== alinhamento2Ids[1];
    const mesmasLinhas =
      (alinhamento1Ids[0] === alinhamento2Ids[0] && alinhamento1Ids[1] === alinhamento2Ids[1]) ||
      (alinhamento1Ids[0] === alinhamento2Ids[1] && alinhamento1Ids[1] === alinhamento2Ids[0]);
    const nomeOk = nomeVerticeIntersecao.trim() !== '';
    const podeCalcular = linhasValidas && !mesmasLinhas && nomeOk && !calculando;

    return `
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_228px] gap-x-4 gap-y-4 items-center">
        <div class="space-y-4">
          ${secao(`
            ${tituloEtapa(1, 'Linha 1 (Primeiro alinhamento)', 'Dois pontos conhecidos que definem a primeira reta.')}
            <div class="pl-[30px]">${renderParPontos('linha1', alinhamento1Ids)}</div>
          `)}

          ${secao(`
            ${tituloEtapa(2, 'Linha 2 (Segundo alinhamento)', 'Dois pontos conhecidos que definem a reta que cruza a Linha 1.')}
            <div class="pl-[30px]">
              ${renderParPontos('linha2', alinhamento2Ids)}
              ${mesmasLinhas ? '<div class="mt-2 text-[11px] text-amber-400">As duas linhas não podem usar os mesmos pontos.</div>' : ''}
            </div>
          `)}
        </div>
        ${caixaDiagrama(renderDiagramaIntersecao())}
      </div>

      ${secao(`
        ${tituloEtapa(3, 'Nome do vértice', 'Identificador do vértice gerado no cruzamento das duas linhas.')}
        <div class="pl-[30px]">
          <input id="input-nome-intersecao" type="text" value="${escapeHtml(nomeVerticeIntersecao)}" maxlength="16" class="w-32 bg-white/5 border ${nomeOk ? 'border-white/10' : 'border-red-500/50'} rounded-md px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono uppercase" />
        </div>
      `)}

      ${renderSecaoPrevia(4, podeCalcular)}
    `;
  };

  const renderRodape = () => {
    const n = previas[abaAtiva].resultados.length;
    const pronto = n > 0 && !salvando;
    const dica = n > 0
      ? 'Entra como rascunho, fora do perímetro. Depois use "Inserir no perímetro".'
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

  const renderConteudo = (preservarRolagem = true) => {
    const rolagem = preservarRolagem
      ? (container.querySelector<HTMLElement>('#vv-corpo')?.scrollTop ?? 0)
      : 0;
    container.innerHTML = `
      <div class="px-6 pt-5 pb-4 flex items-center justify-between gap-4 shrink-0">
        <div class="flex items-center gap-4 flex-wrap">
          <h3 class="text-base font-bold text-white">Criar vértices virtuais</h3>
          <div class="inline-flex p-0.5 rounded-lg bg-white/5 border border-white/10 text-xs">
            ${botaoAba('intersecao', 'Interseção')}
            ${botaoAba('faixa', 'F. Domínio')}
            ${botaoAba('offset', 'Deslocamento')}
          </div>
        </div>
        <div class="flex items-center gap-1 -mr-1.5">
          ${map ? `
            <button id="btn-ocultar-modal" type="button" class="flex items-center gap-1 text-[11px] text-white/50 hover:text-white hover:bg-white/5 rounded-md transition-colors px-2 py-1.5" title="Ocultar o modal para ver a prévia no mapa">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Ver mapa
            </button>` : ''}
          <button id="btn-fechar-modal-vvirtual" type="button" class="text-white/40 hover:text-white hover:bg-white/5 rounded-md transition-colors p-1.5" title="Fechar (Esc)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div class="px-6 shrink-0">
        <p class="text-[11px] text-white/40">
          ${abaAtiva === 'intersecao'
            ? 'Vértice no cruzamento de duas retas definidas por pontos conhecidos.'
            : abaAtiva === 'offset'
              ? 'Linha paralela a uma sequência de pontos, com um vértice por ponto.'
              : 'Vértice onde o limite da faixa de domínio cruza a divisa do confrontante.'}
        </p>
      </div>

      <div id="vv-corpo" class="px-6 py-5 overflow-y-auto space-y-4 flex-1 text-xs">
        ${abaAtiva === 'intersecao' ? renderAbaIntersecao() : abaAtiva === 'offset' ? renderAbaOffset() : renderAbaFaixa()}
      </div>

      ${renderRodape()}
    `;

    const corpo = container.querySelector<HTMLElement>('#vv-corpo');
    if (corpo) corpo.scrollTop = rolagem;

    // Eventos
    container.querySelector('#btn-fechar-modal-vvirtual')?.addEventListener('click', fecharModal);
    container.querySelector('#btn-ocultar-modal')?.addEventListener('click', () => {
      definirOculto(true);
      if (map && guiasBounds && guiasBounds.isValid()) map.fitBounds(guiasBounds, { padding: [60, 60], maxZoom: 19 });
    });
    container.querySelectorAll<HTMLElement>('.btn-pick-mapa').forEach(btn => {
      btn.addEventListener('click', () => iniciarPick(btn.dataset.linha as LinhaId));
    });
    container.querySelector('#btn-cancelar-modal')?.addEventListener('click', fecharModal);

    container.querySelectorAll<HTMLElement>('.btn-aba').forEach(btn => {
      btn.addEventListener('click', () => {
        const aba = btn.dataset.aba as Aba;
        if (aba === abaAtiva) return;
        abaAtiva = aba;
        desenharPreviewNoMapa(previas[aba].resultados);
        renderConteudo(false);
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
      if (ponto) pontosSelecionadosIds = [...pontosSelecionadosIds, Number(ponto.id)];
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

    // Seleção de pontos para alinhamentos (Interseção e Faixa)
    container.querySelectorAll<HTMLSelectElement>('.sel-par-ponto').forEach(sel => {
      sel.addEventListener('change', () => {
        const linha = sel.dataset.linha;
        let arr: [number, number];
        if (linha === 'eixo') arr = eixoIds;
        else if (linha === 'divisa') arr = divisaIds;
        else if (linha === 'linha1') arr = alinhamento1Ids;
        else arr = alinhamento2Ids;
        arr[Number(sel.dataset.indice)] = Number(sel.value);
        invalidarPrevia();
        renderConteudo();
      });
    });

    // Interseção pura (PA2)
    container.querySelector('#input-nome-intersecao')?.addEventListener('input', (e) => {
      nomeVerticeIntersecao = (e.target as HTMLInputElement).value.toUpperCase();
      invalidarPrevia();
      renderMantendoFoco('input-nome-intersecao');
    });

    // Faixa de domínio
    container.querySelector('#btn-inverter-eixo')?.addEventListener('click', () => {
      eixoIds = [eixoIds[1], eixoIds[0]];
      invalidarPrevia();
      renderConteudo();
    });

    container.querySelector('#input-nome-faixa')?.addEventListener('input', (e) => {
      nomeVerticeFaixa = (e.target as HTMLInputElement).value.toUpperCase();
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
      if (abaAtiva === 'intersecao') calcularIntersecaoApi();
      else if (abaAtiva === 'offset') calcularOffsetApi();
      else calcularFaixaApi();
    });
    container.querySelector('#btn-confirmar-gravar')?.addEventListener('click', confirmarInsercao);

    desenharGuias();
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
    if (e.key !== 'Escape') return;
    if (alvoPick) {
      encerrarPick();
    } else if (!botaoRestaurar.classList.contains('hidden')) {
      definirOculto(false);
    } else if (!salvando) {
      fecharModal();
    }
  };

  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-label', 'Criar vértices virtuais');
  overlay.appendChild(container);
  document.body.appendChild(overlay);
  document.body.appendChild(botaoRestaurar);
  document.body.appendChild(bannerPick);

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
