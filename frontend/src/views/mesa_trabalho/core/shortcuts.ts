import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function inicializarAtalhosTeclado(
  ctx: MesaTrabalhoContext,
  confirmarExclusaoPonto: (pId: number) => Promise<void>
): () => void {
  const isInputFocado = (): boolean => {
    const activeEl = document.activeElement;
    if (!activeEl) return false;
    const tag = activeEl.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (activeEl.getAttribute('contenteditable') === 'true') return true;
    return false;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // 1. Tecla F2: Foco imediato na busca de vértices
    if (e.key === 'F2') {
      e.preventDefault();
      const searchInput = document.getElementById('input-search-ponto') as HTMLInputElement | null;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // 2. Tecla F4: Alternar recolher/expandir o Painel de Propriedades lateral
    if (e.key === 'F4') {
      e.preventDefault();
      const btnToggleProps = document.getElementById('btn-toggle-props');
      if (btnToggleProps) {
        btnToggleProps.click();
      }
      return;
    }

    // 3. Tecla Escape: Fechar modais / limpar seleções ativas
    if (e.key === 'Escape') {
      let modalFechado = false;

      // Fecha modal de ingestão se aberto
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      if (containerIngestao && !containerIngestao.classList.contains('hidden')) {
        ctx.colapsarIngestao?.();
        modalFechado = true;
      }

      // Fecha modal de filtro Revit se aberto
      const modalFiltro = document.getElementById('modal-filtro-revit-mesa');
      if (modalFiltro && !modalFiltro.classList.contains('hidden')) {
        modalFiltro.classList.add('hidden');
        modalFechado = true;
      }

      if (modalFechado) {
        e.preventDefault();
        return;
      }

      // Se não havia modal aberto, limpa seleções ativas de vértices e segmentos
      if (ctx.selectedPontoIds.length > 0 || ctx.selectedVizinhoPontoIds.length > 0 || ctx.selectedSegmentoId !== null) {
        e.preventDefault();
        ctx.selectedPontoIds = [];
        ctx.selectedVizinhoPontoIds = [];
        ctx.lastSelectedPontoId = null;
        ctx.selectedSegmentoId = null;
        ctx.selectedSegmento = null;
        if (ctx.mapaController && typeof ctx.mapaController.selectSegmento === 'function') {
          ctx.mapaController.selectSegmento(null);
        }
        ctx.atualizarDestaqueLinhasTabela();
        ctx.atualizarPainelPropriedades?.();
      }
      return;
    }

    // Se estiver digitando em campos de texto, não dispara atalhos de navegação e exclusão
    if (isInputFocado()) {
      return;
    }

    // 4. Tecla Delete: Excluir vértice(s) selecionado(s)
    if (e.key === 'Delete' || e.key === 'Del') {
      if (ctx.selectedPontoIds.length > 0) {
        e.preventDefault();
        confirmarExclusaoPonto(ctx.selectedPontoIds[0]);
      }
      return;
    }

    // 5. Teclas 1 a 4: Alternância rápida de abas da Mesa de Trabalho
    if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      if (e.key === '1') {
        e.preventDefault();
        ctx.alternarEtapa('geoprocessamento');
      } else if (e.key === '2') {
        e.preventDefault();
        ctx.alternarEtapa('cartorio');
      } else if (e.key === '3') {
        e.preventDefault();
        ctx.alternarEtapa('documentos');
      } else if (e.key === '4') {
        e.preventDefault();
        ctx.alternarEtapa('auditoria');
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}
