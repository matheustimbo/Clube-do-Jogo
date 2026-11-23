import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { browseGames, getGameById, getGameMugshots, searchGames, searchPlatforms } from '../../src/lib/game-catalog';

const FIXED_NOW = Date.UTC(2026, 8, 14);

const savedEnvironment = {
  offline: process.env.IGDB_OFFLINE_CATALOG,
  provider: process.env.GAME_CATALOG_PROVIDER,
  key: process.env.RAWG_API_KEY,
  igdbId: process.env.IGDB_CLIENT_ID,
  igdbSecret: process.env.IGDB_CLIENT_SECRET,
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
  restore('igdbId', 'IGDB_CLIENT_ID');
  restore('igdbSecret', 'IGDB_CLIENT_SECRET');
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
  // A listagem da RAWG não traz description_raw. Sem descrição não é uma descrição:
  // o cache deixa a coluna como está.
  description: null,
  screenshot_urls: [
    'https://media.rawg.io/media/screenshots/tunic-1.jpg',
    'https://media.rawg.io/media/screenshots/tunic-2.jpg',
  ],
  trailer_url: null,
  genres: ['Adventure', 'Puzzle'],
  platforms: ['PC', 'Xbox One'],
  // PC e Xbox One da RAWG (4 e 1) gravados com os ids da IGDB, que o resto do app usa.
  platform_ids: [6, 49],
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
    description: null,
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

test('a year outside the recent or upcoming window returns no games and sends no request', async () => {
  useRAWG();
  failingFetch();
  // Com a data fixa em 2026-09-14, lançamentos cobrem 2024-09-14 a 2026-09-14 e "em breve" 2026-09-15 a 2028-09-13.
  assert.deepEqual(await browseGames({ sort: 'recent', year: 2020, limit: 24, offset: 0 }), []);
  assert.deepEqual(await browseGames({ sort: 'anticipated', year: 2025, limit: 24, offset: 0 }), []);
  assert.deepEqual(await browseGames({ sort: 'anticipated', year: 2030, limit: 24, offset: 0 }), []);
});

test('a year that is not four digits returns no games and sends no request', async () => {
  useRAWG();
  failingFetch();
  // A RAWG lê dates como AAAA-MM-DD; 999-01-01 não é uma data dela.
  for (const year of [999, 10000, 2020.5]) {
    assert.deepEqual(await browseGames({ sort: 'popular', year, limit: 24, offset: 0 }), [], String(year));
  }
});

test('a year that overlaps the window narrows it to the overlap', async () => {
  useRAWG();
  const urls = recordFetch({ '/api/games': { results: [] } });
  await browseGames({ sort: 'recent', year: 2026, limit: 24, offset: 0 });
  await browseGames({ sort: 'anticipated', year: 2027, limit: 24, offset: 0 });
  assert.deepEqual(urls.map(url => new URL(url).searchParams.get('dates')), ['2026-01-01,2026-09-14', '2027-01-01,2027-12-31']);
});

test('rawg platform search walks every page and answers with IGDB platform ids', async () => {
  useRAWG();
  const pages: Record<string, unknown> = {
    '1': {
      next: 'https://api.rawg.io/api/platforms?page=2',
      results: [
        { id: 187, name: 'PlayStation 5', slug: 'playstation5', image: null },
        { id: 8, name: 'Nintendo 3DS', slug: 'nintendo-3ds', image: null },
      ],
    },
    '2': {
      next: null,
      results: [{ id: 7, name: 'Nintendo Switch', slug: 'nintendo-switch', image: 'https://media.rawg.io/media/platforms/switch.png' }],
    },
  };
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    return Response.json(pages[url.searchParams.get('page') ?? '1']);
  }) as typeof fetch;

  assert.deepEqual(await searchPlatforms('SWITCH'), [
    { igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: null, logo_url: 'https://media.rawg.io/media/platforms/switch.png' },
  ]);
  // O 3DS (RAWG 8) vai para user_platforms com o id da IGDB, 37.
  assert.deepEqual(await searchPlatforms('nintendo'), [
    { igdb_platform_id: 37, name: 'Nintendo 3DS', abbreviation: null, logo_url: null },
    { igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: null, logo_url: 'https://media.rawg.io/media/platforms/switch.png' },
  ]);
  assert.deepEqual(await searchPlatforms('  '), []);
  assert.deepEqual(urls.map(url => new URL(url).searchParams.get('page')), ['1', '2', '1', '2']);
});

