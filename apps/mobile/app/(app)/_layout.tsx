import { Stack } from 'expo-router';
import { colors } from '@/theme';
import { APP_STACK_ANCHOR } from '@/lib/nav-intent';

export const unstable_settings = { anchor: APP_STACK_ANCHOR };

export default function AppGroupLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: false,
        headerBackTitle: 'Voltar',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="jogos/[id]" options={{ title: 'Jogo' }} />
      <Stack.Screen name="perfil/[id]" options={{ title: 'Perfil' }} />
      <Stack.Screen name="configuracoes" options={{ title: 'Configurações' }} />
    </Stack>
  );
}
