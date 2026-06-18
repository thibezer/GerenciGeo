import L from 'leaflet';
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
      const segmentosHtml = segmentosMat.map(s => renderLinhaSegmentoHtml(s, ctx.confrontantesList, ctx.pontosList)).join('');
      containerLateral.innerHTML = `
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
              <th class="px-3 py-2.5 resizable-col" data-col-id="col_segmento_de_para">De ➔ Para</th>
              <th class="px-2 py-2.5 text-right resizable-col" data-col-id="col_segmento_dist">Dist (m)</th>
              <th class="px-2 py-2.5 text-right resizable-col" data-col-id="col_segmento_azim">Azimute</th>
              <th class="px-3 py-2.5 resizable-col" data-col-id="col_segmento_confrontante">Confrontante Oficial / Divisa</th>
              <th class="px-2 py-2.5 text-center resizable-col" data-col-id="col_segmento_anuencia">Anuên</th>
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
  ctx.carregarConfrontantesAtivosSelect = async () => {
    if (!ctx.currentLevId || !ctx.currentMatriculaId) return;
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes-ativos`);
      const confs = await res.json();
      
      const select = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
      if (select) {
        select.innerHTML = '<option value="" class="bg-[#0c1510]">Anuência Confrontante...</option>';
        if (Array.isArray(confs)) {
          confs.forEach((c: any) => {
            const opt = document.createElement('option');
            opt.value = String(c.id);
            opt.className = 'bg-[#0c1510]';
            opt.textContent = c.matricula_imovel ? `${c.nome} (Matrícula: ${c.matricula_imovel})` : c.nome;
            select.appendChild(opt);
          });
        }
      }
    } catch (err) {
      console.error("Erro ao carregar confrontantes ativos da matricula:", err);
    }
  };

  ctx.carregarHomologacaoDados = async (_profissionalId: number) => {
    renderPlanilhasHomologadas();
    if (!ctx.currentLevId || !ctx.currentMatriculaId) return;
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/pontos-homologados`);
      const pontosDoProjeto = await res.json();
      
      const container = document.getElementById('container-vertices-homologados');
      const countTxt = document.getElementById('txt-qtd-homologados');
      
      if (Array.isArray(pontosDoProjeto)) {
        ctx.bancoPontosList = pontosDoProjeto;
        
        if (countTxt) {
          countTxt.innerText = `${pontosDoProjeto.length} Pontos`;
        }
        
        if (pontosDoProjeto.length > 0) {
          ctx.bancoPontosExibido = true;
          ctx.mapaController.plotPoligonalHomologada(pontosDoProjeto);
          
          const btnToggleMapa = document.getElementById('btn-toggle-mapa-banco');
          const icon = document.getElementById('icon-toggle-mapa-banco');
          const txt = document.getElementById('txt-toggle-mapa-banco');
          if (btnToggleMapa) {
            btnToggleMapa.classList.remove('bg-amber-500/10');
            btnToggleMapa.classList.add('bg-amber-500/20');
          }
          if (txt) txt.innerText = "Ocultar Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye-off');
        } else {
          ctx.bancoPontosExibido = false;
          ctx.mapaController.plotPoligonalHomologada([]);
          
          const btnToggleMapa = document.getElementById('btn-toggle-mapa-banco');
          const icon = document.getElementById('icon-toggle-mapa-banco');
          const txt = document.getElementById('txt-toggle-mapa-banco');
          if (btnToggleMapa) {
            btnToggleMapa.classList.remove('bg-amber-500/20');
            btnToggleMapa.classList.add('bg-amber-500/10');
          }
          if (txt) txt.innerText = "Exibir Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye');
        }
        initIcons();
        
        const containerPecas = document.getElementById('container-pecas-cartorio');
        if (containerPecas) {
          if (pontosDoProjeto.length > 0) {
            containerPecas.classList.remove('hidden');
          } else {
            containerPecas.classList.add('hidden');
          }
        }

        const pontosMat = ctx.pontosList.filter(p => p.matricula_id === ctx.currentMatriculaId);
        const validCoords = pontosMat.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0);
        if (validCoords.length === 0 && ctx.triagemMap) {
          const validHomologadosCoords = pontosDoProjeto.filter((p: any) => p.lat && p.lon && p.lat !== 0 && p.lon !== 0).map((p: any) => L.latLng(p.lat, p.lon));
          if (validHomologadosCoords.length > 0) {
            const bounds = L.latLngBounds(validHomologadosCoords);
            ctx.triagemMap.fitBounds(bounds, { padding: [40, 40] });
          }
        }
        
        if (container) {
          if (pontosDoProjeto.length === 0) {
            container.innerHTML = `<div class="text-white/20 italic py-4 text-center">Selecione uma matrícula com pontos homologados para listar seus vértices.</div>`;
          } else {
            container.innerHTML = `
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                ${pontosDoProjeto.map((p: any) => `
                  <div class="p-1.5 bg-white/5 border border-white/5 rounded-technical flex items-center justify-between">
                    <span class="text-[10px] text-mint-vibrant font-bold">${p.codigo_completo}</span>
                    <span class="text-[8px] text-white/40 uppercase font-mono">${p.tipo_ponto}</span>
                  </div>
                `).join('')}
              </div>
            `;
          }
        }
      }
    } catch (err) {
      console.error("Erro ao carregar dados de homologação:", err);
    }

    const containerAuditoria = document.getElementById('container-auditoria-banco');
    if (containerAuditoria && !containerAuditoria.classList.contains('hidden')) {
      renderAuditoriaBancoPontos();
    }
  };

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

  // 3. Renderizadores internos e inicializadores de eventos de Cartório
  const renderPlanilhasHomologadas = async () => {
    const container = document.getElementById('container-planilhas-homologadas');
    if (!container || !ctx.currentLevId) return;

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas`);
      const planilhas = await res.json();

      if (!Array.isArray(planilhas) || planilhas.length === 0) {
        container.innerHTML = `<div class="text-white/20 italic py-2 text-center">Nenhuma planilha cadastrada.</div>`;
        return;
      }

      let html = `
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5">
              <th class="py-1.5 px-2">Arquivo / Planilha</th>
              <th class="py-1.5 px-2 text-center">Vértices</th>
              <th class="py-1.5 px-2">Matrícula Associada</th>
              <th class="py-1.5 px-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
      `;

      planilhas.forEach((p: any) => {
        const selectId = `select-assoc-mat-${btoa(p.planilha_origem).replace(/=/g, '')}`;
        html += `
          <tr class="hover:bg-white/[0.02] transition-colors">
            <td class="py-2 px-2 font-mono text-white/80 max-w-[150px] truncate" title="${p.planilha_origem}">${p.planilha_origem}</td>
            <td class="py-2 px-2 text-center font-mono text-mint-vibrant font-bold">${p.qtd_pontos}</td>
            <td class="py-2 px-2">
              <select class="select-assoc-matricula bg-white/5 border border-white/10 hover:border-mint-vibrant/30 rounded px-1.5 py-0.5 text-[11px] text-white focus:outline-none transition-all w-full max-w-[140px]" data-planilha="${p.planilha_origem}" id="${selectId}">
                <option value="" class="bg-[#0c1510]">Nenhuma (Pendente)</option>
                ${ctx.matriculasList.map(m => `
                  <option value="${m.id}" class="bg-[#0c1510]" ${p.matricula_id === m.id ? 'selected' : ''}>Matrícula ${m.numero_matricula}</option>
                `).join('')}
              </select>
            </td>
            <td class="py-2 px-2 text-center">
              <button class="btn-deletar-planilha text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1 rounded transition-colors" data-planilha="${p.planilha_origem}" title="Excluir planilha e todos os seus pontos">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;

      container.innerHTML = html;
      initIcons();

      container.querySelectorAll('.select-assoc-matricula').forEach((select: any) => {
        select.addEventListener('change', async () => {
          const planilha = select.getAttribute('data-planilha');
          const matIdVal = select.value;
          const matId = matIdVal ? parseInt(matIdVal) : null;

          try {
            const resAssoc = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas/associar-matricula`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                planilha_origem: planilha,
                matricula_id: matId
              })
            });
            if (resAssoc.ok) {
              await ctx.loadLevantamentoDetails();
            } else {
              const errData = await resAssoc.json();
              alert(errData.detail || "Erro ao associar matrícula.");
            }
          } catch (err) {
            console.error("Erro ao associar matrícula:", err);
          }
        });
      });

      container.querySelectorAll('.btn-deletar-planilha').forEach((btn: any) => {
        btn.addEventListener('click', async () => {
          const planilha = btn.getAttribute('data-planilha');
          if (!confirm(`Deseja realmente excluir a planilha "${planilha}" e todos os seus vértices homologados deste levantamento? Esta ação é irreversível.`)) {
            return;
          }

          try {
            const resDel = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas?planilha_origem=${encodeURIComponent(planilha)}`, {
              method: 'DELETE'
            });
            if (resDel.ok) {
              alert("Planilha e pontos excluídos com sucesso!");
              await ctx.loadLevantamentoDetails();
            } else {
              const errData = await resDel.json();
              alert(errData.detail || "Erro ao excluir planilha.");
            }
          } catch (err) {
            console.error("Erro ao excluir planilha:", err);
          }
        });
      });

    } catch (err) {
      console.error("Erro ao renderizar planilhas homologadas:", err);
      container.innerHTML = `<div class="text-red-400 italic py-2 text-center">Erro ao carregar lista de planilhas.</div>`;
    }
  };

  const renderAuditoriaBancoPontos = async () => {
    const container = document.getElementById('lista-grupos-auditoria');
    const totalPtsEl = document.getElementById('auditoria-total-pontos');
    const totalGruposEl = document.getElementById('auditoria-total-grupos');
    const totalDupEl = document.getElementById('auditoria-total-duplicados');
    
    if (!container || !ctx.currentLevId) return;

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/banco-pontos/auditoria`);
      const data = await res.json();

      if (totalPtsEl) totalPtsEl.innerText = String(data.total_pontos || 0);
      if (totalGruposEl) totalGruposEl.innerText = String(data.total_grupos || 0);
      if (totalDupEl) totalDupEl.innerText = String(data.total_duplicatas || 0);

      if (!data.grupos || data.grupos.length === 0) {
        container.innerHTML = `<div class="text-white/20 italic py-4 text-center">Nenhum ponto no banco para auditar.</div>`;
        return;
      }

      let html = '';
      data.grupos.forEach((g: any) => {
        const isDuplicadoGrupo = g.tem_duplicata;
        
        html += `
          <div class="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-2">
            <div class="flex justify-between items-center border-b border-white/5 pb-2">
              <div class="flex items-center gap-2">
                <span class="font-bold text-xs text-white max-w-[200px] truncate" title="${g.planilha_origem}">${g.planilha_origem}</span>
                <span class="text-[9px] font-mono bg-white/5 px-1.5 py-0.5 rounded text-white/40">${g.total} Pontos</span>
                ${isDuplicadoGrupo ? `<span class="text-[8px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded font-bold uppercase">Contém Duplicatas</span>` : ''}
              </div>
              <button class="btn-deletar-planilha-auditoria text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded text-[10px] flex items-center gap-1 transition-all active:scale-95" data-planilha="${g.planilha_origem}">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                Excluir Planilha
              </button>
            </div>
            
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-[10px] font-mono">
                <thead>
                  <tr class="text-[8px] font-bold uppercase tracking-wider text-white/20 border-b border-white/5">
                    <th class="py-1 px-1">Código</th>
                    <th class="py-1 px-1">Tipo</th>
                    <th class="py-1 px-1">Coordenadas (N, E, H)</th>
                    <th class="py-1 px-1">Método / Limite</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  ${g.pontos.map((p: any) => `
                    <tr class="${p.is_duplicado ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-white/[0.01]'} transition-colors">
                      <td class="py-1 px-1 font-bold ${p.is_duplicado ? 'text-amber-400' : 'text-mint-vibrant'}">
                        ${p.codigo_completo}
                        ${p.is_duplicado ? '<span class="text-[8px] text-amber-500 font-bold block">(Duplicado)</span>' : ''}
                      </td>
                      <td class="py-1 px-1 text-white/60">${p.tipo_ponto}</td>
                      <td class="py-1 px-1 text-white/40">
                        ${p.norte ? p.norte.toFixed(3) : '-'}, ${p.este ? p.este.toFixed(3) : '-'}, ${p.altitude ? p.altitude.toFixed(2) : '-'}
                      </td>
                      <td class="py-1 px-1 text-white/40">
                        ${p.metodo_posicionamento || '-'} / ${p.tipo_limite || '-'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      });

      container.innerHTML = html;
      initIcons();

      container.querySelectorAll('.btn-deletar-planilha-auditoria').forEach((btn: any) => {
        btn.addEventListener('click', async () => {
          const planilha = btn.getAttribute('data-planilha');
          if (planilha.startsWith("Sem arquivo")) {
            alert("Não é possível excluir pontos criados manualmente por este atalho.");
            return;
          }
          if (!confirm(`Deseja realmente excluir a planilha "${planilha}" e todos os seus vértices homologados deste levantamento? Esta ação é irreversível.`)) {
            return;
          }

          try {
            const resDel = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas?planilha_origem=${encodeURIComponent(planilha)}`, {
              method: 'DELETE'
            });
            if (resDel.ok) {
              alert("Planilha e pontos excluídos com sucesso!");
              await ctx.loadLevantamentoDetails();
            } else {
              const errData = await resDel.json();
              alert(errData.detail || "Erro ao excluir planilha.");
            }
          } catch (err) {
            console.error("Erro ao excluir planilha da auditoria:", err);
          }
        });
      });

    } catch (err) {
      console.error("Erro ao renderizar auditoria do banco de pontos:", err);
      container.innerHTML = `<div class="text-red-400 italic py-2 text-center">Erro ao carregar auditoria.</div>`;
    }
  };

  const inicializarEventosCartorio = () => {
    const btnToggleMapa = document.getElementById('btn-toggle-mapa-banco');
    if (btnToggleMapa) {
      btnToggleMapa.onclick = () => {
        if (!ctx.bancoPontosList || ctx.bancoPontosList.length === 0) {
          alert("Nenhum ponto homologado importado para exibir no mapa.");
          return;
        }
        
        ctx.bancoPontosExibido = !ctx.bancoPontosExibido;
        const icon = document.getElementById('icon-toggle-mapa-banco');
        const txt = document.getElementById('txt-toggle-mapa-banco');
        
        if (ctx.bancoPontosExibido) {
          ctx.mapaController.plotPoligonalHomologada(ctx.bancoPontosList);
          if (txt) txt.innerText = "Ocultar Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye-off');
          btnToggleMapa.classList.replace('bg-amber-500/10', 'bg-amber-500/20');
        } else {
          ctx.mapaController.plotPoligonalHomologada([]);
          if (txt) txt.innerText = "Exibir Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye');
          btnToggleMapa.classList.replace('bg-amber-500/20', 'bg-amber-500/10');
        }
        initIcons();
      };
    }
    
    const btnReq = document.getElementById('btn-emitir-req-cartorio');
    if (btnReq) {
      btnReq.onclick = async () => {
        if (!ctx.currentMatriculaId) return;
        
        try {
          const resLev = await fetch(`${API_BASE}/levantamentos`);
          const allLevs = await resLev.json();
          const levObj = allLevs.find((l: any) => l.id === ctx.currentLevId);
          if (levObj) ctx.currentLevantamento = levObj;
        } catch (e) {
          console.error("Erro ao recarregar levantamento:", e);
        }
        
        let trt = "";
        let data = "";
        
        if (ctx.currentLevantamento && ctx.currentLevantamento.numero_trt && ctx.currentLevantamento.numero_trt.trim()) {
          trt = ctx.currentLevantamento.numero_trt;
          data = ctx.currentLevantamento.data_trt || "";
        } else {
          const trtVal = prompt("Informe o número do TRT/ART:");
          if (trtVal === null) return;
          const dataVal = prompt("Informe a data de quitação do TRT/ART (AAAA-MM-DD):", new Date().toISOString().substring(0, 10));
          if (dataVal === null) return;
          trt = trtVal;
          data = dataVal;
          
          if (ctx.currentLevantamento) {
            const payload = {
              propriedade_id: ctx.currentLevantamento.propriedade_id,
              profissional_id: ctx.currentLevantamento.profissional_id,
              data_inicio: ctx.currentLevantamento.data_inicio,
              status: ctx.currentLevantamento.status || "EM_ANDAMENTO",
              numero_trt: trt,
              data_trt: data
            };
            try {
              const resPut = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const resData = await resPut.json();
              if (!resData.error) {
                ctx.currentLevantamento.numero_trt = trt;
                ctx.currentLevantamento.data_trt = data;
              }
            } catch (err) {
              console.error("Erro ao salvar TRT no levantamento:", err);
            }
          }
        }
        
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/requerimento-cartorio-html?numero_trt=${encodeURIComponent(trt)}&data_trt=${encodeURIComponent(data)}`;
        window.open(url, '_blank');
      };
    }
    
    const btnResp = document.getElementById('btn-emitir-decl-resp');
    if (btnResp) {
      btnResp.onclick = () => {
        if (!ctx.currentMatriculaId) return;
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/declaracao-responsabilidade-html`;
        window.open(url, '_blank');
      };
    }
    
    const btnLaudo = document.getElementById('btn-emitir-laudo-tec');
    if (btnLaudo) {
      btnLaudo.onclick = async () => {
        if (!ctx.currentMatriculaId) return;
        
        try {
          const resLev = await fetch(`${API_BASE}/levantamentos`);
          const allLevs = await resLev.json();
          const levObj = allLevs.find((l: any) => l.id === ctx.currentLevId);
          if (levObj) ctx.currentLevantamento = levObj;
        } catch (e) {
          console.error("Erro ao recarregar levantamento:", e);
        }
        
        let trt = "";
        let data = "";
        
        if (ctx.currentLevantamento && ctx.currentLevantamento.numero_trt && ctx.currentLevantamento.numero_trt.trim()) {
          trt = ctx.currentLevantamento.numero_trt;
          data = ctx.currentLevantamento.data_trt || "";
        } else {
          const trtVal = prompt("Informe o número do TRT/ART:");
          if (trtVal === null) return;
          const dataVal = prompt("Informe a data de quitação do TRT/ART (AAAA-MM-DD):", new Date().toISOString().substring(0, 10));
          if (dataVal === null) return;
          trt = trtVal;
          data = dataVal;
          
          if (ctx.currentLevantamento) {
            const payload = {
              propriedade_id: ctx.currentLevantamento.propriedade_id,
              profissional_id: ctx.currentLevantamento.profissional_id,
              data_inicio: ctx.currentLevantamento.data_inicio,
              status: ctx.currentLevantamento.status || "EM_ANDAMENTO",
              numero_trt: trt,
              data_trt: data
            };
            try {
              const resPut = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const resData = await resPut.json();
              if (!resData.error) {
                ctx.currentLevantamento.numero_trt = trt;
                ctx.currentLevantamento.data_trt = data;
              }
            } catch (err) {
              console.error("Erro ao salvar TRT no levantamento:", err);
            }
          }
        }
        
        const equip = prompt("Informe o Equipamento GNSS Utilizado:", "Receptor GNSS Hi-Target V30 / RTK de Dupla Frequência (L1/L2)");
        if (equip === null) return;
        
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/laudo-tecnico-html?numero_trt=${encodeURIComponent(trt)}&data_trt=${encodeURIComponent(data)}&equipamento=${encodeURIComponent(equip)}`;
        window.open(url, '_blank');
      };
    }
    
    const btnAnuencia = document.getElementById('btn-emitir-anuencia');
    if (btnAnuencia) {
      btnAnuencia.onclick = () => {
        if (!ctx.currentMatriculaId) return;
        const select = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
        const confId = select ? select.value : '';
        if (!confId) {
          alert("Selecione um confrontante da lista para emitir a anuência.");
          return;
        }
        
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes/${confId}/anuencia-html`;
        window.open(url, '_blank');
      };
    }

    const selectAnuencia = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
    if (selectAnuencia) {
      selectAnuencia.addEventListener('change', async () => {
        const confIdVal = selectAnuencia.value;
        const containerForm = document.getElementById('container-form-confrontante');
        if (!confIdVal || !ctx.currentLevId) {
          if (containerForm) containerForm.classList.add('hidden');
          return;
        }
        
        try {
          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`);
          const confs = await res.json();
          const selectedConf = confs.find((c: any) => String(c.id) === confIdVal);
          
          if (selectedConf && containerForm) {
            containerForm.classList.remove('hidden');
            
            (document.getElementById('txt-conf-id-edicao') as HTMLElement).innerText = `ID: ${selectedConf.id}`;
            (document.getElementById('input-conf-nome') as HTMLInputElement).value = selectedConf.nome || '';
            (document.getElementById('input-conf-cpf') as HTMLInputElement).value = selectedConf.cpf_cnpj || '';
            (document.getElementById('input-conf-rg') as HTMLInputElement).value = selectedConf.rg || '';
            (document.getElementById('input-conf-nacionalidade') as HTMLInputElement).value = selectedConf.nacionalidade || '';
            (document.getElementById('input-conf-profissao') as HTMLInputElement).value = selectedConf.profissao || '';
            (document.getElementById('select-conf-estado-civil') as HTMLSelectElement).value = selectedConf.estado_civil || 'solteiro';
            (document.getElementById('input-conf-regime-bens') as HTMLInputElement).value = selectedConf.regime_bens || '';
            (document.getElementById('input-conf-conjuge-nome') as HTMLInputElement).value = selectedConf.nome_conjuge || '';
            (document.getElementById('input-conf-conjuge-cpf') as HTMLInputElement).value = selectedConf.cpf_conjuge || '';
            (document.getElementById('input-conf-conjuge-rg') as HTMLInputElement).value = selectedConf.rg_conjuge || '';
            (document.getElementById('input-conf-endereco') as HTMLInputElement).value = selectedConf.endereco_completo || '';
            (document.getElementById('input-conf-matricula-imovel') as HTMLInputElement).value = selectedConf.matricula_imovel || '';
            
            initIcons();
          }
        } catch (err) {
          console.error("Erro ao carregar qualificacoes do confrontante:", err);
        }
      });
    }

    const btnSalvarConf = document.getElementById('btn-salvar-confrontante-qualificacao') as HTMLButtonElement;
    if (btnSalvarConf) {
      btnSalvarConf.onclick = async () => {
        const confIdVal = selectAnuencia ? selectAnuencia.value : '';
        if (!confIdVal || !ctx.currentLevId) return;

        const nome = (document.getElementById('input-conf-nome') as HTMLInputElement).value.trim();
        if (!nome) {
          alert("O nome do confrontante é obrigatório.");
          return;
        }

        const payload = {
          nome: nome,
          cpf_cnpj: (document.getElementById('input-conf-cpf') as HTMLInputElement).value.trim() || null,
          rg: (document.getElementById('input-conf-rg') as HTMLInputElement).value.trim() || null,
          nacionalidade: (document.getElementById('input-conf-nacionalidade') as HTMLInputElement).value.trim() || null,
          profissao: (document.getElementById('input-conf-profissao') as HTMLInputElement).value.trim() || null,
          estado_civil: (document.getElementById('select-conf-estado-civil') as HTMLSelectElement).value || null,
          regime_bens: (document.getElementById('input-conf-regime-bens') as HTMLInputElement).value.trim() || null,
          nome_conjuge: (document.getElementById('input-conf-conjuge-nome') as HTMLInputElement).value.trim() || null,
          cpf_conjuge: (document.getElementById('input-conf-conjuge-cpf') as HTMLInputElement).value.trim() || null,
          rg_conjuge: (document.getElementById('input-conf-conjuge-rg') as HTMLInputElement).value.trim() || null,
          endereco_completo: (document.getElementById('input-conf-endereco') as HTMLInputElement).value.trim() || null,
          matricula_imovel: (document.getElementById('input-conf-matricula-imovel') as HTMLInputElement).value.trim() || null,
          tipo_relacao: null
        };

        btnSalvarConf.disabled = true;
        const originalHTML = btnSalvarConf.innerHTML;
        btnSalvarConf.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i> Salvando...`;
        initIcons();

        try {
          const res = await fetch(`${API_BASE}/confrontantes/${confIdVal}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            alert("Qualificação do confrontante salva com sucesso!");
            const containerForm = document.getElementById('container-form-confrontante');
            if (containerForm) containerForm.classList.add('hidden');
            if (selectAnuencia) selectAnuencia.value = '';
            
            await ctx.loadLevantamentoDetails();
          } else {
            const data = await res.json();
            alert(data.error || "Erro ao salvar qualificações do confrontante.");
          }
        } catch (err) {
          console.error("Erro ao salvar qualificações:", err);
          alert("Erro de rede ao salvar qualificações.");
        } finally {
          btnSalvarConf.disabled = false;
          btnSalvarConf.innerHTML = originalHTML;
          initIcons();
        }
      };
    }

    const btnCancelarConf = document.getElementById('btn-cancelar-confrontante-qualificacao');
    if (btnCancelarConf) {
      btnCancelarConf.onclick = () => {
        const containerForm = document.getElementById('container-form-confrontante');
        if (containerForm) containerForm.classList.add('hidden');
        if (selectAnuencia) selectAnuencia.value = '';
      };
    }
  };

  const inicializarHomologacaoIncra = () => {
    const dropzone = document.getElementById('homologacao-dropzone');
    const fileInput = document.getElementById('homologacao-file-input') as HTMLInputElement;
    const btnProcessar = document.getElementById('btn-processar-homologacao') as HTMLButtonElement;
    let selectedFile: File | null = null;
    
    if (!dropzone || !fileInput || !btnProcessar) return;
    
    const updateButtonState = () => {
      if (selectedFile) {
        btnProcessar.disabled = false;
        btnProcessar.classList.remove('opacity-55', 'cursor-not-allowed');
        btnProcessar.classList.add('btn-primary');
      } else {
        btnProcessar.disabled = true;
        btnProcessar.classList.add('opacity-55', 'cursor-not-allowed');
        btnProcessar.classList.remove('btn-primary');
      }
    };
    
    dropzone.onclick = () => fileInput.click();
    
    fileInput.addEventListener('change', (e: any) => {
      if (e.target.files && e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        const textElement = dropzone.querySelector('p.text-xs') as HTMLElement;
        if (textElement && selectedFile) {
          textElement.innerText = `Arquivo: ${selectedFile.name}`;
        }
        updateButtonState();
      }
    });
    
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    });
    
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    });
    
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        selectedFile = e.dataTransfer.files[0];
        const textElement = dropzone.querySelector('p.text-xs') as HTMLElement;
        if (textElement && selectedFile) {
          textElement.innerText = `Arquivo: ${selectedFile.name}`;
        }
        updateButtonState();
      }
    });
    
    btnProcessar.addEventListener('click', async () => {
      if (!selectedFile || !ctx.currentLevId) return;
      
      btnProcessar.disabled = true;
      btnProcessar.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i> Processando...`;
      initIcons();
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      try {
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/importar-pontos-aprovados${ctx.currentMatriculaId ? `?matricula_id=${ctx.currentMatriculaId}` : ''}`;
        const res = await fetch(url, {
          method: 'POST',
          body: formData
        });
        
        const data = await res.json();
        if (res.ok && data.sucesso) {
          alert(data.mensagem || "Pontos homologados importados com sucesso!");
          
          selectedFile = null;
          fileInput.value = '';
          const textElement = dropzone.querySelector('p.text-xs') as HTMLElement;
          if (textElement) {
            textElement.innerText = `Lançar TXT/CSV/ODS Homologado`;
          }
          
          ctx.loadLevantamentoDetails();
        } else {
          alert(data.detail || data.error || "Erro ao processar arquivo de homologação.");
        }
      } catch (err) {
        console.error("Erro no upload de homologação:", err);
        alert("Erro de conexão com o servidor API.");
      } finally {
        btnProcessar.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i> Importar Pontos no Banco`;
        updateButtonState();
        initIcons();
      }
    });
  };

  const inicializarAuditoriaBancoPontos = () => {
    const btnToggle = document.getElementById('btn-toggle-auditoria-banco');
    const container = document.getElementById('container-auditoria-banco');
    const iconChevron = document.getElementById('icon-chevron-auditoria');

    if (!btnToggle || !container) return;

    btnToggle.onclick = () => {
      const isHidden = container.classList.contains('hidden');
      if (isHidden) {
        container.classList.remove('hidden');
        if (iconChevron) iconChevron.classList.add('rotate-180');
        renderAuditoriaBancoPontos();
      } else {
        container.classList.add('hidden');
        if (iconChevron) iconChevron.classList.remove('rotate-180');
      }
    };
  };

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

  // Chama as sub-inicializações locais
  ctx.inicializarEventosCartorio = () => {
    inicializarEventosCartorio();
    inicializarHomologacaoIncra();
    inicializarAuditoriaBancoPontos();
    inicializarConfrontanteRapido();
  };
}
