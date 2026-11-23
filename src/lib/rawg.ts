import type { CatalogBrowseOptions, CatalogCharacterMugshot, CatalogGame, CatalogPlatform } from './game-catalog';
import { igdbPlatformFor, rawgGenreFor, rawgPlatformFor } from './rawg-ids';

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
  next?: string | null;
  results?: T[];
}

const API_ORIGIN = 'https://api.rawg.io';

class RAWGRequestError extends Error {
  constructor(readonly status: number, subject: string, body: string) {
    // A mensagem chega ao cliente pelas rotas; o corpo (às vezes um HTML de 502) fica
    // só no cause, que vai para o log do servidor. A URL fica de fora: leva a chave.
    super(`Erro ${subject} na RAWG (HTTP ${status}).`, { cause: body.slice(0, 500) });
    this.name = 'RAWGRequestError';
  }
}

async function rawgFetch<T>(path: string, params: URLSearchParams, subject: string): Promise<T> {
  const key = process.env.RAWG_API_KEY;
  if (!key) throw new Error('RAWG_API_KEY não configurado.');
  params.set('key', key);
  const response = await fetch(`${API_ORIGIN}${path}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new RAWGRequestError(response.status, subject, await response.text());
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

// As telas do jogo casam platforms[i] com platform_ids[i]. As plataformas com id da
// IGDB vêm primeiro, cada uma com o seu; as sem tradução ficam só com o nome, no fim.
function platformMetadata(platforms: RAWGGame['platforms']) {
  const seen = new Set<number>();
  const entries = (platforms || []).flatMap(entry => {
    const platform = entry.platform;
    if (!platform?.id || !platform.name || seen.has(platform.id)) return [];
    seen.add(platform.id);
    return [{ igdbId: igdbPlatformFor(platform.id), name: platform.name }];
  });
  const translated = entries.filter(entry => entry.igdbId !== undefined);
  const untranslated = entries.filter(entry => entry.igdbId === undefined);
  return {
    platforms: [...translated, ...untranslated].map(entry => entry.name),
    platform_ids: translated.map(entry => entry.igdbId!),
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
    // A RAWG manda metacritic 0 para jogo sem nota, não para nota zero.
    average_rating: typeof game.metacritic === 'number' && game.metacritic > 0 ? game.metacritic : communityRating,
    release_year: releaseYear,
    image_url: imageUrl,
    description: game.description_raw?.trim() || null,
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
  const page = Math.floor(offset / limit) + 1;
  const params = new URLSearchParams({
    exclude_additions: 'true',
    page_size: String(limit),
    page: String(page),
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
    // dates vai como AAAA-MM-DD, então só um ano de quatro dígitos vira uma janela.
    if (!Number.isInteger(options.year) || options.year < 1000 || options.year > 9999) return [];
    const yearStart = `${options.year}-01-01`;
    const yearEnd = `${options.year}-12-31`;
    from = from && from > yearStart ? from : yearStart;
    to = to && to < yearEnd ? to : yearEnd;
  }
  // Ano fora da janela de lançamentos ou de "em breve": a interseção é vazia.
  if (from && to && from > to) return [];
  if (from && to) params.set('dates', `${from},${to}`);
  // Os filtros chegam com ids da IGDB. Sem tradução conferida, nenhum jogo é a resposta
  // certa; mandar o número cru filtraria por outro gênero ou plataforma da RAWG.
  if (options.genre) {
    const genre = rawgGenreFor(Math.trunc(options.genre));
    if (genre === undefined) return [];
    params.set('genres', String(genre));
  }
  if (options.platform) {
    const platform = rawgPlatformFor(Math.trunc(options.platform));
    if (platform === undefined) return [];
    params.set('platforms', String(platform));
  }

  const query = options.query?.trim();
  if (query) params.set('search', query);
  else params.set('ordering', ordering);

  const body = await rawgFetch<RAWGPage<RAWGGame>>('/api/games', params, 'ao explorar jogos').catch(error => {
    // Depois da última página a RAWG responde 404 {"detail":"Invalid page."}: a lista
    // acabou. Outro 404 (rota que mudou, proxy na frente) continua sendo falha.
    if (error instanceof RAWGRequestError && error.status === 404 && page > 1 && String(error.cause).includes('Invalid page')) return { results: [] };
    throw error;
  });
  return (body.results || []).map(game => mapRAWGGame(game));
}

export async function getGameByRAWGId(id: number): Promise<CatalogGame | null> {
  const gameId = Math.trunc(id);
  const [game, screenshots] = await Promise.all([
    // Id inexistente é null, como na IGDB; outras falhas continuam sendo erro.
    rawgFetch<RAWGGame>(`/api/games/${gameId}`, new URLSearchParams(), 'na busca por id').catch(error => {
      if (error instanceof RAWGRequestError && error.status === 404) return null;
      throw error;
    }),
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

// A RAWG lista 50 plataformas, e a doc dela não diz até quanto page_size vai, então a
// busca segue `next`. Cinco páginas de 40 cobrem a lista com folga; se ela passar de
// 200, as plataformas além disso ficam de fora da busca.
const PLATFORM_PAGE_SIZE = 40;
const MAX_PLATFORM_PAGES = 5;

async function listRAWGPlatforms(): Promise<RAWGPlatform[]> {
  const platforms: RAWGPlatform[] = [];
  for (let page = 1; page <= MAX_PLATFORM_PAGES; page++) {
    const body = await rawgFetch<RAWGPage<RAWGPlatform>>('/api/platforms', new URLSearchParams({
      page: String(page),
      page_size: String(PLATFORM_PAGE_SIZE),
    }), 'na busca de plataformas');
    platforms.push(...(body.results || []));
    if (!body.next) break;
  }
  return platforms;
}

export async function searchPlatformsWithRAWG(query: string): Promise<CatalogPlatform[]> {
  const needle = normalize(query.trim());
  if (!needle) return [];
  // O console escolhido vai para user_platforms.igdb_platform_id, então só entra
  // plataforma com id da IGDB conferido em rawg-ids.ts.
  return (await listRAWGPlatforms())
    .filter(platform => normalize(platform.name).includes(needle) || normalize(platform.slug ?? '').includes(needle))
    .flatMap(platform => {
      const igdbId = igdbPlatformFor(platform.id);
      return igdbId === undefined ? [] : [{
        igdb_platform_id: igdbId,
        name: platform.name,
        abbreviation: null,
        logo_url: platform.image ?? null,
      }];
    })
    .slice(0, 12);
}
