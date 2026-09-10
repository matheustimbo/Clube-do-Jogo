export const QUICK_REACTION_EMOJIS = [
  '👍', '❤️', '😂', '😮', '😢', '🎉',
  '🔥', '👏', '🤔', '💀', '😍', '🙌',
] as const;

const FLAG_SEQUENCE = '\\p{Regional_Indicator}{2}';
const KEYCAP_SEQUENCE = '[0-9#*]\\uFE0F?\\u20E3';
const PICTOGRAPH_SEQUENCE =
  '\\p{Extended_Pictographic}(?:\\uFE0F)?(?:\\p{Emoji_Modifier})?' +
  '(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F)?(?:\\p{Emoji_Modifier})?)*';

const SINGLE_EMOJI_PATTERN = new RegExp(
  `^(?:${FLAG_SEQUENCE}|${KEYCAP_SEQUENCE}|${PICTOGRAPH_SEQUENCE})$`,
  'u',
);

/**
 * Validates that raw text typed into the native keyboard's emoji picker is a
 * single emoji (including flags, keycaps, and ZWJ/skin-tone sequences), and
 * nothing else. Returns the trimmed emoji, or null when the input isn't
 * exactly one emoji.
 */
export function parseCustomReactionEmoji(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  return SINGLE_EMOJI_PATTERN.test(trimmed) ? trimmed : null;
}
