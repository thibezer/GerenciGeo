import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, showToast, formatUTM, escapeHtml } from '../utils';
import { renderCompartilhado } from './compartilhado_template';
let mapController: any = null;
let currentPublicData: any = null;
let currentSelectedPointId: number | null = null;

const setupTabs = () => {
    const tabBtns = document.querySelectorAll('.tab-btn-publico');
    const tabPanes = document.querySelectorAll('.tab-pane-publico');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const alvo = e.currentTarget as HTMLElement;
            const targetId = alvo.getAttribute('data-target');
            
            tabBtns.forEach(b => {
                b.classList.remove('border-mint-vibrant', 'text-mint-vibrant');
                b.classList.add('border-transparent', 'text-white/40');
            });
            alvo.classList.remove('border-transparent', 'text-white/40');
            alvo.classList.add('border-mint-vibrant', 'text-mint-vibrant');
            
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

/** Distância em metros entre dois pontos: UTM quando houver, senão haversine em lat/lon. */
const distanciaMetros = (p1: any, p2: any): number => {
    if (p1.este && p1.norte && p2.este && p2.norte) {
        return Math.hypot(p2.este - p1.este, p2.norte - p1.norte);
    }
    if (!p1.lat || !p1.lon || !p2.lat || !p2.lon) return 0;
    const R = 6371e3;
    const f1 = p1.lat * Math.PI / 180;
    const f2 = p2.lat * Math.PI / 180;
    const df = (p2.lat - p1.lat) * Math.PI / 180;
    const dl = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Vértices do perímetro na ordem de caminhamento (ou na ordem recebida, se não houver sequência salva). */
const pontosDoPerimetro = (): any[] => {
    const pontos = currentPublicData?.pontos || [];
    const ordenados = pontos
        .filter((p: any) => p.ordem_caminhamento !== null && p.ordem_caminhamento !== undefined && p.ordem_caminhamento !== 0)
        .sort((a: any, b: any) => a.ordem_caminhamento - b.ordem_caminhamento);
    return ordenados.length > 0 ? ordenados : pontos;
};

/** Perímetro (m) e área aproximada (ha, fórmula do cadarço em UTM) a partir dos vértices exibidos. */
const calcularResumo = () => {
    const perimetro = pontosDoPerimetro();
    let comprimento = 0;
    for (let i = 0; i < perimetro.length; i++) {
        comprimento += distanciaMetros(perimetro[i], perimetro[(i + 1) % perimetro.length]);
    }
    let areaHa: number | null = null;
    const utm = perimetro.filter((p: any) => p.este != null && p.norte != null);
    if (utm.length >= 3 && utm.length === perimetro.length) {
        let soma = 0;
        for (let i = 0; i < utm.length; i++) {
            const a = utm[i];
            const b = utm[(i + 1) % utm.length];
            soma += a.este * b.norte - b.este * a.norte;
        }
        areaHa = Math.abs(soma) / 2 / 10000;
    }
    return { comprimento, areaHa, totalVertices: (currentPublicData?.pontos || []).length };
};

const setTituloPainel = (icone: string, texto: string) => {
    const t = document.getElementById('titulo-painel-lateral');
    if (t) t.innerHTML = `<i data-lucide="${icone}" class="w-4 h-4 text-mint-vibrant"></i>${escapeHtml(texto)}`;
};

/** Painel lateral padrão: dados do imóvel em linguagem simples, sem precisar clicar em nada. */
const renderResumoImovel = () => {
    const container = document.getElementById('container-props-ponto');
    if (!container || !currentPublicData) return;
    setTituloPainel('info', 'Resumo do imóvel');

    const d = currentPublicData;
    const { comprimento, areaHa, totalVertices } = calcularResumo();
    const fmt = (n: number, c = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });

    const confrontantes: string[] = Array.from(new Set<string>(
        (d.pontos || []).map((p: any) => String(p.nome_confrontante || '').trim()).filter((s: string) => s.length > 0)
    ));
    const proprietarios = (d.clientes || []).map((c: any) => escapeHtml(c.nome_completo)).join('<br>') || 'Não informado';
    const matriculas = (d.matriculas || []).map((m: any) => m.numero_matricula || m.numero).filter(Boolean);

    // Uma única caixa: células separadas por linhas finas (gap-px sobre fundo de borda), não quatro caixas soltas
    const celula = (rotulo: string, valor: string) => `
        <div class="bg-[#0c120f] p-2.5 min-w-0">
            <span class="text-[11px] uppercase font-bold tracking-wider text-white/50 block">${rotulo}</span>
            <span class="text-sm font-bold text-white break-words">${valor}</span>
        </div>`;

    container.innerHTML = `
        <div class="space-y-3">
            <div class="grid grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-lg overflow-hidden">
                ${celula('Área aproximada', areaHa != null ? `${fmt(areaHa, 4)} ha` : '—')}
                ${celula('Perímetro', comprimento > 0 ? `${fmt(comprimento)} m` : '—')}
                ${celula('Vértices', String(totalVertices))}
                ${celula('Município', escapeHtml(`${d.municipio || 'N/I'}/${d.uf || ''}`))}
            </div>
            <div class="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
                <div>
                    <span class="text-[11px] uppercase font-bold tracking-wider text-white/50 block">Proprietário(s)</span>
                    <span class="text-white">${proprietarios}</span>
                </div>
                ${matriculas.length ? `<div><span class="text-[11px] uppercase font-bold tracking-wider text-white/50 block">Matrícula(s)</span><span class="text-white font-mono">${escapeHtml(matriculas.join(', '))}</span></div>` : ''}
                ${d.codigo_car ? `<div><span class="text-[11px] uppercase font-bold tracking-wider text-white/50 block">CAR</span><span class="text-white/90 font-mono text-[11px] break-all">${escapeHtml(d.codigo_car)}</span></div>` : ''}
                ${confrontantes.length ? `
                <div class="border-t border-white/10 pt-2">
                    <span class="text-[11px] uppercase font-bold tracking-wider text-white/50 block mb-1.5">Confrontantes</span>
                    <ul class="space-y-1 text-white/90">${confrontantes.map(c => `<li class="flex gap-1.5"><span class="text-mint-vibrant">•</span><span>${escapeHtml(c)}</span></li>`).join('')}</ul>
                </div>` : ''}
            </div>
            <p class="text-[11px] text-white/50 leading-relaxed flex gap-2 items-start">
                <i data-lucide="crosshair" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>
                <span>Toque em um vértice no mapa para ver suas coordenadas. A área é calculada a partir dos vértices e pode diferir da área registrada em matrícula.</span>
            </p>
        </div>`;
    initIcons();
};

(window as any).voltarResumoPublico = () => {
    currentSelectedPointId = null;
    renderResumoImovel();
    renderTabelas();
};

/**
 * Renderiza o painel lateral com detalhes completos do ponto selecionado e botões de navegação
 */
const renderPropriedadesPonto = (ponto: any) => {
    const container = document.getElementById('container-props-ponto');
    if (!container) return;
    
    if (!ponto) {
        renderResumoImovel();
        return;
    }
    setTituloPainel('crosshair', 'Vértice selecionado');

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

    const norteTxt = ponto.norte != null ? formatUTM(Number(ponto.norte)) : (ponto.lat != null ? Number(ponto.lat).toFixed(6) : '—');
    const esteTxt = ponto.este != null ? formatUTM(Number(ponto.este)) : (ponto.lon != null ? Number(ponto.lon).toFixed(6) : '—');
    const latTxt = ponto.lat != null ? Number(ponto.lat).toFixed(6) : '—';
    const lonTxt = ponto.lon != null ? Number(ponto.lon).toFixed(6) : '—';
    const altTxt = ponto.altitude != null ? `${Number(ponto.altitude).toFixed(3)} m` : '—';

    container.innerHTML = `
        <div class="space-y-4">
            <!-- UMA ÚNICA CAIXA: identificação, navegação, coordenadas e confrontante -->
            <div class="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-3">
                <button onclick="window.voltarResumoPublico()" class="text-[12px] text-mint-vibrant hover:underline flex items-center gap-1 cursor-pointer" aria-label="Voltar ao resumo do imóvel">
                    <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i> Voltar ao resumo
                </button>

                <div>
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[11px] uppercase font-bold tracking-wider text-white/50">Vértice</span>
                        <span class="text-[11px] font-bold px-2 py-0.5 rounded border ${tipoInfo.bg}">${tipoInfo.label}</span>
                    </div>
                    <h4 class="font-mono text-base font-bold text-mint-vibrant tracking-tight flex items-center justify-between gap-2">
                        <span class="break-all">${escapeHtml(ponto.nome_vertice) || `Ponto ${ponto.id}`}</span>
                        ${ponto.ordem_caminhamento ? `<span class="text-xs text-white/50 font-sans font-normal shrink-0">Ordem ${ponto.ordem_caminhamento}</span>` : ''}
                    </h4>
                    <div class="flex items-center justify-between gap-2 mt-2">
                        <button onclick="window.selecionarPontoPublico(${prevPonto?.id})" aria-label="Vértice anterior" class="flex-1 px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[12px] text-white/80 hover:text-white flex items-center justify-center gap-1 cursor-pointer">
                            <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i><span>Anterior</span>
                        </button>
                        <button onclick="window.selecionarPontoPublico(${nextPonto?.id})" aria-label="Próximo vértice" class="flex-1 px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[12px] text-white/80 hover:text-white flex items-center justify-center gap-1 cursor-pointer">
                            <span>Próximo</span><i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>

                <div class="border-t border-white/10 pt-3">
                    <span class="text-[11px] uppercase font-bold tracking-wider text-white/50 block mb-1.5">Coordenadas em metros (UTM)</span>
                    <div class="grid grid-cols-2 gap-3 text-xs">
                        <div><span class="text-[11px] text-white/50 block">Norte</span><span class="font-mono text-white font-bold">${norteTxt}</span></div>
                        <div><span class="text-[11px] text-white/50 block">Este</span><span class="font-mono text-white font-bold">${esteTxt}</span></div>
                    </div>
                </div>

                <div class="border-t border-white/10 pt-3">
                    <span class="text-[11px] uppercase font-bold tracking-wider text-white/50 block mb-1.5">Coordenadas em graus</span>
                    <div class="grid grid-cols-2 gap-3 text-xs">
                        <div><span class="text-[11px] text-white/50 block">Latitude</span><span class="font-mono text-white">${latTxt}</span></div>
                        <div><span class="text-[11px] text-white/50 block">Longitude</span><span class="font-mono text-white">${lonTxt}</span></div>
                    </div>
                </div>

                <div class="border-t border-white/10 pt-3 flex items-center justify-between gap-2">
                    <span class="text-white/50 text-[11px] uppercase font-bold tracking-wider">Altitude</span>
                    <span class="font-mono text-mint-vibrant font-bold text-xs">${altTxt}</span>
                </div>

                ${ponto.nome_confrontante ? `
                <div class="border-t border-white/10 pt-3">
                    <span class="text-white/50 text-[11px] uppercase font-bold tracking-wider block mb-1">Confrontante</span>
                    <div class="text-white text-xs leading-snug">${escapeHtml(ponto.nome_confrontante)}</div>
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
    renderTabelasBase();
    aplicarFiltroBusca();
};

/** Esconde as linhas que não casam com o texto digitado (reaplicado a cada re-render das tabelas). */
const aplicarFiltroBusca = () => {
    const input = document.getElementById('input-busca-ponto-publico') as HTMLInputElement | null;
    const term = (input?.value || '').trim().toLowerCase();
    document.getElementById('btn-limpar-busca-publico')?.classList.toggle('hidden', term.length === 0);
    ['tbody-organizador-publico', 'tbody-todos-pontos-publico'].forEach(id => {
        document.getElementById(id)?.querySelectorAll('tr').forEach(row => {
            (row as HTMLElement).style.display = (row.textContent || '').toLowerCase().includes(term) ? '' : 'none';
        });
    });
};

const renderTabelasBase = () => {
    const tbodyOrg = document.getElementById('tbody-organizador-publico');
    const tbodyAll = document.getElementById('tbody-todos-pontos-publico');
    if (!tbodyOrg || !tbodyAll || !currentPublicData) return;
    
    const pontos = currentPublicData.pontos || [];
    
    // Atualiza contador de pontos
    const txtCount = document.getElementById('badge-total-vertices');
    if (txtCount) txtCount.innerText = `${pontos.length} vértices`;
    
    tbodyAll.innerHTML = pontos.map((p: any) => {
        const norte = p.norte != null ? formatUTM(Number(p.norte)) : (p.lat != null ? Number(p.lat).toFixed(6) : '—');
        const este = p.este != null ? formatUTM(Number(p.este)) : (p.lon != null ? Number(p.lon).toFixed(6) : '—');
        const isSelected = p.id === currentSelectedPointId;
        const rowClass = isSelected 
            ? 'bg-mint-vibrant/20 border-l-4 border-mint-vibrant text-white font-bold' 
            : 'hover:bg-white/[0.04] border-b border-white/5 text-white/80';

        return `
        <tr id="row-ponto-all-${p.id}" class="${rowClass} cursor-pointer transition-colors" onclick="window.selecionarPontoPublico(${p.id})">
            <td class="px-3 py-2 font-mono font-bold ${isSelected ? 'text-mint-vibrant' : 'text-white'}">${escapeHtml(p.nome_vertice) || `P-${p.id}`}</td>
            <td class="px-3 py-2 text-center font-mono text-white/60">${escapeHtml(p.tipo) || '-'}</td>
            <td class="px-3 py-2 font-mono">${norte}</td>
            <td class="px-3 py-2 font-mono">${este}</td>
            <td class="px-3 py-2 text-center font-mono text-white/60">${p.altitude != null ? Number(p.altitude).toFixed(2) : '—'}</td>
        </tr>`;
    }).join('');
    
    const orgPontos = pontos.filter((p: any) => p.ordem_caminhamento != null && Number(p.ordem_caminhamento) !== 0).sort((a: any, b: any) => a.ordem_caminhamento - b.ordem_caminhamento);

    if (orgPontos.length === 0) {
        tbodyOrg.innerHTML = '<tr><td colspan="6" class="text-center p-6 text-white/40 italic">O caminhamento não possui sequência de ordem salva.</td></tr>';
        return;
    }
    
    const dist = distanciaMetros;

    let orgHtml = '';
    for (let i = 0; i < orgPontos.length; i++) {
        const p = orgPontos[i];
        const pNext = orgPontos[(i + 1) % orgPontos.length];
        const distance = dist(p, pNext);
        const norte = p.norte != null ? formatUTM(Number(p.norte)) : (p.lat != null ? Number(p.lat).toFixed(6) : '—');
        const este = p.este != null ? formatUTM(Number(p.este)) : (p.lon != null ? Number(p.lon).toFixed(6) : '—');
        const isSelected = p.id === currentSelectedPointId;

        const rowClass = isSelected 
            ? 'bg-mint-vibrant/20 border-l-4 border-mint-vibrant text-white font-bold' 
            : 'hover:bg-white/[0.04] border-b border-white/5 text-white/80';

        orgHtml += `
        <tr id="row-ponto-org-${p.id}" class="${rowClass} cursor-pointer transition-colors" onclick="window.selecionarPontoPublico(${p.id})">
            <td class="px-3 py-2 text-center text-mint-vibrant font-bold font-mono">${p.ordem_caminhamento}</td>
            <td class="px-3 py-2 font-mono font-bold ${isSelected ? 'text-mint-vibrant' : 'text-white'}">${escapeHtml(p.nome_vertice) || `P-${p.id}`}</td>
            <td class="px-3 py-2 font-mono">${norte}</td>
            <td class="px-3 py-2 font-mono">${este}</td>
            <td class="px-3 py-2 text-white/80 truncate max-w-[180px]" title="${escapeHtml(p.nome_confrontante)}">${escapeHtml(p.nome_confrontante) || '—'}</td>
            <td class="px-3 py-2 text-center font-mono text-mint-vibrant/90 font-bold">${distance > 0 ? distance.toFixed(2) : '—'}</td>
        </tr>`;
    }
    tbodyOrg.innerHTML = orgHtml;
};

/**
 * Destaca e pulsa o ponto selecionado no mapa (Localizador Visual Canvas)
 */
const highlightPointOnCanvas = (p: any) => {
    if (!mapController || !p) return;
    if (typeof mapController.destacarElemento === 'function') {
        mapController.destacarElemento(p.id, { pan: true, zoom: 21, duracaoMs: 4000 });
    } else if (typeof mapController.selectPonto === 'function') {
        mapController.selectPonto(p.id, 21);
    }
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

    // No celular as tabelas ocupam a tela toda: ao escolher um vértice, volta ao mapa
    if (window.matchMedia('(max-width: 767px)').matches) {
        document.getElementById('btn-fechar-tabelas')?.click();
        return;
    }

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

    const filtrarPontos = aplicarFiltroBusca;

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
    csvContent += "Ordem;Vértice;Tipo;Norte;Este;Latitude;Longitude;Altitude (m);Confrontante\n";

    pontos.forEach((p: any) => {
        const ord = p.ordem_caminhamento != null ? p.ordem_caminhamento : '';
        const vertice = p.nome_vertice || `P-${p.id}`;
        const tipo = p.tipo || p.tipo_ponto || '';
        const norte = p.norte != null ? Number(p.norte).toFixed(3).replace('.', ',') : '';
        const este = p.este != null ? Number(p.este).toFixed(3).replace('.', ',') : '';
        const lat = p.lat != null ? Number(p.lat).toFixed(6).replace('.', ',') : '';
        const lon = p.lon != null ? Number(p.lon).toFixed(6).replace('.', ',') : '';
        const alt = p.altitude != null ? Number(p.altitude).toFixed(3).replace('.', ',') : '';
        const txt = (v: any) => {
            let t = String(v ?? '');
            if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // evita que o Excel execute texto como fórmula
            return '"' + t.replace(/"/g, '""') + '"';
        };

        csvContent += `${ord};${txt(vertice)};${txt(tipo)};${norte};${este};${lat};${lon};${alt};${txt(p.nome_confrontante)}\r\n`;
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
    mapController.plotPontos(pontos, (id: number) => (window as any).selecionarPontoPublico(id));
    
    // Segmentos referenciam vértices por id; com planilha de cartório os ids mudam, então só vale o que casa
    const idsPontos = new Set(pontos.map((p: any) => Number(p.id)));
    segmentos = segmentos.filter((sg: any) => idsPontos.has(Number(sg.ponto_inicio_id)) && idsPontos.has(Number(sg.ponto_fim_id)));
    if (segmentos.length > 0) {
        mapController.plotSegmentos(segmentos, pontos);
    } else {
        const orgPontos = pontos.filter((p: any) => p.ordem_caminhamento != null && Number(p.ordem_caminhamento) !== 0).sort((a: any, b: any) => a.ordem_caminhamento - b.ordem_caminhamento);
        mapController.plotPolilinhaTemporaria(orgPontos.length > 0 ? orgPontos : pontos);
    }
    
    mapController.fitBounds(pontos);
};

/**
 * Mantém o controle de camadas ativo para o usuário alternar entre Satélite e SIGEF,
 * mas oculta as opções de camadas desnecessárias (Homologada e Vizinhos).
 */
const cleanPublicMapLayers = () => {
    // Com o ui-canvas-cad, camadas e ferramentas são auto-gerenciadas
};

const updateUI = () => {
    if (!currentPublicData) return;
    
    const pNome = document.getElementById('txt-nome-propriedade-publico');
    if (pNome) pNome.innerText = currentPublicData.nome_propriedade || `Levantamento #${currentPublicData.id}`;
    document.title = `${currentPublicData.nome_propriedade || 'Imóvel'} — GerenciGeo`;

    const pCli = document.getElementById('txt-nome-cliente-publico');
    if (pCli) {
        const proprietarios = currentPublicData.clientes && currentPublicData.clientes.length
          ? currentPublicData.clientes.map((c: any) => `${c.nome_completo}`).join(', ')
          : 'Não informado';
        pCli.innerText = proprietarios;
    }

    const pMun = document.getElementById('txt-municipio-publico');
    if (pMun) pMun.innerText = `${currentPublicData.municipio || 'N/I'}/${currentPublicData.uf || 'N/I'}`;

    renderTabelas();
    renderResumoImovel();
    plotMapData();
    cleanPublicMapLayers();
    initIcons();
};


const PIN_STORAGE_PREFIX = 'gg_pub_pin_';

/**
 * O mapa é o mesmo componente da mesa de trabalho. Para o cliente, esconde o que ele não sabe usar:
 * painel de camadas, snap, limpar seleção e a barra de coordenadas. Fica só o botão de enquadrar.
 */
const CSS_MAPA_PUBLICO = `
  #qgis-layer-panel, #btn-toggle-layers, #btn-toggle-snap, #btn-clear-selection, #cad-coordenadas-hud { display: none !important; }
`;
const limparMapaPublico = (tentativas = 0) => {
    const el = document.getElementById('map-container');
    const sr = el?.shadowRoot;
    if (!sr) {
        if (tentativas < 100) setTimeout(() => limparMapaPublico(tentativas + 1), 50);
        return;
    }
    if (sr.getElementById('estilo-mapa-publico')) return;
    const estilo = document.createElement('style');
    estilo.id = 'estilo-mapa-publico';
    estilo.textContent = CSS_MAPA_PUBLICO;
    sr.appendChild(estilo);
};

/** Tela cheia para PIN, link expirado, link inválido ou erro de conexão. */
const mostrarEstado = (icone: string, titulo: string, texto: string, extraHtml = '') => {
    const caixa = document.getElementById('pub-estado');
    const conteudo = document.getElementById('pub-estado-conteudo');
    if (!caixa || !conteudo) return;
    conteudo.innerHTML = `
        <div class="w-14 h-14 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-mint-vibrant">
            <i data-lucide="${icone}" class="w-7 h-7"></i>
        </div>
        <h2 class="text-lg font-bold text-white">${escapeHtml(titulo)}</h2>
        <p class="text-sm text-white/60 leading-relaxed">${escapeHtml(texto)}</p>
        ${extraHtml}`;
    caixa.classList.remove('hidden');
    initIcons();
};

const esconderEstado = () => document.getElementById('pub-estado')?.classList.add('hidden');

const mostrarFormularioPin = (codigo: string, erro = '') => {
    mostrarEstado('lock', 'Link protegido', 'Digite o PIN que o responsável técnico enviou junto com o link.', `
        <form id="form-pin-publico" class="space-y-3">
            <input id="input-pin-publico" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="PIN"
                   class="w-full text-center tracking-[0.4em] text-lg bg-black/40 border border-white/15 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-mint-vibrant" />
            ${erro ? `<p class="text-xs text-rose-400">${escapeHtml(erro)}</p>` : ''}
            <button type="submit" class="w-full py-2.5 bg-mint-vibrant text-black font-bold rounded-lg text-sm cursor-pointer">Abrir mapa</button>
        </form>`);
    const form = document.getElementById('form-pin-publico') as HTMLFormElement | null;
    const input = document.getElementById('input-pin-publico') as HTMLInputElement | null;
    input?.focus();
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = (input?.value || '').trim();
        if (pin) carregarLevantamento(codigo, pin);
    });
};

const carregarLevantamento = async (codigo: string, pin = '') => {
    const isLocal = window.location.origin.includes('localhost') ||
                    window.location.origin.includes('127.0.0.1') ||
                    window.location.origin.includes('[::1]');
    const fetchUrl = isLocal
      ? `${API_BASE}/levantamentos/publico/${encodeURIComponent(codigo)}`
      : `${window.location.origin}/api.php?codigo=${encodeURIComponent(codigo)}`;

    let pinSalvo = pin;
    if (!pinSalvo) {
        try { pinSalvo = sessionStorage.getItem(PIN_STORAGE_PREFIX + codigo) || ''; } catch { /* sem storage */ }
    }

    try {
        const res = await fetch(fetchUrl, { headers: pinSalvo ? { 'X-Share-Pin': pinSalvo } : {} });
        if (res.ok) {
            if (pinSalvo) { try { sessionStorage.setItem(PIN_STORAGE_PREFIX + codigo, pinSalvo); } catch { /* sem storage */ } }
            currentPublicData = await res.json();
            esconderEstado();
            updateUI();
            requestAnimationFrame(() => mapController?.invalidateSize?.());
            return;
        }
        const corpo: any = await res.json().catch(() => ({}));
        if (res.status === 401) {
            try { sessionStorage.removeItem(PIN_STORAGE_PREFIX + codigo); } catch { /* sem storage */ }
            mostrarFormularioPin(codigo, pin ? 'PIN incorreto. Tente novamente.' : '');
        } else if (res.status === 429) {
            mostrarEstado('timer', 'Muitas tentativas', corpo.error || corpo.detail || 'Aguarde alguns minutos e tente novamente.');
        } else if (res.status === 410) {
            mostrarEstado('clock', 'Link expirado', 'Este link não está mais disponível. Peça um novo link ao responsável técnico.');
        } else if (res.status === 404) {
            mostrarEstado('alert-circle', 'Link indisponível', 'Este link é inválido ou foi desativado. Confira com o responsável técnico.');
        } else {
            mostrarEstado('alert-triangle', 'Não foi possível abrir', corpo.error || corpo.detail || 'Erro ao carregar o projeto. Tente novamente em instantes.',
                `<button onclick="location.reload()" class="px-4 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-sm cursor-pointer">Tentar novamente</button>`);
        }
    } catch {
        mostrarEstado('alert-triangle', 'Sem conexão', 'Verifique sua internet e tente novamente.',
            `<button onclick="location.reload()" class="px-4 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-sm cursor-pointer">Tentar novamente</button>`);
    }
};

/** Mostra/oculta as tabelas; por padrão o cliente vê só o mapa e o resumo. */
const setupAlternarTabelas = () => {
    const btn = document.getElementById('btn-alternar-tabelas');
    const area = document.getElementById('area-tabelas-publico');
    const definir = (aberta: boolean) => {
        if (!area) return;
        area.classList.toggle('hidden', !aberta);
        area.classList.toggle('flex', aberta);
        btn?.classList.toggle('border-mint-vibrant', aberta);
        setTimeout(() => mapController?.invalidateSize?.(), 50);
    };
    btn?.addEventListener('click', () => definir(area?.classList.contains('hidden') ?? false));
    document.getElementById('btn-fechar-tabelas')?.addEventListener('click', () => definir(false));
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
    setupAlternarTabelas();
    initIcons();

    mapController = document.getElementById('map-container') as any;
    limparMapaPublico();
    carregarLevantamento(codigo);
  }
};
