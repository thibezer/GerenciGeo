/**
 * utils/sigef_popup.ts — Popup das parcelas SIGEF/INCRA (apresentação do app).
 *
 * O kit (`@thibezer/ui-components-kit/canvas`) consulta o Geoportal e entrega os dados (`SigefParcelasDetail`);
 * aqui o app decide como mostrar. Serve à Mesa de Trabalho (evento `ui-sigef-parcelas` do `<ui-canvas-cad sem-popup-sigef>`)
 * e ao Dashboard (mapa Leaflet comum, via `consultarSigefNoMapa`).
 */
import L from 'leaflet';
import { consultarSigefParcelas } from '@thibezer/ui-components-kit/canvas';
import type { ParcelaSigef, SigefParcelasDetail } from '@thibezer/ui-components-kit/canvas';
import { API_BASE } from '../config';
import { escapeHtml } from '../utils';

export interface SigefPopupOpcoes {
  /** Mostra o botão "Importar Confrontante (CSV)"; recebe o código da parcela e o nome. */
  onImportarConfrontante?: (codigo: string, nome: string) => void;
}

interface EstadoPopup {
  popup: L.Popup | null;
  cursorOriginal: string | null;
  controller: AbortController | null;
}

const estadoPorMapa = new WeakMap<L.Map, EstadoPopup>();

const estadoDo = (map: L.Map): EstadoPopup => {
  let st = estadoPorMapa.get(map);
  if (!st) {
    st = { popup: null, cursorOriginal: null, controller: null };
    estadoPorMapa.set(map, st);
  }
  return st;
};

const ICONE_DOWNLOAD = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const ICONE_EXTERNO = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

const CAIXA_ESTILO = 'background:#0f1712; color:#ffffff; padding:12px 14px; margin:-14px -20px; border-radius:10px; font-family:var(--geo-font-sans, sans-serif); font-size:12px; border:1px solid rgba(255,255,255,0.15); box-shadow:0 8px 24px rgba(0,0,0,0.6);';

const caixaMensagem = (titulo: string, corTitulo: string, texto: string) => `
  <div style="${CAIXA_ESTILO}">
    <div style="font-weight:600; color:${corTitulo}; margin-bottom:4px;">${escapeHtml(titulo)}</div>
    <div style="color:rgba(255,255,255,0.85);">${escapeHtml(texto)}</div>
  </div>`;

const HTML_CONSULTANDO = `
  <div style="background:#0f1712; color:#ffffff; padding:12px 14px; margin:-14px -20px; border-radius:10px; font-family:var(--geo-font-sans, sans-serif); display:flex; align-items:center; gap:10px; font-size:12px; border:1px solid rgba(255,255,255,0.15); box-shadow:0 8px 24px rgba(0,0,0,0.6);">
    <svg style="animation:spin 1s linear infinite; width:16px; height:16px; flex-shrink:0;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" stroke-width="4" fill="none"></circle>
      <path fill="#00f5a0" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span style="color:#ffffff; font-weight:500;">Consultando SIGEF/INCRA...</span>
  </div>`;

function formatarArea(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const num = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0) return null;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** HTML do popup de uma parcela (links de shapefile e do SIGEF; botão de importar só se `permitirImportar`). */
function htmlParcela(parcela: ParcelaSigef, permitirImportar: boolean): string {
  const { codigo, nome, props } = parcela;
  const seguro = codigo ? encodeURIComponent(codigo) : '';
  const downloadUrl = seguro ? `https://sigef.incra.gov.br/geo/exportar/parcela/shp/${seguro}/` : '';
  const detalheUrl = seguro ? `https://sigef.incra.gov.br/geo/parcela/detalhe/${seguro}/` : 'https://sigef.incra.gov.br/consultar/parcelas';
  const situacao = props.situacao_informada || props.status || 'Certificada';
  const area = formatarArea(props.area_hectares ?? props.area_ha ?? props.area);

  const acaoImportar = permitirImportar && codigo ? `
    <button type="button" data-sigef-importar
      style="display:flex; align-items:center; justify-content:center; gap:5px; padding:6px 8px; background:rgba(14, 165, 233, 0.2); border:1px solid rgba(14, 165, 233, 0.4); color:#38bdf8; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer; width:100%; text-align:center;">
      ${ICONE_DOWNLOAD}
      <span>Importar Confrontante (CSV)</span>
    </button>` : '';

  return `
    <div style="background:#0f1712; color:#ffffff; padding:12px; margin:-14px -20px; border-radius:10px; font-family:var(--geo-font-sans, sans-serif); line-height:1.4; min-width:230px; border:1px solid rgba(255,255,255,0.15); box-shadow:0 8px 24px rgba(0,0,0,0.6);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid rgba(255, 255, 255, 0.1);">
        <span style="font-weight:700; font-size:11px; color:#00f5a0; text-transform:uppercase; letter-spacing:0.5px;">SIGEF / INCRA</span>
        <span style="font-size:10px; color:rgba(255, 255, 255, 0.6);">${escapeHtml(situacao)}</span>
      </div>
      <div style="font-weight:700; font-size:12px; margin-bottom:4px; color:#ffffff; word-break:break-word;">${escapeHtml(nome)}</div>
      <div style="font-size:11px; color:rgba(255, 255, 255, 0.7); margin-bottom:2px;">Cód: <span style="font-family:var(--geo-font-mono, monospace); color:#00f5a0;">${escapeHtml(props.codigo_imovel || 'N/A')}</span></div>
      ${area ? `<div style="font-size:11px; color:rgba(255, 255, 255, 0.7); margin-bottom:2px;">Área: <strong style="font-family:var(--geo-font-mono, monospace); color:#ffffff;">${escapeHtml(area)} ha</strong></div>` : ''}
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
        ${acaoImportar}
        <a href="${detalheUrl}" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; gap:4px; padding:5px 6px; background:rgba(255, 255, 255, 0.05); border:1px solid rgba(255, 255, 255, 0.1); color:rgba(255, 255, 255, 0.8); font-size:10px; font-weight:600; border-radius:5px; text-decoration:none; cursor:pointer;">
          ${ICONE_EXTERNO}
          Ver no SIGEF Oficial
        </a>
      </div>
    </div>`;
}

