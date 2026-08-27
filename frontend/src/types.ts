export interface RouteDef {
  render: () => string;
  setup?: (param?: string | null) => void;
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
  matricula_id?: number;
  planilha_origem?: string;
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

export interface PropriedadeVinculadaCliente {
  id: number;
  nome_propriedade: string;
  percentual_participacao: number;
}

export interface ClienteDocumento {
  id?: number;
  pessoa_id?: number;
  tipo_documento: 'RG' | 'CNH' | 'CREA' | 'CAU' | 'OAB' | 'PASSAPORTE' | string;
  numero: string;
  orgao_emissor?: string | null;
  uf_emissor?: string | null;
  categoria_cnh?: string | null;
  data_emissao?: string | null;
  data_validade?: string | null;
  observacoes?: string | null;
  created_at?: string;
}

export interface ClienteAcessoLog {
  id: number;
  tipo_dado: string;
  acao: string;
  usuario: string;
  ip_origem?: string | null;
  data_acesso: string;
}

export interface Cliente {
  id: number;
  pessoa_id?: number;
  nome_completo: string;
  cpf_cnpj: string;
  rg_ie?: string | null;
  nacionalidade?: string | null;
  profissao?: string | null;
  estado_civil?: string | null;
  regime_bens?: string | null;
  endereco_completo?: string | null;
  nome_conjuge?: string | null;
  cpf_conjuge?: string | null;
  rg_conjuge?: string | null;
  data_nascimento_fundacao?: string | null;
  email?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  sexo?: 'M' | 'F' | string;
  senha_gov?: string | null;
  tem_senha_gov?: boolean;
  tipo_pessoa?: 'PF' | 'PJ' | string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  representante_legal_id?: number | null;
  representante_legal_nome?: string | null;
  documentos?: ClienteDocumento[];
  created_at?: string;
  metadados?: Record<string, string>;
  total_levantamentos?: number;
  total_propriedades?: number;
  propriedades?: PropriedadeVinculadaCliente[];
}

export interface ClientePayload {
  nome_completo: string;
  cpf_cnpj: string;
  rg_ie?: string | null;
  data_nascimento_fundacao?: string | null;
  estado_civil?: string | null;
  profissao?: string | null;
  nacionalidade?: string | null;
  nome_conjuge?: string | null;
  cpf_conjuge?: string | null;
  rg_conjuge?: string | null;
  regime_bens?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco_completo?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  sexo?: string;
  senha_gov?: string | null;
  tipo_pessoa?: 'PF' | 'PJ' | string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  representante_legal_id?: number | null;
  documentos?: ClienteDocumento[];
  metadados?: Record<string, string>;
}

export interface ClienteHistoricoLog {
  campo_alterado: string;
  valor_antigo: string | null;
  valor_novo: string | null;
  data_alteracao: string;
}

export interface ClienteEstatisticas {
  total: number;
  pf: number;
  pj: number;
  incompletos: number;
}

export interface ExcluirLoteResponse {
  sucessos: number;
  erros: string[];
  total_processado: number;
}

export interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  gia?: string;
  ddd?: string;
  siafi?: string;
  erro?: boolean;
}
