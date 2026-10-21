import { API_BASE } from '../../../config';
import { showToast } from '../../../utils';
import { tratarErroAPI } from '../painel_propriedades_helpers';

let autoSaveSegmentoTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSegmentoUpdates: Record<string, any> = {};
let currentSegmentoAlvo: any = null;

export function salvarSegmentoDebounced(
  segmento: any,
  propId: string,
  novoValor: any,
  ctx: any,
  delay: number = 600
): void {
  // Pendências de outra divisa são enviadas antes de trocar o alvo (normalizado para string)
  if (currentSegmentoAlvo && String(currentSegmentoAlvo.id) !== String(segmento?.id)) {
    enviarPendentesSegmento(ctx);
  }
  currentSegmentoAlvo = segmento;

  switch (propId) {
    case 'tipo_limite_sigef':
      pendingSegmentoUpdates.tipo_limite_sigef = String(novoValor ?? '').trim();
      segmento.tipo_limite_sigef = pendingSegmentoUpdates.tipo_limite_sigef;
      break;
    case 'metodo_posicionamento_sigef':
      pendingSegmentoUpdates.metodo_posicionamento_sigef = String(novoValor ?? '').trim();
      segmento.metodo_posicionamento_sigef = pendingSegmentoUpdates.metodo_posicionamento_sigef;
      break;
    case 'matricula_id':
      pendingSegmentoUpdates.matricula_id = novoValor !== '' && novoValor != null ? Number(novoValor) : null;
      segmento.matricula_id = pendingSegmentoUpdates.matricula_id;
      break;
    case 'confrontante_id':
      pendingSegmentoUpdates.confrontante_id = novoValor !== '' && novoValor != null ? Number(novoValor) : null;
      segmento.confrontante_id = pendingSegmentoUpdates.confrontante_id;
      break;
    case 'anuencia_assinada':
      pendingSegmentoUpdates.anuencia_assinada = novoValor ? 1 : 0;
      segmento.anuencia_assinada = pendingSegmentoUpdates.anuencia_assinada;
      break;
  }

  if (autoSaveSegmentoTimer) {
    clearTimeout(autoSaveSegmentoTimer);
  }

  autoSaveSegmentoTimer = setTimeout(() => enviarPendentesSegmento(ctx), delay);
}

export async function enviarPendentesSegmento(ctx: any): Promise<void> {
  if (autoSaveSegmentoTimer) {
    clearTimeout(autoSaveSegmentoTimer);
    autoSaveSegmentoTimer = null;
  }
  if (!currentSegmentoAlvo || Object.keys(pendingSegmentoUpdates).length === 0) return;

  const payload = { ...pendingSegmentoUpdates };
  const segId = currentSegmentoAlvo.id;
  pendingSegmentoUpdates = {};

  if (!segId) {
    console.warn('Segmento sem ID no banco para persistência direta.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/segmentos/${segId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.error || 'Erro ao salvar alterações do segmento/divisa');
    }

    showToast('Divisa atualizada com sucesso!', 'success');

    // Atualiza o segmento na lista do contexto
    if (ctx.segmentosList) {
      const idx = ctx.segmentosList.findIndex((s: any) => String(s.id) === String(segId));
      if (idx !== -1) {
        ctx.segmentosList[idx] = { ...ctx.segmentosList[idx], ...payload };
      }
    }

    // Re-plota segmentos no mapa para atualizar cores/estilos
    if (ctx.mapaController && ctx.pontosList) {
      const effectiveMatId = ctx.currentMatriculaId;
      const segmentosMat = effectiveMatId
        ? (ctx.segmentosList || []).filter((s: any) => String(s.matricula_id) === String(effectiveMatId))
        : (ctx.segmentosList || []);
      ctx.mapaController.plotSegmentos(segmentosMat, ctx.pontosList);
    }
  } catch (err) {
    console.error('Erro no salvamento do segmento:', err);
    showToast(tratarErroAPI(err, 'Falha ao salvar segmento.'), 'error');
  }
}
