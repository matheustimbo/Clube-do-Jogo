import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { useApp } from '@/state/app-provider';
import { colors, radii, spacing, typography } from '@/theme';

export default function SettingsScreen() {
  const { profile, userId, isDemo, signOut } = useApp();

  return (
    <Screen>
      <AppHeader title="Configurações" />

      <View style={styles.card}>
        <View style={styles.profileRow}>
          <Avatar uri={profile?.avatar_url ?? null} name={profile?.name ?? 'Membro'} size={56} />
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{profile?.name ?? 'Membro'}</Text>
            {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}
            {isDemo ? (
              <View style={styles.demoBadge}>
                <Ionicons name="flask-outline" size={11} color={colors.amber400} />
                <Text style={styles.demoBadgeText}>Modo demonstração</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Conta</Text>
        <InfoRow label="ID do membro" value={userId ?? '—'} />
      </View>

      <View style={styles.noticeCard}>
        <Ionicons name="information-circle-outline" size={16} color={colors.zinc500} />
        <Text style={styles.noticeText}>
          Preferências de tema, notificações push e escala de avaliação ainda não estão disponíveis no app móvel e chegarão em uma
          atualização futura.
        </Text>
      </View>

      <Button
        label="Sair da conta"
        variant="danger"
        icon={<Ionicons name="log-out-outline" size={16} color={colors.white} />}
        onPress={() => void signOut().catch(error => {
          Alert.alert('Não foi possível sair', error instanceof Error ? error.message : 'Tente novamente.');
        })}
        accessibilityLabel="Sair da conta"
      />
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profileInfo: { flex: 1, gap: 2 },
  name: { ...typography.h3, color: colors.foreground },
  email: { ...typography.small, color: colors.zinc500 },
  demoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.full, backgroundColor: 'rgba(251,191,36,0.12)' },
  demoBadgeText: { fontSize: 10, fontWeight: '800', color: colors.amber400 },
  cardTitle: { ...typography.h3, color: colors.foreground },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  infoLabel: { ...typography.small, color: colors.zinc500 },
  infoValue: { ...typography.small, color: colors.zinc300, flexShrink: 1, textAlign: 'right' },
  noticeCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noticeText: { flex: 1, ...typography.tiny, color: colors.zinc500, lineHeight: 16 },
});
