import type { CapacitorConfig } from '@capacitor/cli';

// Android はリモートURLのWebView、iOS は dist を同梱する。
//
// Android（リモート）: アプリは fanhive.jp を開くので、Web側の変更が再ビルドなしで即反映される。
//   独自ドメインに固定してあるので、Vercelのデプロイ先が変わってもアプリは死なない。
//
// iOS（同梱）: App Store の審査は初回が一番厳しく、リモートWebViewは 4.2（最低限の機能）と
//   2.5.2（審査後に中身が変わる）の両方で議論になりうるため、変数を減らす判断。
//   代償として iOS だけフロントが古いまま取り残されるので、**api/ の後方互換を壊さないこと**。
//
// この分岐は cap の CLI 実行時に評価され、結果が各プラットフォームの
// capacitor.config.json に書き出される。プラットフォームは cap の引数から判定する
// （例: `npx cap sync ios`）。判定を間違えるとAndroidが更新できないアプリになるので、
// **プラットフォームを省いた `npx cap sync` は使わないこと**（npm run sync:ios / sync:android を使う）。
//
// 実機で見た目を確かめるとき（デプロイ前のプレビューを WebView で開きたいとき）は
//   CAP_URL=https://…-git-design-panel-….vercel.app npm run sync:android
// のように差し替えて debug APK を作る。**本番の既定値は fanhive.jp のまま**なので、
// 環境変数を渡さない限り挙動は一切変わらない。
const target = process.argv.find((a) => a === 'ios' || a === 'android');
const remote = process.env.CAP_REMOTE ? process.env.CAP_REMOTE === '1' : target !== 'ios';
const remoteUrl = process.env.CAP_URL || 'https://fanhive.jp';

const config: CapacitorConfig = {
  appId: 'jp.llp.fanhive',
  appName: 'FanHive',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(remote ? { url: remoteUrl } : {}),
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#0e0e10',
    },
    // ローカル通知もプッシュと同じステータスバーアイコンにする（アイコンが2種類あると別アプリに見える）
    LocalNotifications: {
      smallIcon: 'ic_stat_fanhive',
      iconColor: '#FBBF00',
    },
  },
};

export default config;
