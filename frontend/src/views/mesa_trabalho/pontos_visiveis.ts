import type { MesaTrabalhoContext } from './mesa_trabalho_context';

/**
 * Filtros que decidem quais vértices a Mesa Geodésica mostra (tabela E mapa): "ocultar fora da poligonal",
 * filtro rápido, busca por texto e arquivos de origem desativados. Fonte única — a tabela
 * (renderTabelaMesaGeodesica) e a Caneta de Seleção usam esta função, para a caneta só selecionar o que o
 * usuário está vendo.
 */
export function aplicarFiltrosMesa<T extends Record<string, any>>(ctx: MesaTrabalhoContext, pontos: T[]): T[] {
  let lista = pontos;

  if (ctx.ocultarForaPoligono) {
    lista = lista.filter(p => p.ignorar_poligono !== 1);
  }

  if (ctx.filtroRapidoAtivo !== 'todos') {
    if (ctx.filtroRapidoAtivo === 'bases') {
      lista = lista.filter(p => p.tipo_ponto === 'B' || p.tipo === 'B');
    } else if (ctx.filtroRapidoAtivo === 'rovers') {
      lista = lista.filter(p => p.tipo_ponto !== 'B' && p.tipo !== 'B');
    } else if (ctx.filtroRapidoAtivo === 'brutos') {
      lista = lista.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO');
    } else if (ctx.filtroRapidoAtivo === 'corrigidos') {
      lista = lista.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO');
    }
  }

  if (ctx.searchFilterValue) {
    const busca = ctx.searchFilterValue;
    lista = lista.filter(p =>
      (p.nome_vertice && p.nome_vertice.toLowerCase().includes(busca)) ||
      (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(busca)) ||
      (p.tipo && p.tipo.toLowerCase().includes(busca)) ||
      (p.arquivo_origem && p.arquivo_origem.toLowerCase().includes(busca)) ||
      (p.ordem_caminhamento && String(p.ordem_caminhamento).includes(busca))
    );
  }

  const desativados = ctx.arquivosDesativadosList || [];
  if (desativados.length > 0) {
    lista = lista.filter(p => !desativados.includes(p.arquivo_origem));
  }

  return lista;
}

/**
 * Vértices que o usuário vê na Mesa Geodésica (matrícula ativa + mesmos filtros da tabela), usados pela
 * Caneta. Os pontos de banco homologado (fonte "Planilha SIGEF") não entram: não existem em ctx.pontosList.
 */
export function pontosVisiveisParaSelecao(ctx: MesaTrabalhoContext): any[] {
  let base: any[] = (ctx.currentMatriculaId && ctx.obterPontosParaOrdenacao)
    ? ctx.obterPontosParaOrdenacao()
    : [...(ctx.pontosList || [])];

  if (ctx.currentMatriculaId) {
    base = base.filter(p => p && String(p.matricula_id) === String(ctx.currentMatriculaId));
  }
  return aplicarFiltrosMesa(ctx, base.filter(p => !!p));
}
