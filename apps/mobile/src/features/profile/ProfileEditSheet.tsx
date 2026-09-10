import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import type { Profile } from '@clube-do-jogo/domain';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';

export function ProfileEditSheet({ visible, profile, saving, error, onClose, onSave }: {
  visible: boolean;
  profile: Profile;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (input: { name: string; bio: string }) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const [name, setName] = useState(profile.name || '');
  const [bio, setBio] = useState(profile.bio || '');

  return (
    <Sheet visible={visible} title="Editar perfil" onClose={onClose} avoidKeyboard>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarRow}>
          <Avatar uri={profile.avatar_url} crop={profile.avatar_crop} name={name || profile.name} size={56} />
          <Text style={styles.avatarHint}>Escolha um avatar pela galeria ou personagens de um jogo.</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Nome</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Seu nome"
            placeholderTextColor={colors.zinc600}
            style={styles.input}
            selectTextOnFocus
            testID="profile-name"
            accessibilityLabel="Nome"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Sobre você</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Fale um pouco sobre você"
            placeholderTextColor={colors.zinc600}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.textarea]}
            selectTextOnFocus
            testID="profile-bio"
            accessibilityLabel="Sobre você"
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={saving ? 'Salvando…' : 'Salvar alterações'}
          loading={saving}
          onPress={() => onSave({ name, bio })}
        />
      </ScrollView>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  content: { padding: spacing.lg, gap: spacing.lg },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarHint: { flex: 1, ...typography.small, color: colors.zinc500 },
  field: { gap: spacing.xs },
  label: { ...typography.tiny, color: colors.zinc500 },
  input: {
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 14,
  },
  textarea: { minHeight: 84, textAlignVertical: 'top', paddingTop: spacing.sm },
  error: { color: colors.red300, fontSize: 11, fontWeight: '600' },
}));
