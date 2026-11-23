import { Linking, Pressable, Text } from 'react-native';
import { useCatalogAttribution } from '@/state/catalog-queries';
import { spacing, themedStyles, typography } from '@/theme';

/** Os termos da RAWG exigem um link ativo em toda tela que mostra dados dela. */
export function CatalogAttribution() {
  const styles = useStyles();
  const attribution = useCatalogAttribution().data;
  if (!attribution) return null;
  return (
    <Pressable
      onPress={() => { void Linking.openURL(attribution.url); }}
      accessibilityRole="link"
      accessibilityLabel={`Abrir ${attribution.name}, fonte dos dados de jogos`}
    >
      <Text style={styles.text}>Dados de jogos por {attribution.name}.</Text>
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
