import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '@/state/app-provider';
import { clearNavIntent, consumeNavIntent } from '@/lib/nav-intent';
import { colors } from '@/theme';

const DEFAULT_HOME = '/(app)/(tabs)/jogo-do-mes' as const;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { ready, userId } = useApp();
  const router = useRouter();
  const previousUserId = useRef(userId);

  useEffect(() => {
    if (!ready || !userId) return;
    const target = consumeNavIntent();
    router.replace(target ?? DEFAULT_HOME);
  }, [ready, userId, router]);

  useEffect(() => {
    const previousId = previousUserId.current;
    previousUserId.current = userId;
    if (ready && previousId && !userId) clearNavIntent();
  }, [ready, userId]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth/callback" />
        <Stack.Protected guard={ready && !userId}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={ready && Boolean(userId)}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
