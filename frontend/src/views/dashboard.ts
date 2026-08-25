/**
 * views/dashboard.ts — Controller do Panorama Operacional / Dashboard.
 */
import L from 'leaflet';
import type { RouteDef } from '../types';
import { initIcons, showToast } from '../utils';
import { renderDashboardTemplate } from './dashboard/dashboard_template';
import {
  fetchStatus,
  fetchStats,
  fetchAlerts,
  fetchGeometrias,
  downloadLocalShapefile
} from './dashboard/dashboard_service';
import {
  sanitizeHtml,
  NorthArrowControl,
  FullscreenControl,
  enquadrarTodosImoveis,
  criarPainelCamadasLocaisControl
} from './dashboard/dashboard_helpers';
import { consultarEPlotarSigef } from '../utils/sigef_consultor';

let mapInstance: L.Map | null = null;

export const dashboardRoute: RouteDef = {
  render: () => renderDashboardTemplate(),
  setup: () => {
    // 1. Status da API
    fetchStatus()
      .then(data => {
        const el = document.getElementById('api-status');
        if (el) {
          el.textContent = data.status.toUpperCase();
          el.setAttribute('variante', 'sucesso');
        }
      })
      .catch(() => {
        const el = document.getElementById('api-status');
        if (el) {
          el.textContent = 'OFFLINE';
          el.setAttribute('variante', 'erro');
        }
      });

    // 2. Estatísticas Globais
    fetchStats()
      .then(data => {
        const cli = document.getElementById('stat-clientes');
        const prop = document.getElementById('stat-prop');
        const prof = document.getElementById('stat-prof');
        if (cli) cli.innerText = data.clientes.toString();
        if (prop) prop.innerText = data.propriedades.toString();
        if (prof) prof.innerText = data.profissionais.toString();
      })
      .catch(err => console.error("[Dashboard] Erro ao buscar stats:", err));

    // 3. Alertas do Action Center
    fetchAlerts()
      .then(data => {
        const container = document.getElementById('alerts-container');
        if (!container) return;
        if (!data.alerts || data.alerts.length === 0) {
          container.innerHTML = `<div class="text-center text-white/40 text-sm py-4">Nenhum alerta pendente.</div>`;
          return;
        }
        container.innerHTML = data.alerts.map((alert: any) => {
          const tipo = sanitizeHtml(alert.tipo || '');
          const mensagem = sanitizeHtml(alert.mensagem || '');
          const variante = alert.tipo === 'CRITICO' ? 'erro' : 'alerta';
          return `
            <ui-alerta tipo="${variante}" titulo="${tipo}">
               ${mensagem}
            </ui-alerta>
          `;
        }).join('');
        initIcons();
      })
      .catch(() => {
        const container = document.getElementById('alerts-container');
        if (container) container.innerHTML = `<div class="text-center text-red-400 text-sm py-4">Erro ao carregar alertas.</div>`;
      });

    // 4. Configuração Inicial do Mapa Leaflet
    let defaultCenter: [number, number] = [-23.7661, -53.3204];
    let defaultZoom = 14;
    const savedCenter = localStorage.getItem('gerencigeo_dashboard_center');
    const savedZoom = localStorage.getItem('gerencigeo_dashboard_zoom');
    let hasSavedPosition = false;

    if (savedCenter) {
      try {
        defaultCenter = JSON.parse(savedCenter);
        hasSavedPosition = true;
      } catch (e) {}
    }
    if (savedZoom) {
      defaultZoom = parseInt(savedZoom);
      hasSavedPosition = true;
    }

    const map = L.map('map', {
      maxZoom: 24
    }).setView(defaultCenter, defaultZoom);
    mapInstance = map;

    // Salva a posição/zoom do mapa ao movimentar com proteção anti-desmontagem
    map.on('moveend', () => {
      try {
        if (!map || !(map as any)._mapPane) return;
        const center = map.getCenter();
        localStorage.setItem('gerencigeo_dashboard_center', JSON.stringify([center.lat, center.lng]));
      } catch (e) {}
    });
    map.on('zoomend', () => {
      try {
        if (!map || !(map as any)._mapPane) return;
        localStorage.setItem('gerencigeo_dashboard_zoom', map.getZoom().toString());
      } catch (e) {}
    });

    // Controles de escala, norte e tela cheia
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
    new NorthArrowControl().addTo(map);
    new FullscreenControl().addTo(map);

    // Panes e Camadas Base
    map.createPane('overlayPane');
    const overlayPane = map.getPane('overlayPane');
    if (overlayPane) {
      overlayPane.style.zIndex = '650';
      overlayPane.style.pointerEvents = 'none';
    }

    // Google Satellite Hybrid
    L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 24,
      maxNativeZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: 'Google Maps',
      keepBuffer: 16,
      updateWhenZooming: false,
      updateWhenIdle: true
    }).addTo(map);

    // Camada WMS SIGEF/INCRA
    const sigef = L.tileLayer.wms('https://acervofundiario.incra.gov.br/i3geo/ogc.php', {
      layers: 'certificada_sigef_particular_pr',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      pane: 'overlayPane',
      attribution: 'INCRA/SIGEF',
      className: 'sigef-wms-layer',
      keepBuffer: 8,
      updateWhenZooming: false,
      updateWhenIdle: true
    }).addTo(map);

    const overlayMaps: { [key: string]: L.Layer } = {
      "Imóveis SIGEF (PR)": sigef
    };

    // Controle de camadas nativo do Leaflet inicia recolhido para não poluir visualmente
    let layersControl = L.control.layers(undefined, overlayMaps, { collapsed: true }).addTo(map);

    // 5. Consulta GetFeatureInfo do SIGEF (Módulo Unificado)
    map.on('click', async (e: L.LeafletMouseEvent) => {
      if (!map.hasLayer(sigef)) return;
      await consultarEPlotarSigef(map, e);
    });

    // 6. Geometrias dos Imóveis Locais e Camadas
    const localLayersGroup = L.layerGroup().addTo(map);
    const localMatriculas: any[] = [];

    (window as any).downloadLocalShapefile = downloadLocalShapefile;

    const processarGeometrias = (data: any[]) => {
      if (!data || data.length === 0) return;

      localMatriculas.length = 0;
      localLayersGroup.clearLayers();

      data.forEach(item => {
        localMatriculas.push(item);
        const latLons = item.coordenadas.map((c: any) => [c.lat, c.lon] as [number, number]);

        const polygon = L.polygon(latLons, {
          color: '#10b981',
          weight: 2,
          fillColor: '#10b981',
          fillOpacity: 0.15,
          className: 'local-parcel-polygon'
        });

        polygon.on('mouseover', () => {
          polygon.setStyle({ fillOpacity: 0.35, weight: 3, color: '#059669' });
        });

        polygon.on('mouseout', () => {
          polygon.setStyle({ fillOpacity: 0.15, weight: 2, color: '#10b981' });
        });

        const nomePropriedade = sanitizeHtml(item.nome_propriedade || '');
        const numeroMatricula = sanitizeHtml(String(item.numero_matricula || ''));
        const areaHa = parseFloat(item.area_ha || 0).toFixed(4);
        const municipio = sanitizeHtml(item.municipio || '');
        const uf = sanitizeHtml(item.uf || '');
        const popupHtml = `
          <div class="p-3 font-sans min-w-[220px] text-white">
            <h4 class="text-xs font-mono uppercase tracking-widest text-mint-vibrant font-bold mb-1">${nomePropriedade}</h4>
            <div class="space-y-1 my-2 py-2 border-t border-b border-white/5 text-[11px]">
              <p class="text-white/60">Matrícula: <strong class="text-white font-mono font-medium">${numeroMatricula}</strong></p>
              <p class="text-white/60">Área CCIR: <strong class="text-white font-mono font-medium">${areaHa} ha</strong></p>
              <p class="text-white/60">Local: <strong class="text-white font-medium">${municipio}/${uf}</strong></p>
            </div>
            <button 
              onclick="window.downloadLocalShapefile(${item.levantamento_id}, ${item.id}, '${numeroMatricula}')"
              class="w-full bg-mint-vibrant/20 hover:bg-mint-vibrant/40 border border-mint-vibrant/40 text-mint-vibrant hover:text-white text-[10px] font-mono uppercase tracking-wider font-bold py-2 px-3 rounded shadow transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline" style="margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Shapefile (.ZIP)
            </button>
          </div>
        `;

        polygon.bindPopup(popupHtml, { className: 'glass-popup', maxWidth: 300 });
        localLayersGroup.addLayer(polygon);
      });

      if (localMatriculas.length > 0) {
        // Se o usuário não tiver uma posição previamente memorizada no localStorage, enquadra TODOS os imóveis
        if (!hasSavedPosition) {
          enquadrarTodosImoveis(map, localLayersGroup);
        }

        overlayMaps["Nossos Imóveis"] = localLayersGroup;
        if (layersControl) {
          map.removeControl(layersControl);
        }
        layersControl = L.control.layers(undefined, overlayMaps, { collapsed: true }).addTo(map);

        // Painel Flutuante Colapsável e Inteligente
        map.addControl(criarPainelCamadasLocaisControl(map, localMatriculas, localLayersGroup));

        // Função global para focar no polígono selecionado
        (window as any).focusLocalPolygon = (matId: number) => {
          localLayersGroup.eachLayer((layer: any) => {
            const bounds = layer.getBounds();
            const pt = bounds.getCenter();
            const targetMat = localMatriculas.find(x => x.id === matId);
            if (targetMat && targetMat.coordenadas?.length > 0) {
              const c1 = layer.getLatLngs()[0][0];
              const tc1 = targetMat.coordenadas[0];
              if (Math.abs(c1.lat - tc1.lat) < 1e-6 && Math.abs(c1.lng - tc1.lon) < 1e-6) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
                layer.openPopup(pt);
              }
            }
          });
        };
      }
    };

    fetchGeometrias()
      .then((data: any[]) => {
        localStorage.setItem('gerencigeo_cached_geometrias', JSON.stringify(data));
        processarGeometrias(data);
      })
      .catch(err => {
        console.error("[Dashboard] Erro ao carregar geometrias:", err);
        const cached = localStorage.getItem('gerencigeo_cached_geometrias');
        if (cached) {
          try {
            const data = JSON.parse(cached);
            showToast("Modo offline: Geometrias carregadas a partir do cache local.", "info");
            processarGeometrias(data);
          } catch (e) {
            console.error("Erro ao converter dados de cache:", e);
          }
        }
      });
  },
  cleanup: () => {
    if (mapInstance) {
      try {
        mapInstance.off();
        mapInstance.remove();
      } catch (e) {
        console.warn("[Dashboard] Erro ao remover mapa no cleanup:", e);
      }
      mapInstance = null;
    }
  }
};
