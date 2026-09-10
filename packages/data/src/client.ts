import type { SupabaseClient } from '@supabase/supabase-js';
import {
  compareRankingItems,
  legacyPlaytimePoints,
  legacyRankingScore,
  preferenceRankingScore,
  shiftMonth,
  transitionProgress,
} from '@clube-do-jogo/domain';
import type {
  ClubCycle,
  DiscoverItem,
  DiscoverSource,
  Game,
  GameProgress,
  LibraryGame,
  Profile,
  ProfileWithGames,
  ProgressStatus,
  RankingFormula,
  RankingItem,
  RatingDetails,
  RatingMode,
  UserPlatform,
  VoteChoice,
  VoteParticipant,
  VoteReason,
} from '@clube-do-jogo/domain';
import { readApiJson, type ApiTransport } from './api';
import { DemoStore, type DemoVote } from './demo';
import { DataError, requireValue, withDataErrors } from './errors';

const voteChoices: VoteChoice[] = ['would_play', 'would_not_play'];

export interface DataScope {
  userId: string;
  isDemo: boolean;
}

export interface RankingQuery extends DataScope {
  month: string;
  historical?: boolean;
}

export interface GameQuery extends DataScope {
  gameId: string;
}

export interface GameOfMonthQuery extends DataScope {
  month: string;
}

export interface LibraryQuery extends DataScope {
  profileId: string;
  voteMonth?: string;
}

export interface ProgressQuery extends DataScope {
  gameId: string;
  month?: string;
  historical?: boolean;
}

export interface DiscoveryQuery extends DataScope {
  source: DiscoverSource;
  search?: string;
  month?: string;
}

export interface VoteInput extends DataScope {
  month: string;
  historical?: boolean;
  gameId: string;
  choice: VoteChoice | null;
  reason?: VoteReason | null;
  reasonText?: string;
}

export interface ProgressInput extends DataScope {
  gameId: string;
  status: ProgressStatus;
  historical?: boolean;
}

export interface BacklogInput extends DataScope {
  gameId: string;
  inBacklog: boolean;
}

export interface FavoriteInput extends DataScope {
  gameId: string;
  favorite: boolean;
}

export interface CycleState {
  cycles: ClubCycle[];
  months: string[];
  activeMonth: string;
}

export interface SessionProfile {
  profile: Profile | null;
  isAdmin: boolean;
}

export interface DataClientOptions {
  supabase?: SupabaseClient | null;
  api?: ApiTransport | null;
  demo?: DemoStore;
  rankingFormula?: RankingFormula;
}

type RawVote = {
  game_id: string;
  user_id: string;
  choice: VoteChoice | null;
  reason: VoteReason | null;
  reason_text: string | null;
  created_at: string;
};

type RawSnapshot = {
  game_id: string;
  vote_count: number;
  completed_count: number;
  voter_ids: string[];
  completed_user_ids: string[];
  playtime_points: number;
  rating_multiplier: number;
  total_points: number;
  finalized_at?: string;
  legacy_total_points?: number | null;
  would_play_count?: number;
  would_not_play_count?: number;
  would_play_user_ids?: string[];
  would_not_play_user_ids?: string[];
  games: Game | null;
};

type RawProgress = {
  id: string;
  user_id: string;
  game_id: string;
  status: ProgressStatus;
  rating: number | null;
  rating_mode?: RatingMode;
  rating_details?: RatingDetails | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at?: string;
};

function fallbackProfile(id: string): Profile {
  return { id, name: 'Membro', avatar_url: null };
}

function profileMap(profiles: Profile[]) {
  return new Map(profiles.map(profile => [profile.id, profile]));
}

function asProfiles(value: unknown): Profile[] {
  return Array.isArray(value) ? value as Profile[] : [];
}

function isVoteChoice(value: unknown): value is VoteChoice {
  return value === 'would_play' || value === 'would_not_play';
}

function points(formula: RankingFormula, game: Game, counts: Record<VoteChoice, number>, completed: number) {
  return formula === 'legacy'
    ? legacyRankingScore(game, counts.would_play + counts.would_not_play, completed)
    : preferenceRankingScore(counts);
}

