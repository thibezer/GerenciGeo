import { API_BASE } from '../../../config';
import { initIcons } from '../../../utils';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function setupOrdenadorUI(ctx: MesaTrabalhoContext) {
  ctx.renderListaReordenarSimplificada = () => {
    try {
      const container = document.getElementById('lista-reordenar-simplificada');
      if (!container) return;

      const pontosMatCompleto = ctx.obterPontosParaOrdenacao();

      pontosMatCompleto.sort((a, b) => {
        const valA = a.ordem_caminhamento;
        const valB = b.ordem_caminhamento;
        const numA = typeof valA === 'number' ? valA : (parseInt(valA) || 999999);
        const numB = typeof valB === 'number' ? valB : (parseInt(valB) || 999999);
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

        return `
          <div class="flex items-center justify-between py-0.5 px-1.5 rounded text-[11px] font-mono transition-all duration-300 linha-ponto-ordenador ${cardBgClass}"
               id="ordenador-item-${p.id}"
               draggable="true"
               data-ponto-id="${p.id}"
               data-ordem="${ordemOriginal}"
               data-idx="${pontosFiltrados.indexOf(p)}"
               data-sequencia-travada="${seqId || ''}">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <input type="checkbox"
                     class="chk-ponto-ordenador rounded border-white/10 bg-white/5 text-mint-vibrant focus:ring-mint-vibrant/20 w-3 h-3 cursor-pointer shrink-0"
                     data-ponto-id="${p.id}"
                     data-idx="${pontosFiltrados.indexOf(p)}" />
              <div class="cursor-grab text-white/20 hover:text-mint-vibrant transition-colors active:cursor-grabbing shrink-0 px-1" title="Arrastar para reordenar">
                <i data-lucide="grip-vertical" class="w-3 h-3"></i>
              </div>
              <span class="text-[10px] text-white/40 min-w-[20px] text-center font-bold">${ordemOriginal}</span>
              <span class="font-bold truncate" title="${p.nome_vertice}">${p.nome_vertice}</span>
              <span class="text-[9px] text-white/30 shrink-0">(${tipoP})</span>
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

      let dragSrcEl: HTMLElement | null = null;

      elReordenar.addEventListener('dragstart', (e: DragEvent) => {
        const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement;
        if (target) {
          dragSrcEl = target;
          e.dataTransfer!.effectAllowed = 'move';
          e.dataTransfer!.setData('text/plain', target.getAttribute('data-ponto-id') || '');
          target.classList.add('opacity-40', 'border-dashed', 'border-mint-vibrant');
        }
      });

      elReordenar.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement;
        if (target && target !== dragSrcEl) {
          target.classList.add('bg-mint-vibrant/10', 'border-mint-vibrant/40');
        }
      });

      elReordenar.addEventListener('dragleave', (e: DragEvent) => {
        const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement;
        if (target) {
          target.classList.remove('bg-mint-vibrant/10', 'border-mint-vibrant/40');
        }
      });

      elReordenar.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        const target = (e.target as HTMLElement).closest('.linha-ponto-ordenador') as HTMLElement;
        const pontoIdArrastado = parseInt(e.dataTransfer!.getData('text/plain') || '0');

        if (target && pontoIdArrastado) {
          const novaOrdem = parseInt(target.getAttribute('data-ordem') || '1');
          ctx.moverPontoPosicao(pontoIdArrastado, novaOrdem);
        }
      });

      elReordenar.addEventListener('dragend', () => {
        const items = elReordenar.querySelectorAll('.linha-ponto-ordenador');
        items.forEach(item => {
          item.classList.remove('opacity-40', 'border-dashed', 'border-mint-vibrant', 'bg-mint-vibrant/10', 'border-mint-vibrant/40');
        });
      });
    }

    const btnTravar = document.getElementById('btn-travar-sequencia-pontos');
    const btnDestravar = document.getElementById('btn-destravar-sequencia-pontos');

    if (btnTravar) {
      btnTravar.onclick = async () => {
        const checkboxes = document.querySelectorAll('.chk-ponto-ordenador:checked') as NodeListOf<HTMLInputElement>;
        if (checkboxes.length < 2) {
          alert("Por favor, selecione pelo menos 2 pontos para travar uma sequência.");
          return;
        }

        const nomeSequencia = prompt("Digite um nome ou identificação para esta sequência travada (ex: rio, cerca_oeste):");
        if (!nomeSequencia || !nomeSequencia.trim()) return;

        const seqName = nomeSequencia.trim();
        const pIds = Array.from(checkboxes).map(chk => parseInt(chk.getAttribute('data-ponto-id') || '0')).filter(id => id > 0);

        try {
          btnTravar.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 animate-spin"></i> Gravando...`;
          initIcons();

          await Promise.all(pIds.map(async (pid) => {
            await fetch(`${API_BASE}/pontos/${pid}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sequencia_travada_id: seqName })
            });
          }));

          alert(`Sequência '${seqName}' travada com sucesso em ${pIds.length} pontos!`);

          pIds.forEach(pid => {
            const pt = ctx.pontosList.find(p => p.id === pid);
            if (pt) pt.sequencia_travada_id = seqName;
          });

          ctx.renderListaReordenarSimplificada();
          ctx.atualizarPolilinhaMapaTemp();
          ctx.salvarRascunhoLocal();
        } catch (err) {
          console.error("Erro ao travar pontos:", err);
          alert("Ocorreu um erro ao salvar o travamento dos pontos.");
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
          alert("Selecione os pontos que deseja destravar.");
          return;
        }

        const pIds = Array.from(checkboxes).map(chk => parseInt(chk.getAttribute('data-ponto-id') || '0')).filter(id => id > 0);

        try {
          btnDestravar.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 animate-spin"></i> Destravando...`;
          initIcons();

          await Promise.all(pIds.map(async (pid) => {
            await fetch(`${API_BASE}/pontos/${pid}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sequencia_travada_id: null })
            });
          }));

          alert("Pontos destravados com sucesso!");

          pIds.forEach(pid => {
            const pt = ctx.pontosList.find(p => p.id === pid);
            if (pt) pt.sequencia_travada_id = undefined;
          });

          ctx.renderListaReordenarSimplificada();
          ctx.atualizarPolilinhaMapaTemp();
          ctx.salvarRascunhoLocal();
        } catch (err) {
          console.error("Erro ao destravar pontos:", err);
          alert("Ocorreu um erro ao destravar os pontos.");
        } finally {
          btnDestravar.innerHTML = `<i data-lucide="unlock" class="w-3.5 h-3.5 text-white/50"></i> <span class="font-mono text-[9px]">Destravar</span>`;
          initIcons();
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
        if (!confirm("Isso irá recalcular a sequência de todos os pontos ativos baseando-se na distância geográfica (Nearest Neighbor). Deseja continuar?")) {
          return;
        }

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
            alert("Ordenação geográfica calculada e divisas atualizadas com sucesso!");

            const prefix = ctx.currentMatriculaId ? `mat_${ctx.currentMatriculaId}` : 'avulsos';
            localStorage.removeItem(`rascunho_ordem_lev_${ctx.currentLevId}_${prefix}`);

            await ctx.loadLevantamentoDetails();
          } else {
            alert(data.mensagem || data.error || "Erro ao sugerir ordenação geográfica.");
          }
        } catch (err) {
          console.error("Erro na ordenação automática:", err);
          alert("Erro de comunicação com o servidor.");
        } finally {
          btnSugerir.disabled = false;
          btnSugerir.innerHTML = oldHtml;
          initIcons();
        }
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
          const pontosMat = ctx.obterPontosParaOrdenacao();
          pontosMat.sort((a, b) => {
            const valA = a.ordem_caminhamento;
            const valB = b.ordem_caminhamento;
            const numA = typeof valA === 'number' ? valA : (parseInt(valA) || 999999);
            const numB = typeof valB === 'number' ? valB : (parseInt(valB) || 999999);
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
            alert(data.mensagem || `Ordem perimetral salva com sucesso!`);

            const prefix = ctx.currentMatriculaId ? `mat_${ctx.currentMatriculaId}` : 'avulsos';
            localStorage.removeItem(`rascunho_ordem_lev_${ctx.currentLevId}_${prefix}`);

            const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
            if (btnSalvar) {
              btnSalvar.classList.add('hidden');
              btnSalvar.classList.remove('animate-pulse');
            }

            await ctx.loadLevantamentoDetails();
          } else {
            alert(data.mensagem || data.error || "Erro ao salvar ordenação no banco.");
          }
        } catch (err) {
          console.error("Erro ao salvar ordem:", err);
          alert("Erro de comunicação com o servidor API.");
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
