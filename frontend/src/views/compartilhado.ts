import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, showToast, formatUTM } from '../utils';
import { renderCompartilhado } from './compartilhado_template';
import { MesaTrabalhoMapa } from './mesa_trabalho/mapa/mapa_controller';
import L from 'leaflet';

let mapController: MesaTrabalhoMapa | null = null;
let currentPublicData: any = null;
let currentSelectedPointId: number | null = null;
let mapPulseMarker: L.CircleMarker | null = null;
let mapPulseRing: L.CircleMarker | null = null;

const setupTabs = () => {
    const tabBtns = document.querySelectorAll('.tab-btn-publico');
    const tabPanes = document.querySelectorAll('.tab-pane-publico');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = (e.target as HTMLElement).getAttribute('data-target');
            
            tabBtns.forEach(b => {
                b.classList.remove('border-mint-vibrant', 'text-mint-vibrant');
                b.classList.add('border-transparent', 'text-white/40');
            });
            (e.target as HTMLElement).classList.remove('border-transparent', 'text-white/40');
            (e.target as HTMLElement).classList.add('border-mint-vibrant', 'text-mint-vibrant');
            
            tabPanes.forEach(pane => pane.classList.add('hidden'));
            document.getElementById(targetId || '')?.classList.remove('hidden');
        });
    });
};

const setupResizers = () => {
  const resizerTabelas = document.getElementById('resizer-tabelas-inferior');
  const painelTabelas = document.getElementById('painel-inferior-tabelas');
  
  if (resizerTabelas && painelTabelas) {
     let isDragging = false;
     resizerTabelas.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
     document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const newHeight = document.body.clientHeight - e.clientY;
        if (newHeight >= 120 && newHeight <= window.innerHeight * 0.8) painelTabelas.style.height = `${newHeight}px`;
     });
     document.addEventListener('mouseup', () => { 
       if (isDragging) { isDragging = false; mapController?.invalidateSize(); } 
     });
  }
};

/**
 * Renderiza o painel lateral com detalhes completos do ponto selecionado e botões de navegação
 */
