import {
  demoGames,
  demoMonths,
  demoProfiles,
  demoProgress,
  demoRanking,
} from '@clube-do-jogo/domain/demo';
import { compareRankingItems, legacyRankingScore, preferenceRankingScore } from '@clube-do-jogo/domain';
import type {
  ClubCycle,
  Game,
  GameProgress,
  LibraryGame,
  Profile,
  ProfileWithGames,
  RankingItem,
  RankingFormula,
  VoteChoice,
  VoteReason,
} from '@clube-do-jogo/domain';

type DemoVote = {
  choice: VoteChoice;
  reason: VoteReason | null;
  reasonText: string | null;
};

function key(userId: string, gameId: string) {
  return `${userId}:${gameId}`;
}

function cloneProfile(profile: Profile): Profile {
  return { ...profile };
}

function cloneRankingItem(item: RankingItem): RankingItem {
  return {
    ...item,
    game: { ...item.game },
    choiceCounts: { ...item.choiceCounts },
    choiceProfiles: {
      would_play: item.choiceProfiles.would_play.map(cloneProfile),
      would_not_play: item.choiceProfiles.would_not_play.map(profile => ({ ...profile })),
    },
    voters: item.voters.map(cloneProfile),
    completedBy: item.completedBy.map(cloneProfile),
  };
}

function cloneProgress(progress: GameProgress): GameProgress {
  return {
    ...progress,
    profile: progress.profile ? cloneProfile(progress.profile) : undefined,
    rating_details: progress.rating_details ? { ...progress.rating_details } : progress.rating_details,
  };
}

function demoUserProfile(userId: string) {
  return demoProfiles.find(profile => profile.id === userId) || demoProfiles[0];
}

export class DemoStore {
  private readonly voteOverrides = new Map<string, DemoVote | null>();
  private readonly progressOverrides = new Map<string, GameProgress>();
  private readonly backlogOverrides = new Map<string, boolean>();
  private readonly favoriteOverrides = new Map<string, boolean>();

  reset() {
    this.voteOverrides.clear();
    this.progressOverrides.clear();
    this.backlogOverrides.clear();
    this.favoriteOverrides.clear();
  }

  readProfile(profileId: string): Profile {
    return cloneProfile(demoUserProfile(profileId));
  }

  readCycles(): ClubCycle[] {
    return demoMonths.map((month, index) => ({
      month,
      game_id: demoGames[0].id,
      status: index === 0 ? 'active' : 'closed',
      game: { ...demoGames[0] },
    }));
  }

  readRanking(userId: string, formula: RankingFormula = 'preference'): RankingItem[] {
    return demoRanking(formula).map(cloneRankingItem).map(item => {
      const override = this.voteOverrides.get(key(userId, item.game.id));
      if (override === undefined) {
        return { ...item, inBacklog: this.isBacklog(userId, item.game.id) };
      }

      const profiles = {
        would_play: item.choiceProfiles.would_play.filter(profile => profile.id !== userId),
        would_not_play: item.choiceProfiles.would_not_play.filter(profile => profile.id !== userId),
      };
      if (override) {
        profiles[override.choice].push({
          ...demoUserProfile(userId),
          reason: override.reason,
          reasonText: override.reasonText,
        });
      }
      const choiceCounts = {
        would_play: profiles.would_play.length,
        would_not_play: profiles.would_not_play.length,
      };
      const voters = [...profiles.would_play, ...profiles.would_not_play];
      const myChoice = override?.choice || null;
      const totalPoints = formula === 'legacy'
        ? legacyRankingScore(item.game, voters.length, item.completedCount)
        : preferenceRankingScore(choiceCounts);
      return {
        ...item,
        choiceCounts,
        choiceProfiles: profiles,
        myChoice,
        myReason: override?.reason || null,
        myReasonText: override?.reasonText || null,
        votesCount: voters.length,
        voters,
        totalPoints,
        legacyTotalPoints: legacyRankingScore(item.game, voters.length, item.completedCount),
        votedByMe: myChoice !== null,
        inBacklog: this.isBacklog(userId, item.game.id),
      };
    }).sort(compareRankingItems);
  }

  setVote(userId: string, gameId: string, vote: DemoVote | null) {
    this.voteOverrides.set(key(userId, gameId), vote);
  }

