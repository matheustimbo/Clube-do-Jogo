import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// Caminho real da rota de descoberta. Só o banco é falso: as fontes friends e ranking
// filtram no servidor as linhas que ele devolve.
type Row = { created_at: string; user_id: string; games: Record<string, unknown> };
let rows: Row[] = [];

function chain(result: { data: unknown; error: null }) {
  const query = {
    neq: () => query,
    order: () => query,
    limit: () => query,
    eq: () => query,
    in: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

const supabase = {
  from(table: string) {
    return {
      select: () => chain({ data: table === 'backlogs' || table === 'votes' ? rows : [], error: null }),
    };
  },
};

mock.module('../../src/lib/supabase/server', {
  exports: { createRequestContext: async () => ({ supabase, userId: 'membro' }) },
});

const discoverRoute = import('../../src/app/api/discover/route');

// Os nomes que cada catálogo grava em games.genres para os gêneros do filtro.
// IGDB: os nomes da fixture offline e da API. RAWG: a lista de gêneros do rawg.io.
const GENRES: Array<[id: number, igdb: string, rawg: string]> = [
  [12, 'Role-playing (RPG)', 'RPG'],
  [31, 'Adventure', 'Adventure'],
  [32, 'Indie', 'Indie'],
  [8, 'Platform', 'Platformer'],
  [9, 'Puzzle', 'Puzzle'],
  [15, 'Strategy', 'Strategy'],
  [5, 'Shooter', 'Shooter'],
];

function row(id: string, genres: string[]): Row {
  return { created_at: '2026-11-23T12:00:00Z', user_id: 'amigo', games: { id, title: id, genres, platforms: [], platform_ids: [] } };
}

async function discover(source: string, genre: number) {
  const { GET } = await discoverRoute;
  const body = await (await GET(new Request(`http://localhost/api/discover?source=${source}&genre=${genre}`))).json();
  return (body.items as Array<{ game: { id: string } }>).map(item => item.game.id).sort();
}

for (const source of ['friends', 'ranking']) {
  test(`the ${source} filter finds each genre under the names of both catalogs`, async () => {
    for (const [id, igdb, rawg] of GENRES) {
      rows = [row('da-igdb', [igdb]), row('da-rawg', [rawg]), row('outro', ['Simulator'])];
      assert.deepEqual(await discover(source, id), ['da-igdb', 'da-rawg'], `gênero ${id} (${igdb} / ${rawg})`);
    }
  });
}
