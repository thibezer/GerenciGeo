import L from 'leaflet';
import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, customAlert, customConfirm, showToast } from '../utils';
import { renderMesaTrabalho } from './mesa_trabalho_template';
import { MesaTrabalhoMapa } from './mesa_trabalho_mapa';
import type { MesaTrabalhoContext } from './mesa_trabalho/mesa_trabalho_context';
import { setupMesaGeodesica, renderTabelaMesaGeodesica } from './mesa_trabalho/mesa_geodesica';
import { setupOrganizadorPerimetro, renderTabelaOrganizadorPerimetro } from './mesa_trabalho/organizador_perimetro';
import { setupGeradorDocumentos } from './mesa_trabalho/gerador_documentos';
import { setupAuditoriaHistorico, renderHistoricoCampo } from './mesa_trabalho/auditoria_historico';

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
      alternarModoReordenarManual: () => {}
    };

    // 2. Registra os submódulos no contexto comum
    setupMesaGeodesica(ctx);
    setupOrganizadorPerimetro(ctx);
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

        ctx.matriculasList = await resMat.json();
        ctx.pontosList = await resPt.json();
        ctx.segmentosList = await resSeg.json();
        ctx.confrontantesList = await resConf.json();
        ctx.pontosVizinhosList = await resViz.json();

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
        
        ctx.carregarSugestoesNumeracao();
        if (levObj && levObj.profissional_id) {
          ctx.currentProfissionalId = levObj.profissional_id;
          ctx.carregarHomologacaoDados(levObj.profissional_id);
        }

      } catch (e) {
        console.error("Erro ao carregar detalhes do levantamento:", e);
      }
    };

    const inicializarMapOnce = () => {
      if (!ctx.triagemMap) {
        ctx.triagemMap = ctx.mapaController.init('mapa-triagem');
        
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

        if (containerIngestao) containerIngestao.classList.remove('hidden');
        if (gridSuperior) gridSuperior.classList.remove('hidden');
        const splitterSup = document.getElementById('splitter-superior');
        if (splitterSup) {
          if (containerIngestao && !containerIngestao.classList.contains('ingestao-collapsed')) {
            splitterSup.classList.remove('hidden');
          } else {
            splitterSup.classList.add('hidden');
          }
        }
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
        const splitterSup = document.getElementById('splitter-superior');
        if (splitterSup) splitterSup.classList.add('hidden');
        
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
      } else if (etapa === 'documentos') {
        if (btnGeo) btnGeo.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnCart) btnCart.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnDoc) btnDoc.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnAud) btnAud.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';

        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (gridSuperior) gridSuperior.classList.remove('hidden');
        const containerReordenar = document.getElementById('container-reordenar-manual');
        if (containerReordenar) containerReordenar.classList.add('hidden');
        const splitterSup = document.getElementById('splitter-superior');
        if (splitterSup) splitterSup.classList.add('hidden');
        
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
        const splitterSup = document.getElementById('splitter-superior');
        if (splitterSup) splitterSup.classList.add('hidden');
        
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
        ? ctx.pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B')
        : ctx.pontosList.filter(p => p.matricula_id === ctx.currentMatriculaId);

      ctx.mapaController.clearOverlays();
      ctx.mapaController.plotPontos(pontosMat, (pId: number) => {
        ctx.selectPontoFromTabela(pId);
      });
      ctx.mapaController.plotPolilinhaTemporaria(pontosMat);
      if (ctx.pontosVizinhosList && ctx.pontosVizinhosList.length > 0) {
        ctx.mapaController.plotPontosVizinhos(ctx.pontosVizinhosList);
      }
    };

    ctx.atualizarDestaqueLinhasTabela = () => {
      document.querySelectorAll('.linha-ponto-tbl').forEach(tr => {
        const pId = parseInt(tr.getAttribute('data-ponto-id') || '0');
        const isSelected = ctx.selectedPontoIds.includes(pId);

        if (isSelected) {
          tr.classList.add('bg-mint-vibrant/10', 'text-mint-vibrant', 'border-mint-vibrant/30');
          tr.classList.remove('hover:bg-white/[0.02]', 'border-white/5');
        } else {
          tr.classList.remove('bg-mint-vibrant/10', 'text-mint-vibrant', 'border-mint-vibrant/30');
          tr.classList.add('hover:bg-white/[0.02]', 'border-white/5');
        }
      });
      
      const bar = document.getElementById('batch-action-bar-mesa');
      const countEl = document.getElementById('batch-selection-count-mesa');
      if (bar && countEl) {
        const count = ctx.selectedPontoIds.length;
        if (count > 0) {
          countEl.innerText = count.toString();
          bar.classList.remove('hidden');
        } else {
          bar.classList.add('hidden');
        }
      }
    };

    ctx.selectPontoFromTabela = (pontoId: number) => {
      document.querySelectorAll('.linha-ponto-tbl').forEach(tr => {
        const pId = parseInt(tr.getAttribute('data-ponto-id') || '0');
        if (pId === pontoId) {
          tr.classList.add('bg-white/10', 'border-white/20');
          tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          tr.classList.remove('bg-white/10', 'border-white/20');
        }
      });
    };

    // 5. Configuração de Event Delegation (Tabelas de Campo/Matrícula)
    const setupEventDelegation = () => {
      const tblTriagem = document.getElementById('tbl-pontos-triagem');
      const containerReordenar = document.getElementById('lista-reordenar-simplificada');
      const containerWorkspace = document.getElementById('container-workspace-arquivos');
      const painelInferior = document.getElementById('container-tabelas-inferiores');

      const containerTabela = painelInferior || tblTriagem;

      if (containerTabela) {
        containerTabela.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          const linha = target.closest('.linha-ponto-tbl');
          const btnSubir = target.closest('.btn-subir-ponto');
          const btnDescer = target.closest('.btn-descer-ponto');

          if (btnSubir) {
            e.stopPropagation();
            const pId = parseInt(btnSubir.getAttribute('data-ponto-id') || '0');
            if (pId) ctx.subirPonto(pId);
            return;
          }
          if (btnDescer) {
            e.stopPropagation();
            const pId = parseInt(btnDescer.getAttribute('data-ponto-id') || '0');
            if (pId) ctx.descerPonto(pId);
            return;
          }
          const btnFocar = target.closest('.btn-focar-ponto-mapa');
          if (btnFocar) {
            e.stopPropagation();
            const pId = parseInt(btnFocar.getAttribute('data-ponto-id') || '0');
            if (pId) {
              ctx.selectPontoFromTabela(pId);
              ctx.mapaController.selectPonto(pId, 21);
            }
            return;
          }
          if (linha && !target.closest('.chk-ignorar-poligono')) {
            const pId = parseInt(linha.getAttribute('data-ponto-id') || '0');
            if (!pId) return;

            const mouseEvent = e as MouseEvent;
            if (mouseEvent.ctrlKey || mouseEvent.metaKey) {
              if (ctx.selectedPontoIds.includes(pId)) {
                ctx.selectedPontoIds = ctx.selectedPontoIds.filter(id => id !== pId);
              } else {
                ctx.selectedPontoIds.push(pId);
                ctx.lastSelectedPontoId = pId;
              }
            } else if (mouseEvent.shiftKey && ctx.lastSelectedPontoId !== null) {
              const pontosMat = ctx.etapaAtiva === 'geoprocessamento'
                ? [...ctx.pontosList]
                : ctx.pontosList.filter(p => p.matricula_id === ctx.currentMatriculaId && p.tipo_ponto !== 'B' && p.tipo !== 'B');
              const index1 = pontosMat.findIndex(pt => pt.id === ctx.lastSelectedPontoId);
              const index2 = pontosMat.findIndex(pt => pt.id === pId);

              if (index1 !== -1 && index2 !== -1) {
                const start = Math.min(index1, index2);
                const end = Math.max(index1, index2);
                const idsInRange = pontosMat.slice(start, end + 1).map(pt => pt.id);
                idsInRange.forEach(id => {
                  if (!ctx.selectedPontoIds.includes(id)) {
                    ctx.selectedPontoIds.push(id);
                  }
                });
              }
            } else {
              ctx.selectedPontoIds = [pId];
              ctx.lastSelectedPontoId = pId;
            }

            ctx.atualizarDestaqueLinhasTabela();
            ctx.selectPontoFromTabela(pId);
          }
        });

        containerTabela.addEventListener('dblclick', (e) => {
          const target = e.target as HTMLElement;
          const linha = target.closest('.linha-ponto-tbl');
          if (linha && !target.closest('.chk-ignorar-poligono')) {
            const pId = parseInt(linha.getAttribute('data-ponto-id') || '0');
            if (pId) {
              e.stopPropagation();
              abrirModalEditarPonto(pId);
            }
          }
        });

        containerTabela.addEventListener('change', async (e) => {
          const target = e.target as HTMLElement;
          const chk = target.closest('.chk-ignorar-poligono') as HTMLInputElement;
          if (chk) {
            const pId = parseInt(chk.getAttribute('data-ponto-id') || '0');
            if (!pId) return;
            const ignorarVal = chk.checked ? 0 : 1;
            try {
              await fetch(`${API_BASE}/pontos/${pId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ignorar_poligono: ignorarVal })
              });
              ctx.loadLevantamentoDetails();
            } catch (err) {
              console.error("Erro ao alterar participação no polígono:", err);
              showToast("Erro ao alterar participação do ponto no polígono.", "error");
            }
          }
        });
      }

      if (containerReordenar) {
        containerReordenar.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;

          const btnTravar = target.closest('.btn-travar-ponto');
          const btnSubir = target.closest('.btn-subir-simplificado');
          const btnDescer = target.closest('.btn-descer-simplificado');

          if (btnTravar) {
            e.stopPropagation();
            const ordem = parseInt(btnTravar.getAttribute('data-ordem') || '0');
            const isTravado = ctx.travamentoInicio > 0 && ctx.travamentoFim >= ctx.travamentoInicio &&
              ordem >= ctx.travamentoInicio && ordem <= ctx.travamentoFim;

            if (isTravado) {
              ctx.travamentoInicio = 0;
              ctx.travamentoFim = 0;
              ctx.travamentoInicioPontoId = null;
              ctx.travamentoFimPontoId = null;
            } else {
              ctx.travamentoInicio = 1;
              ctx.travamentoFim = ordem;
              const pontosMatCompleto = ctx.pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
              pontosMatCompleto.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
              const pInicio = pontosMatCompleto[0];
              const pFim = pontosMatCompleto[ordem - 1];
              ctx.travamentoInicioPontoId = pInicio ? pInicio.id : null;
              ctx.travamentoFimPontoId = pFim ? pFim.id : null;
            }
            ctx.renderListaReordenarSimplificada();
            return;
          }

          if (btnSubir) {
            e.stopPropagation();
            const pId = parseInt(btnSubir.getAttribute('data-ponto-id') || '0');
            if (pId) ctx.subirPontoSimplificado(pId);
            return;
          }

          if (btnDescer) {
            e.stopPropagation();
            const pId = parseInt(btnDescer.getAttribute('data-ponto-id') || '0');
            if (pId) ctx.descerPontoSimplificado(pId);
            return;
          }
        });

        const aplicarMudancaOrdem = (inp: HTMLInputElement) => {
          const pId = parseInt(inp.getAttribute('data-ponto-id') || '0');
          const oldVal = parseInt(inp.getAttribute('data-old-ordem') || '1');
          const newVal = parseInt(inp.value || '0');
          const pontosMatCompleto = ctx.pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
          const totalPontos = pontosMatCompleto.length;

          if (isNaN(newVal) || newVal < 1 || newVal > totalPontos) {
            inp.value = oldVal.toString();
            return;
          }
          if (newVal !== oldVal) {
            ctx.moverPontoPosicao(pId, newVal);
          }
        };

        containerReordenar.addEventListener('change', (e) => {
          const target = e.target as HTMLElement;
          const inp = target.closest('.input-ordem-direta') as HTMLInputElement;
          if (inp) aplicarMudancaOrdem(inp);
        });

        containerReordenar.addEventListener('keydown', (e) => {
          const target = e.target as HTMLElement;
          const inp = target.closest('.input-ordem-direta') as HTMLInputElement;
          if (inp && e.key === 'Enter') {
            e.preventDefault();
            inp.blur();
          }
        });
      }

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
      const isLote = ctx.selectedPontoIds.length > 1 && ctx.selectedPontoIds.includes(pId);

      if (isLote) {
        if (!await customConfirm(`ATENÇÃO: Tem certeza absoluta que deseja excluir definitivamente os ${ctx.selectedPontoIds.length} vértices selecionados? Esta operação é irreversível e removerá todos de uma só vez.`)) return;

        try {
          const promessas = ctx.selectedPontoIds.map(id => fetch(`${API_BASE}/pontos/${id}`, { method: 'DELETE' }).then(r => r.json()));
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

    const inicializarIngestaoCollapse = () => {
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      const btnColapsar = document.getElementById('btn-colapsar-ingestao');
      const splitterSup = document.getElementById('splitter-superior');

      if (!containerIngestao) return;

      const expandirIngestao = () => {
        if (containerIngestao.classList.contains('ingestao-collapsed')) {
          containerIngestao.classList.remove('ingestao-collapsed');
          if (splitterSup) splitterSup.classList.remove('hidden');
          
          const savedSupWidth = localStorage.getItem('gerencigeo_split_sup_width');
          if (savedSupWidth) {
            containerIngestao.style.width = `${savedSupWidth}px`;
          } else {
            containerIngestao.style.width = '48%';
          }
          
          if (ctx.triagemMap) {
            setTimeout(() => ctx.triagemMap!.invalidateSize(), 310);
          }
        }
      };

      const colapsarIngestao = () => {
        if (!containerIngestao.classList.contains('ingestao-collapsed')) {
          containerIngestao.classList.add('ingestao-collapsed');
          if (splitterSup) splitterSup.classList.add('hidden');
          containerIngestao.style.width = '';
          if (ctx.triagemMap) {
            setTimeout(() => ctx.triagemMap!.invalidateSize(), 310);
          }
        }
      };

      ctx.expandirIngestao = expandirIngestao;
      ctx.colapsarIngestao = colapsarIngestao;

      containerIngestao.addEventListener('click', (e) => {
        if (containerIngestao.classList.contains('ingestao-collapsed')) {
          expandirIngestao();
          e.stopPropagation();
        }
      });

      if (btnColapsar) {
        btnColapsar.addEventListener('click', (e) => {
          colapsarIngestao();
          e.stopPropagation();
        });
      }

      containerIngestao.addEventListener('dragover', (e) => {
        e.preventDefault();
        expandirIngestao();
      });

      containerIngestao.addEventListener('dragenter', (e) => {
        e.preventDefault();
        expandirIngestao();
      });
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
    document.getElementById('btn-batch-clear-mesa')?.addEventListener('click', () => {
       ctx.selectedPontoIds = [];
       ctx.atualizarDestaqueLinhasTabela();
    });
    
    document.getElementById('btn-batch-delete-mesa')?.addEventListener('click', () => {
       if (ctx.selectedPontoIds.length > 0) {
          confirmarExclusaoPonto(ctx.selectedPontoIds[0]);
       }
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
      if (activeDragCleanup) {
        activeDragCleanup();
        activeDragCleanup = null;
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

  const btnVoltar = document.getElementById('btn-voltar-lista');
  if (btnVoltar) {
    btnVoltar.addEventListener('click', () => {
      window.location.hash = '#levantamentos';
    });
  }

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
}
