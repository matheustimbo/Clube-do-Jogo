import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { completeAuthCallback } from '@/platform/auth';
import { useApp } from '@/state/app-provider';
import { colors, spacing, typography } from '@/theme';

const SESSION_WAIT_TIMEOUT_MS = 10_000;

type Status = 'exchanging' | 'waiting-session' | 'error';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const router = useRouter();
  const { ready, userId } = useApp();
  const [status, setStatus] = useState<Status>('exchanging');
  const [message, setMessage] = useState('');
  const processedKey = useRef<string | null>(null);
  const requestId = useRef(0);

  const queryString = useMemo(() => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string') query.set(key, value);
      else if (Array.isArray(value) && typeof value[0] === 'string') query.set(key, value[0]);
    });
    return query.toString();
  }, [params]);
  const queryKey = queryString || '(sem parâmetros)';

  useEffect(() => {
    if (processedKey.current === queryKey) return;
    processedKey.current = queryKey;
    const thisRequest = ++requestId.current;
    setStatus('exchanging');
    setMessage('');
    const url = `clubedojogo://auth/callback${queryString ? `?${queryString}` : ''}`;
    completeAuthCallback(url)
      .then(() => {
        if (requestId.current !== thisRequest) return;
        setStatus('waiting-session');
      })
      .catch(error => {
        if (requestId.current !== thisRequest) return;
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Não foi possível concluir o login.');
      });
  }, [queryKey, queryString]);

  useEffect(() => {
    if (status !== 'waiting-session' || (ready && userId)) return;
    const timer = setTimeout(() => {
      setStatus('error');
      setMessage('Login concluído, mas não foi possível confirmar sua sessão. Tente novamente.');
    }, SESSION_WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, ready, userId]);

  return (
    <View style={styles.container}>
      {status === 'error' ? (
        <>
          <Text style={styles.errorText} accessibilityRole="alert">{message}</Text>
          <Button label="Voltar ao login" variant="secondary" onPress={() => router.replace('/(auth)/login')} accessibilityLabel="Voltar ao login" />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.violet400} size="large" />
          <Text style={styles.label}>{status === 'waiting-session' ? 'Confirmando sessão…' : 'Concluindo login…'}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.background, padding: spacing.xl },
  label: { ...typography.small, color: colors.zinc400 },
  errorText: { ...typography.body, color: colors.red300, textAlign: 'center' },
});
