import { API_BASE } from '../../config';
import type {
  Cliente,
  ClientePayload,
  ClienteHistoricoLog,
  ExcluirLoteResponse,
  ViaCepResponse
} from '../../types';

export const fetchTodosClientes = async (): Promise<Cliente[]> => {
  const res = await fetch(`${API_BASE}/clientes`);
  if (!res.ok) {
    throw new Error(`Erro ao carregar clientes: ${res.statusText}`);
  }
  const data = await res.json();
  if (data && data.error) {
    throw new Error(data.error);
  }
  return Array.isArray(data) ? data : [];
};

export const fetchClienteHistorico = async (id: number): Promise<ClienteHistoricoLog[]> => {
  const res = await fetch(`${API_BASE}/clientes/${id}/historico`);
  if (!res.ok) {
    throw new Error(`Erro ao carregar histórico: ${res.statusText}`);
  }
  const logs = await res.json();
  return Array.isArray(logs) ? logs : [];
};

export const salvarCliente = async (payload: ClientePayload, id?: number | null): Promise<{ message: string; id?: number }> => {
  const url = id ? `${API_BASE}/clientes/${id}` : `${API_BASE}/clientes`;
  const method = id ? 'PUT' : 'POST';
  
  const res = await fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    let errMsg = "Erro ao salvar cliente.";
    if (data.error) {
      errMsg = data.error;
    } else if (data.detail) {
      errMsg = Array.isArray(data.detail) 
        ? data.detail.map((d: { loc: (string | number)[]; msg: string }) => `${d.loc.join('.')}: ${d.msg}`).join('\n') 
        : typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    }
    throw new Error(errMsg);
  }
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
};

export const excluirClienteIndividual = async (id: number): Promise<{ message: string }> => {
  const res = await fetch(`${API_BASE}/clientes/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.detail || data.error || "Erro ao excluir cliente.");
  }
  return data;
};

export const excluirClientesEmLote = async (ids: number[]): Promise<ExcluirLoteResponse> => {
  const res = await fetch(`${API_BASE}/clientes/excluir-lote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente_ids: ids })
  });
  const data: ExcluirLoteResponse = await res.json();
  if (!res.ok) {
    throw new Error((data as unknown as { detail?: string }).detail || "Falha na exclusão em lote de clientes.");
  }
  return data;
};

export const salvarMetadadosCliente = async (id: number, payloadCliente: ClientePayload): Promise<Cliente> => {
  const res = await fetch(`${API_BASE}/clientes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadCliente)
  });
  if (!res.ok) {
    throw new Error("Falha ao salvar metadados do cliente.");
  }
  return res.json();
};

export const carregarCidadesIbgeService = async (uf: string): Promise<string[]> => {
  try {
    const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
    if (!res.ok) return [];
    const cidades = await res.json();
    if (Array.isArray(cidades)) {
      return cidades.map((c: { nome: string }) => c.nome);
    }
    return [];
  } catch {
    return [];
  }
};

export const buscarCepViaCepService = async (cep: string): Promise<ViaCepResponse | null> => {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!res.ok) return null;
    const data: ViaCepResponse = await res.json();
    if (data && !data.erro) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
};
