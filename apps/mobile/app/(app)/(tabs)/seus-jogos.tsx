import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Chip } from '@/components/Chip';
import { GameListRow } from '@/components/GameListRow';
import { StatusPill } from '@/components/StatusPill';
import { Sheet } from '@/components/Sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useBacklog, useFavorite, useLibrary, useSetProgress } from '@/state/queries';
import { colors, radii, spacing, typography } from '@/theme';
import type { LibraryGame, ProgressStatus } from '@clube-do-jogo/domain';

type QuickFilter = 'all' | 'started' | 'finished' | 'not_started' | 'favorites';

const quickFilters: Array<{ value: QuickFilter; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'all', label: 'Todos', icon: 'albums-outline' },
  { value: 'started', label: 'Comecei', icon: 'play-outline' },
  { value: 'finished', label: 'Finalizados', icon: 'flag-outline' },
  { value: 'not_started', label: 'Não iniciados', icon: 'ellipse-outline' },
  { value: 'favorites', label: 'Favoritos', icon: 'heart-outline' },
];

const statusLabel: Record<ProgressStatus, string> = { not_started: 'Não iniciado', started: 'Comecei', finished: 'Finalizado' };

export default function YourGamesScreen() {
  const router = useRouter();
  const libraryQuery = useLibrary();
  const backlog = useBacklog();
  const favorite = useFavorite();
  const setProgress = useSetProgress();
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [search, setSearch] = useState('');
  const [actionsTarget, setActionsTarget] = useState<LibraryGame | null>(null);

  const library = useMemo(() => libraryQuery.data?.library ?? [], [libraryQuery.data?.library]);
  const visible = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('pt-BR');
    return library.filter(item => {
      const status = item.progress?.status ?? 'not_started';
      if (quickFilter === 'favorites' ? !item.favorite : quickFilter !== 'all' && status !== quickFilter) return false;
      if (normalized && !item.game.title.toLocaleLowerCase('pt-BR').includes(normalized)) return false;
      return true;
    });
  }, [library, quickFilter, search]);

  function toggleFavorite(item: LibraryGame) {
    favorite.mutate({ gameId: item.game.id, favorite: !item.favorite });
  }

  function changeStatus(item: LibraryGame, status: ProgressStatus) {
    setActionsTarget(null);
    setProgress.mutate({ gameId: item.game.id, status });
  }

  function removeFromLibrary(item: LibraryGame) {
    setActionsTarget(null);
    backlog.mutate({ gameId: item.game.id, inBacklog: false });
  }

  const mutationError = backlog.error || favorite.error || setProgress.error;

  return (
    <Screen onRefresh={() => libraryQuery.refetch()} refreshing={libraryQuery.isRefetching}>
      <AppHeader title="Meus jogos" subtitle="Sua biblioteca pessoal" />

      <View style={styles.searchField}>
        <Ionicons name="search" size={16} color={colors.zinc600} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar nos seus jogos"
          placeholderTextColor={colors.zinc600}
          style={styles.searchInput}
          accessibilityLabel="Buscar nos seus jogos"
        />
      </View>

      <View style={styles.chipsRow}>
        {quickFilters.map(item => (
          <Chip key={item.value} label={item.label} icon={item.icon} selected={quickFilter === item.value} onPress={() => setQuickFilter(item.value)} />
        ))}
      </View>

      <Text style={styles.count}>{visible.length} {visible.length === 1 ? 'jogo' : 'jogos'}</Text>
      {mutationError ? <Text style={styles.formError}>{mutationError.message}</Text> : null}

      {libraryQuery.isLoading ? (
        <LoadingState label="Carregando sua biblioteca…" />
      ) : libraryQuery.isError ? (
        <ErrorState message={libraryQuery.error.message} onRetry={() => libraryQuery.refetch()} />
      ) : !visible.length ? (
        <EmptyState icon="library-outline" title="Nenhum jogo encontrado" description="Adicione jogos pela aba Explorar." />
      ) : (
        <View style={styles.list}>
          {visible.map(item => {
            const status = item.progress?.status ?? 'not_started';
            return (
              <GameListRow
                key={item.game.id}
                game={item.game}
                onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: item.game.id } })}
                subtitle={<StatusPill status={status} />}
                action={
                  <View style={styles.actionsColumn}>
                    {item.favorite ? <Ionicons name="heart" size={16} color={colors.pink400} /> : null}
                    <Pressable
                      onPress={() => setActionsTarget(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Opções de ${item.game.title}`}
                      style={styles.moreButton}
                    >
                      <Ionicons name="ellipsis-horizontal" size={16} color={colors.zinc400} />
                    </Pressable>
                  </View>
                }
              />
            );
          })}
        </View>
      )}

      <Sheet visible={Boolean(actionsTarget)} title={actionsTarget?.game.title ?? ''} onClose={() => setActionsTarget(null)}>
        {actionsTarget ? (
          <View style={styles.sheetBody}>
            <Pressable
              onPress={() => toggleFavorite(actionsTarget)}
              accessibilityRole="button"
              accessibilityLabel={actionsTarget.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              style={styles.sheetItem}
            >
              <Ionicons name={actionsTarget.favorite ? 'heart' : 'heart-outline'} size={18} color={colors.pink400} />
              <Text style={styles.sheetItemLabel}>{actionsTarget.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}</Text>
            </Pressable>
            {(['not_started', 'started', 'finished'] as ProgressStatus[]).map(status => (
              <Pressable
                key={status}
                disabled={(actionsTarget.progress?.status ?? 'not_started') === status}
                onPress={() => changeStatus(actionsTarget, status)}
                accessibilityRole="button"
                accessibilityLabel={`Marcar como ${statusLabel[status]}`}
                style={[styles.sheetItem, (actionsTarget.progress?.status ?? 'not_started') === status && styles.sheetItemDisabled]}
              >
                <Ionicons name="flag-outline" size={18} color={colors.zinc400} />
                <Text style={styles.sheetItemLabel}>Marcar como {statusLabel[status]}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => removeFromLibrary(actionsTarget)}
              accessibilityRole="button"
              accessibilityLabel="Remover de Meus Jogos"
              style={[styles.sheetItem, styles.sheetItemDanger]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.red300} />
              <Text style={[styles.sheetItemLabel, styles.sheetItemDangerLabel]}>Remover de Meus Jogos</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 14 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  count: { ...typography.tiny, color: colors.zinc600, marginBottom: spacing.md },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600', marginBottom: spacing.md },
  list: { gap: spacing.sm },
  actionsColumn: { alignItems: 'center', gap: spacing.sm },
  moreButton: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceDeep },
  sheetBody: { padding: spacing.lg, gap: spacing.sm },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceSofter },
  sheetItemDisabled: { opacity: 0.4 },
  sheetItemLabel: { ...typography.small, color: colors.zinc300 },
  sheetItemDanger: { backgroundColor: 'rgba(239,68,68,0.08)' },
  sheetItemDangerLabel: { color: colors.red300 },
});
