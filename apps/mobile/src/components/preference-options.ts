import type { Ionicons } from '@expo/vector-icons';
import { voteChoiceLabels, voteChoices } from '@clube-do-jogo/domain';
import type { VoteChoice } from '@clube-do-jogo/domain';

const icons: Record<VoteChoice, keyof typeof Ionicons.glyphMap> = {
  would_play: 'thumbs-up',
  would_not_play: 'thumbs-down',
};

export const preferenceOptions = voteChoices.map(value => ({
  value,
  label: voteChoiceLabels[value],
  icon: icons[value],
}));
