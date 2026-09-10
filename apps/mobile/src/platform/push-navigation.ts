import { DEFAULT_APP_ROUTE, type PushNavIntent } from '../lib/nav-intent';
import type { NativeNotificationResponse } from './push-controller';

const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

export type PushDestinationExists = {
  game(id: string): Promise<boolean>;
  profile(id: string): Promise<boolean>;
};

function dynamicIntent(pathname: string): PushNavIntent | null {
  const match = pathname.match(/^\/(jogos|perfil)\/([^/]+)$/);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (!id || /[\u0000-\u001f\u007f]/.test(id)) return null;
  return match[1] === 'jogos'
    ? { pathname: '/(app)/jogos/[id]', params: { id } }
    : { pathname: '/(app)/perfil/[id]', params: { id } };
}

export function parsePushDestination(rawUrl: unknown): PushNavIntent | null {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/') || rawUrl.startsWith('//')) return null;
  if (rawUrl.includes('#') || rawUrl.includes('\\') || /[\u0000-\u001f\u007f]/.test(rawUrl)) return null;
  const queryAt = rawUrl.indexOf('?');
  const pathname = queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt);
  const search = queryAt === -1 ? '' : rawUrl.slice(queryAt);
  if (pathname === '/jogo-do-mes') {
    if (!search) return { pathname: DEFAULT_APP_ROUTE };
    return search === '?section=timeline'
      ? { pathname: DEFAULT_APP_ROUTE, params: { section: 'timeline' } }
      : null;
  }
  if (search) return null;
  if (pathname === '/ranking') return { pathname: '/(app)/(tabs)/ranking' };
  if (pathname === '/perfil') return { pathname: '/(app)/(tabs)/perfil' };
  return dynamicIntent(pathname);
}

export async function resolvePushDestination(rawUrl: unknown, exists: PushDestinationExists): Promise<PushNavIntent> {
  const intent = parsePushDestination(rawUrl);
  if (!intent) return { pathname: DEFAULT_APP_ROUTE };
  if (intent.pathname === '/(app)/jogos/[id]') {
    return await exists.game(intent.params.id) ? intent : { pathname: DEFAULT_APP_ROUTE };
  }
  if (intent.pathname === '/(app)/perfil/[id]') {
    return await exists.profile(intent.params.id) ? intent : { pathname: DEFAULT_APP_ROUTE };
  }
  return intent;
}

export function notificationResponseKey(value: NativeNotificationResponse) {
  return `${value.identifier}\u0000${value.actionIdentifier}`;
}

export class PushResponseInbox {
  private readonly handled = new Set<string>();
  private pending: NativeNotificationResponse | null = null;

  capture(response: NativeNotificationResponse) {
    const key = notificationResponseKey(response);
    if (this.handled.has(key)) return false;
    this.handled.add(key);
    if (response.actionIdentifier !== DEFAULT_ACTION || parsePushDestination(response.data.url) === null) return false;
    this.pending = response;
    return true;
  }

  peek() {
    return this.pending;
  }

  consume() {
    const value = this.pending;
    this.pending = null;
    return value;
  }

  clearPending() {
    this.pending = null;
  }
}
