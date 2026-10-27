import { escapeHtml, formatarCCIR, formatarDataBr } from '../../utils';

// Lógica pura da listagem de Propriedades (padrão: "Arquivos .md/PADRAO_TELA_LISTAGEM.md").
// Sem DOM: tudo aqui é testável com `npm test`.

export interface PropriedadeCliente {
  id?: number;
  nome_completo: string;
  percentual_participacao?: number | null;
}

export interface Propriedade {
  id: number;
  nome_propriedade: string;
  codigo_car?: string | null;
  codigo_ccir?: string | null;
  municipio?: string | null;
  uf?: string | null;
  created_at?: string | null;
  total_matriculas?: number | null;
  total_levantamentos?: number | null;
  clientes?: PropriedadeCliente[] | null;
  total_participacao?: number | null;
  composicao_completa?: boolean | null;
}

export type SegmentoProp = 'todos' | 'com-lev' | 'sem-lev' | 'pendencias';
export type CampoOrdemProp = 'nome' | 'cadastro' | 'vinculos';
export type DirecaoOrdem = 'asc' | 'desc';

export interface PendenciaProp {
  codigo: 'sem-proprietario' | 'composicao' | 'sem-matricula';
  rotulo: string;
}

const semAcento = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const nomeDe = (p: Propriedade): string => p.nome_propriedade || 'Sem nome';

/** O que falta no cadastro da propriedade. Vazio = em ordem. */
export const listarPendenciasProp = (p: Propriedade): PendenciaProp[] => {
  const pendencias: PendenciaProp[] = [];
  const temClientes = !!p.clientes && p.clientes.length > 0;
  if (!temClientes) pendencias.push({ codigo: 'sem-proprietario', rotulo: 'Sem proprietário' });
  else if (p.composicao_completa === false) pendencias.push({ codigo: 'composicao', rotulo: 'Composição incompleta' });
  if (!p.total_matriculas) pendencias.push({ codigo: 'sem-matricula', rotulo: 'Sem matrícula' });
  return pendencias;
};

export const filtrarPorSegmentoProp = <T extends Propriedade>(lista: T[], segmento: SegmentoProp): T[] => {
  switch (segmento) {
    case 'com-lev': return lista.filter(p => (p.total_levantamentos || 0) > 0);
    case 'sem-lev': return lista.filter(p => !p.total_levantamentos);
    case 'pendencias': return lista.filter(p => listarPendenciasProp(p).length > 0);
    default: return lista;
  }
};

/** Contagem de cada segmento sobre a lista INTEIRA (o número do chip não muda com a busca). */
export const contarSegmentosProp = (lista: Propriedade[]): Record<SegmentoProp, number> => ({
  todos: lista.length,
  'com-lev': filtrarPorSegmentoProp(lista, 'com-lev').length,
  'sem-lev': filtrarPorSegmentoProp(lista, 'sem-lev').length,
  pendencias: filtrarPorSegmentoProp(lista, 'pendencias').length
});

/** Busca por nome, município, UF, CAR, CCIR (aceita máscara) e proprietários; ignora acento e caixa. */
export const filtrarPropriedades = <T extends Propriedade>(lista: T[], termo: string): T[] => {
  const t = semAcento((termo || '').trim());
  if (!t) return lista;
  const tDigitos = t.replace(/\D/g, '');
  return lista.filter(p => {
    const texto = semAcento([
      p.nome_propriedade, p.municipio, p.uf, p.codigo_car,
      (p.clientes || []).map(c => c.nome_completo).join(' ')
    ].map(v => v || '').join('|'));
    if (texto.includes(t)) return true;
    return tDigitos.length >= 3 && (p.codigo_ccir || '').replace(/\D/g, '').includes(tDigitos);
  });
};

/** Ordenação estável, sem mutar a entrada; empate sempre desempata por nome A-Z. */
export const ordenarPropriedades = <T extends Propriedade>(lista: T[], campo: CampoOrdemProp, direcao: DirecaoOrdem): T[] => {
  const fator = direcao === 'asc' ? 1 : -1;
  const nomes = (a: T, b: T): number => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR', { sensitivity: 'base' });
  return [...lista].sort((a, b) => {
    let r = 0;
    if (campo === 'nome') r = nomes(a, b);
    else if (campo === 'cadastro') r = (a.id || 0) - (b.id || 0); // id crescente = mais antigo
    else r = ((a.total_matriculas || 0) + (a.total_levantamentos || 0)) - ((b.total_matriculas || 0) + (b.total_levantamentos || 0));
    return r !== 0 ? r * fator : nomes(a, b);
  });
};

