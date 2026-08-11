import { API_BASE } from '../../config';
import { initIcons, customAlert, customConfirm, showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho/mesa_trabalho_context';
import { atualizarPainelPropriedades } from './mesa_trabalho/painel_propriedades';
import { ctxClickOutsideHandler, ctxScrollHandler, setCtxClickOutsideHandler, setCtxScrollHandler } from './mesa_trabalho';

export let abrirModalEditarPonto: any;
export let confirmarExclusaoPonto: any;
export let inicializarMenuContextoEPontoModal: any;

export function setupModalPonto(ctx: MesaTrabalhoContext) {
  let pontoSelecionadoContextoId: number | null = null;
    abrirModalEditarPonto = (pId: number) => {
      const pt = ctx.pontosList.find(x => x.id === pId);
      if (!pt) return;

      const modalPt = document.getElementById('modal-editar-ponto');
      if (!modalPt) return;

      pontoSelecionadoContextoId = pId;

      const elTitulo = document.getElementById('modal-pt-titulo-nome');
      if (elTitulo) elTitulo.innerText = pt.nome_vertice;

      const inputId = document.getElementById('input-pt-id') as HTMLInputElement;
      if (inputId) inputId.value = pt.id.toString();

      const inputNome = document.getElementById('input-pt-nome') as HTMLInputElement;
      if (inputNome) inputNome.value = pt.nome_vertice;

      const selectTipo = document.getElementById('select-pt-tipo') as HTMLSelectElement;
      if (selectTipo) selectTipo.value = pt.tipo_ponto || 'P';

      const selectStatus = document.getElementById('select-pt-status') as HTMLSelectElement;
      if (selectStatus) selectStatus.value = pt.status_ponto || 'BRUTO';

      const selectMetodo = document.getElementById('select-pt-metodo') as HTMLSelectElement;
      if (selectMetodo) selectMetodo.value = pt.metodo_posicionamento || 'PG1';

      const inputLat = document.getElementById('input-pt-lat') as HTMLInputElement;
      if (inputLat) inputLat.value = pt.lat ? pt.lat.toFixed(9) : '';

      const inputLon = document.getElementById('input-pt-lon') as HTMLInputElement;
      if (inputLon) inputLon.value = pt.lon ? pt.lon.toFixed(9) : '';

      const inputAlt = document.getElementById('input-pt-alt') as HTMLInputElement;
      if (inputAlt) inputAlt.value = pt.alt ? pt.alt.toFixed(4) : '';

      const inputSigLat = document.getElementById('input-pt-sigma-lat') as HTMLInputElement;
      if (inputSigLat) inputSigLat.value = pt.sigma_lat ? pt.sigma_lat.toFixed(4) : '0.0000';

      const inputSigLon = document.getElementById('input-pt-sigma-lon') as HTMLInputElement;
      if (inputSigLon) inputSigLon.value = pt.sigma_lon ? pt.sigma_lon.toFixed(4) : '0.0000';

      const inputSigAlt = document.getElementById('input-pt-sigma-alt') as HTMLInputElement;
      if (inputSigAlt) inputSigAlt.value = pt.sigma_alt ? pt.sigma_alt.toFixed(4) : '0.0000';

      const txtPtE = document.getElementById('txt-pt-e-orig');
      if (txtPtE) txtPtE.innerText = pt.e_original ? pt.e_original.toFixed(4) + ' m' : 'N/A';

      const txtPtN = document.getElementById('txt-pt-n-orig');
      if (txtPtN) txtPtN.innerText = pt.n_original ? pt.n_original.toFixed(4) + ' m' : 'N/A';

      const txtPtAlt = document.getElementById('txt-pt-alt-orig');
      if (txtPtAlt) txtPtAlt.innerText = pt.alt_original ? pt.alt_original.toFixed(4) + ' m' : 'N/A';

      const txtPtArq = document.getElementById('txt-pt-arquivo-origem');
      if (txtPtArq) txtPtArq.innerText = pt.arquivo_rinex ? `Origem: ${pt.arquivo_rinex}` : 'Origem: Ingestão Manual';

      const selectBase = document.getElementById('select-pt-base') as HTMLSelectElement;
      if (selectBase) {
        const basesDoLev = ctx.pontosList.filter(x => {
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
            const utm = ctx.latLonToUTM(pt.lat, pt.lon);
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

    confirmarExclusaoPonto = async (pId: number) => {
      if (ctx.currentLevantamento?.status === 'ARQUIVADO') {
         await customAlert("Este projeto está ARQUIVADO e não pode ser modificado (Modo Somente Leitura).");
         return;
      }

      const isLote = ctx.selectedPontoIds.length > 1 && ctx.selectedPontoIds.includes(pId);

      if (isLote) {
         if (!await customConfirm(`ATENÇÃO: Tem certeza absoluta que deseja excluir definitivamente os ${ctx.selectedPontoIds.length} vértices selecionados? Esta operação é irreversível e removerá todos de uma só vez.`)) return;

         try {
           const promessas = ctx.selectedPontoIds.map(id =>
              fetch(`${API_BASE}/pontos/${id}`, { method: 'DELETE' }).then(async r => {
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
             await customAlert(`Ocorreram alguns erros ao tentar excluir em lote:\n${erros.slice(0, 5).join('\n')}`);
           } else {
             showToast(`${ctx.selectedPontoIds.length} vértices excluídos com sucesso!`, 'success');
           }
           ctx.selectedPontoIds = [];
           await ctx.loadLevantamentoDetails();
         } catch (err) {
           console.error("Erro ao excluir pontos em lote:", err);
           showToast("Erro de comunicação com o servidor API ao tentar excluir os pontos selecionados.", 'error');
         }
         return;
      }

      const pt = ctx.pontosList.find(x => x.id === pId);
      if (!pt) return;

      if (!await customConfirm(`ATENÇÃO: Tem certeza absoluta que deseja excluir definitivamente o vértice '${pt.nome_vertice}'? Esta operação é irreversível.`)) return;

      try {
        const res = await fetch(`${API_BASE}/pontos/${pId}`, { method: 'DELETE' });
        if (res.status === 403) {
           await customAlert("Este projeto está ARQUIVADO e não pode ser modificado (Modo Somente Leitura).");
           return;
        }
        const data = await res.json();
        if (data.error) {
          await customAlert(data.error);
        } else {
          showToast(`Vértice ${pt.nome_vertice} excluído com sucesso!`, 'success');
          ctx.selectedPontoIds = ctx.selectedPontoIds.filter(id => id !== pId);
          await ctx.loadLevantamentoDetails();
        }
      } catch (err) {
        console.error("Erro ao excluir ponto:", err);
        showToast("Erro de comunicação com o servidor API.", 'error');
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

      // Desabilita botão submit para evitar double-submit
      const btnSubmitPt = document.getElementById('btn-salvar-pt') as HTMLButtonElement ||
        document.querySelector('#form-editar-ponto [type="submit"]') as HTMLButtonElement;
      if (btnSubmitPt) { btnSubmitPt.disabled = true; btnSubmitPt.textContent = 'Salvando...'; }

      try {
        const res = await fetch(`${API_BASE}/pontos/${pId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.error || (data.detail && typeof data.detail === 'string')) {
          await customAlert(`Erro ao salvar: ${data.error || data.detail}`);
        } else if (data.detail && typeof data.detail === 'object') {
          await customAlert(`Erro ao salvar: ${JSON.stringify(data.detail)}`);
        } else {
          document.getElementById('modal-editar-ponto')?.classList.add('hidden');
          showToast("Vértice geodésico atualizado com sucesso!", 'success');
          await ctx.loadLevantamentoDetails();
        }
      } catch (err) {
        console.error("Erro ao salvar alterações no ponto:", err);
        showToast("Erro de comunicação com o servidor.", 'error');
      } finally {
        if (btnSubmitPt) { btnSubmitPt.disabled = false; btnSubmitPt.textContent = 'Salvar Alterações'; }
      }
    };

    inicializarMenuContextoEPontoModal = () => {
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
          ctx.selectPontoFromTabela(pId);

          menuCtx.style.left = `${e.pageX}px`;
          menuCtx.style.top = `${e.pageY}px`;
          menuCtx.classList.remove('hidden');
        });
      }

      setCtxClickOutsideHandler((e: MouseEvent) => {
        if (!menuCtx.contains(e.target as Node)) {
          menuCtx.classList.add('hidden');
        }
      });

      setCtxScrollHandler(() => {
        menuCtx.classList.add('hidden');
      });

      if (ctxClickOutsideHandler) document.addEventListener('click', ctxClickOutsideHandler as EventListener);
      if (ctxScrollHandler) document.addEventListener('scroll', ctxScrollHandler as EventListener, true);

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

      document.getElementById('form-editar-ponto')?.addEventListener('submit', (e) => {
        e.preventDefault();
        salvarPontoModal();
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

    // 7. Outros inicializadores de UI (Filtros, Buscas, Collapses, Splitters)
}
