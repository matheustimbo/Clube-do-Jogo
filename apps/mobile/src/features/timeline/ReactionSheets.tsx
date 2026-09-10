import { Pressable, ScrollView, Text, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { Avatar } from '@/components/Avatar';
import { themedStyles, radii, spacing, typography } from '@/theme';
import type { ClubComment } from '@clube-do-jogo/domain';
import { QUICK_REACTION_EMOJIS } from './emojis';

export function ReactionPickerSheet({ visible, onSelect, onClose }: {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  return (
    <Sheet visible={visible} title="Adicionar reação" onClose={onClose}>
      <View style={styles.grid}>
        {QUICK_REACTION_EMOJIS.map(emoji => (
          <Pressable
            key={emoji}
            onPress={() => onSelect(emoji)}
            accessibilityRole="button"
            accessibilityLabel={`Reagir com ${emoji}`}
            style={styles.emojiButton}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

export function ReactionsListSheet({ visible, comment, onClose }: {
  visible: boolean;
  comment: ClubComment | null;
  onClose: () => void;
}) {
  const styles = useStyles();
  const people = comment?.reactions.flatMap(reaction => reaction.users.map(user => ({ user, emoji: reaction.emoji }))) ?? [];
  return (
    <Sheet visible={visible} title="Reações" onClose={onClose}>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {people.length === 0 ? (
          <Text style={styles.empty}>Ninguém reagiu ainda.</Text>
        ) : people.map(({ user, emoji }, index) => (
          <View key={`${emoji}-${user.id}-${index}`} style={styles.person}>
            <Avatar uri={user.avatar_url} crop={user.avatar_crop} name={user.name} size={36} />
            <Text style={styles.personName} numberOfLines={1}>{user.name || 'Membro'}</Text>
            <Text style={styles.personEmoji}>{emoji}</Text>
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg },
  emojiButton: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSofter,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  emoji: { fontSize: 24 },
  list: { maxHeight: 360 },
  listContent: { padding: spacing.md, gap: spacing.xs },
  empty: { ...typography.small, color: colors.zinc600, textAlign: 'center', paddingVertical: spacing.xl },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  personName: { ...typography.body, color: colors.foreground, flex: 1 },
  personEmoji: { fontSize: 20 },
}));
