import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { showBanner, hideBanner, onBannerSize } from './admob';
import { getSafeTop } from './safeArea';

// アダプティブ・アンカーバナーの最大高さ(dp)= 90。SizeChanged が当てにならない/未発火でも
// この高さ分を必ず確保すれば、実バナー(最大90px)に被らない。実測値が大きければそれを使う。
const BANNER_FALLBACK = 90;
// バナーをステータスバー直下より少し上に詰める量(px)。0 にすると直下、増やすほど上。
// ステータスバーに被らないよう getSafeTop() を下限 0 でクランプする。
const BANNER_TOP_NUDGE = 12;

/**
 * ホーム/探すで AdMob バナーをステータスバー直下に表示し、
 * ヘッダーの paddingTop に加算すべき高さ(px)を返す再利用フック。
 * ネイティブでは最低 BANNER_FALLBACK を確保（SizeChanged の遅延/未発火対策）。
 * Web版・非ネイティブでは 0 を返す（余白を足さない）。
 */
export function useAdBanner(): number {
  const [adH, setAdH] = useState(0);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let alive = true;
    let handle: PluginListenerHandle | null = null;
    (async () => {
      handle = await onBannerSize((h) => { if (alive && h > 0) setAdH(h); });
      showBanner(Math.max(0, getSafeTop() - BANNER_TOP_NUDGE));
    })();
    return () => { alive = false; handle?.remove(); hideBanner(); };
  }, []);
  return Capacitor.isNativePlatform() ? Math.max(adH, BANNER_FALLBACK) : 0;
}
