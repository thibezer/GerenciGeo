import { escapeHtml, formatarCCIR, formatarDataBr } from '../../utils';

export { formatarDataBr };

// Lógica pura da listagem de Levantamentos (padrão: "Arquivos .md/PADRAO_TELA_LISTAGEM.md").
// Sem DOM: tudo aqui é testável com `npm test`.

export interface LevantamentoCliente {
  id?: number;
  nome_completo: string;
  percentual_participacao?: number | null;
}

export interface Levantamento {
  id: number;
  propriedade_id?: number;
  nome_propriedade: string;
  status: string;
  data_inicio: string;
  numero_trt?: string | null;
  codigo_car?: string | null;
  codigo_ccir?: string | null;
  municipio?: string | null;
  uf?: string | null;
  total_pontos?: number | null;
  total_segmentos?: number | null;
  clientes?: LevantamentoCliente[] | null;
}

export type SegmentoLev = 'todos' | 'andamento' | 'concluido' | 'arquivado' | 'pendencias';
export type CampoOrdemLev = 'nome' | 'data' | 'pontos';
export type DirecaoOrdem = 'asc' | 'desc';

export interface PendenciaLev {
  codigo: 'sem-proprietario' | 'sem-trt' | 'sem-pontos';
  rotulo: string;
}

const semAcento = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const rotuloStatus = (status: string): string => (status || '').replace(/_/g, ' ');

const classeTagStatus = (status: string): string =>
  status === 'CONCLUIDO' ? 'lp-tag-pf'
    : status === 'ARQUIVADO' ? 'lp-tag-mute'
      : 'lp-tag-info';

export const formatarProprietarios = (l: Levantamento, textoVazio: string): string =>
  l.clientes && l.clientes.length
    ? l.clientes.map(c => `${c.nome_completo} (${(c.percentual_participacao || 0).toFixed(0)}%)`).join(', ')
    : textoVazio;

/**
 * Resumo para a tabela: o proprietário de maior participação (empate: nome A-Z) e quantos outros existem.
 * `completo` traz a lista inteira, para o tooltip. Sem proprietários devolve null.
 */
export const resumirProprietariosLev = (l: Levantamento): { principal: string; extras: number; completo: string } | null => {
  const clientes = l.clientes || [];
  if (clientes.length === 0) return null;
  const ordenados = [...clientes].sort((a, b) => {
    const diff = (b.percentual_participacao || 0) - (a.percentual_participacao || 0);
    return diff !== 0 ? diff : a.nome_completo.localeCompare(b.nome_completo, 'pt-BR', { sensitivity: 'base' });
  });
  const p = ordenados[0];
  return {
    principal: `${p.nome_completo} (${(p.percentual_participacao || 0).toFixed(0)}%)`,
    extras: clientes.length - 1,
    completo: formatarProprietarios(l, '')
  };
};

/** O que falta no levantamento. Arquivado já está fechado: não tem pendência. */
export const listarPendenciasLev = (l: Levantamento): PendenciaLev[] => {
  if (l.status === 'ARQUIVADO') return [];
  const pendencias: PendenciaLev[] = [];
  if (!l.clientes || l.clientes.length === 0) pendencias.push({ codigo: 'sem-proprietario', rotulo: 'Sem proprietário' });
  if (!(l.numero_trt || '').trim()) pendencias.push({ codigo: 'sem-trt', rotulo: 'Sem TRT' });
  if (!l.total_pontos) pendencias.push({ codigo: 'sem-pontos', rotulo: 'Sem pontos' });
  return pendencias;
};

export const filtrarPorSegmento = <T extends Levantamento>(lista: T[], segmento: SegmentoLev): T[] => {
  switch (segmento) {
    case 'andamento': return lista.filter(l => l.status === 'EM_ANDAMENTO');
    case 'concluido': return lista.filter(l => l.status === 'CONCLUIDO');
    case 'arquivado': return lista.filter(l => l.status === 'ARQUIVADO');
    case 'pendencias': return lista.filter(l => listarPendenciasLev(l).length > 0);
    default: return lista;
  }
};

export const contarSegmentosLev = (lista: Levantamento[]): Record<SegmentoLev, number> => ({
  todos: lista.length,
  andamento: filtrarPorSegmento(lista, 'andamento').length,
  concluido: filtrarPorSegmento(lista, 'concluido').length,
  arquivado: filtrarPorSegmento(lista, 'arquivado').length,
  pendencias: filtrarPorSegmento(lista, 'pendencias').length
});

