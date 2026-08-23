import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { onBannerSize, onBannerReserveTop, onBannerFailed } from './admob';
import { useFeature } from './premium';
import { useAdsSuppressed } from './adSuppress';

// アダプティブ・アンカーバナーの最大高さ(dp)= 90。ネイティブ実測(reserveTop)が届くまでの
// 暫定フォールバック用。SizeChanged が未発火/小さい値でも、最低これだけ確保しておく。
const BANNER_FALLBACK = 90;
// バナー下端とヘッダーコンテンツの間に空ける余白(px)。
const BANNER_GAP = 12;
// 直近に実測した reserveTop の保存キー。次回以降は初回フレームから正しい余白を確保でき、
// 「広告ロード後に一段下がる」ガクつきを無くす（バナー下端位置は端末ごとにほぼ一定）。
const RESERVE_CACHE_KEY = 'fan_ad_reserve_top';
// 直近に実測したバナーの高さ。**iOSには reserveTop を送る仕組みが無い**（あのパッチは
// Android のファイルにしか当たっていない）ので、iOSはこちらが初回フレームの拠り所になる。
const BANNER_H_CACHE_KEY = 'fan_ad_banner_h';

function loadCachedNumber(key: string): number | null {
  try {
    const v = localStorage.getItem(key);
    if (!v) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

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
  // 実測が来るまでの暫定値。前回の実測があればそれを使う（初回フレームから正しい余白になる）
  const [adH, setAdH] = useState(
    () => (Capacitor.isNativePlatform() ? loadCachedNumber(BANNER_H_CACHE_KEY) : null) ?? BANNER_FALLBACK,
  );
  const [reserveTop, setReserveTop] = useState<number | null>(() =>
    Capacitor.isNativePlatform() ? loadCachedReserve() : null,
  );
  // 広告が返ってこなかった（在庫なし・新しいユニットで未配信など）。
  // 拾わないと「広告は出ないのに場所だけ空いている」状態が残る。
  const [failed, setFailed] = useState(false);
  // 有料会員はバナーを出さない（プレミアム特典「広告非表示」）。判定はキャッシュ即答なので
  // 起動直後に一瞬バナーが出ることはない。あとからサーバー確定で有料に変わったときは
  // 依存配列の変化でエフェクトが再実行され、クリーンアップの hideBanner() が効く。
  const premiumNoAds = useFeature('noAds');
  // チュートリアルなど「今は出さない」画面。バナーはWebViewの外に出るので、
  // 上に画面を重ねても隠れない＝ネイティブ側に消してもらう必要がある。
  // ⚠️ `||` の右に置くと短絡でフックが呼ばれない回があり、フックの順序が崩れる
  const suppressed = useAdsSuppressed();
  const noAds = premiumNoAds || suppressed;

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || noAds) return;
    let alive = true;
    let sizeHandle: PluginListenerHandle | null = null;
    let reserveHandle: PluginListenerHandle | null = null;
    let failHandle: PluginListenerHandle | null = null;
    (async () => {
      sizeHandle = await onBannerSize((h) => {
        if (!alive || h <= 0) return;
        // ⚠️ ここで Math.max(h, BANNER_FALLBACK) をしてはいけない。
        //    **実測より大きい値に引き上げてしまい、測った意味が無くなる**。
        //    iPhone SE では実測50pxが90pxに持ち上がり、バナーの下が約52px余っていた
        //    （Androidは reserveTop が優先されるので隠れていた）。
        //    フォールバックは「まだ何も測れていないとき」だけの初期値。
        setAdH(h);
        try { localStorage.setItem(BANNER_H_CACHE_KEY, String(Math.round(h))); } catch { /* 保存できなくても表示は続く */ }
        setFailed(false);   // 次の更新で表示できたら余白を戻す
      });
      failHandle = await onBannerFailed(() => { if (alive) setFailed(true); });
      reserveHandle = await onBannerReserveTop((px) => {
        if (!alive || px <= 0) return;
        setReserveTop(px);
        try { localStorage.setItem(RESERVE_CACHE_KEY, String(Math.round(px))); } catch { /* ignore */ }
      });
    })();
    // ⚠️ ここで showBanner / hideBanner を呼ばないこと。
    // 表示の可否は AdBannerController（App.tsx）がルートを見て一元的に決める。
    // 画面ごとに出し入れしていたときは、オンボーディング終了時に
    // 「抑制の解除」と「ホームの離脱」が同時に起きて show が hide を追い越し、
    // 広告を出さないはずの /premium にバナーが残って×ボタンを覆っていた。
    return () => {
      alive = false;
      sizeHandle?.remove();
      reserveHandle?.remove();
      failHandle?.remove();
    };
  }, [noAds]);

  // 非ネイティブ（Web）・有料会員・広告が出せなかったときは、ステータスバー分の余白だけ返す
  if (!Capacitor.isNativePlatform() || noAds || failed) {
    return `calc(var(--sat) + ${BANNER_GAP}px)`;
  }
  // ネイティブ実測（今回 or キャッシュ）が最優先。env非依存で機種差に強い。
  if (reserveTop != null) {
    return `${Math.round(reserveTop) + BANNER_GAP}px`;
  }
  // 初回のみの暫定: ステータスバー実測(var(--sat)) + バナー高さ + gap。
  return `calc(var(--sat) + ${adH + BANNER_GAP}px)`;
}
