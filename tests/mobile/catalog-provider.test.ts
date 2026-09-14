import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

const configModule = new URL('../../apps/mobile/src/platform/config.ts', import.meta.url).href;
const saved = process.env.EXPO_PUBLIC_GAME_CATALOG_PROVIDER;

// O módulo lê a variável na carga, então cada valor precisa da sua própria importação.
async function providerFor(value: string | undefined, cacheKey: string) {
  if (value === undefined) delete process.env.EXPO_PUBLIC_GAME_CATALOG_PROVIDER;
  else process.env.EXPO_PUBLIC_GAME_CATALOG_PROVIDER = value;
  const { getCatalogProvider } = await import(`${configModule}?${cacheKey}`);
  return getCatalogProvider();
}

afterEach(() => {
  if (saved === undefined) delete process.env.EXPO_PUBLIC_GAME_CATALOG_PROVIDER;
  else process.env.EXPO_PUBLIC_GAME_CATALOG_PROVIDER = saved;
});

test('the app only credits RAWG when the environment names it as the catalog', async () => {
  assert.equal(await providerFor('rawg', 'rawg'), 'rawg');
  assert.equal(await providerFor(undefined, 'ausente'), 'igdb');
  assert.equal(await providerFor('igdb', 'igdb'), 'igdb');
  assert.equal(await providerFor('  ', 'vazio'), 'igdb');
  assert.equal(await providerFor('RAWG', 'maiusculo'), 'igdb');
});
