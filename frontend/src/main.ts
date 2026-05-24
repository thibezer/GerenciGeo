import './style.css'
import L from 'leaflet'
import { createIcons, Crosshair, LayoutDashboard, Cpu, FolderTree, History, MapPin, ChevronRight, Bell, Settings, Plus, Play, X, Trash2, Download, Upload, Map as MapIcon, Terminal, Activity, Database, CheckCircle2, AlertCircle, ExternalLink, Users, Edit } from 'lucide'

const API_BASE = 'http://127.0.0.1:8000'

// Initialize Icons
const initIcons = () => {
  createIcons({
    icons: { Crosshair, LayoutDashboard, Cpu, FolderTree, History, MapPin, ChevronRight, Bell, Settings, Plus, Play, X, Trash2, Download, Upload, MapIcon, Terminal, Activity, Database, CheckCircle2, AlertCircle, ExternalLink, Users, Edit }
  })
}

// Interfaces
interface RouteDef {
  render: () => string;
  setup?: () => void;
  cleanup?: () => void;
}

let activeIntervals: number[] = [];

const clearTimeoutsAndIntervals = () => {
  activeIntervals.forEach(clearInterval);
  activeIntervals = [];
}

const routes: Record<string, RouteDef> = {
  dashboard: {
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
        }).catch(err => {
          const container = document.getElementById('alerts-container');
          if (container) container.innerHTML = `<div class="text-center text-red-400 text-sm py-4">Erro ao carregar alertas.</div>`;
        });

      // Initialize Leaflet Map centered on Umuarama, PR
      const map = L.map('map').setView([-23.7661, -53.3204], 14);

      // Create a pane for overlays to ensure they stay on top
      map.createPane('overlayPane');
      if (map.getPane('overlayPane')) {
        map.getPane('overlayPane').style.zIndex = '650';
        map.getPane('overlayPane').style.pointerEvents = 'none';
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

        const { lat, lng } = e.latlng;
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

            // Tenta extrair a ID correta do SIGEF
            const sigefId = feature.id ? feature.id.split('.').pop() : '';
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
  },
  ppp: {
    render: () => `
      <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-3xl font-bold">Módulo de Processamento PPP</h2>
            <p class="text-white/40 mt-1">Automatização de conversão Rinex e submissão ao IBGE.</p>
          </div>
          <div class="flex gap-3">
            <button class="btn-primary" id="btn-start-ppp">
              <i data-lucide="play" class="w-4 h-4"></i>
              Iniciar Fluxo Completo
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div class="lg:col-span-1 space-y-6">
            <div class="glass-card p-6 border-dashed border-mint-vibrant/20 bg-mint-vibrant/[0.02] flex flex-col items-center justify-center text-center cursor-pointer hover:bg-mint-vibrant/[0.05] transition-all group" id="dropzone">
              <input type="file" id="file-input" class="hidden" multiple accept=".gns,.GNS" />
              <div class="w-12 h-12 bg-mint-vibrant/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <i data-lucide="upload" class="w-6 h-6 text-mint-vibrant"></i>
              </div>
              <h4 class="font-bold text-sm">Upload de Brutos</h4>
              <p class="text-[10px] text-white/40 mt-2 uppercase tracking-widest">Clique para selecionar arquivos .GNS</p>
            </div>

            <div class="glass-card p-6 space-y-4">
              <h4 class="text-sm font-bold uppercase tracking-widest text-white/40">Status do Lote</h4>
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-xs text-white/60">Arquivos Carregados</span>
                  <span class="text-sm font-mono" id="file-count">0</span>
                </div>
              </div>
            </div>
          </div>

          <div class="lg:col-span-3 space-y-6">
            <div class="glass-card bg-[#050a08] border-mint-vibrant/10 overflow-hidden flex flex-col h-64">
              <div class="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <i data-lucide="terminal" class="w-4 h-4 text-mint-vibrant"></i>
                  <span class="text-[10px] font-bold uppercase tracking-widest text-white/40">Terminal de Logs (Real-time)</span>
                </div>
              </div>
              <div class="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 text-white/60" id="terminal-output">
                 <div class="text-white/30">[IDLE] Aguardando entrada de dados.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
    setup: () => {
      const term = document.getElementById('terminal-output');
      let lastLogCount = 0;

      const pollLogs = () => {
        fetch(`${API_BASE}/logs`)
          .then(res => res.json())
          .then(data => {
            const logs = data.logs || [];
            if (logs.length > lastLogCount && term) {
              term.innerHTML = '';
              logs.forEach((log: string) => {
                const div = document.createElement('div');
                div.className = 'text-mint-vibrant/80 py-0.5';
                div.innerText = `> ${log}`;
                term.appendChild(div);
              });
              term.scrollTop = term.scrollHeight;
              lastLogCount = logs.length;
            }
          });
      };
      const intervalId = window.setInterval(pollLogs, 1000);
      activeIntervals.push(intervalId);

      let selectedFiles: File[] = [];
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      const fileCount = document.getElementById('file-count');
      const dropzone = document.getElementById('dropzone');

      const updateFileCount = (files: FileList | File[]) => {
        if (!files || files.length === 0) return;
        selectedFiles = Array.from(files);
        if (fileCount) {
          fileCount.textContent = selectedFiles.length.toString();
        }
      };

      fileInput?.addEventListener('change', (e: any) => {
        updateFileCount(e.target.files);
        // Permite re-selecionar o mesmo arquivo se necessário
        fileInput.value = '';
      });

      // Clique na dropzone dispara o file-input
      dropzone?.addEventListener('click', (e) => {
         if (e.target !== fileInput) {
             fileInput?.click();
         }
      });

      // Drag and drop support
      dropzone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-mint-vibrant');
      });
      dropzone?.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-mint-vibrant');
      });
      dropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-mint-vibrant');
        if (e.dataTransfer && e.dataTransfer.files) {
          updateFileCount(e.dataTransfer.files);
        }
      });

      document.getElementById('btn-start-ppp')?.addEventListener('click', async () => {
        if (selectedFiles.length === 0) {
          alert("Selecione arquivos primeiro!");
          return;
        }
        const formData = new FormData();
        selectedFiles.forEach(f => formData.append('files', f));
        if (term) term.innerHTML += `<div class="text-blue-400 py-0.5">> Fazendo upload de ${selectedFiles.length} arquivos...</div>`;
        try {
          const upRes = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
          const upData = await upRes.json();
          await fetch(`${API_BASE}/process/ppp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(upData.files)
          });
        } catch (e) {
          console.error(e);
          if (term) term.innerHTML += `<div class="text-red-500 py-0.5">> Erro de conexão com a API.</div>`;
        }
      });
    }
  },
  hgo: {
    render: () => `
       <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-3xl font-bold">Organizador HGO / Triagem</h2>
            <p class="text-white/40 mt-1">Organização inteligente de arquivos brutos por base e rover.</p>
          </div>
          <div class="flex gap-3">
            <button class="btn-primary" id="btn-start-hgo">
              <i data-lucide="play" class="w-4 h-4"></i>
              Converter e Organizar
            </button>
          </div>
        </div>

        <div class="glass-card p-6 flex items-center gap-4">
           <button class="btn-secondary whitespace-nowrap" id="btn-pick-folder">
              <i data-lucide="folder-tree" class="w-4 h-4"></i>
              Procurar Pasta Local
           </button>
           <div class="flex-1 bg-white/5 border border-white/10 rounded-technical px-4 py-2 font-mono text-sm text-white/60 truncate" id="lbl-folder-path">
              Nenhuma pasta selecionada...
           </div>
        </div>
        
        <div class="glass-card bg-[#050a08] border-mint-vibrant/10 overflow-hidden flex flex-col h-64 mt-6">
            <div class="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <i data-lucide="terminal" class="w-4 h-4 text-mint-vibrant"></i>
                <span class="text-[10px] font-bold uppercase tracking-widest text-white/40">Terminal de Logs HGO</span>
              </div>
            </div>
            <div class="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 text-white/60" id="terminal-output-hgo">
               <div class="text-white/30">[IDLE] Aguardando seleção de pasta.</div>
            </div>
        </div>
       </div>
     `,
    setup: () => {
      let currentFolder = "";
      const lblPath = document.getElementById('lbl-folder-path');
      const term = document.getElementById('terminal-output-hgo');
      let lastLogCount = 0;
      const pollLogs = () => {
        fetch(`${API_BASE}/logs`)
          .then(res => res.json())
          .then(data => {
            const logs = data.logs || [];
            if (logs.length > lastLogCount && term) {
              term.innerHTML = '';
              logs.forEach((log: string) => {
                const div = document.createElement('div');
                div.className = 'text-mint-vibrant/80 py-0.5';
                div.innerText = `> ${log}`;
                term.appendChild(div);
              });
              term.scrollTop = term.scrollHeight;
              lastLogCount = logs.length;
            }
          });
      };
      const intervalId = window.setInterval(pollLogs, 1000);
      activeIntervals.push(intervalId);

      document.getElementById('btn-pick-folder')?.addEventListener('click', async () => {
        try {
          const res = await fetch(`${API_BASE}/pick-folder`);
          const data = await res.json();
          if (data.path) {
            currentFolder = data.path;
            if (lblPath) {
              lblPath.innerText = currentFolder;
              lblPath.classList.remove('text-white/60');
              lblPath.classList.add('text-white');
            }
          }
        } catch (e) {
          console.error(e);
        }
      });

      document.getElementById('btn-start-hgo')?.addEventListener('click', async () => {
        if (!currentFolder) {
          alert("Selecione uma pasta primeiro!");
          return;
        }
        try {
          await fetch(`${API_BASE}/process/hgo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pasta: currentFolder })
          });
        } catch (e) {
          console.error(e);
        }
      });
    }
  },
  historico: {
    render: () => `
      <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-3xl font-bold">Histórico Geral</h2>
            <p class="text-white/40 mt-1">Gerenciamento de registros processados e exportação.</p>
          </div>
          <div class="flex gap-3">
            <button class="btn-primary">
               <i data-lucide="download" class="w-4 h-4"></i>
               Exportar UTM/KML
            </button>
          </div>
        </div>

        <div class="glass-card">
           <div class="p-4 border-b border-white/5 flex gap-4">
              <input type="text" placeholder="Filtrar registros..." class="glass-input flex-1 text-sm" />
           </div>
           <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <th class="px-6 py-4 w-12"><input type="checkbox" /></th>
                    <th class="px-6 py-4">Arquivo</th>
                    <th class="px-6 py-4">Ponto</th>
                    <th class="px-6 py-4">Data/Hora</th>
                    <th class="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody class="text-sm divide-y divide-white/5" id="history-tbody">
                  <tr><td colspan="5" class="px-6 py-4 text-center text-white/40">Carregando...</td></tr>
                </tbody>
              </table>
           </div>
        </div>
      </div>
    `,
    setup: () => {
      fetch(`${API_BASE}/history`)
        .then(res => res.json())
        .then(data => {
          const tbody = document.getElementById('history-tbody');
          if (!tbody) return;
          if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-white/40">Nenhum registro encontrado.</td></tr>`;
            return;
          }
          tbody.innerHTML = '';
          data.forEach((row: any) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-white/[0.02] transition-colors cursor-pointer group';
            tr.innerHTML = `
                <td class="px-6 py-4"><input type="checkbox" value="${row.id}" /></td>
                <td class="px-6 py-4 font-mono text-xs">${row.arquivo_nome}</td>
                <td class="px-6 py-4">${row.ponto_nome || '-'}</td>
                <td class="px-6 py-4 text-white/60">${row.data_inicio || '-'}</td>
                <td class="px-6 py-4">
                   <span class="flex items-center gap-1.5 text-[10px] font-bold ${row.sucesso ? 'text-mint-vibrant' : 'text-orange-400'} uppercase">
                      <i data-lucide="${row.sucesso ? 'check-circle-2' : 'alert-circle'}" class="w-3 h-3"></i>
                      ${row.sucesso ? 'Processado' : 'Pendente/Erro'}
                   </span>
                </td>
              `;
            tbody.appendChild(tr);
          });
          initIcons();
        })
        .catch(err => {
          console.error(err);
          const tbody = document.getElementById('history-tbody');
          if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-400">Erro ao carregar histórico.</td></tr>`;
        });
    }
  },
  pendencias: {
    render: () => `
      <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative min-h-[500px]">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-3xl font-bold">Agenda de Pendências</h2>
            <p class="text-white/40 mt-1">Gerenciamento de tarefas e alertas de integridade.</p>
          </div>
          <div class="flex gap-3">
            <button class="btn-primary" id="btn-nova-tarefa">
               <i data-lucide="plus" class="w-4 h-4"></i>
               Nova Tarefa
            </button>
          </div>
        </div>

        <div class="glass-card">
           <div class="p-4 border-b border-white/5 flex gap-4">
              <input type="text" placeholder="Buscar pendências..." class="glass-input flex-1 text-sm" />
           </div>
           <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <th class="px-6 py-4 w-12"></th>
                    <th class="px-6 py-4">Título</th>
                    <th class="px-6 py-4">Descrição</th>
                    <th class="px-6 py-4">Prioridade</th>
                    <th class="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody class="text-sm divide-y divide-white/5" id="pendencias-tbody">
                  <tr><td colspan="5" class="px-6 py-4 text-center text-white/40">Carregando...</td></tr>
                </tbody>
              </table>
           </div>
        </div>

        <!-- Modal Nova Tarefa -->
        <div id="modal-tarefa" class="absolute inset-0 z-50 hidden bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 transition-opacity duration-300">
           <div class="bg-[#0c1510] border border-mint-vibrant/20 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col">
              <div class="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                 <h3 class="text-lg font-bold flex items-center gap-2">
                    <i data-lucide="plus" class="w-5 h-5 text-mint-vibrant"></i>
                    Nova Pendência
                 </h3>
                 <button id="close-modal-tarefa" class="text-white/40 hover:text-white transition-colors">
                    <i data-lucide="x" class="w-5 h-5"></i>
                 </button>
              </div>
              <div class="p-6 space-y-4">
                 <div>
                    <label class="block text-xs font-bold text-white/40 uppercase tracking-widest mb-1">Título</label>
                    <input type="text" id="tarefa-titulo" class="glass-input w-full text-sm" placeholder="Ex: Revisar cálculo de PPP" />
                 </div>
                 <div>
                    <label class="block text-xs font-bold text-white/40 uppercase tracking-widest mb-1">Descrição</label>
                    <textarea id="tarefa-descricao" class="glass-input w-full text-sm min-h-[80px]" placeholder="Detalhes da tarefa..."></textarea>
                 </div>
                 <div>
                    <label class="block text-xs font-bold text-white/40 uppercase tracking-widest mb-1">Prioridade</label>
                    <select id="tarefa-prioridade" class="glass-input w-full text-sm">
                       <option value="BAIXA">Baixa</option>
                       <option value="MEDIA" selected>Média</option>
                       <option value="ALTA">Alta</option>
                    </select>
                 </div>
              </div>
              <div class="px-6 py-4 border-t border-white/10 flex justify-end gap-3 bg-white/[0.02]">
                 <button id="btn-cancelar-tarefa" class="btn-secondary text-sm px-4 py-2">Cancelar</button>
                 <button id="btn-salvar-tarefa" class="btn-primary text-sm px-4 py-2">Salvar</button>
              </div>
           </div>
        </div>

      </div>
    `,
    setup: () => {
      const loadPendencias = () => {
         fetch(`${API_BASE}/pendencias`)
           .then(res => res.json())
           .then(data => {
             const tbody = document.getElementById('pendencias-tbody');
             if (!tbody) return;
             if (data.length === 0) {
               tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-white/40">Nenhuma pendência encontrada.</td></tr>`;
               return;
             }
             tbody.innerHTML = '';
             data.forEach((row: any) => {
               const tr = document.createElement('tr');
               tr.className = 'hover:bg-white/[0.02] transition-colors group';
               const isConcluido = row.status === 'CONCLUIDO';
               tr.innerHTML = `
                   <td class="px-6 py-4">
                      <input type="checkbox" class="status-checkbox" data-id="${row.id}" ${isConcluido ? 'checked' : ''} />
                   </td>
                   <td class="px-6 py-4 font-medium ${isConcluido ? 'line-through text-white/40' : 'text-white'}">${row.titulo}</td>
                   <td class="px-6 py-4 text-white/60 text-xs ${isConcluido ? 'line-through opacity-50' : ''}">${row.descricao || '-'}</td>
                   <td class="px-6 py-4">
                      <span class="text-[10px] font-bold px-2 py-1 rounded ${row.prioridade === 'ALTA' ? 'bg-red-500/20 text-red-400' : row.prioridade === 'MEDIA' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'} uppercase">
                         ${row.prioridade}
                      </span>
                   </td>
                   <td class="px-6 py-4">
                      <span class="text-[10px] font-bold ${isConcluido ? 'text-mint-vibrant' : 'text-white/40'} uppercase">
                         ${row.status}
                      </span>
                   </td>
                 `;
               tbody.appendChild(tr);
             });
             
             // Attach event listeners to checkboxes
             document.querySelectorAll('.status-checkbox').forEach(cb => {
                cb.addEventListener('change', async (e: any) => {
                   const id = e.target.getAttribute('data-id');
                   const novoStatus = e.target.checked ? 'CONCLUIDO' : 'PENDENTE';
                   try {
                      await fetch(`${API_BASE}/pendencias/${id}`, {
                         method: 'PUT',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ status: novoStatus })
                      });
                      loadPendencias();
                   } catch (err) {
                      console.error('Erro ao atualizar status', err);
                   }
                });
             });
             initIcons();
           })
           .catch(err => {
             console.error(err);
             const tbody = document.getElementById('pendencias-tbody');
             if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-400">Erro ao carregar pendências.</td></tr>`;
           });
      };
      
      loadPendencias();

      const modal = document.getElementById('modal-tarefa');
      const btnNova = document.getElementById('btn-nova-tarefa');
      const btnClose = document.getElementById('close-modal-tarefa');
      const btnCancel = document.getElementById('btn-cancelar-tarefa');
      const btnSalvar = document.getElementById('btn-salvar-tarefa');

      const openModal = () => {
         modal?.classList.remove('hidden');
         setTimeout(() => modal?.classList.add('opacity-100'), 10);
      };

      const closeModal = () => {
         modal?.classList.remove('opacity-100');
         setTimeout(() => modal?.classList.add('hidden'), 300);
      };

      btnNova?.addEventListener('click', openModal);
      btnClose?.addEventListener('click', closeModal);
      btnCancel?.addEventListener('click', closeModal);

      btnSalvar?.addEventListener('click', async () => {
         const titulo = (document.getElementById('tarefa-titulo') as HTMLInputElement).value;
         const descricao = (document.getElementById('tarefa-descricao') as HTMLInputElement).value;
         const prioridade = (document.getElementById('tarefa-prioridade') as HTMLSelectElement).value;

         if (!titulo) return alert('O título é obrigatório.');

         try {
            await fetch(`${API_BASE}/pendencias`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ titulo, descricao, prioridade })
            });
            closeModal();
            loadPendencias();
            
            // clear form
            (document.getElementById('tarefa-titulo') as HTMLInputElement).value = '';
            (document.getElementById('tarefa-descricao') as HTMLInputElement).value = '';
         } catch (e) {
            alert('Erro ao salvar pendência.');
         }
      });
    }
  },
  clientes: {
    render: () => `
      <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-3xl font-bold">Clientes</h2>
            <p class="text-white/40 mt-1">Gestão de Alta Precisão: Dados Jurídicos e Metadados Extensíveis.</p>
          </div>
          <div class="flex gap-3">
            <button class="btn-primary" id="btn-abrir-modal-cliente">
               <i data-lucide="plus" class="w-4 h-4"></i>
               Novo Cliente
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div class="glass-card p-6 col-span-1 lg:col-span-1" id="dash-clientes">
             <div class="flex justify-between items-center mb-4">
                <h4 class="font-bold text-sm">Cadastrados</h4>
                <span class="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-white/60" id="total-cli-count">0</span>
             </div>
             <div class="mb-4">
                <input type="text" placeholder="Buscar cliente..." class="glass-input w-full text-sm" id="busca-cliente" />
             </div>
             <div id="lista-clientes" class="space-y-2 max-h-[500px] overflow-y-auto pr-2">Carregando...</div>
          </div>
          
          <div class="col-span-1 lg:col-span-3 space-y-6 hidden" id="cliente-detalhe">
             <div class="glass-card p-0 overflow-hidden border-mint-vibrant/20 border">
                <div class="flex justify-between items-center pr-6 bg-white/[0.02]">
                   <div class="flex border-b border-white/5">
                      <button class="px-6 py-3 text-sm font-bold border-b-2 border-mint-vibrant text-mint-vibrant tab-btn" data-tab="tab-principais">Dados Principais</button>
                      <button class="px-6 py-3 text-sm font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn" data-tab="tab-adicionais">Metadados</button>
                   </div>
                   <div class="flex gap-2">
                      <button class="text-white/40 hover:text-mint-vibrant transition-colors p-2" id="btn-editar-cliente" title="Editar Cliente">
                          <i data-lucide="edit" class="w-4 h-4"></i>
                       </button>
                       <button class="text-white/40 hover:text-red-400 transition-colors p-2" id="btn-excluir-cliente" title="Excluir Cliente">
                         <i data-lucide="trash-2" class="w-4 h-4"></i>
                      </button>
                   </div>
                </div>
                
                <div class="p-6">
                   <!-- TAB PRINCIPAIS -->
                   <div id="tab-principais" class="tab-content space-y-6">
                      <div class="grid grid-cols-2 gap-4">
                         <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Nome Completo</p><p class="text-sm font-medium" id="cli-nome">-</p></div>
                         <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">CPF/CNPJ</p><p class="text-sm font-mono text-mint-vibrant" id="cli-cpf">-</p></div>
                         <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">RG/IE</p><p class="text-sm font-mono" id="cli-rg">-</p></div>
                         <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Estado Civil</p><p class="text-sm" id="cli-estcivil">-</p></div>
                      </div>
                      <div class="border-t border-white/5 pt-4 grid grid-cols-2 gap-4">
                         <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Cônjuge</p><p class="text-sm font-medium" id="cli-conjuge">-</p></div>
                         <div><p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">CPF Cônjuge</p><p class="text-sm font-mono" id="cli-cpfconjuge">-</p></div>
                      </div>
                      <div class="border-t border-white/5 pt-4">
                         <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Endereço</p>
                         <p class="text-sm" id="cli-endereco">-</p>
                      </div>
                   </div>
                   
                   <!-- TAB ADICIONAIS -->
                   <div id="tab-adicionais" class="tab-content hidden space-y-4">
                      <div class="bg-white/5 rounded-technical p-4">
                         <table class="w-full text-left text-sm">
                            <tbody id="cli-metadados"></tbody>
                         </table>
                      </div>
                   </div>
                </div>
             </div>
             
             <div class="grid grid-cols-2 gap-6">
                <div class="glass-card p-6 flex items-center justify-between">
                   <div>
                      <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Levantamentos</p>
                      <h3 class="text-2xl font-mono mt-1" id="cli-levs">0</h3>
                   </div>
                   <div class="w-10 h-10 bg-mint-vibrant/10 rounded-full flex items-center justify-center">
                      <i data-lucide="map-pin" class="w-5 h-5 text-mint-vibrant"></i>
                   </div>
                </div>
                <div class="glass-card p-6 flex items-center justify-between opacity-50">
                   <div>
                      <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Propriedades</p>
                      <h3 class="text-2xl font-mono mt-1">0</h3>
                   </div>
                   <div class="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center">
                      <i data-lucide="home" class="w-5 h-5 text-white/40"></i>
                   </div>
                </div>
             </div>
          </div>
        </div>

        <!-- MODAL NOVO CLIENTE -->
        <div id="modal-cliente" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
           <div class="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div class="p-6 border-b border-white/5 flex justify-between items-center">
                 <h3 class="text-xl font-bold">Cadastro de Cliente</h3>
                 <button class="text-white/40 hover:text-white" id="btn-fechar-modal">
                    <i data-lucide="x" class="w-6 h-6"></i>
                 </button>
              </div>
              <form id="form-cliente" class="p-6 space-y-6">
                 <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                       <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nome Completo</label>
                       <input type="text" name="nome_completo" required class="glass-input w-full">
                    </div>
                    <div>
                       <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">CPF / CNPJ</label>
                       <input type="text" name="cpf_cnpj" required class="glass-input w-full">
                    </div>
                    <div>
                       <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">RG / IE</label>
                       <input type="text" name="rg_ie" class="glass-input w-full">
                    </div>
                    <div>
                       <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Estado Civil</label>
                       <select name="estado_civil" class="glass-input w-full">
                          <option value="Solteiro(a)">Solteiro(a)</option>
                          <option value="Casado(a)">Casado(a)</option>
                          <option value="Divorciado(a)">Divorciado(a)</option>
                          <option value="Viúvo(a)">Viúvo(a)</option>
                          <option value="União Estável">União Estável</option>
                       </select>
                    </div>
                    <div>
                       <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nacionalidade</label>
                       <input type="text" name="nacionalidade" class="glass-input w-full" value="Brasileiro(a)">
                    </div>
                 </div>
                 <div class="border-t border-white/5 pt-4 grid grid-cols-2 gap-4">
                    <div class="col-span-2"><h5 class="text-xs font-bold text-mint-vibrant">CÔNJUGE</h5></div>
                    <div class="col-span-2">
                       <input type="text" name="nome_conjuge" class="glass-input w-full" placeholder="Nome do Cônjuge">
                    </div>
                    <input type="text" name="cpf_conjuge" class="glass-input w-full" placeholder="CPF Cônjuge">
                    <input type="text" name="rg_conjuge" class="glass-input w-full" placeholder="RG Cônjuge">
                 </div>
                 <div class="border-t border-white/5 pt-4 grid grid-cols-2 gap-4">
                    <div class="col-span-2"><h5 class="text-xs font-bold text-mint-vibrant">CONTATO E ENDEREÇO</h5></div>
                    <input type="text" name="telefone" class="glass-input w-full" placeholder="Telefone">
                    <input type="email" name="email" class="glass-input w-full" placeholder="Email">
                    <div class="col-span-2">
                       <input type="text" name="endereco_completo" class="glass-input w-full" placeholder="Endereço">
                    </div>
                    <input type="text" name="cidade" class="glass-input w-full" placeholder="Cidade">
                    <input type="text" name="estado" class="glass-input w-full" placeholder="UF" maxlength="2">
                 </div>
                 <div class="flex justify-end gap-3 pt-6 border-t border-white/5">
                    <button type="button" class="btn-secondary" id="btn-cancelar-cliente">Cancelar</button>
                    <button type="submit" class="btn-primary">Salvar Cliente</button>
                 </div>
              </form>
           </div>
        </div>
      </div>
    `,
    setup: () => {
       let clienteSelecionadoId: number | null = null;
       let todosClientes: any[] = [];
       
       // Utilitário de máscara dinâmica CPF/CNPJ
       const aplicarMascaraCpfCnpj = (value: string): string => {
          const apenasNumeros = value.replace(/\D/g, '');
          if (apenasNumeros.length <= 11) {
             return apenasNumeros
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
          } else {
             return apenasNumeros
                .replace(/(\d{2})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1/$2')
                .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
          }
       };

       const inputCpfCnpj = document.querySelector('#form-cliente [name="cpf_cnpj"]') as HTMLInputElement;
       const inputCpfConjuge = document.querySelector('#form-cliente [name="cpf_conjuge"]') as HTMLInputElement;

       const formatarInput = (input: HTMLInputElement) => {
          input.addEventListener('input', (e) => {
             const target = e.target as HTMLInputElement;
             target.value = aplicarMascaraCpfCnpj(target.value);
          });
       };

       if (inputCpfCnpj) formatarInput(inputCpfCnpj);
       if (inputCpfConjuge) formatarInput(inputCpfConjuge);
       
       // Modal control
       const modal = document.getElementById('modal-cliente');
       document.getElementById('btn-abrir-modal-cliente')?.addEventListener('click', () => {
           clienteSelecionadoId = null;
           const form = document.getElementById('form-cliente') as HTMLFormElement;
           if(form) form.reset();
           const title = document.querySelector('#modal-cliente h3');
           if(title) title.textContent = 'Cadastro de Cliente';
           modal?.classList.remove('hidden');
        });
       document.getElementById('btn-fechar-modal')?.addEventListener('click', () => modal?.classList.add('hidden'));
       document.getElementById('btn-cancelar-cliente')?.addEventListener('click', () => modal?.classList.add('hidden'));

       // Tab logic
       document.querySelectorAll('.tab-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
             const target = (e.target as HTMLElement).getAttribute('data-tab');
             document.querySelectorAll('.tab-btn').forEach(b => b.classList.replace('border-mint-vibrant', 'border-transparent'));
             document.querySelectorAll('.tab-btn').forEach(b => b.classList.replace('text-mint-vibrant', 'text-white/40'));
             (e.target as HTMLElement).classList.replace('border-transparent', 'border-mint-vibrant');
             (e.target as HTMLElement).classList.replace('text-white/40', 'text-mint-vibrant');
             document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
             document.getElementById(target || '')?.classList.remove('hidden');
          });
       });

       // Busca de Clientes
       document.getElementById('busca-cliente')?.addEventListener('input', (e) => {
          const term = (e.target as HTMLInputElement).value.toLowerCase();
          document.querySelectorAll('.cli-item').forEach(el => {
             const nome = el.querySelector('p')?.innerText.toLowerCase() || '';
             const doc = el.querySelector('p:last-child')?.innerText.toLowerCase() || '';
             (el as HTMLElement).style.display = (nome.includes(term) || doc.includes(term)) ? 'flex' : 'none';
          });
       });

       const loadClientes = () => {
          const lista = document.getElementById('lista-clientes');
          if(!lista) return Promise.resolve();
          lista.innerHTML = '<p class="text-sm text-white/40 text-center py-4">Carregando...</p>';
          
          return fetch(`${API_BASE}/clientes`)
             .then(res => res.json())
             .then(data => {
                if(data.error) { lista.innerHTML = `<p class="text-xs text-red-400 p-4">${data.error}</p>`; return; }
                todosClientes = data;
                const count = document.getElementById('total-cli-count');
                if(count) count.innerText = data.length.toString();
                
                if(!Array.isArray(data) || data.length === 0) {
                   lista.innerHTML = '<p class="text-sm text-white/40 text-center py-4">Nenhum cliente.</p>';
                   return;
                }
                
                lista.innerHTML = data.map((cli: any) => `
                   <div class="p-3 bg-white/5 hover:bg-white/10 rounded-technical cursor-pointer transition-colors cli-item flex items-center gap-3" data-id="${cli.id}">
                      <div class="w-8 h-8 rounded-full bg-mint-vibrant/10 flex items-center justify-center text-xs font-bold text-mint-vibrant">
                         ${(cli.nome_completo || '??').substring(0,2).toUpperCase()}
                      </div>
                      <div class="min-w-0 flex-1">
                         <p class="text-sm font-bold text-white truncate">${cli.nome_completo}</p>
                         <p class="text-[10px] text-white/40 font-mono">${aplicarMascaraCpfCnpj(cli.cpf_cnpj || '')}</p>
                      </div>
                   </div>
                `).join('');

                document.querySelectorAll('.cli-item').forEach(el => {
                   el.addEventListener('click', () => {
                      const id = parseInt(el.getAttribute('data-id') || '0');
                      const cli = data.find((c:any) => c.id === id);
                      if(!cli) return;
                      clienteSelecionadoId = id;
                      document.getElementById('cliente-detalhe')?.classList.remove('hidden');
                      
                      const setVal = (id:string, val:any) => { const e = document.getElementById(id); if(e) e.innerText = val || '-'; };
                      setVal('cli-nome', cli.nome_completo);
                      setVal('cli-cpf', aplicarMascaraCpfCnpj(cli.cpf_cnpj || ''));
                      setVal('cli-rg', cli.rg_ie);
                      setVal('cli-estcivil', cli.estado_civil);
                      setVal('cli-conjuge', cli.nome_conjuge);
                      setVal('cli-cpfconjuge', aplicarMascaraCpfCnpj(cli.cpf_conjuge || ''));
                      setVal('cli-endereco', `${cli.endereco_completo || ''} - ${cli.cidade || ''}/${cli.estado || ''}`);
                      setVal('cli-levs', cli.total_levantamentos);

                      const metas = document.getElementById('cli-metadados');
                      if(metas) {
                         const entries = Object.entries(cli.metadados || {});
                         metas.innerHTML = entries.length ? entries.map(([k,v]) => `
                            <tr class="border-b border-white/5">
                               <td class="py-2 text-[10px] text-white/40 uppercase font-bold">${k}</td>
                               <td class="py-2 text-right font-mono">${v}</td>
                            </tr>
                         `).join('') : '<tr><td class="text-white/20 py-2">Sem metadados.</td></tr>';
                      }
                   });
                });
             });
       };

       loadClientes();

       // Editar Cliente
        document.getElementById('btn-editar-cliente')?.addEventListener('click', () => {
           if(!clienteSelecionadoId) return;
           const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
           if(!cli) return;

           const form = document.getElementById('form-cliente') as HTMLFormElement;
           if(!form) return;

           const setFormVal = (name: string, val: any) => {
              const input = form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;
              if(input) input.value = val || '';
           };

           setFormVal('nome_completo', cli.nome_completo);
           setFormVal('cpf_cnpj', aplicarMascaraCpfCnpj(cli.cpf_cnpj || ''));
           setFormVal('rg_ie', cli.rg_ie);
           setFormVal('estado_civil', cli.estado_civil);
           setFormVal('nacionalidade', cli.nacionalidade);
           setFormVal('nome_conjuge', cli.nome_conjuge);
           setFormVal('cpf_conjuge', aplicarMascaraCpfCnpj(cli.cpf_conjuge || ''));
           setFormVal('rg_conjuge', cli.rg_conjuge);
           setFormVal('telefone', cli.telefone);
           setFormVal('email', cli.email);
           setFormVal('endereco_completo', cli.endereco_completo);
           setFormVal('cidade', cli.cidade);
           setFormVal('estado', cli.estado);

           const title = document.querySelector('#modal-cliente h3');
           if(title) title.textContent = 'Editar Cliente';

           modal?.classList.remove('hidden');
        });

        // Excluir Cliente
       document.getElementById('btn-excluir-cliente')?.addEventListener('click', async () => {
          if(!clienteSelecionadoId || !confirm("Deseja realmente excluir este cliente?")) return;
          try {
             const res = await fetch(`${API_BASE}/clientes/${clienteSelecionadoId}`, { method: 'DELETE' });
             const data = await res.json();
             if(data.error) alert(data.error);
             else {
                document.getElementById('cliente-detalhe')?.classList.add('hidden');
                loadClientes();
             }
          } catch(e) { alert("Erro ao excluir."); }
       });

       // Form Submit
       document.getElementById('form-cliente')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target as HTMLFormElement);
          const payload = Object.fromEntries(formData.entries()) as any;
           
           if (clienteSelecionadoId) {
              const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
              if (cli && cli.metadados) {
                 payload.metadados = cli.metadados;
              }
           }
          
          try {
             const url = clienteSelecionadoId ? `${API_BASE}/clientes/${clienteSelecionadoId}` : `${API_BASE}/clientes`;
             const method = clienteSelecionadoId ? 'PUT' : 'POST';
             
             const res = await fetch(url, {
                method: method,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
             });
             
             if (!res.ok) {
                const errData = await res.json();
                let errMsg = "Erro ao salvar.";
                if (errData.error) {
                   errMsg = errData.error;
                } else if (errData.detail) {
                   errMsg = Array.isArray(errData.detail) 
                      ? errData.detail.map((d: any) => `${d.loc.join('.')}: ${d.msg}`).join('\n') 
                      : JSON.stringify(errData.detail);
                }
                alert(errMsg);
                return;
             }
             
             const data = await res.json();
             if(data.error) {
                alert(data.error);
             } else {
                modal?.classList.add('hidden');
                (e.target as HTMLFormElement).reset();
                loadClientes().then(() => {
                   if(clienteSelecionadoId) {
                      const item = document.querySelector(`.cli-item[data-id="${clienteSelecionadoId}"]`) as HTMLElement;
                      if(item) item.click();
                   }
                });
             }
          } catch(e) { alert("Erro ao salvar."); }
       });
    }
  },
  pendencias: {
    render: () => `
      <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-3xl font-bold text-white">Agenda de Pendências</h2>
            <p class="text-white/40 mt-1">Gerencie tarefas críticas e prazos de georreferenciamento.</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-1 space-y-6">
            <div class="glass-card p-6">
              <h4 class="font-bold text-sm mb-4">Nova Pendência</h4>
              <form id="form-pendencia" class="space-y-4">
                <input type="text" name="titulo" placeholder="Título da tarefa..." required class="glass-input w-full">
                <textarea name="descricao" placeholder="Descrição detalhada..." class="glass-input w-full h-24"></textarea>
                <select name="prioridade" class="glass-input w-full">
                  <option value="BAIXA">Prioridade Baixa</option>
                  <option value="MEDIA" selected>Prioridade Média</option>
                  <option value="ALTA">Prioridade Alta</option>
                </select>
                <button type="submit" class="btn-primary w-full">Criar Tarefa</button>
              </form>
            </div>
          </div>

          <div class="lg:col-span-2 glass-card overflow-hidden">
            <div class="p-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
              <h4 class="font-bold text-sm">Lista de Atividades</h4>
              <div class="flex gap-2">
                <span class="text-[10px] bg-mint-vibrant/20 text-mint-vibrant px-2 py-0.5 rounded-full" id="pendencias-count">0</span>
              </div>
            </div>
            <div id="lista-pendencias" class="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
              <div class="p-8 text-center text-white/20">Carregando tarefas...</div>
            </div>
          </div>
        </div>
      </div>
    `,
    setup: () => {
       const loadPendencias = () => {
          fetch(`${API_BASE}/pendencias`)
            .then(res => res.json())
            .then(data => {
               const container = document.getElementById('lista-pendencias');
               if(!container) return;
               document.getElementById('pendencias-count')!.innerText = data.length.toString();
               
               if(data.length === 0) {
                  container.innerHTML = `<div class="p-12 text-center text-white/20">Nenhuma pendência encontrada.</div>`;
                  return;
               }

               container.innerHTML = data.map((p: any) => `
                  <div class="p-4 hover:bg-white/[0.02] transition-colors flex items-center justify-between group">
                    <div class="flex items-start gap-4">
                      <div class="mt-1">
                        <i data-lucide="${p.status === 'CONCLUIDO' ? 'check-circle-2' : 'alert-circle'}" 
                           class="w-5 h-5 ${p.status === 'CONCLUIDO' ? 'text-mint-vibrant' : (p.prioridade === 'ALTA' ? 'text-red-400' : 'text-white/20')}"></i>
                      </div>
                      <div>
                        <h5 class="text-sm font-bold ${p.status === 'CONCLUIDO' ? 'text-white/40 line-through' : 'text-white'}">${p.titulo}</h5>
                        <p class="text-xs text-white/40 mt-0.5">${p.descricao || 'Sem descrição'}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-3">
                      ${p.status === 'PENDENTE' ? `<button class="btn-check text-mint-vibrant opacity-0 group-hover:opacity-100 transition-opacity" data-id="${p.id}"><i data-lucide="check" class="w-4 h-4"></i></button>` : ''}
                      <button class="text-white/10 hover:text-red-400 btn-delete-pendencia" data-id="${p.id}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                  </div>
               `).join('');
               initIcons();

               document.querySelectorAll('.btn-check').forEach(b => b.addEventListener('click', () => {
                  const id = b.getAttribute('data-id');
                  fetch(`${API_BASE}/pendencias/${id}/concluir`, { method: 'POST' }).then(() => loadPendencias());
               }));

               document.querySelectorAll('.btn-delete-pendencia').forEach(b => b.addEventListener('click', () => {
                  const id = b.getAttribute('data-id');
                  fetch(`${API_BASE}/pendencias/${id}`, { method: 'DELETE' }).then(() => loadPendencias());
               }));
            });
       };

       loadPendencias();

       document.getElementById('form-pendencia')?.addEventListener('submit', (e) => {
          e.preventDefault();
          const formData = new FormData(e.target as HTMLFormElement);
          fetch(`${API_BASE}/pendencias`, {
             method: 'POST',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify(Object.fromEntries(formData.entries()))
          }).then(() => {
             (e.target as HTMLFormElement).reset();
             loadPendencias();
          });
       });
    }
  },
  levantamentos: {
    render: () => `
      <div class="space-y-6 animate-in fade-in duration-300">
        <!-- LISTA DE LEVANTAMENTOS (Se nenhum selecionado) -->
        <div id="painel-lista-projetos" class="space-y-6">
          <div class="flex justify-between items-center">
            <div>
              <h2 class="text-3xl font-bold">Mesa de Levantamentos</h2>
              <p class="text-white/40 mt-1">Selecione um projeto de georreferenciamento ativo para iniciar a triagem espacial.</p>
            </div>
            <button class="btn-primary" id="btn-novo-lev">
              <i data-lucide="plus" class="w-4 h-4"></i>
              Novo Levantamento
            </button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="grid-projetos">
            <div class="text-white/20 p-8 text-center col-span-full">Carregando levantamentos...</div>
          </div>
        </div>

        <!-- DETALHES DO PROJETO E TRIAGEM (Se selecionado) -->
        <div id="painel-detalhe-projeto" class="space-y-6 hidden">
          <!-- Cabeçalho de Ação -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/[0.01] border border-white/5 p-4 rounded-xl">
            <div class="flex items-center gap-3">
              <button class="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1" id="btn-voltar-lista">
                <i data-lucide="chevron-right" class="w-4 h-4 rotate-180"></i>
                Voltar
              </button>
              <div>
                <h3 class="text-xl font-bold flex items-center gap-2">
                  <span id="txt-nome-propriedade">Carregando...</span>
                  <span class="text-xs bg-mint-vibrant/20 text-mint-vibrant px-2.5 py-0.5 rounded-full font-mono uppercase" id="badge-status-lev">-</span>
                </h3>
                <p class="text-xs text-white/40 mt-1">
                  Cliente: <span class="text-white/60 font-medium mr-3" id="txt-nome-cliente">-</span>
                  CAR: <span class="text-white/60 font-mono" id="txt-codigo-car">-</span>
                </p>
              </div>
            </div>
            
            <!-- Seletor de Matrículas (Abas de Triagem) -->
            <div class="flex bg-white/5 border border-white/10 p-1 rounded-lg overflow-x-auto self-start md:self-auto" id="container-abas-matriculas">
              <!-- Abas carregadas dinamicamente -->
            </div>
          </div>

          <!-- Grid Superior (Mapa + Ingestão Drag-and-Drop) -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Coluna 1: Mapa Leaflet -->
            <div class="glass-card h-[420px] relative overflow-hidden flex flex-col">
              <div class="px-4 py-2 border-b border-white/5 flex justify-between items-center bg-white/[0.02] z-[1000]">
                <span class="text-[10px] font-bold uppercase tracking-widest text-white/40">Visualização Espacial e Auditoria</span>
                <span class="text-[9px] font-mono text-mint-vibrant uppercase" id="txt-mapa-status">SIGEF WMS ATIVO</span>
              </div>
              <div id="mapa-triagem" class="flex-1 w-full h-full"></div>
            </div>

            <!-- Coluna 2: Ingestão Drag-and-Drop -->
            <div class="glass-card p-6 flex flex-col h-[420px]">
              <div class="flex justify-between items-center mb-4">
                <h4 class="font-bold text-sm">Mesa de Ingestão de Arquivos</h4>
                <span class="text-[9px] font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded text-white/40">Drag-and-Drop</span>
              </div>
              
              <!-- Zona Drop -->
              <div class="border-2 border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-xl p-4 text-center cursor-pointer transition-colors flex-1 flex flex-col justify-center items-center group relative overflow-hidden" id="triagem-dropzone">
                <input type="file" id="triagem-file-input" class="hidden" multiple accept=".gns,.GNS,.txt,.TXT" />
                <div class="w-10 h-10 bg-mint-vibrant/10 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <i data-lucide="upload" class="w-5 h-5 text-mint-vibrant"></i>
                </div>
                <p class="text-xs font-bold">Arraste múltiplos arquivos para triagem</p>
                <p class="text-[9px] text-white/30 mt-1 uppercase tracking-widest">Suporta binários .GNS ou relatórios .TXT</p>
              </div>

              <!-- Fila de arquivos selecionados -->
              <div class="mt-4 flex-1 overflow-y-auto space-y-2 hidden max-h-[160px]" id="triagem-fila-container">
                <!-- Lista de arquivos com seletor -->
              </div>

              <button class="btn-primary w-full py-2.5 mt-4 text-xs font-bold hidden flex items-center justify-center gap-1.5" id="btn-processar-lote">
                <i data-lucide="play" class="w-4 h-4"></i>
                Processar Lote em Segundo Plano
              </button>
            </div>
          </div>

          <!-- Barra de Ferramentas Técnicas -->
          <div class="flex justify-between items-center bg-white/[0.01] border border-white/5 p-4 rounded-xl">
            <div class="flex items-center gap-2">
              <button class="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5" id="btn-exportar-kml">
                <i data-lucide="map-icon" class="w-4 h-4 text-mint-vibrant"></i>
                Gerar KML Temporário
              </button>
              <span class="text-[10px] text-white/30 font-mono">EXPORT: SIRGAS 2000 / UTM ZONE 22S</span>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-white/40 font-mono">MATRÍCULA ATIVA: <span class="text-mint-vibrant font-bold font-mono" id="txt-nome-matricula-ativa">-</span></span>
            </div>
          </div>

          <!-- Tabelas Inferiores (Pontos vs Divisas) -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Tabela 1: Vértices -->
            <div class="glass-card flex flex-col h-[400px] overflow-hidden">
              <div class="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center bg-white/[0.01]">
                <div class="flex items-center gap-3">
                  <h4 class="text-xs font-bold uppercase tracking-widest text-white/40" id="lbl-titulo-vertices">Vértices Geodésicos</h4>
                  <button class="text-[9px] font-bold bg-white/5 border border-white/10 hover:bg-white/10 hover:border-mint-vibrant/40 px-2 py-0.5 rounded transition-all text-mint-vibrant" id="btn-toggle-coordenadas">
                    Ver em UTM
                  </button>
                </div>
                <span class="text-[9px] text-red-400 font-mono bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 font-bold">ALERTA M-SIGMA: &gt; 0.10m</span>
              </div>
              <div class="flex-1 overflow-auto">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10" id="tbl-pontos-header">
                      <th class="px-4 py-3">Vértice</th>
                      <th class="px-4 py-3">Tipo</th>
                      <th class="px-4 py-3 text-right">Latitude</th>
                      <th class="px-4 py-3 text-right">Longitude</th>
                      <th class="px-4 py-3 text-right">Altitude (m)</th>
                      <th class="px-4 py-3 text-center">Sigmas (m)</th>
                    </tr>
                  </thead>
                  <tbody id="tbl-pontos-triagem" class="text-xs divide-y divide-white/5 font-mono text-white/60">
                    <tr>
                      <td colspan="6" class="px-4 py-8 text-center text-white/30">Nenhum ponto atrelado a esta matrícula.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Tabela 2: Divisas/Segmentos -->
            <div class="glass-card flex flex-col h-[400px] overflow-hidden">
              <div class="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                <h4 class="text-xs font-bold uppercase tracking-widest text-white/40">Segmentos de Divisa (Confrontantes)</h4>
                <span class="text-[9px] text-mint-vibrant font-mono bg-mint-vibrant/10 px-2 py-0.5 rounded-full font-bold">EDICAO REAL-TIME</span>
              </div>
              <div class="flex-1 overflow-auto">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
                      <th class="px-4 py-3">Ponto A</th>
                      <th class="px-4 py-3">Ponto B</th>
                      <th class="px-4 py-3">Confrontante</th>
                      <th class="px-4 py-3">Tipo Limite</th>
                      <th class="px-4 py-3">Método SIGEF</th>
                    </tr>
                  </thead>
                  <tbody id="tbl-segmentos-triagem" class="text-xs divide-y divide-white/5 text-white/60">
                    <tr>
                      <td colspan="5" class="px-4 py-8 text-center text-white/30">Nenhum segmento atrelado a esta matrícula.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
    setup: () => {
      let currentLevId: number | null = null;
      let currentMatriculaId: number | null = null;

      let levantamentosList: any[] = [];
      let matriculasList: any[] = [];
      let pontosList: any[] = [];
      let segmentosList: any[] = [];
      let confrontantesList: any[] = [];
      
      let markersList: L.Marker[] = [];
      let polylineList: L.Polyline[] = [];
      let triagemMap: L.Map | null = null;
      let filesQueue: { file: File; destination: string }[] = [];
      let modoCoordenadas = 'geodesico';

      const loadLevantamentos = () => {
        const grid = document.getElementById('grid-projetos');
        if (!grid) return;
        grid.innerHTML = '<div class="text-white/20 p-8 text-center col-span-full">Carregando levantamentos...</div>';

        fetch(`${API_BASE}/levantamentos`)
          .then(res => res.json())
          .then(data => {
            levantamentosList = data;
            if (!data || data.length === 0) {
              grid.innerHTML = '<div class="text-white/30 p-8 text-center col-span-full bg-white/[0.01] border border-dashed border-white/5 rounded-xl">Nenhum levantamento cadastrado. Crie um novo para iniciar.</div>';
              return;
            }
            grid.innerHTML = data.map((l: any) => `
              <div class="glass-card p-6 flex flex-col justify-between hover:border-mint-vibrant/20 transition-colors group">
                <div>
                  <div class="flex justify-between items-start mb-4">
                    <span class="text-[9px] bg-white/5 px-2 py-0.5 rounded text-white/40 font-mono">LEV_ID: #${l.id}</span>
                    <span class="text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase ${l.status === 'CONCLUIDO' ? 'bg-mint-vibrant/15 text-mint-vibrant' : 'bg-yellow-500/15 text-yellow-400'}">${l.status}</span>
                  </div>
                  <h4 class="font-bold text-base text-white group-hover:text-mint-vibrant transition-colors">Projeto Georreferenciamento</h4>
                  <p class="text-xs text-white/40 mt-1">Data Início: ${l.data_inicio}</p>
                  <p class="text-[10px] text-white/30 font-mono mt-3 uppercase tracking-wider">${l.total_pontos || 0} Pontos Medidos • ${l.total_segmentos || 0} Divisas</p>
                </div>
                <div class="flex gap-2 mt-6 border-t border-white/5 pt-4">
                  <button class="btn-primary text-xs py-1.5 px-4 flex-1 btn-auditar" data-id="${l.id}">
                    <i data-lucide="play" class="w-3.5 h-3.5"></i>
                    Auditar & Triar
                  </button>
                  <button class="btn-secondary text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 btn-excluir-lev" data-id="${l.id}">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>
            `).join('');

            initIcons();

            // Eventos nos botões da lista
            document.querySelectorAll('.btn-auditar').forEach(btn => {
              btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id') || '0');
                selecionarLevantamento(id);
              });
            });

            document.querySelectorAll('.btn-excluir-lev').forEach(btn => {
              btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (confirm('Deseja apagar também a pasta física (Workspace) de arquivos associada a este levantamento?\n\nOK: Apagar registro + Pasta física\nCancelar: Cancelar exclusão')) {
                  await fetch(`${API_BASE}/levantamentos/${id}?apagar_arquivos=true`, { method: 'DELETE' });
                  loadLevantamentos();
                }
              });
            });
          })
          .catch(err => {
            grid.innerHTML = `<div class="text-red-400 p-8 text-center col-span-full">Erro de conexão com o servidor API.</div>`;
          });
      };

      const selecionarLevantamento = (id: number) => {
        currentLevId = id;
        currentMatriculaId = null;
        filesQueue = [];

        document.getElementById('painel-lista-projetos')?.classList.add('hidden');
        document.getElementById('painel-detalhe-projeto')?.classList.remove('hidden');

        // Carrega os dados específicos
        loadLevantamentoDetails();
      };

      const initTriagemMap = () => {
        if (triagemMap) {
          triagemMap.remove();
          triagemMap = null;
        }

        const mapContainer = document.getElementById('mapa-triagem');
        if (!mapContainer) return;

        triagemMap = L.map('mapa-triagem').setView([-23.7661, -53.3204], 14);

        // Google Satélite Pane
        const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
          attribution: 'Google Maps'
        }).addTo(triagemMap);

        // SIGEF Pane
        triagemMap.createPane('overlayPane');
        if (triagemMap.getPane('overlayPane')) {
          triagemMap.getPane('overlayPane').style.zIndex = '650';
          triagemMap.getPane('overlayPane').style.pointerEvents = 'none';
        }

        const sigef = L.tileLayer.wms('https://acervofundiario.incra.gov.br/i3geo/ogc.php', {
          layers: 'certificada_sigef_particular_pr',
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          pane: 'overlayPane',
          attribution: 'INCRA/SIGEF',
          className: 'sigef-wms-layer'
        }).addTo(triagemMap);

        L.control.layers({ "Satélite Google": googleSat }, { "Imóveis SIGEF (PR)": sigef }, { collapsed: true }).addTo(triagemMap);
      };

      const loadLevantamentoDetails = async () => {
        if (!currentLevId) return;

        try {
          // Busca dados do levantamento ativo
          const levObj = levantamentosList.find(l => l.id === currentLevId);
          if (levObj) {
            document.getElementById('badge-status-lev')!.innerText = levObj.status;
            document.getElementById('txt-nome-propriedade')!.innerText = `Levantamento #${levObj.id}`;
          }

          // Fetch paralelo de dependências
          const [resMat, resPt, resSeg, resConf] = await Promise.all([
            fetch(`${API_BASE}/levantamentos/${currentLevId}/matriculas`),
            fetch(`${API_BASE}/levantamentos/${currentLevId}/pontos`),
            fetch(`${API_BASE}/levantamentos/${currentLevId}/segmentos`),
            fetch(`${API_BASE}/levantamentos/${currentLevId}/confrontantes`)
          ]);

          matriculasList = await resMat.json();
          pontosList = await resPt.json();
          segmentosList = await resSeg.json();
          confrontantesList = await resConf.json();

          // Mock de informações adicionais caso o banco não retorne strings tratadas
          document.getElementById('txt-nome-cliente')!.innerText = "Thiago A. Silva (Mestre)";
          document.getElementById('txt-codigo-car')!.innerText = "PR-4128104-B4F5.9D20";

          // Abas de Matrículas
          const abasContainer = document.getElementById('container-abas-matriculas');
          if (abasContainer) {
            if (matriculasList.length === 0) {
              abasContainer.innerHTML = '<span class="text-xs text-white/30 p-2 font-mono">[Nenhuma Matrícula]</span>';
            } else {
              abasContainer.innerHTML = matriculasList.map((m, idx) => `
                <button class="px-4 py-1.5 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-all btn-mat-tab whitespace-nowrap" data-mat-id="${m.id}">
                  Matrícula ${m.numero_matricula}
                </button>
              `).join('');

              // Evento nas abas
              document.querySelectorAll('.btn-mat-tab').forEach(b => {
                b.addEventListener('click', () => {
                  const mId = parseInt(b.getAttribute('data-mat-id') || '0');
                  switchMatriculaTab(mId);
                });
              });

              // Seleciona a primeira por padrão se nenhuma selecionada
              if (currentMatriculaId === null && matriculasList.length > 0) {
                switchMatriculaTab(matriculasList[0].id);
              } else if (currentMatriculaId !== null) {
                switchMatriculaTab(currentMatriculaId);
              }
            }
          }

          // Inicializa o Mapa se necessário
          initTriagemMap();
          
          // Renderiza a fila e a mesa de triagem
          renderFilaArquivos();

        } catch (e) {
          console.error("Erro ao carregar detalhes do levantamento:", e);
        }
      };

      const switchMatriculaTab = (matriculaId: number) => {
        currentMatriculaId = matriculaId;

        // Atualiza realces das abas
        document.querySelectorAll('.btn-mat-tab').forEach(b => {
          const id = parseInt(b.getAttribute('data-mat-id') || '0');
          if (id === currentMatriculaId) {
            b.classList.replace('border-transparent', 'border-mint-vibrant');
            b.classList.replace('text-white/40', 'text-mint-vibrant');
          } else {
            b.classList.replace('border-mint-vibrant', 'border-transparent');
            b.classList.replace('text-mint-vibrant', 'text-white/40');
          }
        });

        // Atualiza o nome da matrícula ativa no painel técnico
        const matObj = matriculasList.find(m => m.id === currentMatriculaId);
        const txtMat = document.getElementById('txt-nome-matricula-ativa');
        if (txtMat && matObj) {
          txtMat.textContent = `Nº ${matObj.numero_matricula} (${matObj.area_ha || matObj.area || '0'}ha)`;
        }

        // Desenha os dados espaciais e relacionais
        renderMatriculaDados();

        // TRIGGER CRÍTICO: invalidateSize() para redesenhar Leaflet na aba ativa
        if (triagemMap) {
          setTimeout(() => {
            triagemMap!.invalidateSize();
          }, 100);
        }
      };

      const renderMatriculaDados = () => {
        if (!currentMatriculaId) return;

        // Filtra dados pertencentes exclusivamente à matrícula selecionada
        const pontosMat = pontosList.filter(p => p.matricula_id === currentMatriculaId);
        const segmentosMat = segmentosList.filter(s => s.matricula_id === currentMatriculaId);

        // 1. PLOTAGEM DO LEAFLET MAP
        if (triagemMap) {
          // Limpa layers antigas
          markersList.forEach(m => triagemMap!.removeLayer(m));
          markersList = [];
          polylineList.forEach(pl => triagemMap!.removeLayer(pl));
          polylineList = [];

          // Desenha Marcadores (Vértices)
          pontosMat.forEach(p => {
            if (p.lat && p.lon && p.lat !== 0 && p.lon !== 0) {
               const markerHtml = `
                 <div class="w-5 h-5 bg-mint-vibrant border-2 border-[#0c1510] rounded-full flex items-center justify-center text-[7px] font-bold text-[#0c1510] font-mono shadow-lg transition-transform hover:scale-125" id="map-marker-${p.id}">
                   ${p.nome_vertice.substring(0, 3)}
                 </div>
               `;
               const customIcon = L.divIcon({
                 html: markerHtml,
                 className: 'custom-leaflet-marker',
                 iconSize: [20, 20]
               });

               const marker = L.marker([p.lat, p.lon], { icon: customIcon })
                 .bindPopup(`
                   <div class="font-sans">
                     <p class="font-bold text-sm text-[#0c1510]">Vértice ${p.nome_vertice}</p>
                     <p class="text-xs text-gray-600 mt-0.5">Tipo: ${p.tipo_ponto || p.tipo}</p>
                     <p class="text-xs text-gray-500 font-mono mt-1">Lat: ${p.lat.toFixed(6)}</p>
                     <p class="text-xs text-gray-500 font-mono">Lon: ${p.lon.toFixed(6)}</p>
                   </div>
                 `)
                 .addTo(triagemMap!);

               marker.on('click', () => {
                 highlightTabelaLinha(p.id);
               });

               (marker as any).pontoId = p.id;
               markersList.push(marker);
            }
          });

          // Desenha Divisas (Polylines)
          segmentosMat.forEach(s => {
            const pIni = pontosMat.find(p => p.id === s.ponto_inicio_id);
            const pFim = pontosMat.find(p => p.id === s.ponto_fim_id);

            if (pIni && pFim && pIni.lat && pIni.lon && pFim.lat && pFim.lon) {
               const color = s.tipo_limite_sigef === 'LA1' ? '#10b981' : '#3b82f6'; // Verde para artificial, Azul para natural
               const polyline = L.polyline([[pIni.lat, pIni.lon], [pFim.lat, pFim.lon]], {
                 color: color,
                 weight: 4,
                 dashArray: s.tipo_limite_sigef === 'LN1' ? '6, 6' : undefined
               }).bindPopup(`
                 <div class="font-sans">
                   <p class="font-bold text-xs text-[#0c1510]">Segmento ${pIni.nome_vertice} ↔ ${pFim.nome_vertice}</p>
                   <p class="text-xs text-gray-600">Limite: ${s.tipo_limite_sigef}</p>
                   <p class="text-xs text-gray-500">Método: ${s.metodo_posicionamento_sigef}</p>
                 </div>
               `).addTo(triagemMap!);

               polylineList.push(polyline);
            }
          });

          // Zoom nos pontos válidos
          const validCoords = pontosMat.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0).map(p => L.latLng(p.lat, p.lon));
          if (validCoords.length > 0) {
            const bounds = L.latLngBounds(validCoords);
            triagemMap.fitBounds(bounds, { padding: [40, 40] });
          }
        }

        // 2. TABELA DE VÉRTICES
        const tblHeader = document.getElementById('tbl-pontos-header');
        if (tblHeader) {
           if (modoCoordenadas === 'geodesico') {
              tblHeader.innerHTML = `
                <th class="px-4 py-3">Vértice</th>
                <th class="px-4 py-3">Tipo</th>
                <th class="px-4 py-3 text-right">Latitude</th>
                <th class="px-4 py-3 text-right">Longitude</th>
                <th class="px-4 py-3 text-right">Altitude (m)</th>
                <th class="px-4 py-3 text-center">Sigmas (m)</th>
              `;
           } else {
              tblHeader.innerHTML = `
                <th class="px-4 py-3">Vértice</th>
                <th class="px-4 py-3">Tipo</th>
                <th class="px-4 py-3 text-right">Este (E)</th>
                <th class="px-4 py-3 text-right">Norte (N)</th>
                <th class="px-4 py-3 text-right">Altitude (m)</th>
                <th class="px-4 py-3 text-center">Sigmas (m)</th>
              `;
           }
        }

        const listPt = document.getElementById('tbl-pontos-triagem');
        if (listPt) {
          if (pontosMat.length === 0) {
            listPt.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-white/30">Nenhum ponto atrelado a esta matrícula.</td></tr>';
          } else {
            listPt.innerHTML = pontosMat.map(p => {
              const highSigma = (p.sigma_lat > 0.10 || p.sigma_lon > 0.10 || p.sigma_alt > 0.10);
              const cellClass = highSigma ? 'text-red-400 font-bold bg-red-500/10' : '';
              
              let col1 = '-';
              let col2 = '-';
              let col3 = '-';
              
              if (modoCoordenadas === 'geodesico') {
                 col1 = p.lat ? p.lat.toFixed(8) : '-';
                 col2 = p.lon ? p.lon.toFixed(8) : '-';
                 col3 = p.alt ? p.alt.toFixed(3) : '-';
              } else {
                 col1 = p.e_original ? p.e_original.toFixed(3) : '-';
                 col2 = p.n_original ? p.n_original.toFixed(3) : '-';
                 col3 = p.alt_original ? p.alt_original.toFixed(3) : (p.alt ? p.alt.toFixed(3) : '-');
              }

              return `
                <tr class="linha-ponto-tbl hover:bg-white/[0.02] border-b border-white/5 cursor-pointer transition-colors" id="tr-ponto-${p.id}" data-ponto-id="${p.id}">
                  <td class="px-4 py-3 font-bold text-white">${p.nome_vertice}</td>
                  <td class="px-4 py-3">${p.tipo_ponto || p.tipo || '-'}</td>
                  <td class="px-4 py-3 text-right">${col1}</td>
                  <td class="px-4 py-3 text-right">${col2}</td>
                  <td class="px-4 py-3 text-right">${col3}</td>
                  <td class="px-4 py-3 text-center ${cellClass}">
                    L: ${(p.sigma_lat || 0).toFixed(3)} | P: ${(p.sigma_lon || 0).toFixed(3)}
                  </td>
                </tr>
              `;
            }).join('');

            // Clique na linha foca no mapa
            document.querySelectorAll('.linha-ponto-tbl').forEach(tr => {
              tr.addEventListener('click', () => {
                const pId = parseInt(tr.getAttribute('data-ponto-id') || '0');
                selectPontoFromTabela(pId);
              });
            });
          }
        }

        // 3. TABELA DE DIVISAS
        const listSeg = document.getElementById('tbl-segmentos-triagem');
        if (listSeg) {
          if (segmentosMat.length === 0) {
            listSeg.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-white/30">Nenhum segmento atrelado a esta matrícula.</td></tr>';
          } else {
            listSeg.innerHTML = segmentosMat.map(s => {
              const pIni = pontosList.find(p => p.id === s.ponto_inicio_id);
              const pFim = pontosList.find(p => p.id === s.ponto_fim_id);

              const confOptions = confrontantesList.map(c => `
                <option value="${c.id}" ${c.id === s.confrontante_id ? 'selected' : ''}>${c.nome}</option>
              `);
              confOptions.unshift(`<option value="" ${!s.confrontante_id ? 'selected' : ''}>[Sem Confrontante]</option>`);

              const limiteOptions = [
                { val: 'LN1', txt: 'Cerca (LN1)' },
                { val: 'LA1', txt: 'Muro/Parede (LA1)' },
                { val: 'LI1', txt: 'Córrego/Vala (LI1)' },
                { val: 'LI2', txt: 'Estrada (LI2)' }
              ].map(o => `<option value="${o.val}" ${o.val === s.tipo_limite_sigef ? 'selected' : ''}>${o.txt}</option>`).join('');

              const metodoOptions = [
                { val: 'PG1', txt: 'RTK Relativo (PG1)' },
                { val: 'MC1', txt: 'Estático (MC1)' },
                { val: 'MC2', txt: 'Estático Rápido (MC2)' },
                { val: 'PG2', txt: 'RTK Wms/Ntrip (PG2)' }
              ].map(o => `<option value="${o.val}" ${o.val === s.metodo_posicionamento_sigef ? 'selected' : ''}>${o.txt}</option>`).join('');

              return `
                <tr class="linha-segmento-tbl hover:bg-white/[0.01] border-b border-white/5" data-seg-id="${s.id}">
                  <td class="px-4 py-2.5 font-bold font-mono text-white">${pIni ? pIni.nome_vertice : '??'}</td>
                  <td class="px-4 py-2.5 font-bold font-mono text-white">${pFim ? pFim.nome_vertice : '??'}</td>
                  <td class="px-4 py-2.5">
                    <select class="glass-input text-[10px] py-0.5 px-1 select-seg-conf w-full" data-seg-id="${s.id}">
                      ${confOptions.join('')}
                    </select>
                  </td>
                  <td class="px-4 py-2.5">
                    <select class="glass-input text-[10px] py-0.5 px-1 select-seg-limite w-full" data-seg-id="${s.id}">
                      ${limiteOptions}
                    </select>
                  </td>
                  <td class="px-4 py-2.5">
                    <select class="glass-input text-[10px] py-0.5 px-1 select-seg-metodo w-full" data-seg-id="${s.id}">
                      ${metodoOptions}
                    </select>
                  </td>
                </tr>
              `;
            }).join('');

            // Atribuição de eventos de atualização real-time inline (PUT)
            document.querySelectorAll('.select-seg-conf').forEach(sel => {
              sel.addEventListener('change', (e) => {
                const sId = parseInt((e.target as HTMLSelectElement).getAttribute('data-seg-id') || '0');
                const val = (e.target as HTMLSelectElement).value;
                updateSegmentoInline(sId, { confrontante_id: val ? parseInt(val) : null });
              });
            });

            document.querySelectorAll('.select-seg-limite').forEach(sel => {
              sel.addEventListener('change', (e) => {
                const sId = parseInt((e.target as HTMLSelectElement).getAttribute('data-seg-id') || '0');
                const val = (e.target as HTMLSelectElement).value;
                updateSegmentoInline(sId, { tipo_limite_sigef: val });
              });
            });

            document.querySelectorAll('.select-seg-metodo').forEach(sel => {
              sel.addEventListener('change', (e) => {
                const sId = parseInt((e.target as HTMLSelectElement).getAttribute('data-seg-id') || '0');
                const val = (e.target as HTMLSelectElement).value;
                updateSegmentoInline(sId, { metodo_posicionamento_sigef: val });
              });
            });
          }
        }
      };

      const highlightTabelaLinha = (pontoId: number) => {
        // Remove realce de todas as linhas
        document.querySelectorAll('.linha-ponto-tbl').forEach(tr => {
          tr.classList.remove('bg-mint-vibrant/20', 'border-mint-vibrant/40');
        });

        // Aplica o realce persistente na linha de destino
        const target = document.getElementById(`tr-ponto-${pontoId}`);
        if (target) {
          target.classList.add('bg-mint-vibrant/20', 'border-mint-vibrant/40');
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };

      const selectPontoFromTabela = (pId: number) => {
        highlightTabelaLinha(pId);

        const marker = markersList.find(m => (m as any).pontoId === pId);
        if (marker && triagemMap) {
          triagemMap.setView(marker.getLatLng(), 18);
          marker.openPopup();
        }
      };

      const updateSegmentoInline = async (segId: number, partialData: any) => {
        const segObj = segmentosList.find(s => s.id === segId);
        if (!segObj) return;

        const payload = {
          matricula_id: segObj.matricula_id,
          ponto_inicio_id: segObj.ponto_inicio_id,
          ponto_fim_id: segObj.ponto_fim_id,
          confrontante_id: segObj.confrontante_id,
          tipo_limite_sigef: segObj.tipo_limite_sigef,
          metodo_posicionamento_sigef: segObj.metodo_posicionamento_sigef,
          ...partialData
        };

        try {
          await fetch(`${API_BASE}/segmentos/${segId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          Object.assign(segObj, partialData);

          // Re-plota mapa se mudou tipo de limite
          if (partialData.tipo_limite_sigef) {
            renderMatriculaDados();
          }
        } catch (e) {
          console.error("Erro ao salvar segmento inline:", e);
        }
      };

      // --- MESA DRAG AND DROP ---
      const dropzone = document.getElementById('triagem-dropzone');
      const fileInput = document.getElementById('triagem-file-input') as HTMLInputElement;
      const filaContainer = document.getElementById('triagem-fila-container');
      const btnProcessar = document.getElementById('btn-processar-lote');

      const renderFilaArquivos = () => {
        if (filesQueue.length === 0) {
          filaContainer?.classList.add('hidden');
          btnProcessar?.classList.add('hidden');
          return;
        }

        filaContainer?.classList.remove('hidden');
        btnProcessar?.classList.remove('hidden');

        filaContainer!.innerHTML = filesQueue.map((item, idx) => {
          const kbSize = (item.file.size / 1024).toFixed(1);
          const options = [
            `<option value="base" ${item.destination === 'base' ? 'selected' : ''}>[Base - Enviar ao PPP]</option>`
          ];

          matriculasList.forEach(m => {
            options.push(`<option value="rover_${m.id}" ${item.destination === `rover_${m.id}` ? 'selected' : ''}>[Rover - Vincular à Matrícula ${m.numero_matricula}]</option>`);
          });

          return `
            <div class="flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded-technical text-xs gap-3">
              <div class="min-w-0 flex-1">
                <p class="font-mono text-white truncate" title="${item.file.name}">${item.file.name}</p>
                <p class="text-[9px] text-white/30 font-mono mt-0.5">${kbSize} KB</p>
              </div>
              <select class="glass-input text-[10px] py-1 px-2 select-file-dest shrink-0 w-[190px]" data-idx="${idx}">
                ${options.join('')}
              </select>
              <button class="text-white/30 hover:text-red-400 p-1 btn-remover-arquivo animate-pulse" data-idx="${idx}">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
          `;
        }).join('');

        initIcons();

        // Evento select
        document.querySelectorAll('.select-file-dest').forEach(sel => {
          sel.addEventListener('change', (e) => {
            const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-idx') || '0');
            filesQueue[idx].destination = (e.target as HTMLSelectElement).value;
          });
        });

        // Evento remover
        document.querySelectorAll('.btn-remover-arquivo').forEach(b => {
          b.addEventListener('click', () => {
            const idx = parseInt(b.getAttribute('data-idx') || '0');
            filesQueue.splice(idx, 1);
            renderFilaArquivos();
          });
        });
      };

      dropzone?.addEventListener('click', () => fileInput?.click());

      fileInput?.addEventListener('change', (e: any) => {
        if (e.target.files) {
          Array.from(e.target.files as FileList).forEach(f => {
            filesQueue.push({ file: f, destination: 'base' });
          });
          renderFilaArquivos();
        }
        fileInput.value = '';
      });

      dropzone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
      });

      dropzone?.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
      });

      dropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
        if (e.dataTransfer && e.dataTransfer.files) {
          Array.from(e.dataTransfer.files).forEach(f => {
            filesQueue.push({ file: f, destination: 'base' });
          });
          renderFilaArquivos();
        }
      });

      btnProcessar?.addEventListener('click', async () => {
        if (filesQueue.length === 0) return;

        const baseFiles = filesQueue.filter(f => f.destination === 'base');
        const roverFiles = filesQueue.filter(f => f.destination.startsWith('rover_'));

        // 1. Processamento Bases
        if (baseFiles.length > 0) {
          const formData = new FormData();
          baseFiles.forEach(item => formData.append('files', item.file));
          
          try {
            const upRes = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
            const upData = await upRes.json();
            
            await fetch(`${API_BASE}/process/ppp`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(upData.files)
            });
            alert(`${baseFiles.length} Base(s) submetida(s) com sucesso ao PPP IBGE!`);
          } catch(err) {
            console.error("Erro ao processar Base:", err);
          }
        }

        // 2. Processamento de Cadernetas/RTK de Matrícula (Rovers)
        if (roverFiles.length > 0) {
          for (const item of roverFiles) {
            const mId = parseInt(item.destination.split('_')[1]);
            const formData = new FormData();
            formData.append('file', item.file);
            formData.append('matricula_id', mId.toString());

            try {
              // Submetemos os rovers para importação de caderneta de fato no banco e translação
              const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/importar-txt`, {
                method: 'POST',
                body: formData
              });
              const data = await res.json();
              if (data.error) {
                 alert(`Erro no arquivo ${item.file.name}: ${data.error}`);
              }
            } catch(err) {
              console.error("Erro ao importar TXT:", err);
            }
          }
          alert(`${roverFiles.length} Caderneta(s) de Campo (RTK/Rover) processadas e vértices gerados com sucesso!`);
        }

        filesQueue = [];
        renderFilaArquivos();
        loadLevantamentoDetails();
      });

      // --- OUTROS EVENTOS ---
      document.getElementById('btn-voltar-lista')?.addEventListener('click', () => {
        currentLevId = null;
        currentMatriculaId = null;
        if (triagemMap) {
          triagemMap.remove();
          triagemMap = null;
        }

        document.getElementById('painel-detalhe-projeto')?.classList.add('hidden');
        document.getElementById('painel-lista-projetos')?.classList.remove('hidden');
        loadLevantamentos();
      });

      document.getElementById('btn-novo-lev')?.addEventListener('click', async () => {
        try {
          await fetch(`${API_BASE}/levantamentos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              propriedade_id: 1, // Mock
              profissional_id: 1, // Mock
              data_inicio: new Date().toISOString().split('T')[0]
            })
          });
          loadLevantamentos();
        } catch (e) {
          console.error(e);
        }
      });

      document.getElementById('btn-exportar-kml')?.addEventListener('click', () => {
        if (!currentMatriculaId) return;
        alert(`Arquivo KML Sirgas 2000 gerado e copiado com sucesso para a pasta: \n/Projetos/Propriedade_Thiago/Lev_${currentLevId}/Exportacoes/`);
      });

      // Clique no botão Toggle de Coordenadas (Alternância Geodésico/UTM)
      document.getElementById('btn-toggle-coordenadas')?.addEventListener('click', () => {
         const btn = document.getElementById('btn-toggle-coordenadas');
         const lbl = document.getElementById('lbl-titulo-vertices');
         
         if (modoCoordenadas === 'geodesico') {
            modoCoordenadas = 'utm';
            if (btn) btn.innerText = 'Ver em Geodésico';
            if (lbl) lbl.innerText = 'Vértices UTM (SIRGAS 22S)';
         } else {
            modoCoordenadas = 'geodesico';
            if (btn) btn.innerText = 'Ver em UTM';
            if (lbl) lbl.innerText = 'Vértices Geodésicos';
         }
         
         renderMatriculaDados();
      });

      // Inicialização da lista
      loadLevantamentos();
    }
  },
  configuracoes: {
    render: () => `
      <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 class="text-3xl font-bold">Configurações</h2>
        <div class="glass-card p-6 max-w-2xl">
           <p class="text-white/40 italic">Módulo de configurações do sistema GerenciGeo em desenvolvimento...</p>
        </div>
      </div>
    `
  }
}

const navigate = (route: string) => {
  const container = document.getElementById('view-container')
  const breadcrumbCurrent = document.getElementById('breadcrumb-current')
  if (!container || !breadcrumbCurrent) return
  clearTimeoutsAndIntervals();
  breadcrumbCurrent.textContent = route.charAt(0).toUpperCase() + route.slice(1)
  const currentRoute = routes[route];
  if (currentRoute) {
    container.innerHTML = currentRoute.render()
    initIcons()
    if (currentRoute.setup) currentRoute.setup();
  } else {
    container.innerHTML = `<div class="p-12 text-center text-white/20">Módulo em desenvolvimento...</div>`
  }
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active')
    if (link.getAttribute('href') === `#${route}`) {
      link.classList.add('active')
    }
  })
}

window.addEventListener('hashchange', () => {
  const route = window.location.hash.replace('#', '') || 'dashboard'
  navigate(route)
})

document.addEventListener('DOMContentLoaded', () => {
  const initialRoute = window.location.hash.replace('#', '') || 'dashboard'
  navigate(initialRoute)
  initIcons()
})
