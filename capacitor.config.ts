import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.davidwis.moonlightmix',
  appName: 'Moonlight Mix',
  webDir: 'dist',
  backgroundColor: '#0b0820',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile'
  },
  android: {
    backgroundColor: '#0b0820'
  }
};

export default config;
