import type { Game, RankingFormula, RankingItem, VoteChoice } from './types';

// Ordem canônica da votação, positivo primeiro. Os contadores e os botões leem
// daqui porque quando cada tela mantinha a própria lista elas divergiram, e o
// número verde acabou em cima do botão vermelho.
export const voteChoices: VoteChoice[] = ['would_play', 'would_not_play'];

export const voteChoiceLabels: Record<VoteChoice, string> = {
  would_play: 'Jogaria',
  would_not_play: 'Não',
};

export function legacyPlaytimePoints(hours: number): number {
  if (hours < 8) return 1;
  if (hours <= 15) return 3;
  if (hours <= 20) return 2;
  return 1;
}

export function legacyRankingScore(game: Game, votes: number, completed: number): number {
  const playtime = legacyPlaytimePoints(Number(game.duration_hours));
  const rating = Number(game.average_rating ?? 50) / 100;
  const penalty = completed > 0 ? completed * 2 : 1;
  return Math.round(((votes * 2 * playtime * rating) / penalty) * 10) / 10;
}

export function preferenceRankingScore(counts: Record<VoteChoice, number>): number {
  return counts.would_play - counts.would_not_play;
}

export function rankingScore(
  formula: RankingFormula,
  game: Game,
  counts: Record<VoteChoice, number>,
  completed: number,
): number {
  return formula === 'legacy'
    ? legacyRankingScore(game, counts.would_play + counts.would_not_play, completed)
    : preferenceRankingScore(counts);
}

export function compareRankingItems<T extends Pick<RankingItem, 'totalPoints' | 'choiceCounts' | 'game'>>(a: T, b: T): number {
  return b.totalPoints - a.totalPoints
    || b.choiceCounts.would_play - a.choiceCounts.would_play
    || a.choiceCounts.would_not_play - b.choiceCounts.would_not_play
    || a.game.title.localeCompare(b.game.title, 'pt-BR');
}
