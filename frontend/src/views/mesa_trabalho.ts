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
import { setupMesaTrabalhoHistorico } from './mesa_trabalho/mesa_trabalho_historico';
import { abrirModalUnificacaoSobrepostos } from './mesa_trabalho/unificador_sobrepostos';
import { CanvasInteracao } from './mesa_trabalho/canvas_interacao';
import { FluentRibbonManager as RibbonManager } from '../ui/fluent_ribbon_manager';
import { registerFluentComponents } from '../ui/fluent_setup';

// Interceptadores globais de erros para depuração do pywebview
window.addEventListener('error', (event) => {
  console.error("Exceção global capturada:", event.error);
  alert(`[Erro de Script]: ${event.message}\nArquivo: ${event.filename}\nLinha: ${event.lineno}:${event.colno}\nStack: ${event.error?.stack}`);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error("Promessa não tratada capturada:", event.reason);
  alert(`[Erro de Promessa]: ${event.reason?.message || event.reason}\nStack: ${event.reason?.stack}`);
});

import { setupRibbonInteractions } from './mesa_trabalho_ribbon';
import { setupModalPonto, abrirModalEditarPonto, confirmarExclusaoPonto, inicializarMenuContextoEPontoModal } from './mesa_trabalho_modal_ponto';
import { setupDragDropGlobal } from './mesa_trabalho_drag_drop';

import { setupMesaSplitters } from './mesa_trabalho_splitters';
import { setupMesaRender } from './mesa_trabalho_render';
import { setupMesaController } from './mesa_trabalho_controller';
import { setupMesaUiInit, _filtroArquivosClickHandler, setFiltroArquivosClickHandler } from './mesa_trabalho_ui_init';
export let activeMapaController: MesaTrabalhoMapa | null = null;
export let ctxClickOutsideHandler: ((e: MouseEvent) => void) | null = null;
export const setCtxClickOutsideHandler = (fn: any) => ctxClickOutsideHandler = fn;
export let ctxScrollHandler: (() => void) | null = null;
export const setCtxScrollHandler = (fn: any) => ctxScrollHandler = fn;
export let activeDragCleanup: (() => void) | null = null;
export const setActiveDragCleanup = (fn: any) => activeDragCleanup = fn;
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
      definirInicioMaisAoNorte: () => {},
      lidarCliqueMarcadorSequencial: () => {},
      obterPontosParaOrdenacao: () => [],
      alternarModoReordenarManual: () => {}
    };

    ctx.atualizarPainelPropriedades = () => atualizarPainelPropriedades(ctx);

    // 2. Registra os submódulos no contexto comum
    setupMesaTrabalhoHistorico(ctx);
    ctx.abrirModalUnificacaoSobrepostos = () => abrirModalUnificacaoSobrepostos(ctx);
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
    setupMesaController(ctx, mapaController);
    setupModalPonto(ctx);
    setupMesaUiInit(ctx);
    setActiveDragCleanup(setupDragDropGlobal(ctx));
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
        setFiltroArquivosClickHandler(null);
      }
      // Limpa todas as instâncias ativas do RibbonManager para evitar vazamento de memória e listeners duplicados
      Object.values(activeRibbonManagers).forEach(rm => rm.destroy());
      activeRibbonManagers = {};

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

export const resetActiveRibbonManagers = () => activeRibbonManagers = {};
export const setActiveRibbonManager = (id: string, rm: any) => activeRibbonManagers[id] = rm;
export let activeRibbonManagers: Record<string, RibbonManager> = {};
    setupMesaRender(ctx);

