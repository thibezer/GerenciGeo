/**
 * views/contagem_pontos.ts — Controller da aba Contagem de Pontos.
 */
import type { RouteDef } from '../types';
import { initIcons, showToast } from '../utils';
import { fetchContagemPontos, type ContagemPontos } from './contagem_pontos/contagem_service';
import {
  renderContagemTemplate,
  renderContagemConteudo,
  renderLinhasProjetos
} from './contagem_pontos/contagem_template';

let dados: ContagemPontos | null = null;

const atualizarLinhasProjetos = () => {
  const tbody = document.getElementById('contagem-linhas-projetos');
  if (!tbody || !dados) return;
  tbody.innerHTML = renderLinhasProjetos(dados.projetos, {
    termo: (document.getElementById('filtro-projeto') as any)?.value ?? '',
    incluirTerceiros: (document.getElementById('filtro-incluir-terceiros') as HTMLInputElement | null)?.checked ?? false,
    somenteComPontos: (document.getElementById('filtro-somente-com-pontos') as HTMLInputElement | null)?.checked ?? true
  });
};

const copiarTexto = async (texto: string) => {
  try {
    await navigator.clipboard.writeText(texto);
    showToast(`${texto} copiado!`, 'success');
  } catch {
    showToast('Não foi possível copiar automaticamente.', 'error');
  }
};

const carregar = async () => {
  const container = document.getElementById('contagem-conteudo');
  if (!container) return;
  try {
    dados = await fetchContagemPontos();
    container.innerHTML = renderContagemConteudo(dados);
    atualizarLinhasProjetos();
    initIcons();

    container.querySelectorAll<HTMLElement>('.btn-copiar-ponto').forEach(btn =>
      btn.addEventListener('click', () => copiarTexto(btn.dataset.copiar ?? ''))
    );
    ['filtro-projeto', 'filtro-incluir-terceiros', 'filtro-somente-com-pontos'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', atualizarLinhasProjetos);
      el?.addEventListener('ui-input', atualizarLinhasProjetos);
      el?.addEventListener('change', atualizarLinhasProjetos);
    });
  } catch (err: any) {
    container.innerHTML = `<div class="p-12 text-center text-red-400">Erro ao carregar a contagem: ${err.message}</div>`;
  }
};

export const contagemPontosRoute: RouteDef = {
  render: () => renderContagemTemplate(),
  setup: () => {
    dados = null;
    carregar();
    document.getElementById('btn-recarregar-contagem')?.addEventListener('click', carregar);
  }
};
