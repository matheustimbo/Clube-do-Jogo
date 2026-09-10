import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({ label, onPress, variant = 'primary', disabled, loading, icon, accessibilityLabel, style }: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  style?: object;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? colors.violet300 : colors.white} size="small" />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.label, labelVariantStyles[variant]]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.small, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});

const variantStyles: Record<Variant, object> = StyleSheet.create({
  primary: { backgroundColor: colors.violet600 },
  secondary: { backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.hairline },
  danger: { backgroundColor: colors.red600 },
  ghost: { backgroundColor: 'transparent' },
});

const labelVariantStyles: Record<Variant, object> = StyleSheet.create({
  primary: { color: colors.white },
  secondary: { color: colors.zinc300 },
  danger: { color: colors.white },
  ghost: { color: colors.violet300 },
});
