import type {
  RouteDef,
  Cliente,
  ClientePayload,
  ClienteHistoricoLog
} from '../types';
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

interface UIModalElement extends HTMLElement {
  abrir?: () => void;
  fechar?: () => void;
}

interface UICheckboxElement extends HTMLElement {
  marcado?: boolean;
  checked?: boolean;
  indeterminado?: boolean;
  indeterminate?: boolean;
}

interface UISelectElement extends HTMLElement {
  value?: string;
}

export const clientesRoute: RouteDef = {
  render: () => renderClientesTemplate(),
  setup: () => {
    let clienteSelecionadoId: number | null = null;
    let todosClientes: Cliente[] = [];
    let termoBusca = "";
    let paginaAtual = 1;
    let limitePorPagina = 10;
    const clientesSelecionados = new Set<number>();

    // Formulário e Elementos da UI
    const form = document.getElementById('form-cliente') as HTMLFormElement | null;
    const inputCpfCnpj = form?.querySelector<HTMLInputElement>('[name="cpf_cnpj"]') || null;
    const inputCpfConjuge = form?.querySelector<HTMLInputElement>('[name="cpf_conjuge"]') || null;
    const inputTelefone = form?.querySelector<HTMLInputElement>('[name="telefone"]') || null;
    const inputCep = form?.querySelector<HTMLInputElement>('[name="cep"]') || null;
    const selectEstado = form?.querySelector<UISelectElement>('[name="estado"]') || null;
    const selectEstadoCivil = form?.querySelector<UISelectElement>('[name="estado_civil"]') || null;
    const secaoConjuge = document.getElementById('secao-conjuge');
    const modalCadastro = document.getElementById('modal-cliente') as UIModalElement | null;
    const modalDetalhes = document.getElementById('modal-detalhes-cliente') as UIModalElement | null;

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

    selectEstado?.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLSelectElement;
      carregarCidadesPorEstado(target.value);
    });
    selectEstado?.addEventListener('ui-selecionar', (e: Event) => {
      const customEvent = e as CustomEvent<{ id?: string }>;
      const uf = customEvent.detail?.id || (e.target as UISelectElement).value || 'PR';
      carregarCidadesPorEstado(uf);
    });

    // Busca inteligente de CEP via ViaCEP
    const buscarCep = async (cep: string) => {
      try {
        const data = await buscarCepViaCepService(cep);
        if (data && form) {
          const inputLogradouro = form.querySelector<HTMLInputElement>('[name="endereco_sem_numero"]');
          const inputCidade = form.querySelector<HTMLInputElement>('[name="cidade"]');
          const inputNumero = form.querySelector<HTMLInputElement>('[name="numero_endereco"]');

          if (inputLogradouro) {
            const logradouro = data.logradouro || '';
            const bairro = data.bairro ? ` - ${data.bairro}` : '';
            inputLogradouro.value = `${logradouro}${bairro}`;
          }
          if (selectEstado) {
            selectEstado.value = data.uf || 'PR';
            if ('setAttribute' in selectEstado) selectEstado.setAttribute('value', data.uf || 'PR');
            await carregarCidadesPorEstado(data.uf || 'PR');
          }
          if (inputCidade) inputCidade.value = data.localidade || '';
          if (inputNumero) inputNumero.focus();
        }
      } catch (err) {
        console.warn("Erro ao buscar CEP:", err);
      }
    };

    inputCep?.addEventListener('input', (e: Event) => {
      const target = e.target as HTMLInputElement;
      target.value = aplicarMascaraCep(target.value);
      const cepLimpo = target.value.replace(/\D/g, '');
      if (cepLimpo.length === 8) buscarCep(cepLimpo);
    });

    // Alternar exibição da seção de cônjuge conforme estado civil
    const toggleConjuge = () => {
      if (!selectEstadoCivil || !secaoConjuge || !form) return;
      const val = selectEstadoCivil.value || '';
      const isCasado = val.includes("Casado") || val.includes("União Estável");
      if (isCasado) {
        secaoConjuge.classList.remove('hidden');
      } else {
        secaoConjuge.classList.add('hidden');
        const nomeConj = form.querySelector<HTMLInputElement>('[name="nome_conjuge"]');
        const cpfConj = form.querySelector<HTMLInputElement>('[name="cpf_conjuge"]');
        const rgConj = form.querySelector<HTMLInputElement>('[name="rg_conjuge"]');
        const regimeBens = form.querySelector<HTMLSelectElement>('[name="regime_bens"]');
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
        if (selectEstado) {
          selectEstado.value = 'PR';
          if ('setAttribute' in selectEstado) selectEstado.setAttribute('value', 'PR');
        }
        carregarCidadesPorEstado('PR');
        toggleConjuge();
      }
      if (modalCadastro) modalCadastro.setAttribute('titulo', 'Cadastro de Cliente');
      abrirModalCadastro();
    });

    document.getElementById('btn-cancelar-cliente')?.addEventListener('click', fecharModalCadastro);
    document.getElementById('btn-salvar-cliente')?.addEventListener('click', () => form?.requestSubmit());

    // Abas do Modal de Detalhes
    document.querySelectorAll<HTMLElement>('.tab-btn-det').forEach(btn => {
      btn.addEventListener('click', (e: MouseEvent) => {
        const targetTab = (e.currentTarget as HTMLElement).getAttribute('data-tab-det');
        document.querySelectorAll('.tab-btn-det').forEach(b => b.classList.replace('border-mint-vibrant', 'border-transparent'));
        document.querySelectorAll('.tab-btn-det').forEach(b => b.classList.replace('text-mint-vibrant', 'text-white/40'));
        (e.currentTarget as HTMLElement).classList.replace('border-transparent', 'border-mint-vibrant');
        (e.currentTarget as HTMLElement).classList.replace('text-white/40', 'text-mint-vibrant');
        document.querySelectorAll('.tab-content-det').forEach(tc => tc.classList.add('hidden'));
        document.getElementById(targetTab || '')?.classList.remove('hidden');
      });
    });

    // Atualização visual da barra de ações em lote
    const updateBatchActionBar = () => {
      const bar = document.getElementById('batch-action-bar');
      const countSpan = document.getElementById('batch-selected-count');
      const checkAll = document.getElementById('check-all-clientes') as UICheckboxElement | null;

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
        const res = await apiExcluirLote(Array.from(clientesSelecionados));
        if (res.erros && res.erros.length > 0) {
          alert(`Algumas exclusões não puderam ser concluídas (${res.sucessos} com sucesso):\n${res.erros.join('\n')}`);
        }
        clientesSelecionados.clear();
        updateBatchActionBar();
        await loadClientes();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro ao excluir clientes selecionados.";
        alert(msg);
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
        const customEv = e as CustomEvent<{ value?: string }>;
        const val = (e.target as HTMLInputElement).value || customEv.detail?.value || '';
        termoBusca = val.toLowerCase();
        paginaAtual = 1;
        renderTabela();
      }, 300);
    };
    buscaInput?.addEventListener('input', handleSearch);
    buscaInput?.addEventListener('ui-input', handleSearch);

    // Limite de itens por página
    const selectPaginacao = document.getElementById('paginacao-limite');
    const handlePaginacaoChange = (e: Event) => {
      const customEv = e as CustomEvent<{ id?: string }>;
      const val = customEv.detail?.id || (e.target as HTMLSelectElement).value;
      if (val) {
        limitePorPagina = parseInt(val, 10);
        paginaAtual = 1;
        renderTabela();
      }
    };
    selectPaginacao?.addEventListener('change', handlePaginacaoChange);
    selectPaginacao?.addEventListener('ui-selecionar', handlePaginacaoChange);

    const getClientesFiltrados = (): Cliente[] => {
      if (!termoBusca) return todosClientes;
      return todosClientes.filter(c =>
        (c.nome_completo || '').toLowerCase().includes(termoBusca) ||
        (c.cpf_cnpj || '').replace(/\D/g, '').includes(termoBusca.replace(/\D/g, ''))
      );
    };

    const getClientesPaginaAtual = (): Cliente[] => {
      const filtrados = getClientesFiltrados();
      const inicio = (paginaAtual - 1) * limitePorPagina;
      return filtrados.slice(inicio, inicio + limitePorPagina);
    };

    // Ações de Detalhes, Edição e Exclusão
    const abrirDetalhesCliente = async (id: number) => {
      const cli = todosClientes.find(c => c.id === id);
      if (!cli) return;

      clienteSelecionadoId = id;
      const avatar = document.getElementById('det-cli-avatar');
      const titulo = document.getElementById('det-cli-titulo');
      const subtitulo = document.getElementById('det-cli-subtitulo');

      if (avatar) {
        avatar.setAttribute('nome', cli.nome_completo || '??');
      }
      if (titulo) titulo.innerText = cli.nome_completo;
      if (subtitulo) subtitulo.innerText = `CPF/CNPJ: ${aplicarMascaraCpfCnpj(cli.cpf_cnpj || '')}`;

      const setDetVal = (elemId: string, val: string | number | null | undefined) => {
        const el = document.getElementById(elemId);
        if (el) el.innerText = val !== null && val !== undefined && val !== '' ? String(val) : '-';
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
                spanSenhaDet.innerText = cli.senha_gov || '';
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

      const activeTabBtn = document.querySelector<HTMLElement>('.tab-btn-det[data-tab-det="tab-det-dados"]');
      if (activeTabBtn) activeTabBtn.click();

      const logsContainer = document.getElementById('det-cli-logs');
      if (logsContainer) logsContainer.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-white/30">Carregando logs...</td></tr>';

      try {
        const logs: ClienteHistoricoLog[] = await fetchClienteHistorico(id);
        if (logsContainer) logsContainer.innerHTML = renderLogsHistoricoTabelaHtml(logs);
      } catch {
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

    const excluirMetadadoDetalhe = async (key: string) => {
      if (!clienteSelecionadoId) return;
      const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
      if (!cli || !confirm(`Remover metadado "${key}" do cliente?`)) return;

      const metadadosCopy = { ...(cli.metadados || {}) };
      delete metadadosCopy[key];

      const payload: ClientePayload = {
        nome_completo: cli.nome_completo,
        cpf_cnpj: cli.cpf_cnpj,
        rg_ie: cli.rg_ie,
        data_nascimento_fundacao: cli.data_nascimento_fundacao,
        estado_civil: cli.estado_civil,
        profissao: cli.profissao,
        nacionalidade: cli.nacionalidade,
        nome_conjuge: cli.nome_conjuge,
        cpf_conjuge: cli.cpf_conjuge,
        rg_conjuge: cli.rg_conjuge,
        regime_bens: cli.regime_bens,
        email: cli.email,
        telefone: cli.telefone,
        endereco_completo: cli.endereco_completo,
        cidade: cli.cidade,
        estado: cli.estado,
        cep: cli.cep,
        sexo: cli.sexo,
        senha_gov: cli.senha_gov,
        metadados: metadadosCopy
      };

      try {
        await salvarMetadadosCliente(clienteSelecionadoId, payload);
        cli.metadados = metadadosCopy;
        renderMetadadosDetalhes(metadadosCopy);
        await loadClientes();
      } catch {
        alert("Erro ao atualizar metadados.");
      }
    };

    const abrirEdicaoCliente = async (id: number) => {
      const cli = todosClientes.find(c => c.id === id);
      if (!cli || !form) return;

      clienteSelecionadoId = id;

      const setFormVal = (name: string, val: string | null | undefined) => {
        const input = form.querySelector<HTMLInputElement | UISelectElement>(`[name="${name}"]`);
        if (input) {
          input.value = val || '';
          if ('setAttribute' in input) input.setAttribute('value', val || '');
        }
      };

      const enderecoCompleto = cli.endereco_completo || '';
      let enderecoSemNumero = enderecoCompleto;
      let numero = '';
      const matchEnd = enderecoCompleto.match(/^(.*?)(?:,\s*([^,]+))?$/);
      if (matchEnd && matchEnd[2]) {
        enderecoSemNumero = matchEnd[1];
        numero = matchEnd[2];
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
        const inputCidade = form.querySelector<HTMLInputElement>('[name="cidade"]');
        if (inputCidade) inputCidade.value = cli.cidade || '';
      }

      toggleConjuge();
      if (modalCadastro) modalCadastro.setAttribute('titulo', 'Editar Cliente');
      fecharModalDetalhes();
      abrirModalCadastro();
    };

    const excluirClienteIndividual = async (id: number) => {
      const cli = todosClientes.find(c => c.id === id);
      if (!cli || !confirm(`Deseja realmente excluir o cliente "${cli.nome_completo}"?`)) return;

      try {
        await apiExcluirCliente(id);
        fecharModalDetalhes();
        clientesSelecionados.delete(id);
        updateBatchActionBar();
        await loadClientes();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro ao excluir o cliente.";
        alert(msg);
      }
    };

    const revelarSenhaGovTabela = (id: number) => {
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

    const irParaPropriedade = (propId: number) => {
      fecharModalDetalhes();
      localStorage.setItem('gerencigeo_foco_propriedade_id', propId.toString());
      window.location.hash = '#propriedades';
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
      body.querySelectorAll<UICheckboxElement>('.check-cliente').forEach(cb => {
        const handler = (e: Event) => {
          const check = e.target as UICheckboxElement;
          const id = parseInt(check.getAttribute('data-id') || '0', 10);
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

    // DELEGAÇÃO DE EVENTOS: Tabela de Clientes
    const bodyTabela = document.getElementById('tabela-clientes-body');
    bodyTabela?.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.btn-action');
      if (!target) return;
      const action = target.getAttribute('data-action');
      const id = parseInt(target.getAttribute('data-id') || '0', 10);
      if (!id) return;

      if (action === 'detalhes') abrirDetalhesCliente(id);
      else if (action === 'editar') abrirEdicaoCliente(id);
      else if (action === 'excluir') excluirClienteIndividual(id);
      else if (action === 'revelar-senha') revelarSenhaGovTabela(id);
    });

    // DELEGAÇÃO DE EVENTOS: Paginação
    const botoesPaginacao = document.getElementById('paginacao-botoes');
    botoesPaginacao?.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.btn-page');
      if (!target) return;
      const pageStr = target.getAttribute('data-page');
      if (pageStr) {
        paginaAtual = parseInt(pageStr, 10);
        renderTabela();
      }
    });

    // DELEGAÇÃO DE EVENTOS: Metadados
    const metasContainer = document.getElementById('det-cli-metadados');
    metasContainer?.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.btn-action-meta');
      if (!target) return;
      const key = target.getAttribute('data-meta-key');
      if (key) excluirMetadadoDetalhe(key);
    });

    // DELEGAÇÃO DE EVENTOS: Propriedades vinculadas
    const listaPropsContainer = document.getElementById('det-cli-lista-propriedades');
    listaPropsContainer?.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.btn-action-prop');
      if (!target) return;
      const propId = parseInt(target.getAttribute('data-prop-id') || '0', 10);
      if (propId) irParaPropriedade(propId);
    });

    // Checkbox Master
    const checkAllClientes = document.getElementById('check-all-clientes') as UICheckboxElement | null;
    const handleCheckAll = (e: Event) => {
      const check = e.target as UICheckboxElement;
      const isChecked = check.marcado ?? check.checked ?? false;
      const visiveis = getClientesPaginaAtual();
      if (isChecked) visiveis.forEach(c => clientesSelecionados.add(c.id));
      else visiveis.forEach(c => clientesSelecionados.delete(c.id));
      updateBatchActionBar();
      renderTabela();
    };
    checkAllClientes?.addEventListener('change', handleCheckAll);
    checkAllClientes?.addEventListener('ui-change', handleCheckAll);

    // Formulário de Adição de Metadados
    document.getElementById('form-add-meta')?.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      if (!clienteSelecionadoId) return;
      const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
      if (!cli) return;

      const keyInput = document.getElementById('meta-key') as HTMLInputElement | null;
      const valInput = document.getElementById('meta-val') as HTMLInputElement | null;
      const key = keyInput?.value.trim();
      const val = valInput?.value.trim();

      if (!key || !val) {
        alert("Preencha chave e valor.");
        return;
      }

      const metadadosCopy = { ...(cli.metadados || {}), [key]: val };
      const payload: ClientePayload = {
        nome_completo: cli.nome_completo,
        cpf_cnpj: cli.cpf_cnpj,
        rg_ie: cli.rg_ie,
        data_nascimento_fundacao: cli.data_nascimento_fundacao,
        estado_civil: cli.estado_civil,
        profissao: cli.profissao,
        nacionalidade: cli.nacionalidade,
        nome_conjuge: cli.nome_conjuge,
        cpf_conjuge: cli.cpf_conjuge,
        rg_conjuge: cli.rg_conjuge,
        regime_bens: cli.regime_bens,
        email: cli.email,
        telefone: cli.telefone,
        endereco_completo: cli.endereco_completo,
        cidade: cli.cidade,
        estado: cli.estado,
        cep: cli.cep,
        sexo: cli.sexo,
        senha_gov: cli.senha_gov,
        metadados: metadadosCopy
      };

      try {
        await salvarMetadadosCliente(clienteSelecionadoId, payload);
        cli.metadados = metadadosCopy;
        renderMetadadosDetalhes(metadadosCopy);
        if (keyInput) keyInput.value = '';
        if (valInput) valInput.value = '';
        await loadClientes();
      } catch {
        alert("Erro ao salvar metadado.");
      }
    });

    document.getElementById('btn-det-editar')?.addEventListener('click', () => {
      if (clienteSelecionadoId) abrirEdicaoCliente(clienteSelecionadoId);
    });

    document.getElementById('btn-det-excluir')?.addEventListener('click', () => {
      if (clienteSelecionadoId) excluirClienteIndividual(clienteSelecionadoId);
    });

    // Carga e Atualização de KPIs
    const loadClientes = (): Promise<void> => {
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
    form?.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const rawPayload = Object.fromEntries(formData.entries()) as Record<string, string>;

      const enderecoSemNumero = rawPayload.endereco_sem_numero || '';
      const numero = rawPayload.numero_endereco || '';
      const enderecoCompleto = numero ? `${enderecoSemNumero}, ${numero}` : enderecoSemNumero;

      const payload: ClientePayload = {
        nome_completo: rawPayload.nome_completo || '',
        cpf_cnpj: rawPayload.cpf_cnpj || '',
        rg_ie: rawPayload.rg_ie || null,
        data_nascimento_fundacao: rawPayload.data_nascimento_fundacao || null,
        estado_civil: rawPayload.estado_civil || null,
        profissao: rawPayload.profissao || null,
        nacionalidade: rawPayload.nacionalidade || 'Brasileiro(a)',
        nome_conjuge: rawPayload.nome_conjuge || null,
        cpf_conjuge: rawPayload.cpf_conjuge || null,
        rg_conjuge: rawPayload.rg_conjuge || null,
        regime_bens: rawPayload.regime_bens || null,
        email: rawPayload.email || null,
        telefone: rawPayload.telefone || null,
        endereco_completo: enderecoCompleto || null,
        cidade: rawPayload.cidade || null,
        estado: rawPayload.estado || 'PR',
        cep: rawPayload.cep || null,
        sexo: rawPayload.sexo || 'M',
        senha_gov: rawPayload.senha_gov || null,
        metadados: {}
      };

      if (clienteSelecionadoId) {
        const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
        if (cli && cli.metadados) payload.metadados = cli.metadados;
      }

      try {
        await salvarCliente(payload, clienteSelecionadoId);
        fecharModalCadastro();
        (e.target as HTMLFormElement).reset();
        await loadClientes();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro ao salvar cliente.";
        alert(msg);
      }
    });
  }
};
