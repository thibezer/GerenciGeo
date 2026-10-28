import L from 'leaflet';
import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, customAlert, customConfirm, showToast } from '../utils';
import { renderMesaTrabalho } from './mesa_trabalho_template';
import { atualizarPainelPropriedades } from './mesa_trabalho/painel_propriedades';
import { selecionarVerticeClicado, instalarAlternanciaPilha } from './mesa_trabalho/seletor_sobrepostos';
import { inicializarEventosTabela } from './mesa_trabalho/tabela_dados';
import type { MesaTrabalhoContext } from './mesa_trabalho/mesa_trabalho_context';
import { setupMesaGeodesica, renderTabelaMesaGeodesica } from './mesa_trabalho/mesa_geodesica';
import { renderTabelaOrganizadorPerimetro } from './mesa_trabalho/organizador_perimetro';
import { setupOrdenadorManual } from './mesa_trabalho/ordenador_manual';
import { setupGeradorDocumentos } from './mesa_trabalho/gerador_documentos';
import { setupAuditoriaHistorico, renderHistoricoCampo } from './mesa_trabalho/auditoria_historico';
import { setupMesaTrabalhoHistorico } from './mesa_trabalho/mesa_trabalho_historico';
import { consultarEPlotarSigef } from '../utils/sigef_consultor';
import { setNuvemSyncContext } from './mesa_trabalho/nuvem_sync_modal';
import {
  aplicarLargurasSalvas,
  inicializarSplitters,
  inicializarDragDropGlobal,
  inicializarBarraAcoesLote,
  setupRibbonInteractions,
  inicializarAtalhosTeclado
} from './mesa_trabalho/core';

let _pontoSelecionadoHandler: ((e: any) => void) | null = null;
let _recenterHandler: (() => void) | null = null;

