import type { UITabelaPropriedadesElement, UIPropertyChangeDetail } from './tipos';
import { gerarPropriedadesGerais } from './adaptador_geral';
import { gerarPropriedadesVertice } from './adaptador_vertice';
import { gerarPropriedadesMulti } from './adaptador_multi';
import { gerarPropriedadesSegmento } from './adaptador_segmento';
import {
  salvarPontoDebounced,
  salvarSegmentoDebounced,
  salvarMultiplosPontos,
  sugerirCodigoSIGEF,
  alternarExcluirPonto
} from './servico_salvamento';
import { tratarErroAPI } from '../painel_propriedades_helpers';
import type { Ponto } from '../painel_propriedades_helpers';

let panelAbortController: AbortController | null = null;

function converterBancoPontoParaPonto(bp: any): Ponto {
  const eVal = bp.este != null ? Number(bp.este) : (bp.e_corrigido != null ? Number(bp.e_corrigido) : null);
  const nVal = bp.norte != null ? Number(bp.norte) : (bp.n_corrigido != null ? Number(bp.n_corrigido) : null);
  const hVal = bp.altitude != null ? Number(bp.altitude) : (bp.alt != null ? Number(bp.alt) : null);

  return {
    id: bp.id,
    levantamento_id: bp.levantamento_id,
    matricula_id: bp.matricula_id,
    nome_vertice: bp.codigo_completo || bp.nome_vertice || `VRT-${bp.numero || bp.id}`,
    ponto_nome: bp.codigo_completo || bp.nome_vertice || `VRT-${bp.numero || bp.id}`,
    codigo_sigef: bp.codigo_completo || bp.nome_vertice || '',
    tipo_ponto: bp.tipo_ponto || 'M',
    tipo: bp.tipo_ponto || 'M',
    lat: bp.lat != null ? Number(bp.lat) : null,
    lon: bp.lon != null ? Number(bp.lon) : null,
    lat_corrigido: bp.lat != null ? Number(bp.lat) : null,
    lon_corrigido: bp.lon != null ? Number(bp.lon) : null,
    alt: hVal,
    alt_corrigido: hVal,
    alt_original: hVal,
    e_original: eVal,
    e_corrigido: eVal,
    n_original: nVal,
    n_corrigido: nVal,
    sigma_e: bp.sigma_e != null ? Number(bp.sigma_e) : 0.05,
    sigma_n: bp.sigma_n != null ? Number(bp.sigma_n) : 0.05,
    sigma_z: bp.sigma_z != null ? Number(bp.sigma_z) : (bp.sigma_alt != null ? Number(bp.sigma_alt) : 0.08),
    status_correcao: 'HOMOLOGADO',
    status_ponto: 'HOMOLOGADO',
    camada_ciclo_vida: 'HOMOLOGADO',
    origem_homologada: 1,
    arquivo_origem: bp.planilha_origem || 'Planilha Homologada SIGEF',
    metodo_posicionamento: bp.metodo_posicionamento,
    tipo_limite_sigef: bp.tipo_limite,
    tipo_limite: bp.tipo_limite,
    confrontante_descritivo: bp.confrontante_descritivo,
    matricula_confrontante: bp.matricula_confrontante,
    cns_confrontante: bp.cns_confrontante,
    confrontante_nome: bp.confrontante_descritivo,
    confrontante_matricula: bp.matricula_confrontante,
    confrontante_cartorio: bp.cns_confrontante,
    is_homologado_sigef: true
  } as any;
}

