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
  renderCcirDetalhesModalHtml
} from './ccir/ccir_helpers';

export const ccirRoute: RouteDef = {
  render: () => renderCcirTemplate(),
  setup: () => {
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
          initIcons();

          // Bind exclusão de planilha
          document.querySelectorAll('.btn-delete-ccir-file').forEach(btn => {
            btn.addEventListener('click', () => {
              const filename = btn.getAttribute('data-file');
              if (filename) {
                customConfirm(`Tem certeza de que deseja remover TODOS os registros importados da planilha "${filename}"?`).then(confirmed => {
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
          if (container) container.innerHTML = `<p class="text-xs text-red-400 text-center py-4">Erro ao carregar arquivos: ${err.message}</p>`;
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
          const body = document.getElementById('ccir-results-body');
          const count = document.getElementById('ccir-results-count');
          if (!body || !count) return;

          count.innerText = `${data.length} registros`;
          body.innerHTML = renderCcirResultadosTabela(data);
          initIcons();

          // Bind duplo clique nas linhas
          document.querySelectorAll('.ccir-row').forEach(row => {
            row.addEventListener('dblclick', () => {
              const codigo = row.getAttribute('data-codigo');
              if (codigo) showDetails(codigo);
            });
          });

          // Bind botão de visualização
          document.querySelectorAll('.btn-view-ccir-detail').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const codigo = btn.getAttribute('data-codigo');
              if (codigo) showDetails(codigo);
            });
          });

          // Bind botão de emissão externa
          document.querySelectorAll('.btn-emitir-ccir-incra').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const codigo = btn.getAttribute('data-codigo') || '';
              const uf = btn.getAttribute('data-uf') || '';
              const municipio = btn.getAttribute('data-municipio') || '';
              const titular = btn.getAttribute('data-titular') || '';
              const imovel = btn.getAttribute('data-imovel') || '';

              if (codigo) {
                abrirModalEmissao(codigo, uf, municipio, imovel, titular);
              }
            });
          });
        })
        .catch(err => {
          showToast("Erro ao realizar busca: " + err.message, "error");
        });
    };

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

      const nomeBase = (titular || '').replace(/\*+/g, '').trim();
      if (nomeBase.length >= 3) {
        fetchClientes()
          .then(clientes => {
            const correspondente = clientes.find((c: any) =>
              c.nome_completo.toLowerCase().startsWith(nomeBase.toLowerCase()) ||
              c.nome_completo.toLowerCase().includes(nomeBase.toLowerCase())
            );
            if (correspondente && correspondente.cpf_cnpj) {
              if (lblSugestao) {
                lblSugestao.innerText = `💡 Sugerir do cliente: ${escapeHtml(correspondente.nome_completo)} (${aplicarMascaraCpfCnpj(correspondente.cpf_cnpj)})`;
                lblSugestao.classList.remove('hidden');
                lblSugestao.onclick = () => {
                  inputEmissaoCpf.value = aplicarMascaraCpfCnpj(correspondente.cpf_cnpj);
                  lblSugestao.classList.add('hidden');
                };
              }
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