const renderPropriedadesPonto = (ponto: any) => {
    const container = document.getElementById('container-props-ponto');
    if (!container) return;
    
    if (!ponto) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center text-center text-white/30 italic py-12 px-4 gap-3">
                <div class="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/20">
                    <i data-lucide="crosshair" class="w-6 h-6"></i>
                </div>
                <span>Clique em um vértice no mapa ou na tabela abaixo para inspecionar as coordenadas.</span>
            </div>`;
        initIcons();
        return;
    }
    
    const pontos = currentPublicData?.pontos || [];
    const currentIndex = pontos.findIndex((x: any) => x.id === ponto.id);
    const prevPonto = currentIndex > 0 ? pontos[currentIndex - 1] : pontos[pontos.length - 1];
    const nextPonto = currentIndex >= 0 && currentIndex < pontos.length - 1 ? pontos[currentIndex + 1] : pontos[0];

    const tipoMap: { [k: string]: { label: string; bg: string } } = {
        'M': { label: 'Marco (M)', bg: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
        'P': { label: 'Ponto (P)', bg: 'bg-mint-vibrant/20 text-mint-vibrant border-mint-vibrant/30' },
        'V': { label: 'Vértice (V)', bg: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
        'B': { label: 'Base GNSS (B)', bg: 'bg-rose-500/20 text-rose-400 border-rose-500/30' }
    };
    
    const tipoInfo = tipoMap[ponto.tipo || ponto.tipo_ponto] || { label: ponto.tipo || 'Vértice', bg: 'bg-white/10 text-white border-white/20' };

    const norteTxt = ponto.norte != null ? formatUTM(ponto.norte) : (ponto.lat != null ? ponto.lat.toFixed(6) : '—');
    const esteTxt = ponto.este != null ? formatUTM(ponto.este) : (ponto.lon != null ? ponto.lon.toFixed(6) : '—');
    const latTxt = ponto.lat != null ? ponto.lat.toFixed(6) : '—';
    const lonTxt = ponto.lon != null ? ponto.lon.toFixed(6) : '—';
    const altTxt = ponto.altitude != null ? `${Number(ponto.altitude).toFixed(3)} m` : '—';

    container.innerHTML = `
        <div class="space-y-4 animate-in fade-in duration-200">
            <!-- TÍTULO E NAVEGAÇÃO ENTRE VÉRTICES -->
            <div class="bg-white/[0.03] border border-white/10 rounded-lg p-3">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] uppercase font-bold tracking-wider text-white/40">Vértice Selecionado</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded border ${tipoInfo.bg}">${tipoInfo.label}</span>
                </div>
                <h4 class="font-mono text-base font-bold text-mint-vibrant tracking-tight flex items-center justify-between">
                    <span>${ponto.nome_vertice || `Ponto ${ponto.id}`}</span>
                    ${ponto.ordem_caminhamento ? `<span class="text-xs text-white/40 font-sans font-normal">Ord #${ponto.ordem_caminhamento}</span>` : ''}
                </h4>
                
                <!-- BOTÕES DE NAVEGAÇÃO DE VÉRTICES -->
                <div class="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-white/5">
                    <button onclick="window.selecionarPontoPublico(${prevPonto?.id})" class="flex-1 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[11px] text-white/80 hover:text-white flex items-center justify-center gap-1 transition-all cursor-pointer">
                        <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
                        <span>Anterior</span>
                    </button>
                    <button onclick="window.selecionarPontoPublico(${nextPonto?.id})" class="flex-1 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[11px] text-white/80 hover:text-white flex items-center justify-center gap-1 transition-all cursor-pointer">
                        <span>Próximo</span>
                        <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>

            <!-- COORDENADAS UTM (PROJETADA) -->
            <div class="bg-black/40 border border-white/10 rounded-lg p-3 space-y-2">
                <span class="text-[10px] uppercase font-bold tracking-wider text-white/40 flex items-center gap-1">
                   <i data-lucide="layers" class="w-3 h-3 text-mint-vibrant"></i>
                   Projeção UTM (Metros)
                </span>
                <div class="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div class="bg-white/[0.02] p-2 rounded border border-white/5">
                        <span class="text-[10px] text-white/40 block">Norte (Y):</span>
                        <span class="font-mono text-white font-bold text-xs">${norteTxt}</span>
                    </div>
                    <div class="bg-white/[0.02] p-2 rounded border border-white/5">
                        <span class="text-[10px] text-white/40 block">Este (X):</span>
                        <span class="font-mono text-white font-bold text-xs">${esteTxt}</span>
                    </div>
                </div>
            </div>

            <!-- COORDENADAS GEOGRÁFICAS (SIRGAS 2000) -->
            <div class="bg-black/40 border border-white/10 rounded-lg p-3 space-y-2">
                <span class="text-[10px] uppercase font-bold tracking-wider text-white/40 flex items-center gap-1">
                   <i data-lucide="globe" class="w-3 h-3 text-blue-400"></i>
                   Geográficas (Graus)
                </span>
                <div class="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div class="bg-white/[0.02] p-2 rounded border border-white/5">
                        <span class="text-[10px] text-white/40 block">Latitude:</span>
                        <span class="font-mono text-white text-xs">${latTxt}</span>
                    </div>
                    <div class="bg-white/[0.02] p-2 rounded border border-white/5">
                        <span class="text-[10px] text-white/40 block">Longitude:</span>
                        <span class="font-mono text-white text-xs">${lonTxt}</span>
                    </div>
                </div>
            </div>

            <!-- ALTITUDE E CONFRONTANTE -->
            <div class="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
                <div class="flex items-center justify-between border-b border-white/5 pb-2">
                    <span class="text-white/40 text-[11px]">Altitude Ortométrica:</span>
                    <span class="font-mono text-mint-vibrant font-bold text-xs">${altTxt}</span>
                </div>
                ${ponto.nome_confrontante ? `
                <div class="pt-1">
                    <span class="text-white/40 text-[10px] uppercase font-bold block mb-1">Confrontante Oficial:</span>
                    <div class="text-white bg-white/5 border border-white/10 px-2.5 py-1.5 rounded text-xs leading-snug">
                        ${ponto.nome_confrontante}
                    </div>
                </div>` : ''}
            </div>
        </div>
    `;
    initIcons();
};

/**
 * Renderiza as tabelas do painel inferior
 */
const renderTabelas = () => {
    const tbodyOrg = document.getElementById('tbody-organizador-publico');
    const tbodyAll = document.getElementById('tbody-todos-pontos-publico');
    if (!tbodyOrg || !tbodyAll || !currentPublicData) return;
    
    const pontos = currentPublicData.pontos || [];
    
    // Atualiza contador de pontos
    const txtCount = document.getElementById('badge-total-vertices');
    if (txtCount) txtCount.innerText = `${pontos.length} Vértices`;
    
    tbodyAll.innerHTML = pontos.map((p: any) => {
        const norte = p.norte != null ? formatUTM(p.norte) : (p.lat != null ? p.lat.toFixed(6) : '—');
        const este = p.este != null ? formatUTM(p.este) : (p.lon != null ? p.lon.toFixed(6) : '—');
        const isSelected = p.id === currentSelectedPointId;
        const rowClass = isSelected 
            ? 'bg-mint-vibrant/20 border-l-4 border-mint-vibrant text-white font-bold' 
            : 'hover:bg-white/[0.04] border-b border-white/5 text-white/80';

        return `
        <tr id="row-ponto-all-${p.id}" class="${rowClass} cursor-pointer transition-colors" onclick="window.selecionarPontoPublico(${p.id})">
            <td class="px-3 py-2 font-mono font-bold ${isSelected ? 'text-mint-vibrant' : 'text-white'}">${p.nome_vertice || `P-${p.id}`}</td>
            <td class="px-3 py-2 text-center font-mono text-white/60">${p.tipo || '-'}</td>
            <td class="px-3 py-2 font-mono">${norte}</td>
            <td class="px-3 py-2 font-mono">${este}</td>
            <td class="px-3 py-2 text-center font-mono text-white/60">${p.altitude != null ? Number(p.altitude).toFixed(2) : '—'}</td>
        </tr>`;
    }).join('');
    
    const orgPontos = pontos.filter((p: any) => p.ordem_caminhamento !== null).sort((a: any, b: any) => a.ordem_caminhamento - b.ordem_caminhamento);
    
    if (orgPontos.length === 0) {
        tbodyOrg.innerHTML = '<tr><td colspan="6" class="text-center p-6 text-white/40 italic">O caminhamento não possui sequência de ordem salva.</td></tr>';
        return;
    }
    
    const dist = (p1: any, p2: any) => {
        if (p1.este && p1.norte && p2.este && p2.norte) {
            const dx = p2.este - p1.este;
            const dy = p2.norte - p1.norte;
            return Math.sqrt(dx * dx + dy * dy);
        }
        if (!p1.lat || !p1.lon || !p2.lat || !p2.lon) return 0;
        const R = 6371e3;
        const f1 = p1.lat * Math.PI/180;
        const f2 = p2.lat * Math.PI/180;
        const df = (p2.lat-p1.lat) * Math.PI/180;
        const dl = (p2.lon-p1.lon) * Math.PI/180;
        const a = Math.sin(df/2) * Math.sin(df/2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2) * Math.sin(dl/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };
    
    let orgHtml = '';
    for (let i = 0; i < orgPontos.length; i++) {
        const p = orgPontos[i];
        const pNext = orgPontos[(i + 1) % orgPontos.length];
        const distance = dist(p, pNext);
        const norte = p.norte != null ? formatUTM(p.norte) : (p.lat != null ? p.lat.toFixed(6) : '—');
        const este = p.este != null ? formatUTM(p.este) : (p.lon != null ? p.lon.toFixed(6) : '—');
        const isSelected = p.id === currentSelectedPointId;

        const rowClass = isSelected 
            ? 'bg-mint-vibrant/20 border-l-4 border-mint-vibrant text-white font-bold' 
            : 'hover:bg-white/[0.04] border-b border-white/5 text-white/80';

        orgHtml += `
        <tr id="row-ponto-org-${p.id}" class="${rowClass} cursor-pointer transition-colors" onclick="window.selecionarPontoPublico(${p.id})">
            <td class="px-3 py-2 text-center text-mint-vibrant font-bold font-mono">${p.ordem_caminhamento}</td>
            <td class="px-3 py-2 font-mono font-bold ${isSelected ? 'text-mint-vibrant' : 'text-white'}">${p.nome_vertice || `P-${p.id}`}</td>
            <td class="px-3 py-2 font-mono">${norte}</td>
            <td class="px-3 py-2 font-mono">${este}</td>
            <td class="px-3 py-2 text-white/80 truncate max-w-[180px]" title="${p.nome_confrontante || ''}">${p.nome_confrontante || '—'}</td>
            <td class="px-3 py-2 text-center font-mono text-mint-vibrant/90 font-bold">${distance > 0 ? distance.toFixed(2) : '—'}</td>
        </tr>`;
    }
    tbodyOrg.innerHTML = orgHtml;
};

/**
 * Destaca e pulsa o ponto selecionado no mapa (Localizador Visual Canvas)
 */
const highlightPointOnCanvas = (p: any) => {
    if (!mapController?.core?.map || !p || !p.lat || !p.lon) return;
    const map = mapController.core.map;

    // Remove os marcadores de efeito anteriores
    if (mapPulseMarker) {
        map.removeLayer(mapPulseMarker);
        mapPulseMarker = null;
    }
    if (mapPulseRing) {
        map.removeLayer(mapPulseRing);
        mapPulseRing = null;
    }

    // Pan centralizado no ponto
    map.panTo([p.lat, p.lon], { animate: true, duration: 0.5 });

    // Desenha o círculo do localizador (Anel pulsante em tom Mint)
    mapPulseRing = L.circleMarker([p.lat, p.lon], {
        radius: 20,
        color: '#00ffaa',
        weight: 2,
        fillColor: '#00ffaa',
        fillOpacity: 0.15,
        className: 'animate-ping-once'
    }).addTo(map);

    mapPulseMarker = L.circleMarker([p.lat, p.lon], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#00ffaa',
        fillOpacity: 0.9,
    }).addTo(map);
};

/**
 * Seleciona um ponto publicamente, atualizando mapa, tabela e painel lateral
 */
(window as any).selecionarPontoPublico = (id: number) => {
    currentSelectedPointId = id;
    if (mapController) {
        mapController.selectPonto(id);
    }
    if (currentPublicData && currentPublicData.pontos) {
        const p = currentPublicData.pontos.find((x: any) => x.id === id);
        if (p) {
            renderPropriedadesPonto(p);
            highlightPointOnCanvas(p);
        }
    }
    renderTabelas();

    // Rola suavemente a linha da tabela para visibilidade
    setTimeout(() => {
        const rowOrg = document.getElementById(`row-ponto-org-${id}`);
        const rowAll = document.getElementById(`row-ponto-all-${id}`);
        if (rowOrg) rowOrg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (rowAll) rowAll.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
};

/**
 * Configura o localizador de pontos (Campo de busca em tempo real)
 */
const setupLocalizadorPontos = () => {
    const inputSearch = document.getElementById('input-busca-ponto-publico') as HTMLInputElement;
    const btnClear = document.getElementById('btn-limpar-busca-publico');
    if (!inputSearch) return;

    const filtrarPontos = () => {
        const term = inputSearch.value.trim().toLowerCase();
        if (btnClear) {
            btnClear.classList.toggle('hidden', term.length === 0);
        }

        const tbodyOrg = document.getElementById('tbody-organizador-publico');
        const tbodyAll = document.getElementById('tbody-todos-pontos-publico');
        
        [tbodyOrg, tbodyAll].forEach(tbody => {
            if (!tbody) return;
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const text = row.innerText.toLowerCase();
                if (text.includes(term)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    };

    inputSearch.addEventListener('input', filtrarPontos);
    
    inputSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && currentPublicData?.pontos) {
            const term = inputSearch.value.trim().toLowerCase();
            if (!term) return;
            const match = currentPublicData.pontos.find((p: any) => 
                (p.nome_vertice && p.nome_vertice.toLowerCase().includes(term)) ||
                (p.nome_confrontante && p.nome_confrontante.toLowerCase().includes(term)) ||
                String(p.ordem_caminhamento) === term
            );
            if (match) {
                (window as any).selecionarPontoPublico(match.id);
            } else {
                showToast("Nenhum vértice localizado com este nome.", "info");
            }
        }
    });

    if (btnClear) {
        btnClear.addEventListener('click', () => {
            inputSearch.value = '';
            filtrarPontos();
            inputSearch.focus();
        });
    }

    const btnExportCSV = document.getElementById('btn-exportar-csv-publico');
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', exportarPontosCSV);
    }
};

/**
 * Exporta a lista de vértices do imóvel em um arquivo CSV (Excel compatível com UTF-8 BOM)
 */
const exportarPontosCSV = () => {
    if (!currentPublicData || !currentPublicData.pontos || currentPublicData.pontos.length === 0) {
        showToast("Não há vértices disponíveis para exportar.", "info");
        return;
    }

    const pontos = currentPublicData.pontos;
    const imovelNome = (currentPublicData.nome_propriedade || 'Imovel').replace(/[^a-zA-Z0-9_-]/g, '_');

    // UTF-8 BOM para garantir acentuação no Microsoft Excel
    let csvContent = "\uFEFF";
    csvContent += "Ordem;Vértice;Tipo;Norte (Y);Este (X);Latitude;Longitude;Altitude (m);Confrontante\n";

    pontos.forEach((p: any) => {
        const ord = p.ordem_caminhamento != null ? p.ordem_caminhamento : '';
        const vertice = p.nome_vertice || `P-${p.id}`;
        const tipo = p.tipo || p.tipo_ponto || '';
        const norte = p.norte != null ? Number(p.norte).toFixed(3).replace('.', ',') : '';
        const este = p.este != null ? Number(p.este).toFixed(3).replace('.', ',') : '';
        const lat = p.lat != null ? Number(p.lat).toFixed(6).replace('.', ',') : '';
        const lon = p.lon != null ? Number(p.lon).toFixed(6).replace('.', ',') : '';
        const alt = p.altitude != null ? Number(p.altitude).toFixed(3).replace('.', ',') : '';
        const conf = (p.nome_confrontante || '').replace(/;/g, ',');

        csvContent += `${ord};"${vertice}";"${tipo}";${norte};${este};${lat};${lon};${alt};"${conf}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${imovelNome}_vertices.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast("Planilha CSV dos vértices baixada com sucesso!", "success");
};

