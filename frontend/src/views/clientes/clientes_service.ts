import { API_BASE } from '../../config';

export const fetchTodosClientes = async (): Promise<any[]> => {
   const res = await fetch(`${API_BASE}/clientes`);
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return Array.isArray(data) ? data : [];
};

export const fetchClienteHistorico = async (id: number): Promise<any[]> => {
   const res = await fetch(`${API_BASE}/clientes/${id}/historico`);
   const logs = await res.json();
   return Array.isArray(logs) ? logs : [];
};

export const salvarCliente = async (payload: any, id?: number | null): Promise<any> => {
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
      if (data.error) errMsg = data.error;
      else if (data.detail) {
         errMsg = Array.isArray(data.detail) 
            ? data.detail.map((d: any) => `${d.loc.join('.')}: ${d.msg}`).join('\n') 
            : JSON.stringify(data.detail);
      }
      throw new Error(errMsg);
   }
   if (data.error) throw new Error(data.error);
   return data;
};

export const excluirClienteIndividual = async (id: number): Promise<any> => {
   const res = await fetch(`${API_BASE}/clientes/${id}`, { method: 'DELETE' });
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
};

export const excluirClientesEmLote = async (ids: number[]): Promise<{ sucessos: number; erros: string[] }> => {
   const promises = ids.map(id =>
      fetch(`${API_BASE}/clientes/${id}`, { method: 'DELETE' }).then(res => res.json())
   );
   const results = await Promise.all(promises);
   const erros = results.filter(r => r.error).map(e => e.error);
   const sucessos = ids.length - erros.length;
   return { sucessos, erros };
};

export const salvarMetadadosCliente = async (id: number, payloadCliente: any): Promise<any> => {
   const res = await fetch(`${API_BASE}/clientes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadCliente)
   });
   if (!res.ok) throw new Error("Falha ao salvar metadados.");
   return res.json();
};

export const carregarCidadesIbgeService = async (uf: string): Promise<string[]> => {
   const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
   const cidades = await res.json();
   if (Array.isArray(cidades)) {
      return cidades.map((c: any) => c.nome);
   }
   return [];
};

export const buscarCepViaCepService = async (cep: string): Promise<any> => {
   const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
   const data = await res.json();
   if (data && !data.erro) {
      return data;
   }
   return null;
};
