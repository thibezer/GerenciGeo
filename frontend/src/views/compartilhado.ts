import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, showToast } from '../utils';
import { renderCompartilhado } from './compartilhado_template';
import { MesaTrabalhoMapa } from './mesa_trabalho/mapa/mapa_controller';

let mapController: MesaTrabalhoMapa | null = null;
let currentPublicData: any = null;

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
  const resizerProps = document.getElementById('resizer-propriedades');
  const painelProps = document.getElementById('painel-lateral-propriedades');
  
  if (resizerProps && painelProps) {
     let isDragging = false;
     resizerProps.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
     document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const newWidth = document.body.clientWidth - e.clientX;
        if (newWidth >= 280 && newWidth <= 600) painelProps.style.width = `${newWidth}px`;
     });
     document.addEventListener('mouseup', () => { 
       if (isDragging) { isDragging = false; mapController?.invalidateSize(); } 
     });
  }

  const resizerTabelas = document.getElementById('resizer-tabelas-inferior');
  const painelTabelas = document.getElementById('painel-inferior-tabelas');
  
  if (resizerTabelas && painelTabelas) {
     let isDragging = false;
     resizerTabelas.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
     document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const newHeight = document.body.clientHeight - e.clientY;
        if (newHeight >= 150 && newHeight <= window.innerHeight * 0.8) painelTabelas.style.height = `${newHeight}px`;
     });
     document.addEventListener('mouseup', () => { 
       if (isDragging) { isDragging = false; mapController?.invalidateSize(); } 
     });
  }
};

const renderPropriedadesPonto = (ponto: any) => {
    const container = document.getElementById('container-props-ponto');
    if (!container) return;
    
    if (!ponto) {
        container.innerHTML = '<div class="text-center text-white/30 italic mt-8">Selecione um vértice ou segmento no mapa ou tabela.</div>';
        return;
    }
    
    container.innerHTML = `
        <div class="mb-4">
            <h4 class="font-bold text-mint-vibrant text-sm border-b border-white/10 pb-1 mb-2">Vértice: ${ponto.nome_vertice || `Ponto ${ponto.id}`}</h4>
            <div class="grid grid-cols-2 gap-2 mt-2">
                <div><span class="text-white/40 block">Lat:</span><span class="font-mono text-white">${ponto.lat ? ponto.lat.toFixed(6) : '-'}</span></div>
                <div><span class="text-white/40 block">Lon:</span><span class="font-mono text-white">${ponto.lon ? ponto.lon.toFixed(6) : '-'}</span></div>
                <div><span class="text-white/40 block">Altitude:</span><span class="font-mono text-white">${ponto.altitude || '-'}</span></div>
                <div><span class="text-white/40 block">Tipo:</span><span class="text-white">${ponto.tipo || '-'}</span></div>
            </div>
            ${ponto.nome_confrontante ? `
            <div class="mt-3">
                <span class="text-white/40 block">Confrontante:</span>
                <span class="text-white bg-white/5 px-2 py-1 rounded mt-1 inline-block">${ponto.nome_confrontante}</span>
            </div>` : ''}
        </div>
    `;
};

const renderTabelas = () => {
    const tbodyOrg = document.getElementById('tbody-organizador-publico');
    const tbodyAll = document.getElementById('tbody-todos-pontos-publico');
    if (!tbodyOrg || !tbodyAll || !currentPublicData) return;
    
    const pontos = currentPublicData.pontos || [];
    
    tbodyAll.innerHTML = pontos.map((p: any) => `
        <tr class="hover:bg-white/[0.02] cursor-pointer" onclick="window.selecionarPontoPublico(${p.id})">
            <td class="px-3 py-2 font-mono text-white font-bold">${p.nome_vertice || `P-${p.id}`}</td>
            <td class="px-3 py-2 text-center text-white/60">${p.tipo || '-'}</td>
            <td class="px-3 py-2 font-mono text-white/80">${p.lat ? p.lat.toFixed(6) : '-'}</td>
            <td class="px-3 py-2 font-mono text-white/80">${p.lon ? p.lon.toFixed(6) : '-'}</td>
            <td class="px-3 py-2 font-mono text-white/60">${p.altitude || '-'}</td>
        </tr>
    `).join('');
    
    const orgPontos = pontos.filter((p: any) => p.ordem_caminhamento !== null).sort((a: any, b: any) => a.ordem_caminhamento - b.ordem_caminhamento);
    
    if (orgPontos.length === 0) {
        tbodyOrg.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-white/40 italic">O caminhamento não foi ordenado.</td></tr>';
        return;
    }
    
    const dist = (p1: any, p2: any) => {
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
        orgHtml += `
        <tr class="hover:bg-white/[0.02] cursor-pointer border-b border-white/5" onclick="window.selecionarPontoPublico(${p.id})">
            <td class="px-3 py-2 text-center text-mint-vibrant font-bold">${p.ordem_caminhamento}</td>
            <td class="px-3 py-2 font-mono text-white font-bold">${p.nome_vertice || `P-${p.id}`}</td>
            <td class="px-3 py-2 font-mono text-white/60">${p.lat ? p.lat.toFixed(6) : '-'}</td>
            <td class="px-3 py-2 font-mono text-white/60">${p.lon ? p.lon.toFixed(6) : '-'}</td>
            <td class="px-3 py-2 text-white/80 truncate max-w-[120px]" title="${p.nome_confrontante || ''}">${p.nome_confrontante || '-'}</td>
            <td class="px-3 py-2 text-center font-mono text-white/60">-</td>
            <td class="px-3 py-2 text-center font-mono text-mint-vibrant/80">${distance > 0 ? distance.toFixed(2) : '-'}</td>
        </tr>`;
    }
    tbodyOrg.innerHTML = orgHtml;
};

(window as any).selecionarPontoPublico = (id: number) => {
    if (mapController) {
        mapController.selectPonto(id);
    }
    if (currentPublicData) {
        const p = currentPublicData.pontos.find((x: any) => x.id === id);
        renderPropriedadesPonto(p);
    }
};

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

const updateUI = () => {
    if (!currentPublicData) return;
    
    const pNome = document.getElementById('txt-nome-propriedade-publico');
    if (pNome) pNome.innerText = currentPublicData.nome_propriedade || `Levantamento #${currentPublicData.id}`;
    
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
    
    const selMat = document.getElementById('select-matricula-publico') as HTMLSelectElement;
    if (selMat) {
        selMat.innerHTML = '<option value="">Todos (Área Total)</option>';
        if (currentPublicData.matriculas) {
            currentPublicData.matriculas.forEach((m: any) => {
                selMat.innerHTML += `<option value="${m.id}">${m.numero_matricula || m.num_matricula || m.id}</option>`;
            });
        }
        selMat.onchange = () => {
            // Se precisar filtrar por matrícula, implementar aqui
            plotMapData();
        };
    }
    
    renderTabelas();
    plotMapData();
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

    mapController = new MesaTrabalhoMapa();
    mapController.init('map-container');
    
    setTimeout(() => mapController?.invalidateSize(), 100);

    fetch(`${API_BASE}/levantamentos/publico/${codigo}`)
      .then(res => {
          if (!res.ok) throw new Error("Link inválido ou expirado.");
          return res.json();
      })
      .then(data => {
          currentPublicData = data;
          updateUI();
          initIcons();
      })
      .catch(err => {
          showToast(err.message, "error");
          window.location.hash = '#dashboard';
      });
  },
  cleanup: () => {
    if (mapController) {
      mapController.destroy();
      mapController = null;
    }
    currentPublicData = null;
    delete (window as any).selecionarPontoPublico;
  }
};