/** Proprietário de maior participação (empate: nome A-Z); mostra só os 2 primeiros nomes + "e mais N". */
export const resumirProprietarios = (clientes?: PropriedadeCliente[] | null): { nome: string; extras: number } | null => {
  if (!clientes || clientes.length === 0) return null;
  const principal = [...clientes].sort((a, b) => {
    const diff = (b.percentual_participacao || 0) - (a.percentual_participacao || 0);
    return diff !== 0 ? diff : (a.nome_completo || '').localeCompare(b.nome_completo || '', 'pt-BR');
  })[0];
  const nome = (principal.nome_completo || '').trim().split(/\s+/).slice(0, 2).join(' ');
  return { nome, extras: clientes.length - 1 };
};

const tagDocumento = (rotulo: string, codigo?: string | null): string =>
  codigo && codigo.trim()
    ? `<span class="lp-tag lp-tag-pf" title="${rotulo}: ${escapeHtml(rotulo === 'CCIR' ? formatarCCIR(codigo) : codigo)}">${rotulo}</span>`
    : `<span class="lp-tag lp-tag-mute" title="${rotulo} não informado" style="opacity:.55">${rotulo}</span>`;

export const renderLinhasPropHtml = (visiveis: Propriedade[], selecionadas: Set<number>): string => visiveis.map(p => {
  const isSel = selecionadas.has(p.id);
  const nome = escapeHtml(nomeDe(p));
  const local = [p.municipio, p.uf].map(v => (v || '').trim()).filter(Boolean).join(' / ');
  const resumo = resumirProprietarios(p.clientes);
  const pendencias = listarPendenciasProp(p);
  const mat = p.total_matriculas || 0;
  const lev = p.total_levantamentos || 0;

  const celulaProprietario = resumo
    ? `<div class="lp-id-txt">
         <span style="font-size:13px;font-weight:600;color:var(--lp-text)">${escapeHtml(resumo.nome)}</span>
         <span class="lp-sub">${resumo.extras > 0 ? `e mais ${resumo.extras}` : '&nbsp;'}</span>
       </div>`
    : '<span class="lp-muted" style="font-size:12.5px">Sem proprietário</span>';

  const celulaSituacao = pendencias.length
    ? pendencias.map(x => `<span class="lp-tag lp-tag-warn"><i data-lucide="alert-circle"></i>${x.rotulo}</span>`).join(' ')
    : '<span class="lp-muted" style="font-size:12px">Em ordem</span>';

  return `
    <tr class="${isSel ? 'is-sel' : ''}" data-id="${p.id}" tabindex="0" aria-label="Abrir ${nome}">
      <td class="lp-col-check">
        <input type="checkbox" data-id="${p.id}" class="check-propriedade rounded border-white/10 text-mint-vibrant bg-white/5 focus:ring-0 focus:ring-offset-0 cursor-pointer w-3.5 h-3.5" aria-label="Selecionar ${nome}" ${isSel ? 'checked' : ''} />
      </td>
      <td>
        <div class="lp-id">
          <i data-lucide="home" class="w-4 h-4 shrink-0" style="color:var(--lp-accent)"></i>
          <div class="lp-id-txt">
            <div class="lp-id-nome"><span title="${nome}">${nome}</span></div>
            <span class="lp-sub">${local ? escapeHtml(local) : '<span class="lp-muted">sem município</span>'}</span>
          </div>
        </div>
      </td>
      <td>${celulaProprietario}</td>
      <td class="lp-oculta-xl"><span class="inline-flex gap-1">${tagDocumento('CAR', p.codigo_car)}${tagDocumento('CCIR', p.codigo_ccir)}</span></td>
      <td class="lp-col-num">
        <span class="lp-vinculos">
          <span class="lp-cnt ${mat ? '' : 'is-zero'}" title="Matrículas: ${mat}"><i data-lucide="file-text"></i>${mat}</span>
          <span class="lp-cnt ${lev ? '' : 'is-zero'}" title="Levantamentos: ${lev}"><i data-lucide="map-pin"></i>${lev}</span>
        </span>
      </td>
      <td class="lp-oculta-lg"><span class="lp-mono" style="font-size:12.5px;color:var(--lp-text-2)">${escapeHtml(formatarDataBr(p.created_at))}</span></td>
      <td class="lp-oculta-sm">${celulaSituacao}</td>
      <td class="lp-col-acoes">
        <div class="lp-acoes">
          <button type="button" class="lp-ico-btn btn-action" data-action="editar" data-id="${p.id}" title="Ver e editar" aria-label="Editar ${nome}"><i data-lucide="edit"></i></button>
          <button type="button" class="lp-ico-btn is-danger btn-action" data-action="excluir" data-id="${p.id}" title="Excluir" aria-label="Excluir ${nome}"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    </tr>`;
}).join('');
