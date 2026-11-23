import { catalogAttributionFromPayload } from '@clube-do-jogo/data';
import { apiFetch } from './api-client';
import type { CatalogAttribution } from './types';

/** O crédito que o catálogo do servidor pede. A demo não tem servidor, então nem pergunta. */
export async function fetchCatalogAttribution(isDemo: boolean): Promise<CatalogAttribution | null> {
  if (isDemo) return null;
  const response = await apiFetch('/api/catalog');
  return response.ok ? catalogAttributionFromPayload(await response.json()) : null;
}
