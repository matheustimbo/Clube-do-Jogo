import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CatalogAttribution } from '@clube-do-jogo/domain';
import { useAppInternal } from './app-provider';

/** O servidor diz quem creditar, então trocar o catálogo no deploy não exige um build novo do app. */
export function useCatalogAttribution(): UseQueryResult<CatalogAttribution | null, Error> {
  const context = useAppInternal();
  return useQuery<CatalogAttribution | null, Error>({
    queryKey: ['catalog-attribution', context.sessionEpoch, context.isDemo],
    enabled: context.ready && Boolean(context.userId),
    staleTime: Infinity,
    queryFn: () => context.dataClient.readCatalogAttribution(context.isDemo),
  });
}
