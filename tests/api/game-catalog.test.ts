import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { browseGames, getGameById, getGameMugshots, searchGames, searchPlatforms } from '../../src/lib/game-catalog';

const FIXED_NOW = Date.UTC(2026, 8, 14);

const savedEnvironment = {
  offline: process.env.IGDB_OFFLINE_CATALOG,
  provider: process.env.GAME_CATALOG_PROVIDER,
  key: process.env.RAWG_API_KEY,
};
const realFetch = globalThis.fetch;
const realNow = Date.now;

function restore(name: keyof typeof savedEnvironment, variable: string) {
  const value = savedEnvironment[name];
  if (value === undefined) delete process.env[variable];
  else process.env[variable] = value;
}

afterEach(() => {
  restore('offline', 'IGDB_OFFLINE_CATALOG');
  restore('provider', 'GAME_CATALOG_PROVIDER');
  restore('key', 'RAWG_API_KEY');
  globalThis.fetch = realFetch;
  Date.now = realNow;
});

function useRAWG() {
  delete process.env.IGDB_OFFLINE_CATALOG;
  process.env.GAME_CATALOG_PROVIDER = 'rawg';
  process.env.RAWG_API_KEY = 'chave-de-teste';
  Date.now = () => FIXED_NOW;
}

function recordFetch(bodies: Record<string, unknown>) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const match = Object.keys(bodies).find(path => new URL(url).pathname === path);
    if (!match) throw new Error(`fetch inesperado: ${new URL(url).pathname}`);
    return new Response(JSON.stringify(bodies[match]), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return urls;
}

function failingFetch() {
  globalThis.fetch = (async () => {
    throw new Error('o catálogo offline não pode sair para a rede');
  }) as typeof fetch;
}

const TUNIC = {
  id: 23027,
  name: 'Tunic',
  released: '2022-03-16',
  background_image: 'https://media.rawg.io/media/games/tunic.jpg',
  rating: 4.35,
  metacritic: 85,
  playtime: 12,
  genres: [{ name: 'Adventure' }, { name: 'Puzzle' }, { name: 'Adventure' }],
  platforms: [{ platform: { id: 4, name: 'PC' } }, { platform: { id: 1, name: 'Xbox One' } }, { platform: { id: 4, name: 'PC' } }],
  short_screenshots: [
    { image: 'https://media.rawg.io/media/games/tunic.jpg' },
    { image: 'https://media.rawg.io/media/screenshots/tunic-1.jpg' },
    { image: 'https://media.rawg.io/media/screenshots/tunic-2.jpg' },
  ],
};

const TUNIC_MAPPED = {
  id: 23027,
  title: 'Tunic',
  duration_hours: 12,
  average_rating: 85,
  release_year: 2022,
  image_url: 'https://media.rawg.io/media/games/tunic.jpg',
  description: 'Sem descrição disponível.',
  screenshot_urls: [
    'https://media.rawg.io/media/screenshots/tunic-1.jpg',
    'https://media.rawg.io/media/screenshots/tunic-2.jpg',
  ],
  trailer_url: null,
  genres: ['Adventure', 'Puzzle'],
  platforms: ['PC', 'Xbox One'],
  platform_ids: [4, 1],
};

test('the offline flag wins over the chosen provider and never reaches the network', async () => {
  process.env.IGDB_OFFLINE_CATALOG = '1';
  process.env.GAME_CATALOG_PROVIDER = 'rawg';
  delete process.env.RAWG_API_KEY;
  failingFetch();

  assert.deepEqual((await searchGames('hollow')).map(game => game.title), ['Hollow Knight']);
  assert.deepEqual((await browseGames({ limit: 2, offset: 0 })).map(game => game.title), ['Outer Wilds', 'Hollow Knight']);
  assert.equal((await getGameById(900003))?.title, 'Celeste');
  assert.equal((await getGameMugshots(900003)).length, 2);
  assert.deepEqual((await searchPlatforms('switch')).map(platform => platform.igdb_platform_id), [130]);
});

test('rawg search maps a game into the catalog shape the routes persist', async () => {
  useRAWG();
  const urls = recordFetch({ '/api/games': { results: [TUNIC] } });

  assert.deepEqual(await searchGames('tunic'), [TUNIC_MAPPED]);

  const url = new URL(urls[0]);
  assert.equal(url.origin, 'https://api.rawg.io');
  assert.equal(url.searchParams.get('search'), 'tunic');
  assert.equal(url.searchParams.get('page_size'), '5');
  assert.equal(url.searchParams.get('key'), 'chave-de-teste');
});

