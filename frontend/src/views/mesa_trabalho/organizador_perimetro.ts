import { API_BASE } from '../../config';
import { initIcons } from '../../utils';
import { renderLinhaPontoCartorioHtml, renderLinhaSegmentoHtml } from '../mesa_trabalho_tabela';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import { latLonToUTM } from './mesa_geodesica';

export const renderTabelaOrganizadorPerimetro = (ctx: MesaTrabalhoContext) => {
  if (!ctx.currentMatriculaId) return;

  const isIgnoradoOuBase = (p: any) => p.ignorar_poligono === 1 || p.tipo_ponto === 'B' || p.tipo === 'B';

  let pontosMat = ctx.pontosList.filter(
    p => p.matricula_id === ctx.currentMatriculaId && p.tipo_ponto !== 'B' && p.tipo !== 'B'
  );

  // Calcula o mapa de ordem real estável de caminhamento antes de qualquer filtro
  const pontosOrdenadosOriginal = [...pontosMat].sort((a, b) => {
    const isIgnA = isIgnoradoOuBase(a) ? 1 : 0;
    const isIgnB = isIgnoradoOuBase(b) ? 1 : 0;
    if (isIgnA !== isIgnB) return isIgnB - isIgnA;
    if (isIgnA === 1) return a.nome_vertice.localeCompare(b.nome_vertice);
    const valA = a.ordem_caminhamento;
    const valB = b.ordem_caminhamento;
    const numA = typeof valA === 'number' ? valA : (parseInt(valA) || 999999);
    const numB = typeof valB === 'number' ? valB : (parseInt(valB) || 999999);
    return numA - numB;
  });

  let seqReal = 1;
  const mapaOrdemReal = new Map<number, string | number>();
  pontosOrdenadosOriginal.forEach((p) => {
    const isIgn = isIgnoradoOuBase(p);
    mapaOrdemReal.set(p.id, isIgn ? '-' : seqReal++);
  });

  // Calcula as contagens dinâmicas de filtros rápidos antes de aplicar o filtro ativo
  const totalTodos = pontosMat.length;
  const totalBases = pontosMat.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B').length;
  const totalRovers = pontosMat.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B').length;
  const totalBrutos = pontosMat.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO').length;
  const totalCorrigidos = pontosMat.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO').length;

  const btnTodos = document.querySelector('.btn-filtro-rapido[data-filtro="todos"]');
  if (btnTodos) btnTodos.textContent = `Todos (${totalTodos})`;
  // Mantemos atualização para compatibilidade das classes se houver
  const btnBasesEl = document.querySelector('.btn-filtro-rapido[data-filtro="bases"]');
  if (btnBasesEl) btnBasesEl.textContent = `Bases (M/B) (${totalBases})`;
  const btnRoversEl = document.querySelector('.btn-filtro-rapido[data-filtro="rovers"]');
  if (btnRoversEl) btnRoversEl.textContent = `Rovers (P/V) (${totalRovers})`;
  const btnBrutosEl = document.querySelector('.btn-filtro-rapido[data-filtro="brutos"]');
  if (btnBrutosEl) btnBrutosEl.textContent = `Brutos (${totalBrutos})`;
  const btnCorrigidosEl = document.querySelector('.btn-filtro-rapido[data-filtro="corrigidos"]');
  if (btnCorrigidosEl) btnCorrigidosEl.textContent = `Corrigidos (${totalCorrigidos})`;

  if (ctx.ocultarForaPoligono) {
    pontosMat = pontosMat.filter(p => p.ignorar_poligono !== 1);
  }

  if (ctx.filtroRapidoAtivo !== 'todos') {
    if (ctx.filtroRapidoAtivo === 'bases') {
      pontosMat = pontosMat.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B');
    } else if (ctx.filtroRapidoAtivo === 'rovers') {
      pontosMat = pontosMat.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    } else if (ctx.filtroRapidoAtivo === 'brutos') {
      pontosMat = pontosMat.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO');
    } else if (ctx.filtroRapidoAtivo === 'corrigidos') {
      pontosMat = pontosMat.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO');
    }
  }

  if (ctx.searchFilterValue) {
    pontosMat = pontosMat.filter(p =>
      (p.nome_vertice && p.nome_vertice.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.tipo && p.tipo.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.arquivo_origem && p.arquivo_origem.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.ordem_caminhamento && String(p.ordem_caminhamento).includes(ctx.searchFilterValue))
    );
  }

  const segmentosMat = ctx.segmentosList.filter(s => s.matricula_id === ctx.currentMatriculaId);

  const containerTabelaDivisas = document.getElementById('container-tabela-divisas');
  const splitterInf = document.getElementById('splitter-inferior');
  if (containerTabelaDivisas) containerTabelaDivisas.classList.remove('hidden');
  if (splitterInf) splitterInf.classList.remove('hidden');

  if (ctx.triagemMap) {
    const bpAtivo = ctx.bancoPontosExibido && ctx.bancoPontosList.length > 0;
    ctx.mapaController.clearOverlays(bpAtivo);
    ctx.mapaController.plotPontos(pontosMat, (pId: number) => {
      ctx.selectPontoFromTabela(pId);
    });
    ctx.mapaController.plotSegmentos(segmentosMat, ctx.pontosList);
    if (bpAtivo) {
      ctx.mapaController.plotPoligonalHomologada(ctx.bancoPontosList);
    }
    ctx.mapaController.fitBounds(pontosMat);
  }

  const tblHeader = document.getElementById('tbl-pontos-header');
  if (tblHeader) {
    tblHeader.innerHTML = `
      <th class="px-4 py-3 text-center w-[110px] resizable-col cursor-pointer hover:bg-white/5 transition-colors font-mono select-none" id="header-sort-ordem" data-col-id="col_vertice_ordem">Ordem ${ctx.currentSortColumn === 'ordem' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
      <th class="px-4 py-3 resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-nome" data-col-id="col_vertice_nome">Vértice ${ctx.currentSortColumn === 'nome' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
      <th class="px-4 py-3 resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-tipo" data-col-id="col_vertice_tipo">Tipo ${ctx.currentSortColumn === 'tipo' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
      <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-este" data-col-id="col_vertice_este_lat">${ctx.modoCoordenadas === 'geodesico' ? 'Latitude' : 'Este (E)'} ${ctx.currentSortColumn === 'este' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
      <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-norte" data-col-id="col_vertice_norte_lon">${ctx.modoCoordenadas === 'geodesico' ? 'Longitude' : 'Norte (N)'} ${ctx.currentSortColumn === 'norte' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
      <th class="px-4 py-3 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-altitude" data-col-id="col_vertice_altitude">Altitude (m) ${ctx.currentSortColumn === 'altitude' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
    `;

    const setupSortHeader = (id: string, column: string) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.onclick = () => {
          if (ctx.currentSortColumn === column) {
            ctx.currentSortDirection = ctx.currentSortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            ctx.currentSortColumn = column;
            ctx.currentSortDirection = 'asc';
          }
          ctx.renderMatriculaDados();
        };
      }
    };

    setupSortHeader('header-sort-ordem', 'ordem');
    setupSortHeader('header-sort-nome', 'nome');
    setupSortHeader('header-sort-tipo', 'tipo');
    setupSortHeader('header-sort-este', 'este');
    setupSortHeader('header-sort-norte', 'norte');
    setupSortHeader('header-sort-altitude', 'altitude');
  }

  const listPt = document.getElementById('tbl-pontos-triagem');
  if (listPt) {
    if (pontosMat.length === 0) {
      listPt.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-white/30">Nenhum ponto atrelado a esta matrícula.</td></tr>`;
    } else {
      pontosMat.sort((a, b) => {
        let valA: any;
        let valB: any;
        let isNumeric = false;

        if (ctx.currentSortColumn === 'ordem') {
          const isIgnA = isIgnoradoOuBase(a) ? 1 : 0;
          const isIgnB = isIgnoradoOuBase(b) ? 1 : 0;
          if (isIgnA !== isIgnB) {
            return isIgnB - isIgnA;
          }
          if (isIgnA === 1) {
            return a.nome_vertice.localeCompare(b.nome_vertice);
          }
          const valAOrdem = a.ordem_caminhamento;
          const valBOrdem = b.ordem_caminhamento;
          const numA = typeof valAOrdem === 'number' ? valAOrdem : (parseInt(valAOrdem) || 999999);
          const numB = typeof valBOrdem === 'number' ? valBOrdem : (parseInt(valBOrdem) || 999999);
          return ctx.currentSortDirection === 'asc' ? numA - numB : numB - numA;
        } else if (ctx.currentSortColumn === 'nome') {
          valA = a.nome_vertice;
          valB = b.nome_vertice;
        } else if (ctx.currentSortColumn === 'tipo') {
          valA = a.tipo_ponto || a.tipo || '';
          valB = b.tipo_ponto || b.tipo || '';
        } else if (ctx.currentSortColumn === 'este') {
          isNumeric = true;
          valA = a.e_corrigido !== undefined && a.e_corrigido !== null ? a.e_corrigido : (a.e_original || a.lon || 0);
          valB = b.e_corrigido !== undefined && b.e_corrigido !== null ? b.e_corrigido : (b.e_original || b.lon || 0);
        } else if (ctx.currentSortColumn === 'norte') {
          isNumeric = true;
          valA = a.n_corrigido !== undefined && a.n_corrigido !== null ? a.n_corrigido : (a.n_original || a.lat || 0);
          valB = b.n_corrigido !== undefined && b.n_corrigido !== null ? b.n_corrigido : (b.n_original || b.lat || 0);
        } else if (ctx.currentSortColumn === 'altitude') {
          isNumeric = true;
          valA = a.alt !== undefined && a.alt !== null ? a.alt : (a.alt_original || 0);
          valB = b.alt !== undefined && b.alt !== null ? b.alt : (b.alt_original || 0);
        }

        if (isNumeric) {
          const numA = Number(valA) || 0;
          const numB = Number(valB) || 0;
          return ctx.currentSortDirection === 'asc' ? numA - numB : numB - numA;
        } else {
          if (valA === null || valA === undefined) valA = '';
          if (valB === null || valB === undefined) valB = '';
          const strA = String(valA).toLowerCase();
          const strB = String(valB).toLowerCase();
          return ctx.currentSortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
        }
      });

      listPt.innerHTML = pontosMat.map((p) => {
        const isSelected = ctx.selectedPontoIds.includes(p.id);
        const ordemExibida = mapaOrdemReal.get(p.id) || '-';
        return renderLinhaPontoCartorioHtml(p, ordemExibida, ctx.modoCoordenadas, isSelected, latLonToUTM);
      }).join('');

      initIcons();
    }
  }

  const containerLateral = document.getElementById('container-tabela-lateral-content');
  if (containerLateral) {
    if (segmentosMat.length === 0) {
      containerLateral.innerHTML = `
        <table class="w-full text-left border-collapse">
          <tbody class="text-xs text-white/30">
            <tr><td class="px-4 py-8 text-center">Nenhum segmento gerado. Regere o perímetro salvando a ordem.</td></tr>
          </tbody>
        </table>
      `;
    } else {
      const segmentosHtml = segmentosMat.map(s => renderLinhaSegmentoHtml(s, ctx.confrontantesList, ctx.pontosList, latLonToUTM)).join('');
      containerLateral.innerHTML = `
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
              <th class="px-3 py-2.5 resizable-col" data-col-id="col_segmento_de_para">De ➔ Para</th>
              <th class="px-2 py-2.5 text-right resizable-col" data-col-id="col_segmento_dist">Dist (m)</th>
              <th class="px-2 py-2.5 text-right resizable-col" data-col-id="col_segmento_azim">Azimute</th>
              <th class="px-3 py-2.5 resizable-col" data-col-id="col_segmento_confrontante">Confrontante Oficial / Divisa</th>
              <th class="px-2 py-2.5 text-center resizable-col" data-col-id="col_segmento_anuencia">Anuên</th>
              <th class="px-3 py-2.5 text-center resizable-col" data-col-id="col_segmento_acoes">Peças Técnicas</th>
            </tr>
          </thead>
          <tbody class="text-xs divide-y divide-white/5 text-white/60" id="tbl-segmentos-divisas-body">
            ${segmentosHtml}
          </tbody>
        </table>
      `;

      // Bindar eventos de alteração de confrontante e divisa em tempo real
      document.querySelectorAll('.select-segmento-confrontante').forEach((sel: any) => {
        sel.addEventListener('change', async () => {
          const segId = sel.getAttribute('data-segmento-id');
          const confId = sel.value ? parseInt(sel.value) : null;
          try {
            await fetch(`${API_BASE}/segmentos/${segId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ confrontante_id: confId })
            });
            // Atualiza localmente sem recarregar tudo do servidor
            const seg = ctx.segmentosList.find(s => String(s.id) === segId);
            if (seg) seg.confrontante_id = confId;
            ctx.carregarConfrontantesAtivosSelect();
          } catch (err) {
            console.error("Erro ao salvar confrontante no segmento:", err);
          }
        });
      });

      document.querySelectorAll('.select-segmento-limite').forEach((sel: any) => {
        sel.addEventListener('change', async () => {
          const segId = sel.getAttribute('data-segmento-id');
          const tipoLimite = sel.value || null;
          try {
            await fetch(`${API_BASE}/segmentos/${segId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tipo_limite: tipoLimite })
            });
            const seg = ctx.segmentosList.find(s => String(s.id) === segId);
            if (seg) seg.tipo_limite = tipoLimite;
          } catch (err) {
            console.error("Erro ao salvar limite no segmento:", err);
          }
        });
      });

      document.querySelectorAll('.select-segmento-posicionamento').forEach((sel: any) => {
        sel.addEventListener('change', async () => {
          const segId = sel.getAttribute('data-segmento-id');
          const metodoPos = sel.value || null;
          try {
            await fetch(`${API_BASE}/segmentos/${segId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ metodo_posicionamento: metodoPos })
            });
            const seg = ctx.segmentosList.find(s => String(s.id) === segId);
            if (seg) seg.metodo_posicionamento = metodoPos;
          } catch (err) {
            console.error("Erro ao salvar posicionamento no segmento:", err);
          }
        });
      });

      document.querySelectorAll('.chk-segmento-anuente').forEach((chk: any) => {
        chk.addEventListener('change', async () => {
          const segId = chk.getAttribute('data-segmento-id');
          const anuidadeVal = chk.checked ? 1 : 0;
          try {
            await fetch(`${API_BASE}/segmentos/${segId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ anuencia_assinada: anuidadeVal })
            });
            const seg = ctx.segmentosList.find(s => String(s.id) === segId);
            if (seg) seg.anuencia_assinada = anuidadeVal;
            ctx.carregarConfrontantesAtivosSelect();
          } catch (err) {
            console.error("Erro ao salvar status de anuência no segmento:", err);
          }
        });
      });
    }
  }
};

