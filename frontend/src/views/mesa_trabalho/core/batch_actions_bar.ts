import { API_BASE } from '../../../config';
import { customAlert, customConfirm, showToast } from '../../../utils';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function inicializarBarraAcoesLote(
  ctx: MesaTrabalhoContext,
  confirmarExclusaoPonto: (pId: number) => Promise<void>
): () => void {
  const cleanups: Array<() => void> = [];

  const addListener = (elId: string, event: string, handler: EventListener) => {
    const el = document.getElementById(elId);
    if (el) {
      el.addEventListener(event, handler);
      cleanups.push(() => el.removeEventListener(event, handler));
    }
  };

  // Cancelar seleção em lote
  const limparSelecao = () => {
    ctx.selectedPontoIds = [];
    ctx.selectedVizinhoPontoIds = [];
    ctx.lastSelectedPontoId = null;
    ctx.atualizarDestaqueLinhasTabela();
  };

  addListener('btn-batch-cancel-mesa', 'click', limparSelecao);
  addListener('btn-batch-limpar', 'click', limparSelecao);

  // Excluir em lote
  const handleDelete = () => {
    if (ctx.selectedPontoIds.length > 0) {
      confirmarExclusaoPonto(ctx.selectedPontoIds[0]);
    }
  };
  addListener('btn-batch-delete-mesa', 'click', handleDelete);
  addListener('btn-batch-deletar', 'click', handleDelete);

  // Alternar ignorar/participar no polígono em lote
  addListener('btn-batch-ignorar', 'click', async () => {
    if (ctx.currentLevantamento?.status === 'ARQUIVADO') {
      await customAlert('Este projeto está ARQUIVADO e não pode ser modificado (Modo Somente Leitura).');
      return;
    }

    const totalSelecionados = ctx.selectedPontoIds.length;
    if (totalSelecionados === 0) return;

    const pontosSel = ctx.pontosList.filter(p => ctx.selectedPontoIds.includes(p.id));
    if (pontosSel.length === 0) return;

    const temPontoAtivo = pontosSel.some(p => p.ignorar_poligono !== 1);
    const novoEstado = temPontoAtivo ? 1 : 0;

    if (!await customConfirm(`Deseja alterar a participação no polígono de ${totalSelecionados} vértice(s) para: "${novoEstado === 1 ? 'Ignorar' : 'Participar'}"?`)) return;

    showToast('Atualizando vértices em lote...', 'info');

    try {
      const promessas = ctx.selectedPontoIds.map(id =>
        fetch(`${API_BASE}/pontos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ignorar_poligono: novoEstado })
        }).then(async r => {
          if (r.status === 403) return { error: 'Acesso negado (projeto arquivado).' };
          if (!r.ok) {
            const txt = await r.json().catch(() => ({ error: 'Erro desconhecido' }));
            return { error: txt.detail || txt.error || 'Falha na requisição' };
          }
          return r.json().catch(() => ({}));
        })
      );

      const resultados = await Promise.all(promessas);
      const erros = resultados.filter(r => r.error).map(r => r.error);

      if (erros.length > 0) {
        await customAlert(`Ocorreram alguns erros ao tentar atualizar em lote:\n${erros.slice(0, 5).join('\n')}`);
      } else {
        showToast(`${totalSelecionados} vértice(s) atualizado(s) com sucesso!`, 'success');
      }

      await ctx.loadLevantamentoDetails();
    } catch (err) {
      console.error('Erro ao alternar polígono em lote:', err);
      showToast('Erro ao tentar atualizar os pontos selecionados em lote.', 'error');
    }
  });

  // Integrar pontos vizinhos em lote
  addListener('btn-batch-integrate-mesa', 'click', async () => {
    const totalVizinhos = ctx.selectedVizinhoPontoIds.length;
    if (totalVizinhos === 0) return;

    if (!await customConfirm(`Deseja integrar os ${totalVizinhos} pontos vizinhos selecionados ao levantamento da matrícula atual?`)) return;

    const matriculaIdParam = ctx.currentMatriculaId ? `?matricula_id=${ctx.currentMatriculaId}` : '';
    let sucessos = 0;
    let falhas = 0;

    showToast(`Integrando ${totalVizinhos} pontos...`, 'info');

    for (const pId of ctx.selectedVizinhoPontoIds) {
      try {
        const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos/integrar-vizinho/${pId}${matriculaIdParam}`, {
          method: 'POST'
        });
        if (res.ok) {
          sucessos++;
        } else {
          falhas++;
        }
      } catch (err) {
        falhas++;
      }
    }

    if (sucessos > 0) {
      showToast(`${sucessos} pontos vizinhos integrados com sucesso!`, 'success');
      await ctx.loadLevantamentoDetails();
      ctx.selectedVizinhoPontoIds = [];
      ctx.atualizarDestaqueLinhasTabela();
    }
    if (falhas > 0) {
      showToast(`Falha ao integrar ${falhas} pontos vizinhos.`, 'error');
    }
  });

  // Modal de Filtro Revit
  const fecharModalFiltro = () => {
    document.getElementById('modal-filtro-revit-mesa')?.classList.add('hidden');
  };

  addListener('btn-batch-filter-mesa', 'click', () => {
    const container = document.getElementById('container-categorias-filtro');
    if (!container) return;

    container.innerHTML = '';

    const pontosSelecionados = ctx.pontosList.filter((p: any) => ctx.selectedPontoIds.includes(p.id));
    const vizinhosSelecionados = ctx.pontosVizinhosList.filter((p: any) => ctx.selectedVizinhoPontoIds.includes(p.id));

    const categorias = [
      {
        id: 'marco',
        nome: 'Marcos (M)',
        count: pontosSelecionados.filter((p: any) => p.tipo_ponto === 'M' || p.tipo === 'M').length
      },
      {
        id: 'base-campo',
        nome: 'Bases (B)',
        count: pontosSelecionados.filter((p: any) => p.tipo_ponto === 'B' || p.tipo === 'B').length
      },
      {
        id: 'rover-vertice',
        nome: 'Vértices do Perímetro (M/P/V)',
        count: pontosSelecionados.filter((p: any) => p.tipo_ponto !== 'B' && p.tipo !== 'B').length
      },
      {
        id: 'ponto-bruto',
        nome: 'Pontos com Status BRUTO',
        count: pontosSelecionados.filter((p: any) => p.status_ponto === 'BRUTO').length
      },
      {
        id: 'ponto-corrigido',
        nome: 'Pontos com Status CORRIGIDO',
        count: pontosSelecionados.filter((p: any) => p.status_ponto === 'CORRIGIDO').length
      },
      {
        id: 'vizinho-ods',
        nome: 'Vértices Vizinhos (Roxos)',
        count: vizinhosSelecionados.length
      }
    ];

    const categoriasAtivas = categorias.filter(c => c.count > 0);

    if (categoriasAtivas.length === 0) {
      container.innerHTML = '<div class="text-white/20 italic py-2 text-center text-xs">Nenhum elemento selecionado para filtrar.</div>';
      return;
    }

    categoriasAtivas.forEach(cat => {
      const item = document.createElement('label');
      item.className = 'flex items-center gap-2.5 p-2 bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] rounded-technical text-xs text-white/80 cursor-pointer select-none transition-all';
      item.innerHTML = `
        <input type="checkbox" checked value="${cat.id}" class="chk-filtro-categoria rounded border-white/10 text-indigo-600 focus:ring-0 focus:ring-offset-0 bg-[#0c1510]" />
        <div class="flex justify-between items-center w-full">
          <span>${cat.nome}</span>
          <span class="font-mono bg-white/5 border border-white/10 text-white/50 text-[10px] px-1.5 py-0.5 rounded">${cat.count}</span>
        </div>
      `;
      container.appendChild(item);
    });

    document.getElementById('modal-filtro-revit-mesa')?.classList.remove('hidden');
  });

  addListener('btn-filtro-selecionar-todos', 'click', () => {
    document.querySelectorAll('.chk-filtro-categoria').forEach((chk: any) => { (chk as HTMLInputElement).checked = true; });
  });

  addListener('btn-filtro-limpar-todos', 'click', () => {
    document.querySelectorAll('.chk-filtro-categoria').forEach((chk: any) => { (chk as HTMLInputElement).checked = false; });
  });

  addListener('btn-fechar-modal-filtro', 'click', fecharModalFiltro);
  addListener('btn-filtro-cancelar', 'click', fecharModalFiltro);

  addListener('btn-filtro-aplicar', 'click', () => {
    const checkedVals = Array.from(document.querySelectorAll('.chk-filtro-categoria:checked')).map((el: any) => el.value);

    const pontosSelecionados = ctx.pontosList.filter((p: any) => ctx.selectedPontoIds.includes(p.id));
    const vizinhosSelecionados = ctx.pontosVizinhosList.filter((p: any) => ctx.selectedVizinhoPontoIds.includes(p.id));

    const novosPontoIds: number[] = [];
    const novosVizinhoIds: number[] = [];

    pontosSelecionados.forEach((p: any) => {
      const isM = p.tipo_ponto === 'M' || p.tipo === 'M';
      const isB = p.tipo_ponto === 'B' || p.tipo === 'B';
      const isRover = !isB;
      const isBruto = p.status_ponto === 'BRUTO';
      const isCorrigido = p.status_ponto === 'CORRIGIDO';

      let match = false;
      if (isM && checkedVals.includes('marco')) match = true;
      if (isB && checkedVals.includes('base-campo')) match = true;
      if (isRover && checkedVals.includes('rover-vertice')) match = true;
      if (isBruto && checkedVals.includes('ponto-bruto')) match = true;
      if (isCorrigido && checkedVals.includes('ponto-corrigido')) match = true;

      if (match) {
        novosPontoIds.push(p.id);
      }
    });

    if (checkedVals.includes('vizinho-ods')) {
      vizinhosSelecionados.forEach((p: any) => novosVizinhoIds.push(p.id));
    }

    ctx.selectedPontoIds = novosPontoIds;
    ctx.selectedVizinhoPontoIds = novosVizinhoIds;

    ctx.atualizarDestaqueLinhasTabela();
    fecharModalFiltro();
  });

  return () => {
    cleanups.forEach(c => c());
  };
}
