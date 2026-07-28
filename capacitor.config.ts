import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'jp.llp.fanhive',
  appName: 'FanHive',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // アプリはこのURLをWebViewで開く（Web側の変更は再ビルドなしで反映される）。
    // 独自ドメインに固定しておくと、Vercelのプロジェクト名やデプロイURLが変わってもアプリが死なない。
    url: 'https://fanhive.jp',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#0e0e10',
    },
  },
};

export default config;
