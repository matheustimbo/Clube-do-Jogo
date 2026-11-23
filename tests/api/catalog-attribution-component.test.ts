import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// O componente de crédito de verdade. O renderizador de servidor não roda efeitos nem
// guarda estado entre renders, então o componente recebe um useEffect que roda na hora
// e um useState que guarda o valor até o próximo render. Só a borda é falsa: o app (que
// diz se é a demo) e a rede.
let isDemo = false;
let state: unknown;
let stateReady = false;
let effectDeps: unknown[] | undefined;
mock.module('react', {
  namedExports: {
    ...React,
    useState: (initial: unknown) => {
      if (!stateReady) {
        state = initial;
        stateReady = true;
      }
      return [state, (next: unknown) => { state = next; }];
    },
    // Como o React: roda de novo só quando uma dependência muda.
    useEffect: (effect: () => void, deps: unknown[]) => {
      if (effectDeps && deps.every((dep, index) => Object.is(dep, effectDeps![index]))) return;
      effectDeps = deps;
      effect();
    },
  },
});
mock.module('@/components/app-provider', { namedExports: { useApp: () => ({ isDemo }) } });

const realFetch = globalThis.fetch;
let requested: string[] = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  requested = [];
  stateReady = false;
  effectDeps = undefined;
});

/** O markup depois que a resposta de /api/catalog chega e o componente renderiza de novo. */
async function renderCredit(demo: boolean, attribution: unknown = { name: 'RAWG', url: 'https://rawg.io' }) {
  isDemo = demo;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return Response.json({ attribution });
  }) as typeof fetch;
  const { CatalogAttribution } = await import('../../src/components/catalog-attribution');
  renderToStaticMarkup(React.createElement(CatalogAttribution));
  await new Promise(resolve => setImmediate(resolve));
  return renderToStaticMarkup(React.createElement(CatalogAttribution));
}

test('the web credit never asks the server in the demo and renders nothing', async () => {
  assert.equal(await renderCredit(true), '');
  assert.deepEqual(requested, []);
});

test('the web credit renders an active link to the catalog the server names', async () => {
  const markup = await renderCredit(false);
  assert.deepEqual(requested.map(url => new URL(url, 'http://localhost').pathname), ['/api/catalog']);
  assert.match(markup, /^<p [^>]*>Dados de jogos por <a href="https:\/\/rawg\.io" target="_blank" rel="noreferrer"[^>]*>RAWG<\/a>\.<\/p>$/);
});

test('a catalog that asks for no credit renders nothing', async () => {
  assert.equal(await renderCredit(false, null), '');
});
