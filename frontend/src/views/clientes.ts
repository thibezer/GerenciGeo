import type { RouteDef } from '../types';
import { initIcons } from '../utils';
import { renderClientesTemplate } from './clientes/clientes_template';
import {
   fetchTodosClientes,
   fetchClienteHistorico,
   salvarCliente,
   excluirClienteIndividual as apiExcluirCliente,
   excluirClientesEmLote as apiExcluirLote,
   salvarMetadadosCliente,
   carregarCidadesIbgeService,
   buscarCepViaCepService
} from './clientes/clientes_service';
import {
   aplicarMascaraCpfCnpj,
   aplicarMascaraTelefone,
   aplicarMascaraCep,
   calcularEstatisticasClientes,
   renderLinhasTabelaHtml,
   renderBotoesPaginacaoHtml,
   renderMetadadosTabelaHtml,
   renderLogsHistoricoTabelaHtml,
   renderPropriedadesVinculadasHtml
} from './clientes/clientes_helpers';

export const clientesRoute: RouteDef = {
   render: () => renderClientesTemplate(),
   setup: () => {
      let clienteSelecionadoId: number | null = null;
      let todosClientes: any[] = [];
      let termoBusca = "";
      let paginaAtual = 1;
      let limitePorPagina = 10;
      const clientesSelecionados = new Set<number>();

      // Formulário e Elementos da UI
      const form = document.getElementById('form-cliente') as HTMLFormElement;
      const inputCpfCnpj = form?.querySelector('[name="cpf_cnpj"]') as HTMLInputElement;
      const inputCpfConjuge = form?.querySelector('[name="cpf_conjuge"]') as HTMLInputElement;
      const inputTelefone = form?.querySelector('[name="telefone"]') as HTMLInputElement;
      const inputCep = form?.querySelector('[name="cep"]') as HTMLInputElement;
      const selectEstado = form?.querySelector('[name="estado"]') as any;
      const selectEstadoCivil = form?.querySelector('[name="estado_civil"]') as any;
      const secaoConjuge = document.getElementById('secao-conjuge');
      const modalCadastro = document.getElementById('modal-cliente') as any;
      const modalDetalhes = document.getElementById('modal-detalhes-cliente') as any;

      // Auxiliares de modais
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

      // Máscaras de entrada em tempo real
      const handleInputMask = (inputEl: HTMLElement | null, maskFn: (val: string) => string) => {
         if (!inputEl) return;
         const handler = (e: Event) => {
            const target = e.target as HTMLInputElement;
            target.value = maskFn(target.value);
         };
         inputEl.addEventListener('input', handler);
         inputEl.addEventListener('ui-input', handler);
      };

      handleInputMask(inputCpfCnpj, aplicarMascaraCpfCnpj);
      handleInputMask(inputCpfConjuge, aplicarMascaraCpfCnpj);
      handleInputMask(inputTelefone, aplicarMascaraTelefone);

      // Carga de Cidades do IBGE
      const carregarCidadesPorEstado = async (uf: string) => {
         const datalist = document.getElementById('cidades-list');
         if (!datalist) return;
         datalist.innerHTML = '<option value="Carregando cidades...">';

         try {
            const nomes = await carregarCidadesIbgeService(uf);
            datalist.innerHTML = nomes.map(nome => `<option value="${nome}">`).join('');
         } catch (err) {
            console.warn("Erro ao buscar cidades do IBGE:", err);
            datalist.innerHTML = '';
         }
      };

      selectEstado?.addEventListener('change', (e: any) => carregarCidadesPorEstado(e.target.value));
      selectEstado?.addEventListener('ui-selecionar', (e: any) => carregarCidadesPorEstado(e.detail?.id || e.target.value));

      // Busca inteligente de CEP via ViaCEP
      const buscarCep = async (cep: string) => {
         try {
            const data = await buscarCepViaCepService(cep);
            if (data) {
               const inputLogradouro = form.querySelector('[name="endereco_sem_numero"]') as HTMLInputElement;
               const inputCidade = form.querySelector('[name="cidade"]') as HTMLInputElement;
               const inputNumero = form.querySelector('[name="numero_endereco"]') as HTMLInputElement;

               if (inputLogradouro) {
                  const logradouro = data.logradouro || '';
                  const bairro = data.bairro ? ` - ${data.bairro}` : '';
                  inputLogradouro.value = `${logradouro}${bairro}`;
               }
               if (selectEstado) {
                  selectEstado.value = data.uf || 'PR';
                  await carregarCidadesPorEstado(data.uf);
               }
               if (inputCidade) inputCidade.value = data.localidade || '';
               if (inputNumero) inputNumero.focus();
            }
         } catch (err) {
            console.warn("Erro ao buscar CEP:", err);
         }
      };

      inputCep?.addEventListener('input', (e) => {
         const target = e.target as HTMLInputElement;
         target.value = aplicarMascaraCep(target.value);
         const cepLimpo = target.value.replace(/\D/g, '');
         if (cepLimpo.length === 8) buscarCep(cepLimpo);
      });

      // Alternar exibição da seção de cônjuge conforme estado civil
      const toggleConjuge = () => {
         if (!selectEstadoCivil || !secaoConjuge) return;
         const val = selectEstadoCivil.value || '';
         const isCasado = val.includes("Casado") || val.includes("União Estável");
         if (isCasado) {
            secaoConjuge.classList.remove('hidden');
         } else {
            secaoConjuge.classList.add('hidden');
            const nomeConj = form.querySelector('[name="nome_conjuge"]') as HTMLInputElement;
            const cpfConj = form.querySelector('[name="cpf_conjuge"]') as HTMLInputElement;
            const rgConj = form.querySelector('[name="rg_conjuge"]') as HTMLInputElement;
            const regimeBens = form.querySelector('[name="regime_bens"]') as HTMLSelectElement;
            if (nomeConj) nomeConj.value = '';
            if (cpfConj) cpfConj.value = '';
            if (rgConj) rgConj.value = '';
            if (regimeBens) regimeBens.value = '';
         }
      };

      selectEstadoCivil?.addEventListener('change', toggleConjuge);
      selectEstadoCivil?.addEventListener('ui-selecionar', toggleConjuge);

      // Botões de abertura/fechamento de modais
      document.getElementById('btn-abrir-modal-cliente')?.addEventListener('click', () => {
         clienteSelecionadoId = null;
         if (form) {
            form.reset();
            if (selectEstado) selectEstado.value = 'PR';
            carregarCidadesPorEstado('PR');
            toggleConjuge();
         }
         if (modalCadastro) modalCadastro.setAttribute('titulo', 'Cadastro de Cliente');
         abrirModalCadastro();
      });

      document.getElementById('btn-cancelar-cliente')?.addEventListener('click', fecharModalCadastro);
      document.getElementById('btn-salvar-cliente')?.addEventListener('click', () => form?.requestSubmit());

      // Abas do Modal de Detalhes
      document.querySelectorAll('.tab-btn-det').forEach(btn => {
         btn.addEventListener('click', (e) => {
            const targetTab = (e.target as HTMLElement).getAttribute('data-tab-det');
            document.querySelectorAll('.tab-btn-det').forEach(b => b.classList.replace('border-mint-vibrant', 'border-transparent'));
            document.querySelectorAll('.tab-btn-det').forEach(b => b.classList.replace('text-mint-vibrant', 'text-white/40'));
            (e.target as HTMLElement).classList.replace('border-transparent', 'border-mint-vibrant');
            (e.target as HTMLElement).classList.replace('text-white/40', 'text-mint-vibrant');
            document.querySelectorAll('.tab-content-det').forEach(tc => tc.classList.add('hidden'));
            document.getElementById(targetTab || '')?.classList.remove('hidden');
         });
      });

      // Atualização visual da barra de ações em lote
      const updateBatchActionBar = () => {
         const bar = document.getElementById('batch-action-bar');
         const countSpan = document.getElementById('batch-selected-count');
         const checkAll = document.getElementById('check-all-clientes') as any;

         if (clientesSelecionados.size > 0) {
            if (countSpan) countSpan.innerText = clientesSelecionados.size.toString();
            bar?.classList.remove('hidden');
         } else {
            bar?.classList.add('hidden');
         }

         const totalVisiveis = getClientesPaginaAtual().length;
         const totalSelecionadosVisiveis = getClientesPaginaAtual().filter(c => clientesSelecionados.has(c.id)).length;
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
         clientesSelecionados.clear();
         updateBatchActionBar();
         renderTabela();
      });

      document.getElementById('btn-batch-delete')?.addEventListener('click', async () => {
         const count = clientesSelecionados.size;
         if (!confirm(`Deseja realmente excluir os ${count} clientes selecionados?`)) return;
         const bar = document.getElementById('batch-action-bar');
         if (bar) bar.style.cursor = 'wait';

         try {
            const { sucessos, erros } = await apiExcluirLote(Array.from(clientesSelecionados));
            if (erros.length > 0) {
               alert(`Algumas exclusões falharam (${sucessos} com sucesso): ${erros.join(', ')}`);
            }
            clientesSelecionados.clear();
            updateBatchActionBar();
            loadClientes();
         } catch (e) {
            alert("Erro ao excluir clientes selecionados.");
         } finally {
            if (bar) bar.style.cursor = '';
         }
      });

      // Filtro de busca com Debounce
      let timeoutBusca: ReturnType<typeof setTimeout>;
      const buscaInput = document.getElementById('busca-cliente');
      const handleSearch = (e: Event) => {
         clearTimeout(timeoutBusca);
         timeoutBusca = setTimeout(() => {
            const val = (e.target as any).value || (e as CustomEvent).detail?.value || '';
            termoBusca = val.toLowerCase();
            paginaAtual = 1;
            renderTabela();
         }, 300);
      };
      buscaInput?.addEventListener('input', handleSearch);
      buscaInput?.addEventListener('ui-input', handleSearch);

      // Limite de itens por página
      const selectPaginacao = document.getElementById('paginacao-limite');
      const handlePaginacaoChange = (e: any) => {
         const val = e.detail?.id || e.target.value;
         if (val) {
            limitePorPagina = parseInt(val);
            paginaAtual = 1;
            renderTabela();
         }
      };
      selectPaginacao?.addEventListener('change', handlePaginacaoChange);
      selectPaginacao?.addEventListener('ui-selecionar', handlePaginacaoChange);

      const getClientesFiltrados = () => {
         if (!termoBusca) return todosClientes;
         return todosClientes.filter(c =>
            (c.nome_completo || '').toLowerCase().includes(termoBusca) ||
            (c.cpf_cnpj || '').replace(/\D/g, '').includes(termoBusca.replace(/\D/g, ''))
         );
      };

      const getClientesPaginaAtual = () => {
         const filtrados = getClientesFiltrados();
         const inicio = (paginaAtual - 1) * limitePorPagina;
         return filtrados.slice(inicio, inicio + limitePorPagina);
      };

      // Renderização da Tabela de Clientes
      const renderTabela = () => {
         const body = document.getElementById('tabela-clientes-body');
         const statusDiv = document.getElementById('tabela-clientes-status');
         const info = document.getElementById('paginacao-info');
         const botoes = document.getElementById('paginacao-botoes');
         if (!body) return;

         const filtrados = getClientesFiltrados();
         const total = filtrados.length;
         const totalPaginas = Math.ceil(total / limitePorPagina);
         if (paginaAtual > totalPaginas) paginaAtual = Math.max(1, totalPaginas);

         const visiveis = getClientesPaginaAtual();
         if (total === 0) {
            body.innerHTML = '';
            statusDiv?.classList.remove('hidden');
            if (statusDiv) statusDiv.innerText = todosClientes.length === 0 ? "Nenhum cliente cadastrado no sistema." : "Nenhum resultado encontrado para a busca.";
            if (info) info.innerText = "Mostrando 0-0 de 0 clientes";
            if (botoes) botoes.innerHTML = '';
            return;
         }

         statusDiv?.classList.add('hidden');
         body.innerHTML = renderLinhasTabelaHtml(visiveis, clientesSelecionados);

         const inicioItem = (paginaAtual - 1) * limitePorPagina + 1;
         const fimItem = Math.min(paginaAtual * limitePorPagina, total);
         if (info) info.innerText = `Mostrando ${inicioItem}-${fimItem} de ${total} clientes`;

         if (botoes) botoes.innerHTML = renderBotoesPaginacaoHtml(paginaAtual, totalPaginas);
         initIcons();

         // Listeners de checkboxes individuais
         body.querySelectorAll('.check-cliente').forEach(cb => {
            const handler = (e: Event) => {
               const check = e.target as any;
               const id = parseInt(check.getAttribute('data-id') || '0');
               const isChecked = check.marcado ?? check.checked ?? false;
               if (isChecked) clientesSelecionados.add(id);
               else clientesSelecionados.delete(id);
               updateBatchActionBar();
               renderTabela();
            };
            cb.addEventListener('change', handler);
            cb.addEventListener('ui-change', handler);
         });

         updateBatchActionBar();
      };

      (window as any).mudarPaginaClientes = (novaPagina: number) => {
         paginaAtual = novaPagina;
         renderTabela();
      };

      const checkAllClientes = document.getElementById('check-all-clientes');
      const handleCheckAll = (e: Event) => {
         const check = e.target as any;
         const isChecked = check.marcado ?? check.checked ?? false;
         const visiveis = getClientesPaginaAtual();
         if (isChecked) visiveis.forEach(c => clientesSelecionados.add(c.id));
         else visiveis.forEach(c => clientesSelecionados.delete(c.id));
         updateBatchActionBar();
         renderTabela();
      };
      checkAllClientes?.addEventListener('change', handleCheckAll);
      checkAllClientes?.addEventListener('ui-change', handleCheckAll);

      (window as any).revelarSenhaGovTabela = (id: number) => {
         const cli = todosClientes.find(c => c.id === id);
         if (!cli || !cli.senha_gov) return;
         const span = document.getElementById(`senha-gov-val-${id}`);
         if (!span) return;
         if (span.innerText === '••••••••') {
            if (confirm(`Deseja realmente visualizar a Senha GOV de "${cli.nome_completo}"?`)) {
               span.innerText = cli.senha_gov;
               span.classList.add('text-mint-vibrant', 'font-bold');
            }
         } else {
            span.innerText = '••••••••';
            span.classList.remove('text-mint-vibrant', 'font-bold');
         }
      };

      (window as any).irParaPropriedade = (propId: number) => {
         fecharModalDetalhes();
         localStorage.setItem('gerencigeo_foco_propriedade_id', propId.toString());
         window.location.hash = '#propriedades';
      };

      // Modal de detalhe do cliente
      (window as any).abrirDetalhesCliente = async (id: number) => {
         const cli = todosClientes.find(c => c.id === id);
         if (!cli) return;

         clienteSelecionadoId = id;
         const avatar = document.getElementById('det-cli-avatar') as any;
         const titulo = document.getElementById('det-cli-titulo');
         const subtitulo = document.getElementById('det-cli-subtitulo');

         if (avatar) {
            if ('setAttribute' in avatar) avatar.setAttribute('nome', cli.nome_completo || '??');
            else avatar.innerText = (cli.nome_completo || '??').substring(0, 2).toUpperCase();
         }
         if (titulo) titulo.innerText = cli.nome_completo;
         if (subtitulo) subtitulo.innerText = `CPF/CNPJ: ${aplicarMascaraCpfCnpj(cli.cpf_cnpj || '')}`;

         const setDetVal = (id: string, val: any) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val || '-';
         };

         setDetVal('det-cli-sexo', cli.sexo === 'M' ? 'Masculino' : cli.sexo === 'F' ? 'Feminino' : '-');
         setDetVal('det-cli-rg', cli.rg_ie);

         let dataNascFormatada = '-';
         if (cli.data_nascimento_fundacao) {
            const partes = cli.data_nascimento_fundacao.split('-');
            if (partes.length === 3) {
               dataNascFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;
            } else {
               dataNascFormatada = cli.data_nascimento_fundacao;
            }
         }
         setDetVal('det-cli-datanasc', dataNascFormatada);

         setDetVal('det-cli-estcivil', cli.estado_civil);
         setDetVal('det-cli-nacionalidade', cli.nacionalidade);
         setDetVal('det-cli-profissao', cli.profissao || '-');
         setDetVal('det-cli-telefone', cli.telefone ? aplicarMascaraTelefone(cli.telefone) : '-');
         setDetVal('det-cli-email', cli.email);

         const btnRevelarDet = document.getElementById('btn-revelar-senhagov-det');
         const spanSenhaDet = document.getElementById('det-cli-senhagov');
         if (cli.senha_gov) {
            if (spanSenhaDet) {
               spanSenhaDet.innerText = '••••••••';
               spanSenhaDet.classList.remove('text-mint-vibrant', 'font-bold');
            }
            if (btnRevelarDet) {
               btnRevelarDet.classList.remove('hidden');
               btnRevelarDet.onclick = () => {
                  if (spanSenhaDet?.innerText === '••••••••') {
                     if (confirm(`Deseja realmente visualizar a Senha GOV de "${cli.nome_completo}"?`)) {
                        spanSenhaDet.innerText = cli.senha_gov;
                        spanSenhaDet.classList.add('text-mint-vibrant', 'font-bold');
                     }
                  } else if (spanSenhaDet) {
                     spanSenhaDet.innerText = '••••••••';
                     spanSenhaDet.classList.remove('text-mint-vibrant', 'font-bold');
                  }
               };
            }
         } else {
            if (spanSenhaDet) {
               spanSenhaDet.innerText = '-';
               spanSenhaDet.classList.remove('text-mint-vibrant', 'font-bold');
            }
            if (btnRevelarDet) btnRevelarDet.classList.add('hidden');
         }

         setDetVal('det-cli-endereco', `${cli.endereco_completo || ''} ${cli.cep ? ' · CEP: ' + aplicarMascaraCep(cli.cep) : ''} - ${cli.cidade || ''}/${cli.estado || ''}`);
         setDetVal('det-cli-total-levs', cli.total_levantamentos || 0);
         setDetVal('det-cli-total-props', cli.total_propriedades || 0);

         const listaPropsContainer = document.getElementById('det-cli-lista-propriedades');
         if (listaPropsContainer) {
            listaPropsContainer.innerHTML = renderPropriedadesVinculadasHtml(cli.propriedades || []);
            initIcons();
         }

         const blocoConjuge = document.getElementById('det-conjuge-bloco');
         const isCasado = (cli.estado_civil || '').includes("Casado") || (cli.estado_civil || '').includes("União Estável");
         if (blocoConjuge) {
            if (isCasado) {
               blocoConjuge.classList.remove('hidden');
               setDetVal('det-cli-nomeconjuge', cli.nome_conjuge);
               setDetVal('det-cli-cpfconjuge', aplicarMascaraCpfCnpj(cli.cpf_conjuge || ''));
               setDetVal('det-cli-rgconjuge', cli.rg_conjuge);
               setDetVal('det-cli-regimebens', cli.regime_bens);
            } else {
               blocoConjuge.classList.add('hidden');
            }
         }

         renderMetadadosDetalhes(cli.metadados || {});

         const activeTabBtn = document.querySelector('.tab-btn-det[data-tab-det="tab-det-dados"]') as HTMLElement;
         if (activeTabBtn) activeTabBtn.click();

         const logsContainer = document.getElementById('det-cli-logs');
         if (logsContainer) logsContainer.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-white/30">Carregando logs...</td></tr>';

         try {
            const logs = await fetchClienteHistorico(id);
            if (logsContainer) logsContainer.innerHTML = renderLogsHistoricoTabelaHtml(logs);
         } catch (e) {
            if (logsContainer) logsContainer.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-400">Falha ao obter histórico.</td></tr>';
         }

         abrirModalDetalhes();
      };

      const renderMetadadosDetalhes = (metadadosObj: Record<string, string>) => {
         const metasContainer = document.getElementById('det-cli-metadados');
         if (!metasContainer) return;
         metasContainer.innerHTML = renderMetadadosTabelaHtml(metadadosObj);
         initIcons();
      };

      (window as any).excluirMetadadoDetalhe = async (key: string) => {
         if (!clienteSelecionadoId) return;
         const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
         if (!cli || !confirm(`Remover metadado "${key}" do cliente?`)) return;

         const metadadosCopy = { ...(cli.metadados || {}) };
         delete metadadosCopy[key];

         const payload = {
            ...cli,
            metadados: metadadosCopy
         };

         try {
            await salvarMetadadosCliente(clienteSelecionadoId, payload);
            cli.metadados = metadadosCopy;
            renderMetadadosDetalhes(metadadosCopy);
            loadClientes();
         } catch (e) {
            alert("Erro ao atualizar metadados.");
         }
      };

      document.getElementById('form-add-meta')?.addEventListener('submit', async (e) => {
         e.preventDefault();
         if (!clienteSelecionadoId) return;
         const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
         if (!cli) return;

         const keyInput = document.getElementById('meta-key') as HTMLInputElement;
         const valInput = document.getElementById('meta-val') as HTMLInputElement;
         const key = keyInput?.value.trim();
         const val = valInput?.value.trim();

         if (!key || !val) {
            alert("Preencha chave e valor.");
            return;
         }

         const metadadosCopy = { ...(cli.metadados || {}), [key]: val };
         const payload = { ...cli, metadados: metadadosCopy };

         try {
            await salvarMetadadosCliente(clienteSelecionadoId, payload);
            cli.metadados = metadadosCopy;
            renderMetadadosDetalhes(metadadosCopy);
            if (keyInput) keyInput.value = '';
            if (valInput) valInput.value = '';
            loadClientes();
         } catch (e) {
            alert("Erro ao salvar metadado.");
         }
      });

      (window as any).abrirEdicaoCliente = async (id: number) => {
         const cli = todosClientes.find(c => c.id === id);
         if (!cli || !form) return;

         clienteSelecionadoId = id;

         const setFormVal = (name: string, val: any) => {
            const input = form.querySelector(`[name="${name}"]`) as any;
            if (input) {
               input.value = val || '';
               if ('setAttribute' in input) input.setAttribute('value', val || '');
            }
         };

         const enderecoCompleto = cli.endereco_completo || '';
         let enderecoSemNumero = enderecoCompleto;
         let numero = '';
         if (enderecoCompleto.includes(', ')) {
            const partes = enderecoCompleto.split(', ');
            numero = partes[partes.length - 1];
            enderecoSemNumero = partes.slice(0, -1).join(', ');
         }

         setFormVal('nome_completo', cli.nome_completo);
         setFormVal('cpf_cnpj', aplicarMascaraCpfCnpj(cli.cpf_cnpj || ''));
         setFormVal('rg_ie', cli.rg_ie);
         setFormVal('data_nascimento_fundacao', cli.data_nascimento_fundacao || '');
         setFormVal('estado_civil', cli.estado_civil);
         setFormVal('sexo', cli.sexo || 'M');
         setFormVal('nacionalidade', cli.nacionalidade);
         setFormVal('nome_conjuge', cli.nome_conjuge);
         setFormVal('cpf_conjuge', aplicarMascaraCpfCnpj(cli.cpf_conjuge || ''));
         setFormVal('rg_conjuge', cli.rg_conjuge);
         setFormVal('regime_bens', cli.regime_bens);
         setFormVal('profissao', cli.profissao);
         setFormVal('telefone', cli.telefone ? aplicarMascaraTelefone(cli.telefone) : '');
         setFormVal('email', cli.email);
         setFormVal('senha_gov', cli.senha_gov);
         setFormVal('cep', cli.cep ? aplicarMascaraCep(cli.cep) : '');
         setFormVal('endereco_sem_numero', enderecoSemNumero);
         setFormVal('numero_endereco', numero);
         setFormVal('estado', cli.estado || 'PR');

         if (cli.estado) {
            await carregarCidadesPorEstado(cli.estado);
            const inputCidade = form.querySelector('[name="cidade"]') as HTMLInputElement;
            if (inputCidade) inputCidade.value = cli.cidade || '';
         }

         toggleConjuge();
         if (modalCadastro) modalCadastro.setAttribute('titulo', 'Editar Cliente');
         fecharModalDetalhes();
         abrirModalCadastro();
      };

      (window as any).excluirClienteIndividual = async (id: number) => {
         const cli = todosClientes.find(c => c.id === id);
         if (!cli || !confirm(`Deseja realmente excluir o cliente "${cli.nome_completo}"?`)) return;

         try {
            await apiExcluirCliente(id);
            fecharModalDetalhes();
            clientesSelecionados.delete(id);
            updateBatchActionBar();
            loadClientes();
         } catch (e: any) {
            alert(e.message || "Erro ao excluir o cliente.");
         }
      };

      document.getElementById('btn-det-editar')?.addEventListener('click', () => {
         if (clienteSelecionadoId) (window as any).abrirEdicaoCliente(clienteSelecionadoId);
      });

      document.getElementById('btn-det-excluir')?.addEventListener('click', () => {
         if (clienteSelecionadoId) (window as any).excluirClienteIndividual(clienteSelecionadoId);
      });

      // Carga e Atualização de KPIs
      const loadClientes = () => {
         const body = document.getElementById('tabela-clientes-body');
         const statusDiv = document.getElementById('tabela-clientes-status');
         if (!body) return Promise.resolve();

         body.innerHTML = '';
         statusDiv?.classList.remove('hidden');
         if (statusDiv) statusDiv.innerText = "Carregando clientes...";

         return fetchTodosClientes()
            .then(data => {
               todosClientes = data;
               const stats = calcularEstatisticasClientes(todosClientes);

               const setKpiText = (id: string, text: string) => {
                  const el = document.getElementById(id);
                  if (el) el.innerText = text;
               };

               setKpiText('stat-total-clientes', stats.total.toString());
               setKpiText('stat-pf-clientes', stats.pf.toString());
               setKpiText('stat-pj-clientes', stats.pj.toString());
               setKpiText('stat-incompletos-clientes', stats.incompletos.toString());

               renderTabela();
            }).catch(err => {
               console.error("Erro ao obter clientes:", err);
               statusDiv?.classList.remove('hidden');
               if (statusDiv) statusDiv.innerHTML = '<span class="text-red-400 font-bold">Erro de conexão ao servidor.</span>';
            });
      };

      loadClientes();

      // Submit Form (Novo ou Edição)
      form?.addEventListener('submit', async (e) => {
         e.preventDefault();
         const formData = new FormData(e.target as HTMLFormElement);
         const payload = Object.fromEntries(formData.entries()) as any;

         const enderecoSemNumero = payload.endereco_sem_numero || '';
         const numero = payload.numero_endereco || '';
         payload.endereco_completo = numero ? `${enderecoSemNumero}, ${numero}` : enderecoSemNumero;

         delete payload.endereco_sem_numero;
         delete payload.numero_endereco;

         if (clienteSelecionadoId) {
            const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
            if (cli && cli.metadados) payload.metadados = cli.metadados;
         }

         try {
            await salvarCliente(payload, clienteSelecionadoId);
            fecharModalCadastro();
            (e.target as HTMLFormElement).reset();
            loadClientes();
         } catch (e: any) {
            alert(e.message || "Erro ao salvar.");
         }
      });
   }
};
