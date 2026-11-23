import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// O componente de crédito de verdade. O renderizador de servidor não roda efeitos, então
// o componente recebe um useEffect que roda na hora; o useState é o do React real, que o
// renderizador já carregou. Só a borda é falsa: o app (que diz se é a demo) e a rede.
let isDemo = false;
mock.module('react', { namedExports: { useState, useEffect: (effect: () => void) => { effect(); } } });
mock.module('@/components/app-provider', { namedExports: { useApp: () => ({ isDemo }) } });

const realFetch = globalThis.fetch;
let requested: string[] = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  requested = [];
});

async function renderCredit(demo: boolean) {
  isDemo = demo;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return Response.json({ attribution: { name: 'RAWG', url: 'https://rawg.io' } });
  }) as typeof fetch;
  const { CatalogAttribution } = await import('../../src/components/catalog-attribution');
  renderToStaticMarkup(createElement(CatalogAttribution));
  await new Promise(resolve => setImmediate(resolve));
}

test('the web credit never asks the server in the demo', async () => {
  await renderCredit(true);
  assert.deepEqual(requested, []);
});

test('the web credit asks the server which catalog to credit outside the demo', async () => {
  await renderCredit(false);
  assert.deepEqual(requested.map(url => new URL(url, 'http://localhost').pathname), ['/api/catalog']);
});
