import L from 'leaflet';
import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, customAlert, customConfirm, showToast } from '../utils';
import { renderMesaTrabalho } from './mesa_trabalho_template';
import { atualizarPainelPropriedades } from './mesa_trabalho/painel_propriedades';
import { inicializarEventosTabela } from './mesa_trabalho/tabela_dados';
import type { MesaTrabalhoContext } from './mesa_trabalho/mesa_trabalho_context';
import { setupMesaGeodesica, renderTabelaMesaGeodesica } from './mesa_trabalho/mesa_geodesica';
import { setupOrganizadorPerimetro, renderTabelaOrganizadorPerimetro } from './mesa_trabalho/organizador_perimetro';
import { setupOrdenadorManual } from './mesa_trabalho/ordenador_manual';
import { setupAuditoriaHistorico, renderHistoricoCampo } from './mesa_trabalho/auditoria_historico';
import { setupMesaTrabalhoHistorico } from './mesa_trabalho/mesa_trabalho_historico';
import { consultarEPlotarSigef } from '../utils/sigef_consultor';
import { FluentRibbonManager as RibbonManager } from '../ui/fluent_ribbon_manager';
import { registerFluentComponents } from '../ui/fluent_setup';
import { setNuvemSyncContext } from './mesa_trabalho/nuvem_sync_modal';

let _pontoSelecionadoHandler: ((e: any) => void) | null = null;
let _recenterHandler: (() => void) | null = null;
let activeBroadcastChannel: BroadcastChannel | null = null;
let _geradorDocumentosLoaded = false;

