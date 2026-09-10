import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { usePersistentState } from '@/hooks/use-persistent-state';
import { colors, radii, spacing, typography } from '@/theme';
import type { LibraryGame, ProgressStatus } from '@clube-do-jogo/domain';

type QuickFilter = 'all' | 'started' | 'finished' | 'not_started' | 'favorites';
type SortMode = 'updated_desc' | 'updated_asc' | 'title_asc' | 'title_desc' | 'duration_asc' | 'duration_desc' | 'rating_desc' | 'rating_asc';

const quickFilters: Array<{ value: QuickFilter; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'all', label: 'Todos', icon: 'albums-outline' },
  { value: 'started', label: 'Comecei', icon: 'play-outline' },
  { value: 'finished', label: 'Finalizados', icon: 'flag-outline' },
  { value: 'not_started', label: 'Não iniciados', icon: 'ellipse-outline' },
  { value: 'favorites', label: 'Favoritos', icon: 'heart-outline' },
];

const sortOptions: Array<[SortMode, string]> = [
  ['updated_desc', 'Atualizados recentemente'],
  ['updated_asc', 'Atualizados há mais tempo'],
  ['title_asc', 'Título: A–Z'],
  ['title_desc', 'Título: Z–A'],
  ['duration_asc', 'Menor duração'],
  ['duration_desc', 'Maior duração'],
  ['rating_desc', 'Maior nota'],
  ['rating_asc', 'Menor nota'],
];

const statusLabel: Record<ProgressStatus, string> = { not_started: 'Não iniciado', started: 'Comecei', finished: 'Finalizado' };

export default function YourGamesScreen() {
  const router = useRouter();
  const libraryQuery = useLibrary();
  const backlog = useBacklog();
  const favorite = useFavorite();
  const setProgress = useSetProgress();
  const [quickFilter, setQuickFilter] = usePersistentState<QuickFilter>('clube-do-jogo:mobile:library-quick-filter', 'all');
  const [sortMode, setSortMode] = usePersistentState<SortMode>('clube-do-jogo:mobile:library-sort', 'updated_desc');
  const [search, setSearch] = useState('');
  const [actionsTarget, setActionsTarget] = useState<LibraryGame | null>(null);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  const library = useMemo(() => libraryQuery.data?.library ?? [], [libraryQuery.data?.library]);
  const visible = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('pt-BR');
    const matches = library.filter(item => {
      const status = item.progress?.status ?? 'not_started';
      if (quickFilter === 'favorites' ? !item.favorite : quickFilter !== 'all' && status !== quickFilter) return false;
      if (normalized && !item.game.title.toLocaleLowerCase('pt-BR').includes(normalized)) return false;
      return true;
    });
    return [...matches].sort((a, b) => {
      if (sortMode === 'title_asc') return a.game.title.localeCompare(b.game.title, 'pt-BR');
      if (sortMode === 'title_desc') return b.game.title.localeCompare(a.game.title, 'pt-BR');
      if (sortMode === 'duration_asc') return a.game.duration_hours - b.game.duration_hours;
      if (sortMode === 'duration_desc') return b.game.duration_hours - a.game.duration_hours;
      if (sortMode === 'rating_desc') return Number(b.game.average_rating ?? -Infinity) - Number(a.game.average_rating ?? -Infinity);
      if (sortMode === 'rating_asc') return Number(a.game.average_rating ?? Infinity) - Number(b.game.average_rating ?? Infinity);
      if (sortMode === 'updated_asc') return (a.updatedAt || '').localeCompare(b.updatedAt || '');
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }, [library, quickFilter, search, sortMode]);

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
    <Screen scroll={false}>
      <FlatList
        style={styles.flatList}
        data={visible}
        keyExtractor={item => item.game.id}
        renderItem={({ item }) => {
          const status = item.progress?.status ?? 'not_started';
          return (
            <GameListRow
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
        }}
        contentContainerStyle={styles.list}
        refreshing={libraryQuery.isRefetching}
        onRefresh={() => libraryQuery.refetch()}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
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

            <View style={styles.countRow}>
              <Text style={styles.count}>{visible.length} {visible.length === 1 ? 'jogo' : 'jogos'}</Text>
              <Pressable
                onPress={() => setSortSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Ordenar"
                style={styles.sortButton}
              >
                <Ionicons name="swap-vertical" size={13} color={colors.zinc300} />
                <Text style={styles.sortButtonLabel}>Ordenar</Text>
              </Pressable>
            </View>
            {mutationError ? <Text style={styles.formError}>{mutationError.message}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          libraryQuery.isLoading ? (
            <LoadingState label="Carregando sua biblioteca…" />
          ) : libraryQuery.isError ? (
            <ErrorState message={libraryQuery.error.message} onRetry={() => libraryQuery.refetch()} />
          ) : (
            <EmptyState icon="library-outline" title="Nenhum jogo encontrado" description="Adicione jogos pela aba Explorar." />
          )
        }
      />

      <Sheet visible={sortSheetOpen} title="Ordenar" onClose={() => setSortSheetOpen(false)}>
        <FlatList
          data={sortOptions}
          keyExtractor={([value]) => value}
          contentContainerStyle={styles.sheetBody}
          renderItem={({ item: [value, label] }) => (
            <Pressable
              onPress={() => { setSortMode(value); setSortSheetOpen(false); }}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: sortMode === value }}
              style={[styles.sheetItem, sortMode === value && styles.sheetItemSelected]}
            >
              <Text style={styles.sheetItemLabel}>{label}</Text>
              {sortMode === value ? <Ionicons name="checkmark" size={16} color={colors.violet300} /> : null}
            </Pressable>
          )}
        />
      </Sheet>

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
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  count: { ...typography.tiny, color: colors.zinc600 },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter },
  sortButtonLabel: { fontSize: 11, fontWeight: '700', color: colors.zinc300 },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600', marginBottom: spacing.md },
  flatList: { flex: 1 },
  list: { gap: spacing.sm, paddingBottom: spacing.xxxl },
  actionsColumn: { alignItems: 'center', gap: spacing.sm },
  moreButton: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceDeep },
  sheetBody: { padding: spacing.lg, gap: spacing.sm },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceSofter },
  sheetItemSelected: { backgroundColor: 'rgba(139,92,246,0.15)', justifyContent: 'space-between' },
  sheetItemDisabled: { opacity: 0.4 },
  sheetItemLabel: { ...typography.small, color: colors.zinc300 },
  sheetItemDanger: { backgroundColor: 'rgba(239,68,68,0.08)' },
  sheetItemDangerLabel: { color: colors.red300 },
});
