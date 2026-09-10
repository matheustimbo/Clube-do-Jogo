import { useMemo } from 'react';
import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  createAdminDataClient,
  type AdminRoleChangeResult,
  type ClubGameChangeMode,
  type ClubGameChangePreview,
  type ClubGameChangeResult,
  type ClubGameUndoPreview,
  type ClubGameUndoResult,
} from '@clube-do-jogo/data';
import type { AdminUser, AppRole } from '@clube-do-jogo/domain';
import { getMobileSupabaseClient } from '@/platform';
import { useAppInternal } from './app-provider';

export type AdminRoleVariables = {
  targetUserId: string;
  role: AppRole;
};

export type ClubGamePreviewVariables = {
  gameId: string;
  mode: ClubGameChangeMode;
};

export type SetClubGameVariables = {
  preview: ClubGameChangePreview;
};

export type ClubGameUndoPreviewVariables = {
  eventId: string;
};

export type UndoClubGameVariables = {
  preview: ClubGameUndoPreview;
  forceDelete: boolean;
};

export type RedoClubGameVariables = {
  eventId: string;
};

function requireUser(userId: string | null): string {
  if (!userId) throw new Error('Entre na sua conta para continuar.');
  return userId;
}

function useAdminDataClient() {
  const context = useAppInternal();
  const client = useMemo(() => createAdminDataClient({
    supabase: getMobileSupabaseClient(),
    demo: context.dataClient.demo,
    demoScope: String(context.sessionEpoch),
  }), [context.dataClient.demo, context.sessionEpoch]);
  return { client, context };
}

function scope(context: ReturnType<typeof useAppInternal>) {
  return { userId: requireUser(context.userId), isDemo: context.isDemo };
}

function requireCurrentSession(context: ReturnType<typeof useAppInternal>, epoch: number): void {
  if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
}

async function invalidateRoleQueries(context: ReturnType<typeof useAppInternal>, epoch: number, refreshProfile: boolean): Promise<void> {
  if (!context.isSessionCurrent(epoch)) return;
  await Promise.all([
    context.queryClient.invalidateQueries({ queryKey: ['admin-users', epoch] }),
    context.queryClient.invalidateQueries({ queryKey: ['profile', epoch] }),
  ]);
  if (refreshProfile && context.isSessionCurrent(epoch)) await context.refresh();
}

async function invalidateCycleQueries(context: ReturnType<typeof useAppInternal>, epoch: number): Promise<void> {
  if (!context.isSessionCurrent(epoch)) return;
  await context.refresh();
  if (!context.isSessionCurrent(epoch)) return;
  await Promise.all([
    'admin-cycle',
    'game-of-month',
    'game',
    'ranking',
    'progress',
    'library',
    'discovery',
    'rewards',
    'timeline',
    'notes',
  ].map(prefix => context.queryClient.invalidateQueries({ queryKey: [prefix, epoch] })));
}

export function useAdminUsers(): UseQueryResult<AdminUser[], Error> {
  const { client, context } = useAdminDataClient();
  const userId = context.userId;
  return useQuery<AdminUser[], Error>({
    queryKey: ['admin-users', context.sessionEpoch, userId, context.isDemo],
    enabled: context.ready && Boolean(userId) && context.isAdmin,
    queryFn: () => client.readAdminUsers({ userId: requireUser(userId), isDemo: context.isDemo }),
  });
}

export function useSetAdminUserRole(): UseMutationResult<AdminRoleChangeResult, Error, AdminRoleVariables> {
  const { client, context } = useAdminDataClient();
  const epoch = context.sessionEpoch;
  const currentUserId = context.userId;
  return useMutation<AdminRoleChangeResult, Error, AdminRoleVariables>({
    mutationFn: input => {
      requireCurrentSession(context, epoch);
      return client.setUserRole({ ...scope(context), ...input });
    },
    onSuccess: (_result, input) => invalidateRoleQueries(context, epoch, input.targetUserId === currentUserId),
  });
}

export function usePreviewClubGameChange(): UseMutationResult<ClubGameChangePreview, Error, ClubGamePreviewVariables> {
  const { client, context } = useAdminDataClient();
  const epoch = context.sessionEpoch;
  return useMutation<ClubGameChangePreview, Error, ClubGamePreviewVariables>({
    mutationFn: input => {
      requireCurrentSession(context, epoch);
      return client.previewClubGameChange({ ...scope(context), ...input });
    },
  });
}

export function useSetClubGame(): UseMutationResult<ClubGameChangeResult, Error, SetClubGameVariables> {
  const { client, context } = useAdminDataClient();
  const epoch = context.sessionEpoch;
  return useMutation<ClubGameChangeResult, Error, SetClubGameVariables>({
    mutationFn: input => {
      requireCurrentSession(context, epoch);
      return client.setClubGame({ ...scope(context), ...input });
    },
    onSuccess: () => invalidateCycleQueries(context, epoch),
  });
}

export function usePreviewClubGameUndo(): UseMutationResult<ClubGameUndoPreview | null, Error, ClubGameUndoPreviewVariables> {
  const { client, context } = useAdminDataClient();
  const epoch = context.sessionEpoch;
  return useMutation<ClubGameUndoPreview | null, Error, ClubGameUndoPreviewVariables>({
    mutationFn: input => {
      requireCurrentSession(context, epoch);
      return client.previewClubGameUndo({ ...scope(context), ...input });
    },
  });
}

export function useUndoClubGameChange(): UseMutationResult<ClubGameUndoResult, Error, UndoClubGameVariables> {
  const { client, context } = useAdminDataClient();
  const epoch = context.sessionEpoch;
  return useMutation<ClubGameUndoResult, Error, UndoClubGameVariables>({
    mutationFn: input => {
      requireCurrentSession(context, epoch);
      return client.undoClubGameChange({ ...scope(context), ...input });
    },
    onSuccess: () => invalidateCycleQueries(context, epoch),
  });
}

export function useRedoClubGameChange(): UseMutationResult<ClubGameChangeResult, Error, RedoClubGameVariables> {
  const { client, context } = useAdminDataClient();
  const epoch = context.sessionEpoch;
  return useMutation<ClubGameChangeResult, Error, RedoClubGameVariables>({
    mutationFn: input => {
      requireCurrentSession(context, epoch);
      return client.redoClubGameChange({ ...scope(context), ...input });
    },
    onSuccess: () => invalidateCycleQueries(context, epoch),
  });
}
