import type { ExpoConfig } from 'expo/config';

const profileVariant = process.env.EAS_BUILD_PROFILE?.replace(/-simulator$/, '');
const variant = process.env.APP_VARIANT ?? profileVariant ?? 'development';
const isDistributed = variant === 'preview' || variant === 'production';
const applicationId = process.env.EXPO_APPLICATION_ID || 'com.clubedojogo.mobile.dev';
const projectId = process.env.EXPO_EAS_PROJECT_ID;

if (!['development', 'preview', 'production'].includes(variant)) {
  throw new Error('APP_VARIANT deve ser development, preview ou production.');
}
if (profileVariant && variant !== profileVariant) {
  throw new Error('APP_VARIANT precisa corresponder ao perfil EAS selecionado.');
}
if (isDistributed && (!process.env.EXPO_APPLICATION_ID || !projectId)) {
  throw new Error('Defina EXPO_APPLICATION_ID e EXPO_EAS_PROJECT_ID antes de gerar preview ou produção.');
}
if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
  throw new Error('EXPO_EAS_PROJECT_ID deve ser o UUID do projeto EAS confirmado.');
}

const config: ExpoConfig = {
  name: 'Clube do Jogo',
  slug: 'clube-do-jogo',
  version: '0.1.0',
  scheme: 'clubedojogo',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    enabled: isDistributed,
    ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
  },
  ...(projectId ? { extra: { eas: { projectId } } } : {}),
  ios: {
    supportsTablet: true,
    bundleIdentifier: applicationId,
    buildNumber: '1',
  },
  android: {
    package: applicationId,
    versionCode: 1,
  },
  plugins: [
    'expo-router',
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false, enableBackgroundRecording: false }],
    ['expo-notifications', { defaultChannel: 'default', color: '#8b5cf6', enableBackgroundRemoteNotifications: false }],
    ['expo-image-picker', { photosPermission: 'Escolha imagens para suas anotações privadas.', cameraPermission: false, microphonePermission: false }],
    ['expo-splash-screen', { backgroundColor: '#0c0a13', image: './assets/icon.png' }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
