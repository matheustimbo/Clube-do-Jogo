import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import * as React from 'react';

export { randomUUID as createNativeNoteId } from 'expo-crypto';
import type { ClubComment, LocalNote, Profile } from '@clube-do-jogo/domain';
import {
  createCommentsClient,
  createNotesClient,
  type CommentDeleteInput,
  type CommentInput,
  type CommentRealtimeEvent,
  type CommentReactionInput,
  type CommentUpdateInput,
  type CommentsClient,
  type NotesClient,
  type NewNoteInput,
  type NoteDeleteInput,
  type NoteUpdateInput,
} from '@clube-do-jogo/data';
import { createMobileApiTransport, getMobileSupabaseClient, nativeStorage } from '@/platform';
import { useAppInternal } from './app-provider';

// Best-effort push, mirroring src/components/timeline.tsx (`/api/push/comment` with the
// same { commentId } payload). The comment is already saved by the time this runs, so a
// push failure must never surface as a failed comment.
function notifyCommentPush(commentId: string) {
  const transport = createMobileApiTransport(getMobileSupabaseClient());
  void transport.request('/api/push/comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commentId }),
  }).catch(() => {});
}

export type CommentVariables = {
  gameId: string;
  clubMonth?: string;
  parentId?: string | null;
  body: string;
  historical?: boolean;
};

export type CommentUpdateVariables = {
  gameId: string;
  commentId: string;
  clubMonth?: string;
  body: string;
  expectedUpdatedAt: string;
  historical?: boolean;
};

export type CommentDeleteVariables = {
  gameId: string;
  commentId: string;
  clubMonth?: string;
  expectedUpdatedAt?: string;
  historical?: boolean;
};

export type ReactionVariables = {
  gameId: string;
  commentId: string;
  clubMonth?: string;
  emoji: string;
  enabled: boolean;
  historical?: boolean;
};

export type NoteVariables = {
  gameId: string;
  note: Omit<LocalNote, 'userId' | 'gameId'>;
  historical?: boolean;
};

export type NoteUpdateVariables = {
  gameId: string;
  note: Omit<LocalNote, 'userId' | 'gameId'>;
  expectedUpdatedAt: string;
  historical?: boolean;
};

export type NoteDeleteVariables = {
  gameId: string;
  noteId: string;
  expectedUpdatedAt?: string;
  historical?: boolean;
};

export type NoteDraftTarget =
  | { kind: 'new'; id: string; createdAt: string }
  | { kind: 'edit'; id: string; createdAt: string; expectedUpdatedAt: string };

export interface NoteDraft {
  target?: NoteDraftTarget;
  body: string;
  imageDataUrl?: string;
  updatedAt: string;
}

export interface NoteDraftState {
  draft: NoteDraft;
  loading: boolean;
  error: Error | null;
  setDraft(value: NoteDraft | ((current: NoteDraft) => NoteDraft)): void;
  clearDraft(): void;
}

type DiscussionContext = ReturnType<typeof useAppInternal>;
type CommentMutationContext = {
  key: readonly unknown[];
  previous: ClubComment[] | undefined;
  optimisticId?: string;
};
type NoteMutationContext = {
  key: readonly unknown[];
  previous: LocalNote[] | undefined;
};

let demoCommentsClient: CommentsClient | undefined;
let demoNotesClient: NotesClient | undefined;
let liveCommentsClient: CommentsClient | undefined;
let liveNotesClient: NotesClient | undefined;

const draftWrites = new Map<string, Promise<void>>();

function enqueueDraftWrite(key: string, operation: () => Promise<void>) {
  const previous = draftWrites.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  draftWrites.set(key, next);
  const cleanup = () => {
    if (draftWrites.get(key) === next) draftWrites.delete(key);
  };
  void next.then(cleanup, cleanup);
  return next;
}

