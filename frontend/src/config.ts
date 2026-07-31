const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000';

// Se o frontend estiver rodando no servidor de desenvolvimento do Vite (porta 5173 ou 3000),
// redirecionamos as chamadas da API para o backend local na porta 8000.
// Caso contrário (servido pelo uvicorn no app desktop ou na Hostinger), usa a mesma origem dinâmica da página.
export const API_BASE = (origin.includes(':5173') || origin.includes(':3000'))
  ? 'http://127.0.0.1:8000'
  : origin;

export const PUBLIC_HOST_URL = 'https://darkgray-duck-674813.hostingersite.com/principal.html';


