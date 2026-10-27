import { escapeHtml, formatarDataBr } from '../../utils';

// Lógica pura da Agenda de Pendências (padrão: "Arquivos .md/PADRAO_TELA_LISTAGEM.md"). Sem DOM: testável com `npm test`.

export type Prioridade = 'BAIXA' | 'MEDIA' | 'ALTA';

export interface Pendencia {
  id: number;
  titulo: string;
  descricao?: string | null;
  status: string;
  prioridade: string;
  data_criacao?: string | null;
}

export type SegmentoPend = 'abertas' | 'alta' | 'concluidas' | 'todas';
export type CampoOrdemPend = 'prioridade' | 'data' | 'titulo';
export type DirecaoOrdem = 'asc' | 'desc';

const PESO: Record<string, number> = { BAIXA: 1, MEDIA: 2, ALTA: 3 };

const semAcento = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const estaConcluida = (p: Pendencia): boolean => p.status === 'CONCLUIDO';

export const filtrarPorSegmentoPend = <T extends Pendencia>(lista: T[], segmento: SegmentoPend): T[] => {
  switch (segmento) {
    case 'abertas': return lista.filter(p => !estaConcluida(p));
    case 'alta': return lista.filter(p => !estaConcluida(p) && p.prioridade === 'ALTA');
    case 'concluidas': return lista.filter(estaConcluida);
    default: return lista;
  }
};

/** Contagem de cada segmento sobre a lista INTEIRA (o número do chip não muda com a busca). */
export const contarSegmentosPend = (lista: Pendencia[]): Record<SegmentoPend, number> => ({
  abertas: filtrarPorSegmentoPend(lista, 'abertas').length,
  alta: filtrarPorSegmentoPend(lista, 'alta').length,
  concluidas: filtrarPorSegmentoPend(lista, 'concluidas').length,
  todas: lista.length
});

export const filtrarPendencias = <T extends Pendencia>(lista: T[], termo: string): T[] => {
  const t = semAcento((termo || '').trim());
  if (!t) return lista;
  return lista.filter(p => semAcento(`${p.titulo || ''}|${p.descricao || ''}`).includes(t));
};

/**
 * Ordenação estável, sem mutar a entrada. Concluídas ficam SEMPRE depois das abertas (na visão "Todas");
 * dentro de cada grupo vale o campo escolhido; empate desempata pela criação mais recente.
 */
export const ordenarPendencias = <T extends Pendencia>(lista: T[], campo: CampoOrdemPend, direcao: DirecaoOrdem): T[] => {
  const fator = direcao === 'asc' ? 1 : -1;
  const recentes = (a: T, b: T): number => (b.data_criacao || '').localeCompare(a.data_criacao || '') || b.id - a.id;
  return [...lista].sort((a, b) => {
    const grupo = Number(estaConcluida(a)) - Number(estaConcluida(b));
    if (grupo !== 0) return grupo;
    let r = 0;
    if (campo === 'prioridade') r = (PESO[a.prioridade] || 0) - (PESO[b.prioridade] || 0);
    else if (campo === 'data') r = (a.data_criacao || '').localeCompare(b.data_criacao || '');
    else r = (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR', { sensitivity: 'base' });
    return r !== 0 ? r * fator : recentes(a, b);
  });
};

const ROTULO_PRIORIDADE: Record<string, string> = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta' };
const CLASSE_PRIORIDADE: Record<string, string> = { BAIXA: 'lp-tag-mute', MEDIA: 'lp-tag-info', ALTA: 'lp-tag-danger' };

export const renderLinhasPendencias = (lista: Pendencia[]): string => lista.map(p => {
  const feita = estaConcluida(p);
  const titulo = escapeHtml(p.titulo);
  return `
    <tr data-id="${p.id}">
      <td class="lp-col-check" style="width:52px">
        ${feita
          ? `<span class="lp-ico-btn" style="color:var(--lp-accent);cursor:default" title="Concluída" aria-label="Concluída"><i data-lucide="check-circle-2"></i></span>`
          : `<button type="button" class="lp-ico-btn btn-concluir" data-id="${p.id}" title="Marcar como concluída" aria-label="Concluir ${titulo}"><i data-lucide="check"></i></button>`}
      </td>
      <td>
        <div class="lp-id-txt">
          <div class="lp-id-nome" style="${feita ? 'color:var(--lp-text-3);text-decoration:line-through' : ''}"><span title="${titulo}">${titulo}</span></div>
          <span class="lp-sub" title="${escapeHtml(p.descricao || '')}">${p.descricao ? escapeHtml(p.descricao) : '<span class="lp-muted">Sem descrição</span>'}</span>
        </div>
      </td>
      <td class="lp-oculta-sm"><span class="lp-tag ${feita ? 'lp-tag-mute' : (CLASSE_PRIORIDADE[p.prioridade] || 'lp-tag-mute')}">${ROTULO_PRIORIDADE[p.prioridade] || escapeHtml(p.prioridade)}</span></td>
      <td class="lp-oculta-md"><span class="lp-mono" style="font-size:12.5px;color:var(--lp-text-2)">${escapeHtml(formatarDataBr(p.data_criacao))}</span></td>
      <td class="lp-col-acoes" style="width:64px">
        <div class="lp-acoes">
          <button type="button" class="lp-ico-btn is-danger btn-excluir" data-id="${p.id}" title="Excluir" aria-label="Excluir ${titulo}"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    </tr>`;
}).join('');
