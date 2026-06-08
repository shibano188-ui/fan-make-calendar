import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';

const BANNER_AD_ID = 'ca-app-pub-3561970163550872/2802130602';

export async function initAdMob() {
  if (!Capacitor.isNativePlatform()) return;
  await AdMob.initialize();
}

export async function showBanner() {
  if (!Capacitor.isNativePlatform()) return;
  await AdMob.showBanner({
    adId: BANNER_AD_ID,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 0,
    isTesting: false,
  });
}

export async function hideBanner() {
  if (!Capacitor.isNativePlatform()) return;
  await AdMob.hideBanner();
}