function rankingFromRows(
  games: Game[],
  votes: RawVote[],
  completed: Array<{ game_id: string; user_id: string }>,
  backlogIds: Set<string>,
  profiles: Profile[],
  userId: string,
  formula: RankingFormula,
) {
  const profilesById = profileMap(profiles);
  return games.map(game => {
    const gameVotes = votes.filter(vote => vote.game_id === game.id && isVoteChoice(vote.choice));
    const gameCompleted = completed.filter(item => item.game_id === game.id);
    const choiceProfiles = Object.fromEntries(voteChoices.map(choice => [choice, gameVotes
      .filter(vote => vote.choice === choice)
      .map(vote => ({
        ...(profilesById.get(vote.user_id) || fallbackProfile(vote.user_id)),
        reason: vote.reason,
        reasonText: vote.reason_text,
      }))])) as Record<VoteChoice, VoteParticipant[]>;
    const choiceCounts = {
      would_play: choiceProfiles.would_play.length,
      would_not_play: choiceProfiles.would_not_play.length,
    };
    const myVote = gameVotes.find(vote => vote.user_id === userId);
    const myChoice = myVote?.choice || null;
    const voters = [...choiceProfiles.would_play, ...choiceProfiles.would_not_play];
    const addedAt = gameVotes.reduce((earliest, vote) => !earliest || vote.created_at < earliest ? vote.created_at : earliest, '');
    return {
      game,
      addedAt,
      choiceCounts,
      choiceProfiles,
      myChoice,
      myReason: myVote?.reason || null,
      myReasonText: myVote?.reason_text || null,
      votesCount: voters.length,
      completedCount: gameCompleted.length,
      voters,
      completedBy: gameCompleted.map(item => profilesById.get(item.user_id) || fallbackProfile(item.user_id)),
      playtimePoints: legacyPlaytimePoints(Number(game.duration_hours)),
      ratingMultiplier: Number(game.average_rating ?? 50) / 100,
      totalPoints: points(formula, game, choiceCounts, gameCompleted.length),
      legacyTotalPoints: legacyRankingScore(game, voters.length, gameCompleted.length),
      votedByMe: myChoice !== null,
      completedByMe: gameCompleted.some(item => item.user_id === userId),
      inBacklog: backlogIds.has(game.id),
    } satisfies RankingItem;
  }).sort(compareRankingItems);
}

function snapshotRanking(
  rows: RawSnapshot[],
  profiles: Profile[],
  backlogIds: Set<string>,
  userId: string,
  formula: RankingFormula,
  month: string,
) {
  const profilesById = profileMap(profiles);
  return rows.filter(row => row.games).map(row => {
    const game = row.games as Game;
    const choiceIds: Record<VoteChoice, string[]> = {
      would_play: row.would_play_user_ids || row.voter_ids || [],
      would_not_play: row.would_not_play_user_ids || [],
    };
    const choiceCounts: Record<VoteChoice, number> = {
      would_play: row.would_play_count ?? choiceIds.would_play.length,
      would_not_play: row.would_not_play_count ?? choiceIds.would_not_play.length,
    };
    const myChoice = voteChoices.find(choice => choiceIds[choice].includes(userId)) || null;
    const legacyTotalPoints = Number(row.legacy_total_points ?? row.total_points);
    return {
      game,
      addedAt: row.finalized_at || `${month}-01T00:00:00.000Z`,
      choiceCounts,
      choiceProfiles: Object.fromEntries(voteChoices.map(choice => [choice, choiceIds[choice]
        .map(id => profilesById.get(id) || fallbackProfile(id))])) as Record<VoteChoice, VoteParticipant[]>,
      myChoice,
      myReason: null,
      myReasonText: null,
      votesCount: Number(row.vote_count),
      completedCount: Number(row.completed_count),
      voters: (row.voter_ids || []).map(id => profilesById.get(id) || fallbackProfile(id)),
      completedBy: (row.completed_user_ids || []).map(id => profilesById.get(id) || fallbackProfile(id)),
      playtimePoints: Number(row.playtime_points),
      ratingMultiplier: Number(row.rating_multiplier),
      totalPoints: points(formula, game, choiceCounts, Number(row.completed_count)),
      legacyTotalPoints,
      votedByMe: myChoice !== null,
      completedByMe: (row.completed_user_ids || []).includes(userId),
      inBacklog: backlogIds.has(row.game_id),
    } satisfies RankingItem;
  }).sort(compareRankingItems);
}

