import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trailerSource } from '../../apps/mobile/src/features/media/youtube';

const ORIGIN = 'https://clube-do-jogo-coral.vercel.app';

test('o player recebe um Referer, que é o que a origem do YouTube confere', () => {
  const source = trailerSource('https://www.youtube.com/watch?v=zw47_q9wbBE', ORIGIN);
  assert.ok(source);
  assert.equal(source.headers.Referer, `${ORIGIN}/`);
  assert.match(source.uri, /youtube-nocookie\.com\/embed\/zw47_q9wbBE/);
  assert.match(source.uri, new RegExp(`origin=${encodeURIComponent(ORIGIN)}`));
});

test('vídeo inválido não vira fonte', () => {
  assert.equal(trailerSource('https://exemplo.com/video', ORIGIN), null);
  assert.equal(trailerSource(null, ORIGIN), null);
});
