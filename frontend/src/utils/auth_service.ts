import { API_BASE } from '../config';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  profile_image?: string | null;
  created_at?: string;
}

const STORAGE_KEY_USER = 'gerencigeo_auth_user';
const STORAGE_KEY_TOKEN = 'gerencigeo_auth_token';
const STORAGE_KEY_REMEMBER = 'gerencigeo_auth_remember';

export class AuthService {
  /**
   * Retorna os dados do usuário atualmente autenticado
   */
  static getUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_USER) || sessionStorage.getItem(STORAGE_KEY_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Retorna o token de autenticação atual
   */
  static getToken(): string | null {
    return localStorage.getItem(STORAGE_KEY_TOKEN) || sessionStorage.getItem(STORAGE_KEY_TOKEN);
  }

  /**
   * Verifica se o usuário possui sessão ativa
   */
  static isAuthenticated(): boolean {
    return this.getUser() !== null;
  }

  /**
   * Realiza o cadastro de um novo usuário via API
   */
  static async register(name: string, email: string, password: string): Promise<AuthUser> {
    const isCloudHost = window.location.origin.includes('hostingersite.com');
    const endpoint = isCloudHost 
      ? `${window.location.origin}/api.php?action=register`
      : `${API_BASE}/auth/register`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || data.error || 'Erro ao criar conta.');
    }

    const user: AuthUser = data.user;
    const token: string = data.token || 'session_token';

    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
    localStorage.setItem(STORAGE_KEY_REMEMBER, 'true');

    return user;
  }

  /**
   * Realiza a autenticação via API (FastAPI local ou Hub Web Cloud na Hostinger)
   */
  static async login(email: string, password: string, rememberMe: boolean = false): Promise<AuthUser> {
    const isCloudHost = window.location.origin.includes('hostingersite.com');
    const endpoint = isCloudHost 
      ? `${window.location.origin}/api.php?action=login`
      : `${API_BASE}/auth/login`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        remember_me: rememberMe
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || data.error || 'Credenciais inválidas.');
    }

    const user: AuthUser = data.user;
    const token: string = data.token || 'session_token';

    const storage = rememberMe ? localStorage : sessionStorage;
    // Limpa o outro armazenamento para evitar inconsistências
    if (rememberMe) {
      sessionStorage.removeItem(STORAGE_KEY_USER);
      sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    }

    storage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    storage.setItem(STORAGE_KEY_TOKEN, token);
    localStorage.setItem(STORAGE_KEY_REMEMBER, rememberMe ? 'true' : 'false');

    return user;
  }

  /**
   * Encerra a sessão do usuário
   */
  static async logout(): Promise<void> {
    try {
      const isCloudHost = window.location.origin.includes('hostingersite.com');
      const endpoint = isCloudHost 
        ? `${window.location.origin}/api.php?action=logout`
        : `${API_BASE}/auth/logout`;

      const token = this.getToken();
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
    } catch (e) {
      console.warn('Erro ao notificar logout no backend:', e);
    } finally {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      sessionStorage.removeItem(STORAGE_KEY_USER);
      sessionStorage.removeItem(STORAGE_KEY_TOKEN);
      window.location.hash = '#login';
    }
  }

  /**
   * Gera as iniciais do nome do usuário para o avatar
   */
  static getInitials(name: string): string {
    if (!name) return 'AD';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
}
