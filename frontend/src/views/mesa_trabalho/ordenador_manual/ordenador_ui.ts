import { API_BASE } from '../../../config';
import { initIcons, customAlert, customConfirm, customPrompt, showToast } from '../../../utils';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function setupOrdenadorUI(ctx: MesaTrabalhoContext) {
  ctx.renderListaReordenarSimplificada = () => {
    try {
      const container = document.getElementById('lista-reordenar-simplificada');
      if (!container) return;

      const todosPontos = ctx.obterPontosParaOrdenacao();
      const pontosMatCompleto = todosPontos.filter(p =>
        p &&
        p.ignorar_poligono !== 1 &&
        p.tipo_ponto !== 'B' &&
        p.tipo !== 'B' &&
        (!ctx.currentMatriculaId || String(p.matricula_id) === String(ctx.currentMatriculaId))
      );

      pontosMatCompleto.sort((a, b) => {
        const valA = a.ordem_caminhamento;
        const valB = b.ordem_caminhamento;
        const numA = Number(valA ?? 999999);
        const numB = Number(valB ?? 999999);
        return numA - numB;
      });

      const totalPontos = pontosMatCompleto.length;

      if (totalPontos === 0) {
        container.innerHTML = `<div class="text-white/20 p-8 text-center text-xs">Nenhum ponto de campo disponível.</div>`;
        return;
      }

      let pontosFiltrados = [...pontosMatCompleto];
      if (ctx.searchFilterOrdenadorValue && ctx.searchFilterOrdenadorValue.trim()) {
        const query = ctx.searchFilterOrdenadorValue.toLowerCase().trim();
        pontosFiltrados = pontosFiltrados.filter(p =>
          p && (
            (p.nome_vertice && p.nome_vertice.toLowerCase().includes(query)) ||
            (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(query)) ||
            (p.tipo && p.tipo.toLowerCase().includes(query))
          )
        );
      }

      if (pontosFiltrados.length === 0) {
        container.innerHTML = `<div class="text-white/20 p-8 text-center text-xs">Nenhum ponto encontrado com "${ctx.searchFilterOrdenadorValue}".</div>`;
        return;
      }

      container.innerHTML = pontosFiltrados.map((p) => {
        if (!p) return '';
        const ordemOriginal = pontosMatCompleto.findIndex(orig => orig && orig.id === p.id) + 1;
        const tipoP = p.tipo_ponto || p.tipo || 'P';

        const seqId = p.sequencia_travada_id;
        const isTravado = !!seqId;
        const cardBgClass = isTravado
          ? 'bg-amber-500/[0.04] border border-amber-500/30 text-amber-100/95 hover:border-amber-500/50 hover:bg-amber-500/[0.08]'
          : 'bg-white/[0.02] border border-white/5 text-white hover:border-mint-vibrant/25 hover:bg-white/[0.04]';

        const lockIconHtml = isTravado
          ? `<span class="inline-flex items-center gap-0.5 text-[8px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-bold uppercase tracking-wider shrink-0" title="Sequência travada: ${seqId}"><i data-lucide="lock" class="w-2.5 h-2.5"></i> ${seqId}</span>`
          : '';

        let matBadgeHtml = '';
        if (p.matricula_id) {
          const matObj = ctx.matriculasList?.find(m => m.id === p.matricula_id);
          const matLabel = matObj?.numero_matricula ? `Mat. ${matObj.numero_matricula}` : `Mat. #${p.matricula_id}`;
          matBadgeHtml = `<span class="text-[8px] font-mono px-1 py-0.2 rounded bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 shrink-0" title="Pertence à ${matLabel}">${matLabel}</span>`;
        } else {
          matBadgeHtml = `<span class="text-[8px] font-mono px-1 py-0.2 rounded bg-white/5 text-white/30 border border-white/5 shrink-0" title="Ponto Avulso (Sem Matrícula Vinculada)">Avulso</span>`;
        }

        return `
          <div class="flex items-center justify-between py-0.5 px-1.5 rounded text-[11px] font-mono transition-all duration-150 linha-ponto-ordenador ${cardBgClass}"
               id="ordenador-item-${p.id}"
               draggable="true"
               data-ponto-id="${p.id}"
               data-ordem="${ordemOriginal}"
               data-idx="${pontosFiltrados.indexOf(p)}"
               data-sequencia-travada="${seqId || ''}">
            <div class="flex items-center gap-1.5 min-w-0 flex-1">
              <input type="checkbox"
                     class="chk-ponto-ordenador rounded border-white/10 bg-white/5 text-mint-vibrant focus:ring-mint-vibrant/20 w-3 h-3 cursor-pointer shrink-0"
                     data-ponto-id="${p.id}"
                     data-idx="${pontosFiltrados.indexOf(p)}" />
              <div class="cursor-grab text-white/20 hover:text-mint-vibrant transition-colors active:cursor-grabbing shrink-0 px-0.5" title="Arrastar para reordenar">
                <i data-lucide="grip-vertical" class="w-3 h-3"></i>
              </div>
              <input type="number"
                     class="input-ordem-manual w-9 text-[10px] text-center font-bold bg-white/5 border border-white/10 rounded focus:border-mint-vibrant focus:outline-none font-mono px-0.5 py-0 shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                     data-ponto-id="${p.id}"
                     value="${ordemOriginal}"
                     min="1"
                     max="${totalPontos}"
                     title="Digite a posição desejada" />
              <span class="font-bold truncate" title="${p.nome_vertice}">${p.nome_vertice}</span>
              <span class="text-[9px] text-white/30 shrink-0">(${tipoP})</span>
              ${matBadgeHtml}
              ${lockIconHtml}
            </div>
          </div>
        `;
      }).join('');

      initIcons();
    } catch (err: any) {
      console.error("Erro ao renderizar ordenador manual:", err);
      const container = document.getElementById('lista-reordenar-simplificada');
      if (container) {
        container.innerHTML = `
          <div class="text-red-400 p-4 text-center text-[11px] border border-red-500/20 bg-red-500/5 rounded-technical leading-relaxed">
            <span class="font-bold block mb-1">Erro na renderização:</span>
            ${err.message || err}<br>
            <span class="text-[9px] opacity-60 font-mono mt-1 block">${err.stack ? err.stack.split('\n')[0] : ''}</span>
          </div>
        `;
      }
    }
  };

  const inicializarEventosOrdenador = () => {
    const containerReordenar = document.getElementById('lista-reordenar-simplificada');
    if (containerReordenar) {
      const novoContainer = containerReordenar.cloneNode(true);
      containerReordenar.parentNode?.replaceChild(novoContainer, containerReordenar);

      const elReordenar = document.getElementById('lista-reordenar-simplificada')!;

      let lastCheckedIdx: number | null = null;

      elReordenar.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const chk = target.closest('.chk-ponto-ordenador') as HTMLInputElement | null;

        if (chk) {
          const currentIdx = parseInt(chk.getAttribute('data-idx') || '-1');
          const isChecked = chk.checked;

          if ((e as MouseEvent).shiftKey && lastCheckedIdx !== null && currentIdx !== -1) {
            const allChks = Array.from(
              elReordenar.querySelectorAll('.chk-ponto-ordenador')
            ) as HTMLInputElement[];

            const from = Math.min(lastCheckedIdx, currentIdx);
            const to   = Math.max(lastCheckedIdx, currentIdx);

            allChks.forEach(c => {
              const cidx = parseInt(c.getAttribute('data-idx') || '-1');
              if (cidx >= from && cidx <= to) {
                c.checked = isChecked;
              }
            });
          }

          lastCheckedIdx = currentIdx;
        }
      });

      elReordenar.addEventListener('mousedown', (e) => {
        if ((e.target as HTMLElement).closest('.input-ordem-manual')) {
          e.stopPropagation();
        }
      });

      let dragSrcEl: HTMLElement | null = null;

      elReordenar.addEventListener('dragstart', (e: DragEvent) => {
        if ((e.target as HTMLElement).closest('.input-ordem-manual')) {
          e.preventDefault();
          return;
        }
        const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement;
        if (target) {
          dragSrcEl = target;
          e.dataTransfer!.effectAllowed = 'move';
          e.dataTransfer!.setData('text/plain', target.getAttribute('data-ponto-id') || '');
          target.classList.add('opacity-40', 'border-dashed', 'border-mint-vibrant');
        }
      });

      elReordenar.addEventListener('change', (e) => {
        const input = (e.target as HTMLElement).closest('.input-ordem-manual') as HTMLInputElement | null;
        if (!input) return;

        const pontoId = parseInt(input.getAttribute('data-ponto-id') || '0');
        const max = parseInt(input.getAttribute('max') || '1');
        let novaPosicao = parseInt(input.value || '0');

        if (!pontoId || isNaN(novaPosicao)) {
          ctx.renderListaReordenarSimplificada();
          return;
        }
        novaPosicao = Math.min(Math.max(novaPosicao, 1), max);
        ctx.moverPontoPosicao(pontoId, novaPosicao);
      });

      elReordenar.addEventListener('keydown', (e: KeyboardEvent) => {
        const el = e.target as HTMLElement;
        if (el.classList.contains('input-ordem-manual') && e.key === 'Enter') {
          (el as HTMLInputElement).blur();
        }
      });

      elReordenar.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement;
        if (target && target !== dragSrcEl) {
          const rect = target.getBoundingClientRect();
          const isAfter = e.clientY > (rect.top + rect.height / 2);

          target.classList.add('bg-mint-vibrant/5');
          if (isAfter) {
            target.classList.add('border-b-2', '!border-b-mint-vibrant');
            target.classList.remove('border-t-2', '!border-t-mint-vibrant');
          } else {
            target.classList.add('border-t-2', '!border-t-mint-vibrant');
            target.classList.remove('border-b-2', '!border-b-mint-vibrant');
          }
        }
      });

      elReordenar.addEventListener('dragleave', (e: DragEvent) => {
        const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement;
        if (target) {
          target.classList.remove('bg-mint-vibrant/5', 'border-t-2', '!border-t-mint-vibrant', 'border-b-2', '!border-b-mint-vibrant');
        }
      });

      elReordenar.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement;
        const pontoIdArrastado = parseInt(e.dataTransfer!.getData('text/plain') || '0');

        if (target && pontoIdArrastado) {
          const rect = target.getBoundingClientRect();
          const isAfter = e.clientY > (rect.top + rect.height / 2);
          let ordemAlvo = parseInt(target.getAttribute('data-ordem') || '1');
          if (isAfter) {
            ordemAlvo += 1;
          }
          ctx.moverPontoPosicao(pontoIdArrastado, ordemAlvo);
        }
      });

      elReordenar.addEventListener('dragend', () => {
        const items = elReordenar.querySelectorAll('.linha-ponto-ordenador');
        items.forEach(item => {
          item.classList.remove('opacity-40', 'border-dashed', 'border-mint-vibrant', 'bg-mint-vibrant/5', 'border-t-2', '!border-t-mint-vibrant', 'border-b-2', '!border-b-mint-vibrant');
        });
      });
    }

    const btnTravar = document.getElementById('btn-travar-sequencia-pontos');
    const btnDestravar = document.getElementById('btn-destravar-sequencia-pontos');

    if (btnTravar) {
      btnTravar.onclick = async () => {
        const checkboxes = document.querySelectorAll('.chk-ponto-ordenador:checked') as NodeListOf<HTMLInputElement>;
        const pIds = Array.from(checkboxes).map(chk => parseInt(chk.getAttribute('data-ponto-id') || '0')).filter(id => id > 0);
        if (pIds.length < 2) {
          await customAlert("Por favor, selecione pelo menos 2 pontos para travar uma sequência.", "Travar Sequência");
          return;
        }

        const todosPontos = ctx.obterPontosParaOrdenacao();
        const pontosMatValidos = todosPontos.filter(p => p.ignorar_poligono !== 1 && p.tipo_ponto !== 'B' && p.tipo !== 'B');
        pontosMatValidos.sort((a, b) => {
          const valA = a.ordem_caminhamento;
          const valB = b.ordem_caminhamento;
          const numA = Number(valA ?? 999999);
          const numB = Number(valB ?? 999999);
          return numA - numB;
        });

        const indices = pIds
          .map(pid => pontosMatValidos.findIndex(p => p.id === pid))
          .filter(idx => idx !== -1)
          .sort((a, b) => a - b);

        if (indices.length < 2) {
          await customAlert("Por favor, selecione pelo menos 2 pontos válidos do perímetro para travar uma sequência.", "Travar Sequência");
          return;
        }

        const saoContiguos = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
        if (!saoContiguos) {
          await customAlert("Os pontos selecionados precisam ser consecutivos na ordem de caminhamento para formar uma sequência travada. Reordene-os primeiro ou utilize Shift+Clique para selecionar uma faixa contínua.", "Sequência Não Contígua");
          return;
        }

        const nomeSequencia = await customPrompt("Digite um nome ou identificação para esta sequência travada:", "", "Travar Sequência", "ex: rio, cerca_oeste");
        if (!nomeSequencia || !nomeSequencia.trim()) return;

        const seqName = nomeSequencia.trim();

        const colidiu = ctx.pontosList.some(
          p => p && p.sequencia_travada_id &&
               String(p.sequencia_travada_id).toLowerCase().trim() === seqName.toLowerCase() &&
               !pIds.includes(p.id)
        );
        if (colidiu) {
          await customAlert(`Já existe outra sequência travada com o nome "${seqName}". Escolha um nome exclusivo para evitar fusões acidentais de grupos.`, "Nome Duplicado");
          return;
        }

        try {
          btnTravar.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 animate-spin"></i> Gravando...`;
          initIcons();

          if (ctx.salvarEstadoHistorico) {
            ctx.salvarEstadoHistorico(`Travar sequência '${seqName}'`);
          }

          const payload = {
            pontos: pIds.map(pid => ({
              id: pid,
              sequencia_travada_id: seqName
            }))
          };

          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos/batch`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || errData.error || "Falha ao salvar sequência travada no servidor.");
          }

          showToast(`Sequência '${seqName}' travada com sucesso!`, "success");

          pIds.forEach(pid => {
            const pt = ctx.pontosList.find(p => p.id === pid);
            if (pt) pt.sequencia_travada_id = seqName;
          });

          ctx.renderListaReordenarSimplificada();
          ctx.atualizarPolilinhaMapaTemp();
          ctx.salvarRascunhoLocal();
        } catch (err: any) {
          console.error("Erro ao travar pontos:", err);
          await customAlert(err.message || "Ocorreu um erro ao salvar o travamento dos pontos.", "Erro ao Travar");
        } finally {
          btnTravar.innerHTML = `<i data-lucide="lock" class="w-3.5 h-3.5 text-amber-400"></i> <span class="font-mono text-[9px]">Travar Sequência</span>`;
          initIcons();
        }
      };
    }

    if (btnDestravar) {
      btnDestravar.onclick = async () => {
        const checkboxes = document.querySelectorAll('.chk-ponto-ordenador:checked') as NodeListOf<HTMLInputElement>;
        if (checkboxes.length === 0) {
          await customAlert("Selecione os pontos que deseja destravar.", "Destravar Sequência");
          return;
        }

        const pIds = Array.from(checkboxes).map(chk => parseInt(chk.getAttribute('data-ponto-id') || '0')).filter(id => id > 0);

        try {
          btnDestravar.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 animate-spin"></i> Destravando...`;
          initIcons();

          if (ctx.salvarEstadoHistorico) {
            ctx.salvarEstadoHistorico(`Destravar ${pIds.length} pontos`);
          }

          const payload = {
            pontos: pIds.map(pid => ({
              id: pid,
              sequencia_travada_id: null
            }))
          };

          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos/batch`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || errData.error || "Falha ao destravar pontos no servidor.");
          }

          showToast("Pontos destravados com sucesso!", "success");

          pIds.forEach(pid => {
            const pt = ctx.pontosList.find(p => p.id === pid);
            if (pt) pt.sequencia_travada_id = undefined;
          });

          ctx.renderListaReordenarSimplificada();
          ctx.atualizarPolilinhaMapaTemp();
          ctx.salvarRascunhoLocal();
        } catch (err: any) {
          console.error("Erro ao destravar pontos:", err);
          await customAlert(err.message || "Ocorreu um erro ao destravar os pontos.", "Erro ao Destravar");
        } finally {
          btnDestravar.innerHTML = `<i data-lucide="unlock" class="w-3.5 h-3.5 text-white/50"></i> <span class="font-mono text-[9px]">Destravar</span>`;
          initIcons();
        }
      };
    }

    const btnSobrepostos = document.getElementById('btn-unificar-sobrepostos');
    if (btnSobrepostos) {
      btnSobrepostos.onclick = () => {
        if (ctx.abrirModalUnificacaoSobrepostos) {
          ctx.abrirModalUnificacaoSobrepostos();
        }
      };
    }

    const inputSearch = document.getElementById('input-search-ordenador') as HTMLInputElement;
    const btnClearSearch = document.getElementById('btn-clear-search-ordenador');
    if (inputSearch) {
      inputSearch.oninput = () => {
        ctx.searchFilterOrdenadorValue = inputSearch.value.toLowerCase().trim();
        ctx.renderListaReordenarSimplificada();
      };
    }
    if (btnClearSearch && inputSearch) {
      btnClearSearch.onclick = () => {
        inputSearch.value = '';
        ctx.searchFilterOrdenadorValue = '';
        ctx.renderListaReordenarSimplificada();
      };
    }

    const btnInverter = document.getElementById('btn-inverter-sentido-ordenador');
    if (btnInverter) {
      btnInverter.onclick = () => {
        ctx.inverterOrdemPerimetral();
      };
    }

    const btnSugerir = document.getElementById('btn-auto-ordenar-vizinho') as HTMLButtonElement;
    if (btnSugerir) {
      btnSugerir.onclick = async () => {
        if (!ctx.currentLevId) return;
        const confirmou = await customConfirm(
          "Isso irá recalcular a sequência de todos os pontos ativos baseando-se na distância geográfica (Nearest Neighbor com desentrelaçamento 2-Opt). Deseja continuar?",
          "Sugerir Ordem Perimetral"
        );
        if (!confirmou) return;

        btnSugerir.disabled = true;
        const oldHtml = btnSugerir.innerHTML;
        btnSugerir.innerHTML = `<i data-lucide="refresh-cw" class="w-3.5 h-3.5 animate-spin"></i> Ordenando...`;
        initIcons();

        try {
          const url = ctx.currentMatriculaId
            ? `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/ordenar-vizinhos`
            : `${API_BASE}/levantamentos/${ctx.currentLevId}/ordenar-vizinhos`;

          const res = await fetch(url, { method: 'POST' });
          const data = await res.json();
          if (res.ok && data.sucesso) {
            const prefix = ctx.currentMatriculaId ? `mat_${ctx.currentMatriculaId}` : 'avulsos';
            localStorage.removeItem(`rascunho_ordem_lev_${ctx.currentLevId}_${prefix}`);

            await ctx.loadLevantamentoDetails();

            const msgBase = data.mensagem || "Ordenação calculada com sucesso!";
            if (data.tem_autointersecao && data.cruzamentos_detectados && data.cruzamentos_detectados.length > 0) {
              const detalhes = data.cruzamentos_detectados.slice(0, 5).map((c: any) => `• ${c.descricao || c.segmento_1 + ' cruza com ' + c.segmento_2}`).join('<br>');
              const extra = data.cruzamentos_detectados.length > 5 ? `<br>... e mais ${data.cruzamentos_detectados.length - 5} cruzamento(s).` : '';
              await customAlert(
                `<strong>${msgBase}</strong><br><br><span class="text-amber-400 font-bold">⚠️ ALERTA TOPOLÓGICO (SIGEF/INCRA):</span><br>Foram detectados cruzamentos residuais que não puderam ser desfeitos automaticamente devido a restrições de sequências travadas:<br><div class="mt-2 text-xs font-mono bg-black/30 p-2 rounded">${detalhes}${extra}</div><br><span class="text-xs text-white/60">Ajuste manualmente ou destrave as sequências conflitantes para eliminar os cruzamentos.</span>`,
                "Aviso Topológico"
              );
            } else {
              showToast(msgBase, "success");
            }
          } else {
            await customAlert(data.mensagem || data.error || "Erro ao sugerir ordenação geográfica.", "Erro de Ordenação");
          }
        } catch (err) {
          console.error("Erro na ordenação automática:", err);
          await customAlert("Erro de comunicação com o servidor.", "Erro de Conexão");
        } finally {
          btnSugerir.disabled = false;
          btnSugerir.innerHTML = oldHtml;
          initIcons();
        }
      };
    }

    const btnInicioNorte = document.getElementById('btn-definir-inicio-norte');
    if (btnInicioNorte) {
      btnInicioNorte.onclick = () => {
        ctx.definirInicioMaisAoNorte();
        showToast("Numeração rotacionada — vértice mais ao Norte agora é o nº 1.", "success");
      };
    }

    const btnCliqueSequencial = document.getElementById('btn-toggle-clique-sequencial');
    if (btnCliqueSequencial) {
      btnCliqueSequencial.onclick = () => {
        if (!ctx.currentLevId) return;

        ctx.modoCliqueSequencialAtivo = !ctx.modoCliqueSequencialAtivo;
        ctx.mapaController.modoCliqueSequencialAtivo = ctx.modoCliqueSequencialAtivo;

        const iconClique = document.getElementById('icon-clique-sequencial');
        const txtClique = document.getElementById('txt-clique-sequencial');

        if (ctx.modoCliqueSequencialAtivo) {
          btnCliqueSequencial.classList.replace('bg-white/5', 'bg-mint-vibrant/20');
          btnCliqueSequencial.classList.add('border-mint-vibrant/40');
          if (iconClique) {
            iconClique.setAttribute('data-lucide', 'pause');
            iconClique.classList.add('animate-pulse');
          }
          if (txtClique) txtClique.innerText = "Parar Clique";

          const pontosMat = ctx.obterPontosParaOrdenacao();
          ctx.sequenciaCliqueProximoIndice = pontosMat.length + 1;
        } else {
          btnCliqueSequencial.classList.replace('bg-mint-vibrant/20', 'bg-white/5');
          btnCliqueSequencial.classList.remove('border-mint-vibrant/40');
          if (iconClique) {
            iconClique.setAttribute('data-lucide', 'play');
            iconClique.classList.remove('animate-pulse');
          }
          if (txtClique) txtClique.innerText = "Caminhar Clique";
          ctx.sequenciaCliqueProximoIndice = null;
        }
        initIcons();
        ctx.atualizarPolilinhaMapaTemp();
      };
    }

    const btnSalvarOrdem = document.getElementById('btn-salvar-ordem-simplificada') as HTMLButtonElement;
    if (btnSalvarOrdem) {
      btnSalvarOrdem.onclick = async () => {
        if (!ctx.currentLevId) return;

        btnSalvarOrdem.disabled = true;
        const oldContent = btnSalvarOrdem.innerHTML;
        btnSalvarOrdem.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i> Salvando...`;
        initIcons();

        try {
          const todosPontos = ctx.obterPontosParaOrdenacao();
          const pontosMat = todosPontos.filter(p =>
            p &&
            p.ignorar_poligono !== 1 &&
            p.tipo_ponto !== 'B' &&
            p.tipo !== 'B' &&
            (!ctx.currentMatriculaId || String(p.matricula_id) === String(ctx.currentMatriculaId))
          );
          pontosMat.sort((a, b) => {
            const valA = a.ordem_caminhamento;
            const valB = b.ordem_caminhamento;
            const numA = Number(valA ?? 999999);
            const numB = Number(valB ?? 999999);
            return numA - numB;
          });

          const pontosOrdem = pontosMat.map((p, index) => ({
            id: p.id,
            ordem: index + 1
          }));

          const url = ctx.currentMatriculaId
            ? `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/salvar-ordem`
            : `${API_BASE}/levantamentos/${ctx.currentLevId}/salvar-ordem`;

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pontos_ordem: pontosOrdem })
          });

          const data = await res.json();
          if (res.ok && (data.sucesso || data.success)) {
            const prefix = ctx.currentMatriculaId ? `mat_${ctx.currentMatriculaId}` : 'avulsos';
            localStorage.removeItem(`rascunho_ordem_lev_${ctx.currentLevId}_${prefix}`);

            const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
            if (btnSalvar) {
              btnSalvar.classList.add('hidden');
              btnSalvar.classList.remove('animate-pulse');
            }

            await ctx.loadLevantamentoDetails();

            const msgBase = data.mensagem || `Ordem perimetral salva com sucesso!`;
            if (data.tem_autointersecao && data.cruzamentos_detectados && data.cruzamentos_detectados.length > 0) {
              const detalhes = data.cruzamentos_detectados.slice(0, 5).map((c: any) => `• ${c.descricao || c.segmento_1 + ' cruza com ' + c.segmento_2}`).join('<br>');
              const extra = data.cruzamentos_detectados.length > 5 ? `<br>... e mais ${data.cruzamentos_detectados.length - 5} cruzamento(s).` : '';
              await customAlert(
                `<strong>${msgBase}</strong><br><br><span class="text-amber-400 font-bold">⚠️ ALERTA TOPOLÓGICO (SIGEF/INCRA):</span><br>O perímetro salvo possui autointerseção (polígono borboleta):<br><div class="mt-2 text-xs font-mono bg-black/30 p-2 rounded">${detalhes}${extra}</div><br><span class="text-xs text-white/60">Recomenda-se ajustar a sequência dos vértices para evitar pendências no SIGEF.</span>`,
                "Aviso Topológico"
              );
            } else {
              showToast(msgBase, "success");
            }
          } else {
            await customAlert(data.mensagem || data.error || "Erro ao salvar ordenação no banco.", "Erro ao Salvar");
          }
        } catch (err) {
          console.error("Erro ao salvar ordem:", err);
          await customAlert("Erro de comunicação com o servidor API.", "Erro de Conexão");
        } finally {
          btnSalvarOrdem.disabled = false;
          btnSalvarOrdem.innerHTML = oldContent;
          initIcons();
        }
      };
    }
  };

  ctx.inicializarEventosCartorio = () => {
    inicializarEventosOrdenador();
  };
}
