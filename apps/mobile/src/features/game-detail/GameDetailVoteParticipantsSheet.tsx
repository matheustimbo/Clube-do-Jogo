import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '@/components/Sheet';
import { Avatar } from '@/components/Avatar';
import { voteReasonLabel } from '@/components/VoteReasonSheet';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import type { VoteChoice, VoteParticipant } from '@clube-do-jogo/domain';

const choices: Array<{ value: VoteChoice; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'would_not_play', label: 'Não', icon: 'thumbs-down' },
  { value: 'would_play', label: 'Jogaria', icon: 'thumbs-up' },
];

export function GameDetailVoteParticipantsSheet({ visible, profiles, initialChoice, onClose }: {
  visible: boolean;
  profiles: Record<VoteChoice, VoteParticipant[]>;
  initialChoice: VoteChoice;
  onClose: () => void;
}) {
  const [active, setActive] = useState<VoteChoice>(initialChoice);
  const colors = useThemeColors();
  const styles = useStyles();
  const router = useRouter();
  const people = profiles[active];

  return (
    <Sheet visible={visible} title="Escolhas do clube" onClose={onClose}>
      <View style={styles.tabs}>
        {choices.map(choice => {
          const selected = choice.value === active;
          return (
            <Pressable
              key={choice.value}
              onPress={() => setActive(choice.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Ionicons name={choice.icon} size={14} color={selected ? colors.violet300 : colors.zinc500} />
              <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{choice.label} · {profiles[choice.value].length}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {people.length === 0 ? (
          <Text style={styles.empty}>Ninguém escolheu esta opção.</Text>
        ) : people.map(person => (
          <Pressable
            key={person.id}
            onPress={() => { onClose(); router.push({ pathname: '/(app)/perfil/[id]', params: { id: person.id } }); }}
            accessibilityRole="button"
            accessibilityLabel={`Ver perfil de ${person.name || 'Membro'}`}
            style={styles.person}
          >
            <Avatar uri={person.avatar_url} crop={person.avatar_crop} name={person.name} size={44} />
            <View style={styles.personInfo}>
              <Text style={styles.personName} numberOfLines={1}>{person.name || 'Membro'}</Text>
              {active === 'would_not_play' ? <Text style={styles.personReason} numberOfLines={2}>{voteReasonLabel(person.reason)}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.zinc600} />
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, height: 40, borderRadius: radii.lg, backgroundColor: colors.surfaceDeep },
  tabSelected: { backgroundColor: 'rgba(139,92,246,0.16)' },
  tabLabel: { fontSize: 11, fontWeight: '700', color: colors.zinc500 },
  tabLabelSelected: { color: colors.violet300 },
  list: { maxHeight: 420 },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  empty: { ...typography.small, color: colors.zinc600, textAlign: 'center', paddingVertical: spacing.xl },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.hairlineSoft, backgroundColor: colors.surfaceSofter, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 60 },
  personInfo: { flex: 1, gap: 2 },
  personName: { ...typography.small, color: colors.foreground, fontWeight: '800' },
  personReason: { fontSize: 10, fontWeight: '600', color: colors.red300 },
}));
