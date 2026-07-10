import { API_BASE } from '../../config';
import { showToast } from '../../utils';

/**
 * Inicializa todos os eventos de clique, duplo clique e alterações
 * relacionados à tabela inferior de pontos (Mesa Geodésica e Cartório).
 */
export function inicializarEventosTabela(
  ctx: any, 
  abrirModalEditarPonto: (pId: number) => void
): void {
  const tblTriagem = document.getElementById('tbl-pontos-triagem');
  const painelInferior = document.getElementById('container-tabelas-inferiores');
  const containerTabela = painelInferior || tblTriagem;

  if (containerTabela) {
    // 1. Cliques Curtos (Seleção, focar no mapa, subir/descer na ordem)
    containerTabela.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const linha = target.closest('.linha-ponto-tbl');
      const btnSubir = target.closest('.btn-subir-ponto');
      const btnDescer = target.closest('.btn-descer-ponto');

      if (btnSubir) {
        e.stopPropagation();
        const pId = parseInt(btnSubir.getAttribute('data-ponto-id') || '0');
        if (pId) ctx.subirPonto(pId);
        return;
      }
      if (btnDescer) {
        e.stopPropagation();
        const pId = parseInt(btnDescer.getAttribute('data-ponto-id') || '0');
        if (pId) ctx.descerPonto(pId);
        return;
      }

      const btnFocar = target.closest('.btn-focar-ponto-mapa');
      if (btnFocar) {
        e.stopPropagation();
        const pId = parseInt(btnFocar.getAttribute('data-ponto-id') || '0');
        if (pId) {
          ctx.selectPontoFromTabela(pId);
          ctx.mapaController.selectPonto(pId, 21);
        }
        return;
      }

      if (linha && !target.closest('.chk-ignorar-poligono')) {
        const pId = parseInt(linha.getAttribute('data-ponto-id') || '0');
        if (!pId) return;

        const mouseEvent = e as MouseEvent;
        if (mouseEvent.ctrlKey || mouseEvent.metaKey) {
          // Seleção cumulativa (Ctrl + Click)
          if (ctx.selectedPontoIds.includes(pId)) {
            ctx.selectedPontoIds = ctx.selectedPontoIds.filter((id: number) => id !== pId);
          } else {
            ctx.selectedPontoIds.push(pId);
            ctx.lastSelectedPontoId = pId;
          }
        } else if (mouseEvent.shiftKey && ctx.lastSelectedPontoId !== null) {
          // Seleção sequencial por intervalo (Shift + Click)
          const pontosMat = ctx.etapaAtiva === 'geoprocessamento'
            ? [...ctx.pontosList]
            : ctx.pontosList.filter((p: any) => p.matricula_id === ctx.currentMatriculaId && p.tipo_ponto !== 'B' && p.tipo !== 'B');
          
          const index1 = pontosMat.findIndex((pt: any) => pt.id === ctx.lastSelectedPontoId);
          const index2 = pontosMat.findIndex((pt: any) => pt.id === pId);

          if (index1 !== -1 && index2 !== -1) {
            const start = Math.min(index1, index2);
            const end = Math.max(index1, index2);
            const idsInRange = pontosMat.slice(start, end + 1).map((pt: any) => pt.id);
            idsInRange.forEach((id: number) => {
              if (!ctx.selectedPontoIds.includes(id)) {
                ctx.selectedPontoIds.push(id);
              }
            });
          }
        } else {
          // Seleção simples de ponto único
          ctx.selectedPontoIds = [pId];
          ctx.lastSelectedPontoId = pId;
        }

        ctx.atualizarDestaqueLinhasTabela();
        ctx.selectPontoFromTabela(pId);
      }
    });

    // 2. Duplo Clique (Abre edição individual)
    containerTabela.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      const linha = target.closest('.linha-ponto-tbl');
      if (linha && !target.closest('.chk-ignorar-poligono')) {
        const pId = parseInt(linha.getAttribute('data-ponto-id') || '0');
        if (pId) {
          e.stopPropagation();
          abrirModalEditarPonto(pId);
        }
      }
    });

    // 3. Modificação (Participação no Polígono da Matrícula)
    containerTabela.addEventListener('change', async (e) => {
      const target = e.target as HTMLElement;
      const chk = target.closest('.chk-ignorar-poligono') as HTMLInputElement;
      if (chk) {
        const pId = parseInt(chk.getAttribute('data-ponto-id') || '0');
        if (!pId) return;
        const ignorarVal = chk.checked ? 0 : 1;
        try {
          await fetch(`${API_BASE}/pontos/${pId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ignorar_poligono: ignorarVal })
          });
          ctx.loadLevantamentoDetails();
        } catch (err) {
          console.error("Erro ao alterar participação no polígono:", err);
          showToast("Erro ao alterar participação do ponto no polígono.", "error");
        }
      }
    });
  }
}
