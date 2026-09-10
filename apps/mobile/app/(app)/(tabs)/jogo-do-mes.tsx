import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { MonthTrigger } from '@/components/MonthTrigger';
import { MonthPicker } from '@/components/MonthPicker';
import { StatusPill, statusMeta } from '@/components/StatusPill';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useApp } from '@/state/app-provider';
import { useGameOfMonth, useProgress, useSetProgress } from '@/state/queries';
import { colors, radii, spacing, typography } from '@/theme';
import type { ProgressStatus } from '@clube-do-jogo/domain';

const statusOrder: ProgressStatus[] = ['not_started', 'started', 'finished'];

export default function GameOfMonthScreen() {
  const router = useRouter();
  const { userId, selectedMonth, activeMonth, months, isHistorical, setSelectedMonth } = useApp();
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const gameQuery = useGameOfMonth();
  const game = gameQuery.data ?? null;
  const progressQuery = useProgress(game?.id ?? '');
  const setProgress = useSetProgress();

  const progress = progressQuery.data ?? [];
  const mine = progress.find(item => item.user_id === userId) ?? null;
  const finishedCount = progress.filter(item => item.status === 'finished').length;

  function updateStatus(status: ProgressStatus) {
    if (!game || isHistorical || mine?.status === status) return;
    setProgress.mutate({ gameId: game.id, status });
  }

  return (
    <Screen onRefresh={() => gameQuery.refetch()} refreshing={gameQuery.isRefetching}>
      <AppHeader
        title="Jogo do mês"
        subtitle={isHistorical ? 'Ciclo encerrado, somente leitura' : undefined}
        right={<MonthTrigger month={selectedMonth} onPress={() => setMonthPickerVisible(true)} />}
      />

      {gameQuery.isLoading ? (
        <LoadingState label="Carregando jogo do mês…" />
      ) : gameQuery.isError ? (
        <ErrorState message={gameQuery.error.message} onRetry={() => gameQuery.refetch()} />
      ) : !game ? (
        <EmptyState
          icon="calendar-outline"
          title="Jogo ainda não definido"
          description="Um administrador ainda não escolheu o jogo deste ciclo."
        />
      ) : (
        <View style={styles.content}>
          <Pressable
            onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: game.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Ver detalhes de ${game.title}`}
            style={styles.hero}
          >
            <Image source={{ uri: game.image_url }} style={styles.cover} contentFit="cover" accessibilityLabel={`Capa de ${game.title}`} />
            <Text style={styles.title}>{game.title}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Ionicons name="time-outline" size={13} color={colors.zinc400} />
                <Text style={styles.metaText}>{game.duration_hours} h</Text>
              </View>
              {game.release_year ? (
                <View style={styles.metaChip}>
                  <Ionicons name="calendar-outline" size={13} color={colors.zinc400} />
                  <Text style={styles.metaText}>{game.release_year}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.description} numberOfLines={4}>{game.description}</Text>
            <View style={styles.detailLink}>
              <Text style={styles.detailLinkText}>Ver detalhes</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.violet300} />
            </View>
          </Pressable>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Meu progresso</Text>
              {mine ? <StatusPill status={mine.status} /> : null}
            </View>
            <View style={styles.statusRow}>
              {statusOrder.map(status => {
                const meta = statusMeta[status];
                const active = (mine?.status ?? 'not_started') === status;
                return (
                  <Pressable
                    key={status}
                    disabled={isHistorical || active || setProgress.isPending}
                    onPress={() => updateStatus(status)}
                    accessibilityRole="button"
                    accessibilityLabel={meta.label}
                    accessibilityState={{ selected: active, disabled: isHistorical || active }}
                    style={[styles.statusOption, active && styles.statusOptionActive, (isHistorical || active) && styles.statusOptionDisabled]}
                  >
                    <Ionicons name={meta.icon} size={16} color={active ? colors.violet300 : colors.zinc500} />
                    <Text style={[styles.statusOptionLabel, active && styles.statusOptionLabelActive]}>{meta.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {setProgress.isError ? <Text style={styles.formError}>{setProgress.error?.message}</Text> : null}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Progresso do clube</Text>
              <Text style={styles.finishedCount}>{finishedCount} {finishedCount === 1 ? 'finalizou' : 'finalizaram'}</Text>
            </View>
            {progressQuery.isLoading ? (
              <LoadingState label="Carregando progresso do clube…" />
            ) : progressQuery.isError ? (
              <ErrorState message={progressQuery.error.message} onRetry={() => progressQuery.refetch()} />
            ) : progress.length ? (
              <View style={{ gap: spacing.sm }}>
                {progress.map(item => (
                  <View key={item.user_id} style={styles.memberRow}>
                    <Text style={styles.memberName} numberOfLines={1}>{item.profile?.name || 'Membro'}</Text>
                    <StatusPill status={item.status} />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyMembers}>Ninguém registrou progresso ainda.</Text>
            )}
          </View>
        </View>
      )}

      <MonthPicker
        visible={monthPickerVisible}
        months={months}
        selectedMonth={selectedMonth}
        activeMonth={activeMonth}
        onSelect={setSelectedMonth}
        onClose={() => setMonthPickerVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  hero: {
    borderRadius: radii.xxxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.lg,
    alignItems: 'center',
  },
  cover: { width: 150, aspectRatio: 3 / 4, borderRadius: radii.xl, backgroundColor: colors.zinc900, marginBottom: spacing.md },
  title: { ...typography.h1, color: colors.foreground, textAlign: 'center' },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceDeep,
  },
  metaText: { fontSize: 11, fontWeight: '700', color: colors.zinc400 },
  description: { ...typography.small, color: colors.zinc400, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
  detailLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md },
  detailLinkText: { color: colors.violet300, fontWeight: '800', fontSize: 12 },
  card: { borderRadius: radii.xxl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter, padding: spacing.lg, gap: spacing.md },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...typography.h3, color: colors.foreground },
  statusRow: { flexDirection: 'row', gap: spacing.sm },
  statusOption: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
  },
  statusOptionActive: { borderColor: 'rgba(139,92,246,0.35)', backgroundColor: 'rgba(139,92,246,0.15)' },
  statusOptionDisabled: { opacity: 0.85 },
  statusOptionLabel: { fontSize: 10, fontWeight: '700', color: colors.zinc500, textAlign: 'center' },
  statusOptionLabelActive: { color: colors.violet300 },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600' },
  finishedCount: { fontSize: 10, fontWeight: '800', color: colors.zinc600, textTransform: 'uppercase' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.md,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  memberName: { ...typography.small, color: colors.zinc300, flex: 1, marginRight: spacing.sm },
  emptyMembers: { ...typography.small, color: colors.zinc600 },
});