function getCommentsClient(isDemo: boolean): CommentsClient {
  if (isDemo) {
    demoCommentsClient ||= createCommentsClient({ demo: true });
    return demoCommentsClient;
  }
  liveCommentsClient ||= createCommentsClient({ supabase: getMobileSupabaseClient() });
  return liveCommentsClient;
}

function getNotesClient(isDemo: boolean): NotesClient {
  if (isDemo) {
    demoNotesClient ||= createNotesClient({ demo: true });
    return demoNotesClient;
  }
  liveNotesClient ||= createNotesClient({ supabase: getMobileSupabaseClient() });
  return liveNotesClient;
}

function requireUser(userId: string | null) {
  if (!userId) throw new Error('Entre na sua conta para continuar.');
  return userId;
}

function monthFor(context: DiscussionContext, month?: string) {
  return month || context.selectedMonth;
}

function commentKey(context: DiscussionContext, gameId: string, clubMonth: string) {
  const historical = context.isHistorical || clubMonth !== context.activeMonth;
  return ['comments', context.sessionEpoch, context.userId, context.isDemo, historical, gameId, clubMonth] as const;
}

function notesKey(context: DiscussionContext, gameId: string, snapshotMonth: string | null) {
  return ['notes', context.sessionEpoch, context.userId, context.isDemo, gameId, snapshotMonth] as const;
}

export function discussionQueryKey(context: DiscussionContext, gameId: string, clubMonth = context.selectedMonth) {
  return commentKey(context, gameId, clubMonth);
}

export function notesQueryKey(context: DiscussionContext, gameId: string, snapshotMonth: string | null = null) {
  return notesKey(context, gameId, snapshotMonth);
}

function cloneProfile(profile: Profile): Profile {
  return { ...profile, avatar_crop: profile.avatar_crop ? { ...profile.avatar_crop } : profile.avatar_crop };
}

function cloneComment(comment: ClubComment): ClubComment {
  return {
    ...comment,
    profile: comment.profile ? cloneProfile(comment.profile) : comment.profile,
    reactions: comment.reactions.map(reaction => ({ ...reaction, users: reaction.users.map(cloneProfile) })),
    replies: comment.replies.map(cloneComment),
  };
}

function updateCommentTree(items: ClubComment[], id: string, update: (comment: ClubComment) => ClubComment | null): ClubComment[] {
  const next: ClubComment[] = [];
  for (const comment of items) {
    if (comment.id === id) {
      const value = update(comment);
      if (value) next.push(value);
      continue;
    }
    const replies = updateCommentTree(comment.replies, id, update);
    next.push(replies === comment.replies ? comment : { ...comment, replies });
  }
  return next;
}

function appendComment(items: ClubComment[] | undefined, comment: ClubComment): ClubComment[] {
  const current = (items || []).map(cloneComment);
  if (!comment.parent_id) return [...current, cloneComment(comment)];
  let inserted = false;
  const appendToParent = (values: ClubComment[]): ClubComment[] => values.map(item => {
    if (item.id === comment.parent_id) {
      inserted = true;
      return { ...item, replies: [...item.replies, cloneComment(comment)] };
    }
    const replies = appendToParent(item.replies);
    return replies === item.replies ? item : { ...item, replies };
  });
  const next = appendToParent(current);
  return inserted ? next : [...next, cloneComment(comment)];
}

function replaceComment(items: ClubComment[] | undefined, optimisticId: string | undefined, comment: ClubComment): ClubComment[] {
  let replaced = false;
  const replace = (values: ClubComment[]): ClubComment[] => {
    const next: ClubComment[] = [];
    for (const item of values) {
      if (item.id === optimisticId || item.id === comment.id) {
        if (!replaced) {
          next.push(cloneComment(comment));
          replaced = true;
        }
        continue;
      }
      const replies = replace(item.replies);
      next.push(replies === item.replies ? item : { ...item, replies });
    }
    return next;
  };
  const next = replace(items || []);
  return replaced ? next : appendComment(next, comment);
}

