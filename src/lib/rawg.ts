import type { CatalogBrowseOptions, CatalogCharacterMugshot, CatalogGame, CatalogPlatform } from './game-catalog';

interface RAWGGame {
  id: number;
  name: string;
  released?: string | null;
  background_image?: string | null;
  rating?: number;
  metacritic?: number | null;
  playtime?: number;
  description_raw?: string;
  genres?: Array<{ name?: string }>;
  platforms?: Array<{ platform?: { id?: number; name?: string } }>;
  short_screenshots?: Array<{ image?: string }>;
}

interface RAWGPlatform {
  id: number;
  name: string;
  slug?: string;
  image?: string | null;
}

interface RAWGPage<T> {
  results?: T[];
}

const API_ORIGIN = 'https://api.rawg.io';

async function rawgFetch<T>(path: string, params: URLSearchParams, subject: string): Promise<T> {
  const key = process.env.RAWG_API_KEY;
  if (!key) throw new Error('RAWG_API_KEY não configurado.');
  params.set('key', key);
  const response = await fetch(`${API_ORIGIN}${path}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  // O corpo da resposta é seguro de propagar; a URL não, porque leva a chave na query.
  if (!response.ok) throw new Error(`Erro ${subject} na RAWG: ${await response.text()}`);
  return response.json() as Promise<T>;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function daysFromNow(days: number) {
  return isoDate(new Date(Date.now() + days * 86_400_000));
}

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function platformMetadata(platforms: RAWGGame['platforms']) {
  const seen = new Set<number>();
  const entries = (platforms || []).flatMap(entry => {
    const platform = entry.platform;
    if (!platform?.id || !platform.name || seen.has(platform.id)) return [];
    seen.add(platform.id);
    return [{ id: platform.id, name: platform.name }];
  });
  return {
    platforms: entries.map(entry => entry.name),
    platform_ids: entries.map(entry => entry.id),
  };
}

function mapRAWGGame(game: RAWGGame, screenshotUrls?: string[]): CatalogGame {
  const imageUrl = game.background_image || null;
  const communityRating = typeof game.rating === 'number' && game.rating > 0 ? Math.round(game.rating * 20) : null;
  const releaseYear = /^\d{4}/.test(game.released ?? '') ? Number(game.released!.slice(0, 4)) : null;
  const candidates = screenshotUrls ?? (game.short_screenshots || []).flatMap(shot => shot.image ? [shot.image] : []);
  return {
    id: game.id,
    title: game.name,
    duration_hours: game.playtime && game.playtime > 0 ? game.playtime : 10,
    average_rating: typeof game.metacritic === 'number' ? game.metacritic : communityRating,
    release_year: releaseYear,
    image_url: imageUrl,
    description: game.description_raw?.trim() || 'Sem descrição disponível.',
    screenshot_urls: candidates.filter(url => url !== imageUrl).slice(0, 6),
    // A RAWG entrega trailers como arquivos mp4 e a página do jogo só embute YouTube.
    trailer_url: null,
    genres: Array.from(new Set((game.genres || []).flatMap(genre => genre.name ? [genre.name] : []))),
    ...platformMetadata(game.platforms),
  };
}

export async function searchGamesWithRAWG(query: string): Promise<CatalogGame[]> {
  const page = await rawgFetch<RAWGPage<RAWGGame>>('/api/games', new URLSearchParams({
    search: query.trim(),
    exclude_additions: 'true',
    page_size: '5',
  }), 'na busca de jogos');
  return (page.results || []).map(game => mapRAWGGame(game));
}

export async function browseGamesWithRAWG(options: CatalogBrowseOptions): Promise<CatalogGame[]> {
  const sort = options.sort || 'popular';
  const limit = Math.max(1, Math.min(40, options.limit || 24));
  const offset = Math.max(0, options.offset || 0);
  const params = new URLSearchParams({
    exclude_additions: 'true',
    page_size: String(limit),
    page: String(Math.floor(offset / limit) + 1),
  });

  let ordering = '-added';
  let from: string | undefined;
  let to: string | undefined;
  if (sort === 'rated') {
    // A RAWG não filtra por número de votos, então a nota da comunidade deixaria um
    // jogo com um voto no topo. Exigir Metacritic é o piso de amostra disponível aqui.
    ordering = '-metacritic';
    params.set('metacritic', '1,100');
  } else if (sort === 'recent') {
    ordering = '-released';
    from = daysFromNow(-730);
    to = daysFromNow(0);
  } else if (sort === 'anticipated') {
    from = daysFromNow(1);
    to = daysFromNow(730);
  }
  if (options.year) {
    const yearStart = `${options.year}-01-01`;
    const yearEnd = `${options.year}-12-31`;
    from = from && from > yearStart ? from : yearStart;
    to = to && to < yearEnd ? to : yearEnd;
  }
  if (from && to) params.set('dates', `${from},${to}`);
  if (options.genre) params.set('genres', String(Math.trunc(options.genre)));
  if (options.platform) params.set('platforms', String(Math.trunc(options.platform)));

  const query = options.query?.trim();
  if (query) params.set('search', query);
  else params.set('ordering', ordering);

  const page = await rawgFetch<RAWGPage<RAWGGame>>('/api/games', params, 'ao explorar jogos');
  return (page.results || []).map(game => mapRAWGGame(game));
}

export async function getGameByRAWGId(id: number): Promise<CatalogGame | null> {
  const gameId = Math.trunc(id);
  const [game, screenshots] = await Promise.all([
    rawgFetch<RAWGGame>(`/api/games/${gameId}`, new URLSearchParams(), 'na busca por id'),
    rawgFetch<RAWGPage<{ image?: string }>>(`/api/games/${gameId}/screenshots`, new URLSearchParams({ page_size: '6' }), 'ao buscar screenshots')
      .catch(() => ({ results: [] as Array<{ image?: string }> })),
  ]);
  if (!game?.id) return null;
  return mapRAWGGame(game, (screenshots.results || []).flatMap(shot => shot.image ? [shot.image] : []));
}

export async function getGameMugshotsByRAWGId(): Promise<CatalogCharacterMugshot[]> {
  // A RAWG não tem endpoint de personagens; a grade de retratos fica vazia neste catálogo.
  return [];
}

export async function searchPlatformsWithRAWG(query: string): Promise<CatalogPlatform[]> {
  const needle = normalize(query.trim());
  if (!needle) return [];
  const page = await rawgFetch<RAWGPage<RAWGPlatform>>('/api/platforms', new URLSearchParams({ page_size: '50' }), 'na busca de plataformas');
  return (page.results || [])
    .filter(platform => normalize(platform.name).includes(needle) || normalize(platform.slug ?? '').includes(needle))
    .slice(0, 12)
    .map(platform => ({
      igdb_platform_id: platform.id,
      name: platform.name,
      abbreviation: null,
      logo_url: platform.image ?? null,
    }));
}
