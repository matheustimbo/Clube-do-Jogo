import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mock, test } from 'node:test';
import type { ReactNode } from 'react';
import type { Game } from '@clube-do-jogo/domain';

// A tela real do jogo do mês. Só a borda é falsa: os componentes nativos viram tags que
// o renderizador de servidor escreve, e as consultas devolvem o jogo do teste.
const appRequire = createRequire(path.join(process.cwd(), 'apps/mobile/package.json'));
const { createElement } = appRequire('react') as typeof import('react');
const { renderToStaticMarkup } = appRequire('react-dom/server') as typeof import('react-dom/server');

const tag = (name: string) => ({ children }: { children?: ReactNode }) => createElement(name, null, children);
const nothing = () => null;
let current: Game | null = null;
const query = (data: unknown) => ({ data, isLoading: false, isError: false, isRefetching: false, refetch() {} });
const mutation = { mutate() {}, isPending: false, isError: false, error: null };

mock.module('react-native', { exports: { Pressable: tag('button'), Text: tag('text'), View: tag('view') } });
mock.module('expo-image', { exports: { Image: nothing } });
mock.module('@expo/vector-icons', { exports: { Ionicons: nothing } });
mock.module('expo-router', { exports: { useLocalSearchParams: () => ({}), useRouter: () => ({ push() {}, setParams() {} }) } });
mock.module('@/components/Screen', { exports: { Screen: tag('screen') } });
mock.module('@/components/CatalogAttribution', { exports: { CatalogAttribution: nothing } });
mock.module('@/components/AppHeader', { exports: { AppHeader: nothing } });
mock.module('@/components/Chip', { exports: { Chip: nothing } });
mock.module('@/components/MonthTrigger', { exports: { MonthTrigger: nothing } });
mock.module('@/components/MonthPicker', { exports: { MonthPicker: nothing } });
mock.module('@/components/StatusPill', { exports: { StatusPill: nothing, useStatusMeta: () => ({}) } });
mock.module('@/components/RatingSheet', { exports: { RatingSheet: nothing } });
mock.module('@/components/RatingValue', { exports: { RatingValue: nothing } });
mock.module('@/components/ProgressConfirmSheet', { exports: { ProgressConfirmSheet: nothing } });
mock.module('@/components/StateViews', { exports: { EmptyState: nothing, ErrorState: nothing, LoadingState: nothing } });
mock.module('@/features/timeline/Timeline', { exports: { Timeline: nothing } });
mock.module('@/features/notes/PrivateNotes', { exports: { PrivateNotes: nothing } });
mock.module('@/state/app-provider', {
  exports: { useApp: () => ({ userId: 'membro', selectedMonth: '2026-11', activeMonth: '2026-11', months: [], isHistorical: false, setSelectedMonth() {} }) },
});
mock.module('@/state/queries', { exports: { useGameOfMonth: () => query(current), useProgress: () => query([]), useSetProgress: () => mutation } });
mock.module('@/state/library-queries', { exports: { useSetRating: () => mutation } });
mock.module('@/theme', {
  exports: { themedStyles: () => () => new Proxy({}, { get: (_target, key) => ({ name: String(key) }) }), useThemeColors: () => ({}), radii: {}, spacing: {}, typography: {} },
});

const screen = import('../../apps/mobile/app/(app)/(tabs)/jogo-do-mes');

async function hero(description: string | null) {
  current = { id: 'jogo', title: 'Tunic', duration_hours: 12, image_url: null, description };
  const { default: GameOfMonthScreen } = await screen;
  return renderToStaticMarkup(createElement(GameOfMonthScreen));
}

test('a game of the month without a description renders no empty description line', async () => {
  for (const description of [null, '', 'Sem descrição disponível.']) {
    const markup = await hero(description);
    assert.match(markup, /<text>Tunic<\/text>/);
    // Título, duração e "Ver detalhes": nada de um <text> vazio ou com o placeholder.
    assert.doesNotMatch(markup, /<text><\/text>|Sem descrição/, JSON.stringify(description));
  }
});

test('a game of the month with a description shows it, and a long one offers the rest', async () => {
  assert.match(await hero('Uma raposinha e um manual.'), /<text>Uma raposinha e um manual\.<\/text>/);
  assert.match(await hero('a'.repeat(151)), /<text>Ver mais<\/text>/);
});
