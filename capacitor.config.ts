import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'jp.llp.fanhive',
  appName: 'FanHive',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    url: 'https://fan-make-calendar.vercel.app',
  },
};

export default config;
