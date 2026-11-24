import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { parseInList } from './fake-games-rest';

// Caminho real da rota GOTY e do cache. Só a borda é falsa: o banco, que grava cada
// upsert, e a rede, que responde como a Twitch e a IGDB.
type Upsert = { rows: Array<Record<string, unknown>>; onConflict: string };
type Row = Record<string, unknown> & { id: string; title: string };
const upserts: Upsert[] = [];
// Linhas que já estão em games, por título. A unique de título vale como no banco: o
// upsert de outro jogo com esse título responde 23505.
const stored = new Map<string, Row>();

const titleConflict = (rows: Array<Record<string, unknown>>, key: string) =>
  rows.some(row => stored.has(String(row.title)) && stored.get(String(row.title))![key] !== row[key]);

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'membro' } }, error: null }) },
  from() {
    return {
      upsert(payload: Record<string, unknown> | Array<Record<string, unknown>>, { onConflict }: { onConflict: string }) {
        const rows = Array.isArray(payload) ? payload : [payload];
        upserts.push({ rows, onConflict });
        const error = titleConflict(rows, onConflict) ? { code: '23505', message: 'duplicate key value violates unique constraint "games_title_key"' } : null;
        // O ON CONFLICT DO UPDATE só troca as colunas do payload; as outras ficam como estavam.
        const saved = rows.map(row => ({ id: `linha-${String(row[onConflict])}`, ...stored.get(String(row.title)), ...row }));
        const result = error ? { data: null, error } : { data: saved, error: null };
        return { select: () => Object.assign(Promise.resolve(result), { single: async () => (error ? result : { data: saved[0], error: null }) }) };
      },
      select() {
        // A busca local da rota: título parecido, 2026 só sem "incluir outros anos", por nota.
        let only2026 = false;
        const local = {
          limit: () => local,
          ilike: () => local,
          eq: () => { only2026 = true; return local; },
          order: async () => ({ data: [...stored.values()].filter(row => !only2026 || row.release_year === 2026), error: null }),
        };
        return {
          ...local,
          // O filtro in como o PostgREST lê; uma lista que ele não lê falha o teste.
          filter: async (_column: string, _operator: 'in', list: string) => ({ data: parseInList(list)!.flatMap(title => (stored.has(title) ? [stored.get(title)!] : [])), error: null }),
          eq: (_column: string, title: string) => ({ ...local, maybeSingle: async () => ({ data: stored.get(title) ?? null, error: null }) }),
        };
      },
      update() {
        throw new Error('a busca GOTY não reivindica linha neste teste');
      },
    };
  },
};

mock.module('../../src/lib/supabase/server', {
  exports: { createClient: async () => supabase },
});

const IGDB_GAME_2026 = {
  id: 119171,
  name: 'Jogo de 2026',
  summary: 'Um jogo lançado em 2026.',
  cover: { image_id: 'capa2026' },
  first_release_date: Math.floor(Date.UTC(2026, 4, 30) / 1000),
  game_type: 0,
  release_dates: [{ date: Math.floor(Date.UTC(2026, 4, 30) / 1000), y: 2026 }],
};

const savedEnvironment = {
  provider: process.env.GAME_CATALOG_PROVIDER,
  offline: process.env.IGDB_OFFLINE_CATALOG,
  clientId: process.env.IGDB_CLIENT_ID,
  clientSecret: process.env.IGDB_CLIENT_SECRET,
};
const realFetch = globalThis.fetch;

function restore(variable: string, value: string | undefined) {
  if (value === undefined) delete process.env[variable];
  else process.env[variable] = value;
}

afterEach(() => {
  restore('GAME_CATALOG_PROVIDER', savedEnvironment.provider);
  restore('IGDB_OFFLINE_CATALOG', savedEnvironment.offline);
  restore('IGDB_CLIENT_ID', savedEnvironment.clientId);
  restore('IGDB_CLIENT_SECRET', savedEnvironment.clientSecret);
  globalThis.fetch = realFetch;
  upserts.length = 0;
  stored.clear();
});

function useIGDB(...games: Array<Record<string, unknown>>) {
  process.env.IGDB_CLIENT_ID = 'cliente';
  process.env.IGDB_CLIENT_SECRET = 'segredo';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'id.twitch.tv') return Response.json({ access_token: 'token', expires_in: 3600 });
    if (url.pathname === '/v4/games') return Response.json(games.length ? games : [IGDB_GAME_2026]);
    if (url.pathname === '/v4/game_time_to_beats') return Response.json([]);
    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;
}

