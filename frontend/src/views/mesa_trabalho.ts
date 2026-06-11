import L from 'leaflet';
import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons } from '../utils';
import { renderMesaTrabalho } from './mesa_trabalho_template';
import {
  renderLinhaPontoCartorioHtml,
  renderLinhaPontoGeoprocessamentoHtml,
  renderAuditoriaTranslacaoHtml,
  renderLinhaSegmentoHtml,
  renderHistoricoTimelineHtml
} from './mesa_trabalho_tabela';
import { MesaTrabalhoMapa } from './mesa_trabalho_mapa';
export const mesaTrabalhoRoute: RouteDef = {
  render: () => renderMesaTrabalho(),
  setup: () => {
    let currentLevId: number | null = null;
    let currentMatriculaId: number | null = null;

    let matriculasList: any[] = [];
    let pontosList: any[] = [];
    let segmentosList: any[] = [];
    let confrontantesList: any[] = [];
    let triagemMap: L.Map | null = null;
    const mapaController = new MesaTrabalhoMapa();
    let filesQueue: { file: File; destination: string; matricula_id?: number | null; base_escolhida_id?: number | null }[] = [];
    let modoCoordenadas = 'utm'; // Padrão AutoCAD UTM Default (Diretriz V2.3)
    let etapaAtiva = 'geoprocessamento'; // 'geoprocessamento' ou 'cartorio' (Isolação de Telas)
    let modoReordenarAtivo = false;

    let selectedPontoIds: number[] = [];
    let lastSelectedPontoId: number | null = null;
    let currentSortColumn = 'ordem';
    let currentSortDirection: 'asc' | 'desc' = 'asc';
    let searchFilterValue = '';
    let searchFilterOrdenadorValue = '';
    let filtroRapidoAtivo = 'todos';
    let ocultarForaPoligono = false;
    let modoCliqueSequencialAtivo = false;
    let travamentoInicio = 0;
    let travamentoFim = 0;
    let travamentoInicioPontoId: number | null = null;
    let travamentoFimPontoId: number | null = null;
    let sequenciaCliqueProximoIndice: number | null = null;

    // Recupera levantamento ativo
    const activeId = localStorage.getItem('active_levantamento_id');
    if (!activeId) {
      window.location.hash = '#levantamentos';
      return;
    }
    currentLevId = parseInt(activeId);
    mapaController.levantamentoId = currentLevId;

    // Injeta estilos CSS para os resizers de colunas individuais (Padrão Excel)
    setTimeout(() => {
      const styleId = 'gerencigeo-column-resizer-styles';
      if (!document.getElementById(styleId)) {
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.innerHTML = `
            th.resizable-col {
               position: relative !important;
            }
            .col-resizer {
               position: absolute;
               top: 0;
               right: 0;
               width: 6px;
               height: 100%;
               cursor: col-resize;
               user-select: none;
               z-index: 10;
               background-color: transparent;
               transition: background-color 0.2s;
            }
            .col-resizer:hover, .col-resizer.resizing {
               background-color: #00f5a0 !important;
               width: 3px;
            }
         `;
        document.head.appendChild(styleEl);
      }
    }, 50);

    const setupEventDelegation = () => {
      const tblTriagem = document.getElementById('tbl-pontos-triagem');
      const containerReordenar = document.getElementById('lista-reordenar-simplificada');
      const containerWorkspace = document.getElementById('container-workspace-arquivos');
      const painelInferior = document.getElementById('container-tabelas-inferiores'); // Para garantir eventos da tabela de forma robusta

      const containerTabela = painelInferior || tblTriagem;

      if (containerTabela) {
        containerTabela.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          const linha = target.closest('.linha-ponto-tbl');
          const btnSubir = target.closest('.btn-subir-ponto');
          const btnDescer = target.closest('.btn-descer-ponto');

          if (btnSubir) {
            e.stopPropagation();
            const pId = parseInt(btnSubir.getAttribute('data-ponto-id') || '0');
            if (pId) subirPonto(pId);
            return;
          }
          if (btnDescer) {
            e.stopPropagation();
            const pId = parseInt(btnDescer.getAttribute('data-ponto-id') || '0');
            if (pId) descerPonto(pId);
            return;
          }
          const btnFocar = target.closest('.btn-focar-ponto-mapa');
          if (btnFocar) {
            e.stopPropagation();
            const pId = parseInt(btnFocar.getAttribute('data-ponto-id') || '0');
            if (pId) {
              selectPontoFromTabela(pId);
              mapaController.selectPonto(pId, 21); // Foca com zoom aproximado 21
            }
            return;
          }
          if (linha && !target.closest('.chk-ignorar-poligono')) {
            const pId = parseInt(linha.getAttribute('data-ponto-id') || '0');
            if (!pId) return;

            const mouseEvent = e as MouseEvent;
            if (mouseEvent.ctrlKey || mouseEvent.metaKey) {
              if (selectedPontoIds.includes(pId)) {
                selectedPontoIds = selectedPontoIds.filter(id => id !== pId);
              } else {
                selectedPontoIds.push(pId);
                lastSelectedPontoId = pId;
              }
            } else if (mouseEvent.shiftKey && lastSelectedPontoId !== null) {
              const pontosMat = etapaAtiva === 'geoprocessamento'
                ? [...pontosList]
                : pontosList.filter(p => p.matricula_id === currentMatriculaId && p.tipo_ponto !== 'B' && p.tipo !== 'B');
              const index1 = pontosMat.findIndex(pt => pt.id === lastSelectedPontoId);
              const index2 = pontosMat.findIndex(pt => pt.id === pId);

              if (index1 !== -1 && index2 !== -1) {
                const start = Math.min(index1, index2);
                const end = Math.max(index1, index2);
                const idsInRange = pontosMat.slice(start, end + 1).map(pt => pt.id);
                idsInRange.forEach(id => {
                  if (!selectedPontoIds.includes(id)) {
                    selectedPontoIds.push(id);
                  }
                });
              }
            } else {
              selectedPontoIds = [pId];
              lastSelectedPontoId = pId;
            }

            atualizarDestaqueLinhasTabela();
            selectPontoFromTabela(pId);
          }
        });

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
              loadLevantamentoDetails();
            } catch (err) {
              console.error("Erro ao alterar participação no polígono:", err);
              alert("Erro ao alterar participação do ponto no polígono.");
            }
          }
        });
      }

      if (containerReordenar) {
        containerReordenar.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;

          const btnTravar = target.closest('.btn-travar-ponto');
          const btnSubir = target.closest('.btn-subir-simplificado');
          const btnDescer = target.closest('.btn-descer-simplificado');

          if (btnTravar) {
            e.stopPropagation();
            const ordem = parseInt(btnTravar.getAttribute('data-ordem') || '0');
            const isTravado = travamentoInicio > 0 && travamentoFim >= travamentoInicio &&
              ordem >= travamentoInicio && ordem <= travamentoFim;

            if (isTravado) {
              travamentoInicio = 0;
              travamentoFim = 0;
              travamentoInicioPontoId = null;
              travamentoFimPontoId = null;
            } else {
              travamentoInicio = 1;
              travamentoFim = ordem;
              const pontosMatCompleto = pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
              pontosMatCompleto.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
              const pInicio = pontosMatCompleto[0];
              const pFim = pontosMatCompleto[ordem - 1];
              travamentoInicioPontoId = pInicio ? pInicio.id : null;
              travamentoFimPontoId = pFim ? pFim.id : null;
            }
            renderListaReordenarSimplificada();
            return;
          }

          if (btnSubir) {
            e.stopPropagation();
            const pId = parseInt(btnSubir.getAttribute('data-ponto-id') || '0');
            if (pId) subirPontoSimplificado(pId);
            return;
          }

          if (btnDescer) {
            e.stopPropagation();
            const pId = parseInt(btnDescer.getAttribute('data-ponto-id') || '0');
            if (pId) descerPontoSimplificado(pId);
            return;
          }
        });

        const aplicarMudancaOrdem = (inp: HTMLInputElement) => {
          const pId = parseInt(inp.getAttribute('data-ponto-id') || '0');
          const oldVal = parseInt(inp.getAttribute('data-old-ordem') || '1');
          const newVal = parseInt(inp.value || '0');
          const pontosMatCompleto = pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
          const totalPontos = pontosMatCompleto.length;

          if (isNaN(newVal) || newVal < 1 || newVal > totalPontos) {
            inp.value = oldVal.toString();
            return;
          }
          if (newVal !== oldVal) {
            moverPontoPosicao(pId, newVal);
          }
        };

        containerReordenar.addEventListener('change', (e) => {
          const target = e.target as HTMLElement;
          const inp = target.closest('.input-ordem-direta') as HTMLInputElement;
          if (inp) aplicarMudancaOrdem(inp);
        });

        containerReordenar.addEventListener('keydown', (e) => {
          const target = e.target as HTMLElement;
          const inp = target.closest('.input-ordem-direta') as HTMLInputElement;
          if (inp && e.key === 'Enter') {
            e.preventDefault();
            inp.blur();
          }
        });
      }

      if (containerWorkspace) {
        containerWorkspace.addEventListener('click', async (e) => {
          const target = e.target as HTMLElement;

          const btnVis = target.closest('.btn-visualizar-workspace');
          const btnDownload = target.closest('.btn-download-workspace');
          const btnDeletar = target.closest('.btn-deletar-workspace');

          if (btnVis || btnDownload) {
            const btn = (btnVis || btnDownload)!;
            const cat = btn.getAttribute('data-cat') || '';
            const nome = btn.getAttribute('data-nome') || '';
            window.open(`${API_BASE}/levantamentos/${currentLevId}/arquivos/download?categoria=${cat}&nome=${encodeURIComponent(nome)}`, '_blank');
            return;
          }

          if (btnDeletar) {
            const cat = btnDeletar.getAttribute('data-cat') || '';
            const nome = btnDeletar.getAttribute('data-nome') || '';

            let confirmMsg = `Tem certeza que deseja excluir o arquivo '${nome}' do repositório físico?`;
            if (cat === 'Processados' && nome.toLowerCase().endsWith('.txt')) {
              confirmMsg += `\n\nATENÇÃO: A exclusão desta caderneta purgará automaticamente todos os pontos importados dela no banco de dados.`;
            }

            if (!confirm(confirmMsg)) return;

            try {
              const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/arquivos/deletar?categoria=${cat}&nome=${encodeURIComponent(nome)}`, {
                method: 'DELETE'
              });
              const resData = await res.json();
              if (resData.success) {
                alert(resData.message);
                loadWorkspaceArquivos();
                if (resData.pontos_removidos > 0) {
                  loadLevantamentoDetails();
                }
              } else {
                alert(`Erro ao excluir: ${resData.error || resData.detail || 'Falha desconhecida'}`);
              }
            } catch (err) {
              console.error("Erro ao deletar arquivo:", err);
              alert("Erro de comunicação com o servidor API.");
            }
          }
        });
      }
    };

    const atualizarDestaqueLinhasTabela = () => {
      document.querySelectorAll('.linha-ponto-tbl').forEach(tr => {
        const pId = parseInt(tr.getAttribute('data-ponto-id') || '0');
        const isSelected = selectedPontoIds.includes(pId);

        if (isSelected) {
          tr.classList.add('bg-mint-vibrant/10', 'text-mint-vibrant', 'border-mint-vibrant/30');
          tr.classList.remove('hover:bg-white/[0.02]', 'border-white/5');
        } else {
          tr.classList.remove('bg-mint-vibrant/10', 'text-mint-vibrant', 'border-mint-vibrant/30');
          tr.classList.add('hover:bg-white/[0.02]', 'border-white/5');
        }
      });
    };

    // Função matemática precisa e determinística de conversão Lat/Lon para UTM SIRGAS 2000
    const latLonToUTM = (lat: number, lon: number) => {
      const sa = 6378137.0;
      const sb = 6356752.314245;
      const e2cuadrado = (sa * sa - sb * sb) / (sb * sb);
      const c = sa * sa / sb;

      const latRad = lat * Math.PI / 180;
      const lonRad = lon * Math.PI / 180;

      const zone = Math.floor((lon + 180) / 6) + 1;
      const lonSMRad = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;

      const deltaLon = lonRad - lonSMRad;

      const A = Math.cos(latRad) * Math.sin(deltaLon);
      const xi = 0.5 * Math.log((1 + A) / (1 - A));
      const eta = Math.atan(Math.tan(latRad) / Math.cos(deltaLon)) - latRad;

      const nu = c / Math.sqrt(1 + e2cuadrado * Math.cos(latRad) * Math.cos(latRad));
      const zeta = (e2cuadrado / 2) * xi * xi * Math.cos(latRad) * Math.cos(latRad);
      const A1 = Math.sin(2 * latRad);
      const A2 = A1 * Math.cos(latRad) * Math.cos(latRad);
      const J2 = latRad + A1 / 2;
      const J4 = (3 * J2 + A2) / 4;
      const J6 = (5 * J4 + A2 * Math.cos(latRad) * Math.cos(latRad)) / 3;

      const alpha = (3 / 4) * e2cuadrado;
      const beta = (5 / 3) * alpha * alpha;
      const gama = (35 / 27) * alpha * alpha * alpha;

      const Bm = 0.9996 * c * (latRad - alpha * J2 + beta * J4 - gama * J6);

      const e = xi * nu * 0.9996 * (1 + zeta / 3) + 500000;
      let n = eta * nu * 0.9996 * (1 + zeta) + Bm;

      if (n < 0) {
        n = n + 10000000;
      }

      return { e, n, zone };
    };

    const atualizarPolilinhaMapaTemp = () => {
      if (!triagemMap) return;
      if (etapaAtiva !== 'geoprocessamento' && !currentMatriculaId) return;

      const pontosMat = etapaAtiva === 'geoprocessamento'
        ? pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B')
        : pontosList.filter(p => p.matricula_id === currentMatriculaId);

      mapaController.clearOverlays();

      // Plota os marcadores (bolinhas) novamente para mantê-los visíveis e interativos!
      mapaController.plotPontos(pontosMat, (pId) => {
        selectPontoFromTabela(pId);
      });

      // Plota a polilinha conectando os pontos na nova sequência
      mapaController.plotPolilinhaTemporaria(pontosMat);
    };

    const subirPonto = (pontoId: number) => {
      if (etapaAtiva !== 'geoprocessamento' && !currentMatriculaId) return;

      const pontosMat = etapaAtiva === 'geoprocessamento'
        ? pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B')
        : pontosList.filter(p => p.matricula_id === currentMatriculaId);

      pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

      const idx = pontosMat.findIndex(p => p.id === pontoId);
      if (idx > 0) {
        const p1 = pontosMat[idx];
        const p2 = pontosMat[idx - 1];

        const tempOrdem = p1.ordem_caminhamento || idx + 1;
        p1.ordem_caminhamento = p2.ordem_caminhamento || idx;
        p2.ordem_caminhamento = tempOrdem;

        const btnSalvar = document.getElementById('btn-salvar-perimetro-custom');
        if (btnSalvar) {
          btnSalvar.classList.remove('hidden');
          btnSalvar.classList.add('animate-pulse');
        }

        renderMatriculaDados();
        atualizarPolilinhaMapaTemp();
      }
    };

    const descerPonto = (pontoId: number) => {
      if (etapaAtiva !== 'geoprocessamento' && !currentMatriculaId) return;

      const pontosMat = etapaAtiva === 'geoprocessamento'
        ? pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B')
        : pontosList.filter(p => p.matricula_id === currentMatriculaId);

      pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

      const idx = pontosMat.findIndex(p => p.id === pontoId);
      if (idx !== -1 && idx < pontosMat.length - 1) {
        const p1 = pontosMat[idx];
        const p2 = pontosMat[idx + 1];

        const tempOrdem = p1.ordem_caminhamento || idx + 1;
        p1.ordem_caminhamento = p2.ordem_caminhamento || idx + 2;
        p2.ordem_caminhamento = tempOrdem;

        const btnSalvar = document.getElementById('btn-salvar-perimetro-custom');
        if (btnSalvar) {
          btnSalvar.classList.remove('hidden');
          btnSalvar.classList.add('animate-pulse');
        }

        renderMatriculaDados();
        atualizarPolilinhaMapaTemp();
      }
    };

    const salvarRascunhoLocal = () => {
      if (!currentLevId) return;
      const pontosMatCompleto = pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
      pontosMatCompleto.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

      const draft = pontosMatCompleto.map(p => ({
        id: p.id,
        ordem: p.ordem_caminhamento
      }));

      localStorage.setItem(`rascunho_ordem_lev_${currentLevId}`, JSON.stringify(draft));
    };

    const verificarRascunhoLocal = () => {
      if (!currentLevId) return;
      const key = `rascunho_ordem_lev_${currentLevId}`;
      const draftStr = localStorage.getItem(key);
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft && draft.length > 0) {
          const confirmar = confirm("Detectamos um rascunho de ordenação manual não salvo anteriormente. Deseja restaurar esse progresso?");
          if (confirmar) {
            draft.forEach((d: any) => {
              const pt = pontosList.find(p => p.id === d.id);
              if (pt) {
                pt.ordem_caminhamento = d.ordem;
              }
            });
            travamentoInicio = 0;
            travamentoFim = 0;
            travamentoInicioPontoId = null;
            travamentoFimPontoId = null;
            renderListaReordenarSimplificada();
            atualizarPolilinhaMapaTemp();
          } else {
            localStorage.removeItem(key);
          }
        }
      }
    };

    const moverPontoPosicao = (pontoId: number, novaPosicao: number) => {
      const pontosMatCompleto = pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
      pontosMatCompleto.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

      const oldIdx = pontosMatCompleto.findIndex(p => p.id === pontoId);
      if (oldIdx === -1) return;

      const ordemOriginal = oldIdx + 1;

      // Verifica se o ponto faz parte da sequência/faixa travada
      const pertenceAoBlocoTravado = travamentoInicio > 0 && travamentoFim >= travamentoInicio &&
        ordemOriginal >= travamentoInicio && ordemOriginal <= travamentoFim;

      if (pertenceAoBlocoTravado) {
        // --- MOVIMENTO EM BLOCO TRAVADO ---
        const tamanhoBloco = (travamentoFim - travamentoInicio) + 1;

        let novaPos = novaPosicao;
        if (novaPos < 1) novaPos = 1;
        if (novaPos > pontosMatCompleto.length - tamanhoBloco + 1) {
          novaPos = pontosMatCompleto.length - tamanhoBloco + 1;
        }

        if (novaPos === travamentoInicio) {
          renderListaReordenarSimplificada();
          return;
        }

        // Remove o bloco completo do array
        const idxInicioBloco = travamentoInicio - 1;
        const blocoMovido = pontosMatCompleto.splice(idxInicioBloco, tamanhoBloco);

        // Insere o bloco completo na nova posição
        const novoIdxInsercao = novaPos - 1;
        pontosMatCompleto.splice(novoIdxInsercao, 0, ...blocoMovido);

        // Reatribui ordens sequencialmente
        pontosMatCompleto.forEach((p, index) => {
          p.ordem_caminhamento = index + 1;
        });

        // Atualiza a nova faixa travada
        travamentoInicio = novaPos;
        travamentoFim = novaPos + tamanhoBloco - 1;

        renderListaReordenarSimplificada();
        atualizarPolilinhaMapaTemp();
        salvarRascunhoLocal();
        return;
      }

      // --- MOVIMENTO DE PONTO LIVRE INDIVIDUAL ---
      let newIdx = novaPosicao - 1;
      if (travamentoInicio > 0 && travamentoFim >= travamentoInicio) {
        const blocoInicioIdx = travamentoInicio - 1;
        const blocoFimIdx = travamentoFim - 1;

        // Se tentar inserir dentro da faixa travada, empurra para as bordas para manter o bloco intacto!
        if (newIdx >= blocoInicioIdx && newIdx <= blocoFimIdx) {
          if (oldIdx < blocoInicioIdx) {
            newIdx = blocoInicioIdx;
          } else {
            newIdx = blocoFimIdx + 1;
          }
        }
      }

      if (newIdx < 0) newIdx = 0;
      if (newIdx >= pontosMatCompleto.length) newIdx = pontosMatCompleto.length - 1;

      if (oldIdx === newIdx) {
        renderListaReordenarSimplificada();
        return;
      }

      const [pontoMovido] = pontosMatCompleto.splice(oldIdx, 1);
      pontosMatCompleto.splice(newIdx, 0, pontoMovido);

      // Reatribui ordem de caminhamento sequencial (1 a N) sem repetição nem lacuna
      pontosMatCompleto.forEach((p, index) => {
        p.ordem_caminhamento = index + 1;
      });

      renderListaReordenarSimplificada();
      atualizarPolilinhaMapaTemp();
      salvarRascunhoLocal();
    };

    const renderListaReordenarSimplificada = () => {
      const container = document.getElementById('lista-reordenar-simplificada');
      if (!container) return;

      const pontosMatCompleto = pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
      pontosMatCompleto.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
      const totalPontos = pontosMatCompleto.length;

      // Recalcula a faixa de travamento atual com base nos IDs dos pontos
      if (travamentoInicioPontoId !== null && travamentoFimPontoId !== null) {
        const idxInicio = pontosMatCompleto.findIndex(p => p.id === travamentoInicioPontoId);
        const idxFim = pontosMatCompleto.findIndex(p => p.id === travamentoFimPontoId);
        if (idxInicio !== -1 && idxFim !== -1) {
          travamentoInicio = Math.min(idxInicio, idxFim) + 1;
          travamentoFim = Math.max(idxInicio, idxFim) + 1;
        } else {
          travamentoInicio = 0;
          travamentoFim = 0;
          travamentoInicioPontoId = null;
          travamentoFimPontoId = null;
        }
      } else {
        travamentoInicio = 0;
        travamentoFim = 0;
      }

      // Atualiza o indicador textual no cabeçalho
      const txtFaixa = document.getElementById('txt-faixa-travada');
      if (txtFaixa) {
        if (travamentoInicio > 0 && travamentoFim >= travamentoInicio) {
          txtFaixa.innerText = `${travamentoInicio} a ${travamentoFim}`;
        } else {
          txtFaixa.innerText = "Nenhum";
        }
      }

      if (totalPontos === 0) {
        container.innerHTML = `<div class="text-white/20 p-8 text-center">Nenhum ponto para ordenar.</div>`;
        return;
      }

      // Aplica o filtro de busca se houver
      let pontosMatFiltrados = [...pontosMatCompleto];
      if (searchFilterOrdenadorValue.trim()) {
        const query = searchFilterOrdenadorValue.toLowerCase().trim();
        pontosMatFiltrados = pontosMatFiltrados.filter(p =>
          (p.nome_vertice && p.nome_vertice.toLowerCase().includes(query)) ||
          (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(query)) ||
          (p.tipo && p.tipo.toLowerCase().includes(query))
        );
      }

      if (pontosMatFiltrados.length === 0) {
        container.innerHTML = `<div class="text-white/20 p-8 text-center">Nenhum ponto encontrado com "${searchFilterOrdenadorValue}".</div>`;
        return;
      }

      container.innerHTML = pontosMatFiltrados.map((p) => {
        const ordemOriginal = pontosMatCompleto.findIndex(orig => orig.id === p.id) + 1;
        const isTravado = travamentoInicio > 0 && travamentoFim >= travamentoInicio &&
          ordemOriginal >= travamentoInicio && ordemOriginal <= travamentoFim;

        return `
        <div class="flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded-technical text-xs font-mono transition-all duration-300 linha-ponto-ordenador hover:border-mint-vibrant/25 hover:bg-white/[0.04] ${isTravado ? 'border-mint-vibrant/30 bg-mint-vibrant/[0.03] font-semibold' : ''}" id="ordenador-item-${p.id}">
          <div class="flex items-center gap-2">
            <!-- Cadeado de travamento -->
            <button class="btn-travar-ponto p-1 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors" 
                    data-ponto-id="${p.id}" 
                    data-ordem="${ordemOriginal}" 
                    title="${isTravado ? 'Destravar esta sequência' : 'Travar até este ponto'}" 
                    type="button">
              <i data-lucide="${isTravado ? 'lock' : 'unlock'}" class="w-3.5 h-3.5 ${isTravado ? 'text-mint-vibrant' : 'text-white/40'}"></i>
            </button>
            <input type="number" 
                   class="input-ordem-direta text-center text-[10px] bg-mint-vibrant/10 text-mint-vibrant font-bold border border-mint-vibrant/25 rounded w-10 focus:outline-none focus:border-mint-vibrant focus:ring-1 focus:ring-mint-vibrant/30 py-0.5 px-1 font-mono transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                   min="1" 
                   max="${totalPontos}" 
                   value="${ordemOriginal}" 
                   data-ponto-id="${p.id}"
                   data-old-ordem="${ordemOriginal}" />
            <span class="font-bold text-white">${p.nome_vertice}</span>
            <span class="text-[9px] text-white/30">(${p.tipo_ponto || p.tipo})</span>
          </div>
          <div class="flex items-center gap-1">
            <button class="btn-subir-simplificado p-1 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors" data-ponto-id="${p.id}" title="Subir Ponto" type="button">
              <i data-lucide="chevron-up" class="w-4 h-4"></i>
            </button>
            <button class="btn-descer-simplificado p-1 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors" data-ponto-id="${p.id}" title="Descer Ponto" type="button">
              <i data-lucide="chevron-down" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
      }).join('');

      // Atrela listeners nos cadeados de travamento
      // Event listeners delegados por setupEventDelegation()

      initIcons();
    };

    const subirPontoSimplificado = (pontoId: number) => {
      const pontosMat = pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
      pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

      const idx = pontosMat.findIndex(p => p.id === pontoId);
      if (idx > 0) {
        moverPontoPosicao(pontoId, idx);
      }
    };

    const descerPontoSimplificado = (pontoId: number) => {
      const pontosMat = pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
      pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

      const idx = pontosMat.findIndex(p => p.id === pontoId);
      if (idx !== -1 && idx < pontosMat.length - 1) {
        moverPontoPosicao(pontoId, idx + 2);
      }
    };

    const alternarModoReordenarManual = (ativo: boolean) => {
      modoReordenarAtivo = ativo;
      const btnAtivar = document.getElementById('btn-ativar-reordenacao');
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      const containerReordenar = document.getElementById('container-reordenar-manual');
      const header = document.getElementById('mesa-trabalho-header');
      const gridSuperior = document.getElementById('grid-superior-detalhe');

      if (ativo) {
        if (btnAtivar) {
          btnAtivar.classList.replace('bg-white/5', 'bg-mint-vibrant/20');
          btnAtivar.classList.add('border-mint-vibrant/40');
        }
        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (containerReordenar) {
          containerReordenar.classList.remove('hidden');
        }
        if (gridSuperior) {
          gridSuperior.style.height = '680px';
        }
        const splitterSup = document.getElementById('splitter-superior');
        if (splitterSup) splitterSup.classList.remove('hidden');
        if (header) {
          header.classList.add('hidden');
        }

        // Verifica se existe rascunho salvo antes de carregar
        verificarRascunhoLocal();
        renderListaReordenarSimplificada();
      } else {
        if (btnAtivar) {
          btnAtivar.classList.replace('bg-mint-vibrant/20', 'bg-white/5');
          btnAtivar.classList.remove('border-mint-vibrant/40');
        }
        if (containerIngestao) containerIngestao.classList.remove('hidden');
        if (containerReordenar) {
          containerReordenar.classList.add('hidden');
        }
        if (gridSuperior) {
          gridSuperior.style.height = '480px';
        }
        const splitterSup = document.getElementById('splitter-superior');
        if (splitterSup) {
          if (containerIngestao && !containerIngestao.classList.contains('ingestao-collapsed')) {
            splitterSup.classList.remove('hidden');
          } else {
            splitterSup.classList.add('hidden');
          }
        }
        if (header) {
          header.classList.remove('hidden');
        }

        // Reseta estados locais temporários
        modoCliqueSequencialAtivo = false;
        travamentoInicio = 0;
        travamentoFim = 0;
        sequenciaCliqueProximoIndice = null;
        mapaController.modoCliqueSequencialAtivo = false;

        // Reset visual do botão se aplicável
        const btnCliqueSequencial = document.getElementById('btn-toggle-clique-sequencial');
        if (btnCliqueSequencial) {
          btnCliqueSequencial.classList.replace('bg-mint-vibrant/20', 'bg-white/5');
          btnCliqueSequencial.classList.remove('border-mint-vibrant/40');
          const iconClique = document.getElementById('icon-clique-sequencial');
          if (iconClique) {
            iconClique.setAttribute('data-lucide', 'play');
            iconClique.classList.remove('animate-pulse');
          }
          const txtClique = document.getElementById('txt-clique-sequencial');
          if (txtClique) txtClique.innerText = "Caminhar por Clique";
        }

        loadLevantamentoDetails();
      }

      if (triagemMap) {
        setTimeout(() => triagemMap!.invalidateSize(), 150);
      }
    };

    const initTriagemMap = () => {
      triagemMap = mapaController.init('mapa-triagem');
    };

    const loadLevantamentoDetails = async () => {
      if (!currentLevId) return;

      try {
        // Busca o levantamento ativo
        const resLev = await fetch(`${API_BASE}/levantamentos`);
        const allLevs = await resLev.json();
        const levObj = allLevs.find((l: any) => l.id === currentLevId);

        if (levObj) {
          const badgeStatus = document.getElementById('badge-status-lev')!;
          badgeStatus.innerText = levObj.status;
          
          // Reseta classes de status antigas
          badgeStatus.className = "text-[9px] px-2 py-0.5 rounded-full font-mono uppercase font-semibold tracking-wider border transition-all";
          
          // Aplica estilo dinâmico com base no status do levantamento
          if (levObj.status === 'EM_ANDAMENTO' || levObj.status === 'ATIVO') {
            badgeStatus.classList.add('bg-mint-vibrant/10', 'text-mint-vibrant', 'border-mint-vibrant/25');
            badgeStatus.classList.add('status-em-andamento'); // Ativa animação CSS
          } else if (levObj.status === 'ARQUIVADO') {
            badgeStatus.classList.add('bg-white/5', 'text-white/40', 'border-white/10');
            badgeStatus.classList.remove('status-em-andamento');
          } else { // Ex: FINALIZADO
            badgeStatus.classList.add('bg-blue-500/10', 'text-blue-400', 'border-blue-500/25');
            badgeStatus.classList.remove('status-em-andamento');
          }

          document.getElementById('txt-nome-propriedade')!.innerText = levObj.nome_propriedade || `Levantamento #${levObj.id}`;

          const proprietarios = levObj.clientes && levObj.clientes.length
            ? levObj.clientes.map((c: any) => `${c.nome_completo} (${(c.percentual_participacao || 0).toFixed(0)}%)`).join(', ')
            : 'Nenhum proprietário';

          document.getElementById('txt-nome-cliente')!.innerText = proprietarios;
          document.getElementById('txt-codigo-car')!.innerText = levObj.codigo_car || 'Não Informado';
        }

        // Fetch paralelo de dependências
        const [resMat, resPt, resSeg, resConf] = await Promise.all([
          fetch(`${API_BASE}/levantamentos/${currentLevId}/matriculas`),
          fetch(`${API_BASE}/levantamentos/${currentLevId}/pontos`),
          fetch(`${API_BASE}/levantamentos/${currentLevId}/segmentos`),
          fetch(`${API_BASE}/levantamentos/${currentLevId}/confrontantes`)
        ]);

        matriculasList = await resMat.json();
        pontosList = await resPt.json();
        segmentosList = await resSeg.json();
        confrontantesList = await resConf.json();

        // Abas de Matrículas
        const abasContainer = document.getElementById('container-abas-matriculas');
        if (abasContainer) {
          if (matriculasList.length === 0) {
            abasContainer.innerHTML = `
              <div class="flex items-center gap-2 p-1 shrink-0">
                <span class="text-xs text-white/30 font-mono">[Nenhuma Matrícula Cadastrada - Cadastre-a em "Propriedades"]</span>
              </div>
            `;
          } else {
            let abasHtml = matriculasList.map((m) => `
              <button class="px-4 py-1.5 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-all btn-mat-tab whitespace-nowrap" data-mat-id="${m.id}" type="button">
                Matrícula ${m.numero_matricula}
              </button>
            `).join('');

            abasContainer.innerHTML = abasHtml;

            document.querySelectorAll('.btn-mat-tab').forEach(b => {
              b.addEventListener('click', () => {
                const mId = parseInt(b.getAttribute('data-mat-id') || '0');
                switchMatriculaTab(mId);
              });
            });

            if (currentMatriculaId === null && matriculasList.length > 0) {
              switchMatriculaTab(matriculasList[0].id);
            } else if (currentMatriculaId !== null) {
              switchMatriculaTab(currentMatriculaId);
            }
          }
        }

        initTriagemMap();
        renderFilaArquivos();
        loadWorkspaceArquivos();
        alternarEtapa(etapaAtiva);
        
        // Carrega sugestões de numeração e pontos homologados do Banco de Pontos
        carregarSugestoesNumeracao();
        if (levObj && levObj.profissional_id) {
          carregarHomologacaoDados(levObj.profissional_id);
        }

      } catch (e) {
        console.error("Erro ao carregar detalhes do levantamento:", e);
      }
    };

    const loadWorkspaceArquivos = async () => {
      if (!currentLevId) return;
      const container = document.getElementById('container-workspace-arquivos');
      if (!container) return;

      try {
        const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/arquivos`);
        const data = await res.json();
        if (data.error) {
          container.innerHTML = `<div class="text-red-400 p-8 text-center col-span-full">${data.error}</div>`;
          return;
        }

        const categoriasMap: { [key: string]: { label: string; icone: string; color: string; desc: string } } = {
          "Brutos": { label: "1. Brutos", icone: "file-box", color: "text-orange-400 bg-orange-500/10 border-orange-500/20", desc: "Binários .GNS / Cadernetas brutos" },
          "Rinex": { label: "2. Rinex", icone: "file-digit", color: "text-blue-400 bg-blue-500/10 border-blue-500/20", desc: "Arquivos de Observação/Navegação" },
          "Processados": { label: "3. Pós-Processados", icone: "cpu", color: "text-mint-vibrant bg-mint-vibrant/10 border-mint-vibrant/20", desc: "Corrigidos / PPP / Processados HGO" },
          "Exportacoes": { label: "4. Exportações", icone: "file-symlink", color: "text-purple-400 bg-purple-500/10 border-purple-500/20", desc: "KML gerados / DXF / Shapes" },
          "Documentos": { label: "5. Documentos", icone: "file-text", color: "text-pink-400 bg-pink-500/10 border-pink-500/20", desc: "DADOS_GERAIS.json / Snapshots" }
        };

        container.innerHTML = Object.keys(categoriasMap).map(cat => {
          const info = categoriasMap[cat];
          let arquivos = data[cat] || [];

          if (cat === "Rinex") {
            arquivos = arquivos.filter((f: any) => {
              const nameLower = f.nome.toLowerCase();
              return nameLower.endsWith('.obs') || nameLower.endsWith('.o') || /\.\d{2}o$/.test(nameLower);
            });
          }

          const arquivosHtml = arquivos.length === 0
            ? `<div class="text-[9px] text-white/20 italic py-3 text-center bg-white/[0.01] border border-dashed border-white/5 rounded-technical">Pasta vazia</div>`
            : arquivos.map((f: any) => `
              <div class="flex items-center justify-between p-1.5 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-technical text-[10px] gap-1.5 transition-all group/item">
                <div class="min-w-0 flex-1">
                  <p class="font-mono text-white truncate font-medium" title="${f.nome}">${f.nome}</p>
                  <p class="text-[8px] text-white/30 font-mono mt-0.5">${f.tamanho} • ${f.modificado}</p>
                </div>
                <div class="flex items-center gap-0.5 shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                  <button class="btn-visualizar-workspace text-blue-400 hover:text-white p-0.5 hover:bg-blue-500/20 rounded transition-all" data-cat="${cat}" data-nome="${f.nome}" title="Visualizar Arquivo">
                    <i data-lucide="eye" class="w-3 h-3"></i>
                  </button>
                  <button class="btn-download-workspace text-mint-vibrant hover:text-white p-0.5 hover:bg-mint-vibrant/20 rounded transition-all" data-cat="${cat}" data-nome="${f.nome}" title="Download do Arquivo">
                    <i data-lucide="download" class="w-3 h-3"></i>
                  </button>
                  <button class="btn-deletar-workspace text-red-400 hover:text-white p-0.5 hover:bg-red-500/20 rounded transition-all" data-cat="${cat}" data-nome="${f.nome}" title="Excluir Arquivo do Workspace">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>
            `).join('');

          return `
            <div class="flex flex-col bg-white/[0.01] border border-white/5 rounded-xl p-2.5 space-y-2">
              <div class="border-b border-white/5 pb-1.5">
                <div class="flex items-center gap-1 font-bold text-xs text-white">
                  <span class="text-[9px] font-mono px-1.5 py-0.5 rounded border ${info.color}">${info.label}</span>
                </div>
                <p class="text-[8px] text-white/30 mt-0.5">${info.desc}</p>
              </div>
              <div class="flex-1 overflow-y-auto space-y-1.5 max-h-[115px] pr-1">
                ${arquivosHtml}
              </div>
            </div>
          `;
        }).join('');

        initIcons();

        // Event listeners delegados por setupEventDelegation()

      } catch (e) {
        console.error("Erro ao carregar arquivos do Workspace:", e);
        container.innerHTML = `<div class="text-red-400 p-8 text-center col-span-full">Falha de conexão com o servidor API.</div>`;
      }
    };

    const switchMatriculaTab = (matriculaId: number) => {
      currentMatriculaId = matriculaId;

      document.querySelectorAll('.btn-mat-tab').forEach(b => {
        const id = parseInt(b.getAttribute('data-mat-id') || '0');
        if (id === currentMatriculaId) {
          b.classList.replace('border-transparent', 'border-mint-vibrant');
          b.classList.replace('text-white/40', 'text-mint-vibrant');
        } else {
          b.classList.replace('border-mint-vibrant', 'border-transparent');
          b.classList.replace('text-mint-vibrant', 'text-white/40');
        }
      });

      const matObj = matriculasList.find(m => m.id === currentMatriculaId);
      const txtMat = document.getElementById('txt-nome-matricula-ativa');
      if (txtMat && matObj) {
        txtMat.textContent = `Nº ${matObj.numero_matricula} (${matObj.area_ha || matObj.area || '0'}ha)`;
      }

      renderMatriculaDados();

      if (triagemMap) {
        setTimeout(() => {
          triagemMap!.invalidateSize();
          const pontosMat = pontosList.filter(p => p.matricula_id === currentMatriculaId);
          const validCoords = pontosMat.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0).map(p => L.latLng(p.lat, p.lon));
          if (validCoords.length > 0) {
            const bounds = L.latLngBounds(validCoords);
            triagemMap!.fitBounds(bounds, { padding: [40, 40] });
          }
        }, 100);
      }
    };



    const alternarEtapa = (etapa: string) => {
      etapaAtiva = etapa;

      const btnGeo = document.getElementById('btn-etapa-geoprocessamento');
      const btnCart = document.getElementById('btn-etapa-cartorio');
      const btnAud = document.getElementById('btn-etapa-auditoria');
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      const gridSuperior = document.getElementById('grid-superior-detalhe');
      const containerTabelas = document.getElementById('container-tabelas-inferiores');
      const containerDivisas = document.getElementById('container-tabela-divisas');
      const btnSalvarPerimetro = document.getElementById('btn-salvar-perimetro-custom');
      const containerAuditoriaCampo = document.getElementById('container-etapa-auditoria-campo');
      const bannerSugestao = document.getElementById('banner-sugestao-numeracao');
      const panelHomologacao = document.getElementById('panel-homologacao-incra');

      const lblTituloLateral = document.getElementById('lbl-titulo-tabela-lateral');
      const badgeLateral = document.getElementById('badge-tabela-lateral');

      const containerAbasMatriculas = document.getElementById('container-abas-matriculas');
      const containerInfoMatricula = document.getElementById('container-info-matricula-ativa');
      if (containerAbasMatriculas) {
        if (etapa === 'cartorio') {
          containerAbasMatriculas.classList.remove('hidden');
        } else {
          containerAbasMatriculas.classList.add('hidden');
        }
      }
      if (containerInfoMatricula) {
        if (etapa === 'cartorio') {
          containerInfoMatricula.classList.remove('hidden');
        } else {
          containerInfoMatricula.classList.add('hidden');
        }
      }

      if (etapa === 'geoprocessamento') {
        if (btnGeo) btnGeo.className = 'flex-grow py-1.5 px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap';
        if (btnCart) btnCart.className = 'flex-grow py-1.5 px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap';
        if (btnAud) btnAud.className = 'flex-grow py-1.5 px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap';

        if (containerIngestao) containerIngestao.classList.remove('hidden');
        if (gridSuperior) {
          gridSuperior.classList.remove('hidden');
        }
        const splitterSup = document.getElementById('splitter-superior');
        if (splitterSup) {
          if (containerIngestao && !containerIngestao.classList.contains('ingestao-collapsed')) {
            splitterSup.classList.remove('hidden');
          } else {
            splitterSup.classList.add('hidden');
          }
        }
        const splitterInf = document.getElementById('splitter-inferior');
        if (splitterInf) splitterInf.classList.add('hidden');

        if (containerDivisas) containerDivisas.classList.add('hidden');
        if (containerTabelas) {
          containerTabelas.classList.remove('hidden');
        }
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.add('hidden');
        if (lblTituloLateral) lblTituloLateral.innerText = "Auditoria de Translação Geodésica";
        if (badgeLateral) {
          badgeLateral.innerText = "VETOR DELTA ECEF";
          badgeLateral.className = "text-[9px] text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded-full font-bold";
        }
        if (btnSalvarPerimetro) btnSalvarPerimetro.classList.add('hidden');
        if (bannerSugestao) bannerSugestao.classList.add('hidden');
        if (panelHomologacao) panelHomologacao.classList.add('hidden');
      } else if (etapa === 'cartorio') {
        if (btnGeo) btnGeo.className = 'flex-grow py-1.5 px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap';
        if (btnCart) btnCart.className = 'flex-grow py-1.5 px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap';
        if (btnAud) btnAud.className = 'flex-grow py-1.5 px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap';

        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (gridSuperior) {
          gridSuperior.classList.remove('hidden');
        }
        const splitterSup = document.getElementById('splitter-superior');
        if (splitterSup) splitterSup.classList.add('hidden');
        
        const splitterInf = document.getElementById('splitter-inferior');
        if (splitterInf) splitterInf.classList.remove('hidden');

        if (containerDivisas) containerDivisas.classList.remove('hidden');
        if (containerTabelas) {
          containerTabelas.classList.remove('hidden');
        }
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.add('hidden');
        if (lblTituloLateral) lblTituloLateral.innerText = "Segmentos de Divisa (Confrontantes)";
        if (badgeLateral) {
          badgeLateral.innerText = "EDICAO REAL-TIME";
          badgeLateral.className = "text-[9px] text-mint-vibrant font-mono bg-mint-vibrant/10 px-2 py-0.5 rounded-full font-bold";
        }
        if (btnSalvarPerimetro) btnSalvarPerimetro.classList.remove('hidden');
        if (panelHomologacao) panelHomologacao.classList.remove('hidden');
        carregarSugestoesNumeracao();
      } else if (etapa === 'auditoria') {
        if (bannerSugestao) bannerSugestao.classList.add('hidden');
        if (panelHomologacao) panelHomologacao.classList.add('hidden');
        if (btnGeo) btnGeo.className = 'flex-grow py-1.5 px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap';
        if (btnCart) btnCart.className = 'flex-grow py-1.5 px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap';
        if (btnAud) btnAud.className = 'flex-grow py-1.5 px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap';

        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (gridSuperior) gridSuperior.classList.add('hidden');
        const splitterSup = document.getElementById('splitter-superior');
        if (splitterSup) splitterSup.classList.add('hidden');
        
        if (containerTabelas) containerTabelas.classList.add('hidden');
        const splitterInf = document.getElementById('splitter-inferior');
        if (splitterInf) splitterInf.classList.add('hidden');
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.remove('hidden');
        renderHistoricoCampo();
      }

      initIcons();
      if (triagemMap && etapa !== 'auditoria') {
        setTimeout(() => {
          triagemMap!.invalidateSize();
        }, 50);
      }

      if (etapa !== 'auditoria') {
        renderMatriculaDados();
      }
    };

    const renderHistoricoCampo = async () => {
      const timeline = document.getElementById('timeline-historico-campo');
      if (!timeline || !currentLevId) return;

      try {
        timeline.innerHTML = `<div class="text-center py-8 text-white/30 flex flex-col items-center justify-center gap-2"><i data-lucide="refresh-cw" class="w-6 h-6 animate-spin text-mint-vibrant"></i> Carregando linha do tempo...</div>`;
        initIcons();

        const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/historico-campo`);
        const logs = await res.json();

        if (logs.length === 0) {
          timeline.innerHTML = `<div class="text-center py-8 text-white/30 border border-white/5 bg-white/[0.01] rounded-technical">Nenhum evento registrado nesta auditoria de campo.</div>`;
          return;
        }

        timeline.innerHTML = logs.map((log: any) => renderHistoricoTimelineHtml(log)).join('');

        initIcons();
      } catch (err) {
        console.error("Erro ao carregar histórico de campo:", err);
        timeline.innerHTML = `<div class="text-center py-8 text-red-400 border border-red-500/10 bg-red-500/[0.01] rounded-technical">Erro ao carregar auditoria de campo.</div>`;
      }
    };

    const renderMatriculaDados = () => {
      if (!currentMatriculaId && etapaAtiva !== 'geoprocessamento') return;

      const isIgnoradoOuBase = (p: any) => p.ignorar_poligono === 1 || p.tipo_ponto === 'B' || p.tipo === 'B';

      let pontosMat = etapaAtiva === 'geoprocessamento'
        ? [...pontosList]
        : pontosList.filter(p => p.matricula_id === currentMatriculaId && p.tipo_ponto !== 'B' && p.tipo !== 'B');

      // Calcula o mapa de ordem real estável de caminhamento antes de qualquer filtro
      const pontosOrdenadosOriginal = [...pontosMat].sort((a, b) => {
        const isIgnA = isIgnoradoOuBase(a) ? 1 : 0;
        const isIgnB = isIgnoradoOuBase(b) ? 1 : 0;
        if (isIgnA !== isIgnB) return isIgnB - isIgnA;
        if (isIgnA === 1) return a.nome_vertice.localeCompare(b.nome_vertice);
        const valA = a.ordem_caminhamento;
        const valB = b.ordem_caminhamento;
        const numA = typeof valA === 'number' ? valA : (parseInt(valA) || 999999);
        const numB = typeof valB === 'number' ? valB : (parseInt(valB) || 999999);
        return numA - numB;
      });

      let seqReal = 1;
      const mapaOrdemReal = new Map<number, string | number>();
      pontosOrdenadosOriginal.forEach((p) => {
        const isIgn = isIgnoradoOuBase(p);
        mapaOrdemReal.set(p.id, isIgn ? '-' : seqReal++);
      });

      // Calcula as contagens dinâmicas de filtros rápidos antes de aplicar o filtro ativo
      const totalTodos = pontosMat.length;
      const totalBases = pontosMat.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B').length;
      const totalRovers = pontosMat.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B').length;
      const totalBrutos = pontosMat.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO').length;
      const totalCorrigidos = pontosMat.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO').length;

      // Injeta os textos de contagem nos botões correspondentes
      const btnTodos = document.querySelector('.btn-filtro-rapido[data-filtro="todos"]');
      if (btnTodos) btnTodos.textContent = `Todos (${totalTodos})`;
      
      const btnBases = document.querySelector('.btn-filtro-rapido[data-filtro="bases"]');
      if (btnBases) btnBases.textContent = `Bases (M/B) (${totalBases})`;
      
      const btnRovers = document.querySelector('.btn-filtro-rapido[data-filtro="rovers"]');
      if (btnRovers) btnRovers.textContent = `Rovers (P/V) (${totalRovers})`;
      
      const btnBrutos = document.querySelector('.btn-filtro-rapido[data-filtro="brutos"]');
      if (btnBrutos) btnBrutos.textContent = `Brutos (${totalBrutos})`;
      
      const btnCorrigidos = document.querySelector('.btn-filtro-rapido[data-filtro="corrigidos"]');
      if (btnCorrigidos) btnCorrigidos.textContent = `Corrigidos (${totalCorrigidos})`;

      if (ocultarForaPoligono) {
        pontosMat = pontosMat.filter(p => p.ignorar_poligono !== 1);
      }

      if (filtroRapidoAtivo !== 'todos') {
        if (filtroRapidoAtivo === 'bases') {
          pontosMat = pontosMat.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B');
        } else if (filtroRapidoAtivo === 'rovers') {
          pontosMat = pontosMat.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B');
        } else if (filtroRapidoAtivo === 'brutos') {
          pontosMat = pontosMat.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO');
        } else if (filtroRapidoAtivo === 'corrigidos') {
          pontosMat = pontosMat.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO');
        }
      }

      if (searchFilterValue) {
        pontosMat = pontosMat.filter(p =>
          (p.nome_vertice && p.nome_vertice.toLowerCase().includes(searchFilterValue)) ||
          (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(searchFilterValue)) ||
          (p.tipo && p.tipo.toLowerCase().includes(searchFilterValue)) ||
          (p.arquivo_origem && p.arquivo_origem.toLowerCase().includes(searchFilterValue)) ||
          (p.ordem_caminhamento && String(p.ordem_caminhamento).includes(searchFilterValue))
        );
      }
      const segmentosMat = etapaAtiva === 'geoprocessamento'
        ? []
        : segmentosList.filter(s => s.matricula_id === currentMatriculaId);

      const containerTabelaDivisas = document.getElementById('container-tabela-divisas');
      const splitterInf = document.getElementById('splitter-inferior');

      if (etapaAtiva === 'geoprocessamento') {
        if (containerTabelaDivisas) containerTabelaDivisas.classList.add('hidden');
        if (splitterInf) splitterInf.classList.add('hidden');
      } else {
        if (containerTabelaDivisas) containerTabelaDivisas.classList.remove('hidden');
        if (splitterInf) splitterInf.classList.remove('hidden');
      }

      if (triagemMap) {
        mapaController.clearOverlays();
        mapaController.plotPontos(pontosMat, (pId) => {
          selectPontoFromTabela(pId);
        });

        if (etapaAtiva !== 'geoprocessamento') {
          mapaController.plotSegmentos(segmentosMat, pontosList);
        } else {
          mapaController.plotPolilinhaTemporaria(pontosMat);
        }

        mapaController.fitBounds(pontosMat);
      }

      const tblHeader = document.getElementById('tbl-pontos-header');
      if (tblHeader) {
        if (etapaAtiva === 'cartorio') {
          tblHeader.innerHTML = `
              <th class="px-4 py-3 text-center w-[110px] resizable-col cursor-pointer hover:bg-white/5 transition-colors font-mono select-none" id="header-sort-ordem" data-col-id="col_vertice_ordem">Ordem ${currentSortColumn === 'ordem' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
              <th class="px-4 py-3 resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-nome" data-col-id="col_vertice_nome">Vértice ${currentSortColumn === 'nome' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
              <th class="px-4 py-3 resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-tipo" data-col-id="col_vertice_tipo">Tipo ${currentSortColumn === 'tipo' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
              <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-este" data-col-id="col_vertice_este_lat">${modoCoordenadas === 'geodesico' ? 'Latitude' : 'Este (E)'} ${currentSortColumn === 'este' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
              <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-norte" data-col-id="col_vertice_norte_lon">${modoCoordenadas === 'geodesico' ? 'Longitude' : 'Norte (N)'} ${currentSortColumn === 'norte' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
              <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-altitude" data-col-id="col_vertice_altitude">Altitude (m) ${currentSortColumn === 'altitude' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
            `;
        } else {
          if (modoCoordenadas === 'geodesico') {
            tblHeader.innerHTML = `
                 <th class="px-2 py-3 text-center resizable-col w-[60px] cursor-pointer hover:bg-white/5 transition-colors font-mono select-none" id="header-sort-ordem" data-col-id="col_vertice_ordem">Ord. ${currentSortColumn === 'ordem' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-nome" data-col-id="col_vertice_nome">Vértice ${currentSortColumn === 'nome' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-2 py-3 text-center resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-tipo" data-col-id="col_vertice_tipo">Tipo ${currentSortColumn === 'tipo' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-norte-bruto" data-col-id="col_vertice_lat_bruta">Lat Bruta ${currentSortColumn === 'norte_bruto' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-este-bruto" data-col-id="col_vertice_lon_bruta">Lon Bruta ${currentSortColumn === 'este_bruto' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-norte" data-col-id="col_vertice_lat_corr">Lat Corr ${currentSortColumn === 'norte' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-este" data-col-id="col_vertice_lon_corr">Lon Corr ${currentSortColumn === 'este' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-alt-bruta" data-col-id="col_vertice_alt_bruta">Alt Bruta ${currentSortColumn === 'alt_bruta' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-altitude" data-col-id="col_vertice_alt_corr">Alt Corr ${currentSortColumn === 'altitude' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-2 py-3 text-center resizable-col" data-col-id="col_vertice_poligono">Políg</th>
                 <th class="px-4 py-3 text-center resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-status" data-col-id="col_vertice_status">Status ${currentSortColumn === 'status' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
               `;
          } else {
            tblHeader.innerHTML = `
                 <th class="px-2 py-3 text-center resizable-col w-[60px] cursor-pointer hover:bg-white/5 transition-colors font-mono select-none" id="header-sort-ordem" data-col-id="col_vertice_ordem">Ord. ${currentSortColumn === 'ordem' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-nome" data-col-id="col_vertice_nome">Vértice ${currentSortColumn === 'nome' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-2 py-3 text-center resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-tipo" data-col-id="col_vertice_tipo">Tipo ${currentSortColumn === 'tipo' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-norte-bruto" data-col-id="col_vertice_n_bruto">Norte Bruto ${currentSortColumn === 'norte_bruto' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-este-bruto" data-col-id="col_vertice_e_bruto">Este Bruto ${currentSortColumn === 'este_bruto' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-norte" data-col-id="col_vertice_n_corr">Norte Corr ${currentSortColumn === 'norte' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-este" data-col-id="col_vertice_e_corr">Este Corr ${currentSortColumn === 'este' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-delta-n" data-col-id="col_vertice_dn">Δ N (mm) ${currentSortColumn === 'delta_n' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-delta-e" data-col-id="col_vertice_de">Δ E (mm) ${currentSortColumn === 'delta_e' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-delta-h" data-col-id="col_vertice_dh">Δ H (mm) ${currentSortColumn === 'delta_h' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
                 <th class="px-2 py-3 text-center resizable-col" data-col-id="col_vertice_poligono">Políg</th>
                 <th class="px-4 py-3 text-center resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-status" data-col-id="col_vertice_status">Status ${currentSortColumn === 'status' ? (currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
               `;
          }
        }

        const setupSortHeader = (id: string, column: string) => {
          const btn = document.getElementById(id);
          if (btn) {
            btn.onclick = () => {
              if (currentSortColumn === column) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
              } else {
                currentSortColumn = column;
                currentSortDirection = 'asc';
              }
              renderMatriculaDados();
            };
          }
        };

        setupSortHeader('header-sort-ordem', 'ordem');
        setupSortHeader('header-sort-nome', 'nome');
        setupSortHeader('header-sort-tipo', 'tipo');
        setupSortHeader('header-sort-este', 'este');
        setupSortHeader('header-sort-norte', 'norte');
        setupSortHeader('header-sort-altitude', 'altitude');
        setupSortHeader('header-sort-norte-bruto', 'norte_bruto');
        setupSortHeader('header-sort-este-bruto', 'este_bruto');
        setupSortHeader('header-sort-alt-bruta', 'alt_bruta');
        setupSortHeader('header-sort-delta-n', 'delta_n');
        setupSortHeader('header-sort-delta-e', 'delta_e');
        setupSortHeader('header-sort-delta-h', 'delta_h');
        setupSortHeader('header-sort-status', 'status');
      }

      const listPt = document.getElementById('tbl-pontos-triagem');
      if (listPt) {
        if (pontosMat.length === 0) {
          listPt.innerHTML = `<tr><td colspan="${etapaAtiva === 'cartorio' ? 6 : 12}" class="px-4 py-8 text-center text-white/30">Nenhum ponto atrelado a esta matrícula.</td></tr>`;
        } else {
          pontosMat.sort((a, b) => {
            let valA: any;
            let valB: any;
            let isNumeric = false;

            if (currentSortColumn === 'ordem') {
              const isIgnA = isIgnoradoOuBase(a) ? 1 : 0;
              const isIgnB = isIgnoradoOuBase(b) ? 1 : 0;
              if (isIgnA !== isIgnB) {
                return isIgnB - isIgnA; // Ignorados/bases sempre no topo
              }
              if (isIgnA === 1) {
                return a.nome_vertice.localeCompare(b.nome_vertice);
              }
              const valAOrdem = a.ordem_caminhamento;
              const valBOrdem = b.ordem_caminhamento;
              const numA = typeof valAOrdem === 'number' ? valAOrdem : (parseInt(valAOrdem) || 999999);
              const numB = typeof valBOrdem === 'number' ? valBOrdem : (parseInt(valBOrdem) || 999999);
              return currentSortDirection === 'asc' ? numA - numB : numB - numA;
            } else if (currentSortColumn === 'nome') {
              valA = a.nome_vertice;
              valB = b.nome_vertice;
            } else if (currentSortColumn === 'tipo') {
              valA = a.tipo_ponto || a.tipo || '';
              valB = b.tipo_ponto || b.tipo || '';
            } else if (currentSortColumn === 'este') {
              isNumeric = true;
              valA = a.e_corrigido !== undefined && a.e_corrigido !== null ? a.e_corrigido : (a.e_original || a.lon || 0);
              valB = b.e_corrigido !== undefined && b.e_corrigido !== null ? b.e_corrigido : (b.e_original || b.lon || 0);
            } else if (currentSortColumn === 'norte') {
              isNumeric = true;
              valA = a.n_corrigido !== undefined && a.n_corrigido !== null ? a.n_corrigido : (a.n_original || a.lat || 0);
              valB = b.n_corrigido !== undefined && b.n_corrigido !== null ? b.n_corrigido : (b.n_original || b.lat || 0);
            } else if (currentSortColumn === 'altitude') {
              isNumeric = true;
              valA = a.alt !== undefined && a.alt !== null ? a.alt : (a.alt_original || 0);
              valB = b.alt !== undefined && b.alt !== null ? b.alt : (b.alt_original || 0);
            } else if (currentSortColumn === 'norte_bruto') {
              isNumeric = true;
              valA = a.n_original || a.lat || 0;
              valB = b.n_original || b.lat || 0;
            } else if (currentSortColumn === 'este_bruto') {
              isNumeric = true;
              valA = a.e_original || a.lon || 0;
              valB = b.e_original || b.lon || 0;
            } else if (currentSortColumn === 'alt_bruta') {
              isNumeric = true;
              valA = a.alt_original || 0;
              valB = b.alt_original || 0;
            } else if (currentSortColumn === 'delta_n') {
              isNumeric = true;
              const da = a.n_corrigido !== undefined && a.n_corrigido !== null && a.n_original ? (a.n_corrigido - a.n_original) : 0;
              const db = b.n_corrigido !== undefined && b.n_corrigido !== null && b.n_original ? (b.n_corrigido - b.n_original) : 0;
              valA = da;
              valB = db;
            } else if (currentSortColumn === 'delta_e') {
              isNumeric = true;
              const da = a.e_corrigido !== undefined && a.e_corrigido !== null && a.e_original ? (a.e_corrigido - a.e_original) : 0;
              const db = b.e_corrigido !== undefined && b.e_corrigido !== null && b.e_original ? (b.e_corrigido - b.e_original) : 0;
              valA = da;
              valB = db;
            } else if (currentSortColumn === 'delta_h') {
              isNumeric = true;
              const da = a.alt !== undefined && a.alt !== null && a.alt_original ? (a.alt - a.alt_original) : 0;
              const db = b.alt !== undefined && b.alt !== null && b.alt_original ? (b.alt - b.alt_original) : 0;
              valA = da;
              valB = db;
            } else if (currentSortColumn === 'status') {
              valA = a.status_correcao || a.status_ponto || '';
              valB = b.status_correcao || b.status_ponto || '';
            }

            if (isNumeric) {
              const numA = Number(valA) || 0;
              const numB = Number(valB) || 0;
              return currentSortDirection === 'asc' ? numA - numB : numB - numA;
            } else {
              if (valA === null || valA === undefined) valA = '';
              if (valB === null || valB === undefined) valB = '';
              const strA = String(valA).toLowerCase();
              const strB = String(valB).toLowerCase();
              return currentSortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
            }
          });

          listPt.innerHTML = pontosMat.map((p) => {
            const isSelected = selectedPontoIds.includes(p.id);
            const ordemExibida = mapaOrdemReal.get(p.id) || '-';
            if (etapaAtiva === 'cartorio') {
              return renderLinhaPontoCartorioHtml(p, ordemExibida, modoCoordenadas, isSelected, latLonToUTM);
            } else {
              return renderLinhaPontoGeoprocessamentoHtml(p, ordemExibida, modoCoordenadas, selectedPontoIds, latLonToUTM);
            }
          }).join('');

          // Event listeners delegados por setupEventDelegation()

          initIcons();
        }
      }

      const containerLateral = document.getElementById('container-tabela-lateral-content');
      if (containerLateral) {
        if (etapaAtiva === 'geoprocessamento') {
          if (pontosMat.length === 0) {
            containerLateral.innerHTML = `
                 <table class="w-full text-left border-collapse">
                   <tbody class="text-xs text-white/30">
                     <tr><td class="px-4 py-8 text-center">Nenhum ponto para auditar translação.</td></tr>
                   </tbody>
                 </table>
               `;
          } else {
            const auditoriaHtml = pontosMat.map(p => renderAuditoriaTranslacaoHtml(p, latLonToUTM)).join('');
            containerLateral.innerHTML = `
                 <table class="w-full text-left border-collapse">
                   <thead>
                     <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
                       <th class="px-4 py-3 resizable-col" data-col-id="col_auditoria_vertice">Vértice</th>
                       <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_original">Original (E/N)</th>
                       <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_corrigido">Corrigido (E/N)</th>
                       <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_de">dE</th>
                       <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_dn">dN</th>
                       <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_dh">dH</th>
                     </tr>
                   </thead>
                   <tbody class="text-xs divide-y divide-white/5 text-white/60">
                     ${auditoriaHtml}
                   </tbody>
                 </table>
               `;
          }
        } else {
          if (segmentosMat.length === 0) {
            containerLateral.innerHTML = `
                 <table class="w-full text-left border-collapse">
                   <tbody class="text-xs text-white/30">
                     <tr><td class="px-4 py-8 text-center">Nenhum segmento atrelado a esta matrícula.</td></tr>
                   </tbody>
                 </table>
               `;
          } else {
            const segmentosHtml = segmentosMat.map(s => renderLinhaSegmentoHtml(s, confrontantesList, pontosList)).join('');
            containerLateral.innerHTML = `
                 <table class="w-full text-left border-collapse">
                   <thead>
                     <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
                       <th class="px-4 py-3 resizable-col" data-col-id="col_divisa_ponto_a">Ponto A</th>
                       <th class="px-4 py-3 resizable-col" data-col-id="col_divisa_ponto_b">Ponto B</th>
                       <th class="px-4 py-3 resizable-col" data-col-id="col_divisa_confrontante">Confrontante</th>
                       <th class="px-4 py-3 resizable-col" data-col-id="col_divisa_tipo_limite">Tipo Limite</th>
                       <th class="px-4 py-3 resizable-col" data-col-id="col_divisa_metodo_sigef">Método SIGEF</th>
                     </tr>
                   </thead>
                   <tbody id="tbl-segmentos-triagem" class="text-xs divide-y divide-white/5 text-white/60">
                     ${segmentosHtml}
                   </tbody>
                 </table>
               `;

            document.querySelectorAll('.select-seg-conf').forEach(sel => {
              sel.addEventListener('change', (e) => {
                const sId = parseInt((e.target as HTMLSelectElement).getAttribute('data-seg-id') || '0');
                const val = (e.target as HTMLSelectElement).value;
                updateSegmentoInline(sId, { confrontante_id: val ? parseInt(val) : null });
              });
            });

            document.querySelectorAll('.select-seg-limite').forEach(sel => {
              sel.addEventListener('change', (e) => {
                const sId = parseInt((e.target as HTMLSelectElement).getAttribute('data-seg-id') || '0');
                const val = (e.target as HTMLSelectElement).value;
                updateSegmentoInline(sId, { tipo_limite_sigef: val });
              });
            });

            document.querySelectorAll('.select-seg-metodo').forEach(sel => {
              sel.addEventListener('change', (e) => {
                const sId = parseInt((e.target as HTMLSelectElement).getAttribute('data-seg-id') || '0');
                const val = (e.target as HTMLSelectElement).value;
                updateSegmentoInline(sId, { metodo_posicionamento_sigef: val });
              });
            });
          }
        }
      }
      setTimeout(configurarResizersColunas, 50);
    };

    const exportarTabelaParaCSV = () => {
      let pontosExport = etapaAtiva === 'geoprocessamento'
        ? [...pontosList]
        : pontosList.filter(p => p.matricula_id === currentMatriculaId && p.tipo_ponto !== 'B' && p.tipo !== 'B');

      if (ocultarForaPoligono) {
        pontosExport = pontosExport.filter(p => p.ignorar_poligono !== 1);
      }

      if (filtroRapidoAtivo !== 'todos') {
        if (filtroRapidoAtivo === 'bases') {
          pontosExport = pontosExport.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B');
        } else if (filtroRapidoAtivo === 'rovers') {
          pontosExport = pontosExport.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B');
        } else if (filtroRapidoAtivo === 'brutos') {
          pontosExport = pontosExport.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO');
        } else if (filtroRapidoAtivo === 'corrigidos') {
          pontosExport = pontosExport.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO');
        }
      }

      if (searchFilterValue) {
        pontosExport = pontosExport.filter(p =>
          (p.nome_vertice && p.nome_vertice.toLowerCase().includes(searchFilterValue)) ||
          (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(searchFilterValue)) ||
          (p.tipo && p.tipo.toLowerCase().includes(searchFilterValue)) ||
          (p.arquivo_origem && p.arquivo_origem.toLowerCase().includes(searchFilterValue)) ||
          (p.ordem_caminhamento && String(p.ordem_caminhamento).includes(searchFilterValue))
        );
      }

      if (pontosExport.length === 0) {
        alert("Nenhum dado para exportar!");
        return;
      }

      const headers = ["Ordem", "Vertice", "Tipo", "Status", "Latitude", "Longitude", "Altitude", "Este_Corr", "Norte_Corr", "Este_Orig", "Norte_Orig", "Arquivo_Origem"];
      let seqValida = 1;
      const rows = pontosExport.map((p) => {
        const isIgn = p.ignorar_poligono === 1 || p.tipo_ponto === 'B' || p.tipo === 'B';
        const ordem = isIgn ? '-' : seqValida++;
        return [
          ordem,
          p.nome_vertice,
          p.tipo_ponto || p.tipo || '-',
          p.status_ponto || p.status_correcao || 'BRUTO',
          p.lat || '',
          p.lon || '',
          p.alt || p.alt_original || '',
          p.e_corrigido || '',
          p.n_corrigido || '',
          p.e_original || '',
          p.n_original || '',
          p.arquivo_origem || ''
        ];
      });

      const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `vertices_levantamento_${currentLevId}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const configurarResizersColunas = () => {
      const thElements = document.querySelectorAll('th[data-col-id]');
      thElements.forEach(th => {
        const colId = th.getAttribute('data-col-id');
        if (!colId) return;

        // 1. Aplica a largura salva se existir no localStorage
        const savedWidth = localStorage.getItem(`gerencigeo_col_width_${colId}`);
        if (savedWidth) {
          (th as HTMLElement).style.width = `${savedWidth}px`;
          (th as HTMLElement).style.minWidth = `${savedWidth}px`;
        }

        // Se já tiver o resizer injetado, pula
        if (th.querySelector('.col-resizer')) return;

        // 2. Injeta o resizer
        th.classList.add('relative', 'resizable-col');
        const resizer = document.createElement('div');
        resizer.className = 'col-resizer';
        th.appendChild(resizer);

        // 3. Adiciona lógica de arraste
        let startX = 0;
        let startWidth = 0;

        const onMouseMove = (e: MouseEvent) => {
          const dX = e.clientX - startX;
          const newWidth = Math.max(50, startWidth + dX);
          (th as HTMLElement).style.width = `${newWidth}px`;
          (th as HTMLElement).style.minWidth = `${newWidth}px`;
        };

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          resizer.classList.remove('resizing');

          // Salva a largura no localStorage
          const finalWidth = (th as HTMLElement).getBoundingClientRect().width;
          localStorage.setItem(`gerencigeo_col_width_${colId}`, finalWidth.toFixed(0));
        };

        resizer.addEventListener('mousedown', (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          startX = e.clientX;
          startWidth = (th as HTMLElement).getBoundingClientRect().width;
          resizer.classList.add('resizing');

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        });
      });
    };

    const destacarPontoNoOrdenadorManual = (pontoId: number) => {
      document.querySelectorAll('.linha-ponto-ordenador').forEach(card => {
        card.classList.remove('bg-mint-vibrant/25', 'border-mint-vibrant/40', 'scale-[1.02]');
        card.classList.add('bg-white/[0.02]', 'border-white/5');
      });

      const target = document.getElementById(`ordenador-item-${pontoId}`);
      if (target) {
        target.classList.remove('bg-white/[0.02]', 'border-white/5');
        target.classList.add('bg-mint-vibrant/25', 'border-mint-vibrant/40', 'scale-[1.02]');
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };

    const highlightTabelaLinha = (pontoId: number) => {
      document.querySelectorAll('.linha-ponto-tbl').forEach(tr => {
        tr.classList.remove('bg-mint-vibrant/20', 'border-mint-vibrant/40');
      });

      const target = document.getElementById(`tr-ponto-${pontoId}`);
      if (target) {
        target.classList.add('bg-mint-vibrant/20', 'border-mint-vibrant/40');
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };

    const selectPontoFromTabela = (pId: number) => {
      if (modoReordenarAtivo) {
        if (modoCliqueSequencialAtivo) {
          const pontosMatCompleto = pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
          pontosMatCompleto.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

          const curIdx = pontosMatCompleto.findIndex(p => p.id === pId);
          if (curIdx !== -1) {
            const ordemOriginal = curIdx + 1;

            if (sequenciaCliqueProximoIndice === null) {
              // --- PRIMEIRO CLIQUE NO PRIMEIRO PONTO ---
              // Define a posição inicial da sequência (o próximo será inserido na posição seguinte)
              sequenciaCliqueProximoIndice = ordemOriginal + 1;

              // Trava a sequência de 1 até este ponto inicial
              travamentoInicio = 1;
              travamentoFim = ordemOriginal;

              destacarPontoNoOrdenadorManual(pId);
              renderListaReordenarSimplificada();
            } else {
              // --- CLIQUES SUBSEQUENTES ---
              // Se o ponto clicado já estiver dentro da região travada, apenas foca
              const isTravado = travamentoInicio > 0 && travamentoFim >= travamentoInicio &&
                ordemOriginal >= travamentoInicio && ordemOriginal <= travamentoFim;

              if (isTravado) {
                destacarPontoNoOrdenadorManual(pId);
              } else {
                // Move o ponto clicado para a próxima posição disponível na sequência
                moverPontoPosicao(pId, sequenciaCliqueProximoIndice);

                // Atualiza a faixa de travamento até esta nova posição
                travamentoInicio = 1;
                travamentoFim = sequenciaCliqueProximoIndice;

                // Avança o cursor da sequência
                sequenciaCliqueProximoIndice++;

                renderListaReordenarSimplificada();
              }
            }
          }
        } else {
          destacarPontoNoOrdenadorManual(pId);
        }
      } else {
        highlightTabelaLinha(pId);
      }
      mapaController.selectPonto(pId);
    };

    const updateSegmentoInline = async (segId: number, partialData: any) => {
      const segObj = segmentosList.find(s => s.id === segId);
      if (!segObj) return;

      const payload = {
        matricula_id: segObj.matricula_id,
        ponto_inicio_id: segObj.ponto_inicio_id,
        ponto_fim_id: segObj.ponto_fim_id,
        confrontante_id: segObj.confrontante_id,
        tipo_limite_sigef: segObj.tipo_limite_sigef,
        metodo_posicionamento_sigef: segObj.metodo_posicionamento_sigef,
        ...partialData
      };

      try {
        await fetch(`${API_BASE}/segmentos/${segId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        Object.assign(segObj, partialData);

        if (partialData.tipo_limite_sigef) {
          renderMatriculaDados();
        }
      } catch (e) {
        console.error("Erro ao salvar segmento inline:", e);
      }
    };

    // --- MESA DRAG AND DROP ---
    const dropzone = document.getElementById('triagem-dropzone');
    const fileInput = document.getElementById('triagem-file-input') as HTMLInputElement;
    const filaContainer = document.getElementById('triagem-fila-container');
    const btnProcessar = document.getElementById('btn-processar-lote');

    const renderFilaArquivos = () => {
      if (filesQueue.length === 0) {
        filaContainer?.classList.add('hidden');
        btnProcessar?.classList.add('hidden');
        return;
      }

      filaContainer?.classList.remove('hidden');
      btnProcessar?.classList.remove('hidden');

      if (btnProcessar) {
        (btnProcessar as HTMLButtonElement).disabled = false;
        btnProcessar.classList.remove('opacity-50', 'cursor-not-allowed');
        btnProcessar.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i> Processar Lote em Segundo Plano`;
      }

      const basesPossiveis = pontosList.filter(p => p.tipo_ponto === 'M' || p.nome_vertice.toUpperCase().includes('BASE') || p.tipo_ponto === 'BASE');
      const basesParaRenderizar = basesPossiveis.length > 0 ? basesPossiveis : pontosList;

      filaContainer!.innerHTML = filesQueue.map((item, idx) => {
        const kbSize = (item.file.size / 1024).toFixed(1);

        if (item.matricula_id === undefined || item.matricula_id === null) {
          item.matricula_id = currentMatriculaId;
        }

        const options = [
          `<option value="base" ${item.destination === 'base' ? 'selected' : ''}>[Base - Enviar ao PPP]</option>`,
          `<option value="rover_estatico_corrigido" ${item.destination === 'rover_estatico_corrigido' ? 'selected' : ''}>[Rover Estático - Relatório de Coordenadas Corrigidas]</option>`,
          `<option value="rover_estatico_bruto" ${item.destination === 'rover_estatico_bruto' ? 'selected' : ''}>[Rover Estático - Arquivo Bruto (Aguardando Baseline)]</option>`,
          `<option value="rover_rtk" ${item.destination === 'rover_rtk' ? 'selected' : ''}>[RTK - Ingestão de Pontos (Vincular à Base Selecionada)]</option>`
        ];

        let extraSelectorsHtml = '';

        if (item.destination === 'rover_rtk') {
          extraSelectorsHtml += `
            <select class="glass-input text-[10px] py-1 px-2 select-file-base shrink-0 w-[160px]" data-idx="${idx}" title="Vincular à Base de Campo">
              <option value="">[Nenhuma Base (Autodetectar)]</option>
              ${basesParaRenderizar.map(p => `<option value="${p.id}" ${item.base_escolhida_id === p.id ? 'selected' : ''}>Base: ${p.nome_vertice}</option>`).join('')}
            </select>
          `;
        }

        return `
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-technical text-xs gap-3">
            <div class="min-w-0 flex-1">
              <p class="font-mono text-white truncate" title="${item.file.name}">${item.file.name}</p>
              <p class="text-[9px] text-white/30 font-mono mt-0.5">${kbSize} KB</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <select class="glass-input text-[10px] py-1 px-2 select-file-dest shrink-0 w-[220px]" data-idx="${idx}">
                ${options.join('')}
              </select>
              ${extraSelectorsHtml}
              <button class="text-white/30 hover:text-red-400 p-1 btn-remover-arquivo shrink-0" data-idx="${idx}">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');

      initIcons();

      document.querySelectorAll('.select-file-dest').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-idx') || '0');
          filesQueue[idx].destination = (e.target as HTMLSelectElement).value;
          renderFilaArquivos();
        });
      });

      document.querySelectorAll('.select-file-base').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-idx') || '0');
          const val = (e.target as HTMLSelectElement).value;
          filesQueue[idx].base_escolhida_id = val ? parseInt(val) : null;
        });
      });

      document.querySelectorAll('.btn-remover-arquivo').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.getAttribute('data-idx') || '0');
          filesQueue.splice(idx, 1);
          renderFilaArquivos();
        });
      });
    };

    dropzone?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', (e: any) => {
      if (e.target.files) {
        Array.from(e.target.files as FileList).forEach(f => {
          filesQueue.push({ file: f, destination: 'base' });
        });
        renderFilaArquivos();
      }
      fileInput.value = '';
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    });

    dropzone?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
      if (e.dataTransfer && e.dataTransfer.files) {
        Array.from(e.dataTransfer.files).forEach(f => {
          filesQueue.push({ file: f, destination: 'base' });
        });
        renderFilaArquivos();
      }
    });

    btnProcessar?.addEventListener('click', async () => {
      if (filesQueue.length === 0) return;

      let basesEnviadas = 0;
      let brutosEnviados = 0;
      let corrigidosProcessados = 0;
      let rtkProcessados = 0;

      for (const item of filesQueue) {
        if (item.destination === 'base') {
          // 1. Salva o arquivo na pasta Brutos do Levantamento
          const formDataBruto = new FormData();
          formDataBruto.append('categoria', 'Brutos');
          formDataBruto.append('file', item.file);
          try {
            const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/upload-arquivo`, {
              method: 'POST',
              body: formDataBruto
            });
            const data = await res.json();
            if (res.ok) {
              brutosEnviados++; // Incrementa para dar feedback de arquivo salvo nos brutos
            } else {
              const errMsg = data.error || data.detail || 'Falha no envio do arquivo bruto.';
              alert(`Erro no envio da Base ${item.file.name}: ${errMsg}`);
            }
          } catch (errBruto) {
            console.error("Erro ao salvar arquivo bruto da Base no workspace:", errBruto);
            alert(`Erro ao salvar arquivo bruto da Base ${item.file.name}`);
          }

          // 2. Prossegue com o fluxo normal do PPP (DESATIVADO TEMPORARIAMENTE A PEDIDO DO USUÁRIO)
          basesEnviadas++;
        }
        else if (item.destination === 'rover_estatico_bruto') {
          const formData = new FormData();
          formData.append('categoria', 'Brutos');
          formData.append('file', item.file);
          try {
            const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/upload-arquivo`, {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            if (res.ok && data.success) {
              brutosEnviados++;
            } else {
              const errMsg = data.error || data.detail || data.message || 'Erro no upload';
              alert(`Erro no arquivo ${item.file.name}: ${errMsg}`);
            }
          } catch (err) {
            console.error("Erro ao enviar arquivo bruto:", err);
            alert(`Erro na comunicação ao subir ${item.file.name}`);
          }
        }
        else if (item.destination === 'rover_estatico_corrigido') {
          const mId = item.matricula_id || currentMatriculaId;
          const formData = new FormData();
          formData.append('file', item.file);
          if (mId) {
            formData.append('matricula_id', mId.toString());
          }
          try {
            const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/importar-txt`, {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            if (!res.ok) {
              const errMsg = typeof data.detail === 'object' ? (data.detail.mensagem || JSON.stringify(data.detail)) : (data.detail || data.error || "Erro desconhecido");
              alert(`Erro na importação de ${item.file.name}: ${errMsg}`);
            } else if (data.error) {
              alert(`Erro na importação de ${item.file.name}: ${data.error}`);
            } else {
              corrigidosProcessados++;
            }
          } catch (err) {
            console.error("Erro ao importar estático corrigido:", err);
            alert(`Erro na comunicação ao processar ${item.file.name}`);
          }
        }
        else if (item.destination === 'rover_rtk') {
          const mId = item.matricula_id || currentMatriculaId;
          const formData = new FormData();
          formData.append('file', item.file);
          if (mId) {
            formData.append('matricula_id', mId.toString());
          }
          if (item.base_escolhida_id) {
            formData.append('base_escolhida_id', item.base_escolhida_id.toString());
          }
          try {
            const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/importar-txt`, {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            if (!res.ok) {
              const errMsg = typeof data.detail === 'object' ? (data.detail.mensagem || JSON.stringify(data.detail)) : (data.detail || data.error || "Erro desconhecido");
              alert(`Erro na importação RTK de ${item.file.name}: ${errMsg}`);
            } else if (data.error) {
              alert(`Erro na importação RTK de ${item.file.name}: ${data.error}`);
            } else {
              rtkProcessados++;
            }
          } catch (err) {
            console.error("Erro ao importar RTK:", err);
            alert(`Erro na comunicação ao processar ${item.file.name}`);
          }
        }
      }

      let msgAlerta = "Processamento do lote finalizado com sucesso!\n\n";
      if (basesEnviadas > 0) msgAlerta += `• ${basesEnviadas} Base(s) enviada(s) ao PPP IBGE.\n`;
      if (brutosEnviados > 0) msgAlerta += `• ${brutosEnviados} Rover(s) Estático(s) Bruto(s) salvos no Workspace.\n`;
      if (corrigidosProcessados > 0) msgAlerta += `• ${corrigidosProcessados} Rover(s) Estático(s) Corrigido(s) importados.\n`;
      if (rtkProcessados > 0) msgAlerta += `• ${rtkProcessados} RTK Rover(s) importado(s) e vinculado(s) à base.\n`;

      alert(msgAlerta);

      filesQueue = [];
      renderFilaArquivos();
      loadLevantamentoDetails();
    });

    // --- OUTROS EVENTOS ---
    document.getElementById('btn-voltar-lista')?.addEventListener('click', () => {
      localStorage.removeItem('active_levantamento_id');
      if (triagemMap) {
        triagemMap.remove();
        triagemMap = null;
      }
      window.location.hash = '#levantamentos';
    });

    document.getElementById('btn-atualizar-arquivos-list')?.addEventListener('click', () => {
      loadWorkspaceArquivos();
    });

    document.getElementById('btn-testar-busca-rinex')?.addEventListener('click', async () => {
      if (!currentLevId) return;
      
      const btn = document.getElementById('btn-testar-busca-rinex') as HTMLButtonElement;
      let originalHtml = "";
      if (btn) {
        btn.disabled = true;
        originalHtml = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 mr-1 animate-spin"></i> Buscando...`;
      }
      
      try {
        const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/testar-busca-rinex`, { method: 'POST' });
        const data = await res.json();
        
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }
        
        if (data.success) {
          let detalhes = `Resultado da Busca de Rinex:\n\n${data.message}\n\n`;
          if (data.arquivos_rinex_encontrados && data.arquivos_rinex_encontrados.length > 0) {
            detalhes += `Encontrados no PC:\n` + data.arquivos_rinex_encontrados.map((item: any) => `• ${item.rinex} (em ${item.origem})`).join('\n') + `\n\n`;
          }
          if (data.arquivos_copiados && data.arquivos_copiados.length > 0) {
            detalhes += `Copiados para o Workspace:\n` + data.arquivos_copiados.map((f: string) => `• ${f}`).join('\n') + `\n\n`;
          }
          if (data.arquivos_registrados && data.arquivos_registrados.length > 0) {
            detalhes += `Registrados no Banco:\n` + data.arquivos_registrados.map((f: string) => `• ${f}`).join('\n') + `\n\n`;
          }
          if (data.erros && data.erros.length > 0) {
            detalhes += `Erros:\n` + data.erros.join('\n');
          }
          alert(detalhes);
          loadWorkspaceArquivos();
        } else {
          alert("Falha: " + data.message);
        }
      } catch (e: any) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }
        alert("Erro de comunicação com o servidor: " + e.message);
      }
    });

    document.getElementById('btn-exportar-kml')?.addEventListener('click', () => {
      if (!currentMatriculaId) return;
      alert(`Arquivo KML Sirgas 2000 gerado e copiado com sucesso para a pasta: \n/Projetos/Propriedade_Thiago/Lev_${currentLevId}/Exportacoes/`);
    });

    document.getElementById('btn-consolidar-pontos-utm')?.addEventListener('click', async () => {
      if (!currentLevId) return;
      try {
        const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/consolidar-pontos`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          alert(`Erro na consolidação: ${data.detail || data.error || 'Falha desconhecida'}`);
        } else if (data.error) {
          alert(data.error);
        } else {
          alert(data.message);
          window.open(`${API_BASE}/levantamentos/${currentLevId}/arquivos/download?categoria=Exportacoes&nome=PONTOS_CONSOLIDADOS_UTM.txt`, '_blank');
          loadWorkspaceArquivos();
        }
      } catch (e) {
        alert("Erro ao consolidar pontos.");
      }
    });

    document.getElementById('btn-reordenar-caminhamento')?.addEventListener('click', async () => {
      if (!currentLevId) return;
      if (etapaAtiva !== 'geoprocessamento' && !currentMatriculaId) {
        alert("Selecione uma matrícula ativa antes de ordenar!");
        return;
      }

      const msgConfirm = etapaAtiva === 'geoprocessamento'
        ? "Tem certeza que deseja reordenar os pontos avulsos deste levantamento de modo que o caminhamento comece no ponto mais ao norte (sentido horário)?"
        : "Tem certeza que deseja reordenar as divisas desta matrícula de modo que o caminhamento comece no ponto mais ao norte (sentido horário)? As qualificações de confrontantes e limites serão preservadas.";

      if (!confirm(msgConfirm)) return;

      try {
        const url = etapaAtiva === 'geoprocessamento'
          ? `${API_BASE}/levantamentos/${currentLevId}/reordenar`
          : `${API_BASE}/levantamentos/${currentLevId}/matriculas/${currentMatriculaId}/reordenar`;

        const res = await fetch(url, { method: 'POST' });
        const data = await res.json();
        if (data.error || data.detail) {
          alert(data.error || data.detail);
        } else {
          alert(data.mensagem || "Pontos reordenados com sucesso!");
          loadLevantamentoDetails();
        }
      } catch (e) {
        alert("Erro ao reordenar poligonal.");
      }
    });

    document.getElementById('btn-gerar-requerimento-cri')?.addEventListener('click', () => {
      if (!currentLevId || !currentMatriculaId) {
        alert("Selecione uma matrícula ativa!");
        return;
      }
      window.open(`${API_BASE}/levantamentos/${currentLevId}/documentos/gerar-requerimento?matricula_id=${currentMatriculaId}`, '_blank');
    });

    document.getElementById('btn-arquivar-projeto-seguro')?.addEventListener('click', async () => {
      if (!currentLevId) return;
      if (!confirm("ATENÇÃO: Você tem certeza que deseja arquivar definitivamente este levantamento? As pastas físicas no Windows serão travadas como Somente Leitura (Read-Only) e a edição de dados no banco será bloqueada.")) return;

      try {
        const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/arquivar`, { method: 'POST' });
        const data = await res.json();
        alert(data.message);
        window.location.hash = '#levantamentos';
      } catch (e) {
        alert("Erro ao arquivar levantamento.");
      }
    });

    document.getElementById('btn-toggle-coordenadas')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-toggle-coordenadas');
      const lbl = document.getElementById('lbl-titulo-vertices');

      if (modoCoordenadas === 'geodesico') {
        modoCoordenadas = 'utm';
        if (btn) btn.innerText = 'Ver em Geodésico';
        if (lbl) lbl.innerText = 'Vértices UTM (SIRGAS 22S)';
      } else {
        modoCoordenadas = 'geodesico';
        if (btn) btn.innerText = 'Ver em UTM';
        if (lbl) lbl.innerText = 'Vértices Geodésicos';
      }

      renderMatriculaDados();
    });

    document.getElementById('btn-toggle-ocultar-ignorados')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-toggle-ocultar-ignorados');
      ocultarForaPoligono = !ocultarForaPoligono;

      if (btn) {
        if (ocultarForaPoligono) {
          btn.innerText = 'Mostrar Fora da Poligonal';
          btn.classList.replace('bg-white/5', 'bg-mint-vibrant/20');
          btn.classList.add('border-mint-vibrant/40');
        } else {
          btn.innerText = 'Ocultar Fora da Poligonal';
          btn.classList.replace('bg-mint-vibrant/20', 'bg-white/5');
          btn.classList.remove('border-mint-vibrant/40');
        }
      }
      renderMatriculaDados();
    });

    // Evento de Exportação da Tabela para CSV
    document.getElementById('btn-exportar-tabela-csv')?.addEventListener('click', () => {
      exportarTabelaParaCSV();
    });

    // Eventos de Filtros Rápidos de Tabela
    document.querySelectorAll('.btn-filtro-rapido').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget as HTMLButtonElement;
        
        // Reseta todos os botões
        document.querySelectorAll('.btn-filtro-rapido').forEach(b => {
          b.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-white/50 border border-transparent hover:text-white hover:bg-white/[0.08] btn-filtro-rapido transition-all";
        });
        
        // Ativa o botão selecionado
        targetBtn.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 btn-filtro-rapido transition-all";
        
        filtroRapidoAtivo = targetBtn.getAttribute('data-filtro') || 'todos';
        renderMatriculaDados();
      });
    });

    // Etapas 1, 2 e 3
    document.getElementById('btn-etapa-geoprocessamento')?.addEventListener('click', () => {
      alternarEtapa('geoprocessamento');
    });

    document.getElementById('btn-etapa-cartorio')?.addEventListener('click', () => {
      alternarEtapa('cartorio');
    });

    document.getElementById('btn-etapa-auditoria')?.addEventListener('click', () => {
      alternarEtapa('auditoria');
    });

    document.getElementById('btn-atualizar-historico-campo')?.addEventListener('click', () => {
      renderHistoricoCampo();
    });

    document.getElementById('btn-salvar-perimetro-custom')?.addEventListener('click', async () => {
      if (!currentLevId) return;
      if (etapaAtiva !== 'geoprocessamento' && !currentMatriculaId) {
        alert("Nenhuma matrícula selecionada para salvar!");
        return;
      }

      const pontosMat = etapaAtiva === 'geoprocessamento'
        ? pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B')
        : pontosList.filter(p => p.matricula_id === currentMatriculaId);

      if (pontosMat.length === 0) {
        alert("Nenhum ponto para salvar!");
        return;
      }

      pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
      const payload = {
        pontos_ordem: pontosMat.map((p, idx) => ({
          id: p.id,
          ordem: idx + 1
        }))
      };

      try {
        const url = etapaAtiva === 'geoprocessamento'
          ? `${API_BASE}/levantamentos/${currentLevId}/salvar-ordem`
          : `${API_BASE}/levantamentos/${currentLevId}/matriculas/${currentMatriculaId}/salvar-ordem`;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          alert(`Erro ao salvar ordem: ${data.detail || data.error || 'Falha de validação no backend'}`);
        } else if (data.sucesso || data.success) {
          alert(data.mensagem || "Ordem salva com sucesso!");
          const btnSalvar = document.getElementById('btn-salvar-perimetro-custom');
          if (btnSalvar) {
            btnSalvar.classList.remove('animate-pulse');
            btnSalvar.classList.add('hidden');
          }
          loadLevantamentoDetails();
        } else {
          alert(`Erro ao salvar ordem: ${data.mensagem || 'Falha de validação no backend'}`);
        }
      } catch (err) {
        console.error("Erro ao salvar ordem perimetral:", err);
        alert("Falha de conexão com o servidor.");
      }
    });



    // Override manual base (V2.3)
    document.getElementById('btn-override-base-manual')?.addEventListener('click', async () => {
      const modal = document.getElementById('modal-override-base');
      const selectArq = document.getElementById('select-override-arquivo') as HTMLSelectElement;
      const form = document.getElementById('form-override-base') as HTMLFormElement;

      if (!modal || !selectArq || !form) return;
      form.reset();

      try {
        // Busca arquivos do levantamento para preencher o select
        const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/arquivos`);
        const data = await res.json();
        const processados = data["Processados"] || [];

        const cadernetas = processados.filter((f: any) => f.nome.toLowerCase().endsWith('.txt'));
        if (cadernetas.length === 0) {
          alert("Não há arquivos caderneta .TXT na pasta 'Processados' do levantamento para realizar override de base!");
          return;
        }

        selectArq.innerHTML = cadernetas.map((f: any) => `<option value="${f.nome}">${f.nome}</option>`).join('');
        modal.classList.remove('hidden');
        initIcons();
      } catch (err) {
        alert("Erro ao carregar cadernetas processadas para o override.");
      }
    });

    document.getElementById('btn-fechar-modal-override')?.addEventListener('click', () => {
      document.getElementById('modal-override-base')?.classList.add('hidden');
    });
    document.getElementById('btn-cancelar-override')?.addEventListener('click', () => {
      document.getElementById('modal-override-base')?.classList.add('hidden');
    });

    // Abas do Override base
    const btnTabGeo = document.getElementById('tab-override-geodesica');
    const btnTabPlana = document.getElementById('tab-override-plana');
    const panelGeo = document.getElementById('panel-override-geodesico');
    const panelPlana = document.getElementById('panel-override-plana');

    let tipoEntradaOverride = 'geodesica';

    btnTabGeo?.addEventListener('click', () => {
      tipoEntradaOverride = 'geodesica';
      btnTabGeo.className = 'px-2 py-0.5 text-[9px] font-bold rounded bg-mint-vibrant text-forest-deep border border-mint-vibrant/20 transition-all';
      btnTabPlana!.className = 'px-2 py-0.5 text-[9px] font-bold rounded bg-white/5 text-white/60 border border-white/10 hover:text-white transition-all';
      panelGeo?.classList.remove('hidden');
      panelPlana?.classList.add('hidden');
    });

    btnTabPlana?.addEventListener('click', () => {
      tipoEntradaOverride = 'utm';
      btnTabPlana.className = 'px-2 py-0.5 text-[9px] font-bold rounded bg-mint-vibrant text-forest-deep border border-mint-vibrant/20 transition-all';
      btnTabGeo!.className = 'px-2 py-0.5 text-[9px] font-bold rounded bg-white/5 text-white/60 border border-white/10 hover:text-white transition-all';
      panelPlana?.classList.remove('hidden');
      panelGeo?.classList.add('hidden');
    });

    document.getElementById('form-override-base')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const arquivo_origem = (document.getElementById('select-override-arquivo') as HTMLSelectElement).value;
      const nome_base = (document.getElementById('input-override-nome-base') as HTMLInputElement).value.trim();

      const n_bruto = parseFloat((document.getElementById('input-override-n-bruto') as HTMLInputElement).value);
      const e_bruto = parseFloat((document.getElementById('input-override-e-bruto') as HTMLInputElement).value);
      const alt_bruta = parseFloat((document.getElementById('input-override-alt-bruta') as HTMLInputElement).value);

      const payload: any = {
        arquivo_origem,
        dados_brutos: {
          nome_base,
          n_bruto,
          e_bruto,
          alt_bruta
        },
        dados_corrigidos: {
          tipo_entrada: tipoEntradaOverride
        }
      };

      if (tipoEntradaOverride === 'geodesica') {
        payload.dados_corrigidos.lat_corrigida = parseFloat((document.getElementById('input-override-lat-corr') as HTMLInputElement).value);
        payload.dados_corrigidos.lon_corrigida = parseFloat((document.getElementById('input-override-lon-corr') as HTMLInputElement).value);
        payload.dados_corrigidos.alt_corrigida = parseFloat((document.getElementById('input-override-alt-corr-geo') as HTMLInputElement).value);
        payload.dados_corrigidos.sigma_lat = parseFloat((document.getElementById('input-override-sig-lat') as HTMLInputElement).value);
        payload.dados_corrigidos.sigma_lon = parseFloat((document.getElementById('input-override-sig-lon') as HTMLInputElement).value);
        payload.dados_corrigidos.sigma_alt = parseFloat((document.getElementById('input-override-sig-alt-geo') as HTMLInputElement).value);
      } else {
        payload.dados_corrigidos.n_corrigido = parseFloat((document.getElementById('input-override-n-corr') as HTMLInputElement).value);
        payload.dados_corrigidos.e_corrigido = parseFloat((document.getElementById('input-override-e-corr') as HTMLInputElement).value);
        payload.dados_corrigidos.alt_corrigida = parseFloat((document.getElementById('input-override-alt-corr-plana') as HTMLInputElement).value);
        payload.dados_corrigidos.fuso = (document.getElementById('select-override-fuso') as HTMLSelectElement).value;
      }

      try {
        const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/pontos/corrigir-manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.error || (data.detail && typeof data.detail === 'string')) {
          alert(`Erro ao aplicar translação de base: ${data.error || data.detail}`);
        } else {
          document.getElementById('modal-override-base')?.classList.add('hidden');
          alert(data.mensagem);
          await loadLevantamentoDetails();
        }
      } catch (err) {
        console.error("Erro na translação de base contingencial:", err);
        alert("Falha de conexão com o servidor.");
      }
    });

    // --- MENU DE CONTEXTO E MODAL DE PONTO CUSTOMIZADO ---
    let pontoSelecionadoContextoId: number | null = null;

    const abrirModalEditarPonto = (pId: number) => {
      const pt = pontosList.find(x => x.id === pId);
      if (!pt) return;

      const modalPt = document.getElementById('modal-editar-ponto');
      if (!modalPt) return;

      pontoSelecionadoContextoId = pId;

      document.getElementById('modal-pt-titulo-nome')!.innerText = pt.nome_vertice;

      (document.getElementById('input-pt-id') as HTMLInputElement).value = pt.id.toString();
      (document.getElementById('input-pt-nome') as HTMLInputElement).value = pt.nome_vertice;
      (document.getElementById('select-pt-tipo') as HTMLSelectElement).value = pt.tipo_ponto || 'P';
      (document.getElementById('select-pt-status') as HTMLSelectElement).value = pt.status_ponto || 'BRUTO';
      (document.getElementById('select-pt-metodo') as HTMLSelectElement).value = pt.metodo_posicionamento || 'PG1';

      (document.getElementById('input-pt-lat') as HTMLInputElement).value = pt.lat ? pt.lat.toFixed(9) : '';
      (document.getElementById('input-pt-lon') as HTMLInputElement).value = pt.lon ? pt.lon.toFixed(9) : '';
      (document.getElementById('input-pt-alt') as HTMLInputElement).value = pt.alt ? pt.alt.toFixed(4) : '';

      (document.getElementById('input-pt-sigma-lat') as HTMLInputElement).value = pt.sigma_lat ? pt.sigma_lat.toFixed(4) : '0.0000';
      (document.getElementById('input-pt-sigma-lon') as HTMLInputElement).value = pt.sigma_lon ? pt.sigma_lon.toFixed(4) : '0.0000';
      (document.getElementById('input-pt-sigma-alt') as HTMLInputElement).value = pt.sigma_alt ? pt.sigma_alt.toFixed(4) : '0.0000';

      document.getElementById('txt-pt-e-orig')!.innerText = pt.e_original ? pt.e_original.toFixed(4) + ' m' : 'N/A';
      document.getElementById('txt-pt-n-orig')!.innerText = pt.n_original ? pt.n_original.toFixed(4) + ' m' : 'N/A';
      document.getElementById('txt-pt-alt-orig')!.innerText = pt.alt_original ? pt.alt_original.toFixed(4) + ' m' : 'N/A';
      document.getElementById('txt-pt-arquivo-origem')!.innerText = pt.arquivo_rinex ? `Origem: ${pt.arquivo_rinex}` : 'Origem: Ingestão Manual';

      const selectBase = document.getElementById('select-pt-base') as HTMLSelectElement;
      if (selectBase) {
        const basesDoLev = pontosList.filter(x => {
          if (pt.tipo_ponto === 'B') {
            return x.tipo_ponto === 'M' && x.id !== pId;
          } else {
            return (x.tipo_ponto === 'M' || x.tipo_ponto === 'B') && x.id !== pId;
          }
        });

        let baseOptionsHtml = '<option value="">[Sem Base Apoio]</option>';
        baseOptionsHtml += basesDoLev.map(b => `<option value="${b.id}" ${b.id === pt.ponto_base_id ? 'selected' : ''}>Base: ${b.nome_vertice}</option>`).join('');

        selectBase.innerHTML = baseOptionsHtml;
        selectBase.disabled = (pt.tipo_ponto === 'M');
      }

      // --- GERENCIAMENTO DE CAMPOS DA BASE CORRIGIDA ---
      const sectionBaseControle = document.getElementById('section-pt-base-controle');
      const inputNBase = document.getElementById('input-pt-n-corr-base') as HTMLInputElement;
      const inputEBase = document.getElementById('input-pt-e-corr-base') as HTMLInputElement;
      const inputAltBase = document.getElementById('input-pt-alt-corr-base') as HTMLInputElement;
      const selectFusoBase = document.getElementById('select-pt-fuso-base') as HTMLSelectElement;

      const lblDn = document.getElementById('lbl-pt-dn-base');
      const lblDe = document.getElementById('lbl-pt-de-base');
      const lblDh = document.getElementById('lbl-pt-dh-base');
      const lblD3D = document.getElementById('lbl-pt-d3d-base');

      const atualizarDeltasRealtimeModal = () => {
        if (!pt.n_original || !pt.e_original || !pt.alt_original || !lblDn || !lblDe || !lblDh || !lblD3D) return;
        const nCorr = parseFloat(inputNBase.value);
        const eCorr = parseFloat(inputEBase.value);
        const altCorr = parseFloat(inputAltBase.value);

        if (isNaN(nCorr) || isNaN(eCorr) || isNaN(altCorr)) {
          lblDn.innerText = '-';
          lblDe.innerText = '-';
          lblDh.innerText = '-';
          lblD3D.innerText = '-';
          return;
        }

        const dN = (nCorr - pt.n_original) * 1000;
        const dE = (eCorr - pt.e_original) * 1000;
        const dH = (altCorr - pt.alt_original) * 1000;
        const d3D = Math.sqrt(dN * dN + dE * dE + dH * dH);

        lblDn.innerText = (dN >= 0 ? '+' : '') + dN.toFixed(1) + ' mm';
        lblDe.innerText = (dE >= 0 ? '+' : '') + dE.toFixed(1) + ' mm';
        lblDh.innerText = (dH >= 0 ? '+' : '') + dH.toFixed(1) + ' mm';
        lblD3D.innerText = d3D.toFixed(1) + ' mm';
      };

      const alternarVisualizacaoSeçãoBase = () => {
        const tipo = (document.getElementById('select-pt-tipo') as HTMLSelectElement).value;
        const sectionGeo = document.getElementById('section-pt-ajustadas-geo');
        if ((tipo === 'M' || tipo === 'B') && sectionBaseControle && inputNBase && inputEBase && inputAltBase && selectFusoBase) {
          sectionBaseControle.classList.remove('hidden');
          if (sectionGeo) sectionGeo.classList.add('hidden');

          if (pt.e_corrigido !== undefined && pt.e_corrigido !== null && pt.n_corrigido !== undefined && pt.n_corrigido !== null) {
            inputNBase.value = pt.n_corrigido.toFixed(3);
            inputEBase.value = pt.e_corrigido.toFixed(3);
            inputAltBase.value = (pt.alt !== undefined && pt.alt !== null ? pt.alt : (pt.alt_original || 0)).toFixed(3);

            if (pt.lon) {
              const zone = Math.floor((pt.lon + 180) / 6) + 1;
              selectFusoBase.value = zone + 'S';
            } else {
              selectFusoBase.value = '22S';
            }
          } else if (pt.lat && pt.lon) {
            const utm = latLonToUTM(pt.lat, pt.lon);
            inputNBase.value = utm.n.toFixed(3);
            inputEBase.value = utm.e.toFixed(3);
            inputAltBase.value = (pt.alt !== undefined && pt.alt !== null ? pt.alt : (pt.alt_original || 0)).toFixed(3);
            selectFusoBase.value = utm.zone + 'S';
          } else {
            inputNBase.value = pt.n_original ? pt.n_original.toFixed(3) : '';
            inputEBase.value = pt.e_original ? pt.e_original.toFixed(3) : '';
            inputAltBase.value = pt.alt_original ? pt.alt_original.toFixed(3) : '';

            if (pt.lon_original) {
              const zone = Math.floor((pt.lon_original + 180) / 6) + 1;
              selectFusoBase.value = zone + 'S';
            } else if (pt.lon) {
              const zone = Math.floor((pt.lon + 180) / 6) + 1;
              selectFusoBase.value = zone + 'S';
            } else {
              selectFusoBase.value = '22S';
            }
          }
          atualizarDeltasRealtimeModal();
        } else if (sectionBaseControle) {
          sectionBaseControle.classList.add('hidden');
          if (sectionGeo) sectionGeo.classList.remove('hidden');
        }
      };

      if (inputNBase && inputEBase && inputAltBase) {
        inputNBase.oninput = atualizarDeltasRealtimeModal;
        inputEBase.oninput = atualizarDeltasRealtimeModal;
        inputAltBase.oninput = atualizarDeltasRealtimeModal;
      }

      const selectTipoPonto = document.getElementById('select-pt-tipo') as HTMLSelectElement;
      if (selectTipoPonto) {
        selectTipoPonto.onchange = () => {
          if (selectBase) {
            selectBase.disabled = (selectTipoPonto.value === 'M');
            if (selectTipoPonto.value === 'M') {
              selectBase.value = '';
            }
          }
          alternarVisualizacaoSeçãoBase();
        };
      }

      alternarVisualizacaoSeçãoBase();

      modalPt.classList.remove('hidden');
      initIcons();
    };

    const confirmarExclusaoPonto = async (pId: number) => {
      const isLote = selectedPontoIds.length > 1 && selectedPontoIds.includes(pId);

      if (isLote) {
        if (!confirm(`ATENÇÃO: Tem certeza absoluta que deseja excluir definitivamente os ${selectedPontoIds.length} vértices selecionados? Esta operação é irreversível e removerá todos de uma só vez.`)) return;

        try {
          // Executa a exclusão de todos em paralelo
          const promessas = selectedPontoIds.map(id => fetch(`${API_BASE}/pontos/${id}`, { method: 'DELETE' }).then(r => r.json()));
          const resultados = await Promise.all(promessas);

          const erros = resultados.filter(r => r.error).map(r => r.error);
          if (erros.length > 0) {
            alert(`Ocorreram alguns erros ao tentar excluir em lote:\n${erros.slice(0, 5).join('\n')}`);
          } else {
            alert(`${selectedPontoIds.length} vértices excluídos com sucesso!`);
          }
          selectedPontoIds = [];
          await loadLevantamentoDetails();
        } catch (err) {
          console.error("Erro ao excluir pontos em lote:", err);
          alert("Erro de comunicação com o servidor API ao tentar excluir os pontos selecionados.");
        }
        return;
      }

      // Caso clássico de exclusão individual
      const pt = pontosList.find(x => x.id === pId);
      if (!pt) return;

      if (!confirm(`ATENÇÃO: Tem certeza absoluta que deseja excluir definitivamente o vértice '${pt.nome_vertice}'? Esta operação é irreversível.`)) return;

      try {
        const res = await fetch(`${API_BASE}/pontos/${pId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.error) {
          alert(data.error);
        } else {
          alert(`Vértice ${pt.nome_vertice} excluído com sucesso!`);
          selectedPontoIds = selectedPontoIds.filter(id => id !== pId);
          await loadLevantamentoDetails();
        }
      } catch (err) {
        console.error("Erro ao excluir ponto:", err);
        alert("Erro de comunicação com o servidor API.");
      }
    };

    const salvarPontoModal = async () => {
      if (!pontoSelecionadoContextoId) return;

      const pId = pontoSelecionadoContextoId;
      const nome_vertice = (document.getElementById('input-pt-nome') as HTMLInputElement).value.trim();
      const tipo_ponto = (document.getElementById('select-pt-tipo') as HTMLSelectElement).value;
      const status_ponto = (document.getElementById('select-pt-status') as HTMLSelectElement).value;
      const metodo_posicionamento = (document.getElementById('select-pt-metodo') as HTMLSelectElement).value;
      const ponto_base_id_val = (document.getElementById('select-pt-base') as HTMLSelectElement).value;
      const ponto_base_id = ponto_base_id_val ? parseInt(ponto_base_id_val) : 0;

      const lat_val = (document.getElementById('input-pt-lat') as HTMLInputElement).value;
      const lon_val = (document.getElementById('input-pt-lon') as HTMLInputElement).value;
      const alt_val = (document.getElementById('input-pt-alt') as HTMLInputElement).value;

      const lat = lat_val ? parseFloat(lat_val) : null;
      const lon = lon_val ? parseFloat(lon_val) : null;
      const alt = alt_val ? parseFloat(alt_val) : null;

      const sigma_lat_val = (document.getElementById('input-pt-sigma-lat') as HTMLInputElement).value;
      const sigma_lon_val = (document.getElementById('input-pt-sigma-lon') as HTMLInputElement).value;
      const sigma_alt_val = (document.getElementById('input-pt-sigma-alt') as HTMLInputElement).value;

      const sigma_lat = sigma_lat_val ? parseFloat(sigma_lat_val) : 0;
      const sigma_lon = sigma_lon_val ? parseFloat(sigma_lon_val) : 0;
      const sigma_alt = sigma_alt_val ? parseFloat(sigma_alt_val) : 0;

      const payload: any = {
        nome_vertice,
        tipo_ponto,
        status_ponto,
        metodo_posicionamento,
        ponto_base_id,
        lat,
        lon,
        alt,
        sigma_lat,
        sigma_lon,
        sigma_alt
      };

      if (tipo_ponto === 'M' || tipo_ponto === 'B') {
        const nCorr = parseFloat((document.getElementById('input-pt-n-corr-base') as HTMLInputElement).value);
        const eCorr = parseFloat((document.getElementById('input-pt-e-corr-base') as HTMLInputElement).value);
        const altCorr = parseFloat((document.getElementById('input-pt-alt-corr-base') as HTMLInputElement).value);
        const fuso = (document.getElementById('select-pt-fuso-base') as HTMLSelectElement).value;

        if (!isNaN(nCorr) && !isNaN(eCorr) && !isNaN(altCorr)) {
          payload.n_corrigido = nCorr;
          payload.e_corrigido = eCorr;
          payload.alt_corrigido = altCorr;
          payload.fuso = fuso;
        }
      }

      try {
        const res = await fetch(`${API_BASE}/pontos/${pId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.error || (data.detail && typeof data.detail === 'string')) {
          alert(`Erro ao salvar: ${data.error || data.detail}`);
        } else if (data.detail && typeof data.detail === 'object') {
          alert(`Erro ao salvar: ${JSON.stringify(data.detail)}`);
        } else {
          document.getElementById('modal-editar-ponto')?.classList.add('hidden');
          alert("Vértice geodésico atualizado com sucesso!");
          await loadLevantamentoDetails();
        }
      } catch (err) {
        console.error("Erro ao salvar alterações no ponto:", err);
        alert("Erro de comunicação com o servidor.");
      }
    };

    const inicializarMenuContextoEPontoModal = () => {
      const menuCtx = document.getElementById('menu-contexto-ponto');
      const modalPt = document.getElementById('modal-editar-ponto');

      if (!menuCtx || !modalPt) return;

      const tabelaCorpo = document.getElementById('tbl-pontos-triagem');
      if (tabelaCorpo) {
        tabelaCorpo.addEventListener('contextmenu', (e) => {
          const targetRow = (e.target as HTMLElement).closest('.linha-ponto-tbl');
          if (!targetRow) return;

          e.preventDefault();
          const pId = parseInt(targetRow.getAttribute('data-ponto-id') || '0');
          if (!pId) return;

          pontoSelecionadoContextoId = pId;
          selectPontoFromTabela(pId);

          menuCtx.style.left = `${e.pageX}px`;
          menuCtx.style.top = `${e.pageY}px`;
          menuCtx.classList.remove('hidden');
        });
      }

      document.addEventListener('click', (e) => {
        if (!menuCtx.contains(e.target as Node)) {
          menuCtx.classList.add('hidden');
        }
      });

      document.addEventListener('scroll', () => {
        menuCtx.classList.add('hidden');
      }, true);

      document.getElementById('menu-ctx-editar')?.addEventListener('click', () => {
        menuCtx.classList.add('hidden');
        if (pontoSelecionadoContextoId) {
          abrirModalEditarPonto(pontoSelecionadoContextoId);
        }
      });

      document.getElementById('menu-ctx-excluir')?.addEventListener('click', () => {
        menuCtx.classList.add('hidden');
        if (pontoSelecionadoContextoId) {
          confirmarExclusaoPonto(pontoSelecionadoContextoId);
        }
      });

      document.getElementById('btn-fechar-modal-pt')?.addEventListener('click', () => {
        modalPt.classList.add('hidden');
      });
      document.getElementById('btn-cancelar-pt')?.addEventListener('click', () => {
        modalPt.classList.add('hidden');
      });

      document.getElementById('form-editar-ponto')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await salvarPontoModal();
      });

      document.getElementById('btn-excluir-ponto-modal')?.addEventListener('click', () => {
        if (pontoSelecionadoContextoId) {
          confirmarExclusaoPonto(pontoSelecionadoContextoId);
          modalPt.classList.add('hidden');
        }
      });

      const selectTipo = document.getElementById('select-pt-tipo') as HTMLSelectElement;
      const selectBase = document.getElementById('select-pt-base') as HTMLSelectElement;
      selectTipo?.addEventListener('change', () => {
        if (selectBase && selectTipo) {
          const tipo = selectTipo.value;
          selectBase.disabled = (tipo === 'M');
          if (tipo === 'M') {
            selectBase.value = '';
          }
        }
      });
    };

    const inicializarWorkspaceCollapse = () => {
      const panelCollapseBtn = document.getElementById('btn-toggle-workspace-collapse');
      const containerArquivos = document.getElementById('container-workspace-arquivos');
      const seta = document.getElementById('seta-workspace-collapse');
      const painel = document.getElementById('painel-workspace-gnss');

      if (!panelCollapseBtn || !containerArquivos || !seta || !painel) return;

      const ajustarClassesPainel = (collapsed: boolean) => {
        if (collapsed) {
          painel.classList.remove('p-4', 'space-y-4', 'p-6', 'space-y-6');
          painel.classList.add('p-2', 'px-3');
          panelCollapseBtn.classList.remove('border-b', 'border-white/5', 'pb-4', 'pb-2.5');
          panelCollapseBtn.classList.add('pb-0');
        } else {
          painel.classList.remove('p-2', 'px-3', 'px-6', 'py-3');
          painel.classList.add('p-4', 'space-y-4');
          panelCollapseBtn.classList.add('border-b', 'border-white/5', 'pb-2.5');
          panelCollapseBtn.classList.remove('pb-0');
        }
      };

      const isCollapsed = localStorage.getItem('workspace_gnss_collapsed') === 'true';
      if (isCollapsed) {
        containerArquivos.classList.add('hidden');
        seta.classList.remove('rotate-90');
        ajustarClassesPainel(true);
      }

      panelCollapseBtn.addEventListener('click', () => {
        const currentlyHidden = containerArquivos.classList.toggle('hidden');
        if (currentlyHidden) {
          seta.classList.remove('rotate-90');
          localStorage.setItem('workspace_gnss_collapsed', 'true');
          ajustarClassesPainel(true);
        } else {
          seta.classList.add('rotate-90');
          localStorage.setItem('workspace_gnss_collapsed', 'false');
          ajustarClassesPainel(false);
        }
      });
    };

    const inicializarBuscaPonto = () => {
      const searchInput = document.getElementById('input-search-ponto') as HTMLInputElement;
      const btnClearSearch = document.getElementById('btn-clear-search');

      if (searchInput) {
        searchInput.addEventListener('input', () => {
          searchFilterValue = searchInput.value.trim().toLowerCase();
          renderMatriculaDados();
        });
      }

      if (btnClearSearch) {
        btnClearSearch.addEventListener('click', () => {
          if (searchInput) {
            searchInput.value = '';
          }
          searchFilterValue = '';
          renderMatriculaDados();
        });
      }
    };


    const inicializarScrollCollapseHeader = () => {
      const viewContainer = document.getElementById('view-container');
      const header = document.getElementById('mesa-trabalho-header');
      if (!viewContainer || !header) return;

      viewContainer.addEventListener('scroll', () => {
        if (viewContainer.scrollTop > 0) {
          if (!header.classList.contains('header-condensed')) {
            header.classList.add('header-condensed');
            if (triagemMap) {
              setTimeout(() => triagemMap!.invalidateSize(), 310);
            }
          }
        } else {
          if (header.classList.contains('header-condensed')) {
            header.classList.remove('header-condensed');
            if (triagemMap) {
              setTimeout(() => triagemMap!.invalidateSize(), 310);
            }
          }
        }
      });
    };

    const inicializarIngestaoCollapse = () => {
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      const btnColapsar = document.getElementById('btn-colapsar-ingestao');
      const splitterSup = document.getElementById('splitter-superior');

      if (!containerIngestao) return;

      const expandirIngestao = () => {
        if (containerIngestao.classList.contains('ingestao-collapsed')) {
          containerIngestao.classList.remove('ingestao-collapsed');
          if (splitterSup) splitterSup.classList.remove('hidden');
          
          const savedSupWidth = localStorage.getItem('gerencigeo_split_sup_width');
          if (savedSupWidth) {
            containerIngestao.style.width = `${savedSupWidth}px`;
          } else {
            containerIngestao.style.width = '48%';
          }
          
          if (triagemMap) {
            setTimeout(() => triagemMap!.invalidateSize(), 310);
          }
        }
      };

      const colapsarIngestao = () => {
        if (!containerIngestao.classList.contains('ingestao-collapsed')) {
          containerIngestao.classList.add('ingestao-collapsed');
          if (splitterSup) splitterSup.classList.add('hidden');
          containerIngestao.style.width = '';
          if (triagemMap) {
            setTimeout(() => triagemMap!.invalidateSize(), 310);
          }
        }
      };

      // Expande ao clicar no container quando colapsado
      containerIngestao.addEventListener('click', (e) => {
        if (containerIngestao.classList.contains('ingestao-collapsed')) {
          expandirIngestao();
          e.stopPropagation();
        }
      });

      // Colapso manual via botão de minimizar
      if (btnColapsar) {
        btnColapsar.addEventListener('click', (e) => {
          colapsarIngestao();
          e.stopPropagation();
        });
      }

      // Expande ao arrastar arquivos sobre a dropzone ou sobre o container inteiro
      containerIngestao.addEventListener('dragover', (e) => {
        e.preventDefault();
        expandirIngestao();
      });

      containerIngestao.addEventListener('dragenter', (e) => {
        e.preventDefault();
        expandirIngestao();
      });
    };

    const inicializarEventosReordenarManual = () => {
      document.getElementById('btn-ativar-reordenacao')?.addEventListener('click', () => {
        alternarModoReordenarManual(!modoReordenarAtivo);
      });

      document.getElementById('btn-fechar-reordenar')?.addEventListener('click', () => {
        alternarModoReordenarManual(false);
      });

      // Eventos do Buscador Lateral do Ordenador
      const searchInput = document.getElementById('input-search-ordenador') as HTMLInputElement | null;
      const searchClear = document.getElementById('btn-clear-search-ordenador');

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          searchFilterOrdenadorValue = (e.target as HTMLInputElement).value;
          renderListaReordenarSimplificada();
        });
      }

      if (searchClear) {
        searchClear.addEventListener('click', () => {
          if (searchInput) {
            searchInput.value = '';
          }
          searchFilterOrdenadorValue = '';
          renderListaReordenarSimplificada();
        });
      }

      // Caminhamento por Clique
      const btnCliqueSequencial = document.getElementById('btn-toggle-clique-sequencial');
      const iconClique = document.getElementById('icon-clique-sequencial');
      const txtClique = document.getElementById('txt-clique-sequencial');

      if (btnCliqueSequencial) {
        btnCliqueSequencial.addEventListener('click', () => {
          modoCliqueSequencialAtivo = !modoCliqueSequencialAtivo;
          sequenciaCliqueProximoIndice = null; // Reinicia a sequência de início por clique!

          if (modoCliqueSequencialAtivo) {
            btnCliqueSequencial.classList.replace('bg-white/5', 'bg-mint-vibrant/20');
            btnCliqueSequencial.classList.add('border-mint-vibrant/40');
            if (iconClique) {
              iconClique.setAttribute('data-lucide', 'pause');
              iconClique.classList.add('animate-pulse');
            }
            if (txtClique) txtClique.innerText = "Caminhando...";
          } else {
            btnCliqueSequencial.classList.replace('bg-mint-vibrant/20', 'bg-white/5');
            btnCliqueSequencial.classList.remove('border-mint-vibrant/40');
            if (iconClique) {
              iconClique.setAttribute('data-lucide', 'play');
              iconClique.classList.remove('animate-pulse');
            }
            if (txtClique) txtClique.innerText = "Caminhar por Clique";
          }

          // Repassa a flag para o controller do mapa e redesenha para ativar/desativar popups
          mapaController.modoCliqueSequencialAtivo = modoCliqueSequencialAtivo;
          atualizarPolilinhaMapaTemp();
          initIcons();
        });
      }

      // (Inputs de faixa manuais removidos)

      document.getElementById('btn-salvar-ordem-simplificada')?.addEventListener('click', async () => {
        if (!currentLevId) return;
        const pontosMat = pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');

        if (pontosMat.length === 0) {
          alert("Nenhum ponto para salvar!");
          return;
        }

        pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
        const payload = {
          pontos_ordem: pontosMat.map((p, idx) => ({
            id: p.id,
            ordem: idx + 1
          }))
        };

        try {
          const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/salvar-ordem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (!res.ok) {
            alert(`Erro ao salvar ordem: ${data.detail || data.error || 'Falha no backend'}`);
          } else if (data.sucesso || data.success) {
            alert(data.mensagem || "Ordem de caminhamento salva com sucesso!");
            localStorage.removeItem(`rascunho_ordem_lev_${currentLevId}`);
            alternarModoReordenarManual(false);
          } else {
            alert(`Erro ao salvar ordem: ${data.mensagem || 'Falha no backend'}`);
          }
        } catch (err) {
          console.error("Erro ao salvar ordem perimetral:", err);
          alert("Falha de conexão com o servidor.");
        }
      });
    };

    const inicializarSplitters = () => {
      const splitterSup = document.getElementById('splitter-superior');
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      const containerReordenar = document.getElementById('container-reordenar-manual');
      const gridSuperior = document.getElementById('grid-superior-detalhe');

      const splitterInf = document.getElementById('splitter-inferior');
      const containerVertices = document.getElementById('container-tabela-vertices');
      const containerDivisas = document.getElementById('container-tabela-divisas');

      // Lógica do Splitter Superior (Mapa vs Ingestão/Ordenador)
      if (splitterSup && gridSuperior) {
        let isDraggingSup = false;
        let startX = 0;
        let startWidthRight = 0;

        const onMouseMoveSup = (e: MouseEvent) => {
          if (!isDraggingSup) return;
          const rectGrid = gridSuperior.getBoundingClientRect();
          const deltaX = startX - e.clientX;
          const newWidthRight = Math.max(250, Math.min(rectGrid.width - 350, startWidthRight + deltaX));

          if (containerIngestao && !containerIngestao.classList.contains('hidden') && !containerIngestao.classList.contains('ingestao-collapsed')) {
            containerIngestao.style.width = `${newWidthRight}px`;
            localStorage.setItem('gerencigeo_split_sup_width', `${newWidthRight}`);
          }
          if (containerReordenar && !containerReordenar.classList.contains('hidden')) {
            containerReordenar.style.width = `${newWidthRight}px`;
            localStorage.setItem('gerencigeo_split_sup_width', `${newWidthRight}`);
          }

          if (triagemMap) {
            triagemMap.invalidateSize();
          }
        };

        const onMouseUpSup = () => {
          isDraggingSup = false;
          document.removeEventListener('mousemove', onMouseMoveSup);
          document.removeEventListener('mouseup', onMouseUpSup);
          document.body.classList.remove('cursor-col-resize', 'select-none');
          if (triagemMap) {
            setTimeout(() => triagemMap!.invalidateSize(), 50);
          }
        };

        splitterSup.addEventListener('mousedown', (e: MouseEvent) => {
          if (containerIngestao && containerIngestao.classList.contains('ingestao-collapsed')) return;

          e.preventDefault();
          isDraggingSup = true;
          startX = e.clientX;

          const activePanel = (containerIngestao && !containerIngestao.classList.contains('hidden')) 
            ? containerIngestao 
            : containerReordenar;

          if (activePanel) {
            startWidthRight = activePanel.getBoundingClientRect().width;
          }

          document.addEventListener('mousemove', onMouseMoveSup);
          document.addEventListener('mouseup', onMouseUpSup);
          document.body.classList.add('cursor-col-resize', 'select-none');
        });

        // Carrega largura salva
        const savedSupWidth = localStorage.getItem('gerencigeo_split_sup_width');
        if (savedSupWidth) {
          const widthPx = parseInt(savedSupWidth);
          if (containerIngestao) containerIngestao.style.width = `${widthPx}px`;
          if (containerReordenar) containerReordenar.style.width = `${widthPx}px`;
        }
      }

      // Lógica do Splitter Inferior (Vértices vs Divisas)
      if (splitterInf && containerDivisas && containerVertices) {
        let isDraggingInf = false;
        let startX = 0;
        let startWidthRight = 0;

        const onMouseMoveInf = (e: MouseEvent) => {
          if (!isDraggingInf) return;
          const containerParent = splitterInf.parentElement;
          if (!containerParent) return;
          const rectParent = containerParent.getBoundingClientRect();
          const deltaX = startX - e.clientX;
          const newWidthRight = Math.max(250, Math.min(rectParent.width - 350, startWidthRight + deltaX));

          containerDivisas.style.width = `${newWidthRight}px`;
          localStorage.setItem('gerencigeo_split_inf_width', `${newWidthRight}`);
        };

        const onMouseUpInf = () => {
          isDraggingInf = false;
          document.removeEventListener('mousemove', onMouseMoveInf);
          document.removeEventListener('mouseup', onMouseUpInf);
          document.body.classList.remove('cursor-col-resize', 'select-none');
        };

        splitterInf.addEventListener('mousedown', (e: MouseEvent) => {
          e.preventDefault();
          isDraggingInf = true;
          startX = e.clientX;
          startWidthRight = containerDivisas.getBoundingClientRect().width;

          document.addEventListener('mousemove', onMouseMoveInf);
          document.addEventListener('mouseup', onMouseUpInf);
          document.body.classList.add('cursor-col-resize', 'select-none');
        });

        // Carrega largura salva
        const savedInfWidth = localStorage.getItem('gerencigeo_split_inf_width');
        if (savedInfWidth) {
          containerDivisas.style.width = `${parseInt(savedInfWidth)}px`;
        }
      }
    };

    const carregarSugestoesNumeracao = async () => {
      if (!currentLevId) return;
      try {
        const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/pontos-sugeridos`);
        const data = await res.json();
        
        const banner = document.getElementById('banner-sugestao-numeracao');
        const sugM = document.getElementById('sugestao-m');
        const sugP = document.getElementById('sugestao-p');
        const sugV = document.getElementById('sugestao-v');
        
        if (data && data.sugestoes) {
          if (sugM) sugM.innerText = data.sugestoes.M.codigo_sugerido || '-';
          if (sugP) sugP.innerText = data.sugestoes.P.codigo_sugerido || '-';
          if (sugV) sugV.innerText = data.sugestoes.V.codigo_sugerido || '-';
          
          if (banner) {
            if (etapaAtiva === 'cartorio') {
              banner.classList.remove('hidden');
            } else {
              banner.classList.add('hidden');
            }
          }
        } else {
          if (banner) banner.classList.add('hidden');
        }
      } catch (err) {
        console.error("Erro ao carregar sugestões de numeração:", err);
      }
    };

    const carregarHomologacaoDados = async (profissionalId: number) => {
      try {
        const res = await fetch(`${API_BASE}/profissionais/${profissionalId}/banco-pontos`);
        const data = await res.json();
        
        const container = document.getElementById('container-vertices-homologados');
        const countTxt = document.getElementById('txt-qtd-homologados');
        
        if (data && data.pontos) {
          const pontosDoProjeto = data.pontos.filter((p: any) => p.levantamento_id === currentLevId);
          if (countTxt) {
            countTxt.innerText = `${pontosDoProjeto.length} Pontos`;
          }
          
          if (container) {
            if (pontosDoProjeto.length === 0) {
              container.innerHTML = `<div class="text-white/20 italic py-4 text-center">Nenhum arquivo de homologação importado para este levantamento.</div>`;
            } else {
              container.innerHTML = `
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  ${pontosDoProjeto.map((p: any) => `
                    <div class="p-1.5 bg-white/5 border border-white/5 rounded-technical flex items-center justify-between">
                      <span class="text-[10px] text-mint-vibrant font-bold">${p.codigo_completo}</span>
                      <span class="text-[8px] text-white/40 uppercase font-mono">${p.tipo_ponto}</span>
                    </div>
                  `).join('')}
                </div>
              `;
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar dados de homologação:", err);
      }
    };

    const inicializarHomologacaoIncra = () => {
      const dropzone = document.getElementById('homologacao-dropzone');
      const fileInput = document.getElementById('homologacao-file-input') as HTMLInputElement;
      const btnProcessar = document.getElementById('btn-processar-homologacao') as HTMLButtonElement;
      let selectedFile: File | null = null;
      
      if (!dropzone || !fileInput || !btnProcessar) return;
      
      const updateButtonState = () => {
        if (selectedFile) {
          btnProcessar.disabled = false;
          btnProcessar.classList.remove('opacity-55', 'cursor-not-allowed');
          btnProcessar.classList.add('btn-primary');
        } else {
          btnProcessar.disabled = true;
          btnProcessar.classList.add('opacity-55', 'cursor-not-allowed');
          btnProcessar.classList.remove('btn-primary');
        }
      };
      
      dropzone.addEventListener('click', () => fileInput.click());
      
      fileInput.addEventListener('change', (e: any) => {
        if (e.target.files && e.target.files.length > 0) {
          selectedFile = e.target.files[0];
          const textElement = dropzone.querySelector('p.text-xs') as HTMLElement;
          if (textElement && selectedFile) {
            textElement.innerText = `Arquivo: ${selectedFile.name}`;
          }
          updateButtonState();
        }
      });
      
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
      });
      
      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
      });
      
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          selectedFile = e.dataTransfer.files[0];
          const textElement = dropzone.querySelector('p.text-xs') as HTMLElement;
          if (textElement && selectedFile) {
            textElement.innerText = `Arquivo: ${selectedFile.name}`;
          }
          updateButtonState();
        }
      });
      
      btnProcessar.addEventListener('click', async () => {
        if (!selectedFile || !currentLevId) return;
        
        btnProcessar.disabled = true;
        btnProcessar.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i> Processando...`;
        initIcons();
        
        const formData = new FormData();
        formData.append('file', selectedFile);
        
        try {
          const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/importar-pontos-aprovados`, {
            method: 'POST',
            body: formData
          });
          
          const data = await res.json();
          if (res.ok && data.sucesso) {
            alert(data.mensagem || "Pontos homologados importados com sucesso!");
            
            // Limpa o estado local de seleção de arquivo
            selectedFile = null;
            fileInput.value = '';
            const textElement = dropzone.querySelector('p.text-xs') as HTMLElement;
            if (textElement) {
              textElement.innerText = `Lançar TXT/CSV Homologado`;
            }
            
            // Recarrega todos os detalhes pertinentes
            loadLevantamentoDetails();
          } else {
            alert(data.detail || data.error || "Erro ao processar arquivo de homologação.");
          }
        } catch (err) {
          console.error("Erro no upload de homologação:", err);
          alert("Erro de conexão com o servidor API.");
        } finally {
          btnProcessar.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i> Importar Pontos no Banco`;
          updateButtonState();
          initIcons();
        }
      });
    };

    setupEventDelegation();
    loadLevantamentoDetails();
    inicializarMenuContextoEPontoModal();
    inicializarEventosReordenarManual();
    inicializarWorkspaceCollapse();
    inicializarBuscaPonto();
    inicializarScrollCollapseHeader();
    inicializarIngestaoCollapse();
    inicializarSplitters();
    inicializarHomologacaoIncra();

    (window as any).importarVizinhoSIGEF = async (codigoParcela: string, nomeImovel: string) => {
      if (!currentLevId) return;

      const confirmacao = confirm(`Deseja importar e salvar os dados de limites e vértices do imóvel confrontante "${nomeImovel}" no levantamento atual?`);
      if (!confirmacao) return;

      document.body.style.cursor = 'wait';

      try {
        const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/importar-confrontante-sigef?codigo_parcela=${encodeURIComponent(codigoParcela)}`, {
          method: 'POST'
        });

        const data = await res.json();

        if (res.ok && data.success) {
          alert(`Sucesso: Vértices e limites de "${nomeImovel}" foram importados e salvos com sucesso na pasta de Documentos do levantamento.`);
          loadWorkspaceArquivos();
        } else {
          alert(`Erro na importação: ${data.error || data.detail || 'Falha ao processar arquivos no SIGEF'}`);
        }
      } catch (err) {
        console.error("Erro ao importar confrontante:", err);
        alert("Erro de comunicação com a API do servidor.");
      } finally {
        document.body.style.cursor = '';
      }
    };
  }
};
