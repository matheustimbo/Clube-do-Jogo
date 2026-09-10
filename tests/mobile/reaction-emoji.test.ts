import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCustomReactionEmoji, QUICK_REACTION_EMOJIS } from '../../apps/mobile/src/features/timeline/emojis';

test('parseCustomReactionEmoji accepts a single simple emoji', () => {
  assert.equal(parseCustomReactionEmoji('😀'), '😀');
});

test('parseCustomReactionEmoji trims surrounding whitespace', () => {
  assert.equal(parseCustomReactionEmoji('  🔥  '), '🔥');
});

test('parseCustomReactionEmoji accepts a skin-tone modified emoji', () => {
  assert.equal(parseCustomReactionEmoji('👍🏽'), '👍🏽');
});

test('parseCustomReactionEmoji accepts a ZWJ family sequence', () => {
  assert.equal(parseCustomReactionEmoji('👨‍👩‍👧‍👦'), '👨‍👩‍👧‍👦');
});

test('parseCustomReactionEmoji accepts a flag sequence', () => {
  assert.equal(parseCustomReactionEmoji('🇧🇷'), '🇧🇷');
});

test('parseCustomReactionEmoji accepts a keycap sequence', () => {
  assert.equal(parseCustomReactionEmoji('#️⃣'), '#️⃣');
});

test('parseCustomReactionEmoji rejects plain text', () => {
  assert.equal(parseCustomReactionEmoji('hello'), null);
});

test('parseCustomReactionEmoji rejects text mixed with an emoji', () => {
  assert.equal(parseCustomReactionEmoji('hi😀'), null);
});

test('parseCustomReactionEmoji rejects more than one emoji', () => {
  assert.equal(parseCustomReactionEmoji('😀😀'), null);
});

test('parseCustomReactionEmoji rejects empty input', () => {
  assert.equal(parseCustomReactionEmoji(''), null);
  assert.equal(parseCustomReactionEmoji('   '), null);
});

test('quick reaction list still exposes the original 12 shortcuts', () => {
  assert.equal(QUICK_REACTION_EMOJIS.length, 12);
});