/**
 * Plota os pontos e polilinha no mapa e limpa camadas desnecessárias
 */
const plotMapData = () => {
    if (!mapController || !currentPublicData) return;
    
    let pontos = currentPublicData.pontos || [];
    let segmentos = currentPublicData.segmentos || [];
    
    mapController.clearOverlays();
    mapController.plotPontos(pontos, (id) => (window as any).selecionarPontoPublico(id));
    
    const orgPontos = pontos.filter((p: any) => p.ordem_caminhamento !== null).sort((a: any, b: any) => a.ordem_caminhamento - b.ordem_caminhamento);
    if (orgPontos.length > 0) {
        mapController.plotPolilinhaTemporaria(orgPontos);
    } else {
        mapController.plotSegmentos(segmentos, pontos);
    }
    
    mapController.fitBounds(pontos);
};

/**
 * Mantém o controle de camadas ativo para o usuário alternar entre Satélite e SIGEF,
 * mas oculta as opções de camadas desnecessárias (Homologada e Vizinhos).
 */
const cleanPublicMapLayers = () => {
    if (!mapController?.core?.map) return;
    const map = mapController.core.map;
    const core = mapController.core;

    // Remove grupos de banco de pontos e vizinhos do mapa público
    if (core.bancoPontosGroup && map.hasLayer(core.bancoPontosGroup)) {
        map.removeLayer(core.bancoPontosGroup);
    }
    if (core.pontosVizinhosGroup && map.hasLayer(core.pontosVizinhosGroup)) {
        map.removeLayer(core.pontosVizinhosGroup);
    }

    // Por padrão na abertura, mantém a camada SIGEF desativada para a área abrir limpa
    if (core.sigefLayer && map.hasLayer(core.sigefLayer)) {
        map.removeLayer(core.sigefLayer);
    }

    // Exibe o controle de camadas da direita (Satélite + SIGEF)
    const layerControl = document.querySelector('.leaflet-control-layers');
    if (layerControl) {
        (layerControl as HTMLElement).style.display = 'block';
    }

    // Oculta do controle apenas as opções "Poligonal Homologada" e "Imóveis Vizinhos"
    const layerLabels = document.querySelectorAll('.leaflet-control-layers-overlays label');
    layerLabels.forEach(label => {
        const text = (label as HTMLElement).innerText || '';
        if (text.includes('Homologada') || text.includes('Vizinhos')) {
            (label as HTMLElement).style.display = 'none';
        } else {
            (label as HTMLElement).style.display = 'flex';
        }
    });
};

