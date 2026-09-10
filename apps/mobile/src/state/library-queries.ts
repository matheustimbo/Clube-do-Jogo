import {
  useMutation,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  GameProgress,
  ProfileWithGames,
  RatingDetails,
  RatingMode,
} from '@clube-do-jogo/domain';
import { shiftMonth } from '@clube-do-jogo/domain';
import { useAppInternal } from './app-provider';

export type RatingVariables = {
  gameId: string;
  rating: number | null;
  ratingMode: RatingMode;
  ratingDetails?: RatingDetails | null;
};

function requireUser(userId: string | null) {
  if (!userId) throw new Error('Entre na sua conta para continuar.');
  return userId;
}

function requireLive(isHistorical: boolean) {
  if (isHistorical) throw new Error('O histórico é somente leitura.');
}

function progressKey(context: ReturnType<typeof useAppInternal>, gameId: string) {
  return ['progress', context.sessionEpoch, context.userId, context.selectedMonth, context.isHistorical, gameId, context.isDemo] as const;
}

function libraryKey(context: ReturnType<typeof useAppInternal>) {
  return ['library', context.sessionEpoch, context.userId, context.userId, shiftMonth(context.selectedMonth, 1), context.isDemo] as const;
}

function copyDetails(details: RatingDetails | null | undefined) {
  return details ? { ...details } : null;
}

function optimisticProgress(
  items: GameProgress[] | undefined,
  userId: string,
  input: RatingVariables,
  profile: ReturnType<typeof useAppInternal>['profile'],
) {
  if (!items) return items;
  const current = items.find(item => item.user_id === userId && item.game_id === input.gameId);
  const next: GameProgress = {
    id: current?.id || `new-${userId}-${input.gameId}`,
    user_id: userId,
    game_id: input.gameId,
    status: current?.status || 'not_started',
    rating: input.rating,
    rating_mode: input.ratingMode,
    rating_details: copyDetails(input.ratingDetails),
    started_at: current?.started_at || null,
    finished_at: current?.finished_at || null,
    profile: current?.profile || profile || undefined,
  };
  return current ? items.map(item => item === current ? next : item) : [next, ...items];
}

function optimisticLibrary(
  data: ProfileWithGames | undefined,
  input: RatingVariables,
): ProfileWithGames | undefined {
  if (!data) return data;
  const now = new Date().toISOString();
  const library = data.library.map(item => {
    if (item.game.id !== input.gameId) return item;
    return {
      ...item,
      progress: {
        status: item.progress?.status || 'not_started',
        rating: input.rating,
        rating_mode: input.ratingMode,
        rating_details: copyDetails(input.ratingDetails),
        started_at: item.progress?.started_at || null,
        finished_at: item.progress?.finished_at || null,
      },
      updatedAt: now,
    };
  });
  return {
    ...data,
    library,
  };
}

type RatingRollback = {
  previousProgress?: GameProgress[];
  previousLibrary?: ProfileWithGames;
};

export function useSetRating(): UseMutationResult<void, Error, RatingVariables> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const ownLibraryQueryKey = libraryKey(context);
  return useMutation<void, Error, RatingVariables, RatingRollback>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      requireLive(context.isHistorical);
      return context.dataClient.setRating({
        userId: requireUser(context.userId),
        isDemo: context.isDemo,
        historical: context.isHistorical,
        ...input,
      });
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const currentUserId = requireUser(context.userId);
      requireLive(context.isHistorical);
      const progressKeyForGame = progressKey(context, input.gameId);
      await Promise.all([
        context.queryClient.cancelQueries({ queryKey: progressKeyForGame }),
        context.queryClient.cancelQueries({ queryKey: ownLibraryQueryKey }),
      ]);
      const previousProgress = context.queryClient.getQueryData<GameProgress[]>(progressKeyForGame);
      const previousLibrary = context.queryClient.getQueryData<ProfileWithGames>(ownLibraryQueryKey);
      context.queryClient.setQueryData(
        progressKeyForGame,
        optimisticProgress(previousProgress, currentUserId, input, context.profile),
      );
      context.queryClient.setQueryData(
        ownLibraryQueryKey,
        optimisticLibrary(previousLibrary, input),
      );
      return { previousProgress, previousLibrary };
    },
    onError: (_error, input, rollback) => {
      if (!context.isSessionCurrent(epoch)) return;
      if (rollback?.previousProgress) {
        context.queryClient.setQueryData(progressKey(context, input.gameId), rollback.previousProgress);
      }
      if (rollback?.previousLibrary) {
        context.queryClient.setQueryData(ownLibraryQueryKey, rollback.previousLibrary);
      }
    },
    onSettled: (_data, _error, input) => {
      if (!input || !context.isSessionCurrent(epoch)) return;
      void context.queryClient.invalidateQueries({ queryKey: progressKey(context, input.gameId) });
      void context.queryClient.invalidateQueries({ queryKey: ['library', context.sessionEpoch] });
    },
  });
}
