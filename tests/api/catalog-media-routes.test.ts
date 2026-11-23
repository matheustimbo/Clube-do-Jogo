import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

// Caminho real das rotas e do catálogo. Só a borda é falsa: o banco (uma linha de
// games) e a rede (fetch), que grava cada URL pedida.
type Row = Record<string, unknown> & { id: string; title: string };
const database: { row: Row | null; updates: Array<Record<string, unknown>> } = { row: null, updates: [] };

const supabase = {
  from() {
    return {
      select() {
        return { eq: () => ({ maybeSingle: async () => ({ data: database.row, error: null }) }) };
      },
      update(patch: Record<string, unknown>) {
        database.updates.push(patch);
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { ...database.row, ...patch }, error: null }) }) }) };
      },
    };
  },
};

mock.module('../../src/lib/supabase/server', {
  exports: { createRequestContext: async () => ({ supabase, userId: 'membro' }) },
});

const mediaRoute = import('../../src/app/api/games/[id]/media/route');
const mugshotsRoute = import('../../src/app/api/games/[id]/mugshots/route');

const savedEnvironment = {
  provider: process.env.GAME_CATALOG_PROVIDER,
  offline: process.env.IGDB_OFFLINE_CATALOG,
  key: process.env.RAWG_API_KEY,
};
const realFetch = globalThis.fetch;
let requested: string[] = [];

function restore(variable: string, value: string | undefined) {
  if (value === undefined) delete process.env[variable];
  else process.env[variable] = value;
}

beforeEach(() => {
  database.row = null;
  database.updates = [];
  requested = [];
});

afterEach(() => {
  restore('GAME_CATALOG_PROVIDER', savedEnvironment.provider);
  restore('IGDB_OFFLINE_CATALOG', savedEnvironment.offline);
  restore('RAWG_API_KEY', savedEnvironment.key);
  globalThis.fetch = realFetch;
});

const TUNIC = {
  id: 23027,
  name: 'Tunic',
  released: '2022-03-16',
  background_image: 'https://media.rawg.io/media/games/tunic.jpg',
  metacritic: 85,
  playtime: 12,
  description_raw: 'Uma raposinha e um manual indecifrável.',
  genres: [{ name: 'Adventure' }],
  platforms: [{ platform: { id: 4, name: 'PC' } }],
};

function useRAWG(bodies: Record<string, unknown> = {}) {
  delete process.env.IGDB_OFFLINE_CATALOG;
  process.env.GAME_CATALOG_PROVIDER = 'rawg';
  process.env.RAWG_API_KEY = 'chave-de-teste';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requested.push(url.origin + url.pathname);
    const body = bodies[url.pathname];
    if (body === undefined) return new Response('{"detail":"Not found."}', { status: 404 });
    return Response.json(body);
  }) as typeof fetch;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function enrichResponse(id = 'jogo') {
  const { POST } = await mediaRoute;
  return POST(new Request('http://localhost/api/games/jogo/media', { method: 'POST' }), params(id));
}

async function mugshotsResponse(id = 'jogo') {
  const { GET } = await mugshotsRoute;
  return GET(new Request('http://localhost/api/games/jogo/mugshots'), params(id));
}

const enrich = async (id = 'jogo') => (await enrichResponse(id)).json();
const mugshots = async (id = 'jogo') => (await mugshotsResponse(id)).json();

test('a row with only igdb_id 26192 never reaches rawg.io/api/games/26192', async () => {
  useRAWG({ '/api/games/26192': { ...TUNIC, id: 26192, name: 'Outro jogo da RAWG' } });
  database.row = { id: 'jogo', title: 'Outer Wilds', igdb_id: 26192, rawg_id: null, trailer_url: 'https://www.youtube.com/watch?v=ow' };

  assert.deepEqual(await enrich(), database.row);
  assert.deepEqual(await mugshots(), { mugshots: [] });

  assert.deepEqual(requested, []);
  assert.deepEqual(database.updates, []);
});

test('under RAWG the media route looks a game up by its rawg_id', async () => {
  useRAWG({ '/api/games/23027': TUNIC, '/api/games/23027/screenshots': { results: [] } });
  database.row = { id: 'jogo', title: 'Tunic', igdb_id: null, rawg_id: 23027, trailer_url: null };

  await enrich();

  assert.deepEqual(requested, ['https://api.rawg.io/api/games/23027', 'https://api.rawg.io/api/games/23027/screenshots']);
  assert.equal(database.updates.length, 1);
  assert.equal(database.updates[0].description, 'Uma raposinha e um manual indecifrável.');
  assert.equal(Object.hasOwn(database.updates[0], 'igdb_id'), false);
});

