import { API_BASE } from '../../../config';
import { customAlert, showToast } from '../../../utils';
import {
  parseNumberOrNull,
  tratarErroAPI
} from '../painel_propriedades_helpers';
import type { Ponto } from '../painel_propriedades_helpers';

export {
  salvarSegmentoDebounced,
  enviarPendentesSegmento
} from './servico_salvamento_segmento';

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPontoUpdates: Record<string, any> = {};
let currentPontoAlvo: Ponto | null = null;

export function salvarPontoDebounced(
  p: Ponto,
  propId: string,
  novoValor: any,
  ctx: any,
  delay: number = 600
): void {
  // As alterações pendentes pertencem a um único ponto: se o usuário já está editando outro,
  // envia agora as do ponto anterior para não gravá-las no novo (normalizado via String).
  if (currentPontoAlvo && String(currentPontoAlvo.id) !== String(p.id)) {
    enviarPendentesPonto(ctx);
  }
  currentPontoAlvo = p;

  switch (propId) {
    case 'nome_vertice':
      pendingPontoUpdates.nome_vertice = String(novoValor ?? '').trim();
      break;
    case 'codigo_sigef':
      pendingPontoUpdates.codigo_sigef = String(novoValor ?? '').trim();
      break;
    case 'matricula_id':
      pendingPontoUpdates.matricula_id = novoValor !== '' && novoValor != null ? Number(novoValor) : null;
      break;
    case 'tipo_ponto': {
      const tipo = String(novoValor ?? '').trim().toUpperCase();
      if (tipo) pendingPontoUpdates.tipo_ponto = tipo;
      break;
    }
    case 'e_corrigido':
      pendingPontoUpdates.e_corrigido = parseNumberOrNull(novoValor);
      break;
    case 'n_corrigido':
      pendingPontoUpdates.n_corrigido = parseNumberOrNull(novoValor);
      break;
    case 'alt_corrigido':
      pendingPontoUpdates.alt_corrigido = parseNumberOrNull(novoValor);
      break;
    case 'lat':
      pendingPontoUpdates.lat = parseNumberOrNull(novoValor);
      break;
    case 'lon':
      pendingPontoUpdates.lon = parseNumberOrNull(novoValor);
      break;
    case 'sigma_e':
      pendingPontoUpdates.sigma_e = parseNumberOrNull(novoValor);
      break;
    case 'sigma_n':
      pendingPontoUpdates.sigma_n = parseNumberOrNull(novoValor);
      break;
    case 'sigma_z':
      pendingPontoUpdates.sigma_z = parseNumberOrNull(novoValor);
      break;
    case 'metodo_posicionamento':
      pendingPontoUpdates.metodo_posicionamento = String(novoValor ?? '').trim();
      break;
    case 'tipo_limite_sigef':
      pendingPontoUpdates.tipo_limite_sigef = String(novoValor ?? '').trim();
      break;
    case 'ignorar_poligono':
      pendingPontoUpdates.ignorar_poligono = novoValor ? 1 : 0;
      break;
    case 'confrontante_nome':
    case 'confrontante_matricula':
    case 'confrontante_cartorio': {
      if (!pendingPontoUpdates.confrontante) {
        // Parte do confrontante já vinculado (id + valores atuais) para atualizá-lo em vez de duplicar
        const seg = (ctx.segmentosList ?? []).find((s: any) => String(s.ponto_inicio_id) === String(p.id));
        const confId = (p as any).confrontante_id || seg?.confrontante_id || null;
        const atual = confId
          ? (ctx.confrontantesList ?? []).find((c: any) => String(c.id) === String(confId))
          : null;
        pendingPontoUpdates.confrontante = {
          ...(atual ? { id: atual.id } : {}),
          nome: atual?.nome ?? p.confrontante_nome ?? '',
          matricula_imovel: atual?.matricula_imovel ?? p.confrontante_matricula ?? '',
          cns_confrontante: atual?.cns_confrontante ?? p.confrontante_cartorio ?? ''
        };
      }
      if (propId === 'confrontante_nome') pendingPontoUpdates.confrontante.nome = String(novoValor ?? '').trim();
      if (propId === 'confrontante_matricula') pendingPontoUpdates.confrontante.matricula_imovel = String(novoValor ?? '').trim();
      if (propId === 'confrontante_cartorio') pendingPontoUpdates.confrontante.cns_confrontante = String(novoValor ?? '').trim();
      break;
    }
  }

  // Se coordenadas UTM estão sendo enviadas, anexa o fuso da sessão caso não informado
  if (['e_corrigido', 'n_corrigido', 'alt_corrigido'].some(k => pendingPontoUpdates[k] !== undefined)) {
    const fusoSalvo = localStorage.getItem(`utm_zone_${ctx.currentLevId}`) || p.fuso || '22S';
    pendingPontoUpdates.fuso = String(fusoSalvo);
  }

  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = setTimeout(() => enviarPendentesPonto(ctx), delay);
}

