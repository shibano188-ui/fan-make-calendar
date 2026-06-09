import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';

const BANNER_AD_ID = 'ca-app-pub-3561970163550872/2802130602';

export async function initAdMob() {
  if (!Capacitor.isNativePlatform()) return;
  await AdMob.initialize();
}

function getAdMargin(): number {
  const spacer = document.getElementById('ad-spacer');
  const dpr = window.devicePixelRatio || 2;
  const OFFSET_DP = 30; // ステータスバー分のオフセット補正
  if (spacer) {
    const rect = spacer.getBoundingClientRect();
    return Math.round((rect.top + OFFSET_DP) * dpr);
  }
  return Math.round((74 + OFFSET_DP) * dpr);
}

export async function showBanner() {
  if (!Capacitor.isNativePlatform()) return;
  try { await AdMob.removeBanner(); } catch (_) { /* ignore */ }
  await AdMob.showBanner({
    adId: BANNER_AD_ID,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.TOP_CENTER,
    margin: getAdMargin(),
    isTesting: false,
  });
}

export async function hideBanner() {
  if (!Capacitor.isNativePlatform()) return;
  try { await AdMob.removeBanner(); } catch (_) { /* ignore */ }
}