/** Conteúdo (elemento) com o botão de importar tratado por delegação, sem `onclick` inline. */
function conteudoParcela(parcela: ParcelaSigef, opcoes: SigefPopupOpcoes): HTMLElement {
  const raiz = document.createElement('div');
  raiz.innerHTML = htmlParcela(parcela, !!opcoes.onImportarConfrontante);
  raiz.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-sigef-importar]');
    if (btn && parcela.codigo) opcoes.onImportarConfrontante?.(parcela.codigo, parcela.nome);
  });
  return raiz;
}

function restaurarCursor(map: L.Map, st: EstadoPopup): void {
  let container: HTMLElement | null = null;
  try { container = map.getContainer(); } catch { /* mapa já destruído */ }
  if (container) {
    // A Caneta usa crosshair: se foi ativada durante a espera, o cursor volta a ser o dela
    container.style.cursor = container.classList.contains('modo-caneta-cursor') ? 'crosshair' : (st.cursorOriginal ?? '');
  }
  st.cursorOriginal = null;
}

/**
 * Mostra o estado da consulta SIGEF no mapa: popup "Consultando…" → dados da parcela | aviso | erro.
 * Um novo `consultando` substitui o popup anterior; se o usuário fechar o popup antes da resposta, ela é descartada.
 */
export function mostrarPopupSigef(map: L.Map, detalhe: SigefParcelasDetail, opcoes: SigefPopupOpcoes = {}): void {
  const st = estadoDo(map);

  if (detalhe.estado === 'consultando') {
    const container = map.getContainer();
    if (st.cursorOriginal === null) st.cursorOriginal = container.style.cursor;
    container.style.cursor = 'wait';
    st.popup = L.popup({ className: 'compact-sigef-popup', maxWidth: 290 })
      .setLatLng([detalhe.latlng.lat, detalhe.latlng.lng])
      .setContent(HTML_CONSULTANDO)
      .openOn(map);
    return;
  }

  restaurarCursor(map, st);
  const popup = st.popup;
  if (!popup || !map.hasLayer(popup)) return; // fechado ou substituído: descarta

  if (detalhe.estado === 'erro') {
    popup.setContent(caixaMensagem('Aviso da Consulta', '#f59e0b', detalhe.mensagem || 'Serviço de consulta SIGEF indisponível nesta área.'));
    return;
  }
  if (detalhe.parcelas.length === 0) {
    popup.setContent(caixaMensagem('SIGEF / INCRA', '#00f5a0', 'Nenhum imóvel SIGEF certificado neste ponto.'));
    return;
  }
  popup.setContent(conteudoParcela(detalhe.parcelas[0], opcoes));
}

/** Para mapas Leaflet comuns (Dashboard): consulta o ponto clicado pelo kit e mostra o popup. O clique novo cancela o anterior. */
export async function consultarSigefNoMapa(map: L.Map, e: L.LeafletMouseEvent, opcoes: SigefPopupOpcoes = {}): Promise<void> {
  const st = estadoDo(map);
  st.controller?.abort();
  const controller = new AbortController();
  st.controller = controller;

  const ponto = e.containerPoint ?? map.latLngToContainerPoint(e.latlng);
  const base = { latlng: { lat: e.latlng.lat, lng: e.latlng.lng }, ponto: { x: ponto.x, y: ponto.y } };
  mostrarPopupSigef(map, { ...base, estado: 'consultando', parcelas: [] }, opcoes);
  try {
    const parcelas = await consultarSigefParcelas(map, ponto, API_BASE, { signal: controller.signal });
    if (st.controller !== controller) return;
    mostrarPopupSigef(map, { ...base, estado: 'concluida', parcelas }, opcoes);
  } catch (err: any) {
    if (st.controller !== controller || err?.name === 'AbortError') return;
    mostrarPopupSigef(map, { ...base, estado: 'erro', parcelas: [], mensagem: String(err?.message || 'Serviço de consulta SIGEF indisponível nesta área.') }, opcoes);
  } finally {
    if (st.controller === controller) st.controller = null;
  }
}
