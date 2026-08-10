/**
 * fronteira_service.ts — Camada de serviço (chamadas API) do módulo Fronteira.
 * Funções puras de fetch que retornam dados. Sem manipulação de DOM ou estado.
 */
import { API_BASE } from '../../config';

export const fetchPropriedades = async (): Promise<any[]> => {
  const res = await fetch(`${API_BASE}/propriedades`);
  return res.json();
};

export const fetchProfissionais = async (): Promise<any[]> => {
  const res = await fetch(`${API_BASE}/profissionais`);
  return res.json();
};

export const fetchDadosFronteira = async (propId: number): Promise<any> => {
  const res = await fetch(`${API_BASE}/propriedades/${propId}/dados-fronteira`);
  return res.json();
};

export const fetchLevantamentos = async (): Promise<any[]> => {
  const res = await fetch(`${API_BASE}/levantamentos`);
  return res.json();
};

export const fetchPontosLevantamento = async (levId: number): Promise<any[]> => {
  const res = await fetch(`${API_BASE}/levantamentos/${levId}/pontos`);
  return res.json();
};

export const uploadShapefileFronteira = async (propId: number, file: File, matriculaId?: number): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  const url = matriculaId
    ? `${API_BASE}/propriedades/${propId}/upload-shapefile-fronteira?matricula_id=${matriculaId}`
    : `${API_BASE}/propriedades/${propId}/upload-shapefile-fronteira`;
  const res = await fetch(url, { method: 'POST', body: formData });
  return res.json();
};

export const salvarDadosFronteira = async (propId: number, payload: any): Promise<any> => {
  const res = await fetch(`${API_BASE}/propriedades/${propId}/atualizar-dados-fronteira`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
};

export const atualizarLevantamentoAPI = async (levId: number, payload: any): Promise<any> => {
  const res = await fetch(`${API_BASE}/levantamentos/${levId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
};

export const abrirLaudoFronteiraURL = (levId: number, mId: number, trt: string, dataTrt: string): string => {
  return `${API_BASE}/levantamentos/${levId}/matriculas/${mId}/laudo-fronteira-html?numero_trt=${encodeURIComponent(trt)}&data_trt=${encodeURIComponent(dataTrt)}`;
};

export const abrirRequerimentoFronteiraURL = (levId: number, mId: number): string => {
  return `${API_BASE}/levantamentos/${levId}/matriculas/${mId}/requerimento-ratificacao-html`;
};
