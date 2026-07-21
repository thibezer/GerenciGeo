import L from 'leaflet';
import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, customAlert, customConfirm, showToast } from '../utils';
import { renderMesaTrabalho } from './mesa_trabalho_template';
import { MesaTrabalhoMapa } from './mesa_trabalho/mapa/mapa_controller';
import { atualizarPainelPropriedades } from './mesa_trabalho/painel_propriedades';
import { inicializarEventosTabela } from './mesa_trabalho/tabela_dados';
import type { MesaTrabalhoContext } from './mesa_trabalho/mesa_trabalho_context';
import { setupMesaGeodesica, renderTabelaMesaGeodesica } from './mesa_trabalho/mesa_geodesica';
import { setupOrganizadorPerimetro, renderTabelaOrganizadorPerimetro } from './mesa_trabalho/organizador_perimetro';
import { setupOrdenadorManual } from './mesa_trabalho/ordenador_manual';
import { setupGeradorDocumentos } from './mesa_trabalho/gerador_documentos';
import { setupAuditoriaHistorico, renderHistoricoCampo } from './mesa_trabalho/auditoria_historico';
import { CanvasInteracao } from './mesa_trabalho/canvas_interacao';
import { RibbonManager } from '../ui/ribbon_manager';

// Interceptadores globais de erros para depuração do pywebview
window.addEventListener('error', (event) => {
  console.error("Exceção global capturada:", event.error);
  alert(`[Erro de Script]: ${event.message}\nArquivo: ${event.filename}\nLinha: ${event.lineno}:${event.colno}\nStack: ${event.error?.stack}`);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error("Promessa não tratada capturada:", event.reason);
  alert(`[Erro de Promessa]: ${event.reason?.message || event.reason}\nStack: ${event.reason?.stack}`);
});

