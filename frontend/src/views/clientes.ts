import type {
  RouteDef,
  Cliente,
  ClientePayload,
  ClienteHistoricoLog,
  ClienteAcessoLog,
  ClienteDocumento
} from '../types';
import { initIcons, escapeHtml } from '../utils';
import { API_BASE } from '../config';
import { renderClientesTemplate } from './clientes/clientes_template';
import {
  fetchTodosClientes,
  fetchClienteHistorico,
  fetchClienteAcessosApi,
  fetchClienteDocumentosApi,
  salvarDocumentoClienteApi,
  excluirDocumentoClienteApi,
  revelarSenhaGovApi,
  salvarCliente,
  excluirClienteIndividual as apiExcluirCliente,
  excluirClientesEmLote as apiExcluirLote,
  salvarMetadadosCliente,
  carregarCidadesIbgeService,
  buscarCepViaCepService,
  cabecalhosAuth
} from './clientes/clientes_service';
import {
  aplicarMascaraCpfCnpj,
  aplicarMascaraTelefone,
  aplicarMascaraCep,
  ehPessoaJuridica,
  filtrarClientes,
  filtrarPorSegmento,
  contarSegmentos,
  ordenarClientes,
  montarEnderecoDetalhe,
  renderOpcoesRepresentanteHtml,
  montarConfirmacaoExclusao,
  gerarLinkWhatsApp,
  copiarParaClipboard,
  isCnhVencida,
  renderLinhasTabelaHtml,
  renderBotoesPaginacaoHtml,
  renderMetadadosTabelaHtml,
  renderLogsHistoricoTabelaHtml,
  renderLogsAcessoTabelaHtml,
  renderDocumentosTabelaHtml,
  renderPropriedadesVinculadasHtml
} from './clientes/clientes_helpers';
import type { SegmentoCliente, CampoOrdenacaoCliente, DirecaoOrdenacao } from './clientes/clientes_helpers';

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

let atalhoBuscaClientes: ((e: KeyboardEvent) => void) | null = null;

