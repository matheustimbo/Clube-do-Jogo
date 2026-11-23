import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cacheCatalogGames } from '../../src/lib/game-cache';
import { CatalogSchemaError, type CatalogGame } from '../../src/lib/game-catalog';

type UpsertPayload = Record<string, unknown>;
type StoredRow = UpsertPayload & { id: string };
type UpsertCall = { rows: UpsertPayload[]; columns: string[]; onConflict: string };

function catalogGame(overrides: Partial<CatalogGame> = {}): CatalogGame {
  return {
    id: 1942,
    title: 'Tunic',
    duration_hours: 12,
    average_rating: 84,
    release_year: 2022,
    image_url: null,
    description: 'Uma raposinha explora um mundo cheio de segredos.',
    screenshot_urls: ['https://images.igdb.com/shot-1.jpg'],
    trailer_url: null,
    genres: ['Aventura'],
    platforms: ['PC'],
    platform_ids: [6],
    ...overrides,
  };
}

const STORED_COVER = 'https://images.igdb.com/igdb/image/upload/t_cover_big/stored.jpg';

type FakeOptions = {
  calls?: UpsertCall[];
  failFirstWith?: { code: string };
  roundTrips?: { count: number };
  // Linhas que já estão no banco, por título. Upsert de um jogo com esse título e
  // outra chave de catálogo bate na unique de título (23505), como no banco de verdade.
  existingByTitle?: Map<string, StoredRow>;
  // Colunas que o banco ainda não tem, como rawg_id antes da migration.
  missingColumns?: string[];
  // Cada update que o cache manda para uma linha que já existia.
  updates?: Array<{ id: string; patch: UpsertPayload }>;
};

// Imita o postgrest-js: num upsert em lote, `columns` é a união das chaves das
// linhas, e com defaultToNull (o padrão) a chave que falta numa linha vira NULL no
// ON CONFLICT DO UPDATE. Num objeto só, as colunas são as chaves dele.
// Devolve as linhas do lote fora de ordem, que é o que o PostgREST pode fazer:
// se a rota passar a depender da ordem do retorno, o teste pega.
function fakeSupabase(payloads: UpsertPayload[], options: FakeOptions = {}): SupabaseClient {
  const { calls, failFirstWith, roundTrips, existingByTitle = new Map(), missingColumns = [], updates } = options;
  const stored = (payload: UpsertPayload, columns: string[], key: string) => ({
    id: `stored-${payload[key]}`,
    image_url: STORED_COVER,
    ...Object.fromEntries(columns.map(column => [column, Object.hasOwn(payload, column) ? payload[column] : null])),
  });
  const titleConflict = (payload: UpsertPayload, key: string) => {
    const existing = existingByTitle.get(String(payload.title));
    return Boolean(existing && existing[key] !== payload[key]);
  };
  const client = {
    from() {
      return {
        upsert(payload: UpsertPayload | UpsertPayload[], { onConflict = 'id' }: { onConflict?: string } = {}) {
          const batch = Array.isArray(payload) ? payload : [payload];
          const columns = [...new Set(batch.flatMap(one => Object.keys(one)))];
          batch.forEach(one => payloads.push(one));
          calls?.push({ rows: batch, columns, onConflict });
          if (roundTrips) roundTrips.count += 1;
          // O PostgREST de verdade (v12) responde assim a uma coluna que o schema não tem.
          const missing = [...columns, onConflict].find(column => missingColumns.includes(column));
          const missingError = missing ? { code: 'PGRST204', message: `Could not find the '${missing}' column of 'games' in the schema cache` } : null;
          // Coluna que falta é problema de schema, não de sorte: recusa toda vez que
          // ela chega, senão o teste do retorno ao schema antigo passa por acidente.
          const schemaError = failFirstWith && batch.some(one => Object.hasOwn(one, 'average_rating')) ? failFirstWith : null;
          const error = missingError ?? schemaError ?? (batch.some(one => titleConflict(one, onConflict)) ? { code: '23505' } : null);
          const rows = batch.map(one => stored(one, columns, onConflict)).reverse();
          return {
            select: () => Object.assign(
              Promise.resolve(error ? { data: null, error } : { data: rows, error: null }),
              { single: async () => (error ? { data: null, error } : { data: rows[0], error: null }) },
            ),
          };
        },
        select() {
          return {
            eq: (_column: string, title: string) => ({
              maybeSingle: async () => ({ data: existingByTitle.get(title) ?? null, error: null }),
            }),
          };
        },
        update(metadata: UpsertPayload) {
          return {
            eq: (_column: string, id: string) => ({
              select: () => ({
                single: async () => {
                  updates?.push({ id, patch: metadata });
                  const existing = [...existingByTitle.values()].find(row => row.id === id);
                  return { data: existing ? { ...existing, ...metadata } : null, error: null };
                },
              }),
            }),
          };
        },
      };
    },
  };
  return client as unknown as SupabaseClient;
}

