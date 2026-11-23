const ALLOWED_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{6,15}$/;

export function youtubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0];
    return id || null;
  }
  if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.split('/')[2] || null;
  if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] || null;
  return parsed.searchParams.get('v');
}

export function isAllowedYoutubeOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port && ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function youtubeEmbedUrl(url: string | null | undefined, origin: string): string | null {
  const id = youtubeVideoId(url);
  if (!id || !VIDEO_ID_PATTERN.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1&controls=1`
    + `&origin=${encodeURIComponent(origin)}`;
}

export function isAllowedTrailerNavigation(url: string): boolean {
  return url === 'about:blank' || isAllowedYoutubeOrigin(url);
}

// Desde 2025 o YouTube recusa o embed sem Referer e devolve o erro 153. Nem o
// WKWebView nem o WebView do Android mandam um sozinhos: o iOS navega direto
// para a URL e o Android carrega o documento com loadDataWithBaseURL, que não
// gera referrer nenhum. Mandar o header na própria requisição resolve os dois.
export function trailerSource(url: string | null | undefined, origin: string) {
  const uri = youtubeEmbedUrl(url, origin);
  if (!uri) return null;
  return { uri, headers: { Referer: `${origin}/` } };
}

