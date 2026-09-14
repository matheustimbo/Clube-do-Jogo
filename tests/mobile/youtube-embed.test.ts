import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedTrailerNavigation, youtubeEmbedHtml, youtubeEmbedUrl } from '../../apps/mobile/src/features/media/youtube';

const ORIGIN = 'https://clube-do-jogo-coral.vercel.app';

test('o documento diz ao YouTube de onde vem, que é o que a origem exige', () => {
  const html = youtubeEmbedHtml('https://www.youtube.com/watch?v=zw47_q9wbBE', ORIGIN);
  assert.ok(html);
  assert.match(html, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
  assert.match(html, /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(html, new RegExp(`origin=${encodeURIComponent(ORIGIN)}`));
  assert.match(html, /youtube-nocookie\.com\/embed\/zw47_q9wbBE/);
});

test('vídeo inválido não vira documento', () => {
  assert.equal(youtubeEmbedHtml('https://exemplo.com/video', ORIGIN), null);
  assert.equal(youtubeEmbedHtml(null, ORIGIN), null);
});

test('a origem do próprio documento é liberada, senão o WebView bloqueia a si mesmo', () => {
  assert.equal(isAllowedTrailerNavigation(`${ORIGIN}/`, ORIGIN), true);
  assert.equal(isAllowedTrailerNavigation('about:blank', ORIGIN), true);
  assert.equal(isAllowedTrailerNavigation('https://www.youtube-nocookie.com/embed/abc', ORIGIN), true);
});

test('link externo continua recusado, que é o que manda abrir no navegador', () => {
  assert.equal(isAllowedTrailerNavigation('https://evil.example.com/', ORIGIN), false);
  assert.equal(isAllowedTrailerNavigation('https://youtube.com.evil.example/', ORIGIN), false);
});

test('a URL de embed carrega a origem quando ela existe', () => {
  assert.equal(
    youtubeEmbedUrl('https://youtu.be/zw47_q9wbBE', ORIGIN),
    `https://www.youtube-nocookie.com/embed/zw47_q9wbBE?playsinline=1&rel=0&modestbranding=1&controls=1&origin=${encodeURIComponent(ORIGIN)}`,
  );
});
