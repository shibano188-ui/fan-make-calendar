import { useEffect, useState } from 'react';
import { preloadOnboarding } from '../lib/onboardingPreload';
import { haptic } from '../lib/haptics';
import LaunchLogo, { LAUNCH_LOGO_MS } from './LaunchLogo';

// オンボーディングの最初の1枚: ようこそ（2026-09-30 柴野「いきなり作品を選ぶから始まると萎える」）。
//
// ロゴは毎回の起動画面と同じ LaunchLogo（巣 → FanHive のマーク・約1.1秒）。初回はこちらだけを出す
// （起動画面は案内が出るときは出さない。LaunchSplash の shouldShow）。そのあと上へずれて、ようこそと「はじめる」が出る。
// 参考にした決まりごと（Netflix・TikTok の起動、各社のスプラッシュのガイド）:
//   - 1秒前後で終える。わざと待たせない（先読みが遅いときだけ、そろうまで点で待つ）
//   - アプリを開いた直後の黒い起動画面（capacitor.config の SplashScreen）から途切れずにつなぐ＝同じ黒から始める
//   - 動かすのは位置・大きさ・透明度だけ（端末に負担をかけない）。ばねの効いた緩急で「はまる」感じを出す
//   - 端末の「視差効果を減らす」がオンなら、動かさずに最後の形を出す
// アニメーションの間に、作品選び・探す・カレンダーで使うものを先読みする（lib/onboardingPreload.ts）。

const BG = '#0e0e10';
const HONEY = '#FBBF00';

const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function OnboardingIntro({ onStart }: { onStart: () => void }) {
  // 先読みがそろったか。アニメーション（約1.4秒）より早くても、ボタンはアニメーションが終わってから出す
  const [loaded, setLoaded] = useState(false);
  const [animDone, setAnimDone] = useState(reduced);
  useEffect(() => {
    let alive = true;
    void preloadOnboarding().then(() => { if (alive) setLoaded(true); });
    const t = reduced ? 0 : window.setTimeout(() => alive && setAnimDone(true), LAUNCH_LOGO_MS + 300);
    return () => { alive = false; clearTimeout(t); };
  }, []);
  const ready = loaded && animDone;

  const anim = (name: string, delayMs: number, durMs = 520, ease = 'cubic-bezier(0.34,1.56,0.64,1)') =>
    reduced ? undefined : `${name} ${durMs}ms ${ease} ${delayMs}ms both`;

  return (
    <div className="fixed inset-0 z-[310] max-w-app mx-auto flex flex-col items-center justify-center px-8"
      style={{ backgroundColor: BG, color: '#fff' }}>
      {/* ロゴ。巣が組み上がって FanHive のマークになり（毎回の起動画面と同じ LaunchLogo）、少し上へ */}
      <div style={{ animation: anim('introLift', LAUNCH_LOGO_MS, 420, 'cubic-bezier(0.32,0.72,0,1)') }}>
        <LaunchLogo size={120} />
      </div>

      <p className="text-[24px] font-bold mt-6 tracking-tight" style={{ animation: anim('introText', LAUNCH_LOGO_MS + 60, 420, 'cubic-bezier(0.32,0.72,0,1)') }}>
        FanHive へようこそ
      </p>
      <p className="text-[14px] leading-relaxed text-center mt-3" style={{ color: 'rgba(255,255,255,0.72)', animation: anim('introText', LAUNCH_LOGO_MS + 140, 420, 'cubic-bezier(0.32,0.72,0,1)') }}>
        推しのグッズとイベントを<br />見逃さないためのアプリです。<br />はじめに使い方を一緒に確認しましょう！
      </p>

      <div className="h-[92px] w-full flex items-end justify-center">
        {ready ? (
          <button onClick={() => { haptic.select(); onStart(); }}
            className="pressable w-full py-3.5 rounded-full text-[15px] font-bold"
            style={{ backgroundColor: HONEY, color: '#1a1a1a', animation: anim('introText', 0, 380, 'cubic-bezier(0.32,0.72,0,1)') }}>
            はじめる
          </button>
        ) : animDone ? (
          // 先読みがまだのとき（通信が遅い）だけ、そろうまで点で待つ
          <div className="flex gap-1.5 pb-4" aria-label="読み込み中">
            {[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: HONEY, animation: `introDot 1s ease-in-out ${i * 0.15}s infinite` }} />)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
