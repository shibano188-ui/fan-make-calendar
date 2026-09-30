import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import LaunchLogo, { LAUNCH_LOGO_MS, prefersReducedMotion } from './LaunchLogo';
import { setSplashAdsSuppressed } from '../lib/adSuppress';
import { SHOW_ONBOARDING, ONBOARDING_KEY, TOUR_STEP_KEY } from '../lib/constants';
import { resolveTheme, THEME_VARS, type ThemeMode } from '../contexts/ThemeContext';

// 毎回の起動画面（2026-09-30 柴野「出来がいいので毎回の起動時に出したい。読み込みも短く感じる」）。
// アプリの地の色の上にロゴが組み上がり（LaunchLogo・約1.1秒）、ふわっと消えてアプリに入る。その間、下のホームは普通に読み込みを進める。
// 画面の部品（遅延読み込み）がまだ届いていなければ、ロゴを出したまま待つ（読み込み中のグルグルを見せない・2026-09-30 柴野）。
//
// 出す条件:
//   - アプリ（iOS/Android）: 起動のたびに（復帰では出さない＝このコンポーネントは起動時に1回だけ作られる）
//   - ブラウザ: 開いたタブで1回だけ（ページを移るたびに出さない）
//   - 共有から開いたとき（/post?url=…）は出さない。すぐに投稿画面を見せたいので
// ⚠ Android はこの Web をそのまま開いている。消えなくなるとアプリが使えなくなるので、
//    どんな場合も HARD_LIMIT_MS で必ず消す（読み込みが終わらなくても、この時間で消す）。

const SEEN_KEY = 'fan_launch_splash_seen';
const FADE_MS = 260;
const HARD_LIMIT_MS = 6000;

// 読み込み中の画面（App.tsx の PageLoader）がいくつ出ているか。0 になったら消してよい
let pendingLoaders = 0;
const loaderListeners = new Set<() => void>();
export function markPageLoading(): () => void {
  pendingLoaders++;
  return () => { pendingLoaders--; loaderListeners.forEach((f) => f()); };
}

// 地の色。テーマの反映（ThemeProvider）は描いたあとに走るので、最初の1枚は保存された設定から自分で決める
// （決めないと :root の既定＝黒が一瞬出る）。そのあとはアプリの地の色（外皮の色も含む）に合わせる
function initialBg(): string {
  let mode: ThemeMode = 'system';
  try { mode = (JSON.parse(localStorage.getItem('user_settings') ?? '{}') as { theme?: ThemeMode }).theme ?? 'system'; } catch { /* 既定のまま */ }
  return THEME_VARS[resolveTheme(mode)]['--bg-primary'];
}

function shouldShow(): boolean {
  try {
    const { search, pathname } = window.location;
    if (/[?&](url|text)=/.test(search)) return false;  // 共有から開いた
    // 初回の案内（ようこその画面）がこれから出るなら出さない（同じロゴの動きが2回続くので）
    if (SHOW_ONBOARDING && !localStorage.getItem(ONBOARDING_KEY) && !localStorage.getItem(TOUR_STEP_KEY)) return false;
    if (/^\/(widget|share|web)(\/|$)/.test(pathname)) return false;  // アプリの外枠を使わない画面
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
  const [bg, setBg] = useState(initialBg);

  useEffect(() => {
    if (phase === 'gone') return;
    setSplashAdsSuppressed(true);
    // テーマが反映されたら（親の ThemeProvider の effect のあと）アプリの地の色に合わせる
    const raf = requestAnimationFrame(() => setBg('var(--bg-primary)'));
    const hold = prefersReducedMotion() ? 500 : LAUNCH_LOGO_MS + 80;
    let fadeTimer = 0;
    let settleTimer = 0;
    let logoDone = false;
    // ロゴが組み上がり、かつ読み込み中の画面が無くなったら消す。
    // 部品は AppShell → ホーム と続けて読むので、0 になっても少し待って本当に落ち着いたか確かめる
    const tryFade = () => {
      if (!logoDone || pendingLoaders > 0) return;
      clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        if (pendingLoaders > 0) return;
        setPhase('fade');
        fadeTimer = window.setTimeout(() => setPhase('gone'), FADE_MS);
      }, 120);
    };
    loaderListeners.add(tryFade);
    const t1 = window.setTimeout(() => { logoDone = true; tryFade(); }, hold);
    const t3 = window.setTimeout(() => setPhase('gone'), HARD_LIMIT_MS);  // 念のため
    return () => {
      cancelAnimationFrame(raf); loaderListeners.delete(tryFade);
      clearTimeout(t1); clearTimeout(t3); clearTimeout(fadeTimer); clearTimeout(settleTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (phase === 'gone') setSplashAdsSuppressed(false); }, [phase]);

  if (phase === 'gone') return null;
  return (
    <div aria-hidden data-launch-splash className="fixed inset-0 z-[400] flex items-center justify-center"
      // 消える途中から下のアプリを触れるように（フェードの間に押したタップを食べない）
      style={{ backgroundColor: bg, opacity: phase === 'fade' ? 0 : 1, transition: `opacity ${FADE_MS}ms ease`, pointerEvents: phase === 'fade' ? 'none' : 'auto' }}>
      <LaunchLogo size={120} />
    </div>
  );
}
