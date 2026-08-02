import { API_BASE } from '../../config';

export const fetchTodasPropriedades = async (): Promise<any[]> => {
   const res = await fetch(`${API_BASE}/propriedades`);
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return Array.isArray(data) ? data : [];
};

export const fetchTodosClientesList = async (): Promise<any[]> => {
   const res = await fetch(`${API_BASE}/clientes`);
   const data = await res.json();
   return Array.isArray(data) ? data : [];
};

export const salvarPropriedade = async (payload: any, id?: number | null): Promise<any> => {
   const url = id ? `${API_BASE}/propriedades/${id}` : `${API_BASE}/propriedades`;
   const method = id ? 'PUT' : 'POST';

   const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
   });

   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
};

export const excluirPropriedadeIndividual = async (id: number): Promise<any> => {
   const res = await fetch(`${API_BASE}/propriedades/${id}`, { method: 'DELETE' });
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
};

export const excluirPropriedadesEmLote = async (ids: number[]): Promise<{ sucessos: number; erros: string[] }> => {
   const promises = ids.map(id =>
      fetch(`${API_BASE}/propriedades/${id}`, { method: 'DELETE' }).then(res => res.json())
   );
   const results = await Promise.all(promises);
   const erros = results.filter(r => r.error).map(e => e.error);
   const sucessos = ids.length - erros.length;
   return { sucessos, erros };
};

export const vincularProprietario = async (propId: number, clienteId: number, percentual: number): Promise<any> => {
   const res = await fetch(`${API_BASE}/propriedades/${propId}/proprietarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId, percentual_participacao: percentual })
   });
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
};

export const removerProprietario = async (propId: number, clienteId: number): Promise<any> => {
   const res = await fetch(`${API_BASE}/propriedades/${propId}/proprietarios/${clienteId}`, { method: 'DELETE' });
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
};

export const uploadAnexoDocumento = async (propId: number, tipo: 'car' | 'ccir', file: File): Promise<any> => {
   const formData = new FormData();
   formData.append('file', file);
   formData.append('tipo_documento', tipo);

   const res = await fetch(`${API_BASE}/propriedades/${propId}/anexos`, {
      method: 'POST',
      body: formData
   });
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
};

export const deletarAnexoDocumento = async (propId: number, tipo: 'car' | 'ccir'): Promise<any> => {
   const res = await fetch(`${API_BASE}/propriedades/${propId}/anexos/${tipo}`, { method: 'DELETE' });
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
};

export const fetchMatriculasPropriedade = async (propId: number): Promise<any[]> => {
   const res = await fetch(`${API_BASE}/propriedades/${propId}/matriculas`);
   const data = await res.json();
   return Array.isArray(data) ? data : [];
};

export const salvarMatricula = async (payload: any, id?: number | null): Promise<any> => {
   const url = id ? `${API_BASE}/matriculas/${id}` : `${API_BASE}/propriedades/${payload.propriedade_id}/matriculas`;
   const method = id ? 'PUT' : 'POST';

   const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
   });
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
};

export const excluirMatriculaService = async (id: number): Promise<any> => {
   const res = await fetch(`${API_BASE}/matriculas/${id}`, { method: 'DELETE' });
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
};

export const fetchMatriculaHistorico = async (id: number): Promise<any[]> => {
   const res = await fetch(`${API_BASE}/matriculas/${id}/historico`);
   const logs = await res.json();
   return Array.isArray(logs) ? logs : [];
};