function optimisticReaction(comment: ClubComment, input: ReactionVariables, profile: Profile | null): ClubComment {
  const reactions = comment.reactions.map(reaction => ({ ...reaction, users: reaction.users.map(cloneProfile) }));
  const index = reactions.findIndex(reaction => reaction.emoji === input.emoji);
  const person = profile ? cloneProfile(profile) : { id: 'current-user', name: 'Você', avatar_url: null };
  if (input.enabled) {
    if (index < 0) reactions.push({ emoji: input.emoji, reactedByMe: true, users: [person] });
    else if (!reactions[index].users.some(user => user.id === person.id)) {
      reactions[index] = { ...reactions[index], reactedByMe: true, users: [...reactions[index].users, person] };
    } else reactions[index] = { ...reactions[index], reactedByMe: true };
  } else if (index >= 0) {
    reactions[index] = { ...reactions[index], reactedByMe: false, users: reactions[index].users.filter(user => user.id !== person.id) };
    if (!reactions[index].users.length) reactions.splice(index, 1);
  }
  return { ...comment, reactions };
}

function hasHistoricalGuard(context: DiscussionContext, historical?: boolean, month?: string) {
  return context.isHistorical || historical === true || (month || context.selectedMonth) !== context.activeMonth;
}

function commentInput(context: DiscussionContext, input: CommentVariables): CommentInput {
  const userId = requireUser(context.userId);
  return {
    userId,
    isDemo: context.isDemo,
    gameId: input.gameId,
    clubMonth: monthFor(context, input.clubMonth),
    parentId: input.parentId,
    body: input.body,
    historical: hasHistoricalGuard(context, input.historical, input.clubMonth),
  };
}

function commentUpdateInput(context: DiscussionContext, input: CommentUpdateVariables): CommentUpdateInput {
  return {
    ...commentInput(context, input),
    commentId: input.commentId,
    expectedUpdatedAt: input.expectedUpdatedAt,
  };
}

function commentDeleteInput(context: DiscussionContext, input: CommentDeleteVariables): CommentDeleteInput {
  return {
    ...commentInput(context, { ...input, body: '' }),
    commentId: input.commentId,
    expectedUpdatedAt: input.expectedUpdatedAt,
  };
}

function reactionInput(context: DiscussionContext, input: ReactionVariables): CommentReactionInput {
  return {
    userId: requireUser(context.userId),
    isDemo: context.isDemo,
    gameId: input.gameId,
    clubMonth: monthFor(context, input.clubMonth),
    commentId: input.commentId,
    emoji: input.emoji,
    enabled: input.enabled,
    historical: hasHistoricalGuard(context, input.historical, input.clubMonth),
  };
}

function noteFromInput(context: DiscussionContext, input: NoteVariables | NoteUpdateVariables): LocalNote {
  const userId = requireUser(context.userId);
  return {
    ...input.note,
    userId,
    gameId: input.gameId,
  };
}

function noteCreateInput(context: DiscussionContext, input: NoteVariables): NewNoteInput {
  return { userId: requireUser(context.userId), isDemo: context.isDemo, note: noteFromInput(context, input), historical: hasHistoricalGuard(context, input.historical) };
}

function noteUpdateInput(context: DiscussionContext, input: NoteUpdateVariables): NoteUpdateInput {
  return { userId: requireUser(context.userId), isDemo: context.isDemo, note: noteFromInput(context, input), expectedUpdatedAt: input.expectedUpdatedAt, historical: hasHistoricalGuard(context, input.historical) };
}

function noteDeleteInput(context: DiscussionContext, input: NoteDeleteVariables): NoteDeleteInput {
  return { userId: requireUser(context.userId), isDemo: context.isDemo, gameId: input.gameId, noteId: input.noteId, expectedUpdatedAt: input.expectedUpdatedAt, historical: hasHistoricalGuard(context, input.historical) };
}

