/**
 * utils/sigef_consultor.ts — Consulta e Exibição Unificada de Imóveis SIGEF/INCRA.
 * Atende tanto a Mesa de Trabalho quanto o Dashboard (Página Inicial).
 *
 * Esta é a ÚNICA implementação de consulta do app: um clique abre o popup "Consultando…" na hora, mas a
 * requisição só sai depois de SIGEF_DEBOUNCE_MS sem novo clique e a anterior é sempre abortada (AbortController
 * por mapa). O cursor original do mapa (inclusive o crosshair da Caneta) é guardado e restaurado.
 */
import L from 'leaflet';
import { API_BASE } from '../config';
import { escapeHtml } from '../utils';

/** Tempo máximo (ms) de espera pelo INCRA — usado no timeout e na mensagem exibida. */
export const SIGEF_TIMEOUT_MS = 12000;
/** Espera (ms) sem novos cliques antes de disparar a requisição. */
export const SIGEF_DEBOUNCE_MS = 250;
/**
 * Evento (em `window`) emitido pelo botão "Importar Confrontante (CSV)" do popup do SIGEF.
 * É o mesmo nome que o popup do kit (ui-components-kit) usa: `detail = { uuid, nome }`.
 */
export const EVENTO_IMPORTAR_VIZINHO_SIGEF = 'gerencigeo:importar_vizinho_sigef';

export interface SigefConsultaOptions {
  permitirImportarConfrontante?: boolean;
  /** Quando ausente, o botão de importar emite EVENTO_IMPORTAR_VIZINHO_SIGEF em `window`. */
  onImportarConfrontante?: (uuid: string, nome: string) => void | Promise<void>;
}

interface ParcelaSigef {
  uuid: string;
  props: Record<string, any>;
}

interface EstadoConsulta {
  seq: number;
  timer: ReturnType<typeof setTimeout> | null;
  controller: AbortController | null;
  cursorOriginal: string | null;
  resolverPendente: (() => void) | null;
}

const estadoPorMapa = new WeakMap<L.Map, EstadoConsulta>();

const estadoDo = (map: L.Map): EstadoConsulta => {
  let st = estadoPorMapa.get(map);
  if (!st) {
    st = { seq: 0, timer: null, controller: null, cursorOriginal: null, resolverPendente: null };
    estadoPorMapa.set(map, st);
  }
  return st;
};

/** Cancela o que estiver pendente (timer + requisição) e libera quem aguardava a consulta anterior. */
const cancelarPendente = (st: EstadoConsulta) => {
  if (st.timer) { clearTimeout(st.timer); st.timer = null; }
  if (st.controller) { st.controller.abort(); st.controller = null; }
  if (st.resolverPendente) { const r = st.resolverPendente; st.resolverPendente = null; r(); }
};

const restaurarCursor = (st: EstadoConsulta, container: HTMLElement | null) => {
  if (container) {
    // A Caneta usa crosshair: se foi ativada durante a espera, o cursor volta a ser o dela
    container.style.cursor = container.classList.contains('modo-caneta-cursor')
      ? 'crosshair'
      : (st.cursorOriginal ?? '');
  }
  st.cursorOriginal = null;
};

