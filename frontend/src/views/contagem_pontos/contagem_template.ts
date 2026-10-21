/**
 * contagem_template.ts — Marcação HTML da tela Contagem de Pontos.
 * Padrão de tela: "Arquivos .md/PADRAO_TELA_LISTAGEM.md" (barra única, viewport fixo, rolagem só na tabela).
 */
import { escapeHtml } from '../../utils';
import type { ContagemCodigo, ContagemConflito, ContagemPontos, ContagemProjeto, ContagemTipo } from './contagem_service';
import {
  formatarFaixa,
  formatarNumero4,
  descreverDivergencia,
  resumirUso,
  type LinhaProjeto,
  type LinhaTerceiro
} from './contagem_helpers';

export { formatarFaixa };

const NOMES_TIPO: Record<string, string> = { M: 'Marco', P: 'Ponto', V: 'Virtual' };
const NOMES_STATUS: Record<string, string> = {
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  ARQUIVADO: 'Arquivado'
};
const CLASSE_STATUS: Record<string, string> = {
  EM_ANDAMENTO: 'lp-tag-info',
  CONCLUIDO: 'lp-tag-pf',
  ARQUIVADO: 'lp-tag-mute'
};

const chipFaixas = (faixas: [number, number][], limite = 12): string => {
  if (!faixas.length) return '<span class="lp-muted">—</span>';
  const visiveis = faixas.slice(0, limite);
  const resto = faixas.length - visiveis.length;
  return (
    visiveis.map(f => `<span class="lp-chip">${formatarFaixa(f)}</span>`).join('') +
    (resto > 0 ? `<span class="lp-sub" style="font-size:11px">+${resto} faixas</span>` : '')
  );
};

/** Lacunas de um tipo (usadas no painel "números pulados"); o painel é preenchido pelo controller. */
export const renderPainelLacunas = (cod: ContagemCodigo, t: ContagemTipo): string => `
  <div class="flex items-center justify-between gap-2 mb-2">
    <span class="lp-tile-rotulo">${t.total_lacunas} número(s) pulado(s) — ${NOMES_TIPO[t.tipo]} (${t.tipo}) · ${escapeHtml(cod.codigo)}</span>
    <button type="button" class="lp-ico-btn" id="btn-fechar-lacunas" aria-label="Fechar"><i data-lucide="x"></i></button>
  </div>
  <div class="flex flex-wrap gap-1">${chipFaixas(t.lacunas, 80)}</div>`;

const tileTipo = (cod: ContagemCodigo, t: ContagemTipo): string => {
  const divergencia = descreverDivergencia(t);
  const isolados = t.isolados.length
    ? `<span class="lp-tag lp-tag-mute" title="Isolado(s) fora da sequência e ignorado(s) no cálculo: ${t.isolados.map(formatarNumero4).join(', ')}">${t.isolados.length} isolado(s)</span>`
    : '';
  const aviso = divergencia
    ? `<span class="lp-tag lp-tag-warn" title="${escapeHtml(divergencia)} O contador salvo no cadastro do profissional não bate com a maior numeração encontrada nos levantamentos."><i data-lucide="alert-circle"></i>Cadastro ≠ projetos</span>`
    : '';
  const lacunas = t.lacunas.length
    ? `<button type="button" class="lp-tag lp-tag-mute btn-lacunas" style="cursor:pointer" data-codigo="${escapeHtml(cod.codigo)}" data-tipo="${t.tipo}" aria-expanded="false">${t.total_lacunas} pulado(s)<i data-lucide="chevron-down"></i></button>`
    : '';

  return `
    <div class="lp-tile">
      <div class="lp-tile-topo">
        <span class="lp-tile-rotulo">${NOMES_TIPO[t.tipo]} (${t.tipo})</span>
        <span class="lp-sub" style="font-size:11.5px">${t.total} pt(s) em ${t.projetos} projeto(s)</span>
      </div>
      <div class="lp-tile-valor">
        <span class="lp-mono" data-teste="proximo-${escapeHtml(cod.codigo)}-${t.tipo}">${escapeHtml(t.proximo_nome)}</span>
        <button type="button" class="lp-ico-btn btn-copiar-ponto" data-copiar="${escapeHtml(t.proximo_nome)}" title="Copiar nome" aria-label="Copiar ${escapeHtml(t.proximo_nome)}"><i data-lucide="copy"></i></button>
      </div>
      <div class="lp-tile-rodape">
        <span class="lp-sub" style="font-size:12px">${resumirUso(t)}</span>
        ${aviso}${isolados}${lacunas}
      </div>
    </div>`;
};

