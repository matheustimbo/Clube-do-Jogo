import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDataClient, type ApiTransport } from '@clube-do-jogo/data';

function serverAnswering(body: unknown, status = 200) {
  const paths: string[] = [];
  const api: ApiTransport = {
    async request(path: string) {
      paths.push(path);
      return Response.json(body, { status });
    },
  };
  return { client: createDataClient({ api }), paths };
}

test('the app learns which catalog to credit from the server', async () => {
  const { client, paths } = serverAnswering({ attribution: { name: 'RAWG', url: 'https://rawg.io' } });
  assert.deepEqual(await client.readCatalogAttribution(false), { name: 'RAWG', url: 'https://rawg.io' });
  assert.deepEqual(paths, ['/api/catalog']);
});

test('a catalog that needs no credit renders nothing', async () => {
  const { client } = serverAnswering({ attribution: null });
  assert.equal(await client.readCatalogAttribution(false), null);
});

test('the demo has no server and no catalog to credit', async () => {
  const { client, paths } = serverAnswering({ attribution: { name: 'RAWG', url: 'https://rawg.io' } });
  assert.equal(await client.readCatalogAttribution(true), null);
  assert.deepEqual(paths, []);
});

test('a link that is not https never becomes a tappable credit', async () => {
  for (const url of ['javascript:alert(1)', 'http://rawg.io', 'rawg.io', 42]) {
    const { client } = serverAnswering({ attribution: { name: 'RAWG', url } });
    assert.equal(await client.readCatalogAttribution(false), null, String(url));
  }
});
