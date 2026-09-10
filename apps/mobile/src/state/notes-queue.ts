import type { LocalNote } from '@clube-do-jogo/domain';

// A local note that was submitted (create or update) but not yet confirmed
// by the server. `generation` lets a caller discard an out-of-order network
// response the same way `sessionEpoch` already discards stale session work
// in discussion-queries.ts.
export interface PendingLocalNote {
  note: LocalNote;
  origin: 'create' | 'update';
  expectedUpdatedAt?: string;
  generation: number;
  lastAttemptAt?: string;
  lastError?: string;
}

// Discriminated by `kind` so a `deleted` conflict cannot carry a `remote`
// value: there is nothing remote left to show once the server has deleted
// the note.
export type NoteConflict =
  | { kind: 'changed'; local: LocalNote; remote: LocalNote }
  | { kind: 'deleted'; local: LocalNote };

// One slot per note id, not one slot per game. This is the shape change that
// lets two distinct notes in the same game stay pending at the same time
// instead of overwriting each other's draft.
export type PendingNotesQueue = ReadonlyMap<string, PendingLocalNote>;
export type NoteConflictsByNoteId = ReadonlyMap<string, NoteConflict>;

export function createQueue(): PendingNotesQueue {
  return new Map();
}

export function createConflicts(): NoteConflictsByNoteId {
  return new Map();
}

export function enqueue(queue: PendingNotesQueue, entry: PendingLocalNote): PendingNotesQueue {
  const next = new Map(queue);
  next.set(entry.note.id, entry);
  return next;
}

export function dequeue(queue: PendingNotesQueue, noteId: string): PendingNotesQueue {
  if (!queue.has(noteId)) return queue;
  const next = new Map(queue);
  next.delete(noteId);
  return next;
}

export function markAttempt(queue: PendingNotesQueue, noteId: string, lastError?: string): PendingNotesQueue {
  const current = queue.get(noteId);
  if (!current) return queue;
  const next = new Map(queue);
  next.set(noteId, { ...current, generation: current.generation + 1, lastAttemptAt: new Date().toISOString(), lastError });
  return next;
}

export function markConflict(conflicts: NoteConflictsByNoteId, noteId: string, conflict: NoteConflict): NoteConflictsByNoteId {
  const next = new Map(conflicts);
  next.set(noteId, conflict);
  return next;
}

export function clearConflict(conflicts: NoteConflictsByNoteId, noteId: string): NoteConflictsByNoteId {
  if (!conflicts.has(noteId)) return conflicts;
  const next = new Map(conflicts);
  next.delete(noteId);
  return next;
}

export function summarize(queue: PendingNotesQueue, conflicts: NoteConflictsByNoteId) {
  return { pending: queue.size, conflicts: conflicts.size };
}
