import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ratingForScale } from '@clube-do-jogo/domain';
import { colors, spacing } from '@/theme';
import { useRatingScale } from '@/hooks/use-rating-scale';

export function formatRatingValue(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

export function RatingValue({ value, size = 13 }: { value: number; size?: number }) {
  const [scale] = useRatingScale();
  const shown = ratingForScale(value, scale);
  return (
    <View style={styles.row} accessibilityLabel={`Nota ${formatRatingValue(shown)} de ${scale}`}>
      <Ionicons name="star" size={size} color={colors.amber400} />
      <Text style={[styles.text, { fontSize: size - 1 }]}>{formatRatingValue(shown)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  text: { color: colors.amber300, fontWeight: '800' },
});
