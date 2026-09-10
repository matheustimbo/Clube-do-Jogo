import type { RatingScale } from '@clube-do-jogo/domain';
import { usePersistentState } from './use-persistent-state';

const RATING_SCALE_KEY = 'clube-do-jogo:mobile:rating-scale';

export function useRatingScale(): [RatingScale, (scale: RatingScale) => void] {
  const [scale, setScale] = usePersistentState<RatingScale>(RATING_SCALE_KEY, 10);
  return [scale, setScale];
}