export let activeMapaController: any = null;
let activeDragCleanup: (() => void) | null = null;
let activeSplittersCleanup: (() => void) | null = null;
let activeBatchActionsCleanup: (() => void) | null = null;
let activeRibbonCleanup: (() => void) | null = null;
let activeShortcutsCleanup: (() => void) | null = null;
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
      selectedSegmentoId: null,
      selectedSegmento: null,
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
    setupOrdenadorManual(ctx);
    setupGeradorDocumentos(ctx);

    setupAuditoriaHistorico(ctx);
    activeRibbonCleanup = setupRibbonInteractions(ctx);

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

        // 1. Restaurar ou selecionar matrícula padrão
        const storageKeyMat = `ultima_matricula_lev_${ctx.currentLevId}`;
        const savedMatId = localStorage.getItem(storageKeyMat);
        let targetMatId: number | null = null;

        if (savedMatId && ctx.matriculasList.some((m: any) => String(m.id) === String(savedMatId))) {
          targetMatId = parseInt(savedMatId, 10);
        } else if (ctx.matriculasList.length > 0) {
          // Prioriza matrícula que possua segmentos cadastrados
          const matComSeg = ctx.matriculasList.find((m: any) => 
            ctx.segmentosList.some((s: any) => String(s.matricula_id) === String(m.id))
          );
          targetMatId = matComSeg ? matComSeg.id : ctx.matriculasList[0].id;
        }

        if (targetMatId) {
          ctx.currentMatriculaId = targetMatId;
        }

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

        // Assegura que o LayerManager do CAD aponte a camada WMS do SIGEF para o Geoportal oficial do INCRA
        const lm = typeof canvasEl.getLayerManager === 'function' ? canvasEl.getLayerManager() : canvasEl.controller?.layerManager;
        if (lm) {
          const sigefLayer = typeof lm.getLayer === 'function' ? lm.getLayer('sigef') : lm.layers?.find((l: any) => l.id === 'sigef');
          if (sigefLayer) {
            sigefLayer.dados = {
              url: 'https://geoportal.incra.gov.br/geoserver/wms',
              layers: 'geonode:sigef_geo',
              format: 'image/png',
              attribution: 'INCRA/SIGEF'
            };
            const inst = lm.layerInstances?.get('sigef');
            if (inst && typeof inst.setUrl === 'function') {
              inst.setUrl('https://geoportal.incra.gov.br/geoserver/wms');
              inst.setParams?.({ layers: 'geonode:sigef_geo' });
            }
          }
        }

        // Clique repetido sobre vértices empilhados alterna entre eles (antes da seleção por caixa do canvas)
        instalarAlternanciaPilha(ctx, canvasEl);

        // Escuta eventos customizados agnósticos do ui-canvas-cad
        canvasEl.addEventListener('ui-ponto-selecionado', (e: any) => {
          ctx.selectedSegmentoId = null;
          ctx.selectedSegmento = null;
          const pId = e.detail?.lastSelectedId || (e.detail?.selectedIds && e.detail.selectedIds[0]);
          if (pId) {
            ctx.cliqueVerticeMapa?.(pId);
          }
        });

        canvasEl.addEventListener('ui-segmento-selecionado', (e: any) => {
          const segmento = e.detail?.segmento;
          if (segmento && typeof ctx.selectSegmentoFromMapa === 'function') {
            ctx.selectSegmentoFromMapa(segmento);
          }
        });

        canvasEl.addEventListener('ui-clique-sequencial', (e: any) => {
          const pId = e.detail?.id || e.detail?.pontoId;
          if (pId && typeof ctx.lidarCliqueMarcadorSequencial === 'function') {
            ctx.lidarCliqueMarcadorSequencial(pId);
          }
        });

        // O kit cobre o mapa com uma camada transparente e abre o popup do ponto por proximidade; o filtro de
        // "clique livre" dele não enxerga esse acerto. Sem esta checagem o popup do SIGEF substituía o do ponto.
        const cliqueSobrePonto = (pixel: { x: number; y: number } | undefined): boolean => {
          const map = ctx.triagemMap;
          if (!map || !pixel) return false;
          const listas = [ctx.pontosList, ctx.bancoPontosList, ctx.pontosVizinhosList];
          for (const lista of listas) {
            for (const p of (lista || []) as any[]) {
              const lat = Number(p?.lat);
              const lon = Number(p?.lon ?? p?.lng);
              if (!lat || !lon) continue;
              const pt = map.latLngToContainerPoint([lat, lon]);
              if (Math.hypot(pt.x - pixel.x, pt.y - pixel.y) <= 12) return true;
            }
          }
          return false;
        };

        // Vértice do perímetro da matrícula ativa mais próximo do pixel clicado (até 12 px), ou null.
        const verticePerimetroNoPixel = (pixel: { x: number; y: number } | undefined): number | null => {
          const map = ctx.triagemMap;
          if (!map || !pixel) return null;
          let maisProximo: number | null = null;
          let menorDist = 12;
          for (const p of ctx.obterPontosParaOrdenacao() as any[]) {
            if (!p || p.ignorar_poligono === 1 || p.tipo_ponto === 'B' || p.tipo === 'B') continue;
            if (ctx.currentMatriculaId && String(p.matricula_id) !== String(ctx.currentMatriculaId)) continue;
            const lat = Number(p.lat);
            const lon = Number(p.lon ?? p.lng);
            if (!lat || !lon) continue;
            const pt = map.latLngToContainerPoint([lat, lon]);
            const dist = Math.hypot(pt.x - pixel.x, pt.y - pixel.y);
            if (dist <= menorDist) {
              menorDist = dist;
              maisProximo = Number(p.id);
            }
          }
          return maisProximo;
        };

        canvasEl.addEventListener('ui-canvas-clique', (e: any) => {
          // A seleção em caixa do kit deixa os vértices transparentes ao mouse no mousedown, então o clique
          // num vértice chega aqui como "clique livre". No "Caminhar Clique" ele é resolvido por proximidade.
          if (ctx.modoCliqueSequencialAtivo) {
            const pIdSeq = verticePerimetroNoPixel(e.detail?.pontoPixel);
            if (pIdSeq) ctx.lidarCliqueMarcadorSequencial(pIdSeq);
            return;
          }
          if (cliqueSobrePonto(e.detail?.pontoPixel)) return;
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
          // O canvas também avisa o clique num vértice só por este evento global; no "Caminhar Clique" ele numera o ponto.
          if (ctx.modoCliqueSequencialAtivo) {
            const pIdSeq = e.detail?.lastSelectedPontoId ?? e.detail?.selectedPontoIds?.[0];
            if (pIdSeq) ctx.lidarCliqueMarcadorSequencial(pIdSeq);
            return;
          }
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
      try {
        localStorage.setItem(`ultima_matricula_lev_${ctx.currentLevId}`, String(matriculaId));
      } catch (e) {}

      const selectMat = document.getElementById('select-matricula-ribbon') as HTMLSelectElement;
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
      if (ctx.etapaAtiva === 'documentos') {
        ctx.carregarHomologacaoDados(ctx.currentProfissionalId ?? 0);
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
      ctx.aoMudarEtapa?.(etapa);

      // Alternância de views do workspace-body (AutoCAD style abas)
      const allViews = document.querySelectorAll('.view-panel');
      allViews.forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active-view');
      });

      // Org. de Perímetro só tem o mapa + ordenador lateral (a tabela de divisas/confrontantes fica em Peças de Cartório)
      let targetViewId: string | null = 'view-mesa-geodesica';
      if (etapa === 'cartorio') targetViewId = null;
      else if (etapa === 'documentos') targetViewId = 'view-cartorio';
      else if (etapa === 'auditoria') targetViewId = 'view-auditoria';

      const targetView = targetViewId ? document.getElementById(targetViewId) : null;
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

      // Peças de Cartório não seleciona pontos: o painel lateral não tem função e só rouba largura.
      const semPainelProps = etapa === 'documentos';
      painelPropriedades?.classList.toggle('hidden', semPainelProps);
      document.querySelector('.workspace-body')?.classList.toggle('sem-painel-props', semPainelProps);

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
        if (typeof ctx.carregarConfrontantesAtivosSelect === 'function') {
          ctx.carregarConfrontantesAtivosSelect();
        }
        // Sem profissional vinculado a etapa também carrega (o passo Peças é que aponta a falta dele)
        if (typeof ctx.carregarHomologacaoDados === 'function') {
          ctx.carregarHomologacaoDados(ctx.currentProfissionalId ?? 0);
        }
      } else if (etapa === 'cartorio') {
        if (typeof ctx.carregarConfrontantesAtivosSelect === 'function') {
          ctx.carregarConfrontantesAtivosSelect();
        }
      } else if (etapa === 'auditoria') {
        renderHistoricoCampo(ctx);
      }

      // Peças de Cartório: mapa fixo à esquerda e conteúdo à direita (para conferir divisas e vizinhos SIGEF o tempo todo)
      document.querySelector('.workspace-main-content')?.classList.toggle('etapa-cartorio-split', etapa === 'documentos');
      document.querySelector('.workspace-wrapper')?.classList.toggle('ribbon-compacto', etapa === 'documentos');

      if (etapa === 'geoprocessamento' || etapa === 'cartorio' || etapa === 'documentos') {
        containerMapa?.classList.remove('hidden');
        splitterMapa?.classList.toggle('hidden', etapa === 'cartorio' || etapa === 'documentos');
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

      // Sincroniza a aba ativa no Web Component <ui-ribbon> oficial
      const mesaRibbon = document.getElementById('mesa-ribbon') as any;
      if (mesaRibbon && typeof mesaRibbon.selecionarAba === 'function' && mesaRibbon.abaAtiva !== etapa) {
        mesaRibbon.selecionarAba(etapa, false);
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

      const matAtiva = ctx.matriculasList.find((m: any) => String(m.id) === String(ctx.currentMatriculaId));
      const effectiveMatId = (matAtiva && matAtiva.matricula_origem_desenho_id) ? matAtiva.matricula_origem_desenho_id : ctx.currentMatriculaId;
      const segmentosMat = effectiveMatId
        ? (ctx.segmentosList || []).filter((s: any) => String(s.matricula_id) === String(effectiveMatId))
        : (ctx.segmentosList || []);

      const bpAtivo = ctx.bancoPontosExibido && ctx.bancoPontosList && ctx.bancoPontosList.length > 0;
      ctx.mapaController.clearOverlays(bpAtivo);
      ctx.mapaController.plotPontos(pontosMat, (pId: number) => ctx.cliqueVerticeMapa?.(pId));

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

    ctx.selectSegmentoFromMapa = (segmento: any) => {
      ctx.selectedPontoIds = [];
      ctx.selectedVizinhoPontoIds = [];
      ctx.lastSelectedPontoId = null;
      ctx.selectedSegmentoId = segmento?.id != null ? segmento.id : `${segmento?.ponto_inicio_id}-${segmento?.ponto_fim_id}`;
      ctx.selectedSegmento = segmento;

      // Abre o painel de propriedades se estiver recolhido
      const painelPropriedades = document.getElementById('painel-propriedades');
      const workspaceBody = document.querySelector('.workspace-body') as HTMLElement | null;
      if (painelPropriedades && painelPropriedades.classList.contains('collapsed')) {
        painelPropriedades.classList.remove('collapsed');
        const larguraSalva = localStorage.getItem('gg_props_panel_width') || '340px';
        if (workspaceBody) {
          workspaceBody.style.setProperty('--props-panel-w', larguraSalva);
        }
      }

      ctx.atualizarDestaqueLinhasTabela();
      atualizarPainelPropriedades(ctx);
    };

    ctx.limparSelecaoSegmento = () => {
      ctx.selectedSegmentoId = null;
      ctx.selectedSegmento = null;
      if (ctx.mapaController && typeof ctx.mapaController.selectSegmento === 'function') {
        ctx.mapaController.selectSegmento(null);
      }
      atualizarPainelPropriedades(ctx);
    };

    ctx.selectPontoFromTabela = (pontoId: number) => {
      ctx.selectedSegmentoId = null;
      ctx.selectedSegmento = null;
      if (ctx.mapaController && typeof ctx.mapaController.selectSegmento === 'function') {
        ctx.mapaController.selectSegmento(null);
      }

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

    // Todos os caminhos de clique num vértice do mapa (callback do plotPontos, 'ui-ponto-selecionado')
    // passam por aqui, para o "Caminhar Clique" valer em qualquer etapa.
    ctx.cliqueVerticeMapa = (pontoId: number | string) => {
      if (ctx.modoCliqueSequencialAtivo) {
        ctx.lidarCliqueMarcadorSequencial(pontoId);
      } else {
        // Trata vértices empilhados: alterna entre eles e oferece lista de escolha
        selecionarVerticeClicado(ctx, pontoId);
      }
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

    ctx.aplicarLargurasSplitters = aplicarLargurasSalvas;

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

      // Atualiza o item no Ribbon oficial
      const mesaRibbon = document.getElementById('mesa-ribbon') as any;
      if (mesaRibbon && typeof mesaRibbon.atualizarItem === 'function') {
        mesaRibbon.atualizarItem('btn-toggle-fonte-pontos', {
          rotulo: ctx.bancoPontosExibido
            ? `Planilha SIGEF (${ctx.bancoPontosList.length} pts)`
            : 'Fonte: Campo'
        });
      }

      initIcons();
      ctx.renderMatriculaDados();
    };

    document.getElementById('btn-toggle-fonte-pontos')?.addEventListener('click', alternarFontePontosHandler);

    // 9. Lança Inicializadores
    setupEventDelegation();
    ctx.loadLevantamentoDetails();
    inicializarBuscaPonto();
    inicializarIngestaoCollapse();
    inicializarFiltroArquivos();
    activeSplittersCleanup = inicializarSplitters(ctx);
    activeBatchActionsCleanup = inicializarBarraAcoesLote(ctx, confirmarExclusaoPonto);
    ctx.inicializarEventosCartorio();
    activeDragCleanup = inicializarDragDropGlobal(ctx);
    activeShortcutsCleanup = inicializarAtalhosTeclado(ctx, confirmarExclusaoPonto);

    // Registra destruidor de eventos ao desmontar a página
    const cleanup = () => {
      // Remove listener do filtro de arquivos (previne memory leak)
      if (_filtroArquivosClickHandler) {
        document.removeEventListener('click', _filtroArquivosClickHandler);
        _filtroArquivosClickHandler = null;
      }

      if (activeRibbonCleanup) {
        activeRibbonCleanup();
        activeRibbonCleanup = null;
      }

      if (activeSplittersCleanup) {
        activeSplittersCleanup();
        activeSplittersCleanup = null;
      }

      if (activeBatchActionsCleanup) {
        activeBatchActionsCleanup();
        activeBatchActionsCleanup = null;
      }

      if (activeDragCleanup) {
        activeDragCleanup();
        activeDragCleanup = null;
      }

      if (activeShortcutsCleanup) {
        activeShortcutsCleanup();
        activeShortcutsCleanup = null;
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

      // Destrói histórico (Ctrl+Z / Ctrl+Y)
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

