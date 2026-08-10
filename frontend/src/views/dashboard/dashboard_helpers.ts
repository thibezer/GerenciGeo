/**
 * dashboard_helpers.ts — Controles personalizados do Leaflet, sanitização e manipuladores de UI do Dashboard.
 */
import L from 'leaflet';
import { escapeHtml } from '../../utils';

/** Sanitiza texto para uso seguro em innerHTML (previne XSS) */
export const sanitizeHtml = (str: string): string => {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/** Indicador de Norte Geográfico estilizado */
export const NorthArrowControl = L.Control.extend({
  options: { position: 'topright' },
  onAdd: function () {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-north-arrow');
    div.style.background = 'rgba(17, 17, 19, 0.82)';
    div.style.backdropFilter = 'blur(12px)';
    div.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    div.style.color = '#00E08A';
    div.style.borderRadius = '6px';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.width = '32px';
    div.style.height = '32px';
    div.title = 'Norte Geográfico';
    div.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 9px; font-weight: bold; font-family: var(--geo-font-sans), sans-serif; gap: 1px;">
        <span>N</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="19 10 12 3 5 10"/></svg>
      </div>
    `;
    return div;
  }
});

/** Controle de Tela Cheia */
export const FullscreenControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd: function (map: L.Map) {
    const btn = L.DomUtil.create('a', 'leaflet-bar leaflet-control');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 7px;"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
    btn.href = '#';
    btn.title = 'Tela Cheia';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.background = 'rgba(12, 21, 16, 0.8)';
    btn.onclick = (e) => {
      e.preventDefault();
      const container = document.getElementById('map-container');
      if (container) {
        container.classList.toggle('map-fullscreen');
        setTimeout(() => {
          try { map?.invalidateSize?.(); } catch (e) {}
        }, 100);

        if (container.classList.contains('map-fullscreen')) {
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 7px;"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`;
          btn.title = 'Sair da Tela Cheia';
        } else {
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 7px;"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
          btn.title = 'Tela Cheia';
        }
      }
    };
    return btn;
  }
});

/** Enquadra o mapa para exibir todos os imóveis cadastrados simultaneamente */
export const enquadrarTodosImoveis = (map: L.Map, localLayersGroup: L.LayerGroup) => {
  const layers = localLayersGroup.getLayers();
  if (!layers || layers.length === 0) return;

  try {
    const group = L.featureGroup(layers);
    const bounds = group.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }
  } catch (err) {
    console.warn("[Dashboard] Erro ao enquadrar todas as geometrias:", err);
  }
};

/**
 * Cria o controle de Painel de Imóveis Locais no Leaflet.
 * Possui suporte a recolher/expandir (collapse), contador e botão de enquadramento global.
 */
export const criarPainelCamadasLocaisControl = (
  map: L.Map,
  localMatriculas: any[],
  localLayersGroup: L.LayerGroup
) => {
  const CamadasLocaisControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control dashboard-camadas-control');
      container.style.background = 'rgba(10, 16, 13, 0.92)';
      container.style.border = '1px solid rgba(255, 255, 255, 0.12)';
      container.style.borderRadius = '8px';
      container.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)';
      container.style.backdropFilter = 'blur(12px)';
      container.style.transition = 'all 0.25s ease-in-out';
      container.style.overflow = 'hidden';

      let isCollapsed = localStorage.getItem('gerencigeo_dashboard_camadas_collapsed') === 'true';

      const renderContent = () => {
        if (isCollapsed) {
          container.style.width = 'auto';
          container.style.padding = '4px 8px';
          container.innerHTML = `
            <button id="btn-toggle-camadas-painel" class="flex items-center gap-1.5 text-mint-vibrant hover:text-white font-mono text-[10px] font-bold cursor-pointer py-1" title="Expandir Lista de Imóveis">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>Imóveis (${localMatriculas.length})</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          `;
        } else {
          container.style.width = '240px';
          container.style.padding = '10px 12px';

          let listHtml = `
            <div class="text-white text-xs font-mono select-none">
              <!-- Topo do Painel com Controles -->
              <div class="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2">
                <p class="text-[9px] uppercase tracking-widest text-mint-vibrant font-bold flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  IMÓVEIS LOCAIS (${localMatriculas.length})
                </p>
                <div class="flex items-center gap-1">
                  <button id="btn-fit-all-parcels" class="text-white/40 hover:text-mint-vibrant p-0.5 rounded cursor-pointer" title="Enquadrar todos os imóveis no mapa">
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>
                  </button>
                  <button id="btn-toggle-camadas-painel" class="text-white/40 hover:text-white p-0.5 rounded cursor-pointer" title="Minimizar Painel">
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                  </button>
                </div>
              </div>

              <!-- Lista Rolável de Imóveis -->
              <div class="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 select-text" style="display: flex; flex-direction: column; gap: 5px;">
          `;

          localMatriculas.forEach(m => {
            listHtml += `
              <div class="flex justify-between items-center gap-2 hover:bg-white/[0.04] p-1.5 rounded transition-all">
                <div class="truncate text-[10px] w-2/3 cursor-pointer" onclick="window.focusLocalPolygon(${m.id})" title="Clique para focar no Imóvel" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 145px;">
                  <p class="font-bold text-white/90 hover:text-mint-vibrant truncate m-0">${escapeHtml(m.nome_propriedade)}</p>
                  <p class="text-[8px] text-white/40 truncate m-0">Mat. ${escapeHtml(String(m.numero_matricula))}</p>
                </div>
                <button 
                  onclick="window.downloadLocalShapefile(${m.levantamento_id}, ${m.id}, '${escapeHtml(String(m.numero_matricula))}')"
                  class="bg-mint-vibrant/10 hover:bg-mint-vibrant text-mint-vibrant hover:text-forest-deep px-1.5 py-0.5 rounded text-[8px] font-mono border border-mint-vibrant/25 hover:border-transparent transition-all cursor-pointer shrink-0 font-bold"
                  title="Exportar Shapefile (.ZIP)"
                >
                  SHP
                </button>
              </div>
            `;
          });

          listHtml += `
              </div>
            </div>
          `;

          container.innerHTML = listHtml;
        }

        // Liga os eventos de toggle e enquadramento
        const btnToggle = container.querySelector('#btn-toggle-camadas-painel');
        btnToggle?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          isCollapsed = !isCollapsed;
          localStorage.setItem('gerencigeo_dashboard_camadas_collapsed', isCollapsed.toString());
          renderContent();
        });

        const btnFitAll = container.querySelector('#btn-fit-all-parcels');
        btnFitAll?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          enquadrarTodosImoveis(map, localLayersGroup);
        });
      };

      renderContent();

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      return container;
    }
  });

  return new CamadasLocaisControl();
};