export function setupOrganizadorPerimetro(ctx: MesaTrabalhoContext) {
  // 1. Métodos de reordenação e rascunhos atrelados ao contexto
  ctx.subirPonto = (pontoId: number) => {
    if (ctx.etapaAtiva !== 'cartorio' || !ctx.currentMatriculaId) return;

    const pontosMat = ctx.pontosList.filter(p => p.matricula_id === ctx.currentMatriculaId && p.tipo_ponto !== 'B');
    pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

    const idx = pontosMat.findIndex(p => p.id === pontoId);
    if (idx > 0) {
      const p1 = pontosMat[idx];
      const p2 = pontosMat[idx - 1];

      const tempOrdem = p1.ordem_caminhamento || idx + 1;
      p1.ordem_caminhamento = p2.ordem_caminhamento || idx;
      p2.ordem_caminhamento = tempOrdem;

      const btnSalvar = document.getElementById('btn-salvar-perimetro-custom');
      if (btnSalvar) {
        btnSalvar.classList.remove('hidden');
        btnSalvar.classList.add('animate-pulse');
      }

      ctx.renderMatriculaDados();
      ctx.atualizarPolilinhaMapaTemp();
    }
  };

  ctx.descerPonto = (pontoId: number) => {
    if (ctx.etapaAtiva !== 'cartorio' || !ctx.currentMatriculaId) return;

    const pontosMat = ctx.pontosList.filter(p => p.matricula_id === ctx.currentMatriculaId && p.tipo_ponto !== 'B');
    pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

    const idx = pontosMat.findIndex(p => p.id === pontoId);
    if (idx !== -1 && idx < pontosMat.length - 1) {
      const p1 = pontosMat[idx];
      const p2 = pontosMat[idx + 1];

      const tempOrdem = p1.ordem_caminhamento || idx + 1;
      p1.ordem_caminhamento = p2.ordem_caminhamento || idx + 2;
      p2.ordem_caminhamento = tempOrdem;

      const btnSalvar = document.getElementById('btn-salvar-perimetro-custom');
      if (btnSalvar) {
        btnSalvar.classList.remove('hidden');
        btnSalvar.classList.add('animate-pulse');
      }

      ctx.renderMatriculaDados();
      ctx.atualizarPolilinhaMapaTemp();
    }
  };

  ctx.salvarRascunhoLocal = () => {
    if (!ctx.currentLevId) return;
    const pontosMatCompleto = ctx.pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    pontosMatCompleto.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

    const draft = pontosMatCompleto.map(p => ({
      id: p.id,
      ordem: p.ordem_caminhamento
    }));

    localStorage.setItem(`rascunho_ordem_lev_${ctx.currentLevId}`, JSON.stringify(draft));
  };

  ctx.verificarRascunhoLocal = () => {
    if (!ctx.currentLevId) return;
    const key = `rascunho_ordem_lev_${ctx.currentLevId}`;
    const draftStr = localStorage.getItem(key);
    if (draftStr) {
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
          ctx.travamentoInicio = 0;
          ctx.travamentoFim = 0;
          ctx.travamentoInicioPontoId = null;
          ctx.travamentoFimPontoId = null;
          ctx.renderListaReordenarSimplificada();
          ctx.atualizarPolilinhaMapaTemp();
        } else {
          localStorage.removeItem(key);
        }
      }
    }
  };

  ctx.moverPontoPosicao = (pontoId: number, novaPosicao: number) => {
    const pontosMatCompleto = ctx.pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    pontosMatCompleto.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

    const oldIdx = pontosMatCompleto.findIndex(p => p.id === pontoId);
    if (oldIdx === -1) return;

    const ordemOriginal = oldIdx + 1;

    const pertenceAoBlocoTravado = ctx.travamentoInicio > 0 && ctx.travamentoFim >= ctx.travamentoInicio &&
      ordemOriginal >= ctx.travamentoInicio && ordemOriginal <= ctx.travamentoFim;

    if (pertenceAoBlocoTravado) {
      const tamanhoBloco = (ctx.travamentoFim - ctx.travamentoInicio) + 1;

      let novaPos = novaPosicao;
      if (novaPos < 1) novaPos = 1;
      if (novaPos > pontosMatCompleto.length - tamanhoBloco + 1) {
        novaPos = pontosMatCompleto.length - tamanhoBloco + 1;
      }

      if (novaPos === ctx.travamentoInicio) {
        ctx.renderListaReordenarSimplificada();
        return;
      }

      const idxInicioBloco = ctx.travamentoInicio - 1;
      const blocoMovido = pontosMatCompleto.splice(idxInicioBloco, tamanhoBloco);

      const novoIdxInsercao = novaPos - 1;
      pontosMatCompleto.splice(novoIdxInsercao, 0, ...blocoMovido);

      pontosMatCompleto.forEach((p, index) => {
        p.ordem_caminhamento = index + 1;
      });

      ctx.travamentoInicio = novaPos;
      ctx.travamentoFim = novaPos + tamanhoBloco - 1;

      ctx.renderListaReordenarSimplificada();
      ctx.atualizarPolilinhaMapaTemp();
      ctx.salvarRascunhoLocal();
      return;
    }

    let newIdx = novaPosicao - 1;
    if (ctx.travamentoInicio > 0 && ctx.travamentoFim >= ctx.travamentoInicio) {
      const blocoInicioIdx = ctx.travamentoInicio - 1;
      const blocoFimIdx = ctx.travamentoFim - 1;

      if (newIdx >= blocoInicioIdx && newIdx <= blocoFimIdx) {
        if (oldIdx < blocoInicioIdx) {
          newIdx = blocoInicioIdx;
        } else {
          newIdx = blocoFimIdx + 1;
        }
      }
    }

    if (newIdx < 0) newIdx = 0;
    if (newIdx >= pontosMatCompleto.length) newIdx = pontosMatCompleto.length - 1;

    if (oldIdx === newIdx) {
      ctx.renderListaReordenarSimplificada();
      return;
    }

    const [pontoMovido] = pontosMatCompleto.splice(oldIdx, 1);
    pontosMatCompleto.splice(newIdx, 0, pontoMovido);

    pontosMatCompleto.forEach((p, index) => {
      p.ordem_caminhamento = index + 1;
    });

    ctx.renderListaReordenarSimplificada();
    ctx.atualizarPolilinhaMapaTemp();
    ctx.salvarRascunhoLocal();
  };

  ctx.renderListaReordenarSimplificada = () => {
    const container = document.getElementById('lista-reordenar-simplificada');
    if (!container) return;

    const pontosMatCompleto = ctx.pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    pontosMatCompleto.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
    const totalPontos = pontosMatCompleto.length;

    if (ctx.travamentoInicioPontoId !== null && ctx.travamentoFimPontoId !== null) {
      const idxInicio = pontosMatCompleto.findIndex(p => p.id === ctx.travamentoInicioPontoId);
      const idxFim = pontosMatCompleto.findIndex(p => p.id === ctx.travamentoFimPontoId);
      if (idxInicio !== -1 && idxFim !== -1) {
        ctx.travamentoInicio = Math.min(idxInicio, idxFim) + 1;
        ctx.travamentoFim = Math.max(idxInicio, idxFim) + 1;
      } else {
        ctx.travamentoInicio = 0;
        ctx.travamentoFim = 0;
        ctx.travamentoInicioPontoId = null;
        ctx.travamentoFimPontoId = null;
      }
    } else {
      ctx.travamentoInicio = 0;
      ctx.travamentoFim = 0;
    }

    const txtFaixa = document.getElementById('txt-faixa-travada');
    if (txtFaixa) {
      if (ctx.travamentoInicio > 0 && ctx.travamentoFim >= ctx.travamentoInicio) {
        txtFaixa.innerText = `${ctx.travamentoInicio} a ${ctx.travamentoFim}`;
      } else {
        txtFaixa.innerText = "Nenhum";
      }
    }

    if (totalPontos === 0) {
      container.innerHTML = `<div class="text-white/20 p-8 text-center">Nenhum ponto para ordenar.</div>`;
      return;
    }

    let pontosMatFiltrados = [...pontosMatCompleto];
    if (ctx.searchFilterOrdenadorValue.trim()) {
      const query = ctx.searchFilterOrdenadorValue.toLowerCase().trim();
      pontosMatFiltrados = pontosMatFiltrados.filter(p =>
        (p.nome_vertice && p.nome_vertice.toLowerCase().includes(query)) ||
        (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(query)) ||
        (p.tipo && p.tipo.toLowerCase().includes(query))
      );
    }

    if (pontosMatFiltrados.length === 0) {
      container.innerHTML = `<div class="text-white/20 p-8 text-center">Nenhum ponto encontrado com "${ctx.searchFilterOrdenadorValue}".</div>`;
      return;
    }

    container.innerHTML = pontosMatFiltrados.map((p) => {
      const ordemOriginal = pontosMatCompleto.findIndex(orig => orig.id === p.id) + 1;
      const isTravado = ctx.travamentoInicio > 0 && ctx.travamentoFim >= ctx.travamentoInicio &&
        ordemOriginal >= ctx.travamentoInicio && ordemOriginal <= ctx.travamentoFim;

      return `
        <div class="flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded-technical text-xs font-mono transition-all duration-300 linha-ponto-ordenador hover:border-mint-vibrant/25 hover:bg-white/[0.04] ${isTravado ? 'border-mint-vibrant/30 bg-mint-vibrant/[0.03] font-semibold' : ''}" id="ordenador-item-${p.id}">
          <div class="flex items-center gap-2">
            <button class="btn-travar-ponto p-1 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors" 
                    data-ponto-id="${p.id}" 
                    data-ordem="${ordemOriginal}" 
                    title="${isTravado ? 'Destravar esta sequência' : 'Travar até este ponto'}" 
                    type="button">
              <i data-lucide="${isTravado ? 'lock' : 'unlock'}" class="w-3.5 h-3.5 ${isTravado ? 'text-mint-vibrant' : 'text-white/40'}"></i>
            </button>
            <input type="number" 
                   class="input-ordem-direta text-center text-[10px] bg-mint-vibrant/10 text-mint-vibrant font-bold border border-mint-vibrant/25 rounded w-10 focus:outline-none focus:border-mint-vibrant focus:ring-1 focus:ring-mint-vibrant/30 py-0.5 px-1 font-mono transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                   min="1" 
                   max="${totalPontos}" 
                   value="${ordemOriginal}" 
                   data-ponto-id="${p.id}"
                   data-old-ordem="${ordemOriginal}" />
            <span class="font-bold text-white">${p.nome_vertice}</span>
            <span class="text-[9px] text-white/30">(${p.tipo_ponto || p.tipo})</span>
          </div>
          <div class="flex items-center gap-1">
            <button class="btn-subir-simplificado p-1 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors" data-ponto-id="${p.id}" title="Subir Ponto" type="button">
              <i data-lucide="chevron-up" class="w-4 h-4"></i>
            </button>
            <button class="btn-descer-simplificado p-1 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors" data-ponto-id="${p.id}" title="Descer Ponto" type="button">
              <i data-lucide="chevron-down" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    initIcons();
  };

  ctx.subirPontoSimplificado = (pontoId: number) => {
    const pontosMat = ctx.pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

    const idx = pontosMat.findIndex(p => p.id === pontoId);
    if (idx > 0) {
      ctx.moverPontoPosicao(pontoId, idx);
    }
  };

  ctx.descerPontoSimplificado = (pontoId: number) => {
    const pontosMat = ctx.pontosList.filter(p => p.matricula_id === null && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));

    const idx = pontosMat.findIndex(p => p.id === pontoId);
    if (idx !== -1 && idx < pontosMat.length - 1) {
      ctx.moverPontoPosicao(pontoId, idx + 2);
    }
  };

  ctx.alternarModoReordenarManual = (ativo: boolean) => {
    ctx.modoReordenarAtivo = ativo;
    const btnAtivar = document.getElementById('btn-ativar-reordenacao');
    const containerIngestao = document.getElementById('container-ingestao-arquivos');
    const containerReordenar = document.getElementById('container-reordenar-manual');
    const header = document.getElementById('mesa-trabalho-header');
    const gridSuperior = document.getElementById('grid-superior-detalhe');

    if (ativo) {
      if (btnAtivar) {
        btnAtivar.classList.replace('bg-white/5', 'bg-mint-vibrant/20');
        btnAtivar.classList.add('border-mint-vibrant/40');
      }
      if (containerIngestao) containerIngestao.classList.add('hidden');
      if (containerReordenar) {
        containerReordenar.classList.remove('hidden');
      }
      if (gridSuperior) {
        gridSuperior.style.height = '680px';
      }
      const splitterSup = document.getElementById('splitter-superior');
      if (splitterSup) splitterSup.classList.remove('hidden');
      if (header) {
        header.classList.add('hidden');
      }

      ctx.verificarRascunhoLocal();
      ctx.renderListaReordenarSimplificada();
    } else {
      if (btnAtivar) {
        btnAtivar.classList.replace('bg-mint-vibrant/20', 'bg-white/5');
        btnAtivar.classList.remove('border-mint-vibrant/40');
      }
      if (containerIngestao) containerIngestao.classList.remove('hidden');
      if (containerReordenar) {
        containerReordenar.classList.add('hidden');
      }
      if (gridSuperior) {
        gridSuperior.style.height = '480px';
      }
      const splitterSup = document.getElementById('splitter-superior');
      if (splitterSup) {
        if (containerIngestao && !containerIngestao.classList.contains('ingestao-collapsed')) {
          splitterSup.classList.remove('hidden');
        } else {
          splitterSup.classList.add('hidden');
        }
      }
      if (header) {
        header.classList.remove('hidden');
      }

      ctx.modoCliqueSequencialAtivo = false;
      ctx.travamentoInicio = 0;
      ctx.travamentoFim = 0;
      ctx.sequenciaCliqueProximoIndice = null;
      ctx.mapaController.modoCliqueSequencialAtivo = false;

      const btnCliqueSequencial = document.getElementById('btn-toggle-clique-sequencial');
      if (btnCliqueSequencial) {
        btnCliqueSequencial.classList.replace('bg-mint-vibrant/20', 'bg-white/5');
        btnCliqueSequencial.classList.remove('border-mint-vibrant/40');
        const iconClique = document.getElementById('icon-clique-sequencial');
        if (iconClique) {
          iconClique.setAttribute('data-lucide', 'play');
          iconClique.classList.remove('animate-pulse');
        }
        const txtClique = document.getElementById('txt-clique-sequencial');
        if (txtClique) txtClique.innerText = "Caminhar por Clique";
      }

      ctx.loadLevantamentoDetails();
    }

    if (ctx.triagemMap) {
      setTimeout(() => ctx.triagemMap!.invalidateSize(), 150);
    }
  };

  // 2. Callbacks de homologação e confrontantes
  // Removidos e migrados para gerador_documentos.ts
  
  ctx.carregarSugestoesNumeracao = async () => {
    if (!ctx.currentLevId) return;
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos-sugeridos`);
      const data = await res.json();
      
      const banner = document.getElementById('banner-sugestao-numeracao');
      const sugM = document.getElementById('sugestao-m');
      const sugP = document.getElementById('sugestao-p');
      const sugV = document.getElementById('sugestao-v');
      
      if (data && data.sugestoes) {
        if (sugM) sugM.innerText = data.sugestoes.M.codigo_sugerido || '-';
        if (sugP) sugP.innerText = data.sugestoes.P.codigo_sugerido || '-';
        if (sugV) sugV.innerText = data.sugestoes.V.codigo_sugerido || '-';
        
        if (banner) {
          if (ctx.etapaAtiva === 'cartorio') {
            banner.classList.remove('hidden');
          } else {
            banner.classList.add('hidden');
          }
        }
      } else {
        if (banner) banner.classList.add('hidden');
      }
    } catch (err) {
      console.error("Erro ao carregar sugestões de numeração:", err);
    }
  };

  // 3. Inicializador do cadastro rápido de confrontantes na Etapa 2
  const inicializarConfrontanteRapido = () => {
    const input = document.getElementById('input-confrontante-nome-rapido') as HTMLInputElement;
    const btn = document.getElementById('btn-confrontante-adicionar-rapido') as HTMLButtonElement;

    if (!input || !btn) return;

    const adicionarConfrontante = async () => {
      const nome = input.value.trim();
      if (!nome) {
        alert("Por favor, digite o nome do confrontante.");
        return;
      }

      if (!ctx.currentLevId) return;

      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 animate-spin"></i> Cadastrando...`;
      initIcons();

      try {
        const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: nome
          })
        });

        if (res.ok) {
          input.value = '';
          await ctx.loadLevantamentoDetails();
        } else {
          const data = await res.json();
          alert(data.error || "Erro ao adicionar confrontante.");
        }
      } catch (err) {
        console.error("Erro ao cadastrar confrontante:", err);
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="plus" class="w-3 h-3"></i> Adicionar`;
        initIcons();
      }
    };

    btn.onclick = adicionarConfrontante;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        adicionarConfrontante();
      }
    };
  };

  // Inicializa o confrontante rápido no setup do Organizador de Perímetro
  inicializarConfrontanteRapido();
}
