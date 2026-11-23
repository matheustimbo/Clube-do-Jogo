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
// O que a rota de mídia já tinha gravado na linha antes da listagem passar por ela.
const STORED_DESCRIPTION = 'Descrição completa que a rota de mídia salvou.';
const STORED_TRAILER = 'https://www.youtube.com/watch?v=salvo';

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
  // Erro que o banco devolve a todo upsert, como o Postgres por trás do PostgREST.
  upsertError?: { code: string; message: string };
  // Linhas que outro pedido grava entre a consulta por título e o upsert deste.
  racedByTitle?: Map<string, StoredRow>;
};

// Imita o postgrest-js: num upsert em lote, `columns` é a união das chaves das
// linhas, e com defaultToNull (o padrão) a chave que falta numa linha vira NULL no
// ON CONFLICT DO UPDATE. Num objeto só, as colunas são as chaves dele.
// Devolve as linhas do lote fora de ordem, que é o que o PostgREST pode fazer:
// se a rota passar a depender da ordem do retorno, o teste pega.
function fakeSupabase(payloads: UpsertPayload[], options: FakeOptions = {}): SupabaseClient {
  const { calls, failFirstWith, roundTrips, existingByTitle = new Map(), missingColumns = [], updates, upsertError, racedByTitle } = options;
  // Cada pedido ao PostgREST é uma ida ao banco: upsert, select e update.
  const trip = () => { if (roundTrips) roundTrips.count += 1; };
  const race = () => racedByTitle?.forEach((row, title) => existingByTitle.set(title, row));
  // O ON CONFLICT na chave do catálogo atualiza a linha que já tem aquele id.
  const stored = (payload: UpsertPayload, columns: string[], key: string) => ({
    id: [...existingByTitle.values()].find(row => row[key] != null && row[key] === payload[key])?.id ?? `stored-${payload[key]}`,
    image_url: STORED_COVER,
    description: STORED_DESCRIPTION,
    trailer_url: STORED_TRAILER,
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
          trip();
          race();
          // O PostgREST de verdade (v12) responde assim a uma coluna que o schema não tem.
          const missing = [...columns, onConflict].find(column => missingColumns.includes(column));
          const missingError = missing ? { code: 'PGRST204', message: `Could not find the '${missing}' column of 'games' in the schema cache` } : null;
          // Coluna que falta é problema de schema, não de sorte: recusa toda vez que
          // ela chega, senão o teste do retorno ao schema antigo passa por acidente.
          const schemaError = failFirstWith && batch.some(one => Object.hasOwn(one, 'average_rating')) ? failFirstWith : null;
          const error = upsertError ?? missingError ?? schemaError ?? (batch.some(one => titleConflict(one, onConflict)) ? { code: '23505' } : null);
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
              maybeSingle: async () => {
                trip();
                return { data: existingByTitle.get(title) ?? null, error: null };
              },
            }),
            in: async (_column: string, titles: string[]) => {
              trip();
              return { data: titles.flatMap(title => (existingByTitle.has(title) ? [{ ...existingByTitle.get(title)! }] : [])), error: null };
            },
          };
        },
        update(metadata: UpsertPayload) {
          return {
            eq: (_column: string, id: string) => ({
              select: () => ({
                single: async () => {
                  trip();
                  updates?.push({ id, patch: metadata });
                  const existing = [...existingByTitle.values()].find(row => row.id === id);
                  if (existing) Object.assign(existing, metadata);
                  return { data: existing ? { ...existing } : null, error: null };
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
    genres: ['Aventura'],
    platforms: ['PC'],
    platform_ids: [6],
  });
});

test('a listing without description or trailer keeps the ones the media route saved', async () => {
  const payloads: UpsertPayload[] = [];
  const saved = await cacheCatalogGames(fakeSupabase(payloads), [catalogGame({ description: null, trailer_url: null })], 'rawg_id');
  assert.equal(Object.hasOwn(payloads[0], 'description'), false, JSON.stringify(payloads[0]));
  assert.equal(Object.hasOwn(payloads[0], 'trailer_url'), false, JSON.stringify(payloads[0]));
  assert.equal(saved[0].description, STORED_DESCRIPTION);
  assert.equal(saved[0].trailer_url, STORED_TRAILER);
});

test('a listing that brings a description and a trailer writes them', async () => {
  const payloads: UpsertPayload[] = [];
  const saved = await cacheCatalogGames(fakeSupabase(payloads), [catalogGame({ description: 'Nova.', trailer_url: 'https://www.youtube.com/watch?v=novo' })], 'igdb_id');
  assert.equal(saved[0].description, 'Nova.');
  assert.equal(saved[0].trailer_url, 'https://www.youtube.com/watch?v=novo');
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

function pageOf24(firstId: number) {
  return Array.from({ length: 24 }, (_, index) => catalogGame({
    id: firstId + index,
    title: `Jogo ${index}`,
    image_url: index % 2 === 0 ? `https://images.igdb.com/igdb/image/upload/t_cover_big/capa${index}.jpg` : null,
  }));
}

test('uma página inteira não vira uma ida ao banco por jogo', async () => {
  const roundTrips = { count: 0 };
  const saved = await cacheCatalogGames(fakeSupabase([], { roundTrips }), pageOf24(1000), 'igdb_id');
  assert.equal(saved.length, 24);
  // A consulta pelos títulos e um upsert por conjunto de campos (com e sem capa).
  assert.ok(roundTrips.count <= 3, `esperava no máximo 3 idas ao banco, foram ${roundTrips.count}`);
});

test('a RAWG page that hits rows other catalogs own still takes at most 3 round trips, every time', async () => {
  // Linhas que nunca mudam de dono: toda listagem da RAWG passa de novo por elas.
  const existingByTitle = new Map<string, StoredRow>([
    ['Jogo 3', { id: 'linha-igdb-3', igdb_id: 503, rawg_id: null, title: 'Jogo 3', release_year: 2022, image_url: STORED_COVER }],
    ['Jogo 10', { id: 'linha-igdb-10', igdb_id: 510, rawg_id: null, title: 'Jogo 10', release_year: 2022, image_url: STORED_COVER }],
    ['Jogo 17', { id: 'linha-igdb-17', igdb_id: 517, rawg_id: null, title: 'Jogo 17', release_year: 1999, image_url: STORED_COVER }],
  ]);
  for (const listing of [1, 2]) {
    const roundTrips = { count: 0 };
    const updates: Array<{ id: string; patch: UpsertPayload }> = [];
    const saved = await cacheCatalogGames(fakeSupabase([], { roundTrips, existingByTitle, updates }), pageOf24(5000), 'rawg_id');
    assert.ok(roundTrips.count <= 3, `listagem ${listing}: esperava no máximo 3 idas ao banco, foram ${roundTrips.count}`);
    assert.deepEqual(updates, []);
    // O Jogo 17 de 1999 é outro jogo: sai. Os outros dois ficam com a linha da IGDB, na ordem.
    const expected = Array.from({ length: 24 }, (_, index) => `Jogo ${index}`).filter(title => title !== 'Jogo 17');
    assert.deepEqual(saved.map(game => game.title), expected);
    assert.equal(saved[3].id, 'linha-igdb-3');
    assert.equal(saved[10].id, 'linha-igdb-10');
  }
});

test('a row no catalog owns is claimed once, and the next listing goes back to the batch', async () => {
  const existingByTitle = new Map<string, StoredRow>([
    ['Jogo 5', { id: 'linha-manual', igdb_id: null, rawg_id: null, title: 'Jogo 5', release_year: 2022, image_url: STORED_COVER }],
  ]);
  const trips: number[] = [];
  for (const listing of [1, 2]) {
    const roundTrips = { count: 0 };
    const saved = await cacheCatalogGames(fakeSupabase([], { roundTrips, existingByTitle }), pageOf24(6000), 'rawg_id');
    trips.push(roundTrips.count);
    assert.equal(saved.length, 24, `listagem ${listing}`);
    assert.equal(saved[5].id, 'linha-manual', `listagem ${listing}`);
  }
  assert.equal(existingByTitle.get('Jogo 5')!.rawg_id, 6005);
  // A primeira paga um update pela linha reivindicada; a segunda já acha a linha pelo rawg_id.
  assert.ok(trips[0] <= 4 && trips[1] <= 3, `idas ao banco por listagem: ${trips.join(', ')}`);
});

test('a same-title row another request writes between the lookup and the upsert still lands the game', async () => {
  const racedByTitle = new Map<string, StoredRow>([
    ['Jogo 2', { id: 'linha-da-corrida', igdb_id: 902, rawg_id: null, title: 'Jogo 2', release_year: 2022, image_url: STORED_COVER }],
  ]);
  const saved = await cacheCatalogGames(fakeSupabase([], { racedByTitle }), pageOf24(7000).slice(0, 4), 'rawg_id');
  assert.deepEqual(saved.map(game => game.title), ['Jogo 0', 'Jogo 1', 'Jogo 2', 'Jogo 3']);
  assert.equal(saved[2].id, 'linha-da-corrida');
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

test('a batch never mixes games that bring different fields', async () => {
  const calls: UpsertCall[] = [];
  const cover = 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg';
  const trailer = 'https://www.youtube.com/watch?v=novo';
  const saved = await cacheCatalogGames(fakeSupabase([], { calls }), [
    catalogGame({ id: 1, title: 'Tudo', image_url: cover, description: 'Descrição.', trailer_url: trailer }),
    catalogGame({ id: 2, title: 'Sem capa', image_url: null, description: 'Descrição.', trailer_url: trailer }),
    catalogGame({ id: 3, title: 'Sem descrição', image_url: cover, description: null, trailer_url: trailer }),
    catalogGame({ id: 4, title: 'Sem trailer', image_url: cover, description: 'Descrição.', trailer_url: null }),
    catalogGame({ id: 5, title: 'Também tudo', image_url: cover, description: 'Descrição.', trailer_url: trailer }),
  ], 'igdb_id');
  for (const call of calls) {
    const keySets = new Set(call.rows.map(row => Object.keys(row).sort().join(',')));
    assert.equal(keySets.size, 1, `um upsert misturou linhas com chaves diferentes: ${[...keySets].join(' | ')}`);
  }
  const byTitle = new Map(saved.map(game => [game.title, game]));
  assert.equal(byTitle.get('Sem capa')?.image_url, STORED_COVER);
  assert.equal(byTitle.get('Sem descrição')?.description, STORED_DESCRIPTION);
  assert.equal(byTitle.get('Sem trailer')?.trailer_url, STORED_TRAILER);
  assert.deepEqual(saved.map(game => game.title), ['Tudo', 'Sem capa', 'Sem descrição', 'Sem trailer', 'Também tudo']);
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

test('a same-title row from another year is another game: it keeps its ids and the game leaves the result', async () => {
  const updates: Array<{ id: string; patch: UpsertPayload }> = [];
  const original: StoredRow = { id: 'linha-1996', igdb_id: null, rawg_id: null, title: 'Resident Evil', release_year: 1996, image_url: STORED_COVER };
  const saved = await cacheCatalogGames(fakeSupabase([], { existingByTitle: new Map([['Resident Evil', original]]), updates }), [
    catalogGame({ id: 2002, title: 'Resident Evil', release_year: 2002 }),
  ], 'rawg_id');
  assert.deepEqual(updates, []);
  // Um filtro year=2002 não pode devolver o jogo de 1996.
  assert.deepEqual(saved, []);
});

test('a row another catalog owns from another year never stands in for the game', async () => {
  const doom1993: StoredRow = { id: 'linha-doom-1993', igdb_id: 673, rawg_id: null, title: 'Doom', release_year: 1993, image_url: STORED_COVER };
  const saved = await cacheCatalogGames(fakeSupabase([], { existingByTitle: new Map([['Doom', doom1993]]) }), [
    catalogGame({ id: 1, title: 'Antes', release_year: 2020 }),
    catalogGame({ id: 2454, title: 'Doom', release_year: 2016 }),
  ], 'rawg_id');
  assert.deepEqual(saved.map(game => game.title), ['Antes']);
});

test('a catalog game without a year never lands on a row that has one', async () => {
  const updates: Array<{ id: string; patch: UpsertPayload }> = [];
  const owned: StoredRow = { id: 'linha-igdb', igdb_id: 12517, rawg_id: null, title: 'Outer Wilds', release_year: 2019, image_url: STORED_COVER };
  const manual: StoredRow = { id: 'linha-manual', igdb_id: null, rawg_id: null, title: 'Celeste', release_year: 2018, image_url: STORED_COVER };
  const saved = await cacheCatalogGames(fakeSupabase([], { existingByTitle: new Map([['Outer Wilds', owned], ['Celeste', manual]]), updates }), [
    catalogGame({ id: 1, title: 'Antes', release_year: 2020 }),
    catalogGame({ id: 26192, title: 'Outer Wilds', release_year: null }),
    catalogGame({ id: 9600, title: 'Celeste', release_year: null }),
  ], 'rawg_id');
  assert.deepEqual(updates, []);
  assert.deepEqual(saved.map(game => game.title), ['Antes']);
});

test('a row without a year still takes a catalog game without one', async () => {
  const updates: Array<{ id: string; patch: UpsertPayload }> = [];
  const manual: StoredRow = { id: 'linha-manual', igdb_id: null, rawg_id: null, title: 'Celeste', release_year: null, image_url: STORED_COVER };
  const saved = await cacheCatalogGames(fakeSupabase([], { existingByTitle: new Map([['Celeste', manual]]), updates }), [
    catalogGame({ id: 9600, title: 'Celeste', release_year: null }),
  ], 'rawg_id');
  assert.deepEqual(updates.map(update => update.patch.rawg_id), [9600]);
  assert.deepEqual(saved.map(game => game.id), ['linha-manual']);
});

test('two games of one page that land on the same row come back once', async () => {
  const doom: StoredRow = { id: 'linha-doom', igdb_id: 673, rawg_id: null, title: 'Doom', release_year: null, image_url: STORED_COVER };
  const saved = await cacheCatalogGames(fakeSupabase([], { existingByTitle: new Map([['Doom', doom]]) }), [
    catalogGame({ id: 2454, title: 'Doom', release_year: 2016 }),
    catalogGame({ id: 1201, title: 'Doom', release_year: 1993 }),
  ], 'rawg_id');
  assert.deepEqual(saved.map(game => game.id), ['linha-doom']);
});

test('a same-title row claimed by one game of the page is not claimed again by the next', async () => {
  const updates: Array<{ id: string; patch: UpsertPayload }> = [];
  const manual: StoredRow = { id: 'linha-manual', igdb_id: null, rawg_id: null, title: 'Doom', release_year: null, image_url: STORED_COVER };
  const saved = await cacheCatalogGames(fakeSupabase([], { existingByTitle: new Map([['Doom', manual]]), updates }), [
    catalogGame({ id: 2454, title: 'Doom', release_year: 2016 }),
    catalogGame({ id: 1201, title: 'Doom', release_year: 1993 }),
  ], 'rawg_id');
  assert.deepEqual(updates.map(update => update.patch.rawg_id), [2454]);
  assert.deepEqual(saved.map(game => game.id), ['linha-manual']);
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

test('a database without the catalog column or its unique index fails with a schema error', async () => {
  const errors = [
    // Postgres: a coluna do ON CONFLICT não existe.
    { code: '42703', message: 'column "rawg_id" does not exist' },
    // Postgres: nenhuma unique serve ao ON CONFLICT (rawg_id).
    { code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' },
  ];
  for (const upsertError of errors) {
    const payloads: UpsertPayload[] = [];
    await assert.rejects(
      cacheCatalogGames(fakeSupabase(payloads, { upsertError }), [catalogGame({ id: 26192 })], 'rawg_id'),
      CatalogSchemaError,
      upsertError.code,
    );
    assert.ok(payloads.every(payload => !Object.hasOwn(payload, 'igdb_id')), JSON.stringify(payloads));
  }
});
