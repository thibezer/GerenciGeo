import { API_BASE } from '../../../config';
import { initIcons, customAlert, customConfirm, customPrompt, showToast } from '../../../utils';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function configurarAcoesOrdenador(ctx: MesaTrabalhoContext): void {
  // Travar Sequência Contígua
  const btnTravar = document.getElementById('btn-travar-sequencia-pontos') as HTMLButtonElement | null;
  if (btnTravar) {
    btnTravar.onclick = async () => {
      const checkboxes = document.querySelectorAll('.chk-ponto-ordenador:checked') as NodeListOf<HTMLInputElement>;
      const pIds = Array.from(checkboxes).map(chk => parseInt(chk.getAttribute('data-ponto-id') || '0', 10)).filter(id => id > 0);
      if (pIds.length < 2) {
        await customAlert('Por favor, selecione pelo menos 2 pontos para travar uma sequência.', 'Travar Sequência');
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
        .map(pid => pontosMatValidos.findIndex(p => String(p.id) === String(pid)))
        .filter(idx => idx !== -1)
        .sort((a, b) => a - b);

      if (indices.length < 2) {
        await customAlert('Por favor, selecione pelo menos 2 pontos válidos do perímetro para travar uma sequência.', 'Travar Sequência');
        return;
      }

      const saoContiguos = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
      if (!saoContiguos) {
        await customAlert('Os pontos selecionados precisam ser consecutivos na ordem de caminhamento para formar uma sequência travada. Reordene-os primeiro ou utilize Shift+Clique para selecionar uma faixa contínua.', 'Sequência Não Contígua');
        return;
      }

      const nomeSequencia = await customPrompt('Digite um nome ou identificação para esta sequência travada:', '', 'Travar Sequência', 'ex: rio, cerca_oeste');
      if (!nomeSequencia || !nomeSequencia.trim()) return;

      const seqName = nomeSequencia.trim();

      const colidiu = ctx.pontosList.some(
        p => p && p.sequencia_travada_id &&
          String(p.sequencia_travada_id).toLowerCase().trim() === seqName.toLowerCase() &&
          !pIds.includes(p.id)
      );
      if (colidiu) {
        await customAlert(`Já existe outra sequência travada com o nome "${seqName}". Escolha um nome exclusivo para evitar fusões acidentais de grupos.`, 'Nome Duplicado');
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
          throw new Error(errData.detail || errData.error || 'Falha ao salvar sequência travada no servidor.');
        }

        showToast(`Sequência '${seqName}' travada com sucesso!`, 'success');

        pIds.forEach(pid => {
          const pt = ctx.pontosList.find(p => String(p.id) === String(pid));
          if (pt) pt.sequencia_travada_id = seqName;
        });

        ctx.renderListaReordenarSimplificada();
        ctx.atualizarPolilinhaMapaTemp();
        ctx.salvarRascunhoLocal();
      } catch (err: any) {
        console.error('Erro ao travar pontos:', err);
        await customAlert(err.message || 'Ocorreu um erro ao salvar o travamento dos pontos.', 'Erro ao Travar');
      } finally {
        btnTravar.innerHTML = `<i data-lucide="lock" class="w-3.5 h-3.5 text-amber-400"></i> <span class="font-mono text-[9px]">Travar Sequência</span>`;
        initIcons();
      }
    };
  }

  // Destravar Sequência
  const btnDestravar = document.getElementById('btn-destravar-sequencia-pontos') as HTMLButtonElement | null;
  if (btnDestravar) {
    btnDestravar.onclick = async () => {
      const checkboxes = document.querySelectorAll('.chk-ponto-ordenador:checked') as NodeListOf<HTMLInputElement>;
      if (checkboxes.length === 0) {
        await customAlert('Selecione os pontos que deseja destravar.', 'Destravar Sequência');
        return;
      }

      const pIds = Array.from(checkboxes).map(chk => parseInt(chk.getAttribute('data-ponto-id') || '0', 10)).filter(id => id > 0);

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
          throw new Error(errData.detail || errData.error || 'Falha ao destravar pontos no servidor.');
        }

        showToast('Pontos destravados com sucesso!', 'success');

        pIds.forEach(pid => {
          const pt = ctx.pontosList.find(p => String(p.id) === String(pid));
          if (pt) pt.sequencia_travada_id = undefined;
        });

        ctx.renderListaReordenarSimplificada();
        ctx.atualizarPolilinhaMapaTemp();
        ctx.salvarRascunhoLocal();
      } catch (err: any) {
        console.error('Erro ao destravar pontos:', err);
        await customAlert(err.message || 'Ocorreu um erro ao destravar os pontos.', 'Erro ao Destravar');
      } finally {
        btnDestravar.innerHTML = `<i data-lucide="unlock" class="w-3.5 h-3.5 text-white/50"></i> <span class="font-mono text-[9px]">Destravar</span>`;
        initIcons();
      }
    };
  }

  // Unificar Sobrepostos
  const btnSobrepostos = document.getElementById('btn-unificar-sobrepostos');
  if (btnSobrepostos) {
    btnSobrepostos.onclick = () => {
      if (ctx.abrirModalUnificacaoSobrepostos) {
        ctx.abrirModalUnificacaoSobrepostos();
      }
    };
  }

  // Busca de Vértices
  const inputSearch = document.getElementById('input-search-ordenador') as HTMLInputElement | null;
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

  // Inverter Sentido Perimetral
  const btnInverter = document.getElementById('btn-inverter-sentido-ordenador');
  if (btnInverter) {
    btnInverter.onclick = () => {
      ctx.inverterOrdemPerimetral();
    };
  }

  // Sugerir Ordem Geográfica (Nearest Neighbor + 2-Opt)
  const btnSugerir = document.getElementById('btn-auto-ordenar-vizinho') as HTMLButtonElement | null;
  if (btnSugerir) {
    btnSugerir.onclick = async () => {
      if (!ctx.currentLevId) return;
      const confirmou = await customConfirm(
        'Isso irá recalcular a sequência de todos os pontos ativos baseando-se na distância geográfica (Nearest Neighbor com desentrelaçamento 2-Opt). Deseja continuar?',
        'Sugerir Ordem Perimetral'
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

          const msgBase = data.mensagem || 'Ordenação calculada com sucesso!';
          if (data.tem_autointersecao && data.cruzamentos_detectados && data.cruzamentos_detectados.length > 0) {
            const detalhes = data.cruzamentos_detectados.slice(0, 5).map((c: any) => `• ${c.descricao || c.segmento_1 + ' cruza com ' + c.segmento_2}`).join('<br>');
            const extra = data.cruzamentos_detectados.length > 5 ? `<br>... e mais ${data.cruzamentos_detectados.length - 5} cruzamento(s).` : '';
            await customAlert(
              `<strong>${msgBase}</strong><br><br><span class="text-amber-400 font-bold">⚠️ ALERTA TOPOLÓGICO (SIGEF/INCRA):</span><br>Foram detectados cruzamentos residuais que não puderam ser desfeitos automaticamente devido a restrições de sequências travadas:<br><div class="mt-2 text-xs font-mono bg-black/30 p-2 rounded">${detalhes}${extra}</div><br><span class="text-xs text-white/60">Ajuste manualmente ou destrave as sequências conflitantes para eliminar os cruzamentos.</span>`,
              'Aviso Topológico'
            );
          } else {
            showToast(msgBase, 'success');
          }
        } else {
          await customAlert(data.mensagem || data.error || 'Erro ao sugerir ordenação geográfica.', 'Erro de Ordenação');
        }
      } catch (err) {
        console.error('Erro na ordenação automática:', err);
        await customAlert('Erro de comunicação com o servidor.', 'Erro de Conexão');
      } finally {
        btnSugerir.disabled = false;
        btnSugerir.innerHTML = oldHtml;
        initIcons();
      }
    };
  }

  // Definir Início Mais ao Norte
  const btnInicioNorte = document.getElementById('btn-definir-inicio-norte');
  if (btnInicioNorte) {
    btnInicioNorte.onclick = () => {
      ctx.definirInicioMaisAoNorte();
      showToast('Numeração rotacionada — vértice mais ao Norte agora é o nº 1.', 'success');
    };
  }

  // Caminhar Clique Sequencial
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
        if (txtClique) txtClique.innerText = 'Parar Clique';

        const pontosMat = ctx.obterPontosParaOrdenacao();
        ctx.sequenciaCliqueProximoIndice = pontosMat.length + 1;
      } else {
        btnCliqueSequencial.classList.replace('bg-mint-vibrant/20', 'bg-white/5');
        btnCliqueSequencial.classList.remove('border-mint-vibrant/40');
        if (iconClique) {
          iconClique.setAttribute('data-lucide', 'play');
          iconClique.classList.remove('animate-pulse');
        }
        if (txtClique) txtClique.innerText = 'Caminhar Clique';
        ctx.sequenciaCliqueProximoIndice = null;
      }
      initIcons();
      ctx.atualizarPolilinhaMapaTemp();
    };
  }

  // Salvar Ordem Simplificada no Backend com Reconstrução Perimetral
  const btnSalvarOrdem = document.getElementById('btn-salvar-ordem-simplificada') as HTMLButtonElement | null;
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

          const msgBase = data.mensagem || 'Ordem perimetral salva com sucesso!';
          if (data.tem_autointersecao && data.cruzamentos_detectados && data.cruzamentos_detectados.length > 0) {
            const detalhes = data.cruzamentos_detectados.slice(0, 5).map((c: any) => `• ${c.descricao || c.segmento_1 + ' cruza com ' + c.segmento_2}`).join('<br>');
            const extra = data.cruzamentos_detectados.length > 5 ? `<br>... e mais ${data.cruzamentos_detectados.length - 5} cruzamento(s).` : '';
            await customAlert(
              `<strong>${msgBase}</strong><br><br><span class="text-amber-400 font-bold">⚠️ ALERTA TOPOLÓGICO (SIGEF/INCRA):</span><br>O perímetro salvo possui autointerseção (polígono borboleta):<br><div class="mt-2 text-xs font-mono bg-black/30 p-2 rounded">${detalhes}${extra}</div><br><span class="text-xs text-white/60">Recomenda-se ajustar a sequência dos vértices para evitar pendências no SIGEF.</span>`,
              'Aviso Topológico'
            );
          } else {
            showToast(msgBase, 'success');
          }
        } else {
          await customAlert(data.mensagem || data.error || 'Erro ao salvar ordenação no banco.', 'Erro ao Salvar');
        }
      } catch (err) {
        console.error('Erro ao salvar ordem:', err);
        await customAlert('Erro de comunicação com o servidor API.', 'Erro de Conexão');
      } finally {
        btnSalvarOrdem.disabled = false;
        btnSalvarOrdem.innerHTML = oldContent;
        initIcons();
      }
    };
  }
}
