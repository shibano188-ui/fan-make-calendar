import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import LaunchLogo, { LAUNCH_LOGO_MS, prefersReducedMotion } from './LaunchLogo';
import { setSplashAdsSuppressed } from '../lib/adSuppress';
import { SHOW_ONBOARDING, ONBOARDING_KEY, TOUR_STEP_KEY } from '../lib/constants';

// 毎回の起動画面（2026-09-30 柴野「出来がいいので毎回の起動時に出したい。読み込みも短く感じる」）。
// 黒地にロゴが組み上がり（LaunchLogo・約1.1秒）、ふわっと消えてアプリに入る。その間、下のホームは普通に読み込みを進める。
//
// 出す条件:
//   - アプリ（iOS/Android）: 起動のたびに（復帰では出さない＝このコンポーネントは起動時に1回だけ作られる）
//   - ブラウザ: 開いたタブで1回だけ（ページを移るたびに出さない）
//   - 共有から開いたとき（/post?url=…）は出さない。すぐに投稿画面を見せたいので
// ⚠ Android はこの Web をそのまま開いている。消えなくなるとアプリが使えなくなるので、
//    どんな場合も HARD_LIMIT_MS で必ず消す（タイマーだけで消す。読み込みの完了は待たない）。

const BG = '#0e0e10';  // capacitor.config の SplashScreen と同じ黒（ネイティブの起動画面から途切れずにつなぐ）
const SEEN_KEY = 'fan_launch_splash_seen';
const FADE_MS = 260;
const HARD_LIMIT_MS = 2500;

function shouldShow(): boolean {
  try {
    const { search } = window.location;
    if (/[?&](url|text)=/.test(search)) return false;  // 共有から開いた
    // 初回の案内（ようこその画面）がこれから出るなら出さない（同じロゴの動きが2回続くので）
    if (SHOW_ONBOARDING && !localStorage.getItem(ONBOARDING_KEY) && !localStorage.getItem(TOUR_STEP_KEY)) return false;
    if (Capacitor.isNativePlatform()) return true;
    if (sessionStorage.getItem(SEEN_KEY)) return false;
    sessionStorage.setItem(SEEN_KEY, '1');
    return true;
  } catch { return false; }
}

// 出すかどうかはページを開いたときに1回だけ決める（useState の初期化で決めると、開発時の StrictMode が
// 2回呼んで「表示済み」の印を先に立て、出なくなる。印を立てる副作用があるので、コンポーネントの外に置く）
const SHOW_AT_LAUNCH = typeof window !== 'undefined' && shouldShow();

export default function LaunchSplash() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>(SHOW_AT_LAUNCH ? 'show' : 'gone');

  useEffect(() => {
    if (phase === 'gone') return;
    setSplashAdsSuppressed(true);
    const hold = prefersReducedMotion() ? 500 : LAUNCH_LOGO_MS + 80;
    const t1 = window.setTimeout(() => setPhase('fade'), hold);
    const t2 = window.setTimeout(() => setPhase('gone'), hold + FADE_MS);
    const t3 = window.setTimeout(() => setPhase('gone'), HARD_LIMIT_MS);  // 念のため
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (phase === 'gone') setSplashAdsSuppressed(false); }, [phase]);

  if (phase === 'gone') return null;
  return (
    <div aria-hidden data-launch-splash className="fixed inset-0 z-[400] flex items-center justify-center"
      // 消える途中から下のアプリを触れるように（フェードの間に押したタップを食べない）
      style={{ backgroundColor: BG, opacity: phase === 'fade' ? 0 : 1, transition: `opacity ${FADE_MS}ms ease`, pointerEvents: phase === 'fade' ? 'none' : 'auto' }}>
      <LaunchLogo size={120} />
    </div>
  );
}