function isCommentEventForScope(event: CommentRealtimeEvent, gameId: string, clubMonth: string) {
  return event.clubMonth === clubMonth && event.key.length > 0 && (event.table === 'club_comments' || event.table === 'comment_reactions') && Boolean(gameId);
}

export function useComments(gameId: string, month?: string): UseQueryResult<ClubComment[], Error> {
  const context = useAppInternal();
  const clubMonth = monthFor(context, month);
  const key = React.useMemo(() => commentKey(context, gameId, clubMonth), [context, gameId, clubMonth]);
  const client = getCommentsClient(context.isDemo);
  const epoch = context.sessionEpoch;

  React.useEffect(() => {
    if (!context.ready || !context.userId || !gameId || !clubMonth || context.isDemo || context.isHistorical || clubMonth !== context.activeMonth) return undefined;
    const unsubscribe = client.subscribe({
      userId: context.userId,
      isDemo: context.isDemo,
      gameId,
      clubMonth,
      onEvent: event => {
        if (!context.isSessionCurrent(epoch) || !isCommentEventForScope(event, gameId, clubMonth)) return;
        void context.queryClient.invalidateQueries({ queryKey: key });
      },
      onStatus: status => {
        if (status === 'SUBSCRIBED' && context.isSessionCurrent(epoch)) void context.queryClient.invalidateQueries({ queryKey: key });
      },
    });
    return unsubscribe;
  }, [client, clubMonth, context, context.isDemo, context.isHistorical, context.ready, context.userId, epoch, gameId, key]);

  return useQuery<ClubComment[], Error>({
    queryKey: key,
    enabled: context.ready && Boolean(context.userId) && Boolean(gameId) && Boolean(clubMonth),
    queryFn: () => client.read({
      userId: requireUser(context.userId),
      isDemo: context.isDemo,
      gameId,
      clubMonth,
    }),
  });
}

export function useCreateComment(): UseMutationResult<ClubComment, Error, CommentVariables, CommentMutationContext> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const client = getCommentsClient(context.isDemo);
  return useMutation<ClubComment, Error, CommentVariables, CommentMutationContext>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return client.create(commentInput(context, input));
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      if (hasHistoricalGuard(context, input.historical, input.clubMonth)) throw new Error('O histórico é somente leitura.');
      const scoped = commentInput(context, input);
      const key = commentKey(context, scoped.gameId, scoped.clubMonth);
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<ClubComment[]>(key);
      const optimistic: ClubComment = {
        id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        user_id: scoped.userId,
        game_id: scoped.gameId,
        club_month: scoped.clubMonth,
        parent_id: scoped.parentId || null,
        body: scoped.body.trim(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile: context.profile ? cloneProfile(context.profile) : undefined,
        reactions: [],
        replies: [],
      };
      context.queryClient.setQueryData(key, appendComment(previous, optimistic));
      return { key, previous, optimisticId: optimistic.id };
    },
    onSuccess: (comment, _input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext) return;
      context.queryClient.setQueryData<ClubComment[]>(mutationContext.key, current => replaceComment(current, mutationContext.optimisticId, comment));
      if (!context.isDemo) notifyCommentPush(comment.id);
    },
    onError: (_error, _input, mutationContext) => {
      if (context.isSessionCurrent(epoch) && mutationContext) context.queryClient.setQueryData(mutationContext.key, mutationContext.previous);
    },
    onSettled: (_data, _error, _input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext) return;
      void context.queryClient.invalidateQueries({ queryKey: mutationContext.key });
    },
  });
}

