import { API_BASE } from '../../../config';
import { customAlert, showToast } from '../../../utils';
import {
  parseNumberOrNull,
  tratarErroAPI
} from '../painel_propriedades_helpers';
import type { Ponto } from '../painel_propriedades_helpers';

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
    case 'tipo_ponto':
      pendingPontoUpdates.tipo_ponto = String(novoValor ?? '').toUpperCase();
      break;
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
        pendingPontoUpdates.confrontante = {
          nome: p.confrontante_nome || '',
          matricula_imovel: p.confrontante_matricula || '',
          cns_confrontante: p.confrontante_cartorio || ''
        };
      }
      if (propId === 'confrontante_nome') pendingPontoUpdates.confrontante.nome = String(novoValor ?? '').trim();
      if (propId === 'confrontante_matricula') pendingPontoUpdates.confrontante.matricula_imovel = String(novoValor ?? '').trim();
      if (propId === 'confrontante_cartorio') pendingPontoUpdates.confrontante.cns_confrontante = String(novoValor ?? '').trim();
      break;
    }
  }

  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = setTimeout(async () => {
    if (!currentPontoAlvo || Object.keys(pendingPontoUpdates).length === 0) return;

    const payload = { ...pendingPontoUpdates };
    const pontoId = currentPontoAlvo.id;
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
      if (data.ponto && currentPontoAlvo) {
        Object.assign(currentPontoAlvo, data.ponto);
      }

      ctx.atualizarPolilinhaMapaTemp?.();
      if (payload.matricula_id !== undefined || payload.ignorar_poligono !== undefined) {
        ctx.renderMatriculaDados?.();
      }
    } catch (err) {
      console.error('Erro no salvamento do ponto:', err);
      showToast(tratarErroAPI(err, 'Falha ao salvar vértice.'), 'error');
    }
  }, delay);
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
    const sugestoes: string[] = data.sugestoes || [];
    if (sugestoes.length === 0) {
      showToast('Nenhum código sugerido disponível.', 'info');
      return;
    }

    const proximoCodigo = sugestoes[0];
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
