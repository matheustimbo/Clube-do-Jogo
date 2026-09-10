import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';

export function RatingBadge({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <View style={styles.row} accessibilityLabel={`Nota ${value.toFixed(1)} de 10`}>
      <Ionicons name="star" size={size} color={colors.amber400} />
      <Text style={[styles.text, { fontSize: size - 1 }]}>{value.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  text: { color: colors.amber300, fontWeight: '800' },
});
