import assert from 'node:assert/strict';
import test from 'node:test';
import { avatarImageStyle, avatarPanOffset, DEFAULT_AVATAR_CROP, normalizeAvatarCrop } from './avatar';

test('avatar crop uses the shared defaults and clamps every boundary', () => {
  assert.deepEqual(normalizeAvatarCrop(), DEFAULT_AVATAR_CROP);
  assert.deepEqual(normalizeAvatarCrop({ x: -1, y: 101, zoom: 3 }), { x: 0, y: 100, zoom: 2.5 });
  assert.deepEqual(normalizeAvatarCrop({ x: 0, y: 100, zoom: 1 }), { x: 0, y: 100, zoom: 1 });
});

test('invalid avatar crop values fall back without producing NaN styles', () => {
  const crop = normalizeAvatarCrop({ x: Number.NaN, y: Number.POSITIVE_INFINITY, zoom: Number.NEGATIVE_INFINITY });
  assert.deepEqual(crop, DEFAULT_AVATAR_CROP);
  assert.deepEqual(avatarImageStyle(crop), {
    objectPosition: '50% 50%',
    transform: 'scale(1)',
    transformOrigin: '50% 50%',
  });
});

test('sem zoom não há sobra para arrastar', () => {
  assert.deepEqual(avatarPanOffset({ x: 0, y: 100, zoom: 1 }, 240), { x: 0, y: 0 });
});

test('o arrasto anda no máximo a sobra que o zoom criou', () => {
  // zoom 2 em 240px sobra 120px, 60 de cada lado, e o transform escala a translação.
  assert.deepEqual(avatarPanOffset({ x: 0, y: 100, zoom: 2 }, 240), { x: 60, y: -60 });
  assert.deepEqual(avatarPanOffset({ x: 50, y: 50, zoom: 2 }, 240), { x: 0, y: 0 });
});

test('a sobra cresce junto com o zoom', () => {
  const meio = avatarPanOffset({ x: 0, y: 50, zoom: 1.5 }, 240).x;
  const muito = avatarPanOffset({ x: 0, y: 50, zoom: 2.5 }, 240).x;
  assert.ok(muito > meio, 'mais zoom tem que permitir mais arrasto');
});
