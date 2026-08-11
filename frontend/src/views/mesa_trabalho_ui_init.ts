import { API_BASE } from '../config';
import { initIcons } from '../utils';
import { aplicarLargurasSalvas } from './mesa_trabalho_splitters';
import { showToast, customAlert, customConfirm } from '../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho/mesa_trabalho_context';
import { renderHistoricoCampo } from './mesa_trabalho/auditoria_historico';
import { confirmarExclusaoPonto } from './mesa_trabalho_modal_ponto';

export let _filtroArquivosClickHandler: any = null;
export const setFiltroArquivosClickHandler = (val: any) => _filtroArquivosClickHandler = val;

export function setupMesaUiInit(ctx: MesaTrabalhoContext) {
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
          ctx.searchFilterValue = searchInput.value.trim().toLowerCase();
          ctx.renderMatriculaDados();
        });
      }

      if (btnClearSearch) {
        btnClearSearch.addEventListener('click', () => {
          if (searchInput) searchInput.value = '';
          ctx.searchFilterValue = '';
          ctx.renderMatriculaDados();
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
            if (ctx.triagemMap) {
              setTimeout(() => ctx.triagemMap?.invalidateSize?.(), 310);
            }
          }
        } else {
          if (header.classList.contains('header-condensed')) {
            header.classList.remove('header-condensed');
            if (ctx.triagemMap) {
              setTimeout(() => ctx.triagemMap?.invalidateSize?.(), 310);
            }
          }
        }
      });
    };

    _filtroArquivosClickHandler = null;

    const inicializarFiltroArquivos = () => {
      const btnFiltro = document.getElementById('btn-filtro-arquivos');
      const popover = document.getElementById('popover-filtro-arquivos');

      if (!btnFiltro || !popover) return;

      btnFiltro.addEventListener('click', (e) => {
        e.stopPropagation();
        popover.classList.toggle('hidden');
      });

      // Registrado com referência para remoção no cleanup (previne memory leak)
      _filtroArquivosClickHandler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!popover.classList.contains('hidden') && !popover.contains(target) && target !== btnFiltro) {
          popover.classList.add('hidden');
        }
      };
      document.addEventListener('click', _filtroArquivosClickHandler);
    };

    const inicializarRedimensionamentoColunas = () => {
      const headerRow = document.getElementById('tbl-pontos-header');
      if (!headerRow) return;

      const ths = headerRow.querySelectorAll('th');
      ths.forEach(th => {
        const widthStyle = th.style.width;
        if (widthStyle) {
          // Cria o elemento resizer
          const resizer = document.createElement('div');
          resizer.className = 'vtx-col-resizer';
          th.appendChild(resizer);

          let startX = 0;
          let startWidth = 0;

          const onMouseMove = (e: MouseEvent) => {
            const width = startWidth + (e.clientX - startX);
            if (width > 25) { // Largura mínima para segurança
              th.style.width = `${width}px`;
            }
          };

          const onMouseUp = () => {
            resizer.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          };

          resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            startX = e.clientX;
            startWidth = th.offsetWidth;
            resizer.classList.add('resizing');

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          });
        }
      });
    };

    ctx.inicializarRedimensionamentoColunas = inicializarRedimensionamentoColunas;

    const inicializarIngestaoCollapse = () => {
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      if (!containerIngestao) return;

      const expandirIngestao = () => {
        containerIngestao.classList.remove('hidden');
        containerIngestao.classList.add('flex');
        initIcons();
      };

      const colapsarIngestao = () => {
        containerIngestao.classList.add('hidden');
        containerIngestao.classList.remove('flex');
      };

      ctx.expandirIngestao = expandirIngestao;
      ctx.colapsarIngestao = colapsarIngestao;

      // Evento de clique no botão do Ribbon (Ingestão)
      const btnDropArquivos = document.getElementById('btn-drop-arquivos');
      if (btnDropArquivos) {
        btnDropArquivos.addEventListener('click', () => {
          expandirIngestao();
        });
      }

      // Evento de clique para fechar o modal
      const btnFechar = document.getElementById('btn-fechar-modal-ingestao');
      if (btnFechar) {
        btnFechar.addEventListener('click', colapsarIngestao);
      }

      const btnCancelar = document.getElementById('btn-cancelar-ingestao-modal');
      if (btnCancelar) {
        btnCancelar.addEventListener('click', colapsarIngestao);
      }

      // Repasse do botão processar do modal para o botão processar original do ribbon
      const btnProcessarModal = document.getElementById('btn-processar-lote-modal');
      if (btnProcessarModal) {
        btnProcessarModal.addEventListener('click', () => {
          const btnOriginal = document.getElementById('btn-processar-lote');
          if (btnOriginal) {
            btnOriginal.click();
          }
          colapsarIngestao();
        });
      }
    };


    ctx.aplicarLargurasSplitters = aplicarLargurasSalvas;


    // 8. Eventos Globais de Filtros de Tabela
    document.querySelectorAll('.btn-filtro-rapido').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget as HTMLButtonElement;

        document.querySelectorAll('.btn-filtro-rapido').forEach(b => {
          b.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-white/50 border border-transparent hover:text-white hover:bg-white/[0.08] btn-filtro-rapido transition-all";
        });

        targetBtn.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 btn-filtro-rapido transition-all";

        ctx.filtroRapidoAtivo = targetBtn.getAttribute('data-filtro') || 'todos';
        ctx.renderMatriculaDados();
      });
    });

    document.getElementById('btn-etapa-geoprocessamento')?.addEventListener('click', () => {
      ctx.alternarEtapa('geoprocessamento');
    });

    document.getElementById('btn-etapa-cartorio')?.addEventListener('click', () => {
      ctx.alternarEtapa('cartorio');
    });

    document.getElementById('btn-etapa-documentos')?.addEventListener('click', () => {
      ctx.alternarEtapa('documentos');
    });

    document.getElementById('btn-etapa-auditoria')?.addEventListener('click', () => {
      ctx.alternarEtapa('auditoria');
    });

    document.getElementById('btn-atualizar-historico-campo')?.addEventListener('click', () => {
      renderHistoricoCampo(ctx);
    });

    const alternarFontePontosHandler = async () => {
      if (!ctx.currentLevId) return;

      if (!ctx.bancoPontosExibido) {
        if (!ctx.bancoPontosList || ctx.bancoPontosList.length === 0) {
          try {
            const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/banco-pontos`);
            if (res.ok) {
              const data = await res.json();
              ctx.bancoPontosList = data || [];
            }
          } catch (err) {
            console.error("Erro ao buscar banco de pontos:", err);
          }
        }

        if (!ctx.bancoPontosList || ctx.bancoPontosList.length === 0) {
          alert("Nenhum ponto homologado foi importado da planilha ainda. Envie uma planilha ODS/CSV na aba 'Peças de Cartório' para visualizar os pontos finais do SIGEF.");
          return;
        }

        ctx.bancoPontosExibido = true;
      } else {
        ctx.bancoPontosExibido = false;
      }

      const btnToggle = document.getElementById('btn-toggle-fonte-pontos');
      const txtToggle = document.getElementById('txt-fonte-pontos');
      const iconToggle = document.getElementById('icon-fonte-pontos');

      if (ctx.bancoPontosExibido) {
        if (txtToggle) txtToggle.innerHTML = `Planilha SIGEF <span class="font-bold">(${ctx.bancoPontosList.length} pts)</span>`;
        if (iconToggle) iconToggle.setAttribute('data-lucide', 'file-check');
        if (btnToggle) {
          btnToggle.className = "rl3-tool-btn rl3-btn-lg border border-emerald-500/50 bg-emerald-500/20 text-emerald-300 font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all";
        }
      } else {
        if (txtToggle) txtToggle.innerText = 'Fonte: Campo';
        if (iconToggle) iconToggle.setAttribute('data-lucide', 'layers');
        if (btnToggle) {
          btnToggle.className = "rl3-tool-btn rl3-btn-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 transition-all";
        }
      }

      initIcons();
      ctx.renderMatriculaDados();
    };

    document.getElementById('btn-toggle-fonte-pontos')?.addEventListener('click', alternarFontePontosHandler);

    // Eventos da barra flutuante de ações em lote da mesa
    document.getElementById('btn-batch-cancel-mesa')?.addEventListener('click', () => {
       ctx.selectedPontoIds = [];
       ctx.selectedVizinhoPontoIds = [];
       ctx.lastSelectedPontoId = null;
       ctx.atualizarDestaqueLinhasTabela();
    });

    document.getElementById('btn-batch-limpar')?.addEventListener('click', () => {
       ctx.selectedPontoIds = [];
       ctx.selectedVizinhoPontoIds = [];
       ctx.lastSelectedPontoId = null;
       ctx.atualizarDestaqueLinhasTabela();
    });

    document.getElementById('btn-batch-delete-mesa')?.addEventListener('click', () => {
       if (ctx.selectedPontoIds.length > 0) {
          confirmarExclusaoPonto(ctx.selectedPontoIds[0]);
       }
    });

    document.getElementById('btn-batch-deletar')?.addEventListener('click', () => {
       if (ctx.selectedPontoIds.length > 0) {
          confirmarExclusaoPonto(ctx.selectedPontoIds[0]);
       }
    });

    document.getElementById('btn-batch-ignorar')?.addEventListener('click', async () => {
       if (ctx.currentLevantamento?.status === 'ARQUIVADO') {
          await customAlert("Este projeto está ARQUIVADO e não pode ser modificado (Modo Somente Leitura).");
          return;
       }

       const totalSelecionados = ctx.selectedPontoIds.length;
       if (totalSelecionados === 0) return;

       const pontosSel = ctx.pontosList.filter(p => ctx.selectedPontoIds.includes(p.id));
       if (pontosSel.length === 0) return;

       const temPontoAtivo = pontosSel.some(p => p.ignorar_poligono !== 1);
       const novoEstado = temPontoAtivo ? 1 : 0;

       if (!await customConfirm(`Deseja alterar a participação no polígono de ${totalSelecionados} vértice(s) para: "${novoEstado === 1 ? 'Ignorar' : 'Participar'}"?`)) return;

       showToast("Atualizando vértices em lote...", "info");

       try {
          const promessas = ctx.selectedPontoIds.map(id =>
             fetch(`${API_BASE}/pontos/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ignorar_poligono: novoEstado })
             }).then(async r => {
                if (r.status === 403) return { error: "Acesso negado (projeto arquivado)." };
                if (!r.ok) {
                   const txt = await r.json().catch(() => ({ error: "Erro desconhecido" }));
                   return { error: txt.detail || txt.error || "Falha na requisição" };
                }
                return r.json().catch(() => ({}));
             })
          );

          const resultados = await Promise.all(promessas);
          const erros = resultados.filter(r => r.error).map(r => r.error);

          if (erros.length > 0) {
             await customAlert(`Ocorreram alguns erros ao tentar atualizar em lote:\n${erros.slice(0, 5).join('\n')}`);
          } else {
             showToast(`${totalSelecionados} vértice(s) atualizado(s) com sucesso!`, "success");
          }

          await ctx.loadLevantamentoDetails();
       } catch (err) {
          console.error("Erro ao alternar polígono em lote:", err);
          showToast("Erro ao tentar atualizar os pontos selecionados em lote.", "error");
       }
    });

    document.getElementById('btn-batch-integrate-mesa')?.addEventListener('click', async () => {
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

    // Lógica para abrir o modal de filtro Revit
    document.getElementById('btn-batch-filter-mesa')?.addEventListener('click', () => {
       const container = document.getElementById('container-categorias-filtro');
       if (!container) return;

       container.innerHTML = '';

       const pontosSelecionados = ctx.pontosList.filter((p: any) => ctx.selectedPontoIds.includes(p.id));
       const vizinhosSelecionados = ctx.pontosVizinhosList.filter((p: any) => ctx.selectedVizinhoPontoIds.includes(p.id));

       const categorias = [
         {
           id: 'base-ppp',
           nome: 'Bases Homologadas PPP (M)',
           count: pontosSelecionados.filter((p: any) => p.tipo_ponto === 'M' || p.tipo === 'M').length
         },
         {
           id: 'base-campo',
           nome: 'Bases de Campo (B)',
           count: pontosSelecionados.filter((p: any) => p.tipo_ponto === 'B' || p.tipo === 'B').length
         },
         {
           id: 'rover-vertice',
           nome: 'Vértices do Perímetro (P/V)',
           count: pontosSelecionados.filter((p: any) => p.tipo_ponto !== 'B' && p.tipo !== 'B' && p.tipo_ponto !== 'M' && p.tipo !== 'M').length
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

    document.getElementById('btn-filtro-selecionar-todos')?.addEventListener('click', () => {
       document.querySelectorAll('.chk-filtro-categoria').forEach((chk: any) => (chk as HTMLInputElement).checked = true);
    });

    document.getElementById('btn-filtro-limpar-todos')?.addEventListener('click', () => {
       document.querySelectorAll('.chk-filtro-categoria').forEach((chk: any) => (chk as HTMLInputElement).checked = false);
    });

    const fecharModalFiltro = () => {
       document.getElementById('modal-filtro-revit-mesa')?.classList.add('hidden');
    };
    document.getElementById('btn-fechar-modal-filtro')?.addEventListener('click', fecharModalFiltro);
    document.getElementById('btn-filtro-cancelar')?.addEventListener('click', fecharModalFiltro);

    document.getElementById('btn-filtro-aplicar')?.addEventListener('click', () => {
       const checkedVals = Array.from(document.querySelectorAll('.chk-filtro-categoria:checked')).map((el: any) => el.value);

       const pontosSelecionados = ctx.pontosList.filter((p: any) => ctx.selectedPontoIds.includes(p.id));
       const vizinhosSelecionados = ctx.pontosVizinhosList.filter((p: any) => ctx.selectedVizinhoPontoIds.includes(p.id));

       const novosPontoIds: number[] = [];
       const novosVizinhoIds: number[] = [];

       pontosSelecionados.forEach((p: any) => {
          const isM = p.tipo_ponto === 'M' || p.tipo === 'M';
          const isB = p.tipo_ponto === 'B' || p.tipo === 'B';
          const isRover = !isM && !isB;
          const isBruto = p.status_ponto === 'BRUTO';
          const isCorrigido = p.status_ponto === 'CORRIGIDO';

          let match = false;
          if (isM && checkedVals.includes('base-ppp')) match = true;
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

}
