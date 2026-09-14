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

export function isAllowedTrailerNavigation(url: string, documentOrigin: string): boolean {
  if (url === 'about:blank') return true;
  if (isAllowedYoutubeOrigin(url)) return true;
  try {
    return new URL(url).origin === documentOrigin;
  } catch {
    return false;
  }
}

// O WKWebView não manda Referer ao navegar direto para a URL de embed, e desde
// 2025 o YouTube recusa isso com o erro 153. Servir o iframe dentro de um
// documento com baseUrl próprio dá ao player uma origem que ele aceita.
export function youtubeEmbedHtml(url: string | null | undefined, origin: string): string | null {
  const embed = youtubeEmbedUrl(url, origin);
  if (!embed) return null;
  return `<!DOCTYPE html><html><head>`
    + `<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">`
    + `<meta name="referrer" content="strict-origin-when-cross-origin">`
    + `<style>html,body{margin:0;background:#000;height:100%}iframe{border:0;width:100%;height:100%}</style>`
    + `</head><body><iframe src="${embed}" referrerpolicy="strict-origin-when-cross-origin" `
    + `allow="accelerometer;autoplay;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></body></html>`;
}
