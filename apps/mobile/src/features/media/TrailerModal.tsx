import { useEffect } from 'react';
import { AppState, Modal, Pressable, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { themedStyles, useThemeColors, radii, spacing } from '@/theme';
import { getMobileSiteUrl } from '@/platform/config';
import { isAllowedTrailerNavigation, youtubeEmbedHtml } from './youtube';

// Let the request guard reject outside links; a whitelist rejection opens the system browser.
const ORIGIN_WHITELIST = ['*'];
const FALLBACK_ORIGIN = 'https://clube-do-jogo-coral.vercel.app';

export function TrailerModal({ visible, url, title, onClose }: {
  visible: boolean;
  url: string | null | undefined;
  title: string;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const documentOrigin = getMobileSiteUrl() ?? FALLBACK_ORIGIN;
  const embedHtml = youtubeEmbedHtml(url, documentOrigin);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active') onClose();
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  if (!visible || !embedHtml) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop} accessible={false}>
        <View style={styles.frame} accessible={false}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar trailer"
            hitSlop={12}
            style={styles.close}
          >
            <Ionicons name="close" size={22} color={colors.white} />
          </Pressable>
          <WebView
            key={url}
            source={{ html: embedHtml, baseUrl: documentOrigin }}
            style={styles.webview}
            originWhitelist={ORIGIN_WHITELIST}
            onShouldStartLoadWithRequest={request => isAllowedTrailerNavigation(request.url, documentOrigin)}
            javaScriptEnabled
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
            incognito
            domStorageEnabled={false}
            cacheEnabled={false}
            setSupportMultipleWindows={false}
            accessibilityLabel={`Trailer de ${title}`}
          />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = themedStyles(colors => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.black },
  webview: { flex: 1, backgroundColor: colors.black },
  close: { position: 'absolute', right: spacing.sm, top: spacing.sm, zIndex: 1, width: 36, height: 36, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' },
}));
