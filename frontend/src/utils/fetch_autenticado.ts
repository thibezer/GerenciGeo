import { API_BASE } from '../config';
import { AuthService } from './auth_service';

/**
 * Decide se a requisição deve levar o token de sessão: só chamadas para a API do próprio app
 * (URL relativa ou começando por API_BASE), e nunca as de login/cadastro/recuperação de senha.
 */
export const deveAnexarAutorizacao = (url: string, apiBase: string): boolean => {
  const daApi = url.startsWith('/') || url.startsWith(apiBase);
  if (!daApi) return false;
  const caminho = url.slice(url.startsWith('/') ? 0 : apiBase.length);
  return !/(^|\/)auth\/(login|register|forgot-password)\b/.test(caminho)
    && !/[?&]action=(login|register|forgot_password|forgot-password)\b/.test(caminho);
};

/**
 * A API na nuvem exige login para os cadastros (clientes, senha GOV). Em vez de repetir o cabeçalho em cada
 * chamada, o fetch global passa a anexar o token da sessão às requisições da API — sem sobrescrever um
 * Authorization que a chamada já tenha definido.
 */
export const instalarFetchAutenticado = (): void => {
  if (typeof window === 'undefined' || (window.fetch as { __autenticado?: boolean }).__autenticado) return;
  const original = window.fetch.bind(window);
  const envolvido = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const token = AuthService.getToken();
      if (token && deveAnexarAutorizacao(url, API_BASE)) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
          return original(input, { ...init, headers });
        }
      }
    } catch {
      // nunca impedir a requisição por causa do cabeçalho
    }
    return original(input, init);
  }) as typeof window.fetch & { __autenticado?: boolean };
  envolvido.__autenticado = true;
  window.fetch = envolvido;
};
