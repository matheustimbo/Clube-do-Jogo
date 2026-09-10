export type NavIntent =
  | { pathname: '/(app)/jogos/[id]'; params: { id: string } }
  | { pathname: '/(app)/perfil/[id]'; params: { id: string } };

const TRUSTED_DEEP_LINK_SCHEME = 'clubedojogo:';

const ROUTE_MATCHERS: Array<{ pattern: RegExp; toIntent: (id: string) => NavIntent }> = [
  { pattern: /^\/jogos\/([^/]+)$/, toIntent: id => ({ pathname: '/(app)/jogos/[id]', params: { id } }) },
  { pattern: /^\/perfil\/([^/]+)$/, toIntent: id => ({ pathname: '/(app)/perfil/[id]', params: { id } }) },
];

let pendingIntent: NavIntent | null = null;

function extractRoutePath(rawUrl: string): string | null {
  if (rawUrl.startsWith('/')) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== TRUSTED_DEEP_LINK_SCHEME) return null;
    const combined = `${parsed.host}${parsed.pathname}`.replace(/^\/+/, '');
    return combined ? `/${combined}` : null;
  } catch {
    return null;
  }
}

export function captureNavIntent(rawUrl: string): void {
  const path = extractRoutePath(rawUrl);
  if (!path) return;
  for (const matcher of ROUTE_MATCHERS) {
    const match = path.match(matcher.pattern);
    if (!match) continue;
    try {
      pendingIntent = matcher.toIntent(decodeURIComponent(match[1]));
    } catch {
      return;
    }
    return;
  }
}

export function consumeNavIntent(): NavIntent | null {
  const value = pendingIntent;
  pendingIntent = null;
  return value;
}

export function clearNavIntent(): void {
  pendingIntent = null;
}
