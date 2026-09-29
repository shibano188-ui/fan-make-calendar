import { useEffect, useState } from 'react';
import { preloadOnboarding } from '../lib/onboardingPreload';
import { haptic } from '../lib/haptics';
import FanHiveMark from './FanHiveMark';

// オンボーディングの最初の1枚: ようこそ（2026-09-30 柴野「いきなり作品を選ぶから始まると萎える」）。
//
// 黒地に黄色い六角形が1つずつはまって巣になり、真ん中から FanHive のマークが組み上がる（FanHive＝ハイブ＝巣）。
// マークは地 → F・H の棒 → 蜂が飛んできて H の横棒に止まる（FanHiveMark・描き起こしたロゴ）。
// そのあと上へずれて、ようこそと「はじめる」が出る。
// 参考にした決まりごと（Netflix・TikTok の起動、各社のスプラッシュのガイド）:
//   - 1秒前後で終える。わざと待たせない（先読みが遅いときだけ、そろうまで点で待つ）
//   - アプリを開いた直後の黒い起動画面（capacitor.config の SplashScreen）から途切れずにつなぐ＝同じ黒から始める
//   - 動かすのは位置・大きさ・透明度だけ（端末に負担をかけない）。ばねの効いた緩急で「はまる」感じを出す
//   - 端末の「視差効果を減らす」がオンなら、動かさずに最後の形を出す
// アニメーションの間に、作品選び・探す・カレンダーで使うものを先読みする（lib/onboardingPreload.ts）。

const BG = '#0e0e10';
const HONEY = '#FBBF00';

// とがった頭の六角形（半径16）。中心(60,60)のまわりに6つ、最後に真ん中
const R = 16;
const W = Math.sqrt(3) * R;
const CELLS: [number, number][] = [
  [60 - W / 2, 60 - 1.5 * R], [60 + W / 2, 60 - 1.5 * R], [60 + W, 60],
  [60 + W / 2, 60 + 1.5 * R], [60 - W / 2, 60 + 1.5 * R], [60 - W, 60],
  [60, 60],
];
const hexPoints = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function OnboardingIntro({ onStart }: { onStart: () => void }) {
  // 先読みがそろったか。アニメーション（約1.2秒）より早くても、ボタンはアニメーションが終わってから出す
  const [loaded, setLoaded] = useState(false);
  const [animDone, setAnimDone] = useState(reduced);
  useEffect(() => {
    let alive = true;
    void preloadOnboarding().then(() => { if (alive) setLoaded(true); });
    const t = reduced ? 0 : window.setTimeout(() => alive && setAnimDone(true), 1850);
    return () => { alive = false; clearTimeout(t); };
  }, []);
  const ready = loaded && animDone;

  const anim = (name: string, delayMs: number, durMs = 520, ease = 'cubic-bezier(0.34,1.56,0.64,1)') =>
    reduced ? undefined : `${name} ${durMs}ms ${ease} ${delayMs}ms both`;

  return (
    <div className="fixed inset-0 z-[310] max-w-app mx-auto flex flex-col items-center justify-center px-8"
      style={{ backgroundColor: BG, color: '#fff' }}>
      {/* ロゴ。巣が組み上がってアイコンに変わり、少し上へ */}
      <div className="relative w-[120px] h-[120px]" style={{ animation: anim('introLift', 1560, 480, 'cubic-bezier(0.32,0.72,0,1)') }}>
        <svg viewBox="0 0 120 120" className="absolute inset-0 w-full h-full" aria-hidden
          style={{ animation: anim('introHiveOut', 620, 200, 'ease-in') }}>
          {CELLS.map(([cx, cy], i) => (
            <polygon key={i} points={hexPoints(cx, cy, R - 1.2)} fill={HONEY}
              opacity={i === 6 ? 1 : 0.55 + (i % 3) * 0.15}
              style={{ transformOrigin: `${cx}px ${cy}px`, animation: anim('introCell', i === 6 ? 380 : i * 50) }} />
          ))}
        </svg>
        {/* 巣が消えるところから、マークが組み上がる（地 → F・H の棒 → 蜂が飛んできて止まる） */}
        <div className="absolute inset-[10px] rounded-[24px] overflow-hidden">
          {reduced ? <FanHiveMark size={100} /> : <FanHiveMark size={100} animate delayMs={640} />}
        </div>
      </div>

      <p className="text-[24px] font-bold mt-6 tracking-tight" style={{ animation: anim('introText', 1620, 420, 'cubic-bezier(0.32,0.72,0,1)') }}>
        FanHive へようこそ
      </p>
      <p className="text-[14px] leading-relaxed text-center mt-3" style={{ color: 'rgba(255,255,255,0.72)', animation: anim('introText', 1700, 420, 'cubic-bezier(0.32,0.72,0,1)') }}>
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
