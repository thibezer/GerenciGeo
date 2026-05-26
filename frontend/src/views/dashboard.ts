import L from 'leaflet';
import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons } from '../utils';

export const dashboardRoute: RouteDef = {
  render: () => `
    <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="flex justify-between items-end">
        <div>
          <h2 class="text-3xl font-bold">Panorama Operacional</h2>
          <p class="text-white/40 mt-1">Bem-vindo de volta ao centro de comando GerenciGeo.</p>
        </div>
        <div class="text-right">
          <p class="text-xs font-mono text-white/20 uppercase tracking-widest">Status da API</p>
          <p class="text-sm font-mono text-mint-vibrant" id="api-status">Conectando...</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="glass-card p-6 group hover:border-mint-vibrant/30 transition-all">
          <div class="flex justify-between items-start mb-4">
            <div class="p-2 bg-mint-vibrant/10 rounded-technical">
              <i data-lucide="database" class="w-5 h-5 text-mint-vibrant"></i>
            </div>
          </div>
          <p class="text-white/40 text-sm mb-1 font-medium">Total de Clientes</p>
          <h3 class="text-2xl font-bold tracking-tight" id="stat-clientes">--</h3>
        </div>

        <div class="glass-card p-6 group hover:border-mint-vibrant/30 transition-all">
          <div class="flex justify-between items-start mb-4">
            <div class="p-2 bg-blue-500/10 rounded-technical">
              <i data-lucide="map-pin" class="w-5 h-5 text-blue-500"></i>
            </div>
          </div>
          <p class="text-white/40 text-sm mb-1 font-medium">Propriedades</p>
          <h3 class="text-2xl font-bold tracking-tight" id="stat-prop">--</h3>
        </div>

        <div class="glass-card p-6 group hover:border-mint-vibrant/30 transition-all">
          <div class="flex justify-between items-start mb-4">
            <div class="p-2 bg-purple-500/10 rounded-technical">
              <i data-lucide="activity" class="w-5 h-5 text-purple-500"></i>
            </div>
          </div>
          <p class="text-white/40 text-sm mb-1 font-medium">Profissionais</p>
          <h3 class="text-2xl font-bold tracking-tight" id="stat-prof">--</h3>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Leaflet Map Container -->
        <div class="lg:col-span-2 glass-card h-[500px] relative overflow-hidden border-white/5" id="map-container">
           <div id="map" class="w-full h-full"></div>
           <div class="absolute bottom-6 left-6 z-[1000] flex flex-col gap-2">
              <div class="bg-forest-deep/80 backdrop-blur-md p-3 rounded-technical border border-white/10 text-[10px] font-mono shadow-xl">
                 <p class="text-mint-vibrant font-bold">SIGEF WMS: CONECTADO</p>
                 <p class="text-white/40 text-[8px] mt-1">SINCRO: INCRA GEOSERVER</p>
              </div>
           </div>
        </div>

        <!-- Action Center -->
        <div class="glass-card flex flex-col h-full">
          <div class="p-6 border-b border-white/5 flex justify-between items-center">
             <h4 class="text-lg font-bold flex items-center gap-2">
               <i data-lucide="bell" class="w-5 h-5 text-mint-vibrant"></i>
               Action Center
             </h4>
             <a href="#pendencias" class="text-xs text-mint-vibrant hover:underline cursor-pointer">Ver Tudo</a>
          </div>
          <div class="p-4 flex-1 overflow-y-auto space-y-3 max-h-[400px]" id="alerts-container">
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
      .then(res => res.json())
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
        container.innerHTML = data.alerts.map((alert: any) => `
           <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg flex items-start gap-3 hover:bg-white/[0.05] transition-colors">
              <i data-lucide="${alert.icone || 'alert-circle'}" class="w-4 h-4 mt-0.5 ${alert.tipo === 'CRITICO' ? 'text-red-400' : 'text-mint-vibrant'}"></i>
              <div>
                 <p class="text-xs font-bold ${alert.tipo === 'CRITICO' ? 'text-red-400' : 'text-white/80'}">${alert.tipo}</p>
                 <p class="text-sm text-white/60">${alert.mensagem}</p>
              </div>
           </div>
        `).join('');
        initIcons();
      }).catch(() => {
        const container = document.getElementById('alerts-container');
        if (container) container.innerHTML = `<div class="text-center text-red-400 text-sm py-4">Erro ao carregar alertas.</div>`;
      });

    // Initialize Leaflet Map centered on Umuarama, PR
    const map = L.map('map').setView([-23.7661, -53.3204], 14);

    // Create a pane for overlays to ensure they stay on top
    map.createPane('overlayPane');
    const overlayPane = map.getPane('overlayPane');
    if (overlayPane) {
      overlayPane.style.zIndex = '650';
      overlayPane.style.pointerEvents = 'none';
    }

    // Google Satellite Hybrid (HTTPS)
    const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: 'Google Maps'
    }).addTo(map);

    // SIGEF/INCRA WMS (Certificação de Imóveis Rurais - Atualizado)
    const sigef = L.tileLayer.wms('https://acervofundiario.incra.gov.br/i3geo/ogc.php', {
      layers: 'certificada_sigef_particular_pr', // Camada específica para propriedades particulares do Paraná
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      pane: 'overlayPane',
      attribution: 'INCRA/SIGEF',
      className: 'sigef-wms-layer' // Permite manipular a cor via filtro CSS
    }).addTo(map);

    const baseMaps = {
      "Satélite Google": googleSat
    };

    const overlayMaps = {
      "Imóveis SIGEF (PR)": sigef
    };

    L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);

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
            setTimeout(() => map.invalidateSize(), 100);

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

      const targetUrl = `https://acervofundiario.incra.gov.br/i3geo/ogc.php?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&FORMAT=image/png&TRANSPARENT=true&QUERY_LAYERS=certificada_sigef_particular_pr&LAYERS=certificada_sigef_particular_pr&INFO_FORMAT=application/json&X=${x}&Y=${y}&WIDTH=${size.x}&HEIGHT=${size.y}&SRS=EPSG:4326&BBOX=${bbox}`;

      // Indica carregamento no cursor do mapa
      const mapContainer = document.getElementById('map-container');
      if (mapContainer) mapContainer.style.cursor = 'wait';

      try {
        const res = await fetch(`${API_BASE}/proxy/sigef?url=${encodeURIComponent(targetUrl)}`);
        const data = await res.json();

        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          const props = feature.properties;
          const link = `https://sigef.incra.gov.br/consultar/parcelas`;

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
          console.log("Clique fora de parcela: Nenhum dado retornado pelo INCRA.");
        }
      } catch (err) {
        console.warn("Erro ao consultar o servidor do INCRA ou clique fora dos limites.", err);
      } finally {
        // Restaura o cursor
        if (mapContainer) mapContainer.style.cursor = '';
      }
    });
  }
};
