import { activeCatalogProviderId } from '@/lib/game-catalog';

/** Os termos da RAWG exigem um link ativo em toda página que mostra dados dela. */
export function CatalogAttribution() {
  if (activeCatalogProviderId() !== 'rawg') return null;
  return (
    <p className="mt-10 text-center text-[10px] font-medium text-zinc-500">
      Dados de jogos por <a href="https://rawg.io" target="_blank" rel="noreferrer" className="font-bold text-zinc-400 underline underline-offset-2 transition hover:text-zinc-200">RAWG</a>.
    </p>
  );
}
