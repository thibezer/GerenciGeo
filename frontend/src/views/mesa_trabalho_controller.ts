import { API_BASE } from '../config';
import L from 'leaflet';
import { atualizarPainelPropriedades } from './mesa_trabalho/painel_propriedades';
import { abrirModalEditarPonto } from './mesa_trabalho_modal_ponto';
import { showToast, customAlert, customConfirm, initIcons } from '../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho/mesa_trabalho_context';
import { CanvasInteracao } from './mesa_trabalho/canvas_interacao';
import { renderTabelaMesaGeodesica } from './mesa_trabalho/mesa_geodesica';
import { renderTabelaOrganizadorPerimetro } from './mesa_trabalho/organizador_perimetro';
import { inicializarEventosTabela } from './mesa_trabalho/tabela_dados';
import { renderHistoricoCampo } from './mesa_trabalho/auditoria_historico';
import { MesaTrabalhoMapa } from './mesa_trabalho/mapa/mapa_controller';

export function setupMesaController(ctx: MesaTrabalhoContext, mapaController: MesaTrabalhoMapa) {
    ctx.loadLevantamentoDetails = async () => {
      if (!ctx.currentLevId) return;

      try {
        const resLev = await fetch(`${API_BASE}/levantamentos`);
        if (!resLev.ok) throw new Error(`HTTP ${resLev.status} ao carregar levantamentos`);
        const allLevs = await resLev.json();
        const levObj = allLevs.find((l: any) => l.id === ctx.currentLevId);
        ctx.currentLevantamento = levObj;

        if (levObj) {
          const badgeStatus = document.getElementById('badge-status-lev');
          if (badgeStatus) {
            badgeStatus.innerText = levObj.status;
            badgeStatus.className = "text-[9px] px-2 py-0.5 rounded-full font-mono uppercase font-semibold tracking-wider border transition-all";

            if (levObj.status === 'EM_ANDAMENTO' || levObj.status === 'ATIVO') {
              badgeStatus.classList.add('bg-mint-vibrant/10', 'text-mint-vibrant', 'border-mint-vibrant/25');
              badgeStatus.classList.add('status-em-andamento');
            } else if (levObj.status === 'ARQUIVADO') {
              badgeStatus.classList.add('bg-white/5', 'text-white/40', 'border-white/10');
            } else {
              badgeStatus.classList.add('bg-blue-500/10', 'text-blue-400', 'border-blue-500/25');
            }
          }

          const txtNomeProp = document.getElementById('txt-nome-propriedade');
          if (txtNomeProp) {
            txtNomeProp.innerText = levObj.nome_propriedade || `Levantamento #${levObj.id}`;
          }

          const proprietarios = levObj.clientes && levObj.clientes.length
            ? levObj.clientes.map((c: any) => `${c.nome_completo} (${(c.percentual_participacao || 0).toFixed(0)}%)`).join(', ')
            : 'Nenhum proprietário';

          const txtNomeCli = document.getElementById('txt-nome-cliente');
          if (txtNomeCli) {
            txtNomeCli.innerText = proprietarios;
          }

          const txtCodCar = document.getElementById('txt-codigo-car');
          if (txtCodCar) {
            txtCodCar.innerText = levObj.codigo_car || 'Não Informado';
          }
        }

        const [resMat, resPt, resSeg, resConf, resViz] = await Promise.all([
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/segmentos`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos-vizinhos`)
        ]);

        const matData = await resMat.json();
        ctx.matriculasList = Array.isArray(matData) ? matData : [];

        const ptData = await resPt.json();
        ctx.pontosList = Array.isArray(ptData) ? ptData : [];

        const segData = await resSeg.json();
        ctx.segmentosList = Array.isArray(segData) ? segData : [];

        const confData = await resConf.json();
        ctx.confrontantesList = Array.isArray(confData) ? confData : [];

        const vizData = await resViz.json();
        ctx.pontosVizinhosList = Array.isArray(vizData) ? vizData : [];

        ctx.carregarConfrontantesAtivosSelect();
        const dropdownMat = document.getElementById('select-matricula-ribbon') as HTMLSelectElement;
        if (dropdownMat) {
          const formatAreaHa = (val: any) => {
            const num = parseFloat(val);
            return isNaN(num) ? '0.00' : num.toFixed(2);
          };

          dropdownMat.innerHTML = ctx.matriculasList.length === 0
            ? `<option value="" class="bg-[#0c1510]">[Sem Matrícula]</option>`
            : ctx.matriculasList.map((m: any) => `
                <option value="${m.id}" class="bg-[#0c1510]" ${ctx.currentMatriculaId === m.id ? 'selected' : ''}>
                  Matrícula ${m.numero_matricula || m.num_matricula || m.id} (${formatAreaHa(m.area_ha || m.area)}ha)
                </option>
              `).join('');

          if (ctx.currentMatriculaId) {
            dropdownMat.value = ctx.currentMatriculaId.toString();
          }

          if (!dropdownMat.getAttribute('data-has-listener')) {
            dropdownMat.setAttribute('data-has-listener', 'true');
            dropdownMat.addEventListener('change', (e: Event) => {
              const target = e.target as HTMLSelectElement;
              const mId = parseInt(target.value || '0');
              if (mId && typeof ctx.switchMatriculaTab === 'function') {
                ctx.switchMatriculaTab(mId);
              }
            });
          }
        }

        const dropdownFuso = document.getElementById('select-fuso-ribbon') as HTMLSelectElement;
        if (dropdownFuso && !dropdownFuso.getAttribute('data-has-listener')) {
          dropdownFuso.setAttribute('data-has-listener', 'true');
          dropdownFuso.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLSelectElement;
            const fusoVal = parseInt(target.value || '22');
            if (ctx.mapaController) {
              ctx.mapaController.fusoUtm = fusoVal;
            }
          });
        }

        inicializarMapOnce();
        ctx.renderFilaArquivos();
        ctx.loadWorkspaceArquivos();
        ctx.alternarEtapa(ctx.etapaAtiva);

        // Centralização inicial do mapa nos pontos da propriedade (Apenas na 1ª abertura do levantamento)
        const precisaCentralizarInicial = ctx.lastFittedLevId !== ctx.currentLevId;
        if (ctx.triagemMap && ctx.mapaController) {
          setTimeout(() => {
            if (!ctx.triagemMap) return;
            try {
              ctx.triagemMap.invalidateSize();
            } catch (e) {}

            if (precisaCentralizarInicial) {
              ctx.lastFittedLevId = ctx.currentLevId;
              let pontosParaCentralizar = [];

              // Na mesa geodésica o usuário vê os pontos brutos/ordenados, se tiver matrícula ele filtra.
              if (ctx.currentMatriculaId && ctx.obterPontosParaOrdenacao) {
                pontosParaCentralizar = ctx.obterPontosParaOrdenacao();
              } else if (ctx.currentMatriculaId) {
                pontosParaCentralizar = ctx.pontosList.filter((p: any) => p.matricula_id === ctx.currentMatriculaId);
              } else {
                pontosParaCentralizar = ctx.pontosList;
              }

              if (pontosParaCentralizar.length > 0 && ctx.mapaController) {
                ctx.mapaController.fitBounds(pontosParaCentralizar);
              }
            }
          }, 300);
        }

        ctx.carregarSugestoesNumeracao();
        if (levObj && levObj.profissional_id) {
          ctx.currentProfissionalId = levObj.profissional_id;
          ctx.carregarHomologacaoDados(levObj.profissional_id);
        }

      } catch (e) {
        console.error("Erro ao carregar detalhes do levantamento:", e);
        showToast("Erro ao carregar dados do levantamento. Verifique a conexão com a API.", 'error');
      }
    };

    const inicializarMapOnce = () => {
      if (!ctx.triagemMap) {
        ctx.triagemMap = ctx.mapaController.init('mapa-triagem');

        // Ativa interações AutoCAD no Canvas (Pan com botão do meio, janelas de seleção, etc)
        const canvasInteracao = new CanvasInteracao(ctx);
        canvasInteracao.ativar(ctx.mapaController);
        ctx.mapaController.canvasInteracao = canvasInteracao;
        ctx.canvasInteracao = canvasInteracao;

        // Listener para recentralização sob demanda (Bússola / Atalhos / Zoom Extents)
        window.addEventListener('gerencigeo:recenter', () => {
          if (ctx.triagemMap && ctx.mapaController && ctx.pontosList && ctx.pontosList.length > 0) {
            let pontosParaCentralizar = [];
            if (ctx.currentMatriculaId && ctx.obterPontosParaOrdenacao) {
              pontosParaCentralizar = ctx.obterPontosParaOrdenacao();
            } else if (ctx.currentMatriculaId) {
              pontosParaCentralizar = ctx.pontosList.filter((p: any) => p.matricula_id === ctx.currentMatriculaId);
            } else {
              pontosParaCentralizar = ctx.pontosList;
            }
            if (pontosParaCentralizar.length > 0) {
              ctx.mapaController.fitBounds(pontosParaCentralizar);
            }
          }
        });

        // Listener de cliques sequenciais no mapa Leaflet
        ctx.triagemMap?.on('popupopen', (e: any) => {
          if (!ctx.modoCliqueSequencialAtivo) return;

          const popup = e.popup;
          const content = popup.getContent();

          if (typeof content === 'string' && content.includes('btn-selecionar-clique-seq')) {
            setTimeout(() => {
              const btnEl = document.querySelector('.btn-selecionar-clique-seq') as HTMLButtonElement;
              if (btnEl) {
                btnEl.onclick = () => {
                  const pId = parseInt(btnEl.getAttribute('data-ponto-id') || '0');
                  if (pId) {
                    // Executa a injeção sequencial do ponto na lista
                    const pontosMatCompleto = ctx.pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
                    pontosMatCompleto.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

                    const ptParaMover = ctx.pontosList.find(p => p.id === pId);
                    if (ptParaMover) {
                      if (ctx.sequenciaCliqueProximoIndice === null) {
                        ctx.sequenciaCliqueProximoIndice = 1;
                      }

                      ctx.moverPontoPosicao(pId, ctx.sequenciaCliqueProximoIndice);
                      ctx.sequenciaCliqueProximoIndice++;
                    }
                    ctx.triagemMap?.closePopup();
                  }
                };
              }
            }, 10);
          }
        });
      }
    };

    ctx.switchMatriculaTab = (matriculaId: number) => {
      ctx.currentMatriculaId = matriculaId;

      const selectMat = document.getElementById('select-matricula-ribbon') as HTMLElement & { value: string };
      if (selectMat) {
        selectMat.value = matriculaId.toString();
      }

      const matObj = ctx.matriculasList.find(m => m.id === ctx.currentMatriculaId);
      const txtMat = document.getElementById('txt-nome-matricula-ativa');
      if (txtMat && matObj) {
        const areaNum = parseFloat(matObj.area_ha || matObj.area || '0');
        const areaFormatada = isNaN(areaNum) ? '0.00' : areaNum.toFixed(2);
        txtMat.textContent = `Nº ${matObj.numero_matricula} (${areaFormatada}ha)`;
      }

      ctx.renderMatriculaDados();
      ctx.carregarConfrontantesAtivosSelect();
      if (ctx.currentProfissionalId !== null) {
        ctx.carregarHomologacaoDados(ctx.currentProfissionalId);
      }

      if (ctx.triagemMap) {
        setTimeout(() => {
          if (!ctx.triagemMap) return;
          try {
            ctx.triagemMap.invalidateSize();
          } catch (e) {}
          const pontosMat = ctx.pontosList.filter(p => p.matricula_id === ctx.currentMatriculaId);
          const validCoords = pontosMat.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0).map(p => L.latLng(p.lat, p.lon));
          if (validCoords.length > 0 && ctx.triagemMap) {
            const bounds = L.latLngBounds(validCoords);
            try {
              ctx.triagemMap.fitBounds(bounds, { padding: [40, 40] });
            } catch (e) {}
          }
        }, 100);
      }
    };

    ctx.alternarEtapa = (etapa: string) => {
      ctx.etapaAtiva = etapa;

      // Alternância de views do workspace-body (AutoCAD style abas)
      const allViews = document.querySelectorAll('.view-panel');
      allViews.forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active-view');
      });

      let targetViewId = 'view-mesa-geodesica';
      if (etapa === 'cartorio') targetViewId = 'view-org-perimetro';
      else if (etapa === 'documentos') targetViewId = 'view-cartorio';
      else if (etapa === 'auditoria') targetViewId = 'view-auditoria';

      const targetView = document.getElementById(targetViewId);
      if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('active-view');
      }

      const containerMapa = document.getElementById('container-mapa-leaflet-parent');
      const splitterMapa = document.getElementById('splitter-mapa-tabela');

      const propsPanelTitle = document.querySelector('#painel-propriedades .props-panel-title');
      const propsPanelContent = document.getElementById('props-panel-content');
      const propsPanelOrdenador = document.getElementById('props-panel-ordenador');
      const propsPanelActions = document.getElementById('props-panel-actions');
      const painelPropriedades = document.getElementById('painel-propriedades');

      if (etapa === 'cartorio') {
        if (propsPanelTitle) propsPanelTitle.innerHTML = '<i data-lucide="arrow-up-down" class="w-3.5 h-3.5 text-mint-vibrant inline-block mr-1"></i> Ordenador Manual';
        if (propsPanelContent) propsPanelContent.style.display = 'none';
        if (propsPanelActions) propsPanelActions.style.display = 'none';
        if (propsPanelOrdenador) propsPanelOrdenador.style.display = 'flex';
        if (painelPropriedades) painelPropriedades.classList.remove('hidden');

        setTimeout(() => {
          if (typeof ctx.renderListaReordenarSimplificada === 'function') {
            ctx.renderListaReordenarSimplificada();
          }
          initIcons();
        }, 30);
      } else {
        if (propsPanelTitle) propsPanelTitle.innerHTML = ' Propriedades';
        if (propsPanelOrdenador) propsPanelOrdenador.style.display = 'none';
        if (propsPanelContent) propsPanelContent.style.display = '';
      }

      if (etapa === 'geoprocessamento' || etapa === 'cartorio') {
        containerMapa?.classList.remove('hidden');
        splitterMapa?.classList.remove('hidden');
        if (ctx.triagemMap) {
          setTimeout(() => {
            try {
              ctx.triagemMap?.invalidateSize?.();
            } catch (e) {}
          }, 50);
        }
      } else {
        containerMapa?.classList.add('hidden');
        splitterMapa?.classList.add('hidden');
      }

      const btnGeo = document.getElementById('btn-etapa-geoprocessamento');
      const btnCart = document.getElementById('btn-etapa-cartorio');
      const btnDoc = document.getElementById('btn-etapa-documentos');
      const btnAud = document.getElementById('btn-etapa-auditoria');
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      const gridSuperior = document.getElementById('grid-superior-detalhe');
      const containerTabelas = document.getElementById('container-tabelas-inferiores');
      const containerDivisas = document.getElementById('container-tabela-divisas');
      const btnSalvarPerimetro = document.getElementById('btn-salvar-perimetro-custom');
      const containerAuditoriaCampo = document.getElementById('container-etapa-auditoria-campo');
      const bannerSugestao = document.getElementById('banner-sugestao-numeracao');
      const panelHomologacao = document.getElementById('panel-homologacao-incra');
      const painelWorkspace = document.getElementById('painel-workspace-gnss');

      const lblTituloLateral = document.getElementById('lbl-titulo-tabela-lateral');
      const badgeLateral = document.getElementById('badge-tabela-lateral');

      const containerAbasMatriculas = document.getElementById('container-abas-matriculas');
      const containerInfoMatricula = document.getElementById('container-info-matricula-ativa');
      if (containerAbasMatriculas) {
        if (etapa === 'cartorio' || etapa === 'documentos') {
          containerAbasMatriculas.classList.remove('hidden');
        } else {
          containerAbasMatriculas.classList.add('hidden');
        }
      }
      if (containerInfoMatricula) {
        if (etapa === 'cartorio' || etapa === 'documentos') {
          containerInfoMatricula.classList.remove('hidden');
        } else {
          containerInfoMatricula.classList.add('hidden');
        }
      }

      if (etapa === 'geoprocessamento') {
        if (btnGeo) btnGeo.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnCart) btnCart.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnDoc) btnDoc.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnAud) btnAud.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';

        if (gridSuperior) gridSuperior.classList.remove('hidden');
        const splitterInf = document.getElementById('splitter-inferior');
        if (splitterInf) splitterInf.classList.add('hidden');

        if (containerDivisas) containerDivisas.classList.add('hidden');
        if (containerTabelas) containerTabelas.classList.remove('hidden');
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.add('hidden');
        if (painelWorkspace) painelWorkspace.classList.remove('hidden');
        if (lblTituloLateral) lblTituloLateral.innerText = "Auditoria de Translação Geodésica";
        if (badgeLateral) {
          badgeLateral.innerText = "VETOR DELTA ECEF";
          badgeLateral.className = "text-[9px] text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded-full font-bold";
        }
        if (btnSalvarPerimetro) btnSalvarPerimetro.classList.add('hidden');
        if (bannerSugestao) bannerSugestao.classList.add('hidden');
        if (panelHomologacao) panelHomologacao.classList.add('hidden');
      } else if (etapa === 'cartorio') {
        if (btnGeo) btnGeo.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnCart) btnCart.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnDoc) btnDoc.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnAud) btnAud.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';

        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (gridSuperior) gridSuperior.classList.remove('hidden');

        const splitterInf = document.getElementById('splitter-inferior');
        if (splitterInf) splitterInf.classList.remove('hidden');

        if (containerDivisas) containerDivisas.classList.remove('hidden');
        if (containerTabelas) containerTabelas.classList.remove('hidden');
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.add('hidden');
        if (painelWorkspace) painelWorkspace.classList.remove('hidden');
        if (lblTituloLateral) lblTituloLateral.innerText = "Segmentos de Divisa (Confrontantes)";
        if (badgeLateral) {
          badgeLateral.innerText = "EDICAO REAL-TIME";
          badgeLateral.className = "text-[9px] text-mint-vibrant font-mono bg-mint-vibrant/10 px-2 py-0.5 rounded-full font-bold";
        }
        if (btnSalvarPerimetro) btnSalvarPerimetro.classList.remove('hidden');
        if (panelHomologacao) panelHomologacao.classList.add('hidden'); // Oculto na Etapa 2
        ctx.carregarSugestoesNumeracao();
        if (typeof ctx.verificarRascunhoLocal === 'function') {
          ctx.verificarRascunhoLocal();
        }
      } else if (etapa === 'documentos') {
        if (btnGeo) btnGeo.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnCart) btnCart.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnDoc) btnDoc.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnAud) btnAud.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';

        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (gridSuperior) gridSuperior.classList.remove('hidden');
        const containerReordenar = document.getElementById('container-reordenar-manual');
        if (containerReordenar) containerReordenar.classList.add('hidden');

        const splitterInf = document.getElementById('splitter-inferior');
        if (splitterInf) splitterInf.classList.add('hidden');

        if (containerDivisas) containerDivisas.classList.add('hidden');
        if (containerTabelas) containerTabelas.classList.add('hidden');
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.add('hidden');
        if (painelWorkspace) painelWorkspace.classList.add('hidden');
        if (btnSalvarPerimetro) btnSalvarPerimetro.classList.add('hidden');
        if (bannerSugestao) bannerSugestao.classList.add('hidden');
        if (panelHomologacao) panelHomologacao.classList.remove('hidden'); // Visível na Etapa 3

        if (ctx.currentProfissionalId) {
          ctx.carregarHomologacaoDados(ctx.currentProfissionalId);
        }
      } else if (etapa === 'auditoria') {
        if (bannerSugestao) bannerSugestao.classList.add('hidden');
        if (panelHomologacao) panelHomologacao.classList.add('hidden');
        if (btnGeo) btnGeo.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnCart) btnCart.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnDoc) btnDoc.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';
        if (btnAud) btnAud.className = 'flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap active:scale-95';

        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (gridSuperior) gridSuperior.classList.add('hidden');

        if (containerTabelas) containerTabelas.classList.add('hidden');
        const splitterInf = document.getElementById('splitter-inferior');
        if (splitterInf) splitterInf.classList.add('hidden');
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.remove('hidden');
        if (painelWorkspace) painelWorkspace.classList.add('hidden');
        renderHistoricoCampo(ctx);
      }

      const tabBtn = document.querySelector(`.rl3-tab[data-tab="${etapa}"]`) as HTMLButtonElement;
      if (tabBtn) {
        const tabButtons = document.querySelectorAll('.rl3-tab');
        const panelRows = document.querySelectorAll('.rl3-panel');

        tabButtons.forEach(btn => {
          btn.classList.remove('active');
        });
        tabBtn.classList.add('active');

        panelRows.forEach(row => row.classList.add('hidden'));

        let panelId = 'panel-geoprocessamento';
        if (etapa === 'cartorio') panelId = 'panel-perimetro';
        else if (etapa === 'documentos') panelId = 'panel-cartorio';
        else if (etapa === 'auditoria') panelId = 'panel-auditoria';

        const targetPanel = document.getElementById(panelId);
        if (targetPanel) {
          targetPanel.classList.remove('hidden');
        }
      }

      initIcons();
      ctx.aplicarLargurasSplitters();
      if (ctx.triagemMap && etapa !== 'auditoria') {
        setTimeout(() => {
          ctx.triagemMap?.invalidateSize?.();
        }, 50);
      }

      if (etapa !== 'auditoria') {
        ctx.renderMatriculaDados();
      }
    };

    ctx.renderMatriculaDados = () => {
      if (ctx.etapaAtiva === 'geoprocessamento') {
        renderTabelaMesaGeodesica(ctx);
      } else if (ctx.etapaAtiva === 'cartorio') {
        renderTabelaOrganizadorPerimetro(ctx);
      }
    };

    ctx.atualizarPolilinhaMapaTemp = () => {
      if (!ctx.triagemMap) return;
      if (ctx.etapaAtiva !== 'geoprocessamento' && !ctx.currentMatriculaId) return;

      const pontosMat = (ctx.currentMatriculaId && ctx.obterPontosParaOrdenacao)
        ? ctx.obterPontosParaOrdenacao()
        : (ctx.pontosList || []).filter(p => p && (!ctx.arquivosDesativadosList || !ctx.arquivosDesativadosList.includes(p.arquivo_origem)));

      ctx.mapaController.clearOverlays();
      ctx.mapaController.plotPontos(pontosMat, (pId: number) => {
        if (ctx.modoCliqueSequencialAtivo && typeof ctx.lidarCliqueMarcadorSequencial === 'function') {
          ctx.lidarCliqueMarcadorSequencial(pId);
        } else {
          ctx.selectPontoFromTabela(pId);
        }
      });
      ctx.mapaController.plotPolilinhaTemporaria(pontosMat);
      if (ctx.pontosVizinhosList && ctx.pontosVizinhosList.length > 0) {
        ctx.mapaController.plotPontosVizinhos(ctx.pontosVizinhosList);
      }
      if (ctx.confrontantesList && ctx.confrontantesList.length > 0) {
        ctx.mapaController.plotPoligonosVizinhos(ctx.confrontantesList);
      }
    };

    let _previousSelectedIds = new Set<number>();
    let _previousSelectedVizinhoIds = new Set<number>();

    ctx.atualizarDestaqueLinhasTabela = () => {
      const currentSelectedIds = new Set(ctx.selectedPontoIds);
      const currentSelectedVizinhoIds = new Set(ctx.selectedVizinhoPontoIds);

      // ⚡ Bolt: Replace O(N) DOM query with O(K) specific updates for row selection
      // Instead of querying all rows in the table with querySelectorAll (which is slow for large datasets),
      // we only update the rows whose selection status changed by comparing previous and current state.

      // 1. Remove highlight from rows that are NO LONGER selected
      _previousSelectedIds.forEach(pId => {
        if (!currentSelectedIds.has(pId)) {
          // Using querySelectorAll to handle potential edge cases where multiple views show the same ID
          document.querySelectorAll(`.linha-ponto-tbl[data-ponto-id="${pId}"]`).forEach(tr => {
            tr.classList.remove('bg-mint-vibrant/25', 'text-mint-vibrant', 'border-mint-vibrant/40');
            tr.classList.add('hover:bg-white/[0.02]', 'border-white/5');
          });
        }
      });

      // 2. Add highlight to rows that are NEWLY selected
      currentSelectedIds.forEach(pId => {
        if (!_previousSelectedIds.has(pId)) {
          // Using querySelectorAll to handle potential edge cases where multiple views show the same ID
          document.querySelectorAll(`.linha-ponto-tbl[data-ponto-id="${pId}"]`).forEach(tr => {
            tr.classList.add('bg-mint-vibrant/25', 'text-mint-vibrant', 'border-mint-vibrant/40');
            tr.classList.remove('hover:bg-white/[0.02]', 'border-white/5');
          });
        }
      });

      const bar = document.getElementById('batch-action-bar-mesa');
      const countEl = document.getElementById('batch-selection-count-mesa');
      const btnIntegrar = document.getElementById('btn-batch-integrate-mesa');
      if (bar && countEl) {
        const countNormal = ctx.selectedPontoIds.length;
        const countVizinhos = ctx.selectedVizinhoPontoIds.length;
        const countTotal = countNormal + countVizinhos;

        if (countTotal > 0) {
          countEl.innerText = countTotal.toString();
          bar.classList.remove('hidden');

          // Se houver pontos vizinhos selecionados, mostra botão para integrá-los
          if (btnIntegrar) {
            if (countVizinhos > 0) {
              btnIntegrar.classList.remove('hidden');
            } else {
              btnIntegrar.classList.add('hidden');
            }
          }
        } else {
          bar.classList.add('hidden');
        }
      }

      // Marcadores normais: Limpa os que DEIXARAM de ser selecionados
      _previousSelectedIds.forEach(pId => {
        if (!currentSelectedIds.has(pId)) {
          const markerEl = document.getElementById(`map-marker-${pId}`);
          if (markerEl) {
            const bgClass = markerEl.getAttribute('data-ponto-bg') || 'bg-mint-vibrant';
            markerEl.className = `w-2.5 h-2.5 ${bgClass} border border-[#0c1510] rounded-full flex items-center justify-center shadow-md transition-all duration-150 coordinate-marker`;
          }
        }
      });

      // Marcadores normais: Aplica destaque nos que PASSARAM a ser selecionados (ou continuam)
      currentSelectedIds.forEach(pId => {
        if (!_previousSelectedIds.has(pId)) {
          const markerEl = document.getElementById(`map-marker-${pId}`);
          if (markerEl) {
            markerEl.className = "w-3.5 h-3.5 bg-yellow-400 border-2 border-white rounded-full flex items-center justify-center shadow-[0_0_10px_#facc15] scale-125 transition-all duration-150 z-[1000] coordinate-marker";
          }
        }
      });

      // Marcadores vizinhos: Limpa os que DEIXARAM de ser selecionados
      _previousSelectedVizinhoIds.forEach(pId => {
        if (!currentSelectedVizinhoIds.has(pId)) {
          const markerEl = document.getElementById(`vizinho-marker-${pId}`);
          if (markerEl) {
            markerEl.className = "w-2.5 h-2.5 bg-purple-500 border border-white rounded-full shadow-[0_0_6px_rgba(168,85,247,0.6)] transition-all duration-150 neighbor-marker";
          }
        }
      });

      // Marcadores vizinhos: Aplica destaque nos que PASSARAM a ser selecionados
      currentSelectedVizinhoIds.forEach(pId => {
        if (!_previousSelectedVizinhoIds.has(pId)) {
          const markerEl = document.getElementById(`vizinho-marker-${pId}`);
          if (markerEl) {
            markerEl.className = "w-3.5 h-3.5 bg-yellow-400 border-2 border-white rounded-full shadow-[0_0_10px_#facc15] scale-125 transition-all duration-150 z-[1000] neighbor-marker";
          }
        }
      });

      _previousSelectedIds = currentSelectedIds;
      _previousSelectedVizinhoIds = currentSelectedVizinhoIds;

      atualizarPainelPropriedades(ctx);
    };

    ctx.selectPontoFromTabela = (pontoId: number) => {
      ctx.selectedPontoIds = [pontoId];
      ctx.selectedVizinhoPontoIds = [];
      ctx.lastSelectedPontoId = pontoId;

      const row = document.getElementById(`tr-ponto-${pontoId}`);
      if (row) {
         row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      ctx.atualizarDestaqueLinhasTabela();
    };

    // 5. Configuração de Event Delegation (Tabelas de Campo/Matrícula)
    const setupEventDelegation = () => {
      const containerWorkspace = document.getElementById('container-workspace-arquivos');

      // Inicializa os eventos de clique, duplo clique e mudança da tabela inferior via tabela_dados.ts
      inicializarEventosTabela(ctx, abrirModalEditarPonto);

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
            window.open(`${API_BASE}/levantamentos/${ctx.currentLevId}/arquivos/download?categoria=${cat}&nome=${encodeURIComponent(nome)}`, '_blank');
            return;
          }

          if (btnDeletar) {
            const cat = btnDeletar.getAttribute('data-cat') || '';
            const nome = btnDeletar.getAttribute('data-nome') || '';

            let confirmMsg = `Tem certeza que deseja excluir o arquivo '${nome}' do repositório físico?`;
            if (cat === 'Processados' && nome.toLowerCase().endsWith('.txt')) {
              confirmMsg += `\n\nATENÇÃO: A exclusão desta caderneta purgará automaticamente todos os pontos importados dela no banco de dados.`;
            }

            if (!await customConfirm(confirmMsg)) return;

            try {
              const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/arquivos/deletar?categoria=${cat}&nome=${encodeURIComponent(nome)}`, {
                method: 'DELETE'
              });
              const resData = await res.json();
              if (resData.success) {
                showToast(resData.message, 'success');
                ctx.loadWorkspaceArquivos();
                if (resData.pontos_removidos > 0) {
                  ctx.loadLevantamentoDetails();
                }
              } else {
                showToast(`Erro ao excluir: ${resData.error || resData.detail || 'Falha desconhecida'}`, 'error');
              }
            } catch (err) {
              console.error("Erro ao deletar arquivo:", err);
              showToast("Erro de comunicação com o servidor API.", 'error');
            }
          }
        });
      }
    };

    // 6. Modal de Edição de Ponto e Menu de Contexto
    let pontoSelecionadoContextoId: number | null = null;

}
