import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cacheIGDBGames } from '../../src/lib/game-cache';
import type { IGDBGameResult } from '../../src/lib/igdb';

type UpsertPayload = Record<string, unknown>;

function igdbGame(overrides: Partial<IGDBGameResult> = {}): IGDBGameResult {
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

// Devolve as linhas do lote fora de ordem, que é o que o PostgREST pode fazer:
// se a rota passar a depender da ordem do retorno, o teste pega.
function fakeSupabase(payloads: UpsertPayload[], failFirstWith?: { code: string }, roundTrips?: { count: number }): SupabaseClient {
  const stored = (payload: UpsertPayload) => ({ id: `stored-${payload.igdb_id}`, image_url: STORED_COVER, ...payload });
  const client = {
    from() {
      return {
        upsert(payload: UpsertPayload | UpsertPayload[]) {
          const batch = Array.isArray(payload) ? payload : [payload];
          batch.forEach(one => payloads.push(one));
          if (roundTrips) roundTrips.count += 1;
          // Coluna que falta é problema de schema, não de sorte: recusa toda vez que
          // ela chega, senão o teste do retorno ao schema antigo passa por acidente.
          const error = failFirstWith && batch.some(one => Object.hasOwn(one, 'average_rating')) ? failFirstWith : null;
          const rows = batch.map(stored).reverse();
          return {
            select: () => Object.assign(
              Promise.resolve(error ? { data: null, error } : { data: rows, error: null }),
              { single: async () => (error ? { data: null, error } : { data: rows[0], error: null }) },
            ),
          };
        },
      };
    },
  };
  return client as unknown as SupabaseClient;
}

test('a game with no art is upserted without an image_url key at all', async () => {
  const payloads: UpsertPayload[] = [];
  await cacheIGDBGames(fakeSupabase(payloads), [igdbGame({ image_url: null })]);
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
  await cacheIGDBGames(fakeSupabase(payloads), [igdbGame({ image_url: '' })]);
  assert.equal(Object.hasOwn(payloads[0], 'image_url'), false);
});

test('a game with art is upserted with exactly that url', async () => {
  const payloads: UpsertPayload[] = [];
  await cacheIGDBGames(fakeSupabase(payloads), [
    igdbGame({ image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg' }),
  ]);
  assert.equal(payloads[0].image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg');
});

test('the legacy-column retry keeps the same cover decision', async () => {
  const withoutArt: UpsertPayload[] = [];
  await cacheIGDBGames(fakeSupabase(withoutArt, { code: 'PGRST204' }), [igdbGame({ image_url: null })]);
  assert.deepEqual(Object.keys(withoutArt.at(-1)!), ['igdb_id', 'title', 'duration_hours', 'description']);

  const withArt: UpsertPayload[] = [];
  await cacheIGDBGames(fakeSupabase(withArt, { code: 'PGRST204' }), [
    igdbGame({ image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg' }),
  ]);
  assert.deepEqual(Object.keys(withArt.at(-1)!), ['igdb_id', 'title', 'duration_hours', 'image_url', 'description']);
  assert.equal(withArt.at(-1)!.image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg');
});

test('a capa já gravada sobrevive e é o que a rota devolve ao cliente', async () => {
  const payloads: UpsertPayload[] = [];
  const saved = await cacheIGDBGames(fakeSupabase(payloads), [igdbGame({ image_url: null })]);
  assert.equal(saved[0].image_url, STORED_COVER);
});

test('capa nova da IGDB substitui a que estava lá', async () => {
  const payloads: UpsertPayload[] = [];
  const saved = await cacheIGDBGames(fakeSupabase(payloads), [igdbGame({ image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/nova.jpg' })]);
  assert.equal(saved[0].image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/nova.jpg');
});

test('uma página inteira não vira uma ida ao banco por jogo', async () => {
  const roundTrips = { count: 0 };
  const page = Array.from({ length: 24 }, (_, index) => igdbGame({
    id: 1000 + index,
    title: `Jogo ${index}`,
    image_url: index % 2 === 0 ? `https://images.igdb.com/igdb/image/upload/t_cover_big/capa${index}.jpg` : null,
  }));
  const saved = await cacheIGDBGames(fakeSupabase([], undefined, roundTrips), page);
  assert.equal(saved.length, 24);
  assert.ok(roundTrips.count <= 2, `esperava no máximo 2 idas ao banco, foram ${roundTrips.count}`);
});

test('a ordem que a IGDB devolveu é a ordem que o cliente recebe', async () => {
  const page = Array.from({ length: 6 }, (_, index) => igdbGame({ id: 2000 + index, title: `Jogo ${index}` }));
  const saved = await cacheIGDBGames(fakeSupabase([]), page);
  assert.deepEqual(saved.map(game => game.title), ['Jogo 0', 'Jogo 1', 'Jogo 2', 'Jogo 3', 'Jogo 4', 'Jogo 5']);
});

test('jogo com capa e jogo sem capa não viajam no mesmo lote', async () => {
  const payloads: UpsertPayload[] = [];
  await cacheIGDBGames(fakeSupabase(payloads), [
    igdbGame({ id: 1, title: 'Com capa', image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg' }),
    igdbGame({ id: 2, title: 'Sem capa', image_url: null }),
  ]);
  const semCapa = payloads.find(payload => payload.title === 'Sem capa');
  assert.equal(Object.hasOwn(semCapa!, 'image_url'), false);
});