function libraryFromRows(
  profile: Profile | null,
  backlogRows: Array<{ created_at: string; games: Game | null }>,
  progressRows: Array<RawProgress & { games: Game | null }>,
  favoriteRows: Array<{ created_at: string; games: Game | null }>,
  votes: Array<{ game_id: string; user_id: string }>,
  platforms: UserPlatform[],
): ProfileWithGames {
  const gameMap = new Map<string, LibraryGame>();
  backlogRows.forEach(row => {
    if (!row.games) return;
    const game = row.games;
    gameMap.set(game.id, { game, inBacklog: true, favorite: false, progress: null, addedAt: row.created_at, updatedAt: row.created_at });
  });
  progressRows.forEach(row => {
    if (!row.games) return;
    const current = gameMap.get(row.games.id);
    gameMap.set(row.games.id, {
      game: row.games,
      inBacklog: current?.inBacklog || false,
      favorite: current?.favorite || false,
      progress: {
        status: row.status,
        rating: row.rating,
        rating_mode: row.rating_mode,
        rating_details: row.rating_details,
        started_at: row.started_at,
        finished_at: row.finished_at,
      },
      addedAt: current?.addedAt || row.started_at || row.updated_at || null,
      updatedAt: row.updated_at || row.started_at || null,
    });
  });
  favoriteRows.forEach(row => {
    if (!row.games) return;
    const current = gameMap.get(row.games.id);
    gameMap.set(row.games.id, {
      game: row.games,
      inBacklog: current?.inBacklog || false,
      favorite: true,
      progress: current?.progress || null,
      addedAt: current?.addedAt || row.created_at,
      updatedAt: current?.updatedAt || row.created_at,
    });
  });
  return {
    profile,
    backlog: Array.from(gameMap.values()).filter(item => item.inBacklog).map(item => item.game),
    completed: Array.from(gameMap.values()).filter(item => item.progress?.status === 'finished').map(item => item.game),
    favorites: Array.from(gameMap.values()).filter(item => item.favorite).map(item => item.game),
    library: Array.from(gameMap.values()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    votedGameIds: votes.filter(item => item.user_id === profile?.id).map(item => item.game_id),
    rankingGameIds: Array.from(new Set(votes.map(item => item.game_id))),
    platforms,
  };
}

export class DataClient {
  readonly demo: DemoStore;
  readonly rankingFormula: RankingFormula;
  private readonly supabase: SupabaseClient | null;
  private readonly api: ApiTransport | null;

  constructor(options: DataClientOptions = {}) {
    this.supabase = options.supabase || null;
    this.api = options.api || null;
    this.demo = options.demo || new DemoStore();
    this.rankingFormula = options.rankingFormula || 'preference';
  }

  private client(operation: string) {
    if (!this.supabase) {
      throw new DataError(operation, 'Configure o Supabase para acessar sua conta.');
    }
    return this.supabase;
  }

  private transport(operation: string) {
    if (!this.api) {
      throw new DataError(operation, 'Configure a URL da API para explorar jogos.');
    }
    return this.api;
  }

  private async authenticatedClient(operation: string, userId: string) {
    const client = this.client(operation);
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data.user || data.user.id !== userId) {
      throw new DataError(operation, 'Sua sessão não está autorizada para essa operação.');
    }
    return client;
  }

  async readCycles(isDemo: boolean): Promise<CycleState> {
    if (isDemo) {
      const cycles = this.demo.readCycles();
      return { cycles, months: cycles.map(cycle => cycle.month), activeMonth: cycles[0]?.month || '' };
    }
    return withDataErrors('ler ciclos', 'Não foi possível carregar os ciclos do clube.', async () => {
      const { data, error } = await this.client('ler ciclos')
        .from('club_months')
        .select('month, game_id, status, started_at, closed_at, selected_by, game:games (*)')
        .order('month', { ascending: false });
      if (error) throw error;
      const cycles = (data || []) as unknown as ClubCycle[];
      const activeMonth = cycles.find(cycle => cycle.status === 'active')?.month || cycles[0]?.month || '';
      return { cycles, months: cycles.map(cycle => cycle.month), activeMonth };
    });
  }

  async readSessionProfile(userId: string, isDemo: boolean): Promise<SessionProfile> {
    if (isDemo) return { profile: this.demo.readProfile(userId), isAdmin: true };
    return withDataErrors('ler perfil', 'Não foi possível carregar o perfil da conta.', async () => {
      const client = this.client('ler perfil');
      const [{ data: profile, error: profileError }, { data: role, error: roleError }] = await Promise.all([
        client.from('profiles').select('*').eq('id', userId).maybeSingle(),
        client.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      ]);
      if (profileError) throw profileError;
      if (roleError) throw roleError;
      return { profile: profile as Profile | null, isAdmin: role?.role === 'admin' };
    });
  }

  async readProfile(profileId: string, isDemo: boolean): Promise<Profile | null> {
    return (await this.readSessionProfile(profileId, isDemo)).profile;
  }

  async readRanking(input: RankingQuery): Promise<RankingItem[]> {
    if (input.isDemo) return this.demo.readRanking(input.userId, this.rankingFormula);
    return withDataErrors('ler ranking', 'Não foi possível carregar o ranking.', async () => {
      const client = this.client('ler ranking');
      if (input.historical) {
        const { data, error } = await client.from('ranking_snapshots')
          .select('*, games (*)')
          .eq('voting_month', input.month)
          .order('position');
        if (error) throw error;
        const rows = (data || []) as unknown as RawSnapshot[];
        const ids = Array.from(new Set(rows.flatMap(row => [
          ...(row.would_play_user_ids || row.voter_ids || []),
          ...(row.would_not_play_user_ids || []),
          ...(row.completed_user_ids || []),
        ])));
        const profiles = ids.length
          ? await client.from('profiles').select('id, name, avatar_url, avatar_crop').in('id', ids)
          : { data: [], error: null };
        if (profiles.error) throw profiles.error;
        const gameIds = rows.map(row => row.game_id);
        const backlog = gameIds.length
          ? await client.from('backlogs').select('game_id').eq('user_id', input.userId).in('game_id', gameIds)
          : { data: [], error: null };
        if (backlog.error) throw backlog.error;
        return snapshotRanking(
          rows,
          asProfiles(profiles.data),
          new Set((backlog.data || []).map(item => item.game_id)),
          input.userId,
          this.rankingFormula,
          input.month,
        );
      }

      const voteMonth = shiftMonth(input.month, 1);
      const { data: rawVotes, error: votesError } = await client.from('votes')
        .select('game_id, user_id, choice, reason, reason_text, created_at')
        .eq('vote_month', voteMonth);
      if (votesError) throw votesError;
      const votes = ((rawVotes || []) as RawVote[]).filter(vote => isVoteChoice(vote.choice));
      const gameIds = Array.from(new Set(votes.map(vote => vote.game_id)));
      if (!gameIds.length) return [];
      const [{ data: completed, error: completedError }, { data: games, error: gamesError }, { data: backlog, error: backlogError }] = await Promise.all([
        client.from('game_progress').select('game_id, user_id').eq('status', 'finished').in('game_id', gameIds),
        client.from('games').select('*').in('id', gameIds),
        client.from('backlogs').select('game_id').eq('user_id', input.userId).in('game_id', gameIds),
      ]);
      if (completedError) throw completedError;
      if (gamesError) throw gamesError;
      if (backlogError) throw backlogError;
      const participantIds = Array.from(new Set([
        ...votes.map(vote => vote.user_id),
        ...((completed || []) as Array<{ user_id: string }>).map(item => item.user_id),
      ]));
      const profiles = participantIds.length
        ? await client.from('profiles').select('id, name, avatar_url, avatar_crop').in('id', participantIds)
        : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      return rankingFromRows(
        (games || []) as Game[],
        votes,
        (completed || []) as Array<{ game_id: string; user_id: string }>,
        new Set((backlog || []).map(item => item.game_id)),
        asProfiles(profiles.data),
        input.userId,
        this.rankingFormula,
      );
    });
  }

  async readGame(input: GameQuery): Promise<Game | null> {
    if (input.isDemo) return this.demo.readGame(input.gameId);
    return withDataErrors('ler jogo', 'Não foi possível carregar o jogo.', async () => {
      const { data, error } = await this.client('ler jogo').from('games').select('*').eq('id', input.gameId).maybeSingle();
      if (error) throw error;
      return data as Game | null;
    });
  }

  async readGameOfMonth(input: GameOfMonthQuery): Promise<Game | null> {
    if (input.isDemo) return this.demo.readGame('hades');
    return withDataErrors('ler jogo do mês', 'Não foi possível carregar o jogo do mês.', async () => {
      const { data, error } = await this.client('ler jogo do mês').from('club_months')
        .select('game_id, games (*)')
        .eq('month', input.month)
        .maybeSingle();
      if (error) throw error;
      return (data?.games || null) as unknown as Game | null;
    });
  }

  async readUserPlatforms(userId: string, isDemo: boolean): Promise<UserPlatform[]> {
    if (isDemo) return [
      { igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: 'Switch' },
      { igdb_platform_id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
    ];
    return withDataErrors('ler consoles', 'Não foi possível carregar seus consoles.', async () => {
      const { data, error } = await this.client('ler consoles').from('user_platforms')
        .select('id, user_id, igdb_platform_id, name, abbreviation, logo_url')
        .eq('user_id', userId)
        .order('name');
      if (error) throw error;
      return (data || []) as UserPlatform[];
    });
  }

  async readLibrary(input: LibraryQuery): Promise<ProfileWithGames> {
    if (input.isDemo) return this.demo.readLibrary(input.profileId);
    return withDataErrors('ler biblioteca', 'Não foi possível carregar a biblioteca.', async () => {
      const client = this.client('ler biblioteca');
      const [{ data: profile, error: profileError }, { data: backlog, error: backlogError }, { data: progress, error: progressError }, { data: favorites, error: favoritesError }, votesResponse, platforms] = await Promise.all([
        client.from('profiles').select('*').eq('id', input.profileId).maybeSingle(),
        client.from('backlogs').select('created_at, games (*)').eq('user_id', input.profileId).order('created_at', { ascending: false }),
        client.from('game_progress').select('id, user_id, game_id, status, rating, rating_mode, rating_details, started_at, finished_at, updated_at, games (*)').eq('user_id', input.profileId).order('updated_at', { ascending: false }),
        client.from('favorite_games').select('created_at, games (*)').eq('user_id', input.profileId).order('created_at', { ascending: false }),
        input.voteMonth
          ? client.from('votes').select('game_id, user_id').eq('vote_month', input.voteMonth)
          : Promise.resolve({ data: [], error: null }),
        this.readUserPlatforms(input.profileId, false),
      ]);
      if (profileError) throw profileError;
      if (backlogError) throw backlogError;
      if (progressError) throw progressError;
      if (favoritesError) throw favoritesError;
      if (votesResponse.error) throw votesResponse.error;
      return libraryFromRows(
        profile as Profile | null,
        (backlog || []) as unknown as Array<{ created_at: string; games: Game | null }>,
        (progress || []) as unknown as Array<RawProgress & { games: Game | null }>,
        (favorites || []) as unknown as Array<{ created_at: string; games: Game | null }>,
        (votesResponse.data || []) as Array<{ game_id: string; user_id: string }>,
        platforms,
      );
    });
  }

  async readProgress(input: ProgressQuery): Promise<GameProgress[]> {
    if (input.isDemo) return this.demo.readProgress(input.userId, input.gameId);
    return withDataErrors('ler progresso', 'Não foi possível carregar o progresso.', async () => {
      const client = this.client('ler progresso');
      if (input.historical) {
        if (!input.month) throw new DataError('ler progresso', 'O mês histórico não foi informado.');
        const { data, error } = await client.from('cycle_progress_snapshots')
          .select('*, profile:profiles!cycle_progress_snapshots_user_id_fkey (id, name, avatar_url, avatar_crop)')
          .eq('cycle_month', input.month)
          .eq('game_id', input.gameId);
        if (error) throw error;
        return (data || []) as unknown as GameProgress[];
      }
      const [{ data: profiles, error: profilesError }, { data: progress, error: progressError }] = await Promise.all([
        client.from('profiles').select('id, name, avatar_url, avatar_crop').order('name'),
        client.from('game_progress').select('*').eq('game_id', input.gameId),
      ]);
      if (profilesError) throw profilesError;
      if (progressError) throw progressError;
      const progressMap = new Map(((progress || []) as RawProgress[]).map(item => [item.user_id, item]));
      return asProfiles(profiles).map(profile => {
        const row = progressMap.get(profile.id);
        return {
          id: row?.id || `new-${profile.id}`,
          user_id: profile.id,
          game_id: input.gameId,
          status: row?.status || 'not_started',
          rating: row?.rating ?? null,
          rating_mode: row?.rating_mode || 'simple',
          rating_details: row?.rating_details || null,
          started_at: row?.started_at || null,
          finished_at: row?.finished_at || null,
          profile,
        } satisfies GameProgress;
      });
    });
  }

  async readDiscovery(input: DiscoveryQuery): Promise<DiscoverItem[]> {
    if (input.isDemo) {
      const ranking = this.demo.readRanking(input.userId, this.rankingFormula);
      const sourceItems = input.source === 'ranking'
        ? ranking.map(item => ({ game: item.game, activityCount: item.votesCount, addedAt: item.addedAt }))
        : input.source === 'friends'
          ? ranking.filter(item => item.inBacklog).map(item => ({ game: item.game, activityCount: item.votesCount, addedAt: item.addedAt }))
          : ranking.map(item => ({ game: item.game, addedAt: item.addedAt }));
      const normalized = input.search?.trim().toLocaleLowerCase('pt-BR') || '';
      return sourceItems.filter(item => !normalized || item.game.title.toLocaleLowerCase('pt-BR').includes(normalized));
    }
    return withDataErrors('explorar jogos', 'Não foi possível carregar a descoberta.', async () => {
      const params = new URLSearchParams({ source: input.source });
      if (input.search?.trim()) params.set('q', input.search.trim());
      if (input.month && input.source === 'ranking') params.set('month', input.month);
      const payload = await readApiJson<unknown>(this.transport('explorar jogos'), `/api/discover?${params.toString()}`);
      if (Array.isArray(payload)) return payload as DiscoverItem[];
      if (payload && typeof payload === 'object' && 'items' in payload) return ((payload as { items?: unknown }).items || []) as DiscoverItem[];
      return [];
    });
  }

  async setVote(input: VoteInput): Promise<void> {
    if (input.historical) throw new DataError('salvar voto', 'O histórico é somente leitura.');
    const voteMonth = shiftMonth(input.month, 1);
    if (input.isDemo) {
      const vote: DemoVote | null = input.choice
        ? { choice: input.choice, reason: input.reason || null, reasonText: input.reasonText?.trim() || null }
        : null;
      this.demo.setVote(input.userId, input.gameId, vote);
      return;
    }
    await withDataErrors('salvar voto', 'Não foi possível salvar seu voto.', async () => {
      const client = await this.authenticatedClient('salvar voto', input.userId);
      if (!input.choice) {
        const { error } = await client.from('votes').delete()
          .eq('user_id', input.userId)
          .eq('game_id', input.gameId)
          .eq('vote_month', voteMonth);
        if (error) throw error;
        return;
      }
      const { error: deleteError } = await client.from('votes').delete()
        .eq('user_id', input.userId)
        .eq('game_id', input.gameId)
        .eq('vote_month', voteMonth);
      if (deleteError) throw deleteError;
      const { error } = await client.from('votes').insert({
        user_id: input.userId,
        game_id: input.gameId,
        vote_month: voteMonth,
        choice: input.choice,
        reason: input.reason || null,
        reason_text: input.reasonText?.trim() || null,
      });
      if (error) throw error;
    });
  }

  async setProgress(input: ProgressInput): Promise<void> {
    if (input.historical) throw new DataError('salvar progresso', 'O histórico é somente leitura.');
    if (input.isDemo) {
      const existing = this.demo.currentProgress(input.userId, input.gameId);
      this.demo.setProgress(input.userId, input.gameId, transitionProgress(existing, input.status));
      return;
    }
    await withDataErrors('salvar progresso', 'Não foi possível salvar o progresso.', async () => {
      const client = await this.authenticatedClient('salvar progresso', input.userId);
      const { data: existing, error: existingError } = await client.from('game_progress')
        .select('status, rating, rating_mode, rating_details, started_at, finished_at')
        .eq('user_id', input.userId)
        .eq('game_id', input.gameId)
        .maybeSingle();
      if (existingError) throw existingError;
      const now = new Date().toISOString();
      const next = transitionProgress(existing as GameProgress | null, input.status, now);
      const { error } = await client.from('game_progress').upsert({
        user_id: input.userId,
        game_id: input.gameId,
        ...next,
        updated_at: now,
      }, { onConflict: 'user_id,game_id' });
      if (error) throw error;
    });
  }

  async setBacklog(input: BacklogInput): Promise<void> {
    if (input.isDemo) {
      this.demo.setBacklog(input.userId, input.gameId, input.inBacklog);
      return;
    }
    await withDataErrors(input.inBacklog ? 'adicionar à biblioteca' : 'remover da biblioteca', input.inBacklog ? 'Não foi possível adicionar o jogo à biblioteca.' : 'Não foi possível remover o jogo da biblioteca.', async () => {
      const client = await this.authenticatedClient(input.inBacklog ? 'adicionar à biblioteca' : 'remover da biblioteca', input.userId);
      if (input.inBacklog) {
        const { error } = await client.from('backlogs').insert({ user_id: input.userId, game_id: input.gameId });
        if (error && error.code !== '23505') throw error;
        return;
      }
      const { error } = await client.from('backlogs').delete().eq('user_id', input.userId).eq('game_id', input.gameId);
      if (error) throw error;
    });
  }

  async setFavorite(input: FavoriteInput): Promise<void> {
    if (input.isDemo) {
      this.demo.setFavorite(input.userId, input.gameId, input.favorite);
      return;
    }
    await withDataErrors(input.favorite ? 'adicionar favorito' : 'remover favorito', input.favorite ? 'Não foi possível adicionar o favorito.' : 'Não foi possível remover o favorito.', async () => {
      const client = await this.authenticatedClient(input.favorite ? 'adicionar favorito' : 'remover favorito', input.userId);
      if (input.favorite) {
        const { error } = await client.from('favorite_games').insert({ user_id: input.userId, game_id: input.gameId });
        if (error && error.code !== '23505') throw error;
        return;
      }
      const { error } = await client.from('favorite_games').delete().eq('user_id', input.userId).eq('game_id', input.gameId);
      if (error) throw error;
    });
  }

  resetDemo() {
    this.demo.reset();
  }
}

export function createDataClient(options: DataClientOptions = {}) {
  return new DataClient(options);
}

export function requireClient(client: DataClient | null | undefined, operation = 'acessar os dados') {
  return requireValue(client, operation, 'A camada de dados não foi configurada.');
}