const blocoCodigoMeu = (cod: ContagemCodigo): string => `
  <section class="flex flex-col gap-1.5">
    <div class="flex items-baseline gap-2.5">
      <h3 class="lp-mono" style="font-size:14px;font-weight:700;color:#fff">${escapeHtml(cod.codigo)}</h3>
      <span class="lp-sub" style="font-size:12.5px">${escapeHtml(cod.profissional ?? '')}</span>
      <span class="lp-sub" style="font-size:11.5px;margin-left:auto">Próximo disponível por tipo</span>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
      ${(['M', 'P', 'V'] as const).map(t => cod.tipos[t] ? tileTipo(cod, cod.tipos[t]) : '').join('')}
    </div>
  </section>`;

const blocoConflitos = (conflitos: ContagemConflito[], projetos: ContagemProjeto[]): string => {
  if (!conflitos.length) return '';
  const nomeDe = (id: number): string => {
    const p = projetos.find(x => x.levantamento_id === id);
    return `#${id}${p ? ' ' + escapeHtml(p.propriedade) : ''}`;
  };
  return `
    <details class="lp-aviso">
      <summary><i data-lucide="alert-circle" class="w-4 h-4"></i>${conflitos.length} número(s) usado(s) em mais de um projeto<span class="lp-sub" style="margin-left:auto;font-size:11.5px">Normal quando o vértice físico é o mesmo (divisa compartilhada)</span></summary>
      <div class="lp-aviso-corpo">
        <p class="lp-sub" style="font-size:12px;margin-bottom:6px">Se forem pontos diferentes, renumere um deles.</p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1">
          ${conflitos.map(c => `
            <div style="font-size:12.5px"><span class="lp-mono" style="color:#fff">${escapeHtml(c.nome)}</span>
              <span class="lp-sub" style="font-size:12px"> — ${c.levantamentos.map(nomeDe).join(' · ')}</span></div>`).join('')}
        </div>
      </div>
    </details>`;
};

export const renderLinhasProjetos = (linhas: LinhaProjeto[]): string => {
  if (!linhas.length) {
    return `<tr><td colspan="4" style="height:auto"><div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="search"></i></div><div class="lp-estado-titulo">Nenhum projeto encontrado</div><div class="lp-estado-txt">Nada corresponde à busca ou aos filtros aplicados.</div></div></td></tr>`;
  }
  return linhas.map(({ p, itens }) => `
    <tr>
      <td>
        <div class="lp-id-txt">
          <div class="lp-id-nome"><span title="${escapeHtml(p.propriedade)}">${escapeHtml(p.propriedade)}</span><span class="lp-tag ${CLASSE_STATUS[p.status] ?? 'lp-tag-mute'}">${escapeHtml(NOMES_STATUS[p.status] ?? p.status)}</span></div>
          <span class="lp-sub">#${p.levantamento_id}${p.municipio ? ` · ${escapeHtml(p.municipio)}/${escapeHtml(p.uf ?? '')}` : ''}</span>
        </div>
      </td>
      <td>
        ${itens.length ? itens.map(i => `
          <div class="flex flex-wrap items-center gap-1" style="padding:2px 0">
            <span class="lp-mono" style="font-size:12px;font-weight:600;color:${i.meu ? 'var(--lp-accent)' : 'var(--lp-text-3)'}">${escapeHtml(i.codigo)}-${i.tipo}</span>
            <span class="lp-sub" style="font-size:11.5px">(${i.quantidade})</span>
            ${chipFaixas(i.faixas)}
          </div>`).join('') : '<span class="lp-muted" style="font-size:12.5px">Sem pontos no padrão</span>'}
      </td>
      <td class="lp-col-num"><span class="lp-mono" style="font-size:13px">${p.total_pontos}</span></td>
      <td class="lp-col-num lp-oculta-sm">${p.fora_do_padrao
        ? `<span class="lp-tag lp-tag-warn" title="Pontos com nomes que não seguem CODIGO-TIPO-NNNN (ex.: estrada1, divisa2)">${p.fora_do_padrao}</span>`
        : '<span class="lp-muted">—</span>'}</td>
    </tr>`).join('');
};

export const renderLinhasTerceiros = (linhas: LinhaTerceiro[]): string => {
  if (!linhas.length) {
    return `<tr><td colspan="4" style="height:auto"><div class="lp-estado"><div class="lp-estado-titulo">Nenhum código de terceiros</div><div class="lp-estado-txt">Nada corresponde à busca.</div></div></td></tr>`;
  }
  return linhas.map(l => `
    <tr>
      <td><span class="lp-mono" style="font-weight:600;color:#fff">${escapeHtml(l.codigo)}</span></td>
      <td><span class="lp-tag lp-tag-mute">${NOMES_TIPO[l.tipo] ?? l.tipo} (${l.tipo})</span></td>
      <td><div class="flex flex-wrap items-center gap-1">${chipFaixas(l.faixas, 8)}</div></td>
      <td class="lp-col-num"><span class="lp-mono" style="font-size:13px">${l.total}</span></td>
    </tr>`).join('');
};

