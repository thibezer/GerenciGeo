import L from 'leaflet';
import { escapeHtml } from '../../utils';

const CLS_TILE_ATIVO = 'px-2 py-1 text-[11px] font-bold rounded bg-mint-vibrant text-slate-900 transition-all shadow-sm';
const CLS_TILE_INATIVO = 'px-2 py-1 text-[11px] font-bold rounded text-white/70 hover:text-white transition-all';

export interface RenderPreviewMapaParams {
  container: HTMLElement;
  data: any;
  metricas: any;
  btnSat: HTMLElement | null;
  btnDark: HTMLElement | null;
  onCarregado: () => void;
}

/**
 * Cria a instância Leaflet e renderiza o croqui do imóvel e lindeira do confrontante
 */
export function renderizarMapaPreviewDivisa(params: RenderPreviewMapaParams): { mapa: L.Map; timerAjuste: ReturnType<typeof setTimeout> } {
  const { container, data, metricas, btnSat, btnDark, onCarregado } = params;

  const instancia = L.map(container, { attributionControl: true, zoomControl: true, maxZoom: 22 });
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(instancia);

  const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  });
  const escuro = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  });
  satelite.addTo(instancia);

  if (btnSat && btnDark) {
    btnSat.setAttribute('aria-pressed', 'true');
    btnDark.setAttribute('aria-pressed', 'false');
    btnSat.className = CLS_TILE_ATIVO;
    btnDark.className = CLS_TILE_INATIVO;

    btnSat.onclick = () => {
      if (instancia.hasLayer(escuro)) instancia.removeLayer(escuro);
      if (!instancia.hasLayer(satelite)) satelite.addTo(instancia);
      btnSat.className = CLS_TILE_ATIVO;
      btnDark.className = CLS_TILE_INATIVO;
      btnSat.setAttribute('aria-pressed', 'true');
      btnDark.setAttribute('aria-pressed', 'false');
    };
    btnDark.onclick = () => {
      if (instancia.hasLayer(satelite)) instancia.removeLayer(satelite);
      if (!instancia.hasLayer(escuro)) escuro.addTo(instancia);
      btnDark.className = CLS_TILE_ATIVO;
      btnSat.className = CLS_TILE_INATIVO;
      btnDark.setAttribute('aria-pressed', 'true');
      btnSat.setAttribute('aria-pressed', 'false');
    };
  }

  const grupo = L.featureGroup();
  if (Array.isArray(data.poligono_imovel) && data.poligono_imovel.length >= 3) {
    const poligono = L.polygon(data.poligono_imovel, {
      color: '#94a3b8',
      weight: 2,
      dashArray: '5, 5',
      fillColor: '#00f5a0',
      fillOpacity: 0.04
    }).addTo(instancia);
    poligono.bindTooltip('Limite Geral do Imóvel', { sticky: true });
    grupo.addLayer(poligono);
  }

  if (Array.isArray(data.lindeira_coords) && data.lindeira_coords.length > 0) {
    const linha = L.polyline(data.lindeira_coords, { color: '#00f5a0', weight: 6, opacity: 0.95 }).addTo(instancia);
    linha.bindTooltip(`Divisa: ${escapeHtml(data.confrontante?.nome)} (${escapeHtml(metricas.extensao_total_str || '')})`, {
      sticky: true,
      className: 'bg-[#0c1510] text-mint-vibrant font-bold font-mono text-[11px] border border-mint-vibrant/30 rounded px-2 py-1 shadow-xl',
    });
    grupo.addLayer(linha);
  }

  if (Array.isArray(data.lindeira_pontos)) {
    data.lindeira_pontos.forEach((p: any) => {
      if (p.coords && p.coords.length === 2) {
        const marcador = L.circleMarker(p.coords, {
          radius: p.is_extremo ? 6 : 4,
          color: '#00f5a0',
          fillColor: p.is_extremo ? '#ffffff' : '#0c1510',
          fillOpacity: 1,
          weight: 2,
        }).addTo(instancia);
        marcador.bindTooltip(`Vértice ${escapeHtml(p.nome)}`, {
          permanent: !!p.is_extremo,
          direction: 'top',
          className: 'bg-[#0c1510] text-white font-bold font-mono text-[11px] border border-white/20 rounded px-1.5 py-0.5',
        });
        grupo.addLayer(marcador);
      }
    });
  }

  const timerAjuste = setTimeout(() => {
    instancia.invalidateSize();
    if (grupo.getLayers().length > 0) {
      instancia.fitBounds(grupo.getBounds(), { padding: [40, 40], maxZoom: 19 });
    }
    onCarregado();
  }, 250);

  return { mapa: instancia, timerAjuste };
}
