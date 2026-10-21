import { API_BASE } from '../../../config';
import { initIcons, showToast } from '../../../utils';
import { zonaUtmDoLevantamento, contarForaDoEnvelope } from '../coordenadas_mapa';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function setupVizinhosMesa(ctx: MesaTrabalhoContext): void {
  const btnImportarCsvVizinho = document.getElementById('btn-importar-csv-vizinho');
  const inputCsvVizinho = document.getElementById('input-csv-vizinho') as HTMLInputElement | null;

  btnImportarCsvVizinho?.addEventListener('click', () => {
    inputCsvVizinho?.click();
  });

  inputCsvVizinho?.addEventListener('change', async (e: any) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const btnImportarCsvVizinhoEl = document.getElementById('btn-importar-csv-vizinho') as HTMLButtonElement | null;
    let originalHtmlImportar = '';
    if (btnImportarCsvVizinhoEl) {
      originalHtmlImportar = btnImportarCsvVizinhoEl.innerHTML;
      btnImportarCsvVizinhoEl.disabled = true;
      btnImportarCsvVizinhoEl.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 mr-1 animate-spin"></i> Importando...`;
      initIcons();
    }

    try {
      showToast(`Processando ${files.length} arquivo(s) de vizinho...`, 'info');

      let sucessos = 0;
      const fusoAtual = ctx.mapaController?.fusoUtm || zonaUtmDoLevantamento(ctx.pontosList) || 22;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/importar-vizinho-csv?fuso_utm=${fusoAtual}`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        if (data.error || data.detail) {
          console.error(`Erro ao importar ${file.name}:`, data.error || data.detail);
        } else {
          sucessos++;
        }
      }

      inputCsvVizinho.value = '';

      if (sucessos > 0) {
        showToast(`Sucesso: ${sucessos} de ${files.length} arquivo(s) importados!`, 'success');
        await ctx.loadLevantamentoDetails();

        const foraDoEnvelope = contarForaDoEnvelope(ctx.pontosList, ctx.pontosVizinhosList);
        if (foraDoEnvelope > 0) {
          showToast(
            `Atenção: ${foraDoEnvelope} ponto(s) do vizinho ficaram a mais de ~50 km do levantamento. Confira o fuso UTM do arquivo (fuso atual: ${fusoAtual}S) e reimporte se necessário.`,
            'error',
            9000
          );
        }
        if (ctx.pontosVizinhosList && ctx.pontosVizinhosList.length > 0 && ctx.mapaController) {
          ctx.mapaController.plotPontosVizinhos(ctx.pontosVizinhosList);
          ctx.mapaController.fitBounds(ctx.pontosList || [], [50, 50], true, ctx.pontosVizinhosList);
        }
      } else {
        alert('Erro ao importar arquivos de vizinho.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar arquivos de vizinho.');
      inputCsvVizinho.value = '';
    } finally {
      if (btnImportarCsvVizinhoEl) {
        btnImportarCsvVizinhoEl.disabled = false;
        btnImportarCsvVizinhoEl.innerHTML = originalHtmlImportar;
        initIcons();
      }
    }
  });

  const btnLimparVizinhos = document.getElementById('btn-limpar-vizinhos');
  btnLimparVizinhos?.addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja apagar todos os pontos de vizinhos importados no mapa?')) return;

    const btnLimparEl = btnLimparVizinhos as HTMLButtonElement | null;
    let originalHtmlLimpar = '';
    if (btnLimparEl) {
      originalHtmlLimpar = btnLimparEl.innerHTML;
      btnLimparEl.disabled = true;
      btnLimparEl.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 mr-1 animate-spin"></i> Limpando...`;
      initIcons();
    }

    try {
      showToast('Removendo pontos de vizinhos...', 'info');
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos-vizinhos`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (data.error || data.detail) {
        alert(data.error || data.detail);
      } else {
        showToast('Todos os pontos de vizinhos foram apagados!', 'success');
        ctx.loadLevantamentoDetails();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao remover pontos de vizinhos.');
    } finally {
      if (btnLimparEl) {
        btnLimparEl.disabled = false;
        btnLimparEl.innerHTML = originalHtmlLimpar;
        initIcons();
      }
    }
  });

  const handlePopupActions = async (e: MouseEvent) => {
    const btnIntegrar = (e.target as HTMLElement).closest('.btn-integrar-vizinho-mapa');
    const btnOcultar = (e.target as HTMLElement).closest('.btn-ocultar-vizinho-mapa');

    if (btnIntegrar) {
      const pId = btnIntegrar.getAttribute('data-ponto-id');
      if (!pId) return;

      try {
        showToast('Integrando ponto ao levantamento...', 'info');
        const matriculaIdParam = ctx.currentMatriculaId ? `?matricula_id=${ctx.currentMatriculaId}` : '';
        const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos/integrar-vizinho/${pId}${matriculaIdParam}`, {
          method: 'POST'
        });
        const data = await res.json();

        if (data.error || data.detail) {
          alert(data.error || data.detail);
        } else {
          showToast(data.mensagem || 'Ponto integrado com sucesso!', 'success');
          ctx.loadLevantamentoDetails();
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao integrar ponto.');
      }
    }

    if (btnOcultar) {
      const pId = btnOcultar.getAttribute('data-ponto-id');
      if (!pId) return;

      try {
        showToast('Ocultando ponto do vizinho...', 'info');
        const res = await fetch(`${API_BASE}/pontos/${pId}/toggle-ignorar-vizinho`, {
          method: 'POST'
        });
        const data = await res.json();

        if (data.error || data.detail) {
          alert(data.error || data.detail);
        } else {
          showToast('Ponto ocultado do mapa!', 'success');
          if (ctx.mapaController) {
            const map = ctx.mapaController.getMap();
            map?.closePopup();
          }
          const numericPId = parseInt(pId, 10);
          if (Array.isArray(ctx.pontosVizinhosList)) {
            ctx.pontosVizinhosList = ctx.pontosVizinhosList.filter((pt: any) => pt.id !== numericPId);
          }
          if (Array.isArray(ctx.selectedVizinhoPontoIds)) {
            ctx.selectedVizinhoPontoIds = ctx.selectedVizinhoPontoIds.filter((id: number) => id !== numericPId);
          }
          ctx.loadLevantamentoDetails();
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao ocultar ponto.');
      }
    }
  };

  document.removeEventListener('click', (ctx as any)._popupActionsListener);
  (ctx as any)._popupActionsListener = handlePopupActions;
  document.addEventListener('click', handlePopupActions);
}
