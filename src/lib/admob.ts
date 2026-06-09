import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';

const BANNER_AD_ID = 'ca-app-pub-3561970163550872/2802130602';
let bannerShown = false;

export async function initAdMob() {
  if (!Capacitor.isNativePlatform()) return;
  await AdMob.initialize();
}

function getAdMargin(): number {
  const spacer = document.getElementById('ad-spacer');
  if (spacer) {
    const rect = spacer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 2;
    return Math.round(rect.top * dpr);
  }
  // fallback: status bar(~30dp) + header(44dp) in physical pixels
  return Math.round(74 * (window.devicePixelRatio || 2));
}

export async function showBanner() {
  if (!Capacitor.isNativePlatform()) return;
  if (bannerShown) {
    await AdMob.resumeBanner();
  } else {
    await AdMob.showBanner({
      adId: BANNER_AD_ID,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.TOP_CENTER,
      margin: getAdMargin(),
      isTesting: false,
    });
    bannerShown = true;
  }
}

export async function hideBanner() {
  if (!Capacitor.isNativePlatform() || !bannerShown) return;
  await AdMob.hideBanner();
}
