import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents } from '@capacitor-community/admob';

// バナーの広告ユニットはプラットフォームごとに別物。Androidのユニットを
// iOSで使っても広告は返ってこない。
// ⚠️ iOSは Google の開発用テストユニット。AdMob管理画面で iOS アプリと
//    バナーユニットを作って差し替えること（Info.plist の GADApplicationIdentifier も同様）。
const BANNER_AD_ID_ANDROID = 'ca-app-pub-3561970163550872/4318089302';
const BANNER_AD_ID_IOS = 'ca-app-pub-3940256099942544/2934735716';
const BANNER_AD_ID = Capacitor.getPlatform() === 'ios' ? BANNER_AD_ID_IOS : BANNER_AD_ID_ANDROID;

export async function initAdMob() {
  if (!Capacitor.isNativePlatform()) return;
  // iOS: 広告を出す前にトラッキングの許可を聞く（ATT）。聞かずに広告を出すと審査で落ちる。
  // 断られてもパーソナライズされないだけで広告自体は出るので、結果は見ない。
  if (Capacitor.getPlatform() === 'ios') {
    try {
      const { status } = await AdMob.trackingAuthorizationStatus();
      if (status === 'notDetermined') await AdMob.requestTrackingAuthorization();
    } catch { /* ATTが使えない環境でも広告は出す */ }
  }
  await AdMob.initialize();
}

export async function showBanner(margin = 0) {
  if (!Capacitor.isNativePlatform()) return;
  await AdMob.showBanner({
    adId: BANNER_AD_ID,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.TOP_CENTER,
    margin,
    isTesting: false,
  });
}

export async function hideBanner() {
  if (!Capacitor.isNativePlatform()) return;
  await AdMob.hideBanner();
}

/** アダプティブバナーの実測高さ(px)を購読する。Web版では何もしない。 */
export async function onBannerSize(
  cb: (height: number) => void,
): Promise<PluginListenerHandle | null> {
  if (!Capacitor.isNativePlatform()) return null;
  return AdMob.addListener(
    BannerAdPluginEvents.SizeChanged,
    (info: { width: number; height: number }) => cb(info.height),
  );
}

/**
 * ネイティブが実測した「バナー下端の位置（WebView上端からのCSS px）」を購読する。
 * この値をそのままヘッダーの paddingTop に使えば、env(safe-area-inset-top) が
 * 機種によって当てにならなくても（例: Android 15 の一部WebViewで0を返す）確実に
 * バナーとコンテンツが被らない。Web版では何もしない。
 */
export async function onBannerReserveTop(
  cb: (reserveTopPx: number) => void,
): Promise<PluginListenerHandle | null> {
  if (!Capacitor.isNativePlatform()) return null;
  // カスタムイベント名（プラグインの型定義には無いが、実行時は文字列で購読可能）。
  // addListener はイベント名ごとにオーバーロードされているため any で回避する。
  return (AdMob.addListener as unknown as (
    eventName: string,
    cb: (info: { reserveTop: number }) => void,
  ) => Promise<PluginListenerHandle>)(
    'bannerReserveTop',
    (info) => cb(info.reserveTop),
  );
}
