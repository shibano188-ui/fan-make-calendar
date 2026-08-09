import { useSyncExternalStore } from 'react';
import { SHOW_ONBOARDING, ONBOARDING_KEY } from './constants';

// 「今はバナー広告を出さない」を一時的に立てるための小さなスイッチ。
//
// 有料会員の広告非表示（premium.ts の noAds）とは別物。あちらは会員状態で決まる恒久的なもの、
// こちらは画面の都合で一時的に伏せたいとき（初回起動のチュートリアルなど）に使う。
// AdMobのバナーは**WebViewの外側**に出るネイティブのビューなので、CSSでは隠せない。
// 出す・消すはネイティブ側に頼むしかなく、その判断をここに集約する。

// 初回起動（チュートリアルを出す回）は**最初の1フレームから**伏せておく。
// Onboarding のマウント後にONにすると、その一瞬だけバナーが出てしまう。
let suppressed = (() => {
  try { return SHOW_ONBOARDING && !localStorage.getItem(ONBOARDING_KEY); } catch { return false; }
})();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** バナーを伏せる／戻す。表示する側（useAdBanner）が購読して即座に反応する。 */
export function setAdsSuppressed(next: boolean): void {
  if (suppressed === next) return;
  suppressed = next;
  listeners.forEach((l) => l());
}

export function useAdsSuppressed(): boolean {
  return useSyncExternalStore(subscribe, () => suppressed, () => false);
}
