import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { showBanner, hideBanner, onBannerSize, onBannerReserveTop } from './admob';

// アダプティブ・アンカーバナーの最大高さ(dp)= 90。ネイティブ実測(reserveTop)が届くまでの
// 暫定フォールバック用。SizeChanged が未発火/小さい値でも、最低これだけ確保しておく。
const BANNER_FALLBACK = 90;
// バナー下端とヘッダーコンテンツの間に空ける余白(px)。
const BANNER_GAP = 12;
// 直近に実測した reserveTop の保存キー。次回以降は初回フレームから正しい余白を確保でき、
// 「広告ロード後に一段下がる」ガクつきを無くす（バナー下端位置は端末ごとにほぼ一定）。
const RESERVE_CACHE_KEY = 'fan_ad_reserve_top';

function loadCachedReserve(): number | null {
  try {
    const v = localStorage.getItem(RESERVE_CACHE_KEY);
    if (!v) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * ホーム/探すで AdMob バナーをステータスバー直下に表示し、
 * ヘッダーの paddingTop に指定すべき CSS 値を返す再利用フック。
 *
 * ネイティブは `bannerReserveTop` イベントで「バナー下端の実位置(WebView上端からのpx)」を
 * 送ってくる。これが届いたら `${reserveTop + gap}px` を返す（env非依存）。値は localStorage に
 * キャッシュし、次回以降は初回フレームから使う（広告ロード待ちのガクつき解消）。
 * まだ一度も測っていない初回のみ env/var(--sat) ベースのフォールバックで暫定確保する。
 * env(safe-area-inset-top) は当てにならない端末があるため、ステータスバー分は var(--sat)
 * （ネイティブが実測して注入）を使う。Web版・非ネイティブではバナー無しの余白のみ。
 */
export function useAdBanner(): string {
  const [adH, setAdH] = useState(BANNER_FALLBACK);
  const [reserveTop, setReserveTop] = useState<number | null>(() =>
    Capacitor.isNativePlatform() ? loadCachedReserve() : null,
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let alive = true;
    let sizeHandle: PluginListenerHandle | null = null;
    let reserveHandle: PluginListenerHandle | null = null;
    (async () => {
      sizeHandle = await onBannerSize((h) => { if (alive && h > 0) setAdH(Math.max(h, BANNER_FALLBACK)); });
      reserveHandle = await onBannerReserveTop((px) => {
        if (!alive || px <= 0) return;
        setReserveTop(px);
        try { localStorage.setItem(RESERVE_CACHE_KEY, String(Math.round(px))); } catch { /* ignore */ }
      });
      // nudge 0 = ステータスバー直下にフル表示（ステータスバーへ食い込ませない）。
      showBanner(0);
    })();
    return () => {
      alive = false;
      sizeHandle?.remove();
      reserveHandle?.remove();
      hideBanner();
    };
  }, []);

  if (!Capacitor.isNativePlatform()) {
    return `calc(var(--sat) + ${BANNER_GAP}px)`;
  }
  // ネイティブ実測（今回 or キャッシュ）が最優先。env非依存で機種差に強い。
  if (reserveTop != null) {
    return `${Math.round(reserveTop) + BANNER_GAP}px`;
  }
  // 初回のみの暫定: ステータスバー実測(var(--sat)) + バナー高さ + gap。
  return `calc(var(--sat) + ${adH + BANNER_GAP}px)`;
}
