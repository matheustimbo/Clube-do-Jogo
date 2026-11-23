import type { CatalogAttribution } from '@clube-do-jogo/domain';

/** Reads GET /api/catalog. Anything but an https link credits nothing, so a bad payload never becomes a tappable link. */
export function catalogAttributionFromPayload(payload: unknown): CatalogAttribution | null {
  const attribution = payload && typeof payload === 'object' ? (payload as { attribution?: unknown }).attribution : null;
  if (!attribution || typeof attribution !== 'object') return null;
  const { name, url } = attribution as { name?: unknown; url?: unknown };
  if (typeof name !== 'string' || !name.trim() || typeof url !== 'string') return null;
  try {
    return new URL(url).protocol === 'https:' ? { name, url } : null;
  } catch {
    return null;
  }
}