test('a game with no art is upserted without an image_url key at all', async () => {
  const payloads: UpsertPayload[] = [];
  await cacheCatalogGames(fakeSupabase(payloads), [catalogGame({ image_url: null })], 'igdb_id');
  assert.equal(payloads.length, 1);
  assert.equal(Object.hasOwn(payloads[0], 'image_url'), false);
  assert.deepEqual(payloads[0], {
    igdb_id: 1942,
    title: 'Tunic',
    duration_hours: 12,
    average_rating: 84,
    release_year: 2022,
    description: 'Uma raposinha explora um mundo cheio de segredos.',
    screenshot_urls: ['https://images.igdb.com/shot-1.jpg'],
    trailer_url: null,
    genres: ['Aventura'],
    platforms: ['PC'],
    platform_ids: [6],
  });
});

test('an empty cover string counts as no art', async () => {
  const payloads: UpsertPayload[] = [];
  await cacheCatalogGames(fakeSupabase(payloads), [catalogGame({ image_url: '' })], 'igdb_id');
  assert.equal(Object.hasOwn(payloads[0], 'image_url'), false);
});

test('a game with art is upserted with exactly that url', async () => {
  const payloads: UpsertPayload[] = [];
  await cacheCatalogGames(fakeSupabase(payloads), [
    catalogGame({ image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg' }),
  ], 'igdb_id');
  assert.equal(payloads[0].image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg');
});

test('the legacy-column retry keeps the same cover decision', async () => {
  const withoutArt: UpsertPayload[] = [];
  await cacheCatalogGames(fakeSupabase(withoutArt, { failFirstWith: { code: 'PGRST204' } }), [catalogGame({ image_url: null })], 'igdb_id');
  assert.deepEqual(Object.keys(withoutArt.at(-1)!), ['igdb_id', 'title', 'duration_hours', 'description']);

  const withArt: UpsertPayload[] = [];
  await cacheCatalogGames(fakeSupabase(withArt, { failFirstWith: { code: 'PGRST204' } }), [
    catalogGame({ image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg' }),
  ], 'igdb_id');
  assert.deepEqual(Object.keys(withArt.at(-1)!), ['igdb_id', 'title', 'duration_hours', 'image_url', 'description']);
  assert.equal(withArt.at(-1)!.image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg');
});

test('a capa já gravada sobrevive e é o que a rota devolve ao cliente', async () => {
  const payloads: UpsertPayload[] = [];
  const saved = await cacheCatalogGames(fakeSupabase(payloads), [catalogGame({ image_url: null })], 'igdb_id');
  assert.equal(saved[0].image_url, STORED_COVER);
});

test('capa nova da IGDB substitui a que estava lá', async () => {
  const payloads: UpsertPayload[] = [];
  const saved = await cacheCatalogGames(fakeSupabase(payloads), [catalogGame({ image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/nova.jpg' })], 'igdb_id');
  assert.equal(saved[0].image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/nova.jpg');
});

test('uma página inteira não vira uma ida ao banco por jogo', async () => {
  const roundTrips = { count: 0 };
  const page = Array.from({ length: 24 }, (_, index) => catalogGame({
    id: 1000 + index,
    title: `Jogo ${index}`,
    image_url: index % 2 === 0 ? `https://images.igdb.com/igdb/image/upload/t_cover_big/capa${index}.jpg` : null,
  }));
  const saved = await cacheCatalogGames(fakeSupabase([], { roundTrips }), page, 'igdb_id');
  assert.equal(saved.length, 24);
  assert.ok(roundTrips.count <= 2, `esperava no máximo 2 idas ao banco, foram ${roundTrips.count}`);
});

test('a ordem que a IGDB devolveu é a ordem que o cliente recebe', async () => {
  const page = Array.from({ length: 6 }, (_, index) => catalogGame({ id: 2000 + index, title: `Jogo ${index}` }));
  const saved = await cacheCatalogGames(fakeSupabase([]), page, 'igdb_id');
  assert.deepEqual(saved.map(game => game.title), ['Jogo 0', 'Jogo 1', 'Jogo 2', 'Jogo 3', 'Jogo 4', 'Jogo 5']);
});

test('capas intercaladas voltam na ordem da IGDB, não na ordem dos lotes', async () => {
  const cover = 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg';
  const page = Array.from({ length: 4 }, (_, index) => catalogGame({ id: 3000 + index, title: `Jogo ${index}`, image_url: index % 2 ? null : cover }));
  const saved = await cacheCatalogGames(fakeSupabase([]), page, 'igdb_id');
  assert.deepEqual(saved.map(game => game.title), ['Jogo 0', 'Jogo 1', 'Jogo 2', 'Jogo 3']);
});

test('jogo com capa e jogo sem capa não viajam no mesmo lote', async () => {
  const calls: UpsertCall[] = [];
  const saved = await cacheCatalogGames(fakeSupabase([], { calls }), [
    catalogGame({ id: 1, title: 'Com capa', image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg' }),
    catalogGame({ id: 2, title: 'Sem capa', image_url: null }),
  ], 'igdb_id');
  for (const call of calls) {
    const withCover = call.rows.filter(row => Object.hasOwn(row, 'image_url')).length;
    assert.ok(withCover === 0 || withCover === call.rows.length, `um upsert misturou linhas com e sem image_url: ${JSON.stringify(call.columns)}`);
  }
  assert.equal(saved.find(game => game.title === 'Sem capa')?.image_url, STORED_COVER);
});

test('jogo que cai na linha de mesmo título com outro igdb_id continua no resultado, na ordem', async () => {
  const existing: StoredRow = { id: 'stored-legado', igdb_id: 777, title: 'Celeste', image_url: STORED_COVER };
  const saved = await cacheCatalogGames(fakeSupabase([], { existingByTitle: new Map([['Celeste', existing]]) }), [
    catalogGame({ id: 10, title: 'Antes' }),
    catalogGame({ id: 11, title: 'Celeste' }),
    catalogGame({ id: 12, title: 'Depois' }),
  ], 'igdb_id');
  assert.deepEqual(saved.map(game => game.title), ['Antes', 'Celeste', 'Depois']);
  assert.equal(saved[1].id, 'stored-legado');
});

test('games from RAWG are upserted by rawg_id and no RAWG id lands in igdb_id', async () => {
  const calls: UpsertCall[] = [];
  const saved = await cacheCatalogGames(fakeSupabase([], { calls }), [
    catalogGame({ id: 26192, title: 'Tunic', image_url: 'https://media.rawg.io/media/games/tunic.jpg' }),
    catalogGame({ id: 3328, title: 'The Witcher 3', image_url: null }),
  ], 'rawg_id');
  assert.deepEqual(calls.map(call => call.onConflict), ['rawg_id', 'rawg_id']);
  const rows = calls.flatMap(call => call.rows);
  assert.deepEqual(rows.map(row => row.rawg_id).sort(), [26192, 3328]);
  assert.ok(rows.every(row => !Object.hasOwn(row, 'igdb_id')), JSON.stringify(rows));
  assert.deepEqual(saved.map(game => game.title), ['Tunic', 'The Witcher 3']);
});

test('games from IGDB never name rawg_id, so they cache before the migration', async () => {
  const calls: UpsertCall[] = [];
  const saved = await cacheCatalogGames(fakeSupabase([], { calls, missingColumns: ['rawg_id'] }), [catalogGame({ id: 26192 })], 'igdb_id');
  assert.deepEqual(calls.map(call => call.onConflict), ['igdb_id']);
  assert.equal(calls[0].rows[0].igdb_id, 26192);
  assert.equal(Object.hasOwn(calls[0].rows[0], 'rawg_id'), false);
  assert.equal(saved.length, 1);
});

test('RAWG without the rawg_id column fails with a schema error and writes no igdb_id', async () => {
  const payloads: UpsertPayload[] = [];
  await assert.rejects(
    cacheCatalogGames(fakeSupabase(payloads, { missingColumns: ['rawg_id'] }), [catalogGame({ id: 26192 })], 'rawg_id'),
    CatalogSchemaError,
  );
  assert.ok(payloads.every(payload => !Object.hasOwn(payload, 'igdb_id')), JSON.stringify(payloads));
});

test('a RAWG game never takes over the IGDB row that owns its title', async () => {
  const updates: Array<{ id: string; patch: UpsertPayload }> = [];
  const owner: StoredRow = { id: 'linha-igdb', igdb_id: 12517, rawg_id: null, title: 'Outer Wilds', release_year: 2019, image_url: STORED_COVER };
  const saved = await cacheCatalogGames(fakeSupabase([], { existingByTitle: new Map([['Outer Wilds', owner]]), updates }), [
    catalogGame({ id: 26192, title: 'Outer Wilds', release_year: 2019 }),
  ], 'rawg_id');
  assert.deepEqual(updates, []);
  assert.equal(saved[0].id, 'linha-igdb');
});

test('a RAWG game claims a same-title row no catalog owns when the release year agrees', async () => {
  const updates: Array<{ id: string; patch: UpsertPayload }> = [];
  const manual: StoredRow = { id: 'linha-manual', igdb_id: null, rawg_id: null, title: 'Celeste', release_year: 2018, average_rating: null, image_url: STORED_COVER };
  const saved = await cacheCatalogGames(fakeSupabase([], { existingByTitle: new Map([['Celeste', manual]]), updates }), [
    catalogGame({ id: 9600, title: 'Celeste', release_year: 2018, average_rating: 88 }),
  ], 'rawg_id');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'linha-manual');
  assert.equal(updates[0].patch.rawg_id, 9600);
  assert.equal(updates[0].patch.average_rating, 88);
  assert.equal(Object.hasOwn(updates[0].patch, 'igdb_id'), false);
  assert.equal(saved[0].id, 'linha-manual');
});

test('a same-title row from another year is another game and keeps its ids', async () => {
  const updates: Array<{ id: string; patch: UpsertPayload }> = [];
  const original: StoredRow = { id: 'linha-1996', igdb_id: null, rawg_id: null, title: 'Resident Evil', release_year: 1996, image_url: STORED_COVER };
  await cacheCatalogGames(fakeSupabase([], { existingByTitle: new Map([['Resident Evil', original]]), updates }), [
    catalogGame({ id: 2002, title: 'Resident Evil', release_year: 2002 }),
  ], 'rawg_id');
  assert.deepEqual(updates, []);
});

test('an IGDB game still gives a same-title row no catalog owns its igdb_id', async () => {
  const updates: Array<{ id: string; patch: UpsertPayload }> = [];
  const manual: StoredRow = { id: 'linha-manual', igdb_id: null, title: 'Celeste', release_year: null, image_url: STORED_COVER };
  await cacheCatalogGames(fakeSupabase([], { existingByTitle: new Map([['Celeste', manual]]), updates }), [
    catalogGame({ id: 26226, title: 'Celeste', release_year: 2018 }),
  ], 'igdb_id');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.igdb_id, 26226);
  assert.equal(Object.hasOwn(updates[0].patch, 'rawg_id'), false);
});
