/**
 * contagem_template.ts — Marcação HTML da tela Contagem de Pontos.
 */
import { escapeHtml } from '../../utils';
import type {
  ContagemCodigo,
  ContagemConflito,
  ContagemPontos,
  ContagemProjeto,
  ContagemTipo
} from './contagem_service';

const NOMES_TIPO: Record<string, string> = { M: 'Marco', P: 'Ponto', V: 'Virtual' };
const NOMES_STATUS: Record<string, string> = {
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  ARQUIVADO: 'Arquivado'
};

const num = (n: number) => String(n).padStart(4, '0');

export const formatarFaixa = ([a, b]: [number, number]): string =>
  a === b ? num(a) : `${num(a)}–${num(b)}`;

const chipFaixas = (faixas: [number, number][], limite = 12): string => {
  if (!faixas.length) return '<span class="text-white/20">—</span>';
  const visiveis = faixas.slice(0, limite);
  const resto = faixas.length - visiveis.length;
  return (
    visiveis
      .map(f => `<span class="inline-block font-mono text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 mr-1 mb-1">${formatarFaixa(f)}</span>`)
      .join('') +
    (resto > 0 ? `<span class="text-[10px] text-white/30">+${resto} faixas</span>` : '')
  );
};

const cartaoTipo = (cod: ContagemCodigo, t: ContagemTipo): string => {
  const usado = t.total > 0;
  const aviso = t.divergencia_contador
    ? `<p class="text-[10px] text-amber-400 mt-2" title="O contador salvo no cadastro do profissional não bate com a maior numeração encontrada nos levantamentos.">
         <i data-lucide="alert-circle" class="w-3 h-3 inline -mt-0.5"></i>
         Cadastro do profissional marca ${t.contador_cadastrado ?? 0}; nos projetos o maior é ${t.maximo ?? 0}.
       </p>`
    : '';
  const isolados = t.isolados.length
    ? `<p class="text-[10px] text-white/40 mt-1">Isolado(s) fora da sequência e ignorado(s) no cálculo: ${t.isolados.map(num).join(', ')}</p>`
    : '';
  const lacunas = t.lacunas.length
    ? `<details class="mt-2">
         <summary class="text-[10px] text-white/50 cursor-pointer hover:text-mint-vibrant">${t.total_lacunas} número(s) pulado(s) na sequência</summary>
         <div class="mt-1.5">${chipFaixas(t.lacunas, 30)}</div>
       </details>`
    : '';

  return `
    <div class="glass-card p-4 flex flex-col">
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-white/40">${NOMES_TIPO[t.tipo]} (${t.tipo})</span>
        <span class="text-[10px] text-white/30">${t.total} em ${t.projetos} projeto(s)</span>
      </div>
      <p class="text-[10px] text-white/40 mt-3">Próximo disponível</p>
      <div class="flex items-center gap-2">
        <span class="font-mono text-lg font-bold text-mint-vibrant" data-teste="proximo-${escapeHtml(cod.codigo)}-${t.tipo}">${escapeHtml(t.proximo_nome)}</span>
        <button type="button" class="btn-copiar-ponto text-white/40 hover:text-mint-vibrant p-1" data-copiar="${escapeHtml(t.proximo_nome)}" title="Copiar nome">
          <i data-lucide="copy" class="w-4 h-4"></i>
        </button>
      </div>
      ${usado ? `<p class="text-[10px] text-white/40 mt-1">Usados de ${num(t.minimo ?? 0)} a ${num(t.maximo ?? 0)}</p>` : '<p class="text-[10px] text-white/40 mt-1">Nenhum ponto usado ainda.</p>'}
      ${isolados}
      ${aviso}
      ${lacunas}
    </div>`;
};

const blocoCodigoMeu = (cod: ContagemCodigo): string => `
  <section class="space-y-3">
    <div class="flex items-baseline gap-3">
      <h3 class="font-mono text-base font-bold text-white">${escapeHtml(cod.codigo)}</h3>
      <span class="text-xs text-white/40">${escapeHtml(cod.profissional ?? '')}</span>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      ${(['M', 'P', 'V'] as const).map(t => cod.tipos[t] ? cartaoTipo(cod, cod.tipos[t]) : '').join('')}
    </div>
  </section>`;

const blocoConflitos = (conflitos: ContagemConflito[], projetos: ContagemProjeto[]): string => {
  if (!conflitos.length) return '';
  const nomeDe = (id: number) => {
    const p = projetos.find(x => x.levantamento_id === id);
    return `#${id}${p ? ' ' + escapeHtml(p.propriedade) : ''}`;
  };
  return `
    <div class="glass-card p-4 border border-amber-400/30">
      <h4 class="text-sm font-bold text-amber-400 mb-1"><i data-lucide="alert-circle" class="w-4 h-4 inline -mt-0.5"></i> Números usados em mais de um projeto</h4>
      <p class="text-[11px] text-white/40 mb-3">Normal quando o vértice físico é o mesmo (divisa compartilhada). Se forem pontos diferentes, renumere um deles.</p>
      <div class="space-y-1">
        ${conflitos.map(c => `
          <div class="text-xs"><span class="font-mono text-white">${escapeHtml(c.nome)}</span>
            <span class="text-white/40"> — ${c.levantamentos.map(nomeDe).join(' · ')}</span></div>`).join('')}
      </div>
    </div>`;
};

