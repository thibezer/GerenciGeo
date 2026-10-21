import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export interface PontoSobrepostoInfo {
  ponto: any;
  isSugeridoMestre: boolean;
  distanciaMetros: number;
}

export interface GrupoSobreposto {
  id: number;
  pontos: PontoSobrepostoInfo[];
  distanciaMaxMetros: number;
  temNomesDiferentes: boolean;
}

/**
 * Calcula distância euclidiana 2D em metros entre dois pontos
 */
export function calcularDistancia2D(p1: any, p2: any, ctx: MesaTrabalhoContext): number {
  const e1 = p1.e_corrigido ?? p1.easting ?? p1.easting_corrigido;
  const n1 = p1.n_corrigido ?? p1.northing ?? p1.northing_corrigido;
  const e2 = p2.e_corrigido ?? p2.easting ?? p2.easting_corrigido;
  const n2 = p2.n_corrigido ?? p2.northing ?? p2.northing_corrigido;

  if (e1 != null && n1 != null && e2 != null && n2 != null && !isNaN(e1) && !isNaN(n1) && !isNaN(e2) && !isNaN(n2)) {
    const dx = Number(e1) - Number(e2);
    const dy = Number(n1) - Number(n2);
    return Math.sqrt(dx * dx + dy * dy);
  }

  const lat1 = Number(p1.lat_corrigido ?? p1.lat ?? 0);
  const lon1 = Number(p1.lon_corrigido ?? p1.lon ?? 0);
  const lat2 = Number(p2.lat_corrigido ?? p2.lat ?? 0);
  const lon2 = Number(p2.lon_corrigido ?? p2.lon ?? 0);

  if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;

  if (ctx.latLonToUTM) {
    const u1 = ctx.latLonToUTM(lat1, lon1);
    const u2 = ctx.latLonToUTM(lat2, lon2);
    const dx = u1.e - u2.e;
    const dy = u1.n - u2.n;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const dLat = (lat1 - lat2) * 111139;
  const dLon = (lon1 - lon2) * 111139 * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Pontuação inteligente para definir o vértice mestre recomendado
 */
export function calcularScoreMestre(p: any): number {
  let score = 0;

  // Prioridade 1: Status Corrigido (RTK / PPP) vs Bruto
  const status = String(p.status_ponto || p.status || '').toUpperCase();
  if (status === 'CORRIGIDO') score += 1000;

  // Prioridade 2: Tipo de Ponto (Marco M > Vértice V > Ponto P > Base B)
  const tipo = String(p.tipo_ponto || p.tipo || '').toUpperCase();
  if (tipo === 'M') score += 50;
  else if (tipo === 'V') score += 40;
  else if (tipo === 'P') score += 20;

  // Prioridade 3: Nome do vértice com formato SIGEF oficial (ex: XXX-M-0000 ou XXX-V-0000)
  const nome = String(p.nome_vertice || '').trim();
  if (nome !== '') {
    score += 10;
    if (/^[A-Z0-9]{3,4}-[MVPB]-\d+/i.test(nome)) {
      score += 100;
    }
  }

  // Prioridade 4: Maior ID
  score += (p.id || 0) * 0.0001;

  return score;
}

/**
 * Detecta clusters de pontos sobrepostos (mesmas coordenadas)
 * Busca tanto pontos com o mesmo nome quanto com nomes totalmente diferentes.
 */
export function detectarGruposSobrepostos(ctx: MesaTrabalhoContext, toleranciaMetros = 0.05): GrupoSobreposto[] {
  const todosPontos = ctx.pontosList || [];

  const pontosCandidatos = todosPontos.filter(p =>
    p &&
    p.ignorar_poligono !== 1 &&
    (!ctx.currentMatriculaId || String(p.matricula_id) === String(ctx.currentMatriculaId))
  );

  const n = pontosCandidatos.length;
  if (n < 2) return [];

  // Union-Find / Componentes Conexas
  const parent: number[] = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (i: number, j: number) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = calcularDistancia2D(pontosCandidatos[i], pontosCandidatos[j], ctx);
      if (dist <= toleranciaMetros) {
        union(i, j);
      }
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) {
      clusters.set(root, []);
    }
    clusters.get(root)!.push(i);
  }

  const gruposResultado: GrupoSobreposto[] = [];
  let grupoCounter = 1;

  clusters.forEach((indices) => {
    if (indices.length < 2) return;

    const listaPontos = indices.map(idx => pontosCandidatos[idx]);

    let melhorPonto = listaPontos[0];
    let melhorScore = -1;
    listaPontos.forEach(p => {
      const sc = calcularScoreMestre(p);
      if (sc > melhorScore) {
        melhorScore = sc;
        melhorPonto = p;
      }
    });

    let distMax = 0;
    for (let i = 0; i < listaPontos.length; i++) {
      for (let j = i + 1; j < listaPontos.length; j++) {
        const d = calcularDistancia2D(listaPontos[i], listaPontos[j], ctx);
        if (d > distMax) distMax = d;
      }
    }

    const pontosInfo: PontoSobrepostoInfo[] = listaPontos.map(p => ({
      ponto: p,
      isSugeridoMestre: p.id === melhorPonto.id,
      distanciaMetros: calcularDistancia2D(p, melhorPonto, ctx)
    }));

    pontosInfo.sort((a, b) => (b.isSugeridoMestre ? 1 : 0) - (a.isSugeridoMestre ? 1 : 0));

    const nomesUnicos = new Set(listaPontos.map(p => (p.nome_vertice || '').trim().toLowerCase()));
    const temNomesDiferentes = nomesUnicos.size > 1;

    gruposResultado.push({
      id: grupoCounter++,
      pontos: pontosInfo,
      distanciaMaxMetros: distMax,
      temNomesDiferentes
    });
  });

  return gruposResultado;
}