export function useUpdateComment(): UseMutationResult<ClubComment, Error, CommentUpdateVariables, CommentMutationContext> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const client = getCommentsClient(context.isDemo);
  return useMutation<ClubComment, Error, CommentUpdateVariables, CommentMutationContext>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return client.update(commentUpdateInput(context, input));
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      if (hasHistoricalGuard(context, input.historical, input.clubMonth)) throw new Error('O histórico é somente leitura.');
      const scoped = commentUpdateInput(context, input);
      const key = commentKey(context, scoped.gameId, scoped.clubMonth);
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<ClubComment[]>(key);
      context.queryClient.setQueryData(key, updateCommentTree(previous || [], input.commentId, comment => ({ ...comment, body: input.body.trim(), updated_at: new Date().toISOString() })));
      return { key, previous };
    },
    onSuccess: (comment, _input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext) return;
      context.queryClient.setQueryData<ClubComment[]>(mutationContext.key, current => replaceComment(current, comment.id, comment));
    },
    onError: (_error, _input, mutationContext) => {
      if (context.isSessionCurrent(epoch) && mutationContext) context.queryClient.setQueryData(mutationContext.key, mutationContext.previous);
    },
    onSettled: (_data, _error, _input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext) return;
      void context.queryClient.invalidateQueries({ queryKey: mutationContext.key });
    },
  });
}

export function useDeleteComment(): UseMutationResult<void, Error, CommentDeleteVariables, CommentMutationContext> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const client = getCommentsClient(context.isDemo);
  return useMutation<void, Error, CommentDeleteVariables, CommentMutationContext>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return client.remove(commentDeleteInput(context, input));
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      if (hasHistoricalGuard(context, input.historical, input.clubMonth)) throw new Error('O histórico é somente leitura.');
      const scoped = commentDeleteInput(context, input);
      const key = commentKey(context, scoped.gameId, scoped.clubMonth);
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<ClubComment[]>(key);
      context.queryClient.setQueryData(key, updateCommentTree(previous || [], input.commentId, () => null));
      return { key, previous };
    },
    onError: (_error, _input, mutationContext) => {
      if (context.isSessionCurrent(epoch) && mutationContext) context.queryClient.setQueryData(mutationContext.key, mutationContext.previous);
    },
    onSettled: (_data, _error, _input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext) return;
      void context.queryClient.invalidateQueries({ queryKey: mutationContext.key });
    },
  });
}

export function useSetCommentReaction(): UseMutationResult<void, Error, ReactionVariables, CommentMutationContext> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const client = getCommentsClient(context.isDemo);
  return useMutation<void, Error, ReactionVariables, CommentMutationContext>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return client.setReaction(reactionInput(context, input));
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      if (hasHistoricalGuard(context, input.historical, input.clubMonth)) throw new Error('O histórico é somente leitura.');
      const scoped = reactionInput(context, input);
      const key = commentKey(context, scoped.gameId, scoped.clubMonth);
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<ClubComment[]>(key);
      context.queryClient.setQueryData(key, updateCommentTree(previous || [], input.commentId, comment => optimisticReaction(comment, input, context.profile)));
      return { key, previous };
    },
    onError: (_error, _input, mutationContext) => {
      if (context.isSessionCurrent(epoch) && mutationContext) context.queryClient.setQueryData(mutationContext.key, mutationContext.previous);
    },
    onSettled: (_data, _error, _input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext) return;
      void context.queryClient.invalidateQueries({ queryKey: mutationContext.key });
    },
  });
}

function snapshotFor(context: DiscussionContext, options?: { snapshotMonth?: string | null }) {
  if (options && options.snapshotMonth !== undefined) return options.snapshotMonth || null;
  return context.isHistorical ? context.selectedMonth : null;
}

export function useNotes(gameId: string, options?: { snapshotMonth?: string | null }): UseQueryResult<LocalNote[], Error> {
  const context = useAppInternal();
  const snapshotMonth = snapshotFor(context, options);
  const key = React.useMemo(() => notesKey(context, gameId, snapshotMonth), [context, gameId, snapshotMonth]);
  const client = getNotesClient(context.isDemo);
  return useQuery<LocalNote[], Error>({
    queryKey: key,
    enabled: context.ready && Boolean(context.userId) && Boolean(gameId),
    queryFn: () => client.read({
      userId: requireUser(context.userId),
      isDemo: context.isDemo,
      gameId,
      snapshotMonth,
    }),
  });
}

