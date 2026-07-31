import L from 'leaflet';
import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, showToast } from '../utils';

let mapInstance: L.Map | null = null;

/** Sanitiza texto para uso seguro em innerHTML (previne XSS) */
const sanitizeHtml = (str: string): string => {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export const dashboardRoute: RouteDef = {
  render: () => `
    <div class="space-y-4 sm:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col">
      <!-- Topo Ultra Compacto (Altura Max ~60px) -->
      <div class="flex justify-between items-center h-10 sm:h-12 border-b border-white/5 pb-2 sm:pb-3 order-first shrink-0">
        <div>
          <h2 class="text-lg sm:text-xl font-bold tracking-tight text-white leading-none">Panorama Operacional</h2>
          <p class="text-white/40 text-[10px] mt-1.5 hidden sm:block">Painel de comando GerenciGeo.</p>
        </div>
        <div class="flex items-center gap-2 text-right">
          <span class="text-[9px] font-mono text-white/20 uppercase tracking-widest hidden sm:inline">Status da API</span>
          <span class="text-[11px] font-mono text-mint-vibrant bg-mint-vibrant/5 border border-mint-vibrant/10 px-2 py-0.5 rounded-sm" id="api-status">Conectando...</span>
        </div>
      </div>

      <!-- Cards de KPIs Super Compactos (Altura Max ~70px) -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 order-3 sm:order-2">
        <!-- Clientes -->
        <div class="glass-card h-14 sm:h-16 px-4 flex items-center gap-3 group hover:border-mint-vibrant/30 transition-all">
          <div class="p-1.5 bg-mint-vibrant/10 rounded-technical shrink-0">
            <i data-lucide="database" class="w-4 h-4 text-mint-vibrant"></i>
          </div>
          <div class="min-w-0">
            <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Clientes</p>
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-clientes">--</h3>
          </div>
        </div>

        <!-- Propriedades -->
        <div class="glass-card h-14 sm:h-16 px-4 flex items-center gap-3 group hover:border-mint-vibrant/30 transition-all">
          <div class="p-1.5 bg-blue-500/10 rounded-technical shrink-0">
            <i data-lucide="map-pin" class="w-4 h-4 text-blue-500"></i>
          </div>
          <div class="min-w-0">
            <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Propriedades</p>
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-prop">--</h3>
          </div>
        </div>

        <!-- Profissionais -->
        <div class="glass-card h-14 sm:h-16 px-4 flex items-center gap-3 group hover:border-mint-vibrant/30 transition-all">
          <div class="p-1.5 bg-purple-500/10 rounded-technical shrink-0">
            <i data-lucide="activity" class="w-4 h-4 text-purple-500"></i>
          </div>
          <div class="min-w-0">
            <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Profissionais</p>
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-prof">--</h3>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-220px)] lg:min-h-[450px] order-2 sm:order-3">
        <!-- Leaflet Map Container -->
        <div class="lg:col-span-2 glass-card h-[380px] sm:h-[420px] lg:h-full relative overflow-hidden border-white/5" id="map-container">
           <div id="map" class="w-full h-full"></div>
        </div>

        <!-- Action Center -->
        <div class="glass-card flex flex-col h-auto lg:h-full">
          <div class="p-4 sm:p-6 border-b border-white/5 flex justify-between items-center">
             <h4 class="text-base sm:text-lg font-bold flex items-center gap-2">
               <i data-lucide="bell" class="w-5 h-5 text-mint-vibrant"></i>
               Action Center
             </h4>
             <a href="#pendencias" class="text-xs text-mint-vibrant hover:underline cursor-pointer">Ver Tudo</a>
          </div>
          <div class="p-3 sm:p-4 flex-1 overflow-y-auto space-y-3 max-h-[280px] lg:max-h-[400px]" id="alerts-container">
             <div class="text-center text-white/40 text-sm py-4">Carregando alertas...</div>
          </div>
        </div>
      </div>
    </div>

  `,
  setup: () => {
    // API Status
    fetch(`${API_BASE}/status`)
      .then(res => res.json())
      .then(data => {
        const el = document.getElementById('api-status');
        if (el) el.innerText = data.status.toUpperCase();
      }).catch(() => {
        const el = document.getElementById('api-status');
        if (el) {
          el.innerText = 'OFFLINE';
          el.classList.replace('text-mint-vibrant', 'text-red-500');
        }
      });

    // API Stats
    fetch(`${API_BASE}/stats`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const cli = document.getElementById('stat-clientes');
        const prop = document.getElementById('stat-prop');
        const prof = document.getElementById('stat-prof');
        if (cli) cli.innerText = data.clientes.toString();
        if (prop) prop.innerText = data.propriedades.toString();
        if (prof) prof.innerText = data.profissionais.toString();
      }).catch(err => console.error("Error fetching stats:", err));

    // Alerts
    fetch(`${API_BASE}/dashboard/alerts`)
      .then(res => res.json())
      .then(data => {
        const container = document.getElementById('alerts-container');
        if (!container) return;
        if (!data.alerts || data.alerts.length === 0) {
          container.innerHTML = `<div class="text-center text-white/40 text-sm py-4">Nenhum alerta pendente.</div>`;
          return;
        }
        container.innerHTML = data.alerts.map((alert: any) => {
          // Sanitiza campos vindos da API para evitar XSS (DB-02)
          const icone = sanitizeHtml(alert.icone || 'alert-circle');
          const tipo = sanitizeHtml(alert.tipo || '');
          const mensagem = sanitizeHtml(alert.mensagem || '');
          return `
           <div class="p-2.5 sm:p-3 bg-white/[0.02] border border-white/5 rounded-lg flex items-start gap-2.5 sm:gap-3 hover:bg-white/[0.05] transition-colors">
              <i data-lucide="${icone}" class="w-4 h-4 mt-0.5 shrink-0 ${alert.tipo === 'CRITICO' ? 'text-red-400' : 'text-mint-vibrant'}"></i>
              <div class="min-w-0">
                 <p class="text-[10px] sm:text-xs font-bold ${alert.tipo === 'CRITICO' ? 'text-red-400' : 'text-white/80'}">${tipo}</p>
                 <p class="text-xs sm:text-sm text-white/60 leading-relaxed break-words">${mensagem}</p>
              </div>
           </div>
        `;
        }).join('');
        initIcons();
      }).catch(() => {
        const container = document.getElementById('alerts-container');
        if (container) container.innerHTML = `<div class="text-center text-red-400 text-sm py-4">Erro ao carregar alertas.</div>`;
      });

    // Recupera última posição/zoom do mapa persistido no localStorage
    let defaultCenter: [number, number] = [-23.7661, -53.3204];
    let defaultZoom = 14;
    const savedCenter = localStorage.getItem('gerencigeo_dashboard_center');
    const savedZoom = localStorage.getItem('gerencigeo_dashboard_zoom');
    if (savedCenter) {
      try {
        defaultCenter = JSON.parse(savedCenter);
      } catch (e) { }
    }
    if (savedZoom) {
      defaultZoom = parseInt(savedZoom);
    }

    // Initialize Leaflet Map centered on Umuarama, PR com maxZoom 24
    const map = L.map('map', {
      maxZoom: 24
    }).setView(defaultCenter, defaultZoom);
    mapInstance = map;

    // Salva a posição/zoom do mapa em tempo real
    map.on('moveend', () => {
      const center = map.getCenter();
      localStorage.setItem('gerencigeo_dashboard_center', JSON.stringify([center.lat, center.lng]));
    });
    map.on('zoomend', () => {
      localStorage.setItem('gerencigeo_dashboard_zoom', map.getZoom().toString());
    });

    // Adiciona escala métrica Leaflet
    L.control.scale({
      metric: true,
      imperial: false,
      position: 'bottomleft'
    }).addTo(map);

    // Adiciona indicador de Norte Geográfico estilizado
    const NorthArrowControl = L.Control.extend({
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
    new NorthArrowControl().addTo(map);

    // Create a pane for overlays to ensure they stay on top
    map.createPane('overlayPane');
    const overlayPane = map.getPane('overlayPane');
    if (overlayPane) {
      overlayPane.style.zIndex = '650';
      overlayPane.style.pointerEvents = 'none';
    }

    // Google Satellite Hybrid (HTTPS)
    L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 24,
      maxNativeZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: 'Google Maps',
      keepBuffer: 16,
      updateWhenZooming: false,
      updateWhenIdle: true
    }).addTo(map);

    // SIGEF/INCRA WMS (Certificação de Imóveis Rurais - Atualizado)
    const sigef = L.tileLayer.wms('https://acervofundiario.incra.gov.br/i3geo/ogc.php', {
      layers: 'certificada_sigef_particular_pr', // Camada específica para propriedades particulares do Paraná
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      pane: 'overlayPane',
      attribution: 'INCRA/SIGEF',
      className: 'sigef-wms-layer', // Permite manipular a cor via filtro CSS
      keepBuffer: 8,
      updateWhenZooming: false,
      updateWhenIdle: true
    }).addTo(map);

    const overlayMaps: { [key: string]: L.Layer } = {
      "Imóveis SIGEF (PR)": sigef
    };

    let layersControl = L.control.layers(undefined, overlayMaps, { collapsed: false }).addTo(map);


    // Fullscreen Control
    const FullscreenControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
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
            // Leaflet precisa de um pequeno delay para entender a nova dimensão
            setTimeout(() => {
              try { map?.invalidateSize?.(); } catch (e) {}
            }, 100);

            // Altera o ícone do botão baseando no estado
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
    map.addControl(new FullscreenControl());

    // Modal Logic
    const parcelModal = document.getElementById('parcel-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const modalContent = document.getElementById('modal-content');
    const modalFooter = document.getElementById('modal-footer');
    const sigefLink = document.getElementById('sigef-link') as HTMLAnchorElement;

    const openParcelModal = () => {
      parcelModal?.classList.remove('hidden');
      setTimeout(() => parcelModal?.classList.add('opacity-100'), 10);
    };

    const closeParcelModal = () => {
      parcelModal?.classList.remove('opacity-100');
      setTimeout(() => parcelModal?.classList.add('hidden'), 300);
    };

    closeModalBtn?.addEventListener('click', closeParcelModal);
    parcelModal?.addEventListener('click', (e) => {
      if (e.target === parcelModal) closeParcelModal();
    });

    // Handle map click for SIGEF GetFeatureInfo
    map.on('click', async (e: any) => {
      // Só executa o clique se a camada do SIGEF estiver ativada no mapa
      if (!map.hasLayer(sigef)) return;
      const size = map.getSize();
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      const bbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
      const x = Math.round(map.layerPointToContainerPoint(e.layerPoint).x);
      const y = Math.round(map.layerPointToContainerPoint(e.layerPoint).y);

      const targetUrl = `https://acervofundiario.incra.gov.br/i3geo/ogc.php?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&FORMAT=image/png&TRANSPARENT=true&QUERY_LAYERS=certificada_sigef_particular_pr&LAYERS=certificada_sigef_particular_pr&INFO_FORMAT=text/plain&X=${x}&Y=${y}&WIDTH=${size.x}&HEIGHT=${size.y}&SRS=EPSG:4326&BBOX=${bbox}`;

      // Indica carregamento no cursor do mapa
      const mapContainer = document.getElementById('map-container');
      if (mapContainer) mapContainer.style.cursor = 'wait';

      try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl);
        const text = await res.text();

        // Faz o parsing do formato text/plain retornado pelo MapServer (i3Geo)
        let props: any = null;
        let featureId = '';

        if (text && text.includes("GetFeatureInfo results:")) {
          const lines = text.split('\n');
          const currentFeature: any = {};

          for (const line of lines) {
            const trimmed = line.trim();
            // Suporta chaves e valores acentuados, cedilhas, com aspas simples, aspas duplas ou sem aspas
            const match = trimmed.match(/^([\w_]+)\s*=\s*['"]?([^'"]*)['"]?$/) || trimmed.match(/([\w_]+)\s*=\s*['"]?([^'"]*)['"]?/);
            if (match) {
              const key = match[1];
              const value = match[2].trim();
              currentFeature[key] = value;
            }
          }

          if (Object.keys(currentFeature).length > 0) {
            props = currentFeature;
            featureId = currentFeature.parcela_codigo || currentFeature.id || '';
          }
        }

        if (props) {
          const uuid = featureId || props.parcela_codigo || props.co_parcela || props.id_parcela;
          const link = uuid ? `https://sigef.incra.gov.br/geo/parcela/detalhe/${uuid}/` : `https://sigef.incra.gov.br/consultar/parcelas`;

          if (modalContent) {
            modalContent.innerHTML = `
                      <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1">
                          <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Código do Imóvel</p>
                          <p class="text-sm font-mono text-white">${props.codigo_imovel || 'N/A'}</p>
                        </div>
                        <div class="space-y-1 text-right">
                          <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Data Submissão</p>
                          <p class="text-sm font-mono text-mint-vibrant">${props.data_submissao || 'N/A'}</p>
                        </div>
                        <div class="col-span-2 space-y-1 pt-3 border-t border-white/5">
                          <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Nome do Imóvel / Parcela</p>
                          <p class="text-sm text-white font-medium">${props.nome_area || props.nome_imovel || 'N/A'}</p>
                        </div>
                        <div class="space-y-1">
                          <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Matrícula</p>
                          <p class="text-sm text-white/80">${props.registro_matricula || props.matricula || 'Consulte o SIGEF'}</p>
                        </div>
                        <div class="space-y-1 text-right">
                          <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Status</p>
                          <p class="text-sm text-white/80">${props.situacao_informada || props.status || 'N/A'}</p>
                        </div>
                      </div>
                    `;
          }

          if (sigefLink) sigefLink.href = link;
          modalFooter?.classList.remove('hidden');

          // Abre o modal apenas se encontrou a parcela
          openParcelModal();
          initIcons();
        } else {
          // Clique fora de parcela
        }
      } catch (err) {
        showToast("Erro ao consultar o servidor do INCRA ou clique fora dos limites.", "error");
      } finally {
        // Restaura o cursor
        if (mapContainer) mapContainer.style.cursor = '';
      }
    });

    // --- RENDERIZAÇÃO DE IMÓVEIS LOCAIS E EXPORTAÇÃO (V.L.A.E.G.) ---
    const localLayersGroup = L.layerGroup().addTo(map);
    const localMatriculas: any[] = [];

    // Função de download do Shapefile
    const downloadShapefile = (levId: number, matId: number, numeroMatricula: string) => {
      const url = `${API_BASE}/levantamentos/${levId}/matriculas/${matId}/exportar-shapefile`;

      // Cria um link temporário para iniciar o download direto do ZIP
      const a = document.createElement('a');
      a.href = url;
      a.download = `matricula_${numeroMatricula}_shapefile.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    // Expõe a função globalmente para ser acionada pelos cliques em popups gerados dinamicamente no mapa
    (window as any).downloadLocalShapefile = downloadShapefile;

    const processarGeometrias = (data: any[]) => {
      if (!data || data.length === 0) return;

      data.forEach(item => {
        localMatriculas.push(item);

        // Formata as coordenadas para o Leaflet: [lat, lon]
        const latLons = item.coordenadas.map((c: any) => [c.lat, c.lon] as [number, number]);

        // Estilo visual premium e vibrante Mint-vibrant (#10b981) com transições
        const polygon = L.polygon(latLons, {
          color: '#10b981',       // Mint vibrant
          weight: 2,
          fillColor: '#10b981',
          fillOpacity: 0.15,
          className: 'local-parcel-polygon'
        });

        // Efeitos de Hover reativos e dinâmicos para visual premium
        polygon.on('mouseover', () => {
          polygon.setStyle({
            fillOpacity: 0.35,
            weight: 3,
            color: '#059669' // Emerald um pouco mais escuro
          });
        });

        polygon.on('mouseout', () => {
          polygon.setStyle({
            fillOpacity: 0.15,
            weight: 2,
            color: '#10b981'
          });
        });

        // Popup interativo estilizado em CSS vanilla dark-mode/glassmorphism
        // Sanitiza campos da API antes de injetar em HTML (DB-03)
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

        polygon.bindPopup(popupHtml, {
          className: 'glass-popup',
          maxWidth: 300
        });

        localLayersGroup.addLayer(polygon);
      });

      // Atualiza a lista no Painel de Controle de Camadas do Leaflet e no Control lateral
      if (localMatriculas.length > 0) {
        // Centraliza o mapa dinamicamente no primeiro polígono local cadastrado
        const firstBounds = (localLayersGroup.getLayers()[0] as any).getBounds();
        map.fitBounds(firstBounds, { padding: [50, 50] });

        // Adiciona a camada de parcelas locais no menu de camadas oficial do Leaflet
        overlayMaps["Nossos Imóveis"] = localLayersGroup;

        // Recria o controle de camadas para incluir as parcelas locais
        if (layersControl) {
          map.removeControl(layersControl);
        }
        layersControl = L.control.layers(undefined, overlayMaps, { collapsed: false }).addTo(map);


        // Adiciona o Painel Flutuante Premium de Download / Exportador Rápido
        const CamadasLocaisControl = L.Control.extend({
          options: { position: 'topright' },
          onAdd: function () {
            const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            div.style.background = 'rgba(10, 16, 13, 0.9)';
            div.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            div.style.padding = '12px';
            div.style.borderRadius = '8px';
            div.style.width = '240px';
            div.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)';
            div.style.backdropFilter = 'blur(12px)';

            let listHtml = `
              <div class="text-white text-xs font-mono select-none">
                <p class="text-[9px] uppercase tracking-widest text-mint-vibrant font-bold border-b border-white/10 pb-1.5 mb-2 flex items-center gap-1" style="display: flex; align-items: center; gap: 4px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  CAMADAS LOCAIS (.ZIP)
                </p>
                <div class="space-y-2 max-h-[160px] overflow-y-auto pr-1 select-text" style="display: flex; flex-direction: column; gap: 6px;">
            `;

            localMatriculas.forEach(m => {
              listHtml += `
                <div class="flex justify-between items-center gap-2 hover:bg-white/[0.03] p-1.5 rounded transition-all" style="display: flex; justify-content: space-between; align-items: center;">
                  <div class="truncate text-[10px] w-2/3 cursor-pointer" onclick="window.focusLocalPolygon(${m.id})" title="Focar no Imóvel" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;">
                    <p class="font-bold text-white/80 hover:text-mint-vibrant truncate" style="margin: 0;">${m.nome_propriedade}</p>
                    <p class="text-[8px] text-white/30 truncate" style="margin: 0;">Mat. ${m.numero_matricula}</p>
                  </div>
                  <button 
                    onclick="window.downloadLocalShapefile(${m.levantamento_id}, ${m.id}, '${m.numero_matricula}')"
                    class="bg-mint-vibrant/10 hover:bg-mint-vibrant text-mint-vibrant hover:text-white px-2 py-1 rounded text-[8px] font-mono border border-mint-vibrant/25 hover:border-transparent transition-all cursor-pointer"
                    title="Download Shapefile"
                    style="flex-shrink: 0;"
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

            div.innerHTML = listHtml;

            // Previne propagação de cliques e scroll para o mapa do Leaflet
            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);

            return div;
          }
        });

        // Expõe função de focar no polígono para ser acionada pelo menu de listagem
        (window as any).focusLocalPolygon = (matId: number) => {
          localLayersGroup.eachLayer((layer: any) => {
            // Procura o polígono da matrícula clicada
            const bounds = layer.getBounds();
            const pt = bounds.getCenter();

            const targetMat = localMatriculas.find(x => x.id === matId);
            if (targetMat) {
              const c1 = layer.getLatLngs()[0][0];
              const tc1 = targetMat.coordenadas[0];
              if (Math.abs(c1.lat - tc1.lat) < 1e-6 && Math.abs(c1.lng - tc1.lon) < 1e-6) {
                map.fitBounds(bounds, { padding: [50, 50] });
                layer.openPopup(pt);
              }
            }
          });
        };

        map.addControl(new CamadasLocaisControl());
      }
    };

    fetch(`${API_BASE}/dashboard/matriculas-geometrias`)
      .then(res => res.json())
      .then((data: any[]) => {
        // Salva dados no cache local do navegador para tolerância a falhas
        localStorage.setItem('gerencigeo_cached_geometrias', JSON.stringify(data));
        processarGeometrias(data);
      })
      .catch(err => {
        console.error("Erro ao carregar geometrias locais no Dashboard:", err);
        // Tenta recuperar do cache offline em caso de falha de rede/servidor offline
        const cached = localStorage.getItem('gerencigeo_cached_geometrias');
        if (cached) {
          try {
            const data = JSON.parse(cached);
            showToast("Modo offline: Geometrias carregadas a partir do cache local.", "info");
            processarGeometrias(data);
          } catch (e) {
            console.error("Erro ao converter dados de geometrias salvas em cache:", e);
          }
        } else {
          showToast("Erro ao carregar camadas espaciais e sem cache disponível.", "error");
        }
      });
  },
  cleanup: () => {
    if (mapInstance) {
      try {
        mapInstance.remove();
      } catch (e) {
        console.warn("[Dashboard] Erro ao remover mapa no cleanup:", e);
      }
      mapInstance = null;
    }
  }
};

