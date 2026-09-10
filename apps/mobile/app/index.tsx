import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useApp } from '@/state/app-provider';
import { colors } from '@/theme';

export default function Index() {
  const { ready, userId } = useApp();

  if (!ready) {
    return (
      <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel="Carregando Clube do Jogo">
        <ActivityIndicator color={colors.violet400} size="large" />
      </View>
    );
  }

  return <Redirect href={userId ? '/(app)/(tabs)/jogo-do-mes' : '/(auth)/login'} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