/** Busca por propriedade, município/UF, CAR, CCIR, TRT e proprietários; ignora acento e caixa. */
export const filtrarLevantamentos = <T extends Levantamento>(lista: T[], termo: string): T[] => {
  const t = semAcento((termo || '').trim());
  if (!t) return lista;
  const tDigitos = t.replace(/\D/g, '');
  return lista.filter(l => {
    const texto = semAcento([
      l.nome_propriedade, l.municipio, l.uf, l.codigo_car, l.numero_trt,
      (l.clientes || []).map(c => c.nome_completo).join(' ')
    ].map(v => v || '').join('|'));
    if (texto.includes(t)) return true;
    // CCIR vem sem máscara no banco; aceita o termo digitado com pontos
    return tDigitos.length >= 3 && (l.codigo_ccir || '').replace(/\D/g, '').includes(tDigitos);
  });
};

/** Ordenação estável, sem mutar a entrada; empate sempre desempata por nome A-Z. */
export const ordenarLevantamentos = <T extends Levantamento>(lista: T[], campo: CampoOrdemLev, direcao: DirecaoOrdem): T[] => {
  const fator = direcao === 'asc' ? 1 : -1;
  const nomes = (a: T, b: T): number => a.nome_propriedade.localeCompare(b.nome_propriedade, 'pt-BR', { sensitivity: 'base' });
  return [...lista].sort((a, b) => {
    let r = 0;
    if (campo === 'nome') r = nomes(a, b);
    else if (campo === 'data') r = (a.data_inicio || '').localeCompare(b.data_inicio || '');
    else r = (a.total_pontos || 0) - (b.total_pontos || 0);
    return r !== 0 ? r * fator : nomes(a, b);
  });
};

const tagsPendencia = (l: Levantamento): string =>
  listarPendenciasLev(l)
    .map(p => `<span class="lp-tag lp-tag-warn"><i data-lucide="alert-circle"></i>${p.rotulo}</span>`)
    .join('');

export const renderLinhasLevHtml = (lista: Levantamento[]): string => lista.map(l => {
  const nome = escapeHtml(l.nome_propriedade);
  const local = [l.municipio, l.uf].map(v => (v || '').trim()).filter(Boolean).join(' / ');
  const resumo = resumirProprietariosLev(l);
  // A célula nunca cresce com a lista: o nome do principal é cortado com reticências e o resto vira "+N"
  const celulaProprietarios = resumo
    ? `<div class="flex items-center gap-1.5" style="min-width:0" title="${escapeHtml(resumo.completo)}">
         <span class="lp-sub" style="font-size:12.5px;color:var(--lp-text-2);min-width:0">${escapeHtml(resumo.principal)}</span>
         ${resumo.extras > 0 ? `<span class="lp-tag lp-tag-mute" style="flex-shrink:0">+${resumo.extras}</span>` : ''}
       </div>`
    : '<span class="lp-muted" style="font-size:12.5px">Sem proprietário</span>';
  const arquivado = l.status === 'ARQUIVADO';
  return `
    <tr class="lev-list-item" data-id="${l.id}" tabindex="0" aria-label="Abrir ${nome} na mesa de trabalho">
      <td class="lp-celula-fixa lp-celula-nome">
        <div class="lp-id">
          <i data-lucide="folder" class="w-4 h-4 shrink-0" style="color:#fbbf24"></i>
          <div class="lp-id-txt">
            <div class="lp-id-nome"><span title="${nome}">${nome}</span></div>
            <span class="lp-sub" title="CAR: ${escapeHtml(l.codigo_car || 'N/I')} · CCIR: ${escapeHtml(l.codigo_ccir ? formatarCCIR(l.codigo_ccir) : 'N/I')}">${local ? escapeHtml(local) : '<span class="lp-muted">sem município</span>'}</span>
          </div>
        </div>
      </td>
      <td><span class="lp-mono" style="font-size:12.5px">${escapeHtml(formatarDataBr(l.data_inicio))}</span></td>
      <td>
        <div class="flex flex-wrap items-center gap-1">
          <span class="lp-tag ${classeTagStatus(l.status)}">${escapeHtml(rotuloStatus(l.status))}</span>
          ${tagsPendencia(l)}
        </div>
      </td>
      <td class="lp-oculta-lg lp-celula-fixa">${celulaProprietarios}</td>
      <td class="lp-col-num lp-oculta-md">
        <span class="lp-vinculos">
          <span class="lp-cnt ${l.total_pontos ? '' : 'is-zero'}" title="Pontos"><i data-lucide="map-pin"></i>${l.total_pontos || 0}</span>
          <span class="lp-cnt ${l.total_segmentos ? '' : 'is-zero'}" title="Divisas (segmentos)"><i data-lucide="pentagon"></i>${l.total_segmentos || 0}</span>
        </span>
      </td>
      <td class="lp-col-acoes" style="width:150px">
        <div class="lp-acoes">
          <button type="button" class="lp-ico-btn btn-auditar-icon" data-id="${l.id}" title="Auditar & Triar" aria-label="Auditar e triar ${nome}" style="color:var(--lp-accent)"><i data-lucide="play"></i></button>
          ${arquivado ? `<button type="button" class="lp-ico-btn btn-desarquivar-lev" data-id="${l.id}" title="Desarquivar" aria-label="Desarquivar ${nome}"><i data-lucide="lock-open"></i></button>` : ''}
          <button type="button" class="lp-ico-btn btn-editar-lev" data-id="${l.id}" title="Editar" aria-label="Editar ${nome}"><i data-lucide="edit"></i></button>
          <button type="button" class="lp-ico-btn btn-compartilhar-lev" data-id="${l.id}" title="Gerar link público" aria-label="Compartilhar ${nome}"><i data-lucide="share-2"></i></button>
          <button type="button" class="lp-ico-btn is-danger btn-excluir-lev" data-id="${l.id}" title="Excluir" aria-label="Excluir ${nome}"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    </tr>`;
}).join('');

