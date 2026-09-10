import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useApp } from '@/state/app-provider';
import { useLibrary } from '@/state/queries';
import { colors, radii, spacing, typography } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, isHistorical, signOut } = useApp();
  const libraryQuery = useLibrary();

  const library = useMemo(() => libraryQuery.data?.library ?? [], [libraryQuery.data?.library]);
  const stats = useMemo(() => {
    const finished = library.filter(item => item.progress?.status === 'finished').length;
    const started = library.filter(item => item.progress?.status === 'started').length;
    const favorites = library.filter(item => item.favorite).length;
    return { total: library.length, finished, started, favorites };
  }, [library]);

  return (
    <Screen onRefresh={() => libraryQuery.refetch()} refreshing={libraryQuery.isRefetching}>
      <AppHeader title="Perfil" subtitle={isHistorical ? 'Resultado preservado do ciclo encerrado' : undefined} />

      <View style={styles.profileCard}>
        <Avatar uri={profile?.avatar_url ?? null} name={profile?.name ?? 'Você'} size={72} />
        <Text style={styles.name}>{profile?.name ?? 'Membro'}</Text>
        {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}

        <Pressable
          onPress={() => profile && router.push({ pathname: '/(app)/perfil/[id]', params: { id: profile.id } })}
          disabled={!profile}
          accessibilityRole="button"
          accessibilityLabel="Ver perfil público"
          style={styles.linkRow}
        >
          <Text style={styles.linkText}>Ver perfil público</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.violet300} />
        </Pressable>
      </View>

      {libraryQuery.isLoading ? (
        <LoadingState label="Carregando estatísticas…" />
      ) : libraryQuery.isError ? (
        <ErrorState message={libraryQuery.error.message} onRetry={() => libraryQuery.refetch()} />
      ) : !library.length ? (
        <EmptyState icon="library-outline" title="Biblioteca vazia" description="Adicione jogos pela aba Explorar para ver estatísticas aqui." />
      ) : (
        <View style={styles.statsGrid}>
          <StatCard label="Na biblioteca" value={stats.total} icon="library-outline" />
          <StatCard label="Finalizados" value={stats.finished} icon="flag-outline" />
          <StatCard label="Jogando" value={stats.started} icon="play-outline" />
          <StatCard label="Favoritos" value={stats.favorites} icon="heart-outline" />
        </View>
      )}

      <Pressable
        onPress={() => router.push('/(app)/configuracoes')}
        accessibilityRole="button"
        accessibilityLabel="Abrir configurações"
        style={styles.menuRow}
      >
        <Ionicons name="settings-outline" size={18} color={colors.zinc300} />
        <Text style={styles.menuLabel}>Configurações</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.zinc600} />
      </Pressable>

      <Pressable
        onPress={() => void signOut().catch(error => {
          Alert.alert('Não foi possível sair', error instanceof Error ? error.message : 'Tente novamente.');
        })}
        accessibilityRole="button"
        accessibilityLabel="Sair da conta"
        style={[styles.menuRow, styles.menuRowDanger]}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.red300} />
        <Text style={[styles.menuLabel, styles.menuLabelDanger]}>Sair da conta</Text>
      </Pressable>
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
  email: { ...typography.small, color: colors.zinc500 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  linkText: { color: colors.violet300, fontWeight: '800', fontSize: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    paddingVertical: spacing.lg,
  },
  statValue: { fontSize: 22, fontWeight: '900', color: colors.foreground },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.zinc500 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  menuLabel: { flex: 1, ...typography.small, color: colors.zinc300 },
  menuRowDanger: { borderColor: 'rgba(239,68,68,0.25)', backgroundColor: 'rgba(239,68,68,0.06)' },
  menuLabelDanger: { color: colors.red300 },
});
