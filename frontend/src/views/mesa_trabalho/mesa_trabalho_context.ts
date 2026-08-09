import L from 'leaflet';

export interface MesaTrabalhoContext {
  currentLevId: number | null;
  currentMatriculaId: number | null;
  currentProfissionalId: number | null;
  currentLevantamento: any;

  matriculasList: any[];
  pontosList: any[];
  segmentosList: any[];
  confrontantesList: any[];
  triagemMap: L.Map | null;
  mapaController: any; // MesaTrabalhoMapa
  canvasInteracao?: any;
  filesQueue: { file: File; destination: string; matricula_id?: number | null; base_escolhida_id?: number | null }[];
  modoCoordenadas: string;
  etapaAtiva: string;
  modoReordenarAtivo: boolean;

  selectedPontoIds: number[];
  selectedVizinhoPontoIds: number[];
  lastSelectedPontoId: number | null;
  currentSortColumn: string;
  currentSortDirection: 'asc' | 'desc';
  searchFilterValue: string;
  searchFilterOrdenadorValue: string;
  filtroRapidoAtivo: string;
  ocultarForaPoligono: boolean;
  modoCliqueSequencialAtivo: boolean;
  bancoPontosExibido: boolean;
  bancoPontosList: any[];
  pontosVizinhosList: any[];
  travamentoInicio: number;
  travamentoFim: number;
  travamentoInicioPontoId: number | null;
  travamentoFimPontoId: number | null;
  sequenciaCliqueProximoIndice: number | null;
  arquivosDesativadosList?: string[];
  lastFittedLevId?: number | null;

  // Funções centrais e callbacks
  loadLevantamentoDetails: () => Promise<void>;
  loadWorkspaceArquivos: () => Promise<void>;
  carregarHomologacaoDados: (profissionalId: number) => Promise<void>;
  renderMatriculaDados: () => void;
  atualizarPolilinhaMapaTemp: () => void;
  atualizarDestaqueLinhasTabela: () => void;
  renderListaReordenarSimplificada: () => void;
  alternarEtapa: (etapa: string) => void;
  switchMatriculaTab: (matriculaId: number) => void;
  renderFilaArquivos: () => void;
  inicializarEventosCartorio: () => void;
  carregarSugestoesNumeracao: () => void;
  carregarConfrontantesAtivosSelect: () => Promise<void>;
  selectPontoFromTabela: (pontoId: number) => void;
  aplicarLargurasSplitters: () => void;

  // Funções utilitárias e de reordenação
  latLonToUTM: (lat: number, lon: number) => { e: number; n: number; zone: number };
  subirPonto: (pontoId: number) => void;
  descerPonto: (pontoId: number) => void;
  moverPontoPosicao: (pontoId: number, novaPosicao: number) => void;
  salvarRascunhoLocal: () => void;
  verificarRascunhoLocal: () => void;
  subirPontoSimplificado: (pontoId: number) => void;
  descerPontoSimplificado: (pontoId: number) => void;
  inverterOrdemPerimetral: () => void;
  definirInicioMaisAoNorte: () => void;
  lidarCliqueMarcadorSequencial: (pontoId: number) => void;
  obterPontosParaOrdenacao: () => any[];
  alternarModoReordenarManual: (ativo: boolean) => void;
  gerenciadorHistorico?: any;
  salvarEstadoHistorico?: (descricao: string) => void;
  desfazerHistorico?: () => boolean;
  refazerHistorico?: () => boolean;
  abrirModalUnificacaoSobrepostos?: () => Promise<void>;
  expandirIngestao?: () => void;
  colapsarIngestao?: () => void;
  atualizarPainelPropriedades?: () => void;
  inicializarRedimensionamentoColunas?: () => void;
}
