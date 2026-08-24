/**
 * utils/sigef_consultor.ts — Consulta e Exibição Unificada de Imóveis SIGEF/INCRA.
 * Atende tanto a Mesa de Trabalho quanto o Dashboard (Página Inicial).
 */
import L from 'leaflet';
import { API_BASE } from '../config';
import { escapeHtml } from '../utils';

export interface SigefConsultaOptions {
  permitirImportarConfrontante?: boolean;
  onImportarConfrontante?: (uuid: string, nome: string) => void;
}

export async function consultarSigefData(
  x: number,
  y: number,
  size: { x: number; y: number },
  bbox: string,
  timeoutMs: number = 10000
): Promise<any> {
  const targetUrl = `https://acervofundiario.incra.gov.br/i3geo/ogc.php?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&FORMAT=image/png&TRANSPARENT=true&QUERY_LAYERS=certificada_sigef_particular_pr&LAYERS=certificada_sigef_particular_pr&INFO_FORMAT=text/plain&X=${x}&Y=${y}&WIDTH=${size.x}&HEIGHT=${size.y}&SRS=EPSG:4326&BBOX=${bbox}`;

  const isLocal = window.location.origin.includes('localhost') || 
                  window.location.origin.includes('127.0.0.1') || 
                  window.location.origin.includes('[::1]');

  const proxyFetchUrl = isLocal 
    ? `${API_BASE}/proxy/sigef?url=${encodeURIComponent(targetUrl)}`
    : `${window.location.origin}/api.php?action=proxy_sigef&url=${encodeURIComponent(targetUrl)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(proxyFetchUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Tempo limite de consulta ao INCRA esgotado (10s).');
    }
    throw err;
  }
}

export async function consultarEPlotarSigef(
  map: L.Map,
  e: L.LeafletMouseEvent,
  options: SigefConsultaOptions = {}
): Promise<void> {
  if (!map) return;

  const size = map.getSize();
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const bbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
  
  // Utiliza as coordenadas de container relativas ao mapa para precisão absoluta
  const x = Math.round(e.containerPoint ? e.containerPoint.x : map.layerPointToContainerPoint(e.layerPoint).x);
  const y = Math.round(e.containerPoint ? e.containerPoint.y : map.layerPointToContainerPoint(e.layerPoint).y);

  const mapContainer = map.getContainer();
  if (mapContainer) mapContainer.style.cursor = 'wait';

  const loadingPopup = L.popup({
    className: 'compact-sigef-popup',
    maxWidth: 280
  })
    .setLatLng(e.latlng)
    .setContent(`
      <div style="font-family:var(--geo-font-sans, sans-serif); display:flex; align-items:center; gap:8px; color:rgba(255,255,255,0.9); font-size:12px; padding:4px;">
        <svg style="animation:spin 1s linear infinite; width:14px; height:14px; flex-shrink:0;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" stroke-width="4" fill="none"></circle>
          <path fill="#00f5a0" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Consultando SIGEF/INCRA...</span>
      </div>
    `)
    .openOn(map);

  try {
    const data = await consultarSigefData(x, y, size, bbox, 12000);

    let props: any = null;
    let featureId = '';

    if (data && data.features && data.features.length > 0) {
      const feat = data.features[0];
      props = feat.properties || {};
      featureId = feat.id || props.parcela_codigo || props.co_parcela || props.id_parcela || '';
    } else if (typeof data === 'string' && data.includes("GetFeatureInfo results:")) {
      const lines = data.split('\n');
      const currentFeature: any = {};
      for (const line of lines) {
        const match = line.trim().match(/^([\w_]+)\s*=\s*['"]?([^'"]*)['"]?/) || line.trim().match(/([\w_]+)\s*=\s*['"]?([^'"]*)['"]?/);
        if (match) {
          currentFeature[match[1]] = match[2].trim();
        }
      }
      if (Object.keys(currentFeature).length > 0) {
        props = currentFeature;
        featureId = currentFeature.parcela_codigo || currentFeature.id || '';
      }
    }

    if (props && Object.keys(props).length > 0) {
      const uuid = featureId || props.parcela_codigo || props.co_parcela || props.id_parcela;
      const nomeImovel = props.nome_area || props.nome_imovel || 'Imóvel Sem Nome';
      const downloadUrl = uuid ? `https://sigef.incra.gov.br/geo/exportar/parcela/shp/${uuid}/` : '';
      const sigefConsultarUrl = uuid ? `https://sigef.incra.gov.br/geo/parcela/detalhe/${uuid}/` : `https://sigef.incra.gov.br/consultar/parcelas`;
      const statusFormatado = props.situacao_informada || props.status || 'Certificada';

      let acaoImportarHtml = '';
      if (options.permitirImportarConfrontante && uuid) {
        acaoImportarHtml = `
          <button onclick="window.importarVizinhoSIGEF('${uuid}', '${escapeHtml(nomeImovel).replace(/'/g, "\\'")}')" style="display:flex; align-items:center; justify-content:center; gap:5px; padding:5px 8px; background:rgba(14, 165, 233, 0.15); border:1px solid rgba(14, 165, 233, 0.3); color:#38bdf8; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer; width:100%; text-align:center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Importar Confrontante (CSV)
          </button>
        `;
      }

      const popupContent = `
        <div style="font-family:var(--geo-font-sans, sans-serif); color:rgba(255, 255, 255, 0.9); line-height:1.4; min-width:210px; padding:2px;">
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
          </div>
          ` : ''}
          <div style="display:flex; flex-direction:column; gap:5px; padding-top:6px; border-top:1px solid rgba(255, 255, 255, 0.1);">
            ${downloadUrl ? `
            <a href="${downloadUrl}" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; gap:5px; padding:5px 8px; background:rgba(0, 245, 160, 0.15); border:1px solid rgba(0, 245, 160, 0.3); color:#00f5a0; font-size:11px; font-weight:700; border-radius:5px; text-decoration:none; cursor:pointer;">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Baixar Shapefile (.ZIP)
            </a>
            ` : ''}
            ${acaoImportarHtml}
            <a href="${sigefConsultarUrl}" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; gap:4px; padding:4px 6px; background:rgba(255, 255, 255, 0.05); border:1px solid rgba(255, 255, 255, 0.1); color:rgba(255, 255, 255, 0.8); font-size:10px; font-weight:600; border-radius:5px; text-decoration:none; cursor:pointer;">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Ver no SIGEF Oficial
            </a>
          </div>
        </div>
      `;

      loadingPopup.setContent(popupContent);
    } else {
      loadingPopup.setContent(`
        <div style="font-family:var(--geo-font-sans, sans-serif); font-size:12px; color:rgba(255, 255, 255, 0.8); padding:4px;">
          Nenhum imóvel SIGEF certificado neste ponto.
        </div>
      `);
    }
  } catch (err: any) {
    console.warn("[SIGEF] Erro na consulta:", err);
    loadingPopup.setContent(`
      <div style="font-family:var(--geo-font-sans, sans-serif); font-size:12px; color:#f59e0b; padding:4px;">
        ${escapeHtml(err.message || 'Serviço de consulta SIGEF indisponível nesta área.')}
      </div>
    `);
  } finally {
    if (mapContainer) mapContainer.style.cursor = '';
  }
}
