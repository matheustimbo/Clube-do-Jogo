import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState(initial);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    AsyncStorage.getItem(key).then(stored => {
      if (!mounted.current || stored === null) return;
      try {
        setValue(JSON.parse(stored) as T);
      } catch {
        setValue(initial);
      }
    });
    return () => {
      mounted.current = false;
    };
  }, [key, initial]);

  const update = useCallback((next: T) => {
    setValue(next);
    void AsyncStorage.setItem(key, JSON.stringify(next));
  }, [key]);

  return [value, update];
}
