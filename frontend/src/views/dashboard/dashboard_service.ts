/**
 * dashboard_service.ts — Chamadas HTTP/API puras do Panorama Operacional.
 */
import { API_BASE } from '../../config';

export const fetchStatus = async (): Promise<{ status: string; version?: string }> => {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const fetchStats = async (): Promise<{ clientes: number; propriedades: number; profissionais: number }> => {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const fetchAlerts = async (): Promise<{ alerts: any[] }> => {
  const res = await fetch(`${API_BASE}/dashboard/alerts`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const concluirPendencia = async (id: number): Promise<void> => {
  const res = await fetch(`${API_BASE}/pendencias/${id}/concluir`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

export const criarPendenciaRapida = async (titulo: string, prioridade: string, descricao?: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/pendencias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titulo: titulo.trim(),
      prioridade: prioridade || 'MEDIA',
      descricao: (descricao || '').trim()
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

export const excluirPendencia = async (id: number): Promise<void> => {
  const res = await fetch(`${API_BASE}/pendencias/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

export const fetchGeometrias = async (): Promise<any[]> => {
  const res = await fetch(`${API_BASE}/dashboard/matriculas-geometrias`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const downloadLocalShapefile = (levId: number, matId: number, numeroMatricula: string) => {
  const url = `${API_BASE}/levantamentos/${levId}/matriculas/${matId}/exportar-shapefile`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `matricula_${numeroMatricula}_shapefile.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

