import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { parseInList } from './fake-games-rest';

// Caminho real da rota de descoberta, do catálogo RAWG e do cache. Só a borda é falsa:
// o banco, que já tem um Doom de 1993 da IGDB, e a rede, que responde como a RAWG.
type Row = Record<string, unknown> & { id: string; title: string };
const stored = new Map<string, Row>([
  ['Doom', { id: 'linha-doom-1993', title: 'Doom', igdb_id: 673, rawg_id: null, release_year: 1993 }],
]);

const supabase = {
  from() {
    return {
      select: () => ({
        // O filtro in como o PostgREST lê; uma lista que ele não lê falha o teste.
        filter: async (_column: string, _operator: 'in', list: string) => ({ data: parseInList(list)!.flatMap(title => (stored.has(title) ? [stored.get(title)!] : [])), error: null }),
        eq: (_column: string, title: string) => ({ maybeSingle: async () => ({ data: stored.get(title) ?? null, error: null }) }),
      }),
      upsert(payload: Array<Record<string, unknown>> | Record<string, unknown>, { onConflict }: { onConflict: string }) {
        const rows = Array.isArray(payload) ? payload : [payload];
        const clash = rows.some(row => stored.has(String(row.title)) && stored.get(String(row.title))![onConflict] !== row[onConflict]);
        const error = clash ? { code: '23505', message: 'duplicate key value violates unique constraint "games_title_key"' } : null;
        const saved = rows.map(row => ({ id: `linha-${String(row[onConflict])}`, ...row }));
        const result = error ? { data: null, error } : { data: saved, error: null };
        return { select: () => Object.assign(Promise.resolve(result), { single: async () => (error ? result : { data: saved[0], error: null }) }) };
      },
    };
  },
};

mock.module('../../src/lib/supabase/server', {
  exports: { createRequestContext: async () => ({ supabase, userId: 'membro' }) },
});

const savedEnvironment = { provider: process.env.GAME_CATALOG_PROVIDER, offline: process.env.IGDB_OFFLINE_CATALOG, key: process.env.RAWG_API_KEY };
const realFetch = globalThis.fetch;
delete process.env.IGDB_OFFLINE_CATALOG;
process.env.GAME_CATALOG_PROVIDER = 'rawg';
process.env.RAWG_API_KEY = 'chave-de-teste';
// Três páginas de 24 na RAWG. A primeira traz o Doom de 2016, que o cache tira da
// resposta porque a linha "Doom" é o de 1993.
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  const page = Number(url.searchParams.get('page'));
  const size = Number(url.searchParams.get('page_size'));
  const results = Array.from({ length: size }, (_, index) => {
    const id = page * 1000 + index;
    return { id, name: page === 1 && index === 5 ? 'Doom' : `Jogo ${id}`, released: '2016-05-13', background_image: `https://media.rawg.io/${id}.jpg` };
  });
  return Response.json({ results, next: page < 3 ? 'mais' : null });
}) as typeof fetch;

after(() => {
  globalThis.fetch = realFetch;
  for (const [variable, value] of [['GAME_CATALOG_PROVIDER', savedEnvironment.provider], ['IGDB_OFFLINE_CATALOG', savedEnvironment.offline], ['RAWG_API_KEY', savedEnvironment.key]] as const) {
    if (value === undefined) delete process.env[variable];
    else process.env[variable] = value;
  }
});

type DiscoverBody = { items: Array<{ game: { id: string } }>; hasMore: boolean; nextOffset: number };

async function discover(offset: number): Promise<DiscoverBody> {
  const { GET } = await import('../../src/app/api/discover/route');
  return (await GET(new Request(`http://localhost/api/discover?source=popular&limit=24&offset=${offset}`))).json();
}

test('a page the cache shortened hands out a cursor past everything the catalog sent', async () => {
  const first = await discover(0);
  assert.equal(first.items.length, 23);
  assert.equal(first.nextOffset, 24);
  assert.equal(first.hasMore, true);
});

test('following the cursor, the second page repeats no game of the first', async () => {
  const first = await discover(0);
  const second = await discover(first.nextOffset);
  const firstIds = new Set(first.items.map(item => item.game.id));
  const repeated = second.items.map(item => item.game.id).filter(id => firstIds.has(id));
  assert.deepEqual(repeated, []);
  assert.equal(second.items.length, 24);
  assert.equal(second.nextOffset, 48);
});

test('the web joins the pages with each game once', async () => {
  const { uniqueDiscoverItems } = await import('@clube-do-jogo/domain');
  const first = await discover(0);
  // Uma página que volta com um jogo já mostrado, como num catálogo que reordena.
  const joined = uniqueDiscoverItems([...first.items, ...first.items.slice(0, 2)] as Parameters<typeof uniqueDiscoverItems>[0]);
  assert.deepEqual(joined.map(entry => entry.game.id), first.items.map(entry => entry.game.id));
});
