/**
 * Sequência de vértices usada pelo Offset (ferramenta do mapa e modal de vértices virtuais).
 *
 * A seleção chega na ordem em que foi feita (Ctrl+clique, Shift+clique, laço da Caneta), que não é a
 * ordem do perímetro: Shift+clique de baixo para cima gera [P5, P1, P2, P3, P4] e o laço passando pelo
 * início do caminhamento gera [P1, P2, P3, P(n-1), Pn]. Offset numa sequência assim cria um trecho
 * diagonal e corrompe os cantos vizinhos. Aqui os pontos voltam para a ordem de caminhamento.
 */

const mesmoId = (a: any, b: any) => String(a) === String(b);

/** Vértices do perímetro da matrícula na ordem de caminhamento (sem base 'B' e sem pontos fora do polígono). */
export function pontosDoPerimetro(todos: any[], matriculaId: any): any[] {
  return (todos || [])
    .filter(p =>
      matriculaId != null && mesmoId(p.matricula_id, matriculaId)
      && !p.ignorar_poligono
      && (p.tipo_ponto || p.tipo) !== 'B'
      && Number(p.ordem_caminhamento) > 0
    )
    .sort((a, b) => Number(a.ordem_caminhamento) - Number(b.ordem_caminhamento));
}

export interface SequenciaOffset {
  pontos: any[];
  /** Perímetro inteiro selecionado: o offset é de um polígono fechado */
  fechado: boolean;
}

/**
 * Ordena os pontos selecionados pelo caminhamento do perímetro. Como o perímetro é fechado, a sequência
 * começa logo depois do maior intervalo entre selecionados (assim P(n-1), Pn, P1, P2 fica contínuo).
 * Se algum ponto selecionado não é do perímetro (ex.: eixo de estrada levantado em campo), a ordem de
 * seleção é a única informação disponível e é mantida.
 */
export function ordenarSequenciaOffset(selecionados: any[], perimetro: any[]): SequenciaOffset {
  const sel = (selecionados || []).filter(Boolean);
  if (sel.length < 2 || perimetro.length < 2) return { pontos: sel, fechado: false };

  const indices = sel.map(p => perimetro.findIndex(q => mesmoId(q.id, p.id)));
  if (indices.some(i => i < 0)) return { pontos: sel, fechado: false };

  const ordenados = Array.from(new Set(indices)).sort((a, b) => a - b);
  const n = perimetro.length;

  if (ordenados.length === n && n >= 3) {
    return { pontos: ordenados.map(i => perimetro[i]), fechado: true };
  }

  // Maior intervalo cíclico entre selecionados consecutivos; a sequência começa depois dele
  let inicio = 0;
  let maiorIntervalo = ordenados[0] + n - ordenados[ordenados.length - 1];
  for (let k = 1; k < ordenados.length; k++) {
    const intervalo = ordenados[k] - ordenados[k - 1];
    if (intervalo > maiorIntervalo) {
      maiorIntervalo = intervalo;
      inicio = k;
    }
  }
  const rotacionados = [...ordenados.slice(inicio), ...ordenados.slice(0, inicio)];
  return { pontos: rotacionados.map(i => perimetro[i]), fechado: false };
}

/**
 * Remove vértices consecutivos coincidentes (trecho nulo): o backend recusa e a prévia desalinharia.
 * No polígono fechado, o último também não pode coincidir com o primeiro.
 */
export function removerCoincidentes<T>(
  pontos: T[],
  coordenada: (p: T) => { este: number; norte: number } | null,
  fechado: boolean,
  toleranciaM = 0.001
): T[] {
  const saida: T[] = [];
  let anterior: { este: number; norte: number } | null = null;
  pontos.forEach(p => {
    const c = coordenada(p);
    if (!c) return;
    if (anterior && Math.hypot(c.este - anterior.este, c.norte - anterior.norte) < toleranciaM) return;
    saida.push(p);
    anterior = c;
  });
  if (fechado && saida.length > 1) {
    const c0 = coordenada(saida[0])!;
    const cn = coordenada(saida[saida.length - 1])!;
    if (Math.hypot(c0.este - cn.este, c0.norte - cn.norte) < toleranciaM) saida.pop();
  }
  return saida;
}
