// Peças compartilhadas do padrão de listagem (ver "Arquivos .md/PADRAO_TELA_LISTAGEM.md").

export const renderBotoesPaginacaoHtml = (paginaAtual: number, totalPaginas: number): string => {
  if (totalPaginas <= 1) return '';
  let html = `<button type="button" class="lp-pag-btn btn-page" ${paginaAtual === 1 ? 'disabled' : ''} data-page="${paginaAtual - 1}" aria-label="Página anterior">Anterior</button>`;

  for (let p = 1; p <= totalPaginas; p++) {
    if (p === 1 || p === totalPaginas || (p >= paginaAtual - 1 && p <= paginaAtual + 1)) {
      html += `<button type="button" class="lp-pag-btn btn-page ${p === paginaAtual ? 'is-active' : ''}" data-page="${p}" ${p === paginaAtual ? 'aria-current="page"' : ''}>${p}</button>`;
    } else if (p === paginaAtual - 2 || p === paginaAtual + 2) {
      html += '<span class="px-1 select-none" style="color:var(--lp-text-3)">…</span>';
    }
  }

  html += `<button type="button" class="lp-pag-btn btn-page" ${paginaAtual === totalPaginas ? 'disabled' : ''} data-page="${paginaAtual + 1}" aria-label="Próxima página">Próxima</button>`;
  return html;
};