  readGame(gameId: string): Game | null {
    const game = demoGames.find(item => item.id === gameId) || demoGames[0];
    return game ? { ...game } : null;
  }

  readProgress(userId: string, gameId: string): GameProgress[] {
    const base = demoProgress
      .map(progress => ({ ...progress, game_id: gameId }))
      .map(cloneProgress);
    const override = this.progressOverrides.get(key(userId, gameId));
    const withoutUser = base.filter(progress => progress.user_id !== userId);
    if (override) withoutUser.push(cloneProgress(override));
    return withoutUser;
  }

  currentProgress(userId: string, gameId: string): GameProgress | null {
    const override = this.progressOverrides.get(key(userId, gameId));
    if (override) return cloneProgress(override);
    const base = demoProgress.find(progress => progress.user_id === userId);
    return base ? { ...cloneProgress(base), game_id: gameId } : null;
  }

  setProgress(userId: string, gameId: string, progress: Pick<GameProgress, 'status' | 'rating' | 'rating_mode' | 'rating_details' | 'started_at' | 'finished_at'>) {
    this.progressOverrides.set(key(userId, gameId), {
      id: this.progressOverrides.get(key(userId, gameId))?.id || `demo-progress-${userId}-${gameId}`,
      user_id: userId,
      game_id: gameId,
      ...progress,
      profile: cloneProfile(demoUserProfile(userId)),
    });
  }

  isBacklog(userId: string, gameId: string) {
    const override = this.backlogOverrides.get(key(userId, gameId));
    return override ?? demoGames.slice(1, 6).some(game => game.id === gameId);
  }

  setBacklog(userId: string, gameId: string, inBacklog: boolean) {
    this.backlogOverrides.set(key(userId, gameId), inBacklog);
  }

  isFavorite(userId: string, gameId: string) {
    const override = this.favoriteOverrides.get(key(userId, gameId));
    return override ?? [demoGames[1], demoGames[3], demoGames[4]].some(game => game.id === gameId);
  }

  setFavorite(userId: string, gameId: string, favorite: boolean) {
    this.favoriteOverrides.set(key(userId, gameId), favorite);
  }

  readLibrary(profileId: string): ProfileWithGames {
    const initialProgress = demoGames.slice(6, 10).map((_game, index) => ({
      status: 'finished' as const,
      rating: 8.5,
      rating_mode: 'simple' as const,
      rating_details: null,
      started_at: new Date(Date.now() - (index + 12) * 86400000).toISOString(),
      finished_at: new Date(Date.now() - (index + 2) * 86400000).toISOString(),
    }));
    const games = demoGames.filter(game => this.isBacklog(profileId, game.id)
      || this.isFavorite(profileId, game.id)
      || Boolean(this.progressOverrides.get(key(profileId, game.id)))
      || demoGames.slice(6, 10).some(item => item.id === game.id));
    const library = games.map((game, index): LibraryGame => {
      const stored = this.progressOverrides.get(key(profileId, game.id));
      const completedIndex = demoGames.slice(6, 10).findIndex(item => item.id === game.id);
      const fallback = completedIndex >= 0
        ? initialProgress[completedIndex]
        : demoGames.slice(1, 6).some(item => item.id === game.id) && index % 3 === 0
          ? {
              status: 'started' as const,
              rating: null,
              rating_mode: 'simple' as const,
              rating_details: null,
              started_at: new Date(Date.now() - (index + 4) * 86400000).toISOString(),
              finished_at: null,
            }
          : null;
      return {
        game: { ...game },
        inBacklog: this.isBacklog(profileId, game.id),
        favorite: this.isFavorite(profileId, game.id),
        progress: stored || fallback,
        addedAt: new Date(Date.now() - index * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - index * 3600000).toISOString(),
      };
    });
    const ranking = this.readRanking(profileId);
    return {
      profile: this.readProfile(profileId),
      backlog: library.filter(item => item.inBacklog).map(item => item.game),
      completed: library.filter(item => item.progress?.status === 'finished').map(item => item.game),
      favorites: library.filter(item => item.favorite).map(item => item.game),
      library,
      votedGameIds: ranking.filter(item => item.votedByMe).map(item => item.game.id),
      rankingGameIds: ranking.map(item => item.game.id),
      platforms: [
        { igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: 'Switch' },
        { igdb_platform_id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
      ],
    };
  }
}

export type { DemoVote };
