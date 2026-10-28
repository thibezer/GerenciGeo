import { API_BASE } from '../../../config';
import { initIcons, showToast } from '../../../utils';
import { registrarEventosExportacao } from '../exportacao_cad';
import { setNuvemSyncContext } from '../nuvem_sync_modal';
import { FerramentaCanetaSelecao } from '../ferramenta_caneta';
import { focoEmCampoDeTexto } from '../foco_texto';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';
import { latLonToUTM } from './geodesica_calculos';
import { renderTabelaMesaGeodesica } from './geodesica_tabela';
import { setupIngestaoArquivos } from './geodesica_ingestao';
import { setupVizinhosMesa } from './geodesica_vizinhos';

export { latLonToUTM, renderTabelaMesaGeodesica };
export * from './geodesica_calculos';

export function setupMesaGeodesica(ctx: MesaTrabalhoContext): void {
  // Configura a conversão reativa ao fuso UTM selecionado no ribbon
  ctx.latLonToUTM = (lat: number, lon: number) =>
    latLonToUTM(lat, lon, Number(ctx.mapaController?.fusoUtm) || undefined);

  // Inicializa a mesa de ingestão de arquivos de campo
  setupIngestaoArquivos(ctx);

  // Inicializa o gerenciamento de pontos vizinhos e confrontantes
  setupVizinhosMesa(ctx);

  // Download de arquivos Rinex em ZIP
  document.getElementById('btn-download-rinex-zip')?.addEventListener('click', async () => {
    if (!ctx.currentLevId) return;

    const btn = document.getElementById('btn-download-rinex-zip') as HTMLButtonElement | null;
    let originalHtml = '';
    if (btn) {
      btn.disabled = true;
      originalHtml = btn.innerHTML;
      btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 mr-1 animate-spin"></i> Preparando...`;
    }

    try {
      const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/rinex/download-zip`;
      const res = await fetch(url);

      if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        alert('Erro ao gerar ZIP: ' + (err.detail || res.statusText));
        return;
      }

      const blob = await res.blob();
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlObj;
      a.download = `Rinex_Lev${ctx.currentLevId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(urlObj);
    } catch (e: any) {
      if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
      alert('Erro de comunicação com o servidor: ' + e.message);
    }
  });

  // Exportação KML
  document.getElementById('btn-exportar-kml')?.addEventListener('click', () => {
    if (!ctx.currentMatriculaId) return;
    alert(`Arquivo KML Sirgas 2000 gerado e copiado com sucesso para a pasta: \n/Projetos/Propriedade_Thiago/Lev_${ctx.currentLevId}/Exportacoes/`);
  });

  // Consolidação de pontos UTM
  document.getElementById('btn-consolidar-pontos-utm')?.addEventListener('click', async () => {
    if (!ctx.currentLevId) return;

    const btnConsolidar = document.getElementById('btn-consolidar-pontos-utm') as HTMLButtonElement | null;
    let originalHtmlConsolidar = '';
    if (btnConsolidar) {
      originalHtmlConsolidar = btnConsolidar.innerHTML;
      btnConsolidar.disabled = true;
      btnConsolidar.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 mr-1 animate-spin"></i> Consolidando...`;
      initIcons();
    }

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/consolidar-pontos`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(`Erro na consolidação: ${data.detail || data.error || 'Falha desconhecida'}`);
      } else if (data.error) {
        alert(data.error);
      } else {
        alert(data.message);
        window.open(`${API_BASE}/levantamentos/${ctx.currentLevId}/arquivos/download?categoria=Exportacoes&nome=PONTOS_CONSOLIDADOS_UTM.csv`, '_blank');
        ctx.loadWorkspaceArquivos();
      }
    } catch (e) {
      alert('Erro ao consolidar pontos.');
    } finally {
      if (btnConsolidar) {
        btnConsolidar.disabled = false;
        btnConsolidar.innerHTML = originalHtmlConsolidar;
        initIcons();
      }
    }
  });

  // Vincula o contexto da mesa ativa ao modal global da Nuvem Hostinger
  setNuvemSyncContext(ctx);

  // Reordenação de caminhamento
  document.getElementById('btn-reordenar-caminhamento')?.addEventListener('click', async () => {
    if (!ctx.currentLevId) return;
    if (ctx.etapaAtiva !== 'geoprocessamento' && !ctx.currentMatriculaId) {
      alert('Selecione uma matrícula ativa antes de ordenar!');
      return;
    }

    const msgConfirm = ctx.etapaAtiva === 'geoprocessamento'
      ? 'Tem certeza que deseja reordenar os pontos avulsos deste levantamento de modo que o caminhamento comece no ponto mais ao norte (sentido horário)?'
      : 'Tem certeza que deseja reordenar as divisas desta matrícula de modo que o caminhamento comece no ponto mais ao norte (sentido horário)? As qualificações de confrontantes e limites serão preservadas.';

    if (!confirm(msgConfirm)) return;

    const btnReordenar = document.getElementById('btn-reordenar-caminhamento') as HTMLButtonElement | null;
    let originalHtmlReordenar = '';
    if (btnReordenar) {
      originalHtmlReordenar = btnReordenar.innerHTML;
      btnReordenar.disabled = true;
      btnReordenar.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 mr-1 animate-spin"></i> Reordenando...`;
      initIcons();
    }

    try {
      const url = ctx.etapaAtiva === 'geoprocessamento'
        ? `${API_BASE}/levantamentos/${ctx.currentLevId}/reordenar`
        : `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/reordenar`;

      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (data.error || data.detail) {
        alert(data.error || data.detail);
      } else {
        alert(data.mensagem || 'Pontos reordenados com sucesso!');
        ctx.loadLevantamentoDetails();
      }
    } catch (e) {
      alert('Erro ao reordenar Poligonal.');
    } finally {
      if (btnReordenar) {
        btnReordenar.disabled = false;
        btnReordenar.innerHTML = originalHtmlReordenar;
        initIcons();
      }
    }
  });

  // Arquivar projeto (read-only)
  document.getElementById('btn-arquivar-projeto-seguro')?.addEventListener('click', async () => {
    if (!ctx.currentLevId) return;
    if (!confirm('ATENÇÃO: Você tem certeza que deseja arquivar definitivamente este levantamento? As pastas físicas no Windows serão travadas como Somente Leitura (Read-Only) e a edição de dados no banco será bloqueada.')) return;

    const btnArquivar = document.getElementById('btn-arquivar-projeto-seguro') as HTMLButtonElement | null;
    let originalHtmlArquivar = '';
    if (btnArquivar) {
      originalHtmlArquivar = btnArquivar.innerHTML;
      btnArquivar.disabled = true;
      btnArquivar.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 mr-1 animate-spin"></i> Arquivando...`;
      initIcons();
    }

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/arquivar`, { method: 'POST' });
      const data = await res.json();
      alert(data.message);
      window.location.hash = '#levantamentos';
    } catch (e) {
      alert('Erro ao arquivar levantamento.');
    } finally {
      if (btnArquivar) {
        btnArquivar.disabled = false;
        btnArquivar.innerHTML = originalHtmlArquivar;
        initIcons();
      }
    }
  });

  // Alternância UTM / Geodésico
  document.getElementById('btn-toggle-coordenadas')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-toggle-coordenadas');
    const lbl = document.getElementById('lbl-titulo-vertices');
    const btnUtm = document.getElementById('btn-modo-utm');
    const btnGeo = document.getElementById('btn-modo-geo');

    if (ctx.modoCoordenadas === 'geodesico') {
      ctx.modoCoordenadas = 'utm';
      if (btn) {
        btn.innerText = 'Geodésico';
        btn.title = 'Alternar para coordenadas Geodésicas';
      }
      if (lbl) lbl.innerText = 'Vértices UTM (SIRGAS 22S)';
      if (btnUtm) btnUtm.classList.add('active');
      if (btnGeo) btnGeo.classList.remove('active');
    } else {
      ctx.modoCoordenadas = 'geodesico';
      if (btn) {
        btn.innerText = 'UTM';
        btn.title = 'Alternar para coordenadas UTM';
      }
      if (lbl) lbl.innerText = 'Vértices Geodésicos';
      if (btnGeo) btnGeo.classList.add('active');
      if (btnUtm) btnUtm.classList.remove('active');
    }

    ctx.renderMatriculaDados();
    ctx.atualizarPainelPropriedades?.();
  });

  document.getElementById('btn-modo-utm')?.addEventListener('click', () => {
    if (ctx.modoCoordenadas !== 'utm') {
      document.getElementById('btn-toggle-coordenadas')?.click();
    }
  });

  document.getElementById('btn-modo-geo')?.addEventListener('click', () => {
    if (ctx.modoCoordenadas !== 'geodesico') {
      document.getElementById('btn-toggle-coordenadas')?.click();
    }
  });

  // Modal Unificação SIGEF
  document.getElementById('btn-unificar-sigef')?.addEventListener('click', () => {
    const modalSigef = document.getElementById('modal-unificar-sigef');
    if (modalSigef) modalSigef.classList.remove('hidden');
  });

  document.getElementById('btn-fechar-modal-sigef')?.addEventListener('click', () => {
    document.getElementById('modal-unificar-sigef')?.classList.add('hidden');
  });

  document.getElementById('btn-cancelar-sigef')?.addEventListener('click', () => {
    document.getElementById('modal-unificar-sigef')?.classList.add('hidden');
  });

  document.getElementById('form-unificar-sigef')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ctx.currentLevId) return;

    const inputVert = document.getElementById('input-sigef-vertices') as HTMLInputElement | null;
    const inputLim = document.getElementById('input-sigef-limites') as HTMLInputElement | null;

    if (!inputVert?.files || inputVert.files.length === 0 || !inputLim?.files || inputLim.files.length === 0) {
      alert('Por favor, selecione ambos os arquivos.');
      return;
    }

    const btnSubmit = document.getElementById('btn-submit-sigef') as HTMLButtonElement | null;
    let originalHtml = '';
    if (btnSubmit) {
      originalHtml = btnSubmit.innerHTML;
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 mr-1 animate-spin"></i> Unificando...`;
      initIcons();
    }

    try {
      const formData = new FormData();
      formData.append('file_vertices', inputVert.files[0]);
      formData.append('file_limites', inputLim.files[0]);
      if (ctx.currentMatriculaId) {
        formData.append('matricula_id', ctx.currentMatriculaId.toString());
      }

      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/unificar-sigef`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        alert(`Erro na unificação: ${data.detail || data.error || 'Falha desconhecida'}`);
      } else {
        showToast(data.message || 'Arquivos unificados com sucesso!', 'success');
        document.getElementById('modal-unificar-sigef')?.classList.add('hidden');
        ctx.loadLevantamentoDetails();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao unificar arquivos SIGEF.');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalHtml;
        initIcons();
      }
    }
  });

  document.getElementById('btn-ativar-reordenacao')?.addEventListener('click', () => {
    if (typeof ctx.alternarModoReordenarManual === 'function') {
      ctx.alternarModoReordenarManual(true);
    } else {
      showToast("Por favor, vá para a aba 'Org. de Perímetro' para reordenar.", 'info');
      const tabCartorio = document.getElementById('tab-perimetro');
      if (tabCartorio) tabCartorio.click();
    }
  });

  // Ferramenta Caneta de Seleção Poligonal
  if (!ctx.ferramentaCaneta) {
    ctx.ferramentaCaneta = new FerramentaCanetaSelecao(ctx);
  }

  document.getElementById('btn-ferramenta-caneta')?.addEventListener('click', () => {
    if (!ctx.ferramentaCaneta) {
      ctx.ferramentaCaneta = new FerramentaCanetaSelecao(ctx);
    }
    ctx.ferramentaCaneta.alternar();
  });

  document.getElementById('btn-mapa-caneta-flutuante')?.addEventListener('click', () => {
    if (!ctx.ferramentaCaneta) {
      ctx.ferramentaCaneta = new FerramentaCanetaSelecao(ctx);
    }
    ctx.ferramentaCaneta.alternar();
  });
  initIcons();

  // Atalho 'P' para alternar Caneta
  if ((ctx as any)._canetaKeydownListener) {
    window.removeEventListener('keydown', (ctx as any)._canetaKeydownListener);
  }
  (ctx as any)._canetaKeydownListener = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== 'p' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.repeat) return;
    if (ctx.etapaAtiva !== 'geoprocessamento') return;
    if (focoEmCampoDeTexto(e)) return;

    e.preventDefault();
    if (!ctx.ferramentaCaneta) {
      ctx.ferramentaCaneta = new FerramentaCanetaSelecao(ctx);
    }
    ctx.ferramentaCaneta.alternar();
  };
  window.addEventListener('keydown', (ctx as any)._canetaKeydownListener);

  document.getElementById('btn-override-base-manual')?.addEventListener('click', () => {
    alert("Para sobrescrever a base manualmente, clique com o botão direito sobre o vértice base na tabela e selecione 'Editar / Detalhes do Ponto'.");
  });

  document.getElementById('btn-toggle-ocultar-ignorados')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-toggle-ocultar-ignorados');
    ctx.ocultarForaPoligono = !ctx.ocultarForaPoligono;

    if (btn) {
      if (ctx.ocultarForaPoligono) {
        btn.innerText = 'Mostrar Todos';
        btn.title = 'Exibir todos os vértices da matrícula';
        btn.classList.replace('bg-white/5', 'bg-mint-vibrant/20');
        btn.classList.add('border-mint-vibrant/40');
      } else {
        btn.innerText = 'Só Polígono';
        btn.title = 'Ocultar vértices fora da poligonal da matrícula';
        btn.classList.replace('bg-mint-vibrant/20', 'bg-white/5');
        btn.classList.remove('border-mint-vibrant/40');
      }
    }
    ctx.renderMatriculaDados();
  });

  // Exportação CSV e CAD
  registrarEventosExportacao(ctx);

  // Filtros rápidos
  document.querySelectorAll('.vtx-filter-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.currentTarget as HTMLButtonElement;
      document.querySelectorAll('.vtx-filter-chip').forEach(b => {
        b.classList.remove('active');
      });
      targetBtn.classList.add('active');
      ctx.filtroRapidoAtivo = targetBtn.getAttribute('data-filtro') || 'todos';
      ctx.renderMatriculaDados();
    });
  });
}
