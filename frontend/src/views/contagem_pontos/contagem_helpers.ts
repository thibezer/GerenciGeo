/**
 * contagem_helpers.ts — Lógica pura da tela Contagem de Pontos (sem DOM, testável com `npm test`).
 */
import type { ContagemCodigo, ContagemItemProjeto, ContagemProjeto, ContagemTipo } from './contagem_service';

export type CampoOrdemProjeto = 'nome' | 'pontos' | 'fora';
export type DirecaoOrdem = 'asc' | 'desc';

export interface OpcoesFiltroProjetos {
  termo: string;
  incluirTerceiros: boolean;
  somenteComPontos: boolean;
}

export interface LinhaProjeto {
  p: ContagemProjeto;
  itens: ContagemItemProjeto[];
}

const num = (n: number): string => String(n).padStart(4, '0');

export const formatarFaixa = ([a, b]: [number, number]): string =>
  a === b ? num(a) : `${num(a)}–${num(b)}`;

export const formatarNumero4 = num;

const semAcento = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Projetos que entram na tabela. Sem terceiros, só entram itens do(s) código(s) do profissional;
 * "somenteComPontos" esconde projetos que ficaram sem nenhum item depois desse corte.
 * O termo casa com a propriedade (sem acento), o id do levantamento ou qualquer CODIGO-TIPO.
 */
export const filtrarProjetos = (projetos: ContagemProjeto[], opcoes: OpcoesFiltroProjetos): LinhaProjeto[] => {
  const termo = semAcento(opcoes.termo.trim());
  return projetos
    .map(p => ({ p, itens: p.itens.filter(i => opcoes.incluirTerceiros || i.meu) }))
    .filter(({ p, itens }) => {
      if (opcoes.somenteComPontos && itens.length === 0) return false;
      if (!termo) return true;
      return (
        semAcento(p.propriedade || '').includes(termo) ||
        String(p.levantamento_id) === termo ||
        itens.some(i => `${i.codigo}-${i.tipo}`.toLowerCase().includes(termo))
      );
    });
};

/** Ordenação estável e sem mutar a entrada; empate desempata por nome A-Z. */
export const ordenarLinhasProjeto = (linhas: LinhaProjeto[], campo: CampoOrdemProjeto, direcao: DirecaoOrdem): LinhaProjeto[] => {
  const fator = direcao === 'asc' ? 1 : -1;
  const nomes = (a: LinhaProjeto, b: LinhaProjeto): number =>
    (a.p.propriedade || '').localeCompare(b.p.propriedade || '', 'pt-BR', { sensitivity: 'base' });
  return [...linhas].sort((a, b) => {
    let r = 0;
    if (campo === 'nome') r = nomes(a, b);
    else if (campo === 'pontos') r = a.p.total_pontos - b.p.total_pontos;
    else r = a.p.fora_do_padrao - b.p.fora_do_padrao;
    return r !== 0 ? r * fator : nomes(a, b);
  });
};

export interface LinhaTerceiro {
  codigo: string;
  tipo: string;
  faixas: [number, number][];
  total: number;
}

/** Códigos de terceiros/vizinhos, uma linha por (código, tipo); o termo filtra pelo código. */
export const linhasTerceiros = (codigos: ContagemCodigo[], termo: string): LinhaTerceiro[] => {
  const t = termo.trim().toLowerCase();
  return codigos
    .filter(c => !c.meu && (!t || c.codigo.toLowerCase().includes(t)))
    .flatMap(c => Object.values(c.tipos).map((x: ContagemTipo) => ({
      codigo: c.codigo, tipo: x.tipo, faixas: x.faixas, total: x.total
    })));
};

/** Diz se o contador salvo no cadastro do profissional diverge do maior número usado nos projetos. */
export const descreverDivergencia = (t: ContagemTipo): string | null =>
  t.divergencia_contador
    ? `Cadastro do profissional marca ${t.contador_cadastrado ?? 0}; nos projetos o maior é ${t.maximo ?? 0}.`
    : null;

/** Resumo de uso do tipo: "Usados 0001–0004" ou "Nenhum ponto usado ainda". */
export const resumirUso = (t: ContagemTipo): string =>
  t.total > 0 ? `Usados ${num(t.minimo ?? 0)}–${num(t.maximo ?? 0)}` : 'Nenhum ponto usado ainda';