export async function enviarPendentesPonto(ctx: any): Promise<void> {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  const pontoAlvo = currentPontoAlvo;
  if (!pontoAlvo || Object.keys(pendingPontoUpdates).length === 0) return;

  const payload = { ...pendingPontoUpdates };
  const pontoId = pontoAlvo.id;
  pendingPontoUpdates = {};

  try {
    const res = await fetch(`${API_BASE}/pontos/${pontoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.error || 'Erro ao salvar alterações do vértice');
    }

    const data = await res.json();
    if (data.ponto) {
      Object.assign(pontoAlvo, data.ponto);
      // Atualiza também a referência dentro de ctx.pontosList se aplicável
      if (Array.isArray(ctx.pontosList)) {
        const idx = ctx.pontosList.findIndex((pt: Ponto) => String(pt.id) === String(pontoId));
        if (idx !== -1) {
          Object.assign(ctx.pontosList[idx], data.ponto);
        }
      }
    }

    // Coordenada de uma base dispara no backend a translação em bloco dos rovers vinculados;
    // sem recarregar, só a base seria atualizada localmente e os rovers ficariam na posição antiga.
    const alterouCoordenada = ['e_corrigido', 'n_corrigido', 'alt_corrigido', 'lat', 'lon'].some(k => payload[k] !== undefined);
    const ehBase = pontoAlvo.tipo_ponto === 'B'
      || (ctx.pontosList ?? []).some((pt: Ponto) => String(pt.ponto_base_id) === String(pontoId));

    if (payload.confrontante !== undefined) {
      // Atualiza só confrontantes/segmentos locais, sem redesenhar painel/mapa/tabela,
      // para a edição não "sumir" ao reabrir o ponto.
      try {
        const [resSeg, resConf] = await Promise.all([
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/segmentos`),
          fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`)
        ]);
        if (resSeg.ok) {
          const segs = await resSeg.json();
          if (Array.isArray(segs)) ctx.segmentosList = segs;
        }
        if (resConf.ok) {
          const confs = await resConf.json();
          if (Array.isArray(confs)) ctx.confrontantesList = confs;
        }
      } catch (errSync) {
        console.warn('Erro ao sincronizar confrontantes:', errSync);
      }
    }

    if (payload.matricula_id !== undefined || payload.tipo_ponto !== undefined || payload.ignorar_poligono !== undefined) {
      // Trocar a matrícula faz o backend apagar e recriar as divisas e reordenar as duas matrículas;
      // as listas locais ficariam desatualizadas e o mapa seguiria desenhando o vértice no perímetro antigo.
      // O tipo também muda o perímetro (B fica de fora), os filtros de Bases e as cores do mapa.
      await ctx.loadLevantamentoDetails?.();
      ctx.atualizarPainelPropriedades?.();
      return;
    }

    if (alterouCoordenada && ehBase) {
      // Coordenada de uma base dispara no backend a translação em bloco dos rovers vinculados.
      // Sincroniza a lista de pontos, tabela e mapa SILENCIOSAMENTE em background,
      // NUNCA recarregando o painel de propriedades para não roubar o foco nem cancelar a edição do usuário.
      try {
        const resPts = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos`);
        if (resPts.ok) {
          const novosPontos = await resPts.json();
          if (Array.isArray(novosPontos)) {
            ctx.pontosList = novosPontos;
            ctx.renderMatriculaDados?.();
            ctx.atualizarPolilinhaMapaTemp?.();
          }
        }
      } catch (errSync) {
        console.warn('Erro ao sincronizar rovers pós-translação:', errSync);
      }
    } else {
      ctx.atualizarPolilinhaMapaTemp?.();
    }

    // Atualiza valores derivados visuais no painel sem reconstruir o DOM e sem perder foco
    const tabelaEl = document.getElementById('ui-props-tree') as any;
    if (tabelaEl && typeof tabelaEl.definirValor === 'function') {
      if (data.ponto?.status_ponto) {
        tabelaEl.definirValor('status_correcao', data.ponto.status_ponto, false);
      }
      if (data.ponto?.delta_3d != null) {
        const descStr = `ΔE ${Number(data.ponto.delta_e ?? 0).toFixed(1)} · ΔN ${Number(data.ponto.delta_n ?? 0).toFixed(1)} · 3D ${Number(data.ponto.delta_3d).toFixed(1)} mm`;
        tabelaEl.definirValor('deslocamento', descStr, false);
      }
    }

    ctx.atualizarPolilinhaMapaTemp?.();
    if (false && payload.ignorar_poligono !== undefined) {
      ctx.renderMatriculaDados?.();
    }
  } catch (err) {
    console.error('Erro no salvamento do ponto:', err);
    showToast(tratarErroAPI(err, 'Falha ao salvar vértice.'), 'error');
  }
}

