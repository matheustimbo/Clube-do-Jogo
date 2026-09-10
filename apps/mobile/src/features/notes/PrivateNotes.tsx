import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ImageGalleryModal } from '@/features/media/ImageGalleryModal';
import { useAppInternal } from '@/state/app-provider';
import { createNativeNoteId, useCreateNote, useDeleteNote, useNoteDraft, useNotes, useUpdateNote } from '@/state/discussion-queries';
import { colors, radii, spacing, typography } from '@/theme';
import { NotesConflictError } from '@clube-do-jogo/data';
import { formatShortDate, formatTime, type LocalNote } from '@clube-do-jogo/domain';

const MAX_IMAGE_BYTES = 4_000_000;

type PrivateNotesProps = { gameId: string; snapshotMonth?: string };

export function PrivateNotes(props: PrivateNotesProps) {
  const { sessionEpoch, selectedMonth } = useAppInternal();
  return <NotesEditor key={`${sessionEpoch}:${props.gameId}:${props.snapshotMonth || selectedMonth}`} {...props} />;
}

function NotesEditor({ gameId, snapshotMonth }: PrivateNotesProps) {
  const { isDemo, isHistorical } = useAppInternal();
  const readOnly = Boolean(snapshotMonth) || isHistorical;

  const notesQuery = useNotes(gameId, { snapshotMonth });
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const draftState = useNoteDraft(gameId);

  const [imageError, setImageError] = useState('');
  const [picking, setPicking] = useState(false);
  const [actionsTarget, setActionsTarget] = useState<LocalNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocalNote | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const notes = notesQuery.data ?? [];
  const draft = draftState.draft;
  const editing = draft.target?.kind === 'edit' ? draft.target : null;
  const pending = createNote.isPending || updateNote.isPending;
  const conflict = updateNote.error instanceof NotesConflictError ? updateNote.error
    : createNote.error instanceof NotesConflictError ? createNote.error : null;

  function beginEdit(note: LocalNote) {
    setActionsTarget(null);
    createNote.reset();
    updateNote.reset();
    draftState.setDraft({ target: { kind: 'edit', id: note.id, createdAt: note.createdAt, expectedUpdatedAt: note.updatedAt }, body: note.body, imageDataUrl: note.imageDataUrl, updatedAt: new Date().toISOString() });
  }

  function cancelEdit() {
    createNote.reset();
    updateNote.reset();
    draftState.clearDraft();
  }

  function submit() {
    const text = draft.body.trim();
    if (!text && !draft.imageDataUrl) return;
    if (pending || draftState.loading) return;
    if (editing) {
      updateNote.mutate({
        gameId,
        note: { id: editing.id, body: text, imageDataUrl: draft.imageDataUrl, createdAt: editing.createdAt, updatedAt: new Date().toISOString() },
        expectedUpdatedAt: editing.expectedUpdatedAt,
      }, { onSuccess: () => { Keyboard.dismiss(); draftState.clearDraft(); } });
      return;
    }
    const target = draft.target || { kind: 'new' as const, id: createNativeNoteId(), createdAt: new Date().toISOString() };
    draftState.setDraft(current => ({ ...current, target }));
    createNote.mutate({
      gameId,
      note: { id: target.id, body: text, imageDataUrl: draft.imageDataUrl, createdAt: target.createdAt, updatedAt: target.createdAt },
    }, { onSuccess: () => { Keyboard.dismiss(); draftState.clearDraft(); } });
  }

  function removeImage() {
    draftState.setDraft(current => ({ ...current, imageDataUrl: undefined, updatedAt: new Date().toISOString() }));
  }

  async function pickImage() {
    setImageError('');
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if ((asset.fileSize || 0) > MAX_IMAGE_BYTES || (asset.base64?.length || 0) * 0.75 > MAX_IMAGE_BYTES) {
        setImageError('Escolha uma imagem de até 4 MB.');
        return;
      }
      if (!asset.base64) {
        setImageError('Não foi possível carregar a imagem selecionada.');
        return;
      }
      const dataUrl = `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
      draftState.setDraft(current => ({ ...current, imageDataUrl: dataUrl, updatedAt: new Date().toISOString() }));
    } catch {
      setImageError('Não foi possível abrir as fotos. Tente novamente.');
    } finally {
      setPicking(false);
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteNote.mutate({ gameId, noteId: deleteTarget.id, expectedUpdatedAt: deleteTarget.updatedAt }, {
      onSuccess: () => {
        if (editing?.id === deleteTarget.id) cancelEdit();
        setDeleteTarget(null);
      },
    });
  }

  const noteImages = notes.flatMap(note => note.imageDataUrl ? [note.imageDataUrl] : []);

  if (notesQuery.isLoading) return <LoadingState label="Carregando anotações…" />;
  if (notesQuery.isError) {
    return <ErrorState message={notesQuery.error.message} onRetry={() => notesQuery.refetch()} />;
  }

  return (
    <View style={styles.container}>
      {!readOnly && !isDemo ? (
        <View style={styles.syncNotice}>
          <Ionicons name="information-circle-outline" size={14} color={colors.zinc400} />
          <Text style={styles.syncNoticeText}>
            Anotações antigas pendentes de sincronização só são enviadas ao abrir o navegador onde foram criadas.
          </Text>
        </View>
      ) : null}

      {notes.length === 0 ? (
        <EmptyState
          icon="create-outline"
          title={snapshotMonth ? 'Nenhuma anotação neste ciclo' : 'Guarde ideias para a reunião'}
          description={snapshotMonth ? 'Não havia anotações registradas quando o ciclo foi encerrado.' : 'Registre detalhes, teorias e momentos do jogo conforme avança.'}
        />
      ) : (
        <View style={styles.list}>
          {notes.map(note => (
            <Pressable
              key={note.id}
              onLongPress={() => { if (!readOnly) setActionsTarget(note); }}
              accessibilityRole={readOnly ? undefined : 'button'}
              accessibilityLabel={readOnly ? undefined : `${note.body || "Anotação com imagem"}. Opções da anotação de ${formatShortDate(note.createdAt)}`}
              testID={`note-row-${note.id}`}
              style={styles.bubbleRow}
            >
              <View style={styles.bubble}>
                {note.imageDataUrl ? (
                  <Pressable
                    onPress={() => setGalleryIndex(noteImages.indexOf(note.imageDataUrl!))}
                    accessibilityRole="button"
                    accessibilityLabel="Abrir imagem da anotação"
                  >
                    <Image source={{ uri: note.imageDataUrl }} style={styles.bubbleImage} contentFit="cover" />
                  </Pressable>
                ) : null}
                {note.body ? <Text style={styles.bubbleText}>{note.body}</Text> : null}
                <View style={styles.bubbleFooter}>
                  {note.updatedAt !== note.createdAt ? <Text style={styles.bubbleMeta}>editada · </Text> : null}
                  <Text style={styles.bubbleMeta}>{formatTime(note.createdAt)}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {!readOnly ? (
        <View style={styles.composerCard}>
          {editing ? (
            <View style={styles.editingBanner}>
              <Text style={styles.editingBannerText}>Editando anotação</Text>
              <Pressable onPress={cancelEdit} accessibilityRole="button" accessibilityLabel="Cancelar edição" hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.violet300} />
              </Pressable>
            </View>
          ) : null}
          {imageError ? <Text style={styles.formError}>{imageError}</Text> : null}
          {draftState.error ? <Text style={styles.formError}>{draftState.error.message}</Text> : null}
          {draft.imageDataUrl ? (
            <View style={styles.previewRow}>
              <Image source={{ uri: draft.imageDataUrl }} style={styles.previewImage} contentFit="cover" />
              <Pressable onPress={removeImage} accessibilityRole="button" accessibilityLabel="Remover imagem" style={styles.previewRemove}>
                <Ionicons name="close" size={13} color={colors.zinc950} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composerRow}>
            <Pressable
              onPress={() => void pickImage()}
              disabled={picking || pending || draftState.loading}
              accessibilityRole="button"
              accessibilityLabel="Anexar imagem"
              style={styles.imageButton}
            >
              <Ionicons name="image-outline" size={18} color={colors.zinc400} />
            </Pressable>
            <TextInput
              editable={!pending && !draftState.loading}
              value={draft.body}
              onChangeText={text => draftState.setDraft(current => ({ ...current, body: text, updatedAt: new Date().toISOString() }))}
              placeholder="Anote uma ideia…"
              placeholderTextColor={colors.zinc600}
              multiline
              style={styles.composerInput}
              testID="private-notes-input"
              accessibilityLabel="Escrever anotação"
            />
            <Pressable
              onPress={submit}
              disabled={(!draft.body.trim() && !draft.imageDataUrl) || pending || draftState.loading}
              accessibilityRole="button"
              accessibilityLabel="Salvar anotação"
              style={[styles.sendButton, (!draft.body.trim() && !draft.imageDataUrl) && styles.sendButtonDisabled]}
            >
              <Ionicons name="send" size={16} color={colors.white} />
            </Pressable>
          </View>
          {createNote.isError ? <Text style={styles.formError}>{createNote.error?.message}</Text> : null}
          {updateNote.isError ? <Text style={styles.formError}>{updateNote.error?.message}</Text> : null}
          {conflict ? <View style={styles.actionsBody}>
            {conflict.remote ? <>
              <Text style={styles.bubbleText}>Versão do servidor: {conflict.remote.body}</Text>
              <Button label="Editar versão do servidor" variant="secondary" onPress={() => beginEdit(conflict.remote!)} />
            </> : null}
            <Button label="Manter como nova anotação" variant="secondary" onPress={() => {
              draftState.setDraft(current => ({ ...current, target: undefined }));
              createNote.reset();
              updateNote.reset();
            }} />
          </View> : null}
        </View>
      ) : null}

      <Sheet visible={Boolean(actionsTarget)} title="Anotação" onClose={() => setActionsTarget(null)}>
        <View style={styles.actionsBody}>
          <Button label="Editar" variant="secondary" onPress={() => actionsTarget && beginEdit(actionsTarget)} />
          <Button
            label="Excluir"
            variant="danger"
            onPress={() => {
              setDeleteTarget(actionsTarget);
              setActionsTarget(null);
            }}
          />
        </View>
      </Sheet>

      <Sheet visible={Boolean(deleteTarget)} title="Apagar anotação?" onClose={() => setDeleteTarget(null)}>
        <View style={styles.actionsBody}>
          <Text style={styles.deleteText}>Esta ação não pode ser desfeita.</Text>
          {deleteNote.isError ? <Text style={styles.formError}>{deleteNote.error?.message}</Text> : null}
          <View style={styles.deleteActions}>
            <Button label="Cancelar" variant="secondary" onPress={() => setDeleteTarget(null)} style={styles.deleteButton} />
            <Button label="Apagar" variant="danger" loading={deleteNote.isPending} onPress={confirmDelete} style={styles.deleteButton} />
          </View>
        </View>
      </Sheet>

      {galleryIndex !== null ? <ImageGalleryModal
        key={`note-gallery-${galleryIndex}`}
        visible={galleryIndex !== null}
        title="anotações"
        images={noteImages}
        activeIndex={galleryIndex ?? 0}
        onActiveIndexChange={setGalleryIndex}
        onClose={() => setGalleryIndex(null)}
      /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  syncNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSofter,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.sm,
  },
  syncNoticeText: { flex: 1, ...typography.small, color: colors.zinc500, lineHeight: 16 },
  list: { gap: spacing.sm },
  bubbleRow: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '85%',
    minWidth: 96,
    borderRadius: radii.xl,
    borderBottomRightRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    backgroundColor: 'rgba(124,58,237,0.18)',
    overflow: 'hidden',
  },
  bubbleImage: { width: '100%', aspectRatio: 16 / 9 },
  bubbleText: { ...typography.body, color: colors.foreground, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  bubbleFooter: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  bubbleMeta: { fontSize: 9, color: 'rgba(196,181,253,0.6)', fontWeight: '700' },
  composerCard: {
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.md,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.md,
    backgroundColor: 'rgba(139,92,246,0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  editingBannerText: { fontSize: 11, fontWeight: '700', color: colors.violet300 },
  formError: { ...typography.small, color: colors.red300 },
  previewRow: { alignSelf: 'flex-start' },
  previewImage: { width: 96, height: 72, borderRadius: radii.lg, backgroundColor: colors.zinc900 },
  previewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  imageButton: { width: 40, height: 40, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceDeep },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.foreground,
  },
  sendButton: { width: 40, height: 40, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violet600 },
  sendButtonDisabled: { backgroundColor: colors.zinc800 },
  actionsBody: { padding: spacing.lg, gap: spacing.sm },
  deleteText: { ...typography.body, color: colors.zinc400 },
  deleteActions: { flexDirection: 'row', gap: spacing.sm },
  deleteButton: { flex: 1 },
});
