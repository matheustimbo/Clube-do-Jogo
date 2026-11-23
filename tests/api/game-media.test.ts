import assert from 'node:assert/strict';
import test from 'node:test';
import { needsMediaEnrichment } from '../../src/lib/game-media';
import type { Game } from '../../src/lib/types';

const complete: Game = {
  id: 'jogo',
  title: 'Tunic',
  duration_hours: 12,
  image_url: null,
  description: 'Uma raposinha e um manual indecifrável.',
  screenshot_urls: ['1.jpg', '2.jpg', '3.jpg'],
  genres: ['Adventure'],
  platforms: ['PC'],
  platform_ids: [6],
};

test('a game with everything the detail brings needs no enrichment', () => {
  assert.equal(needsMediaEnrichment(complete), false);
});

test('a game the listing cached without a description asks for the detail', () => {
  assert.equal(needsMediaEnrichment({ ...complete, description: null }), true);
  assert.equal(needsMediaEnrichment({ ...complete, description: '' }), true);
});

test('a game short of screenshots, genres or platforms asks for the detail', () => {
  assert.equal(needsMediaEnrichment({ ...complete, screenshot_urls: ['1.jpg'] }), true);
  assert.equal(needsMediaEnrichment({ ...complete, genres: [] }), true);
  assert.equal(needsMediaEnrichment({ ...complete, platforms: null }), true);
});

test('a game whose platforms have no IGDB id stops asking once it has their names', () => {
  // O detalhe da RAWG traz o nome de toda plataforma e o id só das que rawg-ids.ts
  // traduz. Pedir de novo nunca traria o id que falta.
  assert.equal(needsMediaEnrichment({ ...complete, platforms: ['Atari 2600'], platform_ids: [] }), false);
  assert.equal(needsMediaEnrichment({ ...complete, platforms: ['Atari 2600'], platform_ids: null }), false);
});

test('the placeholder older rows saved counts as no description', () => {
  assert.equal(needsMediaEnrichment({ ...complete, description: 'Sem descrição disponível.' }), true);
});
