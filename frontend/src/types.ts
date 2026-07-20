export interface RouteDef {
  render: () => string;
  setup?: () => void;
  cleanup?: () => void;
}

export interface Ponto {
  id: number;
  lat?: number;
  lon?: number;
  tipo_ponto?: string;
  tipo?: string;
  nome_vertice?: string;
  ignorar_poligono?: number;
  ordem_caminhamento?: number;
  confrontante_id?: number;
  nome_confrontante?: string;
  nome_propriedade?: string;
}

export interface Segmento {
  ponto_inicio_id: number;
  ponto_fim_id: number;
  tipo_limite_sigef?: string;
  metodo_posicionamento_sigef?: string;
}

export interface BancoPonto extends Ponto {
  codigo_completo?: string;
  este?: number;
  norte?: number;
  altitude?: number;
  metodo_posicionamento?: string;
  tipo_limite?: string;
  confrontante_descritivo?: string;
  matricula_id?: number;
  planilha_origem?: string;
}