export function atualizarPainelPropriedades(ctx: any): void {
  const panelContent = document.getElementById('props-panel-content');
  const panelActions = document.getElementById('props-panel-actions');
  if (!panelContent) return;

  // Cancela o ciclo de vida de listeners anteriores evitando clones e vazamento de memória
  if (panelAbortController) {
    panelAbortController.abort();
  }
  panelAbortController = new AbortController();
  const signal = panelAbortController.signal;

  if (ctx.etapaAtiva === 'cartorio') {
    if (panelActions) panelActions.classList.add('hidden');
    return;
  }

  try {
    const selectedPontoIds: number[] = ctx.selectedPontoIds ?? [];
    const selectedVizinhoPontoIds: number[] = ctx.selectedVizinhoPontoIds ?? [];
    const selectedCount = selectedPontoIds.length;
    const selectedVizinhoCount = selectedVizinhoPontoIds.length;

    const pontosList: Ponto[] = ctx.pontosList ?? [];
    const pontosVizinhosList: Ponto[] = ctx.pontosVizinhosList ?? [];

    let tabelaEl = panelContent.querySelector('ui-tabela-propriedades') as UITabelaPropriedadesElement | null;
    if (!tabelaEl) {
      panelContent.innerHTML = '';
      panelContent.style.overflow = 'hidden';
      panelContent.style.display = 'flex';
      panelContent.style.flexDirection = 'column';
      panelContent.style.height = '100%';
      panelContent.style.minHeight = '0';
      panelContent.style.padding = '0';
      tabelaEl = document.createElement('ui-tabela-propriedades') as unknown as UITabelaPropriedadesElement;
      tabelaEl.setAttribute('id', 'ui-props-tree');
      tabelaEl.setAttribute('estilo-visual', 'autocad');
      tabelaEl.setAttribute('densidade', 'compacta');
      tabelaEl.style.height = '100%';
      tabelaEl.style.width = '100%';
      tabelaEl.style.flex = '1';
      tabelaEl.style.minHeight = '0';
      tabelaEl.style.display = 'flex';
      tabelaEl.style.flexDirection = 'column';
      panelContent.appendChild(tabelaEl);
    }

    if (ctx.selectedSegmentoId != null && ctx.selectedSegmento != null) {
      // Caso: Segmento / Divisa Selecionado
      const segmento = ctx.selectedSegmento;
      const { categorias, tipos, tipoSelecionadoId } = gerarPropriedadesSegmento(segmento, ctx);

      tabelaEl.setAttribute('modo-aplicar', 'auto');
      tabelaEl.categorias = categorias;
      tabelaEl.tipos = tipos;
      tabelaEl.tipoSelecionado = tipoSelecionadoId;

      tabelaEl.addEventListener(
        'ui-propriedade-alterada',
        (e: Event) => {
          const detail = (e as CustomEvent<UIPropertyChangeDetail>).detail;
          if (detail && detail.id) {
            salvarSegmentoDebounced(segmento, detail.id, detail.valor, ctx);
            // Se mudou o confrontante, re-renderiza o painel para atualizar campos derivados de matrícula e cartório
            if (detail.id === 'confrontante_id') {
              setTimeout(() => {
                atualizarPainelPropriedades(ctx);
              }, 100);
            }
          }
        },
        { signal }
      );

      if (panelActions) panelActions.classList.add('hidden');
    } else if (selectedCount === 0 && selectedVizinhoCount === 0) {
      // Caso 1: Sem Seleção - Propriedades Gerais do Projeto
      const { categorias, tipos, tipoSelecionadoId } = gerarPropriedadesGerais(ctx);

      tabelaEl.setAttribute('modo-aplicar', 'auto');
      tabelaEl.categorias = categorias;
      tabelaEl.tipos = tipos;
      tabelaEl.tipoSelecionado = tipoSelecionadoId;

      if (panelActions) panelActions.classList.add('hidden');
    } else if (selectedCount === 1 || (selectedCount === 0 && selectedVizinhoCount === 1)) {
      // Caso 2: Um Vértice Selecionado
      let p: Ponto | undefined;

      if (selectedCount === 1) {
        const pId = selectedPontoIds[0];
        p = pontosList.find((pt: Ponto) => String(pt.id) === String(pId));
        if (!p && ctx.bancoPontosList) {
          const bp = ctx.bancoPontosList.find((pt: any) => String(pt.id) === String(pId));
          if (bp) p = converterBancoPontoParaPonto(bp);
        }
      } else {
        const pId = selectedVizinhoPontoIds[0];
        p = pontosVizinhosList.find((pt: Ponto) => String(pt.id) === String(pId));
      }

      if (!p) {
        panelContent.innerHTML = '<div class="p-4 text-white/40 italic">Vértice não encontrado.</div>';
        if (panelActions) panelActions.classList.add('hidden');
        return;
      }

      const { categorias, tipos, tipoSelecionadoId } = gerarPropriedadesVertice(p, ctx);

      tabelaEl.setAttribute('modo-aplicar', 'auto');
      tabelaEl.categorias = categorias;
      tabelaEl.tipos = tipos;
      tabelaEl.tipoSelecionado = tipoSelecionadoId;

      tabelaEl.addEventListener(
        'ui-propriedade-alterada',
        (e: Event) => {
          const detail = (e as CustomEvent<UIPropertyChangeDetail>).detail;
          if (detail && detail.id) {
            salvarPontoDebounced(p!, detail.id, detail.valor, ctx);
          }
        },
        { signal }
      );

      tabelaEl.addEventListener(
        'ui-tipo-alterado',
        (e: Event) => {
          const detail = (e as CustomEvent<{ id: string }>).detail;
          if (detail && detail.id) {
            salvarPontoDebounced(p!, 'tipo_ponto', detail.id, ctx, 100);
          }
        },
        { signal }
      );

      tabelaEl.addEventListener(
        'ui-acao-clique',
        (e: Event) => {
          const detail = (e as CustomEvent<{ id: string }>).detail;
          if (detail.id === 'acao_sugerir_codigo') {
            sugerirCodigoSIGEF(p!, ctx, (novoCodigo) => {
              tabelaEl?.definirValor('codigo_sigef', novoCodigo);
            });
          } else if (detail.id === 'acao_excluir_vertice') {
            alternarExcluirPonto(p!, ctx).then(() => {
              atualizarPainelPropriedades(ctx);
            });
          }
        },
        { signal }
      );

      if (panelActions) panelActions.classList.add('hidden');
    } else {
      // Caso 3: Múltiplos Vértices Selecionados
      const todosPontosSelecionados = selectedPontoIds
        .map((id: number) => {
          let pt = pontosList.find((p: Ponto) => String(p.id) === String(id));
          if (!pt && ctx.bancoPontosList) {
            const bp = ctx.bancoPontosList.find((p: any) => String(p.id) === String(id));
            if (bp) pt = converterBancoPontoParaPonto(bp);
          }
          if (!pt && pontosVizinhosList) {
            pt = pontosVizinhosList.find((p: Ponto) => String(p.id) === String(id));
          }
          return pt;
        })
        .filter((pt?: Ponto): pt is Ponto => Boolean(pt));

      const pontosMulti: Ponto[] = todosPontosSelecionados.filter(
        (pt: Ponto) => pt.ponto_vizinho !== 1 && !(pt as any).is_homologado_sigef
      );

      const { categorias, tipos, tipoSelecionadoId } = gerarPropriedadesMulti(pontosMulti, ctx);

      tabelaEl.setAttribute('modo-aplicar', 'manual');
      tabelaEl.categorias = categorias;
      tabelaEl.tipos = tipos;
      tabelaEl.tipoSelecionado = tipoSelecionadoId;

      tabelaEl.addEventListener(
        'ui-aplicar',
        (e: Event) => {
          const detail = (e as CustomEvent<{ valores: Record<string, any> }>).detail;
          if (detail && detail.valores) {
            salvarMultiplosPontos(pontosMulti, detail.valores, ctx).then(() => {
              atualizarPainelPropriedades(ctx);
            });
          }
        },
        { signal }
      );

      tabelaEl.addEventListener(
        'ui-desfazer',
        () => {
          atualizarPainelPropriedades(ctx);
        },
        { signal }
      );

      tabelaEl.addEventListener(
        'ui-acao-clique',
        (e: Event) => {
          const detail = (e as CustomEvent<{ id: string }>).detail;
          if (detail.id === 'acao_ignorar_todos') {
            document.getElementById('btn-batch-ignorar')?.click();
          } else if (detail.id === 'acao_excluir_selecionados') {
            document.getElementById('btn-batch-deletar')?.click();
          }
        },
        { signal }
      );

      if (panelActions) panelActions.classList.add('hidden');
    }
  } catch (err) {
    console.error('Erro ao atualizar painel de propriedades:', err);
    panelContent.innerHTML = `
      <div class="p-4 text-rose-400 text-xs italic select-none">
        ❌ Erro ao renderizar propriedades: ${tratarErroAPI(err, 'Falha interna ao exibir propriedades')}
      </div>
    `;
  }
}
