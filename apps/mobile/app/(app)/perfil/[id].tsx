import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { GameListRow } from '@/components/GameListRow';
import { EmptyState, ErrorState, LoadingState, Section } from '@/components/StateViews';
import { useApp } from '@/state/app-provider';
import { useLibrary } from '@/state/queries';
import { colors, radii, spacing, typography } from '@/theme';

export default function MemberProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileId = String(id);
  const { userId } = useApp();
  const libraryQuery = useLibrary(profileId);

  const stats = useMemo(() => {
    const library = libraryQuery.data?.library ?? [];
    const finished = library.filter(item => item.progress?.status === 'finished').length;
    const started = library.filter(item => item.progress?.status === 'started').length;
    return { total: library.length, finished, started };
  }, [libraryQuery.data]);

  if (libraryQuery.isLoading) {
    return (
      <Screen>
        <LoadingState label="Carregando perfil…" />
      </Screen>
    );
  }

  if (libraryQuery.isError) {
    return (
      <Screen>
        <ErrorState message={libraryQuery.error.message} onRetry={() => libraryQuery.refetch()} />
      </Screen>
    );
  }

  const data = libraryQuery.data;
  if (!data || !data.profile) {
    return (
      <Screen>
        <EmptyState icon="person-outline" title="Perfil não encontrado" description="Esse membro pode não existir mais." />
      </Screen>
    );
  }

  const { profile, completed, favorites } = data;

  return (
    <Screen onRefresh={() => libraryQuery.refetch()} refreshing={libraryQuery.isRefetching}>
      <AppHeader title="Perfil" />

      <View style={styles.profileCard}>
        <Avatar uri={profile.avatar_url} name={profile.name ?? 'Membro'} size={72} />
        <Text style={styles.name}>{profile.name ?? 'Membro'}</Text>
        {profileId === userId ? <Text style={styles.selfBadge}>Esse é você</Text> : null}
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Na biblioteca" value={stats.total} icon="library-outline" />
        <StatCard label="Finalizados" value={stats.finished} icon="flag-outline" />
        <StatCard label="Jogando" value={stats.started} icon="play-outline" />
      </View>

      <Section title="Favoritos">
        {favorites.length ? (
          <View style={styles.list}>
            {favorites.map(game => (
              <GameListRow
                key={game.id}
                game={game}
                onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: game.id } })}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>Nenhum jogo favoritado ainda.</Text>
        )}
      </Section>

      <Section title="Finalizados">
        {completed.length ? (
          <View style={styles.list}>
            {completed.map(game => (
              <GameListRow
                key={game.id}
                game={game}
                onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: game.id } })}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>Nenhum jogo finalizado ainda.</Text>
        )}
      </Section>
    </Screen>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={colors.violet300} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  name: { ...typography.h2, color: colors.foreground, marginTop: spacing.sm },
  selfBadge: { fontSize: 10, fontWeight: '800', color: colors.violet300, textTransform: 'uppercase' },
  statsGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    paddingVertical: spacing.lg,
  },
  statValue: { fontSize: 20, fontWeight: '900', color: colors.foreground },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.zinc500, textAlign: 'center' },
  list: { gap: spacing.sm },
  emptyText: { ...typography.small, color: colors.zinc600 },
});