test('a catalog without trailers keeps the trailer the row already has', async () => {
  useRAWG({ '/api/games/23027': TUNIC, '/api/games/23027/screenshots': { results: [] } });
  database.row = { id: 'jogo', title: 'Tunic', igdb_id: null, rawg_id: 23027, trailer_url: 'https://www.youtube.com/watch?v=tunic' };

  const updated = await enrich();

  assert.equal(database.updates[0].trailer_url, 'https://www.youtube.com/watch?v=tunic');
  assert.equal(updated.trailer_url, 'https://www.youtube.com/watch?v=tunic');
});

// A listagem da RAWG não traz description_raw; só o detalhe por id traz.
const TUNIC_LISTED = { ...TUNIC, description_raw: undefined };

test('a row no catalog owns is matched by exact title and gets the rawg_id, not the igdb_id', async () => {
  useRAWG({ '/api/games': { results: [{ ...TUNIC_LISTED, id: 999, name: 'Tunic Remix' }, TUNIC_LISTED] }, '/api/games/23027': TUNIC, '/api/games/23027/screenshots': { results: [] } });
  database.row = { id: 'jogo', title: 'Tunic', igdb_id: null, rawg_id: null, trailer_url: null };

  await enrich();

  assert.equal(database.updates.length, 1);
  assert.equal(database.updates[0].rawg_id, 23027);
  assert.equal(Object.hasOwn(database.updates[0], 'igdb_id'), false);
});

test('before the rawg_id migration both routes answer 500 and reach neither RAWG nor the database', async () => {
  useRAWG({ '/api/games': { results: [TUNIC] } });
  // select('*') num banco sem a coluna devolve a linha sem a chave rawg_id.
  database.row = { id: 'jogo', title: 'Tunic', igdb_id: null, trailer_url: null };

  // Como discover e search: o schema faltando é erro do servidor, não um jogo sem mídia.
  for (const response of [await enrichResponse(), await mugshotsResponse()]) {
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /rawg_id/);
  }
  assert.deepEqual(requested, []);
  assert.deepEqual(database.updates, []);
});

test('the IGDB-numbered catalog still enriches a row by its igdb_id', async () => {
  delete process.env.GAME_CATALOG_PROVIDER;
  process.env.IGDB_OFFLINE_CATALOG = '1';
  globalThis.fetch = (async () => { throw new Error('o catálogo offline não sai para a rede'); }) as typeof fetch;
  database.row = { id: 'jogo', title: 'Celeste', igdb_id: 900003, trailer_url: null };

  await enrich();
  const { mugshots: portraits } = await mugshots();

  assert.equal(database.updates.length, 1);
  assert.equal(database.updates[0].igdb_id, 900003);
  assert.equal(Object.hasOwn(database.updates[0], 'rawg_id'), false);
  assert.equal(portraits.length, 2);
});

test('a title match reads the detail by id, so the row gets the full description', async () => {
  useRAWG({ '/api/games': { results: [TUNIC_LISTED] }, '/api/games/23027': TUNIC, '/api/games/23027/screenshots': { results: [] } });
  database.row = { id: 'jogo', title: 'Tunic', igdb_id: null, rawg_id: null, description: null, trailer_url: null };

  await enrich();

  assert.ok(requested.includes('https://api.rawg.io/api/games/23027'), JSON.stringify(requested));
  assert.equal(database.updates[0].description, 'Uma raposinha e um manual indecifrável.');
});

test('a catalog with no description keeps the one the row already has', async () => {
  useRAWG({ '/api/games': { results: [TUNIC_LISTED] }, '/api/games/23027': TUNIC_LISTED, '/api/games/23027/screenshots': { results: [] } });
  database.row = { id: 'jogo', title: 'Tunic', igdb_id: null, rawg_id: null, description: 'Descrição escrita à mão.', trailer_url: null };

  await enrich();

  assert.equal(database.updates[0].description, 'Descrição escrita à mão.');
});

const RESIDENT_EVIL_2002 = { ...TUNIC_LISTED, id: 2002, name: 'Resident Evil', released: '2002-03-22' };
const RESIDENT_EVIL_1996 = { ...TUNIC_LISTED, id: 1996, name: 'Resident Evil', released: '1996-03-22' };

test('a title match from another year is another game and leaves the row alone', async () => {
  useRAWG({ '/api/games': { results: [RESIDENT_EVIL_2002] }, '/api/games/2002': RESIDENT_EVIL_2002 });
  database.row = { id: 'jogo', title: 'Resident Evil', release_year: 1996, igdb_id: null, rawg_id: null, trailer_url: null };

  assert.deepEqual(await enrich(), database.row);
  assert.deepEqual(database.updates, []);
  assert.deepEqual(requested, ['https://api.rawg.io/api/games']);
});