test('under the RAWG catalog the GOTY search still stores its IGDB games by igdb_id', async () => {
  delete process.env.IGDB_OFFLINE_CATALOG;
  process.env.GAME_CATALOG_PROVIDER = 'rawg';
  useIGDB();
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=jogo'))).json();

  assert.deepEqual(upserts.map(call => call.onConflict), ['igdb_id']);
  const [row] = upserts[0].rows;
  assert.equal(row.igdb_id, 119171);
  assert.equal(Object.hasOwn(row, 'rawg_id'), false, JSON.stringify(row));
  // A rota casa o jogo da IGDB com a linha salva, então o item leva o id do banco.
  assert.equal(body.items[0].id, 'linha-119171');
});

test('under RAWG an IGDB game that lands on a RAWG row comes back once, with that row id', async () => {
  delete process.env.IGDB_OFFLINE_CATALOG;
  process.env.GAME_CATALOG_PROVIDER = 'rawg';
  useIGDB();
  // A listagem da RAWG já gravou o jogo: a linha tem rawg_id e nenhum igdb_id.
  stored.set('Jogo de 2026', { id: 'linha-rawg', title: 'Jogo de 2026', igdb_id: null, rawg_id: 58550, release_year: 2026, duration_hours: 30 });
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=jogo'))).json();

  assert.deepEqual(body.items.map((item: { id: string }) => item.id), ['linha-rawg']);
  assert.equal(body.items[0].igdb_id, 119171);
});

test('the placeholder an older row saved never becomes the description of a GOTY result', async () => {
  delete process.env.IGDB_OFFLINE_CATALOG;
  delete process.env.GAME_CATALOG_PROVIDER;
  // A IGDB não tem resumo deste jogo, e a linha dele guarda o placeholder antigo.
  useIGDB({ ...IGDB_GAME_2026, summary: undefined });
  stored.set('Jogo de 2026', { id: 'linha-119171', title: 'Jogo de 2026', igdb_id: 119171, release_year: 2026, description: 'Sem descrição disponível.' });
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=jogo'))).json();

  assert.equal(body.items[0].id, 'linha-119171');
  assert.equal(body.items[0].description, null);
});

// A IGDB fora do ar: a busca cai nas linhas locais e no catálogo curado.
function igdbDown() {
  delete process.env.IGDB_OFFLINE_CATALOG;
  delete process.env.GAME_CATALOG_PROVIDER;
  process.env.IGDB_CLIENT_ID = 'cliente';
  process.env.IGDB_CLIENT_SECRET = 'segredo';
  globalThis.fetch = (async () => new Response('fora do ar', { status: 503 })) as typeof fetch;
}

test('a local row with the old placeholder reaches the GOTY search without a description', async () => {
  igdbDown();
  stored.set('Jogo antigo', { id: 'linha-antiga', title: 'Jogo antigo', igdb_id: 8800, release_year: 2026, description: 'Sem descrição disponível.' });
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=jogo'))).json();

  const local = body.items.find((item: { id: string }) => item.id === 'linha-antiga');
  assert.ok(local, JSON.stringify(body.items));
  assert.equal(local.description, null);
});

test('a RAWG row of a curated game comes back once, as the stored row', async () => {
  igdbDown();
  // A listagem da RAWG gravou GTA VI sem igdb_id; o catálogo curado tem o mesmo jogo pelo igdb_id.
  stored.set('Grand Theft Auto VI', { id: 'linha-rawg-gta', title: 'Grand Theft Auto VI', igdb_id: null, rawg_id: 58550, release_year: 2026, description: 'Vice City.' });
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=grand%20theft'))).json();

  const gta = body.items.filter((item: { title: string }) => item.title === 'Grand Theft Auto VI');
  assert.deepEqual(gta.map((item: { id: string }) => item.id), ['linha-rawg-gta']);
});

// Um jogo da IGDB lançado na data dada, com capa.
function igdbGame(id: number, name: string, year: number) {
  const date = Math.floor(Date.UTC(year, 2, 24) / 1000);
  return { id, name, summary: `${name} de ${year}.`, cover: { image_id: `capa${id}` }, first_release_date: date, game_type: 0, release_dates: [{ date, y: year }] };
}