test('the discover filters arrive as IGDB ids and reach RAWG as RAWG ids', async () => {
  useRAWG();
  const urls = recordFetch({ '/api/games': { results: [] } });

  await browseGames({ sort: 'popular', genre: 12, platform: 167, limit: 24, offset: 0 });
  await browseGames({ sort: 'popular', genre: 8, platform: 169, limit: 24, offset: 0 });
  await browseGames({ sort: 'popular', platform: 37, limit: 24, offset: 0 });

  const params = urls.map(url => new URL(url).searchParams);
  assert.deepEqual(params.map(entry => [entry.get('genres'), entry.get('platforms')]), [['5', '187'], ['83', '186'], [null, '8']]);
});

test('a filter id with no RAWG translation returns no games and sends no request', async () => {
  useRAWG();
  failingFetch();
  assert.deepEqual(await browseGames({ sort: 'popular', genre: 13, limit: 24, offset: 0 }), []);
  // 20 não tem par em rawg-ids.ts.
  assert.deepEqual(await browseGames({ sort: 'popular', platform: 20, limit: 24, offset: 0 }), []);
});

test('rawg platforms are stored with IGDB ids first and the untranslated ones keep only their name', async () => {
  useRAWG();
  recordFetch({
    '/api/games': {
      results: [{
        ...TUNIC,
        platforms: [{ platform: { id: 9, name: 'Nintendo DS' } }, { platform: { id: 4, name: 'PC' } }, { platform: { id: 8, name: 'Nintendo 3DS' } }],
      }],
    },
  });

  const [game] = await searchGames('tunic');
  assert.deepEqual(game.platforms, ['PC', 'Nintendo 3DS', 'Nintendo DS']);
  assert.deepEqual(game.platform_ids, [6, 37]);
});

test('a discover page past the end of RAWG is the end of the list, not an error', async () => {
  useRAWG();
  // O Django REST Framework da RAWG responde assim a uma página que não existe.
  globalThis.fetch = (async () => new Response('{"detail":"Invalid page."}', { status: 404 })) as typeof fetch;
  assert.deepEqual(await browseGames({ sort: 'popular', limit: 24, offset: 480 }), []);
  // Na primeira página o 404 não é fim de lista: é a RAWG falhando.
  await assert.rejects(browseGames({ sort: 'popular', limit: 24, offset: 0 }), /404/);
});

test('a RAWG id that does not exist comes back as null, like the IGDB contract', async () => {
  useRAWG();
  globalThis.fetch = (async () => new Response('{"detail":"Not found."}', { status: 404 })) as typeof fetch;
  assert.equal(await getGameById(424242), null);
});

test('a RAWG server error on a game by id is an error, not a missing game', async () => {
  useRAWG();
  globalThis.fetch = (async () => new Response('{"detail":"Server error."}', { status: 500 })) as typeof fetch;
  await assert.rejects(getGameById(23027), /500/);
});

test('a RAWG failure reaches the caller with its status and without the raw body', async () => {
  useRAWG();
  globalThis.fetch = (async () => new Response('<html><body><h1>502 Bad Gateway</h1></body></html>', { status: 502 })) as typeof fetch;
  await assert.rejects(searchGames('tunic'), (error: Error) => {
    assert.match(error.message, /502/);
    assert.doesNotMatch(error.message, /<html|Bad Gateway/);
    return true;
  });
});

test('a metacritic of 0 is no score, so the community rating stands in', async () => {
  useRAWG();
  recordFetch({ '/api/games': { results: [{ ...TUNIC, metacritic: 0, rating: 4.35 }] } });
  const [game] = await searchGames('tunic');
  assert.equal(game.average_rating, 87);
});

test('rawg refuses to call the API without a key', async () => {
  useRAWG();
  delete process.env.RAWG_API_KEY;
  failingFetch();
  await assert.rejects(() => searchGames('tunic'), /RAWG_API_KEY não configurado/);
});

function useIGDB(games: unknown[]) {
  delete process.env.IGDB_OFFLINE_CATALOG;
  delete process.env.GAME_CATALOG_PROVIDER;
  process.env.IGDB_CLIENT_ID = 'cliente';
  process.env.IGDB_CLIENT_SECRET = 'segredo';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'id.twitch.tv') return Response.json({ access_token: 'token', expires_in: 3600 });
    if (url.pathname === '/v4/games') return Response.json(games);
    if (url.pathname === '/v4/game_time_to_beats') return Response.json([]);
    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;
}

test('an IGDB game without a summary has no description instead of a placeholder', async () => {
  useIGDB([{ id: 7346, name: 'Sem resumo' }]);
  assert.equal((await searchGames('sem resumo'))[0].description, null);
  assert.equal((await getGameById(7346))?.description, null);
});

test('an IGDB summary is the description', async () => {
  useIGDB([{ id: 7346, name: 'Com resumo', summary: 'Um resumo de verdade.' }]);
  assert.equal((await searchGames('com resumo'))[0].description, 'Um resumo de verdade.');
});
