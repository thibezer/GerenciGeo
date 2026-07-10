import { API_BASE } from '../../config';
import { initIcons } from '../../utils';
import { renderLinhaPontoCartorioHtml, renderLinhaSegmentoHtml } from './mesa_trabalho_tabela';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import { latLonToUTM } from './mesa_geodesica';

export const renderTabelaOrganizadorPerimetro = (ctx: MesaTrabalhoContext) => {
  if (!ctx.currentMatriculaId) return;

  const isIgnoradoOuBase = (p: any) => p.ignorar_poligono === 1 || p.tipo_ponto === 'B' || p.tipo === 'B';

  let pontosMat = ctx.obterPontosParaOrdenacao();

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
    if (ctx.pontosVizinhosList && ctx.pontosVizinhosList.length > 0) {
      ctx.mapaController.plotPontosVizinhos(ctx.pontosVizinhosList);
    }
    ctx.mapaController.fitBounds(pontosMat);
  }

  const tblHeader = document.getElementById('tbl-pontos-header');
  if (tblHeader) {
    tblHeader.innerHTML = `
      <th class="px-4 py-1 text-center resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-ordem" data-col-id="col_vertice_ordem" style="width: 75px;">Ordem ${ctx.currentSortColumn === 'ordem' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
      <th class="px-4 py-1 resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-nome" data-col-id="col_vertice_nome">Vértice ${ctx.currentSortColumn === 'nome' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
      <th class="px-4 py-1 resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-tipo" data-col-id="col_vertice_tipo" style="width: 42px;">Tipo ${ctx.currentSortColumn === 'tipo' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
      <th class="px-4 py-1 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-este" data-col-id="col_vertice_este_lat">${ctx.modoCoordenadas === 'geodesico' ? 'Latitude' : 'Este (E)'} ${ctx.currentSortColumn === 'este' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
      <th class="px-4 py-1 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-norte" data-col-id="col_vertice_norte_lon">${ctx.modoCoordenadas === 'geodesico' ? 'Longitude' : 'Norte (N)'} ${ctx.currentSortColumn === 'norte' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
      <th class="px-4 py-1 text-right resizable-col cursor-pointer hover:bg-white/5 transition-colors select-none" id="header-sort-altitude" data-col-id="col_vertice_altitude">Altitude (m) ${ctx.currentSortColumn === 'altitude' ? (ctx.currentSortDirection === 'asc' ? '▲' : '▼') : ''}</th>
      <th class="px-4 py-1 text-left resizable-col hover:bg-white/5 transition-colors select-none" style="width: 130px;">Origem</th>
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
      listPt.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-white/30">Nenhum ponto atrelado a esta matrícula.</td></tr>`;
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

  // Renderiza também a lista simplificada do ordenador manual
  if (typeof ctx.renderListaReordenarSimplificada === 'function') {
    ctx.renderListaReordenarSimplificada();
  }
};

export function setupOrganizadorPerimetro(ctx: MesaTrabalhoContext) {
  // 1. Inicializador do cadastro rápido de confrontantes na Etapa 2
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
