import type { ExpoConfig } from 'expo/config';

const isProduction = process.env.EAS_BUILD_PROFILE === 'production';
const applicationId = process.env.EXPO_APPLICATION_ID || 'com.clubedojogo.mobile.dev';

if (isProduction && !process.env.EXPO_APPLICATION_ID) {
  throw new Error('Defina EXPO_APPLICATION_ID antes de gerar um build de produção.');
}

const config: ExpoConfig = {
  name: 'Clube do Jogo',
  slug: 'clube-do-jogo',
  version: '0.1.0',
  scheme: 'clubedojogo',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: true,
    bundleIdentifier: applicationId,
  },
  android: {
    package: applicationId,
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
