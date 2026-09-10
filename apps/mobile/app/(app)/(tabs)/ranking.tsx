import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { AddGameToVoteSheet } from '@/components/AddGameToVoteSheet';
import { PreferenceButtons } from '@/components/PreferenceButtons';
import { VoteParticipantsSheet } from '@/components/VoteParticipantsSheet';
import { VoteReasonSheet, voteReasonLabel } from '@/components/VoteReasonSheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { formatMonth, formatShortDate, shiftMonth } from '@/lib/format';
import { useApp } from '@/state/app-provider';
import { useRanking, useVote } from '@/state/queries';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import type { Game, RankingItem, VoteChoice, VoteReason } from '@clube-do-jogo/domain';

function withPlacements(items: RankingItem[]) {
  let lastScore: number | null = null;
  let placement = 0;
  return items.map(item => {
    if (lastScore === null || item.totalPoints !== lastScore) placement += 1;
    lastScore = item.totalPoints;
    return { item, placement };
  });
}

export default function RankingScreen() {
  const colors = useThemeColors();
  const styles = useStyles();
  const router = useRouter();
  const { isHistorical, selectedMonth } = useApp();
  const voteMonth = shiftMonth(selectedMonth, 1);
  const rankingQuery = useRanking();
  const vote = useVote();
  const [reasonTarget, setReasonTarget] = useState<{ item?: RankingItem; game?: Game } | null>(null);
  const [reasonToken, setReasonToken] = useState(0);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [participantsTarget, setParticipantsTarget] = useState<{ item: RankingItem; choice: VoteChoice } | null>(null);

  const ranking = useMemo(() => rankingQuery.data ?? [], [rankingQuery.data]);
  const placedRanking = useMemo(() => withPlacements(ranking), [ranking]);

  function choose(item: RankingItem, choice: VoteChoice) {
    if (isHistorical) return;
    if (choice === 'would_not_play') {
      if (item.myChoice === 'would_not_play') {
        vote.mutate({ gameId: item.game.id, choice: null });
        return;
      }
      setReasonToken(token => token + 1);
      setReasonTarget({ item });
      return;
    }
    vote.mutate({ gameId: item.game.id, choice: item.myChoice === choice ? null : choice });
  }

  function chooseSearch(game: Game, choice: VoteChoice) {
    if (isHistorical) return;
    const existing = ranking.find(item => item.game.id === game.id);
    if (existing) {
      choose(existing, choice);
      return;
    }
    if (choice === 'would_not_play') {
      setReasonToken(token => token + 1);
      setReasonTarget({ game });
      return;
    }
    vote.mutate({ gameId: game.id, choice: 'would_play' });
  }

  function confirmReason(reason: VoteReason, reasonText: string | null) {
    if (!reasonTarget) return;
    const target = reasonTarget;
    setReasonTarget(null);
    if (target.item) {
      vote.mutate({ gameId: target.item.game.id, choice: 'would_not_play', reason, reasonText: reasonText ?? undefined });
    } else if (target.game) {
      vote.mutate({ gameId: target.game.id, choice: 'would_not_play', reason, reasonText: reasonText ?? undefined });
    }
  }

  return (
    <Screen onRefresh={() => rankingQuery.refetch()} refreshing={rankingQuery.isRefetching}>
      <AppHeader
        title={`Votação para ${formatMonth(voteMonth, { includeYear: isHistorical })}`}
        subtitle={isHistorical ? 'Resultado preservado do ciclo encerrado' : 'Vote nos jogos do próximo ciclo'}
        right={!isHistorical ? (
          <Pressable
            onPress={() => setAddSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Adicionar jogo à votação"
            style={styles.addButton}
          >
            <Ionicons name="add" size={20} color={colors.violet300} />
          </Pressable>
        ) : undefined}
      />

      {vote.isError ? <Text style={styles.formError}>{vote.error?.message}</Text> : null}

      {rankingQuery.isLoading ? (
        <LoadingState label="Carregando ranking…" />
      ) : rankingQuery.isError ? (
        <ErrorState message={rankingQuery.error.message} onRetry={() => rankingQuery.refetch()} />
      ) : !ranking.length ? (
        <EmptyState icon="trophy-outline" title="A votação está vazia" description="Ainda não há jogos votados neste ciclo." />
      ) : (
        <View style={styles.list}>
          {placedRanking.map(({ item, placement }) => (
            <View key={item.game.id} style={[styles.card, placement === 1 && styles.cardLeader]}>
              <Pressable
                onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: item.game.id } })}
                accessibilityRole="button"
                accessibilityLabel={`Ver detalhes de ${item.game.title}`}
                style={styles.row}
              >
                <View style={[styles.placement, placement === 1 && styles.placementLeader]}>
                  <Text style={[styles.placementText, placement === 1 && styles.placementTextLeader]}>{placement}º</Text>
                </View>
                <Image source={{ uri: item.game.image_url }} style={styles.cover} contentFit="cover" accessibilityLabel={`Capa de ${item.game.title}`} />
                <View style={styles.info}>
                  <Text style={styles.title} numberOfLines={2}>{item.game.title}</Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="time-outline" size={11} color={colors.zinc500} />
                    <Text style={styles.metaText}>{item.game.duration_hours} h</Text>
                    <Ionicons name="add-circle-outline" size={11} color={colors.zinc500} style={{ marginLeft: spacing.sm }} />
                    <Text style={styles.metaText}>{formatShortDate(item.addedAt)}</Text>
                  </View>
                  <Text style={styles.points}>{item.totalPoints}<Text style={styles.pointsUnit}> pts</Text></Text>
                </View>
              </Pressable>

              <View style={styles.countsRow}>
                <Pressable
                  onPress={() => setParticipantsTarget({ item, choice: 'would_play' })}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver quem votou Jogaria em ${item.game.title}`}
                  style={styles.countChip}
                >
                  <Ionicons name="thumbs-up" size={13} color={colors.emerald400} />
                  <Text style={styles.countText}>{item.choiceCounts.would_play}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setParticipantsTarget({ item, choice: 'would_not_play' })}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver quem votou Não em ${item.game.title}`}
                  style={styles.countChip}
                >
                  <Ionicons name="thumbs-down" size={13} color={colors.red400} />
                  <Text style={styles.countText}>{item.choiceCounts.would_not_play}</Text>
                </Pressable>
              </View>

              {item.myChoice === 'would_not_play' && item.myReason ? (
                <Text style={styles.myReason}>Meu motivo: {voteReasonLabel(item.myReason)}</Text>
              ) : null}

              <PreferenceButtons value={item.myChoice} disabled={isHistorical || vote.isPending} onChange={choice => choose(item, choice)} />
            </View>
          ))}
        </View>
      )}

      <VoteReasonSheet
        key={reasonToken}
        visible={Boolean(reasonTarget)}
        initialReason={reasonTarget?.item?.myReason}
        initialText={reasonTarget?.item?.myReasonText}
        onClose={() => setReasonTarget(null)}
        onConfirm={confirmReason}
      />

      <AddGameToVoteSheet
        visible={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        ranking={ranking}
        onChoose={chooseSearch}
      />

      <VoteParticipantsSheet
        key={participantsTarget ? `${participantsTarget.item.game.id}:${participantsTarget.choice}` : 'closed'}
        visible={Boolean(participantsTarget)}
        onClose={() => setParticipantsTarget(null)}
        profiles={participantsTarget?.item.choiceProfiles ?? { would_play: [], would_not_play: [] }}
        initialChoice={participantsTarget?.choice ?? 'would_play'}
      />
    </Screen>
  );
}

