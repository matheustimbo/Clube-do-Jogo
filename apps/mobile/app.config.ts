import type { ExpoConfig } from 'expo/config';

const variant = process.env.APP_VARIANT ?? 'development';
const isDistributed = variant === 'preview' || variant === 'production';
const applicationId = process.env.EXPO_APPLICATION_ID || 'com.clubedojogo.mobile.dev';
const localHttp = process.env.EXPO_LOCAL_HTTP === '1';

if (!['development', 'preview', 'production'].includes(variant)) {
  throw new Error('APP_VARIANT deve ser development, preview ou production.');
}
if (isDistributed && !process.env.EXPO_APPLICATION_ID) {
  throw new Error('Defina EXPO_APPLICATION_ID antes de gerar preview ou produção.');
}
if (isDistributed && localHttp) {
  throw new Error('EXPO_LOCAL_HTTP só pode ser usado na variante development.');
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
  updates: { enabled: false },
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
    ['expo-build-properties', { android: { usesCleartextTraffic: localHttp } }],
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false, enableBackgroundRecording: false }],
    ['expo-notifications', { defaultChannel: 'default', color: '#8b5cf6', enableBackgroundRemoteNotifications: false }],
    ['expo-image-picker', { photosPermission: 'Escolha imagens para suas anotações privadas.', cameraPermission: false, microphonePermission: false }],
    ['expo-splash-screen', { backgroundColor: '#0c0a13', image: './assets/icon.png' }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
