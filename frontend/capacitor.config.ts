import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.theleadlab.app',
  appName: 'LeadLab',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      'https://api.the-leadlab.com',
      'https://the-leadlab.com',
      'https://www.the-leadlab.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