const updateUI = () => {
    if (!currentPublicData) return;
    
    const pNome = document.getElementById('txt-nome-propriedade-publico');
    if (pNome) pNome.innerHTML = `<i data-lucide="map-pin" class="w-4 h-4 shrink-0 text-mint-vibrant"></i><span class="truncate">${currentPublicData.nome_propriedade || `Levantamento #${currentPublicData.id}`}</span>`;
    
    const pCli = document.getElementById('txt-nome-cliente-publico');
    if (pCli) {
        const proprietarios = currentPublicData.clientes && currentPublicData.clientes.length
          ? currentPublicData.clientes.map((c: any) => `${c.nome_completo}`).join(', ')
          : 'Não informado';
        pCli.innerText = proprietarios;
    }
    
    const pCar = document.getElementById('txt-codigo-car-publico');
    if (pCar) pCar.innerText = currentPublicData.codigo_car || 'N/I';
    
    const pMun = document.getElementById('txt-municipio-publico');
    if (pMun) pMun.innerText = `${currentPublicData.municipio || 'N/I'}/${currentPublicData.uf || 'N/I'}`;
    
    renderTabelas();
    plotMapData();
    cleanPublicMapLayers();
    initIcons();
};


export const compartilhadoRoute: RouteDef = {
  render: () => renderCompartilhado(),
  setup: (codigo?: string | null) => {
    if (!codigo) {
       showToast("Código de compartilhamento inválido.", "error");
       window.location.hash = '#dashboard';
       return;
    }
    
    setupTabs();
    setupResizers();
    setupLocalizadorPontos();

    mapController = new MesaTrabalhoMapa();
    mapController.init('map-container');
    
    setTimeout(() => {
        // Oculta o botão de engrenagem da barra de ferramentas do mapa na visão pública
        const gearBtn = document.querySelector('.unified-toolbar button');
        if (gearBtn) (gearBtn as HTMLElement).style.display = 'none';
        const sep = document.querySelector('.unified-toolbar div');
        if (sep) (sep as HTMLElement).style.display = 'none';
        
        // Limpa camadas WMS e vizinhos
        cleanPublicMapLayers();
        mapController?.invalidateSize();
    }, 120);

    const isLocal = window.location.origin.includes('localhost') || 
                    window.location.origin.includes('127.0.0.1') || 
                    window.location.origin.includes('[::1]');

    const fetchUrl = isLocal 
      ? `${API_BASE}/levantamentos/publico/${codigo}`
      : `${window.location.origin}/api.php?codigo=${codigo}`;

    fetch(fetchUrl)
      .then(res => {
          if (!res.ok) throw new Error("Link inválido ou projeto não localizado na nuvem.");
          return res.json();
      })
      .then(data => {
          currentPublicData = data;
          updateUI();
          initIcons();
      })
      .catch(err => {
          showToast(err.message || "Erro ao carregar projeto compartilhado.", "error");
      });
  }
};