export const renderCardsLevHtml = (lista: Levantamento[]): string => lista.map(l => {
  const nome = escapeHtml(l.nome_propriedade);
  const proprietarios = escapeHtml(formatarProprietarios(l, 'Sem proprietário vinculado'));
  const car = escapeHtml(l.codigo_car || 'Não Informado');
  const ccir = escapeHtml(l.codigo_ccir ? formatarCCIR(l.codigo_ccir) : 'Não Informado');
  const pendencias = tagsPendencia(l);
  return `
    <div class="glass-card p-4 flex flex-col justify-between hover:border-mint-vibrant/20 transition-colors group lev-card-item" data-id="${l.id}">
      <div>
        <div class="flex justify-between items-start gap-3 mb-2">
          <h4 class="font-bold text-base text-white group-hover:text-mint-vibrant transition-colors max-w-[70%] truncate" title="${nome}">${nome}</h4>
          <span class="lp-tag ${classeTagStatus(l.status)} shrink-0">${escapeHtml(rotuloStatus(l.status))}</span>
        </div>
        <div class="flex items-center justify-between text-xs text-white/50 font-mono mt-1 border-b border-white/5 pb-1.5">
          <div class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3 shrink-0"></i><span>Início: ${escapeHtml(formatarDataBr(l.data_inicio))}</span></div>
          <div class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3 shrink-0"></i><span>${l.total_pontos || 0} pts • ${l.total_segmentos || 0} div</span></div>
        </div>
        <p class="text-xs text-white/60 mt-1.5 truncate font-medium">Proprietários: <span class="text-white/45">${proprietarios}</span></p>
        <div class="space-y-0.5 mt-2 pt-1.5 border-t border-white/5 text-[11px] font-mono text-white/45">
          <div class="flex items-center gap-1.5"><span class="text-mint-vibrant font-bold shrink-0">CAR:</span> <span class="truncate" title="${car}">${car}</span></div>
          <div class="flex items-center gap-1.5"><span class="text-blue-400 font-bold shrink-0">CCIR:</span> <span class="truncate" title="${ccir}">${ccir}</span></div>
          <div class="flex items-center gap-1.5"><span class="text-white/60 font-bold shrink-0">MUNICÍPIO:</span> <span>${escapeHtml(l.municipio || 'Não Informado')}/${escapeHtml(l.uf || '')}</span></div>
        </div>
        ${pendencias ? `<div class="flex flex-wrap gap-1 mt-2">${pendencias}</div>` : ''}
      </div>
      <div class="flex gap-1.5 items-center mt-3 border-t border-white/5 pt-2.5">
        <button type="button" class="lp-btn-primario flex-1 justify-center btn-auditar" data-id="${l.id}"><i data-lucide="play" class="w-3.5 h-3.5"></i>Auditar &amp; Triar</button>
        ${l.status === 'ARQUIVADO' ? `<button type="button" class="lp-ico-btn btn-desarquivar-lev" data-id="${l.id}" title="Desarquivar" aria-label="Desarquivar ${nome}"><i data-lucide="lock-open"></i></button>` : ''}
        <button type="button" class="lp-ico-btn btn-editar-lev" data-id="${l.id}" title="Editar" aria-label="Editar ${nome}"><i data-lucide="edit"></i></button>
        <button type="button" class="lp-ico-btn btn-compartilhar-lev" data-id="${l.id}" title="Gerar link público" aria-label="Compartilhar ${nome}"><i data-lucide="share-2"></i></button>
        <button type="button" class="lp-ico-btn is-danger btn-excluir-lev" data-id="${l.id}" title="Excluir" aria-label="Excluir ${nome}"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`;
}).join('');