test('a title match takes the candidate from the row year', async () => {
  useRAWG({
    '/api/games': { results: [RESIDENT_EVIL_2002, RESIDENT_EVIL_1996] },
    '/api/games/1996': RESIDENT_EVIL_1996,
    '/api/games/1996/screenshots': { results: [] },
  });
  database.row = { id: 'jogo', title: 'Resident Evil', release_year: 1996, igdb_id: null, rawg_id: null, trailer_url: null };

  await enrich();

  assert.equal(database.updates[0].rawg_id, 1996);
  assert.equal(database.updates[0].release_year, 1996);
});

test('mugshots never come from a same-title game of another year', async () => {
  delete process.env.GAME_CATALOG_PROVIDER;
  process.env.IGDB_OFFLINE_CATALOG = '1';
  globalThis.fetch = (async () => { throw new Error('o catálogo offline não sai para a rede'); }) as typeof fetch;
  // A Celeste da fixture é de 2018.
  database.row = { id: 'jogo', title: 'Celeste', release_year: 2016, igdb_id: null };
  assert.deepEqual(await mugshots(), { mugshots: [] });

  database.row = { id: 'jogo', title: 'Celeste', release_year: 2018, igdb_id: null };
  assert.equal((await mugshots()).mugshots.length, 2);
});

test('under the IGDB-numbered catalog mugshots skip a row only RAWG owns and look a row no one owns up by title', async () => {
  delete process.env.GAME_CATALOG_PROVIDER;
  process.env.IGDB_OFFLINE_CATALOG = '1';
  globalThis.fetch = (async () => { throw new Error('o catálogo offline não sai para a rede'); }) as typeof fetch;

  // O rawg_id 900003 é o id da Celeste na fixture, mas na numeração da RAWG.
  database.row = { id: 'jogo', title: 'Celeste', release_year: 2018, igdb_id: null, rawg_id: 900003 };
  assert.deepEqual(await mugshots(), { mugshots: [] });

  database.row = { id: 'jogo', title: 'Celeste', release_year: 2018, igdb_id: null, rawg_id: null };
  assert.equal((await mugshots()).mugshots.length, 2);
});

const RESIDENT_EVIL_UNDATED = { ...TUNIC_LISTED, id: 3000, name: 'Resident Evil', released: null };

test('a row with a year never takes a catalog game without one', async () => {
  useRAWG({ '/api/games': { results: [RESIDENT_EVIL_UNDATED, RESIDENT_EVIL_2002] }, '/api/games/3000': RESIDENT_EVIL_UNDATED });
  database.row = { id: 'jogo', title: 'Resident Evil', release_year: 1996, igdb_id: null, rawg_id: null, trailer_url: null };

  assert.deepEqual(await enrich(), database.row);
  assert.deepEqual(database.updates, []);
  assert.deepEqual(requested, ['https://api.rawg.io/api/games']);
});

test('a row with a year takes the candidate of its year even after one without a year', async () => {
  useRAWG({
    '/api/games': { results: [RESIDENT_EVIL_UNDATED, RESIDENT_EVIL_1996] },
    '/api/games/1996': RESIDENT_EVIL_1996,
    '/api/games/1996/screenshots': { results: [] },
  });
  database.row = { id: 'jogo', title: 'Resident Evil', release_year: 1996, igdb_id: null, rawg_id: null, trailer_url: null };

  await enrich();

  assert.equal(database.updates[0].rawg_id, 1996);
});

test('a row without a year still takes the first same-title game, dated or not', async () => {
  useRAWG({
    '/api/games': { results: [RESIDENT_EVIL_2002, RESIDENT_EVIL_UNDATED] },
    '/api/games/2002': RESIDENT_EVIL_2002,
    '/api/games/2002/screenshots': { results: [] },
  });
  database.row = { id: 'jogo', title: 'Resident Evil', release_year: null, igdb_id: null, rawg_id: null, trailer_url: null };
  await enrich();
  // A busca vem por relevância: sem ano na linha, o primeiro de mesmo título é o jogo.
  assert.deepEqual(database.updates.map(update => update.rawg_id), [2002]);

  useRAWG({
    '/api/games': { results: [RESIDENT_EVIL_UNDATED] },
    '/api/games/3000': RESIDENT_EVIL_UNDATED,
    '/api/games/3000/screenshots': { results: [] },
  });
  database.updates = [];
  await enrich();
  assert.deepEqual(database.updates.map(update => update.rawg_id), [3000]);
});
