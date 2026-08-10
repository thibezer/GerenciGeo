/**
 * ccir_service.ts — Chamadas API puras para integração com o Banco de Dados CCIR.
 */
import { API_BASE } from '../../config';

export const fetchCcirFiles = async (): Promise<any[]> => {
  const res = await fetch(`${API_BASE}/ccir/files`);
  if (!res.ok) throw new Error('Erro ao buscar arquivos de planilhas CCIR');
  return res.json();
};

export const deleteCcirFile = async (filename: string): Promise<any> => {
  const res = await fetch(`${API_BASE}/ccir/files/${filename}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Erro ao remover arquivo de planilha CCIR');
  return res.json();
};

export const searchCcir = async (params: URLSearchParams): Promise<any[]> => {
  const res = await fetch(`${API_BASE}/ccir/search?${params.toString()}`);
  if (!res.ok) throw new Error('Erro na busca de imóveis CCIR');
  return res.json();
};

export const fetchCcirImovelDetails = async (codigoImovel: string): Promise<any[]> => {
  const res = await fetch(`${API_BASE}/ccir/imovel/${codigoImovel}`);
  if (!res.ok) throw new Error('Erro ao carregar detalhes do imóvel CCIR');
  return res.json();
};

export const syncCcirFolder = async (): Promise<{ sucesso: boolean; logs: string[] }> => {
  const res = await fetch(`${API_BASE}/ccir/sync`);
  if (!res.ok) throw new Error('Erro ao sincronizar pasta do CCIR');
  return res.json();
};

export const abrirPastaCcir = async (): Promise<any> => {
  const res = await fetch(`${API_BASE}/ccir/abrir-pasta`, { method: 'POST' });
  if (!res.ok) throw new Error('Erro ao abrir pasta CCIR no sistema de arquivos');
  return res.json();
};

export const fetchClientes = async (): Promise<any[]> => {
  const res = await fetch(`${API_BASE}/clientes`);
  if (!res.ok) throw new Error('Erro ao consultar clientes');
  return res.json();
};
