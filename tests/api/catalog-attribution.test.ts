import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchCatalogAttribution } from '../../src/lib/catalog-attribution';

const realFetch = globalThis.fetch;
let requested: string[] = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  requested = [];
});

function serverAnswering(body: unknown) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return Response.json(body);
  }) as typeof fetch;
}

test('the web asks the server which catalog to credit', async () => {
  serverAnswering({ attribution: { name: 'RAWG', url: 'https://rawg.io' } });
  assert.deepEqual(await fetchCatalogAttribution(false), { name: 'RAWG', url: 'https://rawg.io' });
  assert.deepEqual(requested, ['/api/catalog']);
});

test('the demo has no server, so the web never asks it for the credit', async () => {
  serverAnswering({ attribution: { name: 'RAWG', url: 'https://rawg.io' } });
  assert.equal(await fetchCatalogAttribution(true), null);
  assert.deepEqual(requested, []);
});
