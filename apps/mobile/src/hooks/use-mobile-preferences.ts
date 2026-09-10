import * as React from 'react';
import type { RatingScale, ThemeId } from '@clube-do-jogo/domain';
import { DEFAULT_THEME, getSelectableThemes, isThemeId, unlockedThemeIds } from '@clube-do-jogo/domain';
import { useRewardGrants } from '../state/reward-queries';
import { useAppInternal } from '../state/app-provider';
import {
  usePersistentState,
  type PersistentStateStatus,
} from './use-persistent-state';
import {
  DEFAULT_MOBILE_PREFERENCES,
  mobilePreferencesStorageKey,
  parseMobilePreferences,
  type MobilePreferences,
} from './mobile-preferences-core';

export { DEFAULT_MOBILE_PREFERENCES, mobilePreferencesStorageKey, normalizeMobilePreferences } from './mobile-preferences-core';
export type { MobilePreferences } from './mobile-preferences-core';

export interface MobilePreferencesState extends MobilePreferences {
  loading: boolean;
  saving: boolean;
  error: Error | null;
  retry(): void;
  setThemeId(themeId: ThemeId): void;
  setReduceMotion(value: boolean): void;
  setAudioEnabled(value: boolean): void;
  setRatingScale(value: RatingScale): void;
}
function selectableTheme(unlockedThemeIds: readonly ThemeId[], themeId: ThemeId) {
  return getSelectableThemes(unlockedThemeIds).some(theme => theme.id === themeId);
}

function statusValues(status: PersistentStateStatus) {
  return {
    loading: status.loading,
    saving: status.saving,
    error: status.error,
    retry: status.retry,
  };
}

export function useMobilePreferences(): MobilePreferencesState {
  const context = useAppInternal();
  const rewards = useRewardGrants();
  const key = mobilePreferencesStorageKey(context.userId, context.isDemo, context.sessionEpoch);
  const persistenceOptions = React.useMemo(() => ({ parse: parseMobilePreferences }), []);
  const [stored, setStored, status] = usePersistentState<MobilePreferences>(key, DEFAULT_MOBILE_PREFERENCES, persistenceOptions);
  const unlockedIds = React.useMemo(() => unlockedThemeIds(rewards.data || []), [rewards.data]);
  const visibleThemeId = selectableTheme(unlockedIds, stored.themeId) ? stored.themeId : DEFAULT_THEME;
  const epoch = context.sessionEpoch;
  const canWrite = context.ready && Boolean(context.userId) && context.isSessionCurrent(epoch);
  const setThemeId = React.useCallback((themeId: ThemeId) => {
    if (!canWrite || !isThemeId(themeId) || !selectableTheme(unlockedIds, themeId)) return;
    setStored(current => ({ ...current, themeId }));
  }, [canWrite, setStored, unlockedIds]);
  const setReduceMotion = React.useCallback((reduceMotion: boolean) => {
    if (!canWrite || typeof reduceMotion !== 'boolean') return;
    setStored(current => ({ ...current, reduceMotion }));
  }, [canWrite, setStored]);
  const setAudioEnabled = React.useCallback((audioEnabled: boolean) => {
    if (!canWrite || typeof audioEnabled !== 'boolean') return;
    setStored(current => ({ ...current, audioEnabled }));
  }, [canWrite, setStored]);
  const setRatingScale = React.useCallback((ratingScale: RatingScale) => {
    if (!canWrite || (ratingScale !== 5 && ratingScale !== 10)) return;
    setStored(current => ({ ...current, ratingScale }));
  }, [canWrite, setStored]);
  return {
    themeId: visibleThemeId,
    reduceMotion: stored.reduceMotion,
    audioEnabled: stored.audioEnabled,
    ratingScale: stored.ratingScale,
    ...statusValues(status),
    setThemeId,
    setReduceMotion,
    setAudioEnabled,
    setRatingScale,
  };
}