export function useCreateNote(): UseMutationResult<LocalNote, Error, NoteVariables, NoteMutationContext> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const client = getNotesClient(context.isDemo);
  return useMutation<LocalNote, Error, NoteVariables, NoteMutationContext>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return client.create(noteCreateInput(context, input));
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      if (hasHistoricalGuard(context, input.historical)) throw new Error('O histórico é somente leitura.');
      const key = notesKey(context, input.gameId, null);
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<LocalNote[]>(key);
      return { key, previous };
    },
    onSuccess: (note, _input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext) return;
      context.queryClient.setQueryData<LocalNote[]>(mutationContext.key, current => {
        const values = current || [];
        return values.some(item => item.id === note.id) ? values.map(item => item.id === note.id ? note : item) : [...values, note];
      });
    },
    onError: (_error, _input, mutationContext) => {
      if (context.isSessionCurrent(epoch) && mutationContext) context.queryClient.setQueryData(mutationContext.key, mutationContext.previous);
    },
    onSettled: (_data, _error, _input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext) return;
      void context.queryClient.invalidateQueries({ queryKey: mutationContext.key });
    },
  });
}

export function useUpdateNote(): UseMutationResult<LocalNote, Error, NoteUpdateVariables, NoteMutationContext> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const client = getNotesClient(context.isDemo);
  return useMutation<LocalNote, Error, NoteUpdateVariables, NoteMutationContext>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return client.update(noteUpdateInput(context, input));
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      if (hasHistoricalGuard(context, input.historical)) throw new Error('O histórico é somente leitura.');
      const key = notesKey(context, input.gameId, null);
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<LocalNote[]>(key);
      return { key, previous };
    },
    onSuccess: (note, _input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext) return;
      context.queryClient.setQueryData<LocalNote[]>(mutationContext.key, current => (current || []).map(item => item.id === note.id ? note : item));
    },
    onError: (_error, _input, mutationContext) => {
      if (context.isSessionCurrent(epoch) && mutationContext) context.queryClient.setQueryData(mutationContext.key, mutationContext.previous);
    },
    onSettled: (_data, _error, _input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext) return;
      void context.queryClient.invalidateQueries({ queryKey: mutationContext.key });
    },
  });
}

export function useDeleteNote(): UseMutationResult<void, Error, NoteDeleteVariables, NoteMutationContext> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const client = getNotesClient(context.isDemo);
  return useMutation<void, Error, NoteDeleteVariables, NoteMutationContext>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return client.remove(noteDeleteInput(context, input));
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      if (hasHistoricalGuard(context, input.historical)) throw new Error('O histórico é somente leitura.');
      const key = notesKey(context, input.gameId, null);
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<LocalNote[]>(key);
      return { key, previous };
    },
    onError: (_error, _input, mutationContext) => {
      if (context.isSessionCurrent(epoch) && mutationContext) context.queryClient.setQueryData(mutationContext.key, mutationContext.previous);
    },
    onSettled: (_data, _error, _input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext) return;
      void context.queryClient.invalidateQueries({ queryKey: mutationContext.key });
    },
  });
}

const EMPTY_DRAFT: NoteDraft = { body: '', updatedAt: '' };

function draftKey(userId: string, gameId: string) {
  return `@clube-do-jogo/note-draft/${encodeURIComponent(userId)}/${encodeURIComponent(gameId)}`;
}

