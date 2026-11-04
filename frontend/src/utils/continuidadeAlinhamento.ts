/**
 * Verifica se os pontos escolhidos para um alinhamento (offset) são consecutivos no perímetro.
 * Aviso apenas informativo: nunca bloqueia a operação.
 */

interface PontoOrdenavel {
  id: number | string;
  ordem_caminhamento?: number | string | null;
  matricula_id?: number | string | null;
  tipo_ponto?: string | null;
  ignorar_poligono?: number | boolean | null;
}

const ordemDe = (p: PontoOrdenavel): number => Number(p.ordem_caminhamento) || 0;

/**
 * Devolve a mensagem de aviso ou `null` quando a seleção é contínua (ou não dá para avaliar).
 * Só avalia pontos que já estão no perímetro da matrícula (com ordem de caminhamento).
 */
export function avisoContinuidadeAlinhamento(
  selecionados: PontoOrdenavel[],
  todos: PontoOrdenavel[],
  matriculaId?: number | string | null,
): string | null {
  if (selecionados.length < 2) return null;

  const perimetro = todos
    .filter(p =>
      ordemDe(p) > 0 &&
      !p.ignorar_poligono &&
      p.tipo_ponto !== 'B' &&
      (!matriculaId || String(p.matricula_id) === String(matriculaId)))
    .sort((a, b) => ordemDe(a) - ordemDe(b));
  const posicao = new Map(perimetro.map((p, i) => [String(p.id), i]));

  const posicoes = selecionados.map(p => posicao.get(String(p.id)));
  const fora = posicoes.filter(i => i === undefined).length;
  const dentro = posicoes.filter((i): i is number => i !== undefined).sort((a, b) => a - b);

  if (fora > 0 && dentro.length > 0) {
    return 'A seleção mistura pontos do perímetro com pontos fora dele; o alinhamento seguirá a ordem de caminhamento.';
  }
  if (dentro.length < 2) return null;

  const lacunas = dentro.slice(1).reduce((n, pos, i) => n + (pos - dentro[i] - 1), 0);
  if (lacunas > 0) {
    return `Os pontos selecionados não são consecutivos no perímetro (${lacunas} ponto${lacunas > 1 ? 's' : ''} no meio ficará fora do alinhamento). Confira se é isso mesmo.`;
  }
  return null;
}
