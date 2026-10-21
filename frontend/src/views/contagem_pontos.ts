/**
 * views/contagem_pontos.ts — Controller da aba Contagem de Pontos.
 */
import type { RouteDef } from '../types';
import { initIcons, showToast, escapeHtml } from '../utils';
import { fetchContagemPontos, type ContagemPontos } from './contagem_pontos/contagem_service';
import {
  renderContagemTemplate,
  renderContagemConteudo,
  renderLinhasProjetos,
  renderLinhasTerceiros,
  renderPainelLacunas
} from './contagem_pontos/contagem_template';
import {
  filtrarProjetos,
  ordenarLinhasProjeto,
  linhasTerceiros,
  type CampoOrdemProjeto,
  type DirecaoOrdem
} from './contagem_pontos/contagem_helpers';

let dados: ContagemPontos | null = null;
let atalhoBuscaContagem: ((e: KeyboardEvent) => void) | null = null;

// Estado dos filtros: sobrevive ao "Atualizar" (a tela é redesenhada, o que o usuário escolheu não)
let aba: 'projetos' | 'terceiros' = 'projetos';
let somenteComPontos = true;
let incluirTerceiros = false;
let termo = '';
let campoOrdem: CampoOrdemProjeto = 'nome';
let direcaoOrdem: DirecaoOrdem = 'asc';

const copiarTexto = async (texto: string) => {
  try {
    await navigator.clipboard.writeText(texto);
    showToast(`${texto} copiado!`, 'success');
  } catch {
    showToast('Não foi possível copiar automaticamente.', 'error');
  }
};

