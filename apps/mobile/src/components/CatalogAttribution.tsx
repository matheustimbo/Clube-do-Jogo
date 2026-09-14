import { Linking, Pressable, Text } from 'react-native';
import { getCatalogProvider } from '@/platform/config';
import { spacing, themedStyles, typography } from '@/theme';

/** Os termos da RAWG exigem um link ativo em toda tela que mostra dados dela. */
export function CatalogAttribution() {
  const styles = useStyles();
  if (getCatalogProvider() !== 'rawg') return null;
  return (
    <Pressable
      onPress={() => { void Linking.openURL('https://rawg.io'); }}
      accessibilityRole="link"
      accessibilityLabel="Abrir rawg.io, fonte dos dados de jogos"
    >
      <Text style={styles.text}>Dados de jogos por RAWG.</Text>
    </Pressable>
  );
}

const useStyles = themedStyles(colors => ({
  text: {
    ...typography.tiny,
    color: colors.zinc500,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
}));