export function renderContagemTemplate(): string {
  return `
    <div class="gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full min-h-0 flex-1">
      <!-- Barra superior (padrão de listagem): título + contexto + ação -->
      <div class="lp-bar">
        <div class="lp-bar-left">
          <h2 class="lp-titulo">Contagem de Pontos</h2>
          <span class="lp-sub lp-oculta-sm" style="font-size:12.5px">Qual numeração cada projeto usa e qual o próximo ponto livre</span>
        </div>
        <div class="lp-bar-right">
          <button type="button" class="lp-btn-sec" id="btn-recarregar-contagem">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            Atualizar
          </button>
        </div>
      </div>
      <div id="contagem-conteudo" class="flex flex-col gap-2 flex-1 min-h-0">
        <div class="lp-card"><div class="lp-skel"></div><div class="lp-skel"></div><div class="lp-skel"></div></div>
      </div>
    </div>`;
}

export function renderContagemConteudo(dados: ContagemPontos): string {
  const meus = dados.codigos.filter(c => c.meu);
  const terceiros = dados.codigos.filter(c => !c.meu);
  const totalTerceiros = terceiros.reduce((acc, c) => acc + Object.keys(c.tipos).length, 0);

  return `
    ${meus.length ? meus.map(blocoCodigoMeu).join('') : `
      <div class="lp-aviso" style="padding:10px 14px;font-size:13px;color:var(--lp-text-2)">
        Nenhum profissional com código de credenciado cadastrado. Cadastre em Configurações para ver o próximo ponto disponível.
      </div>`}

    <div id="contagem-lacunas" class="lp-painel hidden" role="region" aria-live="polite"></div>

    ${blocoConflitos(dados.conflitos, dados.projetos)}

    <div class="lp-card">
      <div class="lp-card-barra">
        <div class="lp-seg" id="seg-contagem" role="group" aria-label="Alternar tabela">
          <button type="button" class="lp-seg-btn is-active" data-aba="projetos" aria-pressed="true">Projetos <span class="lp-seg-n" id="seg-n-projetos">${dados.projetos.length}</span></button>
          ${terceiros.length ? `<button type="button" class="lp-seg-btn" data-aba="terceiros" aria-pressed="false">Terceiros / vizinhos <span class="lp-seg-n">${totalTerceiros}</span></button>` : ''}
        </div>
        <div class="flex flex-wrap items-center gap-2 ml-auto">
          <div class="lp-seg" id="filtros-projetos" role="group" aria-label="Filtros dos projetos">
            <button type="button" class="lp-seg-btn is-active" id="filtro-somente-com-pontos" aria-pressed="true" title="Esconde projetos sem pontos do seu código">Só projetos com meus pontos</button>
            <button type="button" class="lp-seg-btn" id="filtro-incluir-terceiros" aria-pressed="false" title="Mostra também a numeração de outros códigos dentro de cada projeto">Mostrar códigos de terceiros</button>
          </div>
          <label class="lp-busca" id="busca-wrap" style="width:clamp(160px,16vw,260px)">
            <i data-lucide="search"></i>
            <input type="text" id="filtro-projeto" placeholder="Buscar projeto ou código" autocomplete="off" aria-label="Buscar projeto ou código" />
            <span class="lp-busca-fim">
              <button type="button" class="lp-busca-limpar" id="busca-limpar" aria-label="Limpar busca"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
              <kbd class="lp-kbd" title="Atalho: pressione / para buscar">/</kbd>
            </span>
          </label>
        </div>
      </div>

      <div class="lp-wrap overflow-x-auto overflow-y-auto flex-1 min-h-0" id="wrap-projetos">
        <table class="lp-tabela is-static">
          <thead>
            <tr>
              <th class="lp-ordenavel" data-ordem="nome" aria-sort="ascending" tabindex="0">Projeto<span class="lp-sort-ico"></span></th>
              <th>Numeração usada</th>
              <th class="lp-ordenavel lp-col-num" data-ordem="pontos" tabindex="0">Pontos<span class="lp-sort-ico"></span></th>
              <th class="lp-ordenavel lp-col-num lp-oculta-sm" data-ordem="fora" tabindex="0" title="Pontos com nomes fora do padrão CODIGO-TIPO-NNNN">Fora do padrão<span class="lp-sort-ico"></span></th>
            </tr>
          </thead>
          <tbody id="contagem-linhas-projetos"></tbody>
        </table>
      </div>

      <div class="lp-wrap overflow-x-auto overflow-y-auto flex-1 min-h-0 hidden" id="wrap-terceiros">
        <table class="lp-tabela is-static">
          <thead>
            <tr><th>Código</th><th>Tipo</th><th>Faixas usadas</th><th class="lp-col-num">Pontos</th></tr>
          </thead>
          <tbody id="contagem-linhas-terceiros"></tbody>
        </table>
      </div>

      <div class="lp-rodape">
        <span id="contagem-info">Mostrando 0 de ${dados.projetos.length} projeto(s)</span>
      </div>
    </div>`;
}
