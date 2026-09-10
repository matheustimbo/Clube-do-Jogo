import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect, useGlobalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { completeAuthCallback } from '@/platform/auth';
import { colors, spacing, typography } from '@/theme';

// Expo Router entrega os parâmetros do deep link já separados; reconstruímos uma URL
// com a query string original para o contrato completeAuthCallback(url), que trata
// ausência de "code" no lado da plataforma. Aqui deduplicamos por chave da query
// (o "code" muda a cada novo deep link), não por uma flag permanente, para permitir
// um novo código recebido enquanto a tela permanece aberta após um erro, sem repetir
// a troca para o mesmo código em execuções duplicadas do StrictMode.
export default function AuthCallbackScreen() {
  const params = useGlobalSearchParams<Record<string, string | string[]>>();
  const router = useRouter();
  const [status, setStatus] = useState<'pending' | 'done' | 'error'>('pending');
  const [message, setMessage] = useState('');
  const processedKey = useRef<string | null>(null);

  const queryString = useMemo(() => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string') query.set(key, value);
      else if (Array.isArray(value) && typeof value[0] === 'string') query.set(key, value[0]);
    });
    return query.toString();
  }, [params]);
  // Chave estável mesmo sem parâmetros, para que a ausência de "code" ainda dispare
  // completeAuthCallback uma única vez (a plataforma trata esse caso como erro).
  const queryKey = queryString || '(sem parâmetros)';

  useEffect(() => {
    if (processedKey.current === queryKey) return;
    processedKey.current = queryKey;
    setStatus('pending');
    setMessage('');
    const url = `clubedojogo://auth/callback${queryString ? `?${queryString}` : ''}`;
    completeAuthCallback(url)
      .then(() => setStatus('done'))
      .catch(error => {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Não foi possível concluir o login.');
      });
  }, [queryKey, queryString]);

  if (status === 'done') return <Redirect href="/(app)/(tabs)/jogo-do-mes" />;

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
          <Text style={styles.label}>Concluindo login…</Text>
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
