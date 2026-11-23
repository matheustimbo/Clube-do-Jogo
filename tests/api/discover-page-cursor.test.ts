import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';

// A página /jogos de verdade, chamada como função. Os hooks do React guardam o estado num
// vetor entre um render e outro, e os botões são os elementos que a página devolve. Só
// a borda é falsa: o app (fora da demo), o cache de consultas e a rede (/api/discover).
let slots: unknown[] = [];
let cursor = 0;
function useSlot<T>(initial: T | (() => T)) {
  const index = cursor++;
  if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
  const set = (next: T | ((previous: T) => T)) => {
    slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(slots[index] as T) : next;
  };
  return [slots[index] as T, set] as const;
}

// O cache de consultas: a primeira chamada busca, e os renders seguintes leem o resultado.
const queries = new Map<string, { promise: Promise<unknown>; data?: unknown }>();
function useStaleQuery(key: string, fetcher: () => Promise<unknown>, enabled = true) {
  if (enabled && !queries.has(key)) {
    const query: { promise: Promise<unknown>; data?: unknown } = { promise: fetcher() };
    query.promise = query.promise.then(data => { query.data = data; });
    queries.set(key, query);
  }
  const data = queries.get(key)?.data;
  return { data, isInitialLoading: enabled && data === undefined, error: null };
}

const requests: URL[] = [];
let responses: unknown[] = [];
const stub = () => null;

mock.module('react', { namedExports: { ...React, useState: useSlot, useMemo: (factory: () => unknown) => factory() } });
mock.module('@/hooks/use-stale-query', { namedExports: { useStaleQuery } });
mock.module('@/hooks/use-persistent-state', { namedExports: { usePersistentState: (_key: string, fallback: unknown) => useSlot(fallback) } });
mock.module('@/hooks/use-debounced-value', { namedExports: { useDebouncedValue: (value: unknown) => value } });
mock.module('@/components/app-provider', {
  namedExports: { useApp: () => ({ user: { id: 'membro' }, isDemo: false, selectedMonth: '2026-11', runOptimistic: stub, notify: stub }) },
});
mock.module('@/lib/supabase/client', { namedExports: { createClient: () => ({}) } });
mock.module('@/lib/data', { namedExports: { fetchProfileWithGames: async () => ({ library: [], rankingGameIds: [] }) } });
mock.module('@/lib/api-client', {
  namedExports: {
    apiFetch: async (path: string) => {
      requests.push(new URL(path, 'http://localhost'));
      return Response.json(responses.shift());
    },
  },
});
mock.module('@/components/discover-game-card', { namedExports: { DiscoverGameCard: stub } });
mock.module('@/components/ui/dialog', { namedExports: { Dialog: stub, DialogContent: stub, DialogTrigger: stub } });
mock.module('@/components/ui/skeleton', { namedExports: { ListSkeleton: stub } });

const page = import('../../src/app/jogos/page');

afterEach(() => {
  slots = [];
  queries.clear();
  requests.length = 0;
  responses = [];
});

type Element = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object' && 'props' in node) return text((node as Element).props.children);
  return '';
}

function find(node: ReactNode, match: (element: Element) => boolean): Element | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, match);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return null;
  const element = node as Element;
  return match(element) ? element : find(element.props.children, match);
}

async function render() {
  const { default: AllGamesPage } = await page;
  cursor = 0;
  return AllGamesPage() as ReactNode;
}

async function settle() {
  await Promise.all([...queries.values()].map(query => query.promise));
  for (let turn = 0; turn < 5; turn += 1) await new Promise(resolve => setImmediate(resolve));
}

async function loadMore() {
  const button = find(await render(), element => element.type === 'button' && text(element.props.children) === 'Carregar mais');
  assert.ok(button, 'a página não mostrou "Carregar mais"');
  button.props.onClick?.();
  await settle();
}

function games(from: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({ game: { id: `jogo-${from + index}`, title: `Jogo ${from + index}` } }));
}

const offsets = () => requests.map(url => url.searchParams.get('offset'));

test('the page asks for the next page at the cursor the server sent, not at the number of cards', async () => {
  // O cache tirou jogos das duas páginas: 22 e 21 cards de 24 pedidos.
  responses = [
    { items: games(0, 22), hasMore: true, nextOffset: 24 },
    { items: games(24, 21), hasMore: true, nextOffset: 48 },
    { items: games(48, 24), hasMore: false, nextOffset: 72 },
  ];
  await render();
  await settle();
  await loadMore();
  await loadMore();
  assert.deepEqual(offsets(), [null, '24', '48']);
});

test('a server from before the cursor moves the page by the page size', async () => {
  responses = [
    { items: games(0, 22), hasMore: true },
    { items: games(24, 21), hasMore: true },
    { items: games(48, 24), hasMore: false },
  ];
  await render();
  await settle();
  await loadMore();
  await loadMore();
  assert.deepEqual(offsets(), [null, '24', '48']);
});