const useStyles = themedStyles(colors => ({
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600', marginBottom: spacing.md },
  list: { gap: spacing.md },
  card: {
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.hairlineSoft,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardLeader: { borderColor: 'rgba(251,191,36,0.3)', backgroundColor: 'rgba(251,191,36,0.05)' },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  placement: { width: 40, height: 40, borderRadius: radii.full, backgroundColor: colors.zinc800, alignItems: 'center', justifyContent: 'center' },
  placementLeader: { backgroundColor: colors.amber400 },
  placementText: { fontSize: 12, fontWeight: '900', color: colors.zinc300 },
  placementTextLeader: { color: colors.amber950 },
  cover: { width: 56, height: 76, borderRadius: radii.sm, backgroundColor: colors.zinc900 },
  info: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...typography.h3, fontSize: 13, color: colors.foreground },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 10, fontWeight: '700', color: colors.zinc500 },
  points: { fontSize: 24, fontWeight: '900', color: colors.emerald400, marginTop: 4 },
  pointsUnit: { fontSize: 10, fontWeight: '700', color: colors.zinc500 },
  countsRow: { flexDirection: 'row', gap: spacing.sm },
  countChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceDeep,
  },
  countText: { fontSize: 11, fontWeight: '800', color: colors.zinc300 },
  myReason: { fontSize: 11, color: colors.red300, fontWeight: '600' },
}));
