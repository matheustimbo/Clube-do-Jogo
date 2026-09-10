import type { SupabaseClient } from '@supabase/supabase-js';
import { getApiBaseUrl } from './config';

function resolveApiUrl(path: string, baseValue: string) {
  let base: URL;
  try {
    base = new URL(baseValue);
  } catch {
    throw new Error('A URL da API está inválida.');
  }
  const localDevelopment = base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !localDevelopment) || base.username || base.password || base.pathname !== '/') {
    throw new Error('A URL da API deve ser uma origem HTTPS.');
  }
  let url: URL;
  try {
    url = new URL(path, `${base.origin}/`);
  } catch {
    throw new Error('A rota da API está inválida.');
  }
  if (url.origin !== base.origin || url.username || url.password || url.hash
    || !(url.pathname === '/api' || url.pathname.startsWith('/api/'))) {
    throw new Error('O aplicativo só acessa rotas /api do servidor configurado.');
  }
  return url.toString();
}

export function createMobileApiTransport(client: SupabaseClient | null, apiBaseUrlOverride?: string) {
  return {
    async request(path: string, init?: RequestInit) {
      const base = apiBaseUrlOverride ?? getApiBaseUrl();
      if (!base) throw new Error('Configure EXPO_PUBLIC_API_BASE_URL para explorar jogos.');
      if (!client) throw new Error('Configure o Supabase para acessar a API.');
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error('Não foi possível validar sua sessão.');
      if (!data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente para continuar.');
      const headers = new Headers(init?.headers);
      headers.delete('Authorization');
      headers.delete('Cookie');
      headers.set('Authorization', `Bearer ${data.session.access_token}`);
      return fetch(resolveApiUrl(path, base), {
        ...init,
        headers,
        credentials: 'omit',
        redirect: 'error',
      });
    },
  };
}
