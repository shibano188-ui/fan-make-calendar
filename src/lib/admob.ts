import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents } from '@capacitor-community/admob';

const BANNER_AD_ID = 'ca-app-pub-3561970163550872/4318089302';

export async function initAdMob() {
  if (!Capacitor.isNativePlatform()) return;
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
