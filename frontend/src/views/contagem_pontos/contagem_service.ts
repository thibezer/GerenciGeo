/**
 * contagem_service.ts — Chamadas HTTP/API da tela Contagem de Pontos.
 */
import { API_BASE } from '../../config';

export interface ContagemTipo {
  tipo: 'M' | 'P' | 'V';
  total: number;
  minimo: number | null;
  maximo: number | null;
  isolados: number[];
  proximo: number;
  proximo_nome: string;
  faixas: [number, number][];
  lacunas: [number, number][];
  total_lacunas: number;
  projetos: number;
  contador_cadastrado?: number;
  divergencia_contador?: boolean;
}

export interface ContagemCodigo {
  codigo: string;
  meu: boolean;
  profissional: string | null;
  tipos: Record<string, ContagemTipo>;
}

export interface ContagemItemProjeto {
  codigo: string;
  tipo: 'M' | 'P' | 'V';
  meu: boolean;
  quantidade: number;
  faixas: [number, number][];
}

export interface ContagemProjeto {
  levantamento_id: number;
  propriedade: string;
  municipio: string;
  uf: string;
  status: string;
  total_pontos: number;
  fora_do_padrao: number;
  itens: ContagemItemProjeto[];
}

export interface ContagemConflito {
  nome: string;
  levantamentos: number[];
}

export interface ContagemPontos {
  codigos: ContagemCodigo[];
  projetos: ContagemProjeto[];
  conflitos: ContagemConflito[];
}

export const fetchContagemPontos = async (): Promise<ContagemPontos> => {
  const res = await fetch(`${API_BASE}/contagem-pontos`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
