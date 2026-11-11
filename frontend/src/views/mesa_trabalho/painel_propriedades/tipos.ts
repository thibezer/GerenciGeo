/**
 * Tipos e contratos locais para a integração com <ui-tabela-propriedades>.
 */

export type TipoPropriedade =
  | 'texto'
  | 'numero'
  | 'selecao'
  | 'booleano'
  | 'cor'
  | 'cor-cad'
  | 'linha'
  | 'linetype'
  | 'espessura'
  | 'lineweight'
  | 'acao'
  | 'readonly';

export interface OpcaoPropriedade {
  id: string | number;
  rotulo: string;
}

export interface ItemPropriedade {
  id: string;
  rotulo: string;
  tipo: TipoPropriedade;
  valor: any;
  unidade?: string;
  casasDecimais?: number;
  opcoes?: OpcaoPropriedade[];
  placeholder?: string;
  somenteLeitura?: boolean;
  dica?: string;
  rotuloAcao?: string;
  textoAmostra?: string;
  onClickAcao?: (item: ItemPropriedade) => void;
}

export interface CategoriaPropriedades {
  id: string;
  titulo: string;
  aberto?: boolean;
  aberta?: boolean;
  propriedades: ItemPropriedade[];
}

export type TipoPainelPropriedades = 'geral' | 'vertice' | 'segmento' | 'multi';

export function chaveStoragePainel(tipo: TipoPainelPropriedades): string {
  return `ui-props-tree-${tipo}`;
}

export interface DefinirEstadoCategoriasOpcoes {
  persistir?: boolean;
  emitirEvento?: boolean;
}

export interface UICategoriasEstadoDetail {
  estado: Record<string, boolean>;
  abertas: string[];
  fechadas: string[];
}

export interface SeletorTipoItem {
  id: string;
  rotulo: string;
  subtipo?: string;
  iconeSvg?: string;
}

export interface UIPropertyChangeDetail {
  id: string;
  categoriaId: string;
  valor: any;
  valorAnterior: any;
  todosValores: Record<string, any>;
}

export interface UITabelaPropriedadesElement extends HTMLElement {
  categorias: CategoriaPropriedades[];
  tipos: SeletorTipoItem[];
  tipoSelecionado: string;
  valores: Record<string, any>;
  isDirty: boolean;
  persistir: boolean;
  storageKey: string | null;
  obterValor(propId: string): any;
  definirValor(propId: string, novoValor: any, emitirEvento?: boolean): void;
  aplicar(): void;
  desfazer(): void;
  expandirTudo(): void;
  colapsarTudo(): void;
  toggleCategoria(idCategoria: string): void;
  obterChaveStorageAtual(): string;
  obterEstadoCategorias(): Record<string, boolean>;
  definirEstadoCategorias(estado: Record<string, boolean>, opcoes?: DefinirEstadoCategoriasOpcoes): void;
  limparEstadoCategorias(): void;
  limparLembranca(): void;
}