const atualizarTabelas = () => {
  if (!dados) return;
  const tbody = document.getElementById('contagem-linhas-projetos');
  const tbodyTerc = document.getElementById('contagem-linhas-terceiros');
  const info = document.getElementById('contagem-info');

  // Abas e filtros: só fazem sentido na aba de projetos
  document.getElementById('wrap-projetos')?.classList.toggle('hidden', aba !== 'projetos');
  document.getElementById('wrap-terceiros')?.classList.toggle('hidden', aba !== 'terceiros');
  document.getElementById('filtros-projetos')?.classList.toggle('hidden', aba !== 'projetos');
  document.querySelectorAll<HTMLElement>('#seg-contagem [data-aba]').forEach(btn => {
    const ativo = btn.dataset.aba === aba;
    btn.classList.toggle('is-active', ativo);
    btn.setAttribute('aria-pressed', String(ativo));
  });
  document.querySelectorAll<HTMLElement>('#wrap-projetos th[data-ordem]').forEach(th => {
    if (th.dataset.ordem === campoOrdem) th.setAttribute('aria-sort', direcaoOrdem === 'asc' ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  });
  for (const [id, ativo] of [['filtro-somente-com-pontos', somenteComPontos], ['filtro-incluir-terceiros', incluirTerceiros]] as const) {
    const btn = document.getElementById(id);
    btn?.classList.toggle('is-active', ativo);
    btn?.setAttribute('aria-pressed', String(ativo));
  }

  if (aba === 'terceiros') {
    const linhas = linhasTerceiros(dados.codigos, termo);
    if (tbodyTerc) tbodyTerc.innerHTML = renderLinhasTerceiros(linhas);
    if (info) info.innerText = `Mostrando ${linhas.length} código(s) de terceiros`;
  } else {
    const linhas = ordenarLinhasProjeto(
      filtrarProjetos(dados.projetos, { termo, incluirTerceiros, somenteComPontos }),
      campoOrdem,
      direcaoOrdem
    );
    if (tbody) tbody.innerHTML = renderLinhasProjetos(linhas);
    if (info) info.innerText = `Mostrando ${linhas.length} de ${dados.projetos.length} projeto(s)`;
  }
  initIcons();
};

const fecharLacunas = () => {
  document.getElementById('contagem-lacunas')?.classList.add('hidden');
  document.querySelectorAll('.btn-lacunas').forEach(b => b.setAttribute('aria-expanded', 'false'));
};

const configurarEventos = (container: HTMLElement) => {
  // Copiar o próximo ponto
  container.querySelectorAll<HTMLElement>('.btn-copiar-ponto').forEach(btn =>
    btn.addEventListener('click', () => copiarTexto(btn.dataset.copiar ?? ''))
  );

  // Painel de números pulados (um por vez; clicar de novo no mesmo botão fecha)
  const painel = document.getElementById('contagem-lacunas');
  container.querySelectorAll<HTMLElement>('.btn-lacunas').forEach(btn =>
    btn.addEventListener('click', () => {
      const jaAberto = btn.getAttribute('aria-expanded') === 'true';
      fecharLacunas();
      if (jaAberto || !painel || !dados) return;
      const cod = dados.codigos.find(c => c.codigo === btn.dataset.codigo);
      const t = cod?.tipos[btn.dataset.tipo ?? ''];
      if (!cod || !t) return;
      painel.innerHTML = renderPainelLacunas(cod, t);
      painel.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
      document.getElementById('btn-fechar-lacunas')?.addEventListener('click', fecharLacunas);
      initIcons();
    })
  );

  // Abas Projetos / Terceiros
  document.getElementById('seg-contagem')?.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-aba]');
    if (!btn) return;
    aba = btn.dataset.aba === 'terceiros' ? 'terceiros' : 'projetos';
    atualizarTabelas();
  });

  // Filtros (botões liga/desliga)
  document.getElementById('filtro-somente-com-pontos')?.addEventListener('click', () => { somenteComPontos = !somenteComPontos; atualizarTabelas(); });
  document.getElementById('filtro-incluir-terceiros')?.addEventListener('click', () => { incluirTerceiros = !incluirTerceiros; atualizarTabelas(); });

  // Ordenação por cabeçalho (clique ou Enter/Espaço)
  const alternarOrdem = (th: HTMLElement) => {
    const campo = th.dataset.ordem as CampoOrdemProjeto | undefined;
    if (!campo) return;
    if (campo === campoOrdem) direcaoOrdem = direcaoOrdem === 'asc' ? 'desc' : 'asc';
    else { campoOrdem = campo; direcaoOrdem = campo === 'nome' ? 'asc' : 'desc'; }
    atualizarTabelas();
  };
  container.querySelectorAll<HTMLElement>('#wrap-projetos th[data-ordem]').forEach(th => {
    th.addEventListener('click', () => alternarOrdem(th));
    th.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarOrdem(th); }
    });
  });

  // Busca: debounce, ✕ e Esc limpam, "/" foca
  const input = document.getElementById('filtro-projeto') as HTMLInputElement | null;
  const wrap = document.getElementById('busca-wrap');
  if (input) {
    input.value = termo;
    wrap?.classList.toggle('tem-valor', termo.length > 0);
  }
  let timeout: ReturnType<typeof setTimeout>;
  input?.addEventListener('input', () => {
    wrap?.classList.toggle('tem-valor', input.value.length > 0);
    clearTimeout(timeout);
    timeout = setTimeout(() => { termo = input.value; atualizarTabelas(); }, 200);
  });
  const limparBusca = () => {
    if (!input) return;
    input.value = '';
    wrap?.classList.remove('tem-valor');
    clearTimeout(timeout);
    termo = '';
    atualizarTabelas();
  };
  document.getElementById('busca-limpar')?.addEventListener('click', () => { limparBusca(); input?.focus(); });
  input?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') { limparBusca(); input.blur(); }
  });
};

const carregar = async () => {
  const container = document.getElementById('contagem-conteudo');
  if (!container) return;
  try {
    dados = await fetchContagemPontos();
    container.innerHTML = renderContagemConteudo(dados);
    configurarEventos(container);
    atualizarTabelas();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'erro desconhecido';
    container.innerHTML = `
      <div class="lp-card"><div class="lp-estado">
        <div class="lp-estado-ico"><i data-lucide="alert-triangle"></i></div>
        <div class="lp-estado-titulo">Erro ao carregar a contagem</div>
        <div class="lp-estado-txt">${escapeHtml(msg)}</div>
        <button type="button" class="lp-btn-sec" id="btn-tentar-contagem">Tentar novamente</button>
      </div></div>`;
    document.getElementById('btn-tentar-contagem')?.addEventListener('click', carregar);
    initIcons();
  }
};

export const contagemPontosRoute: RouteDef = {
  render: () => renderContagemTemplate(),
  setup: () => {
    dados = null;
    carregar();
    document.getElementById('btn-recarregar-contagem')?.addEventListener('click', carregar);

    atalhoBuscaContagem = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
      e.preventDefault();
      document.getElementById('filtro-projeto')?.focus();
    };
    document.addEventListener('keydown', atalhoBuscaContagem);
  },
  cleanup: () => {
    if (atalhoBuscaContagem) {
      document.removeEventListener('keydown', atalhoBuscaContagem);
      atalhoBuscaContagem = null;
    }
  }
};
