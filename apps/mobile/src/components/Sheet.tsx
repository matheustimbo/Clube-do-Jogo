import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@/theme';

export function Sheet({ visible, title, onClose, children, avoidKeyboard = false }: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  avoidKeyboard?: boolean;
}) {
  const content = (
    <Pressable style={styles.sheet} onPress={event => event.stopPropagation()} accessible={false}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.zinc400} />
        </Pressable>
      </View>
      {children}
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.keyboardAvoider}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={avoidKeyboard}

          style={styles.keyboardAvoider}
        >
          <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
            {content}
          </Pressable>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  keyboardAvoider: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    maxHeight: '85%',
    overflow: 'hidden',
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  title: { ...typography.h3, color: colors.foreground },
});