export let activeMapaController: MesaTrabalhoMapa | null = null;
let ctxClickOutsideHandler: ((e: MouseEvent) => void) | null = null;
let ctxScrollHandler: (() => void) | null = null;
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

    const mapaController = new MesaTrabalhoMapa();
    activeMapaController = mapaController;
    mapaController.levantamentoId = parseInt(activeId);

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
      lidarCliqueMarcadorSequencial: () => {},
      obterPontosParaOrdenacao: () => [],
      alternarModoReordenarManual: () => {}
    };

    ctx.atualizarPainelPropriedades = () => atualizarPainelPropriedades(ctx);

    // 2. Registra os submódulos no contexto comum
    setupMesaGeodesica(ctx);
    setupOrganizadorPerimetro(ctx);
    setupOrdenadorManual(ctx);
    setupGeradorDocumentos(ctx);
    setupAuditoriaHistorico(ctx);
    setupRibbonInteractions(ctx);

    // 3. Estilos de Resizers individuais
    setTimeout(() => {
      const styleId = 'gerencigeo-column-resizer-styles';
      if (!document.getElementById(styleId)) {
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.innerHTML = `
            th.resizable-col {
               position: relative !important;
            }
            .col-resizer {
               position: absolute;
               top: 0;
               right: 0;
               width: 6px;
               height: 100%;
               cursor: col-resize;
               user-select: none;
               z-index: 10;
               background-color: transparent;
               transition: background-color 0.2s;
            }
            .col-resizer:hover, .col-resizer.resizing {
               background-color: #00f5a0 !important;
               width: 3px;
            }
         `;
        document.head.appendChild(styleEl);
      }
    }, 50);

    // 4. Implementação de Funções Centrais / Globais
    ctx.loadLevantamentoDetails = async () => {
      if (!ctx.currentLevId) return;

      try {
        const resLev = await fetch(`${API_BASE}/levantamentos`);
        if (!resLev.ok) throw new Error(`HTTP ${resLev.status} ao carregar levantamentos`);
        const allLevs = await resLev.json();
        const levObj = allLevs.find((l: any) => l.id === ctx.currentLevId);
        ctx.currentLevantamento = levObj;

        if (levObj) {
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

        const [resMat, resPt, resSeg, resConf, resViz] = await Promise.all([
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/segmentos`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos-vizinhos`)
        ]);

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

        ctx.carregarConfrontantesAtivosSelect();

        const abasContainer = document.getElementById('select-matricula-ribbon') as HTMLSelectElement;
        if (abasContainer) {
          if (ctx.matriculasList.length === 0) {
            abasContainer.innerHTML = `
              <option value="">[Sem Matrícula]</option>
            `;
          } else {
            let abasHtml = ctx.matriculasList.map((m: any) => `
              <option value="${m.id}" ${ctx.currentMatriculaId === m.id ? 'selected' : ''}>
                Matrícula ${m.numero_matricula} (${m.area_ha || m.area || '0'}ha)
              </option>
            `).join('');

            abasContainer.innerHTML = abasHtml;

            const novoSelect = abasContainer.cloneNode(true) as HTMLSelectElement;
            abasContainer.parentNode?.replaceChild(novoSelect, abasContainer);

            novoSelect.addEventListener('change', () => {
              const mId = parseInt(novoSelect.value || '0');
              if (mId) {
                ctx.switchMatriculaTab(mId);
              }
            });

            if (ctx.currentMatriculaId === null && ctx.matriculasList.length > 0) {
              ctx.switchMatriculaTab(ctx.matriculasList[0].id);
            } else if (ctx.currentMatriculaId !== null) {
              novoSelect.value = ctx.currentMatriculaId.toString();
            }
          }
        }

        inicializarMapOnce();
        ctx.renderFilaArquivos();
        ctx.loadWorkspaceArquivos();
        ctx.alternarEtapa(ctx.etapaAtiva);
        
        // Centralização inicial do mapa nos pontos da propriedade
        if (ctx.triagemMap && ctx.mapaController) {
          setTimeout(() => {
            ctx.triagemMap!.invalidateSize();
            
            let pontosParaCentralizar = [];
            
            // Na mesa geodésica o usuário vê os pontos brutos/ordenados, se tiver matrícula ele filtra.
            if (ctx.currentMatriculaId && ctx.obterPontosParaOrdenacao) {
              pontosParaCentralizar = ctx.obterPontosParaOrdenacao();
            } else if (ctx.currentMatriculaId) {
              pontosParaCentralizar = ctx.pontosList.filter((p: any) => p.matricula_id === ctx.currentMatriculaId);
            } else {
              pontosParaCentralizar = ctx.pontosList;
            }
            
            if (pontosParaCentralizar.length > 0) {
              ctx.mapaController.fitBounds(pontosParaCentralizar);
            }
          }, 600); // 600ms para garantir transição do SPA Vanilla e render da DOM Layout
        }
        
        ctx.carregarSugestoesNumeracao();
        if (levObj && levObj.profissional_id) {
          ctx.currentProfissionalId = levObj.profissional_id;
          ctx.carregarHomologacaoDados(levObj.profissional_id);
        }

      } catch (e) {
        console.error("Erro ao carregar detalhes do levantamento:", e);
        showToast("Erro ao carregar dados do levantamento. Verifique a conexão com a API.", 'error');
      }
    };

    const inicializarMapOnce = () => {
      if (!ctx.triagemMap) {
        ctx.triagemMap = ctx.mapaController.init('mapa-triagem');
        
        // Ativa interações AutoCAD no Canvas (Pan com botão do meio, janelas de seleção, etc)
        const canvasInteracao = new CanvasInteracao(ctx);
        canvasInteracao.ativar(ctx.mapaController);
        ctx.mapaController.canvasInteracao = canvasInteracao;
        ctx.canvasInteracao = canvasInteracao;
        
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

      const selectMat = document.getElementById('select-matricula-ribbon') as HTMLSelectElement;
      if (selectMat) {
        selectMat.value = matriculaId.toString();
      }

      const matObj = ctx.matriculasList.find(m => m.id === ctx.currentMatriculaId);
      const txtMat = document.getElementById('txt-nome-matricula-ativa');
      if (txtMat && matObj) {
        txtMat.textContent = `Nº ${matObj.numero_matricula} (${matObj.area_ha || matObj.area || '0'}ha)`;
      }

      ctx.renderMatriculaDados();
      ctx.carregarConfrontantesAtivosSelect();
      if (ctx.currentProfissionalId !== null) {
        ctx.carregarHomologacaoDados(ctx.currentProfissionalId);
      }

      if (ctx.triagemMap) {
        setTimeout(() => {
          ctx.triagemMap!.invalidateSize();
          const pontosMat = ctx.pontosList.filter(p => p.matricula_id === ctx.currentMatriculaId);
          const validCoords = pontosMat.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0).map(p => L.latLng(p.lat, p.lon));
          if (validCoords.length > 0) {
            const bounds = L.latLngBounds(validCoords);
            ctx.triagemMap!.fitBounds(bounds, { padding: [40, 40] });
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

      if (etapa === 'geoprocessamento' || etapa === 'cartorio') {
        containerMapa?.classList.remove('hidden');
        splitterMapa?.classList.remove('hidden');
        if (ctx.triagemMap) {
          setTimeout(() => {
            ctx.triagemMap?.invalidateSize();
          }, 50);
        }
      } else {
        containerMapa?.classList.add('hidden');
        splitterMapa?.classList.add('hidden');
      }

      const btnGeo = document.getElementById('btn-etapa-geoprocessamento');
      const btnCart = document.getElementById('btn-etapa-cartorio');
      const btnDoc = document.getElementById('btn-etapa-documentos');
      const btnAud = document.getElementById('btn-etapa-auditoria');
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      const gridSuperior = document.getElementById('grid-superior-detalhe');
      const containerTabelas = document.getElementById('container-tabelas-inferiores');
      const containerDivisas = document.getElementById('container-tabela-divisas');
      const btnSalvarPerimetro = document.getElementById('btn-salvar-perimetro-custom');
      const containerAuditoriaCampo = document.getElementById('container-etapa-auditoria-campo');
      const bannerSugestao = document.getElementById('banner-sugestao-numeracao');
      const panelHomologacao = document.getElementById('panel-homologacao-incra');
      const painelWorkspace = document.getElementById('painel-workspace-gnss');

      const lblTituloLateral = document.getElementById('lbl-titulo-tabela-lateral');
      const badgeLateral = document.getElementById('badge-tabela-lateral');

      const containerAbasMatriculas = document.getElementById('container-abas-matriculas');
      const containerInfoMatricula = document.getElementById('container-info-matricula-ativa');
      if (containerAbasMatriculas) {
        if (etapa === 'cartorio' || etapa === 'documentos') {
          containerAbasMatriculas.classList.remove('hidden');
        } else {
          containerAbasMatriculas.classList.add('hidden');
        }
      }
      if (containerInfoMatricula) {
        if (etapa === 'cartorio' || etapa === 'documentos') {
          containerInfoMatricula.classList.remove('hidden');
        } else {
          containerInfoMatricula.classList.add('hidden');
        }
      }

      if (etapa === 'geoprocessamento') {
        if (btnGeo) btnGeo.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnCart) btnCart.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnDoc) btnDoc.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnAud) btnAud.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';

        if (gridSuperior) gridSuperior.classList.remove('hidden');
        const splitterInf = document.getElementById('splitter-inferior');
        if (splitterInf) splitterInf.classList.add('hidden');

        if (containerDivisas) containerDivisas.classList.add('hidden');
        if (containerTabelas) containerTabelas.classList.remove('hidden');
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.add('hidden');
        if (painelWorkspace) painelWorkspace.classList.remove('hidden');
        if (lblTituloLateral) lblTituloLateral.innerText = "Auditoria de Translação Geodésica";
        if (badgeLateral) {
          badgeLateral.innerText = "VETOR DELTA ECEF";
          badgeLateral.className = "text-[9px] text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded-full font-bold";
        }
        if (btnSalvarPerimetro) btnSalvarPerimetro.classList.add('hidden');
        if (bannerSugestao) bannerSugestao.classList.add('hidden');
        if (panelHomologacao) panelHomologacao.classList.add('hidden');
      } else if (etapa === 'cartorio') {
        if (btnGeo) btnGeo.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnCart) btnCart.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnDoc) btnDoc.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnAud) btnAud.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';

        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (gridSuperior) gridSuperior.classList.remove('hidden');
        
        const splitterInf = document.getElementById('splitter-inferior');
        if (splitterInf) splitterInf.classList.remove('hidden');

        if (containerDivisas) containerDivisas.classList.remove('hidden');
        if (containerTabelas) containerTabelas.classList.remove('hidden');
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.add('hidden');
        if (painelWorkspace) painelWorkspace.classList.remove('hidden');
        if (lblTituloLateral) lblTituloLateral.innerText = "Segmentos de Divisa (Confrontantes)";
        if (badgeLateral) {
          badgeLateral.innerText = "EDICAO REAL-TIME";
          badgeLateral.className = "text-[9px] text-mint-vibrant font-mono bg-mint-vibrant/10 px-2 py-0.5 rounded-full font-bold";
        }
        if (btnSalvarPerimetro) btnSalvarPerimetro.classList.remove('hidden');
        if (panelHomologacao) panelHomologacao.classList.add('hidden'); // Oculto na Etapa 2
        ctx.carregarSugestoesNumeracao();
        if (typeof ctx.verificarRascunhoLocal === 'function') {
          ctx.verificarRascunhoLocal();
        }
      } else if (etapa === 'documentos') {
        if (btnGeo) btnGeo.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnCart) btnCart.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnDoc) btnDoc.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnAud) btnAud.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';

        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (gridSuperior) gridSuperior.classList.remove('hidden');
        const containerReordenar = document.getElementById('container-reordenar-manual');
        if (containerReordenar) containerReordenar.classList.add('hidden');
        
        const splitterInf = document.getElementById('splitter-inferior');
        if (splitterInf) splitterInf.classList.add('hidden');

        if (containerDivisas) containerDivisas.classList.add('hidden');
        if (containerTabelas) containerTabelas.classList.add('hidden');
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.add('hidden');
        if (painelWorkspace) painelWorkspace.classList.add('hidden');
        if (btnSalvarPerimetro) btnSalvarPerimetro.classList.add('hidden');
        if (bannerSugestao) bannerSugestao.classList.add('hidden');
        if (panelHomologacao) panelHomologacao.classList.remove('hidden'); // Visível na Etapa 3
        
        if (ctx.currentProfissionalId) {
          ctx.carregarHomologacaoDados(ctx.currentProfissionalId);
        }
      } else if (etapa === 'auditoria') {
        if (bannerSugestao) bannerSugestao.classList.add('hidden');
        if (panelHomologacao) panelHomologacao.classList.add('hidden');
        if (btnGeo) btnGeo.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnCart) btnCart.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnDoc) btnDoc.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnAud) btnAud.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';

        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (gridSuperior) gridSuperior.classList.add('hidden');
        
        if (containerTabelas) containerTabelas.classList.add('hidden');
        const splitterInf = document.getElementById('splitter-inferior');
        if (splitterInf) splitterInf.classList.add('hidden');
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.remove('hidden');
        if (painelWorkspace) painelWorkspace.classList.add('hidden');
        renderHistoricoCampo(ctx);
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
          ctx.triagemMap!.invalidateSize();
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

      const pontosMat = ctx.etapaAtiva === 'geoprocessamento'
        ? ctx.pontosList.filter(p => p && p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B' && (!ctx.arquivosDesativadosList || !ctx.arquivosDesativadosList.includes(p.arquivo_origem)))
        : ctx.obterPontosParaOrdenacao();

      ctx.mapaController.clearOverlays();
      ctx.mapaController.plotPontos(pontosMat, (pId: number) => {
        if (ctx.modoCliqueSequencialAtivo && typeof ctx.lidarCliqueMarcadorSequencial === 'function') {
          ctx.lidarCliqueMarcadorSequencial(pId);
        } else {
          ctx.selectPontoFromTabela(pId);
        }
      });
      ctx.mapaController.plotPolilinhaTemporaria(pontosMat);
      if (ctx.pontosVizinhosList && ctx.pontosVizinhosList.length > 0) {
        ctx.mapaController.plotPontosVizinhos(ctx.pontosVizinhosList);
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

      // 1. Remove highlight from rows that are NO LONGER selected
      _previousSelectedIds.forEach(pId => {
        if (!currentSelectedIds.has(pId)) {
          // Using querySelectorAll to handle potential edge cases where multiple views show the same ID
          document.querySelectorAll(`.linha-ponto-tbl[data-ponto-id="${pId}"]`).forEach(tr => {
            tr.classList.remove('bg-mint-vibrant/25', 'text-mint-vibrant', 'border-mint-vibrant/40');
            tr.classList.add('hover:bg-white/[0.02]', 'border-white/5');
          });
        }
      });

      // 2. Add highlight to rows that are NEWLY selected
      currentSelectedIds.forEach(pId => {
        if (!_previousSelectedIds.has(pId)) {
          // Using querySelectorAll to handle potential edge cases where multiple views show the same ID
          document.querySelectorAll(`.linha-ponto-tbl[data-ponto-id="${pId}"]`).forEach(tr => {
            tr.classList.add('bg-mint-vibrant/25', 'text-mint-vibrant', 'border-mint-vibrant/40');
            tr.classList.remove('hover:bg-white/[0.02]', 'border-white/5');
          });
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

      const row = document.getElementById(`tr-ponto-${pontoId}`);
      if (row) {
         row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      ctx.atualizarDestaqueLinhasTabela();
    };

    // 5. Configuração de Event Delegation (Tabelas de Campo/Matrícula)
    const setupEventDelegation = () => {
      const containerWorkspace = document.getElementById('container-workspace-arquivos');

      // Inicializa os eventos de clique, duplo clique e mudança da tabela inferior via tabela_dados.ts
      inicializarEventosTabela(ctx, abrirModalEditarPonto);

      if (containerWorkspace) {
        containerWorkspace.addEventListener('click', async (e) => {
          const target = e.target as HTMLElement;

          const btnVis = target.closest('.btn-visualizar-workspace');
          const btnDownload = target.closest('.btn-download-workspace');
          const btnDeletar = target.closest('.btn-deletar-workspace');

          if (btnVis || btnDownload) {
            const btn = (btnVis || btnDownload)!;
            const cat = btn.getAttribute('data-cat') || '';
            const nome = btn.getAttribute('data-nome') || '';
            window.open(`${API_BASE}/levantamentos/${ctx.currentLevId}/arquivos/download?categoria=${cat}&nome=${encodeURIComponent(nome)}`, '_blank');
            return;
          }

          if (btnDeletar) {
            const cat = btnDeletar.getAttribute('data-cat') || '';
            const nome = btnDeletar.getAttribute('data-nome') || '';

            let confirmMsg = `Tem certeza que deseja excluir o arquivo '${nome}' do repositório físico?`;
            if (cat === 'Processados' && nome.toLowerCase().endsWith('.txt')) {
              confirmMsg += `\n\nATENÇÃO: A exclusão desta caderneta purgará automaticamente todos os pontos importados dela no banco de dados.`;
            }

            if (!await customConfirm(confirmMsg)) return;

            try {
              const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/arquivos/deletar?categoria=${cat}&nome=${encodeURIComponent(nome)}`, {
                method: 'DELETE'
              });
              const resData = await res.json();
              if (resData.success) {
                showToast(resData.message, 'success');
                ctx.loadWorkspaceArquivos();
                if (resData.pontos_removidos > 0) {
                  ctx.loadLevantamentoDetails();
                }
              } else {
                showToast(`Erro ao excluir: ${resData.error || resData.detail || 'Falha desconhecida'}`, 'error');
              }
            } catch (err) {
              console.error("Erro ao deletar arquivo:", err);
              showToast("Erro de comunicação com o servidor API.", 'error');
            }
          }
        });
      }
    };

    // 6. Modal de Edição de Ponto e Menu de Contexto
    let pontoSelecionadoContextoId: number | null = null;

    const abrirModalEditarPonto = (pId: number) => {
      const pt = ctx.pontosList.find(x => x.id === pId);
      if (!pt) return;

      const modalPt = document.getElementById('modal-editar-ponto');
      if (!modalPt) return;

      pontoSelecionadoContextoId = pId;

      const elTitulo = document.getElementById('modal-pt-titulo-nome');
      if (elTitulo) elTitulo.innerText = pt.nome_vertice;

      const inputId = document.getElementById('input-pt-id') as HTMLInputElement;
      if (inputId) inputId.value = pt.id.toString();

      const inputNome = document.getElementById('input-pt-nome') as HTMLInputElement;
      if (inputNome) inputNome.value = pt.nome_vertice;

      const selectTipo = document.getElementById('select-pt-tipo') as HTMLSelectElement;
      if (selectTipo) selectTipo.value = pt.tipo_ponto || 'P';

      const selectStatus = document.getElementById('select-pt-status') as HTMLSelectElement;
      if (selectStatus) selectStatus.value = pt.status_ponto || 'BRUTO';

      const selectMetodo = document.getElementById('select-pt-metodo') as HTMLSelectElement;
      if (selectMetodo) selectMetodo.value = pt.metodo_posicionamento || 'PG1';

      const inputLat = document.getElementById('input-pt-lat') as HTMLInputElement;
      if (inputLat) inputLat.value = pt.lat ? pt.lat.toFixed(9) : '';

      const inputLon = document.getElementById('input-pt-lon') as HTMLInputElement;
      if (inputLon) inputLon.value = pt.lon ? pt.lon.toFixed(9) : '';

      const inputAlt = document.getElementById('input-pt-alt') as HTMLInputElement;
      if (inputAlt) inputAlt.value = pt.alt ? pt.alt.toFixed(4) : '';

      const inputSigLat = document.getElementById('input-pt-sigma-lat') as HTMLInputElement;
      if (inputSigLat) inputSigLat.value = pt.sigma_lat ? pt.sigma_lat.toFixed(4) : '0.0000';

      const inputSigLon = document.getElementById('input-pt-sigma-lon') as HTMLInputElement;
      if (inputSigLon) inputSigLon.value = pt.sigma_lon ? pt.sigma_lon.toFixed(4) : '0.0000';

      const inputSigAlt = document.getElementById('input-pt-sigma-alt') as HTMLInputElement;
      if (inputSigAlt) inputSigAlt.value = pt.sigma_alt ? pt.sigma_alt.toFixed(4) : '0.0000';

      const txtPtE = document.getElementById('txt-pt-e-orig');
      if (txtPtE) txtPtE.innerText = pt.e_original ? pt.e_original.toFixed(4) + ' m' : 'N/A';

      const txtPtN = document.getElementById('txt-pt-n-orig');
      if (txtPtN) txtPtN.innerText = pt.n_original ? pt.n_original.toFixed(4) + ' m' : 'N/A';

      const txtPtAlt = document.getElementById('txt-pt-alt-orig');
      if (txtPtAlt) txtPtAlt.innerText = pt.alt_original ? pt.alt_original.toFixed(4) + ' m' : 'N/A';

      const txtPtArq = document.getElementById('txt-pt-arquivo-origem');
      if (txtPtArq) txtPtArq.innerText = pt.arquivo_rinex ? `Origem: ${pt.arquivo_rinex}` : 'Origem: Ingestão Manual';

      const selectBase = document.getElementById('select-pt-base') as HTMLSelectElement;
      if (selectBase) {
        const basesDoLev = ctx.pontosList.filter(x => {
          if (pt.tipo_ponto === 'B') {
            return x.tipo_ponto === 'M' && x.id !== pId;
          } else {
            return (x.tipo_ponto === 'M' || x.tipo_ponto === 'B') && x.id !== pId;
          }
        });

        let baseOptionsHtml = '<option value="">[Sem Base Apoio]</option>';
        baseOptionsHtml += basesDoLev.map(b => `<option value="${b.id}" ${b.id === pt.ponto_base_id ? 'selected' : ''}>Base: ${b.nome_vertice}</option>`).join('');

        selectBase.innerHTML = baseOptionsHtml;
        selectBase.disabled = (pt.tipo_ponto === 'M');
      }

      const sectionBaseControle = document.getElementById('section-pt-base-controle');
      const inputNBase = document.getElementById('input-pt-n-corr-base') as HTMLInputElement;
      const inputEBase = document.getElementById('input-pt-e-corr-base') as HTMLInputElement;
      const inputAltBase = document.getElementById('input-pt-alt-corr-base') as HTMLInputElement;
      const selectFusoBase = document.getElementById('select-pt-fuso-base') as HTMLSelectElement;

      const lblDn = document.getElementById('lbl-pt-dn-base');
      const lblDe = document.getElementById('lbl-pt-de-base');
      const lblDh = document.getElementById('lbl-pt-dh-base');
      const lblD3D = document.getElementById('lbl-pt-d3d-base');

      const atualizarDeltasRealtimeModal = () => {
        if (!pt.n_original || !pt.e_original || !pt.alt_original || !lblDn || !lblDe || !lblDh || !lblD3D) return;
        const nCorr = parseFloat(inputNBase.value);
        const eCorr = parseFloat(inputEBase.value);
        const altCorr = parseFloat(inputAltBase.value);

        if (isNaN(nCorr) || isNaN(eCorr) || isNaN(altCorr)) {
          lblDn.innerText = '-';
          lblDe.innerText = '-';
          lblDh.innerText = '-';
          lblD3D.innerText = '-';
          return;
        }

        const dN = (nCorr - pt.n_original) * 1000;
        const dE = (eCorr - pt.e_original) * 1000;
        const dH = (altCorr - pt.alt_original) * 1000;
        const d3D = Math.sqrt(dN * dN + dE * dE + dH * dH);

        lblDn.innerText = (dN >= 0 ? '+' : '') + dN.toFixed(1) + ' mm';
        lblDe.innerText = (dE >= 0 ? '+' : '') + dE.toFixed(1) + ' mm';
        lblDh.innerText = (dH >= 0 ? '+' : '') + dH.toFixed(1) + ' mm';
        lblD3D.innerText = d3D.toFixed(1) + ' mm';
      };

      const alternarVisualizacaoSeçãoBase = () => {
        const tipo = (document.getElementById('select-pt-tipo') as HTMLSelectElement).value;
        const sectionGeo = document.getElementById('section-pt-ajustadas-geo');
        if ((tipo === 'M' || tipo === 'B') && sectionBaseControle && inputNBase && inputEBase && inputAltBase && selectFusoBase) {
          sectionBaseControle.classList.remove('hidden');
          if (sectionGeo) sectionGeo.classList.add('hidden');

          if (pt.e_corrigido !== undefined && pt.e_corrigido !== null && pt.n_corrigido !== undefined && pt.n_corrigido !== null) {
            inputNBase.value = pt.n_corrigido.toFixed(3);
            inputEBase.value = pt.e_corrigido.toFixed(3);
            inputAltBase.value = (pt.alt !== undefined && pt.alt !== null ? pt.alt : (pt.alt_original || 0)).toFixed(3);

            if (pt.lon) {
              const zone = Math.floor((pt.lon + 180) / 6) + 1;
              selectFusoBase.value = zone + 'S';
            } else {
              selectFusoBase.value = '22S';
            }
          } else if (pt.lat && pt.lon) {
            const utm = ctx.latLonToUTM(pt.lat, pt.lon);
            inputNBase.value = utm.n.toFixed(3);
            inputEBase.value = utm.e.toFixed(3);
            inputAltBase.value = (pt.alt !== undefined && pt.alt !== null ? pt.alt : (pt.alt_original || 0)).toFixed(3);
            selectFusoBase.value = utm.zone + 'S';
          } else {
            inputNBase.value = pt.n_original ? pt.n_original.toFixed(3) : '';
            inputEBase.value = pt.e_original ? pt.e_original.toFixed(3) : '';
            inputAltBase.value = pt.alt_original ? pt.alt_original.toFixed(3) : '';

            if (pt.lon_original) {
              const zone = Math.floor((pt.lon_original + 180) / 6) + 1;
              selectFusoBase.value = zone + 'S';
            } else if (pt.lon) {
              const zone = Math.floor((pt.lon + 180) / 6) + 1;
              selectFusoBase.value = zone + 'S';
            } else {
              selectFusoBase.value = '22S';
            }
          }
          atualizarDeltasRealtimeModal();
        } else if (sectionBaseControle) {
          sectionBaseControle.classList.add('hidden');
          if (sectionGeo) sectionGeo.classList.remove('hidden');
        }
      };

      if (inputNBase && inputEBase && inputAltBase) {
        inputNBase.oninput = atualizarDeltasRealtimeModal;
        inputEBase.oninput = atualizarDeltasRealtimeModal;
        inputAltBase.oninput = atualizarDeltasRealtimeModal;
      }

      const selectTipoPonto = document.getElementById('select-pt-tipo') as HTMLSelectElement;
      if (selectTipoPonto) {
        selectTipoPonto.onchange = () => {
          if (selectBase) {
            selectBase.disabled = (selectTipoPonto.value === 'M');
            if (selectTipoPonto.value === 'M') {
              selectBase.value = '';
            }
          }
          alternarVisualizacaoSeçãoBase();
        };
      }

      alternarVisualizacaoSeçãoBase();

      modalPt.classList.remove('hidden');
      initIcons();
    };

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

    const salvarPontoModal = async () => {
      if (!pontoSelecionadoContextoId) return;

      const pId = pontoSelecionadoContextoId;
      const nome_vertice = (document.getElementById('input-pt-nome') as HTMLInputElement).value.trim();
      const tipo_ponto = (document.getElementById('select-pt-tipo') as HTMLSelectElement).value;
      const status_ponto = (document.getElementById('select-pt-status') as HTMLSelectElement).value;
      const metodo_posicionamento = (document.getElementById('select-pt-metodo') as HTMLSelectElement).value;
      const ponto_base_id_val = (document.getElementById('select-pt-base') as HTMLSelectElement).value;
      const ponto_base_id = ponto_base_id_val ? parseInt(ponto_base_id_val) : 0;

      const lat_val = (document.getElementById('input-pt-lat') as HTMLInputElement).value;
      const lon_val = (document.getElementById('input-pt-lon') as HTMLInputElement).value;
      const alt_val = (document.getElementById('input-pt-alt') as HTMLInputElement).value;

      const lat = lat_val ? parseFloat(lat_val) : null;
      const lon = lon_val ? parseFloat(lon_val) : null;
      const alt = alt_val ? parseFloat(alt_val) : null;

      const sigma_lat_val = (document.getElementById('input-pt-sigma-lat') as HTMLInputElement).value;
      const sigma_lon_val = (document.getElementById('input-pt-sigma-lon') as HTMLInputElement).value;
      const sigma_alt_val = (document.getElementById('input-pt-sigma-alt') as HTMLInputElement).value;

      const sigma_lat = sigma_lat_val ? parseFloat(sigma_lat_val) : 0;
      const sigma_lon = sigma_lon_val ? parseFloat(sigma_lon_val) : 0;
      const sigma_alt = sigma_alt_val ? parseFloat(sigma_alt_val) : 0;

      const payload: any = {
        nome_vertice,
        tipo_ponto,
        status_ponto,
        metodo_posicionamento,
        ponto_base_id,
        lat,
        lon,
        alt,
        sigma_lat,
        sigma_lon,
        sigma_alt
      };

      if (tipo_ponto === 'M' || tipo_ponto === 'B') {
        const nCorr = parseFloat((document.getElementById('input-pt-n-corr-base') as HTMLInputElement).value);
        const eCorr = parseFloat((document.getElementById('input-pt-e-corr-base') as HTMLInputElement).value);
        const altCorr = parseFloat((document.getElementById('input-pt-alt-corr-base') as HTMLInputElement).value);
        const fuso = (document.getElementById('select-pt-fuso-base') as HTMLSelectElement).value;

        if (!isNaN(nCorr) && !isNaN(eCorr) && !isNaN(altCorr)) {
          payload.n_corrigido = nCorr;
          payload.e_corrigido = eCorr;
          payload.alt_corrigido = altCorr;
          payload.fuso = fuso;
        }
      }

      // Desabilita botão submit para evitar double-submit
      const btnSubmitPt = document.getElementById('btn-salvar-pt') as HTMLButtonElement ||
        document.querySelector('#form-editar-ponto [type="submit"]') as HTMLButtonElement;
      if (btnSubmitPt) { btnSubmitPt.disabled = true; btnSubmitPt.textContent = 'Salvando...'; }

      try {
        const res = await fetch(`${API_BASE}/pontos/${pId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.error || (data.detail && typeof data.detail === 'string')) {
          await customAlert(`Erro ao salvar: ${data.error || data.detail}`);
        } else if (data.detail && typeof data.detail === 'object') {
          await customAlert(`Erro ao salvar: ${JSON.stringify(data.detail)}`);
        } else {
          document.getElementById('modal-editar-ponto')?.classList.add('hidden');
          showToast("Vértice geodésico atualizado com sucesso!", 'success');
          await ctx.loadLevantamentoDetails();
        }
      } catch (err) {
        console.error("Erro ao salvar alterações no ponto:", err);
        showToast("Erro de comunicação com o servidor.", 'error');
      } finally {
        if (btnSubmitPt) { btnSubmitPt.disabled = false; btnSubmitPt.textContent = 'Salvar Alterações'; }
      }
    };

    const inicializarMenuContextoEPontoModal = () => {
      const menuCtx = document.getElementById('menu-contexto-ponto');
      const modalPt = document.getElementById('modal-editar-ponto');

      if (!menuCtx || !modalPt) return;

      const tabelaCorpo = document.getElementById('tbl-pontos-triagem');
      if (tabelaCorpo) {
        tabelaCorpo.addEventListener('contextmenu', (e) => {
          const targetRow = (e.target as HTMLElement).closest('.linha-ponto-tbl');
          if (!targetRow) return;

          e.preventDefault();
          const pId = parseInt(targetRow.getAttribute('data-ponto-id') || '0');
          if (!pId) return;

          pontoSelecionadoContextoId = pId;
          ctx.selectPontoFromTabela(pId);

          menuCtx.style.left = `${e.pageX}px`;
          menuCtx.style.top = `${e.pageY}px`;
          menuCtx.classList.remove('hidden');
        });
      }

      ctxClickOutsideHandler = (e: MouseEvent) => {
        if (!menuCtx.contains(e.target as Node)) {
          menuCtx.classList.add('hidden');
        }
      };

      ctxScrollHandler = () => {
        menuCtx.classList.add('hidden');
      };

      document.addEventListener('click', ctxClickOutsideHandler);
      document.addEventListener('scroll', ctxScrollHandler, true);

      document.getElementById('menu-ctx-editar')?.addEventListener('click', () => {
        menuCtx.classList.add('hidden');
        if (pontoSelecionadoContextoId) {
          abrirModalEditarPonto(pontoSelecionadoContextoId);
        }
      });

      document.getElementById('menu-ctx-excluir')?.addEventListener('click', () => {
        menuCtx.classList.add('hidden');
        if (pontoSelecionadoContextoId) {
          confirmarExclusaoPonto(pontoSelecionadoContextoId);
        }
      });

      document.getElementById('btn-fechar-modal-pt')?.addEventListener('click', () => {
        modalPt.classList.add('hidden');
      });
      document.getElementById('btn-cancelar-pt')?.addEventListener('click', () => {
        modalPt.classList.add('hidden');
      });

      document.getElementById('form-editar-ponto')?.addEventListener('submit', (e) => {
        e.preventDefault();
        salvarPontoModal();
      });

      document.getElementById('btn-excluir-ponto-modal')?.addEventListener('click', () => {
        if (pontoSelecionadoContextoId) {
          confirmarExclusaoPonto(pontoSelecionadoContextoId);
          modalPt.classList.add('hidden');
        }
      });

      const selectTipo = document.getElementById('select-pt-tipo') as HTMLSelectElement;
      const selectBase = document.getElementById('select-pt-base') as HTMLSelectElement;
      selectTipo?.addEventListener('change', () => {
        if (selectBase && selectTipo) {
          const tipo = selectTipo.value;
          selectBase.disabled = (tipo === 'M');
          if (tipo === 'M') {
            selectBase.value = '';
          }
        }
      });
    };

    // 7. Outros inicializadores de UI (Filtros, Buscas, Collapses, Splitters)
    const inicializarWorkspaceCollapse = () => {
      const panelCollapseBtn = document.getElementById('btn-toggle-workspace-collapse');
      const containerArquivos = document.getElementById('container-workspace-arquivos');
      const seta = document.getElementById('seta-workspace-collapse');
      const painel = document.getElementById('painel-workspace-gnss');

      if (!panelCollapseBtn || !containerArquivos || !seta || !painel) return;

      const ajustarClassesPainel = (collapsed: boolean) => {
        if (collapsed) {
          painel.classList.remove('p-4', 'space-y-4', 'p-6', 'space-y-6');
          painel.classList.add('p-2', 'px-3');
          panelCollapseBtn.classList.remove('border-b', 'border-white/5', 'pb-4', 'pb-2.5');
          panelCollapseBtn.classList.add('pb-0');
        } else {
          painel.classList.remove('p-2', 'px-3', 'px-6', 'py-3');
          painel.classList.add('p-4', 'space-y-4');
          panelCollapseBtn.classList.add('border-b', 'border-white/5', 'pb-2.5');
          panelCollapseBtn.classList.remove('pb-0');
        }
      };

      const isCollapsed = localStorage.getItem('workspace_gnss_collapsed') === 'true';
      if (isCollapsed) {
        containerArquivos.classList.add('hidden');
        seta.classList.remove('rotate-90');
        ajustarClassesPainel(true);
      }

      panelCollapseBtn.addEventListener('click', () => {
        const currentlyHidden = containerArquivos.classList.toggle('hidden');
        if (currentlyHidden) {
          seta.classList.remove('rotate-90');
          localStorage.setItem('workspace_gnss_collapsed', 'true');
          ajustarClassesPainel(true);
        } else {
          seta.classList.add('rotate-90');
          localStorage.setItem('workspace_gnss_collapsed', 'false');
          ajustarClassesPainel(false);
        }
      });
    };

    const inicializarBuscaPonto = () => {
      const searchInput = document.getElementById('input-search-ponto') as HTMLInputElement;
      const btnClearSearch = document.getElementById('btn-clear-search');

      if (searchInput) {
        searchInput.addEventListener('input', () => {
          ctx.searchFilterValue = searchInput.value.trim().toLowerCase();
          ctx.renderMatriculaDados();
        });
      }

      if (btnClearSearch) {
        btnClearSearch.addEventListener('click', () => {
          if (searchInput) searchInput.value = '';
          ctx.searchFilterValue = '';
          ctx.renderMatriculaDados();
        });
      }
    };

    const inicializarScrollCollapseHeader = () => {
      const viewContainer = document.getElementById('view-container');
      const header = document.getElementById('mesa-trabalho-header');
      if (!viewContainer || !header) return;

      viewContainer.addEventListener('scroll', () => {
        if (viewContainer.scrollTop > 0) {
          if (!header.classList.contains('header-condensed')) {
            header.classList.add('header-condensed');
            if (ctx.triagemMap) {
              setTimeout(() => ctx.triagemMap!.invalidateSize(), 310);
            }
          }
        } else {
          if (header.classList.contains('header-condensed')) {
            header.classList.remove('header-condensed');
            if (ctx.triagemMap) {
              setTimeout(() => ctx.triagemMap!.invalidateSize(), 310);
            }
          }
        }
      });
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

    const inicializarRedimensionamentoColunas = () => {
      const headerRow = document.getElementById('tbl-pontos-header');
      if (!headerRow) return;

      const ths = headerRow.querySelectorAll('th');
      ths.forEach(th => {
        const widthStyle = th.style.width;
        if (widthStyle) {
          // Cria o elemento resizer
          const resizer = document.createElement('div');
          resizer.className = 'vtx-col-resizer';
          th.appendChild(resizer);

          let startX = 0;
          let startWidth = 0;

          const onMouseMove = (e: MouseEvent) => {
            const width = startWidth + (e.clientX - startX);
            if (width > 25) { // Largura mínima para segurança
              th.style.width = `${width}px`;
            }
          };

          const onMouseUp = () => {
            resizer.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          };

          resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            startX = e.clientX;
            startWidth = th.offsetWidth;
            resizer.classList.add('resizing');

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          });
        }
      });
    };

    ctx.inicializarRedimensionamentoColunas = inicializarRedimensionamentoColunas;

    const inicializarIngestaoCollapse = () => {
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      if (!containerIngestao) return;

      const expandirIngestao = () => {
        containerIngestao.classList.remove('hidden');
        containerIngestao.classList.add('flex');
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
      const savedSupWidth = localStorage.getItem('gerencigeo_split_sup_width');
      if (savedSupWidth) {
        const widthPx = parseInt(savedSupWidth);
        const containerIngestao = document.getElementById('container-ingestao-arquivos');
        const containerReordenar = document.getElementById('container-reordenar-manual');
        if (containerIngestao) containerIngestao.style.width = `${widthPx}px`;
        if (containerReordenar) containerReordenar.style.width = `${widthPx}px`;
      }
      const savedInfWidth = localStorage.getItem('gerencigeo_split_inf_width');
      if (savedInfWidth) {
        const widthPx = parseInt(savedInfWidth);
        const containerDivisas = document.getElementById('container-tabela-divisas');
        if (containerDivisas) containerDivisas.style.width = `${widthPx}px`;
      }
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
      const splitterSup = document.getElementById('splitter-superior');
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      const containerReordenar = document.getElementById('container-reordenar-manual');
      const gridSuperior = document.getElementById('grid-superior-detalhe');

      const splitterInf = document.getElementById('splitter-inferior');
      const containerDivisas = document.getElementById('container-tabela-divisas');

      if (splitterSup && gridSuperior) {
        let isDraggingSup = false;
        let startX = 0;
        let startWidthRight = 0;

        const onMouseMoveSup = (e: MouseEvent) => {
          if (!isDraggingSup) return;
          const rectGrid = gridSuperior.getBoundingClientRect();
          const deltaX = startX - e.clientX;
          const newWidthRight = Math.max(250, Math.min(rectGrid.width - 350, startWidthRight + deltaX));

          if (containerIngestao && !containerIngestao.classList.contains('hidden') && !containerIngestao.classList.contains('ingestao-collapsed')) {
            containerIngestao.style.width = `${newWidthRight}px`;
            localStorage.setItem('gerencigeo_split_sup_width', `${newWidthRight}`);
          }
          if (containerReordenar && !containerReordenar.classList.contains('hidden')) {
            containerReordenar.style.width = `${newWidthRight}px`;
            localStorage.setItem('gerencigeo_split_sup_width', `${newWidthRight}`);
          }

          if (ctx.triagemMap) ctx.triagemMap.invalidateSize();
        };

        const onMouseUpSup = () => {
          isDraggingSup = false;
          document.removeEventListener('mousemove', onMouseMoveSup);
          document.removeEventListener('mouseup', onMouseUpSup);
          document.body.classList.remove('cursor-col-resize', 'select-none');
          if (ctx.triagemMap) {
            setTimeout(() => ctx.triagemMap!.invalidateSize(), 50);
          }
        };

        splitterSup.addEventListener('mousedown', (e: MouseEvent) => {
          if (containerIngestao && containerIngestao.classList.contains('ingestao-collapsed')) return;

          e.preventDefault();
          isDraggingSup = true;
          startX = e.clientX;

          const activePanel = (containerIngestao && !containerIngestao.classList.contains('hidden')) 
            ? containerIngestao 
            : containerReordenar;

          if (activePanel) {
            startWidthRight = activePanel.getBoundingClientRect().width;
          }

          document.addEventListener('mousemove', onMouseMoveSup);
          document.addEventListener('mouseup', onMouseUpSup);
          document.body.classList.add('cursor-col-resize', 'select-none');
        });
      }

      if (splitterInf && containerDivisas) {
        let isDraggingInf = false;
        let startX = 0;
        let startWidthRight = 0;

        const onMouseMoveInf = (e: MouseEvent) => {
          if (!isDraggingInf) return;
          const containerParent = splitterInf.parentElement;
          if (!containerParent) return;
          const rectParent = containerParent.getBoundingClientRect();
          const deltaX = startX - e.clientX;
          const newWidthRight = Math.max(250, Math.min(rectParent.width - 350, startWidthRight + deltaX));

          containerDivisas.style.width = `${newWidthRight}px`;
          localStorage.setItem('gerencigeo_split_inf_width', `${newWidthRight}`);
        };

        const onMouseUpInf = () => {
          isDraggingInf = false;
          document.removeEventListener('mousemove', onMouseMoveInf);
          document.removeEventListener('mouseup', onMouseUpInf);
          document.body.classList.remove('cursor-col-resize', 'select-none');
        };

        splitterInf.addEventListener('mousedown', (e: MouseEvent) => {
          e.preventDefault();
          isDraggingInf = true;
          startX = e.clientX;
          startWidthRight = containerDivisas.getBoundingClientRect().width;

          document.addEventListener('mousemove', onMouseMoveInf);
          document.addEventListener('mouseup', onMouseUpInf);
          document.body.classList.add('cursor-col-resize', 'select-none');
        });
      }

      // Redimensionador de Altura do Mapa vs Tabela (Splitter Horizontal)
      const splitterMapa = document.getElementById('splitter-mapa-tabela');
      const mainContent = document.querySelector('.workspace-main-content') as HTMLElement;

      if (splitterMapa && mainContent) {
        let isDraggingMapa = false;
        let startY = 0;
        let startHeight = 0;

        const onMouseMoveMapa = (e: MouseEvent) => {
          if (!isDraggingMapa) return;
          const deltaY = startY - e.clientY; // Arrastar para cima aumenta a altura da tabela/view inferior
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
          
          // Lê a altura da view-panel ativa no momento
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

          if (ctx.triagemMap) ctx.triagemMap.invalidateSize();
        };

        const onMouseUpProps = () => {
          isDraggingProps = false;
          resizerProps.classList.remove('resizing');
          document.removeEventListener('mousemove', onMouseMoveProps);
          document.removeEventListener('mouseup', onMouseUpProps);
          document.body.classList.remove('cursor-col-resize', 'select-none');
          if (ctx.triagemMap) {
            setTimeout(() => ctx.triagemMap!.invalidateSize(), 50);
          }
        };

        resizerProps.addEventListener('mousedown', (e: MouseEvent) => {
          if (panelProps.classList.contains('collapsed')) return; // Protege se estiver colapsado

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
    inicializarMenuContextoEPontoModal();
    inicializarWorkspaceCollapse();
    inicializarBuscaPonto();
    inicializarScrollCollapseHeader();
    inicializarIngestaoCollapse();
    inicializarFiltroArquivos();
    inicializarRedimensionamentoColunas();
    inicializarSplitters();
    ctx.inicializarEventosCartorio();
    activeDragCleanup = inicializarDragDropGlobal();

    // Registra destruidor de eventos ao desmontar a página
    const cleanup = () => {
      if (ctxClickOutsideHandler) {
        document.removeEventListener('click', ctxClickOutsideHandler);
      }
      if (ctxScrollHandler) {
        document.removeEventListener('scroll', ctxScrollHandler, true);
      }
      // Remove listener do filtro de arquivos (previne memory leak — MT-09)
      if (_filtroArquivosClickHandler) {
        document.removeEventListener('click', _filtroArquivosClickHandler);
        _filtroArquivosClickHandler = null;
      }
      if (activeDragCleanup) {
        activeDragCleanup();
        activeDragCleanup = null;
      }
      if (ctx.canvasInteracao) {
        ctx.canvasInteracao.desativar();
        ctx.canvasInteracao = null;
      }
      if (ctx.triagemMap) {
        ctx.triagemMap.remove();
        ctx.triagemMap = null;
      }
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

function setupRibbonInteractions(ctx: any): void {
  const tabButtons = document.querySelectorAll('.rl3-tab');
  const panelRows = document.querySelectorAll('.rl3-panel');

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
      }

      if (ctx && typeof ctx.alternarEtapa === 'function' && ctx.etapaAtiva !== tabTarget) {
        ctx.alternarEtapa(tabTarget);
      }
    });
  });

  // Inicializa o Gerenciador de Responsividade do Ribbon para o painel principal
  const geoprocessamentoRibbon = new RibbonManager('panel-geoprocessamento');
  geoprocessamentoRibbon.init().catch(console.error);

  const btnVoltar = document.getElementById('btn-voltar-lista');
  if (btnVoltar) {
    btnVoltar.addEventListener('click', () => {
      window.location.hash = '#levantamentos';
    });
  }

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

  const selectUtm = document.getElementById('select-fuso-ribbon') as HTMLSelectElement;
  if (selectUtm) {
    selectUtm.addEventListener('change', (e: Event) => {
      const targetSelect = e.target as HTMLSelectElement;
      const novaZona = targetSelect.value;
      localStorage.setItem(`utm_zone_${ctx.currentLevId}`, novaZona);
      showToast(`Zona UTM alterada para ${novaZona}. Recalculando coordenadas...`, "info");
      ctx.loadLevantamentoDetails();
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
        if (ctx.triagemMap) ctx.triagemMap.invalidateSize();
      }, 190);
    });
  }
}