export const clientesRoute: RouteDef = {
  render: () => renderClientesTemplate(),
  cleanup: () => {
    if (atalhoBuscaClientes) {
      document.removeEventListener('keydown', atalhoBuscaClientes);
      atalhoBuscaClientes = null;
    }
  },
  setup: () => {
    let clienteSelecionadoId: number | null = null;
    let todosClientes: Cliente[] = [];
    let documentosAtuais: ClienteDocumento[] = [];
    let termoBusca = "";
    let paginaAtual = 1;
    let limitePorPagina = 25;
    let segmentoAtual: SegmentoCliente = 'todos';
    let campoOrdem: CampoOrdenacaoCliente = 'nome';
    let direcaoOrdem: DirecaoOrdenacao = 'asc';
    const clientesSelecionados = new Set<number>();

    // Formulário e Elementos da UI
    const form = document.getElementById('form-cliente') as HTMLFormElement | null;
    const inputTipoPessoa = document.getElementById('input-tipo-pessoa') as HTMLInputElement | null;
    const btnTipoPf = document.getElementById('btn-tipo-pf');
    const btnTipoPj = document.getElementById('btn-tipo-pj');
    const blocoCamposPf = document.getElementById('bloco-campos-pf');
    const blocoCamposPj = document.getElementById('bloco-campos-pj');
    const inputNomeCompleto = document.getElementById('input-nome-completo') as HTMLInputElement | null;
    const inputRazaoSocial = document.getElementById('input-razao-social') as HTMLInputElement | null;
    const inputCpfCnpj = document.getElementById('input-cpf-cnpj') as HTMLInputElement | null;
    const inputCnpjPj = document.getElementById('input-cnpj-pj') as HTMLInputElement | null;
    const inputCpfConjuge = form?.querySelector<HTMLInputElement>('[name="cpf_conjuge"]') || null;
    const inputTelefone = form?.querySelector<HTMLInputElement>('[name="telefone"]') || null;
    const inputCep = form?.querySelector<HTMLInputElement>('[name="cep"]') || null;
    const selectEstado = form?.querySelector<UISelectElement>('[name="estado"]') || null;
    const selectEstadoCivil = form?.querySelector<UISelectElement>('[name="estado_civil"]') || null;
    const selectRepresentante = document.getElementById('select-representante-legal') as (HTMLElement & { value?: string }) | null;
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

    // Alternador PF / PJ com soft-hide e ajuste dinâmico de campos requeridos
    const setTipoPessoa = (tipo: 'PF' | 'PJ') => {
      if (inputTipoPessoa) inputTipoPessoa.value = tipo;

      if (tipo === 'PF') {
        btnTipoPf?.classList.add('bg-mint-vibrant', 'text-forest-deep', 'shadow-sm');
        btnTipoPf?.classList.remove('text-white/50');
        btnTipoPj?.classList.remove('bg-mint-vibrant', 'text-forest-deep', 'shadow-sm');
        btnTipoPj?.classList.add('text-white/50');

        blocoCamposPf?.classList.remove('hidden');
        blocoCamposPj?.classList.add('hidden');

        if (inputNomeCompleto) inputNomeCompleto.required = true;
        if (inputCpfCnpj) inputCpfCnpj.required = true;
        if (inputRazaoSocial) inputRazaoSocial.required = false;
        if (inputCnpjPj) inputCnpjPj.required = false;
      } else {
        btnTipoPj?.classList.add('bg-mint-vibrant', 'text-forest-deep', 'shadow-sm');
        btnTipoPj?.classList.remove('text-white/50');
        btnTipoPf?.classList.remove('bg-mint-vibrant', 'text-forest-deep', 'shadow-sm');
        btnTipoPf?.classList.add('text-white/50');

        blocoCamposPj?.classList.remove('hidden');
        blocoCamposPf?.classList.add('hidden');

        if (inputNomeCompleto) inputNomeCompleto.required = false;
        if (inputCpfCnpj) inputCpfCnpj.required = false;
        if (inputRazaoSocial) inputRazaoSocial.required = true;
        if (inputCnpjPj) inputCnpjPj.required = true;
      }
    };

    btnTipoPf?.addEventListener('click', () => setTipoPessoa('PF'));
    btnTipoPj?.addEventListener('click', () => setTipoPessoa('PJ'));

    // Popular opções de Representante Legal (Clientes PF)
    const popularSelectRepresentante = (selecionadoId?: number | null) => {
      if (!selectRepresentante) return;
      const optionsHtml = renderOpcoesRepresentanteHtml(todosClientes, selecionadoId);
      selectRepresentante.innerHTML = optionsHtml;
      if (selecionadoId) {
        selectRepresentante.value = String(selecionadoId);
        if ('setAttribute' in selectRepresentante) selectRepresentante.setAttribute('value', String(selecionadoId));
      }
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
    handleInputMask(inputCnpjPj, aplicarMascaraCpfCnpj);
    handleInputMask(inputCpfConjuge, aplicarMascaraCpfCnpj);
    handleInputMask(inputTelefone, aplicarMascaraTelefone);

    // Carga de Cidades do IBGE
    const carregarCidadesPorEstado = async (uf: string) => {
      const datalist = document.getElementById('cidades-list');
      if (!datalist) return;
      datalist.innerHTML = '<option value="Carregando cidades...">';

      try {
        const nomes = await carregarCidadesIbgeService(uf);
        datalist.innerHTML = nomes.map(nome => `<option value="${escapeHtml(nome)}">`).join('');
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
          const inputBairro = form.querySelector<HTMLInputElement>('[name="bairro"]');

          if (inputLogradouro) inputLogradouro.value = data.logradouro || '';
          if (inputBairro && data.bairro) inputBairro.value = data.bairro;
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

    // Alternar exibição da seção de cônjuge conforme estado civil.
    // Esconder não apaga: trocar o estado civil sem querer não pode destruir o que foi digitado.
    // Os dados do cônjuge só são descartados no envio, se o cliente não estiver casado/em união estável.
    const estadoCivilCasado = (valor?: string | null): boolean => {
      const v = valor || '';
      return v.includes("Casado") || v.includes("União Estável");
    };
    const toggleConjuge = () => {
      if (!selectEstadoCivil || !secaoConjuge) return;
      secaoConjuge.classList.toggle('hidden', !estadoCivilCasado(selectEstadoCivil.value));
    };

    selectEstadoCivil?.addEventListener('change', toggleConjuge);
    selectEstadoCivil?.addEventListener('ui-selecionar', toggleConjuge);

    // Botões de abertura/fechamento de modais
    document.getElementById('btn-abrir-modal-cliente')?.addEventListener('click', () => {
      clienteSelecionadoId = null;
      if (form) {
        form.reset();
        setTipoPessoa('PF');
        if (selectEstado) {
          selectEstado.value = 'PR';
          if ('setAttribute' in selectEstado) selectEstado.setAttribute('value', 'PR');
        }
        carregarCidadesPorEstado('PR');
        popularSelectRepresentante(null);
        toggleConjuge();
        const hintSenha = document.getElementById('label-senhagov-hint');
        if (hintSenha) hintSenha.innerText = 'segura';
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

    // Sub-abas de Histórico & Auditoria
    const btnSubtabHistorico = document.getElementById('btn-subtab-historico');
    const btnSubtabAcessos = document.getElementById('btn-subtab-acessos');
    const subtabContentHistorico = document.getElementById('subtab-content-historico');
    const subtabContentAcessos = document.getElementById('subtab-content-acessos');

    btnSubtabHistorico?.addEventListener('click', () => {
      btnSubtabHistorico.classList.add('bg-mint-vibrant/10', 'text-mint-vibrant', 'border-mint-vibrant/20');
      btnSubtabHistorico.classList.remove('text-white/40', 'border-transparent');
      btnSubtabAcessos?.classList.remove('bg-mint-vibrant/10', 'text-mint-vibrant', 'border-mint-vibrant/20');
      btnSubtabAcessos?.classList.add('text-white/40', 'border-transparent');
      subtabContentHistorico?.classList.remove('hidden');
      subtabContentAcessos?.classList.add('hidden');
    });

    btnSubtabAcessos?.addEventListener('click', () => {
      btnSubtabAcessos.classList.add('bg-mint-vibrant/10', 'text-mint-vibrant', 'border-mint-vibrant/20');
      btnSubtabAcessos.classList.remove('text-white/40', 'border-transparent');
      btnSubtabHistorico?.classList.remove('bg-mint-vibrant/10', 'text-mint-vibrant', 'border-mint-vibrant/20');
      btnSubtabHistorico?.classList.add('text-white/40', 'border-transparent');
      subtabContentAcessos?.classList.remove('hidden');
      subtabContentHistorico?.classList.add('hidden');
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
      const selecionados = todosClientes.filter(c => clientesSelecionados.has(c.id));
      if (selecionados.length === 0) return;
      if (!confirm(montarConfirmacaoExclusao(selecionados))) return;
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
        termoBusca = val;
        paginaAtual = 1;
        podarSelecaoFiltrada();
        renderTabela();
      }, 300);
    };
    buscaInput?.addEventListener('input', handleSearch);
    buscaInput?.addEventListener('ui-input', handleSearch);

    // Seleção só vale para o que está na tela: excluir "selecionados" fora do filtro é perigoso
    const podarSelecaoFiltrada = () => {
      const idsFiltrados = new Set(getClientesFiltrados().map(c => c.id));
      Array.from(clientesSelecionados).forEach(id => { if (!idsFiltrados.has(id)) clientesSelecionados.delete(id); });
    };

    const buscaWrap = document.getElementById('busca-wrap');
    const buscaLimpar = document.getElementById('busca-limpar');
    buscaInput?.addEventListener('input', () => {
      buscaWrap?.classList.toggle('tem-valor', ((buscaInput as HTMLInputElement).value || '').length > 0);
    });
    const limparBusca = () => {
      const input = buscaInput as HTMLInputElement | null;
      if (!input) return;
      input.value = '';
      buscaWrap?.classList.remove('tem-valor');
      clearTimeout(timeoutBusca);
      termoBusca = '';
      paginaAtual = 1;
      renderTabela();
    };
    buscaLimpar?.addEventListener('click', () => { limparBusca(); (buscaInput as HTMLInputElement | null)?.focus(); });
    buscaInput?.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') { limparBusca(); (buscaInput as HTMLInputElement).blur(); }
    });

    // Atalho "/" foca a busca (ignorado enquanto se digita em outro campo ou há modal aberto)
    atalhoBuscaClientes = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
      e.preventDefault();
      (buscaInput as HTMLInputElement | null)?.focus();
    };
    document.addEventListener('keydown', atalhoBuscaClientes);

    // Segmentos (Todos / PF / PJ / Pendências)
    document.getElementById('seg-clientes')?.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-seg]');
      if (!btn) return;
      segmentoAtual = (btn.getAttribute('data-seg') as SegmentoCliente) || 'todos';
      paginaAtual = 1;
      podarSelecaoFiltrada();
      renderTabela();
    });

    // Ordenação por cabeçalho (clique ou Enter/Espaço); clicar de novo inverte a direção
    const alternarOrdem = (th: HTMLElement) => {
      const campo = th.getAttribute('data-ordem') as CampoOrdenacaoCliente | null;
      if (!campo) return;
      if (campo === campoOrdem) direcaoOrdem = direcaoOrdem === 'asc' ? 'desc' : 'asc';
      else { campoOrdem = campo; direcaoOrdem = campo === 'vinculos' ? 'desc' : 'asc'; }
      paginaAtual = 1;
      renderTabela();
    };
    document.querySelectorAll<HTMLElement>('.lp-tabela th[data-ordem]').forEach(th => {
      th.addEventListener('click', () => alternarOrdem(th));
      th.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarOrdem(th); }
      });
    });

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

    const getClientesFiltrados = (): Cliente[] =>
      ordenarClientes(filtrarClientes(filtrarPorSegmento(todosClientes, segmentoAtual), termoBusca), campoOrdem, direcaoOrdem);

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
      const isPj = ehPessoaJuridica(cli);
      const nomeExibicao = cli.nome_completo || (cli as any).nome || 'Sem Nome';

      const avatar = document.getElementById('det-cli-avatar');
      const titulo = document.getElementById('det-cli-titulo');
      const subtitulo = document.getElementById('det-cli-subtitulo');
      const badgeTipo = document.getElementById('det-cli-badge-tipo');

      if (avatar) {
        avatar.setAttribute('nome', nomeExibicao);
      }
      if (titulo) titulo.innerText = nomeExibicao;
      if (subtitulo) subtitulo.innerText = `${isPj ? 'CNPJ' : 'CPF'}: ${aplicarMascaraCpfCnpj(cli.cpf_cnpj || '')}`;
      if (badgeTipo) {
        badgeTipo.innerText = isPj ? 'PJ' : 'PF';
        badgeTipo.className = isPj 
          ? 'text-[8.5px] px-1.5 py-0.5 rounded font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
          : 'text-[8.5px] px-1.5 py-0.5 rounded font-mono font-bold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20';
      }

      const setDetVal = (elemId: string, val: string | number | null | undefined) => {
        const el = document.getElementById(elemId);
        if (!el) return;
        const vazio = val === null || val === undefined || val === '' || val === '-';
        el.innerText = vazio ? '-' : String(val);
        el.classList.toggle('det-vazio', vazio);
      };

      // Bloco PJ condicional
      const detBlocoPj = document.getElementById('det-bloco-pj');
      if (detBlocoPj) {
        if (isPj) {
          detBlocoPj.classList.remove('hidden');
          setDetVal('det-cli-razaosocial', cli.razao_social || cli.nome_completo);
          setDetVal('det-cli-nomefantasia', cli.nome_fantasia || '-');
          setDetVal('det-cli-ie', cli.inscricao_estadual || cli.rg_ie || 'Isento');
          setDetVal('det-cli-representante', cli.representante_legal_nome || 'Não informado');
        } else {
          detBlocoPj.classList.add('hidden');
        }
      }

      setDetVal('det-cli-sexo', cli.sexo === 'M' ? 'Masculino' : cli.sexo === 'F' ? 'Feminino' : '-');
      setDetVal('det-cli-naturalidade', cli.naturalidade || '-');
      setDetVal('det-cli-nacionalidade', cli.nacionalidade || '-');
      setDetVal('det-cli-estcivil', cli.estado_civil || '-');
      setDetVal('det-cli-profissao', cli.profissao || '-');

      // RG
      setDetVal('det-cli-rg', cli.rg_ie || '-');
      setDetVal('det-cli-rg-orgao', cli.rg_orgao || '-');
      setDetVal('det-cli-rg-uf', cli.rg_uf || '-');

      // CNH
      setDetVal('det-cli-cnh-num', cli.cnh_numero || '-');
      setDetVal('det-cli-cnh-cat', cli.cnh_categoria || '-');
      setDetVal('det-cli-cnh-val', cli.cnh_validade ? cli.cnh_validade.split('-').reverse().join('/') : '-');
      setDetVal('det-cli-cnh-orgaouf', cli.cnh_orgao_uf || '-');

      // Badge de CNH Vencida
      const badgeCnhVencida = document.getElementById('det-doc-badge-validade');
      if (badgeCnhVencida) {
        if (isCnhVencida(cli.cnh_validade)) {
          badgeCnhVencida.classList.remove('hidden');
        } else {
          badgeCnhVencida.classList.add('hidden');
        }
      }

      // Alternância de Pills RG / CNH no Modal de Detalhes
      const pillRg = document.getElementById('pill-doc-rg');
      const pillCnh = document.getElementById('pill-doc-cnh');
      const blocoPillRg = document.getElementById('bloco-pill-rg');
      const blocoPillCnh = document.getElementById('bloco-pill-cnh');

      const setPillAtivo = (docTipo: 'RG' | 'CNH') => {
        if (docTipo === 'RG') {
          pillRg?.classList.add('bg-mint-vibrant', 'text-forest-deep');
          pillRg?.classList.remove('text-white/50');
          pillCnh?.classList.remove('bg-mint-vibrant', 'text-forest-deep');
          pillCnh?.classList.add('text-white/50');
          blocoPillRg?.classList.remove('hidden');
          blocoPillCnh?.classList.add('hidden');
        } else {
          pillCnh?.classList.add('bg-mint-vibrant', 'text-forest-deep');
          pillCnh?.classList.remove('text-white/50');
          pillRg?.classList.remove('bg-mint-vibrant', 'text-forest-deep');
          pillRg?.classList.add('text-white/50');
          blocoPillCnh?.classList.remove('hidden');
          blocoPillRg?.classList.add('hidden');
        }
      };

      if (pillRg && pillCnh) {
        pillRg.onclick = () => setPillAtivo('RG');
        pillCnh.onclick = () => setPillAtivo('CNH');
        // Se cliente tem CNH e não tem RG, inicia em CNH; caso contrário RG
        setPillAtivo(cli.cnh_numero && !cli.rg_ie ? 'CNH' : 'RG');
      }

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

      // Telefone e Link WhatsApp
      setDetVal('det-cli-telefone', cli.telefone ? aplicarMascaraTelefone(cli.telefone) : '-');
      const btnWhatsapp = document.getElementById('btn-det-whatsapp') as HTMLAnchorElement | null;
      if (btnWhatsapp) {
        const linkWa = gerarLinkWhatsApp(cli.telefone);
        if (linkWa) {
          btnWhatsapp.href = linkWa;
          btnWhatsapp.classList.remove('hidden');
        } else {
          btnWhatsapp.classList.add('hidden');
        }
      }

      setDetVal('det-cli-email', cli.email || '-');

      // Senha GOV com revelação auditada e botão de cópia
      const btnRevelarDet = document.getElementById('btn-revelar-senhagov-det');
      const btnCopySenhaDet = document.getElementById('btn-copy-senhagov-det');
      const spanSenhaDet = document.getElementById('det-cli-senhagov');
      const temSenha = Boolean(cli.tem_senha_gov || cli.senha_gov);

      if (temSenha) {
        if (spanSenhaDet) {
          spanSenhaDet.innerText = '••••••••';
          spanSenhaDet.classList.remove('text-mint-vibrant', 'font-bold');
        }
        if (btnRevelarDet) {
          btnRevelarDet.classList.remove('hidden');
          btnRevelarDet.onclick = async () => {
            if (spanSenhaDet?.innerText === '••••••••') {
              if (confirm(`Deseja visualizar a Senha GOV de "${cli.nome_completo}"? O acesso será registrado na auditoria de segurança.`)) {
                try {
                  const senhaRevelada = await revelarSenhaGovApi(cli.id);
                  if (spanSenhaDet) {
                    spanSenhaDet.innerText = senhaRevelada || '(vazia)';
                    spanSenhaDet.classList.add('text-mint-vibrant', 'font-bold');
                  }
                  if (btnCopySenhaDet) btnCopySenhaDet.classList.remove('hidden');
                  // Recarrega acessos caso a aba de auditoria seja aberta
                  carregarLogsAcesso(cli.id);
                } catch (err: unknown) {
                  alert(err instanceof Error ? err.message : "Erro ao revelar senha GOV.");
                }
              }
            } else if (spanSenhaDet) {
              spanSenhaDet.innerText = '••••••••';
              spanSenhaDet.classList.remove('text-mint-vibrant', 'font-bold');
              if (btnCopySenhaDet) btnCopySenhaDet.classList.add('hidden');
            }
          };
        }
        if (btnCopySenhaDet) btnCopySenhaDet.classList.add('hidden');
      } else {
        if (spanSenhaDet) {
          spanSenhaDet.innerText = '-';
          spanSenhaDet.classList.remove('text-mint-vibrant', 'font-bold');
        }
        if (btnRevelarDet) btnRevelarDet.classList.add('hidden');
        if (btnCopySenhaDet) btnCopySenhaDet.classList.add('hidden');
      }

      // Microinterações 1-Click Copy
      document.querySelectorAll<HTMLElement>('.btn-copy-field').forEach(btn => {
        btn.onclick = (ev: MouseEvent) => {
          ev.stopPropagation();
          const targetId = btn.getAttribute('data-copy-target');
          if (!targetId) return;
          const targetEl = document.getElementById(targetId);
          if (!targetEl) return;
          let textoParaCopiar = targetEl.innerText.trim();
          // Remove prefixos como "CPF: " ou "CNPJ: "
          if (textoParaCopiar.startsWith('CPF: ') || textoParaCopiar.startsWith('CNPJ: ')) {
            textoParaCopiar = textoParaCopiar.replace(/^(CPF|CNPJ):\s*/, '');
          }
          if (textoParaCopiar && textoParaCopiar !== '-' && textoParaCopiar !== '••••••••') {
            copiarParaClipboard(textoParaCopiar, btn);
          }
        };
      });

      setDetVal('det-cli-endereco', montarEnderecoDetalhe(cli));
      setDetVal('det-cli-total-levs', cli.total_levantamentos || 0);
      setDetVal('det-cli-total-props', cli.total_propriedades || 0);

      const listaPropsContainer = document.getElementById('det-cli-lista-propriedades');
      if (listaPropsContainer) {
        listaPropsContainer.innerHTML = renderPropriedadesVinculadasHtml(cli.propriedades || []);
        initIcons();
      }

      // Bloco de Cônjuge & Regime Notarial
      const blocoConjuge = document.getElementById('det-conjuge-bloco');
      const isCasado = estadoCivilCasado(cli.estado_civil) || Boolean(cli.nome_conjuge || cli.cpf_conjuge);
      if (blocoConjuge) {
        if (isCasado) {
          blocoConjuge.classList.remove('hidden');
          setDetVal('det-cli-nomeconjuge', cli.nome_conjuge || '-');
          setDetVal('det-cli-cpfconjuge', cli.cpf_conjuge ? aplicarMascaraCpfCnpj(cli.cpf_conjuge) : '-');
          setDetVal('det-cli-rgconjuge', cli.rg_conjuge || '-');
          setDetVal('det-cli-regimebens', cli.regime_bens || 'Não informado');
          setDetVal('det-cli-certidaocasamento', cli.certidao_casamento_matricula || '-');
        } else {
          blocoConjuge.classList.add('hidden');
        }
      }

      renderMetadadosDetalhes(cli.metadados || {});

      // Documentos
      carregarDocumentosCliente(id);

      const activeTabBtn = document.querySelector<HTMLElement>('.tab-btn-det[data-tab-det="tab-det-dados"]');
      if (activeTabBtn) activeTabBtn.click();

      // Histórico & Auditoria
      carregarHistoricoAlteracoes(id);
      carregarLogsAcesso(id);

      initIcons();
      abrirModalDetalhes();
    };

    const carregarDocumentosCliente = async (id: number) => {
      const container = document.getElementById('det-cli-documentos');
      if (container) container.innerHTML = '<tr><td colspan="7" class="det-vazio text-center py-3">Carregando documentos...</td></tr>';
      try {
        documentosAtuais = await fetchClienteDocumentosApi(id);
        if (container) container.innerHTML = renderDocumentosTabelaHtml(documentosAtuais, id);
        initIcons();
      } catch {
        if (container) container.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-red-400">Falha ao carregar documentos.</td></tr>';
      }
    };

    const carregarHistoricoAlteracoes = async (id: number) => {
      const logsContainer = document.getElementById('det-cli-logs');
      if (logsContainer) logsContainer.innerHTML = '<tr><td colspan="4" class="det-vazio text-center py-3">Carregando logs...</td></tr>';
      try {
        const logs: ClienteHistoricoLog[] = await fetchClienteHistorico(id);
        if (logsContainer) logsContainer.innerHTML = renderLogsHistoricoTabelaHtml(logs);
      } catch {
        if (logsContainer) logsContainer.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-400">Falha ao obter histórico.</td></tr>';
      }
    };

    const carregarLogsAcesso = async (id: number) => {
      const acessosContainer = document.getElementById('det-cli-acessos');
      if (acessosContainer) acessosContainer.innerHTML = '<tr><td colspan="5" class="det-vazio text-center py-3">Carregando auditoria...</td></tr>';
      try {
        const acessos: ClienteAcessoLog[] = await fetchClienteAcessosApi(id);
        if (acessosContainer) acessosContainer.innerHTML = renderLogsAcessoTabelaHtml(acessos);
      } catch {
        if (acessosContainer) acessosContainer.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-red-400">Falha ao obter auditoria.</td></tr>';
      }
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

      // Atualização parcial: só os metadados são alterados; o restante do cadastro é preservado
      const payload: ClientePayload = {
        nome_completo: cli.nome_completo,
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
      const isPj = ehPessoaJuridica(cli);
      setTipoPessoa(isPj ? 'PJ' : 'PF');

      popularSelectRepresentante(cli.representante_legal_id);

      const setFormVal = (name: string, val: string | null | undefined) => {
        const input = form.querySelector<HTMLInputElement | UISelectElement>(`[name="${name}"]`);
        if (input) {
          input.value = val || '';
          if ('setAttribute' in input) input.setAttribute('value', val || '');
        }
      };

      // Preenchimento preciso de endereço nativo
      const enderecoSemNumero = cli.endereco_sem_numero || (cli.endereco_completo ? cli.endereco_completo.split(',')[0].trim() : '');
      const numero = cli.numero_endereco || (cli.endereco_completo && cli.endereco_completo.includes(',') ? cli.endereco_completo.split(',').slice(1).join(',').trim() : '');

      setFormVal('nome_completo', cli.nome_completo);
      setFormVal('razao_social', cli.razao_social || cli.nome_completo);
      setFormVal('nome_fantasia', cli.nome_fantasia);
      setFormVal('inscricao_estadual', cli.inscricao_estadual || cli.rg_ie);
      setFormVal('inscricao_municipal', cli.inscricao_municipal);
      setFormVal('data_fundacao_pj', cli.data_nascimento_fundacao);

      if (isPj) {
        setFormVal('cnpj_pj', aplicarMascaraCpfCnpj(cli.cpf_cnpj || ''));
        setFormVal('cpf_cnpj', '');
      } else {
        setFormVal('cpf_cnpj', aplicarMascaraCpfCnpj(cli.cpf_cnpj || ''));
        setFormVal('cnpj_pj', '');
      }

      setFormVal('rg_ie', cli.rg_ie);
      setFormVal('rg_orgao', cli.rg_orgao);
      setFormVal('rg_uf', cli.rg_uf);
      setFormVal('naturalidade', cli.naturalidade);
      setFormVal('cnh_numero', cli.cnh_numero);
      setFormVal('cnh_categoria', cli.cnh_categoria);
      setFormVal('cnh_validade', cli.cnh_validade);
      setFormVal('cnh_orgao_uf', cli.cnh_orgao_uf);
      setFormVal('data_nascimento_fundacao', cli.data_nascimento_fundacao || '');
      setFormVal('estado_civil', cli.estado_civil);
      setFormVal('sexo', cli.sexo || 'M');
      setFormVal('nacionalidade', cli.nacionalidade);
      setFormVal('nome_conjuge', cli.nome_conjuge);
      setFormVal('genero_conjuge', cli.genero_conjuge);
      setFormVal('cpf_conjuge', aplicarMascaraCpfCnpj(cli.cpf_conjuge || ''));
      setFormVal('rg_conjuge', cli.rg_conjuge);
      setFormVal('rg_orgao_conjuge', cli.rg_orgao_conjuge);
      setFormVal('rg_uf_conjuge', cli.rg_uf_conjuge);
      setFormVal('nacionalidade_conjuge', cli.nacionalidade_conjuge);
      setFormVal('profissao_conjuge', cli.profissao_conjuge);
      setFormVal('regime_bens', cli.regime_bens);
      setFormVal('certidao_casamento_matricula', cli.certidao_casamento_matricula);
      setFormVal('data_casamento', cli.data_casamento);
      setFormVal('cartorio_casamento', cli.cartorio_casamento);
      setFormVal('livro_casamento', cli.livro_casamento);
      setFormVal('folha_casamento', cli.folha_casamento);
      setFormVal('termo_casamento', cli.termo_casamento);
      setFormVal('profissao', cli.profissao);
      setFormVal('telefone', cli.telefone ? aplicarMascaraTelefone(cli.telefone) : '');
      setFormVal('email', cli.email);
      setFormVal('senha_gov', cli.senha_gov);
      const hintSenha = document.getElementById('label-senhagov-hint');
      if (hintSenha) {
        hintSenha.innerText = cli.tem_senha_gov || cli.senha_gov ? '•••••••• (mantida)' : 'segura';
      }
      setFormVal('cep', cli.cep ? aplicarMascaraCep(cli.cep) : '');
      setFormVal('endereco_sem_numero', cli.endereco_sem_numero || enderecoSemNumero);
      setFormVal('numero_endereco', cli.numero_endereco || numero);
      setFormVal('bairro', cli.bairro);
      setFormVal('estado', cli.estado);

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
      if (!cli || !confirm(montarConfirmacaoExclusao([cli]))) return;

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

    const revelarSenhaGovTabela = async (id: number) => {
      const cli = todosClientes.find(c => c.id === id);
      if (!cli) return;
      const span = document.getElementById(`senha-gov-val-${id}`);
      if (!span) return;

      if (span.innerText === '••••••••') {
        if (confirm(`Deseja visualizar a Senha GOV de "${cli.nome_completo}"? O acesso será registrado na auditoria.`)) {
          try {
            const senhaRevelada = await revelarSenhaGovApi(id);
            span.innerText = senhaRevelada || '(vazia)';
            span.classList.add('text-mint-vibrant', 'font-bold');
          } catch (err: unknown) {
            alert(err instanceof Error ? err.message : "Erro ao revelar senha GOV.");
          }
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
    const renderEstadoVazio = (statusDiv: HTMLElement, semCadastro: boolean) => {
      statusDiv.classList.remove('hidden');
      statusDiv.innerHTML = semCadastro
        ? `<div class="lp-estado">
             <div class="lp-estado-ico"><i data-lucide="users"></i></div>
             <div class="lp-estado-titulo">Nenhum cliente cadastrado</div>
             <div class="lp-estado-txt">Cadastre o primeiro cliente para vincular propriedades e levantamentos.</div>
             <button type="button" class="lp-btn-primario" data-estado-acao="novo"><i data-lucide="plus" class="w-4 h-4"></i>Novo cliente</button>
           </div>`
        : `<div class="lp-estado">
             <div class="lp-estado-ico"><i data-lucide="search"></i></div>
             <div class="lp-estado-titulo">Nenhum cliente encontrado</div>
             <div class="lp-estado-txt">Nada corresponde à busca ou ao filtro aplicado.</div>
             <button type="button" class="lp-btn-sec" data-estado-acao="limpar">Limpar busca e filtros</button>
           </div>`;
    };

    // Chips de segmento (contagem sobre a lista inteira) e indicador de ordenação nos cabeçalhos
    const atualizarCabecalhoLista = () => {
      const contagem = contarSegmentos(todosClientes);
      (Object.keys(contagem) as SegmentoCliente[]).forEach(seg => {
        const n = document.getElementById(`seg-n-${seg}`);
        if (n) { n.innerText = String(contagem[seg]); n.classList.toggle('is-zero', contagem[seg] === 0); }
      });
      document.querySelectorAll<HTMLElement>('#seg-clientes [data-seg]').forEach(btn => {
        const ativo = btn.getAttribute('data-seg') === segmentoAtual;
        btn.classList.toggle('is-active', ativo);
        btn.setAttribute('aria-pressed', String(ativo));
      });
      document.querySelectorAll<HTMLElement>('.lp-tabela th[data-ordem]').forEach(th => {
        if (th.getAttribute('data-ordem') === campoOrdem) th.setAttribute('aria-sort', direcaoOrdem === 'asc' ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
      });
    };

    const renderTabela = () => {
      const body = document.getElementById('tabela-clientes-body');
      const statusDiv = document.getElementById('tabela-clientes-status');
      const info = document.getElementById('paginacao-info');
      const botoes = document.getElementById('paginacao-botoes');
      if (!body) return;

      atualizarCabecalhoLista();

      const filtrados = getClientesFiltrados();
      const total = filtrados.length;
      const totalPaginas = Math.ceil(total / limitePorPagina);
      if (paginaAtual > totalPaginas) paginaAtual = Math.max(1, totalPaginas);

      const visiveis = getClientesPaginaAtual();
      if (total === 0) {
        body.innerHTML = '';
        if (statusDiv) renderEstadoVazio(statusDiv, todosClientes.length === 0);
        if (info) info.innerText = "Mostrando 0-0 de 0 clientes";
        if (botoes) botoes.innerHTML = '';
        initIcons();
        updateBatchActionBar();
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
      const alvo = e.target as HTMLElement;
      const target = alvo.closest<HTMLElement>('.btn-action');
      if (!target) {
        // Linha inteira abre a ficha, exceto cliques no checkbox
        if (alvo.closest('.lp-col-check')) return;
        const linha = alvo.closest<HTMLElement>('tr[data-id]');
        const linhaId = parseInt(linha?.getAttribute('data-id') || '0', 10);
        if (linhaId) abrirDetalhesCliente(linhaId);
        return;
      }
      const action = target.getAttribute('data-action');
      const id = parseInt(target.getAttribute('data-id') || '0', 10);
      if (!id) return;

      if (action === 'detalhes') abrirDetalhesCliente(id);
      else if (action === 'editar') abrirEdicaoCliente(id);
      else if (action === 'excluir') excluirClienteIndividual(id);
      else if (action === 'revelar-senha') revelarSenhaGovTabela(id);
    });

    // Enter na linha com foco abre a ficha
    bodyTabela?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.target as HTMLElement).matches('tr[data-id]')) return;
      const linhaId = parseInt((e.target as HTMLElement).getAttribute('data-id') || '0', 10);
      if (linhaId) abrirDetalhesCliente(linhaId);
    });

    // Ações do estado vazio (cadastrar / limpar filtros)
    document.getElementById('tabela-clientes-status')?.addEventListener('click', (e: MouseEvent) => {
      const acao = (e.target as HTMLElement).closest<HTMLElement>('[data-estado-acao]')?.getAttribute('data-estado-acao');
      if (acao === 'novo') document.getElementById('btn-abrir-modal-cliente')?.click();
      else if (acao === 'limpar') { segmentoAtual = 'todos'; limparBusca(); }
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

    // DELEGAÇÃO DE EVENTOS: Documentos
    const docsContainer = document.getElementById('det-cli-documentos');
    docsContainer?.addEventListener('click', async (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.btn-action-doc');
      if (!target) return;
      const docId = parseInt(target.getAttribute('data-doc-id') || '0', 10);
      if (!docId || !confirm("Excluir este documento?")) return;

      try {
        await excluirDocumentoClienteApi(docId);
        if (clienteSelecionadoId) carregarDocumentosCliente(clienteSelecionadoId);
        await loadClientes();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Erro ao excluir documento.");
      }
    });

    // Form de Adicionar Documento
    document.getElementById('form-add-doc')?.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      if (!clienteSelecionadoId) return;

      const selectTipo = document.getElementById('doc-tipo') as (HTMLElement & { value?: string }) | null;
      const inputNum = document.getElementById('doc-numero') as HTMLInputElement | null;
      const inputOrg = document.getElementById('doc-orgao') as HTMLInputElement | null;
      const inputValidade = document.getElementById('doc-validade') as HTMLInputElement | null;

      const tipo = selectTipo?.value || 'RG';
      const numero = inputNum?.value.trim() || '';
      const orgao = inputOrg?.value.trim() || '';
      const validade = inputValidade?.value.trim() || null;

      if (!numero) {
        alert("Preencha o número do documento.");
        return;
      }

      let orgaoEmissor = orgao;
      let ufEmissor = null;
      if (orgao.includes('/')) {
        const parts = orgao.split('/');
        orgaoEmissor = parts[0].trim();
        ufEmissor = parts[1].trim();
      }

      try {
        await salvarDocumentoClienteApi(clienteSelecionadoId, {
          tipo_documento: tipo,
          numero: numero,
          orgao_emissor: orgaoEmissor,
          uf_emissor: ufEmissor,
          data_validade: validade
        });

        if (inputNum) inputNum.value = '';
        if (inputOrg) inputOrg.value = '';
        if (inputValidade) inputValidade.value = '';

        carregarDocumentosCliente(clienteSelecionadoId);
        await loadClientes();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Erro ao adicionar documento.");
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
      // Atualização parcial: só os metadados são alterados; o restante do cadastro é preservado
      const payload: ClientePayload = {
        nome_completo: cli.nome_completo,
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

    // Upload e Parsing Inteligente de PDF de Identidade
    const uploadPdfIdentidade = async (id: number, file: File) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert("Por favor, selecione um arquivo no formato PDF.");
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const btnUpload = document.getElementById('btn-det-importar-pdf');
      const inputPdf = document.getElementById('input-det-importar-pdf') as HTMLInputElement | null;

      try {
        if (btnUpload) {
          btnUpload.setAttribute('disabled', 'true');
          btnUpload.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-mint-vibrant"></i> <span class="hidden sm:inline text-xs font-semibold ml-1">Processando...</span>';
          initIcons();
        }

        const res = await fetch(`${API_BASE}/clientes/${id}/importar-identidade-pdf`, {
          method: 'POST',
          headers: cabecalhosAuth(),
          body: formData
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Erro ao processar o PDF de identidade.');
        }

        const data = await res.json();
        alert(data.mensagem || 'PDF de identidade importado com sucesso!');

        // Recarrega todos os clientes do backend e reabre a tela de detalhes atualizada
        await loadClientes();
        abrirDetalhesCliente(id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha na importação do PDF.';
        alert(msg);
      } finally {
        if (btnUpload) {
          btnUpload.removeAttribute('disabled');
          btnUpload.innerHTML = '<i data-lucide="file-up" class="w-4 h-4 text-mint-vibrant"></i> <span class="hidden sm:inline text-xs font-semibold ml-1">Importar PDF</span>';
          initIcons();
        }
        if (inputPdf) inputPdf.value = '';
      }
    };

    // Botão de Importar PDF no Cabeçalho
    const btnDetImportarPdf = document.getElementById('btn-det-importar-pdf');
    const inputDetImportarPdf = document.getElementById('input-det-importar-pdf') as HTMLInputElement | null;

    btnDetImportarPdf?.addEventListener('click', () => {
      if (inputDetImportarPdf) inputDetImportarPdf.click();
    });

    // Dropzone na Aba de Documentos
    const dropzonePdf = document.getElementById('dropzone-pdf-identidade');
    dropzonePdf?.addEventListener('click', () => {
      if (inputDetImportarPdf) inputDetImportarPdf.click();
    });

    // Drag and Drop na Dropzone
    if (dropzonePdf) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropzonePdf.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzonePdf.classList.add('border-mint-vibrant', 'bg-mint-vibrant/[0.08]');
        });
      });
      ['dragleave', 'drop'].forEach(eventName => {
        dropzonePdf.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzonePdf.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.08]');
        });
      });
      dropzonePdf.addEventListener('drop', (e: DragEvent) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0 && clienteSelecionadoId) {
          uploadPdfIdentidade(clienteSelecionadoId, files[0]);
        }
      });
    }

    // Input Change
    inputDetImportarPdf?.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0 && clienteSelecionadoId) {
        uploadPdfIdentidade(clienteSelecionadoId, target.files[0]);
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

      statusDiv?.classList.add('hidden');
      body.innerHTML = Array.from({ length: 8 }, () => '<tr><td colspan="8" class="!p-0"><div class="lp-skel"></div></td></tr>').join('');

      return fetchTodosClientes()
        .then(data => {
          todosClientes = data;
          renderTabela();
        }).catch(err => {
          console.error("Erro ao obter clientes:", err);
          body.innerHTML = '';
          if (statusDiv) {
            statusDiv.classList.remove('hidden');
            statusDiv.innerHTML = '<div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="alert-triangle"></i></div><div class="lp-estado-titulo">Erro de conexão com o servidor</div><div class="lp-estado-txt">Não foi possível carregar os clientes.</div><button type="button" class="lp-btn-sec" id="btn-recarregar-clientes">Tentar novamente</button></div>';
            document.getElementById('btn-recarregar-clientes')?.addEventListener('click', () => { loadClientes(); });
            initIcons();
          }
        });
    };

    loadClientes();

    // Submit Form (Novo ou Edição)
    form?.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const rawPayload = Object.fromEntries(formData.entries()) as Record<string, string>;

      const tipoPessoa = (rawPayload.tipo_pessoa as 'PF' | 'PJ') || 'PF';
      const isPj = tipoPessoa === 'PJ';

      const nomeInputVal = (inputNomeCompleto as any)?.value || (form?.querySelector<any>('#input-nome-completo'))?.value || '';
      const razaoInputVal = (inputRazaoSocial as any)?.value || (form?.querySelector<any>('#input-razao-social'))?.value || '';

      const nomeCompleto = (isPj 
        ? (rawPayload.razao_social || razaoInputVal || rawPayload.nome_completo || nomeInputVal || '')
        : (rawPayload.nome_completo || nomeInputVal || '')
      ).trim();

      const cpfCnpjRaw = (isPj
        ? (rawPayload.cnpj_pj || (inputCnpjPj as any)?.value || (form?.querySelector<any>('#input-cnpj-pj'))?.value || rawPayload.cpf_cnpj || (inputCpfCnpj as any)?.value || '')
        : (rawPayload.cpf_cnpj || (inputCpfCnpj as any)?.value || (form?.querySelector<any>('#input-cpf-cnpj'))?.value || '')
      ).trim();
      const cpfCnpjVal = cpfCnpjRaw !== '' ? cpfCnpjRaw : null;

      // Senha GOV: vazio na edição de quem já tem senha = remover; vazio sem senha prévia = nada a enviar.
      // A máscara '••••••••' (senha mantida) é ignorada pelo back-end.
      const cliEditado = clienteSelecionadoId ? todosClientes.find(c => c.id === clienteSelecionadoId) : null;
      const senhaDigitada = (rawPayload.senha_gov || '').trim();
      const senhaGovParaEnvio: string | null = senhaDigitada !== ''
        ? senhaDigitada
        : (cliEditado && (cliEditado.tem_senha_gov || cliEditado.senha_gov) ? '' : null);

      // Dados do cônjuge só valem para casado/união estável; o resto é descartado no envio
      const casado = estadoCivilCasado(rawPayload.estado_civil);
      const conj = (v: string | undefined): string | null => (casado ? (v || null) : null);

      const enderecoSemNumero = rawPayload.endereco_sem_numero || '';
      const numero = rawPayload.numero_endereco || '';
      const enderecoCompleto = numero ? `${enderecoSemNumero}, ${numero}` : enderecoSemNumero;

      const dataNascFundacao = isPj 
        ? (rawPayload.data_fundacao_pj || rawPayload.data_nascimento_fundacao || null)
        : (rawPayload.data_nascimento_fundacao || null);

      const representanteIdRaw = rawPayload.representante_legal_id ? parseInt(rawPayload.representante_legal_id, 10) : null;
      const representanteId = !isNaN(representanteIdRaw as number) ? representanteIdRaw : null;

      const payload: ClientePayload = {
        nome: nomeCompleto,
        nome_completo: nomeCompleto,
        cpf_cnpj: cpfCnpjVal,
        rg_ie: isPj ? (rawPayload.inscricao_estadual || rawPayload.rg_ie || null) : (rawPayload.rg_ie || null),
        data_nascimento_fundacao: dataNascFundacao,
        estado_civil: rawPayload.estado_civil || null,
        profissao: rawPayload.profissao || null,
        nacionalidade: rawPayload.nacionalidade || null,
        nome_conjuge: conj(rawPayload.nome_conjuge),
        genero_conjuge: conj(rawPayload.genero_conjuge),
        cpf_conjuge: conj(rawPayload.cpf_conjuge),
        rg_conjuge: conj(rawPayload.rg_conjuge),
        rg_orgao_conjuge: conj(rawPayload.rg_orgao_conjuge),
        rg_uf_conjuge: conj(rawPayload.rg_uf_conjuge),
        nacionalidade_conjuge: conj(rawPayload.nacionalidade_conjuge),
        profissao_conjuge: conj(rawPayload.profissao_conjuge),
        regime_bens: conj(rawPayload.regime_bens),
        certidao_casamento_matricula: conj(rawPayload.certidao_casamento_matricula),
        data_casamento: conj(rawPayload.data_casamento),
        cartorio_casamento: conj(rawPayload.cartorio_casamento),
        livro_casamento: conj(rawPayload.livro_casamento),
        folha_casamento: conj(rawPayload.folha_casamento),
        termo_casamento: conj(rawPayload.termo_casamento),
        email: rawPayload.email || null,
        telefone: rawPayload.telefone || null,
        endereco_completo: enderecoCompleto || null,
        endereco_sem_numero: rawPayload.endereco_sem_numero || null,
        numero_endereco: rawPayload.numero_endereco || null,
        bairro: rawPayload.bairro || null,
        cidade: rawPayload.cidade || null,
        estado: rawPayload.estado || null,
        cep: rawPayload.cep || null,
        sexo: rawPayload.sexo || 'M',
        senha_gov: senhaGovParaEnvio,
        tipo_pessoa: tipoPessoa,
        razao_social: isPj ? (rawPayload.razao_social || nomeCompleto) : null,
        nome_fantasia: isPj ? (rawPayload.nome_fantasia || null) : null,
        inscricao_estadual: isPj ? (rawPayload.inscricao_estadual || null) : null,
        inscricao_municipal: isPj ? (rawPayload.inscricao_municipal || null) : null,
        representante_legal_id: isPj ? representanteId : null,
        cnh_numero: rawPayload.cnh_numero || null,
        cnh_categoria: rawPayload.cnh_categoria || null,
        cnh_validade: rawPayload.cnh_validade || null,
        cnh_orgao_uf: rawPayload.cnh_orgao_uf || null,
        rg_orgao: rawPayload.rg_orgao || null,
        rg_uf: rawPayload.rg_uf || null,
        naturalidade: rawPayload.naturalidade || null,
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