export async function salvarMultiplosPontos(
  pontosMulti: Ponto[],
  todosValores: Record<string, any>,
  ctx: any
): Promise<void> {
  const batchPayload: { pontos: any[] } = { pontos: [] };

  for (const p of pontosMulti) {
    const item: any = { id: p.id };

    if (todosValores.multi_tipo_ponto) {
      item.tipo_ponto = todosValores.multi_tipo_ponto;
    }
    if (todosValores.multi_matricula_id !== undefined && todosValores.multi_matricula_id !== '') {
      item.matricula_id = todosValores.multi_matricula_id ? Number(todosValores.multi_matricula_id) : null;
    }
    if (todosValores.multi_metodo_posicionamento) {
      item.metodo_posicionamento = todosValores.multi_metodo_posicionamento;
    }
    if (todosValores.multi_tipo_limite_sigef) {
      item.tipo_limite_sigef = todosValores.multi_tipo_limite_sigef;
    }
    if (todosValores.multi_ignorar_poligono !== undefined) {
      item.ignorar_poligono = todosValores.multi_ignorar_poligono ? 1 : 0;
    }

    const confNome = todosValores.multi_confrontante_nome?.trim();
    const confMat = todosValores.multi_confrontante_matricula?.trim();
    const confCns = todosValores.multi_confrontante_cartorio?.trim();

    if (confNome || confMat || confCns) {
      item.confrontante = {
        nome: confNome || 'Confrontante',
        matricula_imovel: confMat || null,
        cns_confrontante: confCns || null
      };
    }

    if (Object.keys(item).length > 1) {
      batchPayload.pontos.push(item);
    }
  }

  if (batchPayload.pontos.length === 0) {
    showToast('Nenhuma alteração detectada para aplicar no lote.', 'info');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos/batch`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchPayload)
    });

    if (res.status === 403) {
      await customAlert('Este projeto está ARQUIVADO e não pode ser modificado (Modo Somente Leitura).');
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || errData.error || 'Falha ao salvar lote de vértices');
    }

    showToast(`${batchPayload.pontos.length} vértices atualizados com sucesso!`, 'success');
    await ctx.loadLevantamentoDetails();
  } catch (err) {
    console.error('Erro ao salvar em lote:', err);
    showToast(tratarErroAPI(err, 'Erro ao salvar alterações em lote.'), 'error');
  }
}

export async function sugerirCodigoSIGEF(p: Ponto, ctx: any, onAtualizado: (codigo: string) => void): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos-sugeridos`);
    if (!res.ok) {
      throw new Error('Falha ao obter sugestões de código.');
    }
    const data = await res.json();
    // O backend devolve uma sugestão por tipo ({ M, P, V }): a letra do código SIGEF tem de ser a do tipo do ponto
    const tipo = String(p.tipo_ponto || p.tipo || '').toUpperCase();
    if (tipo === 'B') {
      showToast('Base (B) não recebe código SIGEF: só marcos (M), pontos (P) e vértices virtuais (V).', 'info');
      return;
    }
    const proximoCodigo: string | undefined = data.sugestoes?.[tipo]?.codigo_sugerido;
    if (!proximoCodigo) {
      showToast('Nenhum código sugerido disponível para este tipo de ponto.', 'info');
      return;
    }

    onAtualizado(proximoCodigo);
    salvarPontoDebounced(p, 'codigo_sigef', proximoCodigo, ctx, 50);
    showToast(`Código sugerido aplicado: ${proximoCodigo}`, 'success');
  } catch (err) {
    console.error('Erro ao sugerir código:', err);
    showToast(tratarErroAPI(err, 'Erro ao buscar sugestão de código.'), 'error');
  }
}

export async function alternarExcluirPonto(p: Ponto, ctx: any): Promise<void> {
  const isIgnorado = p.ignorar_poligono === 1;
  const novoEstado = isIgnorado ? 0 : 1;
  p.ignorar_poligono = novoEstado;

  salvarPontoDebounced(p, 'ignorar_poligono', novoEstado === 1, ctx, 50);
  showToast(novoEstado === 1 ? 'Vértice desativado do polígono.' : 'Vértice reativado no polígono.', 'info');
}
