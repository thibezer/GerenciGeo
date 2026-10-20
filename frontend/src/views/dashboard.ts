/**
 * views/dashboard.ts — Controller do Panorama Operacional / Dashboard.
 */
import L from 'leaflet';
import type { RouteDef } from '../types';
import { initIcons, showToast } from '../utils';
import { renderDashboardTemplate } from './dashboard/dashboard_template';
import {
  fetchStatus,
  fetchAlerts,
  fetchGeometrias,
  downloadLocalShapefile,
  concluirPendencia,
  criarPendenciaRapida,
  excluirPendencia
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

    // 2. Action Center Híbrido: Auditoria, Ações Rápidas e Resolução Direta
    let todosAlertas: any[] = [];
    let filtroAtual = 'TODOS';

    const renderizarAlertas = () => {
      const container = document.getElementById('alerts-container');
      if (!container) return;

      const totalTodos = todosAlertas.length;
      const totalCriticos = todosAlertas.filter(a => a.tipo === 'CRITICO').length;
      const totalAvisos = todosAlertas.filter(a => a.tipo === 'ALERTA').length;
      const totalTarefas = todosAlertas.filter(a => a.tipo === 'MANUAL').length;

      // Atualiza contadores dos filtros e abas
      const elCountTodos = document.getElementById('count-todos');
      const elCountCriticos = document.getElementById('count-criticos');
      const elCountAvisos = document.getElementById('count-avisos');
      const elCountTarefas = document.getElementById('count-tarefas');
      const elTabBadge = document.getElementById('tab-badge-alertas');
      const elActionBadge = document.getElementById('action-center-badge');

      if (elCountTodos) elCountTodos.innerText = totalTodos.toString();
      if (elCountCriticos) elCountCriticos.innerText = totalCriticos.toString();
      if (elCountAvisos) elCountAvisos.innerText = totalAvisos.toString();
      if (elCountTarefas) elCountTarefas.innerText = totalTarefas.toString();
      if (elTabBadge) elTabBadge.innerText = totalTodos.toString();

      if (elActionBadge) {
        if (totalCriticos > 0) {
          elActionBadge.className = 'text-[9px] font-mono px-1.5 py-0.5 rounded-full font-bold bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse';
          elActionBadge.innerText = `${totalCriticos} crítico${totalCriticos > 1 ? 's' : ''}`;
        } else if (totalTodos > 0) {
          elActionBadge.className = 'text-[9px] font-mono px-1.5 py-0.5 rounded-full font-bold bg-mint-vibrant/15 text-mint-vibrant border border-mint-vibrant/30';
          elActionBadge.innerText = `${totalTodos} pendente${totalTodos > 1 ? 's' : ''}`;
        } else {
          elActionBadge.className = 'text-[9px] font-mono px-1.5 py-0.5 rounded-full font-bold bg-white/5 text-white/40 border border-white/10';
          elActionBadge.innerText = 'Em dia';
        }
      }

      // Aplica o filtro selecionado
      const filtrados = todosAlertas.filter(alert => {
        if (filtroAtual === 'TODOS') return true;
        return alert.tipo === filtroAtual;
      });

      if (filtrados.length === 0) {
        container.innerHTML = `
          <div class="py-8 text-center text-white/40 flex flex-col items-center justify-center gap-2">
            <div class="w-9 h-9 rounded-full bg-mint-vibrant/10 border border-mint-vibrant/25 flex items-center justify-center text-mint-vibrant shadow-inner">
              <i data-lucide="check-circle-2" class="w-4.5 h-4.5"></i>
            </div>
            <div>
              <p class="text-xs font-bold text-white/80">Tudo em ordem!</p>
              <p class="text-[10px] text-white/40 max-w-[220px] mt-0.5 leading-relaxed">
                Nenhum alerta ou pendência técnica no filtro selecionado.
              </p>
            </div>
          </div>
        `;
        initIcons();
        return;
      }

      container.innerHTML = filtrados.map(alert => {
        const id = alert.id;
        const tipo = sanitizeHtml(alert.tipo || 'ALERTA');
        const titulo = sanitizeHtml(alert.titulo || (tipo === 'MANUAL' ? 'Tarefa Operacional' : tipo));
        const mensagem = sanitizeHtml(alert.mensagem || '');
        const icone = alert.icone || (tipo === 'CRITICO' ? 'alert-circle' : (tipo === 'MANUAL' ? 'check-square' : 'alert-circle'));
        
        let cardStyle = 'border-l-4 border-l-amber-500 bg-amber-500/[0.03] border-white/5';
        let badgeHtml = '<span class="text-[8.5px] font-mono px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">AVISO</span>';
        let iconColor = 'text-amber-400';

        if (tipo === 'CRITICO') {
          cardStyle = 'border-l-4 border-l-red-500 bg-red-500/[0.04] border-white/5';
          badgeHtml = '<span class="text-[8.5px] font-mono px-1.5 py-0.2 rounded font-bold bg-red-500/20 text-red-400 border border-red-500/30">CRÍTICO</span>';
          iconColor = 'text-red-400';
        } else if (tipo === 'MANUAL') {
          const prioridade = alert.prioridade || 'MEDIA';
          const isAlta = prioridade === 'ALTA';
          cardStyle = isAlta 
            ? 'border-l-4 border-l-red-500 bg-red-500/[0.03] border-white/5' 
            : 'border-l-4 border-l-mint-vibrant bg-mint-vibrant/[0.03] border-white/5';
          badgeHtml = `<span class="text-[8.5px] font-mono px-1.5 py-0.2 rounded font-bold ${isAlta ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-mint-vibrant/20 text-mint-vibrant border border-mint-vibrant/30'}">${isAlta ? 'URGENTE' : 'TAREFA'}</span>`;
          iconColor = isAlta ? 'text-red-400' : 'text-mint-vibrant';
        }

        // Renderiza botões de ação contextuais
        let acoesHtml = '';
        if (tipo === 'MANUAL' && id) {
          acoesHtml = `
            <div class="flex items-center gap-1.5 shrink-0 ml-auto">
              <button class="btn-concluir-alerta px-2 py-0.8 bg-mint-vibrant/10 hover:bg-mint-vibrant/25 border border-mint-vibrant/30 text-mint-vibrant hover:text-white rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm" data-id="${id}" title="Marcar como concluída">
                <i data-lucide="check" class="w-3 h-3"></i>
                <span>Concluir</span>
              </button>
              <button class="btn-excluir-alerta p-1 text-white/30 hover:text-red-400 rounded transition-colors cursor-pointer" data-id="${id}" title="Excluir tarefa">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            </div>
          `;
        } else if (alert.acao) {
          const destino = alert.acao.destino || '#levantamentos';
          const rotulo = sanitizeHtml(alert.acao.rotulo || 'Ver');
          const levId = alert.acao.levantamento_id ? String(alert.acao.levantamento_id) : '';
          acoesHtml = `
            <div class="flex items-center gap-1.5 shrink-0 ml-auto">
              <button class="btn-acao-alerta px-2 py-0.8 bg-white/5 hover:bg-white/10 hover:border-mint-vibrant/40 border border-white/10 text-white/80 hover:text-white rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm group" data-destino="${destino}" data-lev="${levId}" title="Executar ação recomendada">
                <span>${rotulo}</span>
                <i data-lucide="arrow-right" class="w-3 h-3 text-mint-vibrant group-hover:translate-x-0.5 transition-transform"></i>
              </button>
            </div>
          `;
        }

        return `
          <div class="p-2.5 rounded-lg border ${cardStyle} transition-all hover:bg-white/[0.04] space-y-1.5">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <i data-lucide="${icone}" class="w-3.5 h-3.5 ${iconColor} shrink-0"></i>
                <h5 class="text-xs font-bold text-white tracking-tight truncate">${titulo}</h5>
              </div>
              <div class="shrink-0">
                ${badgeHtml}
              </div>
            </div>
            <p class="text-[10.5px] text-white/60 leading-relaxed font-sans">${mensagem}</p>
            ${acoesHtml ? `<div class="pt-1 border-t border-white/5 flex items-center">${acoesHtml}</div>` : ''}
          </div>
        `;
      }).join('');

      initIcons();

      // Vincula eventos dos botões de concluir tarefa
      container.querySelectorAll<HTMLElement>('.btn-concluir-alerta').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = Number(btn.getAttribute('data-id'));
          if (!id) return;
          btn.setAttribute('disabled', 'true');
          btn.classList.add('opacity-50', 'pointer-events-none');
          try {
            await concluirPendencia(id);
            showToast('Tarefa concluída!', 'success');
            todosAlertas = todosAlertas.filter(a => !(a.tipo === 'MANUAL' && a.id === id));
            renderizarAlertas();
          } catch (err: any) {
            btn.removeAttribute('disabled');
            btn.classList.remove('opacity-50', 'pointer-events-none');
            showToast(err.message || 'Erro ao concluir tarefa.', 'error');
          }
        });
      });

      // Vincula eventos dos botões de excluir tarefa
      container.querySelectorAll<HTMLElement>('.btn-excluir-alerta').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = Number(btn.getAttribute('data-id'));
          if (!id) return;
          if (!confirm('Deseja excluir esta tarefa?')) return;
          btn.setAttribute('disabled', 'true');
          try {
            await excluirPendencia(id);
            showToast('Tarefa excluída!', 'info');
            todosAlertas = todosAlertas.filter(a => !(a.tipo === 'MANUAL' && a.id === id));
            renderizarAlertas();
          } catch (err: any) {
            showToast(err.message || 'Erro ao excluir tarefa.', 'error');
          }
        });
      });

      // Vincula eventos de navegação para a ação recomendada
      container.querySelectorAll<HTMLElement>('.btn-acao-alerta').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const destino = btn.getAttribute('data-destino');
          const levId = btn.getAttribute('data-lev');
          if (levId) {
            try {
              sessionStorage.setItem('gerencigeo_focus_levantamento', levId);
            } catch (err) {}
          }
          if (destino) {
            window.location.hash = destino;
          }
        });
      });
    };

    const carregarAlertas = async (showSuccessToast = false) => {
      try {
        const data = await fetchAlerts();
        todosAlertas = data.alerts || [];
        renderizarAlertas();
        if (showSuccessToast) {
          showToast('Auditoria atualizada.', 'info');
        }
      } catch (err) {
        console.error('[Dashboard] Erro ao carregar alertas:', err);
        const container = document.getElementById('alerts-container');
        if (container) {
          container.innerHTML = `<div class="p-6 text-center text-red-400 text-xs py-4">Erro ao carregar auditoria. Tente novamente.</div>`;
        }
      }
    };

    // Dispara a carga inicial dos alertas
    carregarAlertas();

    // Alternância de Abas: Auditoria vs Ações Rápidas
    const tabAlertas = document.getElementById('tab-action-alertas');
    const tabRapidas = document.getElementById('tab-action-rapidas');
    const painelAlertas = document.getElementById('painel-alertas');
    const painelRapidas = document.getElementById('painel-acoes-rapidas');

    tabAlertas?.addEventListener('click', () => {
      tabAlertas.className = 'px-2 py-0.8 rounded-md font-bold transition-all text-mint-vibrant bg-white/10 shadow-sm cursor-pointer flex items-center gap-1.5';
      if (tabRapidas) tabRapidas.className = 'px-2 py-0.8 rounded-md font-bold transition-all text-white/50 hover:text-white cursor-pointer flex items-center gap-1.5';
      painelAlertas?.classList.remove('hidden');
      painelRapidas?.classList.add('hidden');
    });

    tabRapidas?.addEventListener('click', () => {
      if (tabRapidas) tabRapidas.className = 'px-2 py-0.8 rounded-md font-bold transition-all text-mint-vibrant bg-white/10 shadow-sm cursor-pointer flex items-center gap-1.5';
      if (tabAlertas) tabAlertas.className = 'px-2 py-0.8 rounded-md font-bold transition-all text-white/50 hover:text-white cursor-pointer flex items-center gap-1.5';
      painelRapidas?.classList.remove('hidden');
      painelAlertas?.classList.add('hidden');
    });

    // Filtros por Severidade
    document.querySelectorAll<HTMLElement>('.filtro-alerta-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll<HTMLElement>('.filtro-alerta-btn').forEach(b => {
          b.className = 'filtro-alerta-btn px-2 py-0.5 rounded border border-transparent hover:border-white/10 text-white/50 hover:text-white font-medium transition-all cursor-pointer whitespace-nowrap';
        });
        btn.className = 'filtro-alerta-btn px-2 py-0.5 rounded border border-mint-vibrant/40 bg-mint-vibrant/10 text-mint-vibrant font-bold transition-all cursor-pointer whitespace-nowrap active';
        filtroAtual = btn.getAttribute('data-filtro') || 'TODOS';
        renderizarAlertas();
      });
    });

    // Botão de Recarregar Alertas
    const btnRecarregar = document.getElementById('btn-recarregar-alertas');
    btnRecarregar?.addEventListener('click', () => {
      const icon = document.getElementById('icon-recarregar-alertas');
      if (icon) icon.classList.add('animate-spin');
      carregarAlertas(true).finally(() => {
        if (icon) icon.classList.remove('animate-spin');
      });
    });

    // Botões do Grid de Ações Rápidas
    document.getElementById('btn-quick-levantamento')?.addEventListener('click', () => {
      window.location.hash = '#levantamentos';
    });
    document.getElementById('btn-quick-cliente')?.addEventListener('click', () => {
      window.location.hash = '#clientes';
    });
    document.getElementById('btn-quick-propriedade')?.addEventListener('click', () => {
      window.location.hash = '#propriedades';
    });
    document.getElementById('btn-quick-nuvem-sync')?.addEventListener('click', () => {
      const modalNuvem = document.getElementById('modal-nuvem-sync');
      if (modalNuvem) {
        modalNuvem.classList.remove('hidden');
      }
    });
    document.getElementById('btn-quick-hgo')?.addEventListener('click', () => {
      window.location.hash = '#hgo';
    });
    document.getElementById('btn-quick-ccir')?.addEventListener('click', () => {
      window.location.hash = '#ccir';
    });

    // Modal de Criação Rápida de Tarefa
    const modalTarefa = document.getElementById('modal-nova-tarefa-rapida') as any;
    const inputTarefaTitulo = document.getElementById('input-nova-tarefa-titulo') as HTMLInputElement | null;
    const selectTarefaPrioridade = document.getElementById('select-nova-tarefa-prioridade') as HTMLSelectElement | null;
    const inputTarefaPrazo = document.getElementById('input-nova-tarefa-prazo') as HTMLInputElement | null;
    const textareaTarefaDescricao = document.getElementById('textarea-nova-tarefa-descricao') as HTMLTextAreaElement | null;

    const abrirModalNovaTarefa = () => {
      if (inputTarefaTitulo) inputTarefaTitulo.value = '';
      if (selectTarefaPrioridade) selectTarefaPrioridade.value = 'MEDIA';
      if (inputTarefaPrazo) inputTarefaPrazo.value = '';
      if (textareaTarefaDescricao) textareaTarefaDescricao.value = '';
      if (modalTarefa?.abrir) modalTarefa.abrir();
      else modalTarefa?.classList.remove('hidden');
      setTimeout(() => inputTarefaTitulo?.focus(), 150);
    };

    const fecharModalNovaTarefa = () => {
      if (modalTarefa?.fechar) modalTarefa.fechar();
      else modalTarefa?.classList.add('hidden');
    };

    document.getElementById('btn-nova-tarefa-rapida')?.addEventListener('click', abrirModalNovaTarefa);
    document.getElementById('btn-cancelar-nova-tarefa')?.addEventListener('click', fecharModalNovaTarefa);

    document.getElementById('btn-salvar-nova-tarefa')?.addEventListener('click', async () => {
      const titulo = inputTarefaTitulo?.value.trim() || '';
      if (!titulo) {
        showToast('Informe o título da tarefa.', 'error');
        inputTarefaTitulo?.focus();
        return;
      }

      const prioridade = selectTarefaPrioridade?.value || 'MEDIA';
      const prazo = inputTarefaPrazo?.value || '';
      let descricao = textareaTarefaDescricao?.value.trim() || '';
      if (prazo) {
        descricao = descricao ? `${descricao} (Prazo: ${prazo})` : `Prazo: ${prazo}`;
      }

      const btnSalvar = document.getElementById('btn-salvar-nova-tarefa');
      if (btnSalvar) {
        btnSalvar.setAttribute('disabled', 'true');
        btnSalvar.classList.add('opacity-50', 'pointer-events-none');
      }

      try {
        await criarPendenciaRapida(titulo, prioridade, descricao);
        showToast('Tarefa criada com sucesso!', 'success');
        fecharModalNovaTarefa();
        await carregarAlertas();
      } catch (err: any) {
        showToast(err.message || 'Erro ao criar tarefa.', 'error');
      } finally {
        if (btnSalvar) {
          btnSalvar.removeAttribute('disabled');
          btnSalvar.classList.remove('opacity-50', 'pointer-events-none');
        }
      }
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
