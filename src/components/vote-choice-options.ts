import { Minus, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';
import { voteChoiceLabels, voteChoices } from '@clube-do-jogo/domain';
import type { VoteChoice } from '@/lib/types';

const looks: Record<VoteChoice, { Icon: LucideIcon; accessibilityName: string }> = {
  // O rótulo curto cabe no botão. Quem ouve o leitor de tela precisa da escolha inteira.
  would_not_play: { Icon: ThumbsDown, accessibilityName: 'Não jogaria' },
  neutral: { Icon: Minus, accessibilityName: 'Neutro' },
  would_play: { Icon: ThumbsUp, accessibilityName: 'Jogaria' },
};

/** The vote buttons, counts and participant tabs, in `voteChoices` order. */
export const voteChoiceOptions = voteChoices.map(value => ({ value, label: voteChoiceLabels[value], ...looks[value] }));
