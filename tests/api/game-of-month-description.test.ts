import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Game } from '../../src/lib/types';

// A página real do jogo do mês. Só a borda é falsa: o app, a consulta (que devolve o
// jogo do teste) e as abas, que não entram nesta conta.
let current: Game | null = null;
const nothing = () => null;
mock.module('@/components/app-provider', {
  exports: { useApp: () => ({ selectedMonth: '2026-11', isHistorical: false, isDemo: false, clubRevision: 0, cycles: [] }) },
});
mock.module('@/hooks/use-stale-query', { exports: { useStaleQuery: () => ({ data: current, isInitialLoading: false }) } });
mock.module('@/hooks/use-url-state', { exports: { useUrlTab: () => ['timeline', () => {}] } });
mock.module('@/lib/supabase/client', { exports: { createClient: () => ({}) } });
mock.module('@/lib/data', { exports: { fetchGameOfMonth: async () => null } });
mock.module('@/components/timeline', { exports: { Timeline: nothing } });
mock.module('@/components/progress-list', { exports: { ProgressList: nothing } });
mock.module('@/components/notes-chat', { exports: { NotesChat: nothing } });
mock.module('next/link', {
  defaultExport: ({ href, className, children }: { href: string; className?: string; children?: ReactNode }) => createElement('a', { href, className }, children),
});

const page = import('../../src/app/jogo-do-mes/page');

async function render(description: string | null) {
  current = { id: 'jogo', title: 'Tunic', duration_hours: 12, image_url: null, description };
  const { default: GameOfMonthPage } = await page;
  return renderToStaticMarkup(createElement(GameOfMonthPage));
}

test('a game of the month without a description leaves no empty description block', async () => {
  for (const description of [null, '', 'Sem descrição disponível.']) {
    const markup = await render(description);
    assert.match(markup, /Tunic/);
    assert.doesNotMatch(markup, /game-month-description/, JSON.stringify(description));
  }
});

test('a game of the month with a description shows it, and a long one links to the rest', async () => {
  assert.match(await render('Uma raposinha e um manual.'), /game-month-description[^>]*>Uma raposinha e um manual\.</);
  assert.match(await render('a'.repeat(151)), /Ver mais/);
});
