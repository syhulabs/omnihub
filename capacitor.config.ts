import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.syhuinc.omnihub',
  appName: 'Omni Hub',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      // apple.com: Sign in with Apple, offered on iPhone only (App Store guideline 4.8).
      providers: ['google.com', 'apple.com'],
    },
  },
};

export default config;
