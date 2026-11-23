import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDataClient, type ApiTransport } from '@clube-do-jogo/data';

// O app pede a página seguinte no cursor que o servidor manda, não pela conta das
// páginas: o cache pode tirar jogos de uma página do catálogo.
function serverAnswering(body: unknown) {
  const paths: string[] = [];
  const api: ApiTransport = {
    async request(path: string) {
      paths.push(path);
      return Response.json(body);
    },
  };
  return { client: createDataClient({ api }), paths };
}

const item = (id: string) => ({ game: { id, title: id, duration_hours: 10 } });
const query = { userId: 'membro', isDemo: false, source: 'popular' as const, limit: 24 };

test('a page the cache shortened keeps the cursor the server gave', async () => {
  const items = Array.from({ length: 23 }, (_, index) => item(`jogo-${index}`));
  const { client, paths } = serverAnswering({ items, hasMore: true, nextOffset: 48 });
  const page = await client.readDiscoveryPage({ ...query, offset: 24 });
  assert.equal(page.items.length, 23);
  assert.equal(page.nextOffset, 48);
  assert.match(paths[0], /offset=24/);
});

test('a server without the cursor moves one full page, as the app did before', async () => {
  const { client } = serverAnswering({ items: [item('a')], hasMore: true });
  assert.equal((await client.readDiscoveryPage({ ...query, offset: 24 })).nextOffset, 48);
});

test('a cursor that does not move forward is ignored', async () => {
  const { client } = serverAnswering({ items: [item('a')], hasMore: true, nextOffset: 24 });
  assert.equal((await client.readDiscoveryPage({ ...query, offset: 24 })).nextOffset, 48);
});

test('the demo cursor counts the games it handed out', async () => {
  const { client } = serverAnswering({});
  const page = await client.readDiscoveryPage({ ...query, isDemo: true, offset: 0, limit: 2 });
  assert.equal(page.nextOffset, page.items.length);
});
