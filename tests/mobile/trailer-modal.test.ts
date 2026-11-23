import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mock, test } from 'node:test';
import type { ReactElement, ReactNode } from 'react';

// O componente usa o React que o app mobile resolve, então o renderizador tem
// que vir do mesmo lugar, senão são duas cópias e os hooks quebram.
const appRequire = createRequire(path.join(process.cwd(), 'apps/mobile/package.json'));
const { createElement, useState } = appRequire('react') as typeof import('react');
const { renderToStaticMarkup } = appRequire('react-dom/server') as typeof import('react-dom/server');

// Só a borda nativa é falsa: o TrailerModal de verdade monta as props do WebView.
const WebView = () => null;
const passthrough = ({ children }: { children?: ReactNode }) => children ?? null;
const site = { url: null as string | null };
mock.module('react-native', { exports: { AppState: { addEventListener: () => ({ remove() {} }) }, Modal: passthrough, Pressable: () => null, View: passthrough } });
mock.module('react-native-webview', { exports: { WebView } });
mock.module('@expo/vector-icons', { exports: { Ionicons: () => null } });
mock.module('@/theme', { exports: { themedStyles: () => () => ({}), useThemeColors: () => ({}), radii: {}, spacing: {} } });
mock.module('@/platform/config', { exports: { getMobileSiteUrl: () => site.url } });

const trailerModule = import('../../apps/mobile/src/features/media/TrailerModal');

type WebViewProps = {
  source: { uri: string; headers: Record<string, string> };
  onShouldStartLoadWithRequest: (request: { url: string }) => boolean;
};

function findWebView(node: ReactNode): WebViewProps | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findWebView(child);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object' || !('type' in node)) return null;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === WebView) return element.props as unknown as WebViewProps;
  return findWebView(element.props.children);
}

// Renderiza o modal uma vez por URL na mesma instância, como re-renders do pai,
// e devolve as props que o WebView recebeu em cada passada. As passadas seguintes
// vêm de atualizações durante o render, que o renderizador de servidor refaz
// guardando o estado dos hooks.
async function renderPasses(urls: string[]) {
  const { TrailerModal } = await trailerModule;
  const passes: WebViewProps[] = [];
  function Parent() {
    const [pass, setPass] = useState(0);
    const props = findWebView(TrailerModal({ visible: true, url: urls[pass], title: 'Cocoon', onClose() {} }));
    if (props) passes.push(props);
    if (pass < urls.length - 1) setPass(pass + 1);
    return null;
  }
  renderToStaticMarkup(createElement(Parent));
  assert.equal(passes.length, urls.length, 'esperava uma passada de render por URL');
  return passes;
}

const COCOON = 'https://youtu.be/zw47_q9wbBE';

test('re-render não entrega ao WebView uma fonte nova, que o faria recarregar', async () => {
  const [first, second] = await renderPasses([COCOON, COCOON]);
  assert.equal(second.source, first.source);
});

test('trocar de trailer na mesma tela troca a fonte', async () => {
  const [, second] = await renderPasses([COCOON, 'https://youtu.be/dQw4w9WgXcQ']);
  assert.match(second.source.uri, /\/embed\/dQw4w9WgXcQ\?/);
});

test('o WebView do modal recusa sair do player', async () => {
  const [webView] = await renderPasses([COCOON]);
  assert.equal(webView.onShouldStartLoadWithRequest({ url: webView.source.uri }), true);
  assert.equal(webView.onShouldStartLoadWithRequest({ url: 'https://evil.example.com/' }), false);
});

test('o Referer usa o site configurado e, sem ele, a origem de produção', async () => {
  site.url = 'https://club.example.test';
  try {
    assert.equal((await renderPasses([COCOON]))[0].source.headers.Referer, 'https://club.example.test/');
  } finally {
    site.url = null;
  }
  assert.equal((await renderPasses([COCOON]))[0].source.headers.Referer, 'https://clube-do-jogo-coral.vercel.app/');
});
