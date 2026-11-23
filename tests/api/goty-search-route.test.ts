import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

// Caminho real da rota GOTY e do cache. Só a borda é falsa: o banco, que grava cada
// upsert, e a rede, que responde como a Twitch e a IGDB.
type Upsert = { rows: Array<Record<string, unknown>>; onConflict: string };
const upserts: Upsert[] = [];

const localQuery = {
  // O cache consulta os títulos antes do upsert; o banco deste teste não tem nenhum.
  in: async () => ({ data: [], error: null }),
  limit: () => localQuery,
  ilike: () => localQuery,
  eq: () => localQuery,
  order: async () => ({ data: [], error: null }),
};

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'membro' } }, error: null }) },
  from() {
    return {
      upsert(payload: Record<string, unknown> | Array<Record<string, unknown>>, { onConflict }: { onConflict: string }) {
        const rows = Array.isArray(payload) ? payload : [payload];
        upserts.push({ rows, onConflict });
        const saved = rows.map(row => ({ id: `linha-${String(row[onConflict])}`, ...row }));
        return { select: async () => ({ data: saved, error: null }) };
      },
      select: () => localQuery,
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
});

function useIGDB() {
  process.env.IGDB_CLIENT_ID = 'cliente';
  process.env.IGDB_CLIENT_SECRET = 'segredo';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'id.twitch.tv') return Response.json({ access_token: 'token', expires_in: 3600 });
    if (url.pathname === '/v4/games') return Response.json([IGDB_GAME_2026]);
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
