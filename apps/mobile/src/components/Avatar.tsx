import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '@/theme';
import { initials } from '@/lib/format';

export function Avatar({ uri, name, size = 40 }: { uri?: string | null; name?: string | null; size?: number }) {
  const dimension = { width: size, height: size, borderRadius: radii.full };
  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimension]} contentFit="cover" accessibilityLabel={`Avatar de ${name || 'membro'}`} />;
  }
  return (
    <View style={[styles.fallback, dimension]} accessibilityLabel={`Avatar de ${name || 'membro'}`}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.zinc800 },
  fallback: { backgroundColor: colors.zinc800, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hairline },
  initials: { color: colors.zinc300, fontWeight: '800' },
});
