import { API_BASE } from '../../config';
import { escapeHtml, showToast } from '../../utils';
import { extrairDetalhe } from './emissao_pecas';
import type { ResumoConfrontantes } from './lista_confrontantes_tipos';

export async function buscarResumoConfrontantes(
  levId: number,
  matId: number,
  signal: AbortSignal
): Promise<ResumoConfrontantes> {
  const res = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/resumo-confrontantes`, { signal });
  if (!res.ok) {
    throw new Error(await extrairDetalhe(res, 'Não foi possível carregar os confrontantes.'));
  }
  return await res.json();
}

export async function despacharDispensaAnuencia(
  levId: number,
  confrontanteId: number,
  dispensada: boolean,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/levantamentos/${levId}/confrontantes/${confrontanteId}/dispensa-anuencia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dispensada }),
    signal,
  });
  if (!res.ok) {
    throw new Error(await extrairDetalhe(res, 'Não foi possível alterar a dispensa da anuência.'));
  }
  showToast(dispensada ? 'Anuência dispensada.' : 'Anuência voltou a ser exigida.', 'success', 2000);
}

export async function despacharAssinaturaAnuencia(
  levId: number,
  matId: number,
  confrontanteId: number,
  nomeConfrontante: string,
  assinada: boolean,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/confrontantes/${confrontanteId}/anuencia-assinada`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assinada }),
    signal,
  });
  if (!res.ok) {
    throw new Error(await extrairDetalhe(res, 'Não foi possível salvar o status da anuência.'));
  }
  showToast(
    assinada
      ? `Anuência de ${escapeHtml(nomeConfrontante)} marcada como assinada.`
      : `Anuência de ${escapeHtml(nomeConfrontante)} desmarcada.`,
    'success',
    2000
  );
}
