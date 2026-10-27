/**
 * views/ccir.ts — Controller do Banco de Dados CCIR.
 */
import type { RouteDef } from '../types';
import { initIcons, formatarCCIR, showToast, customAlert, customConfirm, escapeHtml } from '../utils';
import { renderCcirTemplate } from './ccir/ccir_template';
import {
  fetchCcirFiles,
  deleteCcirFile,
  searchCcir,
  fetchCcirImovelDetails,
  syncCcirFolder,
  abrirPastaCcir,
  fetchClientes
} from './ccir/ccir_service';
import {
  aplicarMascaraCpfCnpj,
  renderPlanilhasImportadas,
  renderCcirResultadosTabela,
  renderCcirDetalhesModalHtml,
  ordenarResultadosCcir,
  type CampoOrdemCcir,
  type DirecaoOrdemCcir
} from './ccir/ccir_helpers';

// Limite imposto pelo backend em /ccir/search (routes/ccir.py): quando o total bate nele, há mais registros
const LIMITE_BUSCA = 200;

let fecharPopoverHandler: ((e: Event) => void) | null = null;

export const ccirRoute: RouteDef = {
  render: () => renderCcirTemplate(),
  cleanup: () => {
    if (fecharPopoverHandler) {
      document.removeEventListener('click', fecharPopoverHandler);
      document.removeEventListener('keydown', fecharPopoverHandler);
      fecharPopoverHandler = null;
    }
  },
  setup: () => {
    let resultados: any[] = [];
    let campoOrdem: CampoOrdemCcir = 'imovel';
    let direcaoOrdem: DirecaoOrdemCcir = 'asc';
    const btnSync = document.getElementById('btn-sync-ccir');
    const btnOpenFolder = document.getElementById('btn-open-ccir-folder');
    const formSearch = document.getElementById('form-ccir-search') as HTMLFormElement;
    const btnClear = document.getElementById('btn-clear-ccir-search');

    // 1. Carrega a listagem de arquivos
    const loadFiles = () => {
      fetchCcirFiles()
        .then(files => {
          const container = document.getElementById('ccir-imported-files');
          if (!container) return;

          container.innerHTML = renderPlanilhasImportadas(files);
          const contador = document.getElementById('ccir-planilhas-count');
          if (contador) contador.innerText = String(files.length);
          initIcons();

          // Bind exclusão de planilha
          document.querySelectorAll('.btn-delete-ccir-file').forEach(btn => {
            btn.addEventListener('click', () => {
              const filename = btn.getAttribute('data-file');
              if (filename) {
                customConfirm(`Tem certeza de que deseja remover TODOS os registros importados da planilha "${filename}"? O arquivo será movido para a pasta Banco_CCIR/_removidas.`).then(confirmed => {
                  if (confirmed) {
                    deleteCcirFile(filename)
                      .then(() => {
                        showToast('Planilha removida com sucesso!', 'success');
                        loadFiles();
                        runSearch();
                      })
                      .catch(err => showToast(err.message, 'error'));
                  }
                });
              }
            });
          });
        })
        .catch(err => {
          const container = document.getElementById('ccir-imported-files');
          if (container) container.innerHTML = `<p class="lp-sub" style="text-align:center;padding:16px 0;color:var(--lp-danger)">Erro ao carregar arquivos: ${escapeHtml(err.message)}</p>`;
        });
    };

    // 2. Executa a busca avançada
    const runSearch = () => {
      if (!formSearch) return;

      const formData = new FormData(formSearch);
      const params = new URLSearchParams();

      for (const [key, val] of formData.entries()) {
        if (val) {
          params.append(key, val.toString());
        }
      }

      searchCcir(params)
        .then(data => {
          resultados = data;
          renderResultados();
        })
        .catch(err => {
          showToast("Erro ao realizar busca: " + err.message, "error");
        });
    };

    // Desenha a tabela a partir dos resultados já carregados (reordenar não refaz a busca)
    const renderResultados = () => {
      const body = document.getElementById('ccir-results-body');
      const count = document.getElementById('ccir-results-count');
      const rodape = document.getElementById('ccir-rodape-info');
      if (!body || !count) return;

      count.innerText = `${resultados.length.toLocaleString('pt-BR')} registro(s)`;
      if (rodape) {
        rodape.innerText = resultados.length >= LIMITE_BUSCA
          ? `Mostrando os primeiros ${LIMITE_BUSCA} registros: refine os filtros para ver os demais`
          : `Mostrando ${resultados.length} registro(s)`;
      }
      document.querySelectorAll<HTMLElement>('.lp-tabela th[data-ordem]').forEach(th => {
        if (th.getAttribute('data-ordem') === campoOrdem) th.setAttribute('aria-sort', direcaoOrdem === 'asc' ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
      });
      body.innerHTML = renderCcirResultadosTabela(ordenarResultadosCcir(resultados, campoOrdem, direcaoOrdem));
      initIcons();
    };

    // Delegação de eventos da tabela: linha inteira, ver coproprietários, emitir e estado vazio
    document.getElementById('ccir-results-body')?.addEventListener('click', (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      const emitir = alvo.closest<HTMLElement>('.btn-emitir-ccir-incra');
      if (emitir) {
        const codigo = emitir.getAttribute('data-codigo') || '';
        if (codigo) {
          abrirModalEmissao(
            codigo,
            emitir.getAttribute('data-uf') || '',
            emitir.getAttribute('data-municipio') || '',
            emitir.getAttribute('data-imovel') || '',
            emitir.getAttribute('data-titular') || ''
          );
        }
        return;
      }
      if (alvo.closest('[data-estado-acao="limpar"]')) { btnClear?.click(); return; }
      const codigoLinha = alvo.closest<HTMLElement>('tr.ccir-row')?.getAttribute('data-codigo');
      if (codigoLinha) showDetails(codigoLinha);
    });
    document.getElementById('ccir-results-body')?.addEventListener('keydown', (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key === 'Enter' && alvo.matches('tr.ccir-row')) {
        const codigoLinha = alvo.getAttribute('data-codigo');
        if (codigoLinha) showDetails(codigoLinha);
      }
    });

    // Ordenação por cabeçalho (clique ou Enter/Espaço); clicar de novo inverte a direção
    const alternarOrdem = (th: HTMLElement) => {
      const campo = th.getAttribute('data-ordem') as CampoOrdemCcir | null;
      if (!campo) return;
      if (campo === campoOrdem) direcaoOrdem = direcaoOrdem === 'asc' ? 'desc' : 'asc';
      else { campoOrdem = campo; direcaoOrdem = campo === 'area' || campo === 'pct' ? 'desc' : 'asc'; }
      renderResultados();
    };
    document.querySelectorAll<HTMLElement>('.lp-tabela th[data-ordem]').forEach(th => {
      th.addEventListener('click', () => alternarOrdem(th));
      th.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarOrdem(th); }
      });
    });

    // Filtros de área/detenção recolhíveis
    const btnMaisFiltros = document.getElementById('btn-mais-filtros');
    btnMaisFiltros?.addEventListener('click', () => {
      const painel = document.getElementById('filtros-avancados');
      const aberto = painel?.classList.toggle('hidden') === false;
      btnMaisFiltros.setAttribute('aria-expanded', String(aberto));
    });

    // Popover das planilhas importadas (fecha ao clicar fora ou com Esc)
    const btnPlanilhas = document.getElementById('btn-planilhas');
    const popover = document.getElementById('popover-planilhas');
    const fecharPopover = () => { popover?.classList.add('hidden'); btnPlanilhas?.setAttribute('aria-expanded', 'false'); };
    btnPlanilhas?.addEventListener('click', (e) => {
      e.stopPropagation();
      const aberto = popover?.classList.toggle('hidden') === false;
      btnPlanilhas.setAttribute('aria-expanded', String(aberto));
    });
    fecharPopoverHandler = (e: Event) => {
      if (e.type === 'keydown') { if ((e as KeyboardEvent).key === 'Escape') fecharPopover(); return; }
      if (popover && !popover.contains(e.target as Node)) fecharPopover();
    };
    document.addEventListener('click', fecharPopoverHandler);
    document.addEventListener('keydown', fecharPopoverHandler);

    // 3. Abre modal de co-propriedade e detalhes
    const showDetails = (codigo_imovel: string) => {
      fetchCcirImovelDetails(codigo_imovel)
        .then(data => {
          if (!data || data.length === 0) return;

          let modal = document.getElementById('ccir-modal');
          if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ccir-modal';
            modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center transition-all duration-300';
            document.body.appendChild(modal);
          }

          modal.innerHTML = renderCcirDetalhesModalHtml(codigo_imovel, data);
          initIcons();
          modal.classList.remove('hidden');

          const closeModal = () => {
            modal!.classList.add('hidden');
          };

          const regBase = data[0];
          document.getElementById('close-ccir-modal')?.addEventListener('click', closeModal);
          document.getElementById('btn-fechar-ccir-modal')?.addEventListener('click', closeModal);
          document.getElementById('btn-emitir-modal-incra')?.addEventListener('click', () => {
            closeModal();
            abrirModalEmissao(
              codigo_imovel,
              regBase.uf || '',
              regBase.municipio || '',
              regBase.denominacao || '',
              regBase.titular || ''
            );
          });
        })
        .catch(err => {
          showToast("Erro ao carregar detalhes: " + err.message, "error");
        });
    };

    // 4. Sincronização e Pasta
    if (btnSync) {
      btnSync.addEventListener('click', () => {
        const icon = document.getElementById('sync-icon');
        if (icon) icon.classList.add('animate-spin');
        btnSync.setAttribute('disabled', 'true');

        syncCcirFolder()
          .then(res => {
            if (icon) icon.classList.remove('animate-spin');
            btnSync.removeAttribute('disabled');

            customAlert("Relatório de Sincronização:\n\n" + res.logs.join('\n'));
            loadFiles();
            runSearch();
          })
          .catch(err => {
            if (icon) icon.classList.remove('animate-spin');
            btnSync.removeAttribute('disabled');
            showToast("Erro ao sincronizar: " + err.message, "error");
          });
      });
    }

    if (btnOpenFolder) {
      btnOpenFolder.addEventListener('click', () => {
        abrirPastaCcir()
          .catch(() => showToast("Erro de conexão ao abrir pasta", "error"));
      });
    }

    if (formSearch) {
      formSearch.addEventListener('submit', (e) => {
        e.preventDefault();
        runSearch();
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        formSearch.reset();
        runSearch();
      });
    }

    // 5. Emissor CCIR Automático (Portal INCRA)
    const modalEmissao = document.getElementById('modal-ccir-emissao');
    const formEmissao = document.getElementById('form-ccir-emissao') as HTMLFormElement;
    const inputEmissaoCpf = document.getElementById('input-emissao-cpf') as HTMLInputElement;
    const lblSugestao = document.getElementById('lbl-emissao-sugestao');

    inputEmissaoCpf?.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      t.value = aplicarMascaraCpfCnpj(t.value);
    });

    const abrirModalEmissao = (codigo: string, uf: string, municipio: string, denominacao: string, titular: string) => {
      if (!modalEmissao) return;

      (document.getElementById('emissao-ccir-codigo') as HTMLInputElement).value = codigo;
      (document.getElementById('emissao-ccir-uf') as HTMLInputElement).value = uf;
      (document.getElementById('emissao-ccir-municipio') as HTMLInputElement).value = municipio;
      (document.getElementById('emissao-ccir-titular') as HTMLInputElement).value = titular;
      (document.getElementById('emissao-ccir-imovel') as HTMLInputElement).value = denominacao;

      const lblImovel = document.getElementById('lbl-emissao-imovel');
      const lblCodigo = document.getElementById('lbl-emissao-codigo');
      const lblTitular = document.getElementById('lbl-emissao-titular');

      if (lblImovel) lblImovel.innerText = denominacao || 'Não Informado';
      if (lblCodigo) lblCodigo.innerText = formatarCCIR(codigo);
      if (lblTitular) lblTitular.innerText = titular || 'Não Informado';

      if (lblSugestao) {
        lblSugestao.classList.add('hidden');
        lblSugestao.innerText = '';
        lblSugestao.onclick = null;
      }

      const salvo = localStorage.getItem('ccir_cpf_' + codigo);
      if (salvo) {
        inputEmissaoCpf.value = salvo;
      } else {
        inputEmissaoCpf.value = '';
      }

      // O titular no CCIR costuma vir mascarado ("JOAO DA S****"): o trecho visível é um prefixo do nome.
      // A sugestão só aparece quando exatamente um cliente é compatível, para não sugerir o CPF de outra pessoa.
      const normalizarNome = (nome: string) => nome
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/\s+/g, ' ').trim();
      const titularMascarado = /\*/.test(titular || '');
      const nomeBase = normalizarNome((titular || '').replace(/\*+.*$/, ''));
      if (nomeBase.length >= 3) {
        fetchClientes()
          .then(clientes => {
            const compativeis = clientes.filter((c: any) => {
              if (!c.cpf_cnpj || !c.nome_completo) return false;
              const nomeCliente = normalizarNome(c.nome_completo);
              return titularMascarado ? nomeCliente.startsWith(nomeBase) : nomeCliente === nomeBase;
            });
            if (!lblSugestao) return;
            if (compativeis.length === 1) {
              const correspondente = compativeis[0];
              lblSugestao.innerText = `💡 Sugerir do cliente: ${correspondente.nome_completo} (${aplicarMascaraCpfCnpj(correspondente.cpf_cnpj)})`;
              lblSugestao.classList.remove('hidden');
              lblSugestao.onclick = () => {
                inputEmissaoCpf.value = aplicarMascaraCpfCnpj(correspondente.cpf_cnpj);
                lblSugestao.classList.add('hidden');
              };
            } else if (compativeis.length > 1) {
              lblSugestao.innerText = `${compativeis.length} clientes compatíveis com o titular — informe o CPF manualmente.`;
              lblSugestao.classList.remove('hidden');
              lblSugestao.onclick = null;
            }
          })
          .catch(err => console.warn("[CCIR] Erro ao buscar sugestão de clientes:", err));
      }

      modalEmissao.classList.remove('hidden');
    };

    const fecharModalEmissao = () => {
      modalEmissao?.classList.add('hidden');
    };

    document.getElementById('btn-fechar-emissao-modal')?.addEventListener('click', fecharModalEmissao);
    document.getElementById('btn-cancelar-emissao')?.addEventListener('click', fecharModalEmissao);

    formEmissao?.addEventListener('submit', (e) => {
      e.preventDefault();

      const codigo = (document.getElementById('emissao-ccir-codigo') as HTMLInputElement).value;
      const uf = (document.getElementById('emissao-ccir-uf') as HTMLInputElement).value;
      const municipio = (document.getElementById('emissao-ccir-municipio') as HTMLInputElement).value;
      const cpf = inputEmissaoCpf.value;

      if (!codigo || !cpf) return;

      localStorage.setItem('ccir_cpf_' + codigo, cpf);

      const dataPayload = {
        codigo: codigo.replace(/\D/g, ''),
        uf: uf.toUpperCase(),
        municipio: municipio.trim(),
        cpf: cpf
      };

      navigator.clipboard.writeText(JSON.stringify(dataPayload))
        .then(() => {
          fecharModalEmissao();
          window.open('https://sncr.serpro.gov.br/ccir/emissao', '_blank');
          customAlert("Dados de emissão copiados para a área de transferência!\n\nNo site do INCRA, basta clicar no seu favorito 'Preencher CCIR' para colar e autopreencher todos os campos de uma vez, restando apenas resolver o captcha.");
        })
        .catch(err => {
          showToast("Erro ao copiar dados para a área de transferência: " + err.message, "error");
        });
    });

    // 6. Inicialização
    syncCcirFolder()
      .then(() => {
        loadFiles();
        runSearch();
      })
      .catch(() => {
        loadFiles();
        runSearch();
      });
  }
};
