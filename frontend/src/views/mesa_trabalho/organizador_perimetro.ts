import type { MesaTrabalhoContext } from './mesa_trabalho_context';

export const renderTabelaOrganizadorPerimetro = (ctx: MesaTrabalhoContext) => {
  // Removido o early return para permitir que pontos avulsos ([Sem Matrícula]) sejam carregados
  const isIgnoradoOuBase = (p: any) => p.ignorar_poligono === 1 || p.tipo_ponto === 'B' || p.tipo === 'B';

  let pontosMat = ctx.obterPontosParaOrdenacao();
  if (ctx.currentMatriculaId) {
    pontosMat = pontosMat.filter((p: any) => p && String(p.matricula_id) === String(ctx.currentMatriculaId));
  }

  if (ctx.bancoPontosExibido && ctx.bancoPontosList && ctx.bancoPontosList.length > 0) {
    pontosMat = ctx.bancoPontosList.map((bp: any) => ({
      id: bp.id,
      nome_vertice: bp.codigo_completo || bp.nome_vertice || `VRT-${bp.numero || bp.id}`,
      nome_original: bp.nome_original || bp.codigo_completo,
      tipo_ponto: bp.tipo_ponto || 'V',
      tipo: bp.tipo_ponto || 'V',
      lat: bp.lat,
      lon: bp.lon,
      alt: bp.altitude !== undefined && bp.altitude !== null ? bp.altitude : bp.alt,
      alt_original: bp.altitude !== undefined && bp.altitude !== null ? bp.altitude : bp.alt,
      e_corrigido: bp.este !== undefined && bp.este !== null ? bp.este : bp.e_corrigido,
      n_corrigido: bp.norte !== undefined && bp.norte !== null ? bp.norte : bp.n_corrigido,
      lat_corrigido: bp.lat,
      lon_corrigido: bp.lon,
      alt_corrigido: bp.altitude !== undefined && bp.altitude !== null ? bp.altitude : bp.alt,
      sigma_e: bp.sigma_e || 0.05,
      sigma_n: bp.sigma_n || 0.05,
      sigma_z: bp.sigma_z || 0.08,
      status_correcao: 'CORRIGIDO',
      status_ponto: 'CORRIGIDO',
      arquivo_origem: bp.planilha_origem || 'Planilha SIGEF / INCRA'
    }));
  }

  // Calcula o mapa de ordem real estável de caminhamento antes de qualquer filtro
  const pontosOrdenadosOriginal = [...pontosMat].sort((a, b) => {
    const isIgnA = isIgnoradoOuBase(a) ? 1 : 0;
    const isIgnB = isIgnoradoOuBase(b) ? 1 : 0;
    if (isIgnA !== isIgnB) return isIgnB - isIgnA;
    if (isIgnA === 1) return (a.nome_vertice || '').localeCompare(b.nome_vertice || '');
    const valA = a.ordem_caminhamento;
    const valB = b.ordem_caminhamento;
    const numA = Number(valA ?? 999999);
    const numB = Number(valB ?? 999999);
    return numA - numB;
  });

  let seqReal = 1;
  const mapaOrdemReal = new Map<number, string | number>();
  pontosOrdenadosOriginal.forEach((p) => {
    const isIgn = isIgnoradoOuBase(p);
    mapaOrdemReal.set(p.id, isIgn ? '-' : seqReal++);
  });

  // Calcula as contagens dinâmicas de filtros rápidos antes de aplicar o filtro ativo
  const totalTodos = pontosMat.length;
  const totalBases = pontosMat.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B').length;
  const totalRovers = pontosMat.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B').length;
  const totalBrutos = pontosMat.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO').length;
  const totalCorrigidos = pontosMat.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO').length;

  const btnTodos = document.querySelector('.btn-filtro-rapido[data-filtro="todos"]');
  if (btnTodos) btnTodos.textContent = `Todos (${totalTodos})`;
  // Mantemos atualização para compatibilidade das classes se houver
  const btnBasesEl = document.querySelector('.btn-filtro-rapido[data-filtro="bases"]');
  if (btnBasesEl) btnBasesEl.textContent = `Bases (M/B) (${totalBases})`;
  const btnRoversEl = document.querySelector('.btn-filtro-rapido[data-filtro="rovers"]');
  if (btnRoversEl) btnRoversEl.textContent = `Rovers (P/V) (${totalRovers})`;
  const btnBrutosEl = document.querySelector('.btn-filtro-rapido[data-filtro="brutos"]');
  if (btnBrutosEl) btnBrutosEl.textContent = `Brutos (${totalBrutos})`;
  const btnCorrigidosEl = document.querySelector('.btn-filtro-rapido[data-filtro="corrigidos"]');
  if (btnCorrigidosEl) btnCorrigidosEl.textContent = `Corrigidos (${totalCorrigidos})`;

  if (ctx.ocultarForaPoligono) {
    pontosMat = pontosMat.filter(p => p.ignorar_poligono !== 1);
  }

  if (ctx.filtroRapidoAtivo !== 'todos') {
    if (ctx.filtroRapidoAtivo === 'bases') {
      pontosMat = pontosMat.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B');
    } else if (ctx.filtroRapidoAtivo === 'rovers') {
      pontosMat = pontosMat.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    } else if (ctx.filtroRapidoAtivo === 'brutos') {
      pontosMat = pontosMat.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO');
    } else if (ctx.filtroRapidoAtivo === 'corrigidos') {
      pontosMat = pontosMat.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO');
    }
  }

  if (ctx.searchFilterValue) {
    pontosMat = pontosMat.filter(p =>
      (p.nome_vertice && p.nome_vertice.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.tipo && p.tipo.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.arquivo_origem && p.arquivo_origem.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.ordem_caminhamento && String(p.ordem_caminhamento).includes(ctx.searchFilterValue))
    );
  }

  const matAtiva = ctx.matriculasList.find((m: any) => String(m.id) === String(ctx.currentMatriculaId));
  const effectiveMatId = (matAtiva && matAtiva.matricula_origem_desenho_id) ? matAtiva.matricula_origem_desenho_id : ctx.currentMatriculaId;
  let segmentosMat = effectiveMatId
    ? ctx.segmentosList.filter((s: any) => String(s.matricula_id) === String(effectiveMatId))
    : ctx.segmentosList;

  if (ctx.triagemMap) {
    const bpAtivo = ctx.bancoPontosExibido && ctx.bancoPontosList.length > 0;
    ctx.mapaController.clearOverlays(bpAtivo);
    ctx.mapaController.plotPontos(pontosMat, (pId: number) => {
      ctx.selectPontoFromTabela(pId);
    });

    if (segmentosMat && segmentosMat.length > 0) {
      ctx.mapaController.plotSegmentos(segmentosMat, ctx.pontosList);
    } else {
      ctx.mapaController.plotPolilinhaTemporaria(pontosMat);
    }

    if (bpAtivo) {
      ctx.mapaController.plotPoligonalHomologada(ctx.bancoPontosList);
    }
    if (ctx.pontosVizinhosList && ctx.pontosVizinhosList.length > 0) {
      ctx.mapaController.plotPontosVizinhos(ctx.pontosVizinhosList);
    }
    if (ctx.confrontantesList && ctx.confrontantesList.length > 0) {
      ctx.mapaController.plotPoligonosVizinhos(ctx.confrontantesList);
    }
  }


  // Renderiza também a lista simplificada do ordenador manual
  if (typeof ctx.renderListaReordenarSimplificada === 'function') {
    ctx.renderListaReordenarSimplificada();
  }
};
