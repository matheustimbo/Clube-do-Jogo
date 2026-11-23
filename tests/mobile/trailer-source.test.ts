import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedTrailerNavigation, trailerSource } from '../../apps/mobile/src/features/media/youtube';

const ORIGIN = 'https://clube-do-jogo-coral.vercel.app';

test('o player recebe um Referer, que é o que a origem do YouTube confere', () => {
  const source = trailerSource('https://www.youtube.com/watch?v=zw47_q9wbBE', ORIGIN);
  assert.ok(source);
  assert.equal(source.headers.Referer, `${ORIGIN}/`);
  assert.match(source.uri, /youtube-nocookie\.com\/embed\/zw47_q9wbBE/);
  assert.match(source.uri, new RegExp(`origin=${encodeURIComponent(ORIGIN)}`));
});

test('origem com barra no fim não vira Referer com barra dobrada', () => {
  const source = trailerSource('https://youtu.be/zw47_q9wbBE', `${ORIGIN}/`);
  assert.ok(source);
  assert.equal(source.headers.Referer, `${ORIGIN}/`);
  assert.ok(source.uri.endsWith(`&origin=${encodeURIComponent(ORIGIN)}`), source.uri);
});

test('vídeo inválido não vira fonte', () => {
  assert.equal(trailerSource('https://exemplo.com/video', ORIGIN), null);
  assert.equal(trailerSource(null, ORIGIN), null);
});

test('o WebView do trailer só navega para o player do YouTube', () => {
  assert.equal(isAllowedTrailerNavigation('about:blank'), true);
  assert.equal(isAllowedTrailerNavigation('https://www.youtube-nocookie.com/embed/zw47_q9wbBE'), true);
  assert.equal(isAllowedTrailerNavigation('https://www.youtube.com/watch?v=zw47_q9wbBE'), true);
});

test('link externo é recusado, que é o que manda abrir no navegador', () => {
  for (const url of [
    'https://evil.example.com/',
    'https://youtube.com.evil.example/',
    'http://www.youtube.com/embed/zw47_q9wbBE',
    'https://user:senha@www.youtube.com/',
    `${ORIGIN}/`,
    'javascript:alert(1)',
  ]) {
    assert.equal(isAllowedTrailerNavigation(url), false, url);
  }
});
