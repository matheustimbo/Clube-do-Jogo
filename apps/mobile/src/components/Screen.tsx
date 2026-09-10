import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';

export function Screen({ children, scroll = true, contentContainerStyle, onRefresh, refreshing, edges }: {
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  onRefresh?: () => void;
  refreshing?: boolean;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
}) {
  if (!scroll) {
    return (
      <SafeAreaView style={styles.safeArea} edges={edges ?? ['top']}>
        <View style={[styles.content, contentContainerStyle as object]}>{children}</View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safeArea} edges={edges ?? ['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, contentContainerStyle as object]}
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.violet400} /> : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl * 2, flexGrow: 1 },
});
