import type { RatingScale } from '@clube-do-jogo/domain';
import { useMobilePreferences } from './use-mobile-preferences';

export function useRatingScale(): [RatingScale, (scale: RatingScale) => void] {
  const preferences = useMobilePreferences();
  return [preferences.ratingScale, preferences.setRatingScale];
}
