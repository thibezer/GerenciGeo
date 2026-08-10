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

export const consultarSigefGetFeatureInfo = async (
  x: number,
  y: number,
  size: { x: number; y: number },
  bbox: string
): Promise<string> => {
  const targetUrl = `https://acervofundiario.incra.gov.br/i3geo/ogc.php?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&FORMAT=image/png&TRANSPARENT=true&QUERY_LAYERS=certificada_sigef_particular_pr&LAYERS=certificada_sigef_particular_pr&INFO_FORMAT=text/plain&X=${x}&Y=${y}&WIDTH=${size.x}&HEIGHT=${size.y}&SRS=EPSG:4326&BBOX=${bbox}`;
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
  const res = await fetch(proxyUrl);
  return res.text();
};