// Interceptadores globais de erros para diagnóstico estruturado
window.addEventListener('error', (event) => {
  console.error("[MesaTrabalho] Exceção global capturada:", event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error("[MesaTrabalho] Promessa não tratada capturada:", event.reason);
});

export let activeMapaController: any = null;
let activeDragCleanup: (() => void) | null = null;
let routeCleanup: (() => void) | null = null;

export const mesaTrabalhoRoute: RouteDef = {
  render: () => renderMesaTrabalho(),
  setup: () => {
    // 1. Inicializa o estado compartilhado
    const activeId = localStorage.getItem('active_levantamento_id');
    if (!activeId) {
      window.location.hash = '#levantamentos';
      return;
    }

    const mapaController: any = document.getElementById('mapa-triagem') as any;
    activeMapaController = mapaController;
    if (mapaController) {
      mapaController.levantamentoId = parseInt(activeId);
    }

    const ctx: MesaTrabalhoContext = {
      currentLevId: parseInt(activeId),
      currentMatriculaId: null,
      currentProfissionalId: null,
      currentLevantamento: null,

      matriculasList: [],
      pontosList: [],
      segmentosList: [],
      confrontantesList: [],
      triagemMap: null,
      mapaController: mapaController,
      filesQueue: [],
      modoCoordenadas: 'utm', // AutoCAD UTM Default (Diretriz V2.3)
      etapaAtiva: 'geoprocessamento', // 'geoprocessamento' | 'cartorio' | 'auditoria'
      modoReordenarAtivo: false,

      selectedPontoIds: [],
      selectedVizinhoPontoIds: [],
      lastSelectedPontoId: null,
      currentSortColumn: 'ordem',
      currentSortDirection: 'asc',
      searchFilterValue: '',
      searchFilterOrdenadorValue: '',
      filtroRapidoAtivo: 'todos',
      ocultarForaPoligono: false,
      modoCliqueSequencialAtivo: false,
      bancoPontosExibido: false,
      bancoPontosList: [],
      pontosVizinhosList: [],
      travamentoInicio: 0,
      travamentoFim: 0,
      arquivosDesativadosList: [],
      travamentoInicioPontoId: null,
      travamentoFimPontoId: null,
      sequenciaCliqueProximoIndice: null,

      // Callbacks que serão preenchidos
      loadLevantamentoDetails: async () => {},
      loadWorkspaceArquivos: async () => {},
      carregarHomologacaoDados: async () => {},
      renderMatriculaDados: () => {},
      atualizarPolilinhaMapaTemp: () => {},
      atualizarDestaqueLinhasTabela: () => {},
      renderListaReordenarSimplificada: () => {},
      alternarEtapa: () => {},
      switchMatriculaTab: () => {},
      renderFilaArquivos: () => {},
      inicializarEventosCartorio: () => {},
      carregarSugestoesNumeracao: () => {},
      carregarConfrontantesAtivosSelect: async () => {},
      selectPontoFromTabela: () => {},
      aplicarLargurasSplitters: () => {},

      latLonToUTM: (_lat: number, _lon: number) => ({ e: 0, n: 0, zone: 22 }),
      subirPonto: () => {},
      descerPonto: () => {},
      moverPontoPosicao: () => {},
      salvarRascunhoLocal: () => {},
      verificarRascunhoLocal: () => {},
      subirPontoSimplificado: () => {},
      descerPontoSimplificado: () => {},
      inverterOrdemPerimetral: () => {},
      definirInicioMaisAoNorte: () => {},
      lidarCliqueMarcadorSequencial: () => {},
      obterPontosParaOrdenacao: () => [],
      alternarModoReordenarManual: () => {}
    };

    ctx.atualizarPainelPropriedades = () => atualizarPainelPropriedades(ctx);

    // 2. Registra os submódulos no contexto comum
    setupMesaTrabalhoHistorico(ctx);
    ctx.abrirModalUnificacaoSobrepostos = async () => {
      const { abrirModalUnificacaoSobrepostos } = await import('./mesa_trabalho/unificador_sobrepostos');
      return abrirModalUnificacaoSobrepostos(ctx);
    };
    setupMesaGeodesica(ctx);
    setupOrganizadorPerimetro(ctx);
    setupOrdenadorManual(ctx);

    const carregarGeradorDocumentos = async () => {
      if (!_geradorDocumentosLoaded) {
        _geradorDocumentosLoaded = true;
        const { setupGeradorDocumentos } = await import('./mesa_trabalho/gerador_documentos');
        setupGeradorDocumentos(ctx);
      }
    };
    (ctx as any).carregarGeradorDocumentos = carregarGeradorDocumentos;

    ctx.carregarHomologacaoDados = async (profissionalId: number) => {
      await carregarGeradorDocumentos();
      if (typeof ctx.carregarHomologacaoDados === 'function') {
        return ctx.carregarHomologacaoDados(profissionalId);
      }
    };

    setupAuditoriaHistorico(ctx);
    setupRibbonInteractions(ctx);

    // 4. Implementação de Funções Centrais / Globais
    ctx.loadLevantamentoDetails = async () => {
      if (!ctx.currentLevId) return;

      try {
        const [resLev, resMat, resPt, resSeg, resConf, resViz] = await Promise.all([
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/segmentos`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos-vizinhos`)
        ]);

        let levObj: any = null;
        if (resLev.ok) {
          levObj = await resLev.json();
          ctx.currentLevantamento = levObj;

          const badgeStatus = document.getElementById('badge-status-lev');
          if (badgeStatus) {
            badgeStatus.innerText = levObj.status;
            badgeStatus.className = "text-[9px] px-2 py-0.5 rounded-full font-mono uppercase font-semibold tracking-wider border transition-all";
            
            if (levObj.status === 'EM_ANDAMENTO' || levObj.status === 'ATIVO') {
              badgeStatus.classList.add('bg-mint-vibrant/10', 'text-mint-vibrant', 'border-mint-vibrant/25');
              badgeStatus.classList.add('status-em-andamento');
            } else if (levObj.status === 'ARQUIVADO') {
              badgeStatus.classList.add('bg-white/5', 'text-white/40', 'border-white/10');
            } else {
              badgeStatus.classList.add('bg-blue-500/10', 'text-blue-400', 'border-blue-500/25');
            }
          }

          const txtNomeProp = document.getElementById('txt-nome-propriedade');
          if (txtNomeProp) {
            txtNomeProp.innerText = levObj.nome_propriedade || `Levantamento #${levObj.id}`;
          }

          const proprietarios = levObj.clientes && levObj.clientes.length
            ? levObj.clientes.map((c: any) => `${c.nome_completo} (${(c.percentual_participacao || 0).toFixed(0)}%)`).join(', ')
            : 'Nenhum proprietário';

          const txtNomeCli = document.getElementById('txt-nome-cliente');
          if (txtNomeCli) {
            txtNomeCli.innerText = proprietarios;
          }
          
          const txtCodCar = document.getElementById('txt-codigo-car');
          if (txtCodCar) {
            txtCodCar.innerText = levObj.codigo_car || 'Não Informado';
          }
        }

        const matData = await resMat.json();
        ctx.matriculasList = Array.isArray(matData) ? matData : [];
        
        const ptData = await resPt.json();
        ctx.pontosList = Array.isArray(ptData) ? ptData : [];
        
        const segData = await resSeg.json();
        ctx.segmentosList = Array.isArray(segData) ? segData : [];
        
        const confData = await resConf.json();
        ctx.confrontantesList = Array.isArray(confData) ? confData : [];
        
        const vizData = await resViz.json();
        ctx.pontosVizinhosList = Array.isArray(vizData) ? vizData : [];

        // Pré-carrega o banco de pontos homologados do SIGEF em background
        fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/banco-pontos`).then(async res => {
          if (res.ok) {
            const bpData = await res.json();
            ctx.bancoPontosList = Array.isArray(bpData) ? bpData : [];
          }
        }).catch(err => console.warn('Erro ao pré-carregar banco de pontos homologados:', err));

        ctx.carregarConfrontantesAtivosSelect();
        const dropdownMat = document.getElementById('select-matricula-ribbon') as HTMLSelectElement;
        if (dropdownMat) {
          const formatAreaHa = (val: any) => {
            const num = parseFloat(val);
            return isNaN(num) ? '0.00' : num.toFixed(2);
          };

          dropdownMat.innerHTML = ctx.matriculasList.length === 0
            ? `<option value="" class="bg-[#0c1510]">[Sem Matrícula]</option>`
            : ctx.matriculasList.map((m: any) => `
                <option value="${m.id}" class="bg-[#0c1510]" ${ctx.currentMatriculaId === m.id ? 'selected' : ''}>
                  Matrícula ${m.numero_matricula || m.num_matricula || m.id} (${formatAreaHa(m.area_ha || m.area)}ha)${m.matricula_origem_desenho_id ? ' 🔗 [Gleba Unificada]' : ''}
                </option>
              `).join('');

          if (ctx.currentMatriculaId) {
            dropdownMat.value = ctx.currentMatriculaId.toString();
          }

          if (!dropdownMat.getAttribute('data-has-listener')) {
            dropdownMat.setAttribute('data-has-listener', 'true');
            dropdownMat.addEventListener('change', (e: Event) => {
              const target = e.target as HTMLSelectElement;
              const mId = parseInt(target.value || '0');
              if (mId && typeof ctx.switchMatriculaTab === 'function') {
                ctx.switchMatriculaTab(mId);
              }
            });
          }
        }

        const dropdownFuso = document.getElementById('select-fuso-ribbon') as HTMLSelectElement;
        if (dropdownFuso) {
          const savedZone = localStorage.getItem(`utm_zone_${ctx.currentLevId}`) || '22';
          dropdownFuso.value = savedZone;
          if (ctx.mapaController) {
            ctx.mapaController.fusoUtm = parseInt(savedZone);
            ctx.mapaController.zonaProjecao = parseInt(savedZone);
          }
          if (!dropdownFuso.getAttribute('data-has-listener')) {
            dropdownFuso.setAttribute('data-has-listener', 'true');
            dropdownFuso.addEventListener('change', (e: Event) => {
              const target = e.target as HTMLSelectElement;
              const fusoVal = parseInt(target.value || '22');
              localStorage.setItem(`utm_zone_${ctx.currentLevId}`, String(fusoVal));
              if (ctx.mapaController) {
                ctx.mapaController.fusoUtm = fusoVal;
                ctx.mapaController.zonaProjecao = fusoVal;
              }
              showToast(`Zona UTM alterada para ${fusoVal}S. Recalculando coordenadas...`, "info");
              ctx.loadLevantamentoDetails();
            });
          }
        }

        inicializarMapOnce();
        ctx.renderFilaArquivos();
        ctx.loadWorkspaceArquivos();
        ctx.alternarEtapa(ctx.etapaAtiva);
        
        // Centralização inicial do mapa nos pontos da propriedade (Apenas na 1ª abertura do levantamento)
        const precisaCentralizarInicial = ctx.lastFittedLevId !== ctx.currentLevId;
        if (ctx.triagemMap && ctx.mapaController) {
          setTimeout(() => {
            if (!ctx.triagemMap) return;
            try {
              ctx.triagemMap.invalidateSize();
            } catch (e) {}
            
            if (precisaCentralizarInicial) {
              ctx.lastFittedLevId = ctx.currentLevId;
              let pontosParaCentralizar = [];
              
              // Na mesa geodésica o usuário vê os pontos brutos/ordenados, se tiver matrícula ele filtra.
              if (ctx.currentMatriculaId && ctx.obterPontosParaOrdenacao) {
                pontosParaCentralizar = ctx.obterPontosParaOrdenacao().filter((p: any) => p && String(p.matricula_id) === String(ctx.currentMatriculaId));
              } else if (ctx.currentMatriculaId) {
                pontosParaCentralizar = ctx.pontosList.filter((p: any) => p && String(p.matricula_id) === String(ctx.currentMatriculaId));
              } else {
                pontosParaCentralizar = ctx.pontosList;
              }
              
              if (pontosParaCentralizar.length > 0 && ctx.mapaController) {
                ctx.mapaController.fitBounds(pontosParaCentralizar);
              }
            }
          }, 300);
        }
        
        ctx.carregarSugestoesNumeracao();
        if (levObj && levObj.profissional_id) {
          ctx.currentProfissionalId = levObj.profissional_id;
          if (ctx.etapaAtiva === 'documentos') {
            ctx.carregarHomologacaoDados(levObj.profissional_id);
          }
        }

      } catch (e) {
        console.error("Erro ao carregar detalhes do levantamento:", e);
        showToast("Erro ao carregar dados do levantamento. Verifique a conexão com a API.", 'error');
      }
    };

    const inicializarMapOnce = () => {
      if (!ctx.triagemMap) {
        const canvasEl = document.getElementById('mapa-triagem') as any;
        if (!canvasEl) return;

        ctx.mapaController = canvasEl;
        activeMapaController = canvasEl;
        canvasEl.levantamentoId = ctx.currentLevId;
        ctx.triagemMap = typeof canvasEl.getMap === 'function' ? canvasEl.getMap() : (canvasEl.controller?.getMap() || null);
        ctx.canvasInteracao = canvasEl.controller?.canvasInteracao;

        // Escuta eventos customizados agnósticos do ui-canvas-cad
        canvasEl.addEventListener('ui-ponto-selecionado', (e: any) => {
          const pId = e.detail?.lastSelectedId || (e.detail?.selectedIds && e.detail.selectedIds[0]);
          if (pId) {
            if (ctx.modoCliqueSequencialAtivo && typeof ctx.lidarCliqueMarcadorSequencial === 'function') {
              ctx.lidarCliqueMarcadorSequencial(pId);
            } else {
              ctx.selectPontoFromTabela(pId);
            }
          }
        });

        canvasEl.addEventListener('ui-clique-sequencial', (e: any) => {
          const pId = e.detail?.id || e.detail?.pontoId;
          if (pId && typeof ctx.lidarCliqueMarcadorSequencial === 'function') {
            ctx.lidarCliqueMarcadorSequencial(pId);
          }
        });

        canvasEl.addEventListener('ui-canvas-clique', (e: any) => {
          if (ctx.triagemMap && e.detail) {
            const ev = e.detail.eventoOriginal || e.detail;
            const latlng = ev.latlng || (e.detail.coordenadas ? L.latLng(e.detail.coordenadas.lat, e.detail.coordenadas.lon || e.detail.coordenadas.lng) : null);
            if (latlng) {
              consultarEPlotarSigef(ctx.triagemMap, { ...ev, latlng }, { permitirImportarConfrontante: true });
            }
          }
        });

        canvasEl.addEventListener('ui-acao-popup', (e: any) => {
          const { acaoId, elementoId } = e.detail || {};
          if (acaoId === 'integrar' && elementoId) {
            const btn = document.querySelector(`.btn-integrar-vizinho-mapa[data-ponto-id="${elementoId}"]`) as HTMLElement;
            if (btn) btn.click();
          } else if (acaoId === 'ocultar' && elementoId) {
            const btn = document.querySelector(`.btn-ocultar-vizinho-mapa[data-ponto-id="${elementoId}"]`) as HTMLElement;
            if (btn) btn.click();
          }
        });

        // Sincronização da seleção em lote (Window / Crossing)
        if (_pontoSelecionadoHandler) {
          window.removeEventListener('gerencigeo:ponto-selecionado', _pontoSelecionadoHandler);
        }
        _pontoSelecionadoHandler = (e: any) => {
          if (e.detail?.selectedPontoIds) {
            ctx.selectedPontoIds = e.detail.selectedPontoIds;
            ctx.selectedVizinhoPontoIds = e.detail.selectedVizinhoPontoIds || [];
            ctx.lastSelectedPontoId = e.detail.lastSelectedPontoId || (ctx.selectedPontoIds.length > 0 ? ctx.selectedPontoIds[ctx.selectedPontoIds.length - 1] : null);
            ctx.atualizarDestaqueLinhasTabela();
          }
        };
        window.addEventListener('gerencigeo:ponto-selecionado', _pontoSelecionadoHandler);

        // Listener para recentralização sob demanda (Bússola / Atalhos / Zoom Extents)
        if (_recenterHandler) {
          window.removeEventListener('gerencigeo:recenter', _recenterHandler);
        }
        _recenterHandler = () => {
          if (ctx.mapaController && ctx.pontosList && ctx.pontosList.length > 0) {
            let pontosParaCentralizar = [];
            if (ctx.currentMatriculaId && ctx.obterPontosParaOrdenacao) {
              pontosParaCentralizar = ctx.obterPontosParaOrdenacao().filter((p: any) => p && String(p.matricula_id) === String(ctx.currentMatriculaId));
            } else if (ctx.currentMatriculaId) {
              pontosParaCentralizar = ctx.pontosList.filter((p: any) => p && String(p.matricula_id) === String(ctx.currentMatriculaId));
            } else {
              pontosParaCentralizar = ctx.pontosList;
            }
            if (pontosParaCentralizar.length > 0) {
              ctx.mapaController.fitBounds(pontosParaCentralizar);
            }
          }
        };
        window.addEventListener('gerencigeo:recenter', _recenterHandler);
        
        // Listener de cliques sequenciais no mapa Leaflet
        ctx.triagemMap?.on('popupopen', (e: any) => {
          if (!ctx.modoCliqueSequencialAtivo) return;
          
          const popup = e.popup;
          const content = popup.getContent();
          
          if (typeof content === 'string' && content.includes('btn-selecionar-clique-seq')) {
            setTimeout(() => {
              const btnEl = document.querySelector('.btn-selecionar-clique-seq') as HTMLButtonElement;
              if (btnEl) {
                btnEl.onclick = () => {
                  const pId = parseInt(btnEl.getAttribute('data-ponto-id') || '0');
                  if (pId) {
                    // Executa a injeção sequencial do ponto na lista
                    const pontosMatCompleto = ctx.pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
                    pontosMatCompleto.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

                    const ptParaMover = ctx.pontosList.find(p => p.id === pId);
                    if (ptParaMover) {
                      if (ctx.sequenciaCliqueProximoIndice === null) {
                        ctx.sequenciaCliqueProximoIndice = 1;
                      }

                      ctx.moverPontoPosicao(pId, ctx.sequenciaCliqueProximoIndice);
                      ctx.sequenciaCliqueProximoIndice++;
                    }
                    ctx.triagemMap?.closePopup();
                  }
                };
              }
            }, 10);
          }
        });
      }
    };

    ctx.switchMatriculaTab = (matriculaId: number) => {
      ctx.currentMatriculaId = matriculaId;

      const selectMat = document.getElementById('select-matricula-ribbon') as HTMLElement & { value: string };
      if (selectMat) {
        selectMat.value = matriculaId.toString();
      }

      const matObj = ctx.matriculasList.find(m => m.id === ctx.currentMatriculaId);
      const txtMat = document.getElementById('txt-nome-matricula-ativa');
      if (txtMat && matObj) {
        const areaNum = parseFloat(matObj.area_ha || matObj.area || '0');
        const areaFormatada = isNaN(areaNum) ? '0.00' : areaNum.toFixed(2);
        txtMat.textContent = `Nº ${matObj.numero_matricula} (${areaFormatada}ha)`;
      }

      ctx.renderMatriculaDados();
      ctx.carregarConfrontantesAtivosSelect();
      if (ctx.currentProfissionalId !== null && ctx.etapaAtiva === 'documentos') {
        ctx.carregarHomologacaoDados(ctx.currentProfissionalId);
      }

      if (ctx.triagemMap) {
        setTimeout(() => {
          if (!ctx.triagemMap) return;
          try {
            ctx.triagemMap.invalidateSize();
          } catch (e) {}
          const pontosMat = ctx.pontosList.filter(p => p && String(p.matricula_id) === String(ctx.currentMatriculaId));
          const validCoords = pontosMat.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0).map(p => L.latLng(p.lat, p.lon));
          if (validCoords.length > 0 && ctx.triagemMap) {
            const bounds = L.latLngBounds(validCoords);
            try {
              ctx.triagemMap.fitBounds(bounds, { padding: [40, 40] });
            } catch (e) {}
          }
        }, 100);
      }
    };

    ctx.alternarEtapa = (etapa: string) => {
      ctx.etapaAtiva = etapa;

      // Alternância de views do workspace-body (AutoCAD style abas)
      const allViews = document.querySelectorAll('.view-panel');
      allViews.forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active-view');
      });

      let targetViewId = 'view-mesa-geodesica';
      if (etapa === 'cartorio') targetViewId = 'view-org-perimetro';
      else if (etapa === 'documentos') targetViewId = 'view-cartorio';
      else if (etapa === 'auditoria') targetViewId = 'view-auditoria';

      const targetView = document.getElementById(targetViewId);
      if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('active-view');
      }

      const containerMapa = document.getElementById('container-mapa-leaflet-parent');
      const splitterMapa = document.getElementById('splitter-mapa-tabela');

      const propsPanelTitle = document.querySelector('#painel-propriedades .props-panel-title');
      const propsPanelContent = document.getElementById('props-panel-content');
      const propsPanelOrdenador = document.getElementById('props-panel-ordenador');
      const propsPanelActions = document.getElementById('props-panel-actions');
      const painelPropriedades = document.getElementById('painel-propriedades');

      if (etapa === 'cartorio') {
        if (propsPanelTitle) propsPanelTitle.innerHTML = '<i data-lucide="arrow-up-down" class="w-3.5 h-3.5 text-mint-vibrant inline-block mr-1"></i> Ordenador Manual';
        if (propsPanelContent) propsPanelContent.style.display = 'none';
        if (propsPanelActions) propsPanelActions.style.display = 'none';
        if (propsPanelOrdenador) propsPanelOrdenador.style.display = 'flex';
        if (painelPropriedades) painelPropriedades.classList.remove('hidden');

        setTimeout(() => {
          if (typeof ctx.renderListaReordenarSimplificada === 'function') {
            ctx.renderListaReordenarSimplificada();
          }
          initIcons();
        }, 30);

        ctx.carregarSugestoesNumeracao();
        if (typeof ctx.verificarRascunhoLocal === 'function') {
          ctx.verificarRascunhoLocal();
        }
      } else {
        if (propsPanelTitle) propsPanelTitle.innerHTML = ' Propriedades';
        if (propsPanelOrdenador) propsPanelOrdenador.style.display = 'none';
        if (propsPanelContent) propsPanelContent.style.display = '';
      }

      if (etapa === 'documentos') {
        if (ctx.currentProfissionalId) {
          ctx.carregarHomologacaoDados(ctx.currentProfissionalId);
        }
      } else if (etapa === 'auditoria') {
        renderHistoricoCampo(ctx);
      }

      if (etapa === 'geoprocessamento' || etapa === 'cartorio') {
        containerMapa?.classList.remove('hidden');
        splitterMapa?.classList.remove('hidden');
        if (ctx.triagemMap) {
          setTimeout(() => {
            try {
              ctx.triagemMap?.invalidateSize?.();
            } catch (e) {}
          }, 50);
        }
      } else {
        containerMapa?.classList.add('hidden');
        splitterMapa?.classList.add('hidden');
      }

      const tabBtn = document.querySelector(`.rl3-tab[data-tab="${etapa}"]`) as HTMLButtonElement;
      if (tabBtn) {
        const tabButtons = document.querySelectorAll('.rl3-tab');
        const panelRows = document.querySelectorAll('.rl3-panel');
        
        tabButtons.forEach(btn => {
          btn.classList.remove('active');
        });
        tabBtn.classList.add('active');

        panelRows.forEach(row => row.classList.add('hidden'));
        
        let panelId = 'panel-geoprocessamento';
        if (etapa === 'cartorio') panelId = 'panel-perimetro';
        else if (etapa === 'documentos') panelId = 'panel-cartorio';
        else if (etapa === 'auditoria') panelId = 'panel-auditoria';

        const targetPanel = document.getElementById(panelId);
        if (targetPanel) {
          targetPanel.classList.remove('hidden');
        }
      }

      initIcons();
      ctx.aplicarLargurasSplitters();
      if (ctx.triagemMap && etapa !== 'auditoria') {
        setTimeout(() => {
          ctx.triagemMap?.invalidateSize?.();
        }, 50);
      }

      if (etapa !== 'auditoria') {
        ctx.renderMatriculaDados();
      }
    };

    ctx.renderMatriculaDados = () => {
      if (ctx.etapaAtiva === 'geoprocessamento') {
        renderTabelaMesaGeodesica(ctx);
      } else if (ctx.etapaAtiva === 'cartorio') {
        renderTabelaOrganizadorPerimetro(ctx);
      }
    };

    ctx.atualizarPolilinhaMapaTemp = () => {
      if (!ctx.triagemMap) return;
      if (ctx.etapaAtiva !== 'geoprocessamento' && !ctx.currentMatriculaId) return;

      let pontosMat = (ctx.currentMatriculaId && ctx.obterPontosParaOrdenacao)
        ? ctx.obterPontosParaOrdenacao()
        : (ctx.pontosList || []).filter(p => p && (!ctx.arquivosDesativadosList || !ctx.arquivosDesativadosList.includes(p.arquivo_origem)));

      if (ctx.currentMatriculaId) {
        pontosMat = pontosMat.filter((p: any) => p && String(p.matricula_id) === String(ctx.currentMatriculaId));
      }

      const segmentosMat = ctx.currentMatriculaId
        ? (ctx.segmentosList || []).filter((s: any) => String(s.matricula_id) === String(ctx.currentMatriculaId))
        : (ctx.segmentosList || []);

      const bpAtivo = ctx.bancoPontosExibido && ctx.bancoPontosList && ctx.bancoPontosList.length > 0;
      ctx.mapaController.clearOverlays(bpAtivo);
      ctx.mapaController.plotPontos(pontosMat, (pId: number) => {
        if (ctx.modoCliqueSequencialAtivo && typeof ctx.lidarCliqueMarcadorSequencial === 'function') {
          ctx.lidarCliqueMarcadorSequencial(pId);
        } else {
          ctx.selectPontoFromTabela(pId);
        }
      });

      if (segmentosMat && segmentosMat.length > 0) {
        ctx.mapaController.plotSegmentos(segmentosMat, ctx.pontosList);
      } else {
        ctx.mapaController.plotPolilinhaTemporaria(pontosMat);
      }

      if (bpAtivo) {
        ctx.mapaController.plotPoligonalHomologada(ctx.bancoPontosList);
      }
      if (ctx.pontosVizinhosList && ctx.pontosVizinhosList.length > 0) {
        ctx.mapaController.plotPontosVizinhos(ctx.pontosVizinhosList);
      }
      if (ctx.confrontantesList && ctx.confrontantesList.length > 0) {
        ctx.mapaController.plotPoligonosVizinhos(ctx.confrontantesList);
      }
    };

    let _previousSelectedIds = new Set<number>();
    let _previousSelectedVizinhoIds = new Set<number>();

    ctx.atualizarDestaqueLinhasTabela = () => {
      const currentSelectedIds = new Set(ctx.selectedPontoIds);
      const currentSelectedVizinhoIds = new Set(ctx.selectedVizinhoPontoIds);

      // ⚡ Bolt: Replace O(N) DOM query with O(K) specific updates for row selection
      // Instead of querying all rows in the table with querySelectorAll (which is slow for large datasets),
      // we only update the rows whose selection status changed by comparing previous and current state.

      const uiTabelaEl = document.getElementById('ui-tbl-pontos-triagem') as (HTMLElement & { shadowRoot?: ShadowRoot }) | null;

      // 1. Remove highlight from rows that are NO LONGER selected
      _previousSelectedIds.forEach(pId => {
        if (!currentSelectedIds.has(pId)) {
          // DOM tradicional
          document.querySelectorAll(`.linha-ponto-tbl[data-ponto-id="${pId}"]`).forEach(tr => {
            tr.classList.remove('bg-mint-vibrant/25', 'text-mint-vibrant', 'border-mint-vibrant/40');
            tr.classList.add('hover:bg-white/[0.02]', 'border-white/5');
          });

          // Shadow DOM da <ui-tabela>
          if (uiTabelaEl?.shadowRoot) {
            uiTabelaEl.shadowRoot.querySelectorAll(`[data-ponto-id="${pId}"]`).forEach(el => {
              const tr = el.closest('tr');
              if (tr) {
                tr.style.backgroundColor = '';
                tr.style.color = '';
              }
            });
          }
        }
      });

      // 2. Add highlight to rows that are NEWLY selected
      currentSelectedIds.forEach(pId => {
        if (!_previousSelectedIds.has(pId)) {
          // DOM tradicional
          document.querySelectorAll(`.linha-ponto-tbl[data-ponto-id="${pId}"]`).forEach(tr => {
            tr.classList.add('bg-mint-vibrant/25', 'text-mint-vibrant', 'border-mint-vibrant/40');
            tr.classList.remove('hover:bg-white/[0.02]', 'border-white/5');
          });

          // Shadow DOM da <ui-tabela>
          if (uiTabelaEl?.shadowRoot) {
            uiTabelaEl.shadowRoot.querySelectorAll(`[data-ponto-id="${pId}"]`).forEach(el => {
              const tr = el.closest('tr');
              if (tr) {
                tr.style.backgroundColor = 'rgba(0, 224, 138, 0.15)';
                tr.style.color = '#00E08A';
              }
            });
          }
        }
      });

      const bar = document.getElementById('batch-action-bar-mesa');
      const countEl = document.getElementById('batch-selection-count-mesa');
      const btnIntegrar = document.getElementById('btn-batch-integrate-mesa');
      if (bar && countEl) {
        const countNormal = ctx.selectedPontoIds.length;
        const countVizinhos = ctx.selectedVizinhoPontoIds.length;
        const countTotal = countNormal + countVizinhos;

        if (countTotal > 0) {
          countEl.innerText = countTotal.toString();
          bar.classList.remove('hidden');

          // Se houver pontos vizinhos selecionados, mostra botão para integrá-los
          if (btnIntegrar) {
            if (countVizinhos > 0) {
              btnIntegrar.classList.remove('hidden');
            } else {
              btnIntegrar.classList.add('hidden');
            }
          }
        } else {
          bar.classList.add('hidden');
        }
      }

      // Marcadores normais: Limpa os que DEIXARAM de ser selecionados
      _previousSelectedIds.forEach(pId => {
        if (!currentSelectedIds.has(pId)) {
          const markerEl = document.getElementById(`map-marker-${pId}`);
          if (markerEl) {
            const bgClass = markerEl.getAttribute('data-ponto-bg') || 'bg-mint-vibrant';
            markerEl.className = `w-2.5 h-2.5 ${bgClass} border border-[#0c1510] rounded-full flex items-center justify-center shadow-md transition-all duration-150 coordinate-marker`;
          }
        }
      });

      // Marcadores normais: Aplica destaque nos que PASSARAM a ser selecionados (ou continuam)
      currentSelectedIds.forEach(pId => {
        if (!_previousSelectedIds.has(pId)) {
          const markerEl = document.getElementById(`map-marker-${pId}`);
          if (markerEl) {
            markerEl.className = "w-3.5 h-3.5 bg-yellow-400 border-2 border-white rounded-full flex items-center justify-center shadow-[0_0_10px_#facc15] scale-125 transition-all duration-150 z-[1000] coordinate-marker";
          }
        }
      });

      // Marcadores vizinhos: Limpa os que DEIXARAM de ser selecionados
      _previousSelectedVizinhoIds.forEach(pId => {
        if (!currentSelectedVizinhoIds.has(pId)) {
          const markerEl = document.getElementById(`vizinho-marker-${pId}`);
          if (markerEl) {
            markerEl.className = "w-2.5 h-2.5 bg-purple-500 border border-white rounded-full shadow-[0_0_6px_rgba(168,85,247,0.6)] transition-all duration-150 neighbor-marker";
          }
        }
      });

      // Marcadores vizinhos: Aplica destaque nos que PASSARAM a ser selecionados
      currentSelectedVizinhoIds.forEach(pId => {
        if (!_previousSelectedVizinhoIds.has(pId)) {
          const markerEl = document.getElementById(`vizinho-marker-${pId}`);
          if (markerEl) {
            markerEl.className = "w-3.5 h-3.5 bg-yellow-400 border-2 border-white rounded-full shadow-[0_0_10px_#facc15] scale-125 transition-all duration-150 z-[1000] neighbor-marker";
          }
        }
      });

      _previousSelectedIds = currentSelectedIds;
      _previousSelectedVizinhoIds = currentSelectedVizinhoIds;

      atualizarPainelPropriedades(ctx);
    };

    ctx.selectPontoFromTabela = (pontoId: number) => {
      ctx.selectedPontoIds = [pontoId];
      ctx.selectedVizinhoPontoIds = [];
      ctx.lastSelectedPontoId = pontoId;

      const uiTabelaEl = document.getElementById('ui-tbl-pontos-triagem') as any;
      let rolouViaComponente = false;
      if (uiTabelaEl) {
        if (typeof uiTabelaEl.rolarPara === 'function') {
          rolouViaComponente = uiTabelaEl.rolarPara(pontoId, { comportamento: 'smooth', selecionar: true }) !== false;
        } else if (typeof uiTabelaEl.rolarParaItem === 'function') {
          rolouViaComponente = uiTabelaEl.rolarParaItem(pontoId, { comportamento: 'smooth', selecionar: true }) !== false;
        } else if (typeof uiTabelaEl.rolarParaId === 'function') {
          rolouViaComponente = uiTabelaEl.rolarParaId(pontoId) !== false;
        }
      }

      if (!rolouViaComponente) {
        let row = document.getElementById(`tr-ponto-${pontoId}`);
        if (!row && uiTabelaEl?.shadowRoot) {
          const el = uiTabelaEl.shadowRoot.querySelector(`[data-ponto-id="${pontoId}"]`);
          row = (el?.closest('tr') || el || null) as HTMLElement | null;
        }
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      ctx.atualizarDestaqueLinhasTabela();
    };

    // 5. Configuração de Event Delegation da Tabela de Vértices
    const setupEventDelegation = () => {
      inicializarEventosTabela(ctx);
    };

    // 6. Exclusão de Vértices (Individual e em Lote)
    const confirmarExclusaoPonto = async (pId: number) => {
      if (ctx.currentLevantamento?.status === 'ARQUIVADO') {
         await customAlert("Este projeto está ARQUIVADO e não pode ser modificado (Modo Somente Leitura).");
         return;
      }

      const isLote = ctx.selectedPontoIds.length > 1 && ctx.selectedPontoIds.includes(pId);

      if (isLote) {
         if (!await customConfirm(`ATENÇÃO: Tem certeza absoluta que deseja excluir definitivamente os ${ctx.selectedPontoIds.length} vértices selecionados? Esta operação é irreversível e removerá todos de uma só vez.`)) return;

         try {
           const promessas = ctx.selectedPontoIds.map(id => 
              fetch(`${API_BASE}/pontos/${id}`, { method: 'DELETE' }).then(async r => {
                 if (r.status === 403) return { error: "Acesso negado (projeto arquivado)." };
                 if (!r.ok) {
                    const txt = await r.json().catch(() => ({ error: "Erro desconhecido" }));
                    return { error: txt.detail || txt.error || "Falha na requisição" };
                 }
                 return r.json().catch(() => ({}));
              })
           );
           const resultados = await Promise.all(promessas);

           const erros = resultados.filter(r => r.error).map(r => r.error);
           if (erros.length > 0) {
             await customAlert(`Ocorreram alguns erros ao tentar excluir em lote:\n${erros.slice(0, 5).join('\n')}`);
           } else {
             showToast(`${ctx.selectedPontoIds.length} vértices excluídos com sucesso!`, 'success');
           }
           ctx.selectedPontoIds = [];
           await ctx.loadLevantamentoDetails();
         } catch (err) {
           console.error("Erro ao excluir pontos em lote:", err);
           showToast("Erro de comunicação com o servidor API ao tentar excluir os pontos selecionados.", 'error');
         }
         return;
      }

      const pt = ctx.pontosList.find(x => x.id === pId);
      if (!pt) return;

      if (!await customConfirm(`ATENÇÃO: Tem certeza absoluta que deseja excluir definitivamente o vértice '${pt.nome_vertice}'? Esta operação é irreversível.`)) return;

      try {
        const res = await fetch(`${API_BASE}/pontos/${pId}`, { method: 'DELETE' });
        if (res.status === 403) {
           await customAlert("Este projeto está ARQUIVADO e não pode ser modificado (Modo Somente Leitura).");
           return;
        }
        const data = await res.json();
        if (data.error) {
          await customAlert(data.error);
        } else {
          showToast(`Vértice ${pt.nome_vertice} excluído com sucesso!`, 'success');
          ctx.selectedPontoIds = ctx.selectedPontoIds.filter(id => id !== pId);
          await ctx.loadLevantamentoDetails();
        }
      } catch (err) {
        console.error("Erro ao excluir ponto:", err);
        showToast("Erro de comunicação com o servidor API.", 'error');
      }
    };

    const inicializarBuscaPonto = () => {
      const searchInput = document.getElementById('input-search-ponto') as HTMLInputElement;
      const btnClearSearch = document.getElementById('btn-clear-search');
      let searchDebounceTimeout: any = null;

      if (searchInput) {
        searchInput.addEventListener('input', () => {
          if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
          searchDebounceTimeout = setTimeout(() => {
            ctx.searchFilterValue = searchInput.value.trim().toLowerCase();
            ctx.renderMatriculaDados();
          }, 150);
        });
      }

      if (btnClearSearch) {
        btnClearSearch.addEventListener('click', () => {
          if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
          if (searchInput) searchInput.value = '';
          ctx.searchFilterValue = '';
          ctx.renderMatriculaDados();
        });
      }
    };

    let _filtroArquivosClickHandler: ((e: MouseEvent) => void) | null = null;

    const inicializarFiltroArquivos = () => {
      const btnFiltro = document.getElementById('btn-filtro-arquivos');
      const popover = document.getElementById('popover-filtro-arquivos');

      if (!btnFiltro || !popover) return;

      btnFiltro.addEventListener('click', (e) => {
        e.stopPropagation();
        popover.classList.toggle('hidden');
      });

      // Registrado com referência para remoção no cleanup (previne memory leak)
      _filtroArquivosClickHandler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!popover.classList.contains('hidden') && !popover.contains(target) && target !== btnFiltro) {
          popover.classList.add('hidden');
        }
      };
      document.addEventListener('click', _filtroArquivosClickHandler);
    };

    const inicializarIngestaoCollapse = () => {
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      if (!containerIngestao) return;

      const expandirIngestao = () => {
        containerIngestao.classList.remove('hidden');
        containerIngestao.classList.add('flex');
        if (ctx.renderFilaArquivos) {
          ctx.renderFilaArquivos();
        }
        initIcons();
      };

      const colapsarIngestao = () => {
        containerIngestao.classList.add('hidden');
        containerIngestao.classList.remove('flex');
      };

      ctx.expandirIngestao = expandirIngestao;
      ctx.colapsarIngestao = colapsarIngestao;

      // Evento de clique no botão do Ribbon (Ingestão)
      const btnDropArquivos = document.getElementById('btn-drop-arquivos');
      if (btnDropArquivos) {
        btnDropArquivos.addEventListener('click', () => {
          expandirIngestao();
        });
      }

      // Fechar modal ao clicar no backdrop
      containerIngestao.addEventListener('click', (e) => {
        if (e.target === containerIngestao) {
          colapsarIngestao();
        }
      });

      // Fechar modal com a tecla Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !containerIngestao.classList.contains('hidden')) {
          colapsarIngestao();
        }
      });

      // Evento de clique para fechar o modal
      const btnFechar = document.getElementById('btn-fechar-modal-ingestao');
      if (btnFechar) {
        btnFechar.addEventListener('click', colapsarIngestao);
      }
      
      const btnCancelar = document.getElementById('btn-cancelar-ingestao-modal');
      if (btnCancelar) {
        btnCancelar.addEventListener('click', colapsarIngestao);
      }

      // Repasse do botão processar do modal para o botão processar original do ribbon
      const btnProcessarModal = document.getElementById('btn-processar-lote-modal');
      if (btnProcessarModal) {
        btnProcessarModal.addEventListener('click', () => {
          const btnOriginal = document.getElementById('btn-processar-lote');
          if (btnOriginal) {
            btnOriginal.click();
          }
          colapsarIngestao();
        });
      }
    };

    const aplicarLargurasSalvas = () => {
      const savedPropsWidth = localStorage.getItem('gerencigeo_props_panel_width') || '280px';
      const panelProps = document.getElementById('painel-propriedades');
      const workspaceBody = document.querySelector('.workspace-body') as HTMLElement;
      if (panelProps && workspaceBody) {
        if (panelProps.classList.contains('collapsed')) {
          workspaceBody.style.setProperty('--props-panel-w', '36px');
        } else {
          workspaceBody.style.setProperty('--props-panel-w', savedPropsWidth);
          panelProps.style.width = savedPropsWidth;
        }
      }

      // Restaurar altura da tabela e mapa salvos
      const savedTableHeight = localStorage.getItem('gerencigeo_table_height') || '280px';
      const mainContent = document.querySelector('.workspace-main-content') as HTMLElement;
      if (mainContent) {
        mainContent.style.setProperty('--table-area-h', savedTableHeight.endsWith('px') ? savedTableHeight : `${savedTableHeight}px`);
      }
    };

    ctx.aplicarLargurasSplitters = aplicarLargurasSalvas;

    const inicializarSplitters = () => {
      // Redimensionador de Altura do Mapa vs Tabela (Splitter Horizontal)
      const splitterMapa = document.getElementById('splitter-mapa-tabela');
      const mainContent = document.querySelector('.workspace-main-content') as HTMLElement;

      if (splitterMapa && mainContent) {
        let isDraggingMapa = false;
        let startY = 0;
        let startHeight = 0;

        const onMouseMoveMapa = (e: MouseEvent) => {
          if (!isDraggingMapa) return;
          const deltaY = startY - e.clientY;
          const newHeight = Math.max(150, Math.min(window.innerHeight - 300, startHeight + deltaY));

          mainContent.style.setProperty('--table-area-h', `${newHeight}px`);
          localStorage.setItem('gerencigeo_table_height', `${newHeight}px`);
          
          if (ctx.triagemMap) {
            ctx.triagemMap.invalidateSize();
          }
        };

        const onMouseUpMapa = () => {
          isDraggingMapa = false;
          splitterMapa.classList.remove('resizing');
          document.removeEventListener('mousemove', onMouseMoveMapa);
          document.removeEventListener('mouseup', onMouseUpMapa);
          document.body.classList.remove('cursor-row-resize', 'select-none');
          
          if (ctx.triagemMap) {
            setTimeout(() => {
              ctx.triagemMap?.invalidateSize();
            }, 50);
          }
        };

        splitterMapa.addEventListener('mousedown', (e: MouseEvent) => {
          e.preventDefault();
          isDraggingMapa = true;
          startY = e.clientY;
          
          const activePanel = document.querySelector('.view-panel.active-view') as HTMLElement;
          startHeight = activePanel ? activePanel.getBoundingClientRect().height : 280;

          splitterMapa.classList.add('resizing');
          document.addEventListener('mousemove', onMouseMoveMapa);
          document.addEventListener('mouseup', onMouseUpMapa);
          document.body.classList.add('cursor-row-resize', 'select-none');
        });
      }

      // Redimensionador do Painel de Propriedades Lateral
      const resizerProps = document.getElementById('props-panel-resizer');
      const panelProps = document.getElementById('painel-propriedades');
      const workspaceBody = document.querySelector('.workspace-body') as HTMLElement;

      if (resizerProps && panelProps && workspaceBody) {
        let isDraggingProps = false;
        let startX = 0;
        let startWidth = 0;

        const onMouseMoveProps = (e: MouseEvent) => {
          if (!isDraggingProps) return;
          const deltaX = e.clientX - startX;
          const newWidth = Math.max(200, Math.min(600, startWidth + deltaX));

          workspaceBody.style.setProperty('--props-panel-w', `${newWidth}px`);
          panelProps.style.width = `${newWidth}px`;
          localStorage.setItem('gerencigeo_props_panel_width', `${newWidth}px`);

          if (ctx.triagemMap) ctx.triagemMap.invalidateSize?.();
        };

        const onMouseUpProps = () => {
          isDraggingProps = false;
          resizerProps.classList.remove('resizing');
          document.removeEventListener('mousemove', onMouseMoveProps);
          document.removeEventListener('mouseup', onMouseUpProps);
          document.body.classList.remove('cursor-col-resize', 'select-none');
          if (ctx.triagemMap) {
            setTimeout(() => ctx.triagemMap?.invalidateSize?.(), 50);
          }
        };

        resizerProps.addEventListener('mousedown', (e: MouseEvent) => {
          if (panelProps.classList.contains('collapsed')) return;

          e.preventDefault();
          isDraggingProps = true;
          resizerProps.classList.add('resizing');
          startX = e.clientX;
          startWidth = panelProps.getBoundingClientRect().width;

          document.body.classList.add('cursor-col-resize', 'select-none');
          document.addEventListener('mousemove', onMouseMoveProps);
          document.addEventListener('mouseup', onMouseUpProps);
        });
      }
      
      aplicarLargurasSalvas();
    };

    // 8. Eventos Globais de Filtros de Tabela
    document.querySelectorAll('.btn-filtro-rapido').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget as HTMLButtonElement;
        
        document.querySelectorAll('.btn-filtro-rapido').forEach(b => {
          b.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-white/50 border border-transparent hover:text-white hover:bg-white/[0.08] btn-filtro-rapido transition-all";
        });
        
        targetBtn.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 btn-filtro-rapido transition-all";
        
        ctx.filtroRapidoAtivo = targetBtn.getAttribute('data-filtro') || 'todos';
        ctx.renderMatriculaDados();
      });
    });

    document.getElementById('btn-etapa-geoprocessamento')?.addEventListener('click', () => {
      ctx.alternarEtapa('geoprocessamento');
    });

    document.getElementById('btn-etapa-cartorio')?.addEventListener('click', () => {
      ctx.alternarEtapa('cartorio');
    });

    document.getElementById('btn-etapa-documentos')?.addEventListener('click', () => {
      ctx.alternarEtapa('documentos');
    });

    document.getElementById('btn-etapa-auditoria')?.addEventListener('click', () => {
      ctx.alternarEtapa('auditoria');
    });

    document.getElementById('btn-atualizar-historico-campo')?.addEventListener('click', () => {
      renderHistoricoCampo(ctx);
    });

    const alternarFontePontosHandler = async () => {
      if (!ctx.currentLevId) return;

      if (!ctx.bancoPontosExibido) {
        if (!ctx.bancoPontosList || ctx.bancoPontosList.length === 0) {
          try {
            const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/banco-pontos`);
            if (res.ok) {
              const data = await res.json();
              ctx.bancoPontosList = data || [];
            }
          } catch (err) {
            console.error("Erro ao buscar banco de pontos:", err);
          }
        }

        if (!ctx.bancoPontosList || ctx.bancoPontosList.length === 0) {
          alert("Nenhum ponto homologado foi importado da planilha ainda. Envie uma planilha ODS/CSV na aba 'Peças de Cartório' para visualizar os pontos finais do SIGEF.");
          return;
        }

        ctx.bancoPontosExibido = true;
      } else {
        ctx.bancoPontosExibido = false;
      }

      const btnToggle = document.getElementById('btn-toggle-fonte-pontos');
      const txtToggle = document.getElementById('txt-fonte-pontos');
      const iconToggle = document.getElementById('icon-fonte-pontos');

      if (ctx.bancoPontosExibido) {
        if (txtToggle) txtToggle.innerHTML = `Planilha SIGEF <span class="font-bold">(${ctx.bancoPontosList.length} pts)</span>`;
        if (iconToggle) iconToggle.setAttribute('data-lucide', 'file-check');
        if (btnToggle) {
          btnToggle.className = "rl3-tool-btn rl3-btn-lg border border-emerald-500/50 bg-emerald-500/20 text-emerald-300 font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all";
        }
      } else {
        if (txtToggle) txtToggle.innerText = 'Fonte: Campo';
        if (iconToggle) iconToggle.setAttribute('data-lucide', 'layers');
        if (btnToggle) {
          btnToggle.className = "rl3-tool-btn rl3-btn-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 transition-all";
        }
      }

      initIcons();
      ctx.renderMatriculaDados();
    };

    document.getElementById('btn-toggle-fonte-pontos')?.addEventListener('click', alternarFontePontosHandler);

    // Eventos da barra flutuante de ações em lote da mesa
    document.getElementById('btn-batch-cancel-mesa')?.addEventListener('click', () => {
       ctx.selectedPontoIds = [];
       ctx.selectedVizinhoPontoIds = [];
       ctx.lastSelectedPontoId = null;
       ctx.atualizarDestaqueLinhasTabela();
    });

    document.getElementById('btn-batch-limpar')?.addEventListener('click', () => {
       ctx.selectedPontoIds = [];
       ctx.selectedVizinhoPontoIds = [];
       ctx.lastSelectedPontoId = null;
       ctx.atualizarDestaqueLinhasTabela();
    });
    
    document.getElementById('btn-batch-delete-mesa')?.addEventListener('click', () => {
       if (ctx.selectedPontoIds.length > 0) {
          confirmarExclusaoPonto(ctx.selectedPontoIds[0]);
       }
    });

    document.getElementById('btn-batch-deletar')?.addEventListener('click', () => {
       if (ctx.selectedPontoIds.length > 0) {
          confirmarExclusaoPonto(ctx.selectedPontoIds[0]);
       }
    });

    document.getElementById('btn-batch-ignorar')?.addEventListener('click', async () => {
       if (ctx.currentLevantamento?.status === 'ARQUIVADO') {
          await customAlert("Este projeto está ARQUIVADO e não pode ser modificado (Modo Somente Leitura).");
          return;
       }
       
       const totalSelecionados = ctx.selectedPontoIds.length;
       if (totalSelecionados === 0) return;

       const pontosSel = ctx.pontosList.filter(p => ctx.selectedPontoIds.includes(p.id));
       if (pontosSel.length === 0) return;

       const temPontoAtivo = pontosSel.some(p => p.ignorar_poligono !== 1);
       const novoEstado = temPontoAtivo ? 1 : 0;

       if (!await customConfirm(`Deseja alterar a participação no polígono de ${totalSelecionados} vértice(s) para: "${novoEstado === 1 ? 'Ignorar' : 'Participar'}"?`)) return;

       showToast("Atualizando vértices em lote...", "info");

       try {
          const promessas = ctx.selectedPontoIds.map(id => 
             fetch(`${API_BASE}/pontos/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ignorar_poligono: novoEstado })
             }).then(async r => {
                if (r.status === 403) return { error: "Acesso negado (projeto arquivado)." };
                if (!r.ok) {
                   const txt = await r.json().catch(() => ({ error: "Erro desconhecido" }));
                   return { error: txt.detail || txt.error || "Falha na requisição" };
                }
                return r.json().catch(() => ({}));
             })
          );

          const resultados = await Promise.all(promessas);
          const erros = resultados.filter(r => r.error).map(r => r.error);

          if (erros.length > 0) {
             await customAlert(`Ocorreram alguns erros ao tentar atualizar em lote:\n${erros.slice(0, 5).join('\n')}`);
          } else {
             showToast(`${totalSelecionados} vértice(s) atualizado(s) com sucesso!`, "success");
          }

          await ctx.loadLevantamentoDetails();
       } catch (err) {
          console.error("Erro ao alternar polígono em lote:", err);
          showToast("Erro ao tentar atualizar os pontos selecionados em lote.", "error");
       }
    });

    document.getElementById('btn-batch-integrate-mesa')?.addEventListener('click', async () => {
       const totalVizinhos = ctx.selectedVizinhoPontoIds.length;
       if (totalVizinhos === 0) return;

       if (!await customConfirm(`Deseja integrar os ${totalVizinhos} pontos vizinhos selecionados ao levantamento da matrícula atual?`)) return;

       const matriculaIdParam = ctx.currentMatriculaId ? `?matricula_id=${ctx.currentMatriculaId}` : '';
       let sucessos = 0;
       let falhas = 0;

       showToast(`Integrando ${totalVizinhos} pontos...`, 'info');

       for (const pId of ctx.selectedVizinhoPontoIds) {
          try {
             const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos/integrar-vizinho/${pId}${matriculaIdParam}`, {
                method: 'POST'
             });
             if (res.ok) {
                sucessos++;
             } else {
                falhas++;
             }
          } catch (err) {
             falhas++;
          }
       }

       if (sucessos > 0) {
          showToast(`${sucessos} pontos vizinhos integrados com sucesso!`, 'success');
          await ctx.loadLevantamentoDetails();
          ctx.selectedVizinhoPontoIds = [];
          ctx.atualizarDestaqueLinhasTabela();
       }
       if (falhas > 0) {
          showToast(`Falha ao integrar ${falhas} pontos vizinhos.`, 'error');
       }
    });

    // Lógica para abrir o modal de filtro Revit
    document.getElementById('btn-batch-filter-mesa')?.addEventListener('click', () => {
       const container = document.getElementById('container-categorias-filtro');
       if (!container) return;
       
       container.innerHTML = '';

       const pontosSelecionados = ctx.pontosList.filter((p: any) => ctx.selectedPontoIds.includes(p.id));
       const vizinhosSelecionados = ctx.pontosVizinhosList.filter((p: any) => ctx.selectedVizinhoPontoIds.includes(p.id));

       const categorias = [
         {
           id: 'base-ppp',
           nome: 'Bases Homologadas PPP (M)',
           count: pontosSelecionados.filter((p: any) => p.tipo_ponto === 'M' || p.tipo === 'M').length
         },
         {
           id: 'base-campo',
           nome: 'Bases de Campo (B)',
           count: pontosSelecionados.filter((p: any) => p.tipo_ponto === 'B' || p.tipo === 'B').length
         },
         {
           id: 'rover-vertice',
           nome: 'Vértices do Perímetro (P/V)',
           count: pontosSelecionados.filter((p: any) => p.tipo_ponto !== 'B' && p.tipo !== 'B' && p.tipo_ponto !== 'M' && p.tipo !== 'M').length
         },
         {
           id: 'ponto-bruto',
           nome: 'Pontos com Status BRUTO',
           count: pontosSelecionados.filter((p: any) => p.status_ponto === 'BRUTO').length
         },
         {
           id: 'ponto-corrigido',
           nome: 'Pontos com Status CORRIGIDO',
           count: pontosSelecionados.filter((p: any) => p.status_ponto === 'CORRIGIDO').length
         },
         {
           id: 'vizinho-ods',
           nome: 'Vértices Vizinhos (Roxos)',
           count: vizinhosSelecionados.length
         }
       ];

       const categoriasAtivas = categorias.filter(c => c.count > 0);

       if (categoriasAtivas.length === 0) {
         container.innerHTML = '<div class="text-white/20 italic py-2 text-center text-xs">Nenhum elemento selecionado para filtrar.</div>';
         return;
       }

       categoriasAtivas.forEach(cat => {
         const item = document.createElement('label');
         item.className = 'flex items-center gap-2.5 p-2 bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] rounded-technical text-xs text-white/80 cursor-pointer select-none transition-all';
         item.innerHTML = `
           <input type="checkbox" checked value="${cat.id}" class="chk-filtro-categoria rounded border-white/10 text-indigo-600 focus:ring-0 focus:ring-offset-0 bg-[#0c1510]" />
           <div class="flex justify-between items-center w-full">
             <span>${cat.nome}</span>
             <span class="font-mono bg-white/5 border border-white/10 text-white/50 text-[10px] px-1.5 py-0.5 rounded">${cat.count}</span>
           </div>
         `;
         container.appendChild(item);
       });

       document.getElementById('modal-filtro-revit-mesa')?.classList.remove('hidden');
    });

    document.getElementById('btn-filtro-selecionar-todos')?.addEventListener('click', () => {
       document.querySelectorAll('.chk-filtro-categoria').forEach((chk: any) => (chk as HTMLInputElement).checked = true);
    });
  
    document.getElementById('btn-filtro-limpar-todos')?.addEventListener('click', () => {
       document.querySelectorAll('.chk-filtro-categoria').forEach((chk: any) => (chk as HTMLInputElement).checked = false);
    });
  
    const fecharModalFiltro = () => {
       document.getElementById('modal-filtro-revit-mesa')?.classList.add('hidden');
    };
    document.getElementById('btn-fechar-modal-filtro')?.addEventListener('click', fecharModalFiltro);
    document.getElementById('btn-filtro-cancelar')?.addEventListener('click', fecharModalFiltro);
  
    document.getElementById('btn-filtro-aplicar')?.addEventListener('click', () => {
       const checkedVals = Array.from(document.querySelectorAll('.chk-filtro-categoria:checked')).map((el: any) => el.value);
  
       const pontosSelecionados = ctx.pontosList.filter((p: any) => ctx.selectedPontoIds.includes(p.id));
       const vizinhosSelecionados = ctx.pontosVizinhosList.filter((p: any) => ctx.selectedVizinhoPontoIds.includes(p.id));
  
       const novosPontoIds: number[] = [];
       const novosVizinhoIds: number[] = [];
  
       pontosSelecionados.forEach((p: any) => {
          const isM = p.tipo_ponto === 'M' || p.tipo === 'M';
          const isB = p.tipo_ponto === 'B' || p.tipo === 'B';
          const isRover = !isM && !isB;
          const isBruto = p.status_ponto === 'BRUTO';
          const isCorrigido = p.status_ponto === 'CORRIGIDO';
  
          let match = false;
          if (isM && checkedVals.includes('base-ppp')) match = true;
          if (isB && checkedVals.includes('base-campo')) match = true;
          if (isRover && checkedVals.includes('rover-vertice')) match = true;
          if (isBruto && checkedVals.includes('ponto-bruto')) match = true;
          if (isCorrigido && checkedVals.includes('ponto-corrigido')) match = true;
  
          if (match) {
             novosPontoIds.push(p.id);
          }
       });
  
       if (checkedVals.includes('vizinho-ods')) {
          vizinhosSelecionados.forEach((p: any) => novosVizinhoIds.push(p.id));
       }
  
       ctx.selectedPontoIds = novosPontoIds;
       ctx.selectedVizinhoPontoIds = novosVizinhoIds;
  
       ctx.atualizarDestaqueLinhasTabela();
       fecharModalFiltro();
    });

    const inicializarDragDropGlobal = () => {
      let dragCounter = 0;
      const overlay = document.createElement('div');
      overlay.id = 'global-drag-overlay';
      overlay.className = 'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0c1510]/85 backdrop-blur-md border-4 border-dashed border-mint-vibrant/60 m-6 rounded-2xl pointer-events-none opacity-0 transition-all duration-300';
      overlay.innerHTML = `
        <div class="flex flex-col items-center justify-center p-8 text-center max-w-md bg-[#0e1b14]/95 border border-mint-vibrant/20 rounded-technical shadow-2xl scale-95 transition-transform duration-300" style="pointer-events: none;">
          <div class="w-20 h-20 bg-mint-vibrant/10 rounded-full flex items-center justify-center mb-6 border border-mint-vibrant/30 animate-pulse">
            <i data-lucide="upload-cloud" class="w-10 h-10 text-mint-vibrant"></i>
          </div>
          <h3 class="text-xl font-bold text-white mb-2">Importação Rápida de Campo</h3>
          <p class="text-sm text-white/70 leading-relaxed mb-4">
            Solte os arquivos <span class="font-mono text-mint-vibrant font-bold">.GNS</span>, <span class="font-mono text-mint-vibrant font-bold">.TXT</span>, <span class="font-mono text-mint-vibrant font-bold">.CSV</span> ou planilhas (<span class="font-mono text-mint-vibrant font-bold">.XLSX/.ODS</span>) em qualquer lugar para iniciar o processamento na Mesa Geodésica.
          </p>
          <span class="text-[10px] text-white/30 uppercase tracking-widest font-mono">GerenciGeo Auto-Detect</span>
        </div>
      `;
      document.body.appendChild(overlay);
      initIcons();

      const handleDragEnter = (e: DragEvent) => {
        if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          dragCounter++;
          overlay.classList.remove('pointer-events-none', 'opacity-0');
          overlay.classList.add('opacity-100');
          const innerCard = overlay.querySelector('div');
          if (innerCard) {
            innerCard.classList.remove('scale-95');
            innerCard.classList.add('scale-100');
          }
        }
      };

      const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
      };

      const handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          overlay.classList.add('pointer-events-none', 'opacity-0');
          overlay.classList.remove('opacity-100');
          const innerCard = overlay.querySelector('div');
          if (innerCard) {
            innerCard.classList.remove('scale-100');
            innerCard.classList.add('scale-95');
          }
        }
      };

      const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.add('pointer-events-none', 'opacity-0');
        overlay.classList.remove('opacity-100');
        const innerCard = overlay.querySelector('div');
        if (innerCard) {
          innerCard.classList.remove('scale-100');
          innerCard.classList.add('scale-95');
        }

        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          ctx.alternarEtapa('geoprocessamento');
          if (ctx.expandirIngestao) {
            ctx.expandirIngestao();
          }

          Array.from(e.dataTransfer.files).forEach(f => {
            const isGns = f.name.toLowerCase().endsWith('.gns');
            ctx.filesQueue.push({ file: f, destination: isGns ? 'base' : 'rover_rtk' });
          });

          ctx.renderFilaArquivos();
          showToast(`${e.dataTransfer.files.length} arquivo(s) adicionado(s) à fila de triagem.`, "success");
        }
      };

      window.addEventListener('dragenter', handleDragEnter);
      window.addEventListener('dragover', handleDragOver);
      window.addEventListener('dragleave', handleDragLeave);
      window.addEventListener('drop', handleDrop);

      return () => {
        window.removeEventListener('dragenter', handleDragEnter);
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('drop', handleDrop);
        overlay.remove();
      };
    };

    // 9. Lança Inicializadores
    setupEventDelegation();
    ctx.loadLevantamentoDetails();
    inicializarBuscaPonto();
    inicializarIngestaoCollapse();
    inicializarFiltroArquivos();
    inicializarSplitters();
    ctx.inicializarEventosCartorio();
    activeDragCleanup = inicializarDragDropGlobal();

    // Registra destruidor de eventos ao desmontar a página
    const cleanup = () => {
      // Remove listener do filtro de arquivos (previne memory leak — MT-09)
      if (_filtroArquivosClickHandler) {
        document.removeEventListener('click', _filtroArquivosClickHandler);
        _filtroArquivosClickHandler = null;
      }
      // Limpa todas as instâncias ativas do RibbonManager para evitar vazamento de memória e listeners duplicados
      Object.values(activeRibbonManagers).forEach(rm => rm.destroy());
      activeRibbonManagers = {};

      if (activeDragCleanup) {
        activeDragCleanup();
        activeDragCleanup = null;
      }

      // Limpa eventos globais de seleção e recentralização do mapa
      if (_pontoSelecionadoHandler) {
        window.removeEventListener('gerencigeo:ponto-selecionado', _pontoSelecionadoHandler);
        _pontoSelecionadoHandler = null;
      }
      if (_recenterHandler) {
        window.removeEventListener('gerencigeo:recenter', _recenterHandler);
        _recenterHandler = null;
      }

      // Fecha BroadcastChannel de configuração do mapa
      if (activeBroadcastChannel) {
        activeBroadcastChannel.close();
        activeBroadcastChannel = null;
      }

      // Destrói atalhos de teclado e histórico (Ctrl+Z / Ctrl+Y)
      if (ctx.gerenciadorHistorico && typeof ctx.gerenciadorHistorico.destroy === 'function') {
        ctx.gerenciadorHistorico.destroy();
        ctx.gerenciadorHistorico = null;
      }

      // Limpa listener global de ações de popup no document
      if ((ctx as any)._popupActionsListener) {
        document.removeEventListener('click', (ctx as any)._popupActionsListener);
        (ctx as any)._popupActionsListener = null;
      }

      // Desativa a ferramenta Caneta se estiver ativa e limpa o atalho 'P'
      if (ctx.ferramentaCaneta) {
        if (ctx.ferramentaCaneta.ativo && typeof ctx.ferramentaCaneta.desativar === 'function') {
          ctx.ferramentaCaneta.desativar();
        }
        ctx.ferramentaCaneta = null;
      }
      if ((ctx as any)._canetaKeydownListener) {
        window.removeEventListener('keydown', (ctx as any)._canetaKeydownListener);
        (ctx as any)._canetaKeydownListener = null;
      }

      // Desvincula o contexto ativo do modal de sincronização da nuvem
      setNuvemSyncContext(null);
      _geradorDocumentosLoaded = false;

      ctx.canvasInteracao = null;
      ctx.triagemMap = null;
      ctx.mapaController = null;
      activeMapaController = null;
    };

    routeCleanup = cleanup;
  },
  cleanup: () => {
    if (routeCleanup) {
      routeCleanup();
      routeCleanup = null;
    }
  }
};

let activeRibbonManagers: Record<string, RibbonManager> = {};

function setupRibbonInteractions(ctx: any): void {
  registerFluentComponents();
  const tabButtons = document.querySelectorAll('.rl3-tab');
  const panelRows = document.querySelectorAll('.rl3-panel');

  // Inicializa o Gerenciador de Responsividade do Ribbon para todos os painéis de abas
  const ribbonPanelIds = ['panel-geoprocessamento', 'panel-perimetro', 'panel-cartorio', 'panel-auditoria'];
  
  // Limpa instâncias anteriores caso já existam
  Object.values(activeRibbonManagers).forEach(rm => rm.destroy());
  activeRibbonManagers = {};

  ribbonPanelIds.forEach(panelId => {
    try {
      const rm = new RibbonManager(panelId);
      rm.init().catch(console.error);
      activeRibbonManagers[panelId] = rm;
    } catch (err) {
      console.warn(`[RibbonManager] Painel ${panelId} não inicializado:`, err);
    }
  });

  // Suporte a navegabilidade nativa por teclado no <fluent-tablist> (Setas Esquerda/Direita)
  const tablist = document.querySelector('fluent-tablist');
  if (tablist) {
    tablist.addEventListener('change', (e: Event) => {
      const target = e.target as any;
      const activeTab = target?.activeTab || target;
      const tabTarget = activeTab?.getAttribute('data-tab');
      if (tabTarget) {
        tabButtons.forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-tab') === tabTarget);
        });
        panelRows.forEach(row => row.classList.add('hidden'));

        let panelId = 'panel-geoprocessamento';
        if (tabTarget === 'cartorio') panelId = 'panel-perimetro';
        else if (tabTarget === 'documentos') panelId = 'panel-cartorio';
        else if (tabTarget === 'auditoria') panelId = 'panel-auditoria';

        const targetPanel = document.getElementById(panelId);
        if (targetPanel) {
          targetPanel.classList.remove('hidden');
          const rm = activeRibbonManagers[panelId];
          if (rm) requestAnimationFrame(() => rm.adjustLayout());
        }

        if (ctx && typeof ctx.alternarEtapa === 'function' && ctx.etapaAtiva !== tabTarget) {
          ctx.alternarEtapa(tabTarget);
        }
      }
    });
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', (e: Event) => {
      const targetBtn = e.currentTarget as HTMLButtonElement;
      const tabTarget = targetBtn.getAttribute('data-tab');

      if (!tabTarget) return;

      tabButtons.forEach(btn => {
        btn.classList.remove('active');
      });
      targetBtn.classList.add('active');

      panelRows.forEach(row => row.classList.add('hidden'));
      
      let panelId = 'panel-geoprocessamento';
      if (tabTarget === 'cartorio') panelId = 'panel-perimetro';
      else if (tabTarget === 'documentos') panelId = 'panel-cartorio';
      else if (tabTarget === 'auditoria') panelId = 'panel-auditoria';

      const targetPanel = document.getElementById(panelId);
      if (targetPanel) {
        targetPanel.classList.remove('hidden');
        const rm = activeRibbonManagers[panelId];
        if (rm) {
          requestAnimationFrame(() => rm.adjustLayout());
        }
      }

      if (ctx && typeof ctx.alternarEtapa === 'function' && ctx.etapaAtiva !== tabTarget) {
        ctx.alternarEtapa(tabTarget);
      }
    });
  });

  const btnVoltar = document.getElementById('btn-voltar-lista');
  if (btnVoltar) {
    btnVoltar.addEventListener('click', () => {
      window.location.hash = '#levantamentos';
    });
  }

  // Recarrega os marcadores e a geometria ao mudar as opções visuais
  if (activeBroadcastChannel) {
    activeBroadcastChannel.close();
    activeBroadcastChannel = null;
  }
  const bcConfig = new BroadcastChannel('gerencigeo_map_config');
  activeBroadcastChannel = bcConfig;
  bcConfig.onmessage = (event) => {
    if (event.data === 'RELOAD_REQUIRED' && typeof ctx.renderMatriculaDados === 'function') {
      setTimeout(() => {
        ctx.renderMatriculaDados();
      }, 50);
    }
  };


  // Listeners para os botões de navegação global transferidos da barra lateral
  const navButtons = [
    { id: 'nav-btn-dashboard', hash: '#dashboard' },
    { id: 'nav-btn-clientes', hash: '#clientes' },
    { id: 'nav-btn-levantamentos', hash: '#levantamentos' },
    { id: 'nav-btn-propriedades', hash: '#propriedades' },
    { id: 'nav-btn-hgo', hash: '#hgo' },
    { id: 'nav-btn-fronteira', hash: '#fronteira' },
    { id: 'nav-btn-ccir', hash: '#ccir' },
    { id: 'nav-btn-configuracoes', hash: '#configuracoes' }
  ];

  navButtons.forEach(btnInfo => {
    const btn = document.getElementById(btnInfo.id);
    if (btn) {
      btn.addEventListener('click', () => {
        window.location.hash = btnInfo.hash;
      });
    }
  });

  const btnSalvar = document.getElementById('btn-salvar-rascunho');
  if (btnSalvar) {
    btnSalvar.addEventListener('click', () => {
      if (ctx && typeof ctx.salvarRascunhoLocal === 'function') {
        ctx.salvarRascunhoLocal();
      } else {
        showToast("Rascunho salvo com sucesso localmente!", "success");
      }
    });
  }


  // AutoCAD Titlebar Window Actions via pywebview js_api
  const winBtnMin = document.getElementById('win-btn-minimize');
  if (winBtnMin) {
    winBtnMin.addEventListener('click', () => {
      (window as any).pywebview?.api?.minimize();
    });
  }

  const winBtnMax = document.getElementById('win-btn-maximize');
  if (winBtnMax) {
    winBtnMax.addEventListener('click', () => {
      (window as any).pywebview?.api?.toggle_maximize();
    });
  }

  const winBtnClose = document.getElementById('win-btn-close');
  if (winBtnClose) {
    winBtnClose.addEventListener('click', () => {
      (window as any).pywebview?.api?.close();
    });
  }

  // AutoCAD Properties Panel Toggle Action
  const panel = document.getElementById('painel-propriedades');
  const btnToggleProps = document.getElementById('btn-toggle-props');
  const workspaceBody = document.querySelector('.workspace-body') as HTMLElement;
  if (panel && btnToggleProps && workspaceBody) {
    btnToggleProps.addEventListener('click', () => {
      panel.classList.add('transition-width');
      const isCollapsed = panel.classList.toggle('collapsed');
      
      if (isCollapsed) {
        workspaceBody.style.setProperty('--props-panel-w', '36px');
      } else {
        const larguraSalva = localStorage.getItem('gerencigeo_props_panel_width') || '280px';
        workspaceBody.style.setProperty('--props-panel-w', larguraSalva);
      }

      const icon = btnToggleProps.querySelector('i, svg');
      if (icon) {
        if (isCollapsed) {
          icon.innerHTML = `<path d="m9 18 6-6-6-6"/>`; // chevron-right
          btnToggleProps.setAttribute('title', 'Expandir painel');
        } else {
          icon.innerHTML = `<path d="m15 18-6-6 6-6"/>`; // chevron-left
          btnToggleProps.setAttribute('title', 'Recolher painel');
        }
      }

      // Remove a transição e invalida mapa para o redimensionamento fluir
      setTimeout(() => {
        panel.classList.remove('transition-width');
        if (ctx.triagemMap) ctx.triagemMap.invalidateSize?.();
      }, 190);
    });
  }
}

