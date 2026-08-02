import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, formatarCAR, formatarCCIR, showToast, customAlert, customConfirm, escapeHtml } from '../utils';
import { renderPropriedadesTemplate } from './propriedades/propriedades_template';
import {
   fetchTodasPropriedades,
   fetchTodosClientesList,
   salvarPropriedade as apiSalvarPropriedade,
   excluirPropriedadeIndividual as apiExcluirPropriedade,
   excluirPropriedadesEmLote as apiExcluirLotePropriedades,
   vincularProprietario as apiVincularProprietario,
   removerProprietario as apiRemoverProprietario,
   uploadAnexoDocumento,
   deletarAnexoDocumento,
   fetchMatriculasPropriedade,
   salvarMatricula as apiSalvarMatricula,
   excluirMatriculaService,
   fetchMatriculaHistorico
} from './propriedades/propriedades_service';
import {
   aplicarMascaraCCIRMat,
   aplicarMascaraITRMat,
   aplicarMascaraUUIDMat,
   renderLinhasPropriedadesHtml,
   renderProprietariosTabelaHtml,
   renderMatriculasTabelaHtml
} from './propriedades/propriedades_helpers';

let clickOutsideHandlerClientes: ((e: MouseEvent) => void) | null = null;

export const propriedadesRoute: RouteDef = {
   render: () => renderPropriedadesTemplate(),
   setup: () => {
      let propriedadeSelecionadaId: number | null = null;
      let todasPropriedades: any[] = [];
      let termoBusca = "";
      let paginaAtual = 1;
      let limitePorPagina = 10;
      const propriedadesSelecionadas = new Set<number>();
      let todosClientesList: any[] = [];

      let matriculaSendoEditadaId: number | null = null;
      let matriculasCache: any[] = [];

      // Elementos Principais
      const formProp = document.getElementById('form-propriedade') as HTMLFormElement;
      const inputCAR = formProp?.querySelector('[name="codigo_car"]') as any;
      const inputCCIR = formProp?.querySelector('[name="codigo_ccir"]') as any;
      const inputUF = formProp?.querySelector('[name="uf"]') as any;

      const inputMatCCIR = document.getElementById('input-new-mat-ccir') as any;
      const inputMatITR = document.getElementById('input-new-mat-itr') as any;
      const inputMatSIGEF = document.getElementById('input-new-mat-georreferenciamento') as any;
      const inputMatArea = document.getElementById('input-new-mat-area') as any;

      const modalCadastro = document.getElementById('modal-propriedade') as any;
      const modalDetalhes = document.getElementById('modal-detalhes-propriedade') as any;
      const modalHistMat = document.getElementById('modal-historico-matricula') as any;

      const abrirModalCadastro = () => {
         if (modalCadastro?.abrir) modalCadastro.abrir();
         else modalCadastro?.classList.remove('hidden');
      };
      const fecharModalCadastro = () => {
         if (modalCadastro?.fechar) modalCadastro.fechar();
         else modalCadastro?.classList.add('hidden');
      };
      const abrirModalDetalhes = () => {
         if (modalDetalhes?.abrir) modalDetalhes.abrir();
         else modalDetalhes?.classList.remove('hidden');
      };
      const fecharModalDetalhes = () => {
         if (modalDetalhes?.fechar) modalDetalhes.fechar();
         else modalDetalhes?.classList.add('hidden');
      };
      const abrirModalHistMat = () => {
         if (modalHistMat?.abrir) modalHistMat.abrir();
         else modalHistMat?.classList.remove('hidden');
      };

      // Máscaras de entrada
      const setupMask = (inputEl: any, maskFn: (v: string) => string) => {
         if (!inputEl) return;
         const handler = (e: Event) => {
            const t = e.target as HTMLInputElement;
            t.value = maskFn(t.value);
         };
         inputEl.addEventListener('input', handler);
         inputEl.addEventListener('ui-input', handler);
      };

      setupMask(inputCAR, formatarCAR);
      setupMask(inputCCIR, formatarCCIR);
      setupMask(inputMatCCIR, aplicarMascaraCCIRMat);
      setupMask(inputMatITR, aplicarMascaraITRMat);
      setupMask(inputMatSIGEF, aplicarMascaraUUIDMat);

      inputUF?.addEventListener('input', (e: Event) => {
         const t = e.target as HTMLInputElement;
         t.value = t.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
      });

      inputMatArea?.addEventListener('input', (e: Event) => {
         const t = e.target as HTMLInputElement;
         let val = t.value.replace(/[^\d.,]/g, '');
         const divisores = val.match(/[.,]/g);
         if (divisores && divisores.length > 1) val = val.slice(0, -1);
         t.value = val;
      });

      // Modais Handlers
      document.getElementById('btn-abrir-modal-propriedade')?.addEventListener('click', () => {
         propriedadeSelecionadaId = null;
         formProp?.reset();
         if (modalCadastro) modalCadastro.setAttribute('titulo', 'Nova Propriedade');
         const submitBtn = document.getElementById('btn-submit-prop');
         if (submitBtn) submitBtn.innerText = "Salvar Propriedade";
         abrirModalCadastro();
      });

      document.getElementById('btn-cancelar-prop')?.addEventListener('click', fecharModalCadastro);
      document.getElementById('btn-submit-prop')?.addEventListener('ui-click', (e) => {
         e.stopPropagation();
         formProp?.requestSubmit();
      });

      // Abas do Modal de Detalhes
      document.querySelectorAll('.tab-btn-det-prop').forEach(btn => {
         btn.addEventListener('click', (e) => {
            const targetTab = (e.target as HTMLElement).getAttribute('data-tab-prop');
            document.querySelectorAll('.tab-btn-det-prop').forEach(b => b.classList.replace('border-mint-vibrant', 'border-transparent'));
            document.querySelectorAll('.tab-btn-det-prop').forEach(b => b.classList.replace('text-mint-vibrant', 'text-white/40'));
            (e.target as HTMLElement).classList.replace('border-transparent', 'border-mint-vibrant');
            (e.target as HTMLElement).classList.replace('text-white/40', 'text-mint-vibrant');
            document.querySelectorAll('.tab-content-det-prop').forEach(tc => tc.classList.add('hidden'));
            document.getElementById(targetTab || '')?.classList.remove('hidden');
         });
      });

      // Ações em lote
      const updateBatchActionBar = () => {
         const bar = document.getElementById('batch-action-bar');
         const countSpan = document.getElementById('batch-selected-count');
         const checkAll = document.getElementById('check-all-propriedades') as any;
         
         if (propriedadesSelecionadas.size > 0) {
            if (countSpan) countSpan.innerText = propriedadesSelecionadas.size.toString();
            bar?.classList.remove('hidden');
         } else {
            bar?.classList.add('hidden');
         }

         const totalVisiveis = getPropriedadesPaginaAtual().length;
         const totalSelecionadosVisiveis = getPropriedadesPaginaAtual().filter(p => propriedadesSelecionadas.has(p.id)).length;
         if (checkAll) {
            const isAll = totalVisiveis > 0 && totalSelecionadosVisiveis === totalVisiveis;
            const isIndet = totalSelecionadosVisiveis > 0 && totalSelecionadosVisiveis < totalVisiveis;
            if ('marcado' in checkAll) checkAll.marcado = isAll;
            else checkAll.checked = isAll;
            if ('indeterminado' in checkAll) checkAll.indeterminado = isIndet;
            else checkAll.indeterminate = isIndet;
         }
      };

      document.getElementById('btn-batch-cancel')?.addEventListener('click', () => {
         propriedadesSelecionadas.clear();
         updateBatchActionBar();
         renderTabela();
      });

      document.getElementById('btn-batch-delete')?.addEventListener('click', async () => {
         const count = propriedadesSelecionadas.size;
         if (!(await customConfirm(`ATENÇÃO: A exclusão destas ${count} propriedades selecionadas removerá todos os seus vínculos de proprietários, matrículas, levantamentos e histórico físico no Windows Explorer de forma definitiva. Deseja continuar?`))) return;
         
         const bar = document.getElementById('batch-action-bar');
         if (bar) bar.style.cursor = 'wait';

         try {
            const { sucessos, erros } = await apiExcluirLotePropriedades(Array.from(propriedadesSelecionadas));
            if (erros.length > 0) {
               customAlert(`Algumas exclusões falharam (${sucessos} com sucesso): ${erros.join(', ')}`);
            } else {
               showToast("Propriedades selecionadas excluídas com sucesso.", "success");
            }
            propriedadesSelecionadas.clear();
            updateBatchActionBar();
            loadPropriedades();
         } catch (e) {
            showToast("Erro ao excluir propriedades selecionadas.", "error");
         } finally {
            if (bar) bar.style.cursor = '';
         }
      });

      // Filtros e Ordenação
      const buscaPropInput = document.getElementById('busca-propriedade');
      const handleSearchProp = (e: Event) => {
         termoBusca = ((e.target as any).value || (e as CustomEvent).detail?.value || '').toLowerCase();
         paginaAtual = 1;
         renderTabela();
      };
      buscaPropInput?.addEventListener('input', handleSearchProp);
      buscaPropInput?.addEventListener('ui-input', handleSearchProp);

      const selectOrdenacao = document.getElementById('ordenacao-propriedade');
      const handleOrdChange = () => {
         paginaAtual = 1;
         renderTabela();
      };
      selectOrdenacao?.addEventListener('change', handleOrdChange);
      selectOrdenacao?.addEventListener('ui-selecionar', handleOrdChange);

      const selectPaginacao = document.getElementById('paginacao-limite');
      const handlePagChange = (e: any) => {
         const val = e.detail?.id || e.target.value;
         if (val) {
            limitePorPagina = parseInt(val);
            paginaAtual = 1;
            renderTabela();
         }
      };
      selectPaginacao?.addEventListener('change', handlePagChange);
      selectPaginacao?.addEventListener('ui-selecionar', handlePagChange);

      const getPropriedadesFiltradas = () => {
         if (!termoBusca) return todasPropriedades;
         return todasPropriedades.filter(p => 
            (p.nome_propriedade || '').toLowerCase().includes(termoBusca) ||
            (p.municipio || '').toLowerCase().includes(termoBusca) ||
            (p.uf || '').toLowerCase().includes(termoBusca)
         );
      };

      const getPropriedadesOrdenadas = () => {
         const filtradas = getPropriedadesFiltradas();
         const tipo = (selectOrdenacao as any)?.value || 'nome-asc';
         
         const ordenadas = [...filtradas];
         if (tipo === 'nome-asc') ordenadas.sort((a, b) => (a.nome_propriedade || '').localeCompare(b.nome_propriedade || ''));
         else if (tipo === 'nome-desc') ordenadas.sort((a, b) => (b.nome_propriedade || '').localeCompare(a.nome_propriedade || ''));
         else if (tipo === 'data-desc') ordenadas.sort((a, b) => (b.id || 0) - (a.id || 0));
         else if (tipo === 'data-asc') ordenadas.sort((a, b) => (a.id || 0) - (b.id || 0));
         return ordenadas;
      };

      const getPropriedadesPaginaAtual = () => {
         const ordenadas = getPropriedadesOrdenadas();
         const inicio = (paginaAtual - 1) * limitePorPagina;
         return ordenadas.slice(inicio, inicio + limitePorPagina);
      };

      const renderTabela = () => {
         const body = document.getElementById('tabela-propriedades-body');
         const statusDiv = document.getElementById('tabela-propriedades-status');
         const info = document.getElementById('paginacao-info');
         const botoes = document.getElementById('paginacao-botoes');
         if (!body) return;

         const ordenadas = getPropriedadesOrdenadas();
         const total = ordenadas.length;
         const totalPaginas = Math.ceil(total / limitePorPagina);
         if (paginaAtual > totalPaginas) paginaAtual = Math.max(1, totalPaginas);

         const visiveis = getPropriedadesPaginaAtual();
         const totalImoveis = todasPropriedades.length;
         const municipiosDiferentes = new Set(todasPropriedades.map(p => `${(p.municipio || '').trim().toUpperCase()}/${(p.uf || '').trim().toUpperCase()}`)).size;
         
         let totalMatriculasAcumuladas = 0;
         let totalLevantamentosAcumulados = 0;
         todasPropriedades.forEach(p => {
            totalMatriculasAcumuladas += (p.total_matriculas || 0);
            totalLevantamentosAcumulados += (p.total_levantamentos || 0);
         });

         const setStatText = (id: string, text: string) => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
         };

         setStatText('stat-total-prop', totalImoveis.toString());
         setStatText('stat-municipios-prop', municipiosDiferentes.toString());
         setStatText('stat-total-mats', totalMatriculasAcumuladas.toString());
         setStatText('stat-total-levs', totalLevantamentosAcumulados.toString());

         if (total === 0) {
            body.innerHTML = '';
            statusDiv?.classList.remove('hidden');
            if (statusDiv) statusDiv.innerText = todasPropriedades.length === 0 ? "Nenhuma propriedade cadastrada no sistema." : "Nenhum resultado encontrado para a busca.";
            if (info) info.innerText = "Mostrando 0-0 de 0 propriedades";
            if (botoes) botoes.innerHTML = '';
            return;
         }

         statusDiv?.classList.add('hidden');
         body.innerHTML = renderLinhasPropriedadesHtml(visiveis, propriedadesSelecionadas);

         const inicioItem = (paginaAtual - 1) * limitePorPagina + 1;
         const fimItem = Math.min(paginaAtual * limitePorPagina, total);
         if (info) info.innerText = `Mostrando ${inicioItem}-${fimItem} de ${total} propriedades`;

         let pagButtonsHtml = '';
         if (totalPaginas > 1) {
            pagButtonsHtml += `
               <button class="h-7 px-2.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold flex items-center justify-center cursor-pointer" ${paginaAtual === 1 ? 'disabled' : ''} onclick="window.mudarPaginaPropriedades(${paginaAtual - 1})">
                  Anterior
               </button>
            `;
            
            for (let p = 1; p <= totalPaginas; p++) {
               if (p === 1 || p === totalPaginas || (p >= paginaAtual - 1 && p <= paginaAtual + 1)) {
                  const activeClass = p === paginaAtual ? 'bg-mint-vibrant text-forest-deep border-transparent font-bold' : 'border-white/10 hover:bg-white/5 text-white/70';
                  pagButtonsHtml += `
                     <button class="w-7 h-7 rounded border text-xs font-mono transition-all flex items-center justify-center cursor-pointer ${activeClass}" onclick="window.mudarPaginaPropriedades(${p})">
                        ${p}
                     </button>
                  `;
               } else if (p === paginaAtual - 2 || p === paginaAtual + 2) {
                  pagButtonsHtml += `<span class="px-1 text-white/20 select-none">...</span>`;
               }
            }

            pagButtonsHtml += `
               <button class="h-7 px-2.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold flex items-center justify-center cursor-pointer" ${paginaAtual === totalPaginas ? 'disabled' : ''} onclick="window.mudarPaginaPropriedades(${paginaAtual + 1})">
                  Próxima
               </button>
            `;
         }
         if (botoes) botoes.innerHTML = pagButtonsHtml;
         initIcons();

         body.querySelectorAll('.check-propriedade').forEach(cb => {
            const handler = (e: Event) => {
               const check = e.target as any;
               const id = parseInt(check.getAttribute('data-id') || '0');
               const isChecked = check.marcado ?? check.checked ?? false;
               if (isChecked) propriedadesSelecionadas.add(id);
               else propriedadesSelecionadas.delete(id);
               updateBatchActionBar();
               renderTabela();
            };
            cb.addEventListener('change', handler);
            cb.addEventListener('ui-change', handler);
         });

         updateBatchActionBar();
      };

      (window as any).mudarPaginaPropriedades = (novaPagina: number) => {
         paginaAtual = novaPagina;
         renderTabela();
      };

      const checkAllProps = document.getElementById('check-all-propriedades');
      const handleCheckAllProps = (e: Event) => {
         const check = e.target as any;
         const isChecked = check.marcado ?? check.checked ?? false;
         const visiveis = getPropriedadesPaginaAtual();
         if (isChecked) visiveis.forEach(p => propriedadesSelecionadas.add(p.id));
         else visiveis.forEach(p => propriedadesSelecionadas.delete(p.id));
         updateBatchActionBar();
         renderTabela();
      };
      checkAllProps?.addEventListener('change', handleCheckAllProps);
      checkAllProps?.addEventListener('ui-change', handleCheckAllProps);

      const loadPropriedades = () => {
         const body = document.getElementById('tabela-propriedades-body');
         const statusDiv = document.getElementById('tabela-propriedades-status');
         if (!body) return Promise.resolve();

         body.innerHTML = '';
         statusDiv?.classList.remove('hidden');
         if (statusDiv) statusDiv.innerText = "Carregando propriedades...";

         return fetchTodasPropriedades()
            .then(data => {
               todasPropriedades = data;
               
               const focoIdStr = localStorage.getItem('gerencigeo_foco_propriedade_id');
               if (focoIdStr) {
                  const focoId = parseInt(focoIdStr);
                  localStorage.removeItem('gerencigeo_foco_propriedade_id');
                  if (focoId && todasPropriedades.some((x: any) => x.id === focoId)) {
                     renderTabela();
                     (window as any).abrirDetalhesPropriedade(focoId);
                     return;
                  }
               }
               renderTabela();
            })
            .catch(err => {
               console.error("Erro ao carregar propriedades:", err);
               statusDiv?.classList.remove('hidden');
               if (statusDiv) statusDiv.innerHTML = '<span class="text-red-400 font-bold">Erro de conexão ao servidor.</span>';
            });
      };

      const loadClientesList = async () => {
         try {
            todosClientesList = await fetchTodosClientesList();
            setupComboboxClientes();
         } catch (err) {
            console.error("Erro ao carregar clientes globais:", err);
         }
      };

      const setupComboboxClientes = () => {
         const inputBusca = document.getElementById('busca-proprietario-cliente') as any;
         const inputHidden = document.getElementById('vinc-cliente-id') as HTMLInputElement;
         const listaFlutuante = document.getElementById('lista-vinc-clientes');
         if (!inputBusca || !inputHidden || !listaFlutuante) return;

         const renderOpcoes = (termo: string) => {
            const t = termo.toLowerCase();
            const filtrados = todosClientesList.filter(c => 
               c.nome_completo.toLowerCase().includes(t) ||
               c.cpf_cnpj.includes(t)
            );

            if (filtrados.length === 0) {
               listaFlutuante.innerHTML = '<div class="p-2.5 text-xs text-white/30 italic">Nenhum cliente localizado.</div>';
            } else {
               listaFlutuante.innerHTML = filtrados.map(c => `
                  <div class="opcao-vinc-item p-2 hover:bg-mint-vibrant/10 cursor-pointer text-xs transition-colors flex flex-col" data-id="${c.id}" data-nome="${escapeHtml(c.nome_completo)}">
                     <span class="font-bold text-white">${escapeHtml(c.nome_completo)}</span>
                     <span class="text-[9px] text-white/40 font-mono mt-0.5">Doc: ${escapeHtml(c.cpf_cnpj)}</span>
                  </div>
               `).join('');

               listaFlutuante.querySelectorAll('.opcao-vinc-item').forEach(item => {
                  item.addEventListener('click', () => {
                     inputBusca.value = item.getAttribute('data-nome') || '';
                     inputHidden.value = item.getAttribute('data-id') || '';
                     listaFlutuante.classList.add('hidden');
                  });
               });
            }
         };

         inputBusca.addEventListener('focus', () => {
            listaFlutuante.classList.remove('hidden');
            renderOpcoes(inputBusca.value || '');
         });

         inputBusca.addEventListener('input', () => {
            listaFlutuante.classList.remove('hidden');
            renderOpcoes(inputBusca.value || '');
         });
         inputBusca.addEventListener('ui-input', () => {
            listaFlutuante.classList.remove('hidden');
            renderOpcoes(inputBusca.value || '');
         });

         clickOutsideHandlerClientes = (e: MouseEvent) => {
            if (!inputBusca.contains(e.target as Node) && !listaFlutuante.contains(e.target as Node)) {
               listaFlutuante.classList.add('hidden');
            }
         };
         document.addEventListener('click', clickOutsideHandlerClientes);
      };

      // Modal de detalhes
      (window as any).abrirDetalhesPropriedade = (id: number) => {
         const p = todasPropriedades.find(x => x.id === id);
         if (!p) return;

         propriedadeSelecionadaId = id;
         const titulo = document.getElementById('det-prop-titulo');
         const subtitulo = document.getElementById('det-prop-subtitulo');
         if (titulo) titulo.innerText = p.nome_propriedade;
         if (subtitulo) subtitulo.innerText = `${p.municipio} / ${p.uf}`;

         const setDetVal = (elId: string, val: string) => {
            const el = document.getElementById(elId);
            if (el) el.innerText = val || '-';
         };

         setDetVal('det-prop-car', p.codigo_car);
         setDetVal('det-prop-ccir', p.codigo_ccir ? formatarCCIR(p.codigo_ccir) : '-');

         configurarExibicaoArquivo('car', p.caminho_arquivo_car);
         configurarExibicaoArquivo('ccir', p.caminho_arquivo_ccir);
         renderProprietariosTabela(p.clientes || []);
         resetaFormularioMatricula();
         loadMatriculasDaPropriedade(id);

         const activeTabBtn = document.querySelector('.tab-btn-det-prop[data-tab-prop="tab-prop-dados"]') as HTMLElement;
         if (activeTabBtn) activeTabBtn.click();
         abrirModalDetalhes();
      };

      const excluirArquivoPropriedade = async (tipo: 'car' | 'ccir') => {
         if (!propriedadeSelecionadaId) return;
         if (!(await customConfirm(`Deseja realmente excluir o arquivo de certidão do ${tipo.toUpperCase()} anexado?`))) return;

         try {
            await deletarAnexoDocumento(propriedadeSelecionadaId, tipo);
            showToast("Arquivo removido com sucesso.", "success");
            todasPropriedades = await fetchTodasPropriedades();
            const pAtual = todasPropriedades.find(x => x.id === propriedadeSelecionadaId);
            configurarExibicaoArquivo(tipo, pAtual ? pAtual[`caminho_arquivo_${tipo}`] : null);
            renderTabela();
         } catch (err: any) {
            showToast(err.message || "Erro ao remover o arquivo.", "error");
         }
      };

      document.getElementById('btn-delete-car')?.addEventListener('click', () => excluirArquivoPropriedade('car'));
      document.getElementById('btn-delete-ccir')?.addEventListener('click', () => excluirArquivoPropriedade('ccir'));

      const configurarExibicaoArquivo = (tipo: 'car' | 'ccir', caminho: string | null) => {
         const dropzone = document.getElementById(`dropzone-${tipo}`);
         const containerAnexo = document.getElementById(`container-anexo-${tipo}`);
         const textNome = document.getElementById(`txt-anexo-${tipo}-nome`);
         const btnDownload = document.getElementById(`btn-download-${tipo}`) as HTMLButtonElement;
         if (!dropzone || !containerAnexo || !textNome || !btnDownload) return;

         if (caminho) {
            dropzone.classList.add('hidden');
            containerAnexo.classList.remove('hidden');
            const parts = caminho.split(/[\\/]/);
            const filename = parts[parts.length - 1];
            textNome.innerText = filename;
            
            const openUrl = () => window.open(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/arquivo-${tipo}`, '_blank');
            btnDownload.onclick = openUrl;
            textNome.onclick = openUrl;
         } else {
            dropzone.classList.remove('hidden');
            containerAnexo.classList.add('hidden');
            textNome.innerText = '';
            textNome.onclick = null;
         }
      };

      const renderProprietariosTabela = (clientes: any[]) => {
         const corpo = document.getElementById('tbl-prop-proprietarios-corpo');
         const lblQuota = document.getElementById('lbl-quota-restante');
         if (!corpo || !lblQuota) return;

         let somaParticipacao = 0;
         clientes.forEach(c => somaParticipacao += (c.percentual_participacao || 0));
         corpo.innerHTML = renderProprietariosTabelaHtml(clientes);
         initIcons();

         const quotaRestante = Math.max(0, 100 - somaParticipacao);
         lblQuota.innerText = `${quotaRestante.toFixed(2)}%`;
      };

      (window as any).removerProprietarioVinculado = async (cliId: number) => {
         if (!propriedadeSelecionadaId) return;
         if (await customConfirm("Tem certeza que deseja remover a vinculação de copropriedade deste cliente?")) {
            try {
               await apiRemoverProprietario(propriedadeSelecionadaId, cliId);
               showToast("Vínculo removido com sucesso.", "success");
               todasPropriedades = await fetchTodasPropriedades();
               const pAtual = todasPropriedades.find(x => x.id === propriedadeSelecionadaId);
               renderProprietariosTabela(pAtual ? pAtual.clientes || [] : []);
               renderTabela();
            } catch (err: any) {
               customAlert(err.message || "Erro ao remover vínculo.");
            }
         }
      };

      document.getElementById('form-vincular-proprietario')?.addEventListener('submit', async (e) => {
         e.preventDefault();
         if (!propriedadeSelecionadaId) return;

         const inputClienteId = document.getElementById('vinc-cliente-id') as HTMLInputElement;
         const inputPart = document.getElementById('vinc-participacao') as any;
         const clienteId = parseInt(inputClienteId?.value || '0');
         const percentual = parseFloat(inputPart?.value || '0');

         if (!clienteId || isNaN(percentual) || percentual <= 0 || percentual > 100) {
            customAlert("Selecione um cliente válido e informe uma participação percentual válida.");
            return;
         }

         try {
            await apiVincularProprietario(propriedadeSelecionadaId, clienteId, percentual);
            showToast("Proprietário vinculado com sucesso.", "success");
            
            const buscaInput = document.getElementById('busca-proprietario-cliente') as any;
            if (buscaInput) buscaInput.value = '';
            if (inputClienteId) inputClienteId.value = '';
            if (inputPart) inputPart.value = '';

            todasPropriedades = await fetchTodasPropriedades();
            const pAtual = todasPropriedades.find(x => x.id === propriedadeSelecionadaId);
            renderProprietariosTabela(pAtual ? pAtual.clientes || [] : []);
            renderTabela();
         } catch (err: any) {
            customAlert(err.message || "Erro ao vincular proprietário.");
         }
      });

      const resetaFormularioMatricula = () => {
         matriculaSendoEditadaId = null;
         const formMat = document.getElementById('form-cadastrar-matricula-prop') as HTMLFormElement;
         if (formMat) {
            formMat.reset();
            formMat.querySelectorAll('ui-campo-texto').forEach((el: any) => {
               el.value = '';
               el.removeAttribute('value');
            });
         }

         const titulo = document.getElementById('form-matricula-titulo');
         if (titulo) titulo.innerText = "Cadastrar Gleba / Matrícula";

         const btnSubmit = document.getElementById('btn-submit-mat');
         if (btnSubmit) btnSubmit.innerText = "Salvar Matrícula";

         const btnCancelar = document.getElementById('btn-cancelar-edicao-mat');
         if (btnCancelar) btnCancelar.classList.add('hidden');
      };

      document.getElementById('btn-cancelar-edicao-mat')?.addEventListener('click', resetaFormularioMatricula);

      const loadMatriculasDaPropriedade = async (propId: number) => {
         const corpo = document.getElementById('tbl-prop-matriculas-corpo');
         if (!corpo) return;
         corpo.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-white/30 italic">Carregando matrículas...</td></tr>`;

         try {
            matriculasCache = await fetchMatriculasPropriedade(propId);
            const p = todasPropriedades.find(x => x.id === propId);
            corpo.innerHTML = renderMatriculasTabelaHtml(matriculasCache, p?.codigo_ccir);
            initIcons();
         } catch (e) {
            corpo.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-400 font-bold">Erro ao carregar matrículas.</td></tr>`;
         }
      };

      (window as any).iniciarEdicaoMatricula = (matId: number) => {
         const m = matriculasCache.find(x => x.id === matId);
         if (!m) return;

         matriculaSendoEditadaId = matId;
         const setMatVal = (id: string, val: any) => {
            const el = document.getElementById(id) as any;
            if (el) {
               el.value = val || '';
               if ('setAttribute' in el) el.setAttribute('value', val || '');
            }
         };

         const areaVal = (m.area_registrada_ha !== undefined && m.area_registrada_ha !== null && m.area_registrada_ha > 0) ? m.area_registrada_ha : m.area_ha;
         const ccirVal = m.codigo_ccir || m.ccir;
         const itrVal = m.codigo_itr || m.itr;
         const denominacaoVal = m.denominacao_gleba || m.denominacao;

         setMatVal('input-new-mat-numero', m.numero_matricula);
         setMatVal('input-new-mat-denominacao', denominacaoVal);
         setMatVal('input-new-mat-area', areaVal ? areaVal.toString().replace('.', ',') : '');
         setMatVal('input-new-mat-ccir', ccirVal ? aplicarMascaraCCIRMat(ccirVal) : '');
         setMatVal('input-new-mat-itr', itrVal ? aplicarMascaraITRMat(itrVal) : '');
         setMatVal('input-new-mat-valor-itr', m.valor_itr);
         setMatVal('input-new-mat-georreferenciamento', m.georreferenciamento ? aplicarMascaraUUIDMat(m.georreferenciamento) : '');

         const titulo = document.getElementById('form-matricula-titulo');
         if (titulo) titulo.innerText = `Editar Matrícula Nº ${m.numero_matricula}`;

         const btnSubmit = document.getElementById('btn-submit-mat');
         if (btnSubmit) btnSubmit.innerText = "Atualizar Matrícula";

         const btnCancelar = document.getElementById('btn-cancelar-edicao-mat');
         if (btnCancelar) btnCancelar.classList.remove('hidden');

         document.getElementById('input-new-mat-numero')?.focus();
      };

      (window as any).excluirMatriculaIndiv = async (matId: number) => {
         const m = matriculasCache.find(x => x.id === matId);
         if (!m || !(await customConfirm(`Tem certeza que deseja excluir a matrícula nº "${m.numero_matricula}"?`))) return;

         try {
            await excluirMatriculaService(matId);
            showToast("Matrícula excluída com sucesso.", "success");
            resetaFormularioMatricula();
            if (propriedadeSelecionadaId) loadMatriculasDaPropriedade(propriedadeSelecionadaId);
            todasPropriedades = await fetchTodasPropriedades();
            renderTabela();
         } catch (e: any) {
            customAlert(e.message || "Erro ao excluir matrícula.");
         }
      };

      document.getElementById('form-cadastrar-matricula-prop')?.addEventListener('submit', async (e) => {
         e.preventDefault();
         if (!propriedadeSelecionadaId) return;

         const getMatVal = (id: string) => (document.getElementById(id) as any)?.value?.trim() || '';
         const numero = getMatVal('input-new-mat-numero');
         const denominacao = getMatVal('input-new-mat-denominacao');
         const areaStr = getMatVal('input-new-mat-area').replace(',', '.');
         const ccir = getMatVal('input-new-mat-ccir').replace(/\D/g, '');
         const itr = getMatVal('input-new-mat-itr').replace(/\D/g, '');
         const valorItr = getMatVal('input-new-mat-valor-itr');
         const georef = getMatVal('input-new-mat-georreferenciamento');

         if (!numero || !denominacao || !areaStr) {
            customAlert("Preencha o Número da Matrícula, Denominação e Área.");
            return;
         }

         const areaNum = parseFloat(areaStr);
         if (isNaN(areaNum) || areaNum <= 0) {
            customAlert("Informe um valor numérico válido para a Área Registrada.");
            return;
         }

         const payload = {
            propriedade_id: propriedadeSelecionadaId,
            numero_matricula: numero,
            denominacao_gleba: denominacao,
            denominacao: denominacao,
            area_registrada_ha: areaNum,
            area_ha: areaNum,
            codigo_ccir: ccir || null,
            ccir: ccir || null,
            codigo_itr: itr || null,
            itr: itr || null,
            valor_itr: valorItr ? parseFloat(valorItr) : null,
            georreferenciamento: georef || null
         };

         try {
            await apiSalvarMatricula(payload, matriculaSendoEditadaId);
            showToast(matriculaSendoEditadaId ? "Matrícula atualizada com sucesso." : "Matrícula cadastrada com sucesso.", "success");
            resetaFormularioMatricula();
            loadMatriculasDaPropriedade(propriedadeSelecionadaId);
            todasPropriedades = await fetchTodasPropriedades();
            renderTabela();
         } catch (err: any) {
            customAlert(err.message || "Erro ao salvar matrícula.");
         }
      });

      (window as any).abrirHistoricoMatricula = async (matId: number, numeroMatricula: string) => {
         const titulo = document.getElementById('modal-hist-mat-titulo');
         const corpo = document.getElementById('tbl-hist-mat-corpo');
         if (titulo) titulo.innerText = `Histórico da Matrícula Nº ${numeroMatricula}`;
         if (corpo) corpo.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-white/30 italic">Carregando histórico...</td></tr>`;

         abrirModalHistMat();

         try {
            const logs = await fetchMatriculaHistorico(matId);
            if (!corpo) return;
            if (!logs || logs.length === 0) {
               corpo.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-white/20 italic">Nenhum histórico de alteração registrado.</td></tr>`;
            } else {
               corpo.innerHTML = logs.map(log => {
                  const dataFmt = new Date(log.data_alteracao).toLocaleString('pt-BR');
                  return `
                     <tr class="hover:bg-white/[0.01]">
                        <td class="py-2 px-3 font-medium text-white/80">${escapeHtml(log.campo_alterado)}</td>
                        <td class="py-2 px-3 text-red-400 font-mono truncate max-w-[120px]" title="${escapeHtml(log.valor_antigo || '')}">${escapeHtml(log.valor_antigo || '-')}</td>
                        <td class="py-2 px-3 text-mint-vibrant font-mono truncate max-w-[120px]" title="${escapeHtml(log.valor_novo || '')}">${escapeHtml(log.valor_novo || '-')}</td>
                        <td class="py-2 px-3 text-right text-white/40 font-mono">${dataFmt}</td>
                     </tr>
                  `;
               }).join('');
            }
         } catch (e) {
            if (corpo) corpo.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-400 font-bold">Falha ao obter histórico da matrícula.</td></tr>`;
         }
      };

      (window as any).abrirEdicaoPropriedade = (id: number) => {
         const p = todasPropriedades.find(x => x.id === id);
         if (!p || !formProp) return;

         propriedadeSelecionadaId = id;
         const setPropVal = (name: string, val: any) => {
            const input = formProp.querySelector(`[name="${name}"]`) as any;
            if (input) {
               input.value = val || '';
               if ('setAttribute' in input) input.setAttribute('value', val || '');
            }
         };

         setPropVal('nome_propriedade', p.nome_propriedade);
         setPropVal('codigo_car', p.codigo_car ? formatarCAR(p.codigo_car) : '');
         setPropVal('codigo_ccir', p.codigo_ccir ? formatarCCIR(p.codigo_ccir) : '');
         setPropVal('municipio', p.municipio);
         setPropVal('uf', p.uf);

         if (modalCadastro) modalCadastro.setAttribute('titulo', 'Editar Propriedade');
         const submitBtn = document.getElementById('btn-submit-prop');
         if (submitBtn) submitBtn.innerText = "Atualizar Propriedade";

         fecharModalDetalhes();
         abrirModalCadastro();
      };

      (window as any).excluirPropriedadeIndividual = async (id: number) => {
         const p = todasPropriedades.find(x => x.id === id);
         if (!p || !(await customConfirm(`ATENÇÃO: Deseja realmente excluir a propriedade "${p.nome_propriedade}"? Esta ação removerá permanentemente todos os seus vínculos de proprietários, matrículas, levantamentos e histórico físico.`))) return;

         try {
            await apiExcluirPropriedade(id);
            showToast("Propriedade excluída com sucesso.", "success");
            fecharModalDetalhes();
            propriedadesSelecionadas.delete(id);
            updateBatchActionBar();
            loadPropriedades();
         } catch (e: any) {
            showToast(e.message || "Erro ao excluir propriedade.", "error");
         }
      };

      document.getElementById('btn-det-editar-prop')?.addEventListener('click', () => {
         if (propriedadeSelecionadaId) (window as any).abrirEdicaoPropriedade(propriedadeSelecionadaId);
      });

      document.getElementById('btn-det-excluir-prop')?.addEventListener('click', () => {
         if (propriedadeSelecionadaId) (window as any).excluirPropriedadeIndividual(propriedadeSelecionadaId);
      });

      // Submit Form Propriedade
      formProp?.addEventListener('submit', async (e) => {
         e.preventDefault();
         const formData = new FormData(e.target as HTMLFormElement);
         const payload = Object.fromEntries(formData.entries()) as any;

         if (payload.codigo_car) payload.codigo_car = payload.codigo_car.replace(/[^a-zA-Z0-9]/g, '');
         if (payload.codigo_ccir) payload.codigo_ccir = payload.codigo_ccir.replace(/\D/g, '');

         try {
            await apiSalvarPropriedade(payload, propriedadeSelecionadaId);
            showToast(propriedadeSelecionadaId ? "Propriedade atualizada com sucesso." : "Propriedade cadastrada com sucesso.", "success");
            fecharModalCadastro();
            (e.target as HTMLFormElement).reset();
            loadPropriedades();
         } catch (e: any) {
            customAlert(e.message || "Erro ao salvar propriedade.");
         }
      });

      // Configuração de Dropzones de Upload CAR e CCIR
      const configurarDropzone = (tipo: 'car' | 'ccir') => {
         const dropzone = document.getElementById(`dropzone-${tipo}`);
         const fileInput = document.getElementById(`input-file-${tipo}`) as HTMLInputElement;
         if (!dropzone || !fileInput) return;

         const processarUpload = async (file: File) => {
            if (!propriedadeSelecionadaId) {
               showToast("Selecione uma propriedade primeiro.", "error");
               return;
            }
            try {
               showToast(`Enviando arquivo do ${tipo.toUpperCase()}...`, "info");
               await uploadAnexoDocumento(propriedadeSelecionadaId, tipo, file);
               showToast(`Arquivo do ${tipo.toUpperCase()} anexado com sucesso.`, "success");
               todasPropriedades = await fetchTodasPropriedades();
               const pAtual = todasPropriedades.find(x => x.id === propriedadeSelecionadaId);
               configurarExibicaoArquivo(tipo, pAtual ? pAtual[`caminho_arquivo_${tipo}`] : null);
               renderTabela();
            } catch (err: any) {
               customAlert(err.message || `Erro ao anexar arquivo do ${tipo.toUpperCase()}.`);
            }
         };

         dropzone.addEventListener('click', () => fileInput.click());
         fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length > 0) {
               processarUpload(fileInput.files[0]);
            }
         });

         dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            const hoverClass = tipo === 'car' ? 'border-mint-vibrant' : 'border-blue-500';
            dropzone.classList.add(hoverClass);
         });

         dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            const hoverClass = tipo === 'car' ? 'border-mint-vibrant' : 'border-blue-500';
            dropzone.classList.remove(hoverClass);
         });

         dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            const hoverClass = tipo === 'car' ? 'border-mint-vibrant' : 'border-blue-500';
            dropzone.classList.remove(hoverClass);
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
               processarUpload(e.dataTransfer.files[0]);
            }
         });
      };

      configurarDropzone('car');
      configurarDropzone('ccir');

      loadPropriedades();
      loadClientesList();
   },
   cleanup: () => {
      if (clickOutsideHandlerClientes) {
         document.removeEventListener('click', clickOutsideHandlerClientes);
         clickOutsideHandlerClientes = null;
      }
   }
};