export const renderLinhasProjetos = (
  projetos: ContagemProjeto[],
  opcoes: { termo: string; incluirTerceiros: boolean; somenteComPontos: boolean }
): string => {
  const termo = opcoes.termo.trim().toLowerCase();
  const linhas = projetos
    .map(p => ({
      p,
      itens: p.itens.filter(i => opcoes.incluirTerceiros || i.meu)
    }))
    .filter(({ p, itens }) => {
      if (opcoes.somenteComPontos && itens.length === 0) return false;
      if (!termo) return true;
      return (
        p.propriedade?.toLowerCase().includes(termo) ||
        String(p.levantamento_id) === termo ||
        itens.some(i => `${i.codigo}-${i.tipo}`.toLowerCase().includes(termo))
      );
    });

  if (!linhas.length) {
    return '<tr><td colspan="4" class="p-8 text-center text-white/20">Nenhum projeto encontrado com esses filtros.</td></tr>';
  }

  return linhas
    .map(({ p, itens }) => `
      <tr class="border-t border-white/5 align-top hover:bg-white/[0.02]">
        <td class="p-3">
          <div class="text-sm font-semibold text-white">${escapeHtml(p.propriedade)}</div>
          <div class="text-[10px] text-white/40">#${p.levantamento_id} · ${escapeHtml(p.municipio ?? '')}/${escapeHtml(p.uf ?? '')} · ${escapeHtml(NOMES_STATUS[p.status] ?? p.status)}</div>
        </td>
        <td class="p-3">
          ${itens.length ? itens.map(i => `
            <div class="mb-1.5">
              <span class="font-mono text-[10px] ${i.meu ? 'text-mint-vibrant' : 'text-white/40'} mr-1">${escapeHtml(i.codigo)}-${i.tipo}</span>
              <span class="text-[10px] text-white/30 mr-1">(${i.quantidade})</span>
              ${chipFaixas(i.faixas)}
            </div>`).join('') : '<span class="text-white/20 text-xs">Sem pontos no padrão</span>'}
        </td>
        <td class="p-3 text-xs text-white/60 text-right">${p.total_pontos}</td>
        <td class="p-3 text-xs text-right ${p.fora_do_padrao ? 'text-white/60' : 'text-white/20'}" title="Pontos com nomes que não seguem CODIGO-TIPO-NNNN (ex.: estrada1, divisa2)">${p.fora_do_padrao}</td>
      </tr>`)
    .join('');
};

export function renderContagemTemplate(): string {
  return `
    <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-2xl font-bold text-white">Contagem de Pontos</h2>
          <p class="text-white/40 text-sm mt-1">Qual numeração cada projeto está usando e qual o próximo ponto livre.</p>
        </div>
        <button type="button" id="btn-recarregar-contagem" class="btn-secondary text-sm flex items-center gap-2">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i> Atualizar
        </button>
      </div>
      <div id="contagem-conteudo">
        <div class="p-12 text-center text-white/20">Calculando contagem...</div>
      </div>
    </div>`;
}

export function renderContagemConteudo(dados: ContagemPontos): string {
  const meus = dados.codigos.filter(c => c.meu);
  const terceiros = dados.codigos.filter(c => !c.meu);

  const tabelaTerceiros = terceiros.length
    ? `<details class="glass-card">
         <summary class="p-4 cursor-pointer text-sm font-bold text-white/70 hover:text-mint-vibrant">Códigos de terceiros / vizinhos (${terceiros.length})</summary>
         <div class="overflow-x-auto">
           <table class="w-full text-left">
             <thead class="text-[10px] uppercase tracking-wider text-white/40">
               <tr><th class="p-3">Código</th><th class="p-3">Tipo</th><th class="p-3">Faixas usadas</th><th class="p-3 text-right">Pontos</th></tr>
             </thead>
             <tbody>
               ${terceiros.flatMap(c => Object.values(c.tipos).map(t => `
                 <tr class="border-t border-white/5 align-top">
                   <td class="p-3 font-mono text-xs text-white">${escapeHtml(c.codigo)}</td>
                   <td class="p-3 text-xs text-white/60">${t.tipo}</td>
                   <td class="p-3">${chipFaixas(t.faixas, 8)}</td>
                   <td class="p-3 text-xs text-white/60 text-right">${t.total}</td>
                 </tr>`)).join('')}
             </tbody>
           </table>
         </div>
       </details>`
    : '';

  return `
    <div class="space-y-6">
      ${meus.length ? meus.map(blocoCodigoMeu).join('') : `
        <div class="glass-card p-6 text-sm text-white/50">
          Nenhum profissional com código de credenciado cadastrado. Cadastre em Configurações para ver o próximo ponto disponível.
        </div>`}

      ${blocoConflitos(dados.conflitos, dados.projetos)}

      <div class="glass-card overflow-hidden">
        <div class="p-4 border-b border-white/5 bg-white/[0.02] flex flex-wrap gap-3 items-center justify-between">
          <h4 class="font-bold text-sm">Pontos por projeto</h4>
          <div class="flex flex-wrap gap-4 items-center">
            <label class="flex items-center gap-1.5 text-[11px] text-white/50 cursor-pointer">
              <input type="checkbox" id="filtro-somente-com-pontos" checked> Só projetos com meus pontos
            </label>
            <label class="flex items-center gap-1.5 text-[11px] text-white/50 cursor-pointer">
              <input type="checkbox" id="filtro-incluir-terceiros"> Mostrar códigos de terceiros
            </label>
            <input type="search" id="filtro-projeto" placeholder="Buscar projeto ou código..." class="glass-input text-xs w-56">
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="text-[10px] uppercase tracking-wider text-white/40">
              <tr>
                <th class="p-3">Projeto</th>
                <th class="p-3">Numeração usada</th>
                <th class="p-3 text-right">Total de pontos</th>
                <th class="p-3 text-right">Fora do padrão</th>
              </tr>
            </thead>
            <tbody id="contagem-linhas-projetos"></tbody>
          </table>
        </div>
      </div>

      ${tabelaTerceiros}
    </div>`;
}
