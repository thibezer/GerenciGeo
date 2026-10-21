import { API_BASE } from '../../../config';
import { initIcons, showToast } from '../../../utils';
import { renderAuditoriaTranslacaoHtml, obterCorArquivo } from '../mesa_trabalho_tabela';
import { aplicarFiltrosMesa } from '../pontos_visiveis';
import { pontosParaMapa } from '../coordenadas_mapa';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export const renderTabelaMesaGeodesica = (ctx: MesaTrabalhoContext): void => {
  const isIgnoradoOuBase = (p: any) => p.ignorar_poligono === 1 || p.tipo_ponto === 'B' || p.tipo === 'B';

  let pontosMat = (ctx.currentMatriculaId && ctx.obterPontosParaOrdenacao)
    ? ctx.obterPontosParaOrdenacao()
    : [...ctx.pontosList];

  if (ctx.currentMatriculaId) {
    pontosMat = pontosMat.filter(p => p && String(p.matricula_id) === String(ctx.currentMatriculaId));
  }

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
    if (isIgnA === 1) return a.nome_vertice.localeCompare(b.nome_vertice);
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

  // Contagens dinâmicas de filtros rápidos
  const totalTodos = pontosMat.length;
  const totalBases = pontosMat.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B').length;
  const totalRovers = pontosMat.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B').length;
  const totalBrutos = pontosMat.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO').length;
  const totalCorrigidos = pontosMat.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO').length;

  const btnTodos = document.querySelector('.vtx-filter-chip[data-filtro="todos"]');
  if (btnTodos) btnTodos.textContent = `Todos (${totalTodos})`;

  const btnBases = document.querySelector('.vtx-filter-chip[data-filtro="bases"]');
  if (btnBases) btnBases.textContent = `Bases (M/B) (${totalBases})`;

  const btnRovers = document.querySelector('.vtx-filter-chip[data-filtro="rovers"]');
  if (btnRovers) btnRovers.textContent = `Rovers (P/V) (${totalRovers})`;

  const btnBrutos = document.querySelector('.vtx-filter-chip[data-filtro="brutos"]');
  if (btnBrutos) btnBrutos.textContent = `Brutos (${totalBrutos})`;

  const btnCorrigidos = document.querySelector('.vtx-filter-chip[data-filtro="corrigidos"]');
  if (btnCorrigidos) btnCorrigidos.textContent = `Corrigidos (${totalCorrigidos})`;

  // Aplica filtros rápidos e de busca da Mesa
  pontosMat = aplicarFiltrosMesa(ctx, pontosMat);

  // Popover de filtro por arquivo de origem
  const arquivosUnicos = Array.from(new Set(
    (ctx.pontosList || [])
      .map(p => p.arquivo_origem)
      .filter(name => typeof name === 'string' && name.trim() !== '')
  )) as string[];

  const arquivosDesativados = ctx.arquivosDesativadosList || [];

  const popover = document.getElementById('popover-filtro-arquivos');
  if (popover) {
    if (arquivosUnicos.length === 0) {
      popover.innerHTML = `<div class="text-[10px] text-white/30 italic text-center py-1">Nenhum arquivo de origem encontrado.</div>`;
    } else {
      popover.innerHTML = arquivosUnicos.map(arq => {
        const ativo = !arquivosDesativados.includes(arq);
        return `
          <label class="flex items-center gap-2 text-[10px] text-white/70 hover:text-white cursor-pointer select-none py-0.5">
            <input type="checkbox" class="chk-filtro-arquivo rounded bg-white/5 border-white/10 text-mint-vibrant focus:ring-mint-vibrant" data-arquivo="${arq}" ${ativo ? 'checked' : ''} />
            <span class="truncate" title="${arq}">${arq}</span>
          </label>
        `;
      }).join('');

      popover.querySelectorAll('.chk-filtro-arquivo').forEach(input => {
        input.addEventListener('change', (e) => {
          const chk = e.target as HTMLInputElement;
          const arq = chk.getAttribute('data-arquivo') || '';
          if (!ctx.arquivosDesativadosList) ctx.arquivosDesativadosList = [];

          if (chk.checked) {
            ctx.arquivosDesativadosList = ctx.arquivosDesativadosList.filter(a => a !== arq);
          } else {
            if (!ctx.arquivosDesativadosList.includes(arq)) {
              ctx.arquivosDesativadosList.push(arq);
            }
          }

          ctx.renderMatriculaDados();
        });
      });
    }
  }

  // Plotagem no Canvas do Mapa
  if (ctx.triagemMap) {
    const bpAtivo = ctx.bancoPontosExibido && ctx.bancoPontosList.length > 0;
    ctx.mapaController.clearOverlays(bpAtivo);
    const pontosMapa = pontosParaMapa(pontosMat);
    ctx.mapaController.plotPontos(pontosMapa, (pId: number) => {
      ctx.cliqueVerticeMapa?.(pId);
    });

    const matAtiva = ctx.matriculasList.find((m: any) => String(m.id) === String(ctx.currentMatriculaId));
    const effectiveMatId = (matAtiva && matAtiva.matricula_origem_desenho_id) ? matAtiva.matricula_origem_desenho_id : ctx.currentMatriculaId;
    const segmentosMat = effectiveMatId
      ? (ctx.segmentosList || []).filter((s: any) => String(s.matricula_id) === String(effectiveMatId))
      : (ctx.segmentosList || []);

    if (segmentosMat && segmentosMat.length > 0) {
      ctx.mapaController.plotSegmentos(segmentosMat, pontosParaMapa(ctx.pontosList));
    } else {
      ctx.mapaController.plotPolilinhaTemporaria(pontosMapa);
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

  // Montagem da tabela de dados
  const uiTabela = document.getElementById('ui-tbl-pontos-triagem') as any;
  if (uiTabela) {
    const pontosProcessados = pontosMat.map(p => {
      const isBasePPP = p.tipo_ponto === 'M' || p.tipo === 'M';
      const isBaseFisica = p.tipo_ponto === 'B' || p.tipo === 'B';
      const ordemExibida = mapaOrdemReal.get(p.id) || '-';

      let nCorrNum = p.n_corrigido !== undefined && p.n_corrigido !== null ? p.n_corrigido : (p.n_original || p.lat || 0);
      let eCorrNum = p.e_corrigido !== undefined && p.e_corrigido !== null ? p.e_corrigido : (p.e_original || p.lon || 0);

      let deltaNNum = 0;
      let deltaENum = 0;
      let deltaHNum = 0;

      if (p.e_corrigido !== undefined && p.e_corrigido !== null && p.n_corrigido !== undefined && p.n_corrigido !== null) {
        if (p.e_original && p.n_original) {
          deltaENum = Math.round((p.e_corrigido - p.e_original) * 1000);
          deltaNNum = Math.round((p.n_corrigido - p.n_original) * 1000);
          deltaHNum = Math.round(((p.alt || 0) - (p.alt_original || 0)) * 1000);
        }
      } else if (p.lat && p.lon) {
        const utm = ctx.latLonToUTM(p.lat, p.lon);
        nCorrNum = utm.n;
        eCorrNum = utm.e;
        if (p.e_original && p.n_original) {
          deltaENum = Math.round((utm.e - p.e_original) * 1000);
          deltaNNum = Math.round((utm.n - p.n_original) * 1000);
          deltaHNum = Math.round(((p.alt || 0) - (p.alt_original || 0)) * 1000);
        }
      }

      const isCorrigido = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO' || p.ponto_vizinho === 1 || p.tipo_ponto === 'V' || p.tipo === 'V';

      return {
        ...p,
        ordem_num: typeof ordemExibida === 'number' ? ordemExibida : 999999,
        ordem_display: ordemExibida,
        n_bruto_str: p.n_original ? p.n_original.toFixed(3) : (p.lat ? p.lat.toFixed(8) : '-'),
        e_bruto_str: p.e_original ? p.e_original.toFixed(3) : (p.lon ? p.lon.toFixed(8) : '-'),
        n_corr_str: Number(nCorrNum).toFixed(3),
        e_corr_str: Number(eCorrNum).toFixed(3),
        lat_bruta_str: p.lat ? p.lat.toFixed(8) : '-',
        lon_bruta_str: p.lon ? p.lon.toFixed(8) : '-',
        lat_corr_str: p.lat_corrigido ? p.lat_corrigido.toFixed(8) : (p.lat ? p.lat.toFixed(8) : '-'),
        lon_corr_str: p.lon_corrigido ? p.lon_corrigido.toFixed(8) : (p.lon ? p.lon.toFixed(8) : '-'),
        alt_bruta_str: p.alt_original ? p.alt_original.toFixed(3) : (p.alt ? p.alt.toFixed(3) : '-'),
        alt_corr_str: p.alt ? p.alt.toFixed(3) : (p.alt_original ? p.alt_original.toFixed(3) : '-'),
        delta_n_str: deltaNNum !== 0 ? (deltaNNum > 0 ? `+${deltaNNum}` : `${deltaNNum}`) : '-',
        delta_e_str: deltaENum !== 0 ? (deltaENum > 0 ? `+${deltaENum}` : `${deltaENum}`) : '-',
        delta_h_str: deltaHNum !== 0 ? (deltaHNum > 0 ? `+${deltaHNum}` : `${deltaHNum}`) : '-',
        delta_n_num: deltaNNum,
        delta_e_num: deltaENum,
        delta_h_num: deltaHNum,
        status_str: isCorrigido ? 'CORRIGIDO' : 'BRUTO',
        is_corrigido: isCorrigido,
        is_base_ppp: isBasePPP,
        is_base_fisica: isBaseFisica
      };
    });

    const htmlToEl = (htmlStr: string): HTMLElement => {
      const t = document.createElement('template');
      t.innerHTML = htmlStr.trim();
      return (t.content.firstElementChild || document.createElement('span')) as HTMLElement;
    };

    const isGeodesico = ctx.modoCoordenadas === 'geodesico';

    const colunasComunsInicio = [
      {
        id: 'ordem_num',
        rotulo: 'Ord',
        largura: 50,
        alinhamento: 'centro',
        ordenavel: true,
        render: (_: any, item: any) => {
          if (item.is_base_fisica || item.ignorar_poligono === 1) {
            return htmlToEl('<span class="text-[10px] font-bold text-white/30 font-mono">-</span>');
          }
          return htmlToEl(`<span class="text-[10px] font-bold text-mint-vibrant font-mono">${item.ordem_display}</span>`);
        }
      },
      {
        id: 'nome_vertice',
        rotulo: 'Vértice',
        largura: 110,
        alinhamento: 'esquerda',
        ordenavel: true,
        render: (_: any, item: any) => {
          const colorClass = item.is_base_ppp ? 'text-indigo-400 font-bold' : (item.is_base_fisica ? 'text-rose-400 font-bold' : 'text-white');
          const div = document.createElement('div');
          div.className = 'flex items-center gap-1.5 w-full';
          div.setAttribute('data-ponto-id', String(item.id));
          div.innerHTML = `
            <span class="text-xs ${colorClass} truncate">${item.nome_vertice}</span>
            <button class="btn-focar-ponto-mapa p-1 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors" data-ponto-id="${item.id}" title="Focar no Mapa" type="button">
              <i data-lucide="crosshair" class="w-3 h-3"></i>
            </button>
          `;
          const btn = div.querySelector('.btn-focar-ponto-mapa') as HTMLElement | null;
          if (btn) {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              ctx.selectPontoFromTabela(item.id);
              if (typeof ctx.mapaController?.destacarElemento === 'function') {
                ctx.mapaController.destacarElemento(item.id, { pan: true, zoom: 21, duracaoMs: 4000 });
              } else if (typeof ctx.mapaController?.selectPonto === 'function') {
                ctx.mapaController.selectPonto(item.id, 21);
              }
            });
          }
          return div;
        }
      },
      {
        id: 'tipo_ponto',
        rotulo: 'Tipo',
        largura: 50,
        alinhamento: 'centro',
        ordenavel: true,
        render: (_: any, item: any) => {
          if (item.is_base_ppp) return htmlToEl('<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300">M</span>');
          if (item.is_base_fisica) return htmlToEl('<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">B</span>');
          return htmlToEl(`<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/5 text-white/50">${item.tipo_ponto || item.tipo || '-'}</span>`);
        }
      }
    ];

    const colunasCoordenadas = isGeodesico ? [
      {
        id: 'lat_bruta_str',
        rotulo: 'Lat Bruta',
        largura: 120,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => htmlToEl(`<span class="text-xs text-white/80 tabular-nums font-mono">${item.lat_bruta_str}</span>`)
      },
      {
        id: 'lon_bruta_str',
        rotulo: 'Lon Bruta',
        largura: 120,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => htmlToEl(`<span class="text-xs text-white/80 tabular-nums font-mono">${item.lon_bruta_str}</span>`)
      },
      {
        id: 'lat_corr_str',
        rotulo: 'Lat Corr',
        largura: 120,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => htmlToEl(`<span class="text-xs text-mint-vibrant tabular-nums font-mono">${item.lat_corr_str}</span>`)
      },
      {
        id: 'lon_corr_str',
        rotulo: 'Lon Corr',
        largura: 120,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => htmlToEl(`<span class="text-xs text-mint-vibrant tabular-nums font-mono">${item.lon_corr_str}</span>`)
      },
      {
        id: 'alt_bruta_str',
        rotulo: 'Alt Bruta',
        largura: 80,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => htmlToEl(`<span class="text-xs text-white/80 tabular-nums font-mono">${item.alt_bruta_str}</span>`)
      },
      {
        id: 'alt_corr_str',
        rotulo: 'Alt Corr',
        largura: 80,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => htmlToEl(`<span class="text-xs text-mint-vibrant tabular-nums font-mono">${item.alt_corr_str}</span>`)
      }
    ] : [
      {
        id: 'n_original',
        rotulo: 'Norte Bruto',
        largura: 120,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => htmlToEl(`<span class="text-xs text-white/80 tabular-nums font-mono">${item.n_bruto_str}</span>`)
      },
      {
        id: 'e_original',
        rotulo: 'Este Bruto',
        largura: 120,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => htmlToEl(`<span class="text-xs text-white/80 tabular-nums font-mono">${item.e_bruto_str}</span>`)
      },
      {
        id: 'n_corrigido',
        rotulo: 'Norte Corr',
        largura: 120,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => htmlToEl(`<span class="text-xs text-mint-vibrant tabular-nums font-mono">${item.n_corr_str}</span>`)
      },
      {
        id: 'e_corrigido',
        rotulo: 'Este Corr',
        largura: 120,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => htmlToEl(`<span class="text-xs text-mint-vibrant tabular-nums font-mono">${item.e_corr_str}</span>`)
      },
      {
        id: 'delta_n_num',
        rotulo: 'Δ N (mm)',
        largura: 70,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => {
          const cor = item.delta_n_num === 0 ? 'text-white/40' : (Math.abs(item.delta_n_num) < 100 ? 'text-emerald-400' : 'text-yellow-400');
          return htmlToEl(`<span class="text-xs ${cor} tabular-nums font-mono">${item.delta_n_str}</span>`);
        }
      },
      {
        id: 'delta_e_num',
        rotulo: 'Δ E (mm)',
        largura: 70,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => {
          const cor = item.delta_e_num === 0 ? 'text-white/40' : (Math.abs(item.delta_e_num) < 100 ? 'text-emerald-400' : 'text-yellow-400');
          return htmlToEl(`<span class="text-xs ${cor} tabular-nums font-mono">${item.delta_e_str}</span>`);
        }
      },
      {
        id: 'delta_h_num',
        rotulo: 'Δ H (mm)',
        largura: 70,
        alinhamento: 'direita',
        ordenavel: true,
        render: (_: any, item: any) => {
          const cor = item.delta_h_num === 0 ? 'text-white/40' : (Math.abs(item.delta_h_num) < 100 ? 'text-emerald-400' : 'text-yellow-400');
          return htmlToEl(`<span class="text-xs ${cor} tabular-nums font-mono">${item.delta_h_str}</span>`);
        }
      }
    ];

    const colunasComunsFim = [
      {
        id: 'ignorar_poligono',
        rotulo: 'Políg',
        largura: 48,
        alinhamento: 'centro',
        ordenavel: false,
        render: (_: any, item: any) => {
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.className = 'chk-ignorar-poligono rounded border-white/10 bg-white/5 text-mint-vibrant focus:ring-mint-vibrant/30 cursor-pointer w-3.5 h-3.5';
          chk.checked = item.ignorar_poligono !== 1;
          chk.setAttribute('data-ponto-id', String(item.id));
          chk.addEventListener('change', async (e) => {
            e.stopPropagation();
            const ignorarVal = chk.checked ? 0 : 1;
            try {
              await fetch(`${API_BASE}/pontos/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ignorar_poligono: ignorarVal })
              });
              ctx.loadLevantamentoDetails();
            } catch (err) {
              console.error('Erro ao alterar participação no polígono:', err);
              showToast('Erro ao alterar participação no polígono.', 'error');
            }
          });
          return chk;
        }
      },
      {
        id: 'status_str',
        rotulo: 'Status',
        largura: 85,
        alinhamento: 'centro',
        ordenavel: true,
        render: (_: any, item: any) => {
          return htmlToEl(!item.is_corrigido
            ? '<span class="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-bold border border-yellow-500/30 text-[9px] uppercase tracking-wider">BRUTO</span>'
            : '<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 text-[9px] uppercase tracking-wider">CORRIGIDO</span>');
        }
      },
      {
        id: 'arquivo_origem',
        rotulo: 'Origem',
        largura: 130,
        alinhamento: 'esquerda',
        ordenavel: true,
        render: (_: any, item: any) => {
          if (item.arquivo_origem) {
            const cor = obterCorArquivo(item.arquivo_origem);
            return htmlToEl(`<span class="block text-[9px] font-medium font-sans mt-0.5 max-w-[120px] truncate border px-1 rounded-sm w-fit" style="background-color: ${cor}15; color: ${cor}; border-color: ${cor}30;" title="${item.arquivo_origem}">${item.arquivo_origem}</span>`);
          }
          return htmlToEl('<span class="block text-[9px] font-medium font-sans mt-0.5 max-w-[120px] truncate border px-1 rounded-sm w-fit bg-white/5 text-white/30 border-white/10" title="Sem arquivo de origem (Inserido Manual)">Inserido Manual</span>');
        }
      }
    ];

    uiTabela.colunas = [...colunasComunsInicio, ...colunasCoordenadas, ...colunasComunsFim];
    uiTabela.dados = pontosProcessados;

    if (uiTabela.shadowRoot && !uiTabela.shadowRoot.querySelector('#estilo-compacto-override')) {
      const style = document.createElement('style');
      style.id = 'estilo-compacto-override';
      style.textContent = `
        .ui-tabela__header-text { margin-right: 4px !important; }
        .ui-tabela__sort-icon,
        .ui-tabela__header-icon { width: 14px !important; min-width: 14px !important; max-width: 14px !important; }
        .ui-tabela th {
          font-size: 8.5px !important;
          font-weight: 600 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
          color: rgba(255, 255, 255, 0.4) !important;
          background-color: #0c1510 !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
          padding: 2px 6px !important;
          height: 20px !important;
        }
        .ui-tabela td {
          font-size: 10px !important;
          padding: 1px 6px !important;
          height: 18px !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03) !important;
        }
        .ui-tabela tbody tr:hover { background-color: rgba(255, 255, 255, 0.04) !important; }
      `;
      uiTabela.shadowRoot.appendChild(style);
    }

    setTimeout(() => {
      initIcons();
    }, 10);
  }

  const containerLateral = document.getElementById('container-tabela-lateral-content');
  const viewParent = containerLateral?.closest('.view-panel');
  const lateralVisivel = containerLateral && (!viewParent || !viewParent.classList.contains('hidden'));

  const renderAuditoriaLateral = () => {
    if (!containerLateral) return;
    if (pontosMat.length === 0) {
      containerLateral.innerHTML = `
        <table class="w-full text-left border-collapse">
          <tbody class="text-xs text-white/30">
            <tr><td class="px-4 py-8 text-center">Nenhum ponto para auditar translação.</td></tr>
          </tbody>
        </table>
      `;
    } else {
      const auditoriaHtml = pontosMat.map(p => renderAuditoriaTranslacaoHtml(p, ctx.latLonToUTM)).join('');
      containerLateral.innerHTML = `
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
              <th class="px-4 py-3 resizable-col" data-col-id="col_auditoria_vertice">Vértice</th>
              <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_original">Original (E/N)</th>
              <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_corrigido">Corrigido (E/N)</th>
              <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_de">dE</th>
              <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_dn">dN</th>
              <th class="px-2 py-3 text-right resizable-col" data-col-id="col_auditoria_dh">dH</th>
            </tr>
          </thead>
          <tbody class="text-xs divide-y divide-white/5 text-white/60">
            ${auditoriaHtml}
          </tbody>
        </table>
      `;
    }
  };

  (ctx as any).renderAuditoriaLateral = renderAuditoriaLateral;
  if (lateralVisivel) {
    renderAuditoriaLateral();
  }
};
