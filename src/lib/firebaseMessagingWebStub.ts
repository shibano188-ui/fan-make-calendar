// `firebase/messaging` の代わりに読ませる空実装。
//
// @capacitor-firebase/messaging は **iOSネイティブでしか使わない**（Androidは
// @capacitor/push-notifications のまま）が、プラグインのWeb実装が
// `firebase/messaging` を静的にimportしているため、入れていないとWebビルドが落ちる。
// 本物の firebase パッケージ(約数百KB)をWeb用に抱える理由は無いので、
// vite.config.ts の alias でこのファイルに差し替えている。
//
// Web では pushSupported() が false を返すのでプラグインは呼ばれない。
// 万一呼ばれても「未対応」として静かに失敗する。

export async function isSupported(): Promise<boolean> {
  return false;
}

export function getMessaging(): never {
  throw new Error('firebase/messaging is not bundled for web');
}

export async function getToken(): Promise<string | null> {
  return null;
}

export async function deleteToken(): Promise<boolean> {
  return false;
}

export function onMessage(): () => void {
  return () => {};
}
