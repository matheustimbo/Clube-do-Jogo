import { useCallback, useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Listener = () => void;

const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();
const hydrated = new Set<string>();

function getListeners(key: string): Set<Listener> {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  return set;
}

function notify(key: string) {
  for (const listener of getListeners(key)) listener();
}

function readCache<T>(key: string, initial: T): T {
  return cache.has(key) ? (cache.get(key) as T) : initial;
}

function writeCache<T>(key: string, value: T) {
  cache.set(key, value);
  notify(key);
}

function hydrate(key: string) {
  if (hydrated.has(key)) return;
  hydrated.add(key);
  AsyncStorage.getItem(key)
    .then(stored => {
      if (stored === null || cache.has(key)) return;
      try {
        writeCache(key, JSON.parse(stored));
      } catch {
        return;
      }
    })
    .catch(() => {
      return;
    });
}

export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const subscribe = useCallback((onStoreChange: Listener) => {
    const set = getListeners(key);
    set.add(onStoreChange);
    return () => set.delete(onStoreChange);
  }, [key]);

  const value = useSyncExternalStore(subscribe, () => readCache(key, initial));

  useEffect(() => {
    hydrate(key);
  }, [key]);

  const update = useCallback((next: T) => {
    writeCache(key, next);
    AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {
      return;
    });
  }, [key]);

  return [value, update];
}
