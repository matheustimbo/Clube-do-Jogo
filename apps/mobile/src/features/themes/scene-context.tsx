import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNativeTheme } from '@/theme';
import { useThemeAudioEngine, type CosmicSceneMode, type ThemeAudioState } from './audio';

export interface ThemeSceneState {
  mode: CosmicSceneMode;
  setMode(mode: CosmicSceneMode): void;
  audio: ThemeAudioState;
}

const fallback: ThemeSceneState = {
  mode: 'hearth',
  setMode: () => undefined,
  audio: { active: false, ready: false, error: null, retry: () => undefined, playSignal: () => undefined },
};

const SceneContext = createContext<ThemeSceneState>(fallback);

export function ThemeSceneProvider({ children }: { children: ReactNode }) {
  const theme = useNativeTheme();
  const [mode, setModeState] = useState<CosmicSceneMode>('hearth');
  const audio = useThemeAudioEngine({ active: theme.audioActive, mode });

  const setMode = useCallback((next: CosmicSceneMode) => {
    setModeState(next);
  }, []);

  const value = useMemo<ThemeSceneState>(() => ({ mode, setMode, audio }), [audio, mode, setMode]);
  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

export function useThemeScene(): ThemeSceneState {
  return useContext(SceneContext);
}
