import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { StatusPill, statusMeta } from '@/components/StatusPill';
import { PreferenceButtons } from '@/components/PreferenceButtons';
import { VoteReasonSheet, voteReasonLabel } from '@/components/VoteReasonSheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useApp } from '@/state/app-provider';
import { useBacklog, useFavorite, useGame, useLibrary, useProgress, useRanking, useSetProgress, useVote } from '@/state/queries';
import { colors, radii, spacing, typography } from '@/theme';
import type { ProgressStatus, VoteChoice, VoteReason } from '@clube-do-jogo/domain';

const statusOrder: ProgressStatus[] = ['not_started', 'started', 'finished'];

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = String(id);
  const { userId, isHistorical } = useApp();

  const gameQuery = useGame(gameId);
  const libraryQuery = useLibrary();
  const rankingQuery = useRanking();
  const progressQuery = useProgress(gameId);

  const backlog = useBacklog();
  const favorite = useFavorite();
  const vote = useVote();
  const setProgress = useSetProgress();

  const [reasonOpen, setReasonOpen] = useState(false);

  const game = gameQuery.data ?? null;
  const libraryEntry = useMemo(
    () => (libraryQuery.data?.library ?? []).find(item => item.game.id === gameId) ?? null,
    [libraryQuery.data, gameId],
  );
  const rankingEntry = useMemo(
    () => (rankingQuery.data ?? []).find(item => item.game.id === gameId) ?? null,
    [rankingQuery.data, gameId],
  );
  const progress = progressQuery.data ?? [];
  const mine = progress.find(item => item.user_id === userId) ?? null;

  const inBacklog = libraryEntry?.inBacklog ?? false;
  const isFavorite = libraryEntry?.favorite ?? false;
  const myChoice = rankingEntry?.myChoice ?? null;

  function choose(choice: VoteChoice) {
    if (isHistorical) return;
    if (choice === 'would_not_play') {
      if (myChoice === 'would_not_play') {
        vote.mutate({ gameId, choice: null });
        return;
      }
      setReasonOpen(true);
      return;
    }
    vote.mutate({ gameId, choice: myChoice === choice ? null : choice });
  }

  function confirmReason(reason: VoteReason, reasonText: string | null) {
    setReasonOpen(false);
    vote.mutate({ gameId, choice: 'would_not_play', reason, reasonText: reasonText ?? undefined });
  }

  function updateStatus(status: ProgressStatus) {
    if (isHistorical || mine?.status === status) return;
    setProgress.mutate({ gameId, status });
  }

  if (gameQuery.isLoading) {
    return (
      <Screen>
        <LoadingState label="Carregando jogo…" />
      </Screen>
    );
  }

  if (gameQuery.isError) {
    return (
      <Screen>
        <ErrorState message={gameQuery.error.message} onRetry={() => gameQuery.refetch()} />
      </Screen>
    );
  }

  if (!game) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title="Jogo não encontrado" description="Esse jogo pode ter sido removido." />
      </Screen>
    );
  }

  const mutationError = backlog.error || favorite.error || vote.error || setProgress.error;

  return (
    <Screen onRefresh={() => gameQuery.refetch()} refreshing={gameQuery.isRefetching}>
      <AppHeader title={game.title} />

      <Image source={{ uri: game.image_url }} style={styles.cover} contentFit="cover" accessibilityLabel={`Capa de ${game.title}`} />

      <View style={styles.metaRow}>
        <MetaChip icon="time-outline" label={`${game.duration_hours} h`} />
        {game.release_year ? <MetaChip icon="calendar-outline" label={String(game.release_year)} /> : null}
        {game.average_rating ? <MetaChip icon="star" label={game.average_rating.toFixed(1)} /> : null}
      </View>

      {game.genres?.length ? (
        <View style={styles.tagsRow}>
          {game.genres.map(genre => (
            <View key={genre} style={styles.tag}>
              <Text style={styles.tagText}>{genre}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.description}>{game.description}</Text>

      <View style={styles.actionsRow}>
        <Button
          label={inBacklog ? 'Remover de Meus Jogos' : 'Adicionar a Meus Jogos'}
          variant={inBacklog ? 'secondary' : 'primary'}
          icon={<Ionicons name={inBacklog ? 'checkmark' : 'add'} size={16} color={inBacklog ? colors.zinc300 : colors.white} />}
          loading={backlog.isPending}
          onPress={() => backlog.mutate({ gameId, inBacklog: !inBacklog })}
          style={styles.actionButton}
        />
        <Button
          label={isFavorite ? 'Favorito' : 'Favoritar'}
          variant="ghost"
          icon={<Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={16} color={colors.violet300} />}
          loading={favorite.isPending}
          onPress={() => favorite.mutate({ gameId, favorite: !isFavorite })}
          style={styles.actionButton}
        />
      </View>

      {game.screenshot_urls?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery} contentContainerStyle={{ gap: spacing.sm }}>
          {game.screenshot_urls.map(url => (
            <Image key={url} source={{ uri: url }} style={styles.screenshot} contentFit="cover" accessibilityLabel={`Captura de tela de ${game.title}`} />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sua preferência</Text>
        <View style={styles.countsRow}>
          <View style={styles.countChip}>
            <Ionicons name="thumbs-up" size={13} color={colors.emerald400} />
            <Text style={styles.countText}>{rankingEntry?.choiceCounts.would_play ?? 0}</Text>
          </View>
          <View style={styles.countChip}>
            <Ionicons name="thumbs-down" size={13} color={colors.red400} />
            <Text style={styles.countText}>{rankingEntry?.choiceCounts.would_not_play ?? 0}</Text>
          </View>
        </View>
        {myChoice === 'would_not_play' && rankingEntry?.myReason ? (
          <Text style={styles.myReason}>Meu motivo: {voteReasonLabel(rankingEntry.myReason)}</Text>
        ) : null}
        <PreferenceButtons value={myChoice} disabled={isHistorical || vote.isPending} onChange={choose} />
      </View>

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
              <Button
                key={status}
                label={meta.label}
                icon={<Ionicons name={meta.icon} size={16} color={active ? colors.white : colors.zinc400} />}
                variant={active ? 'primary' : 'secondary'}
                disabled={isHistorical || active}
                loading={setProgress.isPending}
                onPress={() => updateStatus(status)}
                style={styles.statusButton}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Progresso do clube</Text>
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

      {mutationError ? <Text style={styles.formError}>{mutationError.message}</Text> : null}

      <VoteReasonSheet
        visible={reasonOpen}
        initialReason={rankingEntry?.myReason}
        initialText={rankingEntry?.myReasonText}
        onClose={() => setReasonOpen(false)}
        onConfirm={confirmReason}
      />
    </Screen>
  );
}

function MetaChip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.metaChip}>
      <Ionicons name={icon} size={13} color={colors.zinc400} />
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.xl, backgroundColor: colors.zinc900, marginBottom: spacing.md },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.surfaceDeep },
  metaText: { fontSize: 11, fontWeight: '700', color: colors.zinc400 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.full, backgroundColor: 'rgba(139,92,246,0.12)' },
  tagText: { fontSize: 10, fontWeight: '700', color: colors.violet300 },
  description: { ...typography.small, color: colors.zinc400, lineHeight: 20, marginBottom: spacing.lg },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  actionButton: { flex: 1 },
  gallery: { marginBottom: spacing.lg },
  screenshot: { width: 220, height: 124, borderRadius: radii.lg, backgroundColor: colors.zinc900 },
  card: { borderRadius: radii.xxl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter, padding: spacing.lg, gap: spacing.md, marginBottom: spacing.lg },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...typography.h3, color: colors.foreground },
  countsRow: { flexDirection: 'row', gap: spacing.sm },
  countChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, borderRadius: radii.md, backgroundColor: colors.surfaceDeep },
  countText: { fontSize: 11, fontWeight: '800', color: colors.zinc300 },
  myReason: { fontSize: 11, color: colors.red300, fontWeight: '600' },
  statusRow: { flexDirection: 'row', gap: spacing.sm },
  statusButton: { flex: 1 },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radii.md, backgroundColor: colors.surfaceDeep, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  memberName: { ...typography.small, color: colors.zinc300, flex: 1, marginRight: spacing.sm },
  emptyMembers: { ...typography.small, color: colors.zinc600 },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600', marginBottom: spacing.lg },
});
