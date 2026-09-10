import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@/theme';
import type { Game } from '@clube-do-jogo/domain';

export function GameListRow({ game, onPress, action, subtitle }: {
  game: Game;
  onPress?: () => void;
  action?: ReactNode;
  subtitle?: ReactNode;
}) {
  const content = (
    <View style={styles.row}>
      <Image source={{ uri: game.image_url }} style={styles.cover} contentFit="cover" accessibilityLabel={`Capa de ${game.title}`} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{game.title}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={12} color={colors.zinc500} />
          <Text style={styles.metaText}>{game.duration_hours} h</Text>
        </View>
        {subtitle}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
  if (!onPress) return <View style={styles.card}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalhes de ${game.title}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairlineSoft,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.md,
  },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  cover: { width: 56, height: 76, borderRadius: radii.sm, backgroundColor: colors.zinc900 },
  info: { flex: 1, gap: 6, minWidth: 0 },
  title: { ...typography.h3, fontSize: 14, color: colors.foreground },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.tiny, color: colors.zinc500, textTransform: 'none' },
  action: { alignItems: 'flex-end', justifyContent: 'center', gap: spacing.xs },
});
