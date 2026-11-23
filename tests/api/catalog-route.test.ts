import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import * as nextServer from 'next/server';

// connection() só existe dentro de um pedido do Next. Fora dele, contar as chamadas
// basta para saber que a rota pediu para ser lida no pedido e não no build.
let connections = 0;
mock.module('next/server', {
  exports: { ...nextServer, connection: async () => { connections += 1; } },
});

const savedEnvironment = { provider: process.env.GAME_CATALOG_PROVIDER, offline: process.env.IGDB_OFFLINE_CATALOG };
afterEach(() => {
  if (savedEnvironment.provider === undefined) delete process.env.GAME_CATALOG_PROVIDER;
  else process.env.GAME_CATALOG_PROVIDER = savedEnvironment.provider;
  if (savedEnvironment.offline === undefined) delete process.env.IGDB_OFFLINE_CATALOG;
  else process.env.IGDB_OFFLINE_CATALOG = savedEnvironment.offline;
});

async function attribution() {
  const { GET } = await import('../../src/app/api/catalog/route');
  return (await GET()).json();
}

test('the catalog route answers with the provider of the environment it runs in, call by call', async () => {
  delete process.env.IGDB_OFFLINE_CATALOG;
  process.env.GAME_CATALOG_PROVIDER = 'rawg';
  assert.deepEqual(await attribution(), { attribution: { name: 'RAWG', url: 'https://rawg.io' } });

  // O mesmo módulo, já carregado: a resposta segue a env de agora, não a da carga.
  delete process.env.GAME_CATALOG_PROVIDER;
  assert.deepEqual(await attribution(), { attribution: null });

  process.env.GAME_CATALOG_PROVIDER = 'rawg';
  process.env.IGDB_OFFLINE_CATALOG = '1';
  assert.deepEqual(await attribution(), { attribution: null });
  assert.equal(connections, 3);
});
