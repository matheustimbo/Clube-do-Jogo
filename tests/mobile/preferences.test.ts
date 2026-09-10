import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPersistentStateStore,
} from '../../apps/mobile/src/hooks/use-persistent-state';
import type { NativeStorage } from '../../apps/mobile/src/platform/storage';

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

class FakeStorage implements NativeStorage {
  readonly values = new Map<string, string>();
  readonly reads = new Map<string, Deferred<string | null>>();
  readonly writes: Array<{ key: string; value: string; deferred: Deferred<void> }> = [];
  failNextWrite = false;

  getItem(key: string) {
    const deferred = new Deferred<string | null>();
    this.reads.set(key, deferred);
    return deferred.promise;
  }

  setItem(key: string, value: string) {
    const deferred = new Deferred<void>();
    this.writes.push({ key, value, deferred });
    if (this.failNextWrite) {
      this.failNextWrite = false;
      deferred.reject(new Error('storage indisponível'));
    }
    return deferred.promise.then(() => {
      this.values.set(key, value);
    });
  }

  removeItem(key: string) {
    this.values.delete(key);
    return Promise.resolve();
  }
}

function flush() {
  return new Promise<void>(resolve => setImmediate(resolve));
}

test('a local write wins over a late storage read', async () => {
  const storage = new FakeStorage();
  const store = createPersistentStateStore('account/member', { value: 'initial' }, { storage });
  store.hydrate();
  store.set({ value: 'typed locally' });
  storage.reads.get('account/member')?.resolve(JSON.stringify({ value: 'old remote' }));
  storage.writes[0]?.deferred.resolve();
  await flush();
  assert.deepEqual(store.get(), { value: 'typed locally' });
});

test('serializes writes and keeps the latest value durable', async () => {
  const storage = new FakeStorage();
  const store = createPersistentStateStore('account/member', 0, { storage });
  store.set(1);
  store.set(2);
  await flush();
  assert.equal(storage.writes.length, 1);
  storage.writes[0]?.deferred.resolve();
  await flush();
  assert.equal(storage.writes.length, 2);
  storage.writes[1]?.deferred.resolve();
  await flush();
  assert.equal(storage.values.get('account/member'), '2');
  assert.equal(store.get(), 2);
  assert.equal(store.getStatus().error, null);
});

test('write failures are observable and retry persists the current value', async () => {
  const storage = new FakeStorage();
  const store = createPersistentStateStore('account/member', 'latest', { storage });
  storage.failNextWrite = true;
  store.set('latest');
  await flush();
  assert.match(store.getStatus().error?.message || '', /indisponível/);
  store.retry();
  await flush();
  assert.equal(storage.writes.length, 2);
  storage.writes[1]?.deferred.resolve();
  await flush();
  assert.equal(storage.values.get('account/member'), JSON.stringify('latest'));
  assert.equal(store.getStatus().error, null);
});
