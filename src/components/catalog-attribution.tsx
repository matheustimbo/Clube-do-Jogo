'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { fetchCatalogAttribution } from '@/lib/catalog-attribution';
import type { CatalogAttribution as Attribution } from '@/lib/types';

/**
 * Os termos da RAWG exigem um link ativo em toda página que mostra dados dela. O
 * layout raiz é estático, então ler a env aqui congelaria o provider do build; o
 * servidor responde em /api/catalog a cada pedido. Um diálogo cobre o rodapé, então
 * todo diálogo que mostra dados do catálogo traz o crédito dentro dele.
 */
export function CatalogAttribution({ className = 'mt-10' }: { className?: string }) {
  const { isDemo } = useApp();
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  useEffect(() => {
    let current = true;
    fetchCatalogAttribution(isDemo)
      .then(next => { if (current) setAttribution(next); })
      .catch(() => {});
    return () => { current = false; };
  }, [isDemo]);
  if (!attribution) return null;
  return (
    <p className={`${className} text-center text-[10px] font-medium text-zinc-500`}>
      Dados de jogos por <a href={attribution.url} target="_blank" rel="noreferrer" className="font-bold text-zinc-400 underline underline-offset-2 transition hover:text-zinc-200">{attribution.name}</a>.
    </p>
  );
}