test('rawg falls back to ten hours and to a null rating, cover and year', async () => {
  useRAWG();
  recordFetch({
    '/api/games': {
      results: [
        { id: 1, name: 'Sem tempo', playtime: 0, metacritic: null, rating: 0, released: null, background_image: null },
        { id: 2, name: 'Sem metacritic', playtime: 40, rating: 4.35, released: '2019-05-28', background_image: 'https://media.rawg.io/media/games/dois.jpg' },
      ],
    },
  });

  const [semTempo, semMetacritic] = await searchGames('qualquer');
  assert.deepEqual(semTempo, {
    id: 1,
    title: 'Sem tempo',
    duration_hours: 10,
    average_rating: null,
    release_year: null,
    image_url: null,
    description: 'Sem descrição disponível.',
    screenshot_urls: [],
    trailer_url: null,
    genres: [],
    platforms: [],
    platform_ids: [],
  });
  assert.equal(semMetacritic.duration_hours, 40);
  assert.equal(semMetacritic.average_rating, 87);
  assert.equal(semMetacritic.release_year, 2019);
});

test('rawg detail reads the raw description and the screenshots endpoint', async () => {
  useRAWG();
  recordFetch({
    '/api/games/23027': { ...TUNIC, description_raw: '  Uma raposinha e um manual indecifrável.  ' },
    '/api/games/23027/screenshots': { results: [{ image: 'https://media.rawg.io/media/screenshots/detalhe.jpg' }] },
  });

  const game = await getGameById(23027);
  assert.deepEqual(game, {
    ...TUNIC_MAPPED,
    description: 'Uma raposinha e um manual indecifrável.',
    screenshot_urls: ['https://media.rawg.io/media/screenshots/detalhe.jpg'],
  });
});

test('rawg has no characters endpoint, so mugshots come back empty', async () => {
  useRAWG();
  failingFetch();
  assert.deepEqual(await getGameMugshots(23027), []);
});

test('each discovery sort becomes the rawg ordering and date window it maps to', async () => {
  useRAWG();
  const urls = recordFetch({ '/api/games': { results: [] } });

  await browseGames({ sort: 'popular', limit: 24, offset: 48 });
  await browseGames({ sort: 'rated', limit: 24, offset: 0 });
  await browseGames({ sort: 'recent', limit: 24, offset: 0 });
  await browseGames({ sort: 'anticipated', limit: 24, offset: 0 });
  await browseGames({ sort: 'popular', query: 'celeste', limit: 24, offset: 0 });
  await browseGames({ sort: 'recent', year: 2025, limit: 24, offset: 0 });
  await browseGames({ sort: 'popular', year: 2020, limit: 24, offset: 0 });

  const params = urls.map(url => new URL(url).searchParams);
  assert.deepEqual(
    params.map(entry => [entry.get('ordering'), entry.get('dates'), entry.get('metacritic')]),
    [
      ['-added', null, null],
      ['-metacritic', null, '1,100'],
      ['-released', '2024-09-14,2026-09-14', null],
      ['-added', '2026-09-15,2028-09-13', null],
      [null, null, null],
      ['-released', '2025-01-01,2025-12-31', null],
      ['-added', '2020-01-01,2020-12-31', null],
    ],
  );
  assert.equal(params[0].get('page'), '3');
  assert.equal(params[4].get('search'), 'celeste');
  assert.ok(params.every(entry => entry.get('exclude_additions') === 'true' && entry.get('page_size') === '24'));
});

test('rawg platform search filters the platform list without accents or case', async () => {
  useRAWG();
  recordFetch({
    '/api/platforms': {
      results: [
        { id: 187, name: 'PlayStation 5', slug: 'playstation5', image: null },
        { id: 7, name: 'Nintendo Switch', slug: 'nintendo-switch', image: 'https://media.rawg.io/media/platforms/switch.png' },
      ],
    },
  });

  assert.deepEqual(await searchPlatforms('SWITCH'), [
    { igdb_platform_id: 7, name: 'Nintendo Switch', abbreviation: null, logo_url: 'https://media.rawg.io/media/platforms/switch.png' },
  ]);
  assert.deepEqual(await searchPlatforms('  '), []);
});

test('rawg refuses to call the API without a key', async () => {
  useRAWG();
  delete process.env.RAWG_API_KEY;
  failingFetch();
  await assert.rejects(() => searchGames('tunic'), /RAWG_API_KEY não configurado/);
});