function parseDraft(value: string | null): NoteDraft {
  if (!value) return { ...EMPTY_DRAFT };
  try {
    const parsed = JSON.parse(value) as Partial<NoteDraft>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.body !== 'string' || (parsed.imageDataUrl !== undefined && typeof parsed.imageDataUrl !== 'string')) return { ...EMPTY_DRAFT };
    return {
      target: parsed.target && typeof parsed.target.id === 'string' && typeof parsed.target.createdAt === 'string'
        && (parsed.target.kind === 'new' || (parsed.target.kind === 'edit' && typeof parsed.target.expectedUpdatedAt === 'string')) ? parsed.target : undefined,
      body: parsed.body,
      imageDataUrl: parsed.imageDataUrl,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

export function useNoteDraft(gameId: string): NoteDraftState {
  const context = useAppInternal();
  const userId = context.userId;
  const epoch = context.sessionEpoch;
  const key = userId && gameId ? draftKey(userId, gameId) : null;
  const [draft, setDraftState] = React.useState<NoteDraft>({ ...EMPTY_DRAFT });
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const loadGeneration = React.useRef(0);
  const latestDraft = React.useRef<{ key: string; epoch: number; value: NoteDraft } | null>(null);

  React.useEffect(() => {
    const generation = ++loadGeneration.current;
    if (!key || !context.ready) {
      return undefined;
    }
    void (draftWrites.get(key) || Promise.resolve()).catch(() => undefined).then(() => nativeStorage.getItem(key)).then(value => {
      if (generation !== loadGeneration.current || !context.isSessionCurrent(epoch) || context.userId !== userId) return;
      const parsed = parseDraft(value);
      latestDraft.current = { key, epoch, value: parsed };
      setDraftState(parsed);
      setLoadedKey(key);
      setErrorKey(null);
    }).catch(reason => {
      if (generation !== loadGeneration.current || !context.isSessionCurrent(epoch) || context.userId !== userId) return;
      setLoadedKey(key);
      setErrorKey(key);
      setError(reason instanceof Error ? reason : new Error('Não foi possível carregar o rascunho.'));
    });
    return () => { loadGeneration.current += 1; };
  }, [context, context.ready, epoch, key, userId]);

  const visibleDraft = loadedKey === key ? draft : EMPTY_DRAFT;
  const visibleError = errorKey === key ? error : null;
  const setDraft = React.useCallback((value: NoteDraft | ((current: NoteDraft) => NoteDraft)) => {
    if (!key || !context.isSessionCurrent(epoch)) return;
    loadGeneration.current += 1;
    const current = latestDraft.current;
    const previous = current?.key === key && current.epoch === epoch ? current.value : EMPTY_DRAFT;
    const next = typeof value === 'function' ? value(previous) : value;
    latestDraft.current = { key, epoch, value: next };
    setDraftState(next);
    setLoadedKey(key);
    setErrorKey(key);
    setError(null);
    const operation = enqueueDraftWrite(key, () => next.body || next.imageDataUrl
      ? nativeStorage.setItem(key, JSON.stringify(next))
      : nativeStorage.removeItem(key));
    void operation.catch(reason => {
      if (context.isSessionCurrent(epoch) && context.userId === userId) setError(reason instanceof Error ? reason : new Error('Não foi possível salvar o rascunho.'));
    });
  }, [context, epoch, key, userId]);

  const clearDraft = React.useCallback(() => {
    if (!key || !context.isSessionCurrent(epoch)) return;
    loadGeneration.current += 1;
    latestDraft.current = { key, epoch, value: { ...EMPTY_DRAFT } };
    setDraftState({ ...EMPTY_DRAFT });
    setLoadedKey(key);
    setErrorKey(key);
    setError(null);
    void enqueueDraftWrite(key, () => nativeStorage.removeItem(key)).catch(reason => {
      if (context.isSessionCurrent(epoch) && context.userId === userId) setError(reason instanceof Error ? reason : new Error('Não foi possível apagar o rascunho.'));
    });
  }, [context, epoch, key, userId]);

  return { draft: visibleDraft, loading: Boolean(key) && loadedKey !== key, error: visibleError, setDraft, clearDraft };
}
