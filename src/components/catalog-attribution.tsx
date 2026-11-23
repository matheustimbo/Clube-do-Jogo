'use client';

import { useEffect, useState } from 'react';
import { catalogAttributionFromPayload } from '@clube-do-jogo/data';
import { apiFetch } from '@/lib/api-client';
import type { CatalogAttribution as Attribution } from '@/lib/types';

/**
 * Os termos da RAWG exigem um link ativo em toda página que mostra dados dela. O
 * layout raiz é estático, então ler a env aqui congelaria o provider do build; o
 * servidor responde em /api/catalog a cada pedido.
 */
export function CatalogAttribution() {
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  useEffect(() => {
    let current = true;
    apiFetch('/api/catalog')
      .then(response => (response.ok ? response.json() : null))
      .then(payload => { if (current) setAttribution(catalogAttributionFromPayload(payload)); })
      .catch(() => {});
    return () => { current = false; };
  }, []);
  if (!attribution) return null;
  return (
    <p className="mt-10 text-center text-[10px] font-medium text-zinc-500">
      Dados de jogos por <a href={attribution.url} target="_blank" rel="noreferrer" className="font-bold text-zinc-400 underline underline-offset-2 transition hover:text-zinc-200">{attribution.name}</a>.
    </p>
  );
}