export async function consultarSigefData(
  x: number,
  y: number,
  size: { x: number; y: number },
  bbox: string,
  timeoutMs: number = SIGEF_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<any> {
  const targetUrl = `https://acervofundiario.incra.gov.br/i3geo/ogc.php?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&FORMAT=image/png&TRANSPARENT=true&QUERY_LAYERS=certificada_sigef_particular_pr&LAYERS=certificada_sigef_particular_pr&INFO_FORMAT=text/plain&X=${x}&Y=${y}&WIDTH=${size.x}&HEIGHT=${size.y}&SRS=EPSG:4326&BBOX=${bbox}`;

  const isLocal = window.location.origin.includes('localhost') ||
                  window.location.origin.includes('127.0.0.1') ||
                  window.location.origin.includes('[::1]');

  const proxyFetchUrl = isLocal
    ? `${API_BASE}/proxy/sigef?url=${encodeURIComponent(targetUrl)}`
    : `${window.location.origin}/api.php?action=proxy_sigef&url=${encodeURIComponent(targetUrl)}`;

  const controller = new AbortController();
  let expirou = false;
  const timeoutId = setTimeout(() => { expirou = true; controller.abort(); }, timeoutMs);
  const repassarAborto = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', repassarAborto, { once: true });
  }

  try {
    const res = await fetch(proxyFetchUrl, { signal: controller.signal });
    const text = await res.text();

    if (!res.ok) {
      let detalhe = '';
      try { detalhe = JSON.parse(text)?.detail || JSON.parse(text)?.error || ''; } catch { /* corpo não-JSON */ }
      throw new Error(typeof detalhe === 'string' && detalhe ? detalhe : `HTTP ${res.status}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && expirou) {
      throw new Error(`Tempo limite de consulta ao INCRA esgotado (${Math.round(timeoutMs / 1000)}s).`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', repassarAborto);
  }
}

/** Todas as parcelas devolvidas pelo GetFeatureInfo (o ponto pode cair em várias sobrepostas). */
function extrairParcelas(data: any): ParcelaSigef[] {
  const features: any[] = data && Array.isArray(data.features) ? data.features : [];
  const vistos = new Set<string>();
  const parcelas: ParcelaSigef[] = [];
  features.forEach((feat, i) => {
    const props = feat?.properties || {};
    if (!props || Object.keys(props).length === 0) return;
    const uuid = String(feat.id || props.parcela_codigo || props.co_parcela || props.id_parcela || '');
    const chave = uuid || `sem-id-${i}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    parcelas.push({ uuid, props });
  });
  return parcelas;
}

const ICONE_DOWNLOAD = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const ICONE_EXTERNO = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

const CAIXA_ESTILO = 'background:#0f1712; color:#ffffff; padding:12px 14px; margin:-14px -20px; border-radius:10px; font-family:var(--geo-font-sans, sans-serif); font-size:12px; border:1px solid rgba(255,255,255,0.15); box-shadow:0 8px 24px rgba(0,0,0,0.6);';

const nomeDaParcela = (p: ParcelaSigef) => String(p.props.nome_area || p.props.nome_imovel || 'Imóvel Sem Nome');

/** HTML do popup para a parcela `indice`, com seletor de abas quando há mais de uma. */
function htmlParcelas(parcelas: ParcelaSigef[], indice: number, options: SigefConsultaOptions): string {
  const { uuid, props } = parcelas[indice];
  const nomeImovel = nomeDaParcela(parcelas[indice]);
  const seguro = uuid ? encodeURIComponent(uuid) : '';
  const downloadUrl = seguro ? `https://sigef.incra.gov.br/geo/exportar/parcela/shp/${seguro}/` : '';
  const sigefConsultarUrl = seguro ? `https://sigef.incra.gov.br/geo/parcela/detalhe/${seguro}/` : `https://sigef.incra.gov.br/consultar/parcelas`;
  const statusFormatado = props.situacao_informada || props.status || 'Certificada';

  const abas = parcelas.length > 1 ? `
    <div role="tablist" aria-label="Parcelas sobrepostas neste ponto" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
      ${parcelas.map((p, i) => `
        <button type="button" role="tab" aria-selected="${i === indice}" data-sigef-aba="${i}" title="${escapeHtml(nomeDaParcela(p))}"
          style="padding:3px 8px; font-size:10px; font-weight:700; border-radius:999px; cursor:pointer; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border:1px solid ${i === indice ? 'rgba(0,245,160,0.6)' : 'rgba(255,255,255,0.15)'}; background:${i === indice ? 'rgba(0,245,160,0.18)' : 'rgba(255,255,255,0.05)'}; color:${i === indice ? '#00f5a0' : 'rgba(255,255,255,0.75)'};">
          ${i + 1} · ${escapeHtml(nomeDaParcela(p))}
        </button>`).join('')}
    </div>
    <div style="font-size:10px; color:rgba(255,255,255,0.55); margin-bottom:6px;">${parcelas.length} parcelas sobrepostas neste ponto</div>
  ` : '';

  const acaoImportarHtml = options.permitirImportarConfrontante && uuid ? `
    <button type="button" data-sigef-importar data-uuid="${escapeHtml(uuid)}" data-nome="${escapeHtml(nomeImovel)}"
      style="display:flex; align-items:center; justify-content:center; gap:5px; padding:6px 8px; background:rgba(14, 165, 233, 0.2); border:1px solid rgba(14, 165, 233, 0.4); color:#38bdf8; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer; width:100%; text-align:center;">
      ${ICONE_DOWNLOAD}
      <span>Importar Confrontante (CSV)</span>
    </button>` : '';

  return `
    <div style="background:#0f1712; color:#ffffff; padding:12px; margin:-14px -20px; border-radius:10px; font-family:var(--geo-font-sans, sans-serif); line-height:1.4; min-width:230px; border:1px solid rgba(255,255,255,0.15); box-shadow:0 8px 24px rgba(0,0,0,0.6);">
      ${abas}
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid rgba(255, 255, 255, 0.1);">
        <span style="font-weight:700; font-size:11px; color:#00f5a0; text-transform:uppercase; letter-spacing:0.5px;">SIGEF / INCRA</span>
        <span style="font-size:10px; color:rgba(255, 255, 255, 0.6);">${escapeHtml(statusFormatado)}</span>
      </div>
      <div style="font-weight:700; font-size:12px; margin-bottom:4px; color:#ffffff; word-break:break-word;">${escapeHtml(nomeImovel)}</div>
      <div style="font-size:11px; color:rgba(255, 255, 255, 0.7); margin-bottom:2px;">Cód: <span style="font-family:var(--geo-font-mono, monospace); color:#00f5a0;">${escapeHtml(props.codigo_imovel || 'N/A')}</span></div>
      <div style="display:flex; gap:12px; font-size:11px; color:rgba(255, 255, 255, 0.7); margin-bottom:6px;">
        <span>Mat: <strong style="color:#ffffff;">${escapeHtml(props.registro_matricula || props.matricula || 'Consulte o SIGEF')}</strong></span>
        ${props.data_submissao ? `<span>${escapeHtml(props.data_submissao)}</span>` : ''}
      </div>
      ${props.art ? `
      <div style="font-size:10px; color:rgba(255, 255, 255, 0.6); margin-bottom:6px; font-family:var(--geo-font-mono, monospace);">
        ART: ${escapeHtml(props.art)} ${props.rt ? `(${escapeHtml(props.rt)})` : ''}
      </div>` : ''}
      <div style="display:flex; flex-direction:column; gap:6px; padding-top:6px; border-top:1px solid rgba(255, 255, 255, 0.1);">
        ${downloadUrl ? `
        <a href="${downloadUrl}" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; gap:5px; padding:6px 8px; background:rgba(0, 245, 160, 0.15); border:1px solid rgba(0, 245, 160, 0.3); color:#00f5a0; font-size:11px; font-weight:700; border-radius:5px; text-decoration:none; cursor:pointer;">
          ${ICONE_DOWNLOAD}
          Baixar Shapefile (.ZIP)
        </a>` : ''}
        ${acaoImportarHtml}
        <a href="${sigefConsultarUrl}" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; gap:4px; padding:5px 6px; background:rgba(255, 255, 255, 0.05); border:1px solid rgba(255, 255, 255, 0.1); color:rgba(255, 255, 255, 0.8); font-size:10px; font-weight:600; border-radius:5px; text-decoration:none; cursor:pointer;">
          ${ICONE_EXTERNO}
          Ver no SIGEF Oficial
        </a>
      </div>
    </div>`;
}

/** Conteúdo (elemento) do popup: seletor de parcelas + ações por delegação (sem onclick inline). */
function criarConteudoParcelas(popup: L.Popup, parcelas: ParcelaSigef[], options: SigefConsultaOptions): HTMLElement {
  const raiz = document.createElement('div');
  let atual = 0;
  const desenhar = () => {
    raiz.innerHTML = htmlParcelas(parcelas, atual, options);
    popup.update();
  };

  raiz.addEventListener('click', (ev) => {
    const alvo = ev.target as HTMLElement | null;
    const aba = alvo?.closest<HTMLElement>('[data-sigef-aba]');
    if (aba) {
      const i = Number(aba.dataset.sigefAba);
      if (Number.isInteger(i) && i >= 0 && i < parcelas.length && i !== atual) {
        atual = i;
        desenhar();
      }
      return;
    }
    const btn = alvo?.closest<HTMLButtonElement>('[data-sigef-importar]');
    if (btn && !btn.disabled) {
      const uuid = btn.dataset.uuid || '';
      const nome = btn.dataset.nome || '';
      if (!uuid) return;
      if (options.onImportarConfrontante) {
        const retorno = options.onImportarConfrontante(uuid, nome);
        if (retorno && typeof (retorno as Promise<void>).then === 'function') {
          btn.disabled = true;
          btn.style.opacity = '0.6';
          (retorno as Promise<void>).finally(() => { btn.disabled = false; btn.style.opacity = ''; });
        }
      } else {
        window.dispatchEvent(new CustomEvent(EVENTO_IMPORTAR_VIZINHO_SIGEF, { detail: { uuid, nome } }));
      }
    }
  });

  desenhar();
  return raiz;
}

const caixaMensagem = (titulo: string, corTitulo: string, texto: string) => `
  <div style="${CAIXA_ESTILO}">
    <div style="font-weight:600; color:${corTitulo}; margin-bottom:4px;">${escapeHtml(titulo)}</div>
    <div style="color:rgba(255,255,255,0.85);">${escapeHtml(texto)}</div>
  </div>`;

export function consultarEPlotarSigef(
  map: L.Map,
  e: L.LeafletMouseEvent | any,
  options: SigefConsultaOptions = {}
): Promise<void> {
  if (!map) return Promise.resolve();

  const latlng = e.latlng || (e.lat && e.lng ? L.latLng(e.lat, e.lng) : null);
  if (!latlng) return Promise.resolve();

  // Geometria da consulta capturada no instante do clique (o mapa pode mudar durante o debounce)
  const size = map.getSize();
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const bbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;

  // Utiliza as coordenadas de container relativas ao mapa para precisão absoluta
  const pt = e.containerPoint
    || (map.latLngToContainerPoint ? map.latLngToContainerPoint(latlng) : null)
    || (e.layerPoint && map.layerPointToContainerPoint ? map.layerPointToContainerPoint(e.layerPoint) : null)
    || { x: Math.round(size.x / 2), y: Math.round(size.y / 2) };

  const x = Math.round(pt.x);
  const y = Math.round(pt.y);

  const st = estadoDo(map);
  cancelarPendente(st);
  const seq = ++st.seq;

  const mapContainer = map.getContainer();
  if (mapContainer) {
    if (st.cursorOriginal === null) st.cursorOriginal = mapContainer.style.cursor;
    mapContainer.style.cursor = 'wait';
  }

  const loadingPopup = L.popup({
    className: 'compact-sigef-popup',
    maxWidth: 290
  })
    .setLatLng(latlng)
    .setContent(`
      <div style="background:#0f1712; color:#ffffff; padding:12px 14px; margin:-14px -20px; border-radius:10px; font-family:var(--geo-font-sans, sans-serif); display:flex; align-items:center; gap:10px; font-size:12px; border:1px solid rgba(255,255,255,0.15); box-shadow:0 8px 24px rgba(0,0,0,0.6);">
        <svg style="animation:spin 1s linear infinite; width:16px; height:16px; flex-shrink:0;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" stroke-width="4" fill="none"></circle>
          <path fill="#00f5a0" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span style="color:#ffffff; font-weight:500;">Consultando SIGEF/INCRA...</span>
      </div>
    `)
    .openOn(map);

  // Fechar o popup enquanto a consulta corre cancela a requisição (só vale para a consulta mais recente)
  loadingPopup.on('remove', () => {
    if (seq !== st.seq) return;
    if (st.timer || st.controller) {
      cancelarPendente(st);
      st.seq++;   // invalida o que ainda possa voltar desta consulta
      restaurarCursor(st, mapContainer);
    }
  });

  return new Promise<void>((resolve) => {
    st.resolverPendente = resolve;
    st.timer = setTimeout(async () => {
      st.timer = null;
      const controller = new AbortController();
      st.controller = controller;

      try {
        const data = await consultarSigefData(x, y, size, bbox, SIGEF_TIMEOUT_MS, controller.signal);
        if (seq !== st.seq) return;

        if (data && typeof data === 'object' && data.error && !Array.isArray(data.features)) {
          throw new Error('O INCRA devolveu uma resposta inesperada. Tente novamente em instantes.');
        }

        const parcelas = extrairParcelas(data);
        if (parcelas.length > 0) {
          loadingPopup.setContent(criarConteudoParcelas(loadingPopup, parcelas, options));
        } else {
          loadingPopup.setContent(`
            <div style="${CAIXA_ESTILO}">
              <div style="font-weight:600; color:#00f5a0; margin-bottom:4px;">SIGEF / INCRA</div>
              <div style="color:rgba(255,255,255,0.8);">Nenhum imóvel SIGEF certificado neste ponto.</div>
            </div>
          `);
        }
      } catch (err: any) {
        // Abortada por um clique mais novo ou pelo fechamento do popup: o popup atual já não é este
        if (seq !== st.seq || err?.name === 'AbortError') return;
        console.warn('[SIGEF] Erro na consulta:', err);
        loadingPopup.setContent(caixaMensagem('Aviso da Consulta', '#f59e0b', err?.message || 'Serviço de consulta SIGEF indisponível nesta área.'));
      } finally {
        if (seq === st.seq) {
          if (st.controller === controller) st.controller = null;
          restaurarCursor(st, mapContainer);
          if (st.resolverPendente === resolve) st.resolverPendente = null;
          resolve();
        }
      }
    }, SIGEF_DEBOUNCE_MS);
  });
}

/** Cancela qualquer consulta pendente do mapa (ex.: ao destruir a tela) e restaura o cursor. */
export function cancelarConsultaSigef(map: L.Map | null | undefined): void {
  if (!map) return;
  const st = estadoPorMapa.get(map);
  if (!st) return;
  cancelarPendente(st);
  st.seq++;
  let container: HTMLElement | null = null;
  try { container = map.getContainer(); } catch { /* mapa já destruído */ }
  restaurarCursor(st, container);
}
