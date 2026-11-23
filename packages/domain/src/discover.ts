import type { DiscoverItem } from './types';

/** Os itens na ordem, com cada jogo uma vez só: as listas usam o id do jogo como key. */
export function uniqueDiscoverItems(items: readonly DiscoverItem[]): DiscoverItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.game.id)) return false;
    seen.add(item.game.id);
    return true;
  });
}
