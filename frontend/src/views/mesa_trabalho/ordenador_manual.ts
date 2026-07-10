import { API_BASE } from '../../config';
import { initIcons } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

export function setupOrdenadorManual(ctx: MesaTrabalhoContext) {
  // Função auxiliar para obter a lista de pontos que estão sendo ordenados
  ctx.obterPontosParaOrdenacao = () => {
    const todosPontos = ctx.pontosList || [];
    
    // Ignora bases (tipo B)
    const filtrarBases = (p: any) => p && p.tipo_ponto !== 'B' && p.tipo !== 'B';
    
    let pontosFiltrados: any[] = [];
    if (ctx.currentMatriculaId) {
      pontosFiltrados = todosPontos.filter(
        p => p && p.matricula_id === ctx.currentMatriculaId && filtrarBases(p)
      );
      
      // FALLBACK: Se a matrícula ativa não possuir nenhum ponto, mostra os avulsos (sem matrícula)
      if (pontosFiltrados.length === 0) {
        pontosFiltrados = todosPontos.filter(
          p => p && (p.matricula_id === null || p.matricula_id === undefined) && filtrarBases(p)
        );
      }
    } else {
      pontosFiltrados = todosPontos.filter(
        p => p && (p.matricula_id === null || p.matricula_id === undefined) && filtrarBases(p)
      );
    }

    if (ctx.arquivosDesativadosList && ctx.arquivosDesativadosList.length > 0) {
      pontosFiltrados = pontosFiltrados.filter(p => p && !ctx.arquivosDesativadosList!.includes(p.arquivo_origem));
    }

    // Deduplica por (nome_vertice, tipo_ponto)
    // Prioriza status_ponto === 'CORRIGIDO' e maior id
    const dedupMap = new Map<string, any>();
    pontosFiltrados.forEach((p) => {
      if (!p) return;
      const key = `${p.nome_vertice || ''}_${p.tipo_ponto || p.tipo || ''}`;
      if (!dedupMap.has(key)) {
        dedupMap.set(key, p);
      } else {
        const existente = dedupMap.get(key);
        const novoStatus = p.status_ponto || p.status || '';
        const exStatus = existente.status_ponto || existente.status || '';
        
        if (novoStatus === 'CORRIGIDO' && exStatus !== 'CORRIGIDO') {
          dedupMap.set(key, p);
        } else if (novoStatus === exStatus && p.id > existente.id) {
          dedupMap.set(key, p);
        }
      }
    });

    return Array.from(dedupMap.values());
  };

  // 1. Métodos de ordenação no contexto
  ctx.subirPonto = (pontoId: number) => {
    const pontosMat = ctx.obterPontosParaOrdenacao();
    pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

    const idx = pontosMat.findIndex(p => p.id === pontoId);
    if (idx === -1) return;

    const pontoClicado = pontosMat[idx];
    const seqIdClicado = pontoClicado.sequencia_travada_id;

    // Determina o bloco que será movido para cima (ponto único ou bloco travado inteiro)
    let blocoParaMover: any[];
    let primeiroIdxBloco: number;

    if (seqIdClicado) {
      blocoParaMover = pontosMat.filter(p => p.sequencia_travada_id === seqIdClicado);
      primeiroIdxBloco = pontosMat.findIndex(p => p.sequencia_travada_id === seqIdClicado);
    } else {
      blocoParaMover = [pontoClicado];
      primeiroIdxBloco = idx;
    }

    if (primeiroIdxBloco <= 0) return; // Já está no topo

    // O ponto imediatamente acima do bloco
    const pontoAcima = pontosMat[primeiroIdxBloco - 1];
    const seqIdAcima = pontoAcima.sequencia_travada_id;

    // Determina o bloco acima (pode ser outro bloco travado)
    let blocoAcima: any[];
    let primeiroIdxBlocoAcima: number;

    if (seqIdAcima) {
      blocoAcima = pontosMat.filter(p => p.sequencia_travada_id === seqIdAcima);
      primeiroIdxBlocoAcima = pontosMat.findIndex(p => p.sequencia_travada_id === seqIdAcima);
    } else {
      blocoAcima = [pontoAcima];
      primeiroIdxBlocoAcima = primeiroIdxBloco - 1;
    }

    // Remove ambos os blocos e reinsere: blocoParaMover primeiro, depois blocoAcima
    const pontosRestantes = pontosMat.filter(p =>
      !blocoParaMover.includes(p) && !blocoAcima.includes(p)
    );
    pontosRestantes.splice(primeiroIdxBlocoAcima, 0, ...blocoParaMover, ...blocoAcima);

    // Normaliza ordens de 1 a N
    pontosRestantes.forEach((p, index) => {
      p.ordem_caminhamento = index + 1;
    });

    const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
    if (btnSalvar) {
      btnSalvar.classList.remove('hidden');
      btnSalvar.classList.add('animate-pulse');
    }

    ctx.renderListaReordenarSimplificada();
    ctx.atualizarPolilinhaMapaTemp();
    ctx.salvarRascunhoLocal();
  };

  ctx.descerPonto = (pontoId: number) => {
    const pontosMat = ctx.obterPontosParaOrdenacao();
    pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

    const idx = pontosMat.findIndex(p => p.id === pontoId);
    if (idx === -1) return;

    const pontoClicado = pontosMat[idx];
    const seqIdClicado = pontoClicado.sequencia_travada_id;

    // Determina o bloco que será movido para baixo (ponto único ou bloco travado inteiro)
    let blocoParaMover: any[];
    let primeiroIdxBloco: number;
    let ultimoIdxBloco: number;

    if (seqIdClicado) {
      blocoParaMover = pontosMat.filter(p => p.sequencia_travada_id === seqIdClicado);
      primeiroIdxBloco = pontosMat.findIndex(p => p.sequencia_travada_id === seqIdClicado);
      // Último índice do bloco
      ultimoIdxBloco = pontosMat.reduce((lastIdx, p, i) =>
        p.sequencia_travada_id === seqIdClicado ? i : lastIdx, -1
      );
    } else {
      blocoParaMover = [pontoClicado];
      primeiroIdxBloco = idx;
      ultimoIdxBloco = idx;
    }

    if (ultimoIdxBloco >= pontosMat.length - 1) return; // Já está no fim

    // O ponto imediatamente abaixo do bloco
    const pontoAbaixo = pontosMat[ultimoIdxBloco + 1];
    const seqIdAbaixo = pontoAbaixo.sequencia_travada_id;

    // Determina o bloco abaixo (pode ser outro bloco travado)
    let blocoAbaixo: any[];

    if (seqIdAbaixo) {
      blocoAbaixo = pontosMat.filter(p => p.sequencia_travada_id === seqIdAbaixo);
    } else {
      blocoAbaixo = [pontoAbaixo];
    }

    // Remove ambos os blocos e reinsere: blocoAbaixo primeiro, depois blocoParaMover
    const pontosRestantes = pontosMat.filter(p =>
      !blocoParaMover.includes(p) && !blocoAbaixo.includes(p)
    );
    pontosRestantes.splice(primeiroIdxBloco, 0, ...blocoAbaixo, ...blocoParaMover);

    // Normaliza ordens de 1 a N
    pontosRestantes.forEach((p, index) => {
      p.ordem_caminhamento = index + 1;
    });

    const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
    if (btnSalvar) {
      btnSalvar.classList.remove('hidden');
      btnSalvar.classList.add('animate-pulse');
    }

    ctx.renderListaReordenarSimplificada();
    ctx.atualizarPolilinhaMapaTemp();
    ctx.salvarRascunhoLocal();
  };

  ctx.moverPontoPosicao = (pontoId: number, novaPosicao: number) => {
    const pontosMat = ctx.obterPontosParaOrdenacao();
    pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

    const oldIdx = pontosMat.findIndex(p => p.id === pontoId);
    if (oldIdx === -1) return;

    const pontoQueMoveu = pontosMat[oldIdx];
    const seqIdMoveu = pontoQueMoveu.sequencia_travada_id;
    
    let pontosParaMover: any[];
    if (seqIdMoveu) {
      // Move o bloco inteiro da sequência travada
      pontosParaMover = pontosMat.filter(p => p.sequencia_travada_id === seqIdMoveu);
    } else {
      pontosParaMover = [pontoQueMoveu];
    }
    
    // Remove temporariamente os pontos que serão movidos
    const pontosRestantes = pontosMat.filter(p => !pontosParaMover.includes(p));
    
    let targetIdx = novaPosicao - 1;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx > pontosRestantes.length) targetIdx = pontosRestantes.length;

    // INVARIANTE: Proíbe inserção no meio de um bloco travado de destino.
    // Se o targetIdx cair entre dois pontos do mesmo seqId (diferente do seqId movido),
    // redireciona para antes ou depois do bloco inteiro.
    if (targetIdx > 0 && targetIdx < pontosRestantes.length) {
      const pontoAntes = pontosRestantes[targetIdx - 1];
      const pontoDepois = pontosRestantes[targetIdx];

      if (
        pontoAntes.sequencia_travada_id &&
        pontoDepois.sequencia_travada_id &&
        pontoAntes.sequencia_travada_id === pontoDepois.sequencia_travada_id &&
        pontoAntes.sequencia_travada_id !== seqIdMoveu
      ) {
        const seqIdDestino = pontoDepois.sequencia_travada_id;
        // Movendo de cima para baixo → vai APÓS o bloco de destino
        if (oldIdx < targetIdx) {
          while (
            targetIdx < pontosRestantes.length &&
            pontosRestantes[targetIdx].sequencia_travada_id === seqIdDestino
          ) {
            targetIdx++;
          }
        } else {
          // Movendo de baixo para cima → vai ANTES do bloco de destino
          while (
            targetIdx > 0 &&
            pontosRestantes[targetIdx - 1].sequencia_travada_id === seqIdDestino
          ) {
            targetIdx--;
          }
        }
      }
    }
    
    // Insere os pontos movidos consecutivamente no targetIdx
    pontosRestantes.splice(targetIdx, 0, ...pontosParaMover);
    
    // Normaliza de 1 a N
    pontosRestantes.forEach((p, index) => {
      p.ordem_caminhamento = index + 1;
    });

    const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
    if (btnSalvar) {
      btnSalvar.classList.remove('hidden');
      btnSalvar.classList.add('animate-pulse');
    }

    ctx.renderListaReordenarSimplificada();
    ctx.atualizarPolilinhaMapaTemp();
    ctx.salvarRascunhoLocal();
  };

  ctx.inverterOrdemPerimetral = () => {
    const pontosMat = ctx.obterPontosParaOrdenacao();
    if (pontosMat.length < 2) return;

    pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
    const total = pontosMat.length;
    
    // Inverte a ordem de caminhamento
    pontosMat.forEach((p, idx) => {
      p.ordem_caminhamento = total - idx;
    });

    const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
    if (btnSalvar) {
      btnSalvar.classList.remove('hidden');
      btnSalvar.classList.add('animate-pulse');
    }

    ctx.renderListaReordenarSimplificada();
    ctx.atualizarPolilinhaMapaTemp();
    ctx.salvarRascunhoLocal();
  };

  ctx.lidarCliqueMarcadorSequencial = (pontoId: number) => {
    const pontosMat = ctx.obterPontosParaOrdenacao();
    const maxOrdem = pontosMat.length;
    
    if (ctx.sequenciaCliqueProximoIndice === null || ctx.sequenciaCliqueProximoIndice > maxOrdem) {
      ctx.sequenciaCliqueProximoIndice = 1;
    }

    ctx.moverPontoPosicao(pontoId, ctx.sequenciaCliqueProximoIndice);
    ctx.sequenciaCliqueProximoIndice++;
  };

  ctx.salvarRascunhoLocal = () => {
    if (!ctx.currentLevId) return;
    const pontosMat = ctx.obterPontosParaOrdenacao();
    pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

    const prefix = ctx.currentMatriculaId ? `mat_${ctx.currentMatriculaId}` : 'avulsos';
    const draft = pontosMat.map(p => ({
      id: p.id,
      ordem: p.ordem_caminhamento
    }));

    localStorage.setItem(`rascunho_ordem_lev_${ctx.currentLevId}_${prefix}`, JSON.stringify(draft));
  };

  ctx.verificarRascunhoLocal = () => {
    if (!ctx.currentLevId) return;
    const prefix = ctx.currentMatriculaId ? `mat_${ctx.currentMatriculaId}` : 'avulsos';
    const key = `rascunho_ordem_lev_${ctx.currentLevId}_${prefix}`;
    const draftStr = localStorage.getItem(key);
    
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        if (draft && draft.length > 0) {
          const confirmar = confirm("Detectamos um rascunho de ordenação manual não salvo anteriormente. Deseja restaurar esse progresso?");
          if (confirmar) {
            draft.forEach((d: any) => {
              const pt = ctx.pontosList.find(p => p.id === d.id);
              if (pt) {
                pt.ordem_caminhamento = d.ordem;
              }
            });
            ctx.renderListaReordenarSimplificada();
            ctx.atualizarPolilinhaMapaTemp();
          } else {
            localStorage.removeItem(key);
          }
        }
      } catch (err) {
        localStorage.removeItem(key);
      }
    }
  };

  // 2. Renderização da Lista Lateral
  ctx.renderListaReordenarSimplificada = () => {
    try {
      const container = document.getElementById('lista-reordenar-simplificada');
      if (!container) return;

      const pontosMatCompleto = ctx.obterPontosParaOrdenacao();
      
      // Ordena os pontos pelo caminhamento atual
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

      // Filtra pelo input de busca textual do usuário, se houver
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

      // Renderiza a lista de cards com atributos HTML5 de arrastar (Drag & Drop)
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
            <div class="flex items-center gap-1 min-w-0 flex-1">
              <input type="checkbox" 
                     class="chk-ponto-ordenador rounded border-white/10 bg-white/5 text-mint-vibrant focus:ring-mint-vibrant/20 w-3 h-3 cursor-pointer shrink-0" 
                     data-ponto-id="${p.id}"
                     data-idx="${pontosFiltrados.indexOf(p)}" />
              <div class="cursor-grab text-white/20 hover:text-mint-vibrant transition-colors active:cursor-grabbing shrink-0" title="Arrastar para reordenar">
                <i data-lucide="grip-vertical" class="w-3 h-3"></i>
              </div>
              <input type="number" 
                     class="input-ordem-direta text-center text-[9px] bg-mint-vibrant/10 text-mint-vibrant font-bold border border-mint-vibrant/25 rounded w-8 h-4 focus:outline-none focus:border-mint-vibrant focus:ring-1 focus:ring-mint-vibrant/30 py-0 px-0.5 font-mono transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                     min="1" 
                     max="${totalPontos}" 
                     value="${ordemOriginal}" 
                     data-ponto-id="${p.id}"
                     data-old-ordem="${ordemOriginal}" />
              <span class="font-bold truncate" title="${p.nome_vertice}">${p.nome_vertice}</span>
              <span class="text-[9px] text-white/30 shrink-0">(${tipoP})</span>
              ${lockIconHtml}
            </div>
            <div class="flex items-center gap-0.5 shrink-0">
              <button class="btn-subir-simplificado p-0.5 hover:bg-white/10 text-white/40 hover:text-white rounded transition-colors" 
                      data-ponto-id="${p.id}" 
                      title="Subir posição" 
                      type="button">
                <i data-lucide="chevron-up" class="w-3.5 h-3.5"></i>
              </button>
              <button class="btn-descer-simplificado p-0.5 hover:bg-white/10 text-white/40 hover:text-white rounded transition-colors" 
                      data-ponto-id="${p.id}" 
                      title="Descer posição" 
                      type="button">
                <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
              </button>
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

  // 3. Inicialização dos eventos locais (DOM)
  const inicializarEventosOrdenador = () => {
    const containerReordenar = document.getElementById('lista-reordenar-simplificada');
    if (containerReordenar) {
      // Clona o container para limpar listeners acumulados
      const novoContainer = containerReordenar.cloneNode(true);
      containerReordenar.parentNode?.replaceChild(novoContainer, containerReordenar);

      const elReordenar = document.getElementById('lista-reordenar-simplificada')!;

      // Controle de seleção múltipla por Shift+Click
      let lastCheckedIdx: number | null = null;

      // Click handler para botões de subir/descer e Shift+Click nos checkboxes
      elReordenar.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const btnSubir = target.closest('.btn-subir-simplificado');
        const btnDescer = target.closest('.btn-descer-simplificado');
        const chk = target.closest('.chk-ponto-ordenador') as HTMLInputElement | null;

        if (btnSubir) {
          e.stopPropagation();
          const pId = parseInt(btnSubir.getAttribute('data-ponto-id') || '0');
          if (pId) ctx.subirPonto(pId);
          return;
        }

        if (btnDescer) {
          e.stopPropagation();
          const pId = parseInt(btnDescer.getAttribute('data-ponto-id') || '0');
          if (pId) ctx.descerPonto(pId);
          return;
        }

        if (chk) {
          const currentIdx = parseInt(chk.getAttribute('data-idx') || '-1');
          const isChecked = chk.checked; // estado APÓS o clique nativo

          if ((e as MouseEvent).shiftKey && lastCheckedIdx !== null && currentIdx !== -1) {
            // Seleciona o intervalo entre lastCheckedIdx e currentIdx
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

      // Change handler para input de posição direta
      elReordenar.addEventListener('change', (e) => {
        const target = e.target as HTMLElement;
        const inp = target.closest('.input-ordem-direta') as HTMLInputElement;
        if (inp) {
          const pId = parseInt(inp.getAttribute('data-ponto-id') || '0');
          const oldVal = parseInt(inp.getAttribute('data-old-ordem') || '1');
          const newVal = parseInt(inp.value || '0');
          const pontosMat = ctx.obterPontosParaOrdenacao();

          if (isNaN(newVal) || newVal < 1 || newVal > pontosMat.length) {
            inp.value = oldVal.toString();
            return;
          }
          if (newVal !== oldVal) {
            ctx.moverPontoPosicao(pId, newVal);
          }
        }
      });

      elReordenar.addEventListener('keydown', (e) => {
        const target = e.target as HTMLElement;
        const inp = target.closest('.input-ordem-direta') as HTMLInputElement;
        if (inp && e.key === 'Enter') {
          e.preventDefault();
          inp.blur();
        }
      });

      // API Drag & Drop HTML5 nativa
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

      elReordenar.addEventListener('dragleave', () => {
        const target = (window.event?.target as HTMLElement)?.closest('.linha-ponto-ordenador') as HTMLElement;
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

    // Ações de Travamento de Bloco
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
          
          // Atualiza a lista local no contexto
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

    // Buscador textual lateral
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

    // Ações globais (Botões de Inverter Sentido e Sugerir Ordem)
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

    // Toggle modo clique sequencial no mapa
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

    // Botão Salvar Ordem Definitiva no SQLite (Protocolo V.L.A.E.G.)
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

  // Inicializa os eventos e carrega rascunhos se houver
  inicializarEventosOrdenador();

  ctx.inicializarEventosCartorio = () => {
    inicializarEventosOrdenador();
  };
}
