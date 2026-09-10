import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Chip } from '@/components/Chip';
import { GameListRow } from '@/components/GameListRow';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useBacklog, useDiscovery, useLibrary } from '@/state/queries';
import { colors, spacing, typography } from '@/theme';
import type { DiscoverSource } from '@clube-do-jogo/domain';

const sources: Array<{ value: DiscoverSource; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'popular', label: 'Populares', icon: 'flame-outline' },
  { value: 'rated', label: 'Melhores notas', icon: 'star-outline' },
  { value: 'recent', label: 'Lançamentos', icon: 'sparkles-outline' },
  { value: 'anticipated', label: 'Em breve', icon: 'time-outline' },
];

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function DiscoverScreen() {
  const router = useRouter();
  const [source, setSource] = useState<DiscoverSource>('popular');
  const [draftSearch, setDraftSearch] = useState('');
  const search = useDebouncedValue(draftSearch.trim(), 350);
  const discoverQuery = useDiscovery(source, search || undefined);
  const libraryQuery = useLibrary();
  const backlog = useBacklog();

  const libraryIds = useMemo(
    () => new Set((libraryQuery.data?.library ?? []).filter(item => item.inBacklog).map(item => item.game.id)),
    [libraryQuery.data],
  );
  const items = discoverQuery.data ?? [];

  return (
    <Screen onRefresh={() => discoverQuery.refetch()} refreshing={discoverQuery.isRefetching}>
      <AppHeader title="Explorar" subtitle="Descubra jogos para votar ou adicionar" />

      <View style={styles.searchField}>
        <Ionicons name="search" size={16} color={colors.zinc600} />
        <TextInput
          value={draftSearch}
          onChangeText={setDraftSearch}
          placeholder="Buscar jogos"
          placeholderTextColor={colors.zinc600}
          style={styles.searchInput}
          accessibilityLabel="Buscar jogos"
        />
      </View>

      <View style={styles.chipsRow}>
        {sources.map(item => (
          <Chip key={item.value} label={item.label} icon={item.icon} selected={source === item.value} onPress={() => setSource(item.value)} />
        ))}
      </View>

      <Text style={styles.count}>{items.length} {items.length === 1 ? 'jogo' : 'jogos'}</Text>

      {discoverQuery.isLoading ? (
        <LoadingState label="Carregando jogos…" />
      ) : discoverQuery.isError ? (
        <ErrorState message={discoverQuery.error.message} onRetry={() => discoverQuery.refetch()} />
      ) : !items.length ? (
        <EmptyState icon="search-outline" title="Nenhum jogo encontrado" description="Tente outra busca ou categoria." />
      ) : (
        <View style={styles.list}>
          {items.map(entry => {
            const inLibrary = libraryIds.has(entry.game.id);
            return (
              <GameListRow
                key={entry.game.id}
                game={entry.game}
                onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: entry.game.id } })}
                action={
                  <Pressable
                    disabled={inLibrary || backlog.isPending}
                    onPress={() => backlog.mutate({ gameId: entry.game.id, inBacklog: true })}
                    accessibilityRole="button"
                    accessibilityLabel={inLibrary ? `${entry.game.title} já está em Meus Jogos` : `Adicionar ${entry.game.title} a Meus Jogos`}
                    style={[styles.addButton, inLibrary && styles.addButtonDone]}
                  >
                    <Ionicons name={inLibrary ? 'checkmark' : 'add'} size={14} color={inLibrary ? colors.emerald400 : colors.violet300} />
                  </Pressable>
                }
              />
            );
          })}
        </View>
      )}
      {backlog.isError ? <Text style={styles.formError}>{backlog.error?.message}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 14 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  count: { ...typography.tiny, color: colors.zinc600, marginBottom: spacing.md },
  list: { gap: spacing.sm },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  addButtonDone: { backgroundColor: 'rgba(16,185,129,0.15)' },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600', marginTop: spacing.md },
});
