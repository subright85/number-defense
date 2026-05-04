import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.numberdefense.game',
  appName: 'Number Defense',
  webDir: 'dist',
  android: {
    backgroundColor: '#0a0a1a',
  },
  ios: {
    backgroundColor: '#0a0a1a',
    contentInset: 'always',
    preferredContentMode: 'mobile',
  },
  plugins: {
    ScreenOrientation: {
      default: 'portrait',
    },
  },
};

export default config;