test('two games with one title from different years both come back when other years are included', async () => {
  delete process.env.IGDB_OFFLINE_CATALOG;
  delete process.env.GAME_CATALOG_PROVIDER;
  useIGDB(igdbGame(974, 'Resident Evil 4', 2005), igdbGame(132181, 'Resident Evil 4', 2023));
  // O de 2005 já tem a linha do título; o remake não cabe nela e volta só da IGDB.
  stored.set('Resident Evil 4', { id: 'linha-974', title: 'Resident Evil 4', igdb_id: 974, release_year: 2005 });
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=resident%20evil%204&includeAllYears=true'))).json();

  const residentEvil4 = body.items.filter((item: { title: string }) => item.title === 'Resident Evil 4');
  assert.deepEqual(residentEvil4.map((item: { igdb_id: number; release_year: number }) => [item.igdb_id, item.release_year]), [[974, 2005], [132181, 2023]]);
});

test('a curated game the IGDB dates in another year still comes back once, by its igdb_id', async () => {
  delete process.env.IGDB_OFFLINE_CATALOG;
  delete process.env.GAME_CATALOG_PROVIDER;
  // A IGDB adiou GTA VI para 2027; o catálogo curado ainda diz 2026.
  useIGDB(igdbGame(52189, 'Grand Theft Auto VI', 2027));
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=grand%20theft&includeAllYears=true'))).json();

  const gta = body.items.filter((item: { igdb_id: number }) => item.igdb_id === 52189);
  assert.deepEqual(gta.map((item: { id: string }) => item.id), ['linha-52189']);
});

test('a game without a year matches a same-title game of any year', async () => {
  igdbDown();
  // A linha local sem ano é o mesmo GTA VI do catálogo curado.
  stored.set('Grand Theft Auto VI', { id: 'linha-sem-ano', title: 'Grand Theft Auto VI', igdb_id: null, rawg_id: 58550, release_year: null });
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=grand%20theft&includeAllYears=true'))).json();

  const gta = body.items.filter((item: { title: string }) => item.title === 'Grand Theft Auto VI');
  assert.deepEqual(gta.map((item: { id: string }) => item.id), ['linha-sem-ano']);
});

test('two IGDB games with the same title stay apart even when one has no year', async () => {
  delete process.env.IGDB_OFFLINE_CATALOG;
  delete process.env.GAME_CATALOG_PROVIDER;
  const undated = { ...igdbGame(99001, 'Fable', 2026), first_release_date: undefined, release_dates: [] };
  useIGDB(igdbGame(99000, 'Fable', 2026), undated);
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=fable&includeAllYears=true'))).json();

  const fable = body.items.filter((item: { title: string }) => item.title === 'Fable');
  assert.deepEqual(fable.map((item: { igdb_id: number }) => item.igdb_id), [99000, 99001]);
});

test('an undated IGDB game listed first does not swallow the dated games of the same title', async () => {
  delete process.env.IGDB_OFFLINE_CATALOG;
  delete process.env.GAME_CATALOG_PROVIDER;
  const undated = { ...igdbGame(99001, 'Fable', 2026), first_release_date: undefined, release_dates: [] };
  useIGDB(undated, igdbGame(100, 'Fable', 2004), igdbGame(99000, 'Fable', 2026));
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=fable&includeAllYears=true'))).json();

  const fable = body.items.filter((item: { title: string }) => item.title === 'Fable');
  assert.deepEqual(fable.map((item: { igdb_id: number }) => item.igdb_id).sort((a: number, b: number) => a - b), [100, 99000, 99001]);
});

test('a curated game whose igdb_id disagrees with the IGDB still joins the IGDB game of its title and year', async () => {
  delete process.env.IGDB_OFFLINE_CATALOG;
  delete process.env.GAME_CATALOG_PROVIDER;
  // O curado guarda 325101; a IGDB conhece Forza Horizon 6 por 348330.
  useIGDB(igdbGame(348330, 'Forza Horizon 6', 2026));
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=forza%20horizon'))).json();

  const forza = body.items.filter((item: { title: string }) => item.title === 'Forza Horizon 6');
  assert.deepEqual(forza.map((item: { igdb_id: number }) => item.igdb_id), [348330]);
});

test('an IGDB game joins a same-title RAWG row of its year that has no igdb_id', async () => {
  delete process.env.IGDB_OFFLINE_CATALOG;
  delete process.env.GAME_CATALOG_PROVIDER;
  stored.set('Jogo de Teste', { id: 'linha-rawg', title: 'Jogo de Teste', igdb_id: null, rawg_id: 777, release_year: 2026 });
  useIGDB(igdbGame(99100, 'Jogo de Teste', 2026));
  const { GET } = await import('../../src/app/api/goty/search-games/route');

  const body = await (await GET(new Request('http://localhost/api/goty/search-games?q=jogo%20de%20teste'))).json();

  const games = body.items.filter((item: { title: string }) => item.title === 'Jogo de Teste');
  assert.equal(games.length, 1);
});
