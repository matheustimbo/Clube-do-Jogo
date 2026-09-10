import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  notificationResponseKey,
  parsePushDestination,
  PushResponseInbox,
  resolvePushDestination,
} from '../../apps/mobile/src/platform/push-navigation';
import type { NativeNotificationResponse } from '../../apps/mobile/src/platform/push-controller';

const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

function response(identifier: string, url: unknown, actionIdentifier = DEFAULT_ACTION): NativeNotificationResponse {
  return { identifier, actionIdentifier, data: { url } };
}

test('accepts only known internal destinations and preserves timeline intent', () => {
  assert.deepEqual(parsePushDestination('/jogo-do-mes?section=timeline'), {
    pathname: '/(app)/(tabs)/jogo-do-mes', params: { section: 'timeline' },
  });
  assert.deepEqual(parsePushDestination('/ranking'), { pathname: '/(app)/(tabs)/ranking' });
  assert.deepEqual(parsePushDestination('/perfil'), { pathname: '/(app)/(tabs)/perfil' });
  assert.deepEqual(parsePushDestination('/jogos/game%2F42'), {
    pathname: '/(app)/jogos/[id]', params: { id: 'game/42' },
  });
  for (const malicious of [
    'https://evil.test/ranking', '//evil.test/ranking', 'javascript:alert(1)', '/ranking?next=https://evil.test',
    '/jogo-do-mes?section=timeline&next=evil', '/perfil/member/extra', '/ranking#fragment',
    '/jogos/%2e%2e/ranking', '/jogos\\..\\ranking',
  ]) assert.equal(parsePushDestination(malicious), null);
});

test('removed game/profile destinations fall back to a recoverable home route', async () => {
  const missing = { game: async () => false, profile: async () => false };
  assert.deepEqual(await resolvePushDestination('/jogos/old-game', missing), {
    pathname: '/(app)/(tabs)/jogo-do-mes',
  });
  assert.deepEqual(await resolvePushDestination('/perfil/old-profile', missing), {
    pathname: '/(app)/(tabs)/jogo-do-mes',
  });
  const present = { game: async (id: string) => id === 'game-1', profile: async () => true };
  assert.deepEqual(await resolvePushDestination('/jogos/game-1', present), {
    pathname: '/(app)/jogos/[id]', params: { id: 'game-1' },
  });
});

test('foreground/background and cold-start copies dedupe by notification and action', () => {
  const inbox = new PushResponseInbox();
  const cold = response('notification-1', '/ranking');
  assert.equal(inbox.capture(cold), true);
  assert.equal(inbox.capture({ ...cold }), false);
  assert.equal(notificationResponseKey(cold), `notification-1\u0000${DEFAULT_ACTION}`);
  assert.deepEqual(inbox.consume()?.data, { url: '/ranking' });
  assert.equal(inbox.consume(), null);
  assert.equal(inbox.capture(response('notification-1', '/ranking', 'custom-action')), false);
});

test('malicious URLs never become pending navigation intents', () => {
  const inbox = new PushResponseInbox();
  assert.equal(inbox.capture(response('bad-1', 'https://evil.test')), false);
  assert.equal(inbox.capture(response('bad-2', '/ranking', 'custom-action')), false);
  assert.equal(inbox.peek(), null);
});

test('logout clears an authenticated account pending intent without clearing process dedupe', () => {
  const inbox = new PushResponseInbox();
  const tap = response('notification-a', '/perfil');
  assert.equal(inbox.capture(tap), true);
  inbox.clearPending();
  assert.equal(inbox.peek(), null);
  assert.equal(inbox.capture(tap), false);
});
