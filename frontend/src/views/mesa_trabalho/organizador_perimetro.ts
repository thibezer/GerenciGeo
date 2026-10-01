import { API_BASE } from '../../config';
import { initIcons, showToast } from '../../utils';
import { renderLinhaSegmentoHtml } from './mesa_trabalho_tabela';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import { latLonToUTM } from './mesa_geodesica';

export const renderTabelaOrganizadorPerimetro = (ctx: MesaTrabalhoContext) => {
  // Removido o early return para permitir que pontos avulsos ([Sem Matrícula]) sejam carregados
  const isIgnoradoOuBase = (p: any) => p.ignorar_poligono === 1 || p.tipo_ponto === 'B' || p.tipo === 'B';

  let pontosMat = ctx.obterPontosParaOrdenacao();

  if (ctx.bancoPontosExibido && ctx.bancoPontosList && ctx.bancoPontosList.length > 0) {
    pontosMat = ctx.bancoPontosList.map((bp: any) => ({
      id: bp.id,
      nome_vertice: bp.codigo_completo || bp.nome_vertice || `VRT-${bp.numero || bp.id}`,
      nome_original: bp.nome_original || bp.codigo_completo,
      tipo_ponto: bp.tipo_ponto || 'V',
      tipo: bp.tipo_ponto || 'V',
      lat: bp.lat,
      lon: bp.lon,
      alt: bp.altitude !== undefined && bp.altitude !== null ? bp.altitude : bp.alt,
      alt_original: bp.altitude !== undefined && bp.altitude !== null ? bp.altitude : bp.alt,
      e_corrigido: bp.este !== undefined && bp.este !== null ? bp.este : bp.e_corrigido,
      n_corrigido: bp.norte !== undefined && bp.norte !== null ? bp.norte : bp.n_corrigido,
      lat_corrigido: bp.lat,
      lon_corrigido: bp.lon,
      alt_corrigido: bp.altitude !== undefined && bp.altitude !== null ? bp.altitude : bp.alt,
      sigma_e: bp.sigma_e || 0.05,
      sigma_n: bp.sigma_n || 0.05,
      sigma_z: bp.sigma_z || 0.08,
      status_correcao: 'CORRIGIDO',
      status_ponto: 'CORRIGIDO',
      arquivo_origem: bp.planilha_origem || 'Planilha SIGEF / INCRA'
    }));
  }

  // Calcula o mapa de ordem real estável de caminhamento antes de qualquer filtro
  const pontosOrdenadosOriginal = [...pontosMat].sort((a, b) => {
    const isIgnA = isIgnoradoOuBase(a) ? 1 : 0;
    const isIgnB = isIgnoradoOuBase(b) ? 1 : 0;
    if (isIgnA !== isIgnB) return isIgnB - isIgnA;
    if (isIgnA === 1) return (a.nome_vertice || '').localeCompare(b.nome_vertice || '');
    const valA = a.ordem_caminhamento;
    const valB = b.ordem_caminhamento;
    const numA = Number(valA ?? 999999);
    const numB = Number(valB ?? 999999);
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

  let segmentosMat = ctx.currentMatriculaId
    ? ctx.segmentosList.filter((s: any) => String(s.matricula_id) === String(ctx.currentMatriculaId))
    : ctx.segmentosList;

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

    if (segmentosMat && segmentosMat.length > 0) {
      ctx.mapaController.plotSegmentos(segmentosMat, ctx.pontosList);
    } else {
      ctx.mapaController.plotPolilinhaTemporaria(pontosMat);
    }

    if (bpAtivo) {
      ctx.mapaController.plotPoligonalHomologada(ctx.bancoPontosList);
    }
    if (ctx.pontosVizinhosList && ctx.pontosVizinhosList.length > 0) {
      ctx.mapaController.plotPontosVizinhos(ctx.pontosVizinhosList);
    }
    if (ctx.confrontantesList && ctx.confrontantesList.length > 0) {
      ctx.mapaController.plotPoligonosVizinhos(ctx.confrontantesList);
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
          const seg = ctx.segmentosList.find(s => String(s.id) === String(segId));
          const valorAnterior = seg?.confrontante_id ?? null;
          const confId = sel.value ? parseInt(sel.value) : null;
          try {
            const res = await fetch(`${API_BASE}/segmentos/${segId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ confrontante_id: confId })
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.detail || "Erro ao salvar confrontante no segmento");
            }
            // Atualiza localmente sem recarregar tudo do servidor
            if (seg) seg.confrontante_id = confId;

            // Atualiza o atributo data-confrontante-id no botão de emissão rápida da mesma linha
            const tr = sel.closest('tr');
            const btnAnuencia = tr?.querySelector('.btn-emitir-anuencia-rapida');
            if (btnAnuencia) {
              btnAnuencia.setAttribute('data-confrontante-id', confId ? String(confId) : '');
            }

            ctx.carregarConfrontantesAtivosSelect();
          } catch (err: any) {
            // Reverte elemento na interface para evitar falsa confirmação visual
            sel.value = valorAnterior !== null ? String(valorAnterior) : '';
            console.error("Erro ao salvar confrontante no segmento:", err);
            showToast(err.message || "Erro ao salvar confrontante no segmento", "error");
          }
        });
      });

      document.querySelectorAll('.select-segmento-limite').forEach((sel: any) => {
        sel.addEventListener('change', async () => {
          const segId = sel.getAttribute('data-segmento-id');
          const seg = ctx.segmentosList.find(s => String(s.id) === String(segId));
          const valorAnterior = seg?.tipo_limite_sigef || seg?.tipo_limite || 'LN1';
          const tipoLimite = sel.value || null;
          try {
            const res = await fetch(`${API_BASE}/segmentos/${segId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tipo_limite_sigef: tipoLimite })
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.detail || "Erro ao salvar limite no segmento");
            }
            if (seg) {
              seg.tipo_limite_sigef = tipoLimite;
              seg.tipo_limite = tipoLimite;
            }
          } catch (err: any) {
            sel.value = valorAnterior;
            console.error("Erro ao salvar limite no segmento:", err);
            showToast(err.message || "Erro ao salvar limite no segmento", "error");
          }
        });
      });

      document.querySelectorAll('.select-segmento-posicionamento').forEach((sel: any) => {
        sel.addEventListener('change', async () => {
          const segId = sel.getAttribute('data-segmento-id');
          const seg = ctx.segmentosList.find(s => String(s.id) === String(segId));
          const valorAnterior = seg?.metodo_posicionamento_sigef || seg?.metodo_posicionamento || 'PG1';
          const metodoPos = sel.value || null;
          try {
            const res = await fetch(`${API_BASE}/segmentos/${segId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ metodo_posicionamento_sigef: metodoPos })
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.detail || "Erro ao salvar posicionamento no segmento");
            }
            if (seg) {
              seg.metodo_posicionamento_sigef = metodoPos;
              seg.metodo_posicionamento = metodoPos;
            }
          } catch (err: any) {
            sel.value = valorAnterior;
            console.error("Erro ao salvar posicionamento no segmento:", err);
            showToast(err.message || "Erro ao salvar posicionamento no segmento", "error");
          }
        });
      });

      document.querySelectorAll('.chk-segmento-anuente').forEach((chk: any) => {
        chk.addEventListener('change', async () => {
          const segId = chk.getAttribute('data-segmento-id');
          const seg = ctx.segmentosList.find(s => String(s.id) === String(segId));
          const valorAnterior = seg?.anuencia_assinada === 1;
          const anuidadeVal = chk.checked ? 1 : 0;
          try {
            const res = await fetch(`${API_BASE}/segmentos/${segId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ anuencia_assinada: anuidadeVal })
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.detail || "Erro ao salvar status de anuência no segmento");
            }
            if (seg) seg.anuencia_assinada = anuidadeVal;
            ctx.carregarConfrontantesAtivosSelect();
          } catch (err: any) {
            chk.checked = valorAnterior;
            console.error("Erro ao salvar status de anuência no segmento:", err);
            showToast(err.message || "Erro ao salvar status de anuência no segmento", "error");
          }
        });
      });

      document.querySelectorAll('.btn-emitir-anuencia-rapida').forEach((btn: any) => {
        btn.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          const confId = btn.getAttribute('data-confrontante-id');
          if (!confId) {
            showToast("Esta divisa ainda não possui confrontante vinculado.", "info");
            return;
          }
          if (typeof (window as any).abrirPreviewDivisaAnuenciaGlobal === 'function') {
            (window as any).abrirPreviewDivisaAnuenciaGlobal(confId);
          }
        });
      });

      document.querySelectorAll('.btn-emitir-requerimento-rapido').forEach((btn: any) => {
        btn.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          if (!ctx.currentLevId || !ctx.currentMatriculaId) return;
          const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/requerimento-cartorio-html`;
          window.open(url, '_blank');
        });
      });

      document.querySelectorAll('.btn-emitir-laudo-rapido').forEach((btn: any) => {
        btn.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          if (!ctx.currentLevId || !ctx.currentMatriculaId) return;
          const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/laudo-tecnico-html`;
          window.open(url, '_blank');
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
          showToast("Confrontante adicionado com sucesso!", "success");
          await ctx.loadLevantamentoDetails();
          if (typeof ctx.carregarConfrontantesAtivosSelect === 'function') {
            await ctx.carregarConfrontantesAtivosSelect();
          }
        } else {
          const data = await res.json().catch(() => ({}));
          const errMsg = data.detail
            ? (Array.isArray(data.detail) ? data.detail.map((d: any) => d.msg).join('; ') : data.detail)
            : (data.error || "Erro ao adicionar confrontante.");
          showToast(errMsg, "error");
        }
      } catch (err) {
        console.error("Erro ao cadastrar confrontante:", err);
        showToast("Erro de conexão ao adicionar confrontante.", "error");
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
