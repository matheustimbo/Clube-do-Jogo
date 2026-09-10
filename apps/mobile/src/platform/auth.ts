import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthCallbackClient = Pick<SupabaseClient, 'auth'>;

async function setupNativeUrlPolyfill() {
  const { setupURLPolyfill } = await import('react-native-url-polyfill');
  setupURLPolyfill();
}

class AuthCallbackError extends Error {}

const completedCodes = new Set<string>();
const pendingCallbacks = new Map<string, Promise<void>>();

function authError(error: unknown) {
  if (!error || typeof error !== 'object') return new AuthCallbackError('Não foi possível concluir a autenticação.');
  const message = 'message' in error ? String((error as { message: unknown }).message) : '';
  if (/expired|invalid|code/i.test(message)) return new AuthCallbackError('O link de autenticação expirou. Solicite um novo link.');
  if (/network|fetch|connect/i.test(message)) return new AuthCallbackError('Não foi possível conectar. Tente novamente.');
  return new AuthCallbackError('Não foi possível concluir a autenticação.');
}

export async function completeAuthCallback(url: string, clientOverride?: AuthCallbackClient): Promise<void> {
  if (!clientOverride) await setupNativeUrlPolyfill();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('O link de autenticação é inválido.');
  }
  const callbackError = parsed.searchParams.get('error_description') || parsed.searchParams.get('error');
  if (callbackError) throw new Error(`Não foi possível concluir a autenticação. ${callbackError}`);
  const code = parsed.searchParams.get('code');
  if (!code) throw new Error('O link de autenticação não contém um código. Solicite um novo link.');
  const client = clientOverride || (await import('./supabase')).getMobileSupabaseClient();
  if (!client) throw new Error('Configure o Supabase para concluir a autenticação.');
  if (completedCodes.has(code)) return;
  const pending = pendingCallbacks.get(code);
  if (pending) return pending;

  const exchange = client.auth.exchangeCodeForSession(code).then(({ error }) => {
    if (error) throw authError(error);
    completedCodes.add(code);
    if (completedCodes.size > 100) completedCodes.delete(completedCodes.values().next().value as string);
  }).catch(error => {
    throw error instanceof AuthCallbackError
      ? error
      : authError(error);
  }).finally(() => {
    pendingCallbacks.delete(code);
  });
  pendingCallbacks.set(code, exchange);
  return exchange;
}

export function resetAuthCallbacksForTests() {
  completedCodes.clear();
  pendingCallbacks.clear();
}
